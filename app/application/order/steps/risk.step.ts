import { PipelineStep } from "../../pipeline/pipeline.interface";
import { ExecutionContext } from "../../../infrastructure/context/execution.context";
import { OrderPipelineData } from "../order-pipeline.types";
import { RTORiskService } from "../../../services/rto-risk/rto-risk.service";

export class RiskStep implements PipelineStep<OrderPipelineData> {
  name = "RtoRiskScoring";

  async execute(context: ExecutionContext, data: OrderPipelineData): Promise<OrderPipelineData> {
    if (!data.features) throw new Error("Missing features");
    const riskResult = await RTORiskService.evaluateOrder(data.rawOrder, data.features);
    return { ...data, riskScore: riskResult.score };
  }
}
