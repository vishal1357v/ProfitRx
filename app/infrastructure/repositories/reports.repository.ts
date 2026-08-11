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
