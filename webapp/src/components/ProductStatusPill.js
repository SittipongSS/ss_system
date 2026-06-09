"use client";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

// Single source of truth for the product-registration status badge:
// same wording, icon, and colour everywhere it appears.
export default function ProductStatusPill({ status }) {
  if (status === "approved") {
    return (
      <span className="status-pill success inline-flex items-center gap-1 w-fit">
        <CheckCircle2 size={13} /> อนุมัติแล้ว
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="status-pill danger inline-flex items-center gap-1 w-fit">
        <XCircle size={13} /> ตีกลับให้แก้ไข
      </span>
    );
  }
  return (
    <span className="status-pill warn inline-flex items-center gap-1 w-fit">
      <Clock size={13} /> รออนุมัติ
    </span>
  );
}
