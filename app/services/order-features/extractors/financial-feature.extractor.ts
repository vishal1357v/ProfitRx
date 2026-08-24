import { Order } from "@prisma/client";
import { FinancialFeatureResult, FeatureWarning, OrderFeatureSources } from "../types";
import { ProfitService } from "../../profit.service";
import { resolveEffectiveCOGS } from "../../../utils/cogs";
import { roundMoney } from "../../../utils/money";
import { ShippingCalculator } from "../../shipping/shipping.calculator";

export class FinancialFeatureExtractor {
  static extract(params: {
    order: Order;
    settings: ReturnType<typeof ProfitService.getSettings>;
    cogsDict: Record<string, number>;
    variantCogsDict: Record<string, number>;
  }): FinancialFeatureResult {
    const { order, settings, cogsDict, variantCogsDict } = params;
    const warnings: FeatureWarning[] = [];

    // Financial Decomposition
    const grossOrderValue = order.totalPrice;
    const netOrderValue = order.subtotalPrice;
    const subtotal = order.subtotalPrice;
    const shippingCharged = order.shippingPrice;
    const tax = order.totalTax;
    const discountAmount = order.discountAmount;

    let discountPercentage: number | null = null;
    const discountDenominator = subtotal + discountAmount;
    if (discountDenominator > 0) {
      discountPercentage = discountAmount / discountDenominator;
      if (discountPercentage > 1) discountPercentage = 1;
      if (discountPercentage < 0) discountPercentage = 0;
    }

    // Determine COGS and its source
    let cogs = 0;
    let cogsSource: OrderFeatureSources["cogs"] = "MERCHANT_DEFAULT";

    if (order.cogsAtTimeOfOrder !== null && order.cogsAtTimeOfOrder > 0) {
      cogs = order.cogsAtTimeOfOrder;
      cogsSource = "ORDER_SNAPSHOT";
    } else {
      const productId = order.productId || "";
      const variantId = ""; // No variant tracking on order in phase 1?
      
      let effectiveCogs = null;
      if (variantId && variantCogsDict[variantId] !== undefined) {
          effectiveCogs = variantCogsDict[variantId];
          cogsSource = "VARIANT_MANUAL"; // simplifying source mapping for dictionary lookup
      } else if (productId && cogsDict[productId] !== undefined) {
          effectiveCogs = cogsDict[productId];
          cogsSource = "PRODUCT_MANUAL";
      }

      if (effectiveCogs !== null) {
          cogs = effectiveCogs;
      } else {
        cogs = grossOrderValue * (settings.defaultCOGSPct / 100);
        warnings.push("DEFAULT_COGS");
      }
    }

    // Determine Shipping Cost and its source
    const shippingCalcResult = ShippingCalculator.calculate({
      weightGrams: order.totalWeight,
      shippingSlabs: settings.shippingSlabs as any,
      defaultForwardShipping: settings.defaultForwardShipping,
      defaultReturnShipping: settings.defaultReturnShipping,
      actualShippingCost: order.actualShippingCost,
    });

    const forwardShippingCost = shippingCalcResult.forwardShippingCost;
    const returnShippingCost = shippingCalcResult.returnShippingCost;
    let shippingSource: OrderFeatureSources["shipping"] = "MERCHANT_DEFAULT";

    if (shippingCalcResult.source === "MERCHANT_CONFIGURED") {
      shippingSource = "ACTUAL";
    } else if (order.totalWeight !== null && order.totalWeight > 0) {
      shippingSource = "WEIGHT_SLAB";
      warnings.push("ESTIMATED_SHIPPING");
    } else {
      shippingSource = "MERCHANT_DEFAULT";
      warnings.push("ESTIMATED_SHIPPING");
    }

    const packagingCost = settings.defaultPackaging;
    const customerPaidShipping = shippingCharged;

    // Determine gateway fees
    let codFee = 0;
    let paymentFee = 0;

    if (order.isCOD) {
      codFee = settings.defaultCODHandling;
    } else {
      const gatewayRate = settings.defaultGatewayFeePct / 100;
      const shopifyRate = ProfitService.getShopifySurchargeRate(settings.shopifyPlanName);
      
      const rawGatewayFee = (grossOrderValue * gatewayRate) + (grossOrderValue * shopifyRate) + settings.gatewayFixedFee;
      paymentFee = rawGatewayFee * 1.18; // 18% GST
    }

    // Derived Margins
    const grossMarginBeforeShipping = roundMoney(netOrderValue - cogs);
    const grossMarginPct = netOrderValue > 0 ? roundMoney(grossMarginBeforeShipping / netOrderValue) : null;
    const contributionMarginBeforeAds = roundMoney(netOrderValue - cogs - forwardShippingCost - paymentFee - codFee - packagingCost);

    // Ad Cost
    const allocatedAdCost: number | null = null;
    const adCostSource: OrderFeatureSources["adCost"] = "UNAVAILABLE";
    warnings.push("NO_AD_ATTRIBUTION");

    return {
      grossOrderValue,
      netOrderValue,
      subtotal,
      shippingCharged,
      tax,
      discountAmount,
      discountPercentage,
      cogs,
      customerPaidShipping,
      forwardShippingCost,
      returnShippingCost,
      packagingCost,
      codFee,
      paymentFee,
      allocatedAdCost,
      grossMarginBeforeShipping,
      grossMarginPct,
      contributionMarginBeforeAds,
      sources: {
        cogs: cogsSource,
        shipping: shippingSource,
        adCost: adCostSource,
      },
      warnings,
      estimatedRtoLossInputs: {
        forwardShipping: forwardShippingCost,
        returnShipping: returnShippingCost,
        packaging: packagingCost,
        codFee,
        paymentFee,
        cogs,
        customerPaidShipping,
      }
    };
  }
}
