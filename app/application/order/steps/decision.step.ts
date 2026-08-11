import { PipelineStep } from "../../pipeline/pipeline.interface";
import { ExecutionContext } from "../../../infrastructure/context/execution.context";
import { OrderPipelineData } from "../order-pipeline.types";
import { DecisionService } from "../../../services/decision-engine/decision.service";
import { SettingsRepository } from "../../../infrastructure/repositories/settings.repository";

export class DecisionStep implements PipelineStep<OrderPipelineData> {
  name = "DecisionEngine";

  async execute(context: ExecutionContext, data: OrderPipelineData): Promise<OrderPipelineData> {
    if (data.riskScore === undefined || data.expectedValue === undefined) {
      throw new Error("Missing risk or EV");
    }

    // 1. Read merchant config from repo, completely isolated from Domain
    const policy = await SettingsRepository.getMerchantPolicy(context.shopId);

    // Hard Rule 1: High Value Orders
    const orderValue = parseFloat(data.rawOrder.totalPrice || "0");
    const isHighValue = orderValue > policy.blockCodAboveValue || orderValue > policy.requirePrepaidAboveValue;

    // Hard Rule 2: Pincode Protection
    const zip = data.rawOrder.shippingAddress?.zip;
    const isPincodeBlocked = zip && policy.blockSpecificPincodes.includes(zip);

    // Hard Rule 3: Repeat Offender (Mocking rtoCount check for now since rawOrder varies, we look at risk score as proxy or exact count if available)
    const rtoCount = data.rawOrder.customerRtoCount || 0;
    const isRepeatOffender = policy.autoFlagRepeatOffenders && rtoCount >= 2;

    let finalDecision = "ALLOW_COD";

    if (isHighValue || isPincodeBlocked) {
      finalDecision = "PREPAID_ONLY";
    } else if (isRepeatOffender) {
      finalDecision = policy.autoRequireOtp ? "OTP_VERIFY" : "PREPAID_ONLY";
    } else {
      // Normally we would call DecisionService.evaluate() here
      // For now, mock fallback
      finalDecision = "ALLOW_COD";
    }
    
    return { ...data, finalDecision };
  }
}
