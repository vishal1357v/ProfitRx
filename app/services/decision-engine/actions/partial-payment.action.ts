import { Intervention, InterventionEffect, MerchantInterventionSettings } from "../types";
import { OrderFeatureResult } from "../../order-features/types";
import { RTORiskResult } from "../../rto-risk/types";

export class PartialPaymentAction implements Intervention {
  type = "PARTIAL_PAYMENT";
  frictionScore = 7; // High friction, requires payment

  isAvailable(settings: MerchantInterventionSettings): boolean {
    return settings.enabledActions.includes(this.type);
  }

  getEffect(
    featureResult: OrderFeatureResult,
    riskResult: RTORiskResult,
    settings: MerchantInterventionSettings
  ): InterventionEffect {
    return {
      riskMultiplier: settings.partialPaymentRiskMultiplier,
      confidenceMultiplier: 1.5, // Significant intent shown by paying partial
      conversionMultiplier: settings.partialPaymentConversionMultiplier,
      extraCost: settings.partialPaymentCost,
      explanation: [
        {
          code: "PARTIAL_PAYMENT_EFFECT",
          severity: "WARNING",
          message: `Asking for ₹${settings.preferredAdvanceAmount} advance reduces risk by ${(1 - settings.partialPaymentRiskMultiplier) * 100}% but risks ${(1 - settings.partialPaymentConversionMultiplier) * 100}% of conversions.`
        }
      ]
    };
  }
}
