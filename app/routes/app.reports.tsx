import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link, useRouteError, isRouteErrorResponse } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Layout, Card, Text, BlockStack, InlineStack, Grid, Box, Icon, Badge, Banner, Button } from "@shopify/polaris";
import {
  ChartLineIcon,
  CalendarIcon,
  OrderIcon,
  ProductIcon,
  DeliveryIcon,
  PersonIcon,
  AlertCircleIcon,
  FinanceIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const isPreview = url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true";

  if (isPreview) {
    const shop = "glam-aura-india.myshopify.com";
    const host = Buffer.from(`admin.shopify.com/store/glam-aura-india`).toString("base64");
    return { shop, host };
  }

  const { session } = await authenticate.admin(request);
  const host = url.searchParams.get("host") || "";
  return { shop: session.shop, host };
};

const REPORT_TYPES = [
  { key: "daily-profit", label: "Daily Net Profit", icon: CalendarIcon, description: "Day-by-day net profit breakdown" },
  { key: "weekly-profit", label: "Weekly Profit Summary", icon: ChartLineIcon, description: "Weekly profit and courier expense rollup" },
  { key: "monthly-profit", label: "Monthly Profit Statement", icon: FinanceIcon, description: "Monthly net profit statement for GST/accounting" },
  { key: "top-products", label: "Most Profitable Products", icon: ProductIcon, description: "Highest earning products after all costs" },
  { key: "worst-products", label: "Loss-Making Products", icon: AlertCircleIcon, description: "Items losing money due to high return rates" },
  { key: "rto-report", label: "Courier Returns Report", icon: DeliveryIcon, description: "Complete record of returned parcels & freight fees" },
  { key: "customer-report", label: "Customer Return Behavior", icon: PersonIcon, description: "Repeat returners vs loyal buyers" },
  { key: "profit-leak-report", label: "Money Leak Report", icon: OrderIcon, description: "Where you lost money to returns and discounts" },
];

export default function ReportsHub() {
  const { shop, host } = useLoaderData<typeof loader>();

  return (
    <Page title="Download Reports & CSV" subtitle="Export your profit statements, courier return records, and product profitability sheets to Excel / CSV.">
      <Layout>
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 2, md: 2, lg: 4 }}>
            {REPORT_TYPES.map((report) => (
              <Grid.Cell key={report.key}>
                <Link
                  to={`/app/reports/${report.key}?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                  style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}
                  data-tour={report.key === "daily-profit" ? "reports" : undefined}
                >
                  <Card>
                    <Box padding="300">
                      <BlockStack gap="200">
                        <InlineStack gap="150" blockAlign="center">
                          <Icon source={report.icon} tone="base" />
                          <Text variant="headingSm" as="h3">{report.label}</Text>
                        </InlineStack>
                        <Text variant="bodySm" as="p" tone="subdued">{report.description}</Text>
                        <InlineStack gap="100">
                          <Badge tone="info">CSV</Badge>
                          <Badge tone="info">Excel</Badge>
                        </InlineStack>
                      </BlockStack>
                    </Box>
                  </Card>
                </Link>
              </Grid.Cell>
            ))}
          </Grid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = "An unexpected error occurred while loading reports.";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}: ${error.data}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="Download Reports & CSV">
      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <Banner tone="critical" title="Failed to Load Reports">
              <p>{errorMessage}</p>
            </Banner>
            <Button onClick={() => window.location.reload()}>Retry Reports</Button>
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}
