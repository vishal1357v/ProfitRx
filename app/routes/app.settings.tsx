import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Button,
  Grid, TextField, Select, Banner, Divider, Badge,
  Box, Icon, Frame, Toast,
} from "@shopify/polaris";
import {
  DatabaseIcon,
  FinanceIcon,
  DeliveryIcon,
  NotificationIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ProfitService } from "../services/profit.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let rawSettings = await prisma.storeSettings.findUnique({
    where: { shop },
  });
  if (!rawSettings) {
    rawSettings = await prisma.storeSettings.create({
      data: {
        shop,
        defaultCOGSPct: 40,
        defaultForwardShipping: 60,
        defaultReturnShipping: 70,
        defaultCODHandling: 40,
        defaultPackaging: 10,
        defaultGatewayFeePct: 2,
        rtoDetectionPattern: "rto,returned,undelivered,failed_delivery,rto-initiated,rto_initiated,shipped-rto,shiprocket-rto,delhivery_rto,rto-delhivery,rto-bluedart,return-to-origin,returned-to-sender",
        rtoThreshold: 10,
        marginThreshold: 15,
        alertEmail: (session as any).email || "",
      },
    });
  }

  const settings = ProfitService.getSettings(rawSettings);
  return { shop, settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

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

    await prisma.storeSettings.upsert({
      where: { shop },
      update: {
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
      } as any,
      create: {
        shop,
        defaultCOGSPct: 40,
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
      } as any,
    });

    return Response.json({ success: true });
  }

  return Response.json({ success: false });
};

export default function SettingsRoute() {
  const { shop, settings } = useLoaderData<typeof loader>();
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

  // GST State
  const [gstin, setGstin] = useState(settings.gstin || "");
  const [isGstReg, setIsGstReg] = useState(settings.isGstRegistered);
  const [gstRate, setGstRate] = useState(settings.gstRate.toString());
  const [saved, setSaved] = useState(false);

  const isSaving = navigation.state === "submitting" && navigation.formData?.get("intent") === "save_settings";

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

    submit(formData, { method: "post" });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Frame>
      <Page title="🇮🇳 Logistics, GST & Store Settings">
        <Layout>
          {/* ── GST Compliance Card ─────────────────────────── */}
          <Layout.Section>
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
          </Layout.Section>

          {/* ── Cost Overrides ───────────────────────────────── */}
          <Layout.Section>
            <Card>
              <Box padding="500">
                <BlockStack gap="400">
                  <InlineStack gap="150" blockAlign="center">
                    <Icon source={FinanceIcon} />
                    <Text variant="headingMd" as="h2">💰 Payment Gateway & Logistics Cost Rules</Text>
                  </InlineStack>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Override average shipping, COD handling, and payment gateway fees (Razorpay, PayU, CCAvenue) to ensure 100% true net profit tracking.
                  </Text>
                  <Divider />
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
          </Layout.Section>

          {/* ── Courier Keywords & Health Alerts ───────────── */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
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

              <InlineStack align="end">
                <Button variant="primary" onClick={handleSave} loading={isSaving}>
                  Save All Settings →
                </Button>
              </InlineStack>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
      {saved && (
        <Toast content="Settings saved successfully!" onDismiss={() => setSaved(false)} />
      )}
    </Frame>
  );
}
