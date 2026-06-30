import { useLoaderData, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Grid,
  Box,
  Icon,
  List,
  Badge,
} from "@shopify/polaris";
import {
  MoneyIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ProductIcon,
  AppsIcon,
  OrderIcon,
  PersonIcon,
  ChartLineIcon,
} from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { isInstalled: false };
};

export default function IndexRoute() {
  const { isInstalled } = useLoaderData<typeof loader>();

  const handleStartTrial = () => {
    const shop = prompt("Enter your store domain (e.g., mystore.myshopify.com):");
    if (shop) {
      window.location.href = `/auth/login?shop=${encodeURIComponent(shop)}`;
    }
  };

  if (isInstalled) {
    return (
      <Page>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingLg" as="h1">
                  Welcome back! 🚀
                </Text>
                <Text variant="bodyMd" as="p">
                  Your store is already connected. Head to the dashboard to see your profits.
                </Text>
                <Button variant="primary" url="/app/dashboard">
                  Go to Dashboard →
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Box paddingBlockStart="800" paddingBlockEnd="800">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="800">
              {/* Header */}
              <BlockStack gap="200">
                <InlineStack align="center">
                  <Badge tone="success">🔥 New Release</Badge>
                </InlineStack>
                <Text variant="headingXl" as="h1" alignment="center">
                  GREEK GOD – The Ultimate Shopify Profit Tracker
                </Text>
                <Text variant="heading2xl" as="h2" alignment="center">
                  Know your real profit. Get alerts before you lose money.
                </Text>
                <Text variant="bodyLg" as="p" alignment="center" tone="subdued">
                  The only Shopify app that tracks true profit, store health, and RTO losses in one dashboard.
                </Text>
              </BlockStack>

              {/* CTA */}
              <InlineStack align="center">
                <Button
                  variant="primary"
                  size="large"
                  icon={ProductIcon}
                  onClick={handleStartTrial}
                >
                  Install Now – Free 14-Day Trial
                </Button>
              </InlineStack>

              {/* Features Grid */}
              <Grid columns={{ sm: 1, md: 2, lg: 4 }}>
                <Grid.Cell>
                  <Card>
                    <BlockStack gap="200">
                      <Icon source={MoneyIcon} />
                      <Text variant="headingMd" as="h3">
                        True Profit Tracking
                      </Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Revenue - COGS - shipping - fees = your actual profit
                      </Text>
                    </BlockStack>
                  </Card>
                </Grid.Cell>
                <Grid.Cell>
                  <Card>
                    <BlockStack gap="200">
                      <Icon source={ChartLineIcon} />
                      <Text variant="headingMd" as="h3">
                        Health Score (0-100)
                      </Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        One number tells you if your store is healthy or dying
                      </Text>
                    </BlockStack>
                  </Card>
                </Grid.Cell>
                <Grid.Cell>
                  <Card>
                    <BlockStack gap="200">
                      <Icon source={AlertCircleIcon} />
                      <Text variant="headingMd" as="h3">
                        RTO/COD Tracking
                      </Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Track losses from Return to Origin and COD failures
                      </Text>
                    </BlockStack>
                  </Card>
                </Grid.Cell>
                <Grid.Cell>
                  <Card>
                    <BlockStack gap="200">
                      <Icon source={CheckCircleIcon} />
                      <Text variant="headingMd" as="h3">
                        Smart Alerts
                      </Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Get notified before your profit margin collapses
                      </Text>
                    </BlockStack>
                  </Card>
                </Grid.Cell>
              </Grid>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Trust Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2" alignment="center">
                Made for Shopify Sellers, Just Like You
              </Text>
              <Grid columns={{ sm: 1, md: 2, lg: 2 }}>
                <Grid.Cell>
                  <InlineStack gap="200">
                    <Icon source={CheckCircleIcon} />
                    <Text variant="bodyMd" as="p">
                      Shows your real profit (not platform-reported revenue)
                    </Text>
                  </InlineStack>
                </Grid.Cell>
                <Grid.Cell>
                  <InlineStack gap="200">
                    <Icon source={AppsIcon} />
                    <Text variant="bodyMd" as="p">
                      Works with Shopify + Meta Ads data
                    </Text>
                  </InlineStack>
                </Grid.Cell>
                <Grid.Cell>
                  <InlineStack gap="200">
                    <Icon source={PersonIcon} />
                    <Text variant="bodyMd" as="p">
                      Free trial, no credit card required
                    </Text>
                  </InlineStack>
                </Grid.Cell>
                <Grid.Cell>
                  <InlineStack gap="200">
                    <Icon source={OrderIcon} />
                    <Text variant="bodyMd" as="p">
                      Built by sellers, for sellers
                    </Text>
                  </InlineStack>
                </Grid.Cell>
              </Grid>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Pricing */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2" alignment="center">
                Simple, Transparent Pricing
              </Text>
              <Grid columns={{ sm: 1, md: 3, lg: 3 }}>
                <Grid.Cell>
                  <Card>
                    <BlockStack gap="200">
                      <Text variant="headingLg" as="h3">
                        Starter
                      </Text>
                      <InlineStack gap="100">
                        <Text variant="heading2xl" as="p">
                          $19
                        </Text>
                        <Text variant="bodyMd" as="p" tone="subdued">
                          /month
                        </Text>
                      </InlineStack>
                      <List>
                        <List.Item>Up to 500 orders/month</List.Item>
                        <List.Item>True profit tracking</List.Item>
                        <List.Item>Health Score</List.Item>
                        <List.Item>3 alerts/month</List.Item>
                      </List>
                      <Button variant="primary" fullWidth onClick={handleStartTrial}>
                        Start Trial
                      </Button>
                    </BlockStack>
                  </Card>
                </Grid.Cell>
                <Grid.Cell>
                  <Card>
                    <BlockStack gap="200">
                      <Badge tone="success">Most Popular</Badge>
                      <Text variant="headingLg" as="h3">
                        Growth
                      </Text>
                      <InlineStack gap="100">
                        <Text variant="heading2xl" as="p">
                          $39
                        </Text>
                        <Text variant="bodyMd" as="p" tone="subdued">
                          /month
                        </Text>
                      </InlineStack>
                      <List>
                        <List.Item>Up to 2,000 orders/month</List.Item>
                        <List.Item>True profit tracking</List.Item>
                        <List.Item>Health Score</List.Item>
                        <List.Item>Unlimited alerts</List.Item>
                        <List.Item>Ad sync (Meta Ads)</List.Item>
                        <List.Item>RTO tracking</List.Item>
                      </List>
                      <Button variant="primary" fullWidth onClick={handleStartTrial}>
                        Start Trial
                      </Button>
                    </BlockStack>
                  </Card>
                </Grid.Cell>
                <Grid.Cell>
                  <Card>
                    <BlockStack gap="200">
                      <Text variant="headingLg" as="h3">
                        Pro
                      </Text>
                      <InlineStack gap="100">
                        <Text variant="heading2xl" as="p">
                          $79
                        </Text>
                        <Text variant="bodyMd" as="p" tone="subdued">
                          /month
                        </Text>
                      </InlineStack>
                      <List>
                        <List.Item>Unlimited orders</List.Item>
                        <List.Item>Everything in Growth</List.Item>
                        <List.Item>Multi-store support</List.Item>
                        <List.Item>Priority support</List.Item>
                        <List.Item>Custom reports</List.Item>
                      </List>
                      <Button variant="primary" fullWidth onClick={handleStartTrial}>
                        Start Trial
                      </Button>
                    </BlockStack>
                  </Card>
                </Grid.Cell>
              </Grid>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* FAQ */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2" alignment="center">
                Frequently Asked Questions
              </Text>
              <BlockStack gap="200">
                <div>
                  <Text variant="headingSm" as="h3">
                    What data do you have access to?
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    We connect to your Shopify store to sync your order data. We never access customer personal information beyond what's needed to calculate profit.
                  </Text>
                </div>
                <div>
                  <Text variant="headingSm" as="h3">
                    How does the free trial work?
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    14 days free. No credit card required. Cancel anytime. If you like it, your subscription starts after 14 days.
                  </Text>
                </div>
                <div>
                  <Text variant="headingSm" as="h3">
                    Can I export my data?
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Yes! All reports can be exported as CSV. Your data is always yours.
                  </Text>
                </div>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Box>
  );
}
