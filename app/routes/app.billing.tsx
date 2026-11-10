import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation, useRouteError, isRouteErrorResponse } from "react-router";
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
  ProgressBar,
  Divider,
  Grid,
  InlineGrid,
  Badge,
  Banner,
  Box,
  Icon,
} from "@shopify/polaris";
import {
  CheckIcon,
  XIcon,
  ShieldCheckMarkIcon,
} from "@shopify/polaris-icons";
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
      plan: "PRO",
      status: "ACTIVE",
      orderLimit: null,
      ordersUsed: 1420,
      trialEndsAt: null,
      lastSyncedAt: new Date().toISOString(),
      shopifyChargeId: "gid://shopify/AppSubscription/demo-8841",
      billingProvider: "SHOPIFY_APP_PRICING",
      isTestStore: false,
      totalRtoSavings: 42600,
      pricingPlansUrl: `/app/pricing?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}&preview=true`,
    };
  }

  const { session, billing } = await authenticate.admin(request);
  const host = url.searchParams.get("host") || "";
  const planHandle = url.searchParams.get("plan_handle");

  if (planHandle) {
    await BillingApplicationService.syncSubscription(session.shop, billing, true, planHandle);
  }

  return BillingApplicationService.getBillingData(session.shop, billing, host);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true") {
    return { success: true, message: "Demo mode: Billing actions simulated successfully." };
  }
  const { session, billing, redirect } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "change_plan") {
    const pricingPlansUrl = PartnerBillingService.getPricingPlansUrl(session.shop);
    return redirect(pricingPlansUrl, { target: "_top" });
  }

  if (intent === "sync_subscription") {
    const subscription = await BillingApplicationService.syncSubscription(session.shop, billing);
    return { success: true, message: `Subscription synced successfully. Current plan: ${subscription.plan}` };
  }

  if (intent === "cancel_subscription") {
    await BillingApplicationService.cancelSubscription(session.shop, billing);
    return { success: true, message: "Subscription cancelled successfully." };
  }

  return { error: "Unknown action" };
};

export default function BillingPage() {
  const { shop, host, plan, status, orderLimit, ordersUsed, trialEndsAt, lastSyncedAt, shopifyChargeId, billingProvider, isTestStore, totalRtoSavings, pricingPlansUrl } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const limitText = orderLimit ? `${orderLimit.toLocaleString()} orders` : "Unlimited";
  const usedPercent = orderLimit ? Math.min(100, Math.round((ordersUsed / orderLimit) * 100)) : 0;

  // Determine progress color
  const progressTone = usedPercent > 90 ? "critical" : usedPercent > 70 ? "warning" : "success";

  // Detailed features list per plan
  const normalizedPlan = (plan || "").toUpperCase();
  const planInfoMap: Record<string, { name: string; price: string; color: string; includes: string[]; lacks: string[] }> = {
    FREE: {
      name: "14-Day Free Trial",
      price: "₹0/mo",
      color: "info",
      includes: ["14-day free access", "Net Profit Live Dashboard", "Basic Courier Return Reports"],
      lacks: ["Select a paid plan to keep protecting orders after trial"],
    },
    STARTER: {
      name: "Starter Plan",
      price: "$19 USD/mo (~₹1,599)",
      color: "info",
      includes: ["Up to 500 orders/mo", "Net Profit Live Dashboard", "Product Cost Tracking (Making/Buying cost)", "Weekly WhatsApp Return Digest", "Courier Return Reports", "Download CSV Data"],
      lacks: ["WhatsApp OTP Verification", "High Return Pincode Protection", "Advance Deposit Tagging Rules", "Ad Spend vs Real Sales Tracking"],
    },
    GROWTH: {
      name: "Growth Plan",
      price: "$39 USD/mo (~₹3,299)",
      color: "attention",
      includes: ["Up to 2,000 orders/mo", "Everything in Starter", "WhatsApp Order Confirmation (OTP)", "High Return Pincode Protection", "Advance Deposit Tagging Rules", "Where You Are Losing Money Reports", "Instant WhatsApp Alerts on Risky Orders"],
      lacks: ["Ad Spend vs Real Sales Tracking", "Customer Repeat Buyer History", "Multi-store Support"],
    },
    PRO: {
      name: "Pro Plan",
      price: "$79 USD/mo (~₹6,599)",
      color: "success",
      includes: ["Unlimited orders/mo", "Everything in Growth", "Ad Spend vs Real Sales Tracking (Meta & Google)", "Frequent Returners & Delivery History Directory", "Multi-store Support", "Priority WhatsApp Support & Dedicated Setup"],
      lacks: [],
    },
    // Legacy aliases
    BASIC: {
      name: "Starter Plan",
      price: "$19 USD/mo (~₹1,599)",
      color: "info",
      includes: ["Up to 500 orders/mo", "Net Profit Live Dashboard", "Product Cost Tracking", "Courier Return Reports"],
      lacks: ["WhatsApp OTP Verification", "High Return Pincode Protection", "Ad Spend vs Real Sales Tracking"],
    },
    ADVANCE: {
      name: "Pro Plan",
      price: "$79 USD/mo (~₹6,599)",
      color: "success",
      includes: ["Unlimited orders/mo", "Everything in Growth", "Ad Spend vs Real Sales Tracking"],
      lacks: [],
    },
  };

  const planInfo = planInfoMap[normalizedPlan] || planInfoMap.FREE;

  let trialDaysRemaining = 0;
  let isTrialActive = false;
  if (status === "TRIALING" && trialEndsAt) {
    const end = new Date(trialEndsAt);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    trialDaysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    isTrialActive = true;
  }

  return (
    <Page
      title="Plans & Billing"
      subtitle="Manage your ProfitRx subscription, track evaluated order quotas, and compare plan features."
    >
      <Layout>
        {isTrialActive && (
          <Layout.Section>
            <Banner tone="info" title="Active 14-Day Free Trial Mode">
              <p>You are currently on a 14-day free trial. Your trial ends in <strong>{trialDaysRemaining} days</strong> ({trialEndsAt ? new Date(trialEndsAt).toLocaleDateString() : ""}). You can explore all capabilities, configure shipping rules, and protect COD profits risk-free.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          {/* Value Delivered ROI Card */}
          <Card>
            <InlineStack align="space-between" blockAlign="center" wrap>
              <BlockStack gap="100">
                <InlineStack gap="150" blockAlign="center">
                  <Icon source={ShieldCheckMarkIcon} tone="success" />
                  <Text variant="headingMd" as="h2">Estimated Courier Losses Prevented</Text>
                  {totalRtoSavings > 0 && <Badge tone="success">Estimated Exposure Avoided</Badge>}
                </InlineStack>
                <Text variant="bodySm" as="p" tone="subdued">
                  Estimated courier freight charges avoided on risky orders that were restricted or cancelled.
                </Text>
              </BlockStack>
              <BlockStack gap="050" align="end">
                <Text variant="heading2xl" as="p" tone="success">
                  ~₹{totalRtoSavings.toLocaleString("en-IN")}
                </Text>
                <Text variant="bodyXs" as="span" tone="subdued">
                  (Estimated freight on restricted orders)
                </Text>
              </BlockStack>
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* Plan Header Card */}
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
            <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
              <Card>
                <Box padding="400">
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text variant="bodySm" as="p" tone="subdued">CURRENT PLAN & USAGE</Text>
                        <InlineStack gap="150" blockAlign="center">
                          <Text variant="headingXl" as="h2">{planInfo.name}</Text>
                          <Badge tone={planInfo.color as any}>{status.toUpperCase()}</Badge>
                          {isTestStore && <Badge tone="info">Development Store (Test Charges Active)</Badge>}
                        </InlineStack>
                      </BlockStack>
                      <Text variant="heading2xl" as="p">{planInfo.price}</Text>
                    </InlineStack>

                    <Divider />

                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text variant="bodyMd" as="p" fontWeight="medium">Monthly Order Sync Volume</Text>
                        <Text variant="bodyMd" as="p" fontWeight="bold">
                          {ordersUsed.toLocaleString()} / {limitText} ({usedPercent}%)
                        </Text>
                      </InlineStack>
                      {orderLimit && (
                        <BlockStack gap="100">
                          <ProgressBar progress={usedPercent} tone={progressTone as any} />
                          {usedPercent >= 90 && (
                            <Banner tone="critical">
                              You are about to reach your order limit. Upgrade your plan to prevent automated synchronization failures.
                            </Banner>
                          )}
                        </BlockStack>
                      )}
                    </BlockStack>

                    <Divider />

                    <InlineStack align="space-between" blockAlign="center" wrap>
                      <Text variant="bodyXs" as="span" tone="subdued">
                        Billing: <strong>Shopify Official App Billing</strong>
                      </Text>
                      {shopifyChargeId && (
                        <Text variant="bodyXs" as="span" tone="subdued">
                          Subscription ID: <code style={{ fontSize: 11 }}>{shopifyChargeId.replace("gid://shopify/AppSubscription/", "")}</code>
                        </Text>
                      )}
                      <Text variant="bodyXs" as="span" tone="subdued">
                        Last Verified: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "Real-time"}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </Box>
              </Card>
            </Grid.Cell>

            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h2">Manage Plan</Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Change tiers, review Shopify subscription charges, or verify synchronization with Shopify Billing.
                      </Text>
                      <BlockStack gap="200">
                        <Form method="POST">
                          <input type="hidden" name="intent" value="change_plan" />
                          <Button
                            variant="primary"
                            submit
                            fullWidth
                            loading={isSubmitting && navigation.formData?.get("intent") === "change_plan"}
                            onClick={() => {
                              if (typeof window !== "undefined") {
                                window.open(pricingPlansUrl, "_top");
                              }
                            }}
                          >
                            Upgrade / Change Plan
                          </Button>
                        </Form>
                        <Button url={`/app/pricing?shop=${shop}&host=${host}&change_plan=true`} variant="secondary" fullWidth>
                          Compare Features & Tiers
                        </Button>
                        <Form method="POST">
                          <input type="hidden" name="intent" value="sync_subscription" />
                          <Button variant="plain" submit fullWidth loading={isSubmitting}>
                            Sync Subscription with Shopify
                          </Button>
                        </Form>
                        {plan !== "FREE" && (
                          <Form method="POST">
                            <input type="hidden" name="intent" value="cancel_subscription" />
                            <Button
                              variant="plain"
                              tone="critical"
                              submit
                              fullWidth
                              loading={isSubmitting}
                            >
                              Cancel Subscription
                            </Button>
                          </Form>
                        )}
                      </BlockStack>
                    </BlockStack>
                  </div>
                </Box>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Features Breakdown */}
        <Layout.Section>
          <InlineGrid columns={planInfo.lacks.length > 0 ? { xs: 1, md: 2 } : { xs: 1 }} gap="400">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Included in Your Tier</Text>
                  <BlockStack gap="200">
                    {planInfo.includes.map((feat, idx) => (
                      <InlineStack gap="200" key={idx} blockAlign="center" wrap={false}>
                        <div style={{ flexShrink: 0, width: 20 }}>
                          <Icon source={CheckIcon} tone="success" />
                        </div>
                        <Text variant="bodySm" as="span">{feat}</Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>

            {planInfo.lacks.length > 0 && (
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h2">Locked (Requires Upgrade)</Text>
                    <BlockStack gap="200">
                      {planInfo.lacks.map((feat, idx) => (
                        <InlineStack gap="200" key={idx} blockAlign="center" wrap={false}>
                          <div style={{ flexShrink: 0, width: 20 }}>
                            <Icon source={XIcon} tone="critical" />
                          </div>
                          <Text variant="bodySm" tone="subdued" as="span">{feat}</Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>
              )}
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = "An unexpected error occurred while loading billing information.";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}: ${error.data}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="Billing & Plans">
      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <Banner tone="critical" title="Failed to Load Billing">
              <p>{errorMessage}</p>
            </Banner>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}
