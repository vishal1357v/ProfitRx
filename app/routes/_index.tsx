import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, redirect } from "react-router";
import {
  AppProvider,
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  TextField,
  Badge,
  Banner,
  Divider,
  List,
  Box,
  Icon,
  Collapsible,
  InlineGrid,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
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
  return { showBanner: false };
};

export default function IndexRoute() {
  const { showBanner } = useLoaderData<typeof loader>();
  const [shop, setShop] = useState("");
  const [faqOpen, setFaqOpen] = useState<Record<number, boolean>>({});

  const handleInstall = () => {
    let d = shop.trim().toLowerCase();
    if (!d) return;
    if (!d.includes(".")) d = `${d}.myshopify.com`;
    if (!d.startsWith("http")) d = `https://${d}`;
    try {
      window.location.href = `/auth/login?shop=${encodeURIComponent(new URL(d).hostname)}`;
    } catch {
      window.location.href = `/auth/login?shop=${encodeURIComponent(shop.trim())}`;
    }
  };

  const faqs = [
    {
      q: "How is net profit calculated?",
      a: "Each order's gross value is reduced by product COGS (frozen at order time), forward shipping slab, payment gateway fee (2% + 18% GST), and packaging cost.",
    },
    {
      q: "How does the COD blocker work?",
      a: "A Shopify Function (WebAssembly) runs at checkout via cart_payment_methods_transform to hide COD for postal codes you've flagged as high-risk.",
    },
    {
      q: "What data is accessed?",
      a: "Orders, line items, shipping addresses (postal codes for risk classification), and fulfillment statuses. See our Privacy Policy for full details.",
    },
    {
      q: "Is there a free trial?",
      a: "Yes — 14 days of full access on any plan. Billing starts after the trial via the Shopify Billing API. Cancel anytime.",
    },
  ];

  return (
    <AppProvider i18n={enTranslations}>
      <Page>
        <BlockStack gap="800">

          {/* ── Header ── */}
          <InlineStack align="space-between" blockAlign="center" wrap={false}>
            <InlineStack gap="300" blockAlign="center">
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "#008060", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 16 }}>
                P
              </div>
              <BlockStack gap="050">
                <Text variant="headingMd" as="h1">ProfitRx</Text>
                <Text variant="bodyXs" as="span" tone="subdued">COD risk management &amp; profit tracking for Shopify</Text>
              </BlockStack>
            </InlineStack>
            <Button variant="primary" url="/auth/login">Install app</Button>
          </InlineStack>

          <Divider />

          {/* ── Hero ── */}
          <Layout>
            <Layout.Section>
              <BlockStack gap="400">
                <Text variant="heading2xl" as="h2">
                  See your real profit per order. Control COD at checkout.
                </Text>
                <Text variant="bodyLg" as="p" tone="subdued">
                  ProfitRx deducts COGS, shipping, gateway fees, and GST from every order so you know what you actually keep. A Shopify Function hides COD for risky postal codes.
                </Text>
              </BlockStack>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingSm" as="h3">Connect your store</Text>
                  <TextField
                    label="Store URL"
                    value={shop}
                    onChange={setShop}
                    placeholder="your-store.myshopify.com"
                    autoComplete="off"
                  />
                  <Button variant="primary" fullWidth onClick={handleInstall}>
                    Install ProfitRx
                  </Button>
                  <InlineStack gap="300" align="center">
                    <InlineStack gap="100" blockAlign="center">
                      <Icon source={LockIcon} tone="subdued" />
                      <Text variant="bodyXs" as="span" tone="subdued">OAuth</Text>
                    </InlineStack>
                    <Text variant="bodyXs" as="span" tone="subdued">·</Text>
                    <Text variant="bodyXs" as="span" tone="subdued">14-day trial</Text>
                    <Text variant="bodyXs" as="span" tone="subdued">·</Text>
                    <Text variant="bodyXs" as="span" tone="subdued">Cancel anytime</Text>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>

          {/* ── What it does ── */}
          <BlockStack gap="400">
            <Text variant="headingLg" as="h2">What ProfitRx does</Text>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
              {[
                { title: "Order profit", desc: "Deducts COGS, freight slabs, gateway fees + GST, and packaging from each order." },
                { title: "COD blocker", desc: "Shopify Function hides COD at checkout for postal codes you mark as high-risk." },
                { title: "Pincode analytics", desc: "Tracks delivery and RTO rates by postal code. Flags problem areas." },
                { title: "Ad spend tracking", desc: "Compare Meta/Google spend against net profit instead of gross revenue." },
              ].map((item) => (
                <Card key={item.title}>
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h3">{item.title}</Text>
                    <Text variant="bodySm" as="p" tone="subdued">{item.desc}</Text>
                  </BlockStack>
                </Card>
              ))}
            </InlineGrid>
          </BlockStack>

          {/* ── Example breakdown ── */}
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingSm" as="h3">Example: Order #1042</Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    How ProfitRx breaks down a ₹2,499 order into its real components.
                  </Text>
                  <Divider />
                  {[
                    { label: "Order total", value: "₹2,499.00" },
                    { label: "Product COGS", value: "−₹850.00", tone: "critical" as const },
                    { label: "Forward shipping", value: "−₹80.00", tone: "critical" as const },
                    { label: "Gateway fee + GST", value: "−₹58.98", tone: "critical" as const },
                    { label: "Packaging", value: "−₹15.00", tone: "critical" as const },
                  ].map((row) => (
                    <InlineStack key={row.label} align="space-between">
                      <Text variant="bodySm" as="span" tone="subdued">{row.label}</Text>
                      <Text variant="bodySm" as="span" tone={row.tone}>{row.value}</Text>
                    </InlineStack>
                  ))}
                  <Divider />
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" as="span" fontWeight="bold">Net profit</Text>
                    <Text variant="bodyMd" as="span" fontWeight="bold" tone="success">₹1,495.02</Text>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingSm" as="h3">Checkout rule example</Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    The Shopify Function checks the buyer's postal code and hides COD when needed.
                  </Text>
                  <Divider />
                  <InlineStack align="space-between">
                    <Text variant="bodySm" as="span">841301 (Bihar)</Text>
                    <Badge tone="critical">COD hidden</Badge>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text variant="bodySm" as="span">110001 (Delhi)</Text>
                    <Badge tone="success">COD available</Badge>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text variant="bodySm" as="span">800001 (Patna)</Text>
                    <Badge tone="warning">OTP required</Badge>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>

          {/* ── Pricing ── */}
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text variant="headingLg" as="h2">Plans</Text>
              <Text variant="bodySm" as="p" tone="subdued">14-day free trial on all plans. Billed through Shopify.</Text>
            </BlockStack>
            <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
              {[
                {
                  name: "Starter", price: "$19 USD/mo", cap: "500 orders/mo",
                  features: ["Net profit dashboard", "COGS tracking", "RTO reports", "GSTR export"],
                },
                {
                  name: "Growth", price: "$39 USD/mo", cap: "2,000 orders/mo",
                  features: ["Everything in Starter", "COD blocker (Shopify Function)", "Pincode heatmap", "Ad spend sync", "WhatsApp OTP"],
                },
                {
                  name: "Pro", price: "$79 USD/mo", cap: "Unlimited",
                  features: ["Everything in Growth", "Custom risk weighting", "API access", "Priority support"],
                },
              ].map((plan) => (
                <Card key={plan.name}>
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3">{plan.name}</Text>
                    <Text variant="headingLg" as="p">{plan.price}</Text>
                    <Badge tone="info">{plan.cap}</Badge>
                    <Divider />
                    <List type="bullet">
                      {plan.features.map((f) => (
                        <List.Item key={f}>{f}</List.Item>
                      ))}
                    </List>
                    <Button fullWidth url="/auth/login">Start trial</Button>
                  </BlockStack>
                </Card>
              ))}
            </InlineGrid>
          </BlockStack>

          {/* ── FAQ ── */}
          <BlockStack gap="400">
            <Text variant="headingLg" as="h2">FAQ</Text>
            <BlockStack gap="200">
              {faqs.map((faq, i) => (
                <Card key={i}>
                  <BlockStack gap="0">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingSm" as="h3">{faq.q}</Text>
                      <Button
                        variant="plain"
                        icon={faqOpen[i] ? ChevronUpIcon : ChevronDownIcon}
                        onClick={() => setFaqOpen((p) => ({ ...p, [i]: !p[i] }))}
                        accessibilityLabel={faqOpen[i] ? "Collapse" : "Expand"}
                      />
                    </InlineStack>
                    <Collapsible id={`faq-${i}`} open={!!faqOpen[i]}>
                      <Box paddingBlockStart="200">
                        <Text variant="bodyMd" as="p" tone="subdued">{faq.a}</Text>
                      </Box>
                    </Collapsible>
                  </BlockStack>
                </Card>
              ))}
            </BlockStack>
          </BlockStack>

          {/* ── Footer ── */}
          <Divider />
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="bodyXs" as="p" tone="subdued">© 2026 ProfitRx</Text>
            <InlineStack gap="300">
              <InlineStack gap="100" blockAlign="center">
                <Icon source={CheckCircleIcon} tone="success" />
                <Text variant="bodyXs" as="span" tone="subdued">Shopify App Bridge</Text>
              </InlineStack>
              <Button variant="plain" url="/privacy">Privacy Policy</Button>
            </InlineStack>
          </InlineStack>

        </BlockStack>
      </Page>
    </AppProvider>
  );
}
