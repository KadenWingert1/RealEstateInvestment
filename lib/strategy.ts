import type { FinanceSummary } from "./finance";

export type StrategyRecommendation = {
  name: "BRRRR" | "House Hacking" | "Buy and Hold" | "Fix and Flip";
  score: number;
  reasoning: string[];
  metrics: Record<string, string>;
};

export type StrategyInputs = {
  price: number;
  rehabCost: number;
  arv: number;
  finance: FinanceSummary;
  propertyType: string | null;
  beds: number | null;
  units: number | null;
  refinanceLtv: number;
  sellingCostPct: number;
  preferredStrategy?: StrategyRecommendation["name"];
};

export function recommendStrategies(inputs: StrategyInputs): StrategyRecommendation[] {
  const recommendations: StrategyRecommendation[] = [];

  const refinanceProceeds = inputs.arv * inputs.refinanceLtv;
  const initialLoan = inputs.price * 0.75;
  const cashOut = refinanceProceeds - initialLoan;
  const totalCost = inputs.price + inputs.rehabCost;
  const equityCapture = totalCost > 0 ? (inputs.arv - totalCost) / totalCost : 0;
  const dscr = inputs.finance.monthlyMortgage > 0 ? inputs.finance.noi / (inputs.finance.monthlyMortgage * 12) : 0;

  const brrrrScore = Math.min(
    100,
    Math.max(0, Math.round(equityCapture * 120 + (inputs.finance.monthlyCashFlow > 0 ? 20 : 0) + dscr * 15))
  );
  const brrrrReasons = [
    cashOut > 0
      ? `Refinance could return ~$${Math.round(cashOut).toLocaleString()} in equity.`
      : "Refinance proceeds are limited based on the current ARV assumption.",
    equityCapture > 0.15
      ? "Equity capture looks strong after rehab."
      : "Equity capture is modest; negotiate harder or trim rehab.",
    inputs.finance.monthlyCashFlow > 0
      ? "Projected monthly cash flow stays positive after refi."
      : "Cash flow is tight; a rent increase or lower rehab cost helps.",
  ];
  recommendations.push({
    name: "BRRRR",
    score: brrrrScore,
    reasoning: brrrrReasons,
    metrics: {
      "ARV": `$${Math.round(inputs.arv).toLocaleString()}`,
      "Refi LTV": `${Math.round(inputs.refinanceLtv * 100)}%`,
      "Potential Cash-Out": `$${Math.round(cashOut).toLocaleString()}`,
    },
  });

  const isMultiFamily =
    inputs.units !== null && inputs.units > 1 ||
    inputs.propertyType?.toLowerCase().includes("apartment") ||
    (inputs.beds !== null && inputs.beds >= 3);
  const houseHackScore = isMultiFamily ? 80 : 55;
  const houseHackReasons = [
    isMultiFamily
      ? "Layout supports renting rooms or units while living on-site."
      : "Consider room rentals if zoning or layout allows.",
    inputs.finance.monthlyCashFlow > -250
      ? "Cash flow is close to breakeven for owner-occupancy." 
      : "Higher vacancy or financing costs may reduce the owner-occupant benefit.",
  ];
  recommendations.push({
    name: "House Hacking",
    score: houseHackScore,
    reasoning: houseHackReasons,
    metrics: {
      "Breakeven Occupancy": `${Math.round(inputs.finance.breakEvenOccupancy * 100)}%`,
      "Beds": `${inputs.beds ?? "N/A"}`,
      "Monthly Cash Flow": `$${Math.round(inputs.finance.monthlyCashFlow).toLocaleString()}`,
    },
  });

  const buyHoldScore = Math.min(
    100,
    Math.round(inputs.finance.capRate * 900 + inputs.finance.cashOnCash * 700 + dscr * 10)
  );
  const buyHoldReasons = [
    inputs.finance.capRate > 0.06
      ? "Cap rate clears the 6% investor hurdle."
      : "Cap rate is modest; focus on appreciation or rent growth.",
    inputs.finance.cashOnCash > 0.08
      ? "Cash-on-cash return is investor-grade."
      : "Cash-on-cash return is below typical targets.",
    dscr > 1.15
      ? "Debt service coverage ratio is healthy."
      : "Debt coverage is thin; consider more down payment.",
  ];
  recommendations.push({
    name: "Buy and Hold",
    score: buyHoldScore,
    reasoning: buyHoldReasons,
    metrics: {
      "Cap Rate": `${(inputs.finance.capRate * 100).toFixed(1)}%`,
      "Cash-on-Cash": `${(inputs.finance.cashOnCash * 100).toFixed(1)}%`,
      "Annual Cash Flow": `$${Math.round(inputs.finance.annualCashFlow).toLocaleString()}`,
    },
  });

  const flipProfit = inputs.arv * (1 - inputs.sellingCostPct) - inputs.price - inputs.rehabCost;
  const flipMargin = inputs.arv ? flipProfit / inputs.arv : 0;
  const rehabRatio = totalCost > 0 ? inputs.rehabCost / totalCost : 0;
  const flipScore = Math.min(100, Math.max(0, Math.round(flipMargin * 800 - rehabRatio * 120)));
  const flipReasons = [
    flipProfit > 0
      ? `Estimated profit after selling costs is ~$${Math.round(flipProfit).toLocaleString()}.`
      : "Projected profit is negative under current ARV assumptions.",
    rehabRatio < 0.2
      ? "Rehab scope stays within a manageable range."
      : "Rehab budget is heavy and raises execution risk.",
  ];
  recommendations.push({
    name: "Fix and Flip",
    score: flipScore,
    reasoning: flipReasons,
    metrics: {
      "ARV": `$${Math.round(inputs.arv).toLocaleString()}`,
      "Rehab": `$${Math.round(inputs.rehabCost).toLocaleString()}`,
      "Projected Profit": `$${Math.round(flipProfit).toLocaleString()}`,
    },
  });

  if (inputs.preferredStrategy) {
    for (const recommendation of recommendations) {
      if (recommendation.name === inputs.preferredStrategy) {
        recommendation.score = Math.min(100, recommendation.score + 8);
        recommendation.reasoning.unshift("Aligned with your selected buying plan.");
      }
    }
  }

  return recommendations.sort((a, b) => b.score - a.score);
}
