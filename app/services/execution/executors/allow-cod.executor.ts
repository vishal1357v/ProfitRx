import { ExecutionContext, ExecutionResult } from "../types";
import { ActionExecutor } from "./executor.interface";
import { ShopifyService } from "../../shopify.service";

export class AllowCodExecutor implements ActionExecutor {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = performance.now();
    let providerLatencyMs = 0;

    // In automated processing, ALLOW_COD requires no order mutation (safe no-op)
    if (context.trigger !== "MANUAL" && !(context.decision as any)?.isOverride) {
      return {
        success: true,
        action: "ALLOW_COD",
        status: "SKIPPED",
        provider: "ShopifyAdminGraphQL",
        retryable: false,
        timestamp: new Date(),
        message: "No action required for automated ALLOW_COD.",
        metrics: {
          executionTimeMs: performance.now() - startTime,
          retryCount: 0,
          providerLatencyMs: 0,
        },
      };
    }

    try {
      const providerStart = performance.now();
      // For manual reversals / overrides, actively remove any restriction tags
      const untagResult = await ShopifyService.untagOrder(
        context.shop,
        context.orderId,
        ["ProfitRx-COD-Blocked", "ProfitRx-Prepaid-Required"]
      );
      providerLatencyMs = performance.now() - providerStart;

      return {
        success: untagResult.success,
        action: "ALLOW_COD",
        status: untagResult.success ? "DELIVERED" : "FAILED",
        provider: "ShopifyAdminGraphQL",
        retryable: !untagResult.success,
        timestamp: new Date(),
        message: untagResult.success
          ? "Lifted COD block; removed restriction tags on Shopify Admin."
          : "Failed to remove restriction tags on Shopify Admin.",
        metrics: {
          executionTimeMs: performance.now() - startTime,
          retryCount: 0,
          providerLatencyMs,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        action: "ALLOW_COD",
        status: "FAILED",
        provider: "ShopifyAdminGraphQL",
        retryable: true,
        errorCode: "SHOPIFY_MUTATION_FAILED",
        timestamp: new Date(),
        message: `ALLOW_COD tag reversal failed: ${err.message || "Unknown error"}`,
        metrics: {
          executionTimeMs: performance.now() - startTime,
          retryCount: 0,
          providerLatencyMs: performance.now() - startTime,
        },
      };
    }
  }
}
