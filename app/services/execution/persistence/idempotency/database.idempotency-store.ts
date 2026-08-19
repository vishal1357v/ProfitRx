import { IdempotencyStore } from "./idempotency.store";
import prisma from "../../../../db.server";

export class DatabaseIdempotencyStore implements IdempotencyStore {
  /**
   * Parse the composite key into constituent parts:
   * Key pattern: `${shop}_${orderId}_${actionType}_${decisionVersion}`
   */
  private parseKey(key: string): { shop: string; orderId: string; actionType: string } {
    const colonParts = key.split(":");
    if (colonParts.length >= 3) {
      return { shop: colonParts[0], orderId: colonParts[1], actionType: colonParts[2] };
    }

    const parts = key.split("_");
    const shop = parts[0] || "unknown";
    const orderId = parts[1] || "unknown";
    const actionType = parts.length > 3 ? parts.slice(2, parts.length - 1).join("_") : (parts[2] || "EXECUTION");
    return { shop, orderId, actionType };
  }

  private async ensureParentOrder(shop: string, orderId: string): Promise<string> {
    const decodedId = decodeURIComponent(orderId);
    const rawId = decodedId.replace("gid://shopify/Order/", "");
    const gid = `gid://shopify/Order/${rawId}`;

    const existing = await prisma.order.findFirst({
      where: {
        shop,
        id: { in: [orderId, rawId, gid, decodedId] },
      },
      select: { id: true },
    });

    if (existing) {
      return existing.id;
    }

    const orderNumber = parseInt(rawId.replace(/\D/g, "") || "1001", 10);
    try {
      const created = await prisma.order.create({
        data: {
          id: orderId,
          shop,
          orderNumber,
          totalPrice: 0,
          subtotalPrice: 0,
          totalTax: 0,
          shippingPrice: 0,
          financialStatus: "pending",
          fulfillmentStatus: "unfulfilled",
          createdAt: new Date(),
          processedAt: new Date(),
        },
      });
      return created.id;
    } catch {
      return orderId;
    }
  }

  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const { shop, orderId, actionType } = this.parseKey(key);

    try {
      // 1. Check if already successfully executed
      if (await this.hasCompleted(key)) {
        return false;
      }

      const validOrderId = await this.ensureParentOrder(shop, orderId);

      // 2. Check for recent pending execution within lock window
      const lockThreshold = new Date(Date.now() - ttlMs);
      const activeLock = await prisma.executionLog.findFirst({
        where: {
          shop,
          orderId: validOrderId,
          step: `LOCK_${actionType}`,
          status: "PENDING",
          createdAt: { gte: lockThreshold },
        },
      });

      if (activeLock) {
        return false; // Active in-flight lock exists
      }

      // 3. Acquire lock by recording a PENDING lock entry
      await prisma.executionLog.create({
        data: {
          shop,
          orderId: validOrderId,
          step: `LOCK_${actionType}`,
          status: "PENDING",
          message: `Lock acquired for ${key}`,
          data: { key, ttlMs },
        },
      });

      return true;
    } catch (err) {
      console.warn(`[DatabaseIdempotencyStore] Lock acquisition error for ${key}:`, err);
      return false;
    }
  }

  async hasCompleted(key: string): Promise<boolean> {
    const { shop, orderId, actionType } = this.parseKey(key);
    const rawId = orderId.replace("gid://shopify/Order/", "");
    const gid = `gid://shopify/Order/${rawId}`;

    try {
      const existing = await prisma.executionLog.findFirst({
        where: {
          shop,
          orderId: { in: [orderId, rawId, gid] },
          step: "EXECUTION",
          status: "SUCCESS",
        },
      });

      return !!existing;
    } catch (err) {
      console.warn(`[DatabaseIdempotencyStore] hasCompleted check error for ${key}:`, err);
      return false;
    }
  }

  async markCompleted(key: string): Promise<void> {
    const { shop, orderId, actionType } = this.parseKey(key);
    const rawId = orderId.replace("gid://shopify/Order/", "");
    const gid = `gid://shopify/Order/${rawId}`;

    try {
      const records = await prisma.executionLog.findMany({
        where: {
          shop,
          orderId: { in: [orderId, rawId, gid] },
          step: `LOCK_${actionType}`,
        },
        select: { id: true },
      });

      for (const rec of records) {
        await prisma.executionLog.delete({ where: { id: rec.id } }).catch(() => {});
      }
    } catch (err) {
      console.warn(`[DatabaseIdempotencyStore] markCompleted lock cleanup error:`, err);
    }
  }

  async releaseLock(key: string): Promise<void> {
    const { shop, orderId, actionType } = this.parseKey(key);
    const rawId = orderId.replace("gid://shopify/Order/", "");
    const gid = `gid://shopify/Order/${rawId}`;

    try {
      const records = await prisma.executionLog.findMany({
        where: {
          shop,
          orderId: { in: [orderId, rawId, gid] },
          step: `LOCK_${actionType}`,
        },
        select: { id: true },
      });

      for (const rec of records) {
        await prisma.executionLog.delete({ where: { id: rec.id } }).catch(() => {});
      }
    } catch (err) {
      console.warn(`[DatabaseIdempotencyStore] releaseLock cleanup error:`, err);
    }
  }
}
