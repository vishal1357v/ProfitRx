import { LoaderFunctionArgs, redirect } from "react-router";
import { useLoaderData, useNavigate, isRouteErrorResponse, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const headers = (headersArgs: any) => boundary.headers(headersArgs);

import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Badge,
  Divider, Box, Grid, ProgressBar, Icon, EmptyState
} from "@shopify/polaris";
import {
  InfoIcon, LockIcon, DeliveryIcon, AlertBubbleIcon, CheckIcon, AlertCircleIcon
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const orderId = params.id;

  if (!orderId) {
    return redirect(`/app/rto?shop=${shop}`);
  }

  // Handle both short IDs and full gid:// formats just in case
  const decodedId = decodeURIComponent(orderId);
  const searchId = decodedId.includes("gid://") ? decodedId : `gid://shopify/Order/${decodedId}`;

  const [order, settings, executionLogs, learningRecords] = await Promise.all([
    prisma.order.findUnique({
      where: { id: searchId, shop },
      include: { lineItems: true },
    }),
    prisma.storeSettings.findUnique({ where: { shop } }),
    prisma.executionLog.findMany({ where: { orderId: searchId, shop }, orderBy: { createdAt: 'asc' } }),
    prisma.learningRecord.findMany({ where: { orderId: searchId, shop }, orderBy: { createdAt: 'desc' } })
  ]);

  if (!order) {
    // If not found by gid, try raw id
    const fallbackOrder = await prisma.order.findUnique({
      where: { id: decodedId, shop },
      include: { lineItems: true },
    });
    if (!fallbackOrder) {
      throw new Response("Order Not Found", { status: 404 });
    }
    const [fallbackLogs, fallbackLearnings] = await Promise.all([
      prisma.executionLog.findMany({ where: { orderId: decodedId, shop }, orderBy: { createdAt: 'asc' } }),
      prisma.learningRecord.findMany({ where: { orderId: decodedId, shop }, orderBy: { createdAt: 'desc' } })
    ]);
    return { order: fallbackOrder, shop, settings, executionLogs: fallbackLogs, learningRecords: fallbackLearnings };
  }

  return { order, shop, settings, executionLogs, learningRecords };
};

export default function OrderIntelligenceRoute() {
  const { order, shop, settings, executionLogs, learningRecords } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const riskScore = order.riskScore ?? 0;
  let riskColor: "success" | "warning" | "critical" | "info" = "success";
  if (riskScore > 30) riskColor = "warning";
  if (riskScore > 60) riskColor = "critical";

  const reasons = (order.riskReasons as Array<{ reason: string; impact: number }>) || [];
  
  // Calculate Expected Profit based on RTO risk
  // Expected Value = (Profit * (1 - Risk)) - (Loss * Risk)
  const cogs = order.cogsAtTimeOfOrder ?? (order.totalPrice * 0.4);
  const forwardShipping = settings?.defaultForwardShipping ?? 60;
  const returnShipping = settings?.defaultReturnShipping ?? 70;
  const profitIfDelivered = order.totalPrice - cogs - forwardShipping;
  const lossIfRto = forwardShipping + returnShipping;
  const pRto = riskScore / 100;
  const expectedValue = (profitIfDelivered * (1 - pRto)) - (lossIfRto * pRto);

  return (
    <Page
      backAction={{ content: 'Orders', onAction: () => navigate(`/app/rto?shop=${shop}`) }}
      title={`Order Intelligence: #${order.orderNumber}`}
      subtitle={`Analyzed by ProfitRx Decision Engine`}
      compactTitle
    >
      <Layout>
        {/* Main Intelligence Panel */}
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Intelligence Summary</Text>
                <Grid>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4 }}>
                    <BlockStack gap="100">
                      <Text variant="headingSm" as="h3" tone="subdued">Risk Score</Text>
                      <InlineStack align="start" blockAlign="end" gap="200">
                        <Text variant="heading3xl" as="p" tone={riskColor === "critical" ? "critical" : riskColor === "warning" ? "caution" : "success"}>
                          {riskScore}%
                        </Text>
                        <Badge tone={riskColor}>{order.riskLevel || "LOW"}</Badge>
                      </InlineStack>
                    </BlockStack>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4 }}>
                    <BlockStack gap="100">
                      <Text variant="headingSm" as="h3" tone="subdued">Expected Value</Text>
                      <Text variant="heading3xl" as="p" tone={expectedValue > 0 ? "success" : "critical"}>
                        ₹{Math.round(expectedValue)}
                      </Text>
                    </BlockStack>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 4 }}>
                    <BlockStack gap="100">
                      <Text variant="headingSm" as="h3" tone="subdued">Engine Decision</Text>
                      <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={LockIcon} tone="base" />
                          <Text variant="headingSm" as="span">{order.merchantRecommendation || (order.isCOD ? "OTP Verification" : "Fulfill")}</Text>
                        </InlineStack>
                      </Box>
                    </BlockStack>
                  </Grid.Cell>
                </Grid>

                <Divider />
                
                <Text variant="headingSm" as="h3">Risk Breakdown</Text>
                {reasons.length > 0 ? (
                  <BlockStack gap="200">
                    {reasons.map((r, i) => (
                      <InlineStack key={i} align="space-between">
                        <Text as="span">{r.reason}</Text>
                        <Text as="span" tone={r.impact > 0 ? "critical" : "success"}>
                          {r.impact > 0 ? "+" : ""}{r.impact}%
                        </Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                ) : (
                  <Box padding="300" background="bg-surface-secondary" borderRadius="100">
                    <Text as="p" tone="subdued">No major risk factors detected for this order.</Text>
                  </Box>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Decision Timeline</Text>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingLeft: '8px' }}>
                  
                  {/* Always show Order Received */}
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ width: '2px', backgroundColor: executionLogs.length > 0 ? 'var(--p-color-border-success)' : 'transparent', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: '-5px', top: '0', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--p-color-bg-surface-success)', border: '2px solid var(--p-color-border-success)' }}></div>
                    </div>
                    <BlockStack gap="050">
                      <Text variant="bodyMd" as="span" fontWeight="bold">Order Received</Text>
                      <Text variant="bodySm" as="span" tone="subdued">{new Date(order.createdAt).toLocaleString()}</Text>
                    </BlockStack>
                  </div>

                  {executionLogs.length === 0 && (
                    <Box padding="300" background="bg-surface-secondary" borderRadius="100">
                      <Text as="p" tone="subdued">No execution logs available. This order may have been processed before pipeline tracking was enabled, or it bypassed the intelligence engine.</Text>
                    </Box>
                  )}

                  {executionLogs.map((log: any, index: number) => {
                    const isLast = index === executionLogs.length - 1;
                    const isSuccess = log.status === 'SUCCESS';
                    const isFailed = log.status === 'FAILED';
                    const color = isFailed ? 'critical' : isSuccess ? 'success' : 'info';
                    const bgColor = `var(--p-color-bg-surface-${color === 'critical' ? 'critical' : color === 'success' ? 'success' : 'info'})`;
                    const borderColor = `var(--p-color-border-${color === 'critical' ? 'critical' : color === 'success' ? 'success' : 'info'})`;
                    
                    return (
                      <div key={log.id} style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ width: '2px', backgroundColor: isLast ? 'transparent' : borderColor, position: 'relative' }}>
                          <div style={{ position: 'absolute', left: '-5px', top: '0', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: bgColor, border: `2px solid ${borderColor}` }}></div>
                        </div>
                        <BlockStack gap="050">
                          <Text variant="bodyMd" as="span" fontWeight="bold">
                            {log.step === "FEATURE_EXTRACTION" ? "Features Extracted" : 
                             log.step === "RISK_CALCULATION" ? "Risk & Value Calculated" : 
                             log.step === "DECISION" ? "Decision Made" : 
                             log.step === "EXECUTION" ? "Action Executed" : log.step}
                          </Text>
                          <Text variant="bodySm" as="span" tone="subdued">{new Date(log.createdAt).toLocaleString()}</Text>
                          {log.message && <Text variant="bodySm" as="p">{log.message}</Text>}
                        </BlockStack>
                      </div>
                    );
                  })}
                </div>
              </BlockStack>
            </Card>

            {learningRecords.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Machine Learning Feedback</Text>
                  <BlockStack gap="200">
                    {learningRecords.map((record: any) => (
                      <Box key={record.id} padding="300" background="bg-surface-secondary" borderRadius="100">
                        <InlineStack align="space-between">
                          <BlockStack gap="100">
                            <Text as="span" variant="bodyMd" fontWeight="bold">Model Feedback Logged</Text>
                            <Text as="span" variant="bodySm" tone="subdued">{new Date(record.createdAt).toLocaleString()}</Text>
                          </BlockStack>
                          <BlockStack gap="100" align="end">
                            <Text as="span" variant="bodySm">Predicted RTO: {(record.predictedRto * 100).toFixed(1)}%</Text>
                            <Badge tone={record.actualRto ? "critical" : "success"}>
                              {`Actual: ${record.actualRto ? "RTO" : "Delivered"}`}
                            </Badge>
                          </BlockStack>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>

        {/* Sidebar Order Details */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Customer</Text>
              <BlockStack gap="100">
                <Text as="p">{order.customerName || "Guest User"}</Text>
                <Text as="p" tone="subdued">{order.customerEmail || "No email"}</Text>
                <Text as="p" tone="subdued">{order.city}, {order.province} {order.pincode}</Text>
              </BlockStack>
              <Divider />
              <Text variant="headingMd" as="h2">Order Value</Text>
              <InlineStack align="space-between">
                <Text as="span">Total</Text>
                <Text as="span">₹{order.totalPrice}</Text>
              </InlineStack>
              <InlineStack align="space-between">
                <Text as="span">Payment</Text>
                <Badge tone={order.isCOD ? "warning" : "success"}>{order.isCOD ? "COD" : "Prepaid"}</Badge>
              </InlineStack>
              <InlineStack align="space-between">
                <Text as="span">Channel</Text>
                <Badge>{order.channelAttribution || "Website"}</Badge>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <Page title="Order Not Found">
        <EmptyState
          heading="We couldn't find this order"
          action={{ content: 'Back to Orders', onAction: () => navigate('/app/rto') }}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>The order you are looking for does not exist in the database or has been deleted.</p>
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page title="Error Loading Order">
      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2" tone="critical">Something went wrong</Text>
          <Text as="p">{(error as any)?.message || "An unexpected error occurred while loading this order."}</Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
