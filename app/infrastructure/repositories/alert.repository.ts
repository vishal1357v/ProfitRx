import prisma from "../../db.server";

export interface AlertRecord {
  id: string;
  shop: string;
  type: string;
  severity: string;
  message: string;
  data: any;
  isRead: boolean;
  createdAt: Date;
  readAt: Date | null;
}

export class AlertRepository {
  /**
   * Find unread (active) alerts for a shop.
   */
  static async findActiveByShop(shop: string, limit?: number): Promise<AlertRecord[]> {
    return prisma.alert.findMany({
      where: { shop, isRead: false },
      orderBy: { createdAt: "desc" },
      ...(limit ? { take: limit } : {}),
    });
  }

  /**
   * Find resolved (read) alerts for a shop.
   */
  static async findResolvedByShop(shop: string, limit = 15): Promise<AlertRecord[]> {
    return prisma.alert.findMany({
      where: { shop, isRead: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Create a store alert with shop isolation.
   */
  static async createAlert(
    shop: string,
    data: {
      type: string;
      severity: string;
      message: string;
      data?: any;
    }
  ): Promise<AlertRecord> {
    return prisma.alert.create({
      data: {
        shop,
        type: data.type,
        severity: data.severity,
        message: data.message,
        data: data.data || null,
        isRead: false,
      },
    });
  }

  /**
   * Mark alert as resolved/read.
   */
  static async resolveAlert(shop: string, alertId: string): Promise<AlertRecord | null> {
    const existing = await prisma.alert.findUnique({ where: { id: alertId } });
    if (!existing || existing.shop !== shop) return null;

    return prisma.alert.update({
      where: { id: alertId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Mark all active alerts as read for a shop.
   */
  static async resolveAll(shop: string): Promise<{ count: number }> {
    return prisma.alert.updateMany({
      where: { shop, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }
}
