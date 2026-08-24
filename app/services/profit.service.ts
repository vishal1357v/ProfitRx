/* eslint-disable @typescript-eslint/no-explicit-any */
import prisma from "../db.server";
import { resolveEffectiveCOGS } from "../utils/cogs";
import { roundMoney, addMoney, subtractMoney } from "../utils/money";
import { ShippingCalculator } from "./shipping/shipping.calculator";
import { CanonicalEconomicsCalculator } from "./economics/canonical-economics.calculator";

export interface ProfitOrder {
  orderId: string;
  orderNumber: number;
  revenue: number;
  cogs: number;
  fees: number;
  profit: number;
  margin: number;
  shippingProfit: number;
  shippingLoss: number;
  createdAt: Date;
}

export interface ProfitSummary {
  totalRevenue: number;
  totalCOGS: number;
  totalFees: number;
  totalProfit: number;
  avgMargin: number;
  orderCount: number;
}

export interface FeeBreakdown {
  gatewayFees: number;
  codHandlingFees: number;
  forwardShipping: number;
  returnShipping: number;
  packagingCosts: number;
  totalFees: number;
}

export interface GSTSummary {
  gstin: string;
  isGstRegistered: boolean;
  defaultGstRate: number;
  totalTaxableSales: number;
  totalGstCollected: number;
  cgst: number;
  sgst: number;
  igst: number;
  intraStateSales: number;
  interStateSales: number;
  hsnSummary: Array<{ hsnCode: string; sales: number; tax: number }>;
}

const COD_KEYWORDS = ["cod", "cash", "cash on delivery", "manual"];

const INDIAN_STATE_ALIASES: Record<string, string> = {
  AP: "ANDHRA PRADESH",
  AR: "ARUNACHAL PRADESH",
  AS: "ASSAM",
  BR: "BIHAR",
  CG: "CHHATTISGARH",
  CT: "CHHATTISGARH",
  GA: "GOA",
  GJ: "GUJARAT",
  HR: "HARYANA",
  HP: "HIMACHAL PRADESH",
  JK: "JAMMU AND KASHMIR",
  JH: "JHARKHAND",
  KA: "KARNATAKA",
  KL: "KERALA",
  MP: "MADHYA PRADESH",
  MH: "MAHARASHTRA",
  MN: "MANIPUR",
  ML: "MEGHALAYA",
  MZ: "MIZORAM",
  NL: "NAGALAND",
  OD: "ODISHA",
  OR: "ODISHA",
  PB: "PUNJAB",
  RJ: "RAJASTHAN",
  SK: "SIKKIM",
  TN: "TAMIL NADU",
  TG: "TELANGANA",
  TS: "TELANGANA",
  TR: "TRIPURA",
  UP: "UTTAR PRADESH",
  UK: "UTTARAKHAND",
  UA: "UTTARAKHAND",
  WB: "WEST BENGAL",
  DL: "DELHI",
  "DELHI NCR": "DELHI",
  "NATIONAL CAPITAL TERRITORY OF DELHI": "DELHI",
  "NCT OF DELHI": "DELHI",
};

export function normalizeIndianState(rawState?: string | null): string {
  if (!rawState) return "";
  const cleaned = rawState.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, "");
  return INDIAN_STATE_ALIASES[cleaned] || cleaned;
}

function isCodOrder(order: { isCOD?: boolean; gateway?: string | null }): boolean {
  if (order.isCOD) return true;
  if (!order.gateway) return false;
  const lower = order.gateway.toLowerCase();
  return COD_KEYWORDS.some((kw) => lower.includes(kw));
}

function isRtoStatus(status?: string | null): boolean {
  const normalized = status?.trim().toLowerCase() || "";
  return normalized === "rto" || normalized.startsWith("rto-") || normalized.includes("return-to-origin") || normalized.includes("returned-to-sender");
}

export class ProfitService {
  /**
   * Determine Shopify transaction surcharge rate based on merchant's Shopify plan.
   * Basic = 2.0%, Shopify/Grow = 1.0%, Advanced = 0.6%, Plus = 0.15%
   */
  static getShopifySurchargeRate(planName?: string | null): number {
    return CanonicalEconomicsCalculator.getShopifySurchargeRate(planName);
  }

  /**
   * Centralized mapping helper to prevent null/undefined database columns from returning NaN in math.
   */
  static getSettings(settings: any) {
    return {
      defaultCOGSPct: settings?.defaultCOGSPct ?? 40,
      defaultForwardShipping: settings?.defaultForwardShipping ?? 60,
      defaultReturnShipping: settings?.defaultReturnShipping ?? 70,
      defaultCODHandling: settings?.defaultCODHandling ?? 50,
      defaultPackaging: settings?.defaultPackaging ?? 10,
      defaultGatewayFeePct: settings?.defaultGatewayFeePct ?? 2,
      gatewayFixedFee: settings?.gatewayFixedFee ?? 0,
      merchantState: settings?.merchantState || "MAHARASHTRA",
      shopifyPlanName: settings?.shopifyPlanName || "Basic",
      gstin: settings?.gstin || "",
      gstRate: settings?.gstRate ?? 18,
      isGstRegistered: Boolean(settings?.isGstRegistered),
      hsnCodes: settings?.hsnCodes || {},
      rtoDetectionPattern: settings?.rtoDetectionPattern || "rto,returned,undelivered,failed_delivery,rto-initiated,rto_initiated,shipped-rto,shiprocket-rto,delhivery_rto,rto-delhivery,rto-bluedart,return-to-origin,returned-to-sender",
      rtoThreshold: settings?.rtoThreshold ?? 30,
      marginThreshold: settings?.marginThreshold ?? 15,
      alertEmail: settings?.alertEmail || "",
      whatsappPhone: settings?.whatsappPhone || "",
      whatsappEnabled: Boolean(settings?.whatsappEnabled),
      syncCapped: Boolean(settings?.syncCapped),
      shippingSlabs: settings?.shippingSlabs || null,
    };
  }

  /**
   * Centralized formula to calculate profit for a single order.
   * Uses cogsAtTimeOfOrder snapshot if available to preserve historical accuracy.
   * Gateway_Fee (Prepaid) = ((Order_Total * Razorpay_Rate) + (Order_Total * Shopify_Surcharge_Rate) + Fixed_Fee) * 1.18 (18% GST)
   * Gateway_Fee (COD) = 0. COD Handling Fee applied instead.
   */
  static getSlabShippingCosts(
    weightGrams: number | null | undefined,
    slabs: any[] | null | undefined,
    defaultForward: number,
    defaultReturn: number
  ): { forward: number; returnShip: number } {
    const result = ShippingCalculator.calculate({
      weightGrams,
      shippingSlabs: slabs,
      defaultForwardShipping: defaultForward,
      defaultReturnShipping: defaultReturn,
    });
    return {
      forward: result.forwardShippingCost,
      returnShip: result.returnShippingCost,
    };
  }

  static calculateOrderProfit(
    order: { totalPrice?: number; isCOD?: boolean; gateway?: string | null; totalTax?: number; shippingPrice?: number; actualShippingCost?: number | null; cogsAtTimeOfOrder?: number | null; partialDepositCollected?: number; fulfillmentStatus?: string; totalWeight?: number | null },
    cogs: number,
    settings: { defaultGatewayFeePct: number; defaultCODHandling: number; defaultForwardShipping: number; defaultReturnShipping?: number; gatewayFixedFee?: number; defaultPackaging?: number; shopifyPlanName?: string; shippingSlabs?: any[] | null }
  ): { profit: number; fees: number; margin: number; shippingProfit: number; shippingLoss: number } {
    const isRto = isRtoStatus(order.fulfillmentStatus);
    const isCod = isCodOrder(order);
    const effectiveCogs = (order.cogsAtTimeOfOrder !== null && order.cogsAtTimeOfOrder !== undefined && !isNaN(order.cogsAtTimeOfOrder))
      ? roundMoney(order.cogsAtTimeOfOrder)
      : roundMoney(cogs);

    const econResult = CanonicalEconomicsCalculator.calculate({
      isCOD: isCod,
      grossOrderValue: order.totalPrice || 0,
      customerPaidShipping: order.shippingPrice || 0,
      totalTax: order.totalTax || 0,
      actualSkuCogs: effectiveCogs,
      weightGrams: order.totalWeight,
      shippingSlabs: settings.shippingSlabs,
      actualShippingCost: order.actualShippingCost,
      defaultForwardShipping: settings.defaultForwardShipping,
      defaultReturnShipping: settings.defaultReturnShipping,
      defaultPackagingCost: settings.defaultPackaging,
      defaultCodHandlingFee: settings.defaultCODHandling,
      defaultGatewayFeePct: settings.defaultGatewayFeePct,
      gatewayFixedFee: settings.gatewayFixedFee,
      shopifyPlanName: settings.shopifyPlanName,
    });

    const customerPaidShipping = isRto ? 0 : roundMoney(order.shippingPrice);
    const forwardShipping = econResult.forwardShipping.value;
    const shippingProfit = Math.max(0, subtractMoney(customerPaidShipping, forwardShipping));
    const shippingLoss = Math.max(0, subtractMoney(forwardShipping, customerPaidShipping));

    if (isRto) {
      // In RTO state, profit is negative of the logistics + packaging freight loss
      const packaging = Number.isFinite(Number(settings.defaultPackaging)) ? roundMoney(Number(settings.defaultPackaging)) : 10;
      const returnShipping = econResult.returnShipping.value;
      const rtoFreightAndPackaging = addMoney(forwardShipping, returnShipping, packaging);
      return {
        profit: -rtoFreightAndPackaging,
        fees: rtoFreightAndPackaging,
        margin: -100,
        shippingProfit: 0,
        shippingLoss: addMoney(forwardShipping, returnShipping),
      };
    }

    const fees = addMoney(
      econResult.tax.value,
      econResult.forwardShipping.value,
      econResult.packaging.value,
      econResult.gatewayFee.value,
      econResult.codFee.value
    );

    const profit = econResult.deliveredProfit.value;
    const totalPrice = econResult.revenue.value;
    const margin = totalPrice > 0 ? roundMoney((profit / totalPrice) * 100) : 0;

    return {
      profit: isNaN(profit) ? 0 : profit,
      fees: isNaN(fees) ? 0 : fees,
      margin: isNaN(margin) ? 0 : margin,
      shippingProfit,
      shippingLoss,
    };
  }

  /**
   * Calculate net RTO loss for an undelivered order.
   * Forward shipping + return shipping + packaging cost.
   * Upfront partial deposit collected (e.g. ₹100) offsets return logistics loss.
   */
  static calculateRTOLoss(
    order: { isCOD?: boolean; gateway?: string | null; fulfillmentStatus?: string; partialDepositCollected?: number },
    settings: { defaultForwardShipping: number; defaultReturnShipping: number; defaultCODHandling?: number; defaultPackaging?: number }
  ): number {
    const forward = roundMoney(settings.defaultForwardShipping ?? 60);
    const returnShip = roundMoney(settings.defaultReturnShipping ?? 70);
    const packaging = roundMoney(settings.defaultPackaging ?? 10);
    
    const rawLoss = addMoney(forward, returnShip, packaging);
    const deposit = roundMoney(order.partialDepositCollected || 0);
    return Math.max(0, subtractMoney(rawLoss, deposit));
  }

  /**
   * Calculate detailed fee breakdown across all store orders
   */
  static async getFeeBreakdown(shop: string): Promise<FeeBreakdown> {
    try {
      const rawSettings = await prisma.storeSettings.findUnique({ where: { shop } });
      const settings = this.getSettings(rawSettings);
      const orders = await prisma.order.findMany({ where: { shop } });

      let gatewayFees = 0;
      let codHandlingFees = 0;
      let forwardShipping = 0;
      let returnShipping = 0;
      let packagingCosts = 0;

      const razorpayRate = (settings.defaultGatewayFeePct || 2) / 100;
      const shopifySurchargeRate = this.getShopifySurchargeRate(settings.shopifyPlanName);

      for (const o of orders) {
        const orderPrice = Number(o.totalPrice) || 0;
        packagingCosts += settings.defaultPackaging;

        const slabsCost = this.getSlabShippingCosts(
          o.totalWeight,
          settings.shippingSlabs,
          settings.defaultForwardShipping,
          settings.defaultReturnShipping || 70
        );

        const orderForwardShipping =
          o.actualShippingCost !== null && o.actualShippingCost !== undefined
            ? Number(o.actualShippingCost)
            : slabsCost.forward;
        forwardShipping += orderForwardShipping;

        const isCod = isCodOrder(o as any);
        if (isCod) {
          codHandlingFees += settings.defaultCODHandling;
          if (isRtoStatus(o.fulfillmentStatus)) {
            returnShipping += slabsCost.returnShip;
          }
        } else {
          const rawFee = (orderPrice * razorpayRate) + (orderPrice * shopifySurchargeRate) + settings.gatewayFixedFee;
          gatewayFees += rawFee * 1.18;
        }
      }

      const totalFees = gatewayFees + codHandlingFees + forwardShipping + returnShipping + packagingCosts;

      return {
        gatewayFees: Math.round(gatewayFees) || 0,
        codHandlingFees: Math.round(codHandlingFees) || 0,
        forwardShipping: Math.round(forwardShipping) || 0,
        returnShipping: Math.round(returnShipping) || 0,
        packagingCosts: Math.round(packagingCosts) || 0,
        totalFees: Math.round(totalFees) || 0,
      };
    } catch (err) {
      console.error(`[getFeeBreakdown] Error calculating fee breakdown for ${shop}:`, err);
      return { gatewayFees: 0, codHandlingFees: 0, forwardShipping: 0, returnShipping: 0, packagingCosts: 0, totalFees: 0 };
    }
  }

  /**
   * Calculate GST Tax breakdown (CGST, SGST, IGST, HSN-wise sales)
   */
  static async getGSTSummary(shop: string): Promise<GSTSummary> {
    try {
      const rawSettings = await prisma.storeSettings.findUnique({ where: { shop } });
      const settings = this.getSettings(rawSettings);
      const orders = await prisma.order.findMany({ where: { shop } });

      let totalTaxableSales = 0;
      let totalGstCollected = 0;
      let cgst = 0;
      let sgst = 0;
      let igst = 0;
      let intraStateSales = 0;
      let interStateSales = 0;

      const hsnMap: Record<string, { sales: number; tax: number }> = {};

      for (const o of orders) {
        const totalPrice = Number(o.totalPrice) || 0;
        const orderTax = Number(o.totalTax) || 0;
        const taxablePrice = Math.max(0, totalPrice - orderTax);
        totalTaxableSales += taxablePrice;
        totalGstCollected += orderTax;

        const merchantState = normalizeIndianState(settings.merchantState || "MAHARASHTRA");
        const customerState = normalizeIndianState(o.province);

        if (customerState && customerState !== merchantState) {
          interStateSales += taxablePrice;
          igst += orderTax;
        } else {
          intraStateSales += taxablePrice;
          cgst += orderTax / 2;
          sgst += orderTax / 2;
        }

        const hsnCode = (settings.hsnCodes as any)?.[o.productId || "default"] || "610910";
        if (!hsnMap[hsnCode]) {
          hsnMap[hsnCode] = { sales: 0, tax: 0 };
        }
        hsnMap[hsnCode].sales += totalPrice;
        hsnMap[hsnCode].tax += orderTax;
      }

      const hsnSummary = Object.entries(hsnMap).map(([hsnCode, data]) => ({
        hsnCode,
        sales: Math.round(data.sales) || 0,
        tax: Math.round(data.tax) || 0,
      }));

      return {
        gstin: settings.gstin || "",
        isGstRegistered: settings.isGstRegistered || false,
        defaultGstRate: settings.gstRate || 18,
        totalTaxableSales: Math.round(totalTaxableSales) || 0,
        totalGstCollected: Math.round(totalGstCollected) || 0,
        cgst: Math.round(cgst) || 0,
        sgst: Math.round(sgst) || 0,
        igst: Math.round(igst) || 0,
        intraStateSales: Math.round(intraStateSales) || 0,
        interStateSales: Math.round(interStateSales) || 0,
        hsnSummary,
      };
    } catch (err) {
      console.error(`[getGSTSummary] Error calculating GST summary for ${shop}:`, err);
      return {
        gstin: "", isGstRegistered: false, defaultGstRate: 18,
        totalTaxableSales: 0, totalGstCollected: 0, cgst: 0, sgst: 0, igst: 0,
        intraStateSales: 0, interStateSales: 0, hsnSummary: [],
      };
    }
  }

  /**
   * Fetch COGS dictionary
   */
  static async getCOGS(shop: string): Promise<Record<string, number>> {
    try {
      const cogsRecords = await prisma.productCOGS.findMany({ where: { shop } });
      const cogsDict: Record<string, number> = {};
      cogsRecords.forEach((r: any) => {
        const eff = resolveEffectiveCOGS(r, r.shopifyNative);
        if (eff !== null) {
          cogsDict[r.productId] = eff;
          const cleanId = String(r.productId).replace("gid://shopify/Product/", "");
          cogsDict[cleanId] = eff;
          cogsDict[`gid://shopify/Product/${cleanId}`] = eff;
        }
      });
      return cogsDict;
    } catch (err) {
      console.error(`[getCOGS] Error fetching COGS for ${shop}:`, err);
      return {};
    }
  }

  /**
   * Task 4: Canonical Profit After Ads
   * Gross Revenue - Refunds - Discounts - COGS - Shipping - Gateway Fees - Packaging - COD Fees - Taxes - Advertising Cost = Profit After Ads
   */
  static async getProfitAfterAds(shop: string, startDate: Date, endDate: Date): Promise<{ profitAfterAds: number; totalAdSpend: number; grossProfit: number }> {
    try {
      const orders = await prisma.order.findMany({
        where: { shop, createdAt: { gte: startDate, lte: endDate } },
      });

      const adSpends = await prisma.adSpendDaily.findMany({
        where: { shop, date: { gte: startDate, lte: endDate } },
      });

      const totalAdSpend = adSpends.reduce((sum: number, ad: any) => addMoney(sum, ad.spend), 0);

      const cogsDict = await this.getCOGS(shop);
      const rawSettings = await prisma.storeSettings.findUnique({ where: { shop } });
      const settings = this.getSettings(rawSettings);

      let grossProfit = 0;

      for (const o of orders) {
        const cleanId = o.productId || "";
        const hasCogs = cogsDict[cleanId] !== undefined;
        const c = hasCogs ? cogsDict[cleanId] : (roundMoney(o.totalPrice) * (settings.defaultCOGSPct / 100));

        const effectiveCogs = (o as any).cogsAtTimeOfOrder !== null && (o as any).cogsAtTimeOfOrder !== undefined ? (o as any).cogsAtTimeOfOrder : c;
        const { profit } = this.calculateOrderProfit(o, effectiveCogs, settings);
        
        // The profit calculated by calculateOrderProfit already does:
        // Revenue - COGS - Logistics - Gateway - Packaging - COD - Taxes
        // And Shopify's totalPrice is already net of discounts.
        grossProfit = addMoney(grossProfit, profit);
      }

      // Subtract refunds and ads (Refunds can be integrated if we have a refund model, currently omitting refunds per schema limits, assuming fulfillmentStatus takes care of RTOs)
      const profitAfterAds = subtractMoney(grossProfit, totalAdSpend);

      return {
        profitAfterAds,
        totalAdSpend,
        grossProfit
      };
    } catch (err) {
      console.error(`[getProfitAfterAds] Error calculating profit after ads for ${shop}:`, err);
      return { profitAfterAds: 0, totalAdSpend: 0, grossProfit: 0 };
    }
  }

  /**
   * Backward-compatible calculate method for api.profit.ts and health.service.ts
   */
  static async calculate(shop: string, limit: number = 100) {
    try {
      const orders = await prisma.order.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      const cogsDict = await this.getCOGS(shop);
      const rawSettings = await prisma.storeSettings.findUnique({ where: { shop } });
      const settings = this.getSettings(rawSettings);

      const results: ProfitOrder[] = [];
      let totalRevenue = 0;
      let totalCOGS = 0;
      let totalFees = 0;
      let totalProfit = 0;

      for (const o of orders) {
        const totalPrice = roundMoney(o.totalPrice);
        const cleanId = o.productId || "";
        const hasCogs = cogsDict[cleanId] !== undefined;
        const c = hasCogs ? cogsDict[cleanId] : (totalPrice * (settings.defaultCOGSPct / 100));

        const effectiveCogs = (o as any).cogsAtTimeOfOrder !== null && (o as any).cogsAtTimeOfOrder !== undefined ? (o as any).cogsAtTimeOfOrder : c;
        const { profit, fees, margin, shippingProfit, shippingLoss } = this.calculateOrderProfit(o, effectiveCogs, settings);

        const isRto = isRtoStatus(o.fulfillmentStatus);
        const finalRevenue = isRto ? 0 : totalPrice;
        const finalCogs = isRto ? 0 : roundMoney(effectiveCogs);

        results.push({
          orderId: o.id,
          orderNumber: o.orderNumber || 0,
          revenue: finalRevenue,
          cogs: finalCogs,
          fees: roundMoney(fees),
          profit: roundMoney(profit),
          margin: roundMoney(margin),
          shippingProfit,
          shippingLoss,
          createdAt: o.createdAt || new Date(),
        });

        totalRevenue = addMoney(totalRevenue, finalRevenue);
        totalCOGS = addMoney(totalCOGS, finalCogs);
        totalFees = addMoney(totalFees, fees);
        totalProfit = addMoney(totalProfit, profit);
      }

      const avgMargin = totalRevenue > 0 ? roundMoney((totalProfit / totalRevenue) * 100) : 0;

      const summary: ProfitSummary = {
        totalRevenue,
        totalCOGS,
        totalFees,
        totalProfit,
        avgMargin,
        orderCount: orders.length,
      };

      return { orders: results, summary };
    } catch (err) {
      console.error(`[calculate] Error in ProfitService.calculate for ${shop}:`, err);
      return {
        orders: [],
        summary: { totalRevenue: 0, totalCOGS: 0, totalFees: 0, totalProfit: 0, avgMargin: 0, orderCount: 0 },
      };
    }
  }
}
