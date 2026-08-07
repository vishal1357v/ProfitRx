export interface ExecutionContext {
  requestId: string;
  traceId: string;
  shopId: string;
  orderId?: string;
  timestamp: Date;
  pipelineVersion: string;
}

export class ExecutionContextFactory {
  static create(shopId: string, orderId?: string, traceId?: string): ExecutionContext {
    const timestamp = new Date();
    return {
      requestId: `req_${timestamp.getTime()}_${Math.random().toString(36).substring(2, 9)}`,
      traceId: traceId || `trace_${timestamp.getTime()}_${Math.random().toString(36).substring(2, 9)}`,
      shopId,
      orderId,
      timestamp,
      pipelineVersion: "1.0.0"
    };
  }
}
