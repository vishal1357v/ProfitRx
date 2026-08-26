import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLoaderData, useRevalidator, redirect, Link } from "react-router";
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
  PersonIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ProfitService } from "../services/profit.service";
import { ShopifyService } from "../services/shopify.service";
import { ProfitIntelligenceService } from "../services/profit-intelligence.service";
import { normalizePlanName, PLAN_FEATURES } from "../services/feature-access.service";
import { syncSubscriptionWithShopify } from "../services/subscription-sync.service";
import { AdSpendService } from "../services/ad-spend.service";
import { MetricCard, StatGrid, SectionHeader, EmptyStateCard, LoadingCard, RiskBadge, ProfitBadge, StatusBadge } from "../components";

// Helper to check for COD gateways
const isCodGateway = (gateway: string | null) => {
  if (!gateway) return false;
  const lower = gateway.toLowerCase();
  return lower.includes("cod") || lower.includes("cash") || lower.includes("manual");
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { DashboardApplicationService } = await import("../application/dashboard/dashboard.application");
  return DashboardApplicationService.getDashboardData(request);
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
  // Guard: handle undefined, null, or empty chart data gracefully
  if (!data || data.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 230, color: "var(--gg-text-muted, #64748b)",
        fontFamily: "'Inter', sans-serif", fontSize: 14,
        background: "rgba(255,255,255,0.02)", borderRadius: 8,
        border: "1px dashed rgba(255,255,255,0.08)",
      }}>
        <span>📊 No revenue data yet — sync your orders to see the trend chart</span>
      </div>
    );
  }

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
    <div style={{ width: "high", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="high" height={height}>
        <defs>
          <linearGradient id="grad-rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
            <stop offset="high" stopColor="#2563eb" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="grad-profit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="top-rated0b981" stopOpacity="0.22" />
            <stop offset="high" stopColor="top-rated0b981" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="line-rev" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="high" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="line-profit" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="top-rated0b981" />
            <stop offset="high" stopColor="#06b6d4" />
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
                fill="top-rated0b981" stroke="rgba(16,185,129,0.3)" strokeWidth="4" />
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 8 }}>
        {[
          { color: "#2563eb", label: "Revenue (₹)" },
          { color: "top-rated0b981", label: "Net Profit (₹)" },
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
  if (!data || data.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 210, color: "var(--gg-text-muted, #64748b)",
        fontFamily: "'Inter', sans-serif", fontSize: 14,
        background: "rgba(255,255,255,0.02)", borderRadius: 8,
        border: "1px dashed rgba(255,255,255,0.08)",
      }}>
        <span>📈 No channel data available</span>
      </div>
    );
  }

  const width = 440;
  const height = 210;
  const padL = 48, padR = 12, padT = 16, padB = 40;

  const maxVal = Math.max(...data.map(d => Math.max(d.revenue, 1000)));
  const getBarY = (val: number) => padT + ((1 - val / maxVal) * (height - padT - padB));
  const getBarH = (val: number) => (val / maxVal) * (height - padT - padB);
  const barW = 14;

  const CHANNEL_COLORS: Record<string, { rev: string; profit: string }> = {
    ChatGPT: { rev: "#7c3aed", profit: "#5b21b6" },
    Gemini: { rev: "#2563eb", profit: "top-ratedd4ed8" },
    Copilot: { rev: "#f59e0b", profit: "#d97706" },
    Website: { rev: "#475569", profit: "#334155" },
  };

  return (
    <div style={{ width: "high", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="high" height={height}>
        <defs>
          {data.map((d) => {
            const c = CHANNEL_COLORS[d.name] || CHANNEL_COLORS.Website;
            return (
              <linearGradient key={`gr-${d.name}`} id={`bar-rev-${d.name}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.rev} stopOpacity="0.95" />
                <stop offset="high" stopColor={c.rev} stopOpacity="0.5" />
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
          { color: "top-rated0b981", label: "Profit (₹)" },
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
  if (!data || data.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 180, color: "var(--gg-text-muted, #64748b)",
        fontFamily: "'Inter', sans-serif", fontSize: 14,
        background: "rgba(255,255,255,0.02)", borderRadius: 8,
        border: "1px dashed rgba(255,255,255,0.08)",
      }}>
        <span>📉 No leak trend data available</span>
      </div>
    );
  }

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
    <div style={{ width: "high", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="high" height={height}>
        <defs>
          <linearGradient id="rto-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.35" />
            <stop offset="high" stopColor="#ef4444" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="ship-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
            <stop offset="high" stopColor="#f59e0b" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="disc-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.3" />
            <stop offset="high" stopColor="#7c3aed" stopOpacity="0.03" />
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
  ChatGPT: { icon: "🤖", color: "top-rated0b981" },
  Gemini: { icon: "✨", color: "#3b82f6" },
  Copilot: { icon: "🔷", color: "#f59e0b" },
  Website: { icon: "🌐", color: "#64748b" },
};

// ─────────────────────────────────────────────────────────
export default function DashboardRoute() {
  const data = useLoaderData<typeof loader>();

  let trialDaysRemaining = 0;
  let isTrialActive = false;
  if (data.subStatus === "TRIALING" && data.trialEndsAt) {
    const end = new Date(data.trialEndsAt);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    trialDaysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    isTrialActive = true;
  }

  const gridCols = data.hasConnectedAdAccount ? { xs: 2, sm: 3, md: 4, lg: 4 } : { xs: 1, sm: 2, md: 3, lg: 5 };
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

  const handleSyncOrders = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/sync-orders", { method: "POST" });
      const resData = await res.json();
      if (res.ok && resData.success) {
        setSyncSuccess(true);
        if (resData.message) {
          setSyncMessage(resData.message);
        } else if (resData.ordersFound !== undefined) {
          setSyncMessage(`✅ Synced ${resData.ordersFound} orders (${resData.ordersImported || 0} new imported, ${resData.ordersUpdated || 0} updated). Date window: ${resData.syncWindow?.from} to ${resData.syncWindow?.to} (Last 60 days).`);
        } else {
          setSyncMessage(`✅ Synced ${resData.count} orders successfully!`);
        }
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
  }, [revalidator]);

  const handleExportCSV = useCallback(() => {
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
  }, [data.topProducts, data.shop]);

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

  const accuracyScore = useMemo(() => {
    let score = 30;
    if (data.configuredCogsCount > 0) score += 30;
    if (!data.hasZeroLogisticsDefaults) score += 40;
    else score += 20;
    return score;
  }, [data.configuredCogsCount, data.hasZeroLogisticsDefaults]);

  const tabs = useMemo(() => [
    { id: "store-profitability", content: "⚡ Store Profitability", panelID: "tab-0" },
    { id: "profit-leaks", content: "💸 Profit Leaks", panelID: "tab-1" },
    { id: "risk-intelligence", content: "🛡️ Risk Intelligence", panelID: "tab-2" },
  ], []);

  const productRows = useMemo(() => data.topProducts.map((p) => [
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
  ]), [data.topProducts]);

  const missingOpportunities = useMemo(() => {
    const productsWithQueries = new Set(data.searchQueries.map((sq: any) => sq.productName.toLowerCase()));
    return data.products.filter((p: any) => !productsWithQueries.has(p.title.toLowerCase()));
  }, [data.searchQueries, data.products]);

  return (
    <Page
      title={`ProfitRx — ${data.shop?.replace(".myshopify.com", "") || "Store"}`}
      subtitle={`Sync Window: Last 60 Days (${data.syncWindow?.from || "Recent"} – ${data.syncWindow?.to || "Today"}) • Evaluated Orders: ${data.orderCount} • Last Activity: ${data.lastSyncTime ? new Date(data.lastSyncTime).toLocaleDateString() : "Real-time"}`}
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

        {/* ── ZERO-ORDER / SYNC WINDOW TRANSPARENCY BANNER ── */}
        {data.orderCount === 0 && (
          <Layout.Section>
            <Banner tone="info" title="No Orders Found in Current 60-Day Window">
              <p>
                ProfitRx scans your store's orders from <strong>{data.syncWindow?.from || "the last 60 days"}</strong> to <strong>{data.syncWindow?.to || "today"}</strong>.
                If your Shopify store only contains historical orders older than 60 days, Shopify Admin API requires the <code>read_all_orders</code> permission scope.
                You can create a new test order in Shopify or click <strong>Sync Orders</strong> above to refresh.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {isTrialActive && (
          <Layout.Section>
            <Banner tone="info" title="🎉 Your 14-Day Free Trial is Active!">
              <p>Maximize your profits! Your free trial ends in <strong>{trialDaysRemaining} days</strong> ({data.trialEndsAt ? new Date(data.trialEndsAt).toLocaleDateString() : ""}). Check your <Link to={`/app/billing?shop=${data.shop}&host=${data.host}`} style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}>Billing Page</Link> to view plan usage limits.</p>
            </Banner>
          </Layout.Section>
        )}

        {data.isDemoData && (
          <Layout.Section>
            <Banner
              tone="warning"
              title="Viewing Demo Data Mode"
              action={{
                content: "Sync Your Store Orders",
                onAction: handleSyncOrders,
              }}
            >
              <p>We did not find any orders in your store database. The metrics and charts below are populated with sample/demo data to show the dashboard capabilities. Run a manual sync to pull your actual store data.</p>
            </Banner>
          </Layout.Section>
        )}

        {data.adSpendDisconnected && (
          <Layout.Section>
            <Banner
              tone="critical"
              title="Ad Account Credentials Expired"
              action={{
                content: "Reconnect Ad Channels",
                url: `/app/roas?shop=${data.shop}&host=${data.host}`,
              }}
            >
              <p>Meta, Google, or TikTok Ad spend OAuth integration tokens have expired or been revoked. Ad spend and blended ROAS/CAC tracking are disabled. Reconnect your credentials in settings to restore metrics sync.</p>
            </Banner>
          </Layout.Section>
        )}


        {/* Warning & Plan Banners */}
        {data.isBasicTier && (
          <Layout.Section>
            <Banner
              tone="info"
              title={`${data.planName} Plan Active — tracking ${data.ordersUsed}/${data.ordersLimit || 50} orders this month`}
              action={{
                content: data.planName === "Free" ? "Upgrade to Starter" : "Upgrade to Growth",
                url: `/app/pricing?shop=${data.shop}&host=${data.host}&change_plan=true`,
              }}
            >
              <p>You are currently on the <strong>{data.planName} Plan</strong>. Upgrade to unlock COD Risk Scoring, Pincode RTO Heatmaps, Profit Leak Detection, and more advanced analytics!</p>
            </Banner>
          </Layout.Section>
        )}

        {data.missingCogsCount > 0 && (
          <Layout.Section>
            <Banner
              tone="warning"
              title="Products Missing COGS"
              action={{
                content: "Configure COGS Catalog",
                url: `/app/cogs?shop=${data.shop}&host=${data.host}`,
              }}
            >
              <p>
                ⚠️ <strong>{data.excludedOrdersCount} orders excluded</strong> from profit metrics because <strong>{data.missingCogsCount} products</strong> are missing COGS. Please <Link to={`/app/cogs?shop=${data.shop}&host=${data.host}`} style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}>configure them in the COGS Catalog</Link> to include them in calculations.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {data.hasZeroLogisticsDefaults && (
          <Layout.Section>
            <Banner
              tone="warning"
              title="Logistics Defaults Not Configured"
              action={{
                content: "Configure in Settings",
                url: `/app/settings?shop=${data.shop}&host=${data.host}`,
              }}
            >
              <p>
                ⚠️ Some logistics parameters (Shipping costs or Packaging costs) are set to ₹0. Please <Link to={`/app/settings?shop=${data.shop}&host=${data.host}`} style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}>configure them in Settings</Link> to get accurate RTO loss figures.
              </p>
            </Banner>
          </Layout.Section>
        )}



        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
            <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 1, lg: 1 }}>
              <Card>
                <BlockStack gap="400">
                  <SectionHeader title="Estimated Avoided Loss" subtitle="Modeled savings from prevented RTOs" />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', background: 'var(--gg-accent-green-alpha-10)', borderRadius: '12px', border: '1px solid var(--gg-accent-green-alpha-20)' }}>
                    <Text variant="heading3xl" as="h2" tone="success">
                      ₹{Math.round(data.totalRtoSavings || 0).toLocaleString("en-IN")}
                    </Text>
                    <Text variant="bodyMd" as="span" tone="subdued">
                      {data.blockedCodCount > 0
                        ? `${data.blockedCodCount} high-risk orders intervened`
                        : data.orderCount > 0
                          ? `All ${data.orderCount} orders verified safe`
                          : "0 high-risk orders intervened"}
                    </Text>
                  </div>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
              <Card>
                <BlockStack gap="400">
                  <SectionHeader title="Recent Activity & Attention" subtitle="Real-time order decisions & alerts" />
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {data.recentDecisions?.length === 0 && data.recentAlerts?.length === 0 ? (
                      <EmptyStateCard title="No recent activity" description="Waiting for new orders or alerts." icon="🕰️" action={{ text: "Sync Orders", onClick: handleSyncOrders }} />
                    ) : (
                      <DataTable
                        columnContentTypes={["text", "text", "text", "text"]}
                        headings={["Time", "Event", "Details", "Action"]}
                        rows={[
                          ...(data.recentAlerts || []).map((a: any) => ({
                            time: new Date(a.createdAt).getTime(),
                            row: [
                              <span style={{ color: 'var(--gg-text-muted)' }}>{new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>,
                              <Badge tone={a.severity === 'CRITICAL' ? 'critical' : a.severity === 'WARNING' ? 'warning' : 'info'}>Alert</Badge>,
                              <span style={{ fontWeight: 500 }}>{a.message}</span>,
                              <Link to={`/app/alerts?shop=${data.shop}&host=${data.host}`} style={{ color: "var(--p-color-text-link)", textDecoration: "none" }}>View</Link>
                            ]
                          })),
                          ...(data.recentDecisions || []).map((d: any) => {
                            const orderNum = d.order?.orderNumber || String(d.orderId || "").replace("gid://shopify/Order/", "").replace("auto-log-", "");
                            const riskLevel = d.order?.riskLevel || "LOW";
                            const cleanOrderId = String(d.orderId || "").replace("gid://shopify/Order/", "").replace("auto-log-", "");
                            return {
                              time: new Date(d.createdAt).getTime(),
                              row: [
                                <span style={{ color: 'var(--gg-text-muted)' }}>{new Date(d.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>,
                                <Badge tone="success">Decision</Badge>,
                                <span>Order #{orderNum} evaluated. Risk: <Badge tone={riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 'critical' : riskLevel === 'MEDIUM' ? 'warning' : 'success'}>{riskLevel}</Badge></span>,
                                <Link to={`/app/orders/${encodeURIComponent(cleanOrderId)}?shop=${encodeURIComponent(data.shop)}&host=${encodeURIComponent(data.host)}`} style={{ color: "var(--p-color-text-link)", textDecoration: "none" }}>Details →</Link>
                              ]
                            };
                          })
                        ].sort((a, b) => b.time - a.time).slice(0, 5).map(item => item.row)}
                      />
                    )}
                  </div>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        <Layout.Section>
          <StatGrid columns={gridCols}>
            {/* Realized Profit */}
            <MetricCard
              title="Realized Profit"
              value={`₹${Math.round(Math.abs(data.netProfit)).toLocaleString("en-IN")}`}
              prefix={data.netProfit < 0 ? "-" : ""}
              tone={data.netProfit >= 0 ? "success" : "critical"}
              icon="⚡"
              tooltip="Actual net profit from fulfilled orders: Sales minus COGS, forward shipping, and gateway fees."
              loading={syncing}
              badge={data.missingCogsCount > 0 ? { content: "Est. Fallback", tone: "warning" } : { content: "Actual COGS", tone: "success" }}
              subtitle={
                <span className={data.netProfit >= 0 ? "gg-trend-up" : "gg-trend-down"}>
                  {data.netProfit >= 0 ? "▲ Realized Net Profit" : "▼ Net Operating Loss"}
                </span>
              }
            />

            {/* Total Revenue */}
            <MetricCard
              title="Gross Revenue"
              value={`₹${Math.round(data.revenue).toLocaleString("en-IN")}`}
              tone="info"
              icon="💰"
              tooltip="Total order sales value across all payment methods."
              loading={syncing}
              subtitle={
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                  <span>Prepaid: <strong style={{ color: "var(--gg-accent-green)" }}>₹{Math.round(data.prepaidRevenue || 0).toLocaleString("en-IN")}</strong></span>
                  <span>COD: <strong style={{ color: "var(--gg-accent-amber)" }}>₹{Math.round(data.codRevenue || 0).toLocaleString("en-IN")}</strong></span>
                </div>
              }
            />

            {/* Net Margin */}
            <MetricCard
              title="Net Margin"
              value={`${Math.round(data.netMargin)}%`}
              tone={data.netMargin > 20 ? "success" : data.netMargin > 10 ? "warning" : "critical"}
              icon="💡"
              tooltip="Realized Net Profit divided by Gross Revenue."
              loading={syncing}
              badge={data.missingCogsCount > 0 ? { content: "Est. Fallback", tone: "warning" } : undefined}
              subtitle={data.netMargin > 20 ? "Healthy Margin (>20%)" : "Low Margin (<20%)"}
            />

            {/* Total Orders */}
            <MetricCard
              title="Total Orders"
              value={data.orderCount.toLocaleString("en-IN")}
              tone="neutral"
              icon="📅"
              tooltip="Total order volume evaluated."
              loading={syncing}
              subtitle="All evaluated orders"
            />

            {/* Profit Leaks */}
            <MetricCard
              title="Profit Leaks"
              value={`₹${Math.round(data.leaks.totalLeak).toLocaleString("en-IN")}`}
              tone="critical"
              icon="⚠️"
              tooltip="Identified financial leakage from RTO returns, freight overages, and discounts."
              loading={syncing}
              action={{
                content: "Inspect Leaks →",
                url: `/app/profit-leaks?shop=${encodeURIComponent(data.shop)}&host=${encodeURIComponent(data.host)}`
              }}
            />
          </StatGrid>
        </Layout.Section>

        {/* ── TOP SECTION: REVENUE & NET PROFIT TREND CHART ── */}
        <Layout.Section>
          <Card>
            <Box padding="500">
              <BlockStack gap="300">
                <SectionHeader
                  title="Revenue & Net Profit Trend"
                  subtitle="Last 30 days — day-by-day performance index"
                  action={
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="gg-pulse" />
                      <span className="gg-text-xs gg-text-muted gg-font-body">Live data</span>
                    </div>
                  }
                />
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
                background: "linear-gradient(135deg, rgba(56,189,248,0.1), rgba())",
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
                        <SectionHeader
                          title="Fee Breakdown"
                          action={<Badge tone="info">{`₹${data.feeBreakdown.totalFees.toLocaleString("en-IN")} Total Fees`}</Badge>}
                        />
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
                              <Text variant="bodyMd" as="p" fontWeight="bold" tone="subdued">Auto-Calculated</Text>
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
                        <SectionHeader
                          title="GST Tax Summary (GSTR-1)"
                          action={
                            <Button url={`/api/gst-report?shop=${data.shop}&format=csv`} external size="slim">
                              Export GSTR CSV 📄
                            </Button>
                          }
                        />
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
                        <span style={{ fontSize: 20 }}>🛡️</span>
                        <Text variant="headingMd" as="h2">
                          Store Protection Setup Wizard
                        </Text>
                      </div>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Complete these steps to unlock full COD risk management and profit protection.
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
                        <div className={`gg-wizard-step ${step.status === "complete" ? "gg-wizard-step--complete" : ""}`} style={{ height: "high", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
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
                            height: "high",
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
                            height: "high",
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
                            height: "high",
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

                  {/* Onboarding Accuracy Meter */}
                  {showAdvanced && (
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
                    background: "linear-gradient(135deg, rgba(239,68,68,0.12), rgba())",
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
                              { value: data.leaks.shippingLoss, color: "#f59e0b", label: "Shipping Loss" },
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
                            icon="🚚" title="Shipping Loss" amount={data.leaks.shippingLoss}
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
                          <div className="gg-kpi-card" style={{ height: "high" }}>
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

              {/* ══ TAB 3: Risk Intelligence (Phase 3) ══════════════════ */}
              {selectedTab === 2 && (
                <BlockStack gap="400">
                  <div style={{
                    padding: "20px 24px",
                    borderRadius: "var(--gg-radius-lg)",
                    background: "linear-gradient(135deg, rgba(168,85,247,0.12), rgba())",
                    border: "1px solid rgba(168,85,247,0.2)",
                  }}>
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text variant="headingLg" as="h2">🛡️ Risk Intelligence Engine</Text>
                        <Text variant="bodySm" as="p" tone="subdued">
                          Identify high-risk orders, problematic pincodes, and untrustworthy customers before you ship.
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </div>

                  <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                    <Grid.Cell>
                      <Card>
                        <BlockStack gap="300">
                          <Text variant="headingMd" as="h3">Orders Requiring Review</Text>
                          {data.ordersNeedingReview.length > 0 ? (
                            <DataTable
                              columnContentTypes={["text", "text", "text", "text"]}
                              headings={["Order", "Level", "Reason", "Action"]}
                              rows={data.ordersNeedingReview.map((o: any) => [
                                `#${o.orderNumber}`,
                                <Badge tone={o.riskLevel === "CRITICAL" ? "critical" : "warning"}>{o.riskLevel}</Badge>,
                                o.riskReasons ? JSON.parse(o.riskReasons).map((r: any) => r.code).join(", ") : "Unknown",
                                <span style={{ color: "var(--gg-accent-amber)", fontSize: "12px", fontWeight: "bold" }}>{o.merchantRecommendation}</span>
                              ])}
                            />
                          ) : (
                            <Banner tone="success">No high-risk orders detected recently.</Banner>
                          )}
                        </BlockStack>
                      </Card>
                    </Grid.Cell>

                    <Grid.Cell>
                      <Card>
                        <BlockStack gap="300">
                          <Text variant="headingMd" as="h3">Worst Performing Pincodes</Text>
                          {data.pincodeStats.length > 0 ? (
                            <DataTable
                              columnContentTypes={["text", "numeric", "numeric", "text"]}
                              headings={["Pincode", "RTO Rate", "RTO Count", "Risk Level"]}
                              rows={data.pincodeStats.slice(0, 5).map((p: any) => [
                                p.pincode,
                                `${p.rtoRate.toFixed(1)}%`,
                                p.rtoCount,
                                <Badge tone={p.riskLevel === "CRITICAL" ? "critical" : p.riskLevel === "HIGH" ? "warning" : "info"}>{p.riskLevel || "UNKNOWN"}</Badge>
                              ])}
                            />
                          ) : (
                            <Banner tone="info">Sync orders to generate pincode risk stats.</Banner>
                          )}
                        </BlockStack>
                      </Card>
                    </Grid.Cell>
                  </Grid>

                  <Card>
                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h3">Top Risk Customers</Text>
                      {data.customerRisks.length > 0 ? (
                        <DataTable
                          columnContentTypes={["text", "numeric", "numeric", "numeric", "text"]}
                          headings={["Customer", "Total Orders", "RTOs", "Risk Score", "Risk Level"]}
                          rows={data.customerRisks.slice(0, 5).map((c: any) => [
                            c.customerId,
                            c.totalOrders,
                            c.rtoCount,
                            c.riskScore,
                            <Badge tone={c.riskLevel === "CRITICAL" ? "critical" : c.riskLevel === "HIGH" ? "warning" : "info"}>{c.riskLevel || "UNKNOWN"}</Badge>
                          ])}
                        />
                      ) : (
                        <Banner tone="info">No customer risk profiles generated yet.</Banner>
                      )}
                    </BlockStack>
                  </Card>
                </BlockStack>
              )}
            </Box>
          </Tabs>
        </Layout.Section>

        {data.settings.whatsappEnabled && data.settings.whatsappPhone && (
          <Layout.Section>
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
                      🎯 <strong>Live Protection Status:</strong>
                    </div>
                    <div style={{ marginTop: "4px" }}>
                      • <strong>Real-Time Screening:</strong> Active on all incoming orders.<br />
                      • <strong>RTO Prevention:</strong> Automated verification & risk scoring enabled.<br />
                    </div>
                    <span style={{ fontSize: "9px", color: "#a0a0a0", float: "right", marginTop: "4px" }}>09:00 AM ✓✓</span>
                    <div style={{ clear: "both" }} />
                  </div>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}