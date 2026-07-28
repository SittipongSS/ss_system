"use client";
// ── ฟอร์มกลิ่นในทะเบียน (mig 0171) ─────────────────────────────────────
// ⚠️ ฟอร์มเดียวใช้ทั้ง "เพิ่มกลิ่น" และ "แก้ข้อมูลกลิ่น" (กฎ AGENTS.md) —
// ต่างกันแค่โหมดผ่าน props:
//   mode="create" → RD ใส่รหัสได้เลย (= เข้าทะเบียนทันที) · ฝ่ายขายไม่มีช่องรหัส
//   mode="edit"   → ไม่มีช่องรหัส เพราะ "ใส่รหัส = รับเข้าทะเบียน" เป็นคนละ action
//                   และลูกค้าล็อก (ตัวตนของกลิ่นผูกกับลูกค้า — มติ 9)
import SearchableSelect from "@/components/ui/SearchableSelect";

export const emptyScentForm = () => ({
  name: "",
  code: "",
  customerId: "",
  note: "",
});

export function scentToForm(scent) {
  return {
    name: scent.name || "",
    code: scent.code || "",
    customerId: scent.customerId || "",
    note: scent.note || "",
  };
}

export default function ScentForm({
  mode = "create", value, onChange, customers = [], canSetCode = false, disabled = false,
}) {
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div className="form-grid">
      <div className="form-group col-span-2">
        <label htmlFor="scent-name">ชื่อกลิ่น</label>
        <input
          id="scent-name" className="premium-input" value={value.name} disabled={disabled}
          placeholder="เช่น Forest night, Walk on beach 01"
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>

      <div className="form-group col-span-2">
        <label htmlFor="scent-customer">ลูกค้าเจ้าของกลิ่น</label>
        <SearchableSelect
          id="scent-customer"
          value={value.customerId}
          disabled={disabled || mode === "edit"}
          onChange={(v) => set({ customerId: v })}
          options={customers.map((c) => ({ value: c.id, label: c.name || c.id }))}
          placeholder="เลือกลูกค้า"
        />
        <small style={{ color: "var(--text-3)" }}>
          {mode === "edit"
            ? "เปลี่ยนลูกค้าไม่ได้ — ตัวตนของกลิ่นผูกกับลูกค้า"
            : "กลิ่นที่ออกแบบให้ลูกค้ารายหนึ่ง ใช้กับอีกรายไม่ได้"}
        </small>
      </div>

      {canSetCode && mode === "create" && (
        <div className="form-group col-span-2">
          <label htmlFor="scent-code">รหัสกลิ่น <span style={{ color: "var(--text-3)" }}>(ไม่บังคับ)</span></label>
          <input
            id="scent-code" className="premium-input" value={value.code} disabled={disabled}
            placeholder="เช่น SC-2026-001"
            onChange={(e) => set({ code: e.target.value })}
          />
          <small style={{ color: "var(--text-3)" }}>
            ใส่รหัสตอนนี้ = เข้าทะเบียนเลย · เว้นว่าง = เก็บเป็นร่างไว้ก่อน
          </small>
        </div>
      )}

      <div className="form-group col-span-2">
        <label htmlFor="scent-note">หมายเหตุ</label>
        <textarea
          id="scent-note" className="premium-input" rows={3} value={value.note} disabled={disabled}
          placeholder="โน้ตกลิ่น / ที่มา / ข้อจำกัด"
          onChange={(e) => set({ note: e.target.value })}
        />
      </div>
    </div>
  );
}
