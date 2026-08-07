import { Intervention, MerchantInterventionSettings, InterventionEffect } from "../types";
import { OrderFeatureResult } from "../../order-features/types";
import { RTORiskResult } from "../../rto-risk/types";

import { AllowCodAction } from "../actions/allow-cod.action";
import { WhatsappVerifyAction } from "../actions/whatsapp.action";
import { OtpVerifyAction } from "../actions/otp.action";
import { PartialPaymentAction } from "../actions/partial-payment.action";
import { PrepaidOnlyAction } from "../actions/prepaid.action";
import { BlockCodAction } from "../actions/block-cod.action";

export class InterventionSimulator {
  private static actions: Intervention[] = [
    new AllowCodAction(),
    new WhatsappVerifyAction(),
    new OtpVerifyAction(),
    new PartialPaymentAction(),
    new PrepaidOnlyAction(),
    new BlockCodAction()
  ];

  static simulateAll(
    featureResult: OrderFeatureResult,
    riskResult: RTORiskResult,
    settings: MerchantInterventionSettings
  ): Array<{ action: Intervention; effect: InterventionEffect }> {
    const results: Array<{ action: Intervention; effect: InterventionEffect }> = [];

    for (const action of this.actions) {
      if (action.isAvailable(settings)) {
        const effect = action.getEffect(featureResult, riskResult, settings);
        results.push({ action, effect });
      }
    }

    return results;
  }
}
