import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation } from "react-router";
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
  Badge,
  DataTable,
  Banner,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  let settings = await prisma.storeSettings.findUnique({
    where: { shop: session.shop },
  });
  if (!settings) {
    settings = await prisma.storeSettings.create({
      data: {
        shop: session.shop,
        defaultCOGSPct: 40,
        rtoThreshold: 10,
        marginThreshold: 15,
        alertEmail: (session as any).email || "",
      },
    });
  }

  const activeAlerts = await prisma.alert.findMany({
    where: { shop: session.shop, isRead: false },
    orderBy: { createdAt: "desc" },
  });

  const resolvedAlerts = await prisma.alert.findMany({
    where: { shop: session.shop, isRead: true },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  return {
    settings,
    activeAlerts: activeAlerts.map((a: any) => ({
      ...a,
      createdAt: a.createdAt.toISOString().split("T")[0],
    })),
    resolvedAlerts: resolvedAlerts.map((a: any) => ({
      ...a,
      createdAt: a.createdAt.toISOString().split("T")[0],
      readAt: a.readAt ? a.readAt.toISOString().split("T")[0] : null,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "resolve_alert") {
    const alertId = formData.get("alertId") as string;
    await prisma.alert.update({
      where: { id: alertId, shop: session.shop },
      data: { isRead: true, readAt: new Date() },
    });
    return Response.json({ success: true });
  }

  if (intent === "update_settings") {
    const alertEmail = formData.get("alertEmail") as string;
    const rtoThresholdStr = formData.get("rtoThreshold") as string;
    const marginThresholdStr = formData.get("marginThreshold") as string;

    const rtoThreshold = parseFloat(rtoThresholdStr);
    const marginThreshold = parseFloat(marginThresholdStr);

    if (isNaN(rtoThreshold) || rtoThreshold < 0 || rtoThreshold > 100) {
      return Response.json({ error: "RTO threshold must be a number between 0 and 100" }, { status: 400 });
    }
    if (isNaN(marginThreshold) || marginThreshold < -100 || marginThreshold > 100) {
      return Response.json({ error: "Margin threshold must be a valid percentage number" }, { status: 400 });
    }

    await prisma.storeSettings.upsert({
      where: { shop: session.shop },
      update: { alertEmail, rtoThreshold, marginThreshold },
      create: { shop: session.shop, alertEmail, rtoThreshold, marginThreshold, defaultCOGSPct: 40 },
    });

    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid Action Intent" }, { status: 400 });
};

export default function AlertsRoute() {
  const { settings, activeAlerts, resolvedAlerts } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [alertEmail, setAlertEmail] = useState(settings.alertEmail || "");
  const [rtoThreshold, setRtoThreshold] = useState(settings.rtoThreshold.toString());
  const [marginThreshold, setMarginThreshold] = useState(settings.marginThreshold.toString());
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSettingsSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveSuccess(false);
    setSaveError(null);

    const fd = new FormData();
    fd.append("intent", "update_settings");
    fd.append("alertEmail", alertEmail);
    fd.append("rtoThreshold", rtoThreshold);
    fd.append("marginThreshold", marginThreshold);

    try {
      const res = await fetch("", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError(data.error || "Failed to save settings");
      }
    } catch {
      setSaveError("Failed to submit request.");
    }
  };

  const resolveAlert = async (alertId: string) => {
    const fd = new FormData();
    fd.append("intent", "resolve_alert");
    fd.append("alertId", alertId);
    try {
      await fetch("", { method: "POST", body: fd });
      window.location.reload();
    } catch (err) {
      console.error(err);
    }
  };

  const resolvedRows = resolvedAlerts.map((alert: any) => [
    <span style={{ color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif", fontSize: 12 }}>{alert.createdAt}</span>,
    <Badge key={alert.id} tone={alert.type?.includes("DROP") ? "critical" : "warning"}>{alert.type}</Badge>,
    <span style={{ color: "var(--gg-text-secondary)", fontFamily: "'Inter', sans-serif", fontSize: 13 }}>{alert.message}</span>,
    <span style={{ color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif", fontSize: 12 }}>{alert.readAt || "N/A"}</span>,
  ]);

  const SEVERITY_ICONS: Record<string, string> = {
    CRITICAL: "🚨",
    WARNING: "⚠️",
    INFO: "ℹ️",
  };

  return (
    <Page title="Store Alerts & Threshold Rules">
      <Layout>

        {/* ── Active Alerts ────────────────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <span style={{ fontSize: 20 }}>🔔</span>
                  <BlockStack gap="050">
                    <Text variant="headingMd" as="h2">
                      Active Alerts Inbox
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      {activeAlerts.length} active alert{activeAlerts.length !== 1 ? "s" : ""}
                    </Text>
                  </BlockStack>
                </InlineStack>
                {activeAlerts.length > 0 && (
                  <Badge tone="critical">{`${activeAlerts.length} Unread`}</Badge>
                )}
              </InlineStack>

              <Divider />

              {activeAlerts.length > 0 ? (
                <BlockStack gap="200">
                  {activeAlerts.map((alert: any, idx: number) => {
                    const severity = alert.severity?.toUpperCase() || "WARNING";
                    const isC = severity === "CRITICAL";
                    const tone = isC ? "critical" : "warning";
                    const icon = SEVERITY_ICONS[severity] || "⚠️";

                    return (
                      <div
                        key={alert.id}
                        className={`gg-alert-row gg-alert-row--${isC ? "critical" : "warning"}`}
                        style={{ animationDelay: `${idx * 0.06}s` }}
                      >
                        <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <InlineStack gap="150" blockAlign="center">
                            <Badge tone={tone}>{severity}</Badge>
                            <span style={{
                              fontSize: 11,
                              color: "var(--gg-text-muted)",
                              fontFamily: "'Inter', sans-serif",
                            }}>
                              {alert.createdAt}
                            </span>
                          </InlineStack>
                          <p style={{
                            margin: "6px 0 0",
                            fontSize: 13,
                            fontFamily: "'Inter', sans-serif",
                            color: "var(--gg-text-secondary)",
                            lineHeight: 1.5,
                          }}>
                            {alert.message}
                          </p>
                        </div>
                        <Button
                          variant="primary"
                          tone="success"
                          onClick={() => resolveAlert(alert.id)}
                          id={`resolve-alert-${alert.id}`}
                        >
                          ✓ Resolve
                        </Button>
                      </div>
                    );
                  })}
                </BlockStack>
              ) : (
                <Banner tone="success" title="All Clear — No Active Alerts">
                  Your store metrics look great! All health indicators are within threshold limits.
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Settings Panel ───────────────────────────── */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="150" blockAlign="center">
                <span style={{ fontSize: 18 }}>⚙️</span>
                <Text variant="headingMd" as="h2">Alert Rules & Thresholds</Text>
              </InlineStack>

              {saveSuccess && (
                <Banner tone="success">Settings saved successfully!</Banner>
              )}
              {saveError && (
                <Banner tone="critical">{saveError}</Banner>
              )}

              <form onSubmit={handleSettingsSubmit}>
                <BlockStack gap="300">
                  <TextField
                    label="Notification Email"
                    type="email"
                    value={alertEmail}
                    onChange={setAlertEmail}
                    placeholder="merchant@mail.com"
                    autoComplete="off"
                    helpText="Receive daily summaries or critical alerts via email."
                    id="alert-email-field"
                  />
                  <TextField
                    label="RTO Rate Alert Trigger"
                    type="number"
                    value={rtoThreshold}
                    onChange={setRtoThreshold}
                    suffix="%"
                    autoComplete="off"
                    helpText="Alert triggers when RTO exceeds this threshold."
                    id="rto-threshold-field"
                  />
                  <TextField
                    label="Profit Margin Alert Trigger"
                    type="number"
                    value={marginThreshold}
                    onChange={setMarginThreshold}
                    suffix="%"
                    autoComplete="off"
                    helpText="Alert triggers when margin falls below this value."
                    id="margin-threshold-field"
                  />

                  <div style={{ paddingTop: 4 }}>
                    <Button variant="primary" submit loading={isSubmitting} fullWidth id="save-alert-settings-btn">
                      Save Alert Settings
                    </Button>
                  </div>
                </BlockStack>
              </form>

              <Divider />

              {/* Quick stats */}
              <BlockStack gap="200">
                <span className="gg-section-label">Current Thresholds</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{
                    flex: 1, padding: "10px 12px",
                    borderRadius: "var(--gg-radius-md)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    background: "rgba(239,68,68,0.06)",
                    textAlign: "center",
                  }}>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 20, color: "var(--gg-accent-red)" }}>
                      {settings.rtoThreshold}%
                    </div>
                    <div style={{ fontSize: 10, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif", marginTop: 2 }}>
                      RTO Max
                    </div>
                  </div>
                  <div style={{
                    flex: 1, padding: "10px 12px",
                    borderRadius: "var(--gg-radius-md)",
                    border: "1px solid rgba(245,158,11,0.2)",
                    background: "rgba(245,158,11,0.06)",
                    textAlign: "center",
                  }}>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 20, color: "var(--gg-accent-amber)" }}>
                      {settings.marginThreshold}%
                    </div>
                    <div style={{ fontSize: 10, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif", marginTop: 2 }}>
                      Margin Min
                    </div>
                  </div>
                </div>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Resolved History ─────────────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack gap="150" blockAlign="center">
                <span style={{ fontSize: 18 }}>📋</span>
                <BlockStack gap="050">
                  <Text variant="headingMd" as="h2">Resolved Alerts History</Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Last {resolvedAlerts.length} resolved alerts
                  </Text>
                </BlockStack>
              </InlineStack>

              {resolvedAlerts.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={["Triggered", "Type", "Description", "Resolved"]}
                  rows={resolvedRows}
                />
              ) : (
                <div style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "var(--gg-text-muted)",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                }}>
                  No resolved alert history found yet.
                </div>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}
