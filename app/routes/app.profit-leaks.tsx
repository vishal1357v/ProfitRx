import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, redirect, Link, useRouteError, isRouteErrorResponse } from "react-router";
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
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ProfitLeaksApplicationService } from "../application/analytics/profit-leaks.application";
import { BillingApplicationService } from "../application/billing/billing.application";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const isPreview = url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true";

  if (isPreview) {
    const shop = "glam-aura-india.myshopify.com";
    const host = Buffer.from(`admin.shopify.com/store/glam-aura-india`).toString("base64");
    return {
      leaks: {
        rtoLoss: 8200,
        shippingLoss: 2400,
        discountLoss: 1800,
        codFailureLoss: 1200,
        totalLeak: 13600,
        rtoTrend: 4.2,
        shippingTrend: -1.5,
        discountTrend: 2.1,
      },
      trend: [
        { date: "Day 1", rto: 1200, shipping: 300, discount: 200 },
        { date: "Day 2", rto: 1400, shipping: 400, discount: 250 },
        { date: "Day 3", rto: 1100, shipping: 350, discount: 220 },
        { date: "Day 4", rto: 1600, shipping: 450, discount: 300 },
        { date: "Day 5", rto: 1300, shipping: 400, discount: 280 },
        { date: "Day 6", rto: 1800, shipping: 500, discount: 350 },
      ],
      cogsTransparency: {
        isEstimated: false,
        configuredProductCount: 14,
        defaultCogsPct: 40,
      },
      affectedOrders: [
        {
          id: "gid://shopify/Order/849201",
          orderNumber: 1482,
          totalPrice: 6499,
          leakAmount: 1420,
          leakType: "rto" as const,
          reason: "High-value COD order returned to origin in Siwan (841301)",
          createdAt: "Today",
        },
        {
          id: "gid://shopify/Order/849195",
          orderNumber: 1481,
          totalPrice: 2250,
          leakAmount: 450,
          leakType: "shipping" as const,
          reason: "Courier freight overage (charged ₹180 vs flat ₹60 shipping)",
          createdAt: "Yesterday",
        },
        {
          id: "gid://shopify/Order/849180",
          orderNumber: 1475,
          totalPrice: 1999,
          leakAmount: 350,
          leakType: "discount" as const,
          reason: "Stacked coupon discount exceeded product contribution margin",
          createdAt: "2 days ago",
        },
      ],
      hasData: true,
      shop,
      host,
    };
  }

  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;
  let host = url.searchParams.get("host") || "";
  if (!host && session?.shop) {
    const storeHandle = session.shop.replace(".myshopify.com", "");
    host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
  }

  // Enforce billing if not bypassed
  if (process.env.BYPASS_BILLING !== "true") {
    await BillingApplicationService.requirePlan(shop, ["GROWTH", "PRO"], host);
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
  title,
  amount,
  trend,
  detail,
  tone,
  actionUrl,
  actionText,
}: {
  title: string;
  amount: number;
  trend: number;
  detail: string;
  tone: "critical" | "warning" | "info";
  actionUrl?: string;
  actionText?: string;
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingSm" as="h3">
            {title}
          </Text>
          {trend !== 0 && (
            <Badge tone={trend > 0 ? "critical" : "success"}>
              {trend > 0 ? `+${trend}%` : `${trend}%`}
            </Badge>
          )}
        </InlineStack>
        <Divider />
        <Text variant="headingLg" as="p" tone={tone === "critical" ? "critical" : undefined}>
          ₹{amount.toLocaleString("en-IN")}
        </Text>
        <Text variant="bodySm" as="p" tone="subdued">
          {detail}
        </Text>

        {actionUrl && (
          <Box paddingBlockStart="100">
            <Button
              variant={tone === "critical" ? "primary" : "secondary"}
              tone={tone === "critical" ? "critical" : undefined}
              size="slim"
              url={actionUrl}
            >
              {actionText || "Review Issue"}
            </Button>
          </Box>
        )}
      </BlockStack>
    </Card>
  );
}

export default function ProfitLeaksRoute() {
  const { leaks, trend, cogsTransparency, affectedOrders, hasData, shop, host } = useLoaderData<typeof loader>();

  const donutSegments = [
    { value: leaks.rtoLoss, color: "#ef4444", label: "Returned Parcels (RTO)" },
    { value: leaks.shippingLoss, color: "#f59e0b", label: "Excess Shipping Fees" },
    { value: leaks.discountLoss, color: "#7c3aed", label: "Heavy Discounts" },
  ].filter((s) => s.value > 0);

  const affectedRows = affectedOrders.map((o) => {
    const cleanId = String(o.id).replace("gid://shopify/Order/", "");
    const orderUrl = `/app/orders/${encodeURIComponent(cleanId)}?shop=${encodeURIComponent(shop || "")}&host=${encodeURIComponent(host || "")}`;
    return [
      <Link
        key={`affected-${o.id}`}
        to={orderUrl}
        style={{ fontWeight: "bold", color: "var(--p-color-text-link)", textDecoration: "none" }}
      >
        #{o.orderNumber}
      </Link>,
      `₹${o.totalPrice.toLocaleString("en-IN")}`,
      <Badge
        key={`badge-${o.id}`}
        tone={o.leakType === "rto" ? "critical" : o.leakType === "shipping" ? "warning" : "attention"}
      >
        {o.leakType === "rto" ? "Returned Parcel" : o.leakType === "shipping" ? "Courier Overage" : "Heavy Discount"}
      </Badge>,
      <span key={`loss-${o.id}`} style={{ color: "var(--p-color-text-critical)", fontWeight: 700 }}>
        ₹{o.leakAmount.toLocaleString("en-IN")}
      </span>,
      o.reason,
      o.createdAt,
    ];
  });

  return (
    <Page
      title="Where You Are Losing Money"
      subtitle="See where profit is leaking out of your business: returned parcels, excess courier freight, and heavy discounts."
      secondaryActions={[
        {
          content: "Courier Return Reports",
          url: "/app/rto",
        },
        {
          content: "Product Costs",
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
              title="Estimated Product Costs Active"
              action={{ content: "Enter Product Costs", url: "/app/cogs" }}
            >
              <p>
                {cogsTransparency.estimationReason ||
                  "Some margins are calculated using estimated costs. Enter your making/buying cost in Product Costs so your profit calculations reflect actual product margins."}
              </p>
            </Banner>
          </Layout.Section>
        )}

        {/* ── Headline Metric Card ───────────────────────────── */}
        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center" wrap>
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">
                  Total Money Lost to Leaks
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Money lost to courier return charges, shipping overages, and heavy discounts
                </Text>
              </BlockStack>
              <BlockStack gap="050" align="end">
                <Text variant="heading2xl" as="p" tone="critical">
                  ₹{leaks.totalLeak.toLocaleString("en-IN")}
                </Text>
                <Text variant="bodyXs" as="span" tone="subdued">
                  money you can save with ProfitRx
                </Text>
              </BlockStack>
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* ── Donut + Insights ──────────────────────────── */}
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
            <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 1, lg: 1 }}>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">
                    Where the Money Went
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
                    title="Returned Parcels (RTO)"
                    amount={leaks.rtoLoss}
                    trend={leaks.rtoTrend}
                    detail="Orders returned by customer or courier delivery failed. Pure courier fees burned."
                    tone="critical"
                    actionUrl="/app/rto"
                    actionText="View Returns"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <LeakInsight
                    title="Excess Shipping Fees"
                    amount={leaks.shippingLoss}
                    trend={leaks.shippingTrend}
                    detail="Courier charged more freight than you collected from the customer. Check weight slabs."
                    tone="warning"
                    actionUrl="/app/settings"
                    actionText="Courier Settings"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <LeakInsight
                    title="Heavy Discounts"
                    amount={leaks.discountLoss}
                    trend={leaks.discountTrend}
                    detail="Profit lost through big coupons that gave away too much margin."
                    tone="warning"
                    actionUrl="/app/cogs"
                    actionText="Check Product Margins"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <Card>
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h3">
                        How to Stop These Losses
                      </Text>
                      <Divider />
                      <BlockStack gap="150">
                        {[
                          "Block high-return pincodes for Cash on Delivery",
                          "Offer 5% discount to pay via UPI prepaid",
                          "Send WhatsApp OTP to verify intent",
                          "Cap maximum coupon discount at 10%",
                          "Check courier weight slabs to avoid freight penalties",
                        ].map((action, idx) => (
                          <InlineStack key={idx} gap="100" blockAlign="start">
                            <Badge tone="success">✓</Badge>
                            <Text variant="bodySm" as="span">
                              {action}
                            </Text>
                          </InlineStack>
                        ))}
                      </BlockStack>
                    </BlockStack>
                  </Card>
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
                  30-Day Money Lost Trend
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Daily money lost to returned parcels, excess shipping, and discounts
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
                    Recent Orders Where You Lost Money
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Select an order to inspect return risk, breakdown, and cost details
                  </Text>
                </BlockStack>
              </InlineStack>

              {affectedRows.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "numeric", "text", "numeric", "text", "text"]}
                  headings={["Order #", "Order Value (₹)", "Leak Type", "Money Lost (₹)", "Reason", "Date"]}
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

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = "An unexpected error occurred while checking profit leaks.";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}: ${error.data}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="Where You Are Losing Money">
      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <Banner tone="critical" title="Failed to Load Profit Leak Diagnostics">
              <p>{errorMessage}</p>
            </Banner>
            <Button onClick={() => window.location.reload()}>Retry Diagnostics</Button>
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}
