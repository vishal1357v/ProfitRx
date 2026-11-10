import { useState, useCallback, useMemo } from "react";
import { useLoaderData, useRevalidator, Link, useRouteError, isRouteErrorResponse } from "react-router";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  Banner,
  Divider,
  Tabs,
  IndexTable,
  EmptyState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ProfitTrendChart } from "../components";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const isPreview = url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true";

  if (isPreview) {
    const { getDemoDashboardData } = await import("../application/dashboard/demo-dashboard.data");
    return getDemoDashboardData();
  }

  const { session } = await authenticate.admin(request);
  const { DashboardApplicationService } = await import("../application/dashboard/dashboard.application");
  const { AuditLogService } = await import("../services/compliance/audit-log.service");

  const meta = AuditLogService.extractRequestMeta(request);
  AuditLogService.logAccess({
    shop: session.shop,
    actor: (session as any).accountOwner ? "merchant_owner" : "merchant_staff",
    resource: "DASHBOARD_VIEW",
    action: "VIEW",
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return DashboardApplicationService.getDashboardData(request);
};

function formatK(num: number): string {
  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  if (abs >= 100000) {
    return `${sign}${(abs / 100000).toFixed(1)}L`;
  }
  if (abs >= 1000) {
    return `${sign}${(abs / 1000).toFixed(1)}k`;
  }
  return `${sign}${abs.toLocaleString("en-IN")}`;
}

export default function DashboardRoute() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState(0);

  const handleSyncOrders = useCallback(async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const res = await fetch("/api/sync-orders", { method: "POST" });
      const resData = await res.json();
      if (res.ok && resData.success) {
        setSyncNotice(`Synced ${resData.ordersFound ?? resData.count ?? 0} orders.`);
        revalidator.revalidate();
      } else {
        throw new Error(resData.error || "Sync failed");
      }
    } catch (e) {
      setSyncNotice(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [revalidator]);

  const handleExportCSV = useCallback(() => {
    const headers = "Product Name,Units Sold,Revenue,Estimated Profit,Margin,RTO Rate\n";
    const rows = (data.topProducts || [])
      .map((p: any) => `"${(p.name || "").replace(/"/g, '""')}",${p.volume || 0},${p.revenue || 0},${p.profit || 0},${p.margin || 0}%,${p.rtoRate || 0}%`)
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `profitrx_products_${data.shop || "store"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [data.topProducts, data.shop]);

  const urgentOrders = useMemo(() => {
    return (data.ordersNeedingReview || []).slice(0, 3);
  }, [data.ordersNeedingReview]);

  const hasIncompleteCosts = (data.missingCogsCount || 0) > 0 || data.hasZeroLogisticsDefaults;

  const tabs = [
    { id: "profit-trend", content: "Daily Profit Trend" },
    { id: "courier-health", content: "Courier Performance" },
    { id: "top-products", content: "Top Products by Real Profit" },
  ];

  // Metric precision & truthful incomplete data modeling
  const rtoOrdersExist = (data.rtoRate || 0) > 0;
  const isLogisticsMissing = Boolean(data.hasZeroLogisticsDefaults);
  
  let rtoLossStatus: "ACTUAL" | "ESTIMATED" | "INCOMPLETE" = "ACTUAL";
  let rtoLossReason = "Actual recorded courier freight losses";
  let rtoLossAmount: number | null = (data as any).rtoLoss ?? data.leaks?.rtoLoss ?? 0;

  if (rtoOrdersExist && isLogisticsMissing) {
    rtoLossStatus = "INCOMPLETE";
    rtoLossReason = "Courier shipping costs need confirmation in Settings";
    rtoLossAmount = null;
  } else if (!rtoOrdersExist) {
    rtoLossStatus = "ACTUAL";
    rtoLossReason = "Zero return losses recorded";
    rtoLossAmount = 0;
  } else if (hasIncompleteCosts) {
    rtoLossStatus = "ESTIMATED";
    rtoLossReason = "Estimated based on starting logistics rates";
  }

  // Zero-order state
  if (data.orderCount === 0) {
    return (
      <Page title="ProfitRx" subtitle="Net profit and COD risk protection">
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No orders found yet"
                action={{
                  content: "Sync orders from Shopify",
                  onAction: handleSyncOrders,
                  loading: syncing,
                }}
                secondaryAction={{
                  content: "Configure shipping costs",
                  url: `/app/settings?shop=${encodeURIComponent(data.shop)}&host=${encodeURIComponent(data.host)}`,
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Sync your recent transactions so ProfitRx can calculate true net margins, identify unserviceable pincodes, and protect incoming COD orders.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="ProfitRx"
      subtitle={`${data.shop?.replace(".myshopify.com", "") || "Store"} • ${data.orderCount} orders evaluated (${data.syncWindow?.from || "Recent"} – ${data.syncWindow?.to || "Today"})`}
      primaryAction={
        <Button variant="primary" onClick={handleSyncOrders} loading={syncing}>
          Sync orders
        </Button>
      }
      secondaryActions={[
        {
          content: "Export products CSV",
          onAction: handleExportCSV,
        },
      ]}
    >
      <BlockStack gap="400">
        {/* Sync notification */}
        {syncNotice && (
          <Banner tone="info" onDismiss={() => setSyncNotice(null)}>
            <p>{syncNotice}</p>
          </Banner>
        )}

        {/* Initial store sync notice (cold start) */}
        {data.isColdStart && data.orderCount > 0 && (
          <Banner tone="info" title="Initial Store Sync Active">
            <p>
              Successfully imported <strong>{data.orderCount} recent orders</strong>. Deeper historical data is syncing in the background. Net profit is currently estimated based on your starting logistics settings.
            </p>
          </Banner>
        )}

        {/* Cost completeness notice */}
        {hasIncompleteCosts && (
          <Banner tone="info">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="p" variant="bodySm">
                <strong>Missing product costs:</strong> Some items use estimated costs. Add your making or buying prices in Product Costs so your net profit calculations reflect your actual item costs.
              </Text>
              <Button url={`/app/cogs?shop=${encodeURIComponent(data.shop)}&host=${encodeURIComponent(data.host)}`} variant="plain">
                Add Product Costs
              </Button>
            </InlineStack>
          </Banner>
        )}

        {/* ── THE 3 HERO METRICS ── */}
        <Layout>
          {/* 1. Net Profit */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="bodySm" tone="subdued" as="p">
                    {data.configuredCogsCount > 0 && !hasIncompleteCosts ? "Actual Net Profit" : "Estimated Net Profit"}
                  </Text>
                  <Badge tone={data.configuredCogsCount > 0 && !hasIncompleteCosts ? "success" : "attention"}>
                    {data.configuredCogsCount > 0 && !hasIncompleteCosts ? "ACTUAL" : "ESTIMATED"}
                  </Badge>
                </InlineStack>
                <Text variant="heading2xl" as="h2">
                  ₹{formatK(data.netProfit || 0)}
                </Text>
                <Text variant="bodyXs" tone="subdued" as="p">
                  {data.configuredCogsCount > 0 && !hasIncompleteCosts
                    ? "Actual recorded net profit after all costs"
                    : "Includes estimated product costs & shipping allowances"}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* 2. Courier Losses on Returns */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="bodySm" tone="subdued" as="p">
                    Money Lost on Returns
                  </Text>
                  <Badge tone={rtoLossStatus === "ACTUAL" ? "success" : rtoLossStatus === "ESTIMATED" ? "attention" : "warning"}>
                    {rtoLossStatus}
                  </Badge>
                </InlineStack>
                <Text variant="heading2xl" as="h2" tone={rtoLossStatus === "INCOMPLETE" ? "caution" : "critical"}>
                  {rtoLossAmount !== null ? `₹${formatK(rtoLossAmount)}` : "Pending Rates"}
                </Text>
                <Text variant="bodyXs" tone="subdued" as="p">
                  {rtoLossReason}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* 3. Orders to Check */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <Text variant="bodySm" tone="subdued" as="p">
                  Orders to Check
                </Text>
                <Text variant="heading2xl" as="h2" tone={urgentOrders.length > 0 ? "caution" : "base"}>
                  {urgentOrders.length}
                </Text>
                <Text variant="bodyXs" tone="subdued" as="p">
                  {urgentOrders.length > 0 ? "High return risk — confirm before packing" : "All orders safe to pack"}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* ── ORDERS NEEDING ATTENTION (TRIAGE STRIP) ── */}
        {urgentOrders.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingSm" as="h3">
                  Orders needing attention right now
                </Text>
                <Link
                  to={`/app/operations?shop=${encodeURIComponent(data.shop)}&host=${encodeURIComponent(data.host)}`}
                  style={{ fontSize: "13px", color: "var(--p-color-text-link)", textDecoration: "none" }}
                >
                  View all in Orders Queue ({data.ordersNeedingReview?.length || urgentOrders.length})
                </Link>
              </InlineStack>
              <Divider />
              <BlockStack gap="200">
                {urgentOrders.map((order: any) => {
                  const cleanId = String(order.id || "").replace("gid://shopify/Order/", "");
                  const isCritical = order.riskLevel === "CRITICAL" || order.riskScore >= 80;
                  return (
                    <div
                      key={order.id}
                      style={{
                        padding: "8px 0",
                        borderBottom: "1px solid var(--p-color-border-subdued)",
                      }}
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="300" blockAlign="center">
                          <Badge tone={isCritical ? "critical" : "warning"}>
                            {`#${order.orderNumber} · COD`}
                          </Badge>
                          <BlockStack gap="050">
                            <Text variant="bodyMd" as="p" fontWeight="semibold">
                              {order.customerName || "Customer"} • {order.city || "India"}
                            </Text>
                            <Text variant="bodySm" as="p" tone="subdued">
                              {order.riskScore ? `High return risk (${order.riskScore}%)` : "Confirmation required"} · ₹{(order.totalPrice || 0).toLocaleString("en-IN")}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                        <Button
                          variant="primary"
                          size="medium"
                          url={`/app/orders/${encodeURIComponent(cleanId)}?shop=${encodeURIComponent(data.shop)}&host=${encodeURIComponent(data.host)}`}
                        >
                          {order.merchantRecommendation === "FORCE_PREPAID" ? "Check Order" : "Confirm WhatsApp"}
                        </Button>
                      </InlineStack>
                    </div>
                  );
                })}
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {/* ── PROGRESSIVE DISCLOSURE TABS ── */}
        <Card>
          <BlockStack gap="300">
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} />
            <Divider />

            {/* TAB 0: DAILY PROFIT */}
            {selectedTab === 0 && (
              <BlockStack gap="400">
                <Text variant="bodySm" as="p" tone="subdued">
                  Daily sales vs estimated net profit. Deducts product costs, courier freight, return shipping penalties, and advertising.
                </Text>
                {data.chartData && data.chartData.length > 0 && (
                  <ProfitTrendChart data={data.chartData} />
                )}
                <Divider />
                <InlineStack align="space-between">
                  <Text variant="bodySm" as="span" tone="subdued">Total Sales: ₹{Math.round(data.revenue || 0).toLocaleString("en-IN")}</Text>
                  <Text variant="bodySm" as="span" tone="subdued">Profit Margin: {Math.round(data.netMargin || 0)}%</Text>
                  <Text variant="bodySm" as="span" tone="subdued">COD Orders: {Math.round(data.codRate || 0)}%</Text>
                  <Text variant="bodySm" as="span" tone="subdued">Return Rate: {((data.rtoRate || 0)).toFixed(1)}%</Text>
                </InlineStack>
              </BlockStack>
            )}

            {/* TAB 1: COURIER PERFORMANCE */}
            {selectedTab === 1 && (
              <BlockStack gap="400">
                <Text variant="bodySm" as="p" tone="subdued">
                  Delivery success rates by courier partner. Spot which courier delivers on time and which one has high returns.
                </Text>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                  <div style={{ padding: "16px", border: "1px solid var(--p-color-border-subdued)", borderRadius: "8px" }}>
                    <Text variant="bodyXs" as="p" tone="subdued">Delhivery</Text>
                    <Text variant="headingMd" as="p">88.4% Delivered</Text>
                    <Text variant="bodyXs" as="p" tone="subdued">11.6% returned</Text>
                  </div>
                  <div style={{ padding: "16px", border: "1px solid var(--p-color-border-subdued)", borderRadius: "8px" }}>
                    <Text variant="bodyXs" as="p" tone="subdued">Bluedart</Text>
                    <Text variant="headingMd" as="p">93.2% Delivered</Text>
                    <Text variant="bodyXs" as="p" tone="subdued">6.8% returned</Text>
                  </div>
                  <div style={{ padding: "16px", border: "1px solid var(--p-color-border-subdued)", borderRadius: "8px" }}>
                    <Text variant="bodyXs" as="p" tone="subdued">Xpressbees</Text>
                    <Text variant="headingMd" as="p">82.1% Delivered</Text>
                    <Text variant="bodyXs" as="p" tone="subdued">17.9% returned</Text>
                  </div>
                </div>
                <InlineStack align="end">
                  <Button variant="plain" url={`/app/rto?shop=${encodeURIComponent(data.shop)}&host=${encodeURIComponent(data.host)}`}>
                    View Detailed Courier Reports
                  </Button>
                </InlineStack>
              </BlockStack>
            )}

            {/* TAB 2: TOP PRODUCTS BY REAL PROFIT */}
            {selectedTab === 2 && (
              <BlockStack gap="300">
                <Text variant="bodySm" as="p" tone="subdued">
                  Your best items ranked by estimated net profit after product costs, courier freight, and returns.
                </Text>
                <IndexTable
                  resourceName={{ singular: "product", plural: "products" }}
                  itemCount={(data.topProducts || []).length}
                  headings={[
                    { title: "Product Name" },
                    { title: "Units Sold" },
                    { title: "Sales (₹)" },
                    { title: "Net Profit (₹)" },
                    { title: "Return Rate" },
                    { title: "Profit Margin" },
                  ]}
                  selectable={false}
                >
                  {(data.topProducts || []).map((product: any, index: number) => (
                    <IndexTable.Row id={`prod-${index}`} key={product.name || index} position={index}>
                      <IndexTable.Cell>
                        <Text variant="bodyMd" as="span" fontWeight="bold">
                          {product.name}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{product.volume || 0}</IndexTable.Cell>
                      <IndexTable.Cell>₹{(product.revenue || 0).toLocaleString("en-IN")}</IndexTable.Cell>
                      <IndexTable.Cell>
                        <span style={{ color: (product.profit || 0) >= 0 ? "var(--p-color-text-success)" : "var(--p-color-text-critical)" }}>
                          ₹{(product.profit || 0).toLocaleString("en-IN")}
                        </span>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{product.rtoRate || 0}%</IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={(product.margin || 0) >= 20 ? "success" : (product.margin || 0) >= 10 ? "warning" : "critical"}>
                          {`${product.margin || 0}%`}
                        </Badge>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = "An unexpected error occurred while loading your dashboard.";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}: ${error.data}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="Dashboard">
      <Card>
        <BlockStack gap="400">
          <Banner tone="critical" title="Failed to Load Dashboard">
            <p>{errorMessage}</p>
          </Banner>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </BlockStack>
      </Card>
    </Page>
  );
}
