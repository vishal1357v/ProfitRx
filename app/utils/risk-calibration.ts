/**
 * Authoritative Risk Score Calibration Utility for Indian eCommerce COD.
 *
 * Problem: A heuristic 0-100 risk score is an ordinal ranking (index),
 * NEVER a direct mathematical probability (e.g. 70/100 != 70% RTO probability).
 * Treating 70/100 as 70% RTO probability produces massive false positives,
 * distorting expected value (EV) and wrongly penalizing profitable orders.
 *
 * Empirical Benchmarks for Indian D2C eCommerce:
 * - Baseline COD RTO rate across India: ~20% - 25%
 * - Trusted repeat buyer: ~5% - 12%
 * - Average new buyer in standard pincode: ~18% - 24%
 * - Elevated risk (Tier 3/4 unconfirmed, high cart): ~28% - 35%
 * - High-risk pincode / prior cancellation: ~38% - 46%
 * - Extreme repeat offender (multiple past RTOs): ~55% - 75%
 * - Prepaid orders: ~1% - 5% (virtually zero payment default risk)
 */

export function calibrateRiskScoreToProbability(score: number | null | undefined, isCOD: boolean = true): number {
  const numericScore = typeof score === "number" && !isNaN(score) ? Math.max(0, Math.min(100, score)) : (isCOD ? 35 : 5);

  if (!isCOD) {
    // Prepaid orders have no customer cash-refusal risk.
    // Residual risk is purely failed courier transit/damage (1% - 5%).
    return Math.round((0.01 + (numericScore / 100) * 0.04) * 1000) / 1000;
  }

  // Piecewise monotonic calibration anchored to Indian eCommerce COD reality:
  // Score 0   -> 5%  (Ultra-trusted repeat buyer)
  // Score 20  -> 14% (Clean customer, Tier 1/2 metro)
  // Score 50  -> 28% (Average new customer, unknown pincode)
  // Score 70  -> 42% (High risk: elevated pincode RTO / order size)
  // Score 85  -> 58% (Critical risk: past RTO record / flagged pincode)
  // Score 100 -> 75% (Extreme repeat fraud offender)
  let prob: number;

  if (numericScore <= 20) {
    prob = 0.05 + (numericScore / 20) * (0.14 - 0.05);
  } else if (numericScore <= 50) {
    prob = 0.14 + ((numericScore - 20) / 30) * (0.28 - 0.14);
  } else if (numericScore <= 70) {
    prob = 0.28 + ((numericScore - 50) / 20) * (0.42 - 0.28);
  } else if (numericScore <= 85) {
    prob = 0.42 + ((numericScore - 70) / 15) * (0.58 - 0.42);
  } else {
    prob = 0.58 + ((numericScore - 85) / 15) * (0.75 - 0.58);
  }

  // Round to 3 decimal places
  return Math.round(prob * 1000) / 1000;
}

