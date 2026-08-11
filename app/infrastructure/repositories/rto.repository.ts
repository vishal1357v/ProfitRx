import prisma from "../../db.server";

export interface RTOEventRecord {
  id: string;
  shop: string;
  orderId: string;
  orderNumber: number;
  eventType: string;
  reason: string | null;
  amount: number;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface RTOEventFilterOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  eventType?: string;
  search?: string;
}

export class RtoRepository {
  /**
   * Fetch all RTO events for a given shop with multi-tenant isolation.
   */
  static async findByShop(shop: string): Promise<RTOEventRecord[]> {
    return prisma.rTOEvent.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Find paginated RTO events with server-side filters and bounded limit.
   */
  static async findPaginatedEvents(
    shop: string,
    options: RTOEventFilterOptions = {}
  ): Promise<{ events: RTOEventRecord[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize || 25));
    const skip = (page - 1) * pageSize;

    const where: any = { shop };

    if (options.status && options.status !== "ALL") {
      where.status = options.status;
    }

    if (options.eventType && options.eventType !== "ALL") {
      where.eventType = options.eventType;
    }

    if (options.search && options.search.trim() !== "") {
      const q = options.search.trim();
      const parsedNum = parseInt(q, 10);
      if (!isNaN(parsedNum)) {
        where.OR = [
          { orderNumber: parsedNum },
          { reason: { contains: q, mode: "insensitive" } },
        ];
      } else {
        where.reason = { contains: q, mode: "insensitive" };
      }
    }

    const [events, total] = await Promise.all([
      prisma.rTOEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.rTOEvent.count({ where }),
    ]);

    return {
      events,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Check if an RTO event of a specific type already exists for an order.
   */
  static async findEventByOrderAndType(
    shop: string,
    orderId: string,
    eventType: string
  ): Promise<RTOEventRecord | null> {
    return prisma.rTOEvent.findFirst({
      where: {
        shop,
        orderId,
        eventType,
      },
    });
  }

  /**
   * Create an RTO event with shop tenant scoping.
   */
  static async create(data: {
    shop: string;
    orderId: string;
    orderNumber: number;
    eventType: string;
    reason?: string | null;
    amount: number;
    status: string;
  }): Promise<RTOEventRecord> {
    return prisma.rTOEvent.create({
      data,
    });
  }
}
