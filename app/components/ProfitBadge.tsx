import { Badge } from "@shopify/polaris";

interface ProfitBadgeProps {
  value: number;
  format?: "currency" | "percent";
}

export function ProfitBadge({ value, format = "currency" }: ProfitBadgeProps) {
  const isPositive = value >= 0;
  const tone = isPositive ? "success" : "critical";
  const arrow = isPositive ? "▲" : "▼";
  const formatted =
    format === "percent"
      ? `${Math.abs(value).toFixed(1)}%`
      : `₹${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <Badge tone={tone} size="small">
      {`${arrow} ${isPositive ? "+" : "-"}${formatted}`}
    </Badge>
  );
}
