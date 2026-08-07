import { ExecutionResult } from "../../types";
import { ExecutionLogger } from "./execution.logger";

export class MemoryExecutionLogger implements ExecutionLogger {
  public logs: Array<{ shop: string; orderId: string; action: string; result: ExecutionResult }> = [];

  async logExecution(shop: string, orderId: string, action: string, result: ExecutionResult): Promise<void> {
    this.logs.push({ shop, orderId, action, result });
    // In production, this pushes to a database or streaming service (Kafka, S3, etc)
    // without blocking the main thread execution excessively.
  }

  // Utility for testing
  _clear() {
    this.logs = [];
  }
}
