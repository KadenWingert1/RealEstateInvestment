import Database from "better-sqlite3";
import path from "path";
import type { Property } from "./types";

let dbInstance: Database.Database | null = null;

function getDbPath() {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "data", "realestate.sqlite");
}

export function getDb() {
  if (dbInstance) return dbInstance;
  const dbPath = getDbPath();
  dbInstance = new Database(dbPath, { readonly: true });
  return dbInstance;
}

export function searchProperties({
  query,
  city,
  state,
  zip,
  address,
  category,
  minBeds,
  maxBeds,
  minBaths,
  maxBaths,
  minUnits,
  maxUnits,
  minPrice,
  maxPrice,
  limit = 50,
}: {
  query?: string;
  city?: string;
  state?: string;
  zip?: string;
  address?: string;
  category?: string;
  minBeds?: number;
  maxBeds?: number;
  minBaths?: number;
  maxBaths?: number;
  minUnits?: number;
  maxUnits?: number;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
}): Property[] {
  const db = getDb();
  const where: string[] = [];
  const params: Record<string, string | number> = { limit };

  if (query) {
    where.push("(address LIKE :query OR city LIKE :query OR zip LIKE :query)");
    params.query = `%${query}%`;
  }
  if (city) {
    where.push("city LIKE :city");
    params.city = `%${city}%`;
  }
  if (state) {
    where.push("state = :state");
    params.state = state.toUpperCase();
  }
  if (zip) {
    where.push("zip LIKE :zip");
    params.zip = `%${zip}%`;
  }
  if (address) {
    where.push("address LIKE :address");
    params.address = `%${address}%`;
  }
  if (category && category !== "all") {
    where.push("category = :category");
    params.category = category;
  }
  if (typeof minBeds === "number") {
    where.push("beds >= :minBeds");
    params.minBeds = minBeds;
  }
  if (typeof maxBeds === "number") {
    where.push("beds <= :maxBeds");
    params.maxBeds = maxBeds;
  }
  if (typeof minBaths === "number") {
    where.push("baths >= :minBaths");
    params.minBaths = minBaths;
  }
  if (typeof maxBaths === "number") {
    where.push("baths <= :maxBaths");
    params.maxBaths = maxBaths;
  }
  if (typeof minUnits === "number") {
    where.push("units >= :minUnits");
    params.minUnits = minUnits;
  }
  if (typeof maxUnits === "number") {
    where.push("units <= :maxUnits");
    params.maxUnits = maxUnits;
  }
  if (typeof minPrice === "number") {
    where.push("price >= :minPrice");
    params.minPrice = minPrice;
  }
  if (typeof maxPrice === "number") {
    where.push("price <= :maxPrice");
    params.maxPrice = maxPrice;
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const stmt = db.prepare(
    `SELECT * FROM properties ${whereClause} ORDER BY sale_date DESC LIMIT :limit`
  );
  const rows = stmt.all(params) as Record<string, unknown>[];

  return rows.map(mapRow);
}

export function getPropertyById(id: number): Property | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM properties WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return mapRow(row);
}

function mapRow(row: Record<string, unknown>): Property {
  return {
    id: Number(row.id),
    address: String(row.address ?? ""),
    city: String(row.city ?? ""),
    state: String(row.state ?? ""),
    zip: String(row.zip ?? ""),
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    price: Number(row.price ?? 0),
    saleDate: row.sale_date ? String(row.sale_date) : null,
    propertyType: row.property_type ? String(row.property_type) : null,
    category: row.category ? (String(row.category) as Property["category"]) : null,
    units: row.units ? Number(row.units) : null,
    assessedValue: row.assessed_value ? Number(row.assessed_value) : null,
    listYear: row.list_year ? Number(row.list_year) : null,
    salesRatio: row.sales_ratio ? Number(row.sales_ratio) : null,
    residentialType: row.residential_type ? String(row.residential_type) : null,
    beds: row.beds ? Number(row.beds) : null,
    baths: row.baths ? Number(row.baths) : null,
    sqft: row.sqft ? Number(row.sqft) : null,
    imageUrl: row.image_url ? String(row.image_url) : null,
    source: row.source ? String(row.source) : null,
  };
}
