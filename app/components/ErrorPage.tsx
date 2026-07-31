import { BlockStack, Text, Button, InlineStack } from "@shopify/polaris";

type ErrorType = "404" | "500" | "offline" | "sync_failed" | "api_unavailable";

interface ErrorPageProps {
  type?: ErrorType;
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  homeUrl?: string;
}

const ERROR_DEFAULTS: Record<ErrorType, { icon: string; title: string; message: string }> = {
  "404": {
    icon: "🔍",
    title: "Page not found",
    message: "The page you're looking for doesn't exist or has been moved.",
  },
  "500": {
    icon: "⚡",
    title: "Something went wrong",
    message: "An unexpected error occurred. Our team has been notified.",
  },
  offline: {
    icon: "📡",
    title: "You're offline",
    message: "Check your internet connection and try again.",
  },
  sync_failed: {
    icon: "🔄",
    title: "Sync failed",
    message: "We couldn't sync your data. This might be a temporary issue.",
  },
  api_unavailable: {
    icon: "🔧",
    title: "Service unavailable",
    message: "ProfitRx is temporarily unavailable. Please try again in a few minutes.",
  },
};

export function ErrorPage({
  type = "500",
  title,
  message,
  onRetry,
  retryLabel = "Try again",
  homeUrl = "/app/dashboard",
}: ErrorPageProps) {
  const defaults = ERROR_DEFAULTS[type];
  const displayTitle = title || defaults.title;
  const displayMessage = message || defaults.message;

  return (
    <div
      className="prx-error-page"
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      <BlockStack gap="400" inlineAlign="center">
        {/* Icon */}
        <div
          style={{
            fontSize: 64,
            lineHeight: 1,
            animation: "prx-float 3s ease-in-out infinite",
          }}
          aria-hidden="true"
        >
          {defaults.icon}
        </div>

        {/* Content */}
        <BlockStack gap="200" inlineAlign="center">
          <Text variant="headingXl" as="h1">{displayTitle}</Text>
          <Text variant="bodyLg" as="p" tone="subdued">
            {displayMessage}
          </Text>
          {type === "500" && (
            <Text variant="bodySm" as="p" tone="subdued">
              Error code: {type}
            </Text>
          )}
        </BlockStack>

        {/* Actions */}
        <InlineStack gap="300">
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          <Button variant="secondary" url={homeUrl}>
            Go to Dashboard
          </Button>
        </InlineStack>
      </BlockStack>
    </div>
  );
}
