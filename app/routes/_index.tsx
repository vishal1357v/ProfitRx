import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, redirect } from "react-router";
import {
  AppProvider as PolarisProvider,
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  TextField,
  Grid,
  Badge,
  Banner,
  Divider,
  List,
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

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
  const [shopInput, setShopInput] = useState("");

  const handleConnectShop = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let cleanedDomain = shopInput.trim().toLowerCase();
    if (!cleanedDomain) return;

    if (!cleanedDomain.includes(".")) {
      cleanedDomain = `${cleanedDomain}.myshopify.com`;
    }
    if (!cleanedDomain.startsWith("http")) {
      cleanedDomain = `https://${cleanedDomain}`;
    }

    try {
      const parsedUrl = new URL(cleanedDomain);
      const host = parsedUrl.hostname;
      window.location.href = `/auth/login?shop=${encodeURIComponent(host)}`;
    } catch {
      window.location.href = `/auth/login?shop=${encodeURIComponent(shopInput.trim())}`;
    }
  };

  return (
    <PolarisProvider i18n={enTranslations}>
      <div style={{ background: "#ffffff", minHeight: "100vh", paddingBottom: "60px" }}>
        <Page fullWidth>
          <Layout>
            {/* Header Banner */}
            {isInstalled && (
              <Layout.Section>
                <Banner tone="success" title="Store Connected">
                  <p>Your Shopify store is authenticated. You can proceed directly to your executive dashboard.</p>
                  <div style={{ marginTop: "12px" }}>
                    <Button variant="primary" url="/app/dashboard">
                      Go to Profit Dashboard →
                    </Button>
                  </div>
                </Banner>
              </Layout.Section>
            )}

            {/* Top Navigation & Brand Header */}
            <Layout.Section>
              <Card>
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <span style={{ fontSize: "24px" }}>⚡</span>
                    <Text variant="headingLg" as="h1">
                      ProfitRx
                    </Text>
                  </InlineStack>
                  <InlineStack gap="300" blockAlign="center">
                    <Badge tone="success">Active India Moat Engine</Badge>
                    <Button variant="primary" onClick={() => handleConnectShop()}>
                      Install App
                    </Button>
                  </InlineStack>
                </InlineStack>
              </Card>
            </Layout.Section>

            {/* Hero Section */}
            <Layout.Section>
              <Card>
                <BlockStack gap="500" inlineAlign="center">
                  <div style={{ textAlign: "center", maxWidth: "800px", margin: "0 auto" }}>
                    <BlockStack gap="300">
                      <InlineStack align="center">
                        <Badge tone="info">🛡️ COD Management & True Profit Intelligence for Indian Merchants</Badge>
                      </InlineStack>
                      <Text variant="heading3xl" as="h1" alignment="center">
                        Master your store's profit with true precision.
                      </Text>
                      <Text variant="bodyLg" as="p" tone="subdued" alignment="center">
                        Connect your Shopify store in 1 click. Automatically sync COGS, calculate Razorpay/Shopify transaction fees + 18% GST, and block high-risk COD orders before shipping.
                      </Text>
                    </BlockStack>
                  </div>

                  {/* Connect Form */}
                  <div style={{ width: "high", maxWidth: "540px", margin: "0 auto" }}>
                    <Card>
                      <form onSubmit={handleConnectShop}>
                        <BlockStack gap="300">
                          <TextField
                            label="Enter your myshopify store domain"
                            value={shopInput}
                            onChange={setShopInput}
                            placeholder="your-store-name.myshopify.com"
                            autoComplete="off"
                          />
                          <Button variant="primary" size="large" fullWidth submit>
                            Connect Shopify Store →
                          </Button>
                          <Text variant="bodyXs" as="p" tone="subdued" alignment="center">
                            🔒 Official Shopify OAuth • 14-Day Free Trial • Instant Setup
                          </Text>
                        </BlockStack>
                      </form>
                    </Card>
                  </div>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Key Features Section */}
            <Layout.Section>
              <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
                <Grid.Cell>
                  <Card>
                    <BlockStack gap="300">
                      <span style={{ fontSize: "28px" }}>📦</span>
                      <Text variant="headingMd" as="h3">Automated Native COGS Sync</Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        No CSV friction. ProfitRx automatically fetches native `Cost per item` fields directly from your Shopify variant catalog.
                      </Text>
                      <Badge tone="success">Native Variant Costs Active</Badge>
                    </BlockStack>
                  </Card>
                </Grid.Cell>

                <Grid.Cell>
                  <Card>
                    <BlockStack gap="300">
                      <span style={{ fontSize: "28px" }}>🛡️</span>
                      <Text variant="headingMd" as="h3">COD Risk & Pincode Shield</Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Pinpoint high-RTO delivery pincodes turning orders loss-making, enforce OTP verification, and collect partial deposits.
                      </Text>
                      <Badge tone="attention">RTO Losses Eliminated</Badge>
                    </BlockStack>
                  </Card>
                </Grid.Cell>

                <Grid.Cell>
                  <Card>
                    <BlockStack gap="300">
                      <span style={{ fontSize: "28px" }}>📑</span>
                      <Text variant="headingMd" as="h3">GST Compliance & GSTR Export</Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Intra-state (CGST/SGST) vs Inter-state (IGST) tax split calculation with 1-click GSTR-1 and GSTR-3B CSV downloads.
                      </Text>
                      <Badge tone="info">Ready-to-File Tax Reports</Badge>
                    </BlockStack>
                  </Card>
                </Grid.Cell>
              </Grid>
            </Layout.Section>

            {/* Pricing Section */}
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <div style={{ textAlign: "center" }}>
                    <Text variant="headingLg" as="h2">Transparent Indian Rupee Pricing</Text>
                    <Text variant="bodySm" as="p" tone="subdued">Prices are exclusive of 18% GST. Try any plan risk-free for 14 days.</Text>
                  </div>
                  <Divider />
                  <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3 }}>
                    <Grid.Cell>
                      <Card>
                        <BlockStack gap="200">
                          <Text variant="headingMd" as="h3">Starter</Text>
                          <Text variant="heading2xl" as="p">₹1,500 <Text variant="bodySm" as="span" tone="subdued">/mo</Text></Text>
                          <Text variant="bodySm" as="p" tone="subdued">Up to 500 orders / month</Text>
                          <List>
                            <List.Item>True Profit Dashboard</List.Item>
                            <List.Item>Product COGS Tracking</List.Item>
                            <List.Item>Weekly WhatsApp Digest</List.Item>
                          </List>
                        </BlockStack>
                      </Card>
                    </Grid.Cell>

                    <Grid.Cell>
                      <Card>
                        <BlockStack gap="200">
                          <InlineStack align="space-between">
                            <Text variant="headingMd" as="h3">Growth</Text>
                            <Badge tone="success">Popular</Badge>
                          </InlineStack>
                          <Text variant="heading2xl" as="p">₹3,000 <Text variant="bodySm" as="span" tone="subdued">/mo</Text></Text>
                          <Text variant="bodySm" as="p" tone="subdued">Up to 2,000 orders / month</Text>
                          <List>
                            <List.Item>Everything in Starter</List.Item>
                            <List.Item>Pincode RTO Heatmap</List.Item>
                            <List.Item>COD Risk Score Prediction</List.Item>
                          </List>
                        </BlockStack>
                      </Card>
                    </Grid.Cell>

                    <Grid.Cell>
                      <Card>
                        <BlockStack gap="200">
                          <Text variant="headingMd" as="h3">Pro</Text>
                          <Text variant="heading2xl" as="p">₹6,000 <Text variant="bodySm" as="span" tone="subdued">/mo</Text></Text>
                          <Text variant="bodySm" as="p" tone="subdued">Unlimited orders / month</Text>
                          <List>
                            <List.Item>Everything in Growth</List.Item>
                            <List.Item>LTV & Cohort Retention</List.Item>
                            <List.Item>Blended ROAS & Spend Sync</List.Item>
                          </List>
                        </BlockStack>
                      </Card>
                    </Grid.Cell>
                  </Grid>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Footer */}
            <Layout.Section>
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <Text variant="bodySm" as="p" tone="subdued">
                  © 2026 ProfitRx. Built with Polaris for ambitious Indian Shopify merchants.
                </Text>
              </div>
            </Layout.Section>
          </Layout>
        </Page>
      </div>
    </PolarisProvider>
  );
}
