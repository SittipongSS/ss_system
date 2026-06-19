"use client";
import { useState } from "react";
import Modal from "@/components/Modal";

// Branded confirm/alert dialog — replaces window.confirm / alert across the
// excise UI. Supports an async `onConfirm` (shows a busy state, surfaces a
// thrown error inline instead of an alert()).
//
//   open / onClose
//   title, message
//   confirmLabel  (default "ยืนยัน"), cancelLabel (default "ยกเลิก")
//   danger        — red confirm button
//   onConfirm     — async () => void; dialog closes on success
//   hideCancel    — alert-style (single OK button)
export default function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  danger = false,
  onConfirm,
  hideCancel = false,
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const run = async () => {
    if (!onConfirm) return onClose?.();
    setBusy(true);
    setErr(null);
    try {
      await onConfirm();
      onClose?.();
    } catch (e) {
      setErr(e?.message || "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title} size="sm">
      <div className="drawer-section" style={{ fontSize: 14, color: "var(--text-2)" }}>
        {message}
        {err && (
          <p style={{ color: "var(--red)", marginTop: 10, fontSize: 13 }}>{err}</p>
        )}
      </div>
      <div className="drawer-section flex justify-end gap-2">
        {!hideCancel && (
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
        )}
        <button
          className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
          onClick={run}
          disabled={busy}
        >
          {busy ? "กำลังดำเนินการ..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
