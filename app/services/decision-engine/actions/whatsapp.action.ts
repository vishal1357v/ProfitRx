import { Intervention, InterventionEffect, MerchantInterventionSettings } from "../types";
import { OrderFeatureResult } from "../../order-features/types";
import { RTORiskResult } from "../../rto-risk/types";

export class WhatsappVerifyAction implements Intervention {
  type = "WHATSAPP_VERIFY";
  frictionScore = 2; // Low friction

  isAvailable(settings: MerchantInterventionSettings): boolean {
    return settings.enabledActions.includes(this.type);
  }

  getEffect(
    featureResult: OrderFeatureResult,
    riskResult: RTORiskResult,
    settings: MerchantInterventionSettings
  ): InterventionEffect {
    return {
      riskMultiplier: settings.whatsappRiskMultiplier,
      confidenceMultiplier: 1.1, // Confidence increases slightly if they verify
      conversionMultiplier: settings.whatsappConversionMultiplier,
      extraCost: settings.whatsappCost,
      explanation: [
        {
          code: "WHATSAPP_EFFECT",
          severity: "INFO",
          message: `WhatsApp verification costs ₹${settings.whatsappCost}, reduces risk by ${(1 - settings.whatsappRiskMultiplier) * 100}%, and reduces conversion by ${(1 - settings.whatsappConversionMultiplier) * 100}%.`
        }
      ]
    };
  }
}
