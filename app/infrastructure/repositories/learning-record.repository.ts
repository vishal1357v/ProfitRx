import prisma from "../../db.server";

export class LearningRecordRepository {
  /**
   * Persists a Learning Record to the DB without the Domain layer needing to know about Prisma.
   */
  static async saveRecord(shopId: string, orderId: string, recordData: any): Promise<void> {
    try {
      const decodedId = decodeURIComponent(orderId);
      const rawId = decodedId.replace("gid://shopify/Order/", "");
      const gid = `gid://shopify/Order/${rawId}`;

      // Query parent Order in DB to ensure matching foreign key
      const existingOrder = await prisma.order.findFirst({
        where: {
          shop: shopId,
          id: { in: [orderId, rawId, gid, decodedId] },
        },
        select: { id: true },
      });

      const matchedOrderId = existingOrder ? existingOrder.id : orderId;

      await prisma.learningRecord.create({
        data: {
          shop: shopId,
          orderId: matchedOrderId,
          predictedRto: recordData.predictedRto || (recordData.riskBefore !== undefined ? recordData.riskBefore * 100 : 0),
          actualRto: recordData.actualRto || false,
          features: recordData.features || {},
        },
      });
      console.log(`[Repository] Saved Learning Record for ${matchedOrderId}`);
    } catch (e: any) {
      console.error(`[Repository] Failed to save learning record for ${orderId}:`, e.message);
    }
  }

  static async findByOrderId(shopId: string, orderId: string): Promise<any[]> {
    const decodedId = decodeURIComponent(orderId);
    const gid = decodedId.startsWith("gid://") ? decodedId : `gid://shopify/Order/${decodedId}`;
    const rawId = decodedId.replace("gid://shopify/Order/", "");

    return prisma.learningRecord.findMany({
      where: {
        shop: shopId,
        orderId: { in: [gid, rawId, decodedId] }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}
