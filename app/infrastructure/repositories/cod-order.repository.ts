import prisma from "../../db.server";

export interface CodOrderRecord {
  id: string;
  orderId: string;
  shop: string;
  phone: string;
  otp: string | null;
  otpAttempts: number;
  otpVerified: boolean;
  otpSentAt: Date | null;
  otpVerifiedAt: Date | null;
  partialPaid: boolean;
  partialAmount: number | null;
  codFee: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class CodOrderRepository {
  /**
   * Find COD order records for a shop with multi-tenant isolation.
   */
  static async findByShop(
    shop: string,
    options?: { status?: string; limit?: number; skip?: number }
  ): Promise<CodOrderRecord[]> {
    const where: any = { shop };
    if (options?.status && options.status !== "ALL") {
      where.status = options.status;
    }

    return prisma.cODOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options?.limit ?? 50,
      skip: options?.skip ?? 0,
    });
  }

  /**
   * Find single COD order record by orderId with shop verification.
   */
  static async findByOrderId(shop: string, orderId: string): Promise<CodOrderRecord | null> {
    const cleanId = orderId.replace("gid://shopify/Order/", "");
    const record = await prisma.cODOrder.findUnique({
      where: { orderId: cleanId },
    });
    if (!record || record.shop !== shop) return null;
    return record;
  }

  /**
   * Find single COD order record without shop check (used by customer verification after token validation).
   */
  static async findByCleanOrderId(orderId: string): Promise<CodOrderRecord | null> {
    const cleanId = orderId.replace("gid://shopify/Order/", "");
    return prisma.cODOrder.findUnique({
      where: { orderId: cleanId },
    });
  }

  /**
   * Create or update a COD order verification record.
   */
  static async upsert(
    shop: string,
    data: {
      orderId: string;
      phone: string;
      otp?: string;
      status?: string;
      partialAmount?: number;
      codFee?: number;
    }
  ): Promise<CodOrderRecord> {
    const cleanId = data.orderId.replace("gid://shopify/Order/", "");

    return prisma.cODOrder.upsert({
      where: { orderId: cleanId },
      create: {
        shop,
        orderId: cleanId,
        phone: data.phone,
        otp: data.otp || null,
        status: data.status || "PENDING",
        otpSentAt: data.otp ? new Date() : null,
        partialAmount: data.partialAmount || null,
        codFee: data.codFee || null,
      },
      update: {
        phone: data.phone,
        ...(data.otp ? { otp: data.otp, otpSentAt: new Date() } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.partialAmount !== undefined ? { partialAmount: data.partialAmount } : {}),
        ...(data.codFee !== undefined ? { codFee: data.codFee } : {}),
      },
    });
  }

  /**
   * Record successful verification.
   */
  static async markVerified(
    shop: string,
    orderId: string
  ): Promise<CodOrderRecord | null> {
    const cleanId = orderId.replace("gid://shopify/Order/", "");
    const existing = await prisma.cODOrder.findUnique({ where: { orderId: cleanId } });
    if (!existing || existing.shop !== shop) return null;

    return prisma.cODOrder.update({
      where: { orderId: cleanId },
      data: {
        otpVerified: true,
        status: "VERIFIED",
        otpVerifiedAt: new Date(),
      },
    });
  }

  /**
   * Increment failed attempt count and optionally lock.
   */
  static async recordFailedAttempt(
    shop: string,
    orderId: string,
    maxAttempts = 5
  ): Promise<CodOrderRecord | null> {
    const cleanId = orderId.replace("gid://shopify/Order/", "");
    const existing = await prisma.cODOrder.findUnique({ where: { orderId: cleanId } });
    if (!existing || existing.shop !== shop) return null;

    const newAttempts = existing.otpAttempts + 1;
    const isLocked = newAttempts >= maxAttempts;

    return prisma.cODOrder.update({
      where: { orderId: cleanId },
      data: {
        otpAttempts: newAttempts,
        status: isLocked ? "FAILED" : existing.status,
      },
    });
  }

  /**
   * Update order status with shop isolation.
   */
  static async updateStatus(
    shop: string,
    orderId: string,
    status: string
  ): Promise<CodOrderRecord | null> {
    const cleanId = orderId.replace("gid://shopify/Order/", "");
    const existing = await prisma.cODOrder.findUnique({ where: { orderId: cleanId } });
    if (!existing || existing.shop !== shop) return null;

    return prisma.cODOrder.update({
      where: { orderId: cleanId },
      data: { status },
    });
  }
}
