import assert from "node:assert/strict";
import { test } from "node:test";
import { monthlyMortgagePayment, computeFinance } from "../lib/finance.ts";

test("monthlyMortgagePayment matches known value", () => {
  const payment = monthlyMortgagePayment(300000, 0.06, 30);
  assert.ok(payment > 1700 && payment < 1900);
});

test("computeFinance returns positive NOI when rent covers expenses", () => {
  const result = computeFinance({
    price: 250000,
    downPaymentPct: 0.25,
    interestRate: 0.06,
    loanTermYears: 30,
    closingCostPct: 0.03,
    rehabCost: 10000,
    rentRatio: 0.01,
    taxRate: 0.01,
    insuranceRate: 0.004,
    maintenanceRate: 0.01,
    vacancyRate: 0.05,
    managementRate: 0.08,
    includeManagement: true,
  });

  assert.ok(result.noi > 0);
  assert.ok(result.capRate > 0);
});
