import { ExecutionContext, ExecutionResult } from "../types";
import { ActionExecutor } from "./executor.interface";
import { ShopifyService } from "../../shopify.service";

export class PartialPaymentExecutor implements ActionExecutor {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = performance.now();
    let providerLatencyMs = 0;

    try {
      const providerStart = performance.now();
      const tagResult = await ShopifyService.tagOrder(context.shop, context.orderId, "ProfitRx-Deposit-Required");
      providerLatencyMs = performance.now() - providerStart;

      return {
        success: true,
        action: "PARTIAL_PAYMENT",
        status: "ADVISORY_ONLY",
        provider: "ShopifyAdminGraphQL",
        retryable: false,
        timestamp: new Date(),
        message: tagResult.success
          ? "Order tagged as ProfitRx-Deposit-Required on Shopify Admin."
          : "Partial payment deposit recommended. Automation advisory recorded.",
        metrics: {
          executionTimeMs: performance.now() - startTime,
          retryCount: 0,
          providerLatencyMs,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        action: "PARTIAL_PAYMENT",
        status: "FAILED",
        provider: "ShopifyAdminGraphQL",
        retryable: true,
        errorCode: "SHOPIFY_MUTATION_FAILED",
        timestamp: new Date(),
        message: `Partial payment tagging failed: ${err.message || "Unknown error"}`,
        metrics: {
          executionTimeMs: performance.now() - startTime,
          retryCount: 0,
          providerLatencyMs: performance.now() - startTime,
        },
      };
    }
  }
}
