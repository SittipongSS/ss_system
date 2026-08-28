"use client";
// Approval-status badge for master data (customers & products) — migration 0027.
// Legacy/NULL status is treated as 'approved' (rows created before the workflow).
import { ActionButton } from "@/components/ui/ActionButtons";
import { approvalStatusOf } from "@/lib/master/approvalStatus";

export const APPROVAL_META = {
  pending: { label: "รออนุมัติ", cls: "status-pill warning" },
  approved: { label: "อนุมัติแล้ว", cls: "status-pill success" },
  rejected: { label: "ไม่อนุมัติ", cls: "status-pill danger" },
};

// นิยามอยู่ที่ lib/master/approvalStatus (ฝั่ง server ต้องใช้ตัวเดียวกัน) —
// re-export ไว้ที่นี่เพื่อไม่ให้จอที่ import จากไฟล์นี้อยู่แล้วต้องแก้ตาม
export { approvalStatusOf };

export function ApprovalBadge({ status }) {
  const meta = APPROVAL_META[status || "approved"] || APPROVAL_META.approved;
  return <span className={meta.cls}>{meta.label}</span>;
}

// Approve / reject buttons for a pending row. Shown only to approvers (AE Supervisor).
// onDecide(status) is called with 'approved' | 'rejected'.
export function ApprovalActions({ onDecide }) {
  return (
    <div className="action-bar" onClick={(e) => e.stopPropagation()}>
      <ActionButton kind="approve" type="button" onClick={() => onDecide("approved")} />
      <ActionButton kind="reject" type="button" label="ไม่อนุมัติ" onClick={() => onDecide("rejected")} />
    </div>
  );
}
