import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useActionData, redirect, useNavigation, useRouteError, isRouteErrorResponse } from "react-router";
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
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { BillingApplicationService } from "../application/billing/billing.application";
import { PartnerBillingService } from "../services/partner-billing.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const isPreview = url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true";

  if (isPreview) {
    const shop = "glam-aura-india.myshopify.com";
    const host = Buffer.from(`admin.shopify.com/store/glam-aura-india`).toString("base64");
    return {
      shop,
      host,
      currentPlan: "Pro",
      pricingPlansUrl: "#",
      planHandleParam: null,
    };
  }

  const { billing, session } = await authenticate.admin(request);
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
      approxInr: "~₹1,599",
      description: "For stores getting started with COD return control.",
      tagline: "Track your real net profit and courier return losses.",
      features: [
        "Up to 500 orders evaluated / mo",
        "Net Profit Live Dashboard",
        "Product Cost Tracking (Making/Buying prices)",
        "Courier Return Reports & Loss Tracking",
        "Weekly WhatsApp Digest",
        "GST Compliance Reports",
        "Download Reports & CSV Export",
      ],
      popular: false,
    },
    {
      name: "Growth",
      handle: "growth",
      price: "$39",
      approxInr: "~₹3,299",
      description: "The complete COD & return protection suite.",
      tagline: "Verify COD orders with OTP, block high-return pincodes, and reduce courier losses.",
      features: [
        "Up to 2,000 orders evaluated / mo",
        "Everything in Starter, plus:",
        "WhatsApp Order Confirmation (OTP)",
        "High Return Pincode Protection",
        "Flag for Advance Deposit Follow-up",
        "Frequent Returners & Delivery History Directory",
        "Where You Are Losing Money (Leaks)",
        "Instant WhatsApp Alerts on Risky Orders",
      ],
      popular: true,
    },
    {
      name: "Pro",
      handle: "pro",
      price: "$79",
      approxInr: "~₹6,599",
      description: "For high-volume stores spending heavily on ads.",
      tagline: "Track real cash collected from ad spend and protect unlimited order volumes.",
      features: [
        "Unlimited orders evaluated / mo",
        "Everything in Growth, plus:",
        "Ad Spend vs Real Sales (Meta & Google Ads)",
        "Sales Return per Rupee Spent (True ROAS)",
        "Repeat Customer Value History",
        "Multi-Store Support",
        "Priority WhatsApp Support & Dedicated Setup",
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
          <div style={{ marginBottom: "16px", textAlign: "center" }}>
            <InlineStack gap="300" align="center" blockAlign="center">
              <Text variant="bodyMd" as="span" tone="subdued" fontWeight="medium">
                💡 Try any plan risk-free for 14 days. Instant setup, cancel anytime.
              </Text>
              <Form method="POST" style={{ display: "inline-flex" }}>
                <input type="hidden" name="intent" value="sync_subscription" />
                <Button variant="plain" submit loading={isSyncing}>
                  🔄 Refresh Status
                </Button>
              </Form>
            </InlineStack>
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
                        / mo ({plan.approxInr})
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
                        <td>Net Profit Live Dashboard</td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Product Cost Tracking (Making/Buying)</td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Courier Return Reports</td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>WhatsApp Order Confirmation (OTP)</td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>High Return Pincode Protection</td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Flag for Advance Deposit Follow-up</td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Frequent Returners Directory</td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Where You Are Losing Money (Leaks)</td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Ad Spend vs Real Sales Tracking</td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-text-muted)" }}>✕ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Support Level</td>
                        <td>Email</td>
                        <td>Priority WhatsApp</td>
                        <td><strong>24/7 Dedicated WhatsApp</strong></td>
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

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = "An unexpected error occurred while loading pricing.";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}: ${error.data}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="Pricing Plans">
      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <Banner tone="critical" title="Failed to Load Plans">
              <p>{errorMessage}</p>
            </Banner>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}
