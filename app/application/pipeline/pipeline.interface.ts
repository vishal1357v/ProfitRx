import { ExecutionContext } from "../../infrastructure/context/execution.context";

export interface PipelineStep<TContext = any> {
  name: string;
  execute(context: ExecutionContext, pipelineData: TContext): Promise<TContext>;
}

import prisma from "../../db.server";

export class Pipeline<TContext = any> {
  private steps: PipelineStep<TContext>[] = [];

  addStep(step: PipelineStep<TContext>) {
    this.steps.push(step);
  }

  async execute(executionContext: ExecutionContext, initialData: TContext): Promise<TContext> {
    let currentData = initialData;
    for (const step of this.steps) {
      try {
        currentData = await step.execute(executionContext, currentData);
        if (executionContext.orderId) {
          // Fire and forget logging
          prisma.executionLog.create({
            data: {
              shop: executionContext.shopId,
              orderId: executionContext.orderId.includes("gid://") ? executionContext.orderId : `gid://shopify/Order/${executionContext.orderId}`,
              step: step.name,
              status: "SUCCESS",
            }
          }).catch((err) => console.error("ExecutionLog error:", err.message));
        }
      } catch (err: any) {
        if (executionContext.orderId) {
          prisma.executionLog.create({
            data: {
              shop: executionContext.shopId,
              orderId: executionContext.orderId.includes("gid://") ? executionContext.orderId : `gid://shopify/Order/${executionContext.orderId}`,
              step: step.name,
              status: "FAILED",
              message: err.message
            }
          }).catch(console.error);
        }
        throw err;
      }
    }
    return currentData;
  }
}
