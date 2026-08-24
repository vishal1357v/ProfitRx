import { roundMoney, subtractMoney, addMoney } from "../../utils/money";
import { ShippingCalculator } from "../shipping/shipping.calculator";
import { FinancialMetric, FinancialValueState, OrderEconomicsInput, OrderEconomicsResult } from "./types";

export class CanonicalEconomicsCalculator {
  /**
   * Returns Shopify plan payment gateway surcharge rate.
   */
  static getShopifySurchargeRate(planName?: string | null): number {
    const plan = (planName || "").toLowerCase().trim();
    if (plan.includes("plus") || plan.includes("enterprise")) return 0.0015; // 0.15% (Shopify Plus 3rd-party fee)
    if (plan.includes("advanced")) return 0.005; // 0.5%
    if (plan.includes("basic") || plan.includes("starter")) return 0.02; // 2.0%
    if (plan.includes("shopify")) return 0.01; // 1.0% (Standard)
    return 0.02; // Default to basic 2% if unknown
  }

  /**
   * The single authoritative order economics calculation for ProfitRx.
   * Pure deterministic calculation. Guaranteed consistent across Dashboard, Order Intelligence,
   * Operations Queue, Profit Leaks, and Reports.
   */
  static calculate(input: OrderEconomicsInput): OrderEconomicsResult {
    const warnings: string[] = [];

    // 1. Revenue Decomposition
    const grossOrderValue = roundMoney(Math.max(0, Number(input.grossOrderValue) || 0));
    const customerPaidShipping = roundMoney(Math.max(0, Number(input.customerPaidShipping) || 0));
    const totalTax = roundMoney(Math.max(0, Number(input.totalTax) || 0));

    // 2. COGS (Distinguish Actual vs Default %)
    let cogsValue = 0;
    let cogsState: FinancialValueState = "ESTIMATED";
    let cogsSource = "MERCHANT_DEFAULT_PCT";

    const hasActualCogs =
      input.actualSkuCogs !== undefined &&
      input.actualSkuCogs !== null &&
      Number.isFinite(input.actualSkuCogs) &&
      input.actualSkuCogs >= 0;

    if (hasActualCogs) {
      cogsValue = roundMoney(Number(input.actualSkuCogs));
      cogsState = "ACTUAL";
      cogsSource = "SKU_MANUAL_OR_NATIVE";
    } else {
      const defaultPct = Number.isFinite(Number(input.defaultCogsPct)) && Number(input.defaultCogsPct) > 0
        ? Number(input.defaultCogsPct)
        : 40;
      cogsValue = roundMoney(grossOrderValue * (defaultPct / 100));
      cogsState = "ESTIMATED";
      cogsSource = `DEFAULT_${defaultPct}_PCT`;
      warnings.push("DEFAULT_COGS_USED");
    }

    // 3. Shipping Calculation (via authoritative ShippingCalculator)
    const shippingResult = ShippingCalculator.calculate({
      weightGrams: input.weightGrams,
      shippingSlabs: input.shippingSlabs,
      defaultForwardShipping: input.defaultForwardShipping,
      defaultReturnShipping: input.defaultReturnShipping,
      actualShippingCost: input.actualShippingCost,
    });
    warnings.push(...shippingResult.warnings);

    const forwardShippingCost = shippingResult.forwardShippingCost;
    const returnShippingCost = shippingResult.returnShippingCost;
    const shippingState: FinancialValueState = shippingResult.source === "MERCHANT_CONFIGURED" ? "ACTUAL" : "ESTIMATED";

    // 4. Packaging
    const packagingCost = Number.isFinite(Number(input.defaultPackagingCost)) && Number(input.defaultPackagingCost) >= 0
      ? roundMoney(Number(input.defaultPackagingCost))
      : 10;

    // 5. Payment & COD Fees
    let codFeeValue = 0;
    let gatewayFeeValue = 0;

    if (input.isCOD) {
      gatewayFeeValue = 0; // Strictly 0 gateway fee for COD orders
      codFeeValue = Number.isFinite(Number(input.defaultCodHandlingFee)) && Number(input.defaultCodHandlingFee) >= 0
        ? roundMoney(Number(input.defaultCodHandlingFee))
        : 40;
    } else {
      codFeeValue = 0; // Strictly 0 COD handling fee for prepaid orders
      const gatewayRate = (Number.isFinite(Number(input.defaultGatewayFeePct)) ? Number(input.defaultGatewayFeePct) : 2) / 100;
      const surchargeRate = this.getShopifySurchargeRate(input.shopifyPlanName);
      const fixedFee = Number.isFinite(Number(input.gatewayFixedFee)) ? Number(input.gatewayFixedFee) : 0;
      
      const rawGatewayFee = (grossOrderValue * gatewayRate) + (grossOrderValue * surchargeRate) + fixedFee;
      gatewayFeeValue = roundMoney(rawGatewayFee * 1.18); // 18% GST on payment gateway fees
    }

    // 6. Ad Cost
    const includesAdCost = Boolean(input.includesAdCost);
    const allocatedAdCost = includesAdCost && Number.isFinite(Number(input.allocatedAdCost))
      ? roundMoney(Number(input.allocatedAdCost))
      : 0;

    // 7. Delivered Profit Calculation
    // Delivered Profit = (Gross Revenue - Taxes) - COGS - Forward Shipping - Packaging - Gateway Fee - COD Fee - Ad Cost
    // Note: Gross Order Value includes item subtotal + customer paid shipping + tax.
    const netRevenueExclTax = Math.max(0, subtractMoney(grossOrderValue, totalTax));
    const totalDeliveredCosts = addMoney(
      cogsValue,
      forwardShippingCost,
      packagingCost,
      gatewayFeeValue,
      codFeeValue,
      allocatedAdCost
    );
    const deliveredProfitValue = roundMoney(subtractMoney(netRevenueExclTax, totalDeliveredCosts));
    const deliveredProfitState: FinancialValueState = cogsState === "ACTUAL" && shippingState === "ACTUAL" ? "ACTUAL" : "ESTIMATED";

    // 8. RTO Loss Exposure Calculation (Zero Double Counting)
    const inventoryRecoveryRate = Number.isFinite(Number(input.inventoryRecoveryRate))
      ? Number(input.inventoryRecoveryRate)
      : 0.9; // 90% recovery = 10% damage/shrinkage loss
    const inventoryDamageLoss = roundMoney(cogsValue * Math.max(0, 1 - inventoryRecoveryRate));

    const refundsShippingOnRTO = Boolean(input.refundsShippingOnRTO);
    const customerShippingRefund = refundsShippingOnRTO ? customerPaidShipping : 0;

    const chargesCodFeeOnRTO = Boolean(input.chargesCodFeeOnRTO);
    const rtoCodFee = (input.isCOD && chargesCodFeeOnRTO) ? codFeeValue : 0;

    // In RTO: merchant loses forward freight, return freight, packaging, inventory damage, customer refund (if any), and courier COD fee (if charged)
    const rtoLossExposureValue = roundMoney(
      forwardShippingCost + returnShippingCost + packagingCost + inventoryDamageLoss + customerShippingRefund + rtoCodFee
    );

    // 9. Probabilistic Expected Value (EV)
    const rtoProb = Number.isFinite(Number(input.rtoProbability))
      ? Math.max(0, Math.min(1, Number(input.rtoProbability)))
      : (input.isCOD ? 0.25 : 0.05); // Default priors if unassigned
    const deliveryProb = roundMoney(1 - rtoProb);

    const expectedValueRaw = (deliveredProfitValue * deliveryProb) - (rtoLossExposureValue * rtoProb);
    const expectedValue = roundMoney(expectedValueRaw);
    const expectedLoss = roundMoney(rtoLossExposureValue * rtoProb);
    const expectedROI = grossOrderValue > 0 ? roundMoney(expectedValue / grossOrderValue) : 0;

    return {
      revenue: {
        value: grossOrderValue,
        state: "ACTUAL",
        source: "SHOPIFY_TOTAL_PRICE",
      },
      customerPaidShipping: {
        value: customerPaidShipping,
        state: "ACTUAL",
        source: "SHOPIFY_SHIPPING_PRICE",
      },
      tax: {
        value: totalTax,
        state: "ACTUAL",
        source: "SHOPIFY_TAX",
      },
      cogs: {
        value: cogsValue,
        state: cogsState,
        source: cogsSource,
      },
      forwardShipping: {
        value: forwardShippingCost,
        state: shippingState,
        source: shippingResult.source,
      },
      returnShipping: {
        value: returnShippingCost,
        state: shippingState,
        source: shippingResult.source,
      },
      packaging: {
        value: packagingCost,
        state: "ESTIMATED",
        source: "MERCHANT_DEFAULT_PACKAGING",
      },
      codFee: {
        value: codFeeValue,
        state: input.isCOD ? "ESTIMATED" : "ACTUAL",
        source: input.isCOD ? "MERCHANT_COD_HANDLING" : "NOT_APPLICABLE",
      },
      gatewayFee: {
        value: gatewayFeeValue,
        state: !input.isCOD ? "ESTIMATED" : "ACTUAL",
        source: !input.isCOD ? "RAZORPAY_PLUS_SHOPIFY_GST" : "NOT_APPLICABLE",
      },
      allocatedAdCost: {
        value: allocatedAdCost,
        state: includesAdCost ? "ESTIMATED" : "ACTUAL",
        source: includesAdCost ? "ATTRIBUTED_AD_SPEND" : "ZERO",
      },
      deliveredProfit: {
        value: deliveredProfitValue,
        state: deliveredProfitState,
        source: "CANONICAL_FORMULA",
      },
      rtoLossExposure: {
        value: rtoLossExposureValue,
        state: "EXPECTED",
        source: "CANONICAL_RTO_FORMULA",
      },
      expectedValue: {
        value: expectedValue,
        state: "EXPECTED",
        source: "PROBABILISTIC_EV",
      },
      expectedROI: {
        value: expectedROI,
        state: "EXPECTED",
        source: "EV_OVER_REVENUE",
      },
      expectedLoss: {
        value: expectedLoss,
        state: "EXPECTED",
        source: "RTO_LOSS_TIMES_PROBABILITY",
      },
      deliveryProbability: deliveryProb,
      rtoProbability: roundMoney(rtoProb),
      dataCompleteness: {
        hasActualCogs,
        hasActualShipping: shippingResult.source === "MERCHANT_CONFIGURED",
        hasWeight: shippingResult.isWeightBased,
        warnings: [...new Set(warnings)],
      },
    };
  }
}
