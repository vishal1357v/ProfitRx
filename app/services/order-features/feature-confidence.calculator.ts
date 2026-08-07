import { FeatureWarning, OrderFeatures, OrderFeatureSources } from "./types";

export interface ConfidenceInput {
  cogsSource: OrderFeatureSources["cogs"];
  customerOrderCount: number;
  hasCustomerId: boolean;
  pincodeSampleSize: number;
  hasRegionalHistory: boolean;
  shippingSource: OrderFeatureSources["shipping"];
  adCostSource: OrderFeatureSources["adCost"];
  features: Partial<OrderFeatures>;
}

/** All weights live here. Future ML can swap this without touching extractors. */
export class FeatureConfidenceCalculator {
  // Centralized weight configuration
  private static readonly WEIGHTS = {
    cogsQuality:       0.25,
    customerHistory:   0.25,
    pincodeHistory:    0.20,
    shippingQuality:   0.15,
    adCostAvailability: 0.05,
    orderCompleteness: 0.10,
  } as const;

  private static scoreCogsQuality(source: OrderFeatureSources["cogs"]): number {
    switch (source) {
      case "ORDER_SNAPSHOT": return 1.0;
      case "VARIANT_MANUAL":
      case "VARIANT_NATIVE":
      case "PRODUCT_MANUAL":
      case "PRODUCT_NATIVE":
      case "PRODUCT_STORED": return 0.7;
      case "MERCHANT_DEFAULT": return 0.3;
      default: return 0.0;
    }
  }

  private static scoreCustomerHistory(orderCount: number, hasCustomerId: boolean): number {
    if (!hasCustomerId) return 0.0;
    if (orderCount >= 5) return 1.0;
    if (orderCount >= 2) return 0.7;
    if (orderCount >= 1) return 0.3;
    return 0.0; // Brand new customer
  }

  private static scorePincodeHistory(sampleSize: number, hasRegional: boolean): number {
    if (sampleSize >= 10) return 1.0;
    if (sampleSize >= 5) return 0.7;
    if (sampleSize >= 1) return 0.5;
    if (hasRegional) return 0.3;
    return 0.0;
  }

  private static scoreShippingQuality(source: OrderFeatureSources["shipping"]): number {
    switch (source) {
      case "ACTUAL": return 1.0;
      case "WEIGHT_SLAB": return 0.7;
      case "MERCHANT_DEFAULT": return 0.5;
      default: return 0.0;
    }
  }

  private static scoreAdCost(source: OrderFeatureSources["adCost"]): number {
    switch (source) {
      case "ATTRIBUTED": return 1.0;
      case "MERCHANT_ESTIMATE": return 0.5;
      case "UNAVAILABLE": return 0.0;
      default: return 0.0;
    }
  }

  public static scoreOrderCompleteness(features: Partial<OrderFeatures>): number {
    let score = 0;
    let max = 0;

    const check = (value: any) => {
      max += 1;
      if (value !== null && value !== undefined && value !== "") {
        score += 1;
      }
    };

    check(features.pincode);
    check(features.customerId);
    check(features.province);
    // Add more completeness checks if needed, e.g. item weight

    return max > 0 ? score / max : 0;
  }

  /** Single entry point */
  static calculate(input: ConfidenceInput): number {
    const cogsScore = this.scoreCogsQuality(input.cogsSource) * this.WEIGHTS.cogsQuality;
    const customerScore = this.scoreCustomerHistory(input.customerOrderCount, input.hasCustomerId) * this.WEIGHTS.customerHistory;
    const pincodeScore = this.scorePincodeHistory(input.pincodeSampleSize, input.hasRegionalHistory) * this.WEIGHTS.pincodeHistory;
    const shippingScore = this.scoreShippingQuality(input.shippingSource) * this.WEIGHTS.shippingQuality;
    const adCostScore = this.scoreAdCost(input.adCostSource) * this.WEIGHTS.adCostAvailability;
    const completenessScore = this.scoreOrderCompleteness(input.features) * this.WEIGHTS.orderCompleteness;

    return cogsScore + customerScore + pincodeScore + shippingScore + adCostScore + completenessScore;
  }
}
