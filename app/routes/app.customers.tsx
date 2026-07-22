import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Grid,
  Badge, DataTable, Divider, Banner, TextField, Button,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ProfitIntelligenceService } from "../services/profit-intelligence.service";
import { CustomerIntelligenceService } from "../services/customer-intelligence.service";
import { canAccessFeature } from "../services/feature-access.service";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  let host = url.searchParams.get("host") || "";
  if (!host && session?.shop) {
    const storeHandle = session.shop.replace(".myshopify.com", "");
    host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
  }

  const hasAccess = await canAccessFeature(shop, "ltv_cohort");

  const [cohorts, channelQuality, customers] = await Promise.all([
    CustomerIntelligenceService.getLTVCohorts(shop),
    ProfitIntelligenceService.getChannelQualityScores(shop),
    CustomerIntelligenceService.getCustomerDirectory(shop),
  ]);

  return { hasAccess, shop, host, cohorts, channelQuality, customers };
};

// ── Retention Curve Chart ─────────────────────────────────
type CohortItem = { cohortMonth: string; customers: number; repeat30: number; repeat60: number; repeat90: number; avgRevenue: number };
function RetentionChart({ data }: { data: CohortItem[] }) {
  const reversed = [...data].reverse().slice(0, 8);
  if (!reversed.length) return null;

  const width = 580;
  const height = 200;
  const padL = 42, padR = 16, padT = 16, padB = 36;

  const getX = (i: number) => padL + (i * (width - padL - padR)) / (reversed.length - 1 || 1);
  const getY = (v: number) => padT + ((100 - v) / 100) * (height - padT - padB);

  const pts30 = reversed.map((d, i) => `${getX(i)},${getY(d.repeat30)}`).join(" ");
  const pts60 = reversed.map((d, i) => `${getX(i)},${getY(d.repeat60)}`).join(" ");
  const pts90 = reversed.map((d, i) => `${getX(i)},${getY(d.repeat90)}`).join(" ");

  const area30 = `M ${reversed.map((d, i) => `${getX(i)},${getY(d.repeat30)}`).join(" L ")} L ${getX(reversed.length - 1)},${height - padB} L ${getX(0)},${height - padB} Z`;
  const area90 = `M ${reversed.map((d, i) => `${getX(i)},${getY(d.repeat90)}`).join(" L ")} L ${getX(reversed.length - 1)},${height - padB} L ${getX(0)},${height - padB} Z`;

  return (
    <div style={{ width: "100" + "%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width={"100" + "%"} height={height}>
        <defs>
          <linearGradient id="r30-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset={0.0} stopColor="rgb(16, 185, 129)" stopOpacity="0.25" />
            <stop offset={1.0} stopColor="rgb(16, 185, 129)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="r90-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.2" />
            <stop offset="high" stopColor="#7c3aed" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((v, idx) => {
          const y = getY(v);
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 5" />
              <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#475569">{v}%</text>
            </g>
          );
        })}

        {reversed.map((d, i) => (
          <text key={i} x={getX(i)} y={height - padB + 16} textAnchor="middle" fontSize="9" fill="#475569">
            {d.cohortMonth.substring(5)}
          </text>
        ))}

        <path d={area90} fill="url(#r90-grad)" />
        <path d={area30} fill="url(#r30-grad)" />

        <polyline fill="none" stroke="rgb(16, 185, 129)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={pts30} />
        <polyline fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" points={pts60} />
        <polyline fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={pts90} />

        {reversed.map((d, i) => (
          <g key={i}>
            <circle cx={getX(i)} cy={getY(d.repeat30)} r="3.5" fill="rgb(16, 185, 129)" stroke="rgba(16,185,129,0.3)" strokeWidth="4" />
            <circle cx={getX(i)} cy={getY(d.repeat90)} r="3.5" fill="#7c3aed" stroke="rgba(124,58,237,0.3)" strokeWidth="4" />
          </g>
        ))}
      </svg>

      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 8 }}>
        {[
          { color: "top-rated0b981", label: "30-Day Repeat Rate", dash: false },
          { color: "#2563eb", label: "60-Day Repeat Rate", dash: true },
          { color: "#7c3aed", label: "90-Day Repeat Rate", dash: false },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 20, height: 3, backgroundColor: l.color, borderRadius: 2, borderTop: l.dash ? "2px dashed" : "none" }} />
            <span style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Quality Score Bar ─────────────────────────────────────
function QualityBar({ score }: { score: number }) {
  const color = score >= 70 ? "top-rated0b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 8, borderRadius: "100px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "high", background: color, borderRadius: "100px", transition: "width 1s ease" }} />
      </div>
      <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 14, color, width: 32, textAlign: "right" }}>{score}</span>
    </div>
  );
}

const CHANNEL_META: Record<string, { icon: string; color: string }> = {
  ChatGPT:  { icon: "🤖", color: "top-rated0b981" },
  Gemini:   { icon: "✨", color: "#3b82f6" },
  Copilot:  { icon: "🔷", color: "#f59e0b" },
  Website:  { icon: "🌐", color: "#64748b" },
  Perplexity: { icon: "🔍", color: "#a855f7" },
  Claude:   { icon: "🟠", color: "#f97316" },
};

export default function CustomersRoute() {
  const { hasAccess, shop = "", host = "", cohorts = [], channelQuality = [], customers = [] } = useLoaderData<typeof loader>();
  const [searchQuery, setSearchQuery] = useState("");

  if (!hasAccess) {
    return (
      <Page title="👥 Customer LTV & Cohort Retention">
        <Layout>
          <Layout.Section>
            <Banner tone="info" title="🔒 Pro Plan Feature Required">
              <p>Customer LTV & Cohort Retention analysis require a Pro plan upgrade.</p>
              <div style={{ marginTop: "12px" }}>
                <Button url={`/app/pricing?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}&change_plan=true`} variant="primary">
                  Upgrade to Pro Tier →
                </Button>
              </div>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const filteredCustomers = customers.filter((c: any) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Find top channel for the insight callout
  const bestChannel = channelQuality[0];
  const websiteChannel = channelQuality.find(c => c.channel === "Website");
  const qualityMultiplier = bestChannel && websiteChannel && websiteChannel.ltv > 0 && bestChannel.channel !== "Website"
    ? Math.round((bestChannel.ltv / websiteChannel.ltv) * 10) / 10
    : null;

  const cohortRows = cohorts.map((c: any) => [
    <span key={`${c.cohortMonth}-month`} style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, color: "var(--gg-text-primary)" }}>{c.cohortMonth}</span>,
    <span key={`${c.cohortMonth}-cust`} style={{ fontFamily: "'Outfit', sans-serif" }}>{c.customers}</span>,
    <span key={`${c.cohortMonth}-rev`} style={{ fontFamily: "'Outfit', sans-serif" }}>₹{c.avgRevenue.toLocaleString("en-IN")}</span>,
    <Badge key={`${c.cohortMonth}-30`} tone={c.repeat30 >= 25 ? "success" : c.repeat30 >= 10 ? "attention" : "critical"}>{`${c.repeat30}%`}</Badge>,
    <Badge key={`${c.cohortMonth}-60`} tone={c.repeat60 >= 20 ? "success" : c.repeat60 >= 8 ? "attention" : "critical"}>{`${c.repeat60}%`}</Badge>,
    <Badge key={`${c.cohortMonth}-90`} tone={c.repeat90 >= 15 ? "success" : c.repeat90 >= 5 ? "attention" : "critical"}>{`${c.repeat90}%`}</Badge>,
  ]);

  const customerRows = filteredCustomers.map((c: any) => [
    <span key={`${c.id}-name`} style={{ fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>{c.name}</span>,
    <span key={`${c.id}-email`} style={{ color: "var(--gg-text-muted)", fontSize: 13 }}>{c.email}</span>,
    <span key={`${c.id}-cohort`}>{c.cohortMonth}</span>,
    <Badge key={`${c.id}-ch`} tone="info">{c.channelSource}</Badge>,
    <span key={`${c.id}-orders`} style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>{c.orderCount}</span>,
    <span key={`${c.id}-aov`} style={{ fontFamily: "'Outfit', sans-serif" }}>₹{c.aov.toLocaleString("en-IN")}</span>,
    <span key={`${c.id}-ltv`} style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, color: "var(--gg-accent-green)" }}>
      ₹{c.ltv.toLocaleString("en-IN")}
    </span>,
  ]);

  return (
    <Page title="Customer Intelligence — LTV & Cohort Retention">
      <Layout>

        {/* ── AI Quality Score insight ──────────────────── */}
        {qualityMultiplier && qualityMultiplier > 1.2 && (
          <Layout.Section>
            <div style={{
              padding: "16px 20px",
              borderRadius: "var(--gg-radius-lg)",
              background: "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(37,99,235,0.08))",
              border: "1px solid rgba(124,58,237,0.2)",
            }}>
              <InlineStack gap="200" blockAlign="center">
                <span style={{ fontSize: 22 }}>{CHANNEL_META[bestChannel.channel]?.icon || "🏆"}</span>
                <Text variant="bodyMd" as="p">
                  <strong>{bestChannel.channel}</strong> customers are worth{" "}
                  <strong style={{ color: "var(--gg-accent-purple)" }}>{qualityMultiplier}x more</strong> than Website customers —
                  LTV ₹{bestChannel.ltv.toLocaleString("en-IN")} vs ₹{websiteChannel!.ltv.toLocaleString("en-IN")}.
                  Invest more in {bestChannel.channel} traffic.
                </Text>
              </InlineStack>
            </div>
          </Layout.Section>
        )}

        {/* ── AI Channel Quality Cards ──────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">🏆 AI Customer Quality Scores</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Which AI channel brings the most valuable customers? Ranked by LTV, AOV, and repeat rate.
                </Text>
              </BlockStack>

              <Grid columns={{ xs: 1, sm: 2, md: 4, lg: 4 }}>
                {channelQuality.slice(0, 4).map((ch, idx) => {
                  const meta = CHANNEL_META[ch.channel] || CHANNEL_META.Website;
                  return (
                    <Grid.Cell key={ch.channel}>
                      <div style={{
                        padding: "16px",
                        borderRadius: "var(--gg-radius-lg)",
                        border: "1px solid var(--gg-border)",
                        borderTop: `3px solid ${meta.color}`,
                        background: "var(--gg-surface-2)",
                        position: "relative",
                      }}>
                        {idx === 0 && (
                          <div style={{
                            position: "absolute", top: -1, right: 12,
                            background: "linear-gradient(135deg, #7c3aed, #2563eb)",
                            borderRadius: "0 0 8px 8px",
                            padding: "2px 8px",
                            fontSize: 10, fontWeight: 700, color: "white", fontFamily: "'Inter', sans-serif",
                          }}>TOP</div>
                        )}
                        <BlockStack gap="200">
                          <InlineStack gap="150" blockAlign="center">
                            <span style={{ fontSize: 20 }}>{meta.icon}</span>
                            <Text variant="headingSm" as="h3">{ch.channel}</Text>
                          </InlineStack>
                          <Divider />
                          <BlockStack gap="150">
                            <InlineStack align="space-between">
                              <span className="gg-section-label">Quality Score</span>
                            </InlineStack>
                            <QualityBar score={ch.qualityScore} />
                            <InlineStack align="space-between">
                              <span style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>LTV</span>
                              <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 14, color: meta.color }}>₹{ch.ltv.toLocaleString("en-IN")}</span>
                            </InlineStack>
                            <InlineStack align="space-between">
                              <span style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>AOV</span>
                              <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 14 }}>₹{ch.aov.toLocaleString("en-IN")}</span>
                            </InlineStack>
                            <InlineStack align="space-between">
                              <span style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>Repeat</span>
                              <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 14 }}>{ch.repeatRate}%</span>
                            </InlineStack>
                            <InlineStack align="space-between">
                              <span style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>Orders</span>
                              <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 14 }}>{ch.orders}</span>
                            </InlineStack>
                          </BlockStack>
                        </BlockStack>
                      </div>
                    </Grid.Cell>
                  );
                })}
              </Grid>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Retention Curve ───────────────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h2">🔁 LTV Cohort Retention Curve</Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    What % of each month's new customers came back to buy again within 30/60/90 days
                  </Text>
                </BlockStack>
                {cohorts.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div className="gg-pulse" />
                    <span className="gg-text-xs gg-text-muted gg-font-body">Live data</span>
                  </div>
                )}
              </InlineStack>

              {cohorts.length === 0 ? (
                <Banner tone="info">
                  No customer cohort data yet. Sync orders from the Dashboard to populate retention analytics.
                </Banner>
              ) : (
                <RetentionChart data={cohorts} />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Cohort Table ──────────────────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">📊 Cohort Analysis Table</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Monthly customer cohorts — acquisition, revenue, and repeat purchase rates
                </Text>
              </BlockStack>

              {cohorts.length === 0 ? (
                <Banner tone="info">Sync orders to see cohort data.</Banner>
              ) : (
                <DataTable
                  columnContentTypes={["text", "numeric", "numeric", "text", "text", "text"]}
                  headings={["Cohort Month", "New Customers", "Rev / Customer", "30-Day Repeat", "60-Day Repeat", "90-Day Repeat"]}
                  rows={cohortRows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Customer LTV Directory ────────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h2">👤 Customer LTV Directory</Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Individual customer lifetime value, order counts, and acquisition channel attribution.
                  </Text>
                </BlockStack>
              </InlineStack>

              <TextField
                label="Search customer directory"
                labelHidden
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by customer name, email, or ID..."
                autoComplete="off"
              />

              {customerRows.length === 0 ? (
                <Banner tone="info">
                  No customer profiles match your search filter.
                </Banner>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "numeric", "numeric", "numeric"]}
                  headings={["Customer Name", "Email", "Cohort", "Source Channel", "Orders", "AOV", "Lifetime Value (LTV)"]}
                  rows={customerRows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}
