import { ExecutionContext, ExecutionResult } from "../types";
import { ActionExecutor } from "./executor.interface";
import { ShopifyService } from "../../shopify.service";

export class CodBlockExecutor implements ActionExecutor {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = performance.now();
    let providerLatencyMs = 0;

    try {
      const providerStart = performance.now();
      const tagResult = await ShopifyService.tagOrder(context.shop, context.orderId, "ProfitRx-COD-Blocked");
      providerLatencyMs = performance.now() - providerStart;

      if (!tagResult.success) {
        return {
          success: false,
          action: "BLOCK_COD",
          status: "FAILED",
          provider: "ShopifyAdminGraphQL",
          retryable: true,
          errorCode: "SHOPIFY_MUTATION_FAILED",
          timestamp: new Date(),
          message: "Failed to tag order as ProfitRx-COD-Blocked on Shopify Admin.",
          metrics: {
            executionTimeMs: performance.now() - startTime,
            retryCount: 0,
            providerLatencyMs,
          },
        };
      }

      return {
        success: true,
        action: "BLOCK_COD",
        status: "DELIVERED",
        provider: "ShopifyAdminGraphQL",
        retryable: false,
        timestamp: new Date(),
        message: "Order tagged as ProfitRx-COD-Blocked on Shopify Admin.",
        metrics: {
          executionTimeMs: performance.now() - startTime,
          retryCount: 0,
          providerLatencyMs,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        action: "BLOCK_COD",
        status: "FAILED",
        provider: "ShopifyAdminGraphQL",
        retryable: true,
        errorCode: "SHOPIFY_MUTATION_FAILED",
        timestamp: new Date(),
        message: `COD block tagging failed: ${err.message || "Unknown error"}`,
        metrics: {
          executionTimeMs: performance.now() - startTime,
          retryCount: 0,
          providerLatencyMs: performance.now() - startTime,
        },
      };
    }
  }
}
