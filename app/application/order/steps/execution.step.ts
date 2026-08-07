import { PipelineStep } from "../../pipeline/pipeline.interface";
import { ExecutionContext } from "../../../infrastructure/context/execution.context";
import { OrderPipelineData } from "../order-pipeline.types";
import { ExecutionService } from "../../../services/execution/execution.service";

export class ExecutionStep implements PipelineStep<OrderPipelineData> {
  name = "ExecutionEngine";

  async execute(context: ExecutionContext, data: OrderPipelineData): Promise<OrderPipelineData> {
    if (!data.finalDecision) throw new Error("Missing final decision");
    
    // In real life, ExecutionService reads idempotency store, executes, and returns status
    // We mock execution
    console.log(`[ExecutionStep] Executing ${data.finalDecision} for order ${context.orderId}`);
    
    return { ...data, executionStatus: "SUCCESS" };
  }
}
