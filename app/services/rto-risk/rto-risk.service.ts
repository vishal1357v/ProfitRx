import { OrderFeatureResult } from "../order-features/types";
import { RTORiskProvider } from "./providers/rto-risk-provider";
import { RuleBasedRiskProvider } from "./providers/rule-based-risk.provider";
import { RTORiskResult } from "./types";
import { logInfo, logError } from "../../utils/logger";

export class RTORiskService {
  private static provider: RTORiskProvider = new RuleBasedRiskProvider();

  /**
   * Sets the risk provider (e.g. for swapping in an ML model later).
   */
  static setProvider(provider: RTORiskProvider) {
    this.provider = provider;
  }

  /**
   * Evaluates the deterministic RTO probability for an order, purely based on Phase 1 features.
   * NEVER queries the database.
   */
  static evaluate(featureResult: OrderFeatureResult): RTORiskResult {
    try {
      const startTime = performance.now();
      const result = this.provider.predict(featureResult);
      const endTime = performance.now();

      logInfo(`[RTORiskService] Evaluated risk for order ${featureResult.features.orderId} in ${(endTime - startTime).toFixed(2)}ms (Probability: ${result.probability}, Level: ${result.riskLevel})`);
      
      return result;
    } catch (error) {
      logError(`[RTORiskService] Failed to evaluate risk for order ${featureResult.features.orderId}:`, error);
      throw error;
    }
  }
}
