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
  const { billing } = await authenticate.admin(request);
  
  // Check active plans
  const subscriptionResponse = await billing.check({
    plans: ["Starter", "Growth", "Pro"],
    isTest: true,
  });

  const activePlan = subscriptionResponse.appSubscriptions.find(
    (sub) => sub.status === "ACTIVE"
  )?.name || null;

  return { activePlan };
};

type BillingPlan = "Starter" | "Growth" | "Pro";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan") as BillingPlan;

  if (!["Starter", "Growth", "Pro"].includes(plan)) {
    return Response.json({ error: "Invalid plan selected" }, { status: 400 });
  }

  const isBypass = process.env.BYPASS_BILLING === "true";

  if (isBypass) {
    await prisma.subscription.upsert({
      where: { shop: session.shop },
      update: {
        plan: plan.toUpperCase(),
        status: "ACTIVE",
        shopifyChargeId: "mock_charge_" + Math.random().toString(36).substring(2, 10),
        orderLimit: plan === "Pro" ? null : plan === "Growth" ? 2000 : 500,
      },
      create: {
        shop: session.shop,
        plan: plan.toUpperCase(),
        status: "ACTIVE",
        shopifyChargeId: "mock_charge_" + Math.random().toString(36).substring(2, 10),
        orderLimit: plan === "Pro" ? null : plan === "Growth" ? 2000 : 500,
        ordersUsed: 0,
      },
    });

    const url = new URL(request.url);
    const host = url.searchParams.get("host") || "";
    throw redirect(`/app/dashboard?shop=${session.shop}&host=${host}`);
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
  const { activePlan } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string }>();

  const plans = [
    {
      name: "Starter",
      price: "$19",
      description: "Essential tools for stores getting started with basic profitability insights.",
      features: [
        "Up to 500 orders/month",
        "True Profit Dashboard",
        "Health Score",
        "Basic RTO Tracking",
        "14-day free trial",
      ],
    },
    {
      name: "Growth",
      price: "$39",
      description: "Scale your store with deep AI attribution and visual heatmaps.",
      features: [
        "Up to 2,000 orders/month",
        "Everything in Starter",
        "AI Channel Attribution",
        "RTO Heatmap",
        "COD Risk Score",
        "14-day free trial",
      ],
      popular: true,
    },
    {
      name: "Pro",
      price: "$79",
      description: "Maximize your profitability with advanced cohort analysis and blended ad metrics.",
      features: [
        "Unlimited orders/month",
        "Everything in Growth",
        "LTV/Cohort Retention",
        "Blended ROAS & spend analysis",
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
              Start Your 14-Day Free Trial
            </Text>
            <Text variant="bodyMd" as="p" tone="subdued">
              Choose the plan that fits your business. Cancel or upgrade anytime.
            </Text>
          </div>
        </Layout.Section>

        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3 }}>
            {plans.map((plan) => (
              <Grid.Cell key={plan.name}>
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingLg" as="h3">
                        {plan.name}
                      </Text>
                      {plan.popular && (
                        <Badge tone="success">Most Popular</Badge>
                      )}
                    </InlineStack>

                    <InlineStack gap="100" blockAlign="baseline">
                      <Text variant="heading3xl" as="p">
                        {plan.price}
                      </Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        / month
                      </Text>
                    </InlineStack>

                    <Text variant="bodyMd" as="p" tone="subdued">
                      {plan.description}
                    </Text>

                    <Form method="POST">
                      <input type="hidden" name="plan" value={plan.name} />
                      <Button
                        variant={plan.popular ? "primary" : "secondary"}
                        submit
                        fullWidth
                        disabled={activePlan === plan.name}
                      >
                        {activePlan === plan.name ? "Current Plan" : "Start 14-Day Trial"}
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
      </Layout>
    </Page>
  );
}
