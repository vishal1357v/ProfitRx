import prisma from "../../db.server";
import { OrderFeatureResult, OrderFeatures, FeatureWarning } from "./types";
import { CustomerFeatureExtractor } from "./extractors/customer-feature.extractor";
import { PincodeFeatureExtractor } from "./extractors/pincode-feature.extractor";
import { MerchantFeatureExtractor } from "./extractors/merchant-feature.extractor";
import { FinancialFeatureExtractor } from "./extractors/financial-feature.extractor";
import { FeatureConfidenceCalculator } from "./feature-confidence.calculator";
import { ProfitService } from "../profit.service";
import { logInfo, logDev } from "../../utils/logger";

export class OrderFeatureService {
  /**
   * Primary entry point for Phase 1.
   * Extracts a deterministic set of features for an order.
   * 
   * @param params.shop - Tenant domain
   * @param params.orderId - Shopify order ID
   * @param params.asOf - Evaluation timestamp. If provided, all history queries use
   *                      temporal filtering against the raw Order table to prevent leakage.
   */
  static async extractFeatures(params: {
    shop: string;
    orderId: string;
    asOf?: Date;
  }): Promise<OrderFeatureResult> {
    const { shop, orderId } = params;
    
    // 1. Load Order Context
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order || order.shop !== shop) {
      throw new Error(`Order ${orderId} not found or does not belong to shop ${shop}`);
    }

    const asOf = params.asOf || order.createdAt;
    const isHistoricalMode = params.asOf !== undefined;
    
    // Load Settings and COGS in parallel
    const [rawSettings, cogsDict] = await Promise.all([
      prisma.storeSettings.findUnique({ where: { shop } }),
      ProfitService.getCOGS(shop)
    ]);
    const variantCogsDict = cogsDict; // Variant COGS not explicitly split yet

    const settings = ProfitService.getSettings(rawSettings);

    const warnings: FeatureWarning[] = [];

    // 2. Delegate to Extractors
    const [customerFeatures, pincodeFeatures, merchantFeatures] = await Promise.all([
      CustomerFeatureExtractor.extract({
        shop,
        customerId: order.customerId,
        asOf,
        useTemporalQuery: isHistoricalMode
      }),
      PincodeFeatureExtractor.extract({
        shop,
        pincode: order.pincode,
        asOf,
        useTemporalQuery: isHistoricalMode
      }),
      MerchantFeatureExtractor.extract({
        shop,
        asOf,
        settings
      })
    ]);

    const financialFeatures = FinancialFeatureExtractor.extract({
      order,
      settings,
      cogsDict,
      variantCogsDict
    });

    // Address completeness
    const addressScore = FeatureConfidenceCalculator.scoreOrderCompleteness({
      pincode: order.pincode,
      province: order.province,
      customerId: order.customerId
    });

    // Item count (Phase 1 limitation)
    let itemCount: number | null = null;
    warnings.push("LINE_ITEMS_UNAVAILABLE");

    // Combine warnings
    warnings.push(...customerFeatures.warnings);
    warnings.push(...pincodeFeatures.warnings);
    warnings.push(...financialFeatures.warnings);
    
    // Deduplicate warnings
    const uniqueWarnings = [...new Set(warnings)];

    const features: OrderFeatures = {
      orderId: order.id,
      shop: order.shop,
      orderDate: order.createdAt,
      
      // Financial Decomposition
      grossOrderValue: financialFeatures.grossOrderValue,
      netOrderValue: financialFeatures.netOrderValue,
      subtotal: financialFeatures.subtotal,
      shippingCharged: financialFeatures.shippingCharged,
      tax: financialFeatures.tax,
      discountAmount: financialFeatures.discountAmount,
      discountPercentage: financialFeatures.discountPercentage,
      
      // Order Characteristics
      itemCount,
      totalQuantity: itemCount,
      totalWeight: order.totalWeight,
      isCOD: order.isCOD,
      channel: order.channelAttribution,

      // Customer
      customerId: order.customerId,
      customerOrderCount: customerFeatures.customerOrderCount,
      customerCodOrderCount: customerFeatures.customerCodOrderCount,
      customerPrepaidOrderCount: customerFeatures.customerPrepaidOrderCount,
      customerDeliveredCount: customerFeatures.customerDeliveredCount,
      customerRtoCount: customerFeatures.customerRtoCount,
      customerCancellationCount: customerFeatures.customerCancellationCount,
      customerRtoRate: customerFeatures.customerRtoRate,
      customerAov: customerFeatures.customerAov,
      customerLifetimeSpend: customerFeatures.customerLifetimeSpend,
      isNewCustomer: customerFeatures.isNewCustomer,
      daysSinceLastOrder: customerFeatures.daysSinceLastOrder,
      customerAgeDays: customerFeatures.customerAgeDays,
      repeatPurchaseGap: customerFeatures.repeatPurchaseGap,

      // Pincode
      pincode: order.pincode,
      pincodeOrderCount: pincodeFeatures.pincodeOrderCount,
      pincodeCodOrderCount: pincodeFeatures.pincodeCodOrderCount,
      pincodeSuccessfulDeliveries: pincodeFeatures.pincodeSuccessfulDeliveries,
      pincodeRtoCount: pincodeFeatures.pincodeRtoCount,
      pincodeRtoRate: pincodeFeatures.pincodeRtoRate,
      pincodeDeliveryRate: pincodeFeatures.pincodeDeliveryRate,
      pincodeSampleSize: pincodeFeatures.pincodeSampleSize,

      // Regional
      regionalOrderCount: pincodeFeatures.regionalOrderCount,
      regionalCodOrderCount: pincodeFeatures.regionalCodOrderCount,
      regionalRtoCount: pincodeFeatures.regionalRtoCount,
      regionalRtoRate: pincodeFeatures.regionalRtoRate,
      regionalSampleSize: pincodeFeatures.regionalSampleSize,

      // Merchant
      merchantHistoricalOrderCount: merchantFeatures.merchantHistoricalOrderCount,
      merchantCodOrderCount: merchantFeatures.merchantCodOrderCount,
      merchantCodRtoCount: merchantFeatures.merchantCodRtoCount,
      merchantCodRtoRate: merchantFeatures.merchantCodRtoRate,
      merchantAverageOrderValue: merchantFeatures.merchantAverageOrderValue,
      merchantAverageMargin: merchantFeatures.merchantAverageMargin,
      merchantAverageRtoLoss: merchantFeatures.merchantAverageRtoLoss,

      // Financial Inputs
      cogs: financialFeatures.cogs,
      customerPaidShipping: financialFeatures.customerPaidShipping,
      forwardShippingCost: financialFeatures.forwardShippingCost,
      returnShippingCost: financialFeatures.returnShippingCost,
      packagingCost: financialFeatures.packagingCost,
      codFee: financialFeatures.codFee,
      paymentFee: financialFeatures.paymentFee,
      allocatedAdCost: financialFeatures.allocatedAdCost,

      // Derived Margins
      grossMarginBeforeShipping: financialFeatures.grossMarginBeforeShipping,
      grossMarginPct: financialFeatures.grossMarginPct,
      contributionMarginBeforeAds: financialFeatures.contributionMarginBeforeAds,

      // RTO Loss Inputs
      estimatedRtoLossInputs: financialFeatures.estimatedRtoLossInputs,

      addressCompletenessScore: addressScore,
      province: order.province,
    };

    const sources = {
      cogs: financialFeatures.sources.cogs,
      shipping: financialFeatures.sources.shipping,
      adCost: financialFeatures.sources.adCost,
      customerHistory: customerFeatures.source,
      pincodeHistory: pincodeFeatures.source
    };

    const dataConfidence = FeatureConfidenceCalculator.calculate({
      cogsSource: sources.cogs,
      customerOrderCount: features.customerOrderCount,
      hasCustomerId: !!features.customerId,
      pincodeSampleSize: features.pincodeSampleSize,
      hasRegionalHistory: features.regionalSampleSize > 0,
      shippingSource: sources.shipping,
      adCostSource: sources.adCost,
      features
    });

    logInfo(`[OrderFeatureService] Extracted features for order ${orderId} (Confidence: ${(dataConfidence * 100).toFixed(1)}%)`);

    return {
      features,
      metadata: {
        featureVersion: "order-features-v1",
        dataConfidence,
        warnings: uniqueWarnings,
        sources,
        generatedAt: new Date(),
        generatedFromOrderCreatedAt: order.createdAt
      }
    };
  }
}
