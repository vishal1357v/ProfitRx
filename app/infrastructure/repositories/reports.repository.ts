import prisma from "../../db.server";

export class ReportsRepository {
  /**
   * Find profit snapshots for reporting with shop isolation.
   */
  static async getProfitSnapshots(shop: string, limit = 90): Promise<any[]> {
    return prisma.profitSnapshot.findMany({
      where: { shop },
      orderBy: { date: "desc" },
      take: limit,
    });
  }

  /**
   * Find RTO events for reporting with shop isolation.
   */
  static async getRtoEvents(shop: string, limit = 100): Promise<any[]> {
    return prisma.rTOEvent.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Get orders for dynamic time-series profit reporting.
   */
  static async getOrdersForReports(shop: string, days = 90): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return prisma.order.findMany({
      where: {
        shop,
        createdAt: { gte: startDate },
      },
      select: {
        id: true,
        productId: true,
        totalPrice: true,
        totalTax: true,
        shippingPrice: true,
        cogsAtTimeOfOrder: true,
        fulfillmentStatus: true,
        isCOD: true,
        gateway: true,
        discountAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Find customer profiles for reporting with shop isolation.
   */
  static async getCustomerProfiles(shop: string, limit = 100): Promise<any[]> {
    return prisma.customerProfile.findMany({
      where: { shop },
      orderBy: { totalRevenue: "desc" },
      take: limit,
    });
  }

  /**
   * Get orders for product profit ranking with shop isolation.
   */
  static async getProductOrderMetrics(shop: string): Promise<any[]> {
    return prisma.order.findMany({
      where: { shop },
      select: {
        id: true,
        productId: true,
        totalPrice: true,
        totalTax: true,
        shippingPrice: true,
        cogsAtTimeOfOrder: true,
        fulfillmentStatus: true,
        isCOD: true,
        gateway: true,
        discountAmount: true,
        createdAt: true,
      },
    });
  }
}
