import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Grid,
  Badge, Button, TextField, Select, DataTable, Banner, Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { CODManagementService } from "../services/cod-management.service";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [codSettings, pincodeStats] = await Promise.all([
    CODManagementService.getCODSettings(shop),
    prisma.pincodeStats.findMany({
      where: { shop },
      orderBy: { rtoRate: "desc" },
      take: 50,
    }),
  ]);

  return {
    shop,
    codSettings,
    pincodeStats: pincodeStats.map((p) => ({
      ...p,
      rtoRate: Math.round(p.rtoRate),
      totalLoss: Math.round(p.totalLoss),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save_cod_rules") {
    const codBlockingEnabled = formData.get("codBlockingEnabled") === "true";
    const otpVerificationEnabled = formData.get("otpVerificationEnabled") === "true";
    const partialPaymentEnabled = formData.get("partialPaymentEnabled") === "true";
    const partialPaymentAmount = parseFloat(formData.get("partialPaymentAmount") as string) || 50;
    const codFeeEnabled = formData.get("codFeeEnabled") === "true";
    const codFeeAmount = parseFloat(formData.get("codFeeAmount") as string) || 30;
    const codFeeType = (formData.get("codFeeType") as "fixed" | "percentage") || "fixed";

    await CODManagementService.updateCODSettings(shop, {
      codBlockingEnabled,
      otpVerificationEnabled,
      partialPaymentEnabled,
      partialPaymentAmount,
      codFeeEnabled,
      codFeeAmount,
      codFeeType,
    });

    return Response.json({ success: true, message: "COD Rules updated successfully!" });
  }

  if (intent === "toggle_pincode") {
    const pincode = formData.get("pincode") as string;
    const res = await CODManagementService.togglePincodeBlock(shop, pincode);
    return Response.json({ success: true, blocked: res.blocked });
  }

  if (intent === "bulk_import_pincodes") {
    const rawInput = formData.get("pincodesText") as string;
    const parsed = rawInput.split(/[\n,\s]+/).filter(Boolean);
    const updated = await CODManagementService.bulkUpdateBlockedPincodes(shop, parsed);
    return Response.json({ success: true, count: updated.length });
  }

  return Response.json({ error: "Invalid intent" }, { status: 400 });
};

export default function CODRulesRoute() {
  const { codSettings, pincodeStats } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const blockedPincodes = codSettings?.codBlockedPincodes || [];

  // Form State
  const [blockingEnabled, setBlockingEnabled] = useState(codSettings?.codBlockingEnabled ?? false);
  const [otpEnabled, setOtpEnabled] = useState(codSettings?.otpVerificationEnabled ?? false);
  const [partialEnabled, setPartialEnabled] = useState(codSettings?.partialPaymentEnabled ?? false);
  const [partialAmount, setPartialAmount] = useState((codSettings?.partialPaymentAmount ?? 50).toString());
  const [feeEnabled, setFeeEnabled] = useState(codSettings?.codFeeEnabled ?? false);
  const [feeAmount, setFeeAmount] = useState((codSettings?.codFeeAmount ?? 30).toString());
  const [feeType, setFeeType] = useState(codSettings?.codFeeType || "fixed");
  const [bulkInput, setBulkInput] = useState(blockedPincodes.join(", "));
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  const handleSaveRules = () => {
    const fd = new FormData();
    fd.append("intent", "save_cod_rules");
    fd.append("codBlockingEnabled", blockingEnabled.toString());
    fd.append("otpVerificationEnabled", otpEnabled.toString());
    fd.append("partialPaymentEnabled", partialEnabled.toString());
    fd.append("partialPaymentAmount", partialAmount);
    fd.append("codFeeEnabled", feeEnabled.toString());
    fd.append("codFeeAmount", feeAmount);
    fd.append("codFeeType", feeType);

    submit(fd, { method: "POST" });
    setSaveBanner("COD Rules saved successfully!");
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
    <Page title="🛡️ COD Rules & Management Engine">
      <Layout>
        {saveBanner && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => setSaveBanner(null)}>
              {saveBanner}
            </Banner>
          </Layout.Section>
        )}

        {/* ── Rule 1: COD Pincode Blocking ─────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Text variant="headingMd" as="h2">🛑 1. COD Pincode Blocking</Text>
                    <Badge tone={blockingEnabled ? "success" : undefined}>
                      {blockingEnabled ? "Active" : "Disabled"}
                    </Badge>
                  </InlineStack>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Block Cash-on-Delivery in high-risk pincodes with elevated RTO and return history.
                  </Text>
                </BlockStack>
                <Button
                  variant={blockingEnabled ? "primary" : "secondary"}
                  onClick={() => setBlockingEnabled(!blockingEnabled)}
                >
                  {blockingEnabled ? "Disable Blocking" : "Enable Blocking"}
                </Button>
              </InlineStack>

              <Divider />

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
                <Text variant="headingSm" as="h3">Pincode RTO Analytics & Quick Toggles</Text>
                {pincodeRows.length === 0 ? (
                  <Banner tone="info">No pincode analytics synced yet. Sync orders from Dashboard to populate RTO rates.</Banner>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "numeric", "text"]}
                    headings={["Pincode", "City", "Order Volume", "RTO Rate %", "RTO Loss", "COD Action"]}
                    rows={pincodeRows}
                  />
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Rule 2: OTP Verification ────────────────────── */}
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
            <Grid.Cell>
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="150" blockAlign="center">
                      <span style={{ fontSize: 20 }}>📱</span>
                      <Text variant="headingSm" as="h3">2. OTP Verification</Text>
                    </InlineStack>
                    <Badge tone={otpEnabled ? "success" : undefined}>
                      {otpEnabled ? "Active" : "Off"}
                    </Badge>
                  </InlineStack>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Send a 6-digit WhatsApp/SMS OTP when a COD order is placed. Order is confirmed only after OTP verification.
                  </Text>
                  <Button
                    variant={otpEnabled ? "primary" : "secondary"}
                    onClick={() => setOtpEnabled(!otpEnabled)}
                  >
                    {otpEnabled ? "Disable OTP" : "Enable OTP"}
                  </Button>
                </BlockStack>
              </Card>
            </Grid.Cell>

            {/* ── Rule 3: Partial Upfront Payments ─────────── */}
            <Grid.Cell>
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="150" blockAlign="center">
                      <span style={{ fontSize: 20 }}>💳</span>
                      <Text variant="headingSm" as="h3">3. Partial Deposit</Text>
                    </InlineStack>
                    <Badge tone={partialEnabled ? "success" : undefined}>
                      {partialEnabled ? "Active" : "Off"}
                    </Badge>
                  </InlineStack>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Collect a small deposit upfront on COD orders to eliminate fake buyers. Deducted from final COD price.
                  </Text>
                  <TextField
                    label="Deposit Amount (₹)"
                    type="number"
                    value={partialAmount}
                    onChange={setPartialAmount}
                    autoComplete="off"
                  />
                  <Button
                    variant={partialEnabled ? "primary" : "secondary"}
                    onClick={() => setPartialEnabled(!partialEnabled)}
                  >
                    {partialEnabled ? "Disable Deposit" : "Enable Deposit"}
                  </Button>
                </BlockStack>
              </Card>
            </Grid.Cell>

            {/* ── Rule 4: Extra COD Fees ───────────────────── */}
            <Grid.Cell>
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="150" blockAlign="center">
                      <span style={{ fontSize: 20 }}>🏷️</span>
                      <Text variant="headingSm" as="h3">4. COD Extra Fee</Text>
                    </InlineStack>
                    <Badge tone={feeEnabled ? "success" : undefined}>
                      {feeEnabled ? "Active" : "Off"}
                    </Badge>
                  </InlineStack>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Add a handling fee to COD checkout to incentivize customers to switch to Prepaid orders.
                  </Text>
                  <InlineStack gap="200">
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="Fee Amount"
                        type="number"
                        value={feeAmount}
                        onChange={setFeeAmount}
                        autoComplete="off"
                      />
                    </div>
                    <div style={{ width: 110 }}>
                      <Select
                        label="Type"
                        options={[
                          { label: "Fixed ₹", value: "fixed" },
                          { label: "Percentage %", value: "percentage" },
                        ]}
                        value={feeType}
                        onChange={(val) => setFeeType(val as "fixed" | "percentage")}
                      />
                    </div>
                  </InlineStack>
                  <Button
                    variant={feeEnabled ? "primary" : "secondary"}
                    onClick={() => setFeeEnabled(!feeEnabled)}
                  >
                    {feeEnabled ? "Disable Fee" : "Enable COD Fee"}
                  </Button>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* ── Save Settings Bar ────────────────────────────── */}
        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="bodyMd" as="p">
                Apply all COD management rules to your Shopify storefront.
              </Text>
              <Button variant="primary" loading={isSaving} onClick={handleSaveRules}>
                Save All COD Rules →
              </Button>
            </InlineStack>
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}
