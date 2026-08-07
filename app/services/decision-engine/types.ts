import { OrderFeatureResult } from "../order-features/types";
import { RTORiskResult } from "../rto-risk/types";
import { ExpectedValueResult, FinancialAssumptions } from "../expected-value/types";

export type ActionType = 
  | "ALLOW_COD" 
  | "WHATSAPP_VERIFY" 
  | "OTP_VERIFY" 
  | "PARTIAL_PAYMENT" 
  | "PREPAID_ONLY" 
  | "BLOCK_COD"
  | string;

export interface DecisionReason {
  code: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  message: string;
}

export interface DecisionResult {
  recommendedAction: ActionType;
  
  baselineExpectedValue: number;
  recommendedExpectedValue: number;
  expectedProfitIncrease: number; 
  
  riskBefore: number;
  riskAfter: number;
  
  confidenceBefore: number;
  confidenceAfter: number;
  
  evaluatedActions: EvaluatedAction[];
  reasoning: DecisionReason[];
  
  metadata: {
    decisionVersion: string;
    calculationDate: Date;
  };
}

export interface EvaluatedAction {
  action: ActionType;
  isAvailable: boolean;
  scenarioResult?: ScenarioResult;
  frictionScore: number;
  reasons: DecisionReason[];
}

export interface ScenarioResult {
  simulatedRiskProbability: number;
  simulatedConfidence: number;
  simulatedConversionRate: number; 
  interventionCost: number;        
  
  estimatedRiskReduction: number;  
  estimatedConversionLoss: number; 
  
  expectedValueResult: ExpectedValueResult; 
}

export interface InterventionEffect {
  riskMultiplier: number;
  confidenceMultiplier: number;
  conversionMultiplier: number;
  extraCost: number;
  explanation: DecisionReason[];
}

export interface Intervention {
  type: ActionType;
  frictionScore: number; // 0 to 10
  
  isAvailable(settings: MerchantInterventionSettings): boolean;
  
  getEffect(
    featureResult: OrderFeatureResult,
    riskResult: RTORiskResult,
    settings: MerchantInterventionSettings
  ): InterventionEffect;
}

export interface MerchantDecisionSettings {
  maxFriction: number; 
  minConfidence: number; 
}

export interface MerchantInterventionSettings {
  enabledActions: ActionType[];
  preferredAdvanceAmount: number; 
  
  // Calibration multipliers/costs
  otpCost: number;
  otpConversionMultiplier: number; 
  otpRiskMultiplier: number;       
  
  whatsappCost: number;
  whatsappConversionMultiplier: number;
  whatsappRiskMultiplier: number;

  partialPaymentCost: number;
  partialPaymentConversionMultiplier: number;
  partialPaymentRiskMultiplier: number;
}
