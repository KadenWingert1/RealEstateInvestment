import { NextResponse } from "next/server";
import { searchProperties } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? undefined;
  const city = searchParams.get("city") ?? undefined;
  const state = searchParams.get("state") ?? undefined;
  const zip = searchParams.get("zip") ?? undefined;
  const address = searchParams.get("address") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const minBeds = parseOptionalNumber(searchParams.get("minBeds"));
  const maxBeds = parseOptionalNumber(searchParams.get("maxBeds"));
  const minBaths = parseOptionalNumber(searchParams.get("minBaths"));
  const maxBaths = parseOptionalNumber(searchParams.get("maxBaths"));
  const minUnits = parseOptionalNumber(searchParams.get("minUnits"));
  const maxUnits = parseOptionalNumber(searchParams.get("maxUnits"));
  const minPrice = parseOptionalNumber(searchParams.get("minPrice"));
  const maxPrice = parseOptionalNumber(searchParams.get("maxPrice"));
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 50;

  try {
    const results = searchProperties({
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
      limit,
    });
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: "Database not initialized. Run npm run ingest first." },
      { status: 500 }
    );
  }
}

function parseOptionalNumber(value: string | null) {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
