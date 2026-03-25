import { NextResponse } from "next/server";
import { getPropertyById } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const property = getPropertyById(id);
    if (!property) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ property });
  } catch (error) {
    return NextResponse.json(
      { error: "Database not initialized. Run npm run ingest first." },
      { status: 500 }
    );
  }
}
