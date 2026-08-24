import { PipelineStep } from "../../pipeline/pipeline.interface";
import { ExecutionContext as PipelineContext } from "../../../infrastructure/context/execution.context";
import { OrderPipelineData } from "../order-pipeline.types";
import { ExecutionService } from "../../../services/execution/execution.service";
import { DatabaseIdempotencyStore } from "../../../services/execution/persistence/idempotency/database.idempotency-store";
import { PrismaExecutionLogger } from "../../../services/execution/persistence/logging/prisma.execution-logger";
import { ExecutionContext as ServiceExecutionContext } from "../../../services/execution/types";
import { SettingsRepository } from "../../../infrastructure/repositories/settings.repository";
import { ExecutionLogRepository } from "../../../infrastructure/repositories/execution-log.repository";

// Singleton instances for execution lifecycle
const idempotencyStore = new DatabaseIdempotencyStore();
const executionLogger = new PrismaExecutionLogger();
const executionService = new ExecutionService(idempotencyStore, executionLogger);

export class ExecutionStep implements PipelineStep<OrderPipelineData> {
  name = "ExecutionEngine";

  async execute(context: PipelineContext, data: OrderPipelineData): Promise<OrderPipelineData> {
    if (!data.finalDecision) throw new Error("Missing final decision");

    const rawOrder = data.rawOrder || {};
    const orderId = String(rawOrder.id || context.orderId || "");
    const shop = context.shopId;

    // 1. Fetch merchant protection mode (Beta Gate #5)
    const policy = await SettingsRepository.getMerchantPolicy(shop);
    const mode = policy.protectionMode || "OBSERVE";

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

    // 2. Handle OBSERVE mode: calculate recommendation only, never mutate Shopify
    if (mode === "OBSERVE") {
      await ExecutionLogRepository.createLog({
        shop,
        orderId,
        step: "EXECUTION",
        status: "ADVISORY_ONLY",
        message: `Protection Mode: OBSERVE. Recommendation generated: ${data.finalDecision}. No Shopify mutation performed.`,
        data: { decision, mode },
      });

      return {
        ...data,
        executionStatus: "ADVISORY_ONLY",
      };
    }

    // 3. Handle REVIEW mode: queue risky decisions for merchant approval
    if (mode === "REVIEW" && data.finalDecision !== "ALLOW_COD") {
      await ExecutionLogRepository.createLog({
        shop,
        orderId,
        step: "EXECUTION",
        status: "PENDING_MERCHANT_REVIEW",
        message: `Protection Mode: REVIEW. Action ${data.finalDecision} queued for merchant approval.`,
        data: { decision, mode },
      });

      return {
        ...data,
        executionStatus: "PENDING_MERCHANT_REVIEW",
      };
    }

    // 4. Handle ASSISTED mode: auto-verify medium risk, but queue BLOCK actions for approval
    if (mode === "ASSISTED" && data.finalDecision === "BLOCK_COD") {
      await ExecutionLogRepository.createLog({
        shop,
        orderId,
        step: "EXECUTION",
        status: "PENDING_MERCHANT_REVIEW",
        message: `Protection Mode: ASSISTED. Block action queued for merchant approval.`,
        data: { decision, mode },
      });

      return {
        ...data,
        executionStatus: "PENDING_MERCHANT_REVIEW",
      };
    }

    // 5. Execute action (AUTOMATED mode or non-blocked ASSISTED / safe REVIEW)
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


