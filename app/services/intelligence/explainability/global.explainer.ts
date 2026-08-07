export interface FeatureImportance {
  featureId: string;
  importance: number;
  direction: "POSITIVE" | "NEGATIVE";
}

export class GlobalExplainer {
  /**
   * Retrieves the precomputed top features across all models/rules for the last 30 days.
   */
  static getTopFeatures(): FeatureImportance[] {
    return [
      { featureId: "CustomerRtoRate", importance: 0.45, direction: "POSITIVE" },
      { featureId: "UnknownPincode", importance: 0.25, direction: "POSITIVE" },
      { featureId: "HighBasketValue", importance: 0.15, direction: "POSITIVE" },
      { featureId: "RepeatCustomer", importance: 0.35, direction: "NEGATIVE" }
    ];
  }
}
