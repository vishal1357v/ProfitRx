import { Intervention, InterventionEffect, MerchantInterventionSettings } from "../types";
import { OrderFeatureResult } from "../../order-features/types";
import { RTORiskResult } from "../../rto-risk/types";

export class OtpVerifyAction implements Intervention {
  type = "OTP_VERIFY";
  frictionScore = 4; // Medium friction

  isAvailable(settings: MerchantInterventionSettings): boolean {
    return settings.enabledActions.includes(this.type);
  }

  getEffect(
    featureResult: OrderFeatureResult,
    riskResult: RTORiskResult,
    settings: MerchantInterventionSettings
  ): InterventionEffect {
    return {
      riskMultiplier: settings.otpRiskMultiplier,
      confidenceMultiplier: 1.2, // SMS verification gives higher confidence of intent
      conversionMultiplier: settings.otpConversionMultiplier,
      extraCost: settings.otpCost,
      explanation: [
        {
          code: "OTP_EFFECT",
          severity: "INFO",
          message: `OTP verification costs ₹${settings.otpCost}, reduces risk by ${(1 - settings.otpRiskMultiplier) * 100}%, and reduces conversion by ${(1 - settings.otpConversionMultiplier) * 100}%.`
        }
      ]
    };
  }
}
