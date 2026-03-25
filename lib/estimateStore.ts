import Database from "better-sqlite3";
import path from "path";

const TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS market_estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zip_code TEXT NOT NULL,
  bedrooms INTEGER NOT NULL,
  bathrooms REAL NOT NULL,
  sqft INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_estimates_lookup
  ON market_estimates (zip_code, bedrooms, bathrooms, sqft);
`;

function getDbPath() {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "data", "realestate.sqlite");
}

export function getEstimateDb() {
  const db = new Database(getDbPath());
  db.exec(TABLE_SCHEMA);
  return db;
}

export function getCachedEstimate(
  zipCode: string,
  bedrooms: number,
  bathrooms: number,
  sqft: number,
  maxAgeDays: number
) {
  const db = getEstimateDb();
  const row = db
    .prepare(
      `SELECT response_json, fetched_at
       FROM market_estimates
       WHERE zip_code = ? AND bedrooms = ? AND bathrooms = ? AND sqft = ?
       ORDER BY datetime(fetched_at) DESC
       LIMIT 1`
    )
    .get(zipCode, bedrooms, bathrooms, sqft) as
    | { response_json: string; fetched_at: string }
    | undefined;
  if (!row) return null;

  const fetchedAt = new Date(row.fetched_at);
  if (Number.isNaN(fetchedAt.getTime())) return null;
  const ageDays = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > maxAgeDays) return null;

  try {
    return JSON.parse(row.response_json);
  } catch {
    return null;
  }
}

export function saveEstimate(
  zipCode: string,
  bedrooms: number,
  bathrooms: number,
  sqft: number,
  data: unknown
) {
  const db = getEstimateDb();
  const stmt = db.prepare(
    `INSERT INTO market_estimates (zip_code, bedrooms, bathrooms, sqft, response_json, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  stmt.run(zipCode, bedrooms, bathrooms, sqft, JSON.stringify(data), new Date().toISOString());
}
