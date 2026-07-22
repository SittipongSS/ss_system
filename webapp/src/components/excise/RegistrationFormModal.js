"use client";
import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { fmtMoney } from "@/lib/format";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";
import { productSelectOptions } from "@/components/master/productOption";

// Create or edit an excise registration (master FG product × customer).
// ลำดับกรอก = ลูกค้า → FG (มติผู้ใช้ 2026-07-22): ผู้ใช้คิดจาก "ขึ้นทะเบียนให้ลูกค้า
// รายไหน" ก่อนเสมอ และรายการ FG ทั้งระบบยาวเกินกว่าจะไล่หาโดยไม่กรอง.
// ความจริงของข้อมูลไม่เปลี่ยน: FG ผูกลูกค้าเจ้าของอยู่แล้วผ่าน products.customerId
// จึงกรองลิสต์ FG ด้วยลูกค้าที่เลือก (FG ที่ยังไม่มีเจ้าของโชว์ท้ายลิสต์ให้ผูกได้
// เหมือนทางเลือกเดิม แต่ต้องรู้ตัวว่ากำลังผูกของที่ยังไม่มีเจ้าของ).
// 1 FG ขึ้นทะเบียนให้ลูกค้ารายหนึ่งได้ครั้งเดียว (unique productId+customerId) →
// ตัวที่ขึ้นแล้วถูกซ่อนพร้อมบอกจำนวน กันผู้ใช้เลือกไปชน 409.
// Create → POST; edit (registration prop set) → PATCH the link fields.
export default function RegistrationFormModal({ open, onClose, onSaved, registration, products = [], customers = [], registrations = [], userName }) {
  const editing = !!registration;
  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const selected = products.find((p) => p.id === productId);
  const customer = customers.find((c) => c.id === customerId);

  useEffect(() => {
    if (open) {
      const pid = registration?.productId || "";
      const p = products.find((x) => x.id === pid);
      setProductId(pid);
      setCustomerId(registration?.customerId || p?.customerId || "");
      setError(null);
    }
  }, [open, registration?.id]);

  // FG ที่ขึ้นทะเบียนกับลูกค้ารายนี้ไปแล้ว (ยกเว้นใบที่กำลังแก้อยู่)
  const takenProductIds = useMemo(() => new Set(
    (registrations || [])
      .filter((r) => r.customerId === customerId && r.id !== registration?.id)
      .map((r) => r.productId),
  ), [registrations, customerId, registration?.id]);

  // FG ของลูกค้าที่เลือก + FG ที่ยังไม่มีเจ้าของ (ผูกให้ลูกค้ารายนี้ได้)
  const { ownedOptions, orphanOptions, hiddenCount } = useMemo(() => {
    if (!customerId) return { ownedOptions: [], orphanOptions: [], hiddenCount: 0 };
    // FG ของใบที่กำลังแก้ต้องอยู่ในลิสต์เสมอ แม้ถูกพักใช้งานไปแล้ว — ไม่งั้นช่อง
    // สินค้าจะว่างทั้งที่ใบมีค่าอยู่ แล้วผู้ใช้เผลอบันทึกทับด้วยค่าว่าง
    const usable = products.filter((p) => p.isActive !== false || p.id === registration?.productId);
    const mine = usable.filter((p) => p.customerId === customerId);
    const orphans = usable.filter((p) => !p.customerId);
    const visible = [...mine, ...orphans].filter((p) => !takenProductIds.has(p.id));
    return {
      ownedOptions: productSelectOptions(visible.filter((p) => p.customerId === customerId)),
      orphanOptions: productSelectOptions(visible.filter((p) => !p.customerId)),
      hiddenCount: [...mine, ...orphans].length - visible.length,
    };
  }, [products, customerId, takenProductIds, registration?.productId]);

  const productOptions = [...ownedOptions, ...orphanOptions];
  const isOrphanPick = !!selected && !selected.customerId;

  const handleCustomer = (id) => {
    setCustomerId(id);
    // FG ที่เลือกไว้ไม่ใช่ของลูกค้ารายใหม่ → ล้าง กันบันทึกคู่ที่ไม่ตรงกัน
    const p = products.find((x) => x.id === productId);
    if (p && p.customerId && p.customerId !== id) setProductId("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!customerId) { setError(`กรุณาเลือก${CUSTOMER_NAME_LABEL}`); return; }
    if (!productId) { setError("กรุณาเลือกสินค้า (FG)"); return; }
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
            <label>{CUSTOMER_NAME_LABEL} <span style={{ color: "var(--red)" }}>*</span></label>
            <SearchableSelect
              entity="customer"
              value={customerId}
              onChange={handleCustomer}
              placeholder="ค้นหารหัส / ชื่อลูกค้า..."
              options={customers.map((c) => ({
                value: c.id,
                label: `${c.arCode} : ${c.name}`,
                search: `${c.arCode} ${c.name}`,
              }))}
              emptyText="ไม่พบลูกค้า — สร้างที่ฐานข้อมูลก่อน"
            />
          </div>

          <div className="form-group">
            <label>สินค้า (Master FG) <span style={{ color: "var(--red)" }}>*</span></label>
            {!customerId ? (
              <div style={{ fontSize: 13 }} className="text-[var(--text-3)] bg-[var(--panel-2)] rounded p-2">
                เลือก{CUSTOMER_NAME_LABEL}ก่อน — รายการ FG จะกรองเฉพาะของลูกค้ารายนั้น
              </div>
            ) : (
              <>
                <SearchableSelect
                  entity="product"
                  value={productId}
                  onChange={setProductId}
                  placeholder="ค้นหา FG / ชื่อสินค้า / แบรนด์..."
                  options={productOptions}
                  emptyText={hiddenCount
                    ? "FG ของลูกค้ารายนี้ขึ้นทะเบียนครบแล้ว"
                    : "ลูกค้ารายนี้ยังไม่มี FG — สร้างที่ฐานข้อมูลก่อน"}
                />
                {hiddenCount > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-3)" }}>
                    ซ่อน {hiddenCount} FG ที่ขึ้นทะเบียนกับลูกค้ารายนี้แล้ว (1 FG ขึ้นทะเบียนต่อลูกค้าได้ครั้งเดียว)
                  </div>
                )}
                {isOrphanPick && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--amber)" }}>
                    FG นี้ยังไม่มีลูกค้าเจ้าของในฐานข้อมูล — จะผูกกับ{customer?.name || "ลูกค้ารายนี้"} ควรไปกำหนดเจ้าของที่ข้อมูลสินค้าให้เรียบร้อย
                  </div>
                )}
                {selected && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-3)" }} className="font-mono flex gap-4 flex-wrap">
                    <span>ปริมาตร: {selected.volume} {selected.volumeUnit || "ml"}</span>
                    <span>ราคาขายปลีก: {fmtMoney(selected.retailPriceIncVat || 0)}</span>
                    <span>ภาษี/ชิ้น: {selected.isExciseTaxable === false ? "ยกเว้น" : fmtMoney((selected.exciseTax || 0) + (selected.localTax || 0))}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {!editing && (
            <div style={{ fontSize: 12.5 }} className="text-[var(--text-3)] bg-[var(--panel-2)] rounded p-2">
              บันทึกเป็น “ฉบับร่าง” ก่อน จากนั้นแนบเอกสารที่จำเป็น (แผนที่ + ฉลาก/Artwork) แล้วจึงกด “ยื่นขึ้นทะเบียน”
            </div>
          )}

          {error && <div style={{ fontSize: 13, color: "var(--red)" }} className="bg-[var(--red-soft)] rounded p-2">{error}</div>}
        </div>

        <div className="form-action-bar">
          <button type="button" onClick={onClose} className="btn" disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "บันทึกร่าง → แนบเอกสาร"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
