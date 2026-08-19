import { OrderFeatureResult } from "../order-features/types";
import { RTORiskResult } from "../rto-risk/types";
import { ExpectedValueResult, DeliveredScenario, RTOScenario, FinancialAssumptions } from "./types";
import { roundMoney } from "../../utils/money";

export const SERVICE_VERSION = "expected-value-v1";
export const FORMULA_VERSION = "formula-v1";
export const ASSUMPTIONS_VERSION = "assumptions-v1";

export class ExpectedValueService {
  /**
   * Calculates the expected monetary value of an order under given financial assumptions.
   * Pure deterministic function. No database calls.
   */
  static calculate(
    featureResult: OrderFeatureResult,
    riskResult: RTORiskResult,
    assumptions: FinancialAssumptions
  ): ExpectedValueResult {
    const { features } = featureResult;
    const { probability: rtoProbability } = riskResult;
    const deliveryProbability = 1 - rtoProbability;

    const rawFeatures = (features || {}) as any;
    const financials = rawFeatures.financials || {};
    const logistics = rawFeatures.logistics || {};

    // ── Delivered Scenario ──
    const revenue = rawFeatures.netOrderValue ?? rawFeatures.grossOrderValue ?? financials.netOrderValue ?? financials.grossOrderValue ?? 0;
    const shippingRevenue = rawFeatures.customerPaidShipping ?? financials.customerPaidShipping ?? 0;
    
    // Default fallback if cogs are 0 or missing
    const cogs = rawFeatures.cogs ?? financials.cogs ?? 0;
    
    // Use the exact inputs that would be lost on RTO, which are also incurred on delivery
    const forwardShippingCost = rawFeatures.forwardShippingCost ?? financials.forwardShippingCost ?? 0;
    const packaging = rawFeatures.packagingCost ?? financials.packagingCost ?? financials.packaging ?? 0;
    
    // If it's a COD order, we pay the COD fee upon delivery (unless assumptions say we pay on RTO too)
    const isCOD = Boolean(rawFeatures.isCOD ?? financials.isCOD);
    const codFee = isCOD ? (rawFeatures.codFee ?? financials.codFee ?? 0) : 0;
    const paymentFee = rawFeatures.paymentFee ?? financials.paymentFee ?? 0;
    
    const adCost = assumptions.includesAdCost ? (rawFeatures.allocatedAdCost ?? financials.allocatedAdCost ?? 0) : 0;

    const contributionProfitRaw = revenue + shippingRevenue - cogs - forwardShippingCost - paymentFee - codFee - packaging - adCost;
    const contributionProfit = roundMoney(contributionProfitRaw);

    const deliveredScenario: DeliveredScenario = {
      revenue: roundMoney(revenue),
      shippingRevenue: roundMoney(shippingRevenue),
      cogs: roundMoney(cogs),
      forwardShippingCost: roundMoney(forwardShippingCost),
      paymentFee: roundMoney(paymentFee),
      codFee: roundMoney(codFee),
      packaging: roundMoney(packaging),
      adCost: roundMoney(adCost),
      contributionProfit
    };

    // ── RTO Scenario ──
    const inventoryDamageRaw = cogs * (1 - assumptions.inventoryRecoveryRate);
    const inventoryDamage = roundMoney(inventoryDamageRaw);
    const recoveredInventoryValue = roundMoney(cogs - inventoryDamage);

    const returnShipping = rawFeatures.returnShippingCost ?? logistics.returnShippingCost ?? financials.returnShippingCost ?? 0;
    
    const customerShippingRefund = assumptions.refundsShippingOnRTO ? shippingRevenue : 0;
    const rtoCodFee = (isCOD && assumptions.chargesCodFeeOnRTO) ? codFee : 0;

    const totalLossRaw = forwardShippingCost + returnShipping + packaging + inventoryDamage + customerShippingRefund + rtoCodFee;
    const totalLoss = roundMoney(totalLossRaw);

    const rtoScenario: RTOScenario = {
      recoveredInventoryValue,
      inventoryDamage,
      forwardShipping: roundMoney(forwardShippingCost),
      returnShipping: roundMoney(returnShipping),
      packaging: roundMoney(packaging),
      customerShippingRefund: roundMoney(customerShippingRefund),
      codFee: roundMoney(rtoCodFee),
      totalLoss
    };

    // ── Expected Value Calculation ──
    const expectedValueRaw = (contributionProfit * deliveryProbability) - (totalLoss * rtoProbability);
    const expectedValue = roundMoney(expectedValueRaw);

    const grossOrderValue = features.grossOrderValue || 0;
    const expectedROI = grossOrderValue > 0 ? roundMoney(expectedValue / grossOrderValue) : 0;
    
    const expectedLoss = roundMoney(totalLoss * rtoProbability);

    return {
      expectedValue,
      expectedROI,
      expectedLoss,
      deliveryProbability: roundMoney(deliveryProbability),
      rtoProbability: roundMoney(rtoProbability),
      deliveredScenario,
      rtoScenario,
      assumptions,
      metadata: {
        serviceVersion: SERVICE_VERSION,
        formulaVersion: FORMULA_VERSION,
        assumptionsVersion: ASSUMPTIONS_VERSION,
        calculationDate: new Date()
      }
    };
  }
}
