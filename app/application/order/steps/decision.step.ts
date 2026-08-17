import { PipelineStep } from "../../pipeline/pipeline.interface";
import { ExecutionContext } from "../../../infrastructure/context/execution.context";
import { OrderPipelineData } from "../order-pipeline.types";
import { DecisionService } from "../../../services/decision-engine/decision.service";
import { SettingsRepository } from "../../../infrastructure/repositories/settings.repository";
import {
  ActionType,
  DecisionResult,
  MerchantDecisionSettings,
  MerchantInterventionSettings,
} from "../../../services/decision-engine/types";
import { FinancialAssumptions } from "../../../services/expected-value/types";

export class DecisionStep implements PipelineStep<OrderPipelineData> {
  name = "DecisionEngine";

  async execute(context: ExecutionContext, data: OrderPipelineData): Promise<OrderPipelineData> {
    if (data.riskScore === undefined || data.expectedValue === undefined) {
      throw new Error("Missing risk or EV");
    }

    // 1. Read merchant config from repo
    const policy = await SettingsRepository.getMerchantPolicy(context.shopId);

    // 2. Evaluate Hard Rules
    const rawOrder = data.rawOrder || {};
    const orderValue = parseFloat(
      String(rawOrder.total_price || rawOrder.totalPrice || rawOrder.totalPriceSet?.shopMoney?.amount || "0")
    );
    const isHighValue = orderValue > policy.blockCodAboveValue || orderValue > policy.requirePrepaidAboveValue;

    const zip =
      rawOrder.shipping_address?.zip ||
      rawOrder.shippingAddress?.zip ||
      data.features?.shippingPincode ||
      rawOrder.pincode;
    const isPincodeBlocked = Boolean(zip && policy.blockSpecificPincodes.includes(zip));

    const rtoCount = rawOrder.customerRtoCount || data.features?.customerRtoCount || 0;
    const isRepeatOffender = policy.autoFlagRepeatOffenders && rtoCount >= 2;

    let finalDecision: ActionType = "ALLOW_COD";
    let decisionResult: DecisionResult | undefined = undefined;

    if (isPincodeBlocked) {
      finalDecision = "BLOCK_COD";
    } else if (isHighValue) {
      finalDecision = orderValue > policy.blockCodAboveValue ? "BLOCK_COD" : "PREPAID_ONLY";
    } else if (isRepeatOffender) {
      finalDecision = policy.autoRequireOtp ? "OTP_VERIFY" : "BLOCK_COD";
    } else {
      // 3. Probabilistic EV Evaluation via DecisionService
      const featureResult = {
        features: data.features || {},
        metadata: data.metadata || { orderId: context.orderId || "", shop: context.shopId },
      } as any;

      const riskResult = data.riskResult || ({
        probability: data.riskScore / 100,
        riskLevel: data.riskScore >= 70 ? "CRITICAL" : data.riskScore >= 50 ? "HIGH" : data.riskScore >= 30 ? "MEDIUM" : "LOW",
        confidence: data.confidence ?? 0.85,
        topFactors: [],
        metadata: { modelVersion: "v1", calculationTimeMs: 0 },
      } as any);

      const baselineExpectedValueResult = data.expectedValueResult || ({
        expectedValue: data.expectedValue,
        expectedROI: 0,
        expectedLoss: 0,
        deliveryProbability: 1 - (data.riskScore / 100),
        rtoProbability: data.riskScore / 100,
        deliveredScenario: {} as any,
        rtoScenario: {} as any,
        assumptions: {} as any,
        metadata: {} as any,
      });

      const decisionSettings: MerchantDecisionSettings = {
        maxFriction: 8,
        minConfidence: 0.60,
      };

      const interventionSettings: MerchantInterventionSettings = {
        enabledActions: ["ALLOW_COD", "OTP_VERIFY", "WHATSAPP_VERIFY", "PARTIAL_PAYMENT", "PREPAID_ONLY", "BLOCK_COD"],
        preferredAdvanceAmount: 100,
        otpCost: 2,
        otpConversionMultiplier: 0.95,
        otpRiskMultiplier: 0.5,
        whatsappCost: 1,
        whatsappConversionMultiplier: 0.95,
        whatsappRiskMultiplier: 0.6,
        partialPaymentCost: 0,
        partialPaymentConversionMultiplier: 0.85,
        partialPaymentRiskMultiplier: 0.4,
      };

      const financialAssumptions: FinancialAssumptions = {
        inventoryRecoveryRate: 0.9,
        refundsShippingOnRTO: false,
        chargesCodFeeOnRTO: false,
        includesAdCost: false,
      };

      decisionResult = DecisionService.evaluate(
        featureResult,
        riskResult,
        baselineExpectedValueResult,
        decisionSettings,
        interventionSettings,
        financialAssumptions
      );

      finalDecision = decisionResult.recommendedAction;
    }

    if (!decisionResult) {
      decisionResult = {
        recommendedAction: finalDecision,
        baselineExpectedValue: data.expectedValue,
        recommendedExpectedValue: data.expectedValue,
        expectedProfitIncrease: 0,
        riskBefore: (data.riskScore || 0) / 100,
        riskAfter: (data.riskScore || 0) / 100,
        confidenceBefore: data.confidence ?? 0.85,
        confidenceAfter: data.confidence ?? 0.85,
        evaluatedActions: [],
        reasoning: [
          {
            code: isPincodeBlocked ? "PINCODE_BLOCKED" : isHighValue ? "HIGH_VALUE_RULE" : "REPEAT_OFFENDER_RULE",
            severity: "CRITICAL",
            message: `Hard rule override triggered: ${finalDecision}`,
          },
        ],
        metadata: {
          decisionVersion: "hard-rule-v1",
          calculationDate: new Date(),
        },
      };
    }

    return { ...data, finalDecision, decisionResult };
  }
}

