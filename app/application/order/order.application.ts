import { Pipeline } from "../pipeline/pipeline.interface";
import { OrderPipelineData } from "./order-pipeline.types";
import { ExecutionContext } from "../../infrastructure/context/execution.context";
import { FeatureStep } from "./steps/feature.step";
import { RiskStep } from "./steps/risk.step";
import { ExpectedValueStep } from "./steps/expected-value.step";
import { DecisionStep } from "./steps/decision.step";
import { ExecutionStep } from "./steps/execution.step";
import { EventBus } from "../../infrastructure/events/event.bus";

export class OrderApplicationService {
  /**
   * The single E2E entrypoint for processing an order.
   * Runs the strict pipeline and emits events.
   */
  static async processOrder(context: ExecutionContext, rawOrder: any): Promise<void> {
    const pipeline = new Pipeline<OrderPipelineData>();

    pipeline.addStep(new FeatureStep());
    pipeline.addStep(new RiskStep());
    pipeline.addStep(new ExpectedValueStep());
    pipeline.addStep(new DecisionStep());
    pipeline.addStep(new ExecutionStep());

    try {
      const result = await pipeline.execute(context, { rawOrder });

      // Event Bus Subscriptions completely abstract Outcome & Analytics persistence!
      if (result.finalDecision) {
        await EventBus.publish({
          type: "DECISION_MADE",
          context,
          payload: {
            action: result.finalDecision,
            confidence: result.confidence ?? 0.85,
            expectedValue: result.expectedValue || 0,
            riskScore: result.riskScore || 0,
          },
        });

        await EventBus.publish({
          type: "EXECUTION_COMPLETED",
          context,
          payload: {
            action: result.finalDecision,
            success: result.executionStatus === "SUCCESS",
            provider: "SYSTEM",
          },
        });
      }
    } catch (error) {
      console.error(`[OrderPipeline] Failed for trace ${context.traceId}`, error);
      // Publish failure event for audit
      throw error;
    }
  }
}
