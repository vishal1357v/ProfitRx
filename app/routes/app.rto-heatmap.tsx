import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, redirect } from "react-router";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Grid,
  Badge, ProgressBar, Divider, DataTable, Button, Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ProfitIntelligenceService } from "../services/profit-intelligence.service";
import { ProfitService } from "../services/profit.service";
import { canAccessFeature } from "../services/feature-access.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const hasAccess = await canAccessFeature(shop, "rto_heatmap");
  if (!hasAccess) {
    return redirect("/app/pricing?upgrade=growth");
  }

  // Pincode stats
  const pincodeStats = await ProfitIntelligenceService.getPincodeStats(shop, 30);

  // All orders for COD/prepaid split
  const orders = await prisma.order.findMany({ where: { shop } });
  const isCOD = (o: any) => o.isCOD || (o.gateway && (o.gateway.toLowerCase().includes("cod") || o.gateway.toLowerCase().includes("cash") || o.gateway.toLowerCase().includes("manual")));

  const codOrders = orders.filter(isCOD);
  const prepaidOrders = orders.filter((o: any) => !isCOD(o));

  const codRevenue = codOrders.reduce((s: number, o: any) => s + o.totalPrice, 0);
  const prepaidRevenue = prepaidOrders.reduce((s: number, o: any) => s + o.totalPrice, 0);

  // Fetch COGS for profit calculation
  const cogsMap = await ProfitService.getCOGS(shop);
  const calcProfit = (orderList: typeof orders) =>
    orderList.reduce((s: number, o: any) => {
      const c = cogsMap[o.productId || ""] ?? o.totalPrice * 0.4;
      return s + (o.totalPrice - c - o.totalTax - o.shippingPrice);
    }, 0);

  const codProfit = calcProfit(codOrders);
  const prepaidProfit = calcProfit(prepaidOrders);
  const codMargin = codRevenue > 0 ? (codProfit / codRevenue) * 100 : 0;
  const prepaidMargin = prepaidRevenue > 0 ? (prepaidProfit / prepaidRevenue) * 100 : 0;

  // RTO events
  const rtoEvents = await prisma.rTOEvent.findMany({ where: { shop } });
  const codRtoCount = rtoEvents.filter((e: any) => e.eventType === "RTO").length;
  const codRtoRate = codOrders.length > 0 ? (codRtoCount / codOrders.length) * 100 : 0;

  const codAOV = codOrders.length > 0 ? codRevenue / codOrders.length : 0;
  const prepaidAOV = prepaidOrders.length > 0 ? prepaidRevenue / prepaidOrders.length : 0;

  // COD risk for pending COD orders (top 10 high-value)
  const pendingCOD = codOrders
    .filter((o: any) => o.fulfillmentStatus?.toLowerCase() === "unfulfilled" || o.fulfillmentStatus?.toLowerCase() === "in progress")
    .sort((a: any, b: any) => b.totalPrice - a.totalPrice)
    .slice(0, 10);

  const pendingCODWithRisk = await Promise.all(pendingCOD.map(async (o: any) => {
    const risk = await ProfitIntelligenceService.getCODRiskScore(shop, o.pincode, o.totalPrice, o.customerId);
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      value: o.totalPrice,
      pincode: o.pincode || "N/A",
      city: o.city || "N/A",
      riskScore: risk.score,
      riskLevel: risk.level,
      topReason: risk.reasons[0] || "Unknown",
    };
  }));

  return {
    pincodeStats: pincodeStats.map((p: any) => ({
      pincode: p.pincode,
      city: p.city,
      province: p.province,
      totalOrders: p.totalOrders,
      codOrders: p.codOrders,
      rtoCount: p.rtoCount,
      totalLoss: p.totalLoss,
      rtoRate: Math.round(p.rtoRate * 10) / 10,
      riskLevel: p.riskLevel,
    })),
    codStats: {
      orders: codOrders.length,
      revenue: Math.round(codRevenue),
      profit: Math.round(codProfit),
      margin: Math.round(codMargin * 10) / 10,
      rtoRate: Math.round(codRtoRate * 10) / 10,
      aov: Math.round(codAOV),
    },
    prepaidStats: {
      orders: prepaidOrders.length,
      revenue: Math.round(prepaidRevenue),
      profit: Math.round(prepaidProfit),
      margin: Math.round(prepaidMargin * 10) / 10,
      rtoRate: 0,
      aov: Math.round(prepaidAOV),
    },
    pendingCODWithRisk,
    totalOrders: orders.length,
  };
};

const RISK_COLORS = {
  LOW:      { color: "#10b981", bg: "rgba(16,185,129,0.12)", label: "🟢 Low" },
  MEDIUM:   { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "🟡 Medium" },
  HIGH:     { color: "#f97316", bg: "rgba(249,115,22,0.12)", label: "🟠 High" },
  CRITICAL: { color: "#ef4444", bg: "rgba(239,68,68,0.12)", label: "🔴 Critical" },
};

function StatCard({ icon, label, value, sub, color }: {
  icon: string; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="gg-kpi-card">
      <BlockStack gap="150">
        <InlineStack gap="150" blockAlign="center">
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span className="gg-section-label">{label}</span>
        </InlineStack>
        <span style={{
          fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 26,
          letterSpacing: "-0.03em", color: color || "var(--gg-text-primary)", lineHeight: 1,
        }}>
          {value}
        </span>
        {sub && <span className="gg-text-xs gg-text-muted gg-font-body">{sub}</span>}
      </BlockStack>
    </div>
  );
}

export default function RTOHeatmapRoute() {
  const { pincodeStats, codStats, prepaidStats, pendingCODWithRisk, totalOrders } = useLoaderData<typeof loader>();

  const maxRto = Math.max(...pincodeStats.map((p: any) => p.rtoRate), 1);

  const riskRows = pendingCODWithRisk.map((o) => {
    const risk = RISK_COLORS[o.riskLevel as keyof typeof RISK_COLORS] || RISK_COLORS.LOW;
    return [
      <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700 }}>#{o.orderNumber}</span>,
      <span>₹{o.value.toLocaleString("en-IN")}</span>,
      <span>{o.pincode} {o.city !== "N/A" ? `— ${o.city}` : ""}</span>,
      <Badge tone={o.riskLevel === "CRITICAL" ? "critical" : o.riskLevel === "HIGH" ? "warning" : o.riskLevel === "MEDIUM" ? "attention" : "success"}>
        {risk.label}
      </Badge>,
      <span style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>{o.topReason}</span>,
    ];
  });

  return (
    <Page title="RTO & COD Intelligence">
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
                  <Text variant="headingMd" as="h2">📍 Pincode RTO Heatmap</Text>
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
