import { ExperimentAssignment } from "../types";
import { ExperimentRegistry } from "./experiment.registry";
import crypto from "crypto";

export class AssignmentService {
  /**
   * Deterministically assigns a variant based on a hash of the order ID and experiment ID.
   * This guarantees that if a request is retried, the assignment remains identical.
   */
  static assign(orderId: string): ExperimentAssignment | null {
    const activeExperiments = ExperimentRegistry.getActiveExperiments();
    if (activeExperiments.length === 0) return null;

    // For simplicity, we just pick the first active experiment to evaluate
    const experiment = activeExperiments[0];

    // Check traffic allocation
    const allocationHash = this.hashMod(`${orderId}-allocation-${experiment.id}`, 100);
    if (allocationHash > experiment.trafficAllocation * 100) {
      return null; // Not in the experiment
    }

    // Determine variant based on weights
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    const variantHash = this.hashMod(`${orderId}-variant-${experiment.id}`, totalWeight);

    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += variant.weight;
      if (variantHash < cumulative) {
        return {
          experimentId: experiment.id,
          variantId: variant.id,
          assignedAction: variant.action
        };
      }
    }

    return null; // Failsafe
  }

  private static hashMod(input: string, mod: number): number {
    const hash = crypto.createHash("md5").update(input).digest("hex");
    return parseInt(hash.substring(0, 8), 16) % mod;
  }
}
