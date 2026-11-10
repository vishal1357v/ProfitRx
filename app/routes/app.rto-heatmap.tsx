import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation, redirect, useRouteError, isRouteErrorResponse } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Grid,
  Badge, Divider, DataTable, Button, Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { PincodeApplicationService } from "../application/protection/pincode.application";
import { AuditLogService } from "../services/compliance/audit-log.service";
import { BillingApplicationService } from "../application/billing/billing.application";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const isPreview = url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true";

  if (isPreview) {
    const shop = "glam-aura-india.myshopify.com";
    const host = Buffer.from(`admin.shopify.com/store/glam-aura-india`).toString("base64");
    return {
      hasAccess: true,
      shop,
      host,
      totalOrders: 1420,
      codStats: {
        orders: 740,
        revenue: 1105000,
        profit: 176800,
        margin: 16.0,
        rtoRate: 14.2,
        aov: 1493,
      },
      prepaidStats: {
        orders: 680,
        revenue: 1380000,
        profit: 305600,
        margin: 22.1,
        rtoRate: 0.8,
        aov: 2029,
      },
      pincodeStats: [
        { pincode: "841301", city: "Siwan", province: "Bihar", totalOrders: 42, codOrders: 38, rtoCount: 22, totalLoss: 3300, rtoRate: 57.9, riskLevel: "CRITICAL" },
        { pincode: "800001", city: "Patna", province: "Bihar", totalOrders: 56, codOrders: 45, rtoCount: 19, totalLoss: 2850, rtoRate: 42.2, riskLevel: "HIGH" },
        { pincode: "201301", city: "Noida", province: "Uttar Pradesh", totalOrders: 88, codOrders: 62, rtoCount: 16, totalLoss: 2400, rtoRate: 25.8, riskLevel: "MEDIUM" },
        { pincode: "226001", city: "Lucknow", province: "Uttar Pradesh", totalOrders: 64, codOrders: 48, rtoCount: 11, totalLoss: 1650, rtoRate: 22.9, riskLevel: "MEDIUM" },
        { pincode: "110001", city: "New Delhi", province: "Delhi", totalOrders: 145, codOrders: 60, rtoCount: 4, totalLoss: 600, rtoRate: 6.7, riskLevel: "LOW" },
        { pincode: "400001", city: "Mumbai", province: "Maharashtra", totalOrders: 180, codOrders: 75, rtoCount: 5, totalLoss: 750, rtoRate: 6.7, riskLevel: "LOW" },
        { pincode: "560001", city: "Bangalore", province: "Karnataka", totalOrders: 195, codOrders: 70, rtoCount: 3, totalLoss: 450, rtoRate: 4.3, riskLevel: "LOW" },
      ],
      pendingCODWithRisk: [
        { id: "gid://shopify/Order/849201", orderNumber: 1482, value: 6499, pincode: "841301", city: "Siwan", riskScore: 78, riskLevel: "HIGH", topReason: "High RTO pincode (57.9% return rate)" },
        { id: "gid://shopify/Order/849195", orderNumber: 1481, value: 2250, pincode: "201301", city: "Noida", riskScore: 48, riskLevel: "MEDIUM", topReason: "Moderate return risk in Sector 18" },
      ],
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

  const meta = AuditLogService.extractRequestMeta(request);
  AuditLogService.logAccess({
    shop,
    actor: (session as any).accountOwner ? "merchant_owner" : "merchant_staff",
    resource: "HEATMAP_VIEW",
    action: "VIEW",
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return PincodeApplicationService.getPincodeHeatmapData(shop, host);
};

const RISK_COLORS = {
  LOW:      { color: "rgb(16, 185, 129)", bg: "rgba(16,185,129,0.12)", label: "🟢 Low" },
  MEDIUM:   { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "🟡 Medium" },
  HIGH:     { color: "#f97316", bg: "rgba(249,115,22,0.12)", label: "🟠 High" },
  CRITICAL: { color: "#ef4444", bg: "rgba(239,68,68,0.12)", label: "🔴 Critical" },
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "bulk_block_high_risk") {
    const pincodes = JSON.parse(formData.get("pincodes") as string) as string[];
    const result = await PincodeApplicationService.bulkBlockHighRisk(shop, pincodes);
    return Response.json(result);
  }

  return Response.json({ error: "Invalid intent" }, { status: 400 });
};

export default function RTOHeatmapRoute() {
  const { hasAccess, shop, host, pincodeStats = [], codStats, prepaidStats, pendingCODWithRisk = [] } = useLoaderData<typeof loader>();
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);
  const submit = useSubmit();
  const navigation = useNavigation();
  const isBlocking = navigation.state === "submitting";

  if (!hasAccess) {
    return (
      <Page title="High Return Pincodes">
        <Layout>
          <Layout.Section>
            <Banner tone="info" title="Growth Plan Feature Required">
              <p>High Return Pincode protection & pre-dispatch risk checking require a Growth or Pro plan.</p>
              <div style={{ marginTop: "12px" }}>
                <Button url={`/app/pricing?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}&change_plan=true`} variant="primary">
                  Upgrade Plan →
                </Button>
              </div>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const handleBlockHighRiskPincodes = () => {
    const highRiskPincodes = pincodeStats
      .filter((p: any) => p.riskLevel === "CRITICAL" || p.riskLevel === "HIGH")
      .map((p: any) => p.pincode);

    if (highRiskPincodes.length === 0) {
      setBlockedNotice("No high-risk pincodes found to block.");
      return;
    }

    const fd = new FormData();
    fd.append("intent", "bulk_block_high_risk");
    fd.append("pincodes", JSON.stringify(highRiskPincodes));
    submit(fd, { method: "POST" });
    setBlockedNotice(`Blocking COD for ${highRiskPincodes.length} risky pincodes: ${highRiskPincodes.slice(0, 5).join(", ")}${highRiskPincodes.length > 5 ? ` +${highRiskPincodes.length - 5} more` : ""}. Rules saved.`);
  };

  const maxRto = Math.max(...pincodeStats.map((p: any) => p.rtoRate), 1);

  const riskRows = pendingCODWithRisk.map((o: any) => {
    const risk = RISK_COLORS[o.riskLevel as keyof typeof RISK_COLORS] || RISK_COLORS.LOW;
    return [
      <span key={`order-${o.id}`} style={{ fontWeight: 700 }}>#{o.orderNumber}</span>,
      <span key={`val-${o.id}`}>₹{o.value.toLocaleString("en-IN")}</span>,
      <span key={`pin-${o.id}`}>{o.pincode} {o.city !== "N/A" ? `— ${o.city}` : ""}</span>,
      <Badge key={`badge-${o.id}`} tone={o.riskLevel === "CRITICAL" ? "critical" : o.riskLevel === "HIGH" ? "warning" : o.riskLevel === "MEDIUM" ? "attention" : "success"}>
        {o.riskLevel === "CRITICAL" ? "Very High Risk" : o.riskLevel === "HIGH" ? "High Return Risk" : o.riskLevel === "MEDIUM" ? "Medium Risk" : "Safe"}
      </Badge>,
      <span key={`reason-${o.id}`} style={{ fontSize: 12, color: "var(--p-color-text-subdued)" }}>{o.topReason}</span>,
    ];
  });

  return (
    <Page
      title="High Return Pincodes"
      subtitle="Delivery areas with high return rates. Block Cash on Delivery or ask for UPI advance here."
      secondaryActions={[
        {
          content: "COD Rules",
          url: `/app/cod-rules?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
        },
        {
          content: "Courier Return Reports",
          url: `/app/rto?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
        }
      ]}
    >
      <Layout>

        {/* ── Section: Prepaid vs COD ───────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">Online Payment vs Cash on Delivery — Real Profit Comparison</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Side-by-side comparison showing how much profit you actually keep from prepaid vs COD orders.
                </Text>
              </BlockStack>

              <Grid columns={{ xs: 1, sm: 2, md: 2, lg: 2 }}>
                {/* COD Card */}
                <Grid.Cell>
                  <div style={{
                    padding: 20, borderRadius: "var(--p-border-radius-300, 8px)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    background: "rgba(239,68,68,0.03)",
                  }}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <Text variant="headingSm" as="h3">Cash on Delivery (COD)</Text>
                        <Badge tone={codStats.rtoRate > 15 ? "critical" : "warning"}>
                          {`${codStats.rtoRate}% Return Rate`}
                        </Badge>
                      </InlineStack>
                      <Divider />
                      <Grid columns={{ xs: 2, sm: 3, md: 3, lg: 3 }}>
                        <BlockStack gap="050">
                          <Text variant="bodyXs" as="span" tone="subdued">Total Orders</Text>
                          <span style={{ fontWeight: 700, fontSize: 20 }}>{codStats.orders}</span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <Text variant="bodyXs" as="span" tone="subdued">Sales (₹)</Text>
                          <span style={{ fontWeight: 700, fontSize: 17 }}>₹{codStats.revenue.toLocaleString("en-IN")}</span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <Text variant="bodyXs" as="span" tone="subdued">Estimated Net Profit</Text>
                          <span style={{ fontWeight: 700, fontSize: 17, color: codStats.profit >= 0 ? "var(--p-color-text-success)" : "var(--p-color-text-critical)" }}>
                            ₹{codStats.profit.toLocaleString("en-IN")}
                          </span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <Text variant="bodyXs" as="span" tone="subdued">Profit Margin</Text>
                          <span style={{ fontWeight: 700, fontSize: 17 }}>{codStats.margin}%</span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <Text variant="bodyXs" as="span" tone="subdued">Avg Order Value</Text>
                          <span style={{ fontWeight: 700, fontSize: 17 }}>₹{codStats.aov.toLocaleString("en-IN")}</span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <Text variant="bodyXs" as="span" tone="subdued">Return Rate</Text>
                          <span style={{ fontWeight: 700, fontSize: 17, color: "var(--p-color-text-critical)" }}>{codStats.rtoRate}%</span>
                        </BlockStack>
                      </Grid>
                      <Banner tone="critical">
                        COD return rate is {codStats.rtoRate}%. Returned orders incur forward and reverse courier freight plus repackaging expenses.
                      </Banner>
                    </BlockStack>
                  </div>
                </Grid.Cell>

                {/* Prepaid Card */}
                <Grid.Cell>
                  <div style={{
                    padding: 20, borderRadius: "var(--p-border-radius-300, 8px)",
                    border: "1px solid rgba(16,185,129,0.25)",
                    background: "rgba(16,185,129,0.03)",
                  }}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <Text variant="headingSm" as="h3">Online Payment (Prepaid / UPI)</Text>
                        <Badge tone="success">Near 0% Returns</Badge>
                      </InlineStack>
                      <Divider />
                      <Grid columns={{ xs: 2, sm: 3, md: 3, lg: 3 }}>
                        <BlockStack gap="050">
                          <Text variant="bodyXs" as="span" tone="subdued">Total Orders</Text>
                          <span style={{ fontWeight: 700, fontSize: 20 }}>{prepaidStats.orders}</span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <Text variant="bodyXs" as="span" tone="subdued">Sales (₹)</Text>
                          <span style={{ fontWeight: 700, fontSize: 17 }}>₹{prepaidStats.revenue.toLocaleString("en-IN")}</span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <Text variant="bodyXs" as="span" tone="subdued">Estimated Net Profit</Text>
                          <span style={{ fontWeight: 700, fontSize: 17, color: "var(--p-color-text-success)" }}>
                            ₹{prepaidStats.profit.toLocaleString("en-IN")}
                          </span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <Text variant="bodyXs" as="span" tone="subdued">Profit Margin</Text>
                          <span style={{ fontWeight: 700, fontSize: 17 }}>{prepaidStats.margin}%</span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <Text variant="bodyXs" as="span" tone="subdued">Avg Order Value</Text>
                          <span style={{ fontWeight: 700, fontSize: 17 }}>₹{prepaidStats.aov.toLocaleString("en-IN")}</span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <Text variant="bodyXs" as="span" tone="subdued">Return Rate</Text>
                          <span style={{ fontWeight: 700, fontSize: 17, color: "var(--p-color-text-success)" }}>0%</span>
                        </BlockStack>
                      </Grid>
                      <Banner tone="success">
                        Prepaid orders deliver {Math.max(0, prepaidStats.margin - codStats.margin).toFixed(1)}% higher realized margin due to lower delivery failure and zero COD collection fees.
                      </Banner>
                    </BlockStack>
                  </div>
                </Grid.Cell>
              </Grid>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Section: Pincode Heatmap ──────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Text variant="headingMd" as="h2">Pincodes with High Return Rates</Text>
                    <Button 
                      variant="primary" 
                      tone="critical" 
                      size="slim" 
                      onClick={handleBlockHighRiskPincodes}
                      loading={isBlocking}
                    >
                      Block COD for Risky Pincodes
                    </Button>
                  </InlineStack>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Top {pincodeStats.length} delivery pincodes with courier return percentages
                  </Text>
                </BlockStack>
              </InlineStack>

              {blockedNotice && (
                <Banner tone="success" onDismiss={() => setBlockedNotice(null)}>
                  <p>{blockedNotice}</p>
                </Banner>
              )}

              {pincodeStats.length === 0 ? (
                <Banner tone="info">
                  No pincode data yet. Sync your Shopify orders from the Dashboard to see area return rates.
                </Banner>
              ) : (
                <BlockStack gap="200">
                  {pincodeStats.map((p: any, idx: number) => {
                    const risk = RISK_COLORS[p.riskLevel as keyof typeof RISK_COLORS] || RISK_COLORS.LOW;
                    const barPct = maxRto > 0 ? (p.rtoRate / maxRto) * 100 : 0;
                    return (
                      <div key={p.pincode} style={{
                        padding: "12px 16px",
                        borderRadius: "8px",
                        border: "1px solid var(--p-color-border-subdued, #e1e3e5)",
                        borderLeft: `4px solid ${risk.color}`,
                        background: idx % 2 === 0 ? "var(--p-color-bg-surface-secondary, #fafbfb)" : "#fff",
                      }}>
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="300" blockAlign="center">
                            <div>
                              <span style={{ fontWeight: 700, fontSize: 16 }}>
                                {p.pincode}
                              </span>
                              {p.city && <span style={{ fontSize: 12, color: "var(--p-color-text-subdued)", marginLeft: 6 }}>
                                {p.city}{p.province ? `, ${p.province}` : ""}
                              </span>}
                            </div>
                          </InlineStack>

                          <InlineStack gap="400" blockAlign="center">
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 11, color: "var(--p-color-text-subdued)" }}>Orders / Returned</div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>
                                {p.totalOrders} / {p.rtoCount}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 11, color: "var(--p-color-text-subdued)" }}>Courier Loss</div>
                              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--p-color-text-critical)" }}>
                                ₹{Math.round(p.totalLoss).toLocaleString("en-IN")}
                              </div>
                            </div>
                            <div style={{ width: 120, textAlign: "right" }}>
                              <div style={{ fontSize: 11, color: risk.color, fontWeight: 600, marginBottom: 4 }}>
                                {p.rtoRate}% Returns
                              </div>
                              <div style={{ height: 6, borderRadius: "100px", background: "#e1e3e5", overflow: "hidden" }}>
                                <div style={{ width: `${barPct}%`, height: "100%", background: risk.color, borderRadius: "100px" }} />
                              </div>
                            </div>
                            <Badge tone={p.riskLevel === "CRITICAL" ? "critical" : p.riskLevel === "HIGH" ? "warning" : p.riskLevel === "MEDIUM" ? "attention" : "success"}>
                              {p.riskLevel === "CRITICAL" ? "Very High" : p.riskLevel === "HIGH" ? "High Risk" : p.riskLevel === "MEDIUM" ? "Medium" : "Safe"}
                            </Badge>
                          </InlineStack>
                        </InlineStack>
                      </div>
                    );
                  })}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Section: COD Risk Score ───────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">Pending Orders at Risk</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Orders waiting to be packed that are going to high-return areas. Verify via WhatsApp before dispatching.
                </Text>
              </BlockStack>

              {pendingCODWithRisk.length === 0 ? (
                <Banner tone="success">No pending COD orders going to risky areas detected.</Banner>
              ) : (
                <DataTable
                  columnContentTypes={["text", "numeric", "text", "text", "text"]}
                  headings={["Order #", "Order Value (₹)", "Delivery Pincode / City", "Return Risk", "Reason"]}
                  rows={riskRows}
                />
              )}

              <Banner tone="info" title="How Return Risk Is Evaluated">
                <p>
                  ProfitRx checks past return history for this pincode, order value, and previous buyer behavior so you don't waste courier charges on parcels that come back.
                </p>
              </Banner>
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = "An unexpected error occurred while loading pincode risk intelligence.";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}: ${error.data}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="High Return Pincodes">
      <Card>
        <BlockStack gap="400">
          <Banner tone="critical" title="Failed to Load Pincode Information">
            <p>{errorMessage}</p>
          </Banner>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </BlockStack>
      </Card>
    </Page>
  );
}
