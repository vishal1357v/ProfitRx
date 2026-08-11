import prisma from "../../db.server";

export interface AdSpendRecord {
  id: string;
  shop: string;
  platform: string;
  accountId: string | null;
  isConnected: boolean;
  month: string | null;
  channel: string | null;
  amount: number | null;
  lastSyncedAt: Date | null;
  updatedAt: Date;
}

export class AdSpendRepository {
  /**
   * Find ad spend records for a shop with multi-tenant isolation.
   */
  static async findByShop(shop: string, limit = 24): Promise<AdSpendRecord[]> {
    return prisma.adSpend.findMany({
      where: { shop },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
  }

  /**
   * Upsert manual ad spend for a channel / month with shop isolation.
   */
  static async upsertManualSpend(
    shop: string,
    data: { month: string; channel: string; amount: number }
  ): Promise<AdSpendRecord> {
    const platform = data.channel.toLowerCase();

    return prisma.adSpend.upsert({
      where: { shop_platform: { shop, platform } },
      create: {
        shop,
        platform,
        channel: data.channel,
        month: data.month,
        amount: data.amount,
        isConnected: false,
      },
      update: {
        amount: data.amount,
        month: data.month,
        channel: data.channel,
      },
    });
  }

  /**
   * Compute bounded daily revenue for 30-day historical charts with shop isolation.
   */
  static async getDailyRevenue(shop: string, days = 30): Promise<Array<{ date: string; revenue: number }>> {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const orders = await prisma.order.findMany({
      where: {
        shop,
        createdAt: { gte: sinceDate },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, totalPrice: true },
    });

    const dailyRevenue: Record<string, number> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      dailyRevenue[ds] = 0;
    }

    orders.forEach((o) => {
      const ds = o.createdAt.toISOString().split("T")[0];
      if (dailyRevenue[ds] !== undefined) {
        dailyRevenue[ds] += o.totalPrice || 0;
      }
    });

    return Object.entries(dailyRevenue).map(([date, revenue]) => ({
      date: date.substring(8) + "/" + date.substring(5, 7),
      revenue: Math.round(revenue),
    }));
  }
}
