import { Intervention, InterventionEffect, MerchantInterventionSettings } from "../types";
import { OrderFeatureResult } from "../../order-features/types";
import { RTORiskResult } from "../../rto-risk/types";

export class BlockCodAction implements Intervention {
  type = "BLOCK_COD";
  frictionScore = 10; // Max friction

  isAvailable(settings: MerchantInterventionSettings): boolean {
    return settings.enabledActions.includes(this.type);
  }

  getEffect(
    featureResult: OrderFeatureResult,
    riskResult: RTORiskResult,
    settings: MerchantInterventionSettings
  ): InterventionEffect {
    return {
      riskMultiplier: 0.0, // Risk eliminated
      confidenceMultiplier: 1.0, 
      conversionMultiplier: 0.0, // Conversion eliminated (from the perspective of COD)
      extraCost: 0,
      explanation: [
        {
          code: "BLOCK_COD_EFFECT",
          severity: "CRITICAL",
          message: `Blocking COD completely prevents the order. Conversion is 0, Risk is 0.`
        }
      ]
    };
  }
}
