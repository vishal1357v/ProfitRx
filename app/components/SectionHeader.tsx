import { InlineStack, Text, Badge, Button } from "@shopify/polaris";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: string;
  badge?: { text: string; tone: "success" | "warning" | "critical" | "info" | "attention" };
  action?: React.ReactNode;
  id?: string;
}

export function SectionHeader({ title, subtitle, icon, badge, action, id }: SectionHeaderProps) {
  return (
    <div id={id} role="heading" aria-level={2} style={{ marginBottom: "4px" }}>
      <InlineStack align="space-between" blockAlign="center">
        <div>
          <InlineStack gap="200" blockAlign="center">
            {icon && <span style={{ fontSize: 20 }} aria-hidden="true">{icon}</span>}
            <Text variant="headingMd" as="h2">{title}</Text>
            {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}
          </InlineStack>
          {subtitle && (
            <Text variant="bodySm" as="p" tone="subdued">{subtitle}</Text>
          )}
        </div>
        {action}
      </InlineStack>
    </div>
  );
}
