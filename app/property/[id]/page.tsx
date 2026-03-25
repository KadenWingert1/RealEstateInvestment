import { notFound } from "next/navigation";
import PropertyDetail from "@/components/PropertyDetail";
import { getPropertyById, searchProperties } from "@/lib/db";
import { computeCityStats } from "@/lib/ranking";

export default function PropertyPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (Number.isNaN(id)) {
    notFound();
  }
  const property = getPropertyById(id);
  if (!property) {
    notFound();
  }

  const comps = searchProperties({ city: property.city, limit: 200 });
  const cityStats = computeCityStats(comps.length ? comps : [property]);

  return <PropertyDetail property={property} cityStats={cityStats} />;
}
