import { OrderFeatureResult } from "../order-features/types";
import { RTORiskResult } from "../rto-risk/types";
import { ExpectedValueResult, FinancialAssumptions } from "../expected-value/types";
import { MerchantDecisionSettings, MerchantInterventionSettings, DecisionResult, EvaluatedAction, DecisionReason } from "./types";
import { InterventionSimulator } from "./simulation/intervention-simulator";
import { ScenarioEvaluator } from "./simulation/scenario-evaluator";
import { RankingService } from "./ranking/ranking.service";
import { roundMoney } from "../../utils/money";

export const DECISION_VERSION = "decision-engine-v1";

export class DecisionService {
  static evaluate(
    featureResult: OrderFeatureResult,
    riskResult: RTORiskResult,
    baselineExpectedValueResult: ExpectedValueResult,
    decisionSettings: MerchantDecisionSettings,
    interventionSettings: MerchantInterventionSettings,
    financialAssumptions: FinancialAssumptions
  ): DecisionResult {

    // 1. Simulate all available interventions to get effects
    const simulationResults = InterventionSimulator.simulateAll(featureResult, riskResult, interventionSettings);

    const evaluatedActions: EvaluatedAction[] = [];

    // 2. Evaluate Scenarios to get full financial impact
    for (const sim of simulationResults) {
      const scenarioResult = ScenarioEvaluator.evaluate(
        featureResult,
        riskResult,
        sim.effect,
        financialAssumptions
      );

      evaluatedActions.push({
        action: sim.action.type,
        isAvailable: true,
        scenarioResult,
        frictionScore: sim.action.frictionScore,
        reasons: sim.effect.explanation
      });
    }

    // Add unavailable actions just for reporting (so the dashboard can show they were skipped)
    const allActionTypes = ["ALLOW_COD", "WHATSAPP_VERIFY", "OTP_VERIFY", "PARTIAL_PAYMENT", "PREPAID_ONLY", "BLOCK_COD"];
    for (const type of allActionTypes) {
      if (!evaluatedActions.find(a => a.action === type)) {
        evaluatedActions.push({
          action: type,
          isAvailable: false,
          frictionScore: -1, // Doesn't matter
          reasons: [{ code: "NOT_ENABLED", severity: "INFO", message: "Intervention disabled by merchant." }]
        });
      }
    }

    // 3. Rank and select best
    const rankedActions = RankingService.rank(evaluatedActions, decisionSettings);
    
    // Fallback to ALLOW_COD if ranking somehow fails
    const bestAction = rankedActions[0] || evaluatedActions.find(a => a.action === "ALLOW_COD");

    const recommendedAction = bestAction.action;
    const baselineExpectedValue = baselineExpectedValueResult.expectedValue;
    const recommendedExpectedValue = bestAction.scenarioResult?.expectedValueResult.expectedValue || baselineExpectedValue;
    const expectedProfitIncrease = roundMoney(recommendedExpectedValue - baselineExpectedValue);

    const riskBefore = riskResult.probability;
    const riskAfter = bestAction.scenarioResult?.simulatedRiskProbability || riskResult.probability;

    const confidenceBefore = riskResult.confidence;
    const confidenceAfter = bestAction.scenarioResult?.simulatedConfidence || riskResult.confidence;

    const reasoning: DecisionReason[] = [];
    if (bestAction.action === "ALLOW_COD") {
      reasoning.push({
        code: "ALLOW_COD_BEST",
        severity: "INFO",
        message: `Standard COD provides the best expected value of ₹${recommendedExpectedValue}.`
      });
    } else {
      reasoning.push({
        code: "INTERVENTION_RECOMMENDED",
        severity: "INFO",
        message: `${recommendedAction} increases expected value by ₹${expectedProfitIncrease} (from ₹${baselineExpectedValue} to ₹${recommendedExpectedValue}).`
      });
      reasoning.push(...bestAction.reasons);
    }

    return {
      recommendedAction,
      baselineExpectedValue,
      recommendedExpectedValue,
      expectedProfitIncrease,
      riskBefore: roundMoney(riskBefore),
      riskAfter: roundMoney(riskAfter),
      confidenceBefore: roundMoney(confidenceBefore),
      confidenceAfter: roundMoney(confidenceAfter),
      evaluatedActions,
      reasoning,
      metadata: {
        decisionVersion: DECISION_VERSION,
        calculationDate: new Date()
      }
    };
  }
}
