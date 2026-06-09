"use client";
import { useState } from "react";
import Modal from "@/components/Modal";

// Generic "send back for correction" modal. Collects a required reason and
// hands it to onConfirm(reason). Used for both products and orders.
export default function RejectModal({ open, onClose, onConfirm, title = "ตีกลับให้แก้ไข", entityLabel = "รายการนี้" }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    if (submitting) return;
    setReason("");
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
      setReason("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={title} size="md">
      <form onSubmit={submit} className="p-4 space-y-4">
        <p className="text-xs text-[var(--text-3)]">
          ระบุเหตุผลที่ตีกลับ {entityLabel} — ฝ่ายขายจะเห็นเหตุผลนี้เพื่อนำไปแก้ไข
        </p>
        <div className="form-group">
          <label>เหตุผล <span className="text-[var(--red)]">*</span></label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            rows={4}
            placeholder="เช่น ข้อมูลพิกัดภาษีไม่ถูกต้อง / เอกสารแนบไม่ครบ"
            className="premium-input w-full"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <button type="button" onClick={close} className="btn" disabled={submitting}>ยกเลิก</button>
          <button
            type="submit"
            disabled={submitting || !reason.trim()}
            className="btn bg-[var(--red)] text-white px-6 disabled:opacity-50"
          >
            {submitting ? "กำลังบันทึก..." : "ยืนยันตีกลับ"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
