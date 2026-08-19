import prisma from "../../db.server";

export interface ExecutionLogRecord {
  id: string;
  shop: string;
  orderId: string;
  step: string;
  status: string;
  message: string | null;
  data: any;
  createdAt: Date;
  order?: {
    orderNumber: number;
  } | null;
}

export class ExecutionLogRepository {
  /**
   * Find execution logs for an order (handles both GID and raw ID format) with shop isolation.
   */
  static async findByOrderId(shop: string, orderId: string): Promise<ExecutionLogRecord[]> {
    const decodedId = decodeURIComponent(orderId);
    const gid = decodedId.startsWith("gid://") ? decodedId : `gid://shopify/Order/${decodedId}`;
    const rawId = decodedId.replace("gid://shopify/Order/", "");

    return prisma.executionLog.findMany({
      where: {
        shop,
        orderId: { in: [gid, rawId, decodedId] },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Find recent execution logs for a shop with shop isolation.
   */
  static async findByShop(shop: string, limit = 50): Promise<ExecutionLogRecord[]> {
    return prisma.executionLog.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        order: {
          select: {
            orderNumber: true,
          },
        },
      },
    });
  }

  /**
   * Create an execution log entry with shop isolation.
   */
  static async createLog(data: {
    shop: string;
    orderId: string;
    step: string;
    status: string;
    message?: string | null;
    data?: any;
  }): Promise<ExecutionLogRecord> {
    const decodedId = decodeURIComponent(data.orderId);
    const gid = decodedId.startsWith("gid://") ? decodedId : `gid://shopify/Order/${decodedId}`;
    const rawId = decodedId.replace("gid://shopify/Order/", "");

    // Verify order exists to satisfy foreign key constraint
    const existingOrder = await prisma.order.findFirst({
      where: {
        shop: data.shop,
        id: { in: [data.orderId, gid, rawId, decodedId] },
      },
      select: { id: true },
    });

    const targetOrderId = existingOrder ? existingOrder.id : data.orderId;

    return prisma.executionLog.create({
      data: {
        shop: data.shop,
        orderId: targetOrderId,
        step: data.step,
        status: data.status,
        message: data.message || null,
        data: data.data ? data.data : undefined,
      },
    });
  }
}

