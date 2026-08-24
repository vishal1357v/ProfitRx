export type ShippingSource = "MERCHANT_CONFIGURED" | "WEIGHT_SLAB" | "ESTIMATED" | "FALLBACK";

export interface WeightSlab {
  maxWeightGrams: number;
  forwardCost: number;
  returnCost: number;
}

export interface ShippingCalculationParams {
  weightGrams?: number | null;
  shippingSlabs?: WeightSlab[] | null;
  defaultForwardShipping?: number | null;
  defaultReturnShipping?: number | null;
  actualShippingCost?: number | null;
  zone?: string | null;
}

export interface ShippingCalculationResult {
  forwardShippingCost: number;
  returnShippingCost: number;
  source: ShippingSource;
  isWeightBased: boolean;
  warnings: string[];
}
