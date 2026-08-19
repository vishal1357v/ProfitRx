import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSubmit, useNavigation, useActionData, isRouteErrorResponse, useRouteError, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const headers = (headersArgs: any) => boundary.headers(headersArgs);

import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Divider,
  Box,
  Grid,
  Icon,
  EmptyState,
  Banner,
  Tooltip,
  Button,
  ButtonGroup,
  Modal,
  TextField,
  Select,
  DataTable,
} from "@shopify/polaris";
import {
  LockIcon,
  ShieldCheckMarkIcon,
  InfoIcon,
  CashDollarIcon,
  DeliveryIcon,
  PersonIcon,
  AlertBubbleIcon,
  CheckIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { OrderDetailApplicationService } from "../application/order/order-detail.application";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";
  const orderId = params.id;

  if (!orderId) {
    return redirect(`/app/operations?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`);
  }

  const data = await OrderDetailApplicationService.getOrderDetail(shop, orderId);

  if (!data) {
    throw new Response("Order Not Found", { status: 404 });
  }

  return { ...data, host };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const orderId = params.id;

  if (!orderId) {
    return Response.json({ success: false, error: "Missing order ID" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "override_decision") {
    const action = formData.get("action") as string;
    const reason = (formData.get("reason") as string) || "Manual merchant review override";

    const result = await OrderDetailApplicationService.overrideDecision(shop, orderId, action, reason);
    return Response.json(result);
  }

  return Response.json({ success: false, error: "Invalid intent" }, { status: 400 });
};

export default function OrderIntelligenceRoute() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData() as any;
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const { order, intelligence, executionLogs, learningRecords, shop, host } = data;

  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideAction, setOverrideAction] = useState(intelligence.decision || "ALLOW_COD");
  const [overrideReason, setOverrideReason] = useState("");

  const riskScore = intelligence.riskScore;
  let riskTone: "success" | "warning" | "critical" | "info" = "success";
  if (riskScore > 30) riskTone = "warning";

  if (riskScore > 60) riskTone = "critical";

  const reasons = intelligence.riskReasons || [];
  const expectedValue = intelligence.expectedValue;

  const handleQuickAction = (actionName: string) => {
    const formData = new FormData();
    formData.append("intent", "override_decision");
    formData.append("action", actionName);
    formData.append("reason", `Quick merchant action: ${actionName}`);
    submit(formData, { method: "post" });
  };

  const handleConfirmOverride = () => {
    const formData = new FormData();
    formData.append("intent", "override_decision");
    formData.append("action", overrideAction);
    formData.append("reason", overrideReason || "Merchant manual override");
    submit(formData, { method: "post" });
    setIsOverrideModalOpen(false);
  };

  return (
    <Page
      backAction={{
        content: "Operations",
        onAction: () => navigate(`/app/operations?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`),
      }}
      title={`Order Intelligence: #${order.orderNumber}`}
      subtitle="Evaluated by ProfitRx Risk & Economic Decision Engine"
      compactTitle
      titleMetadata={
        <InlineStack gap="200" blockAlign="center">
          <Badge tone={order.isCOD ? "attention" : "success"}>{order.isCOD ? "COD Order" : "Prepaid"}</Badge>
          <Badge tone={riskTone}>{`${intelligence.riskLevel} RISK`}</Badge>
        </InlineStack>
      }
      primaryAction={{
        content: "Override Decision",
        onAction: () => setIsOverrideModalOpen(true),
      }}
    >
      <Layout>
        {/* Action feedback banner */}
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" title="Decision Updated" onDismiss={() => {}}>
              <p>{actionData.message || "Order decision updated successfully."}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Main Intelligence & Decision Section */}
        <Layout.Section>
          <BlockStack gap="400">
            {/* Top Engine Decision Banner & Quick Actions */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={ShieldCheckMarkIcon} tone="primary" />
                    <Text variant="headingMd" as="h2">
                      {`Engine Recommendation: ${intelligence.decision}`}
                    </Text>
                  </InlineStack>
                  <Badge tone={expectedValue >= 0 ? "success" : "critical"}>
                    {`EV: ${expectedValue >= 0 ? "+" : ""}₹${Math.round(expectedValue)}`}
                  </Badge>
                </InlineStack>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text as="p" variant="bodyMd">
                    <strong>Economic Justification:</strong> {intelligence.economicJustification}
                  </Text>
                </Box>

                {/* Quick 1-Click Action Controls */}
                <Divider />
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">
                    Merchant Action Controls
                  </Text>
                  <InlineStack gap="200" wrap>
                    <Button
                      variant={intelligence.decision === "ALLOW_COD" ? "primary" : "secondary"}
                      tone={intelligence.decision === "ALLOW_COD" ? "success" : undefined}
                      disabled={isSubmitting}
                      onClick={() => handleQuickAction("ALLOW_COD")}
                    >
                      ✓ Allow COD
                    </Button>
                    <Button
                      variant={intelligence.decision === "OTP_VERIFY" ? "primary" : "secondary"}
                      disabled={isSubmitting}
                      onClick={() => handleQuickAction("OTP_VERIFY")}
                    >
                      📱 Send OTP Verification
                    </Button>
                    <Button
                      variant={intelligence.decision === "PREPAID_ONLY" ? "primary" : "secondary"}
                      disabled={isSubmitting}
                      onClick={() => handleQuickAction("PREPAID_ONLY")}
                    >
                      💳 Require Prepaid
                    </Button>
                    <Button
                      variant={intelligence.decision === "BLOCK_COD" ? "primary" : "secondary"}
                      tone="critical"
                      disabled={isSubmitting}
                      onClick={() => handleQuickAction("BLOCK_COD")}
                    >
                      🛑 Block COD
                    </Button>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Risk & Value Grid */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Risk & Evidence Calibration
                </Text>
                <Grid>
                  {/* Risk Score */}
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4 }}>
                    <BlockStack gap="100">
                      <InlineStack gap="100" blockAlign="center">
                        <Text variant="headingSm" as="h3" tone="subdued">
                          RTO Risk Score
                        </Text>
                        <Tooltip content="Estimated probability of customer return based on address completeness, pincode delivery history, and order size.">
                          <Icon source={InfoIcon} tone="subdued" />
                        </Tooltip>
                      </InlineStack>
                      <InlineStack align="start" blockAlign="end" gap="200">
                        <Text
                          variant="heading3xl"
                          as="p"
                          tone={riskTone === "critical" ? "critical" : riskTone === "warning" ? "caution" : "success"}
                        >
                          {riskScore}%
                        </Text>
                        <Badge tone={riskTone}>{intelligence.riskLevel}</Badge>
                      </InlineStack>
                    </BlockStack>
                  </Grid.Cell>

                  {/* Evidence Quality */}
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4 }}>
                    <BlockStack gap="100">
                      <InlineStack gap="100" blockAlign="center">
                        <Text variant="headingSm" as="h3" tone="subdued">
                          Evidence Quality
                        </Text>
                        <Tooltip content="Completeness of historical data for this order. Low confidence (e.g. 25%) reflects a brand new customer or pincode with no prior store order history.">
                          <Icon source={InfoIcon} tone="subdued" />
                        </Tooltip>
                      </InlineStack>
                      <InlineStack align="start" blockAlign="center" gap="200">
                        <Text variant="heading3xl" as="p">
                          {intelligence.evidenceQuality}%
                        </Text>
                        <Badge tone={intelligence.evidenceQuality < 50 ? "info" : "success"}>
                          {intelligence.evidenceQuality < 50 ? "Cold-Start" : "High Confidence"}
                        </Badge>
                      </InlineStack>
                      <Text variant="bodyXs" as="p" tone="subdued">
                        {intelligence.evidenceQuality < 50
                          ? "Grows as store accumulates repeat customer orders"
                          : "Backed by historical delivery data"}
                      </Text>
                    </BlockStack>
                  </Grid.Cell>

                  {/* Unit Economics */}
                  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 4 }}>
                    <BlockStack gap="100">
                      <Text variant="headingSm" as="h3" tone="subdued">
                        Unit Profit Arbitrage
                      </Text>
                      <BlockStack gap="050">
                        <InlineStack align="space-between">
                          <Text variant="bodySm" as="span" tone="subdued">
                            Delivered Profit:
                          </Text>
                          <Text variant="bodySm" as="span" fontWeight="bold" tone="success">
                            +₹{Math.round(intelligence.profitIfDelivered)}
                          </Text>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text variant="bodySm" as="span" tone="subdued">
                            RTO Freight Loss:
                          </Text>
                          <Text variant="bodySm" as="span" fontWeight="bold" tone="critical">
                            -₹{Math.round(intelligence.lossIfRto)}
                          </Text>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text variant="bodySm" as="span" tone="subdued">
                            COGS Source:
                          </Text>
                          <Badge tone={intelligence.hasRealCogs ? "success" : "warning"}>
                            {intelligence.hasRealCogs ? "Actual SKU COGS" : "Default % Estimate"}
                          </Badge>
                        </InlineStack>
                      </BlockStack>
                    </BlockStack>
                  </Grid.Cell>
                </Grid>

                <Divider />

                {/* Detailed Unit Economics Table */}
                <Text variant="headingSm" as="h3">
                  Unit Economics Accounting Breakdown
                </Text>
                <DataTable
                  columnContentTypes={["text", "text", "numeric"]}
                  headings={["Cost Component", "Source / Basis", "Amount (₹)"]}
                  rows={[
                    ["Gross Order Revenue", "Customer checkout price", `₹${order.totalPrice.toLocaleString("en-IN")}`],
                    ["Product COGS", intelligence.hasRealCogs ? "Actual SKU Cost" : "Store Default %", `-₹${Math.round(intelligence.cogsUsed).toLocaleString("en-IN")}`],
                    ["Forward Courier Freight", "Configured shipping rate", `-₹${Math.round(intelligence.forwardShipping).toLocaleString("en-IN")}`],
                    ["COD Handling & Fee", order.isCOD ? "Gateway / Handling" : "N/A (Prepaid)", `-₹${order.isCOD ? 20 : 0}`],
                    ["Packaging & Dispatch", "Configured store default", "-₹10"],
                    [
                      "Estimated Delivered Profit",
                      "Revenue - (COGS + Shipping + Fees)",
                      `+₹${Math.round(intelligence.profitIfDelivered).toLocaleString("en-IN")}`
                    ],
                    [
                      "Potential RTO Return Loss",
                      "Forward + Return Shipping + Packaging",
                      `-₹${Math.round(intelligence.lossIfRto).toLocaleString("en-IN")}`
                    ],
                    [
                      "Net Expected Value (EV)",
                      `(Profit × P(Del)) - (Loss × P(RTO))`,
                      `${expectedValue >= 0 ? "+" : ""}₹${Math.round(expectedValue).toLocaleString("en-IN")}`
                    ],
                  ]}
                />


                <Divider />

                {/* Risk Reasons Breakdown */}
                <Text variant="headingSm" as="h3">
                  Detected Risk Factors
                </Text>
                {reasons.length > 0 ? (
                  <BlockStack gap="200">
                    {reasons.map((r: any, i: number) => (
                      <InlineStack key={i} align="space-between">
                        <Text as="span">{r.reason}</Text>
                        <Text as="span" tone={r.impact > 0 ? "critical" : "success"} fontWeight="bold">
                          {r.impact > 0 ? "+" : ""}
                          {r.impact}% Risk
                        </Text>
                      </InlineStack>
                    ))}
                  </BlockStack>

                ) : (
                  <Box padding="300" background="bg-surface-secondary" borderRadius="100">
                    <Text as="p" tone="subdued">
                      No adverse risk factors identified. Address formatting and customer parameters appear normal.
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Card>

            {/* Decision & Pipeline Timeline */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Decision & Execution Audit Trail
                </Text>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", paddingLeft: "8px" }}>
                  {/* Order Ingested Event */}
                  <div style={{ display: "flex", gap: "16px" }}>
                    <div
                      style={{
                        width: "2px",
                        backgroundColor: executionLogs.length > 0 ? "var(--p-color-border-success)" : "transparent",
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: "-5px",
                          top: "0",
                          width: "12px",
                          height: "12px",
                          borderRadius: "50%",
                          backgroundColor: "var(--p-color-bg-surface-success)",
                          border: "2px solid var(--p-color-border-success)",
                        }}
                      />
                    </div>
                    <BlockStack gap="050">
                      <Text variant="bodyMd" as="span" fontWeight="bold">
                        Order Ingested via Shopify Webhook
                      </Text>
                      <Text variant="bodySm" as="span" tone="subdued">
                        {new Date(order.createdAt).toLocaleString()}
                      </Text>
                    </BlockStack>
                  </div>

                  {executionLogs.length === 0 && (
                    <Box padding="300" background="bg-surface-secondary" borderRadius="100">
                      <Text as="p" tone="subdued">
                        No execution logs recorded for this order yet.
                      </Text>
                    </Box>
                  )}

                  {executionLogs.map((log: any, index: number) => {
                    const isLast = index === executionLogs.length - 1;
                    const isSuccess = log.status === "SUCCESS";
                    const isFailed = log.status === "FAILED";
                    const color = isFailed ? "critical" : isSuccess ? "success" : "info";
                    const bgColor = `var(--p-color-bg-surface-${color === "critical" ? "critical" : color === "success" ? "success" : "info"})`;
                    const borderColor = `var(--p-color-border-${color === "critical" ? "critical" : color === "success" ? "success" : "info"})`;

                    return (
                      <div key={log.id} style={{ display: "flex", gap: "16px" }}>
                        <div style={{ width: "2px", backgroundColor: isLast ? "transparent" : borderColor, position: "relative" }}>
                          <div
                            style={{
                              position: "absolute",
                              left: "-5px",
                              top: "0",
                              width: "12px",
                              height: "12px",
                              borderRadius: "50%",
                              backgroundColor: bgColor,
                              border: `2px solid ${borderColor}`,
                            }}
                          />
                        </div>
                        <BlockStack gap="050">
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd" as="span" fontWeight="bold">
                              {log.step === "FeatureExtraction"
                                ? "Features Extracted"
                                : log.step === "RtoRiskScoring"
                                ? "Risk Score & Confidence Calculated"
                                : log.step === "ExpectedValueCalculation"
                                ? "Expected Value Arbitrage Evaluated"
                                : log.step === "PolicyDecision"
                                ? "Decision Matrix Applied"
                                : log.step === "ExecutionEngine"
                                ? "Action Executed"
                                : log.step}
                            </Text>
                            <Badge tone={isFailed ? "critical" : isSuccess ? "success" : "info"}>{log.status}</Badge>
                          </InlineStack>
                          <Text variant="bodySm" as="span" tone="subdued">
                            {new Date(log.createdAt).toLocaleString()}
                          </Text>
                          {log.message && (
                            <Text variant="bodySm" as="p">
                              {log.message}
                            </Text>
                          )}
                        </BlockStack>
                      </div>
                    );
                  })}
                </div>
              </BlockStack>
            </Card>

            {/* Line Items Table */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Line Items ({order.lineItems.length})
                </Text>
                <BlockStack gap="200">
                  {order.lineItems.map((item: any) => (
                    <InlineStack key={item.id} align="space-between" blockAlign="center">
                      <BlockStack gap="050">
                        <Text variant="bodyMd" as="span" fontWeight="bold">
                          {item.title}
                        </Text>
                        {item.variantTitle && (
                          <Text variant="bodySm" as="span" tone="subdued">
                            Variant: {item.variantTitle}
                          </Text>
                        )}
                      </BlockStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" as="span">
                          Qty: {item.quantity}
                        </Text>
                        <Text variant="bodyMd" as="span" fontWeight="bold">
                          ₹{item.unitPrice * item.quantity}
                        </Text>
                      </InlineStack>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Sidebar Order & Customer Context */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {/* Customer Card */}
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={PersonIcon} tone="base" />
                  <Text variant="headingMd" as="h2">
                    Customer Profile
                  </Text>
                </InlineStack>
                <BlockStack gap="100">
                  <Text as="p" fontWeight="bold">
                    {order.customerName || "Guest Customer"}
                  </Text>
                  <Text as="p" tone="subdued">
                    {order.customerEmail || "No email on order"}
                  </Text>
                  <Text as="p" tone="subdued">
                    {order.city ? `${order.city}, ` : ""}
                    {order.province ? `${order.province} ` : ""}
                    {order.pincode || "No Pincode"}
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Financial Summary Card */}
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={CashDollarIcon} tone="base" />
                  <Text variant="headingMd" as="h2">
                    Financial Summary
                  </Text>
                </InlineStack>
                <BlockStack gap="150">
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">
                      Total Order Value
                    </Text>
                    <Text as="span" fontWeight="bold">
                      ₹{order.totalPrice}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">
                      Payment Gateway
                    </Text>
                    <Badge tone={order.isCOD ? "attention" : "success"}>{order.gateway || (order.isCOD ? "COD" : "Prepaid")}</Badge>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">
                      Financial Status
                    </Text>
                    <Badge>{order.financialStatus}</Badge>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">
                      Fulfillment Status
                    </Text>
                    <Badge>{order.fulfillmentStatus}</Badge>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">
                      Channel Source
                    </Text>
                    <Badge>{order.channelAttribution || "Direct Online Store"}</Badge>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Manual Override Modal */}
      <Modal
        open={isOverrideModalOpen}
        onClose={() => setIsOverrideModalOpen(false)}
        title="Override Decision Engine Recommendation"
        primaryAction={{
          content: "Save Override Decision",
          onAction: handleConfirmOverride,
          loading: isSubmitting,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setIsOverrideModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              <p>
                Manual overrides update the decision status for this order and help calibrate future AI recommendations.
              </p>
            </Banner>
            <Select
              label="Select Decision"
              options={[
                { label: "✓ Allow COD (Fulfill unverified)", value: "ALLOW_COD" },
                { label: "📱 OTP Verification (Require customer OTP)", value: "OTP_VERIFY" },
                { label: "💳 Require Prepaid (Convert to prepaid)", value: "PREPAID_ONLY" },
                { label: "🛑 Block COD (Cancel / reject COD)", value: "BLOCK_COD" },
              ]}
              value={overrideAction}
              onChange={(val) => setOverrideAction(val)}
            />
            <TextField
              label="Reason for Override"
              value={overrideReason}
              onChange={(val) => setOverrideReason(val)}
              placeholder="e.g. VIP returning customer, spoke on WhatsApp, high risk address"
              autoComplete="off"
              multiline={3}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
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
          action={{ content: "Back to Operations", onAction: () => navigate("/app/operations") }}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>The order you are looking for does not exist in the database or belongs to another store.</p>
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page title="Error Loading Order">
      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2" tone="critical">
            Something went wrong
          </Text>
          <Text as="p">{(error as any)?.message || "An unexpected error occurred while loading this order."}</Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
