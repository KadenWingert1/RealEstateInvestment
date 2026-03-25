"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { SearchResult } from "@/lib/types";

const defaultCenter: [number, number] = [39.5, -98.35];

export default function MapView({ properties }: { properties: SearchResult[] }) {
  const pins = properties.filter((property) =>
    property.latitude !== null && property.longitude !== null
  );

  const center = pins.length
    ? [pins[0].latitude as number, pins[0].longitude as number]
    : defaultCenter;

  return (
    <MapContainer center={center as [number, number]} zoom={pins.length ? 11 : 4} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pins.map((property) => (
        <CircleMarker
          key={property.id}
          center={[property.latitude as number, property.longitude as number]}
          radius={8}
          pathOptions={{ color: "#0f766e" }}
        >
          <Popup>
            <strong>{property.address}</strong>
            <div>
              {property.city}, {property.state} {property.zip}
            </div>
            <div>${property.price.toLocaleString()}</div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
