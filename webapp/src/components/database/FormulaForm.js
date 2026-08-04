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
import Input from "@/components/ui/Input";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import { isScentUsable } from "@/lib/master/scents";
import styles from "./registryForm.module.css";
import Textarea from "@/components/ui/Textarea";

export const emptyFormulaForm = () => ({
  name: "",
  code: "",
  formulaDate: "",
  categoryCode: "",
  scentId: "",
  customerTradeName: "",
  derivedFromFormulaId: "",
  note: "",
});

export function formulaToForm(formula) {
  return {
    name: formula.name || "",
    code: formula.code || "",
    formulaDate: formula.formulaDate || "",
    categoryCode: formula.categoryCode || "",
    scentId: formula.scentId || "",
    customerTradeName: formula.customerTradeName || "",
    derivedFromFormulaId: formula.derivedFromFormulaId || "",
    note: formula.note || "",
  };
}

export default function FormulaForm({
  mode = "create", value, onChange, scents = [], formulas = [], categories = [],
  editingId = null, canSetCode = false, disabled = false,
}) {
  const set = (patch) => onChange({ ...value, ...patch });

  // ลูกค้าของสูตร = ลูกค้าของกลิ่นที่เลือก — โชว์ให้เห็น แต่แก้ไม่ได้
  const scent = scents.find((s) => s.id === value.scentId) || null;

  // สายพันธุ์: สูตรของลูกค้ารายเดียวกัน + สูตรฐาน (ไม่ผูกลูกค้า) ซึ่งเป็นต้นทางได้จริง
  const lineageOptions = formulas
    .filter((f) => f.id !== editingId
      && (!f.customerId || !scent?.customerId || f.customerId === scent.customerId))
    .map((f) => ({
      value: f.id,
      label: `${f.code ? `${f.code} · ` : ""}${f.name}`,
      search: [f.code, f.name, f.customerTradeName].filter(Boolean).join(" "),
    }));

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

      {/* ⭐ หมวด × กลิ่น = **ตัวตนของสูตร** (mig 0207) — สองช่องนี้ไม่ใช่ข้อมูลประกอบ
          แต่เป็นตัวบอกว่าสูตรนี้คือของชิ้นไหน · เทียนหอมกลิ่น A กับก้านไม้หอมกลิ่น A
          เป็นคนละสูตร ส่วนเทียนหอมกลิ่น A สองแถวคือของซ้ำ */}
      <ProductCategorySelect
        categories={categories}
        value={value.categoryCode}
        disabled={disabled}
        onChange={(categoryCode) => set({ categoryCode })}
      />

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

      {/* ⭐ **ไม่มีช่องลูกค้าอีกแล้ว** — server เติมจากกลิ่นเสมอ (mig 0207)
          เดิมกรอกเองและเว้นว่างได้ ⇒ สูตรผูกลูกค้า A แต่ใช้กลิ่นของลูกค้า B ได้
          โดยไม่มีอะไรห้าม · ที่นี่แสดงผลลัพธ์ให้เห็น ไม่ใช่ให้เลือก */}
      <div className="form-group col-span-2">
        <span className="toolbar-label">ลูกค้า</span>
        <p className={styles.hint}>
          {value.scentId
            ? `${scent?.customerName || scent?.customerId || "—"} — มาจากกลิ่นที่เลือก เปลี่ยนที่นี่ไม่ได้`
            : "ไม่ผูกกลิ่น = สูตรฐาน ใช้ได้ทุกลูกค้า"}
        </p>
      </div>

      <div className="form-group col-span-2">
        <label htmlFor="formula-trade-name">
          ชื่อที่ลูกค้าเรียก <span className={styles.hint}>(ไม่บังคับ)</span>
        </label>
        <Input
          id="formula-trade-name" value={value.customerTradeName} disabled={disabled}
          placeholder="ชื่อทางการค้าที่ลูกค้าตั้งเอง"
          onChange={(e) => set({ customerTradeName: e.target.value })}
        />
        <small className={styles.hint}>แสดงคู่กับรหัส/ชื่อของเราเสมอ — ไม่ได้ใช้แทนกัน</small>
      </div>

      <div className="form-group col-span-2">
        <label htmlFor="formula-derived-from">
          แก้มาจากสูตร <span className={styles.hint}>(ไม่บังคับ)</span>
        </label>
        <SearchableSelect
          id="formula-derived-from" value={value.derivedFromFormulaId} disabled={disabled}
          onChange={(v) => set({ derivedFromFormulaId: v })}
          options={[{ value: "", label: "— ไม่ได้แก้มาจากตัวไหน —" }, ...lineageOptions]}
          placeholder="ค้นด้วยรหัสหรือชื่อสูตร"
          emptyText="ยังไม่มีสูตรอื่นที่อ้างเป็นต้นทางได้"
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
