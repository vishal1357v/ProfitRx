import { ExecutionContext, ExecutionResult, ExecutionEvent } from "./types";
import { ExecutorRegistry } from "./registry/executor.registry";
import { RetryPolicy } from "./retry/retry-policy";
import { IdempotencyStore } from "./persistence/idempotency/idempotency.store";
import { ExecutionLogger } from "./persistence/logging/execution.logger";
import { ExecutionEventBus } from "./events/execution-event.bus";

export class ExecutionService {
  constructor(
    private idempotencyStore: IdempotencyStore,
    private executionLogger: ExecutionLogger
  ) {}

  async executeDecision(context: ExecutionContext): Promise<ExecutionResult> {
    const actionType = context.decision.recommendedAction;
    const idempotencyKey = `${context.shop}_${context.orderId}_${actionType}_${context.decision.metadata.decisionVersion}`;

    // 1. Idempotency Check
    if (await this.idempotencyStore.hasCompleted(idempotencyKey)) {
      const result: ExecutionResult = {
        success: true,
        action: actionType,
        status: "SKIPPED",
        provider: "IdempotencyStore",
        retryable: false,
        timestamp: new Date(),
        message: "Execution skipped. Already completed successfully.",
        metrics: { executionTimeMs: 0, retryCount: 0, providerLatencyMs: 0 }
      };
      
      ExecutionEventBus.emit({
        eventId: `${idempotencyKey}_skipped`,
        shop: context.shop,
        orderId: context.orderId,
        eventType: "EXECUTION_SKIPPED",
        timestamp: new Date(),
        payload: { reason: "Already completed" }
      });

      return result;
    }

    const lockAcquired = await this.idempotencyStore.acquireLock(idempotencyKey, 30000); // 30 sec lock
    if (!lockAcquired) {
      return {
        success: false,
        action: actionType,
        status: "IN_PROGRESS",
        provider: "IdempotencyStore",
        retryable: true,
        timestamp: new Date(),
        message: "Execution is already in progress.",
        metrics: { executionTimeMs: 0, retryCount: 0, providerLatencyMs: 0 }
      };
    }

    try {
      // 2. Resolve Executor (O(1))
      const executor = ExecutorRegistry.get(actionType);

      // 3. Execute with Retry
      const maxRetries = RetryPolicy.getMaxRetriesForAction(actionType);
      
      const result = await RetryPolicy.executeWithRetry(
        () => executor.execute(context),
        maxRetries
      );

      // 4. Log Audit Trail
      await this.executionLogger.logExecution(context.shop, context.orderId, actionType, result);

      // 5. Emit Analytics Event
      if (result.success) {
        await this.idempotencyStore.markCompleted(idempotencyKey);
        
        let eventType: ExecutionEvent["eventType"] = "EXECUTION_SKIPPED";
        if (actionType === "OTP_VERIFY") eventType = "OTP_SENT";
        else if (actionType === "WHATSAPP_VERIFY") eventType = "WHATSAPP_SENT";
        else if (actionType === "BLOCK_COD") eventType = "COD_BLOCKED";
        else if (actionType === "PARTIAL_PAYMENT") eventType = "PAYMENT_LINK_SENT";
        else if (actionType === "PREPAID_ONLY") eventType = "PREPAID_ONLY_APPLIED";
        else if (actionType === "ALLOW_COD") eventType = "ALLOW_COD_APPLIED";

        ExecutionEventBus.emit({
          eventId: `${idempotencyKey}_${Date.now()}`,
          shop: context.shop,
          orderId: context.orderId,
          eventType,
          timestamp: new Date(),
          payload: { action: actionType, result }
        });

      } else {
        await this.idempotencyStore.releaseLock(idempotencyKey);
        
        let eventType: ExecutionEvent["eventType"] = "EXECUTION_SKIPPED";
        if (actionType === "OTP_VERIFY") eventType = "OTP_FAILED";
        else if (actionType === "WHATSAPP_VERIFY") eventType = "WHATSAPP_FAILED";

        if (eventType !== "EXECUTION_SKIPPED") {
          ExecutionEventBus.emit({
            eventId: `${idempotencyKey}_failed_${Date.now()}`,
            shop: context.shop,
            orderId: context.orderId,
            eventType,
            timestamp: new Date(),
            payload: { action: actionType, error: result.errorCode }
          });
        }
      }

      return result;

    } catch (error) {
      // Failsafe catch
      await this.idempotencyStore.releaseLock(idempotencyKey);
      
      const result: ExecutionResult = {
        success: false,
        action: actionType,
        status: "FAILED",
        provider: "Internal",
        retryable: false,
        errorCode: "UNKNOWN_ERROR",
        timestamp: new Date(),
        message: error instanceof Error ? error.message : "Unknown execution error",
        metrics: { executionTimeMs: 0, retryCount: 0, providerLatencyMs: 0 }
      };

      await this.executionLogger.logExecution(context.shop, context.orderId, actionType, result);
      return result;
    }
  }
}
