import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useSubmit, useActionData } from "react-router";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Button,
  Grid, TextField, Select, Banner, Divider, Badge,
  Box, Icon, Frame, Toast, Tabs,
} from "@shopify/polaris";
import {
  DatabaseIcon,
  FinanceIcon,
  DeliveryIcon,
  NotificationIcon,
  ShieldCheckMarkIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { SettingsApplicationService } from "../application/settings/settings.application";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const email = (session as any).email || "";

  return SettingsApplicationService.getSettingsData(shop, email);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "accept_dpa") {
    await SettingsApplicationService.acceptDpa(shop, "1.0");
    return Response.json({ success: true, dpaAccepted: true });
  }

  if (intent === "save_settings") {
    const defaultForwardShipping = parseFloat(formData.get("defaultForwardShipping") as string) || 0;
    const defaultReturnShipping = parseFloat(formData.get("defaultReturnShipping") as string) || 0;
    const defaultCODHandling = parseFloat(formData.get("defaultCODHandling") as string) || 0;
    const defaultPackaging = parseFloat(formData.get("defaultPackaging") as string) || 0;
    const defaultGatewayFeePct = parseFloat(formData.get("defaultGatewayFeePct") as string) || 0;
    const gatewayFixedFee = parseFloat(formData.get("gatewayFixedFee") as string) || 0;
    const rtoDetectionPattern = (formData.get("rtoDetectionPattern") as string) || "rto,returned,undelivered,failed_delivery,rto-initiated,rto_initiated,shipped-rto,shiprocket-rto,delhivery_rto,rto-delhivery,rto-bluedart,return-to-origin,returned-to-sender";
    const alertEmail = formData.get("alertEmail") as string;
    const rtoThreshold = parseFloat(formData.get("rtoThreshold") as string) || 10;
    const marginThreshold = parseFloat(formData.get("marginThreshold") as string) || 15;

    // GST fields
    const gstin = formData.get("gstin") as string;
    const isGstRegistered = formData.get("isGstRegistered") === "true";
    const gstRate = parseFloat(formData.get("gstRate") as string) || 18;
    
    const whatsappPhone = formData.get("whatsappPhone") as string;
    const whatsappEnabled = formData.get("whatsappEnabled") === "true";
    
    const rawSlabs = formData.get("shippingSlabs") as string;
    let shippingSlabs: any = null;
    if (rawSlabs) {
      try {
        shippingSlabs = JSON.parse(rawSlabs);
      } catch (e) {
        console.error("Failed to parse shippingSlabs JSON:", e);
      }
    }

    const result = await SettingsApplicationService.saveSettings(shop, {
      defaultForwardShipping,
      defaultReturnShipping,
      defaultCODHandling,
      defaultPackaging,
      defaultGatewayFeePct,
      gatewayFixedFee,
      rtoDetectionPattern,
      alertEmail,
      rtoThreshold,
      marginThreshold,
      gstin,
      isGstRegistered,
      gstRate,
      whatsappPhone,
      whatsappEnabled,
      shippingSlabs,
    });

    if (!result.success) {
      return Response.json({ success: false, error: result.error }, { status: 400 });
    }

    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid intent" }, { status: 400 });
};

export default function SettingsRoute() {
  const { shop, settings, dpaAcceptedAt, dpaAcceptedVersion } = useLoaderData<any>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [forwardShipping, setForwardShipping] = useState(settings.defaultForwardShipping.toString());
  const [returnShipping, setReturnShipping] = useState(settings.defaultReturnShipping.toString());
  const [codHandling, setCodHandling] = useState(settings.defaultCODHandling.toString());
  const [packaging, setPackaging] = useState(settings.defaultPackaging.toString());
  const [gatewayFee, setGatewayFee] = useState(settings.defaultGatewayFeePct.toString());
  const [gatewayFixed, setGatewayFixed] = useState(settings.gatewayFixedFee.toString());
  const [rtoPattern, setRtoPattern] = useState(settings.rtoDetectionPattern);
  const [email, setEmail] = useState(settings.alertEmail || "");
  const [rtoLimit, setRtoLimit] = useState(settings.rtoThreshold.toString());
  const [marginLimit, setMarginLimit] = useState(settings.marginThreshold.toString());

  // Slabs State
  const [slabs, setSlabs] = useState<Array<{ maxWeightGrams: number; forwardCost: number; returnCost: number }>>(() => {
    try {
      if (settings.shippingSlabs) {
        return typeof settings.shippingSlabs === "string" ? JSON.parse(settings.shippingSlabs) : settings.shippingSlabs;
      }
    } catch (e) {
      console.error("Failed to initialize shippingSlabs state:", e);
    }
    return [];
  });

  // GST State
  const [gstin, setGstin] = useState(settings.gstin || "");
  const [isGstReg, setIsGstReg] = useState(settings.isGstRegistered);
  const [gstRate, setGstRate] = useState(settings.gstRate.toString());
  const [waPhone, setWaPhone] = useState(settings.whatsappPhone || "");
  const [waEnabled, setWaEnabled] = useState(settings.whatsappEnabled);
  const [saved, setSaved] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);
  const actionData = useActionData<any>();

  const isSaving = navigation.state === "submitting" && navigation.formData?.get("intent") === "save_settings";
  const isAcceptingDpa = navigation.state === "submitting" && navigation.formData?.get("intent") === "accept_dpa";

  const handleAcceptDpa = () => {
    const formData = new FormData();
    formData.append("intent", "accept_dpa");
    submit(formData, { method: "post" });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const tabs = [
    { id: "costs-shipping", content: "💰 Costs & Shipping", panelID: "costs-panel" },
    { id: "gst-compliance", content: "🇮🇳 GST Compliance", panelID: "gst-panel" },
    { id: "whatsapp-otp", content: "💬 WhatsApp & OTP", panelID: "whatsapp-panel" },
    { id: "alerts-keywords", content: "🔔 Alerts & Courier", panelID: "alerts-panel" },
    { id: "data-protection", content: "🛡️ Data Protection (DPA)", panelID: "dpa-panel" },
  ];

  const handleSave = () => {
    const formData = new FormData();
    formData.append("intent", "save_settings");
    formData.append("defaultForwardShipping", forwardShipping);
    formData.append("defaultReturnShipping", returnShipping);
    formData.append("defaultCODHandling", codHandling);
    formData.append("defaultPackaging", packaging);
    formData.append("defaultGatewayFeePct", gatewayFee);
    formData.append("gatewayFixedFee", gatewayFixed);
    formData.append("rtoDetectionPattern", rtoPattern);
    formData.append("alertEmail", email);
    formData.append("rtoThreshold", rtoLimit);
    formData.append("marginThreshold", marginLimit);
    formData.append("gstin", gstin);
    formData.append("isGstRegistered", isGstReg.toString());
    formData.append("gstRate", gstRate);
    formData.append("whatsappPhone", waPhone);
    formData.append("whatsappEnabled", waEnabled.toString());
    formData.append("shippingSlabs", JSON.stringify(slabs));

    submit(formData, { method: "post" });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Frame>
      <Page
        title="Store & Cost Settings"
        subtitle="Configure forward and return shipping, weight slabs, COD handling fees, GST rates, and notification channels."
        primaryAction={{
          content: "Save Settings",
          onAction: handleSave,
          loading: isSaving,
        }}
      >
        <Layout>
          <Layout.Section>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              <Box paddingBlockStart="400">
                <BlockStack gap="400">
                  
                  {/* ── TAB 0: Costs & Shipping ─────────────────── */}
                  {selectedTab === 0 && (
                    <Card>
                      <Box padding="500">
                        <BlockStack gap="400">
                          <InlineStack gap="150" blockAlign="center">
                            <Icon source={FinanceIcon} />
                            <Text variant="headingMd" as="h2">💰 Payment Gateway & Logistics Cost Rules</Text>
                          </InlineStack>
                          <Text variant="bodySm" as="p" tone="subdued">
                            Override average shipping, COD handling, and payment gateway fees (Razorpay, PayU, CCAvenue) to ensure high true net profit tracking.
                          </Text>
                          <Divider />

                          {/* Weight Slabs Editor */}
                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">⚖️ Weight-Based Logistics Slabs (Optional)</Text>
                            <Text variant="bodySm" as="p" tone="subdued">
                              Define shipping costs based on total order weight. Slabs are matched in ascending order (e.g. 500g, 1000g). If matched, they override the flat forward & return shipping averages below.
                            </Text>
                            {slabs.map((slab, index) => (
                              <InlineStack gap="200" key={index} blockAlign="center">
                                <div style={{ flex: 1 }}>
                                  <TextField
                                    label="Max Weight (Grams)"
                                    type="number"
                                    value={slab.maxWeightGrams.toString()}
                                    onChange={(val) => {
                                      const newSlabs = [...slabs];
                                      newSlabs[index].maxWeightGrams = Number(val) || 0;
                                      setSlabs(newSlabs);
                                    }}
                                    suffix="g"
                                    autoComplete="off"
                                  />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <TextField
                                    label="Forward Cost"
                                    type="number"
                                    value={slab.forwardCost.toString()}
                                    onChange={(val) => {
                                      const newSlabs = [...slabs];
                                      newSlabs[index].forwardCost = Number(val) || 0;
                                      setSlabs(newSlabs);
                                    }}
                                    prefix="₹"
                                    autoComplete="off"
                                  />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <TextField
                                    label="Return Cost (RTO)"
                                    type="number"
                                    value={slab.returnCost.toString()}
                                    onChange={(val) => {
                                      const newSlabs = [...slabs];
                                      newSlabs[index].returnCost = Number(val) || 0;
                                      setSlabs(newSlabs);
                                    }}
                                    prefix="₹"
                                    autoComplete="off"
                                  />
                                </div>
                                <div style={{ marginTop: "24px" }}>
                                  <Button
                                    tone="critical"
                                    variant="secondary"
                                    onClick={() => {
                                      setSlabs(slabs.filter((_, i) => i !== index));
                                    }}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              </InlineStack>
                            ))}
                            <InlineStack>
                              <Button
                                onClick={() => {
                                  setSlabs([...slabs, { maxWeightGrams: 500, forwardCost: 50, returnCost: 70 }]);
                                }}
                              >
                                + Add Weight Slab
                              </Button>
                            </InlineStack>
                          </BlockStack>

                          <Divider />
                          
                          <Text variant="bodySm" as="p" tone="subdued">
                            Set flat average logistics defaults below for orders that do not map to any weight slabs:
                          </Text>

                          <Grid columns={{ xs: 1, sm: 2, md: 3, lg: 3 }}>
                            <Grid.Cell>
                              <TextField
                                label="Forward Shipping Cost"
                                value={forwardShipping}
                                onChange={setForwardShipping}
                                type="number"
                                prefix="₹"
                                helpText="Average cost paid to courier to ship forward (e.g. ₹60)."
                                autoComplete="off"
                              />
                            </Grid.Cell>
                            <Grid.Cell>
                              <TextField
                                label="Return Shipping Cost (RTO)"
                                value={returnShipping}
                                onChange={setReturnShipping}
                                type="number"
                                prefix="₹"
                                helpText="Average cost paid to courier to return package (e.g. ₹70)."
                                autoComplete="off"
                              />
                            </Grid.Cell>
                            <Grid.Cell>
                              <TextField
                                label="COD Handling Fee"
                                value={codHandling}
                                onChange={setCodHandling}
                                type="number"
                                prefix="₹"
                                helpText="Flat fee charged by courier on COD orders (e.g. ₹40)."
                                autoComplete="off"
                              />
                            </Grid.Cell>
                            <Grid.Cell>
                              <TextField
                                label="Packaging Cost"
                                value={packaging}
                                onChange={setPackaging}
                                type="number"
                                prefix="₹"
                                helpText="Box, tape, label material cost per order (e.g. ₹10)."
                                autoComplete="off"
                              />
                            </Grid.Cell>
                            <Grid.Cell>
                              <TextField
                                label="Payment Gateway Fee"
                                value={gatewayFee}
                                onChange={setGatewayFee}
                                type="number"
                                suffix="%"
                                helpText="Gateway % fee (Razorpay / PayU default 2%)."
                                autoComplete="off"
                              />
                            </Grid.Cell>
                            <Grid.Cell>
                              <TextField
                                label="Gateway Fixed Fee"
                                value={gatewayFixed}
                                onChange={setGatewayFixed}
                                type="number"
                                prefix="₹"
                                helpText="Fixed per-transaction charge (e.g. ₹0 - ₹3)."
                                autoComplete="off"
                              />
                            </Grid.Cell>
                          </Grid>
                        </BlockStack>
                      </Box>
                    </Card>
                  )}

                  {/* ── TAB 1: GST Compliance ───────────────────── */}
                  {selectedTab === 1 && (
                    <Card>
                      <Box padding="500">
                        <BlockStack gap="400">
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="100">
                              <InlineStack gap="200" blockAlign="center">
                                <Icon source={DatabaseIcon} />
                                <Text variant="headingMd" as="h2">GST Compliance & Tax Reporting (GSTR-1 / GSTR-3B)</Text>
                                <Badge tone={isGstReg ? "success" : "attention"}>
                                  {isGstReg ? "GST Registered" : "Unregistered"}
                                </Badge>
                              </InlineStack>
                              <Text variant="bodySm" as="p" tone="subdued">
                                Configure your GSTIN and tax rates to auto-generate CGST/SGST/IGST reports for your accountant.
                              </Text>
                            </BlockStack>
                            <Button
                              url={`/api/gst-report?shop=${shop}&format=csv`}
                              external
                              variant="primary"
                            >
                              Download GSTR-1 CSV Report 📄
                            </Button>
                          </InlineStack>

                          <Divider />

                          <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3 }}>
                            <Grid.Cell>
                              <TextField
                                label="Merchant GSTIN Number"
                                value={gstin}
                                onChange={setGstin}
                                placeholder="e.g. 27AAAAA0000A1Z5"
                                helpText="15-digit Goods & Services Tax Identification Number."
                                autoComplete="off"
                              />
                            </Grid.Cell>
                            <Grid.Cell>
                              <Select
                                label="Default GST Rate (%)"
                                options={[
                                  { label: "18% Standard GST Rate", value: "18" },
                                  { label: "12% Reduced Rate", value: "12" },
                                  { label: "5% Essential Goods", value: "5" },
                                  { label: "28% Premium Goods", value: "28" },
                                  { label: "0% Exempt Goods", value: "0" },
                                ]}
                                value={gstRate}
                                onChange={setGstRate}
                              />
                            </Grid.Cell>
                            <Grid.Cell>
                              <BlockStack gap="200">
                                <Text variant="bodySm" as="span" fontWeight="bold">Registration Status</Text>
                                <Button
                                  variant={isGstReg ? "primary" : "secondary"}
                                  tone={isGstReg ? "critical" : undefined}
                                  onClick={() => setIsGstReg(!isGstReg)}
                                >
                                  {isGstReg ? "Disable GST Tracking" : "Enable GST Registration"}
                                </Button>
                              </BlockStack>
                            </Grid.Cell>
                          </Grid>
                        </BlockStack>
                      </Box>
                    </Card>
                  )}

                  {/* ── TAB 2: WhatsApp & OTP ───────────────────── */}
                  {selectedTab === 2 && (
                    <Card>
                      <Box padding="500">
                        <BlockStack gap="400">
                          <InlineStack gap="150" blockAlign="center">
                            <Icon source={NotificationIcon} />
                            <Text variant="headingMd" as="h2">💬 WhatsApp Alert & OTP Setup</Text>
                          </InlineStack>
                          <Text variant="bodySm" as="p" tone="subdued">
                            Configure your business phone number to send order confirmation OTP codes via WhatsApp to customers and receive weekly digests.
                          </Text>

                          <Banner tone="warning" title="Messaging Provider Pricing Disclaimer">
                            <p>Note: ProfitRx integrates with your own Meta Cloud API or Twilio WhatsApp account. You will be billed directly and separately by your messaging provider for SMS/WhatsApp API transmission fees.</p>
                          </Banner>
                          
                          {actionData?.error && (
                            <Banner tone="critical" title="Validation Error">
                              <p>{actionData.error}</p>
                            </Banner>
                          )}

                          <Grid columns={{ xs: 1, sm: 2, md: 2, lg: 2 }}>
                            <Grid.Cell>
                              <TextField
                                label="WhatsApp Phone Number"
                                value={waPhone}
                                onChange={setWaPhone}
                                placeholder="e.g. +919876543210"
                                helpText="Include country code (e.g. +91 for India)."
                                autoComplete="off"
                              />
                            </Grid.Cell>
                            <Grid.Cell>
                              <BlockStack gap="200">
                                <Text variant="bodySm" as="span" fontWeight="bold">WhatsApp OTP Status</Text>
                                <Button
                                  variant={waEnabled ? "primary" : "secondary"}
                                  tone={waEnabled ? "success" : undefined}
                                  onClick={() => setWaEnabled(!waEnabled)}
                                >
                                  {waEnabled ? "✓ WhatsApp OTP Enabled" : "Enable WhatsApp OTP"}
                                </Button>
                              </BlockStack>
                            </Grid.Cell>
                          </Grid>
                        </BlockStack>
                      </Box>
                    </Card>
                  )}

                  {/* ── TAB 3: Alerts & Courier ─────────────────── */}
                  {selectedTab === 3 && (
                    <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
                      <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
                        <Card>
                          <Box padding="500">
                            <BlockStack gap="300">
                              <InlineStack gap="150" blockAlign="center">
                                <Icon source={DeliveryIcon} />
                                <Text variant="headingMd" as="h2">🚚 Courier Custom Keywords</Text>
                              </InlineStack>
                              <Text variant="bodySm" as="p" tone="subdued">
                                Enter comma-separated keywords written by courier apps (Delhivery, Shiprocket, Bluedart) to detect RTO status.
                              </Text>
                              <TextField
                                label="Detection Keywords"
                                labelHidden
                                value={rtoPattern}
                                onChange={setRtoPattern}
                                helpText="e.g. rto, returned, undelivered, rto-initiated, delhivery_rto"
                                autoComplete="off"
                              />
                            </BlockStack>
                          </Box>
                        </Card>
                      </Grid.Cell>

                      <Grid.Cell>
                        <Card>
                          <Box padding="500">
                            <BlockStack gap="300">
                              <InlineStack gap="150" blockAlign="center">
                                <Icon source={NotificationIcon} />
                                <Text variant="headingMd" as="h2">Alert Limits</Text>
                              </InlineStack>
                              <TextField
                                label="Alert Email Address"
                                value={email}
                                onChange={setEmail}
                                type="email"
                                autoComplete="off"
                              />
                              <TextField
                                label="RTO Rate Alarm Limit"
                                value={rtoLimit}
                                onChange={setRtoLimit}
                                type="number"
                                suffix="%"
                                autoComplete="off"
                              />
                              <TextField
                                label="Net Margin Alarm Limit"
                                value={marginLimit}
                                onChange={setMarginLimit}
                                type="number"
                                suffix="%"
                                autoComplete="off"
                              />
                            </BlockStack>
                          </Box>
                        </Card>
                      </Grid.Cell>
                    </Grid>
                  )}

                  {/* ── TAB 4: Data Protection (DPA) ───────────── */}
                  {selectedTab === 4 && (
                    <Card>
                      <Box padding="500">
                        <BlockStack gap="400">
                          <InlineStack gap="150" blockAlign="center">
                            <Icon source={ShieldCheckMarkIcon} />
                            <Text variant="headingMd" as="h2">🛡️ Merchant Data Processing Agreement (DPA)</Text>
                          </InlineStack>
                          <Text variant="bodySm" as="p" tone="subdued">
                            To satisfy Shopify Level 2 Protected Customer Data standards and applicable privacy legislation, ProfitRx operates under a legally binding Data Processing Agreement establishing data roles, sub-processors, and technical security controls.
                          </Text>

                          <Divider />

                          {dpaAcceptedAt ? (
                            <Banner tone="success" title="Merchant Data Processing Agreement Active">
                              <BlockStack gap="200">
                                <Text as="p" variant="bodyMd">
                                  Version <strong>{dpaAcceptedVersion || "1.0"}</strong> was reviewed and agreed to for <strong>{shop}</strong> on {new Date(dpaAcceptedAt).toLocaleString("en-IN")}.
                                </Text>
                                <InlineStack gap="200">
                                  <Button variant="plain" url="/dpa" target="_blank">
                                    View Full DPA Document (Opens in new tab)
                                  </Button>
                                </InlineStack>
                              </BlockStack>
                            </Banner>
                          ) : (
                            <Banner tone="warning" title="Action Required: Review &amp; Accept DPA">
                              <BlockStack gap="200">
                                <Text as="p" variant="bodyMd">
                                  To complete your store compliance setup under Shopify Level 2 Protected Customer Data requirements, please review and record your acceptance of our Merchant Data Processing Agreement.
                                </Text>
                                <InlineStack gap="300" blockAlign="center">
                                  <Button variant="secondary" url="/dpa" target="_blank">
                                    Review Agreement (v1.0)
                                  </Button>
                                  <Button variant="primary" onClick={handleAcceptDpa} loading={isAcceptingDpa}>
                                    Accept DPA (Version 1.0)
                                  </Button>
                                </InlineStack>
                              </BlockStack>
                            </Banner>
                          )}

                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">Summary of Key Data Protection Safeguards</Text>
                            <Text variant="bodySm" as="p">
                              &bull; <strong>Controller vs. Processor:</strong> You remain the Data Controller; ProfitRx processes customer personal data solely on your documented instructions.
                            </Text>
                            <Text variant="bodySm" as="p">
                              &bull; <strong>Scope:</strong> Personal data (customer name, email, phone, postal code) is processed strictly for fraud risk assessment, OTP verification, and profit analytics.
                            </Text>
                            <Text variant="bodySm" as="p">
                              &bull; <strong>Zero Data Sale:</strong> Customer information is never sold, shared with advertising brokers, or cross-profiled across stores.
                            </Text>
                            <Text variant="bodySm" as="p">
                              &bull; <strong>Encryption:</strong> AES-256 encryption at rest (PostgreSQL/Neon), TLS 1.3 encryption in transit, and AES-256-GCM application token encryption.
                            </Text>
                            <Text variant="bodySm" as="p">
                              &bull; <strong>Automated Retention:</strong> Verification OTPs purged within 48 hours; access logs automatically rotated after 180 days.
                            </Text>
                            <Text variant="bodySm" as="p">
                              &bull; <strong>Incident Notification:</strong> Guaranteed 72-hour notification commitment in the event of any confirmed personal data breach.
                            </Text>
                          </BlockStack>
                        </BlockStack>
                      </Box>
                    </Card>
                  )}

                </BlockStack>
              </Box>
            </Tabs>
          </Layout.Section>
        </Layout>
      </Page>
      {saved && (
        <Toast content="Settings saved successfully!" onDismiss={() => setSaved(false)} />
      )}
    </Frame>
  );
}
