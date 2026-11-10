import { useState, useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation, useActionData, redirect, useRouteError, isRouteErrorResponse } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Grid, InlineGrid,
  Badge, Button, TextField, Select, DataTable, Banner, Divider,
  Box, Icon, Checkbox
} from "@shopify/polaris";
import {
  ShieldCheckMarkIcon,
  AlertTriangleIcon,
  LockIcon,
  NotificationIcon,
  FinanceIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { CodRulesApplicationService } from "../application/protection/cod-rules.application";
import { SettingsRepository } from "../infrastructure/repositories/settings.repository";
import { BillingApplicationService } from "../application/billing/billing.application";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const isPreview = url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true";

  if (isPreview) {
    const shop = "glam-aura-india.myshopify.com";
    return {
      shop,
      codSettings: {
        codBlockingEnabled: true,
        codBlockedPincodes: ["841301", "800001", "201301", "226001", "110092"],
        otpVerificationEnabled: true,
        partialPaymentEnabled: false,
        partialPaymentAmount: 200,
        codFeeEnabled: false,
        codFeeAmount: 30,
        codFeeType: "fixed" as const,
      },
      storeSettings: {
        rulesRejectCodOver: 5000,
        rulesRequirePrepaidAbove: 10000,
        rulesAutoFlagRepeatOffenders: true,
        rulesAutoRequireOtp: true,
        otpVerificationEnabled: true,
        partialPaymentEnabled: false,
        partialPaymentAmount: 200,
        codFeeEnabled: false,
        codFeeAmount: 30,
        codFeeType: "fixed",
      },
      isShopifyPlus: false,
      pincodeStats: [
        { pincode: "841301", city: "Siwan", province: "Bihar", totalOrders: 42, rtoOrders: 28, rtoRate: 67, totalLoss: 3640 },
        { pincode: "800001", city: "Patna", province: "Bihar", totalOrders: 78, rtoOrders: 41, rtoRate: 53, totalLoss: 5330 },
        { pincode: "201301", city: "Noida", province: "Uttar Pradesh", totalOrders: 110, rtoOrders: 32, rtoRate: 29, totalLoss: 4160 },
      ],
    };
  }

  const { session, billing, admin } = await authenticate.admin(request);
  const shop = session.shop;
  let host = url.searchParams.get("host") || "";
  if (!host && session?.shop) {
    const storeHandle = session.shop.replace(".myshopify.com", "");
    host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
  }

  // ── Detect Partner Development / Review Stores ──────────────────
  // Primary: query Shopify GraphQL for shop.plan metadata
  // Secondary: fall back to persisted shopifyPlanName + domain heuristics
  let isDevStore = process.env.NODE_ENV !== "production";

  if (!isDevStore) {
    const settings = await SettingsRepository.getByShop(shop);
    const cachedPlan = (settings?.shopifyPlanName || "").toLowerCase();

    // If we don't have a cached plan yet, or it's the default "basic",
    // query Shopify GraphQL for the real plan metadata
    let partnerDevelopment = false;
    let planDisplayName = cachedPlan;

    if (!cachedPlan || cachedPlan === "basic" || cachedPlan === "") {
      try {
        const res = await admin.graphql(`
          query {
            shop {
              plan {
                displayName
                partnerDevelopment
                shopifyPlus
              }
            }
          }
        `);
        const json = await res.json() as any;
        const plan = json.data?.shop?.plan;
        partnerDevelopment = Boolean(plan?.partnerDevelopment);
        planDisplayName = (plan?.displayName || "").toLowerCase();
        if (plan) {
          // Persist so we don't re-query every request
          await SettingsRepository.upsertStoreSettings(shop, {
            shopifyPlanName: plan.displayName || "Basic",
          });
        }
      } catch (e) {
        console.warn("[CodRules DevStore Check Warning]:", e);
      }
    } else {
      // Use cached plan name for heuristic checks
      planDisplayName = cachedPlan;
      partnerDevelopment =
        cachedPlan.includes("dev") ||
        cachedPlan.includes("partner") ||
        cachedPlan.includes("affiliate") ||
        cachedPlan.includes("partner_test") ||
        cachedPlan.includes("partner test");
    }

    isDevStore =
      partnerDevelopment ||
      planDisplayName.includes("develop") ||
      planDisplayName.includes("partner") ||
      planDisplayName.includes("affiliate") ||
      planDisplayName.includes("staff") ||
      planDisplayName.includes("trial") ||
      (shop.includes("test") && planDisplayName !== "basic shopify") ||
      (shop.includes("dev") && planDisplayName !== "basic shopify");
  }

  // Enforce billing for real production stores only
  if (process.env.BYPASS_BILLING !== "true" && !isDevStore) {
    await BillingApplicationService.requirePlan(shop, ["GROWTH", "PRO"], host);
  }

  return CodRulesApplicationService.getCodRulesData(shop);
};


export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true") {
    return { success: true, saved: true, message: "Demo mode: COD rules simulated successfully!" };
  }
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save_merchant_rules") {
    const rulesRejectCodOver = parseFloat(formData.get("rulesRejectCodOver") as string) || 999999;
    const rulesRequirePrepaidAbove = parseFloat(formData.get("rulesRequirePrepaidAbove") as string) || 999999;
    const rulesAutoFlagRepeatOffenders = formData.get("rulesAutoFlagRepeatOffenders") === "true";
    const rulesAutoRequireOtp = formData.get("rulesAutoRequireOtp") === "true";
    const codBlockingEnabled = formData.get("codBlockingEnabled") === "true";
    const otpVerificationEnabled = formData.get("otpVerificationEnabled") === "true";
    const partialPaymentEnabled = formData.get("partialPaymentEnabled") === "true";
    const partialPaymentAmount = parseFloat(formData.get("partialPaymentAmount") as string) || 50;
    const codFeeEnabled = formData.get("codFeeEnabled") === "true";
    const codFeeAmount = parseFloat(formData.get("codFeeAmount") as string) || 30;
    const codFeeType = (formData.get("codFeeType") as string) || "fixed";

    const result = await CodRulesApplicationService.saveMerchantRules(shop, {
      rulesRejectCodOver,
      rulesRequirePrepaidAbove,
      rulesAutoFlagRepeatOffenders,
      rulesAutoRequireOtp,
      codBlockingEnabled,
      otpVerificationEnabled,
      partialPaymentEnabled,
      partialPaymentAmount,
      codFeeEnabled,
      codFeeAmount,
      codFeeType,
    }, admin);

    return Response.json(result);
  }

  if (intent === "toggle_cod_blocking") {
    const enabled = formData.get("enabled") === "true";
    const result = await CodRulesApplicationService.toggleCodBlocking(shop, enabled, admin);
    return Response.json(result);
  }

  if (intent === "toggle_pincode") {
    const pincode = formData.get("pincode") as string;
    const res = await CodRulesApplicationService.togglePincode(shop, pincode, admin);
    return Response.json(res);
  }

  if (intent === "bulk_import_pincodes") {
    const rawInput = formData.get("pincodesText") as string;
    const res = await CodRulesApplicationService.bulkImportPincodes(shop, rawInput, admin);
    return Response.json(res);
  }

  return Response.json({ error: "Invalid intent" }, { status: 400 });
};

export default function CODRulesRoute() {
  const { codSettings, storeSettings, pincodeStats } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const blockedPincodes = codSettings?.codBlockedPincodes || [];
  const [bulkInput, setBulkInput] = useState(blockedPincodes.join(", "));
  const [bannerState, setBannerState] = useState<{ message: string; tone: "success" | "warning" | "critical" } | null>(null);

  // Intent A: High Value Orders
  const [rejectCodOver, setRejectCodOver] = useState((storeSettings?.rulesRejectCodOver || 999999).toString());
  const [requirePrepaidAbove, setRequirePrepaidAbove] = useState((storeSettings?.rulesRequirePrepaidAbove || 999999).toString());
  
  // Intent B: Repeat Offenders
  const [flagRepeat, setFlagRepeat] = useState(storeSettings?.rulesAutoFlagRepeatOffenders ?? false);
  const [requireOtpRepeat, setRequireOtpRepeat] = useState(storeSettings?.rulesAutoRequireOtp ?? false);

  // Intent C: Checkout Blocking Activation Toggle
  const [codBlockingEnabled, setCodBlockingEnabled] = useState(codSettings?.codBlockingEnabled ?? false);

  // Intent D: Dynamic OTP Verification Policy
  const [otpVerificationEnabled, setOtpVerificationEnabled] = useState(storeSettings?.otpVerificationEnabled ?? false);
  const [otpRiskThreshold, setOtpRiskThreshold] = useState("HIGH");
  const [otpBypassLowRisk, setOtpBypassLowRisk] = useState(true);

  // Intent E: Partial Payment & Deposit
  const [partialPaymentEnabled, setPartialPaymentEnabled] = useState(storeSettings?.partialPaymentEnabled ?? false);
  const [partialPaymentAmount, setPartialPaymentAmount] = useState((storeSettings?.partialPaymentAmount ?? 50).toString());
  const [codFeeEnabled, setCodFeeEnabled] = useState(storeSettings?.codFeeEnabled ?? false);
  const [codFeeAmount, setCodFeeAmount] = useState((storeSettings?.codFeeAmount ?? 30).toString());
  const [codFeeType, setCodFeeType] = useState(storeSettings?.codFeeType ?? "fixed");

  useEffect(() => {
    setCodBlockingEnabled(codSettings?.codBlockingEnabled ?? false);
  }, [codSettings?.codBlockingEnabled]);

  useEffect(() => {
    if (actionData?.message) {
      const isWarn = actionData.syncResult && !actionData.syncResult.success;
      setBannerState({
        message: actionData.message,
        tone: isWarn ? "warning" : actionData.success ? "success" : "critical",
      });

      // Revert optimistic toggle if Shopify sync failed — prevents false "Active at Checkout" badge
      if (isWarn && actionData.enabled !== undefined) {
        setCodBlockingEnabled(false);
      } else if (actionData.enabled !== undefined) {
        setCodBlockingEnabled(actionData.enabled);
      }
    }
  }, [actionData]);

  const handleSaveRules = () => {
    const fd = new FormData();
    fd.append("intent", "save_merchant_rules");
    fd.append("rulesRejectCodOver", rejectCodOver);
    fd.append("rulesRequirePrepaidAbove", requirePrepaidAbove);
    fd.append("rulesAutoFlagRepeatOffenders", flagRepeat.toString());
    fd.append("rulesAutoRequireOtp", requireOtpRepeat.toString());
    fd.append("codBlockingEnabled", codBlockingEnabled.toString());
    fd.append("otpVerificationEnabled", otpVerificationEnabled.toString());
    fd.append("partialPaymentEnabled", partialPaymentEnabled.toString());
    fd.append("partialPaymentAmount", partialPaymentAmount);
    fd.append("codFeeEnabled", codFeeEnabled.toString());
    fd.append("codFeeAmount", codFeeAmount);
    fd.append("codFeeType", codFeeType);
    
    submit(fd, { method: "POST" });
  };

  const handleToggleCodBlocking = (enabled: boolean) => {
    setCodBlockingEnabled(enabled);
    const fd = new FormData();
    fd.append("intent", "toggle_cod_blocking");
    fd.append("enabled", enabled.toString());
    submit(fd, { method: "POST" });
  };

  const handleTogglePincode = (pincode: string) => {
    const fd = new FormData();
    fd.append("intent", "toggle_pincode");
    fd.append("pincode", pincode);
    submit(fd, { method: "POST" });
  };

  const handleBulkImport = () => {
    const fd = new FormData();
    fd.append("intent", "bulk_import_pincodes");
    fd.append("pincodesText", bulkInput);
    submit(fd, { method: "POST" });
  };

  const blockedSet = new Set(blockedPincodes);

  const pincodeRows = pincodeStats.map((p: any) => {
    const isBlocked = blockedSet.has(p.pincode);
    return [
      <span key={`${p.pincode}-code`} style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700 }}>{p.pincode}</span>,
      <span key={`${p.pincode}-city`}>{p.city || "N/A"}</span>,
      <span key={`${p.pincode}-orders`}>{p.totalOrders} ({p.codOrders} COD)</span>,
      <Badge key={`${p.pincode}-rto`} tone={p.rtoRate >= 30 ? "critical" : p.rtoRate >= 15 ? "warning" : "success"}>
        {`${p.rtoRate}% RTO`}
      </Badge>,
      <span key={`${p.pincode}-loss`} style={{ color: "var(--gg-accent-red)", fontWeight: 700 }}>₹{p.totalLoss.toLocaleString("en-IN")}</span>,
      <Button
        key={`${p.pincode}-btn`}
        size="slim"
        variant={isBlocked ? "primary" : "secondary"}
        tone={isBlocked ? "critical" : undefined}
        onClick={() => handleTogglePincode(p.pincode)}
      >
        {isBlocked ? "🛑 Blocked" : "Allow COD"}
      </Button>,
    ];
  });

  return (
    <Page
      title="COD Rules & Policy"
      subtitle="Configure deterministic thresholds and protection policies to eliminate high-ticket RTO losses."
      primaryAction={{
        content: isSaving ? "Saving..." : "Save Policies",
        onAction: handleSaveRules,
        loading: isSaving,
      }}
    >
      <Layout>
        {bannerState && (
          <Layout.Section>
            <Banner tone={bannerState.tone} onDismiss={() => setBannerState(null)}>
              {bannerState.message}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <Box padding="500">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={LockIcon} />
                    <Text variant="headingMd" as="h2">A. High Value Order Protection</Text>
                  </InlineStack>
                  <Badge tone="success">Enforced at Checkout</Badge>
                </InlineStack>
                <Text variant="bodySm" as="p" tone="subdued">
                  Hides Cash-on-Delivery or requires full payment when the cart amount exceeds your limit.
                </Text>
                
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                  <TextField
                    label="Turn off COD for orders over"
                    type="number"
                    prefix="₹"
                    value={rejectCodOver === "999999" ? "" : rejectCodOver}
                    onChange={setRejectCodOver}
                    autoComplete="off"
                    placeholder="e.g. 5000"
                    helpText="Hides COD option at checkout when total is above this amount."
                  />
                  <TextField
                    label="Require Full Payment for orders above"
                    type="number"
                    prefix="₹"
                    value={requirePrepaidAbove === "999999" ? "" : requirePrepaidAbove}
                    onChange={setRequirePrepaidAbove}
                    autoComplete="off"
                    placeholder="e.g. 10000"
                    helpText="Only allows prepaid payment when total meets or exceeds this amount."
                  />
                </InlineGrid>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="500">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={AlertTriangleIcon} />
                    <Text variant="headingMd" as="h2">B. Block Frequent Returners</Text>
                  </InlineStack>
                  <Badge tone="info">Checked on New Orders</Badge>
                </InlineStack>
                <Text variant="bodySm" as="p" tone="subdued">
                  Automatically flags buyers who repeatedly reject parcels so you do not waste courier fees.
                </Text>

                <BlockStack gap="200">
                  <Checkbox
                    label="Auto-flag buyers who previously rejected 2 or more deliveries"
                    checked={flagRepeat}
                    onChange={setFlagRepeat}
                  />
                  {flagRepeat && (
                    <Box paddingBlockStart="200" paddingInlineStart="400">
                      <Select
                        label="Action for repeat returners"
                        options={[
                          { label: "Block COD (Prepaid Payment Only)", value: "block" },
                          { label: "Send WhatsApp Confirmation Code First", value: "otp" },
                        ]}
                        value={requireOtpRepeat ? "otp" : "block"}
                        onChange={(val) => setRequireOtpRepeat(val === "otp")}
                        helpText="Buyers with 2+ past returns will either be required to pay upfront or confirm via WhatsApp before packing."
                      />
                    </Box>
                  )}
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="500">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={ShieldCheckMarkIcon} />
                    <Text variant="headingMd" as="h2">C. Block Risky Delivery Pincodes</Text>
                  </InlineStack>
                  <Badge tone="success">Enforced at Checkout</Badge>
                </InlineStack>
                <Text variant="bodySm" as="p" tone="subdued">
                  Turn off Cash on Delivery for pincodes where parcels frequently return unaccepted.
                </Text>

                {/* ── Activation Toggle Card ── */}
                <Box
                  padding="400"
                  background="bg-surface-secondary"
                  borderRadius="200"
                  borderWidth="025"
                  borderColor="border"
                >
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Checkbox
                        label="Enable COD Checkout Blocking (Shopify Function)"
                        checked={codBlockingEnabled}
                        onChange={(newVal) => handleToggleCodBlocking(newVal)}
                      />
                      <Badge tone={codBlockingEnabled ? "success" : undefined}>
                        {codBlockingEnabled ? "Active at Checkout" : "Inactive (Monitoring Only)"}
                      </Badge>
                    </InlineStack>
                    <Text variant="bodySm" as="p" tone="subdued">
                      {codBlockingEnabled
                        ? "ProfitRx automatically hides Cash on Delivery at your checkout whenever a customer enters any of your blocked pincodes below."
                        : "Pincode rules and analytics are recorded in ProfitRx, but Cash on Delivery will remain available for all pincodes at checkout."}
                    </Text>
                  </BlockStack>
                </Box>

                <BlockStack gap="300">
                  <Text variant="headingSm" as="h3">Bulk Pincode Import / Export</Text>
                  <TextField
                    label="Blocked Pincodes (comma or newline separated)"
                    value={bulkInput}
                    onChange={setBulkInput}
                    multiline={3}
                    placeholder="e.g. 110053, 110078, 635109, 400001"
                    autoComplete="off"
                  />
                  <InlineStack align="end">
                    <Button variant="secondary" onClick={handleBulkImport}>
                      {`Update Blocked Pincodes List (${blockedPincodes.length} Blocked)`}
                    </Button>
                  </InlineStack>
                </BlockStack>

                <Divider />

                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Pincode RTO Analytics</Text>
                  {pincodeRows.length === 0 ? (
                    <Banner tone="info">No pincode analytics synced yet.</Banner>
                  ) : (
                    <DataTable
                      columnContentTypes={["text", "text", "text", "text", "numeric", "text"]}
                      headings={["Pincode", "City", "Order Volume", "RTO Rate %", "RTO Loss", "Action"]}
                      rows={pincodeRows}
                    />
                  )}
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="500">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={NotificationIcon} />
                    <Text variant="headingMd" as="h2">D. WhatsApp Order Confirmation (OTP)</Text>
                  </InlineStack>
                  <Badge tone={otpVerificationEnabled ? "success" : undefined}>
                    {otpVerificationEnabled ? "WhatsApp Active" : "Disabled"}
                  </Badge>
                </InlineStack>
                <Text variant="bodySm" as="p" tone="subdued">
                  Verify buyer purchase intent on suspicious or high-risk orders via automated 6-digit WhatsApp message before packing.
                </Text>

                <BlockStack gap="300">
                  <Checkbox
                    label="Send automated WhatsApp confirmation code on risky COD orders"
                    checked={otpVerificationEnabled}
                    onChange={setOtpVerificationEnabled}
                    helpText="Orders flagged with high return risk will automatically receive a WhatsApp confirmation challenge."
                  />

                  {otpVerificationEnabled && (
                    <Box paddingBlockStart="200" paddingInlineStart="400">
                      <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                        <Select
                          label="When to send WhatsApp code"
                          options={[
                            { label: "Very Risky Orders Only (>60% Risk)", value: "CRITICAL" },
                            { label: "Medium & High Risk Orders (>40% Risk)", value: "HIGH" },
                            { label: "All Flagged Orders (>20% Risk)", value: "MEDIUM" },
                          ]}
                          value={otpRiskThreshold}
                          onChange={setOtpRiskThreshold}
                          helpText="Orders above this return risk score will require WhatsApp confirmation."
                        />
                        <Checkbox
                          label="Skip confirmation for trusted repeat buyers"
                          checked={otpBypassLowRisk}
                          onChange={setOtpBypassLowRisk}
                          helpText="Do not challenge loyal customers who have 2+ past successful deliveries."
                        />
                      </InlineGrid>
                    </Box>
                  )}
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="500">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={FinanceIcon} />
                    <Text variant="headingMd" as="h2">E. Flag Orders for Advance Deposit</Text>
                  </InlineStack>
                  <Badge tone={partialPaymentEnabled || codFeeEnabled ? "success" : undefined}>
                    {partialPaymentEnabled || codFeeEnabled ? "Tagging Active" : "Standard COD"}
                  </Badge>
                </InlineStack>
                <Text variant="bodySm" as="p" tone="subdued">
                  Automatically tags risky orders in Shopify as 'ProfitRx-Deposit-Required' so your fulfillment team can request an advance deposit before shipping.
                </Text>

                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                  <Card background="bg-surface-secondary">
                    <Box padding="400">
                      <BlockStack gap="300">
                        <Checkbox
                          label="Tag high-risk orders for advance deposit follow-up"
                          checked={partialPaymentEnabled}
                          onChange={setPartialPaymentEnabled}
                          helpText="Applies the 'ProfitRx-Deposit-Required' tag in Shopify Admin so your team knows to collect an advance token before dispatch."
                        />
                        {partialPaymentEnabled && (
                          <TextField
                            label="Suggested Deposit Amount (₹)"
                            type="number"
                            prefix="₹"
                            value={partialPaymentAmount}
                            onChange={setPartialPaymentAmount}
                            autoComplete="off"
                            placeholder="50"
                            helpText="Reference deposit amount noted for your customer support or dispatch team."
                          />
                        )}
                      </BlockStack>
                    </Box>
                  </Card>

                  <Card background="bg-surface-secondary">
                    <Box padding="400">
                      <BlockStack gap="300">
                        <Checkbox
                          label="Enable Extra COD Handling Fee"
                          checked={codFeeEnabled}
                          onChange={setCodFeeEnabled}
                          helpText="Pass courier cash-collection fees to customers selecting Cash on Delivery."
                        />
                        {codFeeEnabled && (
                          <InlineStack gap="300">
                            <div style={{ flex: 1 }}>
                              <TextField
                                label="COD Fee Amount"
                                type="number"
                                prefix={codFeeType === "fixed" ? "₹" : undefined}
                                suffix={codFeeType === "percentage" ? "%" : undefined}
                                value={codFeeAmount}
                                onChange={setCodFeeAmount}
                                autoComplete="off"
                                placeholder="30"
                              />
                            </div>
                            <div style={{ width: 140 }}>
                              <Select
                                label="Fee Type"
                                options={[
                                  { label: "Fixed (₹)", value: "fixed" },
                                  { label: "Percentage (%)", value: "percentage" },
                                ]}
                                value={codFeeType}
                                onChange={setCodFeeType}
                              />
                            </div>
                          </InlineStack>
                        )}
                      </BlockStack>
                    </Box>
                  </Card>
                </InlineGrid>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="500">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodyMd" as="p">
                  Apply all COD and RTO protection rules to your Shopify storefront.
                </Text>
                <div>
                  <Button variant="primary" loading={isSaving} onClick={handleSaveRules}>
                    Save Rules
                  </Button>
                </div>
              </InlineStack>
            </Box>
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = "An unexpected error occurred while loading COD protection rules.";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}: ${error.data}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="COD Protection Rules">
      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <Banner tone="critical" title="Failed to Load COD Rules">
              <p>{errorMessage}</p>
            </Banner>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}
