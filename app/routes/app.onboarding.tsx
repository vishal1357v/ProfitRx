import { useState, useCallback } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page, Card, Text, BlockStack, InlineStack, Button, ProgressBar,
  TextField, Banner, Box, Divider, Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { OnboardingApplicationService } from "../application/onboarding/onboarding.application";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const STEPS = [
  { key: "welcome", label: "Welcome", icon: "👋" },
  { key: "shopify", label: "Connect Shopify", icon: "🔗" },
  { key: "sync", label: "Sync Orders", icon: "📦" },
  { key: "cogs", label: "Configure COGS", icon: "💸" },
  { key: "expenses", label: "Configure Expenses", icon: "🚚" },
  { key: "taxes", label: "Configure Taxes", icon: "📋" },
  { key: "preview", label: "Profit Preview", icon: "📊" },
  { key: "finish", label: "Finish", icon: "🎉" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";
  const email = (session as any).email || "";

  const state = await OnboardingApplicationService.getOnboardingState(shop, host, email);

  // If already completed, redirect to dashboard
  if (state.onboardingCompleted) {
    throw redirect(`/app/dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`);
  }

  return state;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save_step") {
    const step = parseInt(formData.get("step") as string, 10) || 0;
    await OnboardingApplicationService.saveStep(shop, step);
    return Response.json({ success: true });
  }

  if (intent === "save_expenses") {
    const defaultForwardShipping = parseFloat(formData.get("defaultForwardShipping") as string) || 60;
    const defaultReturnShipping = parseFloat(formData.get("defaultReturnShipping") as string) || 70;
    const defaultCODHandling = parseFloat(formData.get("defaultCODHandling") as string) || 40;
    const defaultPackaging = parseFloat(formData.get("defaultPackaging") as string) || 10;
    const defaultGatewayFeePct = parseFloat(formData.get("defaultGatewayFeePct") as string) || 2;

    await OnboardingApplicationService.saveExpenses(shop, {
      defaultForwardShipping,
      defaultReturnShipping,
      defaultCODHandling,
      defaultPackaging,
      defaultGatewayFeePct,
    });
    return Response.json({ success: true });
  }

  if (intent === "save_taxes") {
    const gstin = (formData.get("gstin") as string) || "";
    const gstRate = parseFloat(formData.get("gstRate") as string) || 18;
    const isGstRegistered = formData.get("isGstRegistered") === "true";

    await OnboardingApplicationService.saveTaxes(shop, {
      gstin,
      gstRate,
      isGstRegistered,
    });
    return Response.json({ success: true });
  }

  if (intent === "complete") {
    await OnboardingApplicationService.completeOnboarding(shop);
    const url = new URL(request.url);
    const host = url.searchParams.get("host") || "";
    return redirect(`/app/dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`);
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
};

export default function OnboardingRoute() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [step, setStep] = useState(data.currentStep);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Expense form state
  const [fwdShipping, setFwdShipping] = useState(String(data.settings.defaultForwardShipping));
  const [retShipping, setRetShipping] = useState(String(data.settings.defaultReturnShipping));
  const [codHandling, setCodHandling] = useState(String(data.settings.defaultCODHandling));
  const [packaging, setPackaging] = useState(String(data.settings.defaultPackaging));
  const [gatewayFee, setGatewayFee] = useState(String(data.settings.defaultGatewayFeePct));

  // Tax form state
  const [gstin, setGstin] = useState(data.settings.gstin);
  const [gstRate, setGstRate] = useState(String(data.settings.gstRate));
  const [isGstRegistered, setIsGstRegistered] = useState(data.settings.isGstRegistered);

  const progress = ((step + 1) / STEPS.length) * 100;

  const goNext = useCallback(() => {
    const nextStep = Math.min(step + 1, STEPS.length - 1);
    setStep(nextStep);
    const fd = new FormData();
    fd.set("intent", "save_step");
    fd.set("step", String(nextStep));
    submit(fd, { method: "post" });
  }, [step, submit]);

  const goPrev = useCallback(() => {
    setStep(Math.max(step - 1, 0));
  }, [step]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync-orders", { method: "POST" });
      const resData = await res.json();
      if (res.ok) {
        setSyncResult(`✅ Synced ${resData.count || 0} orders!`);
      } else {
        setSyncResult(`❌ ${resData.error || "Sync failed"}`);
      }
    } catch {
      setSyncResult("❌ Network error. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveExpenses = () => {
    const fd = new FormData();
    fd.set("intent", "save_expenses");
    fd.set("defaultForwardShipping", fwdShipping);
    fd.set("defaultReturnShipping", retShipping);
    fd.set("defaultCODHandling", codHandling);
    fd.set("defaultPackaging", packaging);
    fd.set("defaultGatewayFeePct", gatewayFee);
    submit(fd, { method: "post" });
    goNext();
  };

  const handleSaveTaxes = () => {
    const fd = new FormData();
    fd.set("intent", "save_taxes");
    fd.set("gstin", gstin);
    fd.set("gstRate", gstRate);
    fd.set("isGstRegistered", String(isGstRegistered));
    submit(fd, { method: "post" });
    goNext();
  };

  const handleComplete = () => {
    const fd = new FormData();
    fd.set("intent", "complete");
    submit(fd, { method: "post" });
  };

  const currentStepInfo = STEPS[step];

  return (
    <Page title="Welcome to ProfitRx" narrowWidth>
      {/* Progress Indicator */}
      <Box paddingBlockEnd="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="bodySm" as="span" tone="subdued">
            Step {step + 1} of {STEPS.length}
          </Text>
          <Text variant="bodySm" as="span" fontWeight="semibold">
            {Math.round(progress)}% complete
          </Text>
        </InlineStack>
        <div style={{ marginTop: 6 }}>
          <ProgressBar progress={progress} tone={progress === 100 ? "success" : "primary"} />
        </div>
        {/* Step dots */}
        <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 12 }}>
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              style={{
                width: i <= step ? 24 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i <= step ? "var(--gg-accent-blue)" : "var(--gg-border)",
                transition: "all 0.3s ease",
              }}
              aria-label={`Step ${i + 1}: ${s.label} ${i < step ? "(completed)" : i === step ? "(current)" : ""}`}
            />
          ))}
        </div>
      </Box>

      <Card>
        <Box padding="600">
          <BlockStack gap="500">
            {/* Step Icon + Title */}
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 48, display: "block", marginBottom: 8 }}>{currentStepInfo.icon}</span>
              <Text variant="headingLg" as="h1">{currentStepInfo.label}</Text>
            </div>

            <Divider />

            {/* ── Step 0: Welcome ── */}
            {step === 0 && (
              <BlockStack gap="300">
                <Text variant="bodyLg" as="p">
                  ProfitRx is the only Shopify profit tracker built for Indian D2C brands.
                </Text>
                <BlockStack gap="200">
                  {[
                    "✅ True profit after COGS, shipping, gateway fees, and RTO losses",
                    "✅ COD risk scoring with pincode-level intelligence",
                    "✅ Automated ad spend tracking (Meta, Google, TikTok)",
                    "✅ GST compliance with GSTR-1 exports",
                    "✅ Weekly WhatsApp profit digests",
                  ].map((item) => (
                    <Text key={item} variant="bodyMd" as="p">{item}</Text>
                  ))}
                </BlockStack>
                <Text variant="bodySm" as="p" tone="subdued">
                  This setup takes about 3 minutes. You can resume later anytime.
                </Text>
              </BlockStack>
            )}

            {/* ── Step 1: Connect Shopify ── */}
            {step === 1 && (
              <BlockStack gap="300">
                <Banner tone="success" title="✅ Shopify Connected">
                  <p>Your store <strong>{data.shop}</strong> is already connected via OAuth. No action needed!</p>
                </Banner>
                <Text variant="bodySm" as="p" tone="subdued">
                  ProfitRx reads your orders, products, and customers securely through Shopify&apos;s API.
                </Text>
              </BlockStack>
            )}

            {/* ── Step 2: Sync Orders ── */}
            {step === 2 && (
              <BlockStack gap="300">
                <Text variant="bodyMd" as="p">
                  Let&apos;s pull your recent orders from Shopify. This downloads up to 60 days of order history.
                </Text>
                {data.orderCount > 0 ? (
                  <Banner tone="success">
                    <p>You already have <strong>{data.orderCount} orders</strong> synced!</p>
                  </Banner>
                ) : (
                  <Button variant="primary" onClick={handleSync} loading={syncing} fullWidth>
                    ⟳ Sync Orders Now
                  </Button>
                )}
                {syncResult && (
                  <Banner tone={syncResult.startsWith("✅") ? "success" : "critical"}>
                    {syncResult}
                  </Banner>
                )}
              </BlockStack>
            )}

            {/* ── Step 3: Configure COGS ── */}
            {step === 3 && (
              <BlockStack gap="300">
                <Text variant="bodyMd" as="p">
                  COGS (Cost of Goods Sold) is the manufacturing or purchase cost of your products.
                  ProfitRx can auto-sync from Shopify if you&apos;ve entered cost per item.
                </Text>
                {data.cogsCount > 0 ? (
                  <Banner tone="success">
                    <p><strong>{data.cogsCount} products</strong> already have COGS configured!</p>
                  </Banner>
                ) : (
                  <Banner tone="info">
                    <p>No COGS found yet. You can configure them in detail after setup, or auto-sync from Shopify.</p>
                  </Banner>
                )}
                <Button
                  variant="secondary"
                  url={`/app/cogs?shop=${data.shop}&host=${data.host}`}
                >
                  Open COGS Catalog →
                </Button>
                <Text variant="bodySm" as="p" tone="subdued">
                  You can skip this step and configure COGS later. ProfitRx will use a default {data.settings.defaultCOGSPct}% estimate until then.
                </Text>
              </BlockStack>
            )}

            {/* ── Step 4: Configure Expenses ── */}
            {step === 4 && (
              <BlockStack gap="300">
                <Text variant="bodyMd" as="p">
                  Set your default per-order costs. These apply when order-specific costs aren&apos;t available.
                </Text>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <TextField label="Forward Shipping (₹)" type="number" value={fwdShipping} onChange={setFwdShipping} autoComplete="off" />
                  <TextField label="Return Shipping (₹)" type="number" value={retShipping} onChange={setRetShipping} autoComplete="off" />
                  <TextField label="COD Handling (₹)" type="number" value={codHandling} onChange={setCodHandling} autoComplete="off" />
                  <TextField label="Packaging (₹)" type="number" value={packaging} onChange={setPackaging} autoComplete="off" />
                </div>
                <TextField label="Gateway Fee (%)" type="number" value={gatewayFee} onChange={setGatewayFee} autoComplete="off" helpText="Razorpay/Cashfree/PayU typically charge 2%" />
              </BlockStack>
            )}

            {/* ── Step 5: Configure Taxes ── */}
            {step === 5 && (
              <BlockStack gap="300">
                <Text variant="bodyMd" as="p">
                  Configure GST settings for compliance tracking and GSTR-1 exports.
                </Text>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <TextField label="GSTIN" value={gstin} onChange={setGstin} placeholder="22AAAAA0000A1Z5" autoComplete="off" />
                  </div>
                  <Button
                    variant={isGstRegistered ? "primary" : "secondary"}
                    onClick={() => setIsGstRegistered(!isGstRegistered)}
                  >
                    {isGstRegistered ? "✓ GST Registered" : "Not Registered"}
                  </Button>
                </div>
                <TextField label="Default GST Rate (%)" type="number" value={gstRate} onChange={setGstRate} autoComplete="off" helpText="Most products: 18%. Apparel under ₹1000: 5%" />
              </BlockStack>
            )}

            {/* ── Step 6: Profit Preview ── */}
            {step === 6 && (
              <BlockStack gap="300">
                <Text variant="bodyMd" as="p">
                  Based on your settings, here&apos;s a preview of your store&apos;s estimated profit:
                </Text>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  padding: 20,
                  borderRadius: "var(--gg-radius-lg)",
                  background: "var(--gg-surface-2)",
                  border: "1px solid var(--gg-border)",
                }}>
                  <BlockStack gap="050">
                    <Text variant="bodySm" as="span" tone="subdued">Estimated Revenue</Text>
                    <span className="gg-stat-value" style={{ fontSize: 28 }}>
                      ₹{Math.round(data.previewRevenue).toLocaleString("en-IN")}
                    </span>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text variant="bodySm" as="span" tone="subdued">Estimated Profit</Text>
                    <span className={data.previewProfit >= 0 ? "gg-stat-value-green" : "gg-stat-value-red"} style={{ fontSize: 28 }}>
                      {data.previewProfit < 0 ? "-" : ""}₹{Math.round(Math.abs(data.previewProfit)).toLocaleString("en-IN")}
                    </span>
                  </BlockStack>
                </div>
                {data.orderCount === 0 && (
                  <Banner tone="info">
                    <p>Sync your orders first to see real profit estimates.</p>
                  </Banner>
                )}
                <Text variant="bodySm" as="p" tone="subdued">
                  These are estimates based on default settings. Actual profit will be calculated per-order after COGS are configured.
                </Text>
              </BlockStack>
            )}

            {/* ── Step 7: Finish ── */}
            {step === 7 && (
              <BlockStack gap="300" inlineAlign="center">
                <Text variant="bodyLg" as="p">
                  You&apos;re all set! Your ProfitRx dashboard is ready.
                </Text>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, width: "100%" }}>
                  <div style={{ textAlign: "center", padding: 16, borderRadius: "var(--gg-radius-md)", background: "var(--gg-surface-2)", border: "1px solid var(--gg-border)" }}>
                    <span style={{ fontSize: 24 }}>📦</span>
                    <Text variant="bodySm" as="p" fontWeight="bold">{data.orderCount}</Text>
                    <Text variant="bodyXs" as="p" tone="subdued">Orders</Text>
                  </div>
                  <div style={{ textAlign: "center", padding: 16, borderRadius: "var(--gg-radius-md)", background: "var(--gg-surface-2)", border: "1px solid var(--gg-border)" }}>
                    <span style={{ fontSize: 24 }}>💸</span>
                    <Text variant="bodySm" as="p" fontWeight="bold">{data.cogsCount}</Text>
                    <Text variant="bodyXs" as="p" tone="subdued">COGS Set</Text>
                  </div>
                  <div style={{ textAlign: "center", padding: 16, borderRadius: "var(--gg-radius-md)", background: "var(--gg-surface-2)", border: "1px solid var(--gg-border)" }}>
                    <span style={{ fontSize: 24 }}>⚡</span>
                    <Text variant="bodySm" as="p" fontWeight="bold">Ready</Text>
                    <Text variant="bodyXs" as="p" tone="subdued">Dashboard</Text>
                  </div>
                </div>
              </BlockStack>
            )}

            <Divider />

            {/* Navigation */}
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200">
                {step > 0 && (
                  <Button variant="secondary" onClick={goPrev}>← Back</Button>
                )}
                <Button
                  variant="plain"
                  url={`/app/dashboard?shop=${data.shop}&host=${data.host}`}
                >
                  Resume Later
                </Button>
              </InlineStack>

              {step < 7 ? (
                step === 4 ? (
                  <Button variant="primary" onClick={handleSaveExpenses}>Save & Continue →</Button>
                ) : step === 5 ? (
                  <Button variant="primary" onClick={handleSaveTaxes}>Save & Continue →</Button>
                ) : (
                  <Button variant="primary" onClick={goNext}>Continue →</Button>
                )
              ) : (
                <Button variant="primary" onClick={handleComplete}>
                  🚀 Go to Dashboard
                </Button>
              )}
            </InlineStack>
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}
