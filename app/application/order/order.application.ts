import { Pipeline } from "../pipeline/pipeline.interface";
import { OrderPipelineData } from "./order-pipeline.types";
import { ExecutionContext } from "../../infrastructure/context/execution.context";
import { FeatureStep } from "./steps/feature.step";
import { RiskStep } from "./steps/risk.step";
import { ExpectedValueStep } from "./steps/expected-value.step";
import { DecisionStep } from "./steps/decision.step";
import { ExecutionStep } from "./steps/execution.step";
import { EventBus } from "../../infrastructure/events/event.bus";
import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { SubscriptionRepository } from "../../infrastructure/repositories/subscription.repository";
import { ExecutionLogRepository } from "../../infrastructure/repositories/execution-log.repository";

export class OrderApplicationService {
  private static processingLocks = new Map<string, number>();

  /**
   * The single E2E entrypoint for processing an order.
   * Runs the strict pipeline and emits events.
   * Completely idempotent: duplicate webhooks for the same order are cleanly skipped.
   */
  static async processOrder(context: ExecutionContext, rawOrder: any): Promise<void> {
    const orderId = String(rawOrder?.id || context.orderId);
    const lockKey = `${context.shopId}:${orderId}:PROCESS_ORDER`;
    const now = Date.now();
    const activeLock = this.processingLocks.get(lockKey);
    if (activeLock && activeLock > now) {
      console.log(`[OrderApplicationService] Concurrency lock: order ${orderId} is currently being processed. Skipping concurrent execution.`);
      return;
    }
    this.processingLocks.set(lockKey, now + 30000); // 30s lock

    try {
      // 1. Check if order was already evaluated in database (Idempotency: duplicate webhooks cleanly skipped)
      const existingOrder = await OrderRepository.findById(context.shopId, orderId);
      if (existingOrder?.merchantRecommendation && existingOrder?.riskScore !== null) {
        console.log(`[OrderApplicationService] Order ${orderId} already evaluated (decision: ${existingOrder.merchantRecommendation}). Skipping duplicate processing.`);
        return;
      }

      // 2. Check Subscription Order Quota (BILL-01)
      const quota = await SubscriptionRepository.checkOrderQuota(context.shopId);
      if (quota.quotaExceeded) {
        console.warn(`[OrderApplicationService] Subscription order quota exceeded for ${context.shopId}: ${quota.ordersUsed}/${quota.orderLimit} on ${quota.plan} plan.`);

        // Ensure order is saved in DB so merchant data is never lost or corrupted
        const featureStep = new FeatureStep();
        await featureStep.execute(context, { rawOrder });

        await OrderRepository.updateDecision(context.shopId, orderId, {
          riskScore: null,
          riskLevel: "UNKNOWN",
          merchantRecommendation: "UPGRADE_REQUIRED",
        });

        await ExecutionLogRepository.createLog({
          shop: context.shopId,
          orderId,
          step: "PLAN_QUOTA",
          status: "LIMIT_EXCEEDED",
          message: `Monthly order limit of ${quota.orderLimit} orders reached on ${quota.plan} plan. Upgrade required to evaluate COD risk.`,
          data: {
            plan: quota.plan,
            orderLimit: quota.orderLimit,
            ordersUsed: quota.ordersUsed,
          },
        });

        return;
      }

      const pipeline = new Pipeline<OrderPipelineData>();

      pipeline.addStep(new FeatureStep());
      pipeline.addStep(new RiskStep());
      pipeline.addStep(new ExpectedValueStep());
      pipeline.addStep(new DecisionStep());
      pipeline.addStep(new ExecutionStep());

      const result = await pipeline.execute(context, { rawOrder });

      if (result.finalDecision) {
        const orderId = String(rawOrder?.id || context.orderId);
        await OrderRepository.updateDecision(context.shopId, orderId, {
          riskScore: result.riskScore !== undefined ? Math.round(result.riskScore) : null,
          riskLevel:
            result.riskResult?.riskLevel ||
            (result.riskScore && result.riskScore >= 70
              ? "CRITICAL"
              : result.riskScore && result.riskScore >= 50
                ? "HIGH"
                : result.riskScore && result.riskScore >= 30
                  ? "MEDIUM"
                  : "LOW"),
          merchantRecommendation: result.finalDecision,
        });

        // Increment order usage for the store exactly once upon successful evaluation (BILL-01)
        await SubscriptionRepository.recordOrderUsage(context.shopId, 1);

        // Event Bus Subscriptions completely abstract Outcome & Analytics persistence!
        await EventBus.publish({
          type: "DECISION_MADE",
          context,
          payload: {
            action: result.finalDecision,
            confidence: result.confidence ?? 0.85,
            expectedValue: result.expectedValue || 0,
            riskScore: result.riskScore || 0,
          },
        });

        await EventBus.publish({
          type: "EXECUTION_COMPLETED",
          context,
          payload: {
            action: result.finalDecision,
            success: result.executionStatus === "SUCCESS",
            provider: "SYSTEM",
          },
        });
      }
    } catch (error) {
      console.error(`[OrderPipeline] Failed for trace ${context.traceId}`, error);
      // Publish failure event for audit
      throw error;
    } finally {
      this.processingLocks.delete(lockKey);
    }
  }
}
