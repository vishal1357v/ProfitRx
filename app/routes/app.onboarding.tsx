import { useState, useCallback } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  ProgressBar,
  TextField,
  Banner,
  Box,
  Divider,
  Badge,
  RadioButton,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { OnboardingApplicationService } from "../application/onboarding/onboarding.application";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const STEPS = [
  { key: "sync", label: "Connect & Sync", subtitle: "Shopify connection & order import", icon: "📦" },
  { key: "costs", label: "Cost Settings", subtitle: "Estimated starting costs", icon: "🚚" },
  { key: "protection", label: "Protection Mode", subtitle: "Monitoring vs review policy", icon: "🛡️" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const isPreview = url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true";
  const host = url.searchParams.get("host") || "";

  if (isPreview) {
    return {
      shop: "glam-aura-india.myshopify.com",
      host: host || Buffer.from("admin.shopify.com/store/glam-aura-india").toString("base64"),
      currentStep: 0,
      onboardingCompleted: false,
      orderCount: 42,
      cogsCount: 15,
      settings: {
        defaultCOGSPct: 35,
        defaultForwardShipping: 60,
        defaultReturnShipping: 70,
        defaultCODHandling: 40,
        defaultPackaging: 10,
        defaultGatewayFeePct: 2,
        gstin: "",
        gstRate: 18,
        isGstRegistered: false,
      },
      previewRevenue: 124500,
      previewProfit: 38200,
      progress: {
        storeConnected: true,
        ordersSynced: true,
        cogsConfigured: false,
        codRulesConfigured: false,
        webhooksActive: true,
      },
    };
  }

  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const email = (session as any).email || "";

  const state = await OnboardingApplicationService.getOnboardingState(shop, host, email);

  // If already completed, redirect to dashboard
  if (state.onboardingCompleted) {
    throw redirect(`/app/dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`);
  }

  return state;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const isPreview = url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true";

  if (isPreview) {
    return Response.json({ success: true });
  }

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

  if (intent === "complete") {
    const mode = (formData.get("protectionMode") as string) || "OBSERVE";
    const { SettingsRepository } = await import("../infrastructure/repositories/settings.repository");
    await SettingsRepository.upsertStoreSettings(shop, { protectionMode: mode });
    await OnboardingApplicationService.completeOnboarding(shop);
    const host = url.searchParams.get("host") || "";
    return redirect(`/app/dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`);
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
};

export default function OnboardingRoute() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [step, setStep] = useState(Math.min(data.currentStep, STEPS.length - 1));
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Expense form state with honest estimated starting costs
  const [fwdShipping, setFwdShipping] = useState(String(data.settings.defaultForwardShipping || 60));
  const [retShipping, setRetShipping] = useState(String(data.settings.defaultReturnShipping || 70));
  const [codHandling, setCodHandling] = useState(String(data.settings.defaultCODHandling || 40));
  const [packaging, setPackaging] = useState(String(data.settings.defaultPackaging || 10));
  const [gatewayFee, setGatewayFee] = useState(String(data.settings.defaultGatewayFeePct || 2));

  // Protection mode selection (defaults to safe OBSERVE)
  const [selectedMode, setSelectedMode] = useState<"OBSERVE" | "REVIEW">("OBSERVE");

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
      const isPreview = typeof window !== "undefined" && (window.location.search.includes("preview=true") || window.location.search.includes("demo=true"));
      const res = await fetch(`/api/sync-orders${isPreview ? "?preview=true" : ""}`, { method: "POST" });
      const resData = await res.json();
      if (res.ok) {
        setSyncResult(`✅ Synced ${resData.count || resData.ordersFound || 0} recent orders! Historical sync continues in background.`);
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

  const handleComplete = () => {
    const fd = new FormData();
    fd.set("intent", "complete");
    fd.set("protectionMode", selectedMode);
    submit(fd, { method: "post" });
  };

  const currentStepInfo = STEPS[step];

  return (
    <Page title="Get Started with ProfitRx" narrowWidth>
      {/* Progress Indicator */}
      <Box paddingBlockEnd="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="bodySm" as="span" tone="subdued">
            Step {step + 1} of {STEPS.length}: {currentStepInfo.label}
          </Text>
          <Text variant="bodySm" as="span" fontWeight="semibold">
            {Math.round(progress)}% complete
          </Text>
        </InlineStack>
        <div style={{ marginTop: 6 }}>
          <ProgressBar progress={progress} tone={progress === 100 ? "success" : "primary"} />
        </div>
        {/* Step dots */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 12 }}>
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              style={{
                width: i <= step ? 28 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i <= step ? "var(--gg-accent-blue, #2563eb)" : "var(--gg-border, #d0d7de)",
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
              <span style={{ fontSize: 44, display: "block", marginBottom: 8 }}>{currentStepInfo.icon}</span>
              <Text variant="headingLg" as="h1">{currentStepInfo.label}</Text>
              <Text variant="bodySm" tone="subdued" as="p">{currentStepInfo.subtitle}</Text>
            </div>

            <Divider />

            {/* ── Step 1 of 3: Connect & Sync ── */}
            {step === 0 && (
              <BlockStack gap="400">
                <Banner tone="success" title="Shopify Store Securely Connected">
                  <p>Connected to <strong>{data.shop}</strong> with automated order & inventory sync.</p>
                </Banner>

                <BlockStack gap="200">
                  <Text variant="headingSm" as="h2">Your Shopify store is connected</Text>
                  <Text variant="bodyMd" as="p" tone="subdued">
                    Import recent orders to calculate your store&apos;s net profit and RTO return risks. Initial setup finishes in seconds while deeper historical synchronization continues in the background.
                  </Text>
                </BlockStack>

                {data.orderCount > 0 ? (
                  <Banner tone="info" title="Recent Orders Ready">
                    <p>
                      <strong>{data.orderCount} orders</strong> imported. You can proceed immediately while deeper historical data continues syncing in the background.
                    </p>
                  </Banner>
                ) : (
                  <Button variant="primary" onClick={handleSync} loading={syncing} fullWidth>
                    ⟳ Sync Recent Orders
                  </Button>
                )}

                {syncResult && (
                  <Banner tone={syncResult.startsWith("✅") ? "success" : "critical"}>
                    <p>{syncResult}</p>
                  </Banner>
                )}

                <Text variant="bodyXs" as="p" tone="subdued">
                  Ongoing new orders are evaluated automatically via Shopify webhooks in real time.
                </Text>
              </BlockStack>
            )}

            {/* ── Step 2 of 3: Cost Settings ── */}
            {step === 1 && (
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h2">Confirm your delivery costs</Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Estimated starting costs — edit to match your courier agreement.
                  </Text>
                </BlockStack>

                <Banner tone="info">
                  <p>
                    These starting values are standard estimates. Edit them now to match your actual courier rate card, or change them anytime in Settings.
                  </p>
                </Banner>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <TextField
                    label="Forward Delivery Courier (₹)"
                    type="number"
                    value={fwdShipping}
                    onChange={setFwdShipping}
                    autoComplete="off"
                    helpText="Average forward shipping fee"
                  />
                  <TextField
                    label="Return Shipping / RTO (₹)"
                    type="number"
                    value={retShipping}
                    onChange={setRetShipping}
                    autoComplete="off"
                    helpText="Reverse freight on returned parcels"
                  />
                  <TextField
                    label="COD Handling Fee (₹)"
                    type="number"
                    value={codHandling}
                    onChange={setCodHandling}
                    autoComplete="off"
                    helpText="Courier cash-collection fee"
                  />
                  <TextField
                    label="Packaging & Box (₹)"
                    type="number"
                    value={packaging}
                    onChange={setPackaging}
                    autoComplete="off"
                    helpText="Box, tape, flyer & materials"
                  />
                </div>

                <TextField
                  label="Payment Gateway Fee (%)"
                  type="number"
                  value={gatewayFee}
                  onChange={setGatewayFee}
                  autoComplete="off"
                  helpText="Online gateway fee (e.g. Razorpay/Cashfree standard 2%)"
                />

                <Text variant="bodyXs" as="p" tone="subdued">
                  Product item costs sync automatically from Shopify Admin. You can override individual product costs anytime in Product Costs.
                </Text>
              </BlockStack>
            )}

            {/* ── Step 3 of 3: Protection Mode ── */}
            {step === 2 && (
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h2">Choose how ProfitRx works</Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Select your initial protection policy. You can change this anytime.
                  </Text>
                </BlockStack>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div
                    onClick={() => setSelectedMode("OBSERVE")}
                    style={{
                      padding: "16px",
                      borderRadius: "8px",
                      border: selectedMode === "OBSERVE" ? "2px solid var(--gg-accent-blue, #2563eb)" : "1px solid var(--gg-border, #d0d7de)",
                      background: selectedMode === "OBSERVE" ? "rgba(37,99,235,0.04)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="150" blockAlign="center">
                        <RadioButton
                          label=""
                          id="mode-observe"
                          name="protectionMode"
                          checked={selectedMode === "OBSERVE"}
                          onChange={() => setSelectedMode("OBSERVE")}
                        />
                        <div>
                          <InlineStack gap="100" blockAlign="center">
                            <Text variant="bodySm" fontWeight="bold" as="span">Monitoring Only</Text>
                            <Badge tone="success">Recommended for New Stores</Badge>
                          </InlineStack>
                          <Text variant="bodyXs" tone="subdued" as="p">
                            ProfitRx calculates net profits and tracks return risk silently without affecting checkout or messaging buyers.
                          </Text>
                        </div>
                      </InlineStack>
                    </InlineStack>
                  </div>

                  <div
                    onClick={() => setSelectedMode("REVIEW")}
                    style={{
                      padding: "16px",
                      borderRadius: "8px",
                      border: selectedMode === "REVIEW" ? "2px solid var(--gg-accent-blue, #2563eb)" : "1px solid var(--gg-border, #d0d7de)",
                      background: selectedMode === "REVIEW" ? "rgba(37,99,235,0.04)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="150" blockAlign="center">
                        <RadioButton
                          label=""
                          id="mode-review"
                          name="protectionMode"
                          checked={selectedMode === "REVIEW"}
                          onChange={() => setSelectedMode("REVIEW")}
                        />
                        <div>
                          <Text variant="bodySm" fontWeight="bold" as="span">Review Orders Before Dispatch</Text>
                          <Text variant="bodyXs" tone="subdued" as="p">
                            High-risk COD orders are flagged in your Operations Review Queue so your team can verify before shipping.
                          </Text>
                        </div>
                      </InlineStack>
                    </InlineStack>
                  </div>
                </div>

                <Banner tone="info" title="Ready to Launch">
                  <p>
                    Setup is complete. Launch the dashboard to see your store&apos;s real-time profit and return analytics.
                  </p>
                </Banner>
              </BlockStack>
            )}

            <Divider />

            {/* Navigation Buttons */}
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200">
                {step > 0 && (
                  <Button variant="secondary" onClick={goPrev}>← Back</Button>
                )}
                <Button
                  variant="plain"
                  url={`/app/dashboard?shop=${encodeURIComponent(data.shop)}&host=${encodeURIComponent(data.host)}`}
                >
                  Skip to Dashboard
                </Button>
              </InlineStack>

              {step < 2 ? (
                step === 1 ? (
                  <Button variant="primary" onClick={handleSaveExpenses}>Accept Costs & Continue →</Button>
                ) : (
                  <Button variant="primary" onClick={goNext}>Continue to Cost Settings →</Button>
                )
              ) : (
                <Button variant="primary" onClick={handleComplete}>
                  🚀 Launch ProfitRx Dashboard
                </Button>
              )}
            </InlineStack>
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}
