import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation, useSubmit, useSearchParams, Link } from "react-router";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { RtoAnalyticsApplicationService } from "../application/analytics/rto-analytics.application";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const pageSize = parseInt(url.searchParams.get("pageSize") || "25", 10);
  const search = url.searchParams.get("search") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const eventType = url.searchParams.get("eventType") || undefined;

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
        {event.eventType}
      </Badge>,
      `₹${event.amount.toLocaleString("en-IN")}`,
      <Badge
        key={`${event.id}-status`}
        tone={event.status === "RESOLVED" ? "success" : event.status === "CONFIRMED" ? "attention" : "info"}
      >
        {event.status}
      </Badge>,
      event.reason || "N/A",
      event.createdAt,
    ];
  });

  const productRows = topProducts.map((p: any) => [
    p.title,
    `${p.count} events`,
    `₹${p.amount.toLocaleString("en-IN")}`,
  ]);

  return (
    <Page
      title="RTO Analytics"
      subtitle="Courier performance breakdown, return reason tracking, and manual RTO event logging."
      secondaryActions={[
        {
          content: "Profit Leaks",
          url: `/app/profit-leaks?shop=${encodeURIComponent(shop || "")}&host=${encodeURIComponent(host || "")}`,
        },
        {
          content: "Pincode Risk Heatmap",
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
                      Total RTO & COD Losses
                    </Text>
                    <Button variant="plain" url={`/app/profit-leaks?shop=${encodeURIComponent(shop || "")}&host=${encodeURIComponent(host || "")}`}>
                      Profit Leaks →
                    </Button>
                  </InlineStack>
                  <Text variant="heading2xl" as="p" tone="critical">
                    ₹{stats.totalLoss.toLocaleString("en-IN")}
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Direct shipping waste & fulfillment loss
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell>
              <Card>
                <BlockStack gap="100">
                  <InlineStack align="space-between">
                    <Text variant="bodySm" as="p" tone="subdued">
                      RTO Rate (% of COD)
                    </Text>
                    <Badge tone={parseFloat(stats.rtoRate) > 10 ? "critical" : "success"}>
                      Target: &lt;8%
                    </Badge>
                  </InlineStack>
                  <Text variant="heading2xl" as="p" tone={parseFloat(stats.rtoRate) > 10 ? "critical" : "success"}>
                    {stats.rtoRate}%
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Percentage of COD orders rejected / returned
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell>
              <Card>
                <BlockStack gap="100">
                  <Text variant="bodySm" as="p" tone="subdued">
                    COD vs Prepaid Order Share
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
                  RTO Loss Value Trend (Last 30 Days)
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Day-by-day accumulated losses from rejected/failed shipments.
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
                Log New RTO / COD Failure
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
                    label="Event Type"
                    name="eventType"
                    options={[
                      { label: "Return to Origin (RTO)", value: "RTO" },
                      { label: "COD Failure / Rejected on Delivery", value: "COD_FAILURE" },
                      { label: "Delivery Attempt Failed", value: "DELIVERY_FAILED" },
                    ]}
                    value={eventType}
                    onChange={setEventType}
                  />
                  <TextField
                    label="Loss Amount (Shipment cost + handling)"
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
                      { label: "Confirmed", value: "CONFIRMED" },
                      { label: "Pending Investigation", value: "PENDING" },
                      { label: "Resolved / Recovered", value: "RESOLVED" },
                    ]}
                    value={status}
                    onChange={setStatus}
                  />
                  <TextField
                    label="Reason / Comments"
                    name="reason"
                    value={reason}
                    onChange={setReason}
                    placeholder="e.g. Customer refused delivery"
                    autoComplete="off"
                  />
                  <Button variant="primary" submit loading={isSubmitting} fullWidth>
                    Log Event
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
                  Top RTO Impacted Products
                </Text>
                {topProducts.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text"]}
                    headings={["Product Name", "RTO Event Count", "Total Loss Amount (₹)"]}
                    rows={productRows}
                  />
                ) : (
                  <Text variant="bodyMd" as="p" tone="subdued">
                    {hasRtoEvents ? "No products with RTO losses recorded yet." : "No RTO events recorded for your store yet."}
                  </Text>
                )}
              </BlockStack>
            </Card>

            {/* History logs with dynamic search/filters & pagination */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">
                    Filterable RTO & COD Event History ({pagination.total})
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Click order # to view Order Intelligence detail
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
                      { label: "All Event Types", value: "ALL" },
                      { label: "RTO", value: "RTO" },
                      { label: "COD Failure", value: "COD_FAILURE" },
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
                    headings={["Order (Click to View Detail)", "Type", "Loss Amount", "Status", "Reason / Comments", "Date"]}
                    rows={rows}
                  />
                ) : (
                  <Text variant="bodyMd" as="p" tone="subdued">
                    No events matching filter constraints.
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
