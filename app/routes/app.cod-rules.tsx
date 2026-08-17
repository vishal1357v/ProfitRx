import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Grid,
  Badge, Button, TextField, Select, DataTable, Banner, Divider,
  Box, Icon, Checkbox
} from "@shopify/polaris";
import {
  ShieldCheckMarkIcon,
  AlertTriangleIcon,
  LockIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { CodRulesApplicationService } from "../application/protection/cod-rules.application";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  let host = url.searchParams.get("host") || "";
  if (!host && session?.shop) {
    const storeHandle = session.shop.replace(".myshopify.com", "");
    host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
  }

  // Enforce billing if not bypassed
  if (process.env.BYPASS_BILLING !== "true") {
    try {
      await billing.require({
        plans: ["GROWTH", "PRO"],
        isTest: process.env.NODE_ENV !== "production",
        onFailure: async () => {
          throw redirect(`/app/pricing?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`);
        },
      });
    } catch (error) {
      if (error instanceof Response) {
        throw error;
      }
      console.warn("[CodRules Billing Guard Warning]:", error);
    }
  }

  return CodRulesApplicationService.getCodRulesData(shop);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save_merchant_rules") {
    const rulesRejectCodOver = parseFloat(formData.get("rulesRejectCodOver") as string) || 999999;
    const rulesRequirePrepaidAbove = parseFloat(formData.get("rulesRequirePrepaidAbove") as string) || 999999;
    const rulesAutoFlagRepeatOffenders = formData.get("rulesAutoFlagRepeatOffenders") === "true";
    const rulesAutoRequireOtp = formData.get("rulesAutoRequireOtp") === "true";

    const result = await CodRulesApplicationService.saveMerchantRules(shop, {
      rulesRejectCodOver,
      rulesRequirePrepaidAbove,
      rulesAutoFlagRepeatOffenders,
      rulesAutoRequireOtp,
    });

    return Response.json(result);
  }

  if (intent === "toggle_pincode") {
    const pincode = formData.get("pincode") as string;
    const res = await CodRulesApplicationService.togglePincode(shop, pincode);
    return Response.json(res);
  }

  if (intent === "bulk_import_pincodes") {
    const rawInput = formData.get("pincodesText") as string;
    const res = await CodRulesApplicationService.bulkImportPincodes(shop, rawInput);
    return Response.json(res);
  }

  return Response.json({ error: "Invalid intent" }, { status: 400 });
};

export default function CODRulesRoute() {
  const { codSettings, storeSettings, pincodeStats } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const blockedPincodes = codSettings?.codBlockedPincodes || [];
  const [bulkInput, setBulkInput] = useState(blockedPincodes.join(", "));
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  // Intent A: High Value Orders
  const [rejectCodOver, setRejectCodOver] = useState((storeSettings?.rulesRejectCodOver || 999999).toString());
  const [requirePrepaidAbove, setRequirePrepaidAbove] = useState((storeSettings?.rulesRequirePrepaidAbove || 999999).toString());
  
  // Intent B: Repeat Offenders
  const [flagRepeat, setFlagRepeat] = useState(storeSettings?.rulesAutoFlagRepeatOffenders ?? false);
  const [requireOtpRepeat, setRequireOtpRepeat] = useState(storeSettings?.rulesAutoRequireOtp ?? false);

  const handleSaveRules = () => {
    const fd = new FormData();
    fd.append("intent", "save_merchant_rules");
    fd.append("rulesRejectCodOver", rejectCodOver);
    fd.append("rulesRequirePrepaidAbove", requirePrepaidAbove);
    fd.append("rulesAutoFlagRepeatOffenders", flagRepeat.toString());
    fd.append("rulesAutoRequireOtp", requireOtpRepeat.toString());
    
    submit(fd, { method: "POST" });
    setSaveBanner("Rules saved successfully!");
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
    setSaveBanner("Bulk blocked pincodes updated!");
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
        {saveBanner && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => setSaveBanner(null)}>
              {saveBanner}
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
                    <Text variant="headingMd" as="h2">A. Protect High Value Orders</Text>
                  </InlineStack>
                </InlineStack>
                <Text variant="bodySm" as="p" tone="subdued">
                  Automatically reject Cash-on-Delivery or mandate Prepaid for expensive orders to eliminate high-ticket RTO losses.
                </Text>
                
                <Grid columns={{ xs: 1, sm: 2 }}>
                  <Grid.Cell>
                    <TextField
                      label="Reject COD for orders above"
                      type="number"
                      prefix="₹"
                      value={rejectCodOver === "999999" ? "" : rejectCodOver}
                      onChange={setRejectCodOver}
                      autoComplete="off"
                      placeholder="e.g. 5000"
                    />
                  </Grid.Cell>
                  <Grid.Cell>
                    <TextField
                      label="Require Prepaid for orders above"
                      type="number"
                      prefix="₹"
                      value={requirePrepaidAbove === "999999" ? "" : requirePrepaidAbove}
                      onChange={setRequirePrepaidAbove}
                      autoComplete="off"
                      placeholder="e.g. 5000"
                    />
                  </Grid.Cell>
                </Grid>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="500">
              <BlockStack gap="400">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={AlertTriangleIcon} />
                  <Text variant="headingMd" as="h2">B. Protect Repeat Offenders</Text>
                </InlineStack>
                <Text variant="bodySm" as="p" tone="subdued">
                  Automatically trigger strict verification for customers with a history of RTOs.
                </Text>

                <BlockStack gap="200">
                  <Checkbox
                    label="Trigger automatic protection after 2+ RTOs from the same customer"
                    checked={flagRepeat}
                    onChange={setFlagRepeat}
                  />
                  {flagRepeat && (
                    <Box paddingBlockStart="200" paddingInlineStart="400">
                      <Select
                        label="Action to take"
                        options={[
                          { label: "Require OTP Verification", value: "otp" },
                          { label: "Block COD (Prepaid Only)", value: "block" }
                        ]}
                        value={requireOtpRepeat ? "otp" : "block"}
                        onChange={(val) => setRequireOtpRepeat(val === "otp")}
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
                    <Text variant="headingMd" as="h2">C. Pincode Protection</Text>
                  </InlineStack>
                </InlineStack>
                <Text variant="bodySm" as="p" tone="subdued">
                  Disable COD entirely for selected high-risk pincodes.
                </Text>

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
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodyMd" as="p">
                  Apply all Advanced Merchant Rules to your Shopify storefront.
                </Text>
                <div className="gg-mobile-full-width-btn">
                  <Button variant="primary" loading={isSaving} onClick={handleSaveRules}>
                    Save All Rules →
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
