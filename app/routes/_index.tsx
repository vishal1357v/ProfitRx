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
  Box,
  Collapsible,
  Icon,
} from "@shopify/polaris";
import {
  ShieldCheckMarkIcon,
  CheckCircleIcon,
  LockIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@shopify/polaris-icons";
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
  const [activeTab, setActiveTab] = useState<"profit" | "cod" | "heatmap" | "roas">("profit");

  const [faqOpen, setFaqOpen] = useState<Record<number, boolean>>({ 0: true });

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

  const toggleFaq = (index: number) => {
    setFaqOpen((prev) => ({ ...prev, [index]: !prev[index] }));
  };



  return (
    <PolarisProvider i18n={enTranslations}>
      <div style={{ backgroundColor: "#ffffff", minHeight: "100vh", paddingBottom: "60px" }}>
        <Page fullWidth>
          <Layout>
            {/* Installed Banner */}
            {isInstalled && (
              <Layout.Section>
                <Banner tone="success" title="Store Connected">
                  <p>Your Shopify store is authenticated. You can proceed directly to your dashboard.</p>
                  <Box paddingBlockStart="300">
                    <Button variant="primary" url="/app/dashboard">
                      Go to Dashboard
                    </Button>
                  </Box>
                </Banner>
              </Layout.Section>
            )}

            {/* Header Navigation */}
            <Layout.Section>
              <Box paddingBlockStart="300" paddingBlockEnd="300">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        background: "#008060",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ffffff",
                        fontWeight: "bold",
                        fontSize: "18px",
                      }}
                    >
                      P
                    </div>
                    <BlockStack gap="050">
                      <Text variant="headingMd" as="h1">ProfitRx</Text>
                      <Text variant="bodyXs" as="span" tone="subdued">COD Risk Management &amp; Profit Tracking</Text>
                    </BlockStack>
                  </InlineStack>
                  <InlineStack gap="300" blockAlign="center">
                    <Badge tone="success">Shopify App</Badge>
                    <Button variant="primary" url="/auth/login">
                      Install App
                    </Button>
                  </InlineStack>
                </InlineStack>
              </Box>
              <Divider />
            </Layout.Section>

            {/* Main Overview & Store Connect */}
            <Layout.Section>
              <Box paddingBlockStart="400" paddingBlockEnd="400">
                <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                  <Grid.Cell>
                    <Box padding="400">
                      <BlockStack gap="400">
                        <Badge tone="info">Shopify Functions &amp; Analytics</Badge>
                        <Text variant="heading2xl" as="h2">
                          Cash on Delivery risk management and order profitability tracking
                        </Text>
                        <Text variant="bodyMd" as="p" tone="subdued">
                          ProfitRx calculates net order profit by deducting Cost of Goods Sold (COGS), shipping costs, payment gateway transaction fees, and GST. It provides tools to evaluate COD order risk and manage checkout availability.
                        </Text>
                        <List type="bullet">
                          <List.Item>Automated Cost of Goods Sold (COGS) tracking per variant</List.Item>
                          <List.Item>Checkout payment method rules via Shopify Functions</List.Item>
                          <List.Item>Optional WhatsApp OTP verification for customer confirmation</List.Item>
                          <List.Item>Delivery success analytics by postal code</List.Item>
                        </List>
                      </BlockStack>
                    </Box>
                  </Grid.Cell>

                  <Grid.Cell>
                    <Card>
                      <Box padding="500">
                        <form onSubmit={handleConnectShop}>
                          <BlockStack gap="400">
                            <Text variant="headingMd" as="h3">Connect Your Store</Text>
                            <TextField
                              label="Shopify store domain"
                              value={shopInput}
                              onChange={setShopInput}
                              placeholder="your-store.myshopify.com"
                              autoComplete="off"
                              helpText="Enter your store myshopify.com URL to get started"
                            />
                            <Button variant="primary" size="large" fullWidth submit icon={ShieldCheckMarkIcon}>
                              Connect Store
                            </Button>
                            <InlineStack align="center" gap="400">
                              <InlineStack gap="100" blockAlign="center">
                                <Icon source={LockIcon} tone="subdued" />
                                <Text variant="bodyXs" as="span" tone="subdued">Shopify OAuth</Text>
                              </InlineStack>
                              <InlineStack gap="100" blockAlign="center">
                                <Icon source={ClockIcon} tone="subdued" />
                                <Text variant="bodyXs" as="span" tone="subdued">14-Day Trial</Text>
                              </InlineStack>
                            </InlineStack>
                          </BlockStack>
                        </form>
                      </Box>
                    </Card>
                  </Grid.Cell>
                </Grid>
              </Box>
            </Layout.Section>

            {/* Core Capabilities */}
            <Layout.Section>
              <Card>
                <Box padding="600">
                  <BlockStack gap="500">
                    <BlockStack gap="100">
                      <Text variant="headingLg" as="h2">Core Features</Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Select a feature below to view how ProfitRx operates.
                      </Text>
                    </BlockStack>

                    <InlineStack gap="200">
                      <Button
                        variant={activeTab === "profit" ? "primary" : "secondary"}
                        onClick={() => setActiveTab("profit")}
                      >
                        Net Profit Calculation
                      </Button>
                      <Button
                        variant={activeTab === "cod" ? "primary" : "secondary"}
                        onClick={() => setActiveTab("cod")}
                      >
                        Checkout Rules (Shopify Functions)
                      </Button>
                      <Button
                        variant={activeTab === "heatmap" ? "primary" : "secondary"}
                        onClick={() => setActiveTab("heatmap")}
                      >
                        Pincode Analytics
                      </Button>
                      <Button
                        variant={activeTab === "roas" ? "primary" : "secondary"}
                        onClick={() => setActiveTab("roas")}
                      >
                        Ad Spend &amp; ROAS
                      </Button>
                    </InlineStack>

                    <Divider />

                    {activeTab === "profit" && (
                      <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                        <Grid.Cell>
                          <BlockStack gap="300">
                            <Text variant="headingMd" as="h3">Order Economics Breakdown</Text>
                            <Text variant="bodyMd" as="p" tone="subdued">
                              Standard analytics report gross revenue. ProfitRx calculates realized margin by deducting all associated fulfillment and transaction expenses.
                            </Text>
                            <List type="bullet">
                              <List.Item>COGS snapshot frozen at the time an order is placed</List.Item>
                              <List.Item>Payment gateway transaction fees and applicable GST</List.Item>
                              <List.Item>Forward and reverse shipping weight slab rates</List.Item>
                            </List>
                          </BlockStack>
                        </Grid.Cell>
                        <Grid.Cell>
                          <Card>
                            <BlockStack gap="200">
                              <Text variant="headingSm" as="h4">Sample Order Breakdown (#1042)</Text>
                              <Divider />
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span" tone="subdued">Order Total</Text>
                                <Text variant="bodySm" as="span">₹2,499.00</Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span" tone="subdued">Product COGS</Text>
                                <Text variant="bodySm" as="span" tone="critical">-₹850.00</Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span" tone="subdued">Forward Shipping</Text>
                                <Text variant="bodySm" as="span" tone="critical">-₹80.00</Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span" tone="subdued">Gateway Fee + GST</Text>
                                <Text variant="bodySm" as="span" tone="critical">-₹58.98</Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span" tone="subdued">Packaging</Text>
                                <Text variant="bodySm" as="span" tone="critical">-₹15.00</Text>
                              </InlineStack>
                              <Divider />
                              <InlineStack align="space-between">
                                <Text variant="bodyMd" as="span" fontWeight="bold">Net Profit</Text>
                                <Text variant="bodyMd" as="span" fontWeight="bold" tone="success">₹1,495.02</Text>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        </Grid.Cell>
                      </Grid>
                    )}

                    {activeTab === "cod" && (
                      <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                        <Grid.Cell>
                          <BlockStack gap="300">
                            <Text variant="headingMd" as="h3">Checkout Payment Customization</Text>
                            <Text variant="bodyMd" as="p" tone="subdued">
                              Uses Shopify Functions (WebAssembly) to adjust payment method visibility directly at checkout.
                            </Text>
                            <List type="bullet">
                              <List.Item>Runs directly on Shopify infrastructure at checkout</List.Item>
                              <List.Item>Hides Cash on Delivery for configured high-risk pincodes</List.Item>
                              <List.Item>Syncs rule configuration via Shopify GraphQL metafields</List.Item>
                            </List>
                          </BlockStack>
                        </Grid.Cell>
                        <Grid.Cell>
                          <Card>
                            <BlockStack gap="300">
                              <Text variant="headingSm" as="h4">Checkout Rule Status</Text>
                              <Divider />
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span">High-Risk Pincode (841301)</Text>
                                <Badge tone="critical">COD Hidden</Badge>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span">Standard Pincode (110001)</Text>
                                <Badge tone="success">COD Available</Badge>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span">Medium-Risk Order</Text>
                                <Badge tone="warning">OTP Prompt</Badge>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        </Grid.Cell>
                      </Grid>
                    )}

                    {activeTab === "heatmap" && (
                      <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                        <Grid.Cell>
                          <BlockStack gap="300">
                            <Text variant="headingMd" as="h3">Regional Delivery Analytics</Text>
                            <Text variant="bodyMd" as="p" tone="subdued">
                              View historical delivery completion rates across postal codes to inform your shipping and payment policies.
                            </Text>
                            <List type="bullet">
                              <List.Item>Tracks delivery and RTO rates by postal code</List.Item>
                              <List.Item>Categorizes areas into Low, Medium, and High delivery risk</List.Item>
                              <List.Item>CSV export of pincode performance data</List.Item>
                            </List>
                          </BlockStack>
                        </Grid.Cell>
                        <Grid.Cell>
                          <Card>
                            <BlockStack gap="200">
                              <Text variant="headingSm" as="h4">Postal Code Risk Overview</Text>
                              <Divider />
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span">110001 (New Delhi)</Text>
                                <Badge tone="success">Low Risk (2.1% RTO)</Badge>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span">400001 (Mumbai)</Text>
                                <Badge tone="success">Low Risk (3.4% RTO)</Badge>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span">800001 (Patna)</Text>
                                <Badge tone="warning">Medium Risk (24.8% RTO)</Badge>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        </Grid.Cell>
                      </Grid>
                    )}

                    {activeTab === "roas" && (
                      <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                        <Grid.Cell>
                          <BlockStack gap="300">
                            <Text variant="headingMd" as="h3">Ad Spend &amp; Marketing Margin</Text>
                            <Text variant="bodyMd" as="p" tone="subdued">
                              Input or sync marketing ad spend from Meta and Google to analyze profit-adjusted return on ad spend.
                            </Text>
                            <List type="bullet">
                              <List.Item>Blended ROAS calculated against realized net profit</List.Item>
                              <List.Item>Customer acquisition cost (CAC) tracking per order</List.Item>
                              <List.Item>Monthly marketing performance reports</List.Item>
                            </List>
                          </BlockStack>
                        </Grid.Cell>
                        <Grid.Cell>
                          <Card>
                            <BlockStack gap="200">
                              <Text variant="headingSm" as="h4">Marketing Metrics</Text>
                              <Divider />
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span">Total Ad Spend</Text>
                                <Text variant="bodySm" as="span">₹1,44,771</Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span">Attributed Revenue</Text>
                                <Text variant="bodySm" as="span">₹4,95,000</Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="span">Blended ROAS</Text>
                                <Text variant="bodySm" as="span" fontWeight="bold">3.42x</Text>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        </Grid.Cell>
                      </Grid>
                    )}
                  </BlockStack>
                </Box>
              </Card>
            </Layout.Section>



            {/* Plans */}
            <Layout.Section>
              <Card>
                <Box padding="600">
                  <BlockStack gap="500">
                    <BlockStack gap="100" inlineAlign="center">
                      <Text variant="headingLg" as="h2" alignment="center">Subscription Plans</Text>
                      <Text variant="bodySm" as="p" tone="subdued" alignment="center">
                        All plans include a 14-day free trial. Billed via the Shopify Billing API.
                      </Text>
                    </BlockStack>

                    <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3 }}>
                      <Grid.Cell>
                        <Card>
                          <Box padding="400">
                            <BlockStack gap="300">
                              <Text variant="headingMd" as="h3">Starter</Text>
                              <Text variant="headingLg" as="p">₹1,500 <Text variant="bodySm" as="span" tone="subdued">/mo</Text></Text>
                              <Badge tone="info">Up to 500 orders / month</Badge>
                              <Divider />
                              <List type="bullet">
                                <List.Item>Net profit dashboard</List.Item>
                                <List.Item>Variant COGS tracking</List.Item>
                                <List.Item>RTO reports</List.Item>
                                <List.Item>GSTR tax export</List.Item>
                              </List>
                              <Button fullWidth url="/auth/login">Select Plan</Button>
                            </BlockStack>
                          </Box>
                        </Card>
                      </Grid.Cell>

                      <Grid.Cell>
                        <Card>
                          <Box padding="400">
                            <BlockStack gap="300">
                              <Text variant="headingMd" as="h3">Growth</Text>
                              <Text variant="headingLg" as="p">₹3,999 <Text variant="bodySm" as="span" tone="subdued">/mo</Text></Text>
                              <Badge tone="info">Up to 2,000 orders / month</Badge>
                              <Divider />
                              <List type="bullet">
                                <List.Item>Everything in Starter</List.Item>
                                <List.Item>Shopify Function COD blocker</List.Item>
                                <List.Item>Pincode RTO risk heatmap</List.Item>
                                <List.Item>Ad spend sync (Meta &amp; Google)</List.Item>
                                <List.Item>WhatsApp OTP verification</List.Item>
                              </List>
                              <Button variant="primary" fullWidth url="/auth/login">Select Plan</Button>
                            </BlockStack>
                          </Box>
                        </Card>
                      </Grid.Cell>

                      <Grid.Cell>
                        <Card>
                          <Box padding="400">
                            <BlockStack gap="300">
                              <Text variant="headingMd" as="h3">Scale</Text>
                              <Text variant="headingLg" as="p">₹7,999 <Text variant="bodySm" as="span" tone="subdued">/mo</Text></Text>
                              <Badge tone="info">Unlimited orders</Badge>
                              <Divider />
                              <List type="bullet">
                                <List.Item>Everything in Growth</List.Item>
                                <List.Item>Custom risk model weighting</List.Item>
                                <List.Item>Multi-channel API access</List.Item>
                                <List.Item>Priority support</List.Item>
                              </List>
                              <Button fullWidth url="/auth/login">Select Plan</Button>
                            </BlockStack>
                          </Box>
                        </Card>
                      </Grid.Cell>
                    </Grid>
                  </BlockStack>
                </Box>
              </Card>
            </Layout.Section>

            {/* FAQ */}
            <Layout.Section>
              <Card>
                <Box padding="600">
                  <BlockStack gap="400">
                    <Text variant="headingLg" as="h2">Frequently Asked Questions</Text>
                    {[
                      {
                        q: "How does ProfitRx calculate net profit per order?",
                        a: "ProfitRx deducts product Cost of Goods Sold (COGS), forward and return courier freight, payment gateway charges (2% + 18% GST), and packaging expenses from gross order revenue."
                      },
                      {
                        q: "How does the checkout COD blocker work?",
                        a: "The app uses a Shopify Function (compiled to WebAssembly) targeting cart_payment_methods_transform. It runs on Shopify's edge infrastructure to hide Cash on Delivery for designated high-risk postal codes."
                      },
                      {
                        q: "What data does ProfitRx access?",
                        a: "ProfitRx accesses store orders, line item details, shipping addresses (postal codes and cities for risk evaluation), and fulfillment delivery statuses as disclosed in our Privacy Policy."
                      },
                      {
                        q: "How does the 14-day free trial work?",
                        a: "You receive full access to all features on your selected plan for 14 days. Billing begins only after the trial concludes, and you can cancel anytime from your Shopify admin."
                      }
                    ].map((item, idx) => (
                      <div key={idx} style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "16px", background: "#ffffff" }}>
                        <InlineStack align="space-between" blockAlign="center">
                          <Text variant="headingSm" as="h3">{item.q}</Text>
                          <Button
                            variant="plain"
                            icon={faqOpen[idx] ? ChevronUpIcon : ChevronDownIcon}
                            onClick={() => toggleFaq(idx)}
                          />
                        </InlineStack>
                        <Collapsible id={`faq-${idx}`} open={!!faqOpen[idx]}>
                          <Box paddingBlockStart="300">
                            <Text variant="bodyMd" as="p" tone="subdued">{item.a}</Text>
                          </Box>
                        </Collapsible>
                      </div>
                    ))}
                  </BlockStack>
                </Box>
              </Card>
            </Layout.Section>

            {/* Footer */}
            <Layout.Section>
              <Box paddingBlockStart="600" paddingBlockEnd="400">
                <BlockStack gap="300" inlineAlign="center">
                  <InlineStack gap="400" align="center">
                    <InlineStack gap="100" blockAlign="center">
                      <Icon source={CheckCircleIcon} tone="success" />
                      <Text variant="bodyXs" as="span">Shopify App Bridge</Text>
                    </InlineStack>
                    <InlineStack gap="100" blockAlign="center">
                      <Icon source={ShieldCheckMarkIcon} tone="success" />
                      <Text variant="bodyXs" as="span">Encrypted Storage</Text>
                    </InlineStack>
                    <Button variant="plain" url="/privacy">Privacy Policy</Button>
                  </InlineStack>
                  <Text variant="bodyXs" as="p" tone="subdued" alignment="center">
                    © 2026 ProfitRx Inc. Built for Shopify.
                  </Text>
                </BlockStack>
              </Box>
            </Layout.Section>
          </Layout>
        </Page>
      </div>
    </PolarisProvider>
  );
}
