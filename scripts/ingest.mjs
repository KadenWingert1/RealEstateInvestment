import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const LIMIT = Number(process.env.INGEST_LIMIT || 2000);
const SHOULD_GEOCODE = process.env.GEOCODE !== "0";
const DEBUG = process.env.DEBUG === "1";
const SODA_APP_TOKEN = process.env.SODA_APP_TOKEN;

const SOURCES = [
  {
    name: "CT Real Estate Sales (OPM)",
    state: "CT",
    domain: "data.ct.gov",
    datasetId: "5mzw-sjtu",
    mapper: mapCtRow,
  },
  {
    name: "NYC Rolling Sales (DOF)",
    state: "NY",
    domain: "data.cityofnewyork.us",
    datasetId: "usep-8jbt",
    mapper: mapNycRow,
  },
  {
    name: "Philadelphia Real Estate Transfers (PA)",
    state: "PA",
    type: "carto",
    table: "RTT_SUMMARY",
    mapper: mapPhillyRow,
  },
  {
    name: "Cook County Property Sales (IL)",
    state: "IL",
    domain: "datacatalog.cookcountyil.gov",
    datasetId: "wvhk-k5uv",
    mapper: mapCookRow,
  },
  {
    name: "Pottawattamie County Assessor Sales (IA)",
    state: "IA",
    type: "arcgis",
    layerUrl:
      "https://gis.pottcounty-ia.gov/arcgis/rest/services/PublicDataEnterprise/PublicData_Assessor_Sale/FeatureServer/0",
    mapper: mapArcgisRow,
  },
  {
    name: "Iowa City Sales (IA)",
    state: "IA",
    type: "arcgis",
    layerUrl:
      "https://gis.iowa-city.org/arcgis/rest/services/Assessor/IowaCitySales/MapServer/0",
    mapper: mapArcgisRow,
  },
];

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "realestate.sqlite");
const dataDir = path.dirname(dbPath);
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);

const schema = `
DROP TABLE IF EXISTS properties;
CREATE TABLE properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  latitude REAL,
  longitude REAL,
  price INTEGER,
  sale_date TEXT,
  property_type TEXT,
  category TEXT,
  units INTEGER,
  assessed_value INTEGER,
  list_year INTEGER,
  sales_ratio REAL,
  residential_type TEXT,
  beds INTEGER,
  baths REAL,
  sqft INTEGER,
  image_url TEXT,
  source TEXT
);
`;

db.exec(schema);

const insert = db.prepare(
  `INSERT INTO properties (
    address, city, state, zip, latitude, longitude, price, sale_date,
    property_type, category, units, assessed_value, list_year, sales_ratio, residential_type,
    beds, baths, sqft, image_url, source
  ) VALUES (
    @address, @city, @state, @zip, @latitude, @longitude, @price, @sale_date,
    @property_type, @category, @units, @assessed_value, @list_year, @sales_ratio, @residential_type,
    @beds, @baths, @sqft, @image_url, @source
  )`
);

const insertMany = db.transaction((records) => {
  for (const record of records) insert.run(record);
});

const records = [];

for (const source of SOURCES) {
  let rows = [];
  let arcgisContext = null;
  if (DEBUG) {
    console.log(`Fetching source: ${source.name}`);
  }
  try {
  if (source.type === "arcgis") {
    const arcgis = await fetchArcgisRows(source.layerUrl, LIMIT);
    rows = arcgis.features;
    arcgisContext = arcgis;
  } else if (source.type === "carto") {
    rows = await fetchCartoRows(source.table, LIMIT);
  } else {
    rows = await fetchSocrataRows(source.domain, source.datasetId, LIMIT);
  }
  } catch (error) {
    console.warn(`Source failed (${source.name}):`, error?.message || error);
    continue;
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    console.warn(`No rows returned for ${source.name}.`);
    continue;
  }
  if (DEBUG) {
    console.log(`Rows received (${source.name}): ${rows.length}`);
  }

  if (DEBUG) {
    console.log(`Sample row keys (${source.name}):`, Object.keys(rows[0] || {}));
    console.log(`Sample row (${source.name}):`, rows[0]);
  }

  for (const row of rows) {
    const record = await source.mapper(row, source, arcgisContext);
    if (!record) continue;
    records.push(record);
  }
}

if (records.length === 0) {
  throw new Error("All sources returned zero usable rows. Check dataset access.");
}

insertMany(records);

console.log(`Inserted ${records.length} properties into ${dbPath}`);

async function fetchJson(url, headers) {
  const response = await fetch(url, headers ? { headers } : undefined);
  if (!response.ok) {
    throw new Error(`Failed to download dataset (${response.status}) from ${url}`);
  }
  return response.json();
}

async function fetchSocrataRows(domain, datasetId, limit) {
  const headers = SODA_APP_TOKEN ? { "X-App-Token": SODA_APP_TOKEN } : undefined;
  const baseUrl = `https://${domain}`;
  try {
    const primary = await fetchJson(`${baseUrl}/resource/${datasetId}.json?$limit=${limit}`, headers);
    if (Array.isArray(primary) && primary.length > 0) {
      return primary;
    }
    if (primary?.error) {
      throw new Error(primary.message || "Socrata API error");
    }
  } catch (error) {
    if (DEBUG) {
      console.warn(`Primary API failed for ${domain}/${datasetId}, falling back.`, error);
    }
  }

  const fallbackUrl = `${baseUrl}/api/views/${datasetId}/rows.json?accessType=DOWNLOAD`;
  const raw = await fetchJson(fallbackUrl, headers);
  const columns = raw?.meta?.view?.columns?.map((col) => col.fieldName);
  const data = raw?.data;
  if (!Array.isArray(columns) || !Array.isArray(data)) {
    throw new Error(`Fallback dataset format not recognized for ${datasetId}.`);
  }
  return data.slice(0, limit).map((row) => {
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });
}

async function fetchCartoRows(table, limit) {
  const query = `SELECT *, ST_Y(the_geom) AS lat, ST_X(the_geom) AS lng FROM ${table} WHERE display_date >= '2020-01-01' LIMIT ${limit}`;
  const url = `https://phl.carto.com/api/v2/sql?format=json&q=${encodeURIComponent(query)}`;
  const data = await fetchJson(url);
  return Array.isArray(data?.rows) ? data.rows : [];
}

async function fetchArcgisRows(layerUrl, limit) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; InvestorHomebase/1.0)",
    Referer: layerUrl,
  };
  const info = await fetchJson(`${layerUrl}?f=pjson`, headers);
  const queryUrl = `${layerUrl}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json&resultRecordCount=${limit}`;
  const data = await fetchJson(queryUrl, headers);
  const features = Array.isArray(data?.features) ? data.features : [];
  return { info, features, fields: info?.fields || [] };
}

function getValue(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== "") {
      return obj[key];
    }
  }
  return null;
}

function parseNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function mapCtRow(row, source) {
  const address = getValue(row, [
    "property_address",
    "address",
    "property_address_1",
    "street_address",
    "address_1",
    "location",
  ]);
  const city = getValue(row, ["town", "city", "municipality"]);
  const zip = getValue(row, ["zip_code", "zip", "zipcode"]);
  const rawPrice = getValue(row, ["sale_price", "sales_price", "sale_amount", "saleamount", "price"]);
  const price = parseNumber(rawPrice);
  const saleDate = getValue(row, ["date_of_sale", "sale_date", "date", "daterecorded"]);
  const propertyType = getValue(row, ["property_type", "propertytype", "prop_type", "property_use", "residentialtype"]);
  const rawAssessed = getValue(row, ["assessed_value", "assessedvalue", "assessment", "property_assessed_value"]);
  const assessedValue = parseNumber(rawAssessed);
  const listYear = parseNumber(getValue(row, ["listyear", "list_year"]));
  const salesRatio = parseNumber(getValue(row, ["salesratio", "sales_ratio"]));
  const residentialType = getValue(row, ["residentialtype", "residential_type"]);

  if (!address || !city) return null;
  const effectivePrice = price > 0 ? price : assessedValue;
  if (!effectivePrice) return null;

  const fullAddress = `${address}, ${city}, CT ${zip ?? ""}`.trim();
  let latitude = null;
  let longitude = null;
  const geo = row.geo_coordinates;
  if (geo && geo.coordinates && Array.isArray(geo.coordinates)) {
    longitude = Number(geo.coordinates[0]);
    latitude = Number(geo.coordinates[1]);
  }

  if (SHOULD_GEOCODE && (latitude === null || longitude === null)) {
    const coords = await geocodeAddress(fullAddress);
    if (coords) {
      latitude = coords.lat;
      longitude = coords.lon;
    }
  }

  const { category, units } = inferUnitsAndCategory(propertyType);
  const sqft = estimateSqft(effectivePrice);
  const { beds, baths } = estimateBedsBaths(sqft);

  return {
    address,
    city,
    state: source.state,
    zip: zip ?? "",
    latitude,
    longitude,
    price: effectivePrice,
    sale_date: saleDate ?? null,
    property_type: propertyType ?? null,
    category,
    units,
    assessed_value: assessedValue || null,
    list_year: listYear || null,
    sales_ratio: salesRatio || null,
    residential_type: residentialType ?? null,
    beds,
    baths,
    sqft,
    image_url: null,
    source: source.name,
  };
}

async function mapNycRow(row, source) {
  let address = getValue(row, ["address", "street_address"]);
  if (!address) {
    const house = getValue(row, ["house_number", "housenumber"]);
    const street = getValue(row, ["street_name", "street"]);
    if (house || street) {
      address = `${house ?? ""} ${street ?? ""}`.trim();
    }
  }
  const boroughRaw = getValue(row, ["borough", "boro", "borough_name"]);
  const city = boroughRaw ? formatBorough(boroughRaw) : "New York";
  const zip = getValue(row, ["zip_code", "zipcode", "zip"]);
  const rawPrice = getValue(row, ["sale_price", "saleprice", "sale_amount", "saleamount", "price"]);
  const price = parseNumber(rawPrice);
  const saleDate = getValue(row, ["sale_date", "saledate", "date_of_sale", "record_date"]);
  const propertyType = getValue(row, [
    "building_class_category",
    "building_class_at_present",
    "building_class_at_time_of_sale",
    "propertytype",
    "residentialtype",
  ]);
  const rawAssessed = getValue(row, ["assessed_value", "assessedvalue"]);
  const assessedValue = parseNumber(rawAssessed);
  const listYear = parseNumber(getValue(row, ["year_built", "listyear", "list_year"]));
  const salesRatio = parseNumber(getValue(row, ["salesratio", "sales_ratio"]));
  const residentialType = getValue(row, ["residentialtype", "residential_type"]);
  const rawSqft = getValue(row, ["gross_square_feet", "grosssquarefeet", "gross_square_footage"]);
  const sqftValue = parseNumber(rawSqft);

  if (!address || !city) return null;
  const effectivePrice = price > 0 ? price : assessedValue;
  if (!effectivePrice) return null;

  const fullAddress = `${address}, ${city}, NY ${zip ?? ""}`.trim();
  let latitude = null;
  let longitude = null;
  if (SHOULD_GEOCODE) {
    const coords = await geocodeAddress(fullAddress);
    if (coords) {
      latitude = coords.lat;
      longitude = coords.lon;
    }
  }

  const { category, units } = inferUnitsAndCategory(propertyType);
  const sqft = sqftValue > 0 ? sqftValue : estimateSqft(effectivePrice);
  const { beds, baths } = estimateBedsBaths(sqft);

  return {
    address,
    city,
    state: source.state,
    zip: zip ?? "",
    latitude,
    longitude,
    price: effectivePrice,
    sale_date: saleDate ?? null,
    property_type: propertyType ?? null,
    category,
    units,
    assessed_value: assessedValue || null,
    list_year: listYear || null,
    sales_ratio: salesRatio || null,
    residential_type: residentialType ?? null,
    beds,
    baths,
    sqft,
    image_url: null,
    source: source.name,
  };
}

function formatBorough(value) {
  const normalized = String(value).trim().toLowerCase();
  if (normalized.includes("manhattan")) return "Manhattan";
  if (normalized.includes("brooklyn")) return "Brooklyn";
  if (normalized.includes("queens")) return "Queens";
  if (normalized.includes("bronx")) return "Bronx";
  if (normalized.includes("staten")) return "Staten Island";
  return String(value).trim();
}

async function mapPhillyRow(row, source) {
  const address =
    getValue(row, ["street_address", "address", "location", "property_address"]) ?? null;
  const zip = getValue(row, ["zip_code", "zip", "zipcode"]) ?? null;
  const rawPrice =
    getValue(row, ["sale_price", "saleamount", "sale_amount", "price", "consideration"]) ?? 0;
  const price = parseNumber(rawPrice);
  const saleDate = getValue(row, ["display_date", "sale_date", "date_recorded", "recorded_date"]);
  const propertyType = getValue(row, ["property_type", "building_class", "category"]);

  if (!address || !price) return null;

  const latitude = row.lat ? Number(row.lat) : null;
  const longitude = row.lng ? Number(row.lng) : null;

  const sqft = estimateSqft(price);
  const { beds, baths } = estimateBedsBaths(sqft);
  const { category, units } = inferUnitsAndCategory(propertyType);

  return {
    address,
    city: "Philadelphia",
    state: source.state,
    zip: zip ?? "",
    latitude,
    longitude,
    price,
    sale_date: saleDate ?? null,
    property_type: propertyType ?? null,
    category,
    units,
    assessed_value: null,
    list_year: null,
    sales_ratio: null,
    residential_type: null,
    beds,
    baths,
    sqft,
    image_url: null,
    source: source.name,
  };
}

async function mapCookRow(row, source) {
  const address = getValue(row, [
    "property_address",
    "address",
    "street_address",
    "site_address",
    "full_address",
  ]);
  const city = getValue(row, ["city", "municipality", "township"]);
  const zip = getValue(row, ["zip", "zip_code", "zipcode"]);
  const rawPrice = getValue(row, ["sale_price", "saleamount", "sale_amount", "price"]);
  const price = parseNumber(rawPrice);
  const saleDate = getValue(row, ["sale_date", "recording_date", "date"]);
  const propertyType = getValue(row, ["property_type", "property_class", "class"]);

  if (!address || !price) return null;

  const coords = parseLocation(row.location);
  const latitude = coords?.lat ?? null;
  const longitude = coords?.lon ?? null;

  const sqft = estimateSqft(price);
  const { beds, baths } = estimateBedsBaths(sqft);
  const { category, units } = inferUnitsAndCategory(propertyType);

  return {
    address,
    city: city ?? "Cook County",
    state: source.state,
    zip: zip ?? "",
    latitude,
    longitude,
    price,
    sale_date: saleDate ?? null,
    property_type: propertyType ?? null,
    category,
    units,
    assessed_value: null,
    list_year: null,
    sales_ratio: null,
    residential_type: null,
    beds,
    baths,
    sqft,
    image_url: null,
    source: source.name,
  };
}

function parseArcgisDate(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseLocation(location) {
  if (!location) return null;
  if (location.latitude && location.longitude) {
    return { lat: Number(location.latitude), lon: Number(location.longitude) };
  }
  if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
    return { lon: Number(location.coordinates[0]), lat: Number(location.coordinates[1]) };
  }
  return null;
}

async function mapArcgisRow(feature, source, arcgisContext) {
  const attrs = feature?.attributes ?? {};
  const fieldNames = Object.keys(attrs);
  if (fieldNames.length === 0) return null;

  const fieldMap = inferArcgisFields(fieldNames);

  let address = fieldMap.address ? attrs[fieldMap.address] : null;
  if (!address && (fieldMap.house || fieldMap.street)) {
    const house = fieldMap.house ? attrs[fieldMap.house] : "";
    const street = fieldMap.street ? attrs[fieldMap.street] : "";
    address = `${house ?? ""} ${street ?? ""}`.trim();
  }
  const parsed = parseArcgisAddress(address);
  if (parsed?.street) {
    address = parsed.street;
  }
  const city = fieldMap.city ? attrs[fieldMap.city] : parsed?.city ?? null;
  const zip = fieldMap.zip ? attrs[fieldMap.zip] : parsed?.zip ?? null;

  const price = parseNumber(fieldMap.price ? attrs[fieldMap.price] : 0);
  const assessedValue = parseNumber(fieldMap.assessed ? attrs[fieldMap.assessed] : 0);
  const saleDate = fieldMap.saleDate ? parseArcgisDate(attrs[fieldMap.saleDate]) : null;
  const propertyType = fieldMap.propertyType ? attrs[fieldMap.propertyType] : null;
  const sqftValue = parseNumber(fieldMap.sqft ? attrs[fieldMap.sqft] : 0);
  const bedsValue = parseNumber(fieldMap.beds ? attrs[fieldMap.beds] : 0);
  const bathsValue = parseNumber(fieldMap.baths ? attrs[fieldMap.baths] : 0);
  const listYear = parseNumber(fieldMap.listYear ? attrs[fieldMap.listYear] : 0);
  const salesRatio = parseNumber(fieldMap.salesRatio ? attrs[fieldMap.salesRatio] : 0);
  const residentialType = fieldMap.residentialType ? attrs[fieldMap.residentialType] : null;

  if (!address || !city) return null;
  const effectivePrice = price > 0 ? price : assessedValue;
  if (!effectivePrice) return null;

  let latitude = null;
  let longitude = null;
  if (feature?.geometry) {
    if (typeof feature.geometry.x === "number" && typeof feature.geometry.y === "number") {
      longitude = feature.geometry.x;
      latitude = feature.geometry.y;
    } else if (Array.isArray(feature.geometry.rings)) {
      const centroid = centroidFromRings(feature.geometry.rings);
      if (centroid) {
        longitude = centroid[0];
        latitude = centroid[1];
      }
    } else if (Array.isArray(feature.geometry.coordinates)) {
      longitude = Number(feature.geometry.coordinates[0]);
      latitude = Number(feature.geometry.coordinates[1]);
    }
  }

  if (SHOULD_GEOCODE && (latitude === null || longitude === null)) {
    const fullAddress = `${address}, ${city}, ${source.state} ${zip ?? ""}`.trim();
    const coords = await geocodeAddress(fullAddress);
    if (coords) {
      latitude = coords.lat;
      longitude = coords.lon;
    }
  }

  const { category, units } = inferUnitsAndCategory(propertyType);
  const sqft = sqftValue > 0 ? sqftValue : estimateSqft(effectivePrice);
  const { beds, baths } = estimateBedsBaths(sqft);

  return {
    address,
    city,
    state: source.state,
    zip: zip ?? "",
    latitude,
    longitude,
    price: effectivePrice,
    sale_date: saleDate ?? null,
    property_type: propertyType ?? null,
    category,
    units,
    assessed_value: assessedValue || null,
    list_year: listYear || null,
    sales_ratio: salesRatio || null,
    residential_type: residentialType ?? null,
    beds: bedsValue || beds,
    baths: bathsValue || baths,
    sqft,
    image_url: null,
    source: source.name,
  };
}

function inferUnitsAndCategory(propertyType) {
  if (!propertyType) {
    return { category: null, units: null };
  }
  const normalized = String(propertyType).toLowerCase();
  const numberMatch = normalized.match(/(\d+)\s*family/);
  let units = numberMatch ? Number(numberMatch[1]) : null;

  if (!units) {
    if (normalized.includes("duplex")) units = 2;
    if (normalized.includes("triplex")) units = 3;
    if (normalized.includes("fourplex")) units = 4;
  }

  let category = null;
  if (
    normalized.includes("apartment") ||
    normalized.includes("multi") ||
    normalized.includes("duplex") ||
    normalized.includes("triplex") ||
    normalized.includes("fourplex") ||
    (units !== null && units > 1)
  ) {
    category = "apartment";
  } else if (
    normalized.includes("single") ||
    normalized.includes("condo") ||
    normalized.includes("town") ||
    normalized.includes("residential") ||
    normalized.includes("house")
  ) {
    category = "home";
    units = units ?? 1;
  }

  return { category, units };
}

function inferArcgisFields(fieldNames) {
  const normalized = fieldNames.map((name) => ({
    name,
    key: normalizeField(name),
  }));

  const pick = (candidates) => {
    for (const candidate of candidates) {
      const target = normalizeField(candidate);
      const match = normalized.find((field) => field.key === target);
      if (match) return match.name;
    }
    return null;
  };

  return {
    address: pick([
      "address",
      "siteaddress",
      "situsaddress",
      "propertyaddress",
      "propaddress",
      "location",
    ]),
    house: pick(["housenumber", "house_number", "addrnum", "streetnumber"]),
    street: pick(["streetname", "street_name", "street", "addrstreet"]),
    city: pick(["city", "town", "municipality", "situscity"]),
    zip: pick(["zip", "zipcode", "zip_code", "postal"]),
    price: pick([
      "saleprice",
      "sale_price",
      "saleamount",
      "sale_amount",
      "price",
      "sale",
      "slsamt",
      "salesamt",
      "sales_amt",
    ]),
    saleDate: pick(["saledate", "sale_date", "date", "date_recorded", "recordeddate", "slsdate", "saledt"]),
    assessed: pick(["assessedvalue", "assessed_value", "assessment", "assessed"]),
    propertyType: pick([
      "propertytype",
      "property_type",
      "use",
      "class",
      "classcode",
      "residentialtype",
      "bldgclass",
    ]),
    listYear: pick(["listyear", "list_year", "yearbuilt", "year_built"]),
    salesRatio: pick(["salesratio", "sales_ratio"]),
    residentialType: pick(["residentialtype", "residential_type"]),
    sqft: pick(["sqft", "squarefeet", "sq_ft", "grosssquarefeet", "gross_sq_ft"]),
    beds: pick(["beds", "bedrooms", "bedroom"]),
    baths: pick(["baths", "bathrooms", "bath"]),
  };
}

function normalizeField(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseArcgisAddress(value) {
  if (!value) return null;
  const str = String(value);
  const parts = str.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { street: str };
  const street = parts[0];
  const city = parts.length >= 2 ? parts[1].replace(/\\s+IA$/i, "").trim() : null;
  const stateZip = parts.length >= 3 ? parts[2] : "";
  const match = stateZip.match(/([A-Z]{2})\\s*(\\d{5})?/i);
  const zip = match?.[2] ?? null;
  return { street, city, zip };
}

function centroidFromRings(rings) {
  const ring = Array.isArray(rings?.[0]) ? rings[0] : null;
  if (!ring || ring.length === 0) return null;
  let sumX = 0;
  let sumY = 0;
  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) continue;
    sumX += point[0];
    sumY += point[1];
  }
  const count = ring.length;
  if (!count) return null;
  return [sumX / count, sumY / count];
}

function estimateSqft(price) {
  if (!price) return 1200;
  const assumedPricePerSqft = 220;
  return Math.max(600, Math.round(price / assumedPricePerSqft));
}

function estimateBedsBaths(sqft) {
  const beds = Math.max(1, Math.min(6, Math.round(sqft / 550)));
  const baths = Math.max(1, Math.min(4, Number((beds * 0.75).toFixed(1))));
  return { beds, baths };
}

async function geocodeAddress(address) {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(
    address
  )}&benchmark=2020&format=json`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const match = data?.result?.addressMatches?.[0];
    if (!match) return null;
    await sleep(150);
    return { lat: match.coordinates.y, lon: match.coordinates.x };
  } catch (error) {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
