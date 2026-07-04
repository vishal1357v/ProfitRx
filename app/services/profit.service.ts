/* eslint-disable @typescript-eslint/no-explicit-any */
import prisma from "../db.server";
import { logDev, logInfo } from "../utils/logger";

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

export class ProfitService {
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
   * Profit = Revenue - COGS - (Tax + Shipping + Gateway Fees + COD Handling Fees + Packaging)
   */
  static calculateOrderProfit(
    order: { totalPrice: number; isCOD: boolean; totalTax: number; shippingPrice: number },
    cogs: number,
    settings: { defaultGatewayFeePct: number; defaultCODHandling: number; defaultForwardShipping: number; gatewayFixedFee?: number; defaultPackaging?: number }
  ): { profit: number; fees: number; margin: number } {
    const gatewayFixed = settings.gatewayFixedFee || 0;
    const packaging = settings.defaultPackaging || 10;
    const gatewayFee = order.isCOD ? 0 : (order.totalPrice * (settings.defaultGatewayFeePct / 100)) + gatewayFixed;
    const codFee = order.isCOD ? settings.defaultCODHandling : 0;
    const fees = order.totalTax + settings.defaultForwardShipping + gatewayFee + codFee + packaging;
    const profit = order.totalPrice - cogs - fees;
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

    for (const o of orders) {
      packagingCosts += settings.defaultPackaging;
      forwardShipping += settings.defaultForwardShipping;

      if (o.isCOD) {
        codHandlingFees += settings.defaultCODHandling;
        if (o.fulfillmentStatus === "RTO") {
          returnShipping += settings.defaultReturnShipping;
        }
      } else {
        gatewayFees += (o.totalPrice * (settings.defaultGatewayFeePct / 100)) + settings.gatewayFixedFee;
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
      const orderTax = o.totalTax > 0 ? o.totalTax : (o.subtotalPrice * (settings.gstRate / 100));
      totalTaxableSales += o.subtotalPrice || (o.totalPrice - orderTax);
      totalGstCollected += orderTax;

      // Classify Intra-state vs Inter-state based on state/province matching default (e.g. MH / Maharashtra)
      const isIntraState = o.province ? /maharashtra|mh/i.test(o.province) : true;

      if (isIntraState) {
        intraStateSales += o.totalPrice;
        cgst += orderTax / 2;
        sgst += orderTax / 2;
      } else {
        interStateSales += o.totalPrice;
        igst += orderTax;
      }

      // HSN aggregation
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
        cogs: c,
        fees,
        profit,
        margin,
        createdAt: o.createdAt,
      });

      totalRevenue += o.totalPrice;
      totalCOGS += c;
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