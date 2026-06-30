import { useState, useEffect, useRef } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ProfitService } from "../services/profit.service";
import { ShopifyService } from "../services/shopify.service";
import { ProfitIntelligenceService } from "../services/profit-intelligence.service";
import { getFeatureList } from "../services/feature-access.service";

// Helper to check for COD gateways
const isCodGateway = (gateway: string | null) => {
  if (!gateway) return false;
  const lower = gateway.toLowerCase();
  return lower.includes("cod") || lower.includes("cash") || lower.includes("manual");
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";

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
    products = await ShopifyService.getProducts(request);
  } catch (err) {
    console.error("Failed to fetch products for dashboard:", err);
  }
  const productMap = new Map(products.map((p) => [p.id, p.title]));

  const settings = await prisma.storeSettings.findUnique({ where: { shop } }) || {
    defaultForwardShipping: 60,
    defaultReturnShipping: 70,
    defaultCODHandling: 40,
    defaultPackaging: 10,
    defaultGatewayFeePct: 2,
  };

  const revenue = orders.reduce((sum: number, o: any) => sum + o.totalPrice, 0);
  const orderCount = orders.length;

  let totalCOGS = 0;
  let totalFees = 0;
  for (const o of orders) {
    const cost = cogsMap[o.productId || ""] ?? o.totalPrice * 0.4;
    const { fees } = ProfitService.calculateOrderProfit(o, cost, settings);
    totalCOGS += cost;
    totalFees += fees;
  }

  const profit = revenue - totalCOGS - totalFees;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const netProfit = profit - leaks.rtoLoss;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

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

  const productMargins: Record<string, { title: string; revenue: number; profit: number; volume: number }> = {};
  for (const order of orders) {
    const productId = order.productId;
    if (productId) {
      const title = productMap.get(productId) || `Product ID: ${productId}`;
      const existing = productMargins[productId] || { title, revenue: 0, profit: 0, volume: 0 };
      existing.revenue += order.totalPrice;
      existing.volume += 1;
      const c = cogsMap[productId] ?? order.totalPrice * 0.4;
      const { profit } = ProfitService.calculateOrderProfit(order, c, settings);
      existing.profit += profit;
      productMargins[productId] = existing;
    }
  }

  const topProducts = Object.values(productMargins)
    .map((p) => ({
      name: p.title,
      revenue: p.revenue,
      profit: p.profit,
      volume: p.volume,
      margin: p.revenue > 0 ? Math.round((p.profit / p.revenue) * 100) : 0,
    }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);

  const finalTopProducts = topProducts.length > 0 ? topProducts : [
    { name: "No products synced yet", revenue: 0, profit: 0, volume: 0, margin: 0 },
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
    const attr = (order as any).channelAttribution || "Website";
    if (!aiChannelMetrics[attr]) {
      aiChannelMetrics[attr] = { name: attr, revenue: 0, profit: 0, orderCount: 0, codCount: 0, rtoCount: 0, rtoRate: 0, aov: 0, repeatRate: 0, ltv: 0, newCount: 0, returningCount: 0 };
      customerOrdersMap[attr] = {};
      customerRevenueMap[attr] = {};
    }
    const metric = aiChannelMetrics[attr];
    metric.revenue += order.totalPrice;
    metric.orderCount += 1;
    const cogs = cogsMap[order.productId || ""] ?? order.totalPrice * 0.4;
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
    const dateStr = o.createdAt.toISOString().split("T")[0];
    if (dailyStats[dateStr]) {
      const c = cogsMap[o.productId || ""] ?? o.totalPrice * 0.4;
      const f = o.totalTax + o.shippingPrice;
      const p = o.totalPrice - c - f;
      dailyStats[dateStr].revenue += o.totalPrice;
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
  const isAttributionActive = aiOrdersCount >= 5 || process.env.BYPASS_BILLING === "true" || process.env.NODE_ENV === "development";

  return {
    shop, host, revenue, profit, margin: Math.round(margin * 10) / 10,
    netProfit, netMargin: Math.round(netMargin * 10) / 10,
    healthScore, alertsList, orderCount, topProducts: finalTopProducts,
    rtoRate: Math.round(rtoRate * 10) / 10, codRate: Math.round(codRate * 10) / 10,
    aiChannelMetrics: Object.values(aiChannelMetrics), aiReadinessScore,
    isAttributionActive,
    chartData, searchQueries: mappedQueries,
    products: products.map((p) => ({ id: p.id, title: p.title })),
    leaks, leakTrend,
    features,
  };
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
        {data.filter((_, idx) => idx % 5 === 0).map((d, idx) => {
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
    Gemini:  { rev: "#2563eb", profit: "#1d4ed8" },
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
  Gemini:  { icon: "✨", color: "#3b82f6" },
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

  const isCogsSetup = data.aiReadinessScore > 50;
  const isAttributionActive = data.orderCount > 0 && data.aiChannelMetrics.some(m => m.name !== "Website" && m.orderCount > 0);
  const isSearchActive = data.searchQueries.length > 0;

  const wizardSteps = [
    { label: "Sync Catalog with AI Agents",    icon: "📦", status: data.products.length > 0 ? "complete" : "pending", desc: "Catalog indexed for AI discovery." },
    { label: "Configure COGS Pricing Rules",   icon: "💰", status: isCogsSetup ? "complete" : "pending",             desc: "Set target margins on Costs tab." },
    { label: "Enable AI Storefront Attribution", icon: "🤖", status: isAttributionActive ? "complete" : "pending",   desc: "Track Gemini, ChatGPT & Copilot." },
    { label: "Verify Search Intelligence",     icon: "🔍", status: isSearchActive ? "complete" : "pending",          desc: "Monitor CTR and keyword ranks." },
  ];

  const completedSteps = wizardSteps.filter(s => s.status === "complete").length;
  const wizardProgress = (completedSteps / wizardSteps.length) * 100;

  const tabs = [
    { id: "store-profitability",   content: "⚡ Store Profitability",     panelID: "tab-0" },
    { id: "ai-attribution",        content: "🤖 AI Channel Attribution",  panelID: "tab-1" },
    { id: "search-intelligence",   content: "🔍 Search Intelligence",     panelID: "tab-2" },
    { id: "profit-leaks",          content: "💸 Profit Leaks",            panelID: "tab-3" },
  ];

  const productRows = data.topProducts.map((p) => [
    <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, color: "var(--gg-text-primary)" }}>{p.name}</span>,
    <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, color: "var(--gg-text-secondary)" }}>{p.volume}</span>,
    <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>₹{p.revenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>,
    <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, color: p.profit >= 0 ? "var(--gg-accent-green)" : "var(--gg-accent-red)" }}>
      ₹{p.profit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
    </span>,
    <Badge key={p.name} tone={p.margin > 30 ? "success" : p.margin > 15 ? "warning" : "critical"}>{`${p.margin}%`}</Badge>,
  ]);

  const productsWithQueries = new Set(data.searchQueries.map((sq: any) => sq.productName.toLowerCase()));
  const missingOpportunities = data.products.filter(p => !productsWithQueries.has(p.title.toLowerCase()));

  return (
    <Page
      title={`Greek God — ${data.shop?.replace(".myshopify.com", "") || "Store"}`}
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

        {/* ── AI Onboarding Wizard ─────────────────────── */}
        {!wizardDismissed && (
          <Layout.Section>
            <Card>
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
                      Complete these steps to unlock the full Greek God AI commerce advantage.
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
                <Grid columns={{ xs: 1, sm: 2, md: 4, lg: 4 }}>
                  {wizardSteps.map((step, idx) => (
                    <Grid.Cell key={idx}>
                      <div className={`gg-wizard-step ${step.status === "complete" ? "gg-wizard-step--complete" : ""}`}>
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <div className={`gg-wizard-step-check ${step.status === "complete" ? "gg-wizard-step-check--done" : "gg-wizard-step-check--pending"}`}>
                              {step.status === "complete" ? "✓" : (idx + 1)}
                            </div>
                            <span style={{ fontSize: 16 }}>{step.icon}</span>
                          </InlineStack>
                          <Text variant="bodySm" as="p" fontWeight="semibold">{step.label}</Text>
                          <Text variant="bodyXs" as="p" tone="subdued">{step.desc}</Text>
                        </BlockStack>
                      </div>
                    </Grid.Cell>
                  ))}
                </Grid>
              </BlockStack>
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

                  {/* Metric Cards */}
                  <Grid columns={{ xs: 1, sm: 2, md: 5, lg: 5 }}>
                    {/* Revenue */}
                    <Grid.Cell>
                      <Card>
                        <div className="gg-card-revenue">
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="start">
                              <div className="gg-stat-icon gg-stat-icon--blue">💹</div>
                              <Tooltip content="Sum of all order sales including shipping and tax.">
                                <span style={{ cursor: "help", fontSize: 12, color: "var(--gg-text-muted)" }}>ⓘ</span>
                              </Tooltip>
                            </InlineStack>
                            <BlockStack gap="050">
                              <span className="gg-section-label">Total Revenue</span>
                              <StatNumber value={Math.round(data.revenue)} prefix="₹" />
                            </BlockStack>
                            <span className="gg-trend-up">▲ +12% target</span>
                          </BlockStack>
                        </div>
                      </Card>
                    </Grid.Cell>

                    {/* Net Profit */}
                    <Grid.Cell>
                      <Card>
                        <div className={`gg-card-${data.netProfit >= 0 ? "profit" : "danger"}`}>
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="start">
                              <div className={`gg-stat-icon gg-stat-icon--${data.netProfit >= 0 ? "green" : "red"}`}>
                                {data.netProfit >= 0 ? "📈" : "📉"}
                              </div>
                              <Tooltip content="Sales minus COGS, shipping cost, and transaction/RTO leaks.">
                                <span style={{ cursor: "help", fontSize: 12, color: "var(--gg-text-muted)" }}>ⓘ</span>
                              </Tooltip>
                            </InlineStack>
                            <BlockStack gap="050">
                              <span className="gg-section-label">Net Profit</span>
                              <StatNumber
                                value={Math.round(Math.abs(data.netProfit))}
                                prefix={data.netProfit < 0 ? "-₹" : "₹"}
                                colorClass={data.netProfit >= 0 ? "gg-stat-value-green" : "gg-stat-value-red"}
                              />
                            </BlockStack>
                            <span className={data.netProfit >= 0 ? "gg-trend-up" : "gg-trend-down"}>
                              {data.netProfit >= 0 ? "▲ Positive Profit" : "▼ Negative Profit"}
                            </span>
                          </BlockStack>
                        </div>
                      </Card>
                    </Grid.Cell>

                    {/* Margin */}
                    <Grid.Cell>
                      <Card>
                        <BlockStack gap="200">
                          <InlineStack align="space-between" blockAlign="start">
                            <div className="gg-stat-icon gg-stat-icon--purple">🎯</div>
                            <Tooltip content="Net Profit divided by Revenue. Aim for >20%.">
                              <span style={{ cursor: "help", fontSize: 12, color: "var(--gg-text-muted)" }}>ⓘ</span>
                            </Tooltip>
                          </InlineStack>
                          <BlockStack gap="050">
                            <span className="gg-section-label">Net Margin</span>
                            <StatNumber
                              value={Math.round(data.netMargin)}
                              suffix="%"
                              colorClass={data.netMargin > 20 ? "gg-stat-value-green" : data.netMargin > 10 ? "gg-stat-value" : "gg-stat-value-red"}
                            />
                          </BlockStack>
                          <Badge tone={data.netMargin > 20 ? "success" : data.netMargin > 10 ? "warning" : "critical"}>
                            {data.netMargin > 20 ? "Healthy" : "Low Margin"}
                          </Badge>
                        </BlockStack>
                      </Card>
                    </Grid.Cell>

                    {/* Orders */}
                    <Grid.Cell>
                      <Card>
                        <BlockStack gap="200">
                          <InlineStack align="space-between" blockAlign="start">
                            <div className="gg-stat-icon gg-stat-icon--amber">🛒</div>
                            <Tooltip content="Cumulative order volume in store.">
                              <span style={{ cursor: "help", fontSize: 12, color: "var(--gg-text-muted)" }}>ⓘ</span>
                            </Tooltip>
                          </InlineStack>
                          <BlockStack gap="050">
                            <span className="gg-section-label">Total Orders</span>
                            <StatNumber value={data.orderCount} colorClass="gg-stat-value-neutral" />
                          </BlockStack>
                          <span className="gg-trend-neutral">All-time orders</span>
                        </BlockStack>
                      </Card>
                    </Grid.Cell>

                    {/* Profit Leaks */}
                    <Grid.Cell>
                      <Card>
                        <div className="gg-card-health" style={{ border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.05)" }}>
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="start">
                              <div className="gg-stat-icon gg-stat-icon--red">💸</div>
                              <Tooltip content="Recoverable money lost to RTO, shipping overage, and discounts.">
                                <span style={{ cursor: "help", fontSize: 12, color: "var(--gg-text-muted)" }}>ⓘ</span>
                              </Tooltip>
                            </InlineStack>
                            <BlockStack gap="050">
                              <span className="gg-section-label" style={{ color: "var(--gg-accent-red)" }}>Profit Leaks</span>
                              <StatNumber
                                value={Math.round(data.leaks.totalLeak)}
                                prefix="₹"
                                colorClass="gg-stat-value-red"
                              />
                            </BlockStack>
                            <Button variant="plain" onClick={() => setSelectedTab(3)}>
                              Leak Details →
                            </Button>
                          </BlockStack>
                        </div>
                      </Card>
                    </Grid.Cell>
                  </Grid>

                  {/* Profit Trend Chart */}
                  <Card>
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
                      <ProfitTrendChart data={data.chartData} />
                    </BlockStack>
                  </Card>

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
                        columnContentTypes={["text", "numeric", "numeric", "numeric", "text"]}
                        headings={["Product Name", "Units Sold", "Revenue", "Net Profit", "Margin"]}
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
                              <span className="gg-section-label">Return to Origin Rate</span>
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
                              <span className="gg-section-label">COD Share of Orders</span>
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

              {/* ══ TAB 1: AI Channel Attribution ══════════ */}
              {selectedTab === 1 && data.features.includes("ai_attribution") && (
                !data.isAttributionActive ? (
                  <Card>
                    <div style={{ padding: "40px 0" }}>
                      <BlockStack gap="400" align="center" inlineAlign="center">
                        <div style={{ fontSize: 64, filter: "drop-shadow(0 0 10px rgba(124, 58, 237, 0.3))" }}>🤖</div>
                        <BlockStack gap="100" align="center">
                          <div style={{ textAlign: "center" }}>
                            <Text variant="headingLg" as="h2">AI Channel Attribution is Coming Soon</Text>
                          </div>
                          <div style={{ textAlign: "center", maxWidth: "600px", margin: "0 auto" }}>
                            <Text variant="bodyMd" as="p" tone="subdued">
                              This dashboard tracks purchases made by customers using buyer AI search agents (e.g. Gemini, ChatGPT, Perplexity).
                            </Text>
                            <Text variant="bodyMd" as="p" tone="subdued">
                              To activate, your store must be indexed for <strong>Shopify Agentic Storefronts</strong>.
                            </Text>
                          </div>
                        </BlockStack>
                      </BlockStack>
                    </div>
                  </Card>
                ) : (
                  <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
                  <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                    <Card>
                      <BlockStack gap="300">
                        <Text variant="headingMd" as="h2">🤖 AI Commerce Channel Metrics</Text>
                        <div className="gg-overflow-x">
                          <table className="gg-table">
                            <thead>
                              <tr>
                                <th>Channel</th>
                                <th>Revenue</th>
                                <th>Profit</th>
                                <th>Margin</th>
                                <th>AOV</th>
                                <th>LTV</th>
                                <th>Repeat %</th>
                                <th>New/Ret</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.aiChannelMetrics.map((c: any) => {
                                const marginVal = c.revenue > 0 ? Math.round((c.profit / c.revenue) * 100) : 0;
                                const meta = CHANNEL_META[c.name] || CHANNEL_META.Website;
                                return (
                                  <tr key={c.name}>
                                    <td>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 16 }}>{meta.icon}</span>
                                        <span style={{ fontWeight: 600, color: "var(--gg-text-primary)", fontFamily: "'Inter', sans-serif" }}>{c.name}</span>
                                      </div>
                                    </td>
                                    <td style={{ fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>₹{c.revenue.toLocaleString("en-IN")}</td>
                                    <td style={{ color: c.profit >= 0 ? "var(--gg-accent-green)" : "var(--gg-accent-red)", fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>
                                      ₹{c.profit.toLocaleString("en-IN")}
                                    </td>
                                    <td>
                                      <Badge tone={marginVal > 25 ? "success" : marginVal > 15 ? "warning" : "critical"}>
                                        {`${marginVal}%`}
                                      </Badge>
                                    </td>
                                    <td>₹{c.aov.toLocaleString("en-IN")}</td>
                                    <td>₹{c.ltv.toLocaleString("en-IN")}</td>
                                    <td>{c.repeatRate}%</td>
                                    <td style={{ color: "var(--gg-text-muted)" }}>{c.newCount}/{c.returningCount}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </BlockStack>
                    </Card>
                  </Grid.Cell>

                  <Grid.Cell>
                    <Card>
                      <BlockStack gap="300">
                        <BlockStack gap="100">
                          <Text variant="headingMd" as="h2">Revenue by AI Agent</Text>
                          <Text variant="bodySm" as="p" tone="subdued">
                            Revenue comparison across buyer AI assistants.
                          </Text>
                        </BlockStack>
                        <ChannelBarChart data={data.aiChannelMetrics} />
                      </BlockStack>
                    </Card>
                  </Grid.Cell>
                </Grid>
              ))}

              {selectedTab === 1 && !data.features.includes("ai_attribution") && (
                <div style={{ padding: "48px 24px", textAlign: "center", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(25, 20, 45, 0.4)", backdropFilter: "blur(20px)" }}>
                  <BlockStack gap="400" align="center" inlineAlign="center">
                    <div style={{ fontSize: 64, filter: "drop-shadow(0 0 10px rgba(124, 58, 237, 0.5))" }}>🤖</div>
                    <BlockStack gap="100">
                      <Text variant="headingLg" as="h2">AI Channel Attribution is Locked</Text>
                      <Text variant="bodyMd" as="p" tone="subdued">
                        Identify precise sales volumes coming from Gemini, ChatGPT, and Copilot.
                      </Text>
                      <Text variant="bodyMd" as="p" tone="subdued">
                        Upgrade to the <strong>Growth Plan</strong> to unlock complete AI attribution metrics.
                      </Text>
                    </BlockStack>
                    <div style={{ marginTop: 12 }}>
                      <Button url={`/app/pricing?shop=${data.shop}&host=${data.host}`} variant="primary">Upgrade to Growth</Button>
                    </div>
                  </BlockStack>
                </div>
              )}

              {/* ══ TAB 2: Search Intelligence ══════════════ */}
              {selectedTab === 2 && data.features.includes("ai_attribution") && (
                <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
                  <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                    <Card>
                      <BlockStack gap="300">
                        <BlockStack gap="100">
                          <Text variant="headingMd" as="h2">🔍 AI Agent Search Rankings & CTR</Text>
                          <Text variant="bodySm" as="p" tone="subdued">
                            Queries customers use inside AI agents to find your products.
                          </Text>
                        </BlockStack>
                        <div className="gg-overflow-x">
                          <table className="gg-table">
                            <thead>
                              <tr>
                                <th>Search Query</th>
                                <th>Target Product</th>
                                <th>Rank</th>
                                <th>Impressions</th>
                                <th>Clicks</th>
                                <th>CTR</th>
                                <th>Agent</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.searchQueries.map((sq: any) => (
                                <tr key={sq.id}>
                                  <td style={{ fontStyle: "italic", color: "var(--gg-text-primary)" }}>"{sq.query}"</td>
                                  <td style={{ fontWeight: 500 }}>{sq.productName}</td>
                                  <td>
                                    <Badge tone={sq.rank === 1 ? "success" : sq.rank <= 3 ? "attention" : "info"}>
                                      {`#${sq.rank}`}
                                    </Badge>
                                  </td>
                                  <td>{sq.impressions.toLocaleString()}</td>
                                  <td>{sq.clicks.toLocaleString()}</td>
                                  <td style={{ fontWeight: 700, color: "var(--gg-accent-blue)" }}>{sq.ctr.toFixed(1)}%</td>
                                  <td>
                                    <Badge tone={sq.channel === "ChatGPT" ? "success" : sq.channel === "Gemini" ? "info" : "attention"}>
                                      {(CHANNEL_META[sq.channel]?.icon || "") + " " + sq.channel}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                              {data.searchQueries.length === 0 && (
                                <tr>
                                  <td colSpan={7} style={{ textAlign: "center", padding: "24px", color: "var(--gg-text-muted)" }}>
                                    No search queries yet. Click "⟳ Sync Orders" to populate.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </BlockStack>
                    </Card>
                  </Grid.Cell>

                  <Grid.Cell>
                    <BlockStack gap="400">
                      {/* Competitor AI Visibility */}
                      <Card>
                        <BlockStack gap="300">
                          <BlockStack gap="100">
                            <Text variant="headingMd" as="h2">🏅 AI Visibility Share</Text>
                            <Text variant="bodySm" as="p" tone="subdued">Brand share of voice inside AI search engines.</Text>
                          </BlockStack>

                          <BlockStack gap="300">
                            {[
                              { engine: "ChatGPT Search", us: 35, comp1: 45, comp2: 20 },
                              { engine: "Gemini Engine",  us: 48, comp1: 32, comp2: 20 },
                              { engine: "Copilot Shop",   us: 42, comp1: 38, comp2: 20 },
                            ].map((item, idx) => (
                              <BlockStack gap="100" key={idx}>
                                <InlineStack align="space-between">
                                  <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'Inter', sans-serif", color: "var(--gg-text-secondary)" }}>
                                    {item.engine}
                                  </span>
                                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'Outfit', sans-serif", color: "var(--gg-accent-purple)" }}>
                                    {item.us}%
                                  </span>
                                </InlineStack>
                                <div style={{ height: 18, width: "100%", borderRadius: 6, display: "flex", overflow: "hidden", background: "rgba(255,255,255,0.05)" }}>
                                  <div style={{ width: `${item.us}%`, height: "100%", background: "linear-gradient(90deg, #7c3aed, #2563eb)" }} title={`Greek God: ${item.us}%`} />
                                  <div style={{ width: `${item.comp1}%`, height: "100%", background: "rgba(148,163,184,0.25)" }} title={`Competitor 1: ${item.comp1}%`} />
                                  <div style={{ width: `${item.comp2}%`, height: "100%", background: "rgba(148,163,184,0.1)" }} title={`Competitor 2: ${item.comp2}%`} />
                                </div>
                              </BlockStack>
                            ))}
                          </BlockStack>

                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
                            {[
                              { color: "#7c3aed", label: "Greek God" },
                              { color: "rgba(148,163,184,0.5)", label: "Competitor 1" },
                              { color: "rgba(148,163,184,0.2)", label: "Competitor 2" },
                            ].map((l) => (
                              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: l.color }} />
                                <span style={{ fontSize: 11, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>{l.label}</span>
                              </div>
                            ))}
                          </div>
                        </BlockStack>
                      </Card>

                      {/* Missing Search Opportunities */}
                      <Card>
                        <BlockStack gap="300">
                          <BlockStack gap="100">
                            <Text variant="headingMd" as="h2">💡 Missing Opportunities</Text>
                            <Text variant="bodySm" as="p" tone="subdued">
                              Products missing visibility on AI search engines.
                            </Text>
                          </BlockStack>
                          <BlockStack gap="200">
                            {missingOpportunities.slice(0, 3).map((item, idx) => (
                              <div key={idx} style={{
                                padding: "12px 14px",
                                borderRadius: "var(--gg-radius-md)",
                                border: "1px solid var(--gg-border)",
                                background: "var(--gg-surface-2)",
                              }}>
                                <BlockStack gap="100">
                                  <Text variant="bodySm" as="p" fontWeight="semibold">{item.title}</Text>
                                  <Text variant="bodyXs" as="p" tone="subdued">No AI search footprint detected</Text>
                                  <Badge tone="attention">{`buy ${item.title.toLowerCase()} online`}</Badge>
                                </BlockStack>
                              </div>
                            ))}
                            {missingOpportunities.length === 0 && (
                              <Banner tone="success">
                                All products indexed! 100% AI search coverage achieved.
                              </Banner>
                            )}
                          </BlockStack>
                        </BlockStack>
                      </Card>
                    </BlockStack>
                  </Grid.Cell>
                </Grid>
              )}

              {selectedTab === 2 && !data.features.includes("ai_attribution") && (
                <div style={{ padding: "48px 24px", textAlign: "center", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(25, 20, 45, 0.4)", backdropFilter: "blur(20px)" }}>
                  <BlockStack gap="400" align="center" inlineAlign="center">
                    <div style={{ fontSize: 64, filter: "drop-shadow(0 0 10px rgba(124, 58, 237, 0.5))" }}>🔍</div>
                    <BlockStack gap="100">
                      <Text variant="headingLg" as="h2">AI Search Intelligence is Locked</Text>
                      <Text variant="bodyMd" as="p" tone="subdued">
                        Analyze search impressions, CTR, and search intent rankings for your catalog.
                      </Text>
                      <Text variant="bodyMd" as="p" tone="subdued">
                        Upgrade to the <strong>Growth Plan</strong> to unlock AI search analytics.
                      </Text>
                    </BlockStack>
                    <div style={{ marginTop: 12 }}>
                      <Button url={`/app/pricing?shop=${data.shop}&host=${data.host}`} variant="primary">Upgrade to Growth</Button>
                    </div>
                  </BlockStack>
                </div>
              )}
              {/* ══ TAB 3: Profit Leaks ══════════════════ */}
              {selectedTab === 3 && (
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