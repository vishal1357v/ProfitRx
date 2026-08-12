import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Layout, Card, Text, BlockStack, InlineStack, Grid, Box, Icon, Badge } from "@shopify/polaris";
import { ChartLineIcon, ChartVerticalIcon, PersonIcon, DeliveryIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";
  return { shop: session.shop, host };
};

const REPORT_TYPES = [
  { key: "daily-profit", label: "Daily Profit", icon: "📅", description: "Day-by-day profit breakdown", color: "var(--gg-accent-blue)" },
  { key: "weekly-profit", label: "Weekly Profit", icon: "📆", description: "Weekly aggregated performance", color: "var(--gg-accent-purple)" },
  { key: "monthly-profit", label: "Monthly Profit", icon: "📊", description: "Monthly profit rollup", color: "var(--gg-accent-green)" },
  { key: "top-products", label: "Top Products", icon: "🏆", description: "Best performing products by profit", color: "var(--gg-accent-amber)" },
  { key: "worst-products", label: "Worst Products", icon: "📉", description: "Loss-making products to review", color: "var(--gg-accent-red)" },
  { key: "rto-report", label: "RTO Report", icon: "🔄", description: "Return to Origin analysis", color: "var(--gg-accent-red)" },
  { key: "customer-report", label: "Customer Report", icon: "👥", description: "Customer LTV and behavior", color: "var(--gg-accent-teal)" },
  { key: "profit-leak-report", label: "Profit Leak Report", icon: "💧", description: "Where your money is leaking", color: "var(--gg-accent-amber)" },
];

export default function ReportsHub() {
  const { shop, host } = useLoaderData<typeof loader>();

  return (
    <Page title="Reports Suite" subtitle="Generate and stream structured CSV financial, product, and RTO reports.">
      <Layout>
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 2, md: 2, lg: 4 }}>
            {REPORT_TYPES.map((report) => (
              <Grid.Cell key={report.key}>
                <a
                  href={`/app/reports/${report.key}?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                  style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}
                  data-tour={report.key === "daily-profit" ? "reports" : undefined}
                >
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="200">
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: "var(--gg-radius-md)",
                          background: `${report.color}15`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 22,
                        }}>
                          {report.icon}
                        </div>
                        <Text variant="headingSm" as="h3">{report.label}</Text>
                        <Text variant="bodySm" as="p" tone="subdued">{report.description}</Text>
                        <InlineStack gap="100">
                          <Badge tone="info">CSV</Badge>
                          <Badge tone="info">Excel</Badge>
                          <Badge tone="info">Print</Badge>
                        </InlineStack>
                      </BlockStack>
                    </Box>
                  </Card>
                </a>
              </Grid.Cell>
            ))}
          </Grid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
