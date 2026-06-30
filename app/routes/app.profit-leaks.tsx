import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Grid,
  Badge, Divider, Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ProfitIntelligenceService } from "../services/profit-intelligence.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [leaks, trend] = await Promise.all([
    ProfitIntelligenceService.getProfitLeaks(shop),
    ProfitIntelligenceService.getLeakTrend(shop),
  ]);

  return { leaks, trend };
};

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
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--gg-border)" strokeWidth="14" />
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
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="var(--gg-border)" strokeDasharray="3 5" />
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

// ─────────────────────────────────────────────────────────
export default function ProfitLeaksRoute() {
  const { leaks, trend } = useLoaderData<typeof loader>();

  const donutSegments = [
    { value: leaks.rtoLoss, color: "#ef4444", label: "RTO & COD Failure" },
    { value: leaks.shippingOverage, color: "#f59e0b", label: "Shipping Overage" },
    { value: leaks.discountLoss, color: "#7c3aed", label: "Discount Loss" },
  ].filter(s => s.value > 0);

  const hasData = leaks.totalLeak > 0;

  return (
    <Page title="Profit Leak Detector">
      <Layout>
        {/* ── Headline Banner ───────────────────────────── */}
        <Layout.Section>
          <div style={{
            padding: "20px 24px",
            borderRadius: "var(--gg-radius-lg)",
            background: "linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(124,58,237,0.08) 100%)",
            border: "1px solid rgba(239,68,68,0.2)",
          }}>
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text variant="headingLg" as="h2">🚨 Total Profit Leak This Period</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  All-time money lost to RTO failures, shipping overage, and discount abuse
                </Text>
              </BlockStack>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontSize: 40, color: "var(--gg-accent-red)", letterSpacing: "-0.04em", lineHeight: 1 }}>
                  ₹{leaks.totalLeak.toLocaleString("en-IN")}
                </div>
                <div style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif", marginTop: 4 }}>
                  total recoverable leak
                </div>
              </div>
            </InlineStack>
          </div>
        </Layout.Section>

        {/* ── Donut + Insights ──────────────────────────── */}
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
            <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 1, lg: 1 }}>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Leak Breakdown</Text>
                  {hasData ? (
                    <DonutChart segments={donutSegments} />
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
                    icon="📦" title="RTO & COD Failures" amount={leaks.rtoLoss}
                    trend={leaks.rtoTrend}
                    detail="Orders returned before delivery or failed COD collection. Each RTO costs shipping + product handling."
                    tone="critical"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <LeakInsight
                    icon="🚚" title="Shipping Overage" amount={leaks.shippingOverage}
                    trend={leaks.shippingTrend}
                    detail="Shipping costs above ₹60/order baseline. Negotiate bulk rates with logistics partners."
                    tone="warning"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <LeakInsight
                    icon="🏷️" title="Discount Losses" amount={leaks.discountLoss}
                    trend={leaks.discountTrend}
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
        </Layout.Section>

        {/* ── 30-Day Leak Trend ─────────────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">📉 30-Day Profit Leak Trend</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Stacked view of daily losses — identify patterns and spikes
                </Text>
              </BlockStack>
              <LeakTrendChart data={trend} />
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}
