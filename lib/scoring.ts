import type { FinanceSummary } from "./finance";

export type ScoreBreakdown = {
  total: number;
  grade: string;
  components: {
    cashFlow: number;
    roi: number;
    risk: number;
    location: number;
  };
};

export function gradeProperty(
  finance: FinanceSummary,
  locationScore = 50
): ScoreBreakdown {
  const cashFlowScore = clamp(mapRange(finance.monthlyCashFlow, -500, 500, 20, 100), 0, 100);
  const roiScore = clamp(mapRange(finance.cashOnCash, 0, 0.2, 30, 100), 0, 100);
  const riskScore = clamp(mapRange(1 - finance.breakEvenOccupancy, 0, 0.4, 30, 100), 0, 100);
  const location = clamp(locationScore, 0, 100);

  const total = Math.round(
    cashFlowScore * 0.3 + roiScore * 0.3 + riskScore * 0.2 + location * 0.2
  );

  return {
    total,
    grade: scoreToGrade(total),
    components: {
      cashFlow: Math.round(cashFlowScore),
      roi: Math.round(roiScore),
      risk: Math.round(riskScore),
      location: Math.round(location),
    },
  };
}

function scoreToGrade(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const ratio = (value - inMin) / (inMax - inMin);
  return outMin + ratio * (outMax - outMin);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
