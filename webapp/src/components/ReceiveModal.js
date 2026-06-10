"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { fmtMoney } from "@/lib/format";

// Sales "เงินเข้าแล้ว" modal — replaces the old window.prompt. Records the S&S
// invoice/receipt number and moves the order to 'received' (ready for LG to
// file tax). Exempt orders (totalTax = 0) confirm without a receipt number.
export default function ReceiveModal({ open, onClose, onConfirmed, order }) {
  const isExempt = (order?.totalTax || 0) === 0;
  const [receiptNumber, setReceiptNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setReceiptNumber("");
      setError(null);
    }
  }, [open, order?.id]);

  if (!order) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!isExempt && !receiptNumber.trim()) {
      setError("กรุณากรอกเลขที่ Invoice/Receipt ของ S&S");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = { status: "received" };
    if (!isExempt) body.receiptNumber = receiptNumber.trim();
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onConfirmed?.();
        onClose();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "ไม่สามารถทำรายการได้");
      }
    } catch {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setSubmitting(false);
  };

  return (
    <Modal open={open} onClose={() => !submitting && onClose()} title={`ยืนยันรับเงิน — ${order.quotationRef || order.id}`} size="md">
      <form onSubmit={submit} className="p-4 space-y-4">
        <div className="flex justify-between items-center text-sm bg-[var(--panel-2)] rounded-lg p-3">
          <span className="text-[var(--text-3)]">ยอดภาษีรวม</span>
          <span className="font-mono font-bold text-[var(--red)]">{isExempt ? "ยกเว้นภาษี" : fmtMoney(order.totalTax)}</span>
        </div>

        {isExempt ? (
          <p className="text-xs text-[var(--text-3)]">ออเดอร์นี้ได้รับยกเว้นภาษี — ยืนยันว่ารับเงินจากลูกค้าแล้ว เพื่อส่งต่อให้ฝ่ายกฎหมาย</p>
        ) : (
          <div className="form-group">
            <label>เลขที่ Invoice / Receipt (S&amp;S) <span className="text-[var(--red)]">*</span></label>
            <input
              type="text"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
              required
              placeholder="เลขที่ใบกำกับภาษี/ใบเสร็จของ S&S"
              className="premium-input w-full font-mono"
            />
          </div>
        )}

        {error && <div className="text-xs text-[var(--red)] bg-[var(--red-soft)] rounded p-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <button type="button" onClick={onClose} className="btn" disabled={submitting}>ยกเลิก</button>
          <button type="submit" disabled={submitting} className="btn btn-primary px-6 disabled:opacity-50">
            {submitting ? "กำลังบันทึก..." : "ยืนยันรับเงินแล้ว"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
