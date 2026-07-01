"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { fmtMoney } from "@/lib/format";
import { categoryOf, isExciseCategory } from "@/lib/master/categoryOf";

// LG approval for an excise registration: approval number + taxability override.
// PATCH contract unchanged from the old ApproveProductModal.
export default function ApproveDialog({ open, onClose, onDone, registration }) {
  const [approvalNumber, setApprovalNumber] = useState("");
  const [taxable, setTaxable] = useState("auto"); // auto | taxable | exempt
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) { setApprovalNumber(""); setTaxable("auto"); setError(null); }
  }, [open, registration?.id]);

  if (!registration) return null;
  const autoTaxable = isExciseCategory(categoryOf(registration.fgCode));
  const taxPerUnit = (registration.exciseTax || 0) + (registration.localTax || 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!approvalNumber.trim()) return;
    setBusy(true);
    setError(null);
    const body = { status: "approved", approvalNumber: approvalNumber.trim() };
    if (taxable !== "auto") body.taxableOverride = taxable === "taxable";
    try {
      const res = await fetch(`/api/excise-registrations/${registration.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถอนุมัติได้");
      onDone?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={`อนุมัติขึ้นทะเบียน — ${registration.fgCode}`} size="md">
      <form onSubmit={submit}>
        <div className="drawer-section flex flex-col gap-4">
          <div style={{ fontSize: 13, background: "var(--panel-3)", borderRadius: 8, padding: 12 }} className="flex flex-col gap-1">
            <span style={{ color: "var(--text-2)" }}>{registration.productName} ({registration.brandName})</span>
            <span style={{ color: "var(--text-3)" }}>ลูกค้า: {registration.customerName || "-"}</span>
            <span style={{ color: "var(--text-3)" }}>
              ภาษี/ชิ้น (ปัจจุบัน): <span className="font-mono">{registration.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(taxPerUnit)}</span>
            </span>
          </div>

          <div className="form-group">
            <label>เลขที่อนุมัติ <span style={{ color: "var(--red)" }}>*</span></label>
            <input
              type="text" value={approvalNumber} onChange={(e) => setApprovalNumber(e.target.value)} required
              placeholder="เลขที่หนังสืออนุมัติขึ้นทะเบียน" className="premium-input w-full font-mono"
            />
          </div>

          <div className="form-group">
            <label>สถานะภาษีสรรพสามิต</label>
            <div className="flex flex-col gap-1.5" style={{ fontSize: 13 }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="tx" checked={taxable === "auto"} onChange={() => setTaxable("auto")} />
                ตามพิกัดอัตโนมัติ ({autoTaxable ? "ต้องเสียภาษี" : "ยกเว้น"})
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="tx" checked={taxable === "taxable"} onChange={() => setTaxable("taxable")} />
                กำหนดเอง: <span style={{ color: "var(--red)", fontWeight: 600 }}>ต้องเสียภาษี</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="tx" checked={taxable === "exempt"} onChange={() => setTaxable("exempt")} />
                กำหนดเอง: <span style={{ color: "var(--green)", fontWeight: 600 }}>ยกเว้นภาษี</span>
              </label>
            </div>
          </div>

          {error && <div style={{ fontSize: 13, color: "var(--red)" }} className="bg-[var(--red-soft)] rounded p-2">{error}</div>}
        </div>

        <div className="drawer-section flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary px-6" disabled={busy || !approvalNumber.trim()}>
            {busy ? "กำลังบันทึก..." : "ยืนยันอนุมัติ"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
