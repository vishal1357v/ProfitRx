import prisma from "../../db.server";

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  category: "order" | "product" | "customer" | "pincode" | "risk";
  url: string;
  icon: string;
}

export class SearchApplicationService {
  /**
   * Universal multi-tenant search across orders, risk flags, products, customers, and pincodes.
   */
  static async search(shop: string, query: string): Promise<SearchResultItem[]> {
    const q = (query || "").trim();
    if (!q || q.length < 2) {
      return [];
    }

    const results: SearchResultItem[] = [];

    // 1. Search Orders by sequential order number
    const orderNum = parseInt(q, 10);
    if (!isNaN(orderNum)) {
      const orders = await prisma.order.findMany({
        where: { shop, orderNumber: orderNum },
        take: 5,
        select: {
          id: true,
          orderNumber: true,
          totalPrice: true,
          financialStatus: true,
          customerName: true,
        },
      });

      orders.forEach((o) => {
        const cleanId = String(o.id).replace("gid://shopify/Order/", "");
        results.push({
          id: o.id,
          title: `Order #${o.orderNumber}`,
          subtitle: `₹${(o.totalPrice || 0).toLocaleString("en-IN")} · ${o.financialStatus} · ${
            o.customerName || "Guest"
          }`,
          category: "order",
          url: `/app/orders/${encodeURIComponent(cleanId)}`,
          icon: "📦",
        });
      });
    }

    // 2. Search Orders by customer name (text search)
    const nameOrders = await prisma.order.findMany({
      where: {
        shop,
        customerName: { contains: q, mode: "insensitive" },
      },
      take: 3,
      select: { id: true, orderNumber: true, totalPrice: true, customerName: true },
    });

    nameOrders.forEach((o) => {
      if (!results.find((r) => r.id === o.id)) {
        const cleanId = String(o.id).replace("gid://shopify/Order/", "");
        results.push({
          id: o.id,
          title: `Order #${o.orderNumber}`,
          subtitle: `${o.customerName} · ₹${(o.totalPrice || 0).toLocaleString("en-IN")}`,
          category: "order",
          url: `/app/orders/${encodeURIComponent(cleanId)}`,
          icon: "📦",
        });
      }
    });

    // 3. Search ProductCOGS by productId
    const products = await prisma.productCOGS.findMany({
      where: {
        shop,
        productId: { contains: q, mode: "insensitive" },
      },
      take: 5,
      select: { id: true, productId: true, cost: true, source: true },
    });

    products.forEach((p) => {
      results.push({
        id: p.id,
        title: `Product ${p.productId}`,
        subtitle: `COGS: ₹${(p.cost || 0).toLocaleString("en-IN")} · ${p.source}`,
        category: "product",
        url: `/app/cogs`,
        icon: "🏷️",
      });
    });

    // 4. Search Customers
    const customers = await prisma.customerProfile.findMany({
      where: {
        shop,
        OR: [
          { customerName: { contains: q, mode: "insensitive" } },
          { customerEmail: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: {
        id: true,
        customerName: true,
        customerEmail: true,
        totalRevenue: true,
        orderCount: true,
      },
    });

    customers.forEach((c) => {
      results.push({
        id: c.id,
        title: c.customerName || "Customer",
        subtitle: `${c.customerEmail || "No email"} · ${c.orderCount} orders · ₹${(
          c.totalRevenue || 0
        ).toLocaleString("en-IN")}`,
        category: "customer",
        url: `/app/customers`,
        icon: "👤",
      });
    });

    // 5. Search Pincodes
    const pincodes = await prisma.pincodeStats.findMany({
      where: {
        shop,
        OR: [
          { pincode: { contains: q } },
          { city: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: {
        id: true,
        pincode: true,
        city: true,
        rtoRate: true,
        riskLevel: true,
        totalOrders: true,
      },
    });

    pincodes.forEach((p) => {
      results.push({
        id: p.id,
        title: `Pincode ${p.pincode}`,
        subtitle: `${p.city || "Unknown City"} · ${p.rtoRate.toFixed(1)}% RTO (${p.riskLevel}) · ${
          p.totalOrders
        } orders`,
        category: "pincode",
        url: `/app/rto-heatmap`,
        icon: "📍",
      });
    });

    // 6. Search Risk Orders
    const riskOrders = await prisma.order.findMany({
      where: {
        shop,
        riskLevel: { in: ["HIGH", "CRITICAL"] },
        OR: [
          ...(isNaN(orderNum) ? [] : [{ orderNumber: orderNum }]),
          { customerName: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: { id: true, orderNumber: true, riskLevel: true, riskScore: true, customerName: true },
    });

    riskOrders.forEach((o) => {
      if (!results.find((r) => r.id === o.id)) {
        const cleanId = String(o.id).replace("gid://shopify/Order/", "");
        results.push({
          id: o.id,
          title: `Risk Order #${o.orderNumber}`,
          subtitle: `${o.riskLevel} risk (score: ${o.riskScore}) · ${o.customerName || "Guest"}`,
          category: "risk",
          url: `/app/orders/${encodeURIComponent(cleanId)}`,
          icon: "🛡️",
        });
      }
    });

    return results.slice(0, 20);
  }
}
