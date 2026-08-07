export interface OrderFeatureResult {
  features: OrderFeatures;
  metadata: OrderFeatureMetadata;
}

export interface OrderFeatureMetadata {
  featureVersion: string;
  dataConfidence: number;
  warnings: FeatureWarning[];
  sources: OrderFeatureSources;
  generatedAt: Date;
  generatedFromOrderCreatedAt: Date;
}

export type FeatureWarning =
  | "UNKNOWN_PINCODE"
  | "NO_PINCODE_HISTORY"
  | "NO_REGIONAL_HISTORY"
  | "DEFAULT_COGS"
  | "NO_CUSTOMER_HISTORY"
  | "NEW_CUSTOMER"
  | "NO_AD_ATTRIBUTION"
  | "MISSING_CUSTOMER_ID"
  | "MISSING_ADDRESS"
  | "ESTIMATED_SHIPPING"
  | "LINE_ITEMS_UNAVAILABLE"
  | "AGGREGATE_DATA_USED";

export interface OrderFeatures {
  // ── Identity ──
  orderId: string;
  shop: string;
  orderDate: Date;

  // ── Order Financial Decomposition ──
  grossOrderValue: number;
  netOrderValue: number;
  subtotal: number;
  shippingCharged: number;
  tax: number;
  discountAmount: number;
  discountPercentage: number | null;

  // ── Order Characteristics ──
  itemCount: number | null;
  totalQuantity: number | null;
  totalWeight: number | null;
  isCOD: boolean;
  channel: string | null;

  // ── Customer History ──
  customerId: string | null;
  customerOrderCount: number;
  customerCodOrderCount: number;
  customerPrepaidOrderCount: number;
  customerDeliveredCount: number;
  customerRtoCount: number;
  customerCancellationCount: number;
  customerRtoRate: number | null;
  customerAov: number | null;
  customerLifetimeSpend: number | null;
  isNewCustomer: boolean;
  daysSinceLastOrder: number | null;
  customerAgeDays: number | null;
  repeatPurchaseGap: number | null;

  // ── Pincode History ──
  pincode: string | null;
  pincodeOrderCount: number;
  pincodeCodOrderCount: number;
  pincodeSuccessfulDeliveries: number;
  pincodeRtoCount: number;
  pincodeRtoRate: number | null;
  pincodeDeliveryRate: number | null;
  pincodeSampleSize: number;

  // ── Regional Fallback ──
  regionalOrderCount: number;
  regionalCodOrderCount: number;
  regionalRtoCount: number;
  regionalRtoRate: number | null;
  regionalSampleSize: number;

  // ── Merchant Baseline ──
  merchantHistoricalOrderCount: number;
  merchantCodOrderCount: number;
  merchantCodRtoCount: number;
  merchantCodRtoRate: number | null;
  merchantAverageOrderValue: number | null;
  merchantAverageMargin: number | null;
  merchantAverageRtoLoss: number | null;

  // ── Financial Inputs ──
  cogs: number;
  customerPaidShipping: number;
  forwardShippingCost: number;
  returnShippingCost: number;
  packagingCost: number;
  codFee: number;
  paymentFee: number;
  allocatedAdCost: number | null;

  // ── Derived Margin Features ──
  grossMarginBeforeShipping: number;
  grossMarginPct: number | null;
  contributionMarginBeforeAds: number;

  // ── RTO Loss Inputs ──
  estimatedRtoLossInputs: {
    forwardShipping: number;
    returnShipping: number;
    packaging: number;
    codFee: number;
    paymentFee: number;
    cogs: number;
    customerPaidShipping: number;
  };

  // ── Address Completeness ──
  addressCompletenessScore: number | null;

  // ── State / Province ──
  province: string | null;
}

export interface OrderFeatureSources {
  cogs: "ORDER_SNAPSHOT" | "VARIANT_MANUAL" | "VARIANT_NATIVE" | "PRODUCT_MANUAL" | "PRODUCT_NATIVE" | "PRODUCT_STORED" | "MERCHANT_DEFAULT";
  shipping: "ACTUAL" | "WEIGHT_SLAB" | "MERCHANT_DEFAULT";
  customerHistory: "TEMPORAL_QUERY" | "AGGREGATE_TABLE" | "NONE";
  pincodeHistory: "TEMPORAL_QUERY" | "AGGREGATE_TABLE" | "NONE";
  adCost: "ATTRIBUTED" | "MERCHANT_ESTIMATE" | "UNAVAILABLE";
}

// Extractor return types
export interface CustomerFeatures {
  customerOrderCount: number;
  customerCodOrderCount: number;
  customerPrepaidOrderCount: number;
  customerDeliveredCount: number;
  customerRtoCount: number;
  customerCancellationCount: number;
  customerRtoRate: number | null;
  customerAov: number | null;
  customerLifetimeSpend: number | null;
  isNewCustomer: boolean;
  daysSinceLastOrder: number | null;
  customerAgeDays: number | null;
  repeatPurchaseGap: number | null;
  source: OrderFeatureSources["customerHistory"];
  warnings: FeatureWarning[];
}

export interface PincodeFeatures {
  pincodeOrderCount: number;
  pincodeCodOrderCount: number;
  pincodeSuccessfulDeliveries: number;
  pincodeRtoCount: number;
  pincodeRtoRate: number | null;
  pincodeDeliveryRate: number | null;
  pincodeSampleSize: number;
}

export interface RegionalFeatures {
  regionalOrderCount: number;
  regionalCodOrderCount: number;
  regionalRtoCount: number;
  regionalRtoRate: number | null;
  regionalSampleSize: number;
}

export interface PincodeFeatureResult extends PincodeFeatures, RegionalFeatures {
  source: OrderFeatureSources["pincodeHistory"];
  warnings: FeatureWarning[];
}

export interface MerchantBaselineFeatures {
  merchantHistoricalOrderCount: number;
  merchantCodOrderCount: number;
  merchantCodRtoCount: number;
  merchantCodRtoRate: number | null;
  merchantAverageOrderValue: number | null;
  merchantAverageMargin: number | null;
  merchantAverageRtoLoss: number | null;
}

export interface FinancialFeatures {
  grossOrderValue: number;
  netOrderValue: number;
  subtotal: number;
  shippingCharged: number;
  tax: number;
  discountAmount: number;
  discountPercentage: number | null;
  cogs: number;
  customerPaidShipping: number;
  forwardShippingCost: number;
  returnShippingCost: number;
  packagingCost: number;
  codFee: number;
  paymentFee: number;
  allocatedAdCost: number | null;
  sources: {
    cogs: OrderFeatureSources["cogs"];
    shipping: OrderFeatureSources["shipping"];
    adCost: OrderFeatureSources["adCost"];
  };
  warnings: FeatureWarning[];
}

export interface DerivedMarginFeatures {
  grossMarginBeforeShipping: number;
  grossMarginPct: number | null;
  contributionMarginBeforeAds: number;
}

export interface RtoLossInputs {
  estimatedRtoLossInputs: {
    forwardShipping: number;
    returnShipping: number;
    packaging: number;
    codFee: number;
    paymentFee: number;
    cogs: number;
    customerPaidShipping: number;
  };
}

export interface FinancialFeatureResult extends FinancialFeatures, DerivedMarginFeatures, RtoLossInputs {}
