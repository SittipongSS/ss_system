"use client";
// ── ฟอร์มสูตรในทะเบียน (mig 0171) ──────────────────────────────────────
// ⚠️ ฟอร์มเดียวใช้ทั้ง "เพิ่มสูตร" และ "แก้ข้อมูลสูตร" (กฎ AGENTS.md)
//   mode="create" → RD ใส่รหัสได้เลย (= เข้าทะเบียนทันที)
//   mode="edit"   → ไม่มีช่องรหัส เพราะ "ใส่รหัส = รับเข้าทะเบียน" เป็นคนละ action
//
// จัดระเบียบรอบ 2026-08-12 ตาม docs/form-design-rules.md:
//   ลำดับ = ตามที่คนคิด: **ลูกค้า → กลิ่น → หมวด** (ตัวกำหนดบริบท + ตัวตนของสูตร
//   คือ หมวด × กลิ่น — mig 0207) มาก่อน แล้วค่อยชื่อ/รหัส · คู่ที่ขึ้นต่อกัน
//   (ลูกค้า|กลิ่น) อยู่แถวเดียวกันให้เห็นทันทีว่าทำไมช่องขวายังกดไม่ได้
//   · แบ่งโซนด้วย FormZone
import SearchableSelect from "@/components/ui/SearchableSelect";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import FormZone from "@/components/ui/FormZone";
import { customerSelectOptions } from "@/components/master/customerOption";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import { isScentUsable } from "@/lib/master/scents";
import styles from "./registryForm.module.css";
import Textarea from "@/components/ui/Textarea";

export const emptyFormulaForm = () => ({
  name: "",
  code: "",
  customerId: "",
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
    customerId: formula.customerId || "",
    formulaDate: formula.formulaDate || "",
    categoryCode: formula.categoryCode || "",
    scentId: formula.scentId || "",
    customerTradeName: formula.customerTradeName || "",
    derivedFromFormulaId: formula.derivedFromFormulaId || "",
    note: formula.note || "",
  };
}

/* ⭐ **ฟอร์มเดียวกับที่ใช้ในคำร้อง** (มติผู้ใช้ 2026-08-19) — RD กด "ส่งงาน" ที่แถว
   พัฒนาสูตรแล้วสูตรเข้าทะเบียนทันที ⇒ สิ่งที่กรอกตอนนั้นต้องเป็นของชุดเดียวกับ
   ทะเบียน ไม่ใช่ฟอร์มย่อสามช่องที่ค่อย ๆ เลื่อนออกจากกัน
   `locked` = ช่องที่คำร้องรู้คำตอบอยู่แล้ว (ลูกค้า · กลิ่น · หมวด) — **เทาไว้ให้เห็น
   ว่าค่าอะไร** ไม่ใช่ซ่อน · ซ่อนแล้วคนกรอกจะไม่รู้ว่าสูตรที่กำลังจะเกิดผูกกับกลิ่นตัวไหน
   ⚠️ ค่าที่ถูกล็อกเป็นแค่ของบนจอ — server ยกจากแถวคำร้องเองอยู่แล้ว ไม่เชื่อ client */
export default function FormulaForm({
  mode = "create", value, onChange, scents = [], formulas = [], customers = [], categories = [],
  editingId = null, canSetCode = false, disabled = false,
  locked = [], lockedNote = "ยกมาจากรายการในคำร้อง — แก้ที่นี่ไม่ได้", codeRequired = false,
}) {
  const set = (patch) => onChange({ ...value, ...patch });
  const isLocked = (field) => locked.includes(field);
  const lockHint = (field) => (isLocked(field) && lockedNote
    ? <small className={styles.hint}>{lockedNote}</small> : null);

  const scent = scents.find((s) => s.id === value.scentId) || null;

  /* ⭐ **เลือกลูกค้าก่อน แล้วค่อยเลือกกลิ่นของลูกค้ารายนั้น** (มติผู้ใช้ 2026-08-10)
     — กลับทิศจาก 0207 ที่ derive ลูกค้าจากกลิ่น · ทิศนี้ตรงกับที่คนกรอกคิดจริง
     ⚠️ **รูที่ 0207 ปิดไว้ต้องไม่กลับมา** (สูตรของลูกค้า A ใช้กลิ่นของลูกค้า B) —
     กันสองชั้น: ที่นี่กรองตัวเลือกให้เหลือเฉพาะกลิ่นของลูกค้าที่เลือก · และ server
     ตรวจซ้ำด้วย `formulaScentCustomerError` (ด่านจริงอยู่ที่ server เสมอ)
     ⚠️ เปลี่ยนลูกค้าแล้ว **ล้างกลิ่นที่เลือกไว้ถ้าไม่ใช่ของลูกค้าใหม่** — ไม่งั้นค่าเก่า
     ค้างอยู่แล้วโดน server ตีกลับตอนบันทึก ทั้งที่บนจอดูเหมือนถูก */
  const pickCustomer = (customerId) => {
    const keep = !value.scentId
      || scents.find((x) => x.id === value.scentId)?.customerId === customerId;
    set({ customerId, ...(keep ? {} : { scentId: "" }) });
  };
  const customerOptions = customerSelectOptions(customers);

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
    // กรองตามลูกค้าที่เลือก — ยังไม่เลือกลูกค้า = ยังไม่มีกลิ่นให้เลือก (สูตรฐาน
    // ผูกกลิ่นของลูกค้ารายใดรายหนึ่งไม่ได้ · ดู formulaScentCustomerError)
    .filter((s) => (value.customerId ? s.customerId === value.customerId : false)
      || s.id === value.scentId)
    .map((s) => ({
      value: s.id,
      label: s.code ? `${s.name} · ${s.code}` : s.name,
      search: [s.name, s.code, s.customerName].filter(Boolean).join(" "),
    }));

  return (
    <div className="form-grid cols-2">
      {/* ── โซน 1: ตัวตนสูตร — หมวด × กลิ่น คือตัวตน (mig 0207) จึงถามก่อนชื่อ ── */}
      <FormZone title="ตัวตนสูตร" note="หมวด × กลิ่น = ตัวตนของสูตร" className="col-span-2" />

      {/* ลูกค้าอยู่ **ก่อน** กลิ่น และอยู่แถวเดียวกัน — เห็นทันทีว่าทำไมช่องขวายังปิด */}
      <div className="form-group">
        <label htmlFor="formula-customer">ลูกค้า</label>
        <SearchableSelect
          id="formula-customer" value={value.customerId || ""} disabled={disabled || isLocked("customerId")}
          onChange={pickCustomer}
          options={customerOptions}
          placeholder="ไม่ผูกลูกค้า (สูตรฐาน ใช้ได้ทุกลูกค้า)"
          emptyText="ยังไม่มีลูกค้าในทะเบียน"
        />
        {lockHint("customerId")}
      </div>

      <div className="form-group">
        <label htmlFor="formula-scent">กลิ่นที่ใช้</label>
        <SearchableSelect
          id="formula-scent" value={value.scentId}
          disabled={disabled || isLocked("scentId") || !value.customerId}
          onChange={(v) => set({ scentId: v })}
          options={scentOptions}
          placeholder={value.customerId ? "ไม่ระบุ" : "เลือกลูกค้าก่อน"}
          emptyText={value.customerId
            ? "ลูกค้ารายนี้ยังไม่มีกลิ่นในทะเบียน"
            : "เลือกลูกค้าก่อนจึงจะเลือกกลิ่นได้"}
        />
        {isLocked("scentId") ? lockHint("scentId") : (
          <small className={styles.hint}>
            เห็นเฉพาะกลิ่นของลูกค้าที่เลือก — สูตรของลูกค้ารายหนึ่งใช้กลิ่นของอีกรายไม่ได้
          </small>
        )}
      </div>

      {/* ⭐ หมวด × กลิ่น = **ตัวตนของสูตร** (mig 0207) — สองช่องนี้ไม่ใช่ข้อมูลประกอบ
          แต่เป็นตัวบอกว่าสูตรนี้คือของชิ้นไหน · เทียนหอมกลิ่น A กับก้านไม้หอมกลิ่น A
          เป็นคนละสูตร ส่วนเทียนหอมกลิ่น A สองแถวคือของซ้ำ
          (CSS กลางบังคับ .ui-product-category-select เต็มแถวใน cols-2 อยู่แล้ว) */}
      <ProductCategorySelect
        categories={categories}
        value={value.categoryCode}
        disabled={disabled || isLocked("categoryCode")}
        onChange={(categoryCode) => set({ categoryCode })}
      />

      <div className="form-group col-span-2">
        <label htmlFor="formula-name">ชื่อสูตร</label>
        <Input
          id="formula-name" value={value.name} disabled={disabled}
          placeholder="เช่น Well sleep #2"
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>

      {canSetCode && (
        <div className="form-group">
          <label htmlFor="formula-code">
            รหัสสูตร {codeRequired ? null : <span className={styles.hint}>(ไม่บังคับ)</span>}
          </label>
          <Input
            id="formula-code" value={value.code} disabled={disabled}
            placeholder="เช่น PF638010202-P1"
            onChange={(e) => set({ code: e.target.value })}
          />
          <small className={styles.hint}>
            {codeRequired
              ? "รหัสของฝ่าย RD — ห้ามซ้ำกับสูตรอื่น · ส่งงานแล้วสูตรเข้าทะเบียนทันที"
              : "ใส่รหัสตอนนี้ = เข้าทะเบียนเลย · เว้นว่าง = ร่าง"}
          </small>
        </div>
      )}

      {/* วันที่คู่กับรหัส (ของที่อ่านคู่กันตอนไล่ทะเบียน) — ตอนไม่มีช่องรหัส
          ให้กินเต็มแถว ไม่ทิ้งรูข้าง ๆ (กติกา pairRows ใน form-design-rules) */}
      <div className={`form-group ${canSetCode ? "" : "col-span-2"}`.trim()}>
        <label htmlFor="formula-date">วันที่ของสูตร</label>
        <DateInput
          id="formula-date" value={value.formulaDate} disabled={disabled}
          onChange={(v) => set({ formulaDate: v })}
        />
      </div>

      {/* ── โซน 2: ข้อมูลเสริม ─────────────────────────────────────────────── */}
      <FormZone title="ข้อมูลเสริม" className="col-span-2" />

      <div className="form-group">
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

      <div className="form-group">
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
