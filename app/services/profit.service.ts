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

export class ProfitService {
  /**
   * Centralized formula to calculate profit for a single order.
   * Profit = Revenue - COGS - (Tax + Shipping + Gateway Fees + COD Handling Fees)
   */
  static calculateOrderProfit(
    order: { totalPrice: number; isCOD: boolean; totalTax: number; shippingPrice: number },
    cogs: number,
    settings: { defaultGatewayFeePct: number; defaultCODHandling: number }
  ): { profit: number; fees: number; margin: number } {
    const gatewayFee = order.isCOD ? 0 : order.totalPrice * (settings.defaultGatewayFeePct / 100);
    const codFee = order.isCOD ? settings.defaultCODHandling : 0;
    const fees = order.totalTax + order.shippingPrice + gatewayFee + codFee;
    const profit = order.totalPrice - cogs - fees;
    const margin = order.totalPrice > 0 ? (profit / order.totalPrice) * 100 : 0;
    return { profit, fees, margin };
  }

  /**
   * Calculate profit for all orders of a store
   */
  static async calculate(shop: string, limit: number = 100) {
    logDev(`[ProfitService.calculate] Initiating calculation for shop: ${shop}, limit: ${limit}`);
    
    // Fetch orders from database
    const orders = await prisma.order.findMany({
      where: { shop },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    logDev(`[ProfitService.calculate] Fetched ${orders.length} orders from database`);

    // Fetch COGS for this store
    const cogsRecords = await prisma.productCOGS.findMany({
      where: { shop },
    });
    logDev(`[ProfitService.calculate] Fetched ${cogsRecords.length} COGS records`);

    const cogsMap = new Map<string, number>();
    cogsRecords.forEach((record: any) => {
      cogsMap.set(record.productId, record.cogs);
    });

    // Fetch logistics settings defaults
    const settings = await prisma.storeSettings.findUnique({ where: { shop } }) || {
      defaultForwardShipping: 60,
      defaultReturnShipping: 70,
      defaultCODHandling: 40,
      defaultPackaging: 10,
      defaultGatewayFeePct: 2,
    };

    // Calculate profit per order
    const results: ProfitOrder[] = [];
    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalFees = 0;
    let totalProfit = 0;

    for (const order of orders) {
      // Get COGS (fallback to 40% of revenue if not set)
      const cogs = cogsMap.get(order.productId || '') ?? order.totalPrice * 0.4;
      const { profit, fees, margin } = this.calculateOrderProfit(order, cogs, settings);

      results.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        revenue: order.totalPrice,
        cogs,
        fees,
        profit,
        margin,
        createdAt: order.createdAt,
      });

      totalRevenue += order.totalPrice;
      totalCOGS += cogs;
      totalFees += fees;
      totalProfit += profit;
    }

    const summary: ProfitSummary = {
      totalRevenue,
      totalCOGS,
      totalFees,
      totalProfit,
      avgMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      orderCount: orders.length,
    };
    logDev(`[ProfitService.calculate] Summary calculated:`, summary);

    return {
      orders: results,
      summary,
    };
  }

  /**
   * Save COGS for a product
   */
  static async saveCOGS(shop: string, productId: string, cogs: number) {
    logInfo(`[ProfitService.saveCOGS] Saving COGS: shop=${shop}, productId=${productId}, cogs=${cogs}`);
    if (cogs < 0) throw new Error('COGS cannot be negative');

    const id = `${shop}_${productId}`;

    const record = await prisma.productCOGS.upsert({
      where: { id },
      update: {
        cogs,
        updatedAt: new Date(),
      },
      create: {
        id,
        shop,
        productId,
        cogs,
        updatedAt: new Date(),
      },
    });
    logInfo(`[ProfitService.saveCOGS] Successfully saved COGS: id=${record.id}, cogs=${record.cogs}`);
    return record;
  }

  /**
   * Get all COGS for a store
   */
  static async getCOGS(shop: string) {
    logDev(`[ProfitService.getCOGS] Fetching all COGS mappings for shop: ${shop}`);
    const records = await prisma.productCOGS.findMany({
      where: { shop },
    });
    const map: Record<string, number> = {};
    records.forEach((r: any) => {
      map[r.productId] = r.cogs;
    });
    logDev(`[ProfitService.getCOGS] Mapped ${records.length} COGS records`);
    return map;
  }

  /**
   * Sync orders from Shopify to database
   */
  static async syncOrders(shop: string, orders: any[]) {
    logInfo(`[ProfitService.syncOrders] Syncing ${orders.length} orders for shop: ${shop}`);
    let count = 0;
    for (const order of orders) {
      const existing = await prisma.order.findUnique({
        where: { id: order.id },
      });

      if (!existing) {
        await prisma.order.create({
          data: {
            id: order.id,
            shop,
            orderNumber: order.orderNumber,
            totalPrice: order.totalPrice,
            subtotalPrice: order.subtotalPrice,
            totalTax: order.totalTax,
            shippingPrice: order.shippingPrice,
            createdAt: order.createdAt,
            processedAt: order.processedAt || order.createdAt,
            financialStatus: order.financialStatus || 'pending',
            fulfillmentStatus: order.fulfillmentStatus || 'unfulfilled',
          },
        });
        count++;
      }
    }
    logInfo(`[ProfitService.syncOrders] Sync completed. Created ${count} new orders.`);
    return count;
  }
}