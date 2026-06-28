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

export class ProfitService {
  /**
   * Calculate profit for all orders of a store
   */
  static async calculate(shop: string, limit: number = 100) {
    console.log(`[ProfitService.calculate] Initiating calculation for shop: ${shop}, limit: ${limit}`);
    
    // Fetch orders from database
    const orders = await prisma.order.findMany({
      where: { shop },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    console.log(`[ProfitService.calculate] Fetched ${orders.length} orders from database`);

    // Fetch COGS for this store
    const cogsRecords = await prisma.productCOGS.findMany({
      where: { shop },
    });
    console.log(`[ProfitService.calculate] Fetched ${cogsRecords.length} COGS records`);

    const cogsMap = new Map<string, number>();
    cogsRecords.forEach((record: any) => {
      cogsMap.set(record.productId, record.cogs);
    });

    // Calculate profit per order
    const results: ProfitOrder[] = [];
    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalFees = 0;
    let totalProfit = 0;

    for (const order of orders) {
      // Get COGS (fallback to 40% of revenue if not set)
      const cogs = cogsMap.get(order.productId || '') ?? order.totalPrice * 0.4;
      const fees = order.totalTax + order.shippingPrice;
      const profit = order.totalPrice - cogs - fees;
      const margin = order.totalPrice > 0 ? (profit / order.totalPrice) * 100 : 0;

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
    console.log(`[ProfitService.calculate] Summary calculated:`, summary);

    return {
      orders: results,
      summary,
    };
  }

  /**
   * Save COGS for a product
   */
  static async saveCOGS(shop: string, productId: string, cogs: number) {
    console.log(`[ProfitService.saveCOGS] Saving COGS: shop=${shop}, productId=${productId}, cogs=${cogs}`);
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
    console.log(`[ProfitService.saveCOGS] Successfully saved COGS: id=${record.id}, cogs=${record.cogs}`);
    return record;
  }

  /**
   * Get all COGS for a store
   */
  static async getCOGS(shop: string) {
    console.log(`[ProfitService.getCOGS] Fetching all COGS mappings for shop: ${shop}`);
    const records = await prisma.productCOGS.findMany({
      where: { shop },
    });
    const map: Record<string, number> = {};
    records.forEach((r: any) => {
      map[r.productId] = r.cogs;
    });
    console.log(`[ProfitService.getCOGS] Mapped ${records.length} COGS records`);
    return map;
  }

  /**
   * Sync orders from Shopify to database
   */
  static async syncOrders(shop: string, orders: any[]) {
    console.log(`[ProfitService.syncOrders] Syncing ${orders.length} orders for shop: ${shop}`);
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
    console.log(`[ProfitService.syncOrders] Sync completed. Created ${count} new orders.`);
    return count;
  }
}