"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SearchResult } from "@/lib/types";
import { computeFinance, DEFAULTS } from "@/lib/finance";
import { estimateSqft } from "@/lib/estimates";
import { computeCityStats, computeInvestorScore } from "@/lib/ranking";
import { STATE_OPTIONS } from "@/lib/states";
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

const placeholderImage = "/placeholder.svg";
const DEFAULT_LIMIT = 200;

type RankedResult = {
  property: SearchResult;
  finance: ReturnType<typeof computeFinance>;
  score: ReturnType<typeof computeInvestorScore>;
};

export default function SearchExperience() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("all");
  const [zip, setZip] = useState("");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState("all");
  const [minBeds, setMinBeds] = useState("");
  const [maxBeds, setMaxBeds] = useState("");
  const [minBaths, setMinBaths] = useState("");
  const [maxBaths, setMaxBaths] = useState("");
  const [minUnits, setMinUnits] = useState("");
  const [maxUnits, setMaxUnits] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = async (limit = 50) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      if (city) params.set("city", city);
      if (state && state !== "all") params.set("state", state);
      if (zip) params.set("zip", zip);
      if (address) params.set("address", address);
      if (category && category !== "all") params.set("category", category);
      if (minBeds) params.set("minBeds", minBeds);
      if (maxBeds) params.set("maxBeds", maxBeds);
      if (minBaths) params.set("minBaths", minBaths);
      if (maxBaths) params.set("maxBaths", maxBaths);
      if (minUnits) params.set("minUnits", minUnits);
      if (maxUnits) params.set("maxUnits", maxUnits);
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      params.set("limit", String(limit));
      const response = await fetch(`/api/search?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Search failed");
      }
      setResults(data.results ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Search failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults(DEFAULT_LIMIT);
  }, []);

  const resetFilters = () => {
    setQuery("");
    setCity("");
    setState("all");
    setZip("");
    setAddress("");
    setCategory("all");
    setMinBeds("");
    setMaxBeds("");
    setMinBaths("");
    setMaxBaths("");
    setMinUnits("");
    setMaxUnits("");
    setMinPrice("");
    setMaxPrice("");
    fetchResults(DEFAULT_LIMIT);
  };

  const { medianPrice, rankedResults } = useMemo(() => {
    if (results.length === 0) {
      return { medianPrice: 0, rankedResults: [] as RankedResult[] };
    }

    const cityStats = new Map<string, ReturnType<typeof computeCityStats>>();
    const cityBuckets = new Map<string, SearchResult[]>();
    results.forEach((property) => {
      const key = property.city.toLowerCase();
      if (!cityBuckets.has(key)) cityBuckets.set(key, []);
      cityBuckets.get(key)?.push(property);
    });
    cityBuckets.forEach((properties, key) => {
      cityStats.set(key, computeCityStats(properties));
    });

    const allSorted = [...results].map((r) => r.price).sort((a, b) => a - b);
    const mid = Math.floor(allSorted.length / 2);
    const medianPrice =
      allSorted.length % 2 ? allSorted[mid] : (allSorted[mid - 1] + allSorted[mid]) / 2;

    const rankedResults = results
      .map((property) => {
        const stats = cityStats.get(property.city.toLowerCase()) ?? {
          medianPrice,
          medianPpsf: 0,
          medianSaleAge: 5,
        };
        const assumptions = deriveAssumptions(property, stats.medianPrice);
        const finance = computeFinance({
          price: property.price,
          downPaymentPct: DEFAULTS.downPaymentPct,
          interestRate: DEFAULTS.interestRate,
          loanTermYears: DEFAULTS.loanTermYears,
          closingCostPct: DEFAULTS.closingCostPct,
          rehabCost: assumptions.rehabCost,
          rentRatio: assumptions.rentRatio,
          taxRate: assumptions.taxRate,
          insuranceRate: assumptions.insuranceRate,
          maintenanceRate: assumptions.maintenanceRate,
          vacancyRate: assumptions.vacancyRate,
          managementRate: DEFAULTS.managementRate,
          includeManagement: false,
        });
        const score = computeInvestorScore(property, finance, stats);
        return { property, finance, score };
      })
      .sort((a, b) => b.score.total - a.score.total);

    return { medianPrice, rankedResults };
  }, [results]);

  return (
    <div className="container">
      <section className="hero">
        <div>
          <h1>Find cash-flowing deals with investor-grade underwriting.</h1>
          <p>
            Search real U.S. property records, run detailed investment math, and compare
            strategies in one place.
          </p>
        </div>
        <div className="notice">
          Data is pulled from public U.S. datasets. Results may not reflect active MLS
          inventory, but every record is a real property transaction.
        </div>
      </section>

      <h2 className="section-title">Search Properties</h2>
      <div className="search-bar">
        <div className="search-inputs">
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All types</option>
            <option value="home">Homes</option>
            <option value="apartment">Apartments / Multi-family</option>
          </select>
          <input
            placeholder="City"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
          <select value={state} onChange={(event) => setState(event.target.value)}>
            <option value="all">All states</option>
            {STATE_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
          <input
            placeholder="ZIP"
            value={zip}
            onChange={(event) => setZip(event.target.value)}
          />
          <input
            placeholder="Address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
          <input
            placeholder="Any keyword"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <input
            placeholder="Min beds"
            value={minBeds}
            onChange={(event) => setMinBeds(event.target.value)}
          />
          <input
            placeholder="Max beds"
            value={maxBeds}
            onChange={(event) => setMaxBeds(event.target.value)}
          />
          <input
            placeholder="Min baths"
            value={minBaths}
            onChange={(event) => setMinBaths(event.target.value)}
          />
          <input
            placeholder="Max baths"
            value={maxBaths}
            onChange={(event) => setMaxBaths(event.target.value)}
          />
          <input
            placeholder="Min units"
            value={minUnits}
            onChange={(event) => setMinUnits(event.target.value)}
          />
          <input
            placeholder="Max units"
            value={maxUnits}
            onChange={(event) => setMaxUnits(event.target.value)}
          />
          <input
            placeholder="Min price"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
          />
          <input
            placeholder="Max price"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
          />
        </div>
        <div className="toggle-row">
          <button onClick={() => fetchResults()} disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
          <button onClick={resetFilters} type="button">
            Reset
          </button>
        </div>
      </div>

      {error && <p className="notice">{error}</p>}

      {results.length > 0 && (
        <section>
          <h2 className="section-title">Market Snapshot</h2>
          <div className="stat-grid">
            <div className="stat">
              <span>Properties Found</span>
              <strong>{results.length}</strong>
            </div>
            <div className="stat">
              <span>Median Sale Price</span>
              <strong>${Math.round(medianPrice).toLocaleString()}</strong>
            </div>
            <div className="stat">
              <span>Coverage</span>
              <strong>United States</strong>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-2" style={{ marginTop: "24px" }}>
        <div className="grid" style={{ gap: "16px" }}>
          {rankedResults.map((ranked, index) => (
            <Link
              key={ranked.property.id}
              href={`/property/${ranked.property.id}`}
              className="card"
            >
              <img
                src={getPropertyImage(ranked.property)}
                alt={`${ranked.property.address} listing`}
              />
              <div>
                <span className="badge">
                  Rank #{index + 1} · {ranked.score.grade} ({ranked.score.total})
                </span>
              </div>
              <div>
                <strong>{ranked.property.address}</strong>
                <div className="tag">
                  {ranked.property.city}, {ranked.property.state} {ranked.property.zip}
                </div>
              </div>
              <div className="stat-grid">
                <div className="stat">
                  <span>Beds</span>
                  <strong>{ranked.property.beds ?? "Est."}</strong>
                </div>
                <div className="stat">
                  <span>Baths</span>
                  <strong>{ranked.property.baths ?? "Est."}</strong>
                </div>
                <div className="stat">
                  <span>Sq Ft</span>
                  <strong>{ranked.property.sqft ?? "Est."}</strong>
                </div>
                <div className="stat">
                  <span>Units</span>
                  <strong>{ranked.property.units ?? "—"}</strong>
                </div>
              </div>
              <div className="stat-grid">
                <div className="stat">
                  <span>Price</span>
                  <strong>${ranked.property.price.toLocaleString()}</strong>
                </div>
                <div className="stat">
                  <span>Cash Flow</span>
                  <strong>${Math.round(ranked.finance.monthlyCashFlow).toLocaleString()}</strong>
                </div>
              </div>
              <div className="tag">
                Source: {ranked.property.source ?? "Public record"}
              </div>
            </Link>
          ))}
          {results.length === 0 && !loading && (
            <div className="card">
              <strong>Start by searching a U.S. city or ZIP.</strong>
              <p>
                Run `npm run ingest` to load the free public dataset, then search for
                Connecticut towns like Hartford or New Haven.
              </p>
            </div>
          )}
        </div>
        <div className="map-shell">
          <MapView properties={results} />
        </div>
      </div>
    </div>
  );
}

function deriveAssumptions(property: SearchResult, cityMedianPrice: number) {
  const sqft = property.sqft ?? estimateSqft(property.price);
  const price = property.price;
  let rentRatio = 0.008;
  if (price < 200000) rentRatio = 0.011;
  else if (price < 350000) rentRatio = 0.009;
  else if (price < 550000) rentRatio = 0.0075;
  else rentRatio = 0.0065;

  if (price < cityMedianPrice * 0.8) rentRatio += 0.001;
  if (price > cityMedianPrice * 1.2) rentRatio -= 0.001;

  const assessedRatio = property.assessedValue && price ? property.assessedValue / price : 0.7;
  const taxRate = clamp(0.012 * assessedRatio, 0.008, 0.018);

  const insuranceRate = clamp(price < 200000 ? 0.0048 : price < 400000 ? 0.0042 : 0.0036, 0.003, 0.006);
  const maintenanceRate = clamp(0.012 - sqft / 200000, 0.008, 0.014);
  const vacancyRate = property.propertyType?.toLowerCase().includes("multi") ? 0.055 : 0.06;
  const rehabCost = Math.round(sqft * 35);
  return {
    rentRatio,
    taxRate,
    insuranceRate,
    maintenanceRate,
    vacancyRate,
    rehabCost,
  };
}

function getPropertyImage(property: SearchResult) {
  if (property.imageUrl) return property.imageUrl;
  const title = `${property.address}`;
  const subtitle = `${property.city}, ${property.state}`;
  return buildFallbackImage(title, subtitle);
}

function buildFallbackImage(title: string, subtitle: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img" aria-label="${title}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="#0f172a" />
<stop offset="100%" stop-color="#0f766e" />
</linearGradient>
</defs>
<rect width="800" height="600" fill="url(#g)" />
<rect x="60" y="80" width="680" height="440" rx="28" fill="rgba(255,255,255,0.12)" />
<text x="100" y="230" font-family="Space Grotesk, Arial" font-size="34" fill="#f8fafc">${escapeSvg(title)}</text>
<text x="100" y="280" font-family="Space Grotesk, Arial" font-size="22" fill="#e2e8f0">${escapeSvg(subtitle)}</text>
<text x="100" y="500" font-family="Space Grotesk, Arial" font-size="16" fill="#cbd5f5">Public record summary</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvg(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
