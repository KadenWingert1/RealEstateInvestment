export type Property = {
  id: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
  price: number;
  saleDate: string | null;
  propertyType: string | null;
  category: "home" | "apartment" | null;
  units: number | null;
  assessedValue: number | null;
  listYear: number | null;
  salesRatio: number | null;
  residentialType: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  imageUrl: string | null;
  source: string | null;
};

export type SearchResult = Property;
