import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation, useSubmit, useSearchParams, Link, useRouteError, isRouteErrorResponse } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Grid,
  Select,
  TextField,
  Banner,
  DataTable,
  Badge,
  Divider,
  Pagination,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { RtoAnalyticsApplicationService } from "../application/analytics/rto-analytics.application";
import { AuditLogService } from "../services/compliance/audit-log.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const isPreview = url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true";

  if (isPreview) {
    const shop = "glam-aura-india.myshopify.com";
    const host = Buffer.from(`admin.shopify.com/store/glam-aura-india`).toString("base64");
    return {
      orders: [
        { orderNumber: 1482, totalPrice: 6499 },
        { orderNumber: 1481, totalPrice: 2250 },
        { orderNumber: 1475, totalPrice: 1999 },
      ],
      rtoEvents: [
        {
          id: "rto-1",
          orderId: "gid://shopify/Order/849201",
          orderNumber: 1482,
          eventType: "RTO",
          amount: 1420,
          status: "CONFIRMED",
          reason: "Customer rejected delivery — door closed / uncontactable",
          createdAt: new Date().toLocaleDateString(),
        },
        {
          id: "rto-2",
          orderId: "gid://shopify/Order/849195",
          orderNumber: 1481,
          eventType: "RTO",
          amount: 450,
          status: "CONFIRMED",
          reason: "Incorrect shipping address in Sector 18",
          createdAt: new Date(Date.now() - 86400000).toLocaleDateString(),
        },
        {
          id: "rto-3",
          orderId: "gid://shopify/Order/849170",
          orderNumber: 1470,
          eventType: "COD_FAILURE",
          amount: 380,
          status: "CONFIRMED",
          reason: "Cash not available at time of delivery",
          createdAt: new Date(Date.now() - 2 * 86400000).toLocaleDateString(),
        },
      ],
      pagination: {
        page: 1,
        pageSize: 25,
        total: 3,
        totalPages: 1,
      },
      stats: {
        totalLoss: 8200,
        rtoRate: "14.2",
        codCount: 740,
        prepaidCount: 680,
        codPercent: "52",
        prepaidPercent: "48",
      },
      topProducts: [
        { id: "p1", title: "Velvet Matte Lipstick Kit", count: 18, amount: 4860 },
        { id: "p2", title: "Hydrating Rose Serum 50ml", count: 12, amount: 2340 },
      ],
      chartData: [
        { date: "Day 1", count: 2, loss: 650 },
        { date: "Day 2", count: 3, loss: 920 },
        { date: "Day 3", count: 1, loss: 380 },
        { date: "Day 4", count: 4, loss: 1420 },
        { date: "Day 5", count: 2, loss: 760 },
        { date: "Day 6", count: 3, loss: 1100 },
      ],
      hasOrders: true,
      hasRtoEvents: true,
      shop,
      host,
    };
  }

  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const host = url.searchParams.get("host") || "";
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const pageSize = parseInt(url.searchParams.get("pageSize") || "25", 10);
  const search = url.searchParams.get("search") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const eventType = url.searchParams.get("eventType") || undefined;

  const meta = AuditLogService.extractRequestMeta(request);
  AuditLogService.logAccess({
    shop,
    actor: (session as any).accountOwner ? "merchant_owner" : "merchant_staff",
    resource: "RTO_VIEW",
    action: "VIEW",
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  const analyticsData = await RtoAnalyticsApplicationService.getRtoAnalytics(shop, admin, {
    page,
    pageSize,
    search,
    status,
    eventType,
  });

  return {
    ...analyticsData,
    shop,
    host,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const orderNumber = parseInt(formData.get("orderNumber") as string, 10);
  const amount = parseFloat(formData.get("amount") as string);
  const eventType = (formData.get("eventType") as string) || "RTO";
  const status = (formData.get("status") as string) || "CONFIRMED";
  const reason = formData.get("reason") as string;

  const result = await RtoAnalyticsApplicationService.logRtoEvent(shop, {
    orderNumber,
    amount,
    eventType,
    status,
    reason,
  });

  if (!result.success) {
    return Response.json({ error: result.error || "Failed to log event" }, { status: 400 });
  }

  return Response.json({ success: true });
};

type RtoChartItem = { date: string; count: number; loss: number };

function RtoTrendChart({ data }: { data: RtoChartItem[] }) {
  const width = 600;
  const height = 180;
  const padding = 45;

  const maxLoss = Math.max(...data.map((d) => d.loss), 500);
  const getX = (index: number) => padding + (index * (width - 2 * padding)) / Math.max(1, data.length - 1);
  const getY = (val: number) => height - padding - (val * (height - 2 * padding)) / maxLoss;

  const points = data.map((d, i) => `${getX(i)},${getY(d.loss)}`).join(" ");

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
          const val = p * maxLoss;
          const y = getY(val);
          return (
            <g key={idx}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x={padding - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#64748b">
                ₹{val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {data.filter((_, idx) => idx % 5 === 0).map((d, idx) => {
          const index = data.findIndex((item) => item.date === d.date);
          return (
            <text key={idx} x={getX(index)} y={height - 5} textAnchor="middle" fontSize="9" fill="#64748b">
              {d.date}
            </text>
          );
        })}

        {/* Line */}
        <polyline fill="none" stroke="#ef4444" strokeWidth="2.5" points={points} />

        {/* Dots */}
        {data.filter((_, idx) => idx % 5 === 0).map((d, idx) => {
          const index = data.findIndex((item) => item.date === d.date);
          return (
            <circle key={idx} cx={getX(index)} cy={getY(d.loss)} r="4" fill="#ef4444" stroke="#fff" strokeWidth="1.5" />
          );
        })}
      </svg>
    </div>
  );
}

export default function RtoRoute() {
  const { orders, rtoEvents, pagination, stats, topProducts, chartData, hasOrders, hasRtoEvents, shop, host } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Form states
  const [orderNumber, setOrderNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [eventType, setEventType] = useState("RTO");
  const [status, setStatus] = useState("CONFIRMED");
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState(false);

  // Filter States synced with URL SearchParams
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "ALL");
  const [eventTypeFilter, setEventTypeFilter] = useState(searchParams.get("eventType") || "ALL");

  const applyFilters = (newSearch: string, newStatus: string, newType: string) => {
    const params = new URLSearchParams(searchParams);
    if (newSearch) params.set("search", newSearch);
    else params.delete("search");

    if (newStatus !== "ALL") params.set("status", newStatus);
    else params.delete("status");

    if (newType !== "ALL") params.set("eventType", newType);
    else params.delete("eventType");

    params.set("page", "1");
    setSearchParams(params);
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setStatusFilter("ALL");
    setEventTypeFilter("ALL");
    setSearchParams(new URLSearchParams());
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(false);

    if (!orderNumber || !amount) {
      setActionError("Please provide an order number and loss amount.");
      return;
    }

    const formData = new FormData();
    formData.append("orderNumber", orderNumber);
    formData.append("amount", amount);
    formData.append("eventType", eventType);
    formData.append("status", status);
    formData.append("reason", reason);

    try {
      const res = await fetch(`/app/rto?shop=${encodeURIComponent(shop || "")}&host=${encodeURIComponent(host || "")}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setActionSuccess(true);
        setOrderNumber("");
        setAmount("");
        setReason("");
        window.location.reload();
      } else {
        setActionError(data.error || "Failed to log event");
      }
    } catch (err) {
      setActionError("Failed to submit request.");
    }
  };

  const rows = rtoEvents.map((event: any) => {
    const cleanId = String(event.orderId || event.orderNumber).replace("gid://shopify/Order/", "");
    const orderUrl = `/app/orders/${encodeURIComponent(cleanId)}?shop=${encodeURIComponent(shop || "")}&host=${encodeURIComponent(host || "")}`;
    return [
      <Link
        key={`link-${event.id}`}
        to={orderUrl}
        style={{ fontWeight: "bold", color: "var(--p-color-text-link)", textDecoration: "none" }}
      >
        #{event.orderNumber}
      </Link>,
      <Badge key={event.id} tone={event.eventType === "RTO" ? "critical" : "warning"}>
        {event.eventType === "RTO" ? "Returned (RTO)" : event.eventType === "COD_FAILURE" ? "Refused on Delivery" : "Delivery Failed"}
      </Badge>,
      `₹${event.amount.toLocaleString("en-IN")}`,
      <Badge
        key={`${event.id}-status`}
        tone={event.status === "RESOLVED" ? "success" : event.status === "CONFIRMED" ? "attention" : "info"}
      >
        {event.status === "CONFIRMED" ? "Confirmed" : event.status === "RESOLVED" ? "Resolved" : "Pending"}
      </Badge>,
      event.reason || "N/A",
      event.createdAt,
    ];
  });

  const productRows = topProducts.map((p: any) => [
    p.title,
    `${p.count} returns`,
    `₹${p.amount.toLocaleString("en-IN")}`,
  ]);

  return (
    <Page
      title="Courier Return Reports"
      subtitle="Track courier freight burned on returned parcels, refusal reasons, and products with high return rates."
      secondaryActions={[
        {
          content: "Where You Are Losing Money",
          url: `/app/profit-leaks?shop=${encodeURIComponent(shop || "")}&host=${encodeURIComponent(host || "")}`,
        },
        {
          content: "High Return Pincodes",
          url: `/app/rto-heatmap?shop=${encodeURIComponent(shop || "")}&host=${encodeURIComponent(host || "")}`,
        },
      ]}
    >
      <Layout>
        {/* Info banners */}
        <Layout.Section>
          {actionSuccess && (
            <Banner tone="success" onDismiss={() => setActionSuccess(false)}>
              RTO / COD failure event logged successfully!
            </Banner>
          )}
          {actionError && (
            <Banner tone="critical" title="Logging failed" onDismiss={() => setActionError(null)}>
              {actionError}
            </Banner>
          )}
          {!hasOrders && (
            <Banner tone="info" title="No order data synced yet">
              <p>Sync your Shopify orders from the Dashboard to start analyzing RTO risk and loss segments.</p>
            </Banner>
          )}
        </Layout.Section>

        {/* Stats Section */}
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3 }}>
            <Grid.Cell>
              <Card>
                <BlockStack gap="100">
                  <InlineStack align="space-between">
                    <Text variant="bodySm" as="p" tone="subdued">
                      Money Lost on Returns
                    </Text>
                    <Button variant="plain" url={`/app/profit-leaks?shop=${encodeURIComponent(shop || "")}&host=${encodeURIComponent(host || "")}`}>
                      View Leaks
                    </Button>
                  </InlineStack>
                  <Text variant="heading2xl" as="p" tone="critical">
                    ₹{stats.totalLoss.toLocaleString("en-IN")}
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Direct courier freight burned on returned parcels
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell>
              <Card>
                <BlockStack gap="100">
                  <InlineStack align="space-between">
                    <Text variant="bodySm" as="p" tone="subdued">
                      Return Rate (% of COD)
                    </Text>
                    <Badge tone={parseFloat(stats.rtoRate) > 10 ? "critical" : "success"}>
                      Target: &lt;8%
                    </Badge>
                  </InlineStack>
                  <Text variant="heading2xl" as="p" tone={parseFloat(stats.rtoRate) > 10 ? "critical" : "success"}>
                    {stats.rtoRate}%
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Percentage of COD orders rejected or returned
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell>
              <Card>
                <BlockStack gap="100">
                  <Text variant="bodySm" as="p" tone="subdued">
                    COD vs Prepaid Split
                  </Text>
                  <Text variant="headingMd" as="p">
                    COD: {stats.codPercent}% ({stats.codCount})
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Prepaid: {stats.prepaidPercent}% ({stats.prepaidCount})
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* RTO Trend Chart */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">
                  Courier Money Lost Trend (Last 30 Days)
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Day-by-day courier fees lost to returned or rejected shipments.
                </Text>
              </BlockStack>
              <RtoTrendChart data={chartData} />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Log RTO Event Form */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Record a Returned Parcel
              </Text>
              <Form method="POST" onSubmit={handleFormSubmit}>
                <BlockStack gap="300">
                  <TextField
                    label="Order Number"
                    name="orderNumber"
                    type="number"
                    value={orderNumber}
                    onChange={setOrderNumber}
                    placeholder="e.g. 1001"
                    autoComplete="off"
                  />
                  <Select
                    label="Return Type"
                    name="eventType"
                    options={[
                      { label: "Parcel Returned to Store (RTO)", value: "RTO" },
                      { label: "Customer Refused at Doorstep (COD)", value: "COD_FAILURE" },
                      { label: "Delivery Attempt Failed", value: "DELIVERY_FAILED" },
                    ]}
                    value={eventType}
                    onChange={setEventType}
                  />
                  <TextField
                    label="Courier Freight Penalty Paid"
                    name="amount"
                    type="number"
                    value={amount}
                    onChange={setAmount}
                    prefix="₹"
                    placeholder="e.g. 250"
                    autoComplete="off"
                  />
                  <Select
                    label="Status"
                    name="status"
                    options={[
                      { label: "Confirmed Return", value: "CONFIRMED" },
                      { label: "Pending Investigation", value: "PENDING" },
                      { label: "Resolved / Refunded", value: "RESOLVED" },
                    ]}
                    value={status}
                    onChange={setStatus}
                  />
                  <TextField
                    label="Reason Customer Gave"
                    name="reason"
                    value={reason}
                    onChange={setReason}
                    placeholder="e.g. Customer refused at door"
                    autoComplete="off"
                  />
                  <Button variant="primary" submit loading={isSubmitting} fullWidth>
                    Save Record
                  </Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Event History with Search Filters, Product Breakdown, and Pagination */}
        <Layout.Section>
          <BlockStack gap="500">
            {/* Top Products */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Top Products Lost to Returns
                </Text>
                {topProducts.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text"]}
                    headings={["Product Name", "Times Returned", "Courier Fees Burned (₹)"]}
                    rows={productRows}
                  />
                ) : (
                  <Text variant="bodyMd" as="p" tone="subdued">
                    {hasRtoEvents ? "No products with return losses recorded yet." : "No return events recorded for your store yet."}
                  </Text>
                )}
              </BlockStack>
            </Card>

            {/* History logs with dynamic search/filters & pagination */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">
                    History of Returned Orders ({pagination.total})
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Click order # to view full profit & cost breakdown
                  </Text>
                </InlineStack>

                {/* Filters Row */}
                <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3 }}>
                  <TextField
                    label="Search by Order # or comments"
                    value={searchQuery}
                    onChange={(val) => {
                      setSearchQuery(val);
                      applyFilters(val, statusFilter, eventTypeFilter);
                    }}
                    placeholder="Search order # or reason..."
                    autoComplete="off"
                    labelHidden
                  />
                  <Select
                    label="Filter by Event Type"
                    value={eventTypeFilter}
                    onChange={(val) => {
                      setEventTypeFilter(val);
                      applyFilters(searchQuery, statusFilter, val);
                    }}
                    options={[
                      { label: "All Return Types", value: "ALL" },
                      { label: "Returned (RTO)", value: "RTO" },
                      { label: "Refused at Doorstep", value: "COD_FAILURE" },
                      { label: "Delivery Failed", value: "DELIVERY_FAILED" },
                    ]}
                    labelHidden
                  />
                  <Select
                    label="Filter by Status"
                    value={statusFilter}
                    onChange={(val) => {
                      setStatusFilter(val);
                      applyFilters(searchQuery, val, eventTypeFilter);
                    }}
                    options={[
                      { label: "All Statuses", value: "ALL" },
                      { label: "Confirmed", value: "CONFIRMED" },
                      { label: "Pending", value: "PENDING" },
                      { label: "Resolved", value: "RESOLVED" },
                    ]}
                    labelHidden
                  />
                </Grid>

                <Divider />

                {rows.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                    headings={["Order #", "Return Type", "Courier Loss (₹)", "Status", "Reason Given", "Date"]}
                    rows={rows}
                  />
                ) : (
                  <Text variant="bodyMd" as="p" tone="subdued">
                    No return events matching your filters.
                  </Text>
                )}

                {pagination.totalPages > 1 && (
                  <InlineStack align="center">
                    <Pagination
                      hasPrevious={pagination.page > 1}
                      onPrevious={() => {
                        const params = new URLSearchParams(searchParams);
                        params.set("page", (pagination.page - 1).toString());
                        setSearchParams(params);
                      }}
                      hasNext={pagination.page < pagination.totalPages}
                      onNext={() => {
                        const params = new URLSearchParams(searchParams);
                        params.set("page", (pagination.page + 1).toString());
                        setSearchParams(params);
                      }}
                      label={`Page ${pagination.page} of ${pagination.totalPages}`}
                    />
                  </InlineStack>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = "An unexpected error occurred while loading return reports.";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}: ${error.data}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="Courier Return Reports">
      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <Banner tone="critical" title="Failed to Load Return Reports">
              <p>{errorMessage}</p>
            </Banner>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}
