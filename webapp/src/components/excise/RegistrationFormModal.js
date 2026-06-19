"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { fmtMoney } from "@/lib/format";

// Create or edit an excise registration (master FG product × customer). Create
// → POST; edit (registration prop set) → PATCH the link fields. Backend tax
// snapshot/permissions unchanged.
export default function RegistrationFormModal({ open, onClose, onSaved, registration, products = [], customers = [], userName }) {
  const editing = !!registration;
  const [productId, setProductId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setProductId(registration?.productId || "");
      setCustomerId(registration?.customerId || "");
      setError(null);
    }
  }, [open, registration?.id]);

  const selected = products.find((p) => p.id === productId);

  const submit = async (e) => {
    e.preventDefault();
    if (!productId || !customerId) { setError("กรุณาเลือกสินค้าและลูกค้า"); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        editing ? `/api/excise-registrations/${registration.id}` : "/api/excise-registrations",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing ? { productId, customerId } : { productId, customerId, assignee: userName }),
        },
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "บันทึกไม่สำเร็จ");
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={editing ? "แก้ไขการขึ้นทะเบียน" : "ยื่นขึ้นทะเบียนสินค้า"} size="md">
      <form onSubmit={submit}>
        <div className="drawer-section flex flex-col gap-4">
          <div className="form-group">
            <label>สินค้า (Master FG) <span style={{ color: "var(--red)" }}>*</span></label>
            <SearchableSelect
              value={productId}
              onChange={setProductId}
              placeholder="ค้นหา FG / ชื่อสินค้า / แบรนด์..."
              options={products.map((p) => ({
                value: p.id,
                label: `${p.fgCode} | ${p.productDescription} (${p.brandName})`,
                search: `${p.fgCode} ${p.productDescription} ${p.brandName}`,
              }))}
              emptyText="ไม่พบสินค้า — สร้างที่ระบบฐานข้อมูลก่อน"
            />
            {selected && (
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-3)" }} className="font-mono flex gap-4 flex-wrap">
                <span>ปริมาตร: {selected.volume} {selected.volumeUnit || "ml"}</span>
                <span>ราคาขายปลีก: {fmtMoney(selected.retailPriceIncVat || 0)}</span>
                <span>ภาษี/ชิ้น: {selected.isExciseTaxable === false ? "ยกเว้น" : fmtMoney((selected.exciseTax || 0) + (selected.localTax || 0))}</span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>ลูกค้า <span style={{ color: "var(--red)" }}>*</span></label>
            <SearchableSelect
              value={customerId}
              onChange={setCustomerId}
              placeholder="ค้นหารหัส / ชื่อลูกค้า..."
              options={customers.map((c) => ({
                value: c.id,
                label: `${c.arCode} : ${c.name}`,
                search: `${c.arCode} ${c.name}`,
              }))}
            />
          </div>

          {error && <div style={{ fontSize: 13, color: "var(--red)" }} className="bg-[var(--red-soft)] rounded p-2">{error}</div>}
        </div>

        <div className="drawer-section flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary px-6" disabled={busy}>
            {busy ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "ยื่นขึ้นทะเบียน"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
