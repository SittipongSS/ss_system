"use client";

import { AlertCircle, CheckCircle2, LoaderCircle, Pencil } from "lucide-react";

const CONFIG = {
  dirty: { label: "มีการแก้ไขที่ยังไม่บันทึก", Icon: Pencil },
  saving: { label: "กำลังบันทึก…", Icon: LoaderCircle },
  saved: { label: "บันทึกแล้ว", Icon: CheckCircle2 },
  error: { label: "บันทึกไม่สำเร็จ", Icon: AlertCircle },
};

export default function SaveStatus({ status = "idle", message }) {
  const config = CONFIG[status];
  if (!config) return null;
  const { Icon } = config;
  return (
    <span className={`save-status save-status-${status}`} role="status" aria-live="polite">
      <Icon size={14} aria-hidden="true" className={status === "saving" ? "save-status-spin" : undefined} />
      {message || config.label}
    </span>
  );
}
