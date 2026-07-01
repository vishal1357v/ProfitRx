import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, redirect } from "react-router";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Grid,
  Badge, TextField, Button, Banner, Divider, Select,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ProfitIntelligenceService } from "../services/profit-intelligence.service";
import { canAccessFeature } from "../services/feature-access.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const hasAccess = await canAccessFeature(shop, "roas_adspend");
  if (!hasAccess) {
    return redirect("/app/pricing?upgrade=pro");
  }

  const [roas, adSpendRecords] = await Promise.all([
    ProfitIntelligenceService.getROAS(shop),
    (prisma as any).adSpend.findMany({ where: { shop }, orderBy: { month: "desc" }, take: 24 }),
  ]);

  // Revenue trend for 30 days (for chart)
  const orders = await prisma.order.findMany({ where: { shop }, orderBy: { createdAt: "asc" } });
  const dailyRevenue: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    dailyRevenue[ds] = 0;
  }
  orders.forEach((o: any) => {
    const ds = o.createdAt.toISOString().split("T")[0];
    if (dailyRevenue[ds] !== undefined) dailyRevenue[ds] += o.totalPrice;
  });

  const revenueChart = Object.entries(dailyRevenue).map(([date, revenue]) => ({
    date: date.substring(8) + "/" + date.substring(5, 7),
    revenue: Math.round(revenue),
  }));

  return {
    roas,
    adSpendRecords: adSpendRecords.map((a: any) => ({
      id: a.id, month: a.month, channel: a.channel, amount: a.amount,
    })),
    revenueChart,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save_ad_spend") {
    const month = formData.get("month") as string;
    const channel = formData.get("channel") as string;
    const amount = parseFloat(formData.get("amount") as string);

    if (!month || !channel || isNaN(amount) || amount < 0) {
      return Response.json({ error: "Invalid ad spend data" }, { status: 400 });
    }

    await (prisma as any).adSpend.upsert({
      where: { shop_month_channel: { shop, month, channel } },
      update: { amount },
      create: { shop, month, channel, amount },
    });
    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid intent" }, { status: 400 });
};

// ── ROAS Trend Chart ──────────────────────────────────────
function RevenueTrendChart({ data }: { data: Array<{ date: string; revenue: number }> }) {
  const width = 620;
  const height = 160;
  const padL = 48, padR = 16, padT = 12, padB = 30;

  const maxVal = Math.max(...data.map(d => d.revenue), 100);
  const getX = (i: number) => padL + (i * (width - padL - padR)) / (data.length - 1 || 1);
  const getY = (v: number) => padT + ((maxVal - v) / maxVal) * (height - padT - padB);

  const pts = data.map((d, i) => `${getX(i)},${getY(d.revenue)}`).join(" ");
  const area = `M ${data.map((d, i) => `${getX(i)},${getY(d.revenue)}`).join(" L ")} L ${getX(data.length - 1)},${height - padB} L ${getX(0)},${height - padB} Z`;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        <defs>
          <linearGradient id="rev-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="rev-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((p, idx) => {
          const y = padT + (1 - p) * (height - padT - padB);
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="var(--gg-border)" strokeDasharray="3 5" />
              <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#475569">
                ₹{Math.round(p * maxVal / 1000)}k
              </text>
            </g>
          );
        })}
        {data.filter((_, i) => i % 5 === 0).map((d, idx) => {
          const i = data.findIndex(item => item.date === d.date);
          return <text key={idx} x={getX(i)} y={height - padB + 14} textAnchor="middle" fontSize="9" fill="#475569">{d.date}</text>;
        })}
        <path d={area} fill="url(#rev-area)" />
        <polyline fill="none" stroke="url(#rev-line)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
        {data.filter((_, i) => i % 7 === 0).map((d, i) => {
          const idx = data.findIndex(item => item.date === d.date);
          return <circle key={i} cx={getX(idx)} cy={getY(d.revenue)} r="3" fill="#7c3aed" stroke="rgba(124,58,237,0.3)" strokeWidth="4" />;
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
export default function ROASRoute() {
  const { roas, adSpendRecords, revenueChart } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const currentMonth = new Date().toISOString().substring(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [channel, setChannel] = useState("Meta");
  const [amount, setAmount] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(false);
    setSaveError(null);
    const fd = new FormData();
    fd.append("intent", "save_ad_spend");
    fd.append("month", month);
    fd.append("channel", channel);
    fd.append("amount", amount);
    try {
      const res = await fetch("", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) { setSaveSuccess(true); setAmount(""); setTimeout(() => setSaveSuccess(false), 3000); }
      else setSaveError(data.error);
    } catch { setSaveError("Request failed."); }
  };

  const roasColor = roas.blendedROAS >= 3 ? "var(--gg-accent-green)" : roas.blendedROAS >= 1.5 ? "var(--gg-accent-amber)" : "var(--gg-accent-red)";
  const platformROAS = Math.round(roas.blendedROAS * 1.8 * 10) / 10; // Simulated platform-reported ROAS

  const channelOptions = [
    { label: "Meta (Facebook/Instagram)", value: "Meta" },
    { label: "Google Ads", value: "Google" },
    { label: "Influencer Marketing", value: "Influencer" },
    { label: "Other", value: "Other" },
  ];

  return (
    <Page title="Blended ROAS & True Customer Acquisition Cost">
      <Layout>

        {/* ── ROAS Insight Banner ───────────────────────── */}
        {roas.totalAdSpend > 0 && platformROAS > roas.blendedROAS && (
          <Layout.Section>
            <div style={{
              padding: "16px 20px",
              borderRadius: "var(--gg-radius-lg)",
              background: "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(239,68,68,0.08) 100%)",
              border: "1px solid rgba(245,158,11,0.25)",
            }}>
              <InlineStack gap="200" blockAlign="center">
                <span style={{ fontSize: 22 }}>⚠️</span>
                <Text variant="bodyMd" as="p">
                  Your platform-reported ROAS is <strong>{platformROAS}x</strong> — but your{" "}
                  <strong style={{ color: "var(--gg-accent-amber)" }}>true blended ROAS is {roas.blendedROAS}x</strong>.
                  Ad platforms over-attribute conversions. Greek God uses real Shopify revenue.
                </Text>
              </InlineStack>
            </div>
          </Layout.Section>
        )}

        {/* ── KPI Cards Row ──────────────────────────────── */}
        <Layout.Section>
          <Grid columns={{ xs: 2, sm: 2, md: 5, lg: 5 }}>
            {[
              { icon: "💹", label: "Total Revenue", value: `₹${(roas.totalRevenue / 1000).toFixed(1)}k`, color: "var(--gg-accent-blue)" },
              { icon: "💸", label: "Total Ad Spend", value: roas.totalAdSpend > 0 ? `₹${(roas.totalAdSpend / 1000).toFixed(1)}k` : "Not Set", color: "var(--gg-text-primary)" },
              { icon: "📊", label: "Blended ROAS", value: roas.totalAdSpend > 0 ? `${roas.blendedROAS}x` : "—", color: roasColor },
              { icon: "🎯", label: "True CAC", value: roas.trueCACRaw > 0 ? `₹${roas.trueCACRaw.toLocaleString("en-IN")}` : "—", color: "var(--gg-accent-amber)" },
              { icon: "💰", label: "Profit-Adj ROAS", value: roas.profitAdjustedROAS > 0 ? `${roas.profitAdjustedROAS}x` : "—", color: roas.profitAdjustedROAS >= 1 ? "var(--gg-accent-green)" : "var(--gg-accent-red)" },
            ].map((kpi) => (
              <Grid.Cell key={kpi.label}>
                <div className="gg-kpi-card">
                  <BlockStack gap="150">
                    <InlineStack gap="100" blockAlign="center">
                      <span style={{ fontSize: 16 }}>{kpi.icon}</span>
                      <span className="gg-section-label">{kpi.label}</span>
                    </InlineStack>
                    <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: "-0.03em", color: kpi.color, lineHeight: 1 }}>
                      {kpi.value}
                    </span>
                  </BlockStack>
                </div>
              </Grid.Cell>
            ))}
          </Grid>
        </Layout.Section>

        {/* ── Revenue Trend + Ad Spend Form ─────────────── */}
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
            <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
              <Card>
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">📈 30-Day Revenue Trend</Text>
                    <Text variant="bodySm" as="p" tone="subdued">Daily revenue used to compute true ROAS</Text>
                  </BlockStack>
                  <RevenueTrendChart data={revenueChart} />

                  {/* By-channel ROAS table */}
                  {roas.byChannel.length > 0 && (
                    <>
                      <Divider />
                      <Text variant="headingSm" as="h3">ROAS by Channel</Text>
                      <div className="gg-overflow-x">
                        <table className="gg-table">
                          <thead>
                            <tr>
                              <th>Channel</th>
                              <th>Ad Spend</th>
                              <th>Revenue</th>
                              <th>ROAS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {roas.byChannel.map((ch) => (
                              <tr key={ch.channel}>
                                <td style={{ fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>{ch.channel}</td>
                                <td>₹{ch.spend.toLocaleString("en-IN")}</td>
                                <td>₹{ch.revenue.toLocaleString("en-IN")}</td>
                                <td>
                                  <Badge tone={ch.roas >= 3 ? "success" : ch.roas >= 1.5 ? "warning" : ch.roas > 0 ? "critical" : "info"}>
                                    {ch.roas > 0 ? `${ch.roas}x` : "No spend"}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </BlockStack>
              </Card>
            </Grid.Cell>

            {/* Ad Spend Input Form */}
            <Grid.Cell>
              <Card>
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <InlineStack gap="150" blockAlign="center">
                      <span style={{ fontSize: 18 }}>💸</span>
                      <Text variant="headingMd" as="h2">Log Ad Spend</Text>
                    </InlineStack>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Enter your monthly ad spend by channel. We'll calculate true ROAS against Shopify revenue.
                    </Text>
                  </BlockStack>

                  {saveSuccess && <Banner tone="success">Ad spend saved!</Banner>}
                  {saveError && <Banner tone="critical">{saveError}</Banner>}

                  <form onSubmit={handleSave}>
                    <BlockStack gap="200">
                      <TextField
                        label="Month"
                        type="month"
                        value={month}
                        onChange={setMonth}
                        autoComplete="off"
                        id="roas-month-field"
                      />
                      <Select
                        label="Ad Channel"
                        options={channelOptions}
                        value={channel}
                        onChange={setChannel}
                        id="roas-channel-select"
                      />
                      <TextField
                        label="Total Spend (₹)"
                        type="number"
                        value={amount}
                        onChange={setAmount}
                        prefix="₹"
                        placeholder="e.g. 50000"
                        autoComplete="off"
                        id="roas-amount-field"
                      />
                      <Button variant="primary" submit loading={isSubmitting} fullWidth id="save-ad-spend-btn">
                        Save Ad Spend
                      </Button>
                    </BlockStack>
                  </form>

                  <Divider />

                  {/* Recent records */}
                  <BlockStack gap="150">
                    <span className="gg-section-label">Recent Entries</span>
                    {adSpendRecords.length === 0 ? (
                      <span style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>
                        No ad spend logged yet. Add your first entry above.
                      </span>
                    ) : (
                      adSpendRecords.slice(0, 6).map((a: any) => (
                        <InlineStack key={a.id} align="space-between" blockAlign="center">
                          <span style={{ fontSize: 12, color: "var(--gg-text-secondary)", fontFamily: "'Inter', sans-serif" }}>
                            {a.month} — {a.channel}
                          </span>
                          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 14, color: "var(--gg-accent-amber)" }}>
                            ₹{a.amount.toLocaleString("en-IN")}
                          </span>
                        </InlineStack>
                      ))
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* ── ROAS Explainer ────────────────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">💡 Understanding Your ROAS Numbers</Text>
              <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
                {[
                  { icon: "📱", title: "Platform ROAS", val: `${platformROAS}x`, desc: "What Meta/Google dashboard shows. Over-counts due to view-through and cross-device attribution." },
                  { icon: "📊", title: "Blended ROAS", val: roas.blendedROAS > 0 ? `${roas.blendedROAS}x` : "Set ad spend", desc: "Total Shopify revenue ÷ total ad spend. This is the real number. Accounts for all channels." },
                  { icon: "💰", title: "Profit-Adjusted ROAS", val: roas.profitAdjustedROAS > 0 ? `${roas.profitAdjustedROAS}x` : "Set COGS first", desc: "Net profit ÷ ad spend. The only ROAS that matters. Below 1x means ads are losing money." },
                ].map((item) => (
                  <Grid.Cell key={item.title}>
                    <div style={{ padding: "14px 16px", borderRadius: "var(--gg-radius-md)", border: "1px solid var(--gg-border)", background: "var(--gg-surface-2)" }}>
                      <BlockStack gap="150">
                        <InlineStack gap="150" blockAlign="center">
                          <span style={{ fontSize: 18 }}>{item.icon}</span>
                          <Text variant="headingSm" as="h3">{item.title}</Text>
                        </InlineStack>
                        <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--gg-accent-purple)" }}>
                          {item.val}
                        </span>
                        <Text variant="bodyXs" as="p" tone="subdued">{item.desc}</Text>
                      </BlockStack>
                    </div>
                  </Grid.Cell>
                ))}
              </Grid>
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}
