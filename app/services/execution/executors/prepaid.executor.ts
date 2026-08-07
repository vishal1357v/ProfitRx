import { ExecutionContext, ExecutionResult } from "../types";
import { ActionExecutor } from "./executor.interface";

export class PrepaidExecutor implements ActionExecutor {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = performance.now();

    // Requires converting order to Draft Order and emailing invoice
    return {
      success: true,
      action: "PREPAID_ONLY",
      status: "ADVISORY_ONLY", 
      provider: "ShopifyIntegration",
      retryable: false,
      timestamp: new Date(),
      message: "Prepaid conversion recommended. Automation not yet configured in Shopify.",
      metrics: {
        executionTimeMs: performance.now() - startTime,
        retryCount: 0,
        providerLatencyMs: 0
      }
    };
  }
}
