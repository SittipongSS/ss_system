"use client";

import { fmtMoney } from "@/lib/format";

// Single stat tile for the dashboard. Optional `tone` tints the value + accent
// bar (success / warning / danger / info). `onClick` makes the whole card a
// deep-link (e.g. into a filtered list).
const TONE = {
  success: "var(--green)",
  warning: "var(--amber)",
  danger: "var(--red)",
  info: "var(--blue)",
  accent: "var(--accent)",
  neutral: "var(--text-3)",
};

export default function KpiCard({ label, value, taxValue, hint, tone = "accent", icon: Icon, onClick }) {
  const color = TONE[tone] || TONE.accent;
  return (
    <div
      className="glass-panel"
      onClick={onClick}
      style={{
        padding: 16, display: "flex", flexDirection: "column", gap: 8,
        cursor: onClick ? "pointer" : undefined,
        borderLeft: `4px solid ${color}`,
        transition: "all 0.2s ease",
        transform: "translateY(0)",
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.transform = "translateY(-4px)")}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.transform = "translateY(0)")}
    >
      <div className="flex items-center justify-between" style={{ color: "var(--text-3)", fontSize: 13, fontWeight: 500 }}>
        <span>{label}</span>
        {Icon && <Icon size={16} color={color} />}
      </div>
      
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>
          {typeof value === "number" ? value.toLocaleString("th-TH") : value}
        </div>
        {taxValue !== undefined && (
          <div style={{ fontSize: 14, color: "var(--text-2)", fontWeight: 600 }}>
            | ฿ {fmtMoney(taxValue)}
          </div>
        )}
      </div>

      {hint && <div style={{ fontSize: 12, color: "var(--text-3)" }}>{hint}</div>}
    </div>
  );
}
