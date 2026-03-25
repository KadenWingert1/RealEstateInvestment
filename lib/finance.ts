export type FinancingInputs = {
  price: number;
  downPaymentPct: number;
  interestRate: number;
  loanTermYears: number;
  closingCostPct: number;
  rehabCost: number;
  rentRatio: number;
  taxRate: number;
  insuranceRate: number;
  maintenanceRate: number;
  vacancyRate: number;
  managementRate: number;
  includeManagement: boolean;
};

export type ProjectionInputs = {
  holdYears: number;
  appreciationRate: number;
  rentGrowthRate: number;
  sellingCostPct: number;
};

export type FinanceSummary = {
  monthlyRent: number;
  annualRent: number;
  annualExpenses: number;
  noi: number;
  monthlyMortgage: number;
  monthlyCashFlow: number;
  annualCashFlow: number;
  capRate: number;
  cashOnCash: number;
  irr: number;
  breakEvenOccupancy: number;
  totalCashInvested: number;
};

export const DEFAULTS: FinancingInputs = {
  price: 300000,
  downPaymentPct: 0.25,
  interestRate: 0.07,
  loanTermYears: 30,
  closingCostPct: 0.03,
  rehabCost: 15000,
  rentRatio: 0.008,
  taxRate: 0.012,
  insuranceRate: 0.004,
  maintenanceRate: 0.01,
  vacancyRate: 0.06,
  managementRate: 0.08,
  includeManagement: false,
};

export const DEFAULT_PROJECTION: ProjectionInputs = {
  holdYears: 5,
  appreciationRate: 0.03,
  rentGrowthRate: 0.025,
  sellingCostPct: 0.07,
};

export function monthlyMortgagePayment(loanAmount: number, annualRate: number, years: number) {
  const monthlyRate = annualRate / 12;
  const payments = years * 12;
  if (monthlyRate === 0) {
    return loanAmount / payments;
  }
  return (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -payments));
}

export function estimateMonthlyRent(price: number, rentRatio: number) {
  return Math.max(0, price * rentRatio);
}

export function computeFinance(
  inputs: FinancingInputs,
  projection: ProjectionInputs = DEFAULT_PROJECTION
): FinanceSummary {
  const monthlyRent = estimateMonthlyRent(inputs.price, inputs.rentRatio);
  const annualRent = monthlyRent * 12;

  const annualTaxes = inputs.price * inputs.taxRate;
  const annualInsurance = inputs.price * inputs.insuranceRate;
  const annualMaintenance = inputs.price * inputs.maintenanceRate;
  const annualVacancy = annualRent * inputs.vacancyRate;
  const annualManagement = inputs.includeManagement ? annualRent * inputs.managementRate : 0;

  const annualExpenses =
    annualTaxes + annualInsurance + annualMaintenance + annualVacancy + annualManagement;
  const noi = annualRent - annualExpenses;

  const loanAmount = inputs.price * (1 - inputs.downPaymentPct);
  const monthlyMortgage = monthlyMortgagePayment(
    loanAmount,
    inputs.interestRate,
    inputs.loanTermYears
  );

  const monthlyOperating = annualExpenses / 12;
  const monthlyCashFlow = monthlyRent - monthlyOperating - monthlyMortgage;
  const annualCashFlow = monthlyCashFlow * 12;

  const capRate = inputs.price === 0 ? 0 : noi / inputs.price;
  const totalCashInvested =
    inputs.price * inputs.downPaymentPct + inputs.price * inputs.closingCostPct + inputs.rehabCost;
  const cashOnCash = totalCashInvested === 0 ? 0 : annualCashFlow / totalCashInvested;

  const breakEvenOccupancy = annualRent === 0 ? 0 : (annualExpenses + monthlyMortgage * 12) / annualRent;

  const irr = computeIrr(inputs, projection, annualCashFlow, loanAmount);

  return {
    monthlyRent,
    annualRent,
    annualExpenses,
    noi,
    monthlyMortgage,
    monthlyCashFlow,
    annualCashFlow,
    capRate,
    cashOnCash,
    irr,
    breakEvenOccupancy,
    totalCashInvested,
  };
}

function computeIrr(
  inputs: FinancingInputs,
  projection: ProjectionInputs,
  annualCashFlow: number,
  loanAmount: number
) {
  const cashflows = [-
    (inputs.price * inputs.downPaymentPct + inputs.price * inputs.closingCostPct + inputs.rehabCost)
  ];
  let currentValue = inputs.price;
  let currentRent = estimateMonthlyRent(inputs.price, inputs.rentRatio) * 12;

  for (let year = 1; year <= projection.holdYears; year += 1) {
    currentValue *= 1 + projection.appreciationRate;
    currentRent *= 1 + projection.rentGrowthRate;
    const annualExpenses =
      inputs.price * inputs.taxRate +
      inputs.price * inputs.insuranceRate +
      inputs.price * inputs.maintenanceRate +
      currentRent * inputs.vacancyRate +
      (inputs.includeManagement ? currentRent * inputs.managementRate : 0);
    const yearNoi = currentRent - annualExpenses;
    const debtService = monthlyMortgagePayment(loanAmount, inputs.interestRate, inputs.loanTermYears) * 12;
    cashflows.push(yearNoi - debtService);
  }

  const saleProceeds = currentValue * (1 - projection.sellingCostPct) - loanAmount;
  cashflows[cashflows.length - 1] += saleProceeds;

  return internalRateOfReturn(cashflows);
}

export function internalRateOfReturn(cashflows: number[], guess = 0.1) {
  let rate = guess;
  for (let i = 0; i < 100; i += 1) {
    const { npv, derivative } = npvWithDerivative(cashflows, rate);
    if (Math.abs(npv) < 1e-6) {
      return rate;
    }
    if (derivative === 0) {
      break;
    }
    rate -= npv / derivative;
  }
  return rate;
}

function npvWithDerivative(cashflows: number[], rate: number) {
  let npv = 0;
  let derivative = 0;
  cashflows.forEach((cf, i) => {
    const denom = Math.pow(1 + rate, i);
    npv += cf / denom;
    if (i > 0) {
      derivative -= (i * cf) / (denom * (1 + rate));
    }
  });
  return { npv, derivative };
}
