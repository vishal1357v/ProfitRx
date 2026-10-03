import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useActionData, redirect, useNavigation } from "react-router";
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
  List,
  Badge,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { BillingApplicationService } from "../application/billing/billing.application";
import { PartnerBillingService } from "../services/partner-billing.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const forceSync = url.searchParams.get("plan_updated") === "true" || url.searchParams.get("sync") === "true";
  const isChangingPlan = url.searchParams.get("change_plan") === "true";
  const planHandle = url.searchParams.get("plan_handle");
  let host = url.searchParams.get("host") || "";
  if (!host && session?.shop) {
    const storeHandle = session.shop.replace(".myshopify.com", "");
    host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
  }

  const result = await BillingApplicationService.getPricingData(session.shop, billing, {
    forceSync: forceSync || Boolean(planHandle),
    isChangingPlan,
    host,
    planHandle,
  });

  // If redirecting after successful subscription verification or active plan
  if (result.shouldRedirect) {
    return redirect(`/app/dashboard?shop=${session.shop}&host=${host}`);
  }

  return {
    currentPlan: result.currentPlan,
    shop: session.shop,
    host,
    pricingPlansUrl: result.pricingPlansUrl,
    planHandleParam: planHandle,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session, redirect } = await authenticate.admin(request);
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "sync_subscription") {
    try {
      const sub = await BillingApplicationService.syncSubscription(session.shop, billing, true);
      if (sub && sub.plan !== "FREE" && (sub.status === "ACTIVE" || sub.status === "TRIALING")) {
        return redirect(`/app/dashboard?shop=${session.shop}&host=${host}`);
      }
      return { success: true, message: `Subscription synced. Current plan status is ${sub.plan}.` };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to sync subscription" };
    }
  }

  // Shopify App Pricing: merchant selects plans through the Shopify-hosted plan selection page
  const pricingPlansUrl = PartnerBillingService.getPricingPlansUrl(session.shop);
  return redirect(pricingPlansUrl, { target: "_top" });
};

export default function Pricing() {
  const { currentPlan, shop, host, pricingPlansUrl, planHandleParam } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ success?: boolean; message?: string; error?: string }>();
  const navigation = useNavigation();
  const isSyncing = navigation.state === "submitting" && navigation.formData?.get("intent") === "sync_subscription";

  const plans = [
    {
      name: "Starter",
      handle: "starter",
      price: "$19",
      description: "For emerging D2C brands starting with COD risk control.",
      tagline: "Prevent early RTO bleed with core intelligence and analytics.",
      features: [
        "Up to 500 evaluated orders / mo",
        "Profit & Loss Live Dashboard",
        "Store Health & Efficiency Score",
        "Native & Custom COGS Tracking",
        "Basic RTO Rate & Return Alerts",
        "Automated GST Return Reports",
        "Order Analytics & CSV Export",
      ],
      popular: false,
    },
    {
      name: "Growth",
      handle: "growth",
      price: "$39",
      description: "Complete COD Shield suite for scaling Shopify merchants.",
      tagline: "Block fake COD, verify buyer intent with OTP, and halt RTO losses.",
      features: [
        "Up to 2,000 evaluated orders / mo",
        "Everything in Starter, plus:",
        "COD Shield — Automated COD Blocking",
        "Interactive India Pincode RTO Heatmap",
        "Buyer Intent OTP Verification via SMS",
        "Partial Deposit / Advance Payment on COD",
        "Customer Risk Scoring & Blacklist Rules",
        "Profit Leak Diagnostics & Action Hub",
        "Priority WhatsApp Courier Alerts",
      ],
      popular: true,
    },
    {
      name: "Pro",
      handle: "pro",
      price: "$79",
      description: "Unlimited scale and omni-channel intelligence for market leaders.",
      tagline: "Maximum profit protection with custom economics and unlimited volume.",
      features: [
        "Unlimited evaluated orders / mo",
        "Everything in Growth, plus:",
        "Blended ROAS & Ad Spend Intelligence",
        "Meta & Google Ads Direct Integrations",
        "Customer LTV Cohort Retention Analytics",
        "Multi-Store & Enterprise Team Access",
        "Custom Courier SLA Rules Engine",
        "White-glove 1-on-1 Onboarding",
        "24/7 Dedicated Support",
      ],
      popular: false,
    },
  ];

  return (
    <Page title="Select a Subscription Plan">
      <Layout>
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical" title="Operation Failed">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        {planHandleParam && (
          <Layout.Section>
            <Banner tone="success" title="Plan Selection Completed">
              <p>Your subscription to the {planHandleParam.toUpperCase()} plan is being synchronized with Shopify App Pricing.</p>
            </Banner>
          </Layout.Section>
        )}

        {actionData?.success && actionData?.message && (
          <Layout.Section>
            <Banner tone="success" title="Subscription Status Synced">
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Banner tone="info">
            <p>All plans include a 14-day free trial. Charges are billed monthly in USD via Shopify App Pricing.</p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <div style={{ marginBottom: "20px", textAlign: "center" }}>
            <Text variant="headingLg" as="h1">
              Select Your Subscription Plan
            </Text>
            <div style={{ marginTop: "8px" }}>
              <InlineStack gap="300" align="center" blockAlign="center">
                <Text variant="bodyMd" as="span" tone="subdued" fontWeight="medium">
                  💡 Try any plan risk-free for 14 days. Instant setup, cancel anytime.
                </Text>
                <Form method="POST" style={{ display: "inline-flex" }}>
                  <input type="hidden" name="intent" value="sync_subscription" />
                  <Button variant="plain" submit loading={isSyncing}>
                    🔄 Refresh Subscription Status
                  </Button>
                </Form>
              </InlineStack>
            </div>
          </div>
        </Layout.Section>

        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3 }}>
            {plans.map((plan) => (
              <Grid.Cell key={plan.name}>
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <BlockStack gap="050">
                        <Text variant="headingLg" as="h3">
                          {plan.name}
                        </Text>
                        <Text variant="bodyXs" as="span" tone="subdued">
                          {plan.description}
                        </Text>
                      </BlockStack>
                      <InlineStack gap="100">
                        {plan.popular && (
                          <Badge tone="success">Popular</Badge>
                        )}
                        <Badge tone="attention">14-Day Free Trial</Badge>
                      </InlineStack>
                    </InlineStack>

                    <InlineStack gap="100" blockAlign="baseline">
                      <Text variant="heading2xl" as="p">
                        {plan.price}
                      </Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        / mo
                      </Text>
                    </InlineStack>

                    <div style={{ fontStyle: "italic", fontSize: "13px" }}>
                      <Text variant="bodyMd" as="p" tone="subdued">
                        {plan.tagline}
                      </Text>
                    </div>

                    <Form method="POST">
                      <input type="hidden" name="intent" value="select_plan" />
                      <input type="hidden" name="plan" value={plan.handle} />
                      <Button
                        variant={plan.name === currentPlan ? undefined : plan.popular ? "primary" : undefined}
                        submit
                        fullWidth
                        disabled={currentPlan === plan.name}
                        onClick={() => {
                          if (typeof window !== "undefined" && currentPlan !== plan.name) {
                            window.open(pricingPlansUrl, "_top");
                          }
                        }}
                      >
                        {currentPlan === plan.name ? "Current Plan" : "Start 14-Day Free Trial"}
                      </Button>
                    </Form>

                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h4">
                        What's included:
                      </Text>
                      <List>
                        {plan.features.map((feature, idx) => (
                          <List.Item key={idx}>{feature}</List.Item>
                        ))}
                      </List>
                    </BlockStack>
                  </BlockStack>
                </Card>
              </Grid.Cell>
            ))}
          </Grid>
        </Layout.Section>

        <Layout.Section>
          <div style={{ marginTop: "30px", marginBottom: "20px" }}>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Plan Feature Comparison
                </Text>
                <div style={{ overflowX: "auto" }}>
                  <table className="gg-table">
                    <thead>
                      <tr>
                        <th style={{ width: "31%" }}>Feature</th>
                        <th style={{ width: "23%" }}>Starter ($19/mo)</th>
                        <th style={{ width: "23%" }}>Growth ($39/mo)</th>
                        <th style={{ width: "23%" }}>Pro ($79/mo)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>Order limit / month</strong></td>
                        <td>Up to 500 orders</td>
                        <td>Up to 2,000 orders</td>
                        <td><strong>Unlimited orders</strong></td>
                      </tr>
                      <tr>
                        <td>Real Profit Dashboard</td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Store Health Score</td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>COGS Management</td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Basic RTO Tracking</td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>COD Shield (Auto-Block)</td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>OTP Verification via SMS</td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Partial Deposit on COD</td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Customer Risk Blacklist</td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Pincode RTO Heatmap</td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Blended ROAS Intelligence</td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Customer LTV Cohorts</td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Support Level</td>
                        <td>Community</td>
                        <td>Priority</td>
                        <td><strong>24/7 Dedicated</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
