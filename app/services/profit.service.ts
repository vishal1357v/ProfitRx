/* eslint-disable @typescript-eslint/no-explicit-any */
import prisma from "../db.server";

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

function isCodOrder(order: { isCOD: boolean; gateway?: string | null }): boolean {
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
      defaultCODHandling: settings?.defaultCODHandling ?? 40,
      defaultPackaging: settings?.defaultPackaging ?? 10,
      defaultGatewayFeePct: settings?.defaultGatewayFeePct ?? 2,
      gatewayFixedFee: settings?.gatewayFixedFee ?? 0,
      shopifyPlanName: settings?.shopifyPlanName || "Basic",
      gstin: settings?.gstin || "",
      gstRate: settings?.gstRate ?? 18,
      isGstRegistered: settings?.isGstRegistered ?? false,
      hsnCodes: settings?.hsnCodes || {},
      rtoDetectionPattern: settings?.rtoDetectionPattern || "rto,returned,undelivered,failed_delivery,rto-initiated,rto_initiated,shipped-rto,shiprocket-rto,delhivery_rto,rto-delhivery,rto-bluedart,return-to-origin,returned-to-sender",
      rtoThreshold: settings?.rtoThreshold ?? 10,
      marginThreshold: settings?.marginThreshold ?? 15,
      alertEmail: settings?.alertEmail || "",
      syncCapped: settings?.syncCapped ?? false,
    };
  }

  /**
   * Centralized formula to calculate profit for a single order.
   * Uses cogsAtTimeOfOrder snapshot if available to preserve historical accuracy.
   * Gateway_Fee (Prepaid) = ((Order_Total * Razorpay_Rate) + (Order_Total * Shopify_Surcharge_Rate) + Fixed_Fee) * 1.18 (18% GST)
   * Gateway_Fee (COD) = 0. COD Handling Fee applied instead.
   */
  static calculateOrderProfit(
    order: { totalPrice: number; isCOD: boolean; gateway?: string | null; totalTax: number; shippingPrice: number; cogsAtTimeOfOrder?: number | null },
    cogs: number,
    settings: { defaultGatewayFeePct: number; defaultCODHandling: number; defaultForwardShipping: number; gatewayFixedFee?: number; defaultPackaging?: number; shopifyPlanName?: string }
  ): { profit: number; fees: number; margin: number } {
    const effectiveCogs = (order.cogsAtTimeOfOrder !== null && order.cogsAtTimeOfOrder !== undefined) ? order.cogsAtTimeOfOrder : cogs;
    const gatewayFixed = settings.gatewayFixedFee || 0;
    const packaging = settings.defaultPackaging || 10;

    const isCod = isCodOrder(order);

    let gatewayFee = 0;
    let codFee = 0;

    if (isCod) {
      gatewayFee = 0; // Strictly 0 gateway fee for COD orders
      codFee = settings.defaultCODHandling;
    } else {
      const razorpayRate = (settings.defaultGatewayFeePct || 2) / 100;
      const shopifySurchargeRate = this.getShopifySurchargeRate(settings.shopifyPlanName);
      const rawGatewayFee = (order.totalPrice * razorpayRate) + (order.totalPrice * shopifySurchargeRate) + gatewayFixed;
      gatewayFee = rawGatewayFee * 1.18; // Apply 18% GST to payment gateway fees
    }

    const fees = order.totalTax + settings.defaultForwardShipping + gatewayFee + codFee + packaging;
    const profit = order.totalPrice - effectiveCogs - fees;
    const margin = order.totalPrice > 0 ? (profit / order.totalPrice) * 100 : 0;
    return { profit, fees, margin };
  }

  /**
   * Calculate detailed fee breakdown across all store orders
   */
  static async getFeeBreakdown(shop: string): Promise<FeeBreakdown> {
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
      packagingCosts += settings.defaultPackaging;
      forwardShipping += settings.defaultForwardShipping;

      const isCod = isCodOrder(o as any);
      if (isCod) {
        codHandlingFees += settings.defaultCODHandling;
        if (o.fulfillmentStatus === "RTO") {
          returnShipping += settings.defaultReturnShipping;
        }
      } else {
        const rawFee = (o.totalPrice * razorpayRate) + (o.totalPrice * shopifySurchargeRate) + settings.gatewayFixedFee;
        gatewayFees += rawFee * 1.18;
      }
    }

    const totalFees = gatewayFees + codHandlingFees + forwardShipping + returnShipping + packagingCosts;

    return {
      gatewayFees: Math.round(gatewayFees),
      codHandlingFees: Math.round(codHandlingFees),
      forwardShipping: Math.round(forwardShipping),
      returnShipping: Math.round(returnShipping),
      packagingCosts: Math.round(packagingCosts),
      totalFees: Math.round(totalFees),
    };
  }

  /**
   * Calculate GST Tax breakdown (CGST, SGST, IGST, HSN-wise sales)
   */
  static async getGSTSummary(shop: string): Promise<GSTSummary> {
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
      const orderTax = o.totalTax || 0;
      const taxablePrice = Math.max(0, o.totalPrice - orderTax);
      totalTaxableSales += taxablePrice;
      totalGstCollected += orderTax;

      const merchantState = "MAHARASHTRA";
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
      hsnMap[hsnCode].sales += o.totalPrice;
      hsnMap[hsnCode].tax += orderTax;
    }

    const hsnSummary = Object.entries(hsnMap).map(([hsnCode, data]) => ({
      hsnCode,
      sales: Math.round(data.sales),
      tax: Math.round(data.tax),
    }));

    return {
      gstin: settings.gstin,
      isGstRegistered: settings.isGstRegistered,
      defaultGstRate: settings.gstRate,
      totalTaxableSales: Math.round(totalTaxableSales),
      totalGstCollected: Math.round(totalGstCollected),
      cgst: Math.round(cgst),
      sgst: Math.round(sgst),
      igst: Math.round(igst),
      intraStateSales: Math.round(intraStateSales),
      interStateSales: Math.round(interStateSales),
      hsnSummary,
    };
  }

  /**
   * Fetch COGS dictionary
   */
  static async getCOGS(shop: string): Promise<Record<string, number>> {
    const cogsRecords = await prisma.productCOGS.findMany({ where: { shop } });
    const cogsDict: Record<string, number> = {};
    cogsRecords.forEach((r: any) => {
      const eff = r.manualOverride ?? r.shopifyNative ?? r.cost ?? (r.cogs > 0 ? r.cogs : undefined);
      if (eff !== undefined && eff !== null) {
        cogsDict[r.productId] = eff;
      }
    });
    return cogsDict;
  }

  /**
   * Backward-compatible calculate method for api.profit.ts and health.service.ts
   */
  static async calculate(shop: string, limit: number = 100) {
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
      const c = cogsDict[o.productId || ""] || 0;
      const { profit, fees, margin } = this.calculateOrderProfit(o, c, settings);

      results.push({
        orderId: o.id,
        orderNumber: o.orderNumber,
        revenue: o.totalPrice,
        cogs: (o as any).cogsAtTimeOfOrder ?? c,
        fees,
        profit,
        margin,
        createdAt: o.createdAt,
      });

      totalRevenue += o.totalPrice;
      totalCOGS += (o as any).cogsAtTimeOfOrder ?? c;
      totalFees += fees;
      totalProfit += profit;
    }

    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    const summary: ProfitSummary = {
      totalRevenue: Math.round(totalRevenue),
      totalCOGS: Math.round(totalCOGS),
      totalFees: Math.round(totalFees),
      totalProfit: Math.round(totalProfit),
      avgMargin: Math.round(avgMargin * 10) / 10,
      orderCount: orders.length,
    };

    return { orders: results, summary };
  }
}