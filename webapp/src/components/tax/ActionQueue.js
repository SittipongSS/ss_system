"use client";
import { statusMeta } from "@/lib/tax/status";
import StagePill from "./StagePill";

const TONE_COLOR = {
  success: "var(--green)",
  warn: "var(--amber)",
  danger: "var(--red)",
};

// One actionable item in a role's "ต้องทำตอนนี้" queue. A flat row with a
// status-toned left accent, a status pill, a title + subtitle, and one or more
// action buttons on the right. Card-first: stacks its action below on narrow
// screens (CSS via flex-wrap).
//
// Props:
//   status   — tax status key (drives pill + accent colour)
//   title    — primary line (e.g. "FG-… · ชื่อสินค้า")
//   subtitle — secondary line (customer, reason, amount…)
//   onClick  — optional row click (open detail)
//   actions  — ReactNode (buttons); rendered on the right
export function ActionRow({ status, title, subtitle, onClick, actions }) {
  const { tone } = statusMeta(status);
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 flex-wrap bg-[var(--panel)] border border-[var(--border)] px-3.5 py-3 ${onClick ? "clickable-row cursor-pointer" : ""}`}
      style={{ borderLeft: `3px solid ${TONE_COLOR[tone] || "var(--border)"}` }}
    >
      <StagePill status={status} />
      <div className="flex-1 min-w-[180px]">
        <div className="text-[14px] font-semibold text-[var(--text)]">{title}</div>
        {subtitle && <div className="text-[12px] text-[var(--text-2)] mt-0.5">{subtitle}</div>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}

// Wrapper for a role's action queue: heading, live count chip, and an empty
// state. Children are <ActionRow>s.
export default function ActionQueue({ title = "ต้องทำตอนนี้", count, empty = "ไม่มีงานค้าง — เคลียร์หมดแล้ว 🎉", children }) {
  const n = count ?? (Array.isArray(children) ? children.filter(Boolean).length : children ? 1 : 0);
  return (
    <section>
      <div className="flex items-center gap-2 mb-2.5">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">{title}</h2>
        {n > 0 && (
          <span className="text-[12px] font-semibold px-2.5 py-0.5 rounded-full bg-[var(--red-soft)] text-[var(--red)]">
            {n} งาน
          </span>
        )}
      </div>
      {n === 0 ? (
        <div className="glass-panel p-8 text-center text-[13px] text-[var(--text-3)]">{empty}</div>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </section>
  );
}
