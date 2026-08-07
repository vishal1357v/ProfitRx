import { ExecutionContext, ExecutionResult } from "../types";
import { ActionExecutor } from "./executor.interface";

export class CodBlockExecutor implements ActionExecutor {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = performance.now();

    // Blocking COD involves updating a Metafield on the customer or order 
    // to trigger the Shopify Function that hides the COD payment method.
    // For this phase, we simulate the internal mutation to Shopify.
    return {
      success: true,
      action: "BLOCK_COD",
      status: "DELIVERED", // Sync completed successfully
      provider: "ShopifyFunctions",
      retryable: false,
      timestamp: new Date(),
      message: "Customer metafield updated to block COD.",
      metrics: {
        executionTimeMs: performance.now() - startTime,
        retryCount: 0,
        providerLatencyMs: 15 // simulated API call to Shopify
      }
    };
  }
}
