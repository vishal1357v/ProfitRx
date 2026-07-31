/* eslint-disable @typescript-eslint/no-explicit-any */
import prisma from "../db.server";
import { resolveEffectiveCOGS } from "../utils/cogs";

export interface ProfitOrder {
  orderId: string;
  orderNumber: number;
  revenue: number;
  cogs: number;
  fees: number;
  profit: number;
  margin: number;
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

function isCodOrder(order: { isCOD?: boolean; gateway?: string | null }): boolean {
  if (order.isCOD) return true;
  if (!order.gateway) return false;
  const lower = order.gateway.toLowerCase();
  return COD_KEYWORDS.some((kw) => lower.includes(kw));
}

export class ProfitService {
  /**
   * Determine Shopify transaction surcharge rate based on merchant's Shopify plan.
   * Basic = 2.0%, Shopify/Grow = 1.0%, Advanced = 0.6%, Plus = 0.15%
   */
  static getShopifySurchargeRate(planName?: string | null): number {
    if (!planName) return 0.02;
    const name = planName.toLowerCase();
    if (name.includes("plus")) return 0.0015;
    if (name.includes("advanced")) return 0.006;
    if (name.includes("shopify") || name.includes("grow")) return 0.01;
    return 0.02; // Default Basic / Starter 2.0%
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
    if (!weightGrams || weightGrams <= 0 || !slabs || !Array.isArray(slabs) || slabs.length === 0) {
      return { forward: defaultForward, returnShip: defaultReturn };
    }
    const sorted = [...slabs].sort((a, b) => (Number(a.maxWeightGrams) || 0) - (Number(b.maxWeightGrams) || 0));
    for (const slab of sorted) {
      const maxWeight = Number(slab.maxWeightGrams) || 0;
      if (weightGrams <= maxWeight) {
        return {
          forward: Number(slab.forwardCost) ?? defaultForward,
          returnShip: Number(slab.returnCost) ?? defaultReturn
        };
      }
    }
    const heaviest = sorted[sorted.length - 1];
    return {
      forward: Number(heaviest.forwardCost) ?? defaultForward,
      returnShip: Number(heaviest.returnCost) ?? defaultReturn
    };
  }

  static calculateOrderProfit(
    order: { totalPrice?: number; isCOD?: boolean; gateway?: string | null; totalTax?: number; shippingPrice?: number; cogsAtTimeOfOrder?: number | null; partialDepositCollected?: number; fulfillmentStatus?: string; totalWeight?: number | null },
    cogs: number,
    settings: { defaultGatewayFeePct: number; defaultCODHandling: number; defaultForwardShipping: number; defaultReturnShipping?: number; gatewayFixedFee?: number; defaultPackaging?: number; shopifyPlanName?: string; shippingSlabs?: any[] | null }
  ): { profit: number; fees: number; margin: number } {
    const isRto = order.fulfillmentStatus === "RTO";
    const totalPrice = isRto ? 0 : (Number(order.totalPrice) || 0);
    const totalTax = isRto ? 0 : (Number(order.totalTax) || 0);
    const effectiveCogs = isRto ? 0 : ((order.cogsAtTimeOfOrder !== null && order.cogsAtTimeOfOrder !== undefined && !isNaN(order.cogsAtTimeOfOrder)) ? Number(order.cogsAtTimeOfOrder) : (Number(cogs) || 0));
    const gatewayFixed = Number(settings.gatewayFixedFee) || 0;
    const packaging = Number(settings.defaultPackaging) || 10;
    
    const defaultForward = Number(settings.defaultForwardShipping) || 60;
    const defaultReturn = Number(settings.defaultReturnShipping) || 70;
    const { forward: forwardShipping, returnShip } = this.getSlabShippingCosts(
      order.totalWeight,
      settings.shippingSlabs,
      defaultForward,
      defaultReturn
    );

    const codHandling = Number(settings.defaultCODHandling) || 50;
    const isCod = isCodOrder(order);

    let gatewayFee = 0;
    let codFee = 0;

    if (!isRto) {
      if (isCod) {
        gatewayFee = 0; // Strictly 0 gateway fee for COD orders
        codFee = codHandling;
      } else {
        const razorpayRate = (Number(settings.defaultGatewayFeePct) || 2) / 100;
        const shopifySurchargeRate = this.getShopifySurchargeRate(settings.shopifyPlanName);
        const rawGatewayFee = (totalPrice * razorpayRate) + (totalPrice * shopifySurchargeRate) + gatewayFixed;
        gatewayFee = rawGatewayFee * 1.18; // Apply 18% GST to payment gateway fees
      }
    }

    const returnShipping = isRto ? returnShip : 0;
    const fees = totalTax + forwardShipping + returnShipping + gatewayFee + codFee + packaging;
    const profit = totalPrice - effectiveCogs - fees;
    const margin = totalPrice > 0 ? (profit / totalPrice) * 100 : 0;

    return {
      profit: isNaN(profit) ? 0 : profit,
      fees: isNaN(fees) ? 0 : fees,
      margin: isNaN(margin) ? 0 : margin,
    };
  }

  /**
   * Calculate net RTO loss for an undelivered order.
   * Upfront partial deposit collected (e.g. ₹100) offsets return shipping loss.
   */
  static calculateRTOLoss(
    order: { isCOD?: boolean; gateway?: string | null; fulfillmentStatus?: string; partialDepositCollected?: number },
    settings: { defaultForwardShipping: number; defaultReturnShipping: number; defaultCODHandling?: number; defaultPackaging?: number }
  ): number {
    const forward = Number(settings.defaultForwardShipping) || 60;
    const returnShip = Number(settings.defaultReturnShipping) || 70;
    const packaging = Number(settings.defaultPackaging) || 10;
    const codHandling = isCodOrder(order) ? (Number(settings.defaultCODHandling) || 50) : 0;
    
    const rawLoss = forward + returnShip + packaging + codHandling;
    const deposit = Number(order.partialDepositCollected) || 0;
    return Math.max(0, rawLoss - deposit);
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
        forwardShipping += settings.defaultForwardShipping;

        const isCod = isCodOrder(o as any);
        if (isCod) {
          codHandlingFees += settings.defaultCODHandling;
          if (o.fulfillmentStatus === "RTO") {
            returnShipping += settings.defaultReturnShipping;
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

        const merchantState = (settings.merchantState || "MAHARASHTRA").toUpperCase();
        const customerState = (o.province || "").toUpperCase();

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
        }
      });
      return cogsDict;
    } catch (err) {
      console.error(`[getCOGS] Error fetching COGS for ${shop}:`, err);
      return {};
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
        const totalPrice = Number(o.totalPrice) || 0;
        const cleanId = o.productId || "";
        const hasCogs = cogsDict[cleanId] !== undefined;
        const c = hasCogs ? cogsDict[cleanId] : (totalPrice * settings.defaultCOGSPct / 100);

        const effectiveCogs = (o as any).cogsAtTimeOfOrder !== null && (o as any).cogsAtTimeOfOrder !== undefined ? (o as any).cogsAtTimeOfOrder : c;
        const { profit, fees, margin } = this.calculateOrderProfit(o, effectiveCogs, settings);

        const isRto = o.fulfillmentStatus === "RTO";
        const finalRevenue = isRto ? 0 : totalPrice;
        const finalCogs = isRto ? 0 : effectiveCogs;

        results.push({
          orderId: o.id,
          orderNumber: o.orderNumber || 0,
          revenue: finalRevenue,
          cogs: Number(finalCogs) || 0,
          fees: Number(fees) || 0,
          profit: Number(profit) || 0,
          margin: Number(margin) || 0,
          createdAt: o.createdAt || new Date(),
        });

        totalRevenue += finalRevenue;
        totalCOGS += Number(finalCogs) || 0;
        totalFees += Number(fees) || 0;
        totalProfit += Number(profit) || 0;
      }

      const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      const summary: ProfitSummary = {
        totalRevenue: Math.round(totalRevenue) || 0,
        totalCOGS: Math.round(totalCOGS) || 0,
        totalFees: Math.round(totalFees) || 0,
        totalProfit: Math.round(totalProfit) || 0,
        avgMargin: Math.round(avgMargin * 10) / 10 || 0,
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