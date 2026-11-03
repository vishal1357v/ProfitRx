import React from "react";

export type ChartItem = { date: string; revenue: number; profit: number };

export function ProfitTrendChart({ data }: { data: ChartItem[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 230, color: "var(--gg-text-muted, #64748b)",
        fontFamily: "'Inter', sans-serif", fontSize: 14,
        background: "rgba(255,255,255,0.02)", borderRadius: 8,
        border: "1px dashed rgba(255,255,255,0.08)",
      }}>
        <span>📊 No revenue data yet — sync your orders to see the trend chart</span>
      </div>
    );
  }

  const width = 640;
  const height = 230;
  const padL = 52, padR = 16, padT = 16, padB = 36;

  const labelInterval = data.length > 20 ? (typeof window !== "undefined" && window.innerWidth < 600 ? 10 : 5) : 3;

  const maxVal = Math.max(...data.map(d => Math.max(d.revenue, d.profit, 500)));
  const minVal = Math.min(...data.map(d => Math.min(d.revenue, d.profit, 0)));
  const range = maxVal - minVal || 500;

  const getX = (i: number) => padL + (i * (width - padL - padR)) / (data.length - 1);
  const getY = (v: number) => padT + ((maxVal - v) / range) * (height - padT - padB);

  const revPoints = data.map((d, i) => `${getX(i)},${getY(d.revenue)}`).join(" ");
  const profitPoints = data.map((d, i) => `${getX(i)},${getY(d.profit)}`).join(" ");

  // Area paths
  const revArea = `M ${getX(0)},${getY(data[0].revenue)} ` +
    data.map((d, i) => `L ${getX(i)},${getY(d.revenue)}`).join(" ") +
    ` L ${getX(data.length - 1)},${height - padB} L ${getX(0)},${height - padB} Z`;

  const profitArea = `M ${getX(0)},${getY(data[0].profit)} ` +
    data.map((d, i) => `L ${getX(i)},${getY(d.profit)}`).join(" ") +
    ` L ${getX(data.length - 1)},${height - padB} L ${getX(0)},${height - padB} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        <defs>
          <linearGradient id="grad-rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="grad-profit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="line-rev" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="line-profit" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridLines.map((p, idx) => {
          const val = minVal + p * range;
          const y = getY(val);
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={width - padR} y2={y}
                stroke="rgba(255,255,255,0.06)" strokeDasharray="3 5" />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#475569">
                ₹{val.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {data.filter((_, idx) => idx % labelInterval === 0).map((d, idx) => {
          const index = data.findIndex(item => item.date === d.date);
          return (
            <text key={idx} x={getX(index)} y={height - padB + 16}
              textAnchor="middle" fontSize="9" fill="#475569">
              {d.date}
            </text>
          );
        })}

        {/* Area fills */}
        <path d={revArea} fill="url(#grad-rev)" />
        <path d={profitArea} fill="url(#grad-profit)" />

        {/* Lines */}
        <polyline fill="none" stroke="url(#line-rev)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" points={revPoints} />
        <polyline fill="none" stroke="url(#line-profit)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" points={profitPoints} />

        {/* Dots every 5 */}
        {data.filter((_, idx) => idx % 5 === 0).map((d, idx) => {
          const index = data.findIndex(item => item.date === d.date);
          return (
            <g key={idx}>
              <circle cx={getX(index)} cy={getY(d.revenue)} r="3.5"
                fill="#2563eb" stroke="rgba(37,99,235,0.3)" strokeWidth="4" />
              <circle cx={getX(index)} cy={getY(d.profit)} r="3.5"
                fill="#10b981" stroke="rgba(16,185,129,0.3)" strokeWidth="4" />
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 8 }}>
        {[
          { color: "#2563eb", label: "Revenue (₹)" },
          { color: "#10b981", label: "Net Profit (₹)" },
        ].map((leg) => (
          <div key={leg.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 3, backgroundColor: leg.color, borderRadius: 2 }} />
            <span style={{ fontSize: 12, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>{leg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

