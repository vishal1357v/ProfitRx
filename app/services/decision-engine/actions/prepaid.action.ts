import { Intervention, InterventionEffect, MerchantInterventionSettings } from "../types";
import { OrderFeatureResult } from "../../order-features/types";
import { RTORiskResult } from "../../rto-risk/types";

export class PrepaidOnlyAction implements Intervention {
  type = "PREPAID_ONLY";
  frictionScore = 9; // Very high friction, full payment required

  isAvailable(settings: MerchantInterventionSettings): boolean {
    return settings.enabledActions.includes(this.type);
  }

  getEffect(
    featureResult: OrderFeatureResult,
    riskResult: RTORiskResult,
    settings: MerchantInterventionSettings
  ): InterventionEffect {
    return {
      riskMultiplier: 0.05, // Almost eliminates COD risk
      confidenceMultiplier: 2.0, 
      conversionMultiplier: 0.1, // Drastic drop in conversion (losing 90% of COD intent)
      extraCost: 0, 
      explanation: [
        {
          code: "PREPAID_ONLY_EFFECT",
          severity: "CRITICAL",
          message: `Converting to prepaid eliminates RTO risk but is estimated to lose 90% of conversions.`
        }
      ]
    };
  }
}
