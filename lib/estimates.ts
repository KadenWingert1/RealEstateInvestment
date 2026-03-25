export type RehabLevel = "light" | "moderate" | "heavy";

export const REHAB_COST_PER_SQFT: Record<RehabLevel, [number, number]> = {
  light: [15, 25],
  moderate: [30, 50],
  heavy: [60, 90],
};

export function estimateSqft(price: number) {
  if (price <= 0) {
    return 1200;
  }
  const assumedPricePerSqft = 220;
  return Math.max(600, Math.round(price / assumedPricePerSqft));
}

export function estimateBedsBaths(sqft: number) {
  const beds = Math.max(1, Math.min(6, Math.round(sqft / 550)));
  const baths = Math.max(1, Math.min(4, parseFloat((beds * 0.75).toFixed(1))));
  return { beds, baths };
}

export function estimateRehabCost(sqft: number, level: RehabLevel) {
  const [low, high] = REHAB_COST_PER_SQFT[level];
  return Math.round(sqft * ((low + high) / 2));
}
