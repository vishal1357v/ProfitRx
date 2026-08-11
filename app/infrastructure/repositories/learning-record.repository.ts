import prisma from "../../db.server";

export class LearningRecordRepository {
  /**
   * Persists a Learning Record to the DB without the Domain layer needing to know about Prisma.
   */
  static async saveRecord(shopId: string, orderId: string, recordData: any): Promise<void> {
    try {
      const fullOrderId = orderId.includes("gid://") ? orderId : `gid://shopify/Order/${orderId}`;
      await prisma.learningRecord.create({
        data: {
          shop: shopId,
          orderId: fullOrderId,
          predictedRto: recordData.predictedRto || 0,
          actualRto: recordData.actualRto || false,
          features: recordData.features || {}
        }
      });
      console.log(`[Repository] Saved Learning Record for ${orderId}`);
    } catch (e: any) {
      console.error(`[Repository] Failed to save learning record for ${orderId}`, e.message);
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
