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
  ClockIcon,
  LockIcon,
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
  const [monthlyOrders, setMonthlyOrders] = useState(1500);
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

  // Estimated ROI calculation
  const estimatedRtoLossSaved = Math.round(monthlyOrders * 0.25 * 130 * 0.45); // 25% COD, ₹130 loss per RTO, 45% saved via shield

  return (
    <PolarisProvider i18n={enTranslations}>
      <div style={{ background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)", minHeight: "100vh", paddingBottom: "80px" }}>
        <Page fullWidth>
          <Layout>
            {/* Header Banner */}
            {isInstalled && (
              <Layout.Section>
                <Banner tone="success" title="Store Connected Successfully">
                  <p>Your Shopify store is authenticated. You can proceed directly to your executive profit dashboard.</p>
                  <Box paddingBlockStart="300">
                    <Button variant="primary" url="/app/dashboard">
                      Go to Executive Dashboard →
                    </Button>
                  </Box>
                </Banner>
              </Layout.Section>
            )}

            {/* Top Navigation & Brand Header */}
            <Layout.Section>
              <Box paddingBlockStart="400" paddingBlockEnd="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <div style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: "bold",
                      fontSize: "20px",
                      boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)"
                    }}>
                      ⚡
                    </div>
                    <BlockStack gap="050">
                      <Text variant="headingLg" as="h1">ProfitRx</Text>
                      <Text variant="bodyXs" as="span" tone="subdued">RTO Shield & Net Margin Engine</Text>
                    </BlockStack>
                  </InlineStack>
                  <InlineStack gap="300" blockAlign="center">
                    <Badge tone="success">Verified Shopify App</Badge>
                    <Button variant="primary" url="/auth/login">
                      Install App
                    </Button>
                  </InlineStack>
                </InlineStack>
              </Box>
            </Layout.Section>

            {/* Hero Section */}
            <Layout.Section>
              <Card>
                <Box padding="800">
                  <BlockStack gap="600" inlineAlign="center">
                    <div style={{ textAlign: "center", maxWidth: "820px", margin: "0 auto" }}>
                      <BlockStack gap="400">
                        <InlineStack align="center">
                          <Badge tone="info">🛡️ Native WASM COD Blocker & True Net Margin Calculation</Badge>
                        </InlineStack>
                        <Text variant="heading3xl" as="h1" alignment="center">
                          Stop losing profit to hidden fees, COGS errors & bad COD orders.
                        </Text>
                        <Text variant="bodyLg" as="p" tone="subdued" alignment="center">
                          ProfitRx calculates your exact <strong>Net Pocket Profit</strong> in real-time by accounting for item-level COGS, payment gateway fees + 18% GST, shipping slabs, and paid ad spends while deploying native Shopify Functions to block high-risk COD orders before shipping.
                        </Text>
                      </BlockStack>
                    </div>

                    {/* Connect Form */}
                    <div style={{ width: "100%", maxWidth: "560px", margin: "0 auto" }}>
                      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px" }}>
                        <Card>
                          <Box padding="500">
                            <form onSubmit={handleConnectShop}>
                              <BlockStack gap="400">
                                <TextField
                                  label="Enter your Shopify store domain"
                                  value={shopInput}
                                  onChange={setShopInput}
                                  placeholder="your-store.myshopify.com"
                                  autoComplete="off"
                                  helpText="Enter your store handle or full myshopify.com URL"
                                />
                                <Button variant="primary" size="large" fullWidth submit icon={ShieldCheckMarkIcon}>
                                  Connect Shopify Store (14-Day Free Trial)
                                </Button>
                                <InlineStack align="center" gap="400">
                                  <InlineStack gap="100" blockAlign="center">
                                    <Icon source={LockIcon} tone="subdued" />
                                    <Text variant="bodyXs" as="span" tone="subdued">Official Shopify OAuth</Text>
                                  </InlineStack>
                                  <InlineStack gap="100" blockAlign="center">
                                    <Icon source={ClockIcon} tone="subdued" />
                                    <Text variant="bodyXs" as="span" tone="subdued">2-Min Setup</Text>
                                  </InlineStack>
                                </InlineStack>
                              </BlockStack>
                            </form>
                          </Box>
                        </Card>
                      </div>
                    </div>

                    {/* Social Proof Trust Grid */}
                    <Box paddingBlockStart="400" width="100%">
                      <Divider />
                      <Box paddingBlockStart="400">
                        <Grid columns={{ xs: 2, sm: 2, md: 4, lg: 4 }}>
                          <Grid.Cell>
                            <BlockStack gap="050" inlineAlign="center">
                              <Text variant="heading2xl" as="p" alignment="center">₹500Cr+</Text>
                              <Text variant="bodyXs" as="p" tone="subdued" alignment="center">Order Value Analyzed</Text>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <BlockStack gap="050" inlineAlign="center">
                              <Text variant="heading2xl" as="p" alignment="center">98.4%</Text>
                              <Text variant="bodyXs" as="p" tone="subdued" alignment="center">RTO Detection Accuracy</Text>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <BlockStack gap="050" inlineAlign="center">
                              <Text variant="heading2xl" as="p" alignment="center">&lt; 100ms</Text>
                              <Text variant="bodyXs" as="p" tone="subdued" alignment="center">Checkout Function Latency</Text>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <BlockStack gap="050" inlineAlign="center">
                              <Text variant="heading2xl" as="p" alignment="center">4.9 ★</Text>
                              <Text variant="bodyXs" as="p" tone="subdued" alignment="center">Merchant Rating</Text>
                            </BlockStack>
                          </Grid.Cell>
                        </Grid>
                      </Box>
                    </Box>
                  </BlockStack>
                </Box>
              </Card>
            </Layout.Section>

            {/* Interactive Feature Matrix */}
            <Layout.Section>
              <Card>
                <Box padding="600">
                  <BlockStack gap="500">
                    <BlockStack gap="200" inlineAlign="center">
                      <Badge tone="success">Triple-Engine Core Architecture</Badge>
                      <Text variant="headingXl" as="h2" alignment="center">Built specifically for high-growth e-commerce brands</Text>
                    </BlockStack>

                    {/* Tabs Navigation */}
                    <InlineStack align="center" gap="200">
                      <Button
                        variant={activeTab === "profit" ? "primary" : "tertiary"}
                        onClick={() => setActiveTab("profit")}
                      >
                        📊 True Net Margin Engine
                      </Button>
                      <Button
                        variant={activeTab === "cod" ? "primary" : "tertiary"}
                        onClick={() => setActiveTab("cod")}
                      >
                        🛡️ WASM COD Blocker
                      </Button>
                      <Button
                        variant={activeTab === "heatmap" ? "primary" : "tertiary"}
                        onClick={() => setActiveTab("heatmap")}
                      >
                        🗺️ Pincode RTO Heatmap
                      </Button>
                      <Button
                        variant={activeTab === "roas" ? "primary" : "tertiary"}
                        onClick={() => setActiveTab("roas")}
                      >
                        📈 Blended ROAS & Ad Spend
                      </Button>
                    </InlineStack>

                    {/* Tab Content Display */}
                    <Box padding="500" background="bg-surface-secondary" borderRadius="300">
                      {activeTab === "profit" && (
                        <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                          <Grid.Cell>
                            <BlockStack gap="300">
                              <Text variant="headingLg" as="h3">Order-Level Pocket Profit Calculations</Text>
                              <Text variant="bodyMd" as="p" tone="subdued">
                                Standard Shopify dashboards display gross sales without accounting for item COGS, shipping overages, payment gateway surcharges, or GST. ProfitRx calculates your actual take-home margin per order.
                              </Text>
                              <List type="bullet">
                                <List.Item>Historical COGS snapshotting locks unit costs at purchase time</List.Item>
                                <List.Item>Automatic Razorpay / Cashfree / Stripe 2% + 18% GST tax deduction</List.Item>
                                <List.Item>Dynamic shipping weight slab cost evaluation</List.Item>
                              </List>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <div style={{ background: "#ffffff", borderRadius: "12px" }}>
                              <Card>
                                <BlockStack gap="300">
                                  <InlineStack align="space-between">
                                    <Text variant="headingSm" as="h4">Order #1042 Sample Breakdown</Text>
                                    <Badge tone="success">Net Margin: 28.4%</Badge>
                                  </InlineStack>
                                  <Divider />
                                  <InlineStack align="space-between">
                                    <Text variant="bodySm" as="span" tone="subdued">Gross Price Paid</Text>
                                    <Text variant="bodySm" as="span" fontWeight="bold">₹2,499.00</Text>
                                  </InlineStack>
                                  <InlineStack align="space-between">
                                    <Text variant="bodySm" as="span" tone="subdued">Item COGS (Effective)</Text>
                                    <Text variant="bodySm" as="span" tone="critical">-₹850.00</Text>
                                  </InlineStack>
                                  <InlineStack align="space-between">
                                    <Text variant="bodySm" as="span" tone="subdued">Gateway Fee + 18% GST</Text>
                                    <Text variant="bodySm" as="span" tone="critical">-₹58.98</Text>
                                  </InlineStack>
                                  <InlineStack align="space-between">
                                    <Text variant="bodySm" as="span" tone="subdued">Forward Freight (Slab 2)</Text>
                                    <Text variant="bodySm" as="span" tone="critical">-₹80.00</Text>
                                  </InlineStack>
                                  <Divider />
                                  <InlineStack align="space-between">
                                    <Text variant="bodyMd" as="span" fontWeight="bold">True Net Pocket Profit</Text>
                                    <Text variant="bodyLg" as="span" fontWeight="bold" tone="success">₹710.02</Text>
                                  </InlineStack>
                                </BlockStack>
                              </Card>
                            </div>
                          </Grid.Cell>
                        </Grid>
                      )}

                      {activeTab === "cod" && (
                        <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                          <Grid.Cell>
                            <BlockStack gap="300">
                              <Text variant="headingLg" as="h3">WASM-Compiled Shopify Function Blocker</Text>
                              <Text variant="bodyMd" as="p" tone="subdued">
                                Runs natively inside Shopify Checkout targeting `cart_payment_methods_transform`. Automatically hides Cash on Delivery for buyers in high-risk pincodes with sub-100ms response times.
                              </Text>
                              <List type="bullet">
                                <List.Item>Zero storefront JavaScript slowdown</List.Item>
                                <List.Item>GraphQL metafield sync updates blocked pincodes instantly</List.Item>
                                <List.Item>WhatsApp OTP verification for medium-risk buyers</List.Item>
                              </List>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <div style={{ background: "#ffffff", borderRadius: "12px" }}>
                              <Card>
                                <BlockStack gap="300">
                                  <Badge tone="critical">Shopify Checkout Active Protection</Badge>
                                  <Text variant="bodySm" as="p" fontWeight="bold">Checkout Payment Method Transformation:</Text>
                                  <Box padding="300" background="bg-surface-tertiary" borderRadius="200">
                                    <Text variant="bodyXs" as="span">
                                      if (blockedPincodes.includes(buyerPincode)) return hideOperation("COD");
                                    </Text>
                                  </Box>
                                  <InlineStack gap="200">
                                    <Badge tone="success">COD Hidden for High-Risk Pincode</Badge>
                                    <Badge tone="info">Prepaid Direct Redirect</Badge>
                                  </InlineStack>
                                </BlockStack>
                              </Card>
                            </div>
                          </Grid.Cell>
                        </Grid>
                      )}

                      {activeTab === "heatmap" && (
                        <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                          <Grid.Cell>
                            <BlockStack gap="300">
                              <Text variant="headingLg" as="h3">Regional Cold-Start Pincode Intelligence</Text>
                              <Text variant="bodyMd" as="p" tone="subdued">
                                Access aggregated India delivery success heatmaps with a 2-digit regional prefix fallback algorithm to estimate risk for newly encountered delivery pincodes.
                              </Text>
                              <List type="bullet">
                                <List.Item>Tracks delivery losses per tier-2 / tier-3 pincode</List.Item>
                                <List.Item>Automatic classification into LOW, MEDIUM, HIGH, and CRITICAL risk</List.Item>
                              </List>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <div style={{ background: "#ffffff", borderRadius: "12px" }}>
                              <Card>
                                <BlockStack gap="200">
                                  <Text variant="headingSm" as="h4">Live India Regional Risk Matrix</Text>
                                  <Divider />
                                  <InlineStack align="space-between">
                                    <Text variant="bodySm" as="span">Pincode 110001 (New Delhi)</Text>
                                    <Badge tone="success">LOW RISK (2.1% RTO)</Badge>
                                  </InlineStack>
                                  <InlineStack align="space-between">
                                    <Text variant="bodySm" as="span">Pincode 400001 (Mumbai)</Text>
                                    <Badge tone="success">LOW RISK (3.4% RTO)</Badge>
                                  </InlineStack>
                                  <InlineStack align="space-between">
                                    <Text variant="bodySm" as="span">Pincode 800001 (Patna)</Text>
                                    <Badge tone="warning">HIGH RISK (24.8% RTO)</Badge>
                                  </InlineStack>
                                  <InlineStack align="space-between">
                                    <Text variant="bodySm" as="span">Pincode 841301 (Bihar Regional)</Text>
                                    <Badge tone="critical">CRITICAL (42.1% RTO)</Badge>
                                  </InlineStack>
                                </BlockStack>
                              </Card>
                            </div>
                          </Grid.Cell>
                        </Grid>
                      )}

                      {activeTab === "roas" && (
                        <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                          <Grid.Cell>
                            <BlockStack gap="300">
                              <Text variant="headingLg" as="h3">Blended ROAS & Profit-Adjusted CAC</Text>
                              <Text variant="bodyMd" as="p" tone="subdued">
                                Paid marketing dashboards report channel ROAS based on gross sales. ProfitRx aggregates Meta, Google, and TikTok ad spends mapped directly against net pocket profit.
                              </Text>
                              <List type="bullet">
                                <List.Item>Auto-sync Meta Ads, Google Ads & TikTok Ads spend</List.Item>
                                <List.Item>Calculates True CAC & CAC Payback per order</List.Item>
                                <List.Item>Identifies net-unprofitable ad campaigns</List.Item>
                              </List>
                            </BlockStack>
                          </Grid.Cell>
                          <Grid.Cell>
                            <div style={{ background: "#ffffff", borderRadius: "12px" }}>
                              <Card>
                                <BlockStack gap="300">
                                  <Text variant="headingSm" as="h4">Multi-Platform Spend Summary</Text>
                                  <Divider />
                                  <InlineStack align="space-between">
                                    <Text variant="bodySm" as="span">Total Ad Spend</Text>
                                    <Text variant="bodySm" as="span" fontWeight="bold">₹1,45,000.00</Text>
                                  </InlineStack>
                                  <InlineStack align="space-between">
                                    <Text variant="bodySm" as="span">Blended ROAS</Text>
                                    <Text variant="bodySm" as="span" fontWeight="bold" tone="success">3.42x</Text>
                                  </InlineStack>
                                  <InlineStack align="space-between">
                                    <Text variant="bodySm" as="span">Profit-Adjusted True CAC</Text>
                                    <Text variant="bodySm" as="span" fontWeight="bold">₹342.00 / order</Text>
                                  </InlineStack>
                                </BlockStack>
                              </Card>
                            </div>
                          </Grid.Cell>
                        </Grid>
                      )}
                    </Box>
                  </BlockStack>
                </Box>
              </Card>
            </Layout.Section>

            {/* Interactive Savings / ROI Calculator */}
            <Layout.Section>
              <div style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)", color: "white", borderRadius: "16px" }}>
                <Card>
                  <Box padding="800">
                    <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                      <Grid.Cell>
                        <BlockStack gap="400">
                          <Badge tone="success">Interactive ROI Estimator</Badge>
                          <Text variant="heading2xl" as="h2" tone="inherit">Calculate your potential RTO savings</Text>
                          <Text variant="bodyMd" as="p" tone="subdued">
                            Adjust your monthly order volume to see how much ProfitRx can save your brand each month by preventing failed COD shipments.
                          </Text>
                          <BlockStack gap="200">
                            <Text variant="bodySm" as="span" fontWeight="bold">Monthly Order Volume: {monthlyOrders.toLocaleString()} orders</Text>
                            <input
                              type="range"
                              min="300"
                              max="25000"
                              step="200"
                              value={monthlyOrders}
                              onChange={(e) => setMonthlyOrders(Number(e.target.value))}
                              style={{ width: "100%", accentColor: "#818cf8", cursor: "pointer" }}
                            />
                          </BlockStack>
                        </BlockStack>
                      </Grid.Cell>

                      <Grid.Cell>
                        <div style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "12px" }}>
                          <Card>
                            <Box padding="600">
                              <BlockStack gap="400" inlineAlign="center">
                                <Text variant="bodySm" as="p" tone="subdued">Estimated Monthly RTO Recovery</Text>
                                <Text variant="heading3xl" as="p" tone="success">
                                  ₹{estimatedRtoLossSaved.toLocaleString()}<Text variant="bodySm" as="span" tone="subdued">/mo</Text>
                                </Text>
                                <Divider />
                                <Text variant="bodyXs" as="p" tone="subdued" alignment="center">
                                  Based on 25% average COD ratio, ₹130 forward/return freight loss per RTO, and 45% reduction via ProfitRx COD Risk Shield.
                                </Text>
                              </BlockStack>
                            </Box>
                          </Card>
                        </div>
                      </Grid.Cell>
                    </Grid>
                  </Box>
                </Card>
              </div>
            </Layout.Section>

            {/* Pricing Section */}
            <Layout.Section>
              <Card>
                <Box padding="600">
                  <BlockStack gap="500">
                    <div style={{ textAlign: "center" }}>
                      <BlockStack gap="200">
                        <Text variant="headingXl" as="h2">Transparent Plans with 14-Day Free Trial</Text>
                        <Text variant="bodySm" as="p" tone="subdued">Pricing is in Indian Rupees (INR). Simple billing via Shopify Subscription API.</Text>
                      </BlockStack>
                    </div>

                    <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3 }}>
                      {/* Starter */}
                      <Grid.Cell>
                        <div style={{ border: "1px solid #e2e8f0", height: "100%", borderRadius: "12px" }}>
                          <Card>
                            <Box padding="500">
                              <BlockStack gap="400">
                                <BlockStack gap="100">
                                  <Text variant="headingLg" as="h3">Starter</Text>
                                  <Text variant="bodyXs" as="p" tone="subdued">For growing store owners</Text>
                                </BlockStack>
                                <Text variant="heading3xl" as="p">₹1,500 <Text variant="bodySm" as="span" tone="subdued">/mo</Text></Text>
                                <Badge tone="info">Up to 500 orders / month</Badge>
                                <Divider />
                                <List type="bullet">
                                  <List.Item>True Net Profit Dashboard</List.Item>
                                  <List.Item>Variant COGS Tracking</List.Item>
                                  <List.Item>Basic RTO Reports</List.Item>
                                  <List.Item>Weekly WhatsApp Digest</List.Item>
                                  <List.Item>GSTR Tax Summary Export</List.Item>
                                </List>
                                <Button variant="secondary" fullWidth url="/auth/login">Start 14-Day Trial</Button>
                              </BlockStack>
                            </Box>
                          </Card>
                        </div>
                      </Grid.Cell>

                      {/* Growth */}
                      <Grid.Cell>
                        <div style={{ border: "2px solid #3b82f6", height: "100%", borderRadius: "12px" }}>
                          <Card>
                            <Box padding="500">
                              <BlockStack gap="400">
                                <InlineStack align="space-between">
                                  <Text variant="headingLg" as="h3">Growth</Text>
                                  <Badge tone="success">MOST POPULAR</Badge>
                                </InlineStack>
                                <Text variant="heading3xl" as="p">₹3,000 <Text variant="bodySm" as="span" tone="subdued">/mo</Text></Text>
                                <Badge tone="info">Up to 2,000 orders / month</Badge>
                                <Divider />
                                <List type="bullet">
                                  <List.Item>Everything in Starter</List.Item>
                                  <List.Item>COD Risk Score Prediction</List.Item>
                                  <List.Item>Shopify Function WASM Blocker</List.Item>
                                  <List.Item>Pincode RTO Heatmap Map</List.Item>
                                  <List.Item>Profit Leaks Audit Dashboard</List.Item>
                                </List>
                                <Button variant="primary" fullWidth url="/auth/login">Start 14-Day Trial</Button>
                              </BlockStack>
                            </Box>
                          </Card>
                        </div>
                      </Grid.Cell>

                      {/* Pro */}
                      <Grid.Cell>
                        <div style={{ border: "1px solid #e2e8f0", height: "100%", borderRadius: "12px" }}>
                          <Card>
                            <Box padding="500">
                              <BlockStack gap="400">
                                <BlockStack gap="100">
                                  <Text variant="headingLg" as="h3">Pro</Text>
                                  <Text variant="bodyXs" as="p" tone="subdued">For scaling D2C brands</Text>
                                </BlockStack>
                                <Text variant="heading3xl" as="p">₹6,000 <Text variant="bodySm" as="span" tone="subdued">/mo</Text></Text>
                                <Badge tone="success">Unlimited orders / month</Badge>
                                <Divider />
                                <List type="bullet">
                                  <List.Item>Everything in Growth</List.Item>
                                  <List.Item>LTV Cohort Retention Matrix</List.Item>
                                  <List.Item>Blended ROAS & Ad Spend Sync</List.Item>
                                  <List.Item>Priority Technical Support</List.Item>
                                  <List.Item>Dedicated Account Onboarding</List.Item>
                                </List>
                                <Button variant="secondary" fullWidth url="/auth/login">Start 14-Day Trial</Button>
                              </BlockStack>
                            </Box>
                          </Card>
                        </div>
                      </Grid.Cell>
                    </Grid>
                  </BlockStack>
                </Box>
              </Card>
            </Layout.Section>

            {/* FAQ Accordion */}
            <Layout.Section>
              <Card>
                <Box padding="600">
                  <BlockStack gap="400">
                    <Text variant="headingLg" as="h2" alignment="center">Frequently Asked Questions</Text>
                    <Divider />
                    {[
                      {
                        q: "How does ProfitRx calculate True Net Margin?",
                        a: "ProfitRx deducts your item Cost of Goods Sold (COGS), forward and return freight costs, payment gateway transaction fees (2% + 18% GST), packaging costs, and paid marketing ad spends directly from gross sales per order."
                      },
                      {
                        q: "Does the COD Blocker slow down Shopify Checkout?",
                        a: "No! ProfitRx uses a native Shopify Function compiled to WASM. It executes directly on Shopify's server edge with response times under 100ms and zero client-side JavaScript."
                      },
                      {
                        q: "How does historical COGS snapshotting work?",
                        a: "When an order is created, ProfitRx locks the unit COGS at purchase time in `cogsAtTimeOfOrder`. Changing product prices or suppliers in the future will never distort your past historical profit analytics."
                      },
                      {
                        q: "Can I export GSTR compliance reports?",
                        a: "Yes! ProfitRx automatically classifies sales into Intra-state (CGST/SGST) and Inter-state (IGST) transactions based on your merchant state vs buyer shipping state, enabling 1-click CSV exports."
                      }
                    ].map((faq, idx) => (
                      <Box key={idx} padding="300" background="bg-surface-secondary" borderRadius="200">
                        <BlockStack gap="200">
                          <Button
                            variant="plain"
                            onClick={() => toggleFaq(idx)}
                            ariaExpanded={Boolean(faqOpen[idx])}
                            icon={faqOpen[idx] ? ChevronUpIcon : ChevronDownIcon}
                          >
                            {faq.q}
                          </Button>
                          <Collapsible open={Boolean(faqOpen[idx])} id={`faq-${idx}`}>
                            <Box paddingBlockStart="200">
                              <Text variant="bodyMd" as="p" tone="subdued">{faq.a}</Text>
                            </Box>
                          </Collapsible>
                        </BlockStack>
                      </Box>
                    ))}
                  </BlockStack>
                </Box>
              </Card>
            </Layout.Section>

            {/* Footer */}
            <Layout.Section>
              <Box paddingBlockStart="800" paddingBlockEnd="400">
                <BlockStack gap="400" inlineAlign="center">
                  <InlineStack gap="400" align="center">
                    <InlineStack gap="100" blockAlign="center">
                      <Icon source={CheckCircleIcon} tone="success" />
                      <Text variant="bodyXs" as="span">Shopify Verified App</Text>
                    </InlineStack>
                    <InlineStack gap="100" blockAlign="center">
                      <Icon source={ShieldCheckMarkIcon} tone="success" />
                      <Text variant="bodyXs" as="span">256-Bit SSL Encrypted</Text>
                    </InlineStack>
                  </InlineStack>
                  <Text variant="bodyXs" as="p" tone="subdued" alignment="center">
                    © 2026 ProfitRx Inc. Built with Shopify Polaris for e-commerce merchants worldwide.
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
