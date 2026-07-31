import { BlockStack, Text, Button, InlineStack } from "@shopify/polaris";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: { text: string; url?: string; onClick?: () => void };
  secondaryAction?: { text: string; url?: string; onClick?: () => void };
  id?: string;
}

export function EmptyStateCard({ icon = "📭", title, description, action, secondaryAction, id }: EmptyStateProps) {
  return (
    <div
      className="prx-empty-state"
      id={id}
      role="status"
      aria-label={title}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        textAlign: "center",
        borderRadius: "var(--gg-radius-lg)",
        border: "1px dashed var(--gg-border)",
        background: "var(--gg-surface-2)",
        minHeight: 200,
      }}
    >
      <BlockStack gap="300" inlineAlign="center">
        <span style={{ fontSize: 48 }} aria-hidden="true">{icon}</span>
        <BlockStack gap="100" inlineAlign="center">
          <Text variant="headingMd" as="h3">{title}</Text>
          <Text variant="bodySm" as="p" tone="subdued">{description}</Text>
        </BlockStack>
        <InlineStack gap="200">
          {action && (
            action.url ? (
              <Button variant="primary" url={action.url}>{action.text}</Button>
            ) : (
              <Button variant="primary" onClick={action.onClick}>{action.text}</Button>
            )
          )}
          {secondaryAction && (
            secondaryAction.url ? (
              <Button variant="secondary" url={secondaryAction.url}>{secondaryAction.text}</Button>
            ) : (
              <Button variant="secondary" onClick={secondaryAction.onClick}>{secondaryAction.text}</Button>
            )
          )}
        </InlineStack>
      </BlockStack>
    </div>
  );
}
