import { PipelineStep } from "../../pipeline/pipeline.interface";
import { ExecutionContext } from "../../../infrastructure/context/execution.context";
import { OrderPipelineData } from "../order-pipeline.types";
import { RTORiskService } from "../../../services/rto-risk/rto-risk.service";

export class RiskStep implements PipelineStep<OrderPipelineData> {
  name = "RtoRiskScoring";

  async execute(context: ExecutionContext, data: OrderPipelineData): Promise<OrderPipelineData> {
    if (!data.features) throw new Error("Missing features");
    const featureResult = {
      features: data.features,
      metadata: data.metadata || {
        orderId: data.features.orderId,
        shop: data.features.shop,
        dataConfidence: 0.95,
        executionTimeMs: 0,
      },
    } as any;
    const riskResult = RTORiskService.evaluate(featureResult);
    return {
      ...data,
      riskScore: riskResult.probability * 100,
      confidence: riskResult.confidence,
      riskResult,
    };
  }
}
