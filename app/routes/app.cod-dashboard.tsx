import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError, isRouteErrorResponse } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Grid,
  Badge,
  Button,
  Divider,
  Banner,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { CodVerificationApplicationService } from "../application/operations/cod-verification.application";

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

  const data = await CodVerificationApplicationService.getDashboardProfitBreakdown(shop, host);
  return { shop, host, data };
};

export default function CODProfitDashboardRoute() {
  const { shop, host, data } = useLoaderData<typeof loader>();

  return (
    <Page
      title="Cash on Delivery Profit Overview"
      subtitle="See how much money you keep from Cash on Delivery vs online UPI orders after courier freight."
      secondaryActions={[
        {
          content: "Orders to Check",
          url: "/app/operations",
        },
        {
          content: "COD Protection Rules",
          url: `/app/cod-rules?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
        },
      ]}
    >
      <Layout>
        {/* ── Headline Loss Banner ───────────────────────── */}
        <Layout.Section>
          <div
            style={{
              padding: "20px",
              borderRadius: "8px",
              background: "rgba(239,68,68,0.04)",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text variant="headingLg" as="h1">
                  {data.headline}
                </Text>
                <Text variant="bodyMd" as="p" tone="subdued">
                  True net profit for COD orders calculated after deducting COD handling fees, return freight, product loss, and packaging costs.
                </Text>
              </BlockStack>
              <Button
                variant="primary"
                tone="critical"
                url={`/app/cod-rules?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
              >
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
                    <Text variant="headingMd" as="h2">
                      Cash on Delivery (COD)
                    </Text>
                    <Badge tone={data.cod.rtoRate >= 20 ? "critical" : "warning"}>
                      {`${data.cod.rtoRate}% Return Rate`}
                    </Badge>
                  </InlineStack>

                  <Divider />

                  <Grid columns={{ xs: 2, sm: 2, md: 2, lg: 2 }}>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <Text variant="bodyXs" as="span" tone="subdued">COD Orders</Text>
                        <Text variant="headingSm" as="p">
                          {data.cod.orders}
                        </Text>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <Text variant="bodyXs" as="span" tone="subdued">COD Sales</Text>
                        <Text variant="headingSm" as="p">
                          ₹{data.cod.revenue.toLocaleString("en-IN")}
                        </Text>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <Text variant="bodyXs" as="span" tone="subdued">Estimated Net Profit</Text>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 18,
                            color: data.cod.profit >= 0 ? "var(--p-color-text-success)" : "var(--p-color-text-critical)",
                          }}
                        >
                          ₹{data.cod.profit.toLocaleString("en-IN")}
                        </span>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <Text variant="bodyXs" as="span" tone="subdued">Courier Money Lost (₹)</Text>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 18,
                            color: "var(--p-color-text-critical)",
                          }}
                        >
                          ₹{data.cod.rtoLoss.toLocaleString("en-IN")}
                        </span>
                      </BlockStack>
                    </Grid.Cell>
                  </Grid>

                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "8px",
                      background: "rgba(239,68,68,0.05)",
                      border: "1px solid rgba(239,68,68,0.15)",
                    }}
                  >
                    <Text variant="bodySm" as="p">
                      <strong>COD Net Margin:</strong> {data.cod.margin}%. Returned parcels cause pure loss from two-way courier shipping and packing materials.
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
                    <Text variant="headingMd" as="h2">
                      Online Payment (Prepaid / UPI)
                    </Text>
                    <Badge tone="success">99.2% Delivered</Badge>
                  </InlineStack>

                  <Divider />

                  <Grid columns={{ xs: 2, sm: 2, md: 2, lg: 2 }}>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <Text variant="bodyXs" as="span" tone="subdued">Prepaid Orders</Text>
                        <Text variant="headingSm" as="p">
                          {data.prepaid.orders}
                        </Text>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <Text variant="bodyXs" as="span" tone="subdued">Prepaid Sales</Text>
                        <Text variant="headingSm" as="p">
                          ₹{data.prepaid.revenue.toLocaleString("en-IN")}
                        </Text>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <Text variant="bodyXs" as="span" tone="subdued">Estimated Net Profit</Text>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 18,
                            color: "var(--p-color-text-success)",
                          }}
                        >
                          ₹{data.prepaid.profit.toLocaleString("en-IN")}
                        </span>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell>
                      <BlockStack gap="050">
                        <Text variant="bodyXs" as="span" tone="subdued">Prepaid Margin</Text>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 18,
                            color: "var(--p-color-text-success)",
                          }}
                        >
                          {data.prepaid.margin}%
                        </span>
                      </BlockStack>
                    </Grid.Cell>
                  </Grid>

                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "8px",
                      background: "rgba(16,185,129,0.05)",
                      border: "1px solid rgba(16,185,129,0.15)",
                    }}
                  >
                    <Text variant="bodySm" as="p">
                      <strong>Prepaid Impact:</strong> Prepaid orders deliver{" "}
                      {data.prepaid.margin > data.cod.margin
                        ? `${data.prepaid.margin - data.cod.margin}% higher profit margin`
                        : "higher profitability"}{" "}
                      than COD because courier returns are near 0%.
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
                <Text variant="headingMd" as="h2">
                  How to Cut Courier Losses Immediately
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Prioritized recommendations to immediately cut return losses and keep more profit.
                </Text>
              </BlockStack>

              <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                {data.insights.map((item: any) => (
                  <Grid.Cell key={item.id}>
                    <div
                      style={{
                        padding: "20px",
                        borderRadius: "var(--gg-radius-md)",
                        border: `1px solid ${
                          item.type === "CRITICAL"
                            ? "rgba(239,68,68,0.3)"
                            : item.type === "WARNING"
                            ? "rgba(245,158,11,0.3)"
                            : "rgba(56,189,248,0.3)"
                        }`,
                        background:
                          item.type === "CRITICAL"
                            ? "rgba(239,68,68,0.05)"
                            : item.type === "WARNING"
                            ? "rgba(245,158,11,0.05)"
                            : "rgba(56,189,248,0.05)",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
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

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = "An unexpected error occurred while loading COD analytics.";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}: ${error.data}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="Cash on Delivery Profit Overview">
      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <Banner tone="critical" title="Failed to Load COD Overview">
              <p>{errorMessage}</p>
            </Banner>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}
