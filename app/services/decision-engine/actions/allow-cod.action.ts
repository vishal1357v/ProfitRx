import { Intervention, InterventionEffect, MerchantInterventionSettings } from "../types";
import { OrderFeatureResult } from "../../order-features/types";
import { RTORiskResult } from "../../rto-risk/types";

export class AllowCodAction implements Intervention {
  type = "ALLOW_COD";
  frictionScore = 0;

  isAvailable(settings: MerchantInterventionSettings): boolean {
    return settings.enabledActions.includes(this.type);
  }

  getEffect(
    featureResult: OrderFeatureResult,
    riskResult: RTORiskResult,
    settings: MerchantInterventionSettings
  ): InterventionEffect {
    return {
      riskMultiplier: 1.0,
      confidenceMultiplier: 1.0,
      conversionMultiplier: 1.0,
      extraCost: 0,
      explanation: [
        {
          code: "ALLOW_COD_BASELINE",
          severity: "INFO",
          message: "Standard COD flow with no intervention."
        }
      ]
    };
  }
}
