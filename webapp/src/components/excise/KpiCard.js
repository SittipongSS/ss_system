"use client";

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

export default function KpiCard({ label, value, hint, tone = "accent", icon: Icon, onClick }) {
  const color = TONE[tone] || TONE.accent;
  return (
    <div
      className="glass-panel"
      onClick={onClick}
      style={{
        padding: 16, display: "flex", flexDirection: "column", gap: 6,
        cursor: onClick ? "pointer" : undefined,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="flex items-center justify-between" style={{ color: "var(--text-3)", fontSize: 12.5 }}>
        <span>{label}</span>
        {Icon && <Icon size={16} color={color} />}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1.1 }}>
        {typeof value === "number" ? value.toLocaleString("th-TH") : value}
      </div>
      {hint && <div style={{ fontSize: 12, color: "var(--text-3)" }}>{hint}</div>}
    </div>
  );
}
