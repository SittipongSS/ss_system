"use client";
// ── ช่องกรอกของสัญญา — ใช้ร่วมทั้งตอนสร้าง (โมดัลจากหน้าดีล) และตอนแก้ร่าง
// (การ์ดบนหน้ารายละเอียดสัญญา) ตามกฎ AGENTS.md "ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง"
//
// ⭐ **ช่องไม่ได้ฮาร์ดโค้ดที่นี่** — มาจาก `fields` ของแม่แบบสัญญาชนิดนั้น
//    (lib/sales/contractTemplates) เพราะแม่แบบคือคนที่รู้ว่าเอกสารต้องเติมอะไรบ้าง
//    แยกสองที่เมื่อไร = เพิ่มช่องในแม่แบบแล้วฟอร์มไม่มีให้กรอก แล้วเอกสารพิมพ์ออกมา
//    เป็นเส้นประโดยไม่มีใครรู้ว่าลืมตรงไหน
//
// ลำดับโซนตาม docs/form-design-rules §1: คู่สัญญา (ใครทำสัญญากับใคร) มาก่อน
// เงื่อนไข (ตกลงอะไรกัน) — ตัวกำหนดบริบทอยู่บนสุดเสมอ
import Input from "@/components/ui/Input";
import MoneyInput from "@/components/ui/MoneyInput";
import Textarea from "@/components/ui/Textarea";
import FormZone from "@/components/ui/FormZone";
import DateInput from "@/components/ui/DateInput";

// ช่องที่เป็น "คู่สัญญา" — ที่เหลือถือเป็นเงื่อนไขทั้งหมด
const PARTY_KEYS = new Set([
  "contractPlace", "clientName", "clientRegNo", "clientAddress",
  "clientSignerName", "clientSignerTitle", "contractorSignerName",
]);

function FieldControl({ field, value, disabled, onChange }) {
  if (field.type === "textarea") {
    return <Textarea variant="form" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.type === "money") {
    return <MoneyInput value={value ?? ""} disabled={disabled} onChange={onChange} />;
  }
  if (field.type === "number") {
    return (
      <Input type="number" value={value ?? ""} disabled={disabled} min={0}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
    );
  }
  return (
    <Input value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  );
}

export default function ContractFormFields({
  fields = [],          // ประกาศช่องจากแม่แบบ
  values = {},          // ค่าที่กรอกอยู่
  contractDate = "",
  onPatch,              // (patch) => void — patch ของ fields
  onContractDate,
  disabled = false,
}) {
  const party = fields.filter((field) => PARTY_KEYS.has(field.key));
  const terms = fields.filter((field) => !PARTY_KEYS.has(field.key));

  const control = (field) => (
    <label key={field.key} className={`form-field${field.type === "textarea" ? " span-2" : ""}`}>
      <span className="form-field-label">
        {field.label}{field.required ? <span className="required-mark"> *</span> : null}
      </span>
      <FieldControl
        field={field}
        value={values[field.key]}
        disabled={disabled}
        onChange={(next) => onPatch({ [field.key]: next })}
      />
      {field.hint ? <span className="hint">{field.hint}</span> : null}
    </label>
  );

  /* ⚠️ **หัวโซนที่ไม่มีช่องอยู่ข้างใต้ต้องไม่ขึ้น** — ใบที่ใช้เอกสารภายนอกแทนสัญญาไม่มี
     ช่องของแม่แบบเลย (ตั้งใจ: เนื้อของมันคือไฟล์ที่แนบ ไม่ใช่ข้อความที่ระบบเติม) ⇒ ของเดิม
     ได้หัวโซนเปล่าสองอันคร่อม "วันที่สัญญา" ใบเดียว ซึ่งอ่านเหมือนฟอร์มโหลดไม่ครบ
     · ชนิดที่ยังไม่มีต้นฉบับ (สัญญาบริการ/จ้างผลิต) ก็ตกอยู่ในสภาพเดียวกัน */
  return (
    <div className="form-grid">
      <FormZone
        title="คู่สัญญา"
        className="col-span-2"
        note={party.length ? "ชื่อและที่อยู่ที่จะพิมพ์ลงบนสัญญา" : "วันที่ที่ใช้อ้างถึงใบนี้"}
      />
      <label className="form-field">
        <span className="form-field-label">วันที่สัญญา <span className="required-mark">*</span></span>
        <DateInput value={contractDate || ""} disabled={disabled} onChange={onContractDate} />
      </label>
      {party.map(control)}

      {terms.length > 0 && (
        <FormZone title="เงื่อนไขตามสัญญา" className="col-span-2" note="ตัวเลขที่จะถูกเติมลงในข้อสัญญา" />
      )}
      {terms.map(control)}
    </div>
  );
}
