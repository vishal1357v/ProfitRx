import React from "react";
import { BlockStack } from "@shopify/polaris";

export type DonutSegment = { value: number; color: string; label: string };

export function DonutChart({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let cumPct = 0;
  const r = 42;
  const cx = 70;
  const cy = 70;
  const circumference = 2 * Math.PI * r;

  const arcs = segments.map((seg) => {
    const pct = seg.value / total;
    const offset = circumference - pct * circumference;
    const rotation = cumPct * 360 - 90;
    cumPct += pct;
    return { ...seg, pct: Math.round(pct * 100), offset, rotation };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="14" />
        {arcs.map((arc, idx) => (
          <circle
            key={idx}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth="14"
            strokeDasharray={circumference}
            strokeDashoffset={arc.offset}
            transform={`rotate(${arc.rotation} ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        ))}
        {/* Center text */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="Inter, sans-serif">TOTAL LEAK</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill="#e2e8f0" fontFamily="Outfit, sans-serif" fontWeight="700">
          ₹{(segments.reduce((s, seg) => s + seg.value, 0) / 1000).toFixed(1)}k
        </text>
      </svg>

      <BlockStack gap="200">
        {arcs.map((arc, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: arc.color, flexShrink: 0 }} />
            <BlockStack gap="0">
              <span style={{ fontSize: 12, color: "var(--gg-text-secondary)", fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                {arc.label}
              </span>
              <span style={{ fontSize: 11, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>
                ₹{arc.value.toLocaleString("en-IN")} · {arc.pct}%
              </span>
            </BlockStack>
          </div>
        ))}
      </BlockStack>
    </div>
  );
}

