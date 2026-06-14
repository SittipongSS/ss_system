"use client";
// Approval-status badge for master data (customers & products) — migration 0027.
// Legacy/NULL status is treated as 'approved' (rows created before the workflow).
import { Check, X } from "lucide-react";

export const APPROVAL_META = {
  pending: { label: "รออนุมัติ", cls: "status-pill warning" },
  approved: { label: "อนุมัติแล้ว", cls: "status-pill success" },
  rejected: { label: "ไม่อนุมัติ", cls: "status-pill danger" },
};

export function approvalStatusOf(record) {
  return record?.approvalStatus || "approved";
}

export function ApprovalBadge({ status }) {
  const meta = APPROVAL_META[status || "approved"] || APPROVAL_META.approved;
  return <span className={meta.cls}>{meta.label}</span>;
}

// Approve / reject buttons for a pending row. Shown only to approvers (Senior AE+).
// onDecide(status) is called with 'approved' | 'rejected'.
export function ApprovalActions({ onDecide }) {
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => onDecide("approved")}
        className="btn btn-success px-3 flex items-center gap-1"
      >
        <Check size={14} /> อนุมัติ
      </button>
      <button
        type="button"
        onClick={() => onDecide("rejected")}
        className="btn px-3 text-[var(--red)] flex items-center gap-1"
      >
        <X size={14} /> ไม่อนุมัติ
      </button>
    </div>
  );
}
