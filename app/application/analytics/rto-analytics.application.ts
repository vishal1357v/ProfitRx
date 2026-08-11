import { RtoRepository, RTOEventFilterOptions } from "../../infrastructure/repositories/rto.repository";
import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { ShopifyService } from "../../services/shopify.service";

export interface RtoAnalyticsDTO {
  orders: Array<{ orderNumber: number; totalPrice: number }>;
  rtoEvents: Array<{
    id: string;
    orderId: string;
    orderNumber: number;
    eventType: string;
    amount: number;
    status: string;
    reason: string | null;
    createdAt: string;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  stats: {
    totalLoss: number;
    rtoRate: string;
    codCount: number;
    prepaidCount: number;
    codPercent: string;
    prepaidPercent: string;
  };
  topProducts: Array<{ id: string; title: string; amount: number; count: number }>;
  chartData: Array<{ date: string; count: number; loss: number }>;
  hasOrders: boolean;
  hasRtoEvents: boolean;
}

export interface LogRtoEventInput {
  orderNumber: number;
  amount: number;
  eventType: string;
  status: string;
  reason?: string;
}

export class RtoAnalyticsApplicationService {
  /**
   * Helper to determine whether a payment gateway is COD.
   */
  static isCodGateway(gateway: string | null): boolean {
    if (!gateway) return false;
    const lower = gateway.toLowerCase();
    return lower.includes("cod") || lower.includes("cash") || lower.includes("manual");
  }

  /**
   * Orchestrates RTO analytics, stats, breakdowns, trend chart, and paginated event history.
   */
  static async getRtoAnalytics(
    shop: string,
    admin?: any,
    filters: RTOEventFilterOptions = {}
  ): Promise<RtoAnalyticsDTO> {
    // 1. Fetch data in parallel via repositories
    const [orders, allRtoEvents, paginatedResult] = await Promise.all([
      OrderRepository.findByShop(shop),
      RtoRepository.findByShop(shop),
      RtoRepository.findPaginatedEvents(shop, filters),
    ]);

    // 2. Fetch products to map titles (optional gracefully handled)
    let productMap = new Map<string, string>();
    if (admin) {
      try {
        const products = await ShopifyService.getProducts(admin);
        productMap = new Map(products.map((p: any) => [p.id, p.title]));
      } catch (err) {
        console.error("[RtoAnalyticsApplicationService] Failed to fetch Shopify products:", err);
      }
    }

    // 3. Compute stats
    const codOrders = orders.filter((o: any) => this.isCodGateway(o.gateway) || o.isCOD);
    const prepaidOrders = orders.filter((o: any) => !this.isCodGateway(o.gateway) && !o.isCOD);

    const codCount = codOrders.length;
    const prepaidCount = prepaidOrders.length;
    const totalCount = orders.length;

    const codPercent = totalCount > 0 ? ((codCount / totalCount) * 100).toFixed(1) : "0.0";
    const prepaidPercent = totalCount > 0 ? ((prepaidCount / totalCount) * 100).toFixed(1) : "0.0";

    const totalLoss = allRtoEvents.reduce((acc: number, curr: any) => acc + curr.amount, 0);
    const rtoCount = allRtoEvents.filter((e: any) => e.eventType === "RTO").length;
    const rtoRate = codCount > 0 ? ((rtoCount / codCount) * 100).toFixed(1) : "0.0";

    // 4. Group RTO losses by product
    const productLossMap = new Map<string, { title: string; amount: number; count: number }>();
    for (const event of allRtoEvents) {
      const order = orders.find((o: any) => o.id === event.orderId);
      const productId = order?.productId;
      if (productId) {
        const title = productMap.get(productId) || `Product ID: ${productId}`;
        const existing = productLossMap.get(productId) || { title, amount: 0, count: 0 };
        existing.amount += event.amount;
        existing.count += 1;
        productLossMap.set(productId, existing);
      }
    }

    const topProducts = Array.from(productLossMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // 5. Generate 30 days history data for RTO trend chart
    const dailyRto: Record<string, { date: string; count: number; loss: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      dailyRto[dateStr] = { date: dateStr.substring(8) + "/" + dateStr.substring(5, 7), count: 0, loss: 0 };
    }

    allRtoEvents.forEach((e: any) => {
      const dateStr = e.createdAt.toISOString().split("T")[0];
      if (dailyRto[dateStr]) {
        dailyRto[dateStr].count += 1;
        dailyRto[dateStr].loss += e.amount;
      }
    });

    const totalPages = Math.max(1, Math.ceil(paginatedResult.total / paginatedResult.pageSize));

    return {
      orders: orders.map((o: any) => ({ orderNumber: o.orderNumber, totalPrice: o.totalPrice })),
      rtoEvents: paginatedResult.events.map((e: any) => ({
        ...e,
        createdAt: e.createdAt.toISOString().split("T")[0],
      })),
      pagination: {
        page: paginatedResult.page,
        pageSize: paginatedResult.pageSize,
        total: paginatedResult.total,
        totalPages,
      },
      stats: {
        totalLoss,
        rtoRate,
        codCount,
        prepaidCount,
        codPercent,
        prepaidPercent,
      },
      topProducts,
      chartData: Object.values(dailyRto),
      hasOrders: orders.length > 0,
      hasRtoEvents: allRtoEvents.length > 0,
    };
  }

  /**
   * Log an RTO event with validation against order total and duplicate prevention.
   */
  static async logRtoEvent(
    shop: string,
    input: LogRtoEventInput
  ): Promise<{ success: boolean; error?: string }> {
    if (isNaN(input.orderNumber)) {
      return { success: false, error: "Invalid order number." };
    }
    if (isNaN(input.amount) || input.amount < 0) {
      return { success: false, error: "Loss amount must be a non-negative number." };
    }

    // Find linked order in database
    const order = await OrderRepository.findByOrderNumber(shop, input.orderNumber);
    if (!order) {
      return { success: false, error: `Order #${input.orderNumber} not found. Please sync orders first.` };
    }

    // Validate RTO event amount bounds
    if (input.amount > order.totalPrice) {
      return {
        success: false,
        error: `RTO loss amount (₹${input.amount}) cannot exceed the order's total price (₹${order.totalPrice}).`,
      };
    }

    // Check duplicate event
    const existingEvent = await RtoRepository.findEventByOrderAndType(shop, order.id, input.eventType);
    if (existingEvent) {
      return {
        success: false,
        error: `An event of type "${input.eventType}" has already been logged for Order #${input.orderNumber}.`,
      };
    }

    // Persist via repository
    await RtoRepository.create({
      shop,
      orderId: order.id,
      orderNumber: input.orderNumber,
      eventType: input.eventType,
      amount: input.amount,
      status: input.status,
      reason: input.reason || null,
    });

    return { success: true };
  }
}
