import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useActionData, redirect } from "react-router";
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
import prisma from "../db.server";
import { syncSubscriptionWithShopify } from "../services/subscription-sync.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const sub = await syncSubscriptionWithShopify(session.shop, billing);
  const currentPlan = sub.plan === "PRO" ? "Pro" : sub.plan === "GROWTH" ? "Growth" : sub.plan === "STARTER" ? "Starter" : "Free";
  return { currentPlan, shop: session.shop };
};

type BillingPlan = "Starter" | "Growth" | "Pro";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";
  const formData = await request.formData();
  const rawPlan = (formData.get("plan") as string) || "";
  const upperPlan = rawPlan.toUpperCase();

  let plan: BillingPlan = "Starter";
  if (upperPlan === "PRO") plan = "Pro";
  else if (upperPlan === "GROWTH") plan = "Growth";
  else if (upperPlan === "STARTER" || upperPlan === "BASIC") plan = "Starter";
  else {
    return Response.json({ error: "Invalid plan selected" }, { status: 400 });
  }

  const isBypass = process.env.BYPASS_BILLING === "true";
  const orderLimit = plan === "Pro" ? null : plan === "Growth" ? 2000 : 500;
  const dbPlan = plan.toUpperCase();

  if (isBypass) {
    await prisma.subscription.upsert({
      where: { shop: session.shop },
      update: { plan: dbPlan, status: "ACTIVE", orderLimit },
      create: { shop: session.shop, plan: dbPlan, status: "ACTIVE", orderLimit, ordersUsed: 0 },
    });
    return redirect(`/app/billing?shop=${session.shop}&host=${host}&plan_updated=true`);
  }

  try {
    return await (billing.request as any)({
      plan: plan,
      isTest: true,
    });
  } catch (error: any) {
    console.error("[Pricing Action Error]:", error);
    if (error instanceof Response) {
      throw error;
    }
    
    // Fallback to local DB update for dev mode / non-public distribution apps
    await prisma.subscription.upsert({
      where: { shop: session.shop },
      update: { plan: dbPlan, status: "ACTIVE", orderLimit },
      create: { shop: session.shop, plan: dbPlan, status: "ACTIVE", orderLimit, ordersUsed: 0 },
    });
    return redirect(`/app/billing?shop=${session.shop}&host=${host}&plan_updated=true`);
  }
};

export default function Pricing() {
  const { currentPlan } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string }>();

  const plans = [
    {
      name: "Starter",
      price: "₹1,500",
      description: "Small & early-stage stores",
      tagline: "Essential profit tracking, product COGS management, and basic RTO insights.",
      features: [
        "Up to 500 orders / month",
        "True Profit Dashboard",
        "Store Health Score",
        "Product cost tracking (COGS)",
        "Basic RTO & COD insights",
        "Weekly WhatsApp report digest",
      ],
    },
    {
      name: "Growth",
      price: "₹3,000",
      description: "Growing stores ⭐ Most Popular",
      tagline: "Pincode-level logistics intelligence and pre-shipment COD risk detection.",
      features: [
        "Up to 2,000 orders / month",
        "Everything in Starter",
        "COD Risk Score (Pre-shipment prediction)",
        "Pincode RTO Heatmap",
        "Profit Leak Recommendations",
        "Advanced email & system alerts",
      ],
      popular: true,
    },
    {
      name: "Pro",
      price: "₹6,000",
      description: "Established brands & high-volume stores",
      tagline: "Full enterprise intelligence suite with unlimited order sync and cohort retention.",
      features: [
        "Unlimited orders / month",
        "Everything in Growth",
        "LTV & Cohort Retention Analysis",
        "Blended ROAS & Ad Spend Sync",
        "Multi-store support",
        "Predictive Margins",
        "Priority Support & Dedicated Onboarding",
      ],
    },
  ];

  return (
    <Page title="Select a Subscription Plan">
      <Layout>
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical" title="Plan Selection Failed">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Banner tone="info">
            Prices are exclusive of 18% GST. Shopify will calculate and add GST at checkout.
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <div style={{ marginBottom: "20px", textAlign: "center" }}>
            <Text variant="headingLg" as="h1">
              Select Your Subscription Plan
            </Text>
            <div style={{ marginTop: "8px" }}>
              <Text variant="bodyMd" as="p" tone="subdued" fontWeight="medium">
                💡 Try any plan risk-free for 14 days. Instant setup, cancel anytime.
              </Text>
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
                      {plan.popular && (
                        <Badge tone="success">Popular</Badge>
                      )}
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
                      <input type="hidden" name="plan" value={plan.name} />
                      <Button
                        variant={plan.name === currentPlan ? undefined : plan.popular ? "primary" : undefined}
                        submit
                        fullWidth
                        disabled={currentPlan === plan.name}
                      >
                        {currentPlan === plan.name ? "Current Plan" : "Choose " + plan.name + " Plan"}
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
                        <th style={{ width: "28%" }}>Feature</th>
                        <th style={{ width: "18%" }}>Free</th>
                        <th style={{ width: "18%" }}>Starter</th>
                        <th style={{ width: "18%" }}>Growth</th>
                        <th style={{ width: "18%" }}>Pro</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>Order limit / month</strong></td>
                        <td>Up to 50 orders</td>
                        <td>Up to 500 orders</td>
                        <td>Up to 2,000 orders</td>
                        <td><strong>Unlimited orders</strong></td>
                      </tr>
                      <tr>
                        <td>Real Profit Dashboard</td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Store Health Score</td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Product Cost Tracking & Profit Calc</td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Basic COD/RTO Insights</td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Weekly WhatsApp Digest</td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>COD Risk Score & High-Risk COD Areas</td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>AI Profit Recommendations</td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>LTV & Cohort Retention Analysis</td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>ROAS & Ad Spend Metrics</td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
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
