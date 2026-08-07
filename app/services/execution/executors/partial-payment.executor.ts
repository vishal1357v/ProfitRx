import { ExecutionContext, ExecutionResult } from "../types";
import { ActionExecutor } from "./executor.interface";

export class PartialPaymentExecutor implements ActionExecutor {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = performance.now();

    // Partial Payment requires complex Shopify Draft Order generation
    // For this phase, we act as an advisory or simulation
    return {
      success: true,
      action: "PARTIAL_PAYMENT",
      status: "ADVISORY_ONLY", // Important distinction from SENT
      provider: "ShopifyIntegration",
      retryable: false,
      timestamp: new Date(),
      message: "Partial payment recommended. Automation not yet configured in Shopify.",
      metrics: {
        executionTimeMs: performance.now() - startTime,
        retryCount: 0,
        providerLatencyMs: 0
      }
    };
  }
}
