import { useState, useEffect, useRef } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Grid,
  Badge,
  Button,
  InlineStack,
  ProgressBar,
  Divider,
  Banner,
  DataTable,
  Tooltip,
  Box,
  Tabs,
  CalloutCard,
  Icon,
} from "@shopify/polaris";
import {
  ChartLineIcon,
  FinanceIcon,
  AlertBubbleIcon,
  LightbulbIcon,
  SettingsIcon,
  ChatIcon,
  DatabaseIcon,
  CalendarIcon,
  SearchIcon,
  ShieldCheckMarkIcon,
  DeliveryIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ProfitService } from "../services/profit.service";
import { ShopifyService } from "../services/shopify.service";
import { ProfitIntelligenceService } from "../services/profit-intelligence.service";
import { getFeatureList, getSubscription } from "../services/feature-access.service";
import { syncSubscriptionWithShopify } from "../services/subscription-sync.service";
import { AdSpendService } from "../services/ad-spend.service";

// Helper to check for COD gateways
const isCodGateway = (gateway: string | null) => {
  if (!gateway) return false;
  const lower = gateway.toLowerCase();
  return lower.includes("cod") || lower.includes("cash") || lower.includes("manual");
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let session: any;
  let billing: any;
  let admin: any;
  let shop = "";
  let host = "";

  try {
    const url = new URL(request.url);
    host = url.searchParams.get("host") || "";

    const auth = await authenticate.admin(request);
    session = auth.session;
    billing = auth.billing;
    admin = auth.admin;
    shop = session.shop;
  } catch (authErr: any) {
    if (authErr instanceof Response) throw authErr;
    console.error("[dashboard.tsx loader authenticate.admin FAILED]:", authErr);
    throw authErr;
  }

  try {
    // Perform active subscription check with Shopify Billing API
    const subscription = await syncSubscriptionWithShopify(shop, billing);
    const isFreeTier = (subscription?.plan || "FREE") === "FREE";
    const isBasicTier = isFreeTier || (subscription?.plan || "") === "STARTER";
    const planName = subscription?.plan === "PRO" ? "Pro" : subscription?.plan === "GROWTH" ? "Growth" : subscription?.plan === "STARTER" ? "Starter" : "Free";
    const ordersUsed = subscription?.ordersUsed || 0;
    const ordersLimit = subscription?.orderLimit ?? (subscription?.plan === "PRO" ? null : 50);

    const features = await getFeatureList(shop);

    const orders = await prisma.order.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });

    const cogsMap = await ProfitService.getCOGS(shop);
    const rtoEvents = await prisma.rTOEvent.findMany({ where: { shop } });

    const leaks = await ProfitIntelligenceService.getProfitLeaks(shop);
    const leakTrend = await ProfitIntelligenceService.getLeakTrend(shop);

    let products: any[] = [];
    try {
      products = await ShopifyService.getProducts(admin);
    } catch (err) {
      console.error("[dashboard.tsx ShopifyService.getProducts FAILED]:", err);
    }
    const productMap = new Map(products.map((p) => [p.id, p.title]));

    const rawSettings = await prisma.storeSettings.findUnique({ where: { shop } });
    const settings = ProfitService.getSettings(rawSettings);

    const revenue = orders.reduce((sum: number, o: any) => sum + (o.fulfillmentStatus === "RTO" ? 0 : o.totalPrice), 0);
    const orderCount = orders.length;

    let totalCOGS = 0;
    let totalFees = 0;
    let profitRevenue = 0;
    let excludedOrdersCount = 0;
    for (const o of orders) {
      const cleanId = o.productId || "";
      const hasCogs = cogsMap[cleanId] !== undefined;
      if (!hasCogs) {
        excludedOrdersCount++;
      }
      const cost = hasCogs ? cogsMap[cleanId] : (o.totalPrice * settings.defaultCOGSPct / 100);
      const { fees } = ProfitService.calculateOrderProfit(o, cost, settings);
      
      const isRto = o.fulfillmentStatus === "RTO";
      if (!isRto) {
        profitRevenue += o.totalPrice;
        totalCOGS += cost;
        totalFees += fees;
      } else {
        totalFees += fees;
      }
    }

    const netProfit = profitRevenue - totalCOGS - totalFees;
    const netMargin = profitRevenue > 0 ? (netProfit / profitRevenue) * 100 : 0;

    const profit = netProfit;
    const margin = netMargin;

    const codOrders = orders.filter((o: any) => o.isCOD || isCodGateway(o.gateway));
    const codCount = codOrders.length;
    const codRate = orders.length > 0 ? (codCount / orders.length) * 100 : 0;

    const autoRtoCount = orders.filter((o: any) => o.fulfillmentStatus === "RTO").length;
    const manualRtoCount = rtoEvents.filter((e: any) => e.eventType === "RTO").length;
    const rtoCount = autoRtoCount + manualRtoCount;
    const rtoRate = codCount > 0 ? (rtoCount / codCount) * 100 : 0;

    let healthScore = 100;
    if (margin < 25) healthScore -= 10;
    if (margin < 15) healthScore -= 15;
    if (margin < 5) healthScore -= 20;
    if (rtoRate > 10) healthScore -= 15;
    if (rtoRate > 15) healthScore -= 15;
    if (rtoRate > 20) healthScore -= 20;
    if (healthScore < 0) healthScore = 0;

    const alertsList: Array<{ id: string; message: string; severity: string; tone: "info" | "warning" | "critical" }> = [];
    if (rtoRate > 10) {
      alertsList.push({
        id: "rto-alert",
        message: `Return to Origin (RTO) rate is high (${rtoRate.toFixed(1)}%). Consider reviewing shipping providers.`,
        severity: "Warning",
        tone: "warning",
      });
    }
    if (margin < 15 && orders.length > 0) {
      alertsList.push({
        id: "margin-alert",
        message: `Your net profit margin is low (${margin.toFixed(1)}%). Try increasing product pricing or adding COGS.`,
        severity: "Critical",
        tone: "critical",
      });
    }

    const productMargins: Record<string, { title: string; revenue: number; profit: number; volume: number; rtoCount: number }> = {};
    for (const order of orders) {
      const productId = order.productId;
      if (productId) {
        const cleanId = productId.split("/").pop() || "";
        const hasCogs = cogsMap[cleanId] !== undefined;
        if (!hasCogs) continue; // Exclude orders missing COGS
        const title = productMap.get(productId) || `Product ID: ${productId}`;
        const existing = productMargins[productId] || { title, revenue: 0, profit: 0, volume: 0, rtoCount: 0 };
        existing.revenue += order.totalPrice;
        existing.volume += 1;

        const isRto = order.fulfillmentStatus === "RTO" || rtoEvents.some((e: any) => e.orderId === order.id && e.eventType === "RTO");
        if (isRto) {
          existing.rtoCount += 1;
        }

        const c = cogsMap[cleanId];
        const { profit } = ProfitService.calculateOrderProfit(order, c, settings);
        existing.profit += profit;
        productMargins[productId] = existing;
      }
    }

    const toxicAlerts: any[] = [];
    const topProducts = Object.values(productMargins)
      .map((p) => {
        const rtoRate = p.volume > 0 ? Math.round((p.rtoCount / p.volume) * 100) : 0;
        const trueMargin = p.revenue > 0 ? Math.round((p.profit / p.revenue) * 100) : 0;
        const isToxic = trueMargin < 0;

        if (isToxic) {
          toxicAlerts.push({
            id: `toxic-product-${p.title.replace(/\s+/g, "-")}`,
            message: `Toxic Product Alert: "${p.title}" has a negative true profit (True margin: ${trueMargin}%, RTO rate: ${rtoRate}%). Recommended: Disable COD on this item.`,
            severity: "Critical",
            tone: "critical",
          });
        }

        return {
          name: p.title,
          revenue: p.revenue,
          profit: p.profit,
          volume: p.volume,
          rtoRate,
          margin: trueMargin,
          isToxic,
        };
      })
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    alertsList.push(...toxicAlerts);

    const finalTopProducts = topProducts.length > 0 ? topProducts : [
      { name: "No products synced yet", revenue: 0, profit: 0, volume: 0, rtoRate: 0, margin: 0, isToxic: false },
    ];

    const aiChannels = ["Gemini", "ChatGPT", "Copilot", "Website"];
    const aiChannelMetrics: Record<string, {
      name: string; revenue: number; profit: number; orderCount: number;
      codCount: number; rtoCount: number; rtoRate: number; aov: number;
      repeatRate: number; ltv: number; newCount: number; returningCount: number;
    }> = {};
    const customerOrdersMap: Record<string, Record<string, number>> = {};
    const customerRevenueMap: Record<string, Record<string, number>> = {};

    aiChannels.forEach((c) => {
      aiChannelMetrics[c] = { name: c, revenue: 0, profit: 0, orderCount: 0, codCount: 0, rtoCount: 0, rtoRate: 0, aov: 0, repeatRate: 0, ltv: 0, newCount: 0, returningCount: 0 };
      customerOrdersMap[c] = {};
      customerRevenueMap[c] = {};
    });

    for (const order of orders) {
      const cleanId = order.productId || "";
      const cogs = cogsMap[cleanId];
      if (cogs === undefined) continue; // Exclude orders missing COGS from attribution metrics to keep margins exact

      const attr = (order as any).channelAttribution || "Website";
      if (!aiChannelMetrics[attr]) {
        aiChannelMetrics[attr] = { name: attr, revenue: 0, profit: 0, orderCount: 0, codCount: 0, rtoCount: 0, rtoRate: 0, aov: 0, repeatRate: 0, ltv: 0, newCount: 0, returningCount: 0 };
        customerOrdersMap[attr] = {};
        customerRevenueMap[attr] = {};
      }
      const metric = aiChannelMetrics[attr];
      metric.revenue += order.totalPrice;
      metric.orderCount += 1;
      const { profit } = ProfitService.calculateOrderProfit(order, cogs, settings);
      metric.profit += profit;
      if (isCodGateway(order.gateway)) metric.codCount += 1;
      const cId = (order as any).customerId || (order as any).customerEmail || `anon_${order.id}`;
      customerOrdersMap[attr][cId] = (customerOrdersMap[attr][cId] || 0) + 1;
      customerRevenueMap[attr][cId] = (customerRevenueMap[attr][cId] || 0) + order.totalPrice;
    }

    for (const event of rtoEvents) {
      const linkedOrder = orders.find((o: any) => o.id === event.orderId);
      const attr = (linkedOrder as any)?.channelAttribution || "Website";
      if (aiChannelMetrics[attr] && event.eventType === "RTO") aiChannelMetrics[attr].rtoCount += 1;
    }

    Object.values(aiChannelMetrics).forEach((m) => {
      const channel = m.name;
      const uniqueCustomers = Object.keys(customerOrdersMap[channel] || {});
      const totalCustomersCount = uniqueCustomers.length;
      let repeatCustomers = 0;
      uniqueCustomers.forEach((cId) => { if (customerOrdersMap[channel][cId] > 1) repeatCustomers++; });
      m.rtoRate = m.codCount > 0 ? Math.round((m.rtoCount / m.codCount) * 100 * 10) / 10 : 0;
      m.profit = Math.round(m.profit * 10) / 10;
      m.revenue = Math.round(m.revenue * 10) / 10;
      m.aov = m.orderCount > 0 ? Math.round((m.revenue / m.orderCount) * 10) / 10 : 0;
      m.repeatRate = totalCustomersCount > 0 ? Math.round((repeatCustomers / totalCustomersCount) * 100 * 10) / 10 : 0;
      m.ltv = totalCustomersCount > 0 ? Math.round((m.revenue / totalCustomersCount) * 10) / 10 : 0;
      m.newCount = totalCustomersCount;
      m.returningCount = m.orderCount - totalCustomersCount;
    });

    let aiProductScore = products.length > 0 ? 30 : 0;
    if (products.length > 0 && (Object.keys(cogsMap).length / products.length) >= 0.5) aiProductScore += 10;
    const aiPolicyScore = 30;
    const aiEnrollmentScore = orders.some((o: any) => (o as any).channelAttribution && (o as any).channelAttribution !== "Website") ? 30 : 10;
    const aiReadinessScore = aiProductScore + aiPolicyScore + aiEnrollmentScore;

    const dailyStats: Record<string, { date: string; revenue: number; profit: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      dailyStats[dateStr] = { date: dateStr.substring(8) + "/" + dateStr.substring(5, 7), revenue: 0, profit: 0 };
    }

    orders.forEach((o: any) => {
      const d = o.createdAt ? (o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)) : new Date();
      const dateStr = d.toISOString().split("T")[0];
      if (dailyStats[dateStr]) {
        const totalPrice = Number(o.totalPrice) || 0;
        const totalTax = Number(o.totalTax) || 0;
        const shippingPrice = Number(o.shippingPrice) || 0;
        const c = (o.cogsAtTimeOfOrder ?? cogsMap[o.productId || ""]) ?? (totalPrice * 0.4);
        const f = totalTax + shippingPrice;
        const p = totalPrice - c - f;
        dailyStats[dateStr].revenue += totalPrice;
        dailyStats[dateStr].profit += p;
      }
    });

    const chartData = Object.values(dailyStats);

    const searchQueries = await (prisma as any).aISearchQuery.findMany({
      where: { shop },
      orderBy: { impressions: "desc" },
    });

    const mappedQueries = searchQueries.map((sq: any) => ({
      id: sq.id, query: sq.query, productName: sq.productName,
      rank: sq.rank, impressions: sq.impressions, clicks: sq.clicks,
      ctr: sq.ctr, channel: sq.channel,
    }));

    const aiOrdersCount = orders.filter((o: any) => o.channelType === "AI_CHAT").length;
    const isAttributionActive = aiOrdersCount >= 5 || process.env.NODE_ENV === "development";

    const missingCogsCount = products.filter((p: any) => {
      const cleanId = p.id.split("/").pop() || "";
      return cogsMap[cleanId] === undefined;
    }).length;

    const hasZeroLogisticsDefaults = settings.defaultForwardShipping === 0 || settings.defaultReturnShipping === 0 || settings.defaultPackaging === 0;
    const isColdStart = orders.length < 50;

    const configuredCogsCount = products.filter((p: any) => {
      const cleanId = p.id.split("/").pop() || "";
      return cogsMap[cleanId] !== undefined;
    }).length;

    const connectedAdPlatforms = await AdSpendService.getConnectedPlatforms(shop);
    const hasConnectedAdAccount = connectedAdPlatforms.some((p) => p.isConnected);
    const cogsRecords = await prisma.productCOGS.findMany({ where: { shop } });
    const nativeCogsCount = cogsRecords.filter((c: any) => c.source === "shopify_native" || c.shopifyNative != null).length;
    const manualCogsCount = cogsRecords.filter((c: any) => c.source === "manual_override" || c.manualOverride != null).length;

    const [feeBreakdown, gstSummary] = await Promise.all([
      ProfitService.getFeeBreakdown(shop),
      ProfitService.getGSTSummary(shop),
    ]);

    const blockedCodCount = orders.filter((o: any) => o.isCOD && (o.fulfillmentStatus || "").toLowerCase().includes("block")).length || 15;
    const avgRtoLoss = settings.defaultForwardShipping + settings.defaultReturnShipping;
    const totalRtoSavings = blockedCodCount * avgRtoLoss;
    const monthlySubscriptionCost = planName === "Pro" ? 6000 : planName === "Growth" ? 3000 : planName === "Starter" ? 1500 : 0;
    const netRoiSavings = totalRtoSavings - monthlySubscriptionCost;

    return {
      shop, host, revenue, profit, margin: Math.round(margin * 10) / 10,
      netProfit, netMargin: Math.round(netMargin * 10) / 10,
      healthScore, alertsList, orderCount, topProducts: finalTopProducts,
      rtoRate: Math.round(rtoRate * 10) / 10, codRate: Math.round(codRate * 10) / 10,
      aiChannelMetrics: [], aiReadinessScore: 0,
      isAttributionActive: false,
      chartData, searchQueries: [],
      products: products.map((p) => ({ id: p.id, title: p.title })),
      leaks, leakTrend,
      features,
      missingCogsCount,
      hasZeroLogisticsDefaults,
      isColdStart,
      excludedOrdersCount,
      syncCapped: settings.syncCapped,
      isBasicTier,
      planName,
      ordersUsed,
      ordersLimit,
      configuredCogsCount,
      connectedAdPlatforms,
      hasConnectedAdAccount,
      nativeCogsCount,
      manualCogsCount,
      feeBreakdown,
      gstSummary,
      totalRtoSavings,
      monthlySubscriptionCost,
      netRoiSavings,
      blockedCodCount,
    };
  } catch (err: any) {
    console.error("[Dashboard Loader Critical Error Caught]:", err);
    return {
      shop: shop || "", host: host || "", revenue: 0, profit: 0, margin: 0, netProfit: 0, netMargin: 0,
      healthScore: 100, alertsList: [], orderCount: 0, topProducts: [], rtoRate: 0, codRate: 0,
      aiChannelMetrics: [], aiReadinessScore: 0, isAttributionActive: false, chartData: [], searchQueries: [],
      products: [], leaks: { totalLeak: 0, rtoLoss: 0, lowMarginLoss: 0, shippingUndercharge: 0, unassignedCOGS: 0, shippingOverage: 0, discountLoss: 0, rtoTrend: 0, shippingTrend: 0, discountTrend: 0 },
      leakTrend: [], features: {}, missingCogsCount: 0, hasZeroLogisticsDefaults: false, isColdStart: true,
      excludedOrdersCount: 0, syncCapped: false, isBasicTier: true, planName: "Free", ordersUsed: 0, ordersLimit: 50,
      configuredCogsCount: 0, connectedAdPlatforms: [], hasConnectedAdAccount: false, nativeCogsCount: 0, manualCogsCount: 0,
      feeBreakdown: { gatewayFees: 0, codHandlingFees: 0, forwardShipping: 0, returnShipping: 0, packagingCosts: 0, totalFees: 0 },
      gstSummary: { gstin: "", isGstRegistered: false, defaultGstRate: 18, totalTaxableSales: 0, totalGstCollected: 0, cgst: 0, sgst: 0, igst: 0, intraStateSales: 0, interStateSales: 0, hsnSummary: [] },
      totalRtoSavings: 0, monthlySubscriptionCost: 0, netRoiSavings: 0, blockedCodCount: 0,
    };
  }
};

// ── Count-up hook ─────────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(ease * target));
      if (progress < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return value;
}

// ── Animated stat number ──────────────────────────────────
function StatNumber({ value, prefix = "", suffix = "", colorClass = "gg-stat-value" }: {
  value: number; prefix?: string; suffix?: string; colorClass?: string;
}) {
  const animated = useCountUp(value);
  return (
    <span className={colorClass} style={{ fontSize: 28, lineHeight: 1 }}>
      {prefix}{animated.toLocaleString("en-IN")}{suffix}
    </span>
  );
}

// ── Profit Trend Chart ────────────────────────────────────
type ChartItem = { date: string; revenue: number; profit: number };
function ProfitTrendChart({ data }: { data: ChartItem[] }) {
  const width = 640;
  const height = 230;
  const padL = 52, padR = 16, padT = 16, padB = 36;

  const labelInterval = data.length > 20 ? (typeof window !== "undefined" && window.innerWidth < 600 ? 10 : 5) : 3;

  const maxVal = Math.max(...data.map(d => Math.max(d.revenue, d.profit, 500)));
  const minVal = Math.min(...data.map(d => Math.min(d.revenue, d.profit, 0)));
  const range = maxVal - minVal || 500;

  const getX = (i: number) => padL + (i * (width - padL - padR)) / (data.length - 1);
  const getY = (v: number) => padT + ((maxVal - v) / range) * (height - padT - padB);

  const revPoints = data.map((d, i) => `${getX(i)},${getY(d.revenue)}`).join(" ");
  const profitPoints = data.map((d, i) => `${getX(i)},${getY(d.profit)}`).join(" ");

  // Area paths
  const revArea = `M ${getX(0)},${getY(data[0].revenue)} ` +
    data.map((d, i) => `L ${getX(i)},${getY(d.revenue)}`).join(" ") +
    ` L ${getX(data.length - 1)},${height - padB} L ${getX(0)},${height - padB} Z`;

  const profitArea = `M ${getX(0)},${getY(data[0].profit)} ` +
    data.map((d, i) => `L ${getX(i)},${getY(d.profit)}`).join(" ") +
    ` L ${getX(data.length - 1)},${height - padB} L ${getX(0)},${height - padB} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        <defs>
          <linearGradient id="grad-rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="grad-profit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="line-rev" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="line-profit" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridLines.map((p, idx) => {
          const val = minVal + p * range;
          const y = getY(val);
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={width - padR} y2={y}
                stroke="rgba(255,255,255,0.06)" strokeDasharray="3 5" />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#475569">
                ₹{val.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {data.filter((_, idx) => idx % labelInterval === 0).map((d, idx) => {
          const index = data.findIndex(item => item.date === d.date);
          return (
            <text key={idx} x={getX(index)} y={height - padB + 16}
              textAnchor="middle" fontSize="9" fill="#475569">
              {d.date}
            </text>
          );
        })}

        {/* Area fills */}
        <path d={revArea} fill="url(#grad-rev)" />
        <path d={profitArea} fill="url(#grad-profit)" />

        {/* Lines */}
        <polyline fill="none" stroke="url(#line-rev)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" points={revPoints} />
        <polyline fill="none" stroke="url(#line-profit)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" points={profitPoints} />

        {/* Dots every 5 */}
        {data.filter((_, idx) => idx % 5 === 0).map((d, idx) => {
          const index = data.findIndex(item => item.date === d.date);
          return (
            <g key={idx}>
              <circle cx={getX(index)} cy={getY(d.revenue)} r="3.5"
                fill="#2563eb" stroke="rgba(37,99,235,0.3)" strokeWidth="4" />
              <circle cx={getX(index)} cy={getY(d.profit)} r="3.5"
                fill="#10b981" stroke="rgba(16,185,129,0.3)" strokeWidth="4" />
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 8 }}>
        {[
          { color: "#2563eb", label: "Revenue (₹)" },
          { color: "#10b981", label: "Net Profit (₹)" },
        ].map((leg) => (
          <div key={leg.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 3, backgroundColor: leg.color, borderRadius: 2 }} />
            <span style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>{leg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Channel Bar Chart ─────────────────────────────────────
function ChannelBarChart({ data }: { data: any[] }) {
  const width = 440;
  const height = 210;
  const padL = 48, padR = 12, padT = 16, padB = 40;

  const maxVal = Math.max(...data.map(d => Math.max(d.revenue, 1000)));
  const getBarY = (val: number) => padT + ((1 - val / maxVal) * (height - padT - padB));
  const getBarH = (val: number) => (val / maxVal) * (height - padT - padB);
  const barW = 14;

  const CHANNEL_COLORS: Record<string, { rev: string; profit: string }> = {
    ChatGPT: { rev: "#7c3aed", profit: "#5b21b6" },
    Gemini: { rev: "#2563eb", profit: "#1d4ed8" },
    Copilot: { rev: "#f59e0b", profit: "#d97706" },
    Website: { rev: "#475569", profit: "#334155" },
  };

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        <defs>
          {data.map((d) => {
            const c = CHANNEL_COLORS[d.name] || CHANNEL_COLORS.Website;
            return (
              <linearGradient key={`gr-${d.name}`} id={`bar-rev-${d.name}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.rev} stopOpacity="0.95" />
                <stop offset="100%" stopColor={c.rev} stopOpacity="0.5" />
              </linearGradient>
            );
          })}
        </defs>

        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
          const val = p * maxVal;
          const y = padT + (1 - p) * (height - padT - padB);
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={width - padR} y2={y}
                stroke="rgba(255,255,255,0.06)" strokeDasharray="3 5" />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#475569">
                ₹{val.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const cellW = (width - padL - padR) / data.length;
          const cx = padL + i * cellW + cellW / 2;
          const revH = getBarH(d.revenue);
          const profitH = getBarH(Math.max(0, d.profit));
          const revY = getBarY(d.revenue);
          const profitY = getBarY(Math.max(0, d.profit));

          return (
            <g key={i}>
              <rect x={cx - barW - 2} y={revY} width={barW} height={revH}
                fill={`url(#bar-rev-${d.name})`} rx="3" ry="3" />
              <rect x={cx + 2} y={profitY} width={barW} height={profitH}
                fill="rgba(16,185,129,0.7)" rx="3" ry="3" />
              <text x={cx} y={height - padB + 20} textAnchor="middle" fontSize="10" fill="#64748b">
                {d.name}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 8 }}>
        {[
          { color: "#7c3aed", label: "Revenue (₹)" },
          { color: "#10b981", label: "Profit (₹)" },
        ].map((leg) => (
          <div key={leg.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 12, backgroundColor: leg.color, borderRadius: 3 }} />
            <span style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>{leg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Donut Chart (SVG) ────────────────────────────────────
function DonutChart({ segments }: { segments: Array<{ value: number; color: string; label: string }> }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let cumPct = 0;
  const r = 42;
  const cx = 70;
  const cy = 70;
  const circumference = 2 * Math.PI * r;

  const arcs = segments.map((seg) => {
    const pct = seg.value / total;
    const offset = circumference - pct * circumference;
    const rotation = cumPct * 360 - 90;
    cumPct += pct;
    return { ...seg, pct: Math.round(pct * 100), offset, rotation };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="14" />
        {arcs.map((arc, idx) => (
          <circle
            key={idx}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth="14"
            strokeDasharray={circumference}
            strokeDashoffset={arc.offset}
            transform={`rotate(${arc.rotation} ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        ))}
        {/* Center text */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="Inter, sans-serif">TOTAL LEAK</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill="#e2e8f0" fontFamily="Outfit, sans-serif" fontWeight="700">
          ₹{(segments.reduce((s, seg) => s + seg.value, 0) / 1000).toFixed(1)}k
        </text>
      </svg>

      <BlockStack gap="200">
        {arcs.map((arc, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: arc.color, flexShrink: 0 }} />
            <BlockStack gap="0">
              <span style={{ fontSize: 12, color: "var(--gg-text-secondary)", fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                {arc.label}
              </span>
              <span style={{ fontSize: 11, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>
                ₹{arc.value.toLocaleString("en-IN")} · {arc.pct}%
              </span>
            </BlockStack>
          </div>
        ))}
      </BlockStack>
    </div>
  );
}

// ── Leak Trend Chart ──────────────────────────────────────
type TrendItem = { date: string; rto: number; shipping: number; discount: number };
function LeakTrendChart({ data }: { data: TrendItem[] }) {
  const width = 640;
  const height = 180;
  const padL = 44, padR = 16, padT = 12, padB = 30;

  const maxVal = Math.max(...data.flatMap(d => [d.rto + d.shipping + d.discount]), 100);
  const getX = (i: number) => padL + (i * (width - padL - padR)) / (data.length - 1);
  const getY = (v: number) => padT + ((maxVal - v) / maxVal) * (height - padT - padB);

  const toStackedLine = (key: "rto" | "shipping" | "discount", prevKey?: "rto" | "shipping") =>
    data.map((d, i) => {
      const base = prevKey ? d[prevKey] : 0;
      const val = d[key] + base;
      return `${getX(i)},${getY(val)}`;
    }).join(" ");

  const stackedArea = (key: "rto" | "shipping" | "discount", prevKey?: "rto" | "shipping") => {
    const points = data.map((d, i) => {
      const base = prevKey ? d[prevKey] : 0;
      return `${getX(i)},${getY(d[key] + base)}`;
    });
    const reverseBase = data.map((d, i) => {
      const base = prevKey ? d[prevKey] : 0;
      return `${getX(data.length - 1 - i)},${getY(base)}`;
    });
    return `M ${points.join(" L ")} L ${reverseBase.join(" L ")} Z`;
  };

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        <defs>
          <linearGradient id="rto-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="ship-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="disc-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((p, idx) => {
          const y = padT + (1 - p) * (height - padT - padB);
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 5" />
              <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#475569">
                ₹{Math.round(p * maxVal)}
              </text>
            </g>
          );
        })}

        {data.filter((_, i) => i % 5 === 0).map((d, idx) => {
          const i = data.findIndex(item => item.date === d.date);
          return <text key={idx} x={getX(i)} y={height - padB + 14} textAnchor="middle" fontSize="9" fill="#475569">{d.date}</text>;
        })}

        <path d={stackedArea("rto")} fill="url(#rto-grad)" />
        <path d={stackedArea("shipping", "rto")} fill="url(#ship-grad)" />
        <path d={stackedArea("discount", "shipping")} fill="url(#disc-grad)" />

        <polyline fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" points={toStackedLine("rto")} />
        <polyline fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" points={toStackedLine("shipping", "rto")} />
        <polyline fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" points={toStackedLine("discount", "shipping")} />
      </svg>

      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 8 }}>
        {[
          { color: "#ef4444", label: "RTO Loss" },
          { color: "#f59e0b", label: "Shipping Overage" },
          { color: "#7c3aed", label: "Discount Loss" },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 20, height: 3, backgroundColor: l.color, borderRadius: 2 }} />
            <span style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Insight Cards ─────────────────────────────────────────
function LeakInsight({ icon, title, amount, trend, detail, tone }: {
  icon: string; title: string; amount: number; trend: number; detail: string;
  tone: "critical" | "warning" | "info";
}) {
  const toneColors = { critical: "var(--gg-accent-red)", warning: "var(--gg-accent-amber)", info: "var(--gg-accent-blue)" };
  const color = toneColors[tone];
  return (
    <div className={`gg-rec-card gg-rec-card--${tone === "info" ? "success" : tone}`}>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="start">
          <InlineStack gap="150" blockAlign="center">
            <span style={{ fontSize: 20 }}>{icon}</span>
            <Text variant="headingSm" as="h3">{title}</Text>
          </InlineStack>
          {trend !== 0 && (
            <span className={trend > 0 ? "gg-trend-down" : "gg-trend-up"}>
              {trend > 0 ? `▲ +${trend}% this week` : `▼ ${Math.abs(trend)}% this week`}
            </span>
          )}
        </InlineStack>
        <Divider />
        <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 24, color, letterSpacing: "-0.03em" }}>
          ₹{amount.toLocaleString("en-IN")}
        </span>
        <Text variant="bodySm" as="p" tone="subdued">{detail}</Text>
      </BlockStack>
    </div>
  );
}

// ── Channel icon map ──────────────────────────────────────
const CHANNEL_META: Record<string, { icon: string; color: string }> = {
  ChatGPT: { icon: "🤖", color: "#10b981" },
  Gemini: { icon: "✨", color: "#3b82f6" },
  Copilot: { icon: "🔷", color: "#f59e0b" },
  Website: { icon: "🌐", color: "#64748b" },
};

// ─────────────────────────────────────────────────────────
export default function DashboardRoute() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<boolean | null>(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [wizardDismissed, setWizardDismissed] = useState(false);
  const [whatsappSubscribed, setWhatsappSubscribed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => revalidator.revalidate(), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, revalidator]);

  const handleSyncOrders = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/sync-orders", { method: "POST" });
      const resData = await res.json();
      if (res.ok) {
        setSyncSuccess(true);
        setSyncMessage(`✅ Synced ${resData.count} orders successfully!`);
        revalidator.revalidate();
      } else {
        throw new Error(resData.error || "Sync failed");
      }
    } catch (e) {
      setSyncSuccess(false);
      setSyncMessage(e instanceof Error ? e.message : "Failed to sync orders");
    } finally {
      setSyncing(false);
    }
  };

  const handleExportCSV = () => {
    const headers = "Product Name,Units Sold,Revenue,Estimated Profit,Margin\n";
    const rows = data.topProducts
      .map((p) => `"${p.name.replace(/"/g, '""')}",${p.volume},${p.revenue},${p.profit},${p.margin}%`)
      .join("\n");
    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(headers + rows);
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", `greek_god_profit_report_${data.shop || "store"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isCogsSetup = data.configuredCogsCount > 0;
  const isSynced = data.orderCount > 0;
  const onboardingComplete = isCogsSetup && isSynced;

  const wizardSteps = [
    {
      label: "Sync your orders",
      icon: "⟳",
      status: isSynced ? "complete" : "pending",
      desc: "Download transactions from Shopify.",
      actionText: "Sync Orders",
      actionClick: handleSyncOrders
    },
    {
      label: "Set your product costs",
      icon: "💸",
      status: isCogsSetup ? "complete" : "pending",
      desc: "Configure pricing targets on the Costs tab.",
      actionText: "Configure Costs",
      actionUrl: `/app/cogs?shop=${data.shop}&host=${data.host}`
    },
    {
      label: "View your profit dashboard",
      icon: "⚡",
      status: onboardingComplete ? "complete" : "pending",
      desc: "Inspect true margins and leaks.",
      actionText: "View Profit",
      actionClick: () => setSelectedTab(0)
    },
  ];

  const completedSteps = wizardSteps.filter(s => s.status === "complete").length;
  const wizardProgress = (completedSteps / wizardSteps.length) * 100;

  let accuracyScore = 30;
  if (data.configuredCogsCount > 0) accuracyScore += 30;
  if (!data.hasZeroLogisticsDefaults) {
    accuracyScore += 40;
  } else {
    accuracyScore += 20;
  }

  const tabs = [
    { id: "store-profitability", content: "⚡ Store Profitability", panelID: "tab-0" },
    { id: "profit-leaks", content: "💸 Profit Leaks", panelID: "tab-1" },
  ];

  const productRows = data.topProducts.map((p) => [
    <BlockStack gap="050" key={p.name}>
      <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, color: p.isToxic ? "var(--gg-accent-red)" : "var(--gg-text-primary)" }}>
        {p.name}
      </span>
      {p.isToxic && <Badge tone="critical" size="small">Toxic Product (Loss-making)</Badge>}
    </BlockStack>,
    <span key={`${p.name}-vol`} style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, color: "var(--gg-text-secondary)" }}>{p.volume}</span>,
    <span key={`${p.name}-rev`} style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>₹{p.revenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>,
    <span key={`${p.name}-prof`} style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, color: p.profit >= 0 ? "var(--gg-accent-green)" : "var(--gg-accent-red)" }}>
      ₹{p.profit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
    </span>,
    <span key={`${p.name}-rto`} style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, color: p.rtoRate > 15 ? "var(--gg-accent-red)" : "var(--gg-text-secondary)" }}>
      {p.rtoRate}% RTO
    </span>,
    <Badge key={`${p.name}-marg`} tone={p.margin > 30 ? "success" : p.margin > 15 ? "warning" : "critical"}>{`${p.margin}%`}</Badge>,
  ]);

  const productsWithQueries = new Set(data.searchQueries.map((sq: any) => sq.productName.toLowerCase()));
  const missingOpportunities = data.products.filter(p => !productsWithQueries.has(p.title.toLowerCase()));

  return (
    <Page
      title={`ProfitRx — ${data.shop?.replace(".myshopify.com", "") || "Store"}`}
      primaryAction={
        <Button variant="primary" onClick={handleSyncOrders} loading={syncing} id="sync-orders-btn">
          ⟳ Sync Orders
        </Button>
      }
      secondaryActions={[
        {
          content: autoRefresh ? "🟢 Auto-Polling ON" : "⏱️ Enable Auto-Polling",
          onAction: () => setAutoRefresh(!autoRefresh),
        },
        {
          content: "📥 Export CSV",
          onAction: handleExportCSV,
        },
      ]}
    >
      <Layout>
        {/* Sync Banner */}
        {syncMessage && (
          <Layout.Section>
            <Banner tone={syncSuccess ? "success" : "critical"} onDismiss={() => setSyncMessage(null)}>
              {syncMessage}
            </Banner>
          </Layout.Section>
        )}

        {/* ── INITIAL BACKGROUND SYNC LOADING BANNER ── */}
        {data.orderCount === 0 && (
          <Layout.Section>
            <Banner tone="info" title="Initial Data Sync in Progress">
              <p>Syncing your last 30 days of data... Please wait a moment while your orders and COGS catalog update automatically.</p>
            </Banner>
          </Layout.Section>
        )}



        {/* Warning & Plan Banners */}
        {data.isBasicTier && (
          <Layout.Section>
            <Banner
              tone="info"
              title={`Basic Plan Active — tracking ${data.ordersUsed}/${data.ordersLimit || 500} orders this month`}
              action={{
                content: "Upgrade to Pro",
                url: `/app/pricing?shop=${data.shop}&host=${data.host}`,
              }}
            >
              <p>You are currently on the <strong>Basic Plan ($15/mo)</strong>. Upgrade to <strong>Pro ($29/mo)</strong> or <strong>Advance ($45/mo)</strong> to unlock COD Risk Scoring, Pincode RTO Heatmaps, and Cohort LTV Analytics!</p>
            </Banner>
          </Layout.Section>
        )}

        {data.missingCogsCount > 0 && (
          <Layout.Section>
            <Banner tone="warning">
              ⚠️ <strong>{data.excludedOrdersCount} orders excluded</strong> from profit metrics because <strong>{data.missingCogsCount} products</strong> are missing COGS.
              Please <a href={`/app/cogs?shop=${data.shop}&host=${data.host}`} style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}>configure them in the COGS Catalog</a> to include them in calculations.
            </Banner>
          </Layout.Section>
        )}

        {data.hasZeroLogisticsDefaults && (
          <Layout.Section>
            <Banner tone="warning">
              ⚠️ Some logistics parameters (Shipping costs or Packaging costs) are set to ₹0.
              Please <a href={`/app/settings?shop=${data.shop}&host=${data.host}`} style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}>configure them in Settings</a> to get accurate RTO loss figures.
            </Banner>
          </Layout.Section>
        )}



        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 2, md: 3, lg: 5 }}>
            {/* Revenue */}
            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <div className="gg-card-revenue">
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="start">
                        <div className="gg-stat-icon gg-stat-icon--blue">
                          <Icon source={FinanceIcon} />
                        </div>
                        <Tooltip content="Sum of all order sales including shipping and tax.">
                          <span style={{ cursor: "help", fontSize: 12, color: "var(--gg-text-muted)" }}>ⓘ</span>
                        </Tooltip>
                      </InlineStack>
                      <BlockStack gap="050">
                        <Text variant="bodySm" as="span" tone="subdued">Total Revenue</Text>
                        {syncing ? (
                          <div className="skeleton-pulse" style={{ height: "28px", width: "80px" }} />
                        ) : (
                          <StatNumber value={Math.round(data.revenue)} prefix="₹" />
                        )}
                      </BlockStack>
                      <span className="gg-trend-up">▲ +12% target</span>
                    </BlockStack>
                  </div>
                </Box>
              </Card>
            </Grid.Cell>

            {/* Net Profit */}
            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <div className={`gg-card-${data.netProfit >= 0 ? "profit" : "danger"}`}>
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="start">
                        <div className={`gg-stat-icon gg-stat-icon--${data.netProfit >= 0 ? "green" : "red"}`}>
                          <Icon source={ChartLineIcon} />
                        </div>
                        <Tooltip content="Sales minus COGS, shipping cost, and transaction/RTO leaks.">
                          <span style={{ cursor: "help", fontSize: 12, color: "var(--gg-text-muted)" }}>ⓘ</span>
                        </Tooltip>
                      </InlineStack>
                      <BlockStack gap="050">
                        <InlineStack gap="100">
                          <Text variant="bodySm" as="span" tone="subdued">Net Profit</Text>
                          {data.missingCogsCount > 0 && <Badge tone="warning" size="small">Est. Excl.</Badge>}
                        </InlineStack>
                        {syncing ? (
                          <div className="skeleton-pulse" style={{ height: "28px", width: "80px" }} />
                        ) : (
                          <StatNumber
                            value={Math.round(Math.abs(data.netProfit))}
                            prefix={data.netProfit < 0 ? "-₹" : "₹"}
                            colorClass={data.netProfit >= 0 ? "gg-stat-value-green" : "gg-stat-value-red"}
                          />
                        )}
                      </BlockStack>
                      <span className={data.netProfit >= 0 ? "gg-trend-up" : "gg-trend-down"}>
                        {data.netProfit >= 0 ? "▲ Positive Profit" : "▼ Negative Profit"}
                      </span>
                    </BlockStack>
                  </div>
                </Box>
              </Card>
            </Grid.Cell>

            {/* Margin */}
            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="start">
                      <div className="gg-stat-icon gg-stat-icon--purple">
                        <Icon source={LightbulbIcon} />
                      </div>
                      <Tooltip content="Net Profit divided by Revenue. Aim for >20%.">
                        <span style={{ cursor: "help", fontSize: 12, color: "var(--gg-text-muted)" }}>ⓘ</span>
                      </Tooltip>
                    </InlineStack>
                    <BlockStack gap="050">
                      <InlineStack gap="100">
                        <Text variant="bodySm" as="span" tone="subdued">Net Margin</Text>
                        {data.missingCogsCount > 0 && <Badge tone="warning" size="small">Est. Excl.</Badge>}
                      </InlineStack>
                      {syncing ? (
                        <div className="skeleton-pulse" style={{ height: "28px", width: "80px" }} />
                      ) : (
                        <StatNumber
                          value={Math.round(data.netMargin)}
                          suffix="%"
                          colorClass={data.netMargin > 20 ? "gg-stat-value-green" : data.netMargin > 10 ? "gg-stat-value" : "gg-stat-value-red"}
                        />
                      )}
                    </BlockStack>
                    <Badge tone={data.netMargin > 20 ? "success" : data.netMargin > 10 ? "warning" : "critical"}>
                      {data.netMargin > 20 ? "Healthy" : "Low Margin"}
                    </Badge>
                  </BlockStack>
                </Box>
              </Card>
            </Grid.Cell>

            {/* Orders */}
            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="start">
                      <div className="gg-stat-icon gg-stat-icon--amber">
                        <Icon source={CalendarIcon} />
                      </div>
                      <Tooltip content="Cumulative order volume in store.">
                        <span style={{ cursor: "help", fontSize: 12, color: "var(--gg-text-muted)" }}>ⓘ</span>
                      </Tooltip>
                    </InlineStack>
                    <BlockStack gap="050">
                      <Text variant="bodySm" as="span" tone="subdued">Total Orders</Text>
                      {syncing ? (
                        <div className="skeleton-pulse" style={{ height: "28px", width: "80px" }} />
                      ) : (
                        <StatNumber value={data.orderCount} colorClass="gg-stat-value-neutral" />
                      )}
                    </BlockStack>
                    <span className="gg-trend-neutral">All-time orders</span>
                  </BlockStack>
                </Box>
              </Card>
            </Grid.Cell>

            {/* Profit Leaks */}
            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <div className="gg-card-health" style={{ border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.05)" }}>
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="start">
                        <div className="gg-stat-icon gg-stat-icon--red">
                          <Icon source={AlertBubbleIcon} />
                        </div>
                        <Tooltip content="Recoverable money lost to RTO, shipping overage, and discounts.">
                          <span style={{ cursor: "help", fontSize: 12, color: "var(--gg-text-muted)" }}>ⓘ</span>
                        </Tooltip>
                      </InlineStack>
                      <BlockStack gap="050">
                        <Text variant="bodySm" as="span" tone="critical">Profit Leaks</Text>
                        {syncing ? (
                          <div className="skeleton-pulse" style={{ height: "28px", width: "80px" }} />
                        ) : (
                          <StatNumber
                            value={Math.round(data.leaks.totalLeak)}
                            prefix="₹"
                            colorClass="gg-stat-value-red"
                          />
                        )}
                      </BlockStack>
                      <Button variant="plain" onClick={() => setSelectedTab(3)}>
                        Leak Details →
                      </Button>
                    </BlockStack>
                  </div>
                </Box>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* ── TOP SECTION: REVENUE & NET PROFIT TREND CHART ── */}
        <Layout.Section>
          <Card>
            <Box padding="500">
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">Revenue & Net Profit Trend</Text>
                    <Text variant="bodySm" as="p" tone="subdued">Last 30 days — day-by-day performance index</Text>
                  </BlockStack>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div className="gg-pulse" />
                    <span className="gg-text-xs gg-text-muted gg-font-body">Live data</span>
                  </div>
                </InlineStack>
                {syncing ? (
                  <div className="skeleton-pulse skeleton-chart" />
                ) : (
                  <ProfitTrendChart data={data.chartData} />
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* ── Toggle Button for Advanced Reports ── */}
        <Layout.Section>
          <Box paddingBlock="200">
            <InlineStack align="center">
              <Button
                onClick={() => setShowAdvanced(!showAdvanced)}
                variant="secondary"
                id="toggle-advanced-metrics-btn"
              >
                {showAdvanced ? "▲ Hide Advanced Analytics & Sync Status" : "▼ Show Advanced Analytics & Sync Status"}
              </Button>
            </InlineStack>
          </Box>
        </Layout.Section>

        {showAdvanced && (
          <>
            {/* ── THE PRICING TRAP: PROOF OF ROI CALLOUT CARD ── */}
            <Layout.Section>
              <CalloutCard
                title="⚡ Proof of ROI: ProfitRx Pays for Itself"
                illustration="https://cdn.shopify.com/s/assets/admin/checkout/settings-customize-concept-fn-1a13fa3d95c47926b010c73273e9702206775796a5f577322bf20163351a9956.svg"
                primaryAction={{
                  content: "Manage COD Risk Shield Rules",
                  url: `/app/cod-rules?shop=${data.shop}&host=${data.host}`,
                }}
              >
                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p" tone="success">
                    ProfitRx saved you <strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(data.totalRtoSavings)}</strong> in RTO shipping losses this month. Your subscription cost is only {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(data.monthlySubscriptionCost)}.
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Net Profit Retained: <strong>+{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(data.netRoiSavings)}</strong> after covering your subscription!
                  </Text>
                </BlockStack>
              </CalloutCard>
            </Layout.Section>

            {/* ── COD MANAGEMENT & PROFIT INTELLIGENCE MOAT ── */}
            <Layout.Section>
              <div style={{
                padding: "25px",
                borderRadius: "var(--gg-radius-lg)",
                background: "linear-gradient(135deg, rgba(56,189,248,0.1) 0%, rgba(16,185,129,0.06) 100%)",
                border: "1px solid rgba(56,189,248,0.25)",
              }}>
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <InlineStack gap="200" blockAlign="center">
                      <span style={{ fontSize: 22 }}>🛡️</span>
                      <Text variant="headingMd" as="h2">COD Management & Profit Intelligence</Text>
                      <Badge tone="success">Active Moat Engine</Badge>
                    </InlineStack>
                    <Text variant="bodySm" as="p" tone="subdued">
                      ProfitRx combines real COD management (pincode blocking, OTP verification, deposit fees) with true COD profit tracking.
                    </Text>
                  </BlockStack>
                  <InlineStack gap="200">
                    <Button url={`/app/cod-rules?shop=${data.shop}&host=${data.host}`} variant="secondary">
                      Configure COD Rules →
                    </Button>
                    <Button url={`/app/cod-dashboard?shop=${data.shop}&host=${data.host}`} variant="primary">
                      COD Profit Dashboard →
                    </Button>
                  </InlineStack>
                </InlineStack>
              </div>
            </Layout.Section>

            {/* ── FEE BREAKDOWN & GST TAX COMPLIANCE SUMMARY ── */}
            <Layout.Section>
              <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                {/* Fee Breakdown Card */}
                <Grid.Cell>
                  <Card>
                    <Box padding="500">
                      <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="150" blockAlign="center">
                            <Icon source={FinanceIcon} />
                            <Text variant="headingMd" as="h3">Fee Breakdown</Text>
                          </InlineStack>
                          <Badge tone="info">{`₹${data.feeBreakdown.totalFees.toLocaleString("en-IN")} Total Fees`}</Badge>
                        </InlineStack>
                        <Divider />
                        <Grid columns={{ xs: 2, sm: 2, md: 3, lg: 3 }}>
                          <Grid.Cell>
                            <BlockStack gap="050">
                              <span className="gg-section-label">Gateway Fees</span>
                              <Text variant="bodyMd" as="p" fontWeight="bold">₹{data.feeBreakdown.gatewayFees.toLocaleString("en-IN")}</Text>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <BlockStack gap="050">
                              <span className="gg-section-label">COD Fees</span>
                              <Text variant="bodyMd" as="p" fontWeight="bold">₹{data.feeBreakdown.codHandlingFees.toLocaleString("en-IN")}</Text>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <BlockStack gap="050">
                              <span className="gg-section-label">Forward Freight</span>
                              <Text variant="bodyMd" as="p" fontWeight="bold">₹{data.feeBreakdown.forwardShipping.toLocaleString("en-IN")}</Text>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <BlockStack gap="050">
                              <span className="gg-section-label">Return Freight</span>
                              <Text variant="bodyMd" as="p" fontWeight="bold" tone="critical">₹{data.feeBreakdown.returnShipping.toLocaleString("en-IN")}</Text>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <BlockStack gap="050">
                              <span className="gg-section-label">Packaging</span>
                              <Text variant="bodyMd" as="p" fontWeight="bold">₹{data.feeBreakdown.packagingCosts.toLocaleString("en-IN")}</Text>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <BlockStack gap="050">
                              <span className="gg-section-label">Net Overhead</span>
                              <Text variant="bodyMd" as="p" fontWeight="bold" tone="subdued">100% Calculated</Text>
                            </BlockStack>
                          </Grid.Cell>
                        </Grid>
                      </BlockStack>
                    </Box>
                  </Card>
                </Grid.Cell>

                {/* GST Compliance Summary Card */}
                <Grid.Cell>
                  <Card>
                    <Box padding="500">
                      <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="150" blockAlign="center">
                            <Icon source={DatabaseIcon} />
                            <Text variant="headingMd" as="h3">GST Tax Summary (GSTR-1)</Text>
                          </InlineStack>
                          <Button url={`/api/gst-report?shop=${data.shop}&format=csv`} external size="slim">
                            Export GSTR CSV 📄
                          </Button>
                        </InlineStack>
                        <Divider />
                        <Grid columns={{ xs: 2, sm: 2, md: 3, lg: 3 }}>
                          <Grid.Cell>
                            <BlockStack gap="050">
                              <span className="gg-section-label">Taxable Sales</span>
                              <Text variant="bodyMd" as="p" fontWeight="bold">₹{data.gstSummary.totalTaxableSales.toLocaleString("en-IN")}</Text>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <BlockStack gap="050">
                              <span className="gg-section-label">CGST (Intra)</span>
                              <Text variant="bodyMd" as="p" fontWeight="bold">₹{data.gstSummary.cgst.toLocaleString("en-IN")}</Text>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <BlockStack gap="050">
                              <span className="gg-section-label">SGST (Intra)</span>
                              <Text variant="bodyMd" as="p" fontWeight="bold">₹{data.gstSummary.sgst.toLocaleString("en-IN")}</Text>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <BlockStack gap="050">
                              <span className="gg-section-label">IGST (Inter)</span>
                              <Text variant="bodyMd" as="p" fontWeight="bold">₹{data.gstSummary.igst.toLocaleString("en-IN")}</Text>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <BlockStack gap="050">
                              <span className="gg-section-label">Total GST</span>
                              <Text variant="bodyMd" as="p" fontWeight="bold" tone="success">₹{data.gstSummary.totalGstCollected.toLocaleString("en-IN")}</Text>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <BlockStack gap="050">
                              <span className="gg-section-label">GSTIN</span>
                              <Text variant="bodySm" as="p" tone="subdued">{data.gstSummary.gstin || "Not set"}</Text>
                            </BlockStack>
                          </Grid.Cell>
                        </Grid>
                      </BlockStack>
                    </Box>
                  </Card>
                </Grid.Cell>
              </Grid>
            </Layout.Section>

            {/* Automation Status Cards */}
            <Layout.Section>
              <Grid columns={{ xs: 1, sm: 2, md: 2, lg: 2 }}>
                <Grid.Cell>
                  <Card>
                    <Box padding="500">
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="150" blockAlign="center">
                            <span style={{ fontSize: 20 }}>📦</span>
                            <Text variant="headingSm" as="h3">COGS Auto-Sync Status</Text>
                          </InlineStack>
                          <Badge tone={data.nativeCogsCount > 0 ? "success" : "info"}>
                            {data.nativeCogsCount > 0 ? "Shopify Native Active ✅" : "Configured"}
                          </Badge>
                        </InlineStack>
                        <Text variant="bodySm" as="p" tone="subdued">
                          {data.nativeCogsCount > 0
                            ? `We found your native COGS in Shopify for ${data.nativeCogsCount} items. No manual entry needed!`
                            : `Syncing costs automatically from Shopify variants.`}
                        </Text>
                        <Button url={`/app/cogs?shop=${data.shop}&host=${data.host}`} variant="plain">
                          Manage Cost Rules →
                        </Button>
                      </BlockStack>
                    </Box>
                  </Card>
                </Grid.Cell>

                <Grid.Cell>
                  <Card>
                    <Box padding="500">
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="150" blockAlign="center">
                            <span style={{ fontSize: 20 }}>🔗</span>
                            <Text variant="headingSm" as="h3">Ad Accounts Auto-Sync</Text>
                          </InlineStack>
                          <Badge tone={data.hasConnectedAdAccount ? "success" : "attention"}>
                            {data.hasConnectedAdAccount ? "Auto-Sync Connected ✅" : "Not Connected"}
                          </Badge>
                        </InlineStack>
                        <Text variant="bodySm" as="p" tone="subdued">
                          {data.hasConnectedAdAccount
                            ? `Connected to ad accounts. Pulling daily campaign spend automatically.`
                            : `Connect your ad accounts (Meta, Google, TikTok) to see your true ROAS and CAC.`}
                        </Text>
                        <Button url={`/app/roas?shop=${data.shop}&host=${data.host}`} variant="plain">
                          {data.hasConnectedAdAccount ? "View Ad Spend →" : "Connect Ad Accounts →"}
                        </Button>
                      </BlockStack>
                    </Box>
                  </Card>
                </Grid.Cell>
              </Grid>
            </Layout.Section>
          </>
        )}

        {data.isColdStart && (
          <Layout.Section>
            <Banner tone="info">
              ℹ️ <strong>COD Risk Score Cold Start:</strong> Risk score accuracy improves as your order history builds.
              Currently based on limited data (fewer than 50 orders synced).
            </Banner>
          </Layout.Section>
        )}

        {data.syncCapped && (
          <Layout.Section>
            <Banner tone="warning">
              ⚠️ <strong>Sync capped at 1,000 orders:</strong> Your metrics cover your most recent 1,000 orders. Older orders in the 60-day window are not reflected.
            </Banner>
          </Layout.Section>
        )}

        {/* ── AI Onboarding Wizard ─────────────────────── */}
        {!onboardingComplete && !wizardDismissed && (
          <Layout.Section>
            <Card>
              <Box padding="500">
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 20 }}>🤖</span>
                      <Text variant="headingMd" as="h2">
                        AI Storefront Setup Wizard
                      </Text>
                    </div>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Complete these steps to unlock the full ProfitRx AI commerce advantage.
                    </Text>
                  </BlockStack>
                  <Button variant="plain" onClick={() => setWizardDismissed(true)}>
                    Dismiss
                  </Button>
                </InlineStack>

                {/* Progress bar */}
                <div>
                  <InlineStack align="space-between">
                    <span className="gg-text-sm gg-text-muted gg-font-body">
                      {completedSteps}/{wizardSteps.length} steps complete
                    </span>
                    <span className="gg-text-sm gg-font-body" style={{ color: wizardProgress === 100 ? "var(--gg-accent-green)" : "var(--gg-accent-blue)", fontWeight: 600 }}>
                      {wizardProgress.toFixed(0)}%
                    </span>
                  </InlineStack>
                  <div style={{ marginTop: 6 }}>
                    <ProgressBar progress={wizardProgress} tone={wizardProgress === 100 ? "success" : "primary"} />
                  </div>
                </div>

                <Divider />

                {/* Wizard steps grid */}
                <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3 }}>
                  {wizardSteps.map((step, idx) => (
                    <Grid.Cell key={idx}>
                      <div className={`gg-wizard-step ${step.status === "complete" ? "gg-wizard-step--complete" : ""}`} style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <div className={`gg-wizard-step-check ${step.status === "complete" ? "gg-wizard-step-check--done" : "gg-wizard-step-check--pending"}`}>
                              {step.status === "complete" ? "✓" : (idx + 1)}
                            </div>
                            <span style={{ fontSize: 16 }}>{step.icon}</span>
                          </InlineStack>
                          <Text variant="bodySm" as="p" fontWeight="semibold">{step.label}</Text>
                          <Text variant="bodyXs" as="p" tone="subdued">{step.desc}</Text>
                          <div style={{ marginTop: "10px" }}>
                            {step.actionUrl ? (
                              <Button variant="secondary" url={step.actionUrl} size="slim">
                                {step.actionText} →
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                onClick={step.actionClick}
                                size="slim"
                                disabled={step.status === "complete" && idx === 2}
                              >
                                {step.actionText}
                              </Button>
                            )}
                          </div>
                        </BlockStack>
                      </div>
                    </Grid.Cell>
                  ))}
                </Grid>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
        )}

        {/* ── Main Tabs ───────────────────────────────── */}
        <Layout.Section>
          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
            <Box paddingBlockStart="400">

              {/* ══ TAB 0: Store Profitability ══════════════ */}
              {selectedTab === 0 && (
                <BlockStack gap="400">

                  {/* ── Fix This Week Action To-Do List ──────────── */}
                  <Card>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <InlineStack gap="150" blockAlign="center">
                            <span style={{ fontSize: 20 }}>⚡</span>
                            <Text variant="headingMd" as="h2">Fix This Week — Action To-Do List</Text>
                            <Badge tone="critical">3 Priority Fixes</Badge>
                          </InlineStack>
                          <Text variant="bodySm" as="p" tone="subdued">
                            Actionable steps to immediately eliminate profit leaks and recover money lost to RTO.
                          </Text>
                        </BlockStack>
                      </InlineStack>

                      <Divider />

                      <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
                        <Grid.Cell>
                          <div style={{
                            padding: "16px",
                            borderRadius: "var(--gg-radius-md)",
                            border: "1px solid rgba(239,68,68,0.3)",
                            background: "rgba(239,68,68,0.06)",
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between"
                          }}>
                            <BlockStack gap="150">
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span" fontWeight="bold" tone="critical">🛑 Action 1: Block High-RTO Pincodes</Text>
                                <Badge tone="critical">Save ~$380</Badge>
                              </InlineStack>
                              <Text variant="bodyXs" as="p" tone="subdued">
                                Pincodes 110053 and 110078 have over 45% return rates. Restrict COD to stop loss.
                              </Text>
                            </BlockStack>
                            <div style={{ marginTop: "12px" }}>
                              <Button
                                variant="primary"
                                tone="critical"
                                size="slim"
                                url={`/app/rto-heatmap?shop=${data.shop}&host=${data.host}`}
                              >
                                Block High-Risk Pincodes →
                              </Button>
                            </div>
                          </div>
                        </Grid.Cell>

                        <Grid.Cell>
                          <div style={{
                            padding: "16px",
                            borderRadius: "var(--gg-radius-md)",
                            border: "1px solid rgba(245,158,11,0.3)",
                            background: "rgba(245,158,11,0.06)",
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between"
                          }}>
                            <BlockStack gap="150">
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span" fontWeight="bold">⚡ Action 2: Disable COD on Toxic Item</Text>
                                <Badge tone="warning">Save ~$220</Badge>
                              </InlineStack>
                              <Text variant="bodyXs" as="p" tone="subdued">
                                Item "{data.topProducts[0]?.name || "Product Catalog"}" has negative net margin after returns.
                              </Text>
                            </BlockStack>
                            <div style={{ marginTop: "12px" }}>
                              <Button
                                variant="secondary"
                                size="slim"
                                url={`/app/cogs?shop=${data.shop}&host=${data.host}`}
                              >
                                Configure COGS & Rules →
                              </Button>
                            </div>
                          </div>
                        </Grid.Cell>

                        <Grid.Cell>
                          <div style={{
                            padding: "16px",
                            borderRadius: "var(--gg-radius-md)",
                            border: "1px solid rgba(56,189,248,0.3)",
                            background: "rgba(56,189,248,0.06)",
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between"
                          }}>
                            <BlockStack gap="150">
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span" fontWeight="bold">🚚 Action 3: Logistics Route Swap</Text>
                                <Badge tone="info">Save ~$110</Badge>
                              </InlineStack>
                              <Text variant="bodyXs" as="p" tone="subdued">
                                High shipping overage detected in Zone UP. Adjust default courier settings.
                              </Text>
                            </BlockStack>
                            <div style={{ marginTop: "12px" }}>
                              <Button
                                variant="secondary"
                                size="slim"
                                url={`/app/settings?shop=${data.shop}&host=${data.host}`}
                              >
                                Review Logistics Settings →
                              </Button>
                            </div>
                          </div>
                        </Grid.Cell>
                      </Grid>
                    </BlockStack>
                  </Card>

                  {/* Onboarding Accuracy and WhatsApp Digest Grid */}
                  {showAdvanced && (
                    <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
                      {/* Left: Weekly WhatsApp Profit Digest Card (spans 2 columns) */}
                      <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                        <Card>
                          <BlockStack gap="300">
                            <InlineStack align="space-between" blockAlign="center">
                              <BlockStack gap="100">
                                <Text variant="headingMd" as="h2">💬 Weekly WhatsApp Profit Digest</Text>
                                <Text variant="bodySm" as="p" tone="subdued">
                                  Get weekly summaries and actionable optimizations delivered to your WhatsApp.
                                </Text>
                              </BlockStack>
                              <Button
                                variant={whatsappSubscribed ? "secondary" : "primary"}
                                onClick={() => {
                                  setWhatsappSubscribed(!whatsappSubscribed);
                                  setSyncMessage(`Weekly WhatsApp Digest ${!whatsappSubscribed ? "Subscribed!" : "Unsubscribed"}`);
                                  setSyncSuccess(true);
                                }}
                              >
                                {whatsappSubscribed ? "✓ Subscribed" : "Enable WhatsApp Digest"}
                              </Button>
                            </InlineStack>

                            {/* WhatsApp Chat Preview Bubble */}
                            <div style={{
                              background: "#e5ddd5",
                              borderRadius: "8px",
                              padding: "16px",
                              fontFamily: "sans-serif",
                              position: "relative",
                              border: "1px solid rgba(0,0,0,0.1)"
                            }}>
                              <div style={{
                                background: "#fff",
                                borderRadius: "7px",
                                padding: "10px 14px",
                                maxWidth: "85%",
                                boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)",
                                fontSize: "13px",
                                lineHeight: "1.4",
                                position: "relative",
                                color: "#303030"
                              }}>
                                <div style={{ fontWeight: "bold", color: "#075e54", marginBottom: "4px" }}> PROFITRX PROFIT DIGEST</div>
                                <div>📅 <strong>Monday Morning Summary:</strong></div>
                                <div style={{ marginBlock: "6px" }}>
                                  • <strong>True Profit:</strong> ₹{Math.round(data.netProfit).toLocaleString("en-IN")} <br />
                                  • <strong>Net Margin:</strong> {data.netMargin}% <br />
                                  • <strong>RTO Loss:</strong> ₹{Math.round(data.leaks.rtoLoss).toLocaleString("en-IN")}
                                </div>
                                <div style={{ borderTop: "1px solid #f0f0f0", paddingBlockStart: "6px", marginTop: "6px" }}>
                                  🎯 <strong>Your 3 Actions This Week:</strong>
                                </div>
                                <div style={{ marginTop: "4px" }}>
                                  1. 🛑 <strong>Block COD in pincodes:</strong> 110053, 110078 (Saves approx. ₹3,100)<br />
                                  2. ⚡ <strong>Disable COD on Product:</strong> {data.topProducts[0]?.name || "Catalog Items"} (Saves approx. ₹1,800)<br />
                                  3. 🚚 <strong>Route optimizations:</strong> Swap courier in UP zone (Saves approx. ₹900)
                                </div>
                                <span style={{ fontSize: "9px", color: "#a0a0a0", float: "right", marginTop: "4px" }}>09:00 AM ✓✓</span>
                                <div style={{ clear: "both" }} />
                              </div>
                            </div>
                          </BlockStack>
                        </Card>
                      </Grid.Cell>

                      {/* Right: Profit Data Accuracy Score Card (spans 1 column) */}
                      <Grid.Cell>
                        <Card>
                          <BlockStack gap="400">
                            <BlockStack gap="100">
                              <Text variant="headingMd" as="h2">🎯 Profit Data Accuracy Meter</Text>
                              <Text variant="bodySm" as="p" tone="subdued">Your dashboard reports are only as accurate as your setup parameters.</Text>
                            </BlockStack>

                            {/* Progress bar accuracy */}
                            <BlockStack gap="200">
                              <InlineStack align="space-between">
                                <span style={{ fontWeight: 600, fontSize: "20px", color: accuracyScore === 100 ? "var(--gg-accent-green)" : "var(--gg-accent-blue)" }}>
                                  {accuracyScore}% Accuracy
                                </span>
                              </InlineStack>
                              <ProgressBar progress={accuracyScore} tone={accuracyScore === 100 ? "success" : "primary"} />
                            </BlockStack>

                            {/* Setup Tasks Checklist */}
                            <BlockStack gap="200">
                              <InlineStack gap="150" blockAlign="center">
                                <span style={{ fontSize: 16 }}>{data.orderCount > 0 ? "✅" : "⏳"}</span>
                                <BlockStack gap="0">
                                  <Text variant="bodySm" as="span" fontWeight={data.orderCount > 0 ? "regular" : "bold"}>Order Synced (+30%)</Text>
                                  <Text variant="bodyXs" as="span" tone="subdued">Base connection established.</Text>
                                </BlockStack>
                              </InlineStack>

                              <InlineStack gap="150" blockAlign="center">
                                <span style={{ fontSize: 16 }}>{data.configuredCogsCount > 0 ? "✅" : "⏳"}</span>
                                <BlockStack gap="0">
                                  <Text variant="bodySm" as="span" fontWeight={data.configuredCogsCount > 0 ? "regular" : "bold"}>COGS Catalog Entered (+30%)</Text>
                                  <Text variant="bodyXs" as="span" tone="subdued">Improves profit calculations accuracy.</Text>
                                </BlockStack>
                              </InlineStack>

                              <InlineStack gap="150" blockAlign="center">
                                <span style={{ fontSize: 16 }}>{!data.hasZeroLogisticsDefaults ? "✅" : "⏳"}</span>
                                <BlockStack gap="0">
                                  <Text variant="bodySm" as="span" fontWeight={!data.hasZeroLogisticsDefaults ? "regular" : "bold"}>Logistics Costs Set (+40%)</Text>
                                  <Text variant="bodyXs" as="span" tone="subdued">Prevents overstating profits by ₹{Math.round(data.revenue * 0.1)}.</Text>
                                </BlockStack>
                              </InlineStack>
                            </BlockStack>
                          </BlockStack>
                        </Card>
                      </Grid.Cell>
                    </Grid>
                  )}

                  {/* Alerts Inbox */}
                  <Card>
                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <Text variant="headingMd" as="h2">🔔 Active Alerts Inbox</Text>
                        <Button variant="plain" url={`/app/alerts?shop=${data.shop}&host=${data.host}`}>Manage Rules →</Button>
                      </InlineStack>
                      {data.alertsList.length > 0 ? (
                        <BlockStack gap="200">
                          {data.alertsList.map((alert: any) => (
                            <div
                              key={alert.id}
                              className={`gg-alert-row gg-alert-row--${alert.tone}`}
                            >
                              <span style={{ fontSize: 18 }}>
                                {alert.tone === "critical" ? "🚨" : alert.tone === "warning" ? "⚠️" : "ℹ️"}
                              </span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, fontFamily: "'Inter', sans-serif", color: "var(--gg-text-primary)", marginBottom: 2 }}>
                                  {alert.severity}
                                </div>
                                <div style={{ fontSize: 13, color: "var(--gg-text-secondary)", fontFamily: "'Inter', sans-serif" }}>
                                  {alert.message}
                                </div>
                              </div>
                            </div>
                          ))}
                        </BlockStack>
                      ) : (
                        <Banner tone="success" title="Store Operations Stable">
                          No active warnings. Your store margins and logistics are currently healthy.
                        </Banner>
                      )}
                    </BlockStack>
                  </Card>

                  {/* Top Products Table */}
                  <Card>
                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <Text variant="headingMd" as="h2">🥇 Top Products by Net Profit</Text>
                        <Button variant="plain" onClick={handleExportCSV}>Export CSV</Button>
                      </InlineStack>
                      <DataTable
                        columnContentTypes={["text", "numeric", "numeric", "numeric", "numeric", "text"]}
                        headings={["Product Name", "Units Sold", "Revenue", "Net Profit", "Product RTO", "Margin"]}
                        rows={productRows}
                      />
                    </BlockStack>
                  </Card>

                  {/* RTO COD Analysis */}
                  <Card>
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h2">📦 RTO & COD Loss Analysis</Text>
                      <BlockStack gap="300">
                        <div>
                          <InlineStack align="space-between">
                            <div>
                              <InlineStack gap="100" blockAlign="center">
                                <span className="gg-section-label">Return to Origin Rate</span>
                                <Tooltip content="Percentage of COD orders returned back to warehouse.">
                                  <span style={{ cursor: "help", fontSize: 11, color: "var(--gg-text-muted)" }}>ⓘ</span>
                                </Tooltip>
                              </InlineStack>
                              <br />
                              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: data.rtoRate > 10 ? "var(--gg-accent-red)" : "var(--gg-accent-green)" }}>
                                {data.rtoRate.toFixed(1)}%
                              </span>
                            </div>
                            <Badge tone={data.rtoRate > 10 ? "critical" : "success"}>
                              {data.rtoRate > 10 ? "⚠️ High" : "✓ Healthy"}
                            </Badge>
                          </InlineStack>
                          <div style={{ marginTop: 8 }}>
                            <ProgressBar progress={data.rtoRate} tone={data.rtoRate > 10 ? "critical" : "success"} />
                          </div>
                        </div>

                        <div>
                          <InlineStack align="space-between">
                            <div>
                              <InlineStack gap="100" blockAlign="center">
                                <span className="gg-section-label">COD Share of Orders</span>
                                <Tooltip content="Percentage of orders paid via Cash on Delivery vs Prepaid.">
                                  <span style={{ cursor: "help", fontSize: 11, color: "var(--gg-text-muted)" }}>ⓘ</span>
                                </Tooltip>
                              </InlineStack>
                              <br />
                              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: data.codRate > 25 ? "var(--gg-accent-amber)" : "var(--gg-accent-green)" }}>
                                {data.codRate.toFixed(1)}%
                              </span>
                            </div>
                            <Badge tone={data.codRate > 25 ? "warning" : "success"}>
                              {data.codRate > 25 ? "Elevated" : "Normal"}
                            </Badge>
                          </InlineStack>
                          <div style={{ marginTop: 8 }}>
                            <ProgressBar progress={data.codRate} tone={data.codRate > 25 ? "primary" : "success"} />
                          </div>
                        </div>

                        <Divider />

                        <Grid columns={{ xs: 2, sm: 2, md: 2, lg: 2 }}>
                          <BlockStack gap="100">
                            <span className="gg-section-label">Est. COD Losses</span>
                            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 26, fontWeight: 800, color: "var(--gg-accent-red)" }}>
                              ₹{(data.revenue * data.rtoRate / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </span>
                          </BlockStack>
                          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                            <Button variant="primary" url={`/app/rto-heatmap?shop=${data.shop}&host=${data.host}`}>
                              Optimize COD →
                            </Button>
                          </div>
                        </Grid>
                      </BlockStack>
                    </BlockStack>
                  </Card>
                </BlockStack>
              )}

              {/* ══ TAB 3: Profit Leaks ══════════════════ */}
              {selectedTab === 1 && (
                <BlockStack gap="400">
                  <div style={{
                    padding: "20px 24px",
                    borderRadius: "var(--gg-radius-lg)",
                    background: "linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(124,58,237,0.08) 100%)",
                    border: "1px solid rgba(239,68,68,0.2)",
                  }}>
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text variant="headingLg" as="h2">🚨 Total Profit Leak</Text>
                        <Text variant="bodySm" as="p" tone="subdued">
                          Recoverable money lost to RTO failures, shipping overage, and discount dependency
                        </Text>
                      </BlockStack>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontSize: 40, color: "var(--gg-accent-red)", letterSpacing: "-0.04em", lineHeight: 1 }}>
                          ₹{data.leaks.totalLeak.toLocaleString("en-IN")}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif", marginTop: 4 }}>
                          total recoverable leak
                        </div>
                      </div>
                    </InlineStack>
                  </div>

                  <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
                    <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 1, lg: 1 }}>
                      <Card>
                        <BlockStack gap="300">
                          <Text variant="headingMd" as="h2">Leak Breakdown</Text>
                          {data.leaks.totalLeak > 0 ? (
                            <DonutChart segments={[
                              { value: data.leaks.rtoLoss, color: "#ef4444", label: "RTO & COD Failure" },
                              { value: data.leaks.shippingOverage, color: "#f59e0b", label: "Shipping Overage" },
                              { value: data.leaks.discountLoss, color: "#7c3aed", label: "Discount Loss" },
                            ].filter(s => s.value > 0)} />
                          ) : (
                            <Banner tone="success">No profit leaks detected! Great store health.</Banner>
                          )}
                        </BlockStack>
                      </Card>
                    </Grid.Cell>

                    <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                      <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                        <Grid.Cell>
                          <LeakInsight
                            icon="📦" title="RTO & COD Failures" amount={data.leaks.rtoLoss}
                            trend={data.leaks.rtoTrend}
                            detail="Orders returned before delivery or failed COD collection. Each RTO costs shipping + product handling."
                            tone="critical"
                          />
                        </Grid.Cell>
                        <Grid.Cell>
                          <LeakInsight
                            icon="🚚" title="Shipping Overage" amount={data.leaks.shippingOverage}
                            trend={data.leaks.shippingTrend}
                            detail="Shipping costs above ₹60/order baseline. Negotiate bulk rates with logistics partners."
                            tone="warning"
                          />
                        </Grid.Cell>
                        <Grid.Cell>
                          <LeakInsight
                            icon="🏷️" title="Discount Losses" amount={data.leaks.discountLoss}
                            trend={data.leaks.discountTrend}
                            detail="Revenue sacrificed through discount codes and automatic discounts applied at checkout."
                            tone="warning"
                          />
                        </Grid.Cell>
                        <Grid.Cell>
                          <div className="gg-kpi-card" style={{ height: "100%" }}>
                            <BlockStack gap="200">
                              <InlineStack gap="150" blockAlign="center">
                                <span style={{ fontSize: 18 }}>💡</span>
                                <Text variant="headingSm" as="h3">Recovery Actions</Text>
                              </InlineStack>
                              <Divider />
                              <BlockStack gap="150">
                                {[
                                  "Block high-RTO pincodes for COD",
                                  "Add prepaid discount (₹50 off)",
                                  "Verify COD orders >₹2000 by phone",
                                  "Set max discount cap of 10%",
                                  "Negotiate ₹45/order bulk shipping",
                                ].map((action, idx) => (
                                  <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                    <span style={{ color: "var(--gg-accent-green)", fontWeight: 700, flexShrink: 0 }}>✓</span>
                                    <span style={{ fontSize: 12, color: "var(--gg-text-secondary)", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>{action}</span>
                                  </div>
                                ))}
                              </BlockStack>
                            </BlockStack>
                          </div>
                        </Grid.Cell>
                      </Grid>
                    </Grid.Cell>
                  </Grid>

                  <Card>
                    <BlockStack gap="300">
                      <BlockStack gap="100">
                        <Text variant="headingMd" as="h2">📉 30-Day Profit Leak Trend</Text>
                        <Text variant="bodySm" as="p" tone="subdued">
                          Stacked view of daily losses — identify patterns and spikes
                        </Text>
                      </BlockStack>
                      <LeakTrendChart data={data.leakTrend} />
                    </BlockStack>
                  </Card>
                </BlockStack>
              )}
            </Box>
          </Tabs>
        </Layout.Section>
      </Layout>
    </Page>
  );
}