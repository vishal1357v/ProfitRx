import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Badge,
  DataTable, Tabs, Box, Icon, Tooltip, Button
} from "@shopify/polaris";
import {
  DeliveryIcon, AlertTriangleIcon, CheckCircleIcon,
  ClockIcon, ShieldCheckMarkIcon, CashDollarIcon, ViewIcon
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { OperationsApplicationService } from "../application/operations/operations.application";

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const data = await OperationsApplicationService.getOperationsData(session.shop);
  return { shop: session.shop, ...data };
};

export default function OperationsRoute() {
  const { orders, codVerifications, executionLogs, shop } = useLoaderData<typeof loader>();
  const [selectedTab, setSelectedTab] = useState(0);
  const navigate = useNavigate();

  const handleTabChange = (selectedTabIndex: number) => setSelectedTab(selectedTabIndex);

  const tabs = [
    { id: 'orders', content: 'Orders', accessibilityLabel: 'All Orders', panelID: 'orders-panel' },
    { id: 'cod-verifications', content: 'COD Verifications', panelID: 'cod-verifications-panel' },
    { id: 'activity', content: 'Activity & Executions', panelID: 'activity-panel' },
  ];

  const getRiskBadge = (level: string | null) => {
    switch (level) {
      case "LOW": return <Badge tone="success">Low Risk</Badge>;
      case "MEDIUM": return <Badge tone="warning">Medium</Badge>;
      case "HIGH": return <Badge tone="critical">High Risk</Badge>;
      case "CRITICAL": return <Badge tone="critical">Critical</Badge>;
      default: return <Badge>Unknown</Badge>;
    }
  };

  const ordersRows = orders.map((order: any) => [
    <BlockStack gap="100">
      <Text variant="bodyMd" fontWeight="bold" as="span">#{order.orderNumber}</Text>
      <Text variant="bodyXs" tone="subdued" as="span">{new Date(order.createdAt).toLocaleDateString()}</Text>
    </BlockStack>,
    order.customerName || "Unknown",
    <BlockStack gap="100">
      <Text variant="bodyMd" as="span">₹{order.totalPrice}</Text>
      <Badge tone={order.isCOD ? "warning" : "success"}>{order.isCOD ? "COD" : "Prepaid"}</Badge>
    </BlockStack>,
    getRiskBadge(order.riskLevel),
    <Text variant="bodySm" as="span">{order.merchantRecommendation || "N/A"}</Text>,
    <Button variant="plain" onClick={() => navigate(`/app/orders/${encodeURIComponent(order.id.split('/').pop() || '')}`)}>View</Button>
  ]);

  const codRows = codVerifications.map((cod: any) => {
    let statusTone: "info" | "success" | "critical" | "warning" = "info";
    if (cod.status === "VERIFIED") statusTone = "success";
    if (cod.status === "FAILED") statusTone = "critical";
    if (cod.status === "PENDING") statusTone = "warning";

    return [
      <BlockStack gap="100">
        <Text variant="bodyMd" fontWeight="bold" as="span">#{cod.orderNumber || cod.orderId}</Text>
        <Text variant="bodyXs" tone="subdued" as="span">{new Date(cod.createdAt).toLocaleString()}</Text>
      </BlockStack>,
      <Badge tone={statusTone}>{cod.status}</Badge>,
      cod.phone,
      <Text variant="bodySm" as="span">{cod.otpAttempts} attempts</Text>,
      <Text variant="bodySm" as="span">{cod.partialPaid ? `₹${cod.partialAmount}` : "None"}</Text>,
      cod.orderNumber ? (
        <Button variant="plain" onClick={() => navigate(`/app/orders/${encodeURIComponent(cod.orderId.split('/').pop() || '')}`)}>View Order</Button>
      ) : null
    ];
  });

  const executionRows = executionLogs.map((log: any) => {
    let statusTone: "success" | "critical" | "info" = "info";
    if (log.status === "SUCCESS") statusTone = "success";
    if (log.status === "FAILED") statusTone = "critical";
    
    return [
      <BlockStack gap="100">
        <Text variant="bodyMd" fontWeight="bold" as="span">#{log.order?.orderNumber || "Unknown"}</Text>
        <Text variant="bodyXs" tone="subdued" as="span">{new Date(log.createdAt).toLocaleString()}</Text>
      </BlockStack>,
      <Text variant="bodySm" fontWeight="bold" as="span">{log.step}</Text>,
      <Badge tone={statusTone}>{log.status}</Badge>,
      <Text variant="bodySm" as="span">{log.message || "Executed"}</Text>
    ];
  });

  return (
    <Page title="Operations Center" subtitle="Manage orders, verify COD, and monitor AI actions.">
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} fitted>
              <Box padding="400">
                {selectedTab === 0 && (
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h2">Recent Orders</Text>
                      <Badge tone="info">{orders.length} Orders</Badge>
                    </InlineStack>
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                      headings={['Order', 'Customer', 'Value / Type', 'Risk', 'Action', 'Details']}
                      rows={ordersRows}
                      hasZebraStripingOnData
                    />
                  </BlockStack>
                )}

                {selectedTab === 1 && (
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h2">COD Verifications</Text>
                      <Badge tone="warning">{codVerifications.length} Logs</Badge>
                    </InlineStack>
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'numeric', 'text', 'text']}
                      headings={['Order', 'Status', 'Phone', 'OTP Attempts', 'Partial Paid', 'Action']}
                      rows={codRows}
                      hasZebraStripingOnData
                    />
                  </BlockStack>
                )}

                {selectedTab === 2 && (
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h2">Execution Activity</Text>
                      <Badge tone="info">{executionLogs.length} Events</Badge>
                    </InlineStack>
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'text']}
                      headings={['Order / Time', 'Step', 'Status', 'Result']}
                      rows={executionRows}
                      hasZebraStripingOnData
                    />
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
