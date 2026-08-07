export const MODEL_VERSION      = "risk-engine-v1";
export const WEIGHTS_VERSION    = "weights-v1";
export const CONFIDENCE_VERSION = "confidence-v1";

// ── Bayesian Smoothing ──
export const PRIOR_WEIGHT = 5;  // Equivalent sample size of prior

// ── Scorer Weights (sum to 1.0) ──
export const SCORER_WEIGHTS = {
  customer:  0.35,
  pincode:   0.25,
  order:     0.25,
  merchant:  0.15,
} as const;

// ── Risk Level Thresholds ──
export const RISK_THRESHOLDS = {
  LOW_MAX:      0.20,
  MEDIUM_MAX:   0.40,
  HIGH_MAX:     0.70,
} as const;

// ── Customer Scorer ──
export const CUSTOMER_WEIGHTS = {
  rtoRate:          0.40,
  deliverySuccess:  0.15,
  cancellationRate: 0.10,
  isNewCustomer:    0.15,
  purchaseRecency:  0.10,
  customerAge:      0.10,
} as const;

export const CUSTOMER_THRESHOLDS = {
  highRtoRate:        0.30,
  moderateRtoRate:    0.15,
  highCancellations:  3,
  recentPurchaseDays: 7,
  stalePurchaseDays:  90,
  matureCustomerDays: 180,
} as const;

// ── Pincode Scorer ──
export const PINCODE_WEIGHTS = {
  pincodeRtoRate:   0.50,
  deliveryRate:     0.20,
  regionalFallback: 0.30,
} as const;

export const PINCODE_THRESHOLDS = {
  minSampleSize:    5,
  highRtoRate:      0.30,
  moderateRtoRate:  0.15,
  goodDeliveryRate: 0.80,
} as const;

// ── Order Scorer ──
export const ORDER_WEIGHTS = {
  orderValue:         0.25,
  discountPercent:    0.25,
  isCOD:              0.30,
  addressCompleteness: 0.20,
} as const;

export const ORDER_THRESHOLDS = {
  highValueOrder:     5000,
  veryHighValueOrder: 10000,
  heavyDiscount:      0.30,
  moderateDiscount:   0.15,
} as const;

// ── Merchant Scorer ──
export const MERCHANT_THRESHOLDS = {
  highBaselineRto:      0.25,
  moderateBaselineRto:  0.15,
  minHistoricalOrders:  20,
} as const;

// ── Priors ──
export const PRIORS = {
  newCustomerRisk:    0.35,
  unknownPincodeRisk: 0.25,
  merchantDefaultRto: 0.20,
  prepaidDiscount:    0.85,
} as const;

// ── Confidence ──
export const CONFIDENCE_THRESHOLDS = {
  lowConfidence: 0.40,
  smallSample:   5,
} as const;
