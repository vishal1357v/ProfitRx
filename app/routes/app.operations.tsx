import { useState, useMemo } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSubmit, useNavigation, useActionData, useRevalidator, useRouteError, isRouteErrorResponse } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  DataTable,
  Tabs,
  Box,
  Button,
  Banner,
  EmptyState,
  TextField,
  Select,
  ButtonGroup,
  Modal,
  Tooltip,
  Icon,
  Divider,
} from "@shopify/polaris";
import {
  SearchIcon,
  AlertBubbleIcon,
  CheckIcon,
  InfoIcon,
  ShieldCheckMarkIcon,
  ViewIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { OperationsApplicationService, OperationOrderDTO } from "../application/operations/operations.application";
import { AuditLogService } from "../services/compliance/audit-log.service";

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const isPreview = url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true";

  if (isPreview) {
    const shop = "glam-aura-india.myshopify.com";
    const host = Buffer.from(`admin.shopify.com/store/glam-aura-india`).toString("base64");
    const demoOrders: OperationOrderDTO[] = [
      {
        id: "gid://shopify/Order/849201",
        orderNumber: 1482,
        totalPrice: 6499,
        isCOD: true,
        gateway: "Cash on Delivery",
        financialStatus: "pending",
        fulfillmentStatus: "unfulfilled",
        customerName: "Pooja Sharma",
        city: "Siwan",
        province: "Bihar",
        pincode: "841301",
        riskScore: 78,
        riskLevel: "HIGH",
        confidence: 88,
        merchantRecommendation: "FORCE_PREPAID",
        protectionMode: "ACTIVE_INTERVENTION",
        executionStatus: "INTERVENED",
        expectedProfit: 1650,
        expectedProfitState: "CONFIRMED",
        rtoExposure: 1420,
        rtoExposureState: "AT_RISK",
        expectedValue: 1240,
        hasRealCogs: true,
        needsAttention: true,
        attentionReason: "Cart amount ₹6,499 exceeds COD threshold (₹5,000) & high-RTO pincode",
        createdAt: new Date().toISOString(),
        age: "8m ago",
      },
      {
        id: "gid://shopify/Order/849195",
        orderNumber: 1481,
        totalPrice: 2250,
        isCOD: true,
        gateway: "Cash on Delivery",
        financialStatus: "pending",
        fulfillmentStatus: "unfulfilled",
        customerName: "Rahul Verma",
        city: "Noida",
        province: "Uttar Pradesh",
        pincode: "201301",
        riskScore: 48,
        riskLevel: "MEDIUM",
        confidence: 72,
        merchantRecommendation: "OTP_VERIFY",
        protectionMode: "ACTIVE_INTERVENTION",
        executionStatus: "CONFIRMED",
        expectedProfit: 620,
        expectedProfitState: "CONFIRMED",
        rtoExposure: 450,
        rtoExposureState: "MONITORED",
        expectedValue: 370,
        hasRealCogs: true,
        needsAttention: false,
        attentionReason: null,
        createdAt: new Date(Date.now() - 24 * 60 * 1000).toISOString(),
        age: "24m ago",
      },
      {
        id: "gid://shopify/Order/849182",
        orderNumber: 1480,
        totalPrice: 3890,
        isCOD: false,
        gateway: "Razorpay (UPI)",
        financialStatus: "paid",
        fulfillmentStatus: "unfulfilled",
        customerName: "Sneha Patel",
        city: "Ahmedabad",
        province: "Gujarat",
        pincode: "380015",
        riskScore: 12,
        riskLevel: "LOW",
        confidence: 95,
        merchantRecommendation: "ALLOW_PREPAID",
        protectionMode: "ACTIVE_INTERVENTION",
        executionStatus: "CONFIRMED",
        expectedProfit: 1120,
        expectedProfitState: "CONFIRMED",
        rtoExposure: 0,
        rtoExposureState: "SAFE",
        expectedValue: 1120,
        hasRealCogs: true,
        needsAttention: false,
        attentionReason: null,
        createdAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
        age: "42m ago",
      },
    ];

    return {
      shop,
      host,
      orders: demoOrders,
      actionQueue: [demoOrders[0]],
      codVerifications: [
        {
          id: "ver-1",
          orderId: "gid://shopify/Order/849195",
          orderNumber: 1481,
          phone: "+91 98111 22334",
          channel: "WHATSAPP",
          status: "VERIFIED",
          attempts: 1,
          verifiedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          createdAt: new Date(Date.now() - 24 * 60 * 1000).toISOString(),
        },
      ],
      executionLogs: [
        {
          id: "log-1",
          orderId: "gid://shopify/Order/849201",
          action: "FORCE_PREPAID",
          status: "SUCCESS",
          details: "COD hidden; payment link sent via WhatsApp",
          createdAt: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
        },
      ],
      protectionMode: "ACTIVE_INTERVENTION",
      summary: {
        totalOrders: 1420,
        totalCodOrders: 740,
        needsAttentionCount: 1,
        atRiskCodCount: 24,
        atRiskCodExposure: 42600,
        failedActionCount: 0,
        pendingReviewCount: 1,
      },
      decisionSummary: {
        totalReviewed: 1420,
        acceptedCount: 1380,
        overriddenCount: 40,
        deliveredCount: 1120,
        rtoCount: 180,
        cancelledCount: 120,
        actualRtoLoss: 25200,
        totalDeliveredProfit: 345000,
        totalVerifiedSavings: 18400,
        estimatedEVTotal: 310000,
        realizedProfitTotal: 319800,
      },
    };
  }

  const { session } = await authenticate.admin(request);
  const host = url.searchParams.get("host") || "";

  const meta = AuditLogService.extractRequestMeta(request);
  AuditLogService.logAccess({
    shop: session.shop,
    actor: (session as any).accountOwner ? "merchant_owner" : "merchant_staff",
    resource: "OPERATIONS_VIEW",
    action: "VIEW",
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  const data = await OperationsApplicationService.getOperationsData(session.shop);
  return { shop: session.shop, host, ...data };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true") {
    return Response.json({ success: true, message: "Demo mode: Action simulated successfully." });
  }
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "apply_action") {
    const orderId = formData.get("orderId") as string;
    const orderAction = formData.get("action") as string;
    const reason = (formData.get("reason") as string) || "Operations review action";
    const result = await OperationsApplicationService.applyOrderAction(shop, orderId, orderAction, reason);
    return Response.json(result);
  }

  return Response.json({ success: false, error: "Invalid intent" }, { status: 400 });
};

export default function OperationsRoute() {
  const {
    orders = [],
    actionQueue = [],
    codVerifications = [],
    executionLogs = [],
    protectionMode = "OBSERVE",
    summary,
    decisionSummary,
    shop,
    host,
  } = useLoaderData<typeof loader>();

  const actionData = useActionData() as any;
  const [selectedTab, setSelectedTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [recFilter, setRecFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [missingCogsOnly, setMissingCogsOnly] = useState(false);

  // Quick Action Modal State
  const [activeModalOrder, setActiveModalOrder] = useState<OperationOrderDTO | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>("ALLOW_COD");
  const [actionReason, setActionReason] = useState<string>("");

  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const revalidator = useRevalidator();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success: boolean; message: string } | null>(null);

  const handleSyncOrders = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const res = await fetch("/api/sync-orders", { method: "POST" });
      const resData = await res.json();
      if (res.ok && resData.success) {
        const msg = resData.message || `Synced ${resData.ordersFound ?? resData.count ?? 0} orders (${resData.ordersImported || 0} imported, ${resData.ordersUpdated || 0} updated).`;
        setSyncStatus({ success: true, message: `✅ ${msg}` });
        revalidator.revalidate();
      } else {
        throw new Error(resData.error || "Order sync failed");
      }
    } catch (e: any) {
      setSyncStatus({ success: false, message: e?.message || "Failed to sync orders" });
    } finally {
      setIsSyncing(false);
    }
  };

  const tabs = [
    {
      id: "needs-attention",
      content: `Needs Attention (${actionQueue.length})`,
      accessibilityLabel: "Needs Attention",
      panelID: "needs-attention-panel",
    },
    {
      id: "all-orders",
      content: `All Orders (${orders.length})`,
      accessibilityLabel: "All Orders",
      panelID: "all-orders-panel",
    },
    {
      id: "cod-verifications",
      content: `COD Verifications (${codVerifications.length})`,
      panelID: "cod-verifications-panel",
    },
    {
      id: "execution-activity",
      content: `Execution Activity (${executionLogs.length})`,
      panelID: "execution-activity-panel",
    },
  ];

  const handleOpenActionModal = (order: OperationOrderDTO, defaultAction?: string) => {
    setActiveModalOrder(order);
    const initialAction = defaultAction || order.merchantRecommendation || "ALLOW_COD";
    setSelectedAction(initialAction);
    setActionReason("");
  };

  const handleConfirmAction = () => {
    if (!activeModalOrder) return;
    const formData = new FormData();
    formData.append("intent", "apply_action");
    formData.append("orderId", activeModalOrder.id);
    formData.append("action", selectedAction);
    formData.append("reason", actionReason || `Merchant review: ${selectedAction}`);
    submit(formData, { method: "post" });
    setActiveModalOrder(null);
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case "LOW":
        return <Badge tone="success">Low Risk</Badge>;
      case "MEDIUM":
        return <Badge tone="warning">Medium</Badge>;
      case "HIGH":
        return <Badge tone="critical">High Risk</Badge>;
      case "CRITICAL":
        return <Badge tone="critical">Critical</Badge>;
      default:
        return <Badge>Unknown</Badge>;
    }
  };

  const getExecutionBadge = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return <Badge tone="success">Success</Badge>;
      case "PENDING_MERCHANT_REVIEW":
        return <Badge tone="warning">Needs Review</Badge>;
      case "ADVISORY_ONLY":
        return <Badge tone="info">Advisory Only</Badge>;
      case "FAILED":
        return <Badge tone="critical">Failed</Badge>;
      case "RETRYING":
        return <Badge tone="attention">Retrying</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getRecommendationBadge = (rec: string) => {
    switch (rec) {
      case "ALLOW_COD":
        return <Badge tone="success">Allow COD</Badge>;
      case "OTP_VERIFY":
        return <Badge tone="attention">OTP Verify</Badge>;
      case "PREPAID_ONLY":
        return <Badge tone="warning">Require Prepaid</Badge>;
      case "BLOCK_COD":
        return <Badge tone="critical">Block COD</Badge>;
      case "REVIEW":
        return <Badge tone="info">Review</Badge>;
      default:
        return <Badge>{rec}</Badge>;
    }
  };

  // Filter Active Order List
  const activeOrderList = selectedTab === 0 ? actionQueue : orders;

  const filteredOrders = useMemo(() => {
    return activeOrderList.filter((o) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchesNumber = String(o.orderNumber).includes(q);
        const matchesCustomer = (o.customerName || "").toLowerCase().includes(q);
        const matchesPincode = (o.pincode || "").includes(q);
        const matchesCity = (o.city || "").toLowerCase().includes(q);
        if (!matchesNumber && !matchesCustomer && !matchesPincode && !matchesCity) {
          return false;
        }
      }

      if (riskFilter !== "ALL" && o.riskLevel !== riskFilter) return false;
      if (recFilter !== "ALL" && o.merchantRecommendation !== recFilter) return false;
      if (statusFilter !== "ALL" && o.executionStatus !== statusFilter) return false;
      if (paymentFilter === "COD" && !o.isCOD) return false;
      if (paymentFilter === "PREPAID" && o.isCOD) return false;
      if (missingCogsOnly && o.hasRealCogs) return false;

      return true;
    });
  }, [activeOrderList, searchQuery, riskFilter, recFilter, statusFilter, paymentFilter, missingCogsOnly]);

  const renderOrderRows = (ordersToRender: OperationOrderDTO[]) => {
    return ordersToRender.map((order) => {
      const cleanId = String(order.id).replace("gid://shopify/Order/", "");
      const inspectUrl = `/app/orders/${encodeURIComponent(cleanId)}?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;

      return [
        // 1. Order
        <BlockStack gap="050" key={`${order.id}-num`}>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            #{order.orderNumber}
          </Text>
          <Text variant="bodyXs" tone="subdued" as="span">
            {order.age}
          </Text>
        </BlockStack>,

        // 2. Customer
        <BlockStack gap="050" key={`${order.id}-cust`}>
          <Text variant="bodySm" fontWeight="semibold" as="span">
            {order.customerName || "Customer"}
          </Text>
          <Text variant="bodyXs" tone="subdued" as="span">
            {order.city ? `${order.city}, ${order.pincode || ""}` : order.pincode || "Location N/A"}
          </Text>
        </BlockStack>,

        // 3. Payment
        <Box key={`${order.id}-pay`}>
          {order.isCOD ? <Badge tone="attention">COD</Badge> : <Badge tone="info">Prepaid</Badge>}
        </Box>,

        // 4. Order Value
        <Text variant="bodyMd" fontWeight="semibold" as="span" key={`${order.id}-val`}>
          ₹{Math.round(order.totalPrice).toLocaleString("en-IN")}
        </Text>,

        // 5. Expected Profit
        <BlockStack gap="050" key={`${order.id}-profit`}>
          <Text
            variant="bodyMd"
            tone={order.expectedProfit >= 0 ? "success" : "critical"}
            fontWeight="bold"
            as="span"
          >
            {order.expectedProfit >= 0 ? `+₹${Math.round(order.expectedProfit)}` : `-₹${Math.abs(Math.round(order.expectedProfit))}`}
          </Text>
          <Text variant="bodyXs" tone="subdued" as="span">
            {order.expectedProfitState === "ACTUAL" ? "Actual SKU" : "Estimated"}
          </Text>
        </BlockStack>,

        // 6. RTO Exposure
        <Text variant="bodyMd" tone={order.rtoExposure > 0 ? "critical" : "subdued"} fontWeight="semibold" as="span" key={`${order.id}-rto`}>
          ₹{Math.round(order.rtoExposure).toLocaleString("en-IN")}
        </Text>,

        // 7. Risk
        <BlockStack gap="050" key={`${order.id}-risk`}>
          {getRiskBadge(order.riskLevel)}
          <Text variant="bodyXs" tone="subdued" as="span">
            {Math.round(order.riskScore)}% risk
          </Text>
        </BlockStack>,

        // 8. Confidence
        <Text variant="bodySm" tone="subdued" as="span" key={`${order.id}-conf`}>
          {Math.round(order.confidence * 100)}%
        </Text>,

        // 9. Recommendation
        <Box key={`${order.id}-rec`}>{getRecommendationBadge(order.merchantRecommendation)}</Box>,

        // 10. Protection Mode
        <Badge key={`${order.id}-mode`}>
          {order.protectionMode}
        </Badge>,

        // 11. Execution Status
        <Box key={`${order.id}-exec`}>{getExecutionBadge(order.executionStatus)}</Box>,

        // 12. Inspect & Quick Actions
        <InlineStack gap="100" wrap={false} key={`${order.id}-actions`}>
          <Button
            size="micro"
            variant="primary"
            onClick={() => navigate(inspectUrl)}
            icon={ViewIcon}
          >
            Inspect
          </Button>
          {order.needsAttention && (
            <Button
              size="micro"
              tone="critical"
              onClick={() => handleOpenActionModal(order)}
            >
              Review
            </Button>
          )}
        </InlineStack>,
      ];
    });
  };

  const renderVerificationRows = () => {
    return codVerifications.map((v: any) => {
      const cleanId = String(v.orderId).replace("gid://shopify/Order/", "");
      const inspectUrl = `/app/orders/${encodeURIComponent(cleanId)}?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;

      return [
        <Text variant="bodyMd" fontWeight="bold" as="span" key={`${v.id}-num`}>
          #{v.orderNumber || cleanId}
        </Text>,
        <span key={`${v.id}-phone`}>{v.phone || "N/A"}</span>,
        <Badge
          tone={v.status === "VERIFIED" ? "success" : v.status === "OTP_SENT" ? "attention" : undefined}
          key={`${v.id}-status`}
        >
          {v.status}
        </Badge>,
        <span key={`${v.id}-attempts`}>{v.otpAttempts || 0}</span>,
        <span key={`${v.id}-time`}>{v.otpSentAt ? new Date(v.otpSentAt).toLocaleTimeString() : "N/A"}</span>,
        <Button size="micro" onClick={() => navigate(inspectUrl)} key={`${v.id}-insp`}>
          Inspect
        </Button>,
      ];
    });
  };

  const renderActivityRows = () => {
    return executionLogs.map((log: any) => {
      const cleanId = String(log.orderId).replace("gid://shopify/Order/", "");
      const inspectUrl = `/app/orders/${encodeURIComponent(cleanId)}?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;

      return [
        <Text variant="bodyMd" fontWeight="bold" as="span" key={`${log.id}-num`}>
          #{log.order?.orderNumber || cleanId}
        </Text>,
        <Badge key={`${log.id}-step`}>
          {log.step}
        </Badge>,
        <Box key={`${log.id}-status`}>{getExecutionBadge(log.status)}</Box>,
        <Text variant="bodySm" as="span" key={`${log.id}-msg`}>
          {log.message || "Executed successfully"}
        </Text>,
        <Text variant="bodyXs" tone="subdued" as="span" key={`${log.id}-time`}>
          {new Date(log.createdAt).toLocaleString()}
        </Text>,
        <Button size="micro" onClick={() => navigate(inspectUrl)} key={`${log.id}-btn`}>
          Inspect
        </Button>,
      ];
    });
  };

  return (
    <Page
      title="Merchant Control Center"
      subtitle="Real-time COD risk evaluation, financial protection queue, and verified execution."
      compactTitle
      primaryAction={{
        content: "Sync Orders",
        loading: isSyncing,
        onAction: handleSyncOrders,
      }}
    >
      <BlockStack gap="400">
        {syncStatus && (
          <Banner tone={syncStatus.success ? "success" : "critical"} onDismiss={() => setSyncStatus(null)}>
            <p>{syncStatus.message}</p>
          </Banner>
        )}
        {actionData?.message && (
          <Banner tone={actionData.success ? "success" : "critical"}>
            <p>{actionData.message}</p>
          </Banner>
        )}

        {/* Protection Mode Indicator Banner */}
        <Banner
          tone={
            protectionMode === "OBSERVE"
              ? "info"
              : protectionMode === "REVIEW"
              ? "warning"
              : "success"
          }
        >
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="bodyMd" as="p">
              <strong>Protection Mode: {protectionMode}</strong> —{" "}
              {protectionMode === "OBSERVE" &&
                "ProfitRx evaluates order risk and EV recommendations without mutating Shopify."}
              {protectionMode === "REVIEW" &&
                "Risky COD orders are queued for your review before external action is taken."}
              {protectionMode === "AUTOMATED" &&
                "Verified actions execute automatically according to your protection rules."}
            </Text>
            <Button size="micro" onClick={() => navigate(`/app/settings?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`)}>
              Configure Mode
            </Button>
          </InlineStack>
        </Banner>

        {/* Summary Metric Cards */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <Text variant="headingSm" as="h3" tone="subdued">
                  Action Required
                </Text>
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingXl" as="p" tone={summary.needsAttentionCount > 0 ? "critical" : "success"}>
                    {summary.needsAttentionCount}
                  </Text>
                  {summary.needsAttentionCount > 0 && <Badge tone="critical">Needs Review</Badge>}
                </InlineStack>
                <Text variant="bodyXs" tone="subdued" as="p">
                  Orders requiring your review or attention
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <Text variant="headingSm" as="h3" tone="subdued">
                  At-Risk COD Exposure
                </Text>
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingXl" as="p" tone={summary.atRiskCodExposure > 0 ? "critical" : "subdued"}>
                    ₹{summary.atRiskCodExposure.toLocaleString("en-IN")}
                  </Text>
                  <Badge tone="warning">Expected Loss</Badge>
                </InlineStack>
                <Text variant="bodyXs" tone="subdued" as="p">
                  Cumulative freight & damage loss at risk
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <Text variant="headingSm" as="h3" tone="subdued">
                  Total COD Orders
                </Text>
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingXl" as="p">
                    {summary.totalCodOrders} / {summary.totalOrders}
                  </Text>
                  <Badge tone="info">
                    {summary.totalOrders > 0
                      ? `${Math.round((summary.totalCodOrders / summary.totalOrders) * 100)}% COD`
                      : "0%"}
                  </Badge>
                </InlineStack>
                <Text variant="bodyXs" tone="subdued" as="p">
                  Active order volume tracked
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Decision Engine Performance & Outcome Tracking Summary */}
        {decisionSummary && decisionSummary.totalReviewed > 0 && (
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <InlineStack gap="150" blockAlign="center">
                  <Icon source={ShieldCheckMarkIcon} tone="success" />
                  <Text variant="headingSm" as="h3">
                    Decision Engine Performance & Outcome Feedback
                  </Text>
                </InlineStack>
                <Badge tone="success">{`${decisionSummary.totalReviewed} Orders Decided`}</Badge>
              </InlineStack>
              <Divider />
              <InlineStack align="space-between" wrap>
                <Box minWidth="130px">
                  <BlockStack gap="025">
                    <Text variant="bodyXs" tone="subdued" as="span">Recommendations</Text>
                    <Text variant="bodySm" fontWeight="bold" as="p">
                      {decisionSummary.acceptedCount} Accepted / {decisionSummary.overriddenCount} Overridden
                    </Text>
                    <Text variant="bodyXs" tone="subdued" as="span">
                      {decisionSummary.totalReviewed > 0
                        ? `${Math.round((decisionSummary.acceptedCount / decisionSummary.totalReviewed) * 100)}% adherence`
                        : "0%"}
                    </Text>
                  </BlockStack>
                </Box>
                <Box minWidth="130px">
                  <BlockStack gap="025">
                    <Text variant="bodyXs" tone="subdued" as="span">Delivery vs RTO</Text>
                    <Text variant="bodySm" fontWeight="bold" as="p">
                      {decisionSummary.deliveredCount} Delivered / {decisionSummary.rtoCount} RTO
                    </Text>
                    <Text variant="bodyXs" tone="subdued" as="span">
                      {decisionSummary.deliveredCount + decisionSummary.rtoCount > 0
                        ? `${Math.round((decisionSummary.rtoCount / (decisionSummary.deliveredCount + decisionSummary.rtoCount)) * 100)}% RTO rate`
                        : "Pending outcomes"}
                    </Text>
                  </BlockStack>
                </Box>
                <Box minWidth="140px">
                  <BlockStack gap="025">
                    <Text variant="bodyXs" tone="subdued" as="span">Actual RTO Costs</Text>
                    <Text variant="bodySm" fontWeight="bold" tone="critical" as="p">
                      -₹{decisionSummary.actualRtoLoss.toLocaleString("en-IN")}
                    </Text>
                    <Text variant="bodyXs" tone="subdued" as="span">Freight & damage lost</Text>
                  </BlockStack>
                </Box>
                <Box minWidth="140px">
                  <BlockStack gap="025">
                    <Text variant="bodyXs" tone="subdued" as="span">Realized vs Estimated EV</Text>
                    <Text
                      variant="bodySm"
                      fontWeight="bold"
                      tone={decisionSummary.realizedProfitTotal >= 0 ? "success" : "critical"}
                      as="p"
                    >
                      ₹{decisionSummary.realizedProfitTotal.toLocaleString("en-IN")} / ₹{decisionSummary.estimatedEVTotal.toLocaleString("en-IN")}
                    </Text>
                    <Text variant="bodyXs" tone="subdued" as="span">Actual vs Expected</Text>
                  </BlockStack>
                </Box>
                {decisionSummary.totalVerifiedSavings > 0 && (
                  <Box minWidth="140px">
                    <BlockStack gap="025">
                      <Text variant="bodyXs" tone="subdued" as="span">Verified RTO Savings</Text>
                      <Text variant="bodySm" fontWeight="bold" tone="success" as="p">
                        +₹{decisionSummary.totalVerifiedSavings.toLocaleString("en-IN")}
                      </Text>
                      <Text variant="bodyXs" tone="subdued" as="span">Verified loss avoided</Text>
                    </BlockStack>
                  </Box>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* Tabbed Control Queue */}
        <Card padding="0">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
            <Box padding="400">
              {selectedTab <= 1 && (
                <BlockStack gap="400">
                  {/* Filters Toolbar */}
                  <InlineStack gap="300" blockAlign="center" wrap>
                    <Box minWidth="240px">
                      <TextField
                        label="Search Orders"
                        labelHidden
                        placeholder="Search by order #, customer, city, pincode..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                        prefix={<SearchIcon />}
                        autoComplete="off"
                        clearButton
                        onClearButtonClick={() => setSearchQuery("")}
                      />
                    </Box>

                    <Select
                      label="Risk"
                      labelHidden
                      options={[
                        { label: "All Risk Levels", value: "ALL" },
                        { label: "Critical Risk", value: "CRITICAL" },
                        { label: "High Risk", value: "HIGH" },
                        { label: "Medium Risk", value: "MEDIUM" },
                        { label: "Low Risk", value: "LOW" },
                      ]}
                      value={riskFilter}
                      onChange={setRiskFilter}
                    />

                    <Select
                      label="Recommendation"
                      labelHidden
                      options={[
                        { label: "All Recommendations", value: "ALL" },
                        { label: "Allow COD", value: "ALLOW_COD" },
                        { label: "OTP Verify", value: "OTP_VERIFY" },
                        { label: "Require Prepaid", value: "PREPAID_ONLY" },
                        { label: "Block COD", value: "BLOCK_COD" },
                        { label: "Review", value: "REVIEW" },
                      ]}
                      value={recFilter}
                      onChange={setRecFilter}
                    />

                    <Select
                      label="Payment"
                      labelHidden
                      options={[
                        { label: "All Payment Methods", value: "ALL" },
                        { label: "COD Only", value: "COD" },
                        { label: "Prepaid Only", value: "PREPAID" },
                      ]}
                      value={paymentFilter}
                      onChange={setPaymentFilter}
                    />

                    <Button
                      pressed={missingCogsOnly}
                      onClick={() => setMissingCogsOnly(!missingCogsOnly)}
                      size="slim"
                    >
                      Missing COGS Only
                    </Button>
                  </InlineStack>

                  {/* Primary DataTable */}
                  {filteredOrders.length === 0 ? (
                    <EmptyState
                      heading={selectedTab === 0 ? "Nothing needs attention" : "No orders found"}
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>
                        {selectedTab === 0
                          ? "All orders are evaluated and safe under current protection rules."
                          : "No orders match your filter criteria."}
                      </p>
                    </EmptyState>
                  ) : (
                    <DataTable
                      columnContentTypes={[
                        "text",
                        "text",
                        "text",
                        "numeric",
                        "numeric",
                        "numeric",
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                      ]}
                      headings={[
                        "Order",
                        "Customer",
                        "Payment",
                        "Amount",
                        "Expected Profit",
                        "RTO Exposure",
                        "Risk",
                        "Confidence",
                        "Recommendation",
                        "Mode",
                        "Status",
                        "Action",
                      ]}
                      rows={renderOrderRows(filteredOrders)}
                    />
                  )}
                </BlockStack>
              )}

              {/* COD Verifications Tab */}
              {selectedTab === 2 && (
                <BlockStack gap="400">
                  {codVerifications.length === 0 ? (
                    <EmptyState
                      heading="No COD verification records"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>No OTP or deposit verification flows have been triggered yet.</p>
                    </EmptyState>
                  ) : (
                    <DataTable
                      columnContentTypes={["text", "text", "text", "numeric", "text", "text"]}
                      headings={["Order", "Phone", "Status", "Attempts", "Sent At", "Inspect"]}
                      rows={renderVerificationRows()}
                    />
                  )}
                </BlockStack>
              )}

              {/* Execution Activity Tab */}
              {selectedTab === 3 && (
                <BlockStack gap="400">
                  {executionLogs.length === 0 ? (
                    <EmptyState
                      heading="No execution activity recorded"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>Execution logs will appear here as webhooks and protection decisions run.</p>
                    </EmptyState>
                  ) : (
                    <DataTable
                      columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                      headings={["Order", "Pipeline Step", "Execution Status", "Message", "Timestamp", "Inspect"]}
                      rows={renderActivityRows()}
                    />
                  )}
                </BlockStack>
              )}
            </Box>
          </Tabs>
        </Card>
      </BlockStack>

      {/* Review Action Modal */}
      <Modal
        open={Boolean(activeModalOrder)}
        onClose={() => setActiveModalOrder(null)}
        title={`Review Order #${activeModalOrder?.orderNumber}`}
        primaryAction={{
          content: "Apply Decision",
          onAction: handleConfirmAction,
          loading: isSubmitting,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setActiveModalOrder(null),
          },
        ]}
      >
        <Modal.Section>
          {activeModalOrder && (
            <BlockStack gap="400">
              <Banner tone="info">
                <BlockStack gap="100">
                  <Text variant="bodyMd" as="p">
                    ProfitRx Recommended Action: <strong>{activeModalOrder.merchantRecommendation}</strong>.
                  </Text>
                  {activeModalOrder.attentionReason && (
                    <Text variant="bodySm" as="p">
                      <strong>Flagged Reason:</strong> {activeModalOrder.attentionReason}
                    </Text>
                  )}
                </BlockStack>
              </Banner>

              {/* Economic Summary Box */}
              <Box padding="300" background="bg-surface-secondary" borderRadius="150">
                <BlockStack gap="150">
                  <Text variant="bodyXs" fontWeight="bold" tone="subdued" as="span">
                    ORDER DECISION ECONOMICS
                  </Text>
                  <InlineStack align="space-between">
                    <Text variant="bodySm" as="span">Gross Order Value:</Text>
                    <Text variant="bodySm" fontWeight="semibold" as="span">₹{Math.round(activeModalOrder.totalPrice).toLocaleString("en-IN")}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text variant="bodySm" as="span">Estimated Contribution if Delivered:</Text>
                    <Text variant="bodySm" fontWeight="semibold" tone="success" as="span">+₹{Math.round(activeModalOrder.expectedProfit).toLocaleString("en-IN")}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text variant="bodySm" as="span">Financial Exposure if Returned (RTO):</Text>
                    <Text variant="bodySm" fontWeight="semibold" tone="critical" as="span">-₹{Math.round(activeModalOrder.rtoExposure).toLocaleString("en-IN")}</Text>
                  </InlineStack>
                  <Divider />
                  <InlineStack align="space-between">
                    <Text variant="bodySm" fontWeight="bold" as="span">Net Expected Payoff ($EV$):</Text>
                    <Text variant="bodySm" fontWeight="bold" tone={activeModalOrder.expectedValue >= 0 ? "success" : "critical"} as="span">
                      {activeModalOrder.expectedValue >= 0 ? "+₹" : "-₹"}
                      {Math.abs(Math.round(activeModalOrder.expectedValue)).toLocaleString("en-IN")}
                    </Text>
                  </InlineStack>
                </BlockStack>
              </Box>

              <Select
                label="Selected Decision Action"
                options={[
                  { label: "Allow COD (Fulfill Normally)", value: "ALLOW_COD" },
                  { label: "Dispatch WhatsApp/SMS OTP Verification", value: "OTP_VERIFY" },
                  { label: "Require Partial Payment / Upfront Deposit", value: "PARTIAL_PAYMENT" },
                  { label: "Require Full Prepaid Payment", value: "PREPAID_ONLY" },
                  { label: "Block COD (Hold/Cancel Order)", value: "BLOCK_COD" },
                ]}
                value={selectedAction}
                onChange={setSelectedAction}
                helpText={
                  selectedAction === "OTP_VERIFY"
                    ? "Dispatches a live 6-digit confirmation challenge via WhatsApp or SMS (~₹10 estimated verification cost)."
                    : selectedAction === "PARTIAL_PAYMENT"
                    ? "Requires an advance deposit via UPI before fulfillment."
                    : selectedAction === "PREPAID_ONLY"
                    ? "Tags order as ProfitRx-Prepaid-Required to hold fulfillment until advance payment is collected (existing order gateway is immutable via Shopify API)."
                    : selectedAction === "BLOCK_COD"
                    ? "Tags order as ProfitRx-COD-Blocked to hold fulfillment or cancel (checkout COD blocking before order creation is handled by Shopify Function)."
                    : "Removes restriction tags and clears order for normal courier fulfillment."
                }
              />

              <TextField
                label="Reason / Notes for Override"
                value={actionReason}
                onChange={setActionReason}
                placeholder="e.g. Customer verified address via phone"
                autoComplete="off"
                multiline={2}
              />
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = "An unexpected error occurred while loading orders and operations.";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}: ${error.data}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="Merchant Control Center">
      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <Banner tone="critical" title="Failed to Load Operations Control Center">
              <p>{errorMessage}</p>
            </Banner>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}
