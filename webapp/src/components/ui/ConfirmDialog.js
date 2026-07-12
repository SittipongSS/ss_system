"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";

export default function ConfirmDialog({
  open,
  title = "ยืนยันการดำเนินการ",
  description,
  detail,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  tone = "default",
  busy = false,
  onConfirm,
  onClose,
}) {
  const destructive = tone === "danger";
  const Icon = destructive ? Trash2 : AlertTriangle;
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" dismissible={!busy}>
      <div className="confirm-dialog">
        <div className={`confirm-dialog-icon${destructive ? " danger" : ""}`} aria-hidden="true">
          <Icon size={20} />
        </div>
        <div className="confirm-dialog-copy">
          {description && <p>{description}</p>}
          {detail && <p className="confirm-dialog-detail">{detail}</p>}
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button
            type="button"
            className={destructive ? "btn btn-danger" : "btn btn-primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "กำลังดำเนินการ…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
