"use client";

// Single source of truth for the PO / order payment-status badge across the
// app (sales, tracking, customer detail, order modal). Covers the full
// lifecycle: pending → received → filing → complete, plus rejected.
const MAP = {
  pending: { cls: "danger", label: "รอรับเงิน" },
  received: { cls: "warn", label: "รอชำระภาษี" },
  filing: { cls: "warn", label: "กำลังยื่นภาษี" },
  complete: { cls: "success", label: "ชำระแล้ว" },
  rejected: { cls: "danger", label: "ตีกลับให้แก้ไข" },
};

export default function OrderStatusPill({ status }) {
  const { cls, label } = MAP[status] || MAP.pending;
  return <span className={`status-pill ${cls}`}>{label}</span>;
}
