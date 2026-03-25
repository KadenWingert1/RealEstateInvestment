"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Property } from "@/lib/types";
import { computeFinance, DEFAULTS, DEFAULT_PROJECTION } from "@/lib/finance";
import { estimateRehabCost, estimateSqft, type RehabLevel } from "@/lib/estimates";
import { computeInvestorScore, type CityStats } from "@/lib/ranking";
import { recommendStrategies, type StrategyRecommendation } from "@/lib/strategy";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function PropertyDetail({
  property,
  cityStats,
}: {
  property: Property;
  cityStats: CityStats;
}) {
  type PurchasePlan = "conventional" | "cash" | "fha" | "hardMoney" | "brrrr";

  const [marketEstimate, setMarketEstimate] = useState<Record<string, unknown> | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const inferredSqft = property.sqft ?? estimateSqft(property.price);
  const [rehabLevel, setRehabLevel] = useState<RehabLevel>("moderate");
  const [purchasePlan, setPurchasePlan] = useState<PurchasePlan>("conventional");
  const [assumptions, setAssumptions] = useState({
    downPaymentPct: DEFAULTS.downPaymentPct,
    interestRate: DEFAULTS.interestRate,
    loanTermYears: DEFAULTS.loanTermYears,
    closingCostPct: DEFAULTS.closingCostPct,
    rentRatio: DEFAULTS.rentRatio,
    taxRate: DEFAULTS.taxRate,
    insuranceRate: DEFAULTS.insuranceRate,
    maintenanceRate: DEFAULTS.maintenanceRate,
    vacancyRate: DEFAULTS.vacancyRate,
    managementRate: DEFAULTS.managementRate,
    includeManagement: DEFAULTS.includeManagement,
    holdYears: DEFAULT_PROJECTION.holdYears,
    appreciationRate: DEFAULT_PROJECTION.appreciationRate,
    rentGrowthRate: DEFAULT_PROJECTION.rentGrowthRate,
    sellingCostPct: DEFAULT_PROJECTION.sellingCostPct,
    refinanceLtv: 0.75,
    arvPremium: 0.15,
    rehabCostOverride: null as number | null,
  });

  const preferredStrategy: StrategyRecommendation["name"] = useMemo(() => {
    switch (purchasePlan) {
      case "brrrr":
        return "BRRRR";
      case "fha":
        return "House Hacking";
      case "hardMoney":
        return "Fix and Flip";
      case "cash":
        return "Buy and Hold";
      default:
        return "Buy and Hold";
    }
  }, [purchasePlan]);

  const applyPlanPreset = (plan: PurchasePlan) => {
    if (plan === "cash") {
      setAssumptions((current) => ({
        ...current,
        downPaymentPct: 1,
        interestRate: 0,
      }));
      return;
    }
    if (plan === "fha") {
      setAssumptions((current) => ({
        ...current,
        downPaymentPct: 0.035,
        interestRate: Math.max(current.interestRate, 0.065),
        loanTermYears: 30,
      }));
      return;
    }
    if (plan === "hardMoney") {
      setAssumptions((current) => ({
        ...current,
        downPaymentPct: 0.25,
        interestRate: Math.max(current.interestRate, 0.1),
        loanTermYears: 5,
      }));
      return;
    }
    if (plan === "brrrr") {
      setAssumptions((current) => ({
        ...current,
        downPaymentPct: 0.2,
        interestRate: Math.max(current.interestRate, 0.075),
        loanTermYears: 30,
      }));
      return;
    }
    setAssumptions((current) => ({
      ...current,
      downPaymentPct: 0.2,
      interestRate: Math.max(current.interestRate, 0.065),
      loanTermYears: 30,
    }));
  };

  const rehabCost =
    assumptions.rehabCostOverride ?? estimateRehabCost(inferredSqft, rehabLevel);
  const arv = property.price * (1 + assumptions.arvPremium) + rehabCost * 0.6;

  const finance = useMemo(
    () =>
      computeFinance(
        {
          price: property.price,
          downPaymentPct: assumptions.downPaymentPct,
          interestRate: assumptions.interestRate,
          loanTermYears: assumptions.loanTermYears,
          closingCostPct: assumptions.closingCostPct,
          rehabCost,
          rentRatio: assumptions.rentRatio,
          taxRate: assumptions.taxRate,
          insuranceRate: assumptions.insuranceRate,
          maintenanceRate: assumptions.maintenanceRate,
          vacancyRate: assumptions.vacancyRate,
          managementRate: assumptions.managementRate,
          includeManagement: assumptions.includeManagement,
        },
        {
          holdYears: assumptions.holdYears,
          appreciationRate: assumptions.appreciationRate,
          rentGrowthRate: assumptions.rentGrowthRate,
          sellingCostPct: assumptions.sellingCostPct,
        }
      ),
    [assumptions, property.price, rehabCost]
  );

  const score = useMemo(() => computeInvestorScore(property, finance, cityStats), [
    property,
    finance,
    cityStats,
  ]);
  const strategies = useMemo(
    () =>
      recommendStrategies({
        price: property.price,
        rehabCost,
        arv,
        finance,
        propertyType: property.propertyType,
        beds: property.beds,
        units: property.units,
        refinanceLtv: assumptions.refinanceLtv,
        sellingCostPct: assumptions.sellingCostPct,
        preferredStrategy,
      }),
    [property, finance, rehabCost, arv, assumptions.refinanceLtv, assumptions.sellingCostPct, preferredStrategy]
  );

  useEffect(() => {
    const zip = property.zip;
    const beds = property.beds ?? 3;
    const baths = property.baths ?? 2;
    const sqft = property.sqft ?? inferredSqft;
    if (!zip) return;

    const params = new URLSearchParams({
      zip_code: zip,
      bedrooms: String(beds),
      bathrooms: String(baths),
      sqft: String(sqft),
    });

    fetch(`/api/estimate?${params.toString()}`)
      .then((res) => res.json())
      .then((payload) => {
        if (!payload.ok) {
          setEstimateError(payload.data?.message || "Estimate unavailable");
          return;
        }
        setMarketEstimate(payload.data);
      })
      .catch(() => setEstimateError("Estimate unavailable"));
  }, [property.zip, property.beds, property.baths, property.sqft, inferredSqft]);

  return (
    <div className="container">
      <div style={{ marginBottom: "16px" }}>
        <Link href="/" className="back-link">
          ← Back to search
        </Link>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <img src={getPropertyImage(property)} alt={`${property.address} listing`} />
          <h2>{property.address}</h2>
          <div className="tag">
            {property.city}, {property.state} {property.zip}
          </div>
          <div className="stat-grid">
            <div className="stat">
              <span>Price</span>
              <strong>${property.price.toLocaleString()}</strong>
            </div>
            <div className="stat">
              <span>Beds</span>
              <strong>{property.beds ?? "Est."}</strong>
            </div>
            <div className="stat">
              <span>Baths</span>
              <strong>{property.baths ?? "Est."}</strong>
            </div>
            <div className="stat">
              <span>Sq Ft</span>
              <strong>{property.sqft ?? inferredSqft}</strong>
            </div>
          </div>
          <div className="tag">Source: {property.source ?? "Public record"}</div>
        </div>

        <div className="card">
          <h3>Property Grade</h3>
          <div className="tag">
            Scores are 0–100. This rank blends cash flow yield, cap rate, cash-on-cash,
            value vs. nearby sales, risk, and sale recency.
          </div>
          <div className="stat-grid">
            <div className="stat">
              <span>
                Overall Grade
                <span className="help" data-tip="Composite investor score from cash flow, returns, value, risk, and recency.">?</span>
              </span>
              <strong>
                {score.grade} ({score.total}/100)
              </strong>
            </div>
            <div className="stat">
              <span>Cash Flow Yield</span>
              <strong>{score.components.cashFlowYield}/100</strong>
              <div className="tag">Annual cash flow vs. price</div>
            </div>
            <div className="stat">
              <span>Cash-on-Cash</span>
              <strong>{score.components.cashOnCash}/100</strong>
              <div className="tag">Equity return on invested cash</div>
            </div>
            <div className="stat">
              <span>Cap Rate</span>
              <strong>{score.components.capRate}/100</strong>
              <div className="tag">NOI versus price</div>
            </div>
            <div className="stat">
              <span>Value vs. Nearby</span>
              <strong>{score.components.value}/100</strong>
              <div className="tag">Price per sqft vs. city median</div>
            </div>
            <div className="stat">
              <span>Risk</span>
              <strong>{score.components.risk}/100</strong>
              <div className="tag">Break-even occupancy</div>
            </div>
            <div className="stat">
              <span>Recency</span>
              <strong>{score.components.recency}/100</strong>
              <div className="tag">Recent sales are more reliable</div>
            </div>
          </div>
        </div>
      </div>

      <h2 className="section-title">Investment Assumptions</h2>
      <div className="grid grid-2">
        <div className="card">
          <div className="stat-grid">
            <label>
              Buying Plan
              <select
                value={purchasePlan}
                onChange={(event) => {
                  const plan = event.target.value as PurchasePlan;
                  setPurchasePlan(plan);
                  applyPlanPreset(plan);
                }}
              >
                <option value="conventional">Conventional mortgage</option>
                <option value="cash">All-cash purchase</option>
                <option value="fha">FHA / owner-occupy</option>
                <option value="hardMoney">Hard money / private</option>
                <option value="brrrr">BRRRR refinance plan</option>
              </select>
            </label>
            <label>
              Down Payment %
              <div className="input-group has-suffix">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  inputMode="decimal"
                  value={Number((assumptions.downPaymentPct * 100).toFixed(2))}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setAssumptions({
                      ...assumptions,
                      downPaymentPct: Number.isFinite(value) ? Math.min(Math.max(value / 100, 0), 1) : 0,
                    });
                  }}
                />
                <span className="input-suffix">%</span>
              </div>
            </label>
            <label>
              Interest Rate
              <div className="input-group has-suffix">
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.01"
                  inputMode="decimal"
                  value={Number((assumptions.interestRate * 100).toFixed(2))}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setAssumptions({
                      ...assumptions,
                      interestRate: Number.isFinite(value) ? Math.min(Math.max(value / 100, 0), 0.4) : 0,
                    });
                  }}
                />
                <span className="input-suffix">%</span>
              </div>
            </label>
            <label>
              Loan Term (years)
              <input
                type="number"
                min="1"
                max="40"
                value={assumptions.loanTermYears}
                onChange={(event) =>
                  setAssumptions({
                    ...assumptions,
                    loanTermYears: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Rent-to-Price Ratio
              <div className="input-group has-suffix">
                <input
                  type="number"
                  min="0.1"
                  max="3"
                  step="0.01"
                  inputMode="decimal"
                  value={Number((assumptions.rentRatio * 100).toFixed(2))}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setAssumptions({
                      ...assumptions,
                      rentRatio: Number.isFinite(value) ? Math.min(Math.max(value / 100, 0), 0.1) : 0,
                    });
                  }}
                />
                <span className="input-suffix">%</span>
              </div>
            </label>
            <label>
              Property Tax Rate
              <div className="input-group has-suffix">
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.01"
                  inputMode="decimal"
                  value={Number((assumptions.taxRate * 100).toFixed(2))}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setAssumptions({
                      ...assumptions,
                      taxRate: Number.isFinite(value) ? Math.min(Math.max(value / 100, 0), 0.2) : 0,
                    });
                  }}
                />
                <span className="input-suffix">%</span>
              </div>
            </label>
            <label>
              Insurance Rate
              <div className="input-group has-suffix">
                <input
                  type="number"
                  min="0"
                  max="2"
                  step="0.01"
                  inputMode="decimal"
                  value={Number((assumptions.insuranceRate * 100).toFixed(2))}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setAssumptions({
                      ...assumptions,
                      insuranceRate: Number.isFinite(value) ? Math.min(Math.max(value / 100, 0), 0.1) : 0,
                    });
                  }}
                />
                <span className="input-suffix">%</span>
              </div>
            </label>
            <label>
              Maintenance Rate
              <div className="input-group has-suffix">
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.01"
                  inputMode="decimal"
                  value={Number((assumptions.maintenanceRate * 100).toFixed(2))}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setAssumptions({
                      ...assumptions,
                      maintenanceRate: Number.isFinite(value) ? Math.min(Math.max(value / 100, 0), 0.2) : 0,
                    });
                  }}
                />
                <span className="input-suffix">%</span>
              </div>
            </label>
            <label>
              Vacancy Rate
              <div className="input-group has-suffix">
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.1"
                  inputMode="decimal"
                  value={Number((assumptions.vacancyRate * 100).toFixed(2))}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setAssumptions({
                      ...assumptions,
                      vacancyRate: Number.isFinite(value) ? Math.min(Math.max(value / 100, 0), 0.8) : 0,
                    });
                  }}
                />
                <span className="input-suffix">%</span>
              </div>
            </label>
            <label>
              Management Rate
              <div className="input-group has-suffix">
                <input
                  type="number"
                  min="0"
                  max="30"
                  step="0.1"
                  inputMode="decimal"
                  value={Number((assumptions.managementRate * 100).toFixed(2))}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setAssumptions({
                      ...assumptions,
                      managementRate: Number.isFinite(value) ? Math.min(Math.max(value / 100, 0), 0.5) : 0,
                    });
                  }}
                />
                <span className="input-suffix">%</span>
              </div>
            </label>
            <label>
              Include Management
              <select
                value={assumptions.includeManagement ? "yes" : "no"}
                onChange={(event) =>
                  setAssumptions({
                    ...assumptions,
                    includeManagement: event.target.value === "yes",
                  })
                }
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
          </div>
        </div>

        <div className="card">
          <div className="stat-grid">
            <label>
              Rehab Level
              <select
                value={rehabLevel}
                onChange={(event) => setRehabLevel(event.target.value as RehabLevel)}
              >
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="heavy">Heavy</option>
              </select>
            </label>
            <label>
              Rehab Cost Override
              <div className="input-group has-prefix">
                <span className="input-prefix">$</span>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={assumptions.rehabCostOverride ?? rehabCost}
                  onChange={(event) =>
                    setAssumptions({
                      ...assumptions,
                      rehabCostOverride: Number(event.target.value),
                    })
                  }
                />
              </div>
            </label>
            <label>
              ARV Premium
              <div className="input-group has-suffix">
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.1"
                  inputMode="decimal"
                  value={Number((assumptions.arvPremium * 100).toFixed(2))}
                  onChange={(event) =>
                    setAssumptions({
                      ...assumptions,
                      arvPremium: Number(event.target.value) / 100,
                    })
                  }
                />
                <span className="input-suffix">%</span>
              </div>
            </label>
            <label>
              Hold Period (years)
              <input
                type="number"
                min="1"
                max="40"
                value={assumptions.holdYears}
                onChange={(event) =>
                  setAssumptions({
                    ...assumptions,
                    holdYears: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Appreciation Rate
              <div className="input-group has-suffix">
                <input
                  type="number"
                  min="-10"
                  max="20"
                  step="0.1"
                  inputMode="decimal"
                  value={Number((assumptions.appreciationRate * 100).toFixed(2))}
                  onChange={(event) =>
                    setAssumptions({
                      ...assumptions,
                      appreciationRate: Number(event.target.value) / 100,
                    })
                  }
                />
                <span className="input-suffix">%</span>
              </div>
            </label>
            <label>
              Rent Growth Rate
              <div className="input-group has-suffix">
                <input
                  type="number"
                  min="-5"
                  max="15"
                  step="0.1"
                  inputMode="decimal"
                  value={Number((assumptions.rentGrowthRate * 100).toFixed(2))}
                  onChange={(event) =>
                    setAssumptions({
                      ...assumptions,
                      rentGrowthRate: Number(event.target.value) / 100,
                    })
                  }
                />
                <span className="input-suffix">%</span>
              </div>
            </label>
            <label>
              Selling Costs %
              <div className="input-group has-suffix">
                <input
                  type="number"
                  min="0"
                  max="15"
                  step="0.1"
                  inputMode="decimal"
                  value={Number((assumptions.sellingCostPct * 100).toFixed(2))}
                  onChange={(event) =>
                    setAssumptions({
                      ...assumptions,
                      sellingCostPct: Number(event.target.value) / 100,
                    })
                  }
                />
                <span className="input-suffix">%</span>
              </div>
            </label>
            <label>
              Refi LTV
              <div className="input-group has-suffix">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  inputMode="decimal"
                  value={Number((assumptions.refinanceLtv * 100).toFixed(2))}
                  onChange={(event) =>
                    setAssumptions({
                      ...assumptions,
                      refinanceLtv: Number(event.target.value) / 100,
                    })
                  }
                />
                <span className="input-suffix">%</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      <h2 className="section-title">Financial Metrics</h2>
      <div className="grid grid-2">
        <div className="card">
          <div className="stat-grid">
            <div className="stat">
              <span>
                Monthly Rent (est.)
                <span className="help" data-tip="Estimated from rent-to-price ratio and nearby sales.">?</span>
              </span>
              <strong>{formatCurrency(finance.monthlyRent)}</strong>
            </div>
            <div className="stat">
              <span>
                Monthly Cash Flow
                <span className="help" data-tip="Rent minus operating expenses and mortgage payment.">?</span>
              </span>
              <strong>{formatCurrency(finance.monthlyCashFlow)}</strong>
            </div>
            <div className="stat">
              <span>
                Annual Cash Flow
                <span className="help" data-tip="Monthly cash flow multiplied by 12.">?</span>
              </span>
              <strong>{formatCurrency(finance.annualCashFlow)}</strong>
            </div>
            <div className="stat">
              <span>
                Cap Rate
                <span className="help" data-tip="Net operating income divided by price.">?</span>
              </span>
              <strong>{formatPercent(finance.capRate)}</strong>
            </div>
            <div className="stat">
              <span>
                Cash-on-Cash
                <span className="help" data-tip="Annual cash flow divided by total cash invested.">?</span>
              </span>
              <strong>{formatPercent(finance.cashOnCash)}</strong>
            </div>
            <div className="stat">
              <span>
                IRR (Hold Period)
                <span className="help" data-tip="Internal rate of return over the selected hold period.">?</span>
              </span>
              <strong>{formatPercent(finance.irr, 2)}</strong>
            </div>
            <div className="stat">
              <span>
                Break-even Occupancy
                <span className="help" data-tip="Occupancy needed to cover expenses and debt service.">?</span>
              </span>
              <strong>{formatPercent(finance.breakEvenOccupancy, 1)}</strong>
            </div>
            <div className="stat">
              <span>
                All-in Cash Invested
                <span className="help" data-tip="Down payment + closing costs + rehab.">?</span>
              </span>
              <strong>{formatCurrency(finance.totalCashInvested)}</strong>
            </div>
          </div>
        </div>
        <div className="card">
          <h3>Market Estimate (ZipMarketData)</h3>
          {marketEstimate && (
            <div className="stat-grid">
              {renderEstimateStats(marketEstimate).map((stat) => (
                <div key={stat.label} className="stat">
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
          )}
          {!marketEstimate && estimateError && (
            <div className="notice">{estimateError}</div>
          )}
          {!marketEstimate && !estimateError && (
            <div className="tag">Loading estimate...</div>
          )}
        </div>
        <div className="card">
          <h3>Expenses (Annual)</h3>
          <table className="table">
            <tbody>
              <tr>
                <td>
                  Property Taxes
                  <span className="help" data-tip="Estimated using the property tax rate.">?</span>
                </td>
                <td>${Math.round(property.price * assumptions.taxRate).toLocaleString()}</td>
              </tr>
              <tr>
                <td>
                  Insurance
                  <span className="help" data-tip="Estimated annual insurance premium.">?</span>
                </td>
                <td>${Math.round(property.price * assumptions.insuranceRate).toLocaleString()}</td>
              </tr>
              <tr>
                <td>
                  Maintenance
                  <span className="help" data-tip="Annual maintenance reserve as % of value.">?</span>
                </td>
                <td>${Math.round(property.price * assumptions.maintenanceRate).toLocaleString()}</td>
              </tr>
              <tr>
                <td>
                  Vacancy Loss
                  <span className="help" data-tip="Lost rent from vacancy assumptions.">?</span>
                </td>
                <td>${Math.round(finance.annualRent * assumptions.vacancyRate).toLocaleString()}</td>
              </tr>
              <tr>
                <td>
                  Management
                  <span className="help" data-tip="Property management fee if enabled.">?</span>
                </td>
                <td>
                  ${
                    assumptions.includeManagement
                      ? Math.round(finance.annualRent * assumptions.managementRate).toLocaleString()
                      : 0
                  }
                </td>
              </tr>
              <tr>
                <td>
                  NOI
                  <span className="help" data-tip="Net operating income after expenses.">?</span>
                </td>
                <td>${Math.round(finance.noi).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">Strategy Recommendations</h2>
      <div className="grid grid-2">
        {strategies.map((strategy) => (
          <div key={strategy.name} className="card">
            <div className="badge">{strategy.name}</div>
            <h3>Score: {strategy.score}</h3>
            <ul>
              {strategy.reasoning.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <div className="stat-grid">
              {Object.entries(strategy.metrics).map(([key, value]) => (
                <div key={key} className="stat">
                  <span>{key}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "N/A";
  return currencyFormatter.format(Math.round(value));
}

function formatPercent(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "N/A";
  const formatter = new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: digits,
  });
  return formatter.format(value);
}

function getPropertyImage(property: Property) {
  if (property.imageUrl) return property.imageUrl;
  const title = `${property.address}`;
  const subtitle = `${property.city}, ${property.state}`;
  return buildFallbackImage(title, subtitle);
}

function buildFallbackImage(title: string, subtitle: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img" aria-label="${title}">\n<defs>\n<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">\n<stop offset="0%" stop-color="#0f172a" />\n<stop offset="100%" stop-color="#0f766e" />\n</linearGradient>\n</defs>\n<rect width="800" height="600" fill="url(#g)" />\n<rect x="60" y="80" width="680" height="440" rx="28" fill="rgba(255,255,255,0.12)" />\n<text x="100" y="230" font-family="Space Grotesk, Arial" font-size="34" fill="#f8fafc">${escapeSvg(title)}</text>\n<text x="100" y="280" font-family="Space Grotesk, Arial" font-size="22" fill="#e2e8f0">${escapeSvg(subtitle)}</text>\n<text x="100" y="500" font-family="Space Grotesk, Arial" font-size="16" fill="#cbd5f5">Public record summary</text>\n</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvg(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderEstimateStats(raw: Record<string, unknown>) {
  const candidates: Array<{ label: string; value: string | number }> = [];
  const flat = flattenObject(raw);
  const pick = (key: string) => flat[key];

  const value = pick("estimated_value") ?? pick("estimate") ?? pick("value");
  if (value) candidates.push({ label: "Estimated Value", value: formatCurrencyNumber(value) });

  const low = pick("low") ?? pick("low_estimate") ?? pick("lower");
  const high = pick("high") ?? pick("high_estimate") ?? pick("upper");
  if (low) candidates.push({ label: "Low", value: formatCurrencyNumber(low) });
  if (high) candidates.push({ label: "High", value: formatCurrencyNumber(high) });

  const rent = pick("rent") ?? pick("rent_estimate") ?? pick("estimated_rent");
  if (rent) candidates.push({ label: "Rent Est.", value: formatCurrencyNumber(rent) });

  if (candidates.length === 0) {
    return [{ label: "Response", value: "See raw JSON in console." }];
  }
  return candidates;
}

function flattenObject(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const walk = (value: unknown, prefix = "") => {
    if (!value || typeof value !== "object") return;
    for (const [key, val] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${key}` : key;
      out[next] = val;
      if (val && typeof val === "object" && !Array.isArray(val)) {
        walk(val as Record<string, unknown>, next);
      }
    }
  };
  walk(obj);
  return out;
}

function formatCurrencyNumber(value: unknown) {
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed)) return String(value);
  return currencyFormatter.format(Math.round(parsed));
}
