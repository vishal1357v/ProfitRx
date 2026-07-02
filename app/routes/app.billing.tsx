import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getSubscription } from "../services/feature-access.service";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const subscription = await getSubscription(session.shop);
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
        plan: "STARTER",
        status: "CANCELED",
        orderLimit: 500,
        shopifyChargeId: null,
      },
    });
    return { success: true, message: "Subscription downgraded to Starter plan successfully." };
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
  const planInfo = {
    FREE: {
      name: "Free Plan",
      price: "$0/mo",
      color: "info",
      includes: ["Up to 50 orders/mo", "Real Profit Dashboard", "Store Health Score", "Basic Alerts"],
      lacks: ["COD Risk Score", "RTO Heatmap", "Weekly WhatsApp Report", "LTV & Cohort Analysis", "ROAS & Ad Spend"],
    },
    STARTER: {
      name: "Starter Plan",
      price: "$12/mo",
      color: "info",
      includes: ["Up to 500 orders/mo", "Real Profit Dashboard", "Product Cost Tracking", "Basic COD/RTO Insights", "Weekly WhatsApp Report"],
      lacks: ["COD Risk Score", "RTO Pincode Heatmap", "LTV & Cohort Analysis", "ROAS & Ad Spend"],
    },
    GROWTH: {
      name: "Growth Plan",
      price: "$29/mo",
      color: "attention",
      includes: ["Up to 2,000 orders/mo", "COD Risk Score", "RTO Pincode Heatmap", "AI Profit Recommendations", "Advanced Alerts", "Priority Support"],
      lacks: ["LTV & Cohort Analysis", "ROAS & Ad Spend", "Multi-store Support"],
    },
    PRO: {
      name: "Pro Plan",
      price: "$59/mo",
      color: "success",
      includes: ["Unlimited orders/mo", "LTV & Cohort Analysis", "ROAS & Ad Spend", "RTO Pincode Heatmap", "COD Risk Scoring", "Multi-store Support", "Priority Support & Dedicated Onboarding"],
      lacks: [],
    },
  }[plan.toUpperCase() as "FREE" | "STARTER" | "GROWTH" | "PRO"] || {
    name: "Free Plan",
    price: "$0/mo",
    color: "info",
    includes: ["Up to 50 orders/mo", "Real Profit Dashboard", "Store Health Score", "Basic Alerts"],
    lacks: [],
  };

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
                  <span style={{ fontSize: 20 }}>💰</span>
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
                      {plan !== "STARTER" && (
                        <Form method="POST">
                          <input type="hidden" name="intent" value="cancel_subscription" />
                          <Button
                            variant="secondary"
                            tone="critical"
                            submit
                            fullWidth
                            loading={isSubmitting}
                          >
                            Downgrade to Starter
                          </Button>
                        </Form>
                      )}
                    </BlockStack>
                  </BlockStack>
                </div>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Features Breakdown */}
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
            <Grid.Cell>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Included in Your Tier</Text>
                  <BlockStack gap="150">
                    {planInfo.includes.map((feat, idx) => (
                      <InlineStack gap="150" key={idx} blockAlign="center">
                        <span style={{ color: "var(--gg-accent-green)" }}>✓</span>
                        <span style={{ fontSize: 13, color: "var(--gg-text-primary)" }}>{feat}</span>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            </Grid.Cell>

            <Grid.Cell>
              {planInfo.lacks.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h2">Locked (Requires Upgrade)</Text>
                    <BlockStack gap="150">
                      {planInfo.lacks.map((feat, idx) => (
                        <InlineStack gap="150" key={idx} blockAlign="center">
                          <span style={{ color: "var(--gg-accent-red)" }}>✗</span>
                          <span style={{ fontSize: 13, color: "var(--gg-text-muted)" }}>{feat}</span>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}
            </Grid.Cell>
          </Grid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
