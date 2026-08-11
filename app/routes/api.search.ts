import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q || q.length < 2) {
    return Response.json({ results: [] });
  }

  const results: Array<{
    id: string;
    title: string;
    subtitle?: string;
    category: string;
    url: string;
    icon: string;
  }> = [];

  // Search Orders by order number
  const orderNum = parseInt(q, 10);
  if (!isNaN(orderNum)) {
    const orders = await prisma.order.findMany({
      where: { shop, orderNumber: orderNum },
      take: 5,
      select: { id: true, orderNumber: true, totalPrice: true, financialStatus: true, customerName: true },
    });
    orders.forEach((o) => {
      results.push({
        id: o.id,
        title: `Order #${o.orderNumber}`,
        subtitle: `₹${o.totalPrice.toLocaleString("en-IN")} · ${o.financialStatus} · ${o.customerName || "Guest"}`,
        category: "order",
        url: `/app/dashboard`,
        icon: "📦",
      });
    });
  }

  // Search Orders by customer name (text search)
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
      results.push({
        id: o.id,
        title: `Order #${o.orderNumber}`,
        subtitle: `${o.customerName} · ₹${o.totalPrice.toLocaleString("en-IN")}`,
        category: "order",
        url: `/app/dashboard`,
        icon: "📦",
      });
    }
  });

  // Search ProductCOGS by productId
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

  // Search Customers
  const customers = await prisma.customerProfile.findMany({
    where: {
      shop,
      OR: [
        { customerName: { contains: q, mode: "insensitive" } },
        { customerEmail: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 5,
    select: { id: true, customerName: true, customerEmail: true, totalRevenue: true, orderCount: true },
  });
  customers.forEach((c) => {
    results.push({
      id: c.id,
      title: c.customerName || c.customerEmail || "Unknown",
      subtitle: `${c.orderCount} orders · ₹${c.totalRevenue.toLocaleString("en-IN")} LTV`,
      category: "customer",
      url: `/app/customers`,
      icon: "👤",
    });
  });

  // Search Pincodes
  const pincodes = await prisma.pincodeStats.findMany({
    where: {
      shop,
      pincode: { startsWith: q },
    },
    take: 5,
    select: { id: true, pincode: true, city: true, rtoRate: true, riskLevel: true, totalOrders: true },
  });
  pincodes.forEach((p) => {
    results.push({
      id: p.id,
      title: `${p.pincode} — ${p.city || "Unknown"}`,
      subtitle: `RTO: ${p.rtoRate.toFixed(1)}% · ${p.riskLevel} risk · ${p.totalOrders} orders`,
      category: "pincode",
      url: `/app/rto-heatmap`,
      icon: "📍",
    });
  });

  // Search Risk Orders
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
      results.push({
        id: o.id,
        title: `Risk Order #${o.orderNumber}`,
        subtitle: `${o.riskLevel} risk (score: ${o.riskScore}) · ${o.customerName || "Guest"}`,
        category: "risk",
        url: `/app/orders/${encodeURIComponent(o.id.replace("gid://shopify/Order/", ""))}`,
        icon: "🛡️",
      });
    }
  });

  return Response.json({ results: results.slice(0, 20) });
};
