"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Textarea from "@/components/ui/Textarea";
import StatusNotice from "@/components/ui/StatusNotice";
import { apiFetch } from "@/lib/apiFetch";
import { FILING_SKIP_REASON_MAX, FILING_SKIP_REASON_MIN, filingStartGateError } from "@/lib/excise/raFilingRules";

/* RA "เริ่มยื่น" (ร่าง/ตีกลับ → กำลังยื่น) — แผนรื้อสรรพสามิต PR5 (Q15)
   ด่านสองข้อ ข้ามได้ด้วยเหตุผล: บัญชีปิดใบสั่งขายค่าสรรพสามิตแล้ว · ทะเบียนอนุมัติครบทุกรายการ
   ⚠️ `gates` มาจาก server (GET /api/orders/[id] `source.gates`) และ PATCH ตัดสินซ้ำด้วย `filingStartGateError` ตัวเดียวกัน
   เลขที่ใบกำกับภาษีไม่บังคับแล้ว — ใบกำกับของค่าภาษีออกโดยบัญชีบนใบสั่งขายค่าสรรพสามิต (ใส่ไว้อ้างอิงในรายงานได้) */
export default function StartFilingDialog({ open, onClose, onDone, order, gates = null }) {
  const [taxInvoiceNumber, setTaxInvoiceNumber] = useState("");
  const [skipMoneyReason, setSkipMoneyReason] = useState("");
  const [skipRegistrationReason, setSkipRegistrationReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setTaxInvoiceNumber(order?.taxInvoiceNumber || "");
      setSkipMoneyReason("");
      setSkipRegistrationReason("");
      setError(null);
    }
  }, [open, order?.id, order?.taxInvoiceNumber]);

  if (!order) return null;
  const moneyBlocked = gates ? !gates.money?.ok : false;
  const registrationBlocked = gates ? !gates.registration?.ok : false;

  const submit = async (e) => {
    e.preventDefault();
    const gateError = gates ? filingStartGateError(gates, { skipMoneyReason, skipRegistrationReason }) : null;
    if (gateError) { setError(gateError); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/orders/${order.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "filing",
          ...(taxInvoiceNumber.trim() ? { taxInvoiceNumber: taxInvoiceNumber.trim() } : {}),
          ...(moneyBlocked ? { skipMoneyReason: skipMoneyReason.trim() } : {}),
          ...(registrationBlocked ? { skipRegistrationReason: skipRegistrationReason.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถเริ่มยื่นได้");
      onDone?.();
      onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const reasonHint = `อย่างน้อย ${FILING_SKIP_REASON_MIN} ตัวอักษร — เก็บไว้บนใบยื่น`;
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={`${order.status === "rejected" ? "ยื่นใหม่" : "เริ่มยื่นภาษี"} — ${order.quotationRef || order.id}`} size="sm">
      <form onSubmit={submit}>
        <div className="drawer-section flex flex-col gap-3">
          {!gates && <StatusNotice tone="info">กำลังตรวจเงินค่าภาษีและทะเบียนของใบนี้…</StatusNotice>}
          {gates && !moneyBlocked && !registrationBlocked && (
            <StatusNotice tone="success">{gates.money.label} · {gates.registration.label}</StatusNotice>
          )}
          {moneyBlocked && (
            <div className="form-group">
              <StatusNotice tone="warning">{gates.money.label}</StatusNotice>
              <label>เหตุผลที่เริ่มยื่นก่อนบัญชีปิดใบ <span className="required-mark">*</span></label>
              <Textarea rows={3} value={skipMoneyReason} maxLength={FILING_SKIP_REASON_MAX}
                onChange={(e) => setSkipMoneyReason(e.target.value)} placeholder={reasonHint} />
            </div>
          )}
          {registrationBlocked && (
            <div className="form-group">
              <StatusNotice tone="warning">{gates.registration.label}</StatusNotice>
              <label>เหตุผลที่ยื่นโดยยังไม่มีทะเบียน <span className="required-mark">*</span></label>
              <Textarea rows={3} value={skipRegistrationReason} maxLength={FILING_SKIP_REASON_MAX}
                onChange={(e) => setSkipRegistrationReason(e.target.value)} placeholder={reasonHint} />
            </div>
          )}
          <div className="form-group">
            <label>เลขที่ใบกำกับภาษี (ถ้ามี)</label>
            <input className="premium-input w-full font-mono" value={taxInvoiceNumber}
              onChange={(e) => setTaxInvoiceNumber(e.target.value)} placeholder="เช่น INV-2026-001" />
          </div>
          {error && <StatusNotice tone="error">{error}</StatusNotice>}
        </div>
        <div className="form-action-bar">
          <button type="button" onClick={onClose} className="btn" disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !gates}>{busy ? "กำลังบันทึก..." : "เริ่มยื่น"}</button>
        </div>
      </form>
    </Modal>
  );
}
