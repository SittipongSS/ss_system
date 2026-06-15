"use client";
import { Clock } from "lucide-react";
import { ApprovalActions } from "@/components/ApprovalStatus";

// "ต้องทำตอนนี้" queue for master data: lists the pending records the current
// user is allowed to approve, with inline approve/reject. Mirrors the tax
// ActionQueue but uses the master-data approval verbs. Renders nothing when the
// queue is empty (no clutter for non-approvers / cleared queues).
//
// Props:
//   items     — pending records the user can approve
//   onDecide  — (id, "approved"|"rejected") => void
//   primary   — (rec) => string   main line (e.g. arCode / fgCode)
//   secondary — (rec) => string   sub line (name · team)
//   onOpen    — optional (rec) => void  row click (open detail)
export default function ApprovalQueue({ items, onDecide, primary, secondary, onOpen }) {
  if (!items.length) return null;
  return (
    <section
      className="rounded-xl p-4"
      style={{ background: "var(--panel)", border: "2px solid var(--amber)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Clock size={16} className="text-[var(--amber)]" />
        <span className="text-[13px] font-semibold text-[var(--amber)]">
          ต้องทำตอนนี้ — รออนุมัติจากคุณ ({items.length})
        </span>
      </div>
      <div className="flex flex-col">
        {items.map((rec) => (
          <div
            key={rec.id}
            onClick={onOpen ? () => onOpen(rec) : undefined}
            className={`flex items-center gap-3 flex-wrap py-2.5 border-t border-[var(--border)] ${onOpen ? "clickable-row cursor-pointer" : ""}`}
          >
            <div className="flex-1 min-w-[180px]">
              <span className="font-mono text-[12px] text-[var(--accent)]">{primary(rec)}</span>{" "}
              <span className="text-[13px] text-[var(--text)]">{secondary(rec)}</span>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <ApprovalActions onDecide={(status) => onDecide(rec.id, status)} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
