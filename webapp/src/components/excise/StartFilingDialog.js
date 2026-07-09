"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";

// LG "เริ่มยื่น" (received → filing). Forces the เลขที่ใบกำกับภาษี (tax invoice no.)
// — 1 ใบกำกับ ต่อ 1 ใบเสนอราคา — which is shown in the filing report. The server
// also enforces this on the received → filing transition.
export default function StartFilingDialog({ open, onClose, onDone, order }) {
  const [taxInvoiceNumber, setTaxInvoiceNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setTaxInvoiceNumber(order?.taxInvoiceNumber || "");
      setError(null);
    }
  }, [open, order?.id]);

  if (!order) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!taxInvoiceNumber.trim()) { setError("กรุณาระบุเลขที่ใบกำกับภาษี"); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "filing", taxInvoiceNumber: taxInvoiceNumber.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถเริ่มยื่นได้");
      onDone?.();
      onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={`เริ่มยื่นภาษี — ${order.quotationRef || order.id}`} size="sm">
      <form onSubmit={submit}>
        <div className="drawer-section flex flex-col gap-3">
          <p style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            กรอกเลขที่ใบกำกับภาษีของรายการนี้เพื่อเริ่มดำเนินการยื่นต่อกรมสรรพสามิต
            (1 ใบกำกับ ต่อ 1 ใบเสนอราคา)
          </p>
          <div className="form-group">
            <label>เลขที่ใบกำกับภาษี <span style={{ color: "var(--red)" }}>*</span></label>
            <input className="premium-input w-full font-mono" value={taxInvoiceNumber} required
              onChange={(e) => setTaxInvoiceNumber(e.target.value)} placeholder="เช่น INV-2026-001" />
          </div>
          {error && <div style={{ fontSize: 13, color: "var(--red)" }} className="bg-[var(--red-soft)] rounded p-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
          <button type="button" onClick={onClose} className="btn" disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary px-6" disabled={busy}>{busy ? "กำลังบันทึก..." : "เริ่มยื่น"}</button>
        </div>
      </form>
    </Modal>
  );
}
