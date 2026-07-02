import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Grid,
  Badge,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ProfitIntelligenceService } from "../services/profit-intelligence.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const healthStatus = await ProfitIntelligenceService.getProfitHealthStatus(shop);
  const qualityScores = await ProfitIntelligenceService.getChannelQualityScores(shop);

  return { healthStatus, qualityScores };
};

export default function ProfitHealthRoute() {
  const { healthStatus, qualityScores } = useLoaderData<typeof loader>();

  const statusColors = {
    HEALTHY: {
      bg: "rgba(16, 185, 129, 0.08)",
      border: "1px solid rgba(16, 185, 129, 0.2)",
      badge: "success",
      text: "var(--gg-accent-green)",
    },
    WARNING: {
      bg: "rgba(245, 158, 11, 0.08)",
      border: "1px solid rgba(245, 158, 11, 0.2)",
      badge: "warning",
      text: "var(--gg-accent-amber)",
    },
    CRITICAL: {
      bg: "rgba(239, 68, 68, 0.08)",
      border: "1px solid rgba(239, 68, 68, 0.2)",
      badge: "critical",
      text: "var(--gg-accent-red)",
    },
  };

  const currentTheme = statusColors[healthStatus.status] || statusColors.HEALTHY;

  return (
    <Page title="Profit Health Assessment">
      <Layout>
        {/* Main Status Box */}
        <Layout.Section>
          <div style={{
            background: currentTheme.bg,
            border: currentTheme.border,
            borderRadius: "var(--gg-radius-lg)",
            padding: 24,
            boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.12)",
          }}>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <span style={{ fontSize: 32 }}>{healthStatus.emoji}</span>
                  <BlockStack gap="050">
                    <span className="gg-section-label" style={{ color: currentTheme.text, fontWeight: 700 }}>PROFIT HEALTH STATUS</span>
                    <Text variant="headingXl" as="h1">
                      System Status: {healthStatus.status}
                    </Text>
                  </BlockStack>
                </InlineStack>
                <Badge tone={currentTheme.badge as any}>{healthStatus.status}</Badge>
              </InlineStack>

              <Divider />

              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">📊 ProfitRx Profit Health Assessment</Text>
                <p style={{
                  fontSize: 16,
                  color: "var(--gg-text-primary)",
                  fontFamily: "'Outfit', sans-serif",
                  fontWeight: 500,
                  lineHeight: 1.5,
                }}>
                  "{healthStatus.headline}"
                </p>
              </BlockStack>
            </BlockStack>
          </div>
        </Layout.Section>

        {/* Driver Cards */}
        <Layout.Section>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">📊 Health Drivers</Text>
            <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3 }}>
              {healthStatus.drivers.map((driver, idx) => {
                const driverTheme = driver.status === "good"
                  ? { color: "var(--gg-accent-green)", label: "✓ Good" }
                  : driver.status === "warning"
                  ? { color: "var(--gg-accent-amber)", label: "⚠️ Warning" }
                  : { color: "var(--gg-accent-red)", label: "🔴 Critical" };

                return (
                  <Grid.Cell key={idx}>
                    <div style={{
                      background: "var(--gg-surface-1)",
                      border: "1px solid var(--gg-border)",
                      borderRadius: "var(--gg-radius-md)",
                      padding: 20,
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}>
                      <BlockStack gap="200">
                        <InlineStack align="space-between">
                          <span className="gg-section-label">{driver.label}</span>
                          <span style={{ color: driverTheme.color, fontWeight: 600, fontSize: 13 }}>
                            {driverTheme.label}
                          </span>
                        </InlineStack>
                        <Text variant="bodyMd" as="p" tone="subdued">
                          {driver.detail}
                        </Text>
                      </BlockStack>
                    </div>
                  </Grid.Cell>
                );
              })}
            </Grid>
          </BlockStack>
        </Layout.Section>

        {/* AI Action Recommendations */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">🧠 Recommended Actions</Text>
              <BlockStack gap="200">
                {healthStatus.drivers.filter(d => d.status !== "good").map((driver, idx) => (
                  <div key={idx} style={{
                    padding: "16px 20px",
                    borderRadius: "var(--gg-radius-md)",
                    border: `1px solid ${driver.status === "critical" ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.2)"}`,
                    background: driver.status === "critical" ? "rgba(239, 68, 68, 0.02)" : "rgba(245, 158, 11, 0.02)",
                  }}>
                    <BlockStack gap="150">
                      <InlineStack gap="150" blockAlign="center">
                        <span>{driver.status === "critical" ? "🔴" : "⚠️"}</span>
                        <Text variant="headingSm" as="h3">Address {driver.label}</Text>
                      </InlineStack>
                      <Text variant="bodyMd" as="p" tone="subdued">
                        {driver.status === "critical"
                          ? `Urgent Action Required: The system has flagged your ${driver.label.toLowerCase()} as CRITICAL. ${driver.detail} Review your pricing strategies or shipping rules to control losses immediately.`
                          : `Optimization Recommended: Your ${driver.label.toLowerCase()} is below threshold parameters. ${driver.detail} Monitor this metric closely.`
                        }
                      </Text>
                    </BlockStack>
                  </div>
                ))}
                {healthStatus.drivers.filter(d => d.status !== "good").length === 0 && (
                  <div style={{
                    padding: "16px 20px",
                    borderRadius: "var(--gg-radius-md)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    background: "rgba(16, 185, 129, 0.02)",
                    textAlign: "center",
                  }}>
                    <BlockStack gap="150">
                      <span style={{ fontSize: 24 }}>✨</span>
                      <Text variant="headingSm" as="h3">All Drivers Operating Normally</Text>
                      <Text variant="bodyMd" as="p" tone="subdued">
                        No critical optimizations needed. Your store is running efficiently within profit parameters. Keep monitoring for anomalies.
                      </Text>
                    </BlockStack>
                  </div>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Customer Quality Score Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">👥 Customer Channel Quality Analysis</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Comparing LTV and customer quality metrics across various discovery channels
                </Text>
              </BlockStack>

              <Grid columns={{ xs: 1, sm: 2, md: 3, lg: 3 }}>
                {qualityScores.map((qs: any, idx: number) => (
                  <Grid.Cell key={idx}>
                    <div style={{
                      background: "var(--gg-surface-2)",
                      border: "1px solid var(--gg-border)",
                      borderRadius: "var(--gg-radius-md)",
                      padding: 16,
                    }}>
                      <BlockStack gap="200">
                        <InlineStack align="space-between">
                          <Text variant="headingSm" as="h3">{qs.channel}</Text>
                          <Badge tone={qs.qualityScore >= 75 ? "success" : qs.qualityScore >= 50 ? "attention" : "critical"}>
                            {`Score: ${qs.qualityScore}`}
                          </Badge>
                        </InlineStack>
                        <Divider />
                        <BlockStack gap="050">
                          <InlineStack align="space-between">
                            <span className="gg-text-xs gg-text-muted">AOV</span>
                            <span style={{ fontWeight: 600 }}>₹{qs.aov.toLocaleString("en-IN")}</span>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <span className="gg-text-xs gg-text-muted">Customer LTV</span>
                            <span style={{ fontWeight: 600 }}>₹{qs.ltv.toLocaleString("en-IN")}</span>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <span className="gg-text-xs gg-text-muted">Repeat Rate</span>
                            <span style={{ fontWeight: 600 }}>{qs.repeatRate}%</span>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </div>
                  </Grid.Cell>
                ))}
              </Grid>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
