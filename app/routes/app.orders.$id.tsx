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
  const url = new URL(request.url);
  const isPreview = url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true";
  const host = url.searchParams.get("host") || "";
  const orderId = params.id;

  if (isPreview) {
    return {
      order: {
        id: orderId || "849201",
        orderNumber: 1042,
        totalPrice: 2499,
        subtotalPrice: 2400,
        totalTax: 99,
        shippingPrice: 0,
        discountAmount: 0,
        isCOD: true,
        gateway: "Cash on Delivery",
        financialStatus: "pending",
        fulfillmentStatus: "unfulfilled",
        channelAttribution: "Website",
        customerName: "Priya Sharma",
        customerEmail: "priya.sharma@example.com",
        city: "Meerut",
        province: "Uttar Pradesh",
        pincode: "250001",
        createdAt: new Date().toISOString(),
        cogsAtTimeOfOrder: 1200,
        riskScore: 78,
        riskLevel: "HIGH",
        riskReasons: [
          { reason: "High historical RTO rate (42%) in Meerut 250001", impact: 45 },
          { reason: "Customer has 1 previous returned order", impact: 33 },
        ],
        merchantRecommendation: "Send WhatsApp OTP to verify customer commitment before dispatch.",
        protectionMode: "BALANCED",
        executionStatus: "PENDING_REVIEW",
        lineItems: [
          {
            id: "li-1",
            shopifyLineItemId: "sli-1",
            productId: "prod-1",
            title: "Matte Velvet Lipstick (Ruby Red)",
            variantTitle: "Ruby Red / 3.5g",
            quantity: 2,
            unitPrice: 999,
          },
          {
            id: "li-2",
            shopifyLineItemId: "sli-2",
            productId: "prod-2",
            title: "Hydrating Primer (50ml)",
            variantTitle: "50ml",
            quantity: 1,
            unitPrice: 501,
          },
        ],
      },
      intelligence: {
        riskScore: 78,
        riskLevel: "HIGH",
        riskReasons: [
          { reason: "High historical RTO rate (42%) in Meerut 250001", impact: 45 },
          { reason: "Customer has 1 previous returned order", impact: 33 },
        ],
        decision: "REQUIRE_OTP",
        expectedValue: -140,
        hasRealCogs: true,
        cogsUsed: 1200,
        forwardShipping: 90,
        returnShipping: 180,
        profitIfDelivered: 820,
        lossIfRto: 180,
        evidenceQuality: 92,
        economicJustification: "OTP verification is economically justified to prevent ₹180 reverse courier loss.",
        protectionMode: "BALANCED",
        executionStatus: "PENDING_REVIEW",
      },
      economics: {
        revenue: { value: 2499, state: "ACTUAL", source: "Shopify Order" },
        customerPaidShipping: { value: 0, state: "ACTUAL", source: "Free Shipping" },
        tax: { value: 99, state: "ACTUAL", source: "GST 5%" },
        cogs: { value: 1200, state: "ESTIMATED", source: "COGS Catalog" },
        forwardShipping: { value: 90, state: "ESTIMATED", source: "Courier Default" },
        returnShipping: { value: 180, state: "ESTIMATED", source: "Courier RTO Rate" },
        packaging: { value: 15, state: "ESTIMATED", source: "Store Settings" },
        codFee: { value: 40, state: "ESTIMATED", source: "Payment Gateway" },
        gatewayFee: { value: 0, state: "ACTUAL", source: "COD" },
        deliveredProfit: { value: 820, state: "PROJECTED", source: "Calculated" },
        rtoLossExposure: { value: 180, state: "PROJECTED", source: "Calculated" },
        expectedValue: { value: -140, state: "ACTUARIAL", source: "Risk Weighted" },
        expectedROI: { value: -5.6, state: "PROJECTED", source: "Calculated" },
        expectedLoss: { value: 140, state: "PROJECTED", source: "Calculated" },
        deliveryProbability: 0.22,
        rtoProbability: 0.78,
        dataCompleteness: {
          hasActualCogs: true,
          hasActualShipping: true,
          hasWeight: true,
          warnings: [],
        },
      },
      evidence: {
        addressScore: 85,
        hasRealCogs: true,
        cogsSource: "COGS Catalog",
        shippingSource: "Courier Rate Card",
        pincode: "250001",
        province: "Uttar Pradesh",
        city: "Meerut",
      },
      executionLogs: [
        {
          id: "log-1",
          step: "ORDER_EVALUATED",
          status: "SUCCESS",
          message: "Risk score calculated: 78 (High). Action recommended: REQUIRE_OTP.",
          createdAt: new Date().toISOString(),
        },
      ],
      overrideHistory: [],
      learningRecords: [],
      decisionCard: {
        order: {
          id: orderId || "849201",
          orderNumber: 1042,
          totalPrice: 2499,
          subtotalPrice: 2400,
          totalTax: 99,
          shippingPrice: 0,
          isCOD: true,
          gateway: "Cash on Delivery",
          fulfillmentStatus: "unfulfilled",
          financialStatus: "pending",
          customerName: "Priya Sharma",
          city: "Meerut",
          province: "Uttar Pradesh",
          pincode: "250001",
          createdAt: new Date().toISOString(),
          currency: "INR",
        },
        economics: {
          grossOrderValue: 2499,
          customerPaidShipping: 0,
          tax: 99,
          cogs: 1200,
          cogsState: "ESTIMATED",
          cogsSource: "COGS Catalog",
          forwardShipping: 90,
          returnShipping: 180,
          packaging: 15,
          codFee: 40,
          gatewayFee: 0,
          deliveredContribution: 820,
          rtoLossExposure: 180,
          expectedContribution: -140,
          expectedContributionState: "ACTUARIAL",
          currency: "INR",
          currencyMatch: true,
          dataCompleteness: {
            hasActualCogs: true,
            hasActualShipping: true,
            hasWeight: true,
            currencyMatch: true,
            warnings: [],
          },
        },
        risk: {
          riskScore: 78,
          riskBand: "HIGH" as const,
          confidence: 92,
          customerSignals: {
            totalOrders: 2,
            successfulDeliveries: 1,
            rtoCount: 1,
            isRepeatCustomer: true,
            hasDeliveryTrackRecord: true,
          },
          pincodeHistory: {
            pincode: "250001",
            city: "Meerut",
            province: "Uttar Pradesh",
            rtoRate: 42,
            totalOrders: 145,
            isBlocked: false,
          },
          riskFactors: [
            { key: "pincode_risk", contribution: 45, explanation: "42% RTO return rate in Meerut 250001" },
            { key: "customer_refusal", contribution: 33, explanation: "1 previous delivery refusal on file" },
          ],
          primaryReason: "High RTO risk in Meerut and prior customer delivery return",
          isFlagged: true,
        },
        recommendation: {
          action: "VERIFY" as const,
          actionLabel: "Send WhatsApp OTP",
          tone: "warning" as const,
          explanation: "Buyer has a previous return in a high-RTO delivery zone.",
          economicJustification: "Sending WhatsApp OTP avoids ~₹180 reverse courier freight exposure on high return risk.",
        },
        decisionState: {
          initialRecommendation: "VERIFY",
          currentAction: "REQUIRE_OTP",
          isOverridden: false,
          executionStatus: "PENDING_REVIEW",
          decisionDate: new Date().toISOString(),
        },
      },
      settings: {
        protectionMode: "BALANCED",
      },
      shop: "glam-aura-india.myshopify.com",
      host: host || Buffer.from("admin.shopify.com/store/glam-aura-india").toString("base64"),
    };
  }

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

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
        content: "Orders to Check",
        onAction: () => navigate(`/app/operations?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`),
      }}
      title={`Order Check: #${order.orderNumber}`}
      subtitle="Estimated net profit and courier return risk check for this order."
      compactTitle
      titleMetadata={
        <InlineStack gap="200" blockAlign="center">
          <Badge tone={order.isCOD ? "attention" : "success"}>{order.isCOD ? "COD Order" : "Prepaid"}</Badge>
          <Badge tone={riskTone}>{`${intelligence.riskLevel === "HIGH" ? "High Return Risk" : intelligence.riskLevel === "CRITICAL" ? "Very High Risk" : "Safe"}`}</Badge>
          {getStatusBadge(order.executionStatus)}
        </InlineStack>
      }
      primaryAction={{
        content: "Change Action",
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
          <Banner tone="info" title="Merchant Action Override Active">
            <BlockStack gap="100">
              {overrideHistory.map((h, i) => (
                <Text variant="bodySm" as="p" key={i}>
                  Changed from <strong>{h.previousDecision}</strong> to <strong>{h.newDecision}</strong> by {h.actor} on{" "}
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
                <strong>Cost Notice:</strong>{" "}
                {!economics.dataCompleteness.hasActualCogs &&
                  "Profit is calculated using default cost % because this item has no making/buying price in Product Costs. "}
                {!economics.dataCompleteness.hasActualShipping &&
                  "Shipping cost is based on standard freight rates."}
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

              {/* Execution Timeline */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">
                      What ProfitRx Did With This Order
                    </Text>
                    <Badge>{`${executionLogs.length} Events`}</Badge>
                  </InlineStack>

                  {executionLogs.length === 0 ? (
                    <EmptyState
                      heading="No check logs for this order"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>Activity logs will appear here when an incoming order is verified.</p>
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
                    Items ({order.lineItems.length})
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
                    Change What to Do with Order
                  </Button>
                  <Button fullWidth variant="plain" onClick={() => navigate(`/app/operations?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`)}>
                    Back to Orders to Check
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
        title={`Change What to Do for #${order.orderNumber}`}
        primaryAction={{
          content: "Save Action",
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
              <Text variant="bodySm" as="p">
                ProfitRx Recommended Action: <strong>{intelligence.decision === "REQUIRE_OTP" || intelligence.decision === "OTP_VERIFY" ? "Confirm WhatsApp" : intelligence.decision === "ALLOW_COD" ? "Allow Normal COD" : intelligence.decision}</strong>.
              </Text>
            </Banner>

            <Select
              label="Select Action"
              options={[
                { label: "Allow COD — Ship normally", value: "ALLOW_COD" },
                { label: "Send WhatsApp / SMS OTP verification code", value: "OTP_VERIFY" },
                { label: "Ask for advance UPI deposit", value: "PARTIAL_PAYMENT" },
                { label: "Require full prepaid payment", value: "PREPAID_ONLY" },
                { label: "Hold / Block order (Do not dispatch)", value: "BLOCK_COD" },
              ]}
              value={overrideAction}
              onChange={setOverrideAction}
              helpText={
                overrideAction === "OTP_VERIFY"
                  ? "Sends a 6-digit confirmation code via WhatsApp to confirm the buyer really wants the item."
                  : overrideAction === "PARTIAL_PAYMENT"
                  ? "Asks for a ₹100-₹200 UPI advance deposit before dispatching."
                  : undefined
              }
            />

            <TextField
              label="Why are you making this change?"
              value={overrideReason}
              onChange={setOverrideReason}
              placeholder="e.g. Called customer on phone, confirmed they are ready with cash"
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
  let errorMessage = "An unexpected error occurred while checking this order.";
  let isNotFound = false;

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      isNotFound = true;
      errorMessage = "The requested order could not be found or does not belong to this store.";
    } else {
      errorMessage = `${error.status} ${error.statusText}: ${error.data}`;
    }
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page
      title={isNotFound ? "Order Not Found" : "Order Check Error"}
      backAction={{ content: "Back to Orders to Check", onAction: () => navigate("/app/operations") }}
    >
      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <Banner tone={isNotFound ? "warning" : "critical"} title={isNotFound ? "Order Not Found" : "Failed to Load Order Check"}>
              <p>{errorMessage}</p>
            </Banner>
            <InlineStack gap="200">
              <Button variant="primary" onClick={() => navigate("/app/operations")}>
                Return to Orders to Check
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
