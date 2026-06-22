"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { fmtMoney } from "@/lib/format";
import { UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";

// LG records the excise payment and marks the order 'complete': receipt number,
// actual paid amount, actual payment date (taxPaidDate, additive), ภส. form ref,
// + optional receipt file. Exempt orders complete without a receipt.
export default function FileTaxDialog({ open, onClose, onDone, order }) {
  const isExempt = (order?.totalTax || 0) === 0;
  const [receiptNumber, setReceiptNumber] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [formRef, setFormRef] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setReceiptNumber("");
      setPaidAmount(order?.totalTax ? String(order.totalTax) : "");
      setPaidDate(new Date().toISOString().slice(0, 10));
      setFormRef("");
      setFile(null);
      setError(null);
    }
  }, [open, order?.id, order?.totalTax]);

  if (!order) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!isExempt && !receiptNumber.trim()) { setError("กรุณาระบุเลขที่ใบเสร็จสรรพสามิต"); return; }
    setBusy(true);
    setError(null);
    try {
      // 1) อัปไฟล์ใบเสร็จก่อน (ถ้ามี) — server บังคับ login/ขนาด/ชนิดไฟล์.
      //    ทำก่อน PATCH เพื่อให้ไฟล์ใหญ่/ผิดชนิดล้มก่อนปิดงาน (UX ดีกว่า).
      let receiptUrl = null;
      if (file && !isExempt) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("customerName", `order-${order.id}`);
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        if (!up.ok) throw new Error((await up.json().catch(() => ({})))?.error || "อัปโหลดไฟล์ไม่สำเร็จ");
        receiptUrl = (await up.json()).url;
      }
      // 2) บันทึกข้อมูลชำระภาษี + ปิดงาน (ไฟล์ไม่เก็บเป็นคอลัมน์อีกต่อไป).
      const body = { status: "complete" };
      if (!isExempt) {
        body.exciseReceiptNumber = receiptNumber.trim();
        body.exciseTaxPaidAmount = paidAmount ? Number(paidAmount) : order.totalTax;
        if (paidDate) body.taxPaidDate = paidDate;
        if (formRef.trim()) body.taxFormRef = formRef.trim();
      }
      const res = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถบันทึกได้");
      // 3) แนบไฟล์ใบเสร็จเข้าตาราง attachments (order/tax_receipt) — โผล่รวมใน
      //    AttachmentsPanel. best-effort: ปิดงานสำเร็จแล้ว ถ้าแนบพลาดแนบเองได้.
      if (receiptUrl) {
        try {
          await fetch("/api/master/attachments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entityType: "order",
              entityId: order.id,
              docType: "tax_receipt",
              fileUrl: receiptUrl,
              fileName: file.name,
              mimeType: file.type || null,
              sizeBytes: file.size,
              metadata: {
                referenceNo: receiptNumber.trim() || undefined,
                paidDate: paidDate || undefined,
                amount: paidAmount ? Number(paidAmount) : (order.totalTax || undefined),
              },
            }),
          });
        } catch (attErr) {
          console.error("attach receipt failed:", attErr);
        }
      }
      onDone?.();
      onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={`บันทึกการชำระภาษี — ${order.quotationRef || order.id}`} size="md">
      <form onSubmit={submit}>
        <div className="drawer-section flex flex-col gap-4">
          <div className="flex justify-between items-center" style={{ fontSize: 13, background: "var(--panel-3)", borderRadius: 8, padding: "10px 12px" }}>
            <span style={{ color: "var(--text-3)" }}>ยอดภาษีที่ต้องชำระ</span>
            <span className="font-mono font-bold" style={{ color: "var(--red)" }}>{isExempt ? "ยกเว้นภาษี" : fmtMoney(order.totalTax)}</span>
          </div>

          {isExempt ? (
            <p style={{ fontSize: 12.5, color: "var(--text-3)" }}>ออเดอร์นี้ได้รับยกเว้นภาษี — ยืนยันเพื่อปิดงานเป็น "ชำระแล้ว"</p>
          ) : (
            <>
              <div className="form-group">
                <label>เลขที่ใบเสร็จสรรพสามิต <span style={{ color: "var(--red)" }}>*</span></label>
                <input className="premium-input w-full font-mono" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} required placeholder="เลขที่ใบเสร็จจากกรมสรรพสามิต" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label>ยอดชำระจริง (บาท)</label>
                  <input type="number" step="0.01" className="premium-input w-full font-mono" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>วันที่ชำระจริง</label>
                  <input type="date" className="premium-input w-full" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>เลขที่แบบ ภส.</label>
                  <input className="premium-input w-full font-mono" value={formRef} onChange={(e) => setFormRef(e.target.value)} placeholder="เช่น ภส.03-07" />
                </div>
                <div className="form-group">
                  <label>แนบไฟล์ใบเสร็จ/แบบ ภส.</label>
                  <input type="file" accept={UPLOAD_ACCEPT_ATTR} className="premium-input w-full" style={{ fontSize: 12 }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </div>
              </div>
            </>
          )}

          {error && <div style={{ fontSize: 13, color: "var(--red)" }} className="bg-[var(--red-soft)] rounded p-2">{error}</div>}
        </div>
        <div className="drawer-section flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary px-6" disabled={busy}>{busy ? "กำลังบันทึก..." : isExempt ? "ยืนยันชำระแล้ว" : "บันทึกการชำระภาษี"}</button>
        </div>
      </form>
    </Modal>
  );
}
