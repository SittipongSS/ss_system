"use client";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import StatusBadge from "./StatusBadge";
import EmptyState from "@/components/ui/EmptyState";

// "งานของฉันตอนนี้" — the unified action queue on the dashboard. Each item:
//   { id, status, title, subtitle, cta, onClick }
// onClick deep-links into the relevant list/drawer.
export default function WorkQueue({ items = [] }) {
  if (!items.length) {
    return (
      <EmptyState icon={CheckCircle2}>ไม่มีงานค้างที่ต้องทำตอนนี้ 🎉</EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={it.onClick}
          className="glass-panel clickable-row"
          style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
            textAlign: "left", width: "100%", cursor: "pointer", border: "1px solid var(--border)",
          }}
        >
          <StatusBadge status={it.status} />
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
          <span className="flex items-center gap-1" style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
            {it.cta} <ChevronRight size={15} />
          </span>
        </button>
      ))}
    </div>
  );
}
