"use client";
// ── ฟอร์มสูตรในทะเบียน (mig 0171) ──────────────────────────────────────
// ⚠️ ฟอร์มเดียวใช้ทั้ง "เพิ่มสูตร" และ "แก้ข้อมูลสูตร" (กฎ AGENTS.md)
//   mode="create" → RD ใส่รหัสได้เลย (= เข้าทะเบียนทันที)
//   mode="edit"   → ไม่มีช่องรหัส เพราะ "ใส่รหัส = รับเข้าทะเบียน" เป็นคนละ action
//
// สูตรผูกกลิ่นได้ (มติผู้ใช้: สูตรเกี่ยวข้องกับกลิ่น) — เลือกได้เฉพาะกลิ่นที่
// รับเข้าทะเบียนแล้ว ร่างยังไม่ใช่ของจริง
import SearchableSelect from "@/components/ui/SearchableSelect";
import DateInput from "@/components/ui/DateInput";
import { isScentUsable } from "@/lib/master/scents";
import styles from "./registryForm.module.css";
import Textarea from "@/components/ui/Textarea";

export const emptyFormulaForm = () => ({
  name: "",
  code: "",
  formulaDate: "",
  scentId: "",
  customerId: "",
  note: "",
});

export function formulaToForm(formula) {
  return {
    name: formula.name || "",
    code: formula.code || "",
    formulaDate: formula.formulaDate || "",
    scentId: formula.scentId || "",
    customerId: formula.customerId || "",
    note: formula.note || "",
  };
}

export default function FormulaForm({
  mode = "create", value, onChange, customers = [], scents = [],
  canSetCode = false, disabled = false,
}) {
  const set = (patch) => onChange({ ...value, ...patch });

  // กลิ่นที่เลือกได้ = ที่รับเข้าทะเบียนแล้ว + กลิ่นที่ผูกอยู่เดิม (ไม่งั้นแก้สูตรเก่า
  // แล้วกลิ่นที่เคยผูกหายไปจากลิสต์เงียบ ๆ)
  const scentOptions = scents
    .filter((s) => isScentUsable(s) || s.id === value.scentId)
    .map((s) => ({
      value: s.id,
      label: s.code ? `${s.name} · ${s.code}` : s.name,
      search: [s.name, s.code, s.customerName].filter(Boolean).join(" "),
    }));

  return (
    <div className="form-grid">
      <div className="form-group col-span-2">
        <label htmlFor="formula-name">ชื่อสูตร</label>
        <input
          id="formula-name" className="premium-input" value={value.name} disabled={disabled}
          placeholder="เช่น Well sleep #2"
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>

      {canSetCode && mode === "create" && (
        <div className="form-group">
          <label htmlFor="formula-code">รหัสสูตร <span className={styles.hint}>(ไม่บังคับ)</span></label>
          <input
            id="formula-code" className="premium-input" value={value.code} disabled={disabled}
            placeholder="เช่น PF638010202-P1"
            onChange={(e) => set({ code: e.target.value })}
          />
          <small className={styles.hint}>ใส่รหัสตอนนี้ = เข้าทะเบียนเลย · เว้นว่าง = ร่าง</small>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="formula-date">วันที่ของสูตร</label>
        <DateInput
          id="formula-date" value={value.formulaDate} disabled={disabled}
          onChange={(v) => set({ formulaDate: v })}
        />
      </div>

      <div className="form-group col-span-2">
        <label htmlFor="formula-scent">กลิ่นที่ใช้</label>
        <SearchableSelect
          id="formula-scent" value={value.scentId} disabled={disabled}
          onChange={(v) => set({ scentId: v })}
          options={scentOptions}
          placeholder="ไม่ระบุ"
          emptyText="ยังไม่มีกลิ่นในทะเบียน"
        />
      </div>

      <div className="form-group col-span-2">
        <label htmlFor="formula-customer">ลูกค้า <span className={styles.hint}>(เว้นว่าง = สูตรกลาง)</span></label>
        <SearchableSelect
          id="formula-customer" value={value.customerId} disabled={disabled}
          onChange={(v) => set({ customerId: v })}
          options={customers.map((c) => ({ value: c.id, label: c.name || c.id }))}
          placeholder="สูตรกลาง (ใช้ได้ทุกลูกค้า)"
        />
      </div>

      <div className="form-group col-span-2">
        <label htmlFor="formula-note">หมายเหตุ</label>
        <Textarea
          id="formula-note" rows={3} value={value.note} disabled={disabled}
          placeholder="โน้ตสูตร / ที่มา / ข้อจำกัด"
          onChange={(e) => set({ note: e.target.value })}
        />
      </div>
    </div>
  );
}
