import { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const headers = (headersArgs: any) => boundary.headers(headersArgs);

import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Badge,
  Divider, Grid, DataTable, ProgressBar
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Enforce billing for Models page
  const { billing, session } = await authenticate.admin(request);
  const shop = session.shop;
  try {
    await billing.require({
      plans: ["PRO"],
      isTest: process.env.NODE_ENV !== "production",
      onFailure: async () => {
        throw new Response("Plan upgrade required", { status: 402 });
      }
    });
  } catch (error) {
    if (error instanceof Response && error.status === 402) {
      throw Response.redirect(`/app/pricing?shop=${shop}`);
    }
    throw error;
  }

  // Fetch actual evaluated orders count
  const evaluatedOrders = await prisma.order.count({
    where: { shop, riskScore: { not: null } }
  });

  return {
    shop,
    models: [
      {
        id: "Rule-Engine-v1",
        name: "ProfitRx Rule Engine",
        status: "PRODUCTION",
        accuracy: "N/A",
        expectedImprovement: 0,
        ordersEvaluated: evaluatedOrders,
        agreement: 0
      }
    ]
  };
};

export default function ModelCenterRoute() {
  const { shop, models } = useLoaderData<typeof loader>();

  return (
    <Page title="Model Center & Shadow Inference" subtitle="Manage and monitor decision intelligence models.">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Active Models</Text>
                
                <Grid>
                  {models.map(model => (
                    <Grid.Cell key={model.id} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6 }}>
                      <div style={{
                        border: model.status === 'PRODUCTION' ? '2px solid var(--p-color-border-success)' : '1px dashed var(--p-color-border)',
                        padding: '16px',
                        borderRadius: '8px',
                        background: model.status === 'PRODUCTION' ? 'var(--p-color-bg-surface-success)' : 'transparent'
                      }}>
                        <BlockStack gap="200">
                          <InlineStack align="space-between">
                            <Text variant="headingSm" as="h3">{model.name}</Text>
                            <Badge tone={model.status === 'PRODUCTION' ? 'success' : 'info'}>{model.status}</Badge>
                          </InlineStack>
                          <Divider />
                          <InlineStack align="space-between">
                            <Text as="span" tone="subdued">Accuracy</Text>
                            <Text as="span" fontWeight="bold">{model.accuracy}%</Text>
                          </InlineStack>
                          {model.status === 'SHADOW' && (
                            <>
                              <InlineStack align="space-between">
                                <Text as="span" tone="subdued">Agreement w/ Prod</Text>
                                <Text as="span" fontWeight="bold">{model.agreement}%</Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text as="span" tone="subdued">Expected Value Lift</Text>
                                <Text as="span" fontWeight="bold" tone="success">+₹{model.expectedImprovement}/order</Text>
                              </InlineStack>
                            </>
                          )}
                          <InlineStack align="space-between">
                            <Text as="span" tone="subdued">Orders Evaluated</Text>
                            <Text as="span">{model.ordersEvaluated.toLocaleString()}</Text>
                          </InlineStack>
                        </BlockStack>
                      </div>
                    </Grid.Cell>
                  ))}
                </Grid>

              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Feature Store Registry</Text>
                <Text variant="bodyMd" as="p" tone="subdued">
                  The ML pipeline actively maintains and computes the following feature vectors for inference.
                </Text>
                <DataTable
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={["Feature Name", "Source", "Dependencies", "Last Updated"]}
                  rows={[
                    ["customer_rto_rate", "Learning Records", "customer_cod_orders, customer_rto_orders", "Real-time"],
                    ["pincode_risk_index", "RTO Events", "pincode, total_deliveries, total_rtos", "Hourly"],
                    ["product_margin_volatility", "COGS Catalog", "historical_cogs, shipping_rates", "Daily"],
                  ]}
                />
              </BlockStack>
            </Card>

          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
