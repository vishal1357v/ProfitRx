import prisma from "../../db.server";

export interface CogsStatus {
  hasCustomCogs: boolean;
  configuredProductCount: number;
  defaultCogsPct: number;
}

export interface AffectedOrderLeak {
  id: string;
  orderNumber: number;
  totalPrice: number;
  leakAmount: number;
  leakType: "rto" | "shipping" | "discount";
  reason: string;
  createdAt: Date;
}

export class ProfitRepository {
  /**
   * Fetch all orders for profit leak computation with multi-tenant isolation.
   */
  static async getOrdersForProfitAnalysis(shop: string): Promise<any[]> {
    return prisma.order.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Determine whether COGS are explicitly configured or estimated via fallback.
   */
  static async getCogsStatus(shop: string): Promise<CogsStatus> {
    const [cogsCount, storeSettings] = await Promise.all([
      prisma.productCOGS.count({ where: { shop } }),
      prisma.storeSettings.findUnique({ where: { shop } }),
    ]);

    return {
      hasCustomCogs: cogsCount > 0,
      configuredProductCount: cogsCount,
      defaultCogsPct: storeSettings?.defaultCOGSPct ?? 40,
    };
  }

  /**
   * Retrieve specific orders affected by profit leaks for drill-down into Order Intelligence.
   */
  static async getAffectedLeakOrders(
    shop: string,
    limit = 10
  ): Promise<AffectedOrderLeak[]> {
    const [rtoEvents, orders, storeSettings] = await Promise.all([
      prisma.rTOEvent.findMany({
        where: { shop },
        orderBy: { amount: "desc" },
        take: limit,
      }),
      prisma.order.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.storeSettings.findUnique({ where: { shop } }),
    ]);

    const affected: AffectedOrderLeak[] = [];
    const seenOrderIds = new Set<string>();

    // 1. Add top RTO event orders
    for (const event of rtoEvents) {
      if (!seenOrderIds.has(event.orderId)) {
        seenOrderIds.add(event.orderId);
        const order = orders.find((o) => o.id === event.orderId);
        affected.push({
          id: event.orderId,
          orderNumber: event.orderNumber,
          totalPrice: order?.totalPrice || event.amount,
          leakAmount: event.amount,
          leakType: "rto",
          reason: event.reason || "Shipment Return to Origin / COD Failure",
          createdAt: event.createdAt,
        });
      }
    }

    // 2. Add top discount / shipping loss orders if available
    const standardShippingBaseline = storeSettings?.defaultForwardShipping || 60;
    for (const order of orders) {
      if (seenOrderIds.has(order.id)) continue;

      if ((order.discountAmount || 0) > 200) {
        seenOrderIds.add(order.id);
        affected.push({
          id: order.id,
          orderNumber: order.orderNumber,
          totalPrice: order.totalPrice,
          leakAmount: order.discountAmount,
          leakType: "discount",
          reason: `High discount applied (₹${order.discountAmount.toLocaleString("en-IN")})`,
          createdAt: order.createdAt,
        });
      } else if (order.actualShippingCost && order.actualShippingCost > standardShippingBaseline) {
        const shippingOver = order.actualShippingCost - (order.shippingPrice || 0);
        if (shippingOver > 50) {
          seenOrderIds.add(order.id);
          affected.push({
            id: order.id,
            orderNumber: order.orderNumber,
            totalPrice: order.totalPrice,
            leakAmount: Math.round(shippingOver),
            leakType: "shipping",
            reason: `Logistics overage (Charged ₹${order.shippingPrice || 0}, Cost ₹${order.actualShippingCost})`,
            createdAt: order.createdAt,
          });
        }
      }

      if (affected.length >= limit) break;
    }

    return affected.sort((a, b) => b.leakAmount - a.leakAmount).slice(0, limit);
  }
}
