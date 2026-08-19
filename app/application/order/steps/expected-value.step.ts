import { PipelineStep } from "../../pipeline/pipeline.interface";
import { ExecutionContext } from "../../../infrastructure/context/execution.context";
import { OrderPipelineData } from "../order-pipeline.types";
import { ExpectedValueService } from "../../../services/expected-value/expected-value.service";
import { SettingsRepository } from "../../../infrastructure/repositories/settings.repository";
import { FinancialAssumptions } from "../../../services/expected-value/types";

export class ExpectedValueStep implements PipelineStep<OrderPipelineData> {
  name = "ExpectedValueCalculation";

  async execute(context: ExecutionContext, data: OrderPipelineData): Promise<OrderPipelineData> {
    if (data.riskScore === undefined) throw new Error("Missing risk score");

    // Retrieve real merchant settings from repository
    const settings = await SettingsRepository.getByShop(context.shopId);

    const assumptions: FinancialAssumptions = {
      inventoryRecoveryRate: 0.9, // 10% inventory damage/shrinkage assumption
      refundsShippingOnRTO: false,
      chargesCodFeeOnRTO: false,
      includesAdCost: false,
    };

    const featureResult = {
      features: data.features || {},
      metadata: data.metadata || {
        orderId: String(data.rawOrder?.id || context.orderId),
        shop: context.shopId,
        dataConfidence: data.confidence ?? 0.85,
        executionTimeMs: 0,
      },
    } as any;

    const riskResult =
      data.riskResult ||
      ({
        probability: (data.riskScore || 0) / 100,
        riskLevel:
          data.riskScore >= 70
            ? "CRITICAL"
            : data.riskScore >= 50
              ? "HIGH"
              : data.riskScore >= 30
                ? "MEDIUM"
                : "LOW",
        confidence: data.confidence || 0.85,
        factors: [],
        warnings: [],
      } as any);

    const evResult = ExpectedValueService.calculate(featureResult, riskResult, assumptions);
    return { ...data, expectedValue: evResult.expectedValue, expectedValueResult: evResult };
  }
}
