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
            <div style={{ fontSize: "var(--fs-8)", fontWeight: "var(--fw-semibold)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {it.title}
            </div>
            {it.subtitle && (
              <div style={{ fontSize: "var(--fs-6)", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.subtitle}
              </div>
            )}
          </div>
          {/* ⭐ อายุงาน — ของเดิมไม่มี ⇒ ใบที่ค้าง 34 วันหน้าตาเหมือนใบที่เพิ่งเข้ามาเมื่อวาน
              (ตรวจระบบ 2026-08-28 เจอ 9 ใบค้าง 28–34 วันโดยไม่มีอะไรฟ้อง) */}
          {it.age && (
            <span
              style={{
                color: it.age.color || "var(--text-3)", fontSize: "var(--fs-6)",
                fontWeight: it.age.color ? "var(--fw-semibold)" : undefined, flexShrink: 0,
                whiteSpace: "nowrap",
              }}
              title="ค้างอยู่ในสถานะนี้มานานเท่าไร"
            >
              {it.age.label}
            </span>
          )}
          <span className="flex items-center gap-1" style={{ color: "var(--accent)", fontSize: "var(--fs-7)", fontWeight: "var(--fw-semibold)", flexShrink: 0 }}>
            {it.cta} <ChevronRight size={15} />
          </span>
        </button>
      ))}
    </div>
  );
}
