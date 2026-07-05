import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation, useSubmit } from "react-router";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ShopifyService } from "../services/shopify.service";

// Helper to determine if gateway is COD
const isCodGateway = (gateway: string | null) => {
  if (!gateway) return false;
  const lower = gateway.toLowerCase();
  return lower.includes("cod") || lower.includes("cash") || lower.includes("manual");
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  // Fetch all orders
  const orders = await prisma.order.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  // Fetch all RTO events
  const rtoEvents = await prisma.rTOEvent.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  // Fetch products to map titles
  let products: any[] = [];
  try {
    products = await ShopifyService.getProducts(admin);
  } catch (err) {
    console.error("Failed to fetch products:", err);
  }
  const productMap = new Map(products.map((p) => [p.id, p.title]));

  // Calculate Stats
  const codOrders = orders.filter((o: any) => isCodGateway(o.gateway));
  const prepaidOrders = orders.filter((o: any) => !isCodGateway(o.gateway));

  const codCount = codOrders.length;
  const prepaidCount = prepaidOrders.length;
  const totalCount = orders.length || 1;

  const codPercent = ((codCount / totalCount) * 100).toFixed(1);
  const prepaidPercent = ((prepaidCount / totalCount) * 100).toFixed(1);

  // RTO Loss and rates
  const totalLoss = rtoEvents.reduce((acc: number, curr: any) => acc + curr.amount, 0);
  const rtoCount = rtoEvents.filter((e: any) => e.eventType === "RTO").length;
  const rtoRate = codCount > 0 ? ((rtoCount / codCount) * 100).toFixed(1) : "0.0";

  // Group RTO losses by product
  const productLossMap = new Map<string, { title: string; amount: number; count: number }>();
  for (const event of rtoEvents) {
    const order = orders.find((o: any) => o.id === event.orderId);
    const productId = order?.productId;
    if (productId) {
      const title = productMap.get(productId) || `Product ID: ${productId}`;
      const existing = productLossMap.get(productId) || { title, amount: 0, count: 0 };
      existing.amount += event.amount;
      existing.count += 1;
      productLossMap.set(productId, existing);
    }
  }

  const topProducts = Array.from(productLossMap.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Generate 30 days history data for RTO trend chart
  const dailyRto: Record<string, { date: string; count: number; loss: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    dailyRto[dateStr] = { date: dateStr.substring(8) + "/" + dateStr.substring(5, 7), count: 0, loss: 0 };
  }

  rtoEvents.forEach((e: any) => {
    const dateStr = e.createdAt.toISOString().split("T")[0];
    if (dailyRto[dateStr]) {
      dailyRto[dateStr].count += 1;
      dailyRto[dateStr].loss += e.amount;
    }
  });

  return {
    orders: orders.map((o: any) => ({ orderNumber: o.orderNumber, totalPrice: o.totalPrice })),
    rtoEvents: rtoEvents.map((e: any) => ({
      ...e,
      createdAt: e.createdAt.toISOString().split("T")[0],
    })),
    stats: {
      totalLoss,
      rtoRate,
      codCount,
      prepaidCount,
      codPercent,
      prepaidPercent,
    },
    topProducts,
    chartData: Object.values(dailyRto),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const orderNumberStr = formData.get("orderNumber") as string;
  const amountStr = formData.get("amount") as string;
  const eventType = formData.get("eventType") as string;
  const status = formData.get("status") as string;
  const reason = formData.get("reason") as string;

  const orderNumber = parseInt(orderNumberStr, 10);
  const amount = parseFloat(amountStr);

  if (isNaN(orderNumber)) {
    return Response.json({ error: "Invalid order number" }, { status: 400 });
  }
  if (isNaN(amount) || amount < 0) {
    return Response.json({ error: "Invalid amount" }, { status: 400 });
  }

  // Find linked order in database
  const order = await prisma.order.findFirst({
    where: { shop: session.shop, orderNumber },
  });

  if (!order) {
    return Response.json({ error: `Order #${orderNumber} not found. Please sync orders first.` }, { status: 400 });
  }

  // Validate RTO event amount bounds (amount <= order total price)
  if (amount > order.totalPrice) {
    return Response.json(
      { error: `RTO loss amount (₹${amount}) cannot exceed the order's total price (₹${order.totalPrice}).` },
      { status: 400 }
    );
  }

  // Check if event already logged for this order
  const existingEvent = await prisma.rTOEvent.findFirst({
    where: { shop: session.shop, orderId: order.id, eventType },
  });

  if (existingEvent) {
    return Response.json({ error: `An event of type "${eventType}" has already been logged for Order #${orderNumber}.` }, { status: 400 });
  }

  // Save RTO Event
  await prisma.rTOEvent.create({
    data: {
      shop: session.shop,
      orderId: order.id,
      orderNumber,
      eventType,
      amount,
      status,
      reason: reason || null,
    },
  });

  return Response.json({ success: true });
};

type RtoChartItem = { date: string; count: number; loss: number };

function RtoTrendChart({ data }: { data: RtoChartItem[] }) {
  const width = 600;
  const height = 180;
  const padding = 45;

  const maxLoss = Math.max(...data.map(d => d.loss), 500);
  const getX = (index: number) => padding + (index * (width - 2 * padding)) / (data.length - 1);
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
          const index = data.findIndex(item => item.date === d.date);
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
          const index = data.findIndex(item => item.date === d.date);
          return (
            <circle key={idx} cx={getX(index)} cy={getY(d.loss)} r="4" fill="#ef4444" stroke="#fff" strokeWidth="1.5" />
          );
        })}
      </svg>
    </div>
  );
}

export default function RtoRoute() {
  const { orders, rtoEvents, stats, topProducts, chartData } = useLoaderData<typeof loader>();
  const submit = useSubmit();
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

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(false);

    const parsedOrderNumber = parseInt(orderNumber, 10);
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedOrderNumber)) {
      setActionError("Please enter a valid order number.");
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setActionError("Loss amount must be a non-negative number.");
      return;
    }

    const matchedOrder = orders.find((o: any) => o.orderNumber === parsedOrderNumber);
    if (!matchedOrder) {
      setActionError(`Order #${orderNumber} not found. Please sync orders first.`);
      return;
    }
    if (parsedAmount > matchedOrder.totalPrice) {
      setActionError(`RTO loss amount (₹${parsedAmount}) cannot exceed the order's total price (₹${matchedOrder.totalPrice}).`);
      return;
    }

    const fd = new FormData();
    fd.append("orderNumber", orderNumber);
    fd.append("amount", amount);
    fd.append("eventType", eventType);
    fd.append("status", status);
    fd.append("reason", reason);

    try {
      const res = await fetch("", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setActionSuccess(true);
        setOrderNumber("");
        setAmount("");
        setReason("");
        // Reload parameters via router redirect refresh
        window.location.reload();
      } else {
        setActionError(data.error || "Failed to log event");
      }
    } catch (err) {
      setActionError("Failed to submit request.");
    }
  };

  // Filter local events
  const filteredEvents = rtoEvents.filter((event: any) => {
    const matchesSearch =
      event.orderNumber.toString().includes(searchQuery) ||
      (event.reason || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || event.status === statusFilter;
    const matchesType = typeFilter === "ALL" || event.eventType === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const rows = filteredEvents.map((event: any) => [
    `#${event.orderNumber}`,
    <Badge key={event.id} tone={event.eventType === "RTO" ? "critical" : "warning"}>
      {event.eventType}
    </Badge>,
    `₹${event.amount.toLocaleString()}`,
    <Badge key={`${event.id}-status`} tone={event.status === "RESOLVED" ? "success" : event.status === "CONFIRMED" ? "attention" : "info"}>
      {event.status}
    </Badge>,
    event.reason || "N/A",
    event.createdAt,
  ]);

  const productRows = topProducts.map((p: any) => [
    p.title,
    `${p.count} events`,
    `₹${p.amount.toLocaleString()}`,
  ]);

  return (
    <Page title="COD & Return to Origin (RTO) Tracking">
      <Layout>
        {/* Info banners */}
        <Layout.Section>
          {actionSuccess && (
            <Banner tone="success">
              RTO / COD failure event logged successfully!
            </Banner>
          )}
          {actionError && (
            <Banner tone="critical" title="Logging failed">
              {actionError}
            </Banner>
          )}
        </Layout.Section>

        {/* Stats Section */}
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3 }}>
            <Grid.Cell>
              <Card>
                <BlockStack gap="100">
                  <Text variant="bodySm" as="p" tone="subdued">
                    Total RTO & COD Losses
                  </Text>
                  <Text variant="heading2xl" as="p" tone="critical">
                    ₹{stats.totalLoss.toLocaleString()}
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Total overhead shipping/handling waste
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
                    Percentage of COD orders failed
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

        {/* Event History with Search Filters and Product Breakdown */}
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
                    No products with RTO losses recorded yet.
                  </Text>
                )}
              </BlockStack>
            </Card>

            {/* History logs with dynamic search/filters */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Filterable RTO & COD Event History ({filteredEvents.length})
                </Text>
                
                {/* Filters Row */}
                <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3 }}>
                  <TextField
                    label="Search by Order # or comments"
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search..."
                    autoComplete="off"
                    labelHidden
                  />
                  <Select
                    label="Filter by Event Type"
                    value={typeFilter}
                    onChange={setTypeFilter}
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
                    onChange={setStatusFilter}
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

                {filteredEvents.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                    headings={["Order", "Type", "Loss Amount", "Status", "Reason / Comments", "Date"]}
                    rows={rows}
                  />
                ) : (
                  <Text variant="bodyMd" as="p" tone="subdued">
                    No events matching filter constraints.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
