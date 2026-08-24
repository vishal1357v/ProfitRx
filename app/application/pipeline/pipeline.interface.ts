import { ExecutionContext } from "../../infrastructure/context/execution.context";
import prisma from "../../db.server";

export interface PipelineStep<TContext = any> {
  name: string;
  execute(context: ExecutionContext, pipelineData: TContext): Promise<TContext>;
}

export class Pipeline<TContext = any> {
  private steps: PipelineStep<TContext>[] = [];

  addStep(step: PipelineStep<TContext>) {
    this.steps.push(step);
  }

  async execute(executionContext: ExecutionContext, initialData: TContext): Promise<TContext> {
    let currentData = initialData;

    // Resolve matching Order ID to respect foreign key constraint
    let targetOrderId = executionContext.orderId ? String(executionContext.orderId) : null;
    if (targetOrderId) {
      const rawId = targetOrderId.replace("gid://shopify/Order/", "");
      const gid = targetOrderId.startsWith("gid://") ? targetOrderId : `gid://shopify/Order/${targetOrderId}`;
      const matchedOrder = await prisma.order.findFirst({
        where: {
          shop: executionContext.shopId,
          id: { in: [targetOrderId, rawId, gid] },
        },
        select: { id: true },
      });
      if (matchedOrder) {
        targetOrderId = matchedOrder.id;
      }
    }

    for (const step of this.steps) {
      try {
        currentData = await step.execute(executionContext, currentData);
        if (targetOrderId) {
          // Fire and forget logging
          prisma.executionLog
            .create({
              data: {
                shop: executionContext.shopId,
                orderId: targetOrderId,
                step: step.name,
                status: "SUCCESS",
              },
            })
            .catch((err) => {
              // Ignore orphaned log if order not yet committed
            });
        }
      } catch (err: any) {
        if (targetOrderId) {
          prisma.executionLog
            .create({
              data: {
                shop: executionContext.shopId,
                orderId: targetOrderId,
                step: step.name,
                status: "FAILED",
                message: err.message,
              },
            })
            .catch(() => {});
        }
        throw err;
      }
    }
    return currentData;
  }
}
