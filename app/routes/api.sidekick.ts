import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import { OrderRepository } from "../infrastructure/repositories/order.repository";
import { RtoRepository } from "../infrastructure/repositories/rto.repository";
import { SettingsRepository } from "../infrastructure/repositories/settings.repository";
import { ProfitService } from "../services/profit.service";
import { ShopifyService } from "../services/shopify.service";
import {
  checkRateLimit,
  getClientIp,
  withDbRetry,
} from "../utils/security.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // 1. IP Rate Limiting check
  const ip = getClientIp(request);
  const { allowed, resetIn } = checkRateLimit(ip);
  if (!allowed) {
    return Response.json(
      { error: `Too many requests. Please try again in ${resetIn} seconds.` },
      {
        status: 429,
        headers: {
          "Retry-After": resetIn.toString(),
        },
      }
    );
  }

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "summary";

  // Fetch basic stats with retry
  const [orders, cogsMap, rtoEvents, storeSettings] = await Promise.all([
    withDbRetry(async () => OrderRepository.findByShop(shop)),
    withDbRetry(async () => ProfitService.getCOGS(shop)),
    withDbRetry(async () => RtoRepository.findByShop(shop)),
    withDbRetry(async () => SettingsRepository.getByShop(shop)),
  ]);

  const defaultCOGSPct = storeSettings?.defaultCOGSPct ?? 40;

  const revenue = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
  const totalCOGS = orders.reduce(
    (sum, o) =>
      sum +
      (cogsMap[o.productId || ""] ??
        ((o.totalPrice || 0) * defaultCOGSPct) / 100),
    0
  );
  const totalFees = orders.reduce(
    (sum, o) => sum + (o.totalTax || 0) + (o.shippingPrice || 0),
    0
  );
  const profit = revenue - totalCOGS - totalFees;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const codOrders = orders.filter((o: any) => {
    const gateway = o.gateway?.toLowerCase() || "";
    return (
      gateway.includes("cod") ||
      gateway.includes("cash") ||
      gateway.includes("manual")
    );
  });
  const codCount = codOrders.length;
  const rtoCount = rtoEvents.filter((e) => e.eventType === "RTO").length;
  const rtoRate = codCount > 0 ? (rtoCount / codCount) * 100 : 0;

  // AI Readiness calculation
  const mappedCogsCount = Object.keys(cogsMap).length;
  const aiProductScore = mappedCogsCount > 0 ? 40 : 10;
  const aiPolicyScore = 30;
  const aiEnrollmentScore = orders.some(
    (o: any) =>
      (o as any).channelAttribution &&
      (o as any).channelAttribution !== "Website"
  )
    ? 30
    : 10;
  const aiReadinessScore = aiProductScore + aiPolicyScore + aiEnrollmentScore;

  if (query === "summary") {
    return Response.json({
      revenue,
      profit,
      margin: Math.round(margin * 10) / 10,
      orderCount: orders.length,
      rtoRate: Math.round(rtoRate * 10) / 10,
      codRate: orders.length > 0 ? Math.round((codCount / orders.length) * 1000) / 10 : 0,
      aiReadinessScore,
      mappedCogsCount,
    });
  }

  return Response.json({
    revenue,
    profit,
    margin,
    orders: orders.slice(0, 10),
  });
};
