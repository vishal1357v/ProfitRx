import { Badge } from "@shopify/polaris";

type StatusType =
  | "synced" | "pending" | "failed" | "active" | "inactive"
  | "connected" | "disconnected" | "expired" | "trialing"
  | "complete" | "in_progress";

const STATUS_CONFIG: Record<StatusType, { tone: "success" | "warning" | "critical" | "info" | "attention"; label: string }> = {
  synced: { tone: "success", label: "Synced" },
  pending: { tone: "attention", label: "Pending" },
  failed: { tone: "critical", label: "Failed" },
  active: { tone: "success", label: "Active" },
  inactive: { tone: "info", label: "Inactive" },
  connected: { tone: "success", label: "Connected" },
  disconnected: { tone: "critical", label: "Disconnected" },
  expired: { tone: "critical", label: "Expired" },
  trialing: { tone: "info", label: "Trialing" },
  complete: { tone: "success", label: "Complete" },
  in_progress: { tone: "attention", label: "In Progress" },
};

interface StatusBadgeProps {
  status: string;
  customLabel?: string;
}

export function StatusBadge({ status, customLabel }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase().replace(/\s+/g, "_") as StatusType;
  const config = STATUS_CONFIG[normalizedStatus] || { tone: "info" as const, label: status };

  return (
    <Badge tone={config.tone} size="small">
      {customLabel || config.label}
    </Badge>
  );
}
