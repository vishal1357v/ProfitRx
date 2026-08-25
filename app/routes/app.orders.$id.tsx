import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSubmit, useNavigation, useActionData, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
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
  EditIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { OrderDetailApplicationService } from "../application/order/order-detail.application";

export const headers = (headersArgs: any) => boundary.headers(headersArgs);

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

  const { order, intelligence, economics, evidence, executionLogs = [], overrideHistory = [], shop, host } = data;

  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideAction, setOverrideAction] = useState(intelligence.decision || "ALLOW_COD");
  const [overrideReason, setOverrideReason] = useState("");

  const riskScore = intelligence.riskScore;
  let riskTone: "success" | "warning" | "critical" = "success";
  if (riskScore >= 50) riskTone = "critical";
  else if (riskScore >= 30) riskTone = "warning";

  const handleConfirmOverride = () => {
    const formData = new FormData();
    formData.append("intent", "override_decision");
    formData.append("action", overrideAction);
    formData.append("reason", overrideReason || "Merchant manual review override");
    submit(formData, { method: "post" });
    setIsOverrideModalOpen(false);
  };

  const getRecommendationBadge = (rec: string) => {
    switch (rec) {
      case "ALLOW_COD":
        return <Badge tone="success" size="large">ALLOW COD (Fulfill Normally)</Badge>;
      case "OTP_VERIFY":
        return <Badge tone="attention" size="large">OTP VERIFY (Confirm Intent)</Badge>;
      case "PREPAID_ONLY":
        return <Badge tone="warning" size="large">REQUIRE PREPAID PAYMENT</Badge>;
      case "BLOCK_COD":
        return <Badge tone="critical" size="large">BLOCK COD</Badge>;
      default:
        return <Badge size="large">{rec}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return <Badge tone="success">Success</Badge>;
      case "PENDING_MERCHANT_REVIEW":
        return <Badge tone="warning">Pending Review</Badge>;
      case "ADVISORY_ONLY":
        return <Badge tone="info">Advisory Only</Badge>;
      case "FAILED":
        return <Badge tone="critical">Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getStateBadge = (state: string) => {
    switch (state) {
      case "ACTUAL":
        return <Badge tone="success">ACTUAL</Badge>;
      case "ESTIMATED":
        return <Badge tone="warning">ESTIMATED</Badge>;
      case "EXPECTED":
        return <Badge tone="info">EXPECTED</Badge>;
      case "INCOMPLETE":
        return <Badge tone="critical">INCOMPLETE</Badge>;
      default:
        return <Badge>{state}</Badge>;
    }
  };

  const textRiskTone = riskTone === "warning" ? "caution" : riskTone;

  return (
    <Page
      backAction={{
        content: "Operations",
        onAction: () => navigate(`/app/operations?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`),
      }}
      title={`Order Intelligence: #${order.orderNumber}`}
      subtitle={`Evaluated under Protection Mode: ${order.protectionMode}`}
      compactTitle
      titleMetadata={
        <InlineStack gap="200" blockAlign="center">
          <Badge tone={order.isCOD ? "attention" : "success"}>{order.isCOD ? "COD Order" : "Prepaid"}</Badge>
          <Badge tone={riskTone}>{`${intelligence.riskLevel} RISK`}</Badge>
          {getStatusBadge(order.executionStatus)}
        </InlineStack>
      }
      primaryAction={{
        content: "Override Decision",
        icon: EditIcon,
        onAction: () => setIsOverrideModalOpen(true),
      }}
    >
      <BlockStack gap="400">
        {actionData?.message && (
          <Banner tone={actionData.success ? "success" : "critical"}>
            <p>{actionData.message}</p>
          </Banner>
        )}

        {/* Override History Banner if Overridden */}
        {overrideHistory.length > 0 && (
          <Banner tone="info" title="Merchant Decision Override Active">
            <BlockStack gap="100">
              {overrideHistory.map((h, i) => (
                <Text variant="bodySm" as="p" key={i}>
                  Overridden from <strong>{h.previousDecision}</strong> to <strong>{h.newDecision}</strong> by {h.actor} on{" "}
                  {new Date(h.timestamp).toLocaleString()} — <em>"{h.reason}"</em>
                </Text>
              ))}
            </BlockStack>
          </Banner>
        )}

        {/* Data Quality Notice */}
        {(!economics.dataCompleteness.hasActualCogs || !economics.dataCompleteness.hasActualShipping) && (
          <Banner tone="warning">
            <InlineStack gap="150" blockAlign="center">
              <Icon source={InfoIcon} tone="warning" />
              <Text variant="bodySm" as="p">
                <strong>Data Quality Notice:</strong>{" "}
                {!economics.dataCompleteness.hasActualCogs &&
                  "Profit is calculated using store default COGS % because this SKU has no custom cost configured. "}
                {!economics.dataCompleteness.hasActualShipping &&
                  "Shipping cost is based on store default freight rates."}
              </Text>
            </InlineStack>
          </Banner>
        )}

        <Layout>
          {/* Main Left Column (70%) */}
          <Layout.Section>
            <BlockStack gap="400">
              {/* SECTION 1: DECISION SUMMARY */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">
                      ProfitRx Recommendation
                    </Text>
                    {getRecommendationBadge(intelligence.decision)}
                  </InlineStack>

                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <Text variant="bodyMd" as="p" fontWeight="medium">
                      {intelligence.economicJustification}
                    </Text>
                  </Box>

                  <Divider />

                  {/* 4-Key Metrics Grid with Explicit Precision Badges */}
                  <InlineStack align="space-between" wrap>
                    <Box minWidth="140px">
                      <BlockStack gap="050">
                        <Text variant="bodyXs" tone="subdued" as="span">
                          RTO Risk Probability
                        </Text>
                        <Text variant="headingLg" tone={textRiskTone} as="p">
                          {Math.round(riskScore)}%
                        </Text>
                        <Badge tone={riskTone}>{intelligence.riskLevel}</Badge>
                      </BlockStack>
                    </Box>

                    <Box minWidth="140px">
                      <BlockStack gap="050">
                        <Text variant="bodyXs" tone="subdued" as="span">
                          Expected Value ($EV$)
                        </Text>
                        <Text
                          variant="headingLg"
                          tone={economics.expectedValue.value >= 0 ? "success" : "critical"}
                          as="p"
                        >
                          {economics.expectedValue.value >= 0
                            ? `+₹${Math.round(economics.expectedValue.value)}`
                            : `-₹${Math.abs(Math.round(economics.expectedValue.value))}`}
                        </Text>
                        {getStateBadge(economics.expectedValue.state)}
                      </BlockStack>
                    </Box>

                    <Box minWidth="140px">
                      <BlockStack gap="050">
                        <Text variant="bodyXs" tone="subdued" as="span">
                          Delivered Profit
                        </Text>
                        <Text
                          variant="headingLg"
                          tone={economics.deliveredProfit.value >= 0 ? "success" : "critical"}
                          as="p"
                        >
                          +₹{Math.round(economics.deliveredProfit.value)}
                        </Text>
                        {getStateBadge(economics.deliveredProfit.state)}
                      </BlockStack>
                    </Box>

                    <Box minWidth="140px">
                      <BlockStack gap="050">
                        <Text variant="bodyXs" tone="subdued" as="span">
                          RTO Loss Exposure
                        </Text>
                        <Text variant="headingLg" tone="critical" as="p">
                          -₹{Math.round(economics.rtoLossExposure.value)}
                        </Text>
                        {getStateBadge(economics.rtoLossExposure.state)}
                      </BlockStack>
                    </Box>
                  </InlineStack>
                </BlockStack>
              </Card>

              {/* SECTION 2: RISK EVIDENCE & FACTORS */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">
                      Risk Evidence & Context
                    </Text>
                    <Badge tone="info">{`Evidence Quality: ${intelligence.evidenceQuality}%`}</Badge>
                  </InlineStack>

                  <Text variant="bodySm" tone="subdued" as="p">
                    Deterministic risk signals extracted at the time of order creation:
                  </Text>

                  <BlockStack gap="200">
                    <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                      <InlineStack align="space-between">
                        <Text variant="bodySm" fontWeight="semibold" as="span">
                          Payment Method Risk
                        </Text>
                        <Badge tone={order.isCOD ? "attention" : "success"}>
                          {order.isCOD ? "COD (+30% Baseline RTO)" : "Prepaid (Zero Remittance Risk)"}
                        </Badge>
                      </InlineStack>
                    </Box>

                    <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                      <InlineStack align="space-between">
                        <Text variant="bodySm" fontWeight="semibold" as="span">
                          Destination Pincode
                        </Text>
                        <Text variant="bodySm" as="span">
                          {order.pincode ? `${order.pincode} (${order.city || "Region"}, ${order.province || ""})` : "Missing Pincode"}
                        </Text>
                      </InlineStack>
                    </Box>

                    <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                      <InlineStack align="space-between">
                        <Text variant="bodySm" fontWeight="semibold" as="span">
                          COGS Source Quality
                        </Text>
                        <Badge tone={economics.cogs.state === "ACTUAL" ? "success" : "warning"}>
                          {economics.cogs.source}
                        </Badge>
                      </InlineStack>
                    </Box>

                    <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                      <InlineStack align="space-between">
                        <Text variant="bodySm" fontWeight="semibold" as="span">
                          Shipping Cost Basis
                        </Text>
                        <Badge tone={economics.forwardShipping.state === "ACTUAL" ? "success" : "warning"}>
                          {economics.forwardShipping.source}
                        </Badge>
                      </InlineStack>
                    </Box>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* SECTION 3: CANONICAL UNIT ECONOMICS BREAKDOWN */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">
                      Canonical Unit Economics
                    </Text>
                    <Badge tone="info">Deterministic Deduplication</Badge>
                  </InlineStack>

                  <Text variant="bodySm" tone="subdued" as="p">
                    Standardized financial breakdown if delivered vs if returned (RTO):
                  </Text>

                  <DataTable
                    columnContentTypes={["text", "numeric", "text"]}
                    headings={["Financial Component", "Amount", "Data Precision"]}
                    rows={[
                      [
                        "Gross Order Revenue",
                        `+₹${Math.round(economics.revenue.value).toLocaleString("en-IN")}`,
                        <Badge tone="success" key="rev">ACTUAL</Badge>,
                      ],
                      [
                        "Customer Paid Shipping",
                        `+₹${Math.round(economics.customerPaidShipping.value)}`,
                        <Badge tone="success" key="cps">ACTUAL</Badge>,
                      ],
                      [
                        "Product COGS",
                        `-₹${Math.round(economics.cogs.value).toLocaleString("en-IN")}`,
                        getStateBadge(economics.cogs.state),
                      ],
                      [
                        "Forward Shipping Freight",
                        `-₹${Math.round(economics.forwardShipping.value)}`,
                        getStateBadge(economics.forwardShipping.state),
                      ],
                      [
                        "Packaging & Materials",
                        `-₹${Math.round(economics.packaging.value)}`,
                        getStateBadge(economics.packaging.state),
                      ],
                      order.isCOD
                        ? [
                            "COD Handling Fee",
                            `-₹${Math.round(economics.codFee.value)}`,
                            getStateBadge(economics.codFee.state),
                          ]
                        : [
                            "Gateway Fee + 18% GST",
                            `-₹${Math.round(economics.gatewayFee.value)}`,
                            getStateBadge(economics.gatewayFee.state),
                          ],
                      [
                        <Text variant="bodyMd" fontWeight="bold" as="span" key="del-lbl">
                          = Delivered Contribution Margin
                        </Text>,
                        <Text variant="bodyMd" fontWeight="bold" tone="success" as="span" key="del-val">
                          +₹{Math.round(economics.deliveredProfit.value).toLocaleString("en-IN")}
                        </Text>,
                        getStateBadge(economics.deliveredProfit.state),
                      ],
                    ]}
                  />

                  <Divider />

                  <Text variant="headingSm" as="h3">
                    Reverse Logistics Loss (If RTO Occurs)
                  </Text>

                  <DataTable
                    columnContentTypes={["text", "numeric", "text"]}
                    headings={["RTO Loss Component", "Loss Exposure", "Basis"]}
                    rows={[
                      ["Forward Shipping (Lost)", `-₹${Math.round(economics.forwardShipping.value)}`, "Freight"],
                      ["Return Reverse Freight", `-₹${Math.round(economics.returnShipping.value)}`, "Courier"],
                      ["Packaging Material Lost", `-₹${Math.round(economics.packaging.value)}`, "Damage"],
                      [
                        <Text variant="bodyMd" fontWeight="bold" as="span" key="rto-lbl">
                          = Total RTO Loss Exposure
                        </Text>,
                        <Text variant="bodyMd" fontWeight="bold" tone="critical" as="span" key="rto-val">
                          -₹{Math.round(economics.rtoLossExposure.value).toLocaleString("en-IN")}
                        </Text>,
                        <Badge tone="critical" key="rto-b">EXPOSURE</Badge>,
                      ],
                    ]}
                  />
                </BlockStack>
              </Card>

              {/* SECTION 5: TRUTHFUL EXECUTION TIMELINE */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">
                      Truthful Execution Timeline
                    </Text>
                    <Badge>{`${executionLogs.length} Events Persisted`}</Badge>
                  </InlineStack>

                  {executionLogs.length === 0 ? (
                    <EmptyState
                      heading="No execution logs for this order"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>Pipeline logs will appear here when webhook evaluation triggers.</p>
                    </EmptyState>
                  ) : (
                    <BlockStack gap="200">
                      {executionLogs.map((log) => (
                        <Box
                          key={log.id}
                          padding="300"
                          background="bg-surface-secondary"
                          borderRadius="150"
                        >
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="050">
                              <InlineStack gap="150" blockAlign="center">
                                <Text variant="bodySm" fontWeight="bold" as="span">
                                  {log.step}
                                </Text>
                                {getStatusBadge(log.status)}
                              </InlineStack>
                              <Text variant="bodySm" tone="subdued" as="p">
                                {log.message || "Step processed"}
                              </Text>
                            </BlockStack>
                            <Text variant="bodyXs" tone="subdued" as="span">
                              {new Date(log.createdAt).toLocaleTimeString()}
                            </Text>
                          </InlineStack>
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Right Sidebar (30%) */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Order Info Card */}
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">
                    Order Details
                  </Text>
                  <Divider />
                  <InlineStack align="space-between">
                    <Text variant="bodyXs" tone="subdued" as="span">Order #</Text>
                    <Text variant="bodySm" fontWeight="bold" as="span">#{order.orderNumber}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text variant="bodyXs" tone="subdued" as="span">Customer</Text>
                    <Text variant="bodySm" as="span">{order.customerName || "N/A"}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text variant="bodyXs" tone="subdued" as="span">Payment</Text>
                    <Badge tone={order.isCOD ? "attention" : "info"}>{order.gateway || (order.isCOD ? "COD" : "Prepaid")}</Badge>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text variant="bodyXs" tone="subdued" as="span">Created</Text>
                    <Text variant="bodySm" as="span">{new Date(order.createdAt).toLocaleDateString()}</Text>
                  </InlineStack>
                </BlockStack>
              </Card>

              {/* Line Items Card */}
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">
                    Line Items ({order.lineItems.length})
                  </Text>
                  <Divider />
                  {order.lineItems.map((item) => (
                    <Box key={item.id} padding="100">
                      <InlineStack align="space-between">
                        <BlockStack gap="025">
                          <Text variant="bodySm" fontWeight="semibold" as="span">
                            {item.title}
                          </Text>
                          <Text variant="bodyXs" tone="subdued" as="span">
                            Qty: {item.quantity} × ₹{item.unitPrice}
                          </Text>
                        </BlockStack>
                        <Text variant="bodySm" fontWeight="bold" as="span">
                          ₹{Math.round(item.quantity * item.unitPrice).toLocaleString("en-IN")}
                        </Text>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              </Card>

              {/* Actions Card */}
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">
                    Merchant Actions
                  </Text>
                  <Divider />
                  <Button fullWidth onClick={() => setIsOverrideModalOpen(true)}>
                    Override Recommendation
                  </Button>
                  <Button fullWidth variant="plain" onClick={() => navigate(`/app/operations?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`)}>
                    Back to Operations Queue
                  </Button>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {/* Override Modal */}
      <Modal
        open={isOverrideModalOpen}
        onClose={() => setIsOverrideModalOpen(false)}
        title={`Override Decision for #${order.orderNumber}`}
        primaryAction={{
          content: "Save Override",
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
            <Banner tone="warning">
              <Text variant="bodySm" as="p">
                Original ProfitRx Recommendation: <strong>{intelligence.decision}</strong>.
                Manual overrides are recorded in the audit trail and used for learning model refinement.
              </Text>
            </Banner>

            <Select
              label="New Decision"
              options={[
                { label: "Allow COD (Fulfill Normally)", value: "ALLOW_COD" },
                { label: "Require OTP Verification", value: "OTP_VERIFY" },
                { label: "Require Prepaid Payment", value: "PREPAID_ONLY" },
                { label: "Block COD (Tag Order)", value: "BLOCK_COD" },
              ]}
              value={overrideAction}
              onChange={setOverrideAction}
            />

            <TextField
              label="Reason for Override"
              value={overrideReason}
              onChange={setOverrideReason}
              placeholder="e.g. Customer verified address and intent via phone call"
              autoComplete="off"
              multiline={3}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
