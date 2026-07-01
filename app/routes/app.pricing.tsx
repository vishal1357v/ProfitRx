import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useActionData, redirect } from "react-router";
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  
  // Check active plans
  const subscriptionResponse = await billing.check({
    plans: ["Starter", "Growth", "Pro"],
    isTest: true,
  });

  const activePlan = subscriptionResponse.appSubscriptions.find(
    (sub) => sub.status === "ACTIVE"
  )?.name || null;

  const localSub = await prisma.subscription.findUnique({
    where: { shop: session.shop },
  });
  const currentPlan = activePlan || (localSub?.plan === "FREE" ? "Free" : "Free");

  return { currentPlan, shop: session.shop };
};

type BillingPlan = "Starter" | "Growth" | "Pro";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan") as BillingPlan;

  if (!["Starter", "Growth", "Pro"].includes(plan)) {
    return Response.json({ error: "Invalid plan selected" }, { status: 400 });
  }

  try {
    return await billing.request({
      plan,
      isTest: true,
    });
  } catch (error: any) {
    console.error("[Pricing Action Error]:", error);
    if (error instanceof Response) {
      throw error;
    }
    
    let detailedMessage = error instanceof Error ? error.message : "Failed to initiate subscription trial";
    if (error.errorData && Array.isArray(error.errorData)) {
      const details = error.errorData.map((e: any) => e.message || JSON.stringify(e)).join(", ");
      detailedMessage = `${detailedMessage}: ${details}`;
    }
    
    return Response.json(
      { error: detailedMessage },
      { status: 500 }
    );
  }
};

export default function Pricing() {
  const { currentPlan } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string }>();

  const plans = [
    {
      name: "Free",
      price: "₹0 ($0)",
      description: "Basic dashboard and health insights for first-time store setups.",
      features: [
        "Up to 50 orders tracked",
        "True Profit Dashboard",
        "Health Score Metric",
        "Upgrade prompt on lockscreens",
        "Forever Free tier",
      ],
    },
    {
      name: "Starter",
      price: "₹1,500 ($19)",
      description: "Essential analytics tools for growing storefronts.",
      features: [
        "Up to 500 orders/month",
        "Everything in Free Plan",
        "Basic RTO tracking lists",
        "Full margin metrics",
        "14-day free trial",
      ],
    },
    {
      name: "Growth",
      price: "₹3,000 ($39)",
      description: "Scale storefront efficiency with deep RTO heatmap maps and risk scores.",
      features: [
        "Up to 2,000 orders/month",
        "Everything in Starter Plan",
        "AI Channel Attribution",
        "RTO Pincode Heatmap",
        "COD Risk Scoring Engine",
        "14-day free trial",
      ],
      popular: true,
    },
    {
      name: "Pro",
      price: "₹6,000 ($79)",
      description: "Full suite access for high-volume stores needing cohort retention and blended metrics.",
      features: [
        "Unlimited orders/month",
        "Everything in Growth Plan",
        "LTV & Cohort Retention Analysis",
        "Blended ROAS & ad spends",
        "Priority Support & Beta access",
        "14-day free trial",
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
          <div style={{ marginBottom: "20px", textAlign: "center" }}>
            <Text variant="headingLg" as="h1">
              Select Your Plan
            </Text>
            <Text variant="bodyMd" as="p" tone="subdued">
              Upgrade to unlock full features. Start with a 14-day free trial on any paid plan.
            </Text>
          </div>
        </Layout.Section>

        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 4, md: 4, lg: 4 }}>
            {plans.map((plan) => (
              <Grid.Cell key={plan.name}>
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingLg" as="h3">
                        {plan.name}
                      </Text>
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

                    <Text variant="bodyMd" as="p" tone="subdued">
                      {plan.description}
                    </Text>

                    {plan.name === "Free" ? (
                      <Button
                        variant="secondary"
                        disabled={currentPlan === "Free"}
                        fullWidth
                      >
                        {currentPlan === "Free" ? "Current Plan" : "Downgrade in Shopify"}
                      </Button>
                    ) : (
                      <Form method="POST">
                        <input type="hidden" name="plan" value={plan.name} />
                        <Button
                          variant={plan.popular ? "primary" : "secondary"}
                          submit
                          fullWidth
                          disabled={currentPlan === plan.name}
                        >
                          {currentPlan === plan.name ? "Current Plan" : "Start 14-Day Trial"}
                        </Button>
                      </Form>
                    )}

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
                        <td>True Profit Dashboard</td>
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
                        <td>Basic RTO Tracking</td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>RTO Heatmap & COD Risk Score</td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>AI Channel Attribution</td>
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
                        <td>Blended ROAS & Ad Spend Metrics</td>
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
