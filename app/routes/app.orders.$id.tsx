import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSubmit, useNavigation, useActionData, redirect, useRouteError, isRouteErrorResponse } from "react-router";
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
import { AuditLogService } from "../services/compliance/audit-log.service";
import { OrderDecisionCard } from "../components/decision/OrderDecisionCard";


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

  const meta = AuditLogService.extractRequestMeta(request);
  AuditLogService.logAccess({
    shop,
    actor: (session as any).accountOwner ? "merchant_owner" : "merchant_staff",
    resource: "ORDER_DETAIL_VIEW",
    resourceId: orderId,
    action: "VIEW",
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

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
  const initialOverride = intelligence.decision === "OTP_VERIFY" ? "BLOCK_COD" : (intelligence.decision || "ALLOW_COD");
  const [overrideAction, setOverrideAction] = useState(initialOverride);
  const [overrideReason, setOverrideReason] = useState("");

  const riskScore = intelligence.riskScore;
  let riskTone: "success" | "warning" | "critical" = "success";
  if (riskScore >= 50) riskTone = "critical";
  else if (riskScore >= 30) riskTone = "warning";

  const handleCustomOverride = (act: string, rsn: string) => {
    const formData = new FormData();
    formData.append("intent", "override_decision");
    formData.append("action", act);
    formData.append("reason", rsn);
    submit(formData, { method: "post" });
  };

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
              {data.decisionCard && (
                <OrderDecisionCard
                  decision={data.decisionCard}
                  onOverrideAction={handleCustomOverride}
                  isSubmitting={isSubmitting}
                />
              )}

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
                { label: "Dispatch WhatsApp/SMS OTP Verification", value: "OTP_VERIFY" },
                { label: "Require Partial Payment / Upfront Deposit", value: "PARTIAL_PAYMENT" },
                { label: "Require Full Prepaid Payment", value: "PREPAID_ONLY" },
                { label: "Block COD (Hold/Cancel Order)", value: "BLOCK_COD" },
              ]}
              value={overrideAction}
              onChange={setOverrideAction}
              helpText={
                overrideAction === "OTP_VERIFY"
                  ? "Dispatches a live 6-digit confirmation challenge via WhatsApp or SMS."
                  : overrideAction === "PARTIAL_PAYMENT"
                  ? "Requires an advance deposit via UPI before fulfillment."
                  : undefined
              }
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

export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  let errorMessage = "An unexpected error occurred while loading order intelligence.";
  let isNotFound = false;

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      isNotFound = true;
      errorMessage = "The requested order could not be found or does not belong to this shop.";
    } else {
      errorMessage = `${error.status} ${error.statusText}: ${error.data}`;
    }
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page
      title={isNotFound ? "Order Not Found" : "Order Intelligence Error"}
      backAction={{ content: "Back to Operations", onAction: () => navigate("/app/operations") }}
    >
      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <Banner tone={isNotFound ? "warning" : "critical"} title={isNotFound ? "Order Not Found" : "Failed to Load Order Intelligence"}>
              <p>{errorMessage}</p>
            </Banner>
            <InlineStack gap="200">
              <Button variant="primary" onClick={() => navigate("/app/operations")}>
                Return to Operations Queue
              </Button>
              {!isNotFound && (
                <Button onClick={() => window.location.reload()}>Retry</Button>
              )}
            </InlineStack>
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}
