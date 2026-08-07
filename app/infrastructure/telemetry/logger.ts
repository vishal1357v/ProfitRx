import { ExecutionContext } from "../context/execution.context";

export class TelemetryLogger {
  static info(context: ExecutionContext, message: string, data?: any) {
    console.log(`[INFO][${context.traceId}][${context.shopId}] ${message}`, data || "");
  }

  static error(context: ExecutionContext, message: string, error?: any) {
    console.error(`[ERROR][${context.traceId}][${context.shopId}] ${message}`, error || "");
  }
}
