import { NextResponse } from "next/server";
import { getCachedEstimate, saveEstimate } from "@/lib/estimateStore";

const RAPIDAPI_HOST =
  process.env.RAPIDAPI_HOST || "real-estate-market-data.p.rapidapi.com";
const RAPIDAPI_BASE = "https://real-estate-market-data.p.rapidapi.com";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zipCode = searchParams.get("zip_code");
  const bedrooms = searchParams.get("bedrooms");
  const bathrooms = searchParams.get("bathrooms");
  const sqft = searchParams.get("sqft");

  if (!zipCode || !bedrooms || !bathrooms || !sqft) {
    return NextResponse.json(
      { error: "zip_code, bedrooms, bathrooms, and sqft are required." },
      { status: 400 }
    );
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing RAPIDAPI_KEY in environment." },
      { status: 500 }
    );
  }

  const url = new URL(`${RAPIDAPI_BASE}/property-estimate`);
  url.searchParams.set("zip_code", zipCode);
  url.searchParams.set("bedrooms", bedrooms);
  url.searchParams.set("bathrooms", bathrooms);
  url.searchParams.set("sqft", sqft);

  const cached = getCachedEstimate(
    zipCode,
    Number(bedrooms),
    Number(bathrooms),
    Number(sqft),
    30
  );
  if (cached) {
    return NextResponse.json({ ok: true, status: 200, data: cached, cached: true });
  }

  const response = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": RAPIDAPI_HOST,
      "x-rapidapi-key": apiKey,
    },
  });

  const data = await response.json();
  if (response.ok) {
    saveEstimate(zipCode, Number(bedrooms), Number(bathrooms), Number(sqft), data);
  }
  return NextResponse.json({
    ok: response.ok,
    status: response.status,
    data,
  });
}
