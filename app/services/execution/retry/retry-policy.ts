import { ExecutionResult } from "../types";

export class RetryPolicy {
  /**
   * Executes a function with exponential backoff if the result is retryable.
   */
  static async executeWithRetry(
    fn: () => Promise<ExecutionResult>,
    maxRetries: number,
    baseDelayMs: number = 100
  ): Promise<ExecutionResult> {
    let attempt = 0;
    let lastResult: ExecutionResult | null = null;
    let totalLatencyMs = 0;
    const startTime = performance.now();

    while (attempt <= maxRetries) {
      const iterStartTime = performance.now();
      lastResult = await fn();
      const iterLatency = performance.now() - iterStartTime;
      totalLatencyMs += iterLatency;

      if (lastResult.success || !lastResult.retryable) {
        lastResult.metrics.retryCount = attempt;
        lastResult.metrics.executionTimeMs = performance.now() - startTime;
        lastResult.metrics.providerLatencyMs = totalLatencyMs;
        return lastResult;
      }

      attempt++;
      if (attempt <= maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (lastResult) {
      lastResult.metrics.retryCount = attempt - 1;
      lastResult.metrics.executionTimeMs = performance.now() - startTime;
      lastResult.metrics.providerLatencyMs = totalLatencyMs;
      return lastResult;
    }
    
    throw new Error("Retry policy failed unexpectedly");
  }

  static getMaxRetriesForAction(action: string): number {
    switch (action) {
      case "OTP_VERIFY": return 3;
      case "WHATSAPP_VERIFY": return 2;
      case "BLOCK_COD": return 5; // Shopify API sync might be flaky
      case "PREPAID_ONLY": return 1;
      case "PARTIAL_PAYMENT": return 1;
      default: return 0;
    }
  }
}
