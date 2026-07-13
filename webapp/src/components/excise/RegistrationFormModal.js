"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { fmtMoney } from "@/lib/format";

// Create or edit an excise registration (master FG product × customer). The
// customer is NOT picked freely: every FG already belongs to one customer via
// products.customerId (master-data FK), so selecting the FG derives its owner
// customer automatically. Only FG with no owner fall back to a manual picker.
// Create → POST; edit (registration prop set) → PATCH the link fields.
export default function RegistrationFormModal({ open, onClose, onSaved, registration, products = [], customers = [], userName }) {
  const editing = !!registration;
  const [productId, setProductId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const selected = products.find((p) => p.id === productId);
  const ownerId = selected?.customerId || "";
  const owner = customers.find((c) => c.id === ownerId);
  const ownerName = owner?.name || selected?.customerName || "";
  const ownerArCode = owner?.arCode || "";
  // FG with no master owner → fall back to a manual customer picker.
  const needsManualCustomer = !!selected && !ownerId;

  useEffect(() => {
    if (open) {
      const pid = registration?.productId || "";
      const p = products.find((x) => x.id === pid);
      setProductId(pid);
      // Prefer the FG's master owner; fall back to the registration's customer.
      setCustomerId(p?.customerId || registration?.customerId || "");
      setError(null);
    }
  }, [open, registration?.id]);

  // Selecting an FG derives its owner customer (cleared when the FG has none).
  const handleProduct = (id) => {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    setCustomerId(p?.customerId || "");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!productId) { setError("กรุณาเลือกสินค้า (FG)"); return; }
    if (!customerId) { setError(needsManualCustomer ? "FG นี้ยังไม่มีลูกค้าเจ้าของ กรุณาเลือกลูกค้า" : "กรุณาเลือกสินค้า (FG)"); return; }
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
      const saved = await res.json().catch(() => null);
      onSaved?.(saved, { created: !editing });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={editing ? "แก้ไขการขึ้นทะเบียน" : "สร้างทะเบียน (ร่าง)"} size="md">
      <form onSubmit={submit}>
        <div className="drawer-section flex flex-col gap-4">
          <div className="form-group">
            <label>สินค้า (Master FG) <span style={{ color: "var(--red)" }}>*</span></label>
            <SearchableSelect
              entity="product"
              value={productId}
              onChange={handleProduct}
              placeholder="ค้นหา FG / ชื่อสินค้า / แบรนด์..."
              options={products.map((p) => ({
                value: p.id,
                label: `${p.fgCode} | ${p.productDescriptionEn || p.productDescription || ""} (${p.brandNameEn || p.brandName || ""})`,
                search: `${p.fgCode} ${p.productDescription || ""} ${p.productDescriptionEn || ""} ${p.brandName || ""} ${p.brandNameEn || ""}`,
              }))}
              emptyText="ไม่พบสินค้า — สร้างที่ฐานข้อมูลก่อน"
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
            <label>ลูกค้า (เจ้าของ FG) <span style={{ color: "var(--red)" }}>*</span></label>
            {!selected ? (
              <div style={{ fontSize: 13 }} className="text-[var(--text-3)] bg-[var(--panel-2)] rounded p-2">
                เลือก FG ก่อน — ลูกค้าจะถูกกำหนดตามเจ้าของสินค้าโดยอัตโนมัติ
              </div>
            ) : needsManualCustomer ? (
              <>
                <SearchableSelect
                  entity="customer"
                  value={customerId}
                  onChange={setCustomerId}
                  placeholder="ค้นหารหัส / ชื่อลูกค้า..."
                  options={customers.map((c) => ({
                    value: c.id,
                    label: `${c.arCode} : ${c.name}`,
                    search: `${c.arCode} ${c.name}`,
                  }))}
                />
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--amber, #b45309)" }}>
                  FG นี้ยังไม่มีลูกค้าเจ้าของในฐานข้อมูล — ควรไปกำหนดที่สินค้าให้เรียบร้อย
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14 }} className="font-medium text-[var(--text)] bg-[var(--panel-2)] rounded p-2 flex items-center gap-2">
                {ownerArCode && <span className="font-mono text-[var(--text-3)]">{ownerArCode}</span>}
                <span>{ownerName}</span>
              </div>
            )}
          </div>

          {!editing && (
            <div style={{ fontSize: 12.5 }} className="text-[var(--text-3)] bg-[var(--panel-2)] rounded p-2">
              บันทึกเป็น “ฉบับร่าง” ก่อน จากนั้นแนบเอกสารที่จำเป็น (แผนที่ + ฉลาก/Artwork) แล้วจึงกด “ยื่นขึ้นทะเบียน”
            </div>
          )}

          {error && <div style={{ fontSize: 13, color: "var(--red)" }} className="bg-[var(--red-soft)] rounded p-2">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
          <button type="button" onClick={onClose} className="btn" disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary px-6" disabled={busy}>
            {busy ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "บันทึกร่าง → แนบเอกสาร"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
