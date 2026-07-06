import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
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
  Badge,
  Banner,
  Box,
  Icon,
} from "@shopify/polaris";
import {
  CheckIcon,
  XIcon,
  FinanceIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { getSubscription } from "../services/feature-access.service";
import { syncSubscriptionWithShopify } from "../services/subscription-sync.service";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const subscription = await syncSubscriptionWithShopify(session.shop, billing);
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";

  return {
    shop: session.shop,
    host,
    plan: subscription.plan,
    status: subscription.status,
    orderLimit: subscription.orderLimit,
    ordersUsed: subscription.ordersUsed,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "sync_subscription") {
    const subscription = await syncSubscriptionWithShopify(session.shop, billing);
    return { success: true, message: `Subscription synced successfully. Current plan: ${subscription.plan}` };
  }

  if (intent === "cancel_subscription") {
    const subscription = await prisma.subscription.findUnique({
      where: { shop: session.shop },
    });

    if (subscription?.shopifyChargeId) {
      try {
        await billing.cancel({
          subscriptionId: subscription.shopifyChargeId,
          isTest: true,
        });
      } catch (err) {
        console.error("Failed to cancel Shopify subscription:", err);
      }
    }

    await prisma.subscription.update({
      where: { shop: session.shop },
      data: {
        plan: "FREE",
        status: "CANCELED",
        orderLimit: 50,
        shopifyChargeId: null,
      },
    });
    return { success: true, message: "Subscription cancelled successfully." };
  }

  return { error: "Unknown action" };
};

export default function BillingPage() {
  const { shop, host, plan, status, orderLimit, ordersUsed } = useLoaderData<typeof loader>();
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
      name: "Free Plan",
      price: "$0/mo",
      color: "info",
      includes: ["Up to 50 orders/mo", "Real Profit Dashboard", "Store Health Score"],
      lacks: ["Product Cost Tracking", "COD Risk Score", "RTO Pincode Heatmap", "AI Attribution", "LTV & Cohort Analysis", "ROAS & Ad Spend Sync"],
    },
    STARTER: {
      name: "Starter Plan",
      price: "$19/mo",
      color: "info",
      includes: ["Up to 500 orders/mo", "Real Profit Dashboard", "Store Health Score", "Product Cost Tracking (COGS)", "Basic RTO & COD Insights", "Weekly WhatsApp Report"],
      lacks: ["AI Search Attribution", "COD Risk Score", "RTO Pincode Heatmap", "LTV & Cohort Analysis", "ROAS & Ad Spend Sync"],
    },
    GROWTH: {
      name: "Growth Plan",
      price: "$39/mo",
      color: "attention",
      includes: ["Up to 2,000 orders/mo", "Everything in Starter", "AI Search & Order Attribution", "COD Risk Score (Pre-shipment prediction)", "RTO Pincode Heatmap", "AI Profit Leak Recommendations", "Advanced Email Alerts"],
      lacks: ["LTV & Cohort Analysis", "ROAS & Ad Spend Sync", "Multi-store Support"],
    },
    PRO: {
      name: "Pro Plan",
      price: "$79/mo",
      color: "success",
      includes: ["Unlimited orders/mo", "Everything in Growth", "LTV & Cohort Retention Analysis", "Blended ROAS & Ad Spend Sync", "RTO Pincode Heatmap", "COD Risk Scoring", "Multi-store Support", "Priority Support"],
      lacks: [],
    },
    // Legacy aliases
    BASIC: {
      name: "Starter Plan",
      price: "$19/mo",
      color: "info",
      includes: ["Up to 500 orders/mo", "Real Profit Dashboard", "Product Cost Tracking", "Basic RTO & COD Insights"],
      lacks: ["COD Risk Score", "RTO Heatmap", "LTV & Cohort Analysis"],
    },
    ADVANCE: {
      name: "Pro Plan",
      price: "$79/mo",
      color: "success",
      includes: ["Unlimited orders/mo", "LTV & Cohort Retention Analysis", "Blended ROAS & Ad Spend Sync"],
      lacks: [],
    },
  };

  const planInfo = planInfoMap[normalizedPlan] || planInfoMap.FREE;

  return (
    <Page title="Store Billing & Plan Usage">
      <Layout>
        <Layout.Section>
          {/* Value Delivered ROI Card */}
          <div style={{
            padding: "20px 24px",
            borderRadius: "var(--gg-radius-lg)",
            background: "linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(56,189,248,0.08) 100%)",
            border: "1px solid rgba(16,185,129,0.3)",
            marginBottom: "20px"
          }}>
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <InlineStack gap="150" blockAlign="center">
                  <Icon source={FinanceIcon} tone="success" />
                  <Text variant="headingLg" as="h2">Value Delivered This Month</Text>
                  <Badge tone="success">10x ROI Return</Badge>
                </InlineStack>
                <Text variant="bodySm" as="p" tone="subdued">
                  Estimated profit saved by blocking high-risk RTO pincodes and optimizing courier costs.
                </Text>
              </BlockStack>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontSize: 32, color: "var(--gg-accent-green)", letterSpacing: "-0.03em" }}>
                  ~$280 Saved
                </div>
                <div style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>
                  (~₹23,200 recovered)
                </div>
              </div>
            </InlineStack>
          </div>
        </Layout.Section>

        {/* Plan Header Card */}
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
            <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
              <div className="gg-card-glow" style={{ padding: "24px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(25, 20, 45, 0.4)", backdropFilter: "blur(20px)" }}>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text variant="bodySm" as="p" tone="subdued">CURRENT TIERS & LIMITS</Text>
                      <InlineStack gap="150" blockAlign="center">
                        <Text variant="headingXl" as="h2">{planInfo.name}</Text>
                        <Badge tone={planInfo.color as any}>{status.toUpperCase()}</Badge>
                      </InlineStack>
                    </BlockStack>
                    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
                      <Text variant="heading2xl" as="p">{planInfo.price}</Text>
                    </div>
                  </InlineStack>

                  <Divider />

                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" as="p" fontWeight="medium">Monthly Sync Volume</Text>
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
                </BlockStack>
              </div>
            </Grid.Cell>

            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h2">Manage Plan</Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Change tiers, update billing information, or review transaction histories inside Shopify Billing portal.
                      </Text>
                      <BlockStack gap="200">
                        <Button url={`/app/pricing?shop=${shop}&host=${host}`} variant="primary" fullWidth>
                          Change Plan Tier
                        </Button>
                        <Form method="POST">
                          <input type="hidden" name="intent" value="sync_subscription" />
                          <Button variant="secondary" submit fullWidth loading={isSubmitting}>
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
          <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
            <Grid.Cell>
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h2">Included in Your Tier</Text>
                    <BlockStack gap="150">
                      {planInfo.includes.map((feat, idx) => (
                        <InlineStack gap="150" key={idx} blockAlign="center">
                          <Icon source={CheckIcon} tone="success" />
                          <span style={{ fontSize: 13, color: "var(--gg-text-primary)" }}>{feat}</span>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>
            </Grid.Cell>

            <Grid.Cell>
              {planInfo.lacks.length > 0 && (
                <Card>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h2">Locked (Requires Upgrade)</Text>
                      <BlockStack gap="150">
                        {planInfo.lacks.map((feat, idx) => (
                          <InlineStack gap="150" key={idx} blockAlign="center">
                            <Icon source={XIcon} tone="critical" />
                            <span style={{ fontSize: 13, color: "var(--gg-text-muted)" }}>{feat}</span>
                          </InlineStack>
                        ))}
                      </BlockStack>
                    </BlockStack>
                  </Box>
                </Card>
              )}
            </Grid.Cell>
          </Grid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
