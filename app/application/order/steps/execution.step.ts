import { PipelineStep } from "../../pipeline/pipeline.interface";
import { ExecutionContext as PipelineContext } from "../../../infrastructure/context/execution.context";
import { OrderPipelineData } from "../order-pipeline.types";
import { ExecutionService } from "../../../services/execution/execution.service";
import { MemoryIdempotencyStore } from "../../../services/execution/persistence/idempotency/memory.idempotency-store";
import { PrismaExecutionLogger } from "../../../services/execution/persistence/logging/prisma.execution-logger";
import { ExecutionContext as ServiceExecutionContext } from "../../../services/execution/types";

// Singleton instances for execution lifecycle
const idempotencyStore = new MemoryIdempotencyStore();
const executionLogger = new PrismaExecutionLogger();
const executionService = new ExecutionService(idempotencyStore, executionLogger);

export class ExecutionStep implements PipelineStep<OrderPipelineData> {
  name = "ExecutionEngine";

  async execute(context: PipelineContext, data: OrderPipelineData): Promise<OrderPipelineData> {
    if (!data.finalDecision) throw new Error("Missing final decision");

    const rawOrder = data.rawOrder || {};
    const orderId = String(rawOrder.id || context.orderId || "");
    const shop = context.shopId;

    const customer = {
      id: String(rawOrder.customer?.id || ""),
      phone: rawOrder.customer?.phone || rawOrder.phone || rawOrder.shipping_address?.phone || undefined,
      email: rawOrder.customer?.email || rawOrder.email || undefined,
    };

    const decision = data.decisionResult || {
      recommendedAction: data.finalDecision,
      baselineExpectedValue: data.expectedValue || 0,
      recommendedExpectedValue: data.expectedValue || 0,
      expectedProfitIncrease: 0,
      riskBefore: (data.riskScore || 0) / 100,
      riskAfter: (data.riskScore || 0) / 100,
      confidenceBefore: data.confidence ?? 0.85,
      confidenceAfter: data.confidence ?? 0.85,
      evaluatedActions: [],
      reasoning: [],
      metadata: {
        decisionVersion: "pipeline-v1",
        calculationDate: new Date(),
      },
    };

    const execContext: ServiceExecutionContext = {
      shop,
      orderId,
      decision,
      customer,
      merchantSettings: {
        maxFriction: 8,
        minConfidence: 0.6,
      },
      trigger: "WEBHOOK",
    };

    const result = await executionService.executeDecision(execContext);

    console.log(
      `[ExecutionStep] Executed ${data.finalDecision} for order ${orderId}: status=${result.status}, success=${result.success}, provider=${result.provider}`
    );

    return {
      ...data,
      executionStatus: result.success ? "SUCCESS" : "FAILED",
    };
  }
}

