import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useSubmit } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Grid,
  TextField,
  Banner,
  Divider,
} from "@shopify/polaris";
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
  return { settings };
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
    const rtoDetectionPattern = (formData.get("rtoDetectionPattern") as string) || "rto,returned,undelivered,failed_delivery,rto-initiated,rto_initiated,shipped-rto,shiprocket-rto,delhivery_rto,rto-delhivery,rto-bluedart,return-to-origin,returned-to-sender";
    const alertEmail = formData.get("alertEmail") as string;
    const rtoThreshold = parseFloat(formData.get("rtoThreshold") as string) || 10;
    const marginThreshold = parseFloat(formData.get("marginThreshold") as string) || 15;

    await prisma.storeSettings.upsert({
      where: { shop },
      update: {
        defaultForwardShipping,
        defaultReturnShipping,
        defaultCODHandling,
        defaultPackaging,
        defaultGatewayFeePct,
        rtoDetectionPattern,
        alertEmail,
        rtoThreshold,
        marginThreshold,
      },
      create: {
        shop,
        defaultCOGSPct: 40,
        defaultForwardShipping,
        defaultReturnShipping,
        defaultCODHandling,
        defaultPackaging,
        defaultGatewayFeePct,
        rtoDetectionPattern,
        alertEmail,
        rtoThreshold,
        marginThreshold,
      },
    });

    return Response.json({ success: true });
  }

  return Response.json({ success: false });
};

export default function SettingsRoute() {
  const { settings } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [forwardShipping, setForwardShipping] = useState(settings.defaultForwardShipping.toString());
  const [returnShipping, setReturnShipping] = useState(settings.defaultReturnShipping.toString());
  const [codHandling, setCodHandling] = useState(settings.defaultCODHandling.toString());
  const [packaging, setPackaging] = useState(settings.defaultPackaging.toString());
  const [gatewayFee, setGatewayFee] = useState(settings.defaultGatewayFeePct.toString());
  const [rtoPattern, setRtoPattern] = useState(settings.rtoDetectionPattern);
  const [email, setEmail] = useState(settings.alertEmail || "");
  const [rtoLimit, setRtoLimit] = useState(settings.rtoThreshold.toString());
  const [marginLimit, setMarginLimit] = useState(settings.marginThreshold.toString());
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
    formData.append("rtoDetectionPattern", rtoPattern);
    formData.append("alertEmail", email);
    formData.append("rtoThreshold", rtoLimit);
    formData.append("marginThreshold", marginLimit);

    submit(formData, { method: "post" });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Page title="Logistics & Store Settings">
      <Layout>
        {saved && (
          <Layout.Section>
            <Banner tone="success">Settings updated successfully!</Banner>
          </Layout.Section>
        )}

        {/* ── Left Side: Cost Overrides ───────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">💰 Logistics & Transaction Cost Rules</Text>
              <Text variant="bodySm" as="p" tone="subdued">
                Override the average cost values used across your profit and leak calculations. These rates are applied dynamically to calculate true net margin.
              </Text>
              <Banner tone="warning">
                ⚠️ These default values are generic estimates. Please update them with your actual courier rate cards to ensure 100% accurate profit intelligence.
              </Banner>
              <Divider />
              <Grid columns={{ xs: 1, sm: 2, md: 2, lg: 2 }}>
                <Grid.Cell>
                  <TextField
                    label="Forward Shipping Cost (₹)"
                    value={forwardShipping}
                    onChange={setForwardShipping}
                    type="number"
                    helpText="Average cost paid to courier to ship a package forward (e.g. ₹60)."
                    autoComplete="off"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <TextField
                    label="Return Shipping Cost (RTO) (₹)"
                    value={returnShipping}
                    onChange={setReturnShipping}
                    type="number"
                    helpText="Average cost paid to courier to bring an undelivered package back (e.g. ₹70)."
                    autoComplete="off"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <TextField
                    label="COD Handling Fee (₹)"
                    value={codHandling}
                    onChange={setCodHandling}
                    type="number"
                    helpText="Flat fee charged by courier aggregators on COD orders (e.g. ₹40)."
                    autoComplete="off"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <TextField
                    label="Packaging Cost (₹)"
                    value={packaging}
                    onChange={setPackaging}
                    type="number"
                    helpText="Average box, label, and wrapper materials cost per order (e.g. ₹10)."
                    autoComplete="off"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <TextField
                    label="Prepaid Gateway Transaction Fee (%)"
                    value={gatewayFee}
                    onChange={setGatewayFee}
                    type="number"
                    helpText="Transaction % charged by your payment gateway provider (e.g. Razorpay/Shopify Payments: 2%)."
                    autoComplete="off"
                  />
                </Grid.Cell>
              </Grid>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Right Side: Courier Keywords & Alerts ───────── */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {/* Courier tags settings */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">🚚 Courier RTO Custom Keywords</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Enter comma-separated keywords/tags written by your courier app (e.g. Delhivery, Shiprocket) to detect RTO status.
                </Text>
                <TextField
                  label="Detection Keywords"
                  labelHidden
                  value={rtoPattern}
                  onChange={setRtoPattern}
                  helpText="Example: rto, returned, undelivered, rto-initiated, delhivery_rto"
                  autoComplete="off"
                />
              </BlockStack>
            </Card>

            {/* Threshold limits */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">🔔 Health Alert Thresholds</Text>
                <TextField
                  label="Alert Email Address"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  autoComplete="off"
                />
                <TextField
                  label="RTO Rate Alarm Limit (%)"
                  value={rtoLimit}
                  onChange={setRtoLimit}
                  type="number"
                  autoComplete="off"
                />
                <TextField
                  label="Net Margin Alarm Limit (%)"
                  value={marginLimit}
                  onChange={setMarginLimit}
                  type="number"
                  autoComplete="off"
                />
              </BlockStack>
            </Card>

            <InlineStack align="end">
              <Button variant="primary" onClick={handleSave} loading={isSaving}>
                Save All Settings
              </Button>
            </InlineStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
