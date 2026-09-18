import { useState, useMemo } from "react";
import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation, useActionData, redirect, useRouteError, isRouteErrorResponse } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Grid,
  Badge, Button, TextField, Select, DataTable, Banner, Divider,
  Box, Icon, EmptyState,
} from "@shopify/polaris";
import {
  PersonIcon,
  AlertTriangleIcon,
  ShieldCheckMarkIcon,
  SearchIcon,
  LockIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { CustomerRiskApplicationService } from "../application/protection/customer-risk.application";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  let host = url.searchParams.get("host") || "";
  if (!host && session?.shop) {
    const storeHandle = session.shop.replace(".myshopify.com", "");
    host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
  }

  // Enforce billing for growth/pro tiers
  if (process.env.BYPASS_BILLING !== "true") {
    try {
      await billing.require({
        plans: ["GROWTH", "PRO"],
        isTest: process.env.NODE_ENV !== "production",
        onFailure: async () => {
          throw redirect(`/app/pricing?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`);
        },
      });
    } catch (error) {
      if (error instanceof Response) {
        throw error;
      }
      console.warn("[CustomerRisk Billing Guard Warning]:", error);
    }
  }

  return CustomerRiskApplicationService.getCustomerRiskData(shop);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update_customer_action") {
    const customerId = formData.get("customerId") as string;
    const actionType = formData.get("actionType") as "FORCE_PREPAID" | "ALLOW_COD" | "FLAG_CRITICAL";

    if (!customerId || !actionType) {
      return Response.json({ success: false, error: "Missing required parameters." }, { status: 400 });
    }

    const result = await CustomerRiskApplicationService.updateCustomerRiskAction(shop, customerId, actionType);
    return Response.json(result);
  }

  return Response.json({ error: "Invalid intent" }, { status: 400 });
};

export default function CustomerRiskRoute() {
  const { summary, customers } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("RTO_COUNT");

  const filteredCustomers = useMemo(() => {
    let list = customers.filter((c) => {
      // Risk filter
      if (riskFilter !== "ALL" && c.riskLevel !== riskFilter) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = c.customerId.toLowerCase().includes(q);
        const matchPhone = (c.phone || "").toLowerCase().includes(q);
        const matchEmail = (c.email || "").toLowerCase().includes(q);
        if (!matchId && !matchPhone && !matchEmail) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === "RTO_COUNT") return b.rtoCount - a.rtoCount;
      if (sortBy === "RISK_SCORE") return b.riskScore - a.riskScore;
      if (sortBy === "ESTIMATED_LOSS") return b.estimatedLoss - a.estimatedLoss;
      if (sortBy === "TOTAL_ORDERS") return b.totalOrders - a.totalOrders;
      return 0;
    });

    return list;
  }, [customers, searchQuery, riskFilter, sortBy]);

  const handleCustomerAction = (customerId: string, actionType: "FORCE_PREPAID" | "ALLOW_COD" | "FLAG_CRITICAL") => {
    const fd = new FormData();
    fd.append("intent", "update_customer_action");
    fd.append("customerId", customerId);
    fd.append("actionType", actionType);
    submit(fd, { method: "POST" });
  };

  const rows = filteredCustomers.map((c) => {
    const isCritical = c.riskLevel === "CRITICAL" || c.riskScore >= 70;
    const isHigh = c.riskLevel === "HIGH" || (c.riskScore >= 40 && c.riskScore < 70);

    const badgeTone = isCritical ? "critical" : isHigh ? "warning" : "success";

    return [
      <BlockStack key={`${c.customerId}-info`} gap="050">
        <span style={{ fontWeight: 600 }}>{c.phone || c.email || c.customerId}</span>
        <span style={{ fontSize: "11px", color: "var(--p-color-text-subdued)" }}>ID: {c.customerId}</span>
      </BlockStack>,
      <span key={`${c.customerId}-orders`}>
        {c.totalOrders} ({c.codOrders} COD)
      </span>,
      <span key={`${c.customerId}-rate`} style={{ fontWeight: 600 }}>
        {c.deliveryRate}%
      </span>,
      <span key={`${c.customerId}-rto`} style={{ color: c.rtoCount > 0 ? "var(--gg-accent-red)" : "inherit", fontWeight: c.rtoCount > 0 ? 700 : 400 }}>
        {c.rtoCount} ({c.rtoRate}%)
      </span>,
      <span key={`${c.customerId}-loss`} style={{ color: c.estimatedLoss > 0 ? "var(--gg-accent-red)" : "inherit", fontWeight: 700 }}>
        ₹{c.estimatedLoss.toLocaleString("en-IN")}
      </span>,
      <Badge key={`${c.customerId}-badge`} tone={badgeTone}>
        {`${c.riskLevel} (${c.riskScore})`}
      </Badge>,
      <InlineStack key={`${c.customerId}-act`} gap="200">
        {isCritical || isHigh ? (
          <Button
            size="slim"
            variant="secondary"
            loading={isSubmitting}
            onClick={() => handleCustomerAction(c.customerId, "ALLOW_COD")}
          >
            Allow COD
          </Button>
        ) : (
          <Button
            size="slim"
            variant="primary"
            tone="critical"
            loading={isSubmitting}
            onClick={() => handleCustomerAction(c.customerId, "FORCE_PREPAID")}
          >
            Force Prepaid
          </Button>
        )}
      </InlineStack>,
    ];
  });

  return (
    <Page
      title="Customer Risk & Serial Offender Protection"
      subtitle="Identify repeat RTO offenders, detect high-risk buyer profiles, and enforce automated COD restrictions."
    >
      <Layout>
        {actionData?.message && (
          <Layout.Section>
            <Banner tone={actionData.success ? "success" : "critical"}>
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* ── Summary Metric Cards ── */}
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 2, md: 4, lg: 4 }}>
            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <InlineStack gap="150" blockAlign="center">
                      <Icon source={AlertTriangleIcon} tone="critical" />
                      <Text variant="bodySm" as="span" tone="subdued">Repeat Offenders</Text>
                    </InlineStack>
                    <Text variant="headingLg" as="p" fontWeight="bold">
                      {summary.totalOffenders}
                    </Text>
                    <Text variant="bodyXs" as="span" tone="subdued">Customers with 1+ RTO deliveries</Text>
                  </BlockStack>
                </Box>
              </Card>
            </Grid.Cell>

            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <InlineStack gap="150" blockAlign="center">
                      <Icon source={LockIcon} tone="warning" />
                      <Text variant="bodySm" as="span" tone="subdued">High Risk Flagged</Text>
                    </InlineStack>
                    <Text variant="headingLg" as="p" fontWeight="bold">
                      {summary.highRiskCount}
                    </Text>
                    <Text variant="bodyXs" as="span" tone="subdued">Require OTP or Prepaid</Text>
                  </BlockStack>
                </Box>
              </Card>
            </Grid.Cell>

            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <InlineStack gap="150" blockAlign="center">
                      <Icon source={PersonIcon} />
                      <Text variant="bodySm" as="span" tone="subdued">Cumulative RTO Loss</Text>
                    </InlineStack>
                    <Text variant="headingLg" as="p" fontWeight="bold" tone="critical">
                      ₹{summary.totalLoss.toLocaleString("en-IN")}
                    </Text>
                    <Text variant="bodyXs" as="span" tone="subdued">Direct reverse logistics waste</Text>
                  </BlockStack>
                </Box>
              </Card>
            </Grid.Cell>

            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <InlineStack gap="150" blockAlign="center">
                      <Icon source={ShieldCheckMarkIcon} tone="success" />
                      <Text variant="bodySm" as="span" tone="subdued">Offender RTO Rate</Text>
                    </InlineStack>
                    <Text variant="headingLg" as="p" fontWeight="bold">
                      {summary.avgRtoRate}%
                    </Text>
                    <Text variant="bodyXs" as="span" tone="subdued">Avg return failure rate</Text>
                  </BlockStack>
                </Box>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* ── Table & Filters ── */}
        <Layout.Section>
          <Card>
            <Box padding="500">
              <BlockStack gap="400">
                <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3 }}>
                  <Grid.Cell>
                    <TextField
                      label="Search Customer"
                      placeholder="Search phone, email, or customer ID..."
                      value={searchQuery}
                      onChange={setSearchQuery}
                      prefix={<Icon source={SearchIcon} />}
                      autoComplete="off"
                    />
                  </Grid.Cell>
                  <Grid.Cell>
                    <Select
                      label="Filter Risk Level"
                      options={[
                        { label: "All Customers", value: "ALL" },
                        { label: "CRITICAL Risk Only", value: "CRITICAL" },
                        { label: "HIGH Risk Only", value: "HIGH" },
                        { label: "MEDIUM Risk Only", value: "MEDIUM" },
                        { label: "LOW Risk (Safe)", value: "LOW" },
                      ]}
                      value={riskFilter}
                      onChange={setRiskFilter}
                    />
                  </Grid.Cell>
                  <Grid.Cell>
                    <Select
                      label="Sort Customers"
                      options={[
                        { label: "Most RTOs", value: "RTO_COUNT" },
                        { label: "Highest Loss Amount", value: "ESTIMATED_LOSS" },
                        { label: "Highest Risk Score", value: "RISK_SCORE" },
                        { label: "Total Order Volume", value: "TOTAL_ORDERS" },
                      ]}
                      value={sortBy}
                      onChange={setSortBy}
                    />
                  </Grid.Cell>
                </Grid>

                <Divider />

                {filteredCustomers.length === 0 ? (
                  <EmptyState
                    heading="No high-risk customer profiles found"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2760/files/emptystate-files.png"
                  >
                    <p>
                      {searchQuery || riskFilter !== "ALL"
                        ? "No customer matches your current filter criteria. Try clearing search filters."
                        : "All customers are currently within acceptable delivery thresholds. No repeat offenders detected."}
                    </p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "numeric", "text", "text"]}
                    headings={["Customer / Identifier", "Orders (COD)", "Delivery Rate", "RTO Count (Rate)", "Est. Loss", "Risk Status", "Action"]}
                    rows={rows}
                  />
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = "An unexpected error occurred while loading customer risk intelligence.";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}: ${error.data}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="Customer Risk Intelligence">
      <Card>
        <Box padding="500">
          <Banner tone="critical" title="Failed to Load Customer Risk Intelligence">
            <p>{errorMessage}</p>
          </Banner>
        </Box>
      </Card>
    </Page>
  );
}
