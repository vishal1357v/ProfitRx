import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Grid,
  Badge, Button, TextField, Banner, Divider, List,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  const category = formData.get("category") as string;
  const codShare = formData.get("codShare") as string;

  console.log("[PilotMerchant] Registered pilot tester:", { name, email, phone, category, codShare });
  return Response.json({ success: true, message: "Thank you for joining the ProfitRx Merchant Pilot!" });
};

export default function TestMerchantRoute() {
  const { shop } = useLoaderData<typeof loader>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("Apparel & Fashion");
  const [codShare, setCodShare] = useState("50%");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    setSubmitted(true);
  };

  return (
    <Page title="🚀 Pilot Merchant Testing Portal">
      <Layout>
        {submitted && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => setSubmitted(false)}>
              🎉 Registration successful! Welcome to the ProfitRx Pilot Tester Program.
            </Banner>
          </Layout.Section>
        )}

        {/* ── Welcome Banner ─────────────────────────────── */}
        <Layout.Section>
          <div style={{
            padding: "24px",
            borderRadius: "var(--gg-radius-lg)",
            background: "linear-gradient(135deg, rgba(2,132,199,0.1) 0%, rgba() 100%)",
            border: "1px solid rgba(2,132,199,0.25)",
          }}>
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <span style={{ fontSize: 24 }}>🇮🇳</span>
                  <Text variant="headingLg" as="h1">ProfitRx Pilot Merchant Program</Text>
                  <Badge tone="success">Active Testing</Badge>
                </InlineStack>
                <Text variant="bodyMd" as="p" tone="subdued">
                  Help us perfect profit intelligence, COD management, and GST tax compliance for Indian e-commerce stores.
                </Text>
              </BlockStack>
              <Button
                variant="primary"
                url="https://forms.google.com"
                external
              >
                Submit Pilot Feedback Form 📝
              </Button>
            </InlineStack>
          </div>
        </Layout.Section>

        {/* ── Pilot Testing Checklist ─────────────────────── */}
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2 }}>
            <Grid.Cell>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">📋 8-Point Merchant Testing Checklist</Text>
                  <Divider />
                  <List type="number">
                    <List.Item><strong>Sync Orders:</strong> Run sync from Dashboard and check total order volume.</List.Item>
                    <List.Item><strong>Verify Profit Math:</strong> Cross-check net profit against your manual spreadsheet.</List.Item>
                    <List.Item><strong>COGS Pull:</strong> Verify Shopify unit costs pulled automatically into Products tab.</List.Item>
                    <List.Item><strong>Test COD Pincode Block:</strong> Add high-risk zip code in COD Rules and test checkout.</List.Item>
                    <List.Item><strong>Test OTP Verification:</strong> Trigger WhatsApp/SMS OTP confirmation on test order.</List.Item>
                    <List.Item><strong>Check Fee Deductions:</strong> Verify 2% gateway fee + courier shipping deductions.</List.Item>
                    <List.Item><strong>Export GSTR-1 CSV:</strong> Download tax summary and verify CGST/SGST/IGST split.</List.Item>
                    <List.Item><strong>Test Mobile UI:</strong> Open ProfitRx dashboard on your smartphone browser.</List.Item>
                  </List>
                </BlockStack>
              </Card>
            </Grid.Cell>

            <Grid.Cell>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">👤 Register Your Store for Pilot Feedback</Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Store URL: <strong>{shop}</strong>
                  </Text>
                  <Divider />
                  <TextField label="Merchant Name" value={name} onChange={setName} placeholder="e.g. Rahul Sharma" autoComplete="off" />
                  <TextField label="Contact Email" value={email} onChange={setEmail} type="email" placeholder="rahul@mystore.in" autoComplete="off" />
                  <TextField label="WhatsApp / Phone Number" value={phone} onChange={setPhone} placeholder="+91 9876543210" autoComplete="off" />
                  <Grid columns={{ xs: 2, sm: 2, md: 2, lg: 2 }}>
                    <Grid.Cell>
                      <TextField label="Product Category" value={category} onChange={setCategory} autoComplete="off" />
                    </Grid.Cell>
                    <Grid.Cell>
                      <TextField label="Approx COD Share %" value={codShare} onChange={setCodShare} autoComplete="off" />
                    </Grid.Cell>
                  </Grid>
                  <Button variant="primary" onClick={handleSubmit}>
                    Register Merchant Details →
                  </Button>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
