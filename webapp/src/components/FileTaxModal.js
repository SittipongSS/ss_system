"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { fmtMoney } from "@/lib/format";

// LG tax-payment modal — replaces the old window.prompt('URL or "uploaded"')
// flow with structured excise data + a real file upload. Marks the order
// 'complete'. Exempt orders (totalTax = 0) can complete without a receipt.
export default function FileTaxModal({ open, onClose, onFiled, order }) {
  const isExempt = (order?.totalTax || 0) === 0;
  const [receiptNumber, setReceiptNumber] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [formRef, setFormRef] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setReceiptNumber("");
      setPaidAmount(order?.totalTax ? String(order.totalTax) : "");
      setFormRef("");
      setFile(null);
      setError(null);
    }
  }, [open, order?.id, order?.totalTax]);

  if (!order) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!isExempt && !receiptNumber.trim()) {
      setError("กรุณาระบุเลขที่ใบเสร็จสรรพสามิต");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let exciseReceiptFileUrl;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("customerName", "excise_receipts");
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        if (!up.ok) {
          const d = await up.json().catch(() => ({}));
          setError(d.error || "อัปโหลดไฟล์ไม่สำเร็จ");
          setSubmitting(false);
          return;
        }
        exciseReceiptFileUrl = (await up.json()).url;
      }

      const body = { status: "complete" };
      if (!isExempt) {
        body.exciseReceiptNumber = receiptNumber.trim();
        body.exciseTaxPaidAmount = paidAmount ? Number(paidAmount) : order.totalTax;
        if (formRef.trim()) body.taxFormRef = formRef.trim();
        if (exciseReceiptFileUrl) body.exciseReceiptFileUrl = exciseReceiptFileUrl;
      }

      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onFiled?.();
        onClose();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "ไม่สามารถบันทึกได้");
      }
    } catch {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setSubmitting(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title={`บันทึกการชำระภาษี — ${order.quotationRef || order.id}`}
      size="md"
    >
      <form onSubmit={submit} className="p-4 space-y-4">
        <div className="flex justify-between items-center text-sm bg-[var(--panel-2)] rounded-lg p-3">
          <span className="text-[var(--text-3)]">ยอดภาษีที่ต้องชำระ</span>
          <span className="font-mono font-bold text-[var(--red)]">
            {isExempt ? "ยกเว้นภาษี" : fmtMoney(order.totalTax)}
          </span>
        </div>

        {isExempt ? (
          <p className="text-xs text-[var(--text-3)]">
            ออเดอร์นี้ได้รับยกเว้นภาษี — ยืนยันเพื่อปิดงานเป็น "ชำระแล้ว"
          </p>
        ) : (
          <>
            <div className="form-group">
              <label>เลขที่ใบเสร็จสรรพสามิต <span className="text-[var(--red)]">*</span></label>
              <input
                type="text"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                required
                placeholder="เลขที่ใบเสร็จจากกรมสรรพสามิต"
                className="premium-input w-full font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <label>ยอดชำระจริง (บาท)</label>
                <input
                  type="number"
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="premium-input w-full font-mono"
                />
              </div>
              <div className="form-group">
                <label>เลขที่แบบ ภส. <span className="text-[var(--text-3)] text-xs">(ไม่บังคับ)</span></label>
                <input
                  type="text"
                  value={formRef}
                  onChange={(e) => setFormRef(e.target.value)}
                  placeholder="เช่น ภส.03-07"
                  className="premium-input w-full font-mono"
                />
              </div>
            </div>
            <div className="form-group">
              <label>แนบไฟล์ใบเสร็จ/แบบ ภส. <span className="text-[var(--text-3)] text-xs">(ไม่บังคับ)</span></label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="premium-input w-full text-xs"
              />
            </div>
          </>
        )}

        {error && <div className="text-xs text-[var(--red)] bg-[var(--red-soft)] rounded p-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <button type="button" onClick={onClose} className="btn" disabled={submitting}>ยกเลิก</button>
          <button type="submit" disabled={submitting} className="btn btn-primary px-6 disabled:opacity-50">
            {submitting ? "กำลังบันทึก..." : isExempt ? "ยืนยันชำระแล้ว" : "บันทึกการชำระภาษี"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
