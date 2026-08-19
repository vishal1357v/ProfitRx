import { ExecutionContext, ExecutionResult } from "../types";
import { ActionExecutor } from "./executor.interface";
import { ShopifyService } from "../../shopify.service";

export class PrepaidExecutor implements ActionExecutor {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = performance.now();
    let providerLatencyMs = 0;

    try {
      const providerStart = performance.now();
      const tagResult = await ShopifyService.tagOrder(context.shop, context.orderId, "ProfitRx-Prepaid-Required");
      providerLatencyMs = performance.now() - providerStart;

      if (!tagResult.success) {
        return {
          success: false,
          action: "PREPAID_ONLY",
          status: "FAILED",
          provider: "ShopifyAdminGraphQL",
          retryable: true,
          errorCode: "SHOPIFY_MUTATION_FAILED",
          timestamp: new Date(),
          message: "Failed to tag order as ProfitRx-Prepaid-Required on Shopify Admin.",
          metrics: {
            executionTimeMs: performance.now() - startTime,
            retryCount: 0,
            providerLatencyMs,
          },
        };
      }

      return {
        success: true,
        action: "PREPAID_ONLY",
        status: "ADVISORY_ONLY",
        provider: "ShopifyAdminGraphQL",
        retryable: false,
        timestamp: new Date(),
        message: "Order tagged as ProfitRx-Prepaid-Required on Shopify Admin.",
        metrics: {
          executionTimeMs: performance.now() - startTime,
          retryCount: 0,
          providerLatencyMs,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        action: "PREPAID_ONLY",
        status: "FAILED",
        provider: "ShopifyAdminGraphQL",
        retryable: true,
        errorCode: "SHOPIFY_MUTATION_FAILED",
        timestamp: new Date(),
        message: `Prepaid tagging failed: ${err.message || "Unknown error"}`,
        metrics: {
          executionTimeMs: performance.now() - startTime,
          retryCount: 0,
          providerLatencyMs: performance.now() - startTime,
        },
      };
    }
  }
}
