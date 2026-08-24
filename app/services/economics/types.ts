import { ShippingSource, WeightSlab } from "../shipping/types";

export type FinancialValueState = "ACTUAL" | "ESTIMATED" | "EXPECTED" | "INCOMPLETE";

export interface FinancialMetric {
  value: number;
  state: FinancialValueState;
  source: string;
}

export interface OrderEconomicsInput {
  orderId?: string;
  shop?: string;
  isCOD: boolean;
  
  // Prices & charges
  grossOrderValue: number; // total price paid by customer
  subtotalPrice?: number;
  customerPaidShipping?: number;
  totalTax?: number;
  discountAmount?: number;

  // COGS
  actualSkuCogs?: number | null; // direct SKU COGS or snapshot
  defaultCogsPct?: number | null; // merchant fallback %
  
  // Shipping & Logistics
  weightGrams?: number | null;
  shippingSlabs?: WeightSlab[] | null;
  actualShippingCost?: number | null;
  defaultForwardShipping?: number | null;
  defaultReturnShipping?: number | null;
  defaultPackagingCost?: number | null;

  // Fees & Payment
  defaultCodHandlingFee?: number | null;
  defaultGatewayFeePct?: number | null;
  gatewayFixedFee?: number | null;
  shopifyPlanName?: string | null;

  // Probabilities (for EV)
  rtoProbability?: number; // 0.0 to 1.0 (e.g. from RTORiskService)
  
  // Assumptions
  inventoryRecoveryRate?: number; // default 0.9 (10% inventory damage/shrinkage)
  refundsShippingOnRTO?: boolean;
  chargesCodFeeOnRTO?: boolean;
  includesAdCost?: boolean;
  allocatedAdCost?: number | null;
}

export interface OrderEconomicsResult {
  // Revenue & Breakdown
  revenue: FinancialMetric;
  customerPaidShipping: FinancialMetric;
  tax: FinancialMetric;

  // Costs
  cogs: FinancialMetric;
  forwardShipping: FinancialMetric;
  returnShipping: FinancialMetric;
  packaging: FinancialMetric;
  codFee: FinancialMetric;
  gatewayFee: FinancialMetric;
  allocatedAdCost: FinancialMetric;

  // Scenarios
  deliveredProfit: FinancialMetric;
  rtoLossExposure: FinancialMetric;
  
  // Expected Value
  expectedValue: FinancialMetric;
  expectedROI: FinancialMetric;
  expectedLoss: FinancialMetric;

  // Probabilities
  deliveryProbability: number;
  rtoProbability: number;

  // Data Quality State
  dataCompleteness: {
    hasActualCogs: boolean;
    hasActualShipping: boolean;
    hasWeight: boolean;
    warnings: string[];
  };
}
