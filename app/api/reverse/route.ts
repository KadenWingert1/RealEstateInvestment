import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }

  const url = new URL(
    "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
  );
  url.searchParams.set("x", lon);
  url.searchParams.set("y", lat);
  url.searchParams.set("benchmark", "2020");
  url.searchParams.set("vintage", "2020");
  url.searchParams.set("format", "json");

  const response = await fetch(url.toString());
  const data = await response.json();

  const geographies = data?.result?.geographies ?? {};
  const states = geographies["States"] ?? [];
  const places =
    geographies["Census Places"] ??
    geographies["Incorporated Places"] ??
    geographies["County Subdivisions"] ??
    [];

  const state = states[0]?.STATE ? String(states[0].STATE).padStart(2, "0") : null;
  const stateName = states[0]?.NAME ?? null;
  const placeName = places[0]?.NAME ?? null;

  return NextResponse.json({
    state,
    stateName,
    placeName,
  });
}
