import React from "react";

export type TrendItem = { date: string; rto: number; shipping: number; discount: number };

export function LeakTrendChart({ data }: { data: TrendItem[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 180, color: "var(--gg-text-muted, #64748b)",
        fontFamily: "'Inter', sans-serif", fontSize: 14,
        background: "rgba(255,255,255,0.02)", borderRadius: 8,
        border: "1px dashed rgba(255,255,255,0.08)",
      }}>
        <span>📉 No leak trend data available</span>
      </div>
    );
  }

  const width = 640;
  const height = 180;
  const padL = 44, padR = 16, padT = 12, padB = 30;

  const maxVal = Math.max(...data.flatMap(d => [d.rto + d.shipping + d.discount]), 100);
  const getX = (i: number) => padL + (i * (width - padL - padR)) / (data.length - 1);
  const getY = (v: number) => padT + ((maxVal - v) / maxVal) * (height - padT - padB);

  const toStackedLine = (key: "rto" | "shipping" | "discount", prevKey?: "rto" | "shipping") =>
    data.map((d, i) => {
      const base = prevKey ? d[prevKey] : 0;
      const val = d[key] + base;
      return `${getX(i)},${getY(val)}`;
    }).join(" ");

  const stackedArea = (key: "rto" | "shipping" | "discount", prevKey?: "rto" | "shipping") => {
    const points = data.map((d, i) => {
      const base = prevKey ? d[prevKey] : 0;
      return `${getX(i)},${getY(d[key] + base)}`;
    });
    const reverseBase = data.map((d, i) => {
      const base = prevKey ? d[prevKey] : 0;
      return `${getX(data.length - 1 - i)},${getY(base)}`;
    });
    return `M ${points.join(" L ")} L ${reverseBase.join(" L ")} Z`;
  };

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        <defs>
          <linearGradient id="rto-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="ship-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="disc-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((p, idx) => {
          const y = padT + (1 - p) * (height - padT - padB);
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 5" />
              <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#475569">
                ₹{Math.round(p * maxVal)}
              </text>
            </g>
          );
        })}

        {data.filter((_, i) => i % 5 === 0).map((d, idx) => {
          const i = data.findIndex(item => item.date === d.date);
          return <text key={idx} x={getX(i)} y={height - padB + 14} textAnchor="middle" fontSize="9" fill="#475569">{d.date}</text>;
        })}

        <path d={stackedArea("rto")} fill="url(#rto-grad)" />
        <path d={stackedArea("shipping", "rto")} fill="url(#ship-grad)" />
        <path d={stackedArea("discount", "shipping")} fill="url(#disc-grad)" />

        <polyline fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" points={toStackedLine("rto")} />
        <polyline fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" points={toStackedLine("shipping", "rto")} />
        <polyline fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" points={toStackedLine("discount", "shipping")} />
      </svg>

      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 8 }}>
        {[
          { color: "#ef4444", label: "RTO Loss" },
          { color: "#f59e0b", label: "Shipping Overage" },
          { color: "#7c3aed", label: "Discount Loss" },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 20, height: 3, backgroundColor: l.color, borderRadius: 2 }} />
            <span style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

