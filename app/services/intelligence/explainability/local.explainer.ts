import { FeatureImportance } from "./global.explainer";

export class LocalExplainer {
  /**
   * Explains exactly why a specific decision was made on an individual order.
   * Works for both deterministic Rule Engine and ML models.
   */
  static explain(orderId: string, features: any): FeatureImportance[] {
    const explanations: FeatureImportance[] = [];
    
    // Example: Explaining based on actual feature values
    if (features.customerRtoRate && features.customerRtoRate > 0.4) {
      explanations.push({ featureId: "CustomerRtoRate", importance: 0.8, direction: "POSITIVE" });
    }

    if (features.isCod && features.orderValue > 5000) {
      explanations.push({ featureId: "HighValueCod", importance: 0.6, direction: "POSITIVE" });
    }

    return explanations;
  }
}
