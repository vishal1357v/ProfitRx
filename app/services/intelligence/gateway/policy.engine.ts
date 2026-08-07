import { ActionType } from "../types";

export interface MerchantPolicy {
  blockCodAboveValue: number;
  blockSpecificPincodes: string[];
}

export class PolicyEngine {
  /**
   * Enforces deterministic merchant policies over ML recommendations.
   * ML says "ALLOW COD". Policy says "Block COD > ₹15k". Policy wins.
   */
  static evaluate(
    mlAction: ActionType, 
    orderValue: number, 
    pincode: string, 
    policy: MerchantPolicy
  ): ActionType {
    
    // Policy Override 1: High Value COD Block
    if (orderValue > policy.blockCodAboveValue && mlAction === "ALLOW_COD") {
      return "PREPAID_ONLY";
    }

    // Policy Override 2: Blacklisted Pincodes
    if (policy.blockSpecificPincodes.includes(pincode) && mlAction !== "BLOCK") {
      return "PREPAID_ONLY"; 
    }

    // No overrides, trust ML
    return mlAction;
  }
}
