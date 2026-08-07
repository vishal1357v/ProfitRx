import { ExecutionContext, ExecutionResult } from "../types";
import { ActionExecutor } from "./executor.interface";

export class AllowCodExecutor implements ActionExecutor {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = performance.now();

    // Allow COD requires no active intervention
    return {
      success: true,
      action: "ALLOW_COD",
      status: "SKIPPED",
      provider: "N/A",
      retryable: false,
      timestamp: new Date(),
      message: "No action required for ALLOW_COD.",
      metrics: {
        executionTimeMs: performance.now() - startTime,
        retryCount: 0,
        providerLatencyMs: 0
      }
    };
  }
}
