"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";

// Generic "send back for correction" dialog (registrations + orders). Collects a
// required reason and calls async `onConfirm(reason)`; surfaces errors inline.
export default function RejectDialog({ open, onClose, onConfirm, title = "ตีกลับให้แก้ไข", entityLabel = "รายการนี้" }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { if (open) { setReason(""); setError(null); } }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setError("กรุณาระบุเหตุผล"); return; }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(err?.message || "ไม่สามารถทำรายการได้");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={title} size="sm">
      <form onSubmit={submit}>
        <div className="drawer-section flex flex-col gap-2">
          <label style={{ fontSize: 13, color: "var(--text-2)" }}>
            เหตุผลที่ตีกลับ {entityLabel} <span style={{ color: "var(--red)" }}>*</span>
          </label>
          <textarea
            value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
            className="premium-input w-full" placeholder="ระบุสิ่งที่ต้องแก้ไข..."
            style={{ resize: "vertical" }}
          />
          {error && <div style={{ fontSize: 13, color: "var(--red)" }}>{error}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
          <button type="button" onClick={onClose} className="btn" disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-danger px-6" disabled={busy}>
            {busy ? "กำลังส่ง..." : "ยืนยันตีกลับ"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
