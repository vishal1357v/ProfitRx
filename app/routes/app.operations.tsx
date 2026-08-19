import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSubmit, useNavigation, useActionData } from "react-router";
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
  Grid,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { OperationsApplicationService } from "../application/operations/operations.application";

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";
  const data = await OperationsApplicationService.getOperationsData(session.shop);
  return { shop: session.shop, host, ...data };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "apply_action") {
    const orderId = formData.get("orderId") as string;
    const orderAction = formData.get("action") as string;
    const result = await OperationsApplicationService.applyOrderAction(shop, orderId, orderAction);
    return Response.json(result);
  }

  return Response.json({ success: false, error: "Invalid intent" }, { status: 400 });
};

export default function OperationsRoute() {
  const { orders = [], codVerifications = [], executionLogs = [], actionQueue = [], summary, shop, host } = useLoaderData<typeof loader>();
  const actionData = useActionData() as any;
  const [selectedTab, setSelectedTab] = useState(0);
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const handleTabChange = (selectedTabIndex: number) => setSelectedTab(selectedTabIndex);

  const tabs = [
    {
      id: "action-queue",
      content: `Action Required (${actionQueue.length})`,
      accessibilityLabel: "Action Required",
      panelID: "action-queue-panel",
    },
    { id: "orders", content: `All Orders (${orders.length})`, accessibilityLabel: "All Orders", panelID: "orders-panel" },
    { id: "cod-verifications", content: `COD Verifications (${codVerifications.length})`, panelID: "cod-verifications-panel" },
    { id: "activity", content: "Activity & Decisions", panelID: "activity-panel" },
  ];

  const handleQuickAction = (orderId: string, actionName: string) => {
    const formData = new FormData();
    formData.append("intent", "apply_action");
    formData.append("orderId", orderId);
    formData.append("action", actionName);
    submit(formData, { method: "post" });
  };

  const getRiskBadge = (level: string | null) => {
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

  const actionQueueRows = actionQueue.map((order: any) => {
    const rawId = String(order.id);
    const cleanId = rawId.replace("gid://shopify/Order/", "");
    return [
      <BlockStack gap="050" key={`${order.id}-num`}>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          #{order.orderNumber}
        </Text>
        <Text variant="bodyXs" tone="subdued" as="span">
          {new Date(order.createdAt).toLocaleDateString()}
        </Text>
      </BlockStack>,
      <span key={`${order.id}-cust`}>{order.customerName || "Unknown"}</span>,
      <BlockStack gap="050" key={`${order.id}-val`}>
        <Text variant="bodyMd" as="span">
          ₹{(order.totalPrice || 0).toLocaleString("en-IN")}
        </Text>
        <Badge tone="attention">COD</Badge>
      </BlockStack>,
      <span key={`${order.id}-risk`}>{getRiskBadge(order.riskLevel)}</span>,
      <Text variant="bodySm" fontWeight="bold" as="span" key={`${order.id}-rec`}>
        {order.merchantRecommendation || "Review"}
      </Text>,
      <InlineStack gap="100" key={`${order.id}-act`} wrap={false}>
        <Button
          size="micro"
          tone="success"
          disabled={isSubmitting}
          onClick={() => handleQuickAction(cleanId, "ALLOW_COD")}
        >
          ✓ Allow
        </Button>
        <Button
          size="micro"
          disabled={isSubmitting}
          onClick={() => handleQuickAction(cleanId, "OTP_VERIFY")}
        >
          📱 OTP
        </Button>
        <Button
          size="micro"
          tone="critical"
          disabled={isSubmitting}
          onClick={() => handleQuickAction(cleanId, "BLOCK_COD")}
        >
          🛑 Block
        </Button>
        <Button
          size="micro"
          variant="plain"
          onClick={() => navigate(`/app/orders/${encodeURIComponent(cleanId)}?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`)}
        >
          Inspect →
        </Button>
      </InlineStack>,
    ];
  });

  const ordersRows = orders.map((order: any) => {
    const rawId = String(order.id);
    const cleanId = rawId.replace("gid://shopify/Order/", "");
    return [
      <BlockStack gap="050" key={`${order.id}-num`}>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          #{order.orderNumber}
        </Text>
        <Text variant="bodyXs" tone="subdued" as="span">
          {new Date(order.createdAt).toLocaleDateString()}
        </Text>
      </BlockStack>,
      <span key={`${order.id}-cust`}>{order.customerName || "Unknown"}</span>,
      <BlockStack gap="050" key={`${order.id}-val`}>
        <Text variant="bodyMd" as="span">
          ₹{(order.totalPrice || 0).toLocaleString("en-IN")}
        </Text>
        <Badge tone={order.isCOD ? "warning" : "success"}>{order.isCOD ? "COD" : "Prepaid"}</Badge>
      </BlockStack>,
      <span key={`${order.id}-risk`}>{getRiskBadge(order.riskLevel)}</span>,
      <Text variant="bodySm" as="span" key={`${order.id}-rec`}>
        {order.merchantRecommendation || "Allow"}
      </Text>,
      <Button
        key={`${order.id}-view`}
        variant="plain"
        onClick={() => navigate(`/app/orders/${encodeURIComponent(cleanId)}?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`)}
      >
        Inspect →
      </Button>,
    ];
  });

  const codRows = codVerifications.map((cod: any) => {
    let statusTone: "info" | "success" | "critical" | "warning" = "info";
    if (cod.status === "VERIFIED") statusTone = "success";
    if (cod.status === "FAILED") statusTone = "critical";
    if (cod.status === "PENDING" || cod.status === "OTP_SENT") statusTone = "warning";
    if (cod.status === "CANCELLED") statusTone = "critical";

    const cleanOrderId = String(cod.orderId).replace("gid://shopify/Order/", "");

    return [
      <BlockStack gap="050" key={`${cod.id}-order`}>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          #{cod.orderNumber || cleanOrderId}
        </Text>
        <Text variant="bodyXs" tone="subdued" as="span">
          {new Date(cod.createdAt).toLocaleString()}
        </Text>
      </BlockStack>,
      <Badge key={`${cod.id}-status`} tone={statusTone}>
        {cod.status}
      </Badge>,
      <span key={`${cod.id}-phone`}>{cod.phone || "—"}</span>,
      <Text variant="bodySm" as="span" key={`${cod.id}-att`}>
        {cod.otpAttempts} attempts
      </Text>,
      <Text variant="bodySm" as="span" key={`${cod.id}-dep`}>
        {cod.partialPaid ? `₹${cod.partialAmount}` : "None"}
      </Text>,
      <Button
        key={`${cod.id}-btn`}
        variant="plain"
        onClick={() => navigate(`/app/orders/${encodeURIComponent(cleanOrderId)}?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`)}
      >
        View Order
      </Button>,
    ];
  });

  const executionRows = executionLogs.map((log: any) => {
    let statusTone: "success" | "critical" | "info" = "info";
    if (log.status === "SUCCESS") statusTone = "success";
    if (log.status === "FAILED") statusTone = "critical";

    const cleanOrderId = log.order?.orderNumber
      ? `#${log.order.orderNumber}`
      : String(log.orderId || "").replace("gid://shopify/Order/", "");

    return [
      <BlockStack gap="050" key={`${log.id}-head`}>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {cleanOrderId ? `#${cleanOrderId}` : "System Event"}
        </Text>
        <Text variant="bodyXs" tone="subdued" as="span">
          {new Date(log.createdAt).toLocaleString()}
        </Text>
      </BlockStack>,
      <Text variant="bodySm" fontWeight="bold" as="span" key={`${log.id}-step`}>
        {log.step}
      </Text>,
      <Badge key={`${log.id}-status`} tone={statusTone}>
        {log.status}
      </Badge>,
      <Text variant="bodySm" as="span" key={`${log.id}-msg`}>
        {log.message || "Executed"}
      </Text>,
    ];
  });

  return (
    <Page
      title="Operations Center"
      subtitle="Real-time order monitoring, COD verification lifecycle, and policy execution."
      secondaryActions={[
        {
          content: "COD Rules & Policy",
          url: `/app/cod-rules?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
        },
        {
          content: "Pincode Risk Heatmap",
          url: `/app/rto-heatmap?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
        },
      ]}
    >
      <Layout>
        {/* Top Summary Metrics */}
        {summary && (
          <Layout.Section>
            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                <Card>
                  <BlockStack gap="100">
                    <Text variant="headingSm" as="h3" tone="subdued">
                      At-Risk COD Orders
                    </Text>
                    <InlineStack align="start" blockAlign="center" gap="200">
                      <Text variant="heading2xl" as="p" tone={summary.atRiskCodCount > 0 ? "critical" : "success"}>
                        {summary.atRiskCodCount}
                      </Text>
                      <Badge tone={summary.atRiskCodCount > 0 ? "critical" : "success"}>
                        {summary.atRiskCodCount > 0 ? "Needs Review" : "Clear"}
                      </Badge>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                <Card>
                  <BlockStack gap="100">
                    <Text variant="headingSm" as="h3" tone="subdued">
                      Pending OTPs
                    </Text>
                    <InlineStack align="start" blockAlign="center" gap="200">
                      <Text variant="heading2xl" as="p" tone={summary.pendingOtpCount > 0 ? "caution" : "success"}>
                        {summary.pendingOtpCount}
                      </Text>
                      <Badge tone={summary.pendingOtpCount > 0 ? "warning" : "success"}>
                        {summary.pendingOtpCount > 0 ? "Awaiting OTP" : "None"}
                      </Badge>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                <Card>
                  <BlockStack gap="100">
                    <Text variant="headingSm" as="h3" tone="subdued">
                      Total COD Orders
                    </Text>
                    <InlineStack align="start" blockAlign="center" gap="200">
                      <Text variant="heading2xl" as="p">
                        {summary.totalCodOrders}
                      </Text>
                      <Badge tone="info">Live</Badge>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                <Card>
                  <BlockStack gap="100">
                    <Text variant="headingSm" as="h3" tone="subdued">
                      Failed Actions
                    </Text>
                    <InlineStack align="start" blockAlign="center" gap="200">
                      <Text variant="heading2xl" as="p" tone={summary.failedActionCount > 0 ? "critical" : "success"}>
                        {summary.failedActionCount}
                      </Text>
                      <Badge tone={summary.failedActionCount > 0 ? "critical" : "success"}>
                        {summary.failedActionCount > 0 ? "Check Logs" : "Healthy"}
                      </Badge>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </Grid.Cell>
            </Grid>
          </Layout.Section>
        )}

        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" title="Action Completed">
              <p>{actionData.message || "Action executed successfully."}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card padding="0">
            <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} fitted>
              <Box padding="400">
                {selectedTab === 0 && (
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h2">
                        🎯 Action Required Decision Queue
                      </Text>
                      <Badge tone={actionQueue.length > 0 ? "critical" : "success"}>
                        {`${actionQueue.length} Orders`}
                      </Badge>
                    </InlineStack>
                    {actionQueue.length === 0 ? (
                      <EmptyState
                        heading="All COD orders clear"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>No orders currently require manual merchant intervention or verification.</p>
                      </EmptyState>
                    ) : (
                      <DataTable
                        columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                        headings={["Order", "Customer", "Value / Mode", "Risk Level", "Engine Rec", "Quick Actions"]}
                        rows={actionQueueRows}
                        hasZebraStripingOnData
                      />
                    )}
                  </BlockStack>
                )}

                {selectedTab === 1 && (
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h2">
                        All Recent Orders
                      </Text>
                      <Badge tone="info">{`${orders.length} Orders`}</Badge>
                    </InlineStack>
                    {orders.length === 0 ? (
                      <EmptyState
                        heading="No orders found"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>Orders will appear here once placed on your store or synced from the dashboard.</p>
                      </EmptyState>
                    ) : (
                      <DataTable
                        columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                        headings={["Order", "Customer", "Value / Type", "Risk", "Decision Action", "Details"]}
                        rows={ordersRows}
                        hasZebraStripingOnData
                      />
                    )}
                  </BlockStack>
                )}

                {selectedTab === 2 && (
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h2">
                        COD Verifications
                      </Text>
                      <Badge tone="warning">{`${codVerifications.length} Verification Records`}</Badge>
                    </InlineStack>
                    {codVerifications.length === 0 ? (
                      <EmptyState
                        heading="No COD verifications pending"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>COD orders that trigger OTP or deposit verification rules will be tracked here.</p>
                      </EmptyState>
                    ) : (
                      <DataTable
                        columnContentTypes={["text", "text", "text", "numeric", "text", "text"]}
                        headings={["Order", "Status", "Phone", "OTP Attempts", "Deposit Amount", "Action"]}
                        rows={codRows}
                        hasZebraStripingOnData
                      />
                    )}
                  </BlockStack>
                )}

                {selectedTab === 3 && (
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h2">
                        Execution Activity Logs
                      </Text>
                      <Badge tone="info">{`${executionLogs.length} Events`}</Badge>
                    </InlineStack>
                    {executionLogs.length === 0 ? (
                      <EmptyState
                        heading="No execution logs recorded yet"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>Automated protection actions (Shopify tags, WhatsApp messages, holds) are logged here.</p>
                      </EmptyState>
                    ) : (
                      <DataTable
                        columnContentTypes={["text", "text", "text", "text"]}
                        headings={["Order / Time", "Pipeline Step", "Status", "Execution Result"]}
                        rows={executionRows}
                        hasZebraStripingOnData
                      />
                    )}
                  </BlockStack>
                )}
              </Box>
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

