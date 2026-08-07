import { ExecutionResult } from "../../types";

export interface ExecutionLogger {
  /**
   * Logs an execution attempt and its final result.
   */
  logExecution(
    shop: string,
    orderId: string,
    action: string,
    result: ExecutionResult
  ): Promise<void>;
}
