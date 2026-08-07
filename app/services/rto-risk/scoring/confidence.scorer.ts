import { SCORER_WEIGHTS } from "../weights";

export class ConfidenceScorer {
  /**
   * Calculates the overall confidence score purely from domain confidences and metadata.
   */
  static combine(
    customerConf: number,
    pincodeConf: number,
    merchantConf: number,
    orderConf: number,
    featureDataConfidence: number
  ): number {
    let totalWeight = 0;
    Object.values(SCORER_WEIGHTS).forEach(w => totalWeight += w);

    const combinedConfidence = (
      customerConf * SCORER_WEIGHTS.customer +
      pincodeConf * SCORER_WEIGHTS.pincode +
      merchantConf * SCORER_WEIGHTS.merchant +
      orderConf * SCORER_WEIGHTS.order
    ) / totalWeight;

    // Blend with Phase 1 data confidence
    return combinedConfidence * 0.7 + featureDataConfidence * 0.3;
  }
}
