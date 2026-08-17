import { PipelineStep } from "../../pipeline/pipeline.interface";
import { ExecutionContext } from "../../../infrastructure/context/execution.context";
import { OrderPipelineData } from "../order-pipeline.types";
import { ExpectedValueService } from "../../../services/expected-value/expected-value.service";

export class ExpectedValueStep implements PipelineStep<OrderPipelineData> {
  name = "ExpectedValueCalculation";

  async execute(context: ExecutionContext, data: OrderPipelineData): Promise<OrderPipelineData> {
    if (data.riskScore === undefined) throw new Error("Missing risk score");
    
    // Pass mock config since we moved persistence out
    const config = { 
      averageCogsPercentage: 40, 
      forwardShippingCost: 100, 
      reverseShippingCost: 100, 
      otpCost: 2,
      inventoryRecoveryRate: 0.9,
      refundsShippingOnRTO: false,
      chargesCodFeeOnRTO: false,
      includesAdCost: false
    };
    
    const featureResult = { features: data.features || {} } as any;
    const riskResult = data.riskResult || ({ probability: (data.riskScore || 0) / 100, confidence: data.confidence || 0.85 } as any);
    
    const evResult = ExpectedValueService.calculate(featureResult, riskResult, config);
    return { ...data, expectedValue: evResult.expectedValue, expectedValueResult: evResult };
  }
}
