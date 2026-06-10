"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { fmtMoney } from "@/lib/format";

// LG approval modal for an excise registration. Collects the approval number
// and lets LG override the auto taxability decision (they are the legal
// authority on it). onApproved() is called after a successful PATCH.
export default function ApproveProductModal({ open, onClose, onApproved, registration }) {
  const [approvalNumber, setApprovalNumber] = useState("");
  // taxable: "auto" | "taxable" | "exempt"
  const [taxable, setTaxable] = useState("auto");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setApprovalNumber("");
      setTaxable("auto");
      setError(null);
    }
  }, [open, registration?.id]);

  if (!registration) return null;

  const autoTaxable = !!(registration.fgCode && registration.fgCode.includes("01-002"));
  const taxPerUnit = (registration.exciseTax || 0) + (registration.localTax || 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!approvalNumber.trim()) return;
    setSubmitting(true);
    setError(null);
    const body = { status: "approved", approvalNumber: approvalNumber.trim() };
    if (taxable !== "auto") body.taxableOverride = taxable === "taxable";
    try {
      const res = await fetch(`/api/excise-registrations/${registration.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onApproved?.();
        onClose();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "ไม่สามารถอนุมัติได้");
      }
    } catch {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setSubmitting(false);
  };

  return (
    <Modal open={open} onClose={() => !submitting && onClose()} title={`อนุมัติขึ้นทะเบียนสินค้า — ${registration.fgCode}`} size="md">
      <form onSubmit={submit} className="p-4 space-y-4">
        <div className="text-xs bg-[var(--panel-2)] rounded-lg p-3 space-y-1">
          <div className="text-[var(--text-2)]">{registration.productName} ({registration.brandName})</div>
          <div className="text-[var(--text-3)]">ลูกค้า: {registration.customerName || "-"}</div>
          <div className="text-[var(--text-3)]">
            ภาษี/ชิ้น (ปัจจุบัน):{" "}
            <span className="font-mono font-semibold text-[var(--text-2)]">
              {registration.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(taxPerUnit)}
            </span>
          </div>
        </div>

        <div className="form-group">
          <label>เลขที่อนุมัติ <span className="text-[var(--red)]">*</span></label>
          <input
            type="text"
            value={approvalNumber}
            onChange={(e) => setApprovalNumber(e.target.value)}
            required
            placeholder="เลขที่หนังสืออนุมัติขึ้นทะเบียน"
            className="premium-input w-full font-mono"
          />
        </div>

        <div className="form-group">
          <label>สถานะภาษีสรรพสามิต</label>
          <div className="space-y-1.5 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="taxable" checked={taxable === "auto"} onChange={() => setTaxable("auto")} />
              ตามพิกัดอัตโนมัติ ({autoTaxable ? "ต้องเสียภาษี" : "ยกเว้น"} — จาก FG code)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="taxable" checked={taxable === "taxable"} onChange={() => setTaxable("taxable")} />
              กำหนดเอง: <span className="font-semibold text-[var(--red)]">ต้องเสียภาษี</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="taxable" checked={taxable === "exempt"} onChange={() => setTaxable("exempt")} />
              กำหนดเอง: <span className="font-semibold text-[var(--green)]">ยกเว้นภาษี</span>
            </label>
          </div>
        </div>

        {error && <div className="text-xs text-[var(--red)] bg-[var(--red-soft)] rounded p-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <button type="button" onClick={onClose} className="btn" disabled={submitting}>ยกเลิก</button>
          <button type="submit" disabled={submitting || !approvalNumber.trim()} className="btn btn-primary px-6 disabled:opacity-50">
            {submitting ? "กำลังบันทึก..." : "ยืนยันอนุมัติ"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
