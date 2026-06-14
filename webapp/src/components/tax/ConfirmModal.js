"use client";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "@/components/Modal";

// Branded replacement for window.confirm(). Renders a small modal with a
// message and confirm/cancel buttons. `onConfirm` may be async; the confirm
// button shows a pending state and the modal stays open until it resolves so
// errors can surface. `danger` (default true) styles the confirm button red.
export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "ยืนยันการทำรายการ",
  message,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  danger = true,
}) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title} size="sm">
      <div className="p-4 flex gap-3">
        <span className={`shrink-0 inline-flex items-center justify-center rounded-full ${danger ? "text-[var(--red)] bg-[var(--red-soft)]" : "text-[var(--accent)] bg-[var(--accent-soft)]"}`} style={{ width: 38, height: 38 }}>
          <AlertTriangle size={18} />
        </span>
        <p className="text-sm text-[var(--text-2)] leading-relaxed pt-1">{message}</p>
      </div>
      <div className="flex justify-end gap-2 px-4 pb-4 pt-2 border-t border-[var(--border)]">
        <button type="button" onClick={onClose} className="btn" disabled={busy}>{cancelLabel}</button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className={`btn px-6 ${danger ? "text-[var(--red)] border border-[var(--red)]" : "btn-primary"}`}
        >
          {busy ? "กำลังทำรายการ..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
