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
import { SubscriptionSyncService } from "../services/subscription-sync.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const forceSync = url.searchParams.get("plan_updated") === "true" || url.searchParams.get("sync") === "true";
  
  const sub = await SubscriptionSyncService.syncSubscriptionWithShopify(session.shop, billing, forceSync);
  
  let host = url.searchParams.get("host") || "";
  if (!host && session?.shop) {
    const storeHandle = session.shop.replace(".myshopify.com", "");
    host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
  }

  // Redirect to dashboard if they already have an active subscription (and aren't trying to change plans)
  const isChangingPlan = url.searchParams.get("change_plan") === "true";
  if (!isChangingPlan && sub && sub.plan !== "FREE" && (sub.status === "ACTIVE" || sub.status === "TRIALING")) {
    return redirect(`/app/dashboard?shop=${session.shop}&host=${host}`);
  }

  const currentPlan = sub.plan === "PRO" ? "Pro" : sub.plan === "GROWTH" ? "Growth" : sub.plan === "STARTER" ? "Starter" : "Free";
  return { currentPlan, shop: session.shop, host };
};

type BillingPlan = "STARTER" | "GROWTH" | "PRO";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "sync_subscription") {
    try {
      const sub = await SubscriptionSyncService.syncSubscriptionWithShopify(session.shop, billing, true);
      if (sub && sub.plan !== "FREE" && (sub.status === "ACTIVE" || sub.status === "TRIALING")) {
        return redirect(`/app/dashboard?shop=${session.shop}&host=${host}`);
      }
      return Response.json({ success: true, message: `Subscription synced. Local plan status is ${sub.plan}.` });
    } catch (err: any) {
      return Response.json({ error: err.message || "Failed to sync subscription" }, { status: 500 });
    }
  }

  const rawPlan = (formData.get("plan") as string) || "";
  const upperPlan = rawPlan.toUpperCase();

  let plan: BillingPlan = "STARTER";
  if (upperPlan === "PRO") plan = "PRO";
  else if (upperPlan === "GROWTH") plan = "GROWTH";
  else if (upperPlan === "STARTER" || upperPlan === "BASIC") plan = "STARTER";
  else {
    return Response.json({ error: "Invalid plan selected" }, { status: 400 });
  }

  const dbPlan = plan;
  const returnUrl = `https://${url.host}/app/dashboard?shop=${session.shop}&host=${encodeURIComponent(host)}&plan_updated=true`;

  // Pre-persist the selected plan as PENDING so the DB records merchant intent
  // before Shopify redirect. If the post-payment sync fails (race condition),
  // the sync service can respect this PENDING state instead of reverting to FREE.
  await SubscriptionSyncService.upsertSubscriptionRecord({
    shop: session.shop,
    plan: dbPlan,
    status: "PENDING",
  });

  if (process.env.NODE_ENV === "development") {
    console.log("[Pricing] Development Bypass Active - Skipping Shopify Billing API");
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    await SubscriptionSyncService.upsertSubscriptionRecord({
      shop: session.shop,
      plan: dbPlan,
      status: "TRIALING",
      trialEndsAt,
    });
    return redirect(`/app/dashboard?shop=${session.shop}&host=${host}&plan_updated=true`);
  }

  try {
    return await (billing.request as any)({
      plan: plan,
      isTest: process.env.NODE_ENV !== "production",
      trialDays: 14,
      returnUrl,
    });
  } catch (error: any) {
    console.error("[Pricing Action Error]:", error);
    if (error instanceof Response || (error && typeof error.status === "number" && error.headers)) {
      throw error;
    }
    
    // Revert the PENDING status since Shopify billing failed to initiate
    await SubscriptionSyncService.upsertSubscriptionRecord({
      shop: session.shop,
      plan: "FREE",
      status: "ACTIVE",
    });

    return Response.json({ error: "Failed to initiate Shopify billing. Please try again or contact support." }, { status: 500 });
  }
};

export default function Pricing() {
  const { currentPlan, shop, host } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string; success?: boolean; message?: string }>();
  const navigation = useNavigation();
  const isSyncing = navigation.state === "submitting" && navigation.formData?.get("intent") === "sync_subscription";

  const plans = [
    {
      name: "Starter",
      price: "₹1,500",
      description: "Small & early-stage stores",
      tagline: "Essential profit tracking, COGS management, GST reports, and basic RTO insights.",
      features: [
        "Up to 500 orders / month",
        "True Profit Dashboard",
        "Store Health Score",
        "Product Cost Tracking (COGS)",
        "Basic RTO & COD insights",
        "GST Compliance Reports",
        "Weekly WhatsApp Digest",
        "CSV Data Export",
      ],
    },
    {
      name: "Growth",
      price: "₹3,000",
      description: "Growing stores ⭐ Most Popular",
      tagline: "Pincode-level logistics intelligence, COD Risk Shield, and profit leak detection.",
      features: [
        "Up to 2,000 orders / month",
        "Everything in Starter",
        "COD Risk Score (Pre-shipment prediction)",
        "Pincode RTO Heatmap",
        "Profit Leak Recommendations",
        "COD Shield & OTP Verification",
        "Advanced Email & System Alerts",
      ],
      popular: true,
    },
    {
      name: "Pro",
      price: "₹6,000",
      description: "Established brands & high-volume stores",
      tagline: "Full enterprise intelligence suite with unlimited order sync, ROAS ad spend, and cohort retention.",
      features: [
        "Unlimited orders / month",
        "Everything in Growth",
        "LTV & Cohort Retention Analysis",
        "Blended ROAS & Ad Spend Sync",
        "Full Customer Intelligence",
        "Multi-Store Support",
        "API Access for Custom Integrations",
        "Priority Support & Dedicated Onboarding",
      ],
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

        {actionData?.success && actionData?.message && (
          <Layout.Section>
            <Banner tone="success" title="Subscription Status Synced">
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Banner tone="info">
            <BlockStack gap="100">
              <Text as="p">Prices are exclusive of 18% GST. Shopify will calculate and add GST at checkout.</Text>
              <Text as="p"><strong>WhatsApp / SMS Notice:</strong> Interactive OTP verification and digests leverage your own Meta Cloud API or Twilio account. You will be billed directly by the provider for any message transmission costs.</Text>
            </BlockStack>
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
                        {plan.name !== "Free" && (
                          <Badge tone="attention">14-Day Free Trial</Badge>
                        )}
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
                      <input type="hidden" name="plan" value={plan.name} />
                      <Button
                        variant={plan.name === currentPlan ? undefined : plan.popular ? "primary" : undefined}
                        submit
                        fullWidth
                        disabled={currentPlan === plan.name}
                      >
                        {currentPlan === plan.name ? "Current Plan" : plan.name === "Free" ? "Choose Free Plan" : "Start 14-Day Free Trial"}
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
                        <td>Product Cost Tracking (COGS)</td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>GST Compliance Reports & Export</td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Basic RTO Insights & Alerts</td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>COD Risk Score & Heatmap</td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Profit Leaks & COD Risk Shield</td>
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
                        <td>ROAS & Ad Spend Sync</td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-red)" }}>✗ No</span></td>
                        <td><span style={{ color: "var(--gg-accent-green)" }}>✓ Yes</span></td>
                      </tr>
                      <tr>
                        <td>Multi-store & API Access</td>
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
