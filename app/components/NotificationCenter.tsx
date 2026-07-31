import { useState, useEffect, useCallback } from "react";
import { Icon, Text, Badge, Button, BlockStack, InlineStack, Divider } from "@shopify/polaris";
import { NotificationIcon } from "@shopify/polaris-icons";

interface Notification {
  id: string;
  type: string;
  severity: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const SEVERITY_ICONS: Record<string, string> = {
  INFO: "ℹ️",
  WARNING: "⚠️",
  CRITICAL: "🚨",
  SUCCESS: "✅",
};

interface NotificationCenterProps {
  shop: string;
  host: string;
}

export function NotificationCenter({ shop, host }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/notifications?shop=${encodeURIComponent(shop)}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    fetchNotifications();
    // Poll every 60 seconds
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "markRead", shop }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
    } catch {
      // Silently fail
    }
  };

  const markAllRead = async () => {
    try {
      await fetch(`/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAllRead", shop }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // Silently fail
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Bell Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="prx-notification-trigger"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        style={{
          position: "relative",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 6,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          color: "var(--gg-text-primary)",
          transition: "background-color 0.2s ease",
        }}
      >
        <Icon source={NotificationIcon} />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "var(--gg-accent-red)",
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              animation: "prx-pulse 2s ease infinite",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            aria-hidden="true"
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
          />
          <div
            className="prx-notification-panel"
            role="dialog"
            aria-label="Notifications"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: "min(380px, 90vw)",
              maxHeight: "70vh",
              backgroundColor: "var(--gg-surface-1)",
              borderRadius: "var(--gg-radius-lg)",
              border: "1px solid var(--gg-border)",
              boxShadow: "0 16px 48px rgba(0, 0, 0, 0.3)",
              zIndex: 1000,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              animation: "prx-slideUp 0.15s ease",
            }}
          >
            {/* Header */}
            <div style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--gg-border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <InlineStack gap="150" blockAlign="center">
                <Text variant="headingSm" as="h3">Notifications</Text>
                {unreadCount > 0 && <Badge tone="critical">{String(unreadCount)}</Badge>}
              </InlineStack>
              <InlineStack gap="100">
                {unreadCount > 0 && (
                  <Button variant="plain" onClick={markAllRead} size="slim">Mark all read</Button>
                )}
              </InlineStack>
            </div>

            {/* List */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {notifications.length === 0 && (
                <div style={{ padding: "32px 16px", textAlign: "center" }}>
                  <span style={{ fontSize: 32, display: "block", marginBottom: 8 }}>🔔</span>
                  <Text variant="bodySm" as="p" tone="subdued">No notifications yet</Text>
                </div>
              )}
              {notifications.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.isRead && markAsRead(n.id)}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "12px 16px",
                    width: "100%",
                    border: "none",
                    borderBottom: "1px solid var(--gg-border)",
                    background: n.isRead ? "transparent" : "rgba(37, 99, 235, 0.04)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "'Inter', sans-serif",
                    color: "var(--gg-text-primary)",
                    transition: "background 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 2 }}>
                    {SEVERITY_ICONS[n.severity] || "📌"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: n.isRead ? 400 : 600,
                      lineHeight: 1.4,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}>
                      {n.message}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--gg-text-muted)", marginTop: 3 }}>
                      {formatTime(n.createdAt)}
                    </div>
                  </div>
                  {!n.isRead && (
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--gg-accent-blue)",
                      flexShrink: 0,
                      marginTop: 6,
                    }} aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>

            {/* Footer */}
            <div style={{
              padding: "8px 16px",
              borderTop: "1px solid var(--gg-border)",
              textAlign: "center",
            }}>
              <Button variant="plain" url={`/app/alerts?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}>
                View all alerts →
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
