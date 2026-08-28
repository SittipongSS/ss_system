"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Textarea from "@/components/ui/Textarea";

// Generic "send back for correction" dialog (registrations + orders). Collects a
// required reason and calls async `onConfirm(reason)`; surfaces errors inline.
// โมดัล "กรอกเหตุผลแล้วยืนยัน" ตัวเดียวของโมดูลภาษี — ต่างกันได้แค่ข้อความผ่าน props
// (กฎ AGENTS.md: โหมดผ่าน props ไม่ใช่คนละไฟล์) ใช้ทั้งตอนตีกลับการขึ้นทะเบียน
// และตอนฝ่าย RA ปลดอนุมัติทะเบียนที่อนุมัติแล้ว (มติ B2 2026-07-27)
export default function RejectDialog({
  open,
  onClose,
  onConfirm,
  title = "ตีกลับให้แก้ไข",
  entityLabel = "รายการนี้",
  reasonLabel,
  confirmLabel = "ยืนยันตีกลับ",
  busyLabel = "กำลังส่ง...",
  placeholder = "ระบุสิ่งที่ต้องแก้ไข...",
}) {
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
          <label style={{ fontSize: "var(--fs-7)", color: "var(--text-2)" }}>
            {reasonLabel || `เหตุผลที่ตีกลับ ${entityLabel}`} <span style={{ color: "var(--red)" }}>*</span>
          </label>
          <Textarea
            value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus className="w-full" placeholder={placeholder}
            style={{ resize: "vertical" }}
          />
          {error && <div style={{ fontSize: "var(--fs-7)", color: "var(--red)" }}>{error}</div>}
        </div>
        <div className="form-action-bar">
          <button type="button" onClick={onClose} className="btn" disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-danger" disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
