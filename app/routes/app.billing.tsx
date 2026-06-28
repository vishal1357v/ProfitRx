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

  return {
    shop: session.shop,
    plan: subscription.plan,
    status: subscription.status,
    orderLimit: subscription.orderLimit,
    ordersUsed: subscription.ordersUsed,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "cancel_subscription") {
    // Revert subscription back to Starter with Starter limits, or set canceled status
    await prisma.subscription.update({
      where: { shop: session.shop },
      data: {
        plan: "STARTER",
        status: "ACTIVE", // Downgrade to active starter tier
        orderLimit: 500,
        ordersUsed: 0,
        shopifyChargeId: null,
      },
    });
    return { success: true, message: "Subscription downgraded to Starter plan successfully." };
  }

  return { error: "Unknown action" };
};

export default function BillingPage() {
  const { plan, status, orderLimit, ordersUsed } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const limitText = orderLimit ? `${orderLimit.toLocaleString()} orders` : "Unlimited";
  const usedPercent = orderLimit ? Math.min(100, Math.round((ordersUsed / orderLimit) * 100)) : 0;

  // Determine progress color
  const progressTone = usedPercent > 90 ? "critical" : usedPercent > 70 ? "warning" : "success";

  // Detailed features list per plan
  const planInfo = {
    STARTER: {
      name: "Starter Tier",
      price: "$19/mo",
      color: "info",
      includes: ["True Profit Dashboard", "Health Score Dashboard", "Basic RTO tracking (unfulfilled limits)"],
      lacks: ["AI Channel Attribution", "RTO Pincode Heatmap", "Customer Cohort / Retention LTV", "Blended ROAS ad sync"],
    },
    GROWTH: {
      name: "Growth Tier",
      price: "$39/mo",
      color: "attention",
      includes: ["True Profit Dashboard", "Health Score Dashboard", "AI Channel Attribution (Gemini/ChatGPT/Copilot)", "RTO heatmaps", "COD Pincode Risk Scoring", "Up to 2,000 orders/mo sync"],
      lacks: ["Customer Cohort LTV analytics", "Blended ROAS spend charts", "Priority support SLAs"],
    },
    PRO: {
      name: "Pro Enterprise",
      price: "$79/mo",
      color: "success",
      includes: ["True Profit Dashboard", "Health Score Dashboard", "AI Channel Attribution", "RTO Pincode heatmaps", "COD Pincode Risk Scoring", "Customer Cohort LTV analytics", "Blended ROAS spend charts", "Priority support & Dedicated Account Manager", "Beta access to predictive margins"],
      lacks: [],
    },
  }[plan.toUpperCase() as "STARTER" | "GROWTH" | "PRO"] || {
    name: "Starter Tier",
    price: "$19/mo",
    color: "info",
    includes: ["True Profit Dashboard", "Health Score Dashboard", "Basic RTO tracking"],
    lacks: [],
  };

  return (
    <Page title="Store Billing & Plan Usage">
      <Layout>
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
                      <Button url="/app/pricing" variant="primary" fullWidth>
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
