"use client";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";

// Generic "งานที่ต้องทำตอนนี้" action queue for the module command centers
// (PM / master data / SAHAMIT). Same look as excise's WorkQueue, but the leading
// badge is a plain tone-tinted label instead of the excise StatusBadge — so it
// works for statuses that aren't part of the excise workflow.
//   items: { id, tone, badge, title, subtitle, cta, onClick }
//   tone ∈ warning | danger | success | info | neutral (default neutral)
const TONE = {
  success: "var(--green)",
  warning: "var(--amber)",
  danger: "var(--red)",
  info: "var(--blue)",
  neutral: "var(--text-3)",
};

export default function ActionQueue({ items = [], empty = "ไม่มีงานค้างที่ต้องทำตอนนี้ 🎉" }) {
  if (!items.length) {
    return <EmptyState icon={CheckCircle2}>{empty}</EmptyState>;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => {
        const color = TONE[it.tone] || TONE.neutral;
        return (
          <button
            key={it.id}
            onClick={it.onClick}
            className="glass-panel clickable-row"
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
              textAlign: "left", width: "100%", cursor: "pointer",
              border: "1px solid var(--border)", borderLeft: `3px solid ${color}`,
            }}
          >
            {it.badge && (
              <span className="status-pill" style={{ color, borderColor: color, flexShrink: 0 }}>
                {it.badge}
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.title}
              </div>
              {it.subtitle && (
                <div style={{ fontSize: 12.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.subtitle}
                </div>
              )}
            </div>
            {it.cta && (
              <span className="flex items-center gap-1" style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                {it.cta} <ChevronRight size={15} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
