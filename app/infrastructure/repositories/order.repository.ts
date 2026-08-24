import prisma from "../../db.server";

export interface OrderWithLineItems {
  id: string;
  shop: string;
  orderNumber: number;
  totalPrice: number;
  subtotalPrice: number;
  totalTax: number;
  shippingPrice: number;
  discountAmount: number;
  isCOD: boolean;
  gateway: string | null;
  channelType: string | null;
  channelAttribution: string | null;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  pincode: string | null;
  city: string | null;
  province: string | null;
  totalWeight: number | null;
  cogsAtTimeOfOrder: number | null;
  actualShippingCost: number | null;
  shippingCostSource: string;
  riskScore: number | null;
  riskLevel: string | null;
  riskReasons: any;
  riskFlags: any;
  merchantRecommendation: string | null;
  financialStatus: string;
  fulfillmentStatus: string;
  createdAt: Date;
  processedAt: Date;
  lineItems: Array<{
    id: string;
    shopifyLineItemId: string;
    productId: string | null;
    variantId: string | null;
    sku: string | null;
    title: string;
    variantTitle: string | null;
    quantity: number;
    unitPrice: number;
    originalUnitPrice: number;
    discountAmount: number;
    taxAmount: number;
    refundedQuantity: number;
    refundedAmount: number;
    cogsPerUnitAtOrder: number | null;
    totalCOGSAtOrder: number;
  }>;
}

export class OrderRepository {
  /**
   * Find an order by id (handles both gid and raw id format) with shop isolation.
   */
  static async findById(shop: string, orderId: string): Promise<OrderWithLineItems | null> {
    const decodedId = decodeURIComponent(orderId);
    const gid = decodedId.startsWith("gid://") ? decodedId : `gid://shopify/Order/${decodedId}`;
    const rawId = decodedId.replace("gid://shopify/Order/", "");

    const order = await prisma.order.findFirst({
      where: {
        shop,
        id: { in: [orderId, gid, rawId, decodedId] },
      },
      include: { lineItems: true },
    });

    return order as OrderWithLineItems | null;
  }

  /**
   * Find all orders for a given shop with multi-tenant isolation.
   */
  static async findByShop(shop: string, limit?: number, skip?: number): Promise<any[]> {
    return prisma.order.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    });
  }

  /**
   * Find a single order by its sequential Shopify order number with shop isolation.
   */
  static async findByOrderNumber(shop: string, orderNumber: number): Promise<any | null> {
    return prisma.order.findFirst({
      where: { shop, orderNumber },
    });
  }

  /**
   * Create an order record in database with shop isolation.
   */
  static async createOrder(data: any): Promise<any> {
    return prisma.order.create({ data });
  }

  /**
   * Ensure order exists in database, creating it if absent.
   */
  static async ensureOrderExists(shop: string, orderId: string, orderData: any): Promise<any> {
    const existing = await this.findById(shop, orderId);
    if (existing) return existing;
    return this.createOrder(orderData);
  }

  /**
   * Update order decision and risk evaluation results.
   */
  static async updateDecision(
    shop: string,
    orderId: string,
    updateData: {
      riskScore?: number | null;
      riskLevel?: string | null;
      riskReasons?: any;
      merchantRecommendation?: string | null;
    }
  ): Promise<void> {
    const decodedId = decodeURIComponent(orderId);
    const gid = decodedId.startsWith("gid://") ? decodedId : `gid://shopify/Order/${decodedId}`;
    const rawId = decodedId.replace("gid://shopify/Order/", "");

    const existing = await prisma.order.findFirst({
      where: {
        shop,
        id: { in: [orderId, rawId, gid, decodedId] },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.order.update({
        where: { id: existing.id },
        data: updateData,
      });
    }
  }
}


