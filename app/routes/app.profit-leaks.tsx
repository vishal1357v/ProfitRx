import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, redirect } from "react-router";
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
  InlineStack,
  Grid,
  Badge,
  Divider,
  Banner,
  Button,
  DataTable,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ProfitLeaksApplicationService } from "../application/analytics/profit-leaks.application";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  let host = url.searchParams.get("host") || "";
  if (!host && session?.shop) {
    const storeHandle = session.shop.replace(".myshopify.com", "");
    host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
  }

  // Enforce billing if not bypassed
  if (process.env.BYPASS_BILLING !== "true") {
    try {
      await billing.require({
        plans: ["GROWTH", "PRO"],
        isTest: process.env.NODE_ENV !== "production",
        onFailure: async () => {
          throw redirect(`/app/pricing?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`);
        },
      });
    } catch (error) {
      if (error instanceof Response) {
        throw error;
      }
      console.warn("[ProfitLeaks Billing Guard Warning]:", error);
    }
  }

  const data = await ProfitLeaksApplicationService.getProfitLeaksData(shop);
  return { ...data, shop, host };
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
            cx={cx}
            cy={cy}
            r={r}
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
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="Inter, sans-serif">
          TOTAL LEAK
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill="#e2e8f0" fontFamily="Outfit, sans-serif" fontWeight="700">
          ₹{(segments.reduce((s, seg) => s + seg.value, 0) / 1000).toFixed(1)}k
        </text>
      </svg>

      <BlockStack gap="200">
        {arcs.map((arc, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: arc.color, flexShrink: 0 }} />
            <BlockStack gap="050">
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
  const padL = 44,
    padR = 16,
    padT = 12,
    padB = 30;

  const maxVal = Math.max(...data.flatMap((d) => [d.rto + d.shipping + d.discount]), 100);
  const getX = (i: number) => padL + (i * (width - padL - padR)) / Math.max(1, data.length - 1);
  const getY = (v: number) => padT + ((maxVal - v) / maxVal) * (height - padT - padB);

  const toStackedLine = (key: "rto" | "shipping" | "discount", prevKey?: "rto" | "shipping") =>
    data
      .map((d, i) => {
        const base = prevKey ? d[prevKey] : 0;
        const val = d[key] + base;
        return `${getX(i)},${getY(val)}`;
      })
      .join(" ");

  const stackedArea = (key: "rto" | "shipping" | "discount", prevKey?: "rto" | "shipping") => {
    const top = data.map((d, i) => {
      const base = prevKey ? d[prevKey] : 0;
      return `${getX(i)},${getY(d[key] + base)}`;
    });
    const bottom = data.map((d, i) => {
      const base = prevKey ? d[prevKey] : 0;
      return `${getX(data.length - 1 - i)},${getY(base)}`;
    });
    return [...top, ...bottom].join(" ");
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polygon points={stackedArea("rto")} fill="#ef4444" fillOpacity="0.15" />
        <polygon points={stackedArea("shipping", "rto")} fill="#f59e0b" fillOpacity="0.15" />
        <polygon points={stackedArea("discount", "shipping")} fill="#7c3aed" fillOpacity="0.15" />

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
function LeakInsight({
  icon,
  title,
  amount,
  trend,
  detail,
  tone,
  actionUrl,
  actionText,
}: {
  icon: string;
  title: string;
  amount: number;
  trend: number;
  detail: string;
  tone: "critical" | "warning" | "info";
  actionUrl?: string;
  actionText?: string;
}) {
  const toneColors = { critical: "var(--gg-accent-red)", warning: "var(--gg-accent-amber)", info: "var(--gg-accent-blue)" };
  const color = toneColors[tone];
  return (
    <div
      className={`gg-rec-card gg-rec-card--${tone === "info" ? "success" : tone}`}
      style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}
    >
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="start">
          <InlineStack gap="150" blockAlign="center">
            <span style={{ fontSize: 20 }}>{icon}</span>
            <Text variant="headingSm" as="h3">
              {title}
            </Text>
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
        <Text variant="bodySm" as="p" tone="subdued">
          {detail}
        </Text>
      </BlockStack>

      {actionUrl && (
        <div style={{ marginTop: "16px" }}>
          <Button
            variant={tone === "critical" ? "primary" : "secondary"}
            tone={tone === "critical" ? "critical" : undefined}
            size="slim"
            url={actionUrl}
          >
            {actionText || "Fix This Leak →"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ProfitLeaksRoute() {
  const { leaks, trend, cogsTransparency, affectedOrders, hasData, shop, host } = useLoaderData<typeof loader>();

  const donutSegments = [
    { value: leaks.rtoLoss, color: "#ef4444", label: "RTO & COD Failure" },
    { value: leaks.shippingLoss, color: "#f59e0b", label: "Shipping Loss" },
    { value: leaks.discountLoss, color: "#7c3aed", label: "Discount Loss" },
  ].filter((s) => s.value > 0);

  const affectedRows = affectedOrders.map((o) => {
    const cleanId = String(o.id).replace("gid://shopify/Order/", "");
    const orderUrl = `/app/orders/${encodeURIComponent(cleanId)}?shop=${encodeURIComponent(shop || "")}&host=${encodeURIComponent(host || "")}`;
    return [
      <a
        key={`affected-${o.id}`}
        href={orderUrl}
        style={{ fontWeight: "bold", color: "var(--p-color-text-link)", textDecoration: "none" }}
      >
        #{o.orderNumber}
      </a>,
      `₹${o.totalPrice.toLocaleString("en-IN")}`,
      <Badge
        key={`badge-${o.id}`}
        tone={o.leakType === "rto" ? "critical" : o.leakType === "shipping" ? "warning" : "attention"}
      >
        {o.leakType === "rto" ? "RTO Loss" : o.leakType === "shipping" ? "Shipping Overage" : "Discount Leak"}
      </Badge>,
      <span key={`loss-${o.id}`} style={{ color: "var(--gg-accent-red)", fontWeight: 700 }}>
        ₹{o.leakAmount.toLocaleString("en-IN")}
      </span>,
      o.reason,
      o.createdAt,
    ];
  });

  return (
    <Page
      title="Profit Leaks Diagnostic"
      subtitle="Pinpoint financial margin leakage from RTO returns, freight overages, and discount erosion."
      secondaryActions={[
        {
          content: "RTO Analytics",
          url: "/app/rto",
        },
        {
          content: "COGS Catalog",
          url: "/app/cogs",
        },
      ]}
    >
      <Layout>
        {/* ── COGS Transparency Banner ───────────────────── */}
        {cogsTransparency.isEstimated && (
          <Layout.Section>
            <Banner
              tone="warning"
              title="COGS Fallback Active (Estimated Profit Margins)"
              action={{ content: "Configure COGS Catalog", url: "/app/cogs" }}
            >
              <p>
                {cogsTransparency.estimationReason ||
                  "Some margins are estimated using default store percentage. Add exact product costs in the COGS Catalog for 100% precision."}
              </p>
            </Banner>
          </Layout.Section>
        )}

        {/* ── Headline Banner ───────────────────────────── */}
        <Layout.Section>
          <div
            style={{
              padding: "20px 24px",
              borderRadius: "var(--gg-radius-lg)",
              background: "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(124,58,237,0.06))",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text variant="headingLg" as="h2">
                  🚨 Total Profit Leak This Period
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  All-time money lost to RTO failures, shipping overage, and discount abuse
                </Text>
              </BlockStack>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontWeight: 900,
                    fontSize: 40,
                    color: "var(--gg-accent-red)",
                    letterSpacing: "-0.04em",
                    lineHeight: 1,
                  }}
                >
                  ₹{leaks.totalLeak.toLocaleString("en-IN")}
                </div>
                <div style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif", marginTop: 4 }}>
                  total recoverable profit leak
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
                  <Text variant="headingMd" as="h2">
                    Leak Breakdown
                  </Text>
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
                    icon="📦"
                    title="RTO & COD Failures"
                    amount={leaks.rtoLoss}
                    trend={leaks.rtoTrend}
                    detail="Orders returned before delivery or failed COD collection. Direct shipment waste."
                    tone="critical"
                    actionUrl="/app/rto"
                    actionText="View in RTO Analytics →"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <LeakInsight
                    icon="🚚"
                    title="Shipping Loss"
                    amount={leaks.shippingLoss}
                    trend={leaks.shippingTrend}
                    detail="Shipping costs above ₹60/order baseline. Negotiate bulk rates with logistics partners."
                    tone="warning"
                    actionUrl="/app/settings"
                    actionText="Logistics Rules →"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <LeakInsight
                    icon="🏷️"
                    title="Discount Losses"
                    amount={leaks.discountLoss}
                    trend={leaks.discountTrend}
                    detail="Revenue sacrificed through discount codes and automatic checkout discounts."
                    tone="warning"
                    actionUrl="/app/cogs"
                    actionText="COGS & Margin Rules →"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <div className="gg-kpi-card" style={{ height: "100%" }}>
                    <BlockStack gap="200">
                      <InlineStack gap="150" blockAlign="center">
                        <span style={{ fontSize: 18 }}>💡</span>
                        <Text variant="headingSm" as="h3">
                          Recovery Actions
                        </Text>
                      </InlineStack>
                      <Divider />
                      <BlockStack gap="150">
                        {[
                          "Block high-RTO pincodes for COD",
                          "Add prepaid discount (₹50 off)",
                          "Verify COD orders >₹2000 by OTP",
                          "Set max discount cap of 10%",
                          "Negotiate ₹45/order bulk shipping",
                        ].map((action, idx) => (
                          <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <span style={{ color: "var(--gg-accent-green)", fontWeight: 700, flexShrink: 0 }}>✓</span>
                            <span style={{ fontSize: 12, color: "var(--gg-text-secondary)", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>
                              {action}
                            </span>
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
                <Text variant="headingMd" as="h2">
                  📉 30-Day Profit Leak Trend
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Stacked view of daily losses — identify patterns and spikes
                </Text>
              </BlockStack>
              <LeakTrendChart data={trend} />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Affected Orders (Order Intelligence Links) ──── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="050">
                  <Text variant="headingMd" as="h2">
                    🎯 Top Orders Impacted by Profit Leaks
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Click any order to inspect AI risk scores, execution history, and decision reasoning in Order Intelligence
                  </Text>
                </BlockStack>
              </InlineStack>

              {affectedRows.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "numeric", "text", "numeric", "text", "text"]}
                  headings={["Order (Click to View Detail)", "Order Total", "Leak Category", "Leak Amount", "Impact Reason", "Date"]}
                  rows={affectedRows}
                />
              ) : (
                <Text variant="bodyMd" as="p" tone="subdued">
                  No leak-impacted orders detected for this store.
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
