import { PipelineStep } from "../../pipeline/pipeline.interface";
import { ExecutionContext } from "../../../infrastructure/context/execution.context";
import { OrderPipelineData } from "../order-pipeline.types";
import { OrderFeatureService } from "../../../services/order-features/order-feature.service";

export class FeatureStep implements PipelineStep<OrderPipelineData> {
  name = "FeatureExtraction";

  async execute(context: ExecutionContext, data: OrderPipelineData): Promise<OrderPipelineData> {
    const features = OrderFeatureService.extractFeatures(data.rawOrder);
    return { ...data, features };
  }
}
