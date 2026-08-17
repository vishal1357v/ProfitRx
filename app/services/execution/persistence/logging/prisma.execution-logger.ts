import prisma from "../../../../db.server";
import { ExecutionResult } from "../../types";
import { ExecutionLogger } from "./execution.logger";

/**
 * Production execution logger that persists audit trails to PostgreSQL
 * via the ExecutionLog model. This replaces MemoryExecutionLogger for
 * the live webhook pipeline.
 */
export class PrismaExecutionLogger implements ExecutionLogger {
  async logExecution(
    shop: string,
    orderId: string,
    action: string,
    result: ExecutionResult
  ): Promise<void> {
    try {
      await prisma.executionLog.create({
        data: {
          shop,
          orderId,
          step: "EXECUTION",
          status: result.success ? "SUCCESS" : "FAILED",
          message: `[${action}] ${result.message}`,
          data: {
            action,
            provider: result.provider,
            status: result.status,
            retryable: result.retryable,
            errorCode: result.errorCode || null,
            metrics: result.metrics,
          },
        },
      });
    } catch (err) {
      // Logging failure must never crash the pipeline.
      // The execution itself already succeeded or failed independently.
      console.error(
        `[PrismaExecutionLogger] Failed to persist log for ${shop}/${orderId}/${action}:`,
        err
      );
    }
  }
}
