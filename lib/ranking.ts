import type { Property } from "./types";
import type { FinanceSummary } from "./finance";
import { estimateSqft } from "./estimates";

export type CityStats = {
  medianPrice: number;
  medianPpsf: number;
  medianSaleAge: number;
};

export type InvestorScore = {
  total: number;
  grade: string;
  components: {
    cashFlowYield: number;
    capRate: number;
    cashOnCash: number;
    value: number;
    risk: number;
    recency: number;
  };
};

export function computeCityStats(properties: Property[]): CityStats {
  const prices = properties.map((p) => p.price).filter((p) => p > 0);
  const ppsf = properties
    .map((p) => {
      const sqft = p.sqft ?? estimateSqft(p.price);
      return p.price > 0 ? p.price / sqft : null;
    })
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const ages = properties
    .map((p) => yearsSinceSale(p))
    .filter((value) => Number.isFinite(value));

  return {
    medianPrice: median(prices) || 0,
    medianPpsf: median(ppsf) || 0,
    medianSaleAge: median(ages) || 5,
  };
}

export function computeInvestorScore(
  property: Property,
  finance: FinanceSummary,
  stats: CityStats
): InvestorScore {
  const sqft = property.sqft ?? estimateSqft(property.price);
  const ppsf = property.price > 0 ? property.price / sqft : stats.medianPpsf || 0;
  const valueRatio = stats.medianPpsf > 0 ? stats.medianPpsf / ppsf : 1;

  const cashFlowYield = property.price > 0 ? finance.annualCashFlow / property.price : 0;
  const cashFlowScore = scoreFromRange(cashFlowYield, -0.02, 0.08);
  const capRateScore = scoreFromRange(finance.capRate, 0.03, 0.1);
  const cashOnCashScore = scoreFromRange(finance.cashOnCash, 0, 0.2);
  const valueScore = scoreFromRange(valueRatio, 0.7, 1.3);
  const riskScore = scoreFromRange(1 - finance.breakEvenOccupancy, 0, 0.5);

  const saleAge = yearsSinceSale(property);
  const recencyScore = scoreFromRange(1 - saleAge / 12, 0.2, 1);

  const total = Math.round(
    cashFlowScore * 0.24 +
      cashOnCashScore * 0.2 +
      capRateScore * 0.16 +
      valueScore * 0.16 +
      riskScore * 0.16 +
      recencyScore * 0.08
  );

  return {
    total,
    grade: scoreToGrade(total),
    components: {
      cashFlowYield: Math.round(cashFlowScore),
      capRate: Math.round(capRateScore),
      cashOnCash: Math.round(cashOnCashScore),
      value: Math.round(valueScore),
      risk: Math.round(riskScore),
      recency: Math.round(recencyScore),
    },
  };
}

export function yearsSinceSale(property: Property) {
  const date = property.saleDate ? new Date(property.saleDate) : null;
  if (!date || Number.isNaN(date.getTime())) {
    if (property.listYear) {
      return new Date().getFullYear() - property.listYear;
    }
    return 5;
  }
  const diffMs = Date.now() - date.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 365));
}

function scoreFromRange(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  const ratio = (value - min) / (max - min);
  return clamp(Math.round(ratio * 100), 0, 100);
}

function scoreToGrade(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
