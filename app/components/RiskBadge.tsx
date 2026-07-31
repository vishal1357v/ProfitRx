import { Badge } from "@shopify/polaris";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";

const RISK_TONES: Record<RiskLevel, "success" | "info" | "warning" | "critical"> = {
  LOW: "success",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "critical",
  UNKNOWN: "info",
};

const RISK_ICONS: Record<RiskLevel, string> = {
  LOW: "✓",
  MEDIUM: "◉",
  HIGH: "⚠",
  CRITICAL: "🚨",
  UNKNOWN: "?",
};

interface RiskBadgeProps {
  level: string;
  showIcon?: boolean;
}

export function RiskBadge({ level, showIcon = true }: RiskBadgeProps) {
  const normalizedLevel = (level?.toUpperCase() || "UNKNOWN") as RiskLevel;
  const tone = RISK_TONES[normalizedLevel] || "info";
  const icon = RISK_ICONS[normalizedLevel] || "";

  return (
    <Badge tone={tone} size="small">
      {showIcon ? `${icon} ${normalizedLevel}` : normalizedLevel}
    </Badge>
  );
}
