type LoadingVariant = "metric" | "chart" | "table" | "row" | "page";

interface LoadingCardProps {
  variant?: LoadingVariant;
  rows?: number;
  columns?: number;
}

const VARIANT_STYLES: Record<LoadingVariant, React.CSSProperties> = {
  metric: { height: 130, borderRadius: "var(--gg-radius-lg)" },
  chart: { height: 260, borderRadius: "var(--gg-radius-lg)" },
  table: { height: 320, borderRadius: "var(--gg-radius-lg)" },
  row: { height: 44, borderRadius: "var(--gg-radius-sm)" },
  page: { height: 600, borderRadius: "var(--gg-radius-lg)" },
};

export function LoadingCard({ variant = "metric", rows = 1, columns = 1 }: LoadingCardProps) {
  const style = VARIANT_STYLES[variant];

  if (variant === "table") {
    return (
      <div className="prx-skeleton-group" role="progressbar" aria-label="Loading table data">
        <div className="prx-skeleton prx-skeleton--header" style={{ height: 36, marginBottom: 8 }} />
        {Array.from({ length: rows || 5 }).map((_, i) => (
          <div key={i} className="prx-skeleton prx-skeleton--row" style={{ height: 44, marginBottom: 4 }} />
        ))}
      </div>
    );
  }

  if (columns > 1) {
    return (
      <div
        className="prx-skeleton-grid"
        role="progressbar"
        aria-label="Loading content"
        style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 16 }}
      >
        {Array.from({ length: columns * rows }).map((_, i) => (
          <div key={i} className="prx-skeleton prx-skeleton--card" style={style} />
        ))}
      </div>
    );
  }

  return (
    <div
      className="prx-skeleton prx-skeleton--card"
      role="progressbar"
      aria-label="Loading content"
      style={style}
    />
  );
}
