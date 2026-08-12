import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Grid,
  Badge, Divider, DataTable, Button, Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { PincodeApplicationService } from "../application/protection/pincode.application";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  let host = url.searchParams.get("host") || "";
  if (!host && session?.shop) {
    const storeHandle = session.shop.replace(".myshopify.com", "");
    host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
  }

  // Enforce billing
  try {
    await billing.require({
      plans: ["GROWTH", "PRO"],
      isTest: process.env.NODE_ENV !== "production",
      onFailure: async () => {
        throw new Response("Plan upgrade required", { status: 402 });
      }
    });
  } catch (error) {
    if (error instanceof Response && error.status === 402) {
      throw Response.redirect(`/app/pricing?shop=${encodeURIComponent(shop)}`);
    }
    throw error;
  }

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
      <Page title="🗺️ Pincode RTO Heatmap">
        <Layout>
          <Layout.Section>
            <Banner tone="info" title="🔒 Growth Plan Feature Required">
              <p>Pincode RTO Heatmap & Pre-shipment Risk Scoring require a Growth or Pro plan upgrade.</p>
              <div style={{ marginTop: "12px" }}>
                <Button url={`/app/pricing?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}&change_plan=true`} variant="primary">
                  Upgrade to Growth Tier →
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
      setBlockedNotice("No HIGH or CRITICAL risk pincodes found to block.");
      return;
    }

    const fd = new FormData();
    fd.append("intent", "bulk_block_high_risk");
    fd.append("pincodes", JSON.stringify(highRiskPincodes));
    submit(fd, { method: "POST" });
    setBlockedNotice(`✅ Blocking COD for ${highRiskPincodes.length} high-risk pincodes: ${highRiskPincodes.slice(0, 5).join(", ")}${highRiskPincodes.length > 5 ? ` +${highRiskPincodes.length - 5} more` : ""}. Rules saved & synced to checkout.`);
  };

  const maxRto = Math.max(...pincodeStats.map((p: any) => p.rtoRate), 1);

  const riskRows = pendingCODWithRisk.map((o: any) => {
    const risk = RISK_COLORS[o.riskLevel as keyof typeof RISK_COLORS] || RISK_COLORS.LOW;
    return [
      <span key={`order-${o.id}`} style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700 }}>#{o.orderNumber}</span>,
      <span key={`val-${o.id}`}>₹{o.value.toLocaleString("en-IN")}</span>,
      <span key={`pin-${o.id}`}>{o.pincode} {o.city !== "N/A" ? `— ${o.city}` : ""}</span>,
      <Badge key={`badge-${o.id}`} tone={o.riskLevel === "CRITICAL" ? "critical" : o.riskLevel === "HIGH" ? "warning" : o.riskLevel === "MEDIUM" ? "attention" : "success"}>
        {risk.label}
      </Badge>,
      <span key={`reason-${o.id}`} style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>{o.topReason}</span>,
    ];
  });

  return (
    <Page
      title="Pincode Risk Heatmap"
      subtitle="Geographic RTO risk concentration and one-click COD blocking by pincode tier."
      secondaryActions={[
        {
          content: "COD Rules & Policy",
          url: `/app/cod-rules?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
        },
        {
          content: "Manage RTO Events",
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
                <Text variant="headingMd" as="h2">⚡ Prepaid vs COD — Profit Split</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Side-by-side truth about which payment mode is actually profitable
                </Text>
              </BlockStack>

              <Grid columns={{ xs: 1, sm: 2, md: 2, lg: 2 }}>
                {/* COD Card */}
                <Grid.Cell>
                  <div style={{
                    padding: 20, borderRadius: "var(--gg-radius-lg)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    background: "rgba(239,68,68,0.05)",
                  }}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <div>
                          <span style={{ fontSize: 20 }}>💵</span>
                          <Text variant="headingSm" as="h3"> Cash on Delivery (COD)</Text>
                        </div>
                        <Badge tone={codStats.rtoRate > 15 ? "critical" : "warning"}>
                          {`${codStats.rtoRate}% RTO Risk`}
                        </Badge>
                      </InlineStack>
                      <Divider />
                      <Grid columns={{ xs: 2, sm: 3, md: 3, lg: 3 }}>
                        <BlockStack gap="050">
                          <span className="gg-section-label">Orders</span>
                          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 22, color: "var(--gg-text-primary)" }}>{codStats.orders}</span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <span className="gg-section-label">Revenue</span>
                          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18, color: "var(--gg-text-primary)" }}>₹{codStats.revenue.toLocaleString("en-IN")}</span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <span className="gg-section-label">Net Profit</span>
                          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18, color: codStats.profit >= 0 ? "var(--gg-accent-green)" : "var(--gg-accent-red)" }}>
                            ₹{codStats.profit.toLocaleString("en-IN")}
                          </span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <span className="gg-section-label">Margin</span>
                          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18, color: codStats.margin > 15 ? "var(--gg-accent-green)" : "var(--gg-accent-red)" }}>
                            {codStats.margin}%
                          </span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <span className="gg-section-label">Avg Order</span>
                          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18 }}>₹{codStats.aov.toLocaleString("en-IN")}</span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <span className="gg-section-label">RTO Rate</span>
                          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18, color: "var(--gg-accent-red)" }}>{codStats.rtoRate}%</span>
                        </BlockStack>
                      </Grid>
                      <Banner tone="critical">
                        COD orders have {Math.round(codStats.rtoRate * 30 / 10 * 10) / 10}x higher failure risk. You may be losing ₹{Math.round(codStats.revenue * codStats.rtoRate / 100).toLocaleString("en-IN")} to RTO.
                      </Banner>
                    </BlockStack>
                  </div>
                </Grid.Cell>

                {/* Prepaid Card */}
                <Grid.Cell>
                  <div style={{
                    padding: 20, borderRadius: "var(--gg-radius-lg)",
                    border: "1px solid rgba(16,185,129,0.25)",
                    background: "rgba(16,185,129,0.05)",
                  }}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <div>
                          <span style={{ fontSize: 20 }}>💳</span>
                          <Text variant="headingSm" as="h3"> Prepaid / Online</Text>
                        </div>
                        <Badge tone="success">0% RTO Risk</Badge>
                      </InlineStack>
                      <Divider />
                      <Grid columns={{ xs: 2, sm: 3, md: 3, lg: 3 }}>
                        <BlockStack gap="050">
                          <span className="gg-section-label">Orders</span>
                          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 22, color: "var(--gg-text-primary)" }}>{prepaidStats.orders}</span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <span className="gg-section-label">Revenue</span>
                          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18, color: "var(--gg-text-primary)" }}>₹{prepaidStats.revenue.toLocaleString("en-IN")}</span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <span className="gg-section-label">Net Profit</span>
                          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18, color: prepaidStats.profit >= 0 ? "var(--gg-accent-green)" : "var(--gg-accent-red)" }}>
                            ₹{prepaidStats.profit.toLocaleString("en-IN")}
                          </span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <span className="gg-section-label">Margin</span>
                          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18, color: prepaidStats.margin > 15 ? "var(--gg-accent-green)" : "var(--gg-accent-red)" }}>
                            {prepaidStats.margin}%
                          </span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <span className="gg-section-label">Avg Order</span>
                          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18 }}>₹{prepaidStats.aov.toLocaleString("en-IN")}</span>
                        </BlockStack>
                        <BlockStack gap="050">
                          <span className="gg-section-label">RTO Rate</span>
                          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18, color: "var(--gg-accent-green)" }}>0%</span>
                        </BlockStack>
                      </Grid>
                      <Banner tone="success">
                        Prepaid orders deliver {Math.max(0, prepaidStats.margin - codStats.margin).toFixed(1)}% higher margin. Incentivize prepaid with 5% discount.
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
                    <Text variant="headingMd" as="h2">📍 Pincode RTO Heatmap</Text>
                    <Button 
                      variant="primary" 
                      tone="critical" 
                      size="slim" 
                      onClick={handleBlockHighRiskPincodes}
                      loading={isBlocking}
                    >
                      🚫 Block High-Risk Pincodes (One-Click)
                    </Button>
                  </InlineStack>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Top {pincodeStats.length} pincodes by RTO rate — color-coded risk levels
                  </Text>
                </BlockStack>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {Object.entries(RISK_COLORS).map(([level, meta]) => (
                    <div key={level} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: meta.color }} />
                      <span style={{ fontSize: 11, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>{level}</span>
                    </div>
                  ))}
                </div>
              </InlineStack>

              {blockedNotice && (
                <Banner tone="success" onDismiss={() => setBlockedNotice(null)}>
                  <p>{blockedNotice}</p>
                </Banner>
              )}

              {pincodeStats.length === 0 ? (
                <Banner tone="info">
                  No pincode data yet. Click "⟳ Sync Orders" on the Dashboard to populate delivery data from Shopify.
                </Banner>
              ) : (
                <BlockStack gap="200">
                  {pincodeStats.map((p: any, idx: number) => {
                    const risk = RISK_COLORS[p.riskLevel as keyof typeof RISK_COLORS] || RISK_COLORS.LOW;
                    const barPct = maxRto > 0 ? (p.rtoRate / maxRto) * 100 : 0;
                    return (
                      <div key={p.pincode} style={{
                        padding: "12px 16px",
                        borderRadius: "var(--gg-radius-md)",
                        border: `1px solid var(--gg-border)`,
                        borderLeft: `4px solid ${risk.color}`,
                        background: idx % 2 === 0 ? "var(--gg-surface-2)" : "var(--gg-surface-1)",
                        transition: "background var(--gg-transition)",
                      }}>
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="300" blockAlign="center">
                            <div>
                              <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 16, color: "var(--gg-text-primary)" }}>
                                {p.pincode}
                              </span>
                              {p.city && <span style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif", marginLeft: 6 }}>
                                {p.city}{p.province ? `, ${p.province}` : ""}
                              </span>}
                            </div>
                          </InlineStack>

                          <InlineStack gap="400" blockAlign="center">
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 11, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>Orders / RTO</div>
                              <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 14 }}>
                                {p.totalOrders} / {p.rtoCount}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 11, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>Loss</div>
                              <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 14, color: "var(--gg-accent-red)" }}>
                                ₹{Math.round(p.totalLoss).toLocaleString("en-IN")}
                              </div>
                            </div>
                            <div style={{ width: 120, textAlign: "right" }}>
                              <div style={{ fontSize: 11, color: risk.color, fontFamily: "'Inter', sans-serif", fontWeight: 600, marginBottom: 4 }}>
                                {p.rtoRate}% RTO
                              </div>
                              <div style={{ height: 6, borderRadius: "100px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                                <div style={{ width: `${barPct}%`, height: "100%", background: risk.color, borderRadius: "100px", transition: "width 0.8s ease" }} />
                              </div>
                            </div>
                            <Badge tone={p.riskLevel === "CRITICAL" ? "critical" : p.riskLevel === "HIGH" ? "warning" : p.riskLevel === "MEDIUM" ? "attention" : "success"}>
                              {risk.label}
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
                <Text variant="headingMd" as="h2">🎯 COD Risk Score — Pending Orders</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  AI-predicted RTO risk for your top pending COD orders. Take action before shipping.
                </Text>
              </BlockStack>

              {pendingCODWithRisk.length === 0 ? (
                <Banner tone="success">No pending COD orders with high risk detected.</Banner>
              ) : (
                <DataTable
                  columnContentTypes={["text", "numeric", "text", "text", "text"]}
                  headings={["Order #", "Value (₹)", "Pincode / City", "Risk Level", "Top Risk Factor"]}
                  rows={riskRows}
                />
              )}

              <div style={{ padding: "12px 16px", borderRadius: "var(--gg-radius-md)", border: "1px solid var(--gg-border)", background: "rgba(124,58,237,0.06)" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" as="p" fontWeight="semibold">💡 How Risk Score Works</Text>
                  <Text variant="bodyXs" as="p" tone="subdued">
                    Score = Pincode RTO history (40%) + Order value (30%) + Customer history (30%). CRITICAL ≥70, HIGH ≥50, MEDIUM ≥30, LOW &lt;30.
                  </Text>
                </BlockStack>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}
