import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Grid,
  Badge, Button, Divider, Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { CODManagementService } from "../services/cod-management.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  let host = url.searchParams.get("host") || "";
  if (!host && session?.shop) {
    const storeHandle = session.shop.replace(".myshopify.com", "");
    host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
  }

  const data = await CODManagementService.getCODProfitBreakdown(shop, host);
  return { shop, host, data };
};

export default function CODProfitDashboardRoute() {
  const { shop, host, data } = useLoaderData<typeof loader>();

  return (
    <Page title="💸 COD Profit Dashboard">
      <Layout>

        {/* ── Headline Loss Banner ───────────────────────── */}
        <Layout.Section>
          <div style={{
            padding: "24px",
            borderRadius: "var(--gg-radius-lg)",
            background: "linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba() 100%)",
            border: "1px solid rgba(239,68,68,0.3)",
          }}>
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <span style={{ fontSize: 26 }}>🚨</span>
                  <Text variant="headingLg" as="h1">{data.headline}</Text>
                </InlineStack>
                <Text variant="bodyMd" as="p" tone="subdued">
                  True net profit for COD orders calculated after deducting COD handling fees, return freight, product loss, and packaging costs.
                </Text>
              </BlockStack>
              <Button variant="primary" tone="critical" url={`/app/cod-rules?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}>
                Configure COD Rules →
              </Button>
            </InlineStack>
          </div>
        </Layout.Section>

        {/* ── COD vs Prepaid Side-by-Side Comparison ──────── */}
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>

            {/* COD Performance */}
            <Grid.Cell>
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="150" blockAlign="center">
                      <span style={{ fontSize: 22 }}>🚚</span>
                      <Text variant="headingMd" as="h2">Cash on Delivery (COD)</Text>
                    </InlineStack>
                    <Badge tone={data.cod.rtoRate >= 20 ? "critical" : "warning"}>
                      {`${data.cod.rtoRate}% RTO Rate`}
                    </Badge>
                  </InlineStack>

                  <Divider />

                  <Grid columns={{ xs: 2, sm: 2, md: 2, lg: 2 }}>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <span className="gg-section-label">COD Orders</span>
                        <Text variant="headingSm" as="p">{data.cod.orders}</Text>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <span className="gg-section-label">COD Revenue</span>
                        <Text variant="headingSm" as="p">₹{data.cod.revenue.toLocaleString("en-IN")}</Text>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <span className="gg-section-label">Net Profit</span>
                        <span style={{
                          fontFamily: "'Outfit', sans-serif",
                          fontWeight: 800,
                          fontSize: 18,
                          color: data.cod.profit >= 0 ? "var(--gg-accent-green)" : "var(--gg-accent-red)",
                        }}>
                          ₹{data.cod.profit.toLocaleString("en-IN")}
                        </span>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <span className="gg-section-label">RTO Loss (₹)</span>
                        <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 18, color: "var(--gg-accent-red)" }}>
                          ₹{data.cod.rtoLoss.toLocaleString("en-IN")}
                        </span>
                      </BlockStack>
                    </Grid.Cell>
                  </Grid>

                  <div style={{
                    padding: "12px",
                    borderRadius: "var(--gg-radius-md)",
                    background: "rgba(239,68,68,0.05)",
                    border: "1px solid rgba(239,68,68,0.15)",
                  }}>
                    <Text variant="bodySm" as="p">
                      <strong>COD Net Margin:</strong> {data.cod.margin}% (Target &gt;20%). Every returned COD order loses approx. ₹130 in forward + return freight.
                    </Text>
                  </div>
                </BlockStack>
              </Card>
            </Grid.Cell>

            {/* Prepaid Performance */}
            <Grid.Cell>
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="150" blockAlign="center">
                      <span style={{ fontSize: 22 }}>💳</span>
                      <Text variant="headingMd" as="h2">Prepaid Orders</Text>
                    </InlineStack>
                    <Badge tone="success">99.2% Delivered</Badge>
                  </InlineStack>

                  <Divider />

                  <Grid columns={{ xs: 2, sm: 2, md: 2, lg: 2 }}>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <span className="gg-section-label">Prepaid Orders</span>
                        <Text variant="headingSm" as="p">{data.prepaid.orders}</Text>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <span className="gg-section-label">Prepaid Revenue</span>
                        <Text variant="headingSm" as="p">₹{data.prepaid.revenue.toLocaleString("en-IN")}</Text>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <span className="gg-section-label">Net Profit</span>
                        <span style={{
                          fontFamily: "'Outfit', sans-serif",
                          fontWeight: 800,
                          fontSize: 18,
                          color: "var(--gg-accent-green)",
                        }}>
                          ₹{data.prepaid.profit.toLocaleString("en-IN")}
                        </span>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <span className="gg-section-label">Prepaid Margin</span>
                        <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 18, color: "var(--gg-accent-green)" }}>
                          {data.prepaid.margin}%
                        </span>
                      </BlockStack>
                    </Grid.Cell>
                  </Grid>

                  <div style={{
                    padding: "12px",
                    borderRadius: "var(--gg-radius-md)",
                    background: "rgba(16,185,129,0.05)",
                    border: "1px solid rgba(16,185,129,0.15)",
                  }}>
                    <Text variant="bodySm" as="p">
                      <strong>Prepaid Impact:</strong> Prepaid orders generate {data.prepaid.margin > data.cod.margin ? `${data.prepaid.margin - data.cod.margin}% higher margin` : "higher profitability"} than COD because RTO rate is near 0%.
                    </Text>
                  </div>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* ── Actionable RTO Insights & Prevention Suggestions ──── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">⚡ High-Impact COD & RTO Actionable Insights</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Prioritized recommendations to immediately cut RTO losses and increase store profitability.
                </Text>
              </BlockStack>

              <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                {data.insights.map((item: any) => (
                  <Grid.Cell key={item.id}>
                    <div style={{
                      padding: "20px",
                      borderRadius: "var(--gg-radius-md)",
                      border: `1px solid ${item.type === "CRITICAL" ? "rgba(239,68,68,0.3)" : item.type === "WARNING" ? "rgba(245,158,11,0.3)" : "rgba(56,189,248,0.3)"}`,
                      background: item.type === "CRITICAL" ? "rgba(239,68,68,0.05)" : item.type === "WARNING" ? "rgba(245,158,11,0.05)" : "rgba(56,189,248,0.05)",
                      height: "high",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}>
                      <BlockStack gap="150">
                        <InlineStack align="space-between">
                          <Text variant="bodySm" as="span" fontWeight="bold">
                            {item.title}
                          </Text>
                          <Badge tone={item.type === "CRITICAL" ? "critical" : item.type === "WARNING" ? "warning" : "info"}>
                            {item.impact}
                          </Badge>
                        </InlineStack>
                        <Text variant="bodyXs" as="p" tone="subdued">
                          {item.description}
                        </Text>
                      </BlockStack>

                      <div style={{ marginTop: "16px" }}>
                        <Button
                          variant={item.type === "CRITICAL" ? "primary" : "secondary"}
                          tone={item.type === "CRITICAL" ? "critical" : undefined}
                          size="slim"
                          url={item.actionUrl}
                        >
                          {item.actionText}
                        </Button>
                      </div>
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
