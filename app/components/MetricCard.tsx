import { Card, Box, BlockStack, InlineStack, Text, Tooltip, Badge, Button } from "@shopify/polaris";

export type MetricTone = "info" | "success" | "critical" | "warning" | "neutral";

interface MetricCardProps {
  title: string;
  value: string;
  prefix?: string;
  tone?: MetricTone;
  icon?: string;
  tooltip?: string;
  badge?: { content: string; tone: "success" | "warning" | "critical" | "info" };
  loading?: boolean;
  subtitle?: React.ReactNode;
  action?: { content: string; onAction: () => void };
  id?: string;
}

const TONE_CLASSES: Record<MetricTone, { card: string; icon: string; value: string }> = {
  info: { card: "gg-card-revenue", icon: "gg-stat-icon--blue", value: "gg-stat-value" },
  success: { card: "gg-card-profit", icon: "gg-stat-icon--green", value: "gg-stat-value-green" },
  critical: { card: "gg-card-danger", icon: "gg-stat-icon--red", value: "gg-stat-value-red" },
  warning: { card: "gg-card-health", icon: "gg-stat-icon--amber", value: "gg-stat-value" },
  neutral: { card: "", icon: "gg-stat-icon--blue", value: "gg-stat-value-neutral" },
};

export function MetricCard({
  title, value, prefix = "", tone = "info",
  icon, tooltip, badge, loading = false, subtitle, action, id,
}: MetricCardProps) {
  const classes = TONE_CLASSES[tone];

  return (
    <Card>
      <Box padding="400">
        <div className={`prx-metric-card ${classes.card}`} id={id}>
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="start">
              {icon && (
                <div className={`gg-stat-icon ${classes.icon}`}>
                  <span style={{ fontSize: 18 }} aria-hidden="true">{icon}</span>
                </div>
              )}
              {tooltip && (
                <Tooltip content={tooltip}>
                  <span style={{ cursor: "help", fontSize: 12, color: "var(--gg-text-muted)" }} aria-label={tooltip}>ⓘ</span>
                </Tooltip>
              )}
            </InlineStack>
            <BlockStack gap="050">
              <InlineStack gap="100">
                <Text variant="bodySm" as="span" tone="subdued">{title}</Text>
                {badge && <Badge tone={badge.tone} size="small">{badge.content}</Badge>}
              </InlineStack>
              {loading ? (
                <div className="prx-skeleton prx-skeleton-metric" role="progressbar" aria-label="Loading" />
              ) : (
                <span className={classes.value} style={{ fontSize: 28, lineHeight: 1, fontFamily: "'Outfit', sans-serif", fontWeight: 700 }}>
                  {prefix}{value}
                </span>
              )}
            </BlockStack>
            {subtitle && (
              <div style={{ fontSize: 12, color: "var(--gg-text-secondary)" }}>
                {subtitle}
              </div>
            )}
            {action && (
              <Button variant="plain" onClick={action.onAction}>
                {action.content}
              </Button>
            )}
          </BlockStack>
        </div>
      </Box>
    </Card>
  );
}
