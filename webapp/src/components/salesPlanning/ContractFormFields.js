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
import OptionTiles from "@/components/ui/OptionTiles";
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
  /* ⭐ โหมดของใบที่ใช้ **เอกสารภายนอกแทนสัญญา** (mig 0322) — ใบแบบนี้ไม่มีช่องของแม่แบบ
     แต่มีข้อมูลของตัวเองที่ระบบต้องการ (ใช้เอกสารอะไรแทน · เลขที่อ้างอิง)
     ⚠️ ช่องสองช่องนี้อยู่ในโมดัลสร้างมาตั้งแต่แรก แต่ไม่เคยมีในฟอร์มแก้ ⇒ พิมพ์เลข PO
        ผิดตัวเดียวต้องลบร่างแล้วสร้างใหม่ · ผิดกฎ "ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับ
        ตอนสร้าง" ของ AGENTS.md ⇒ ยกมาไว้ที่นี่ให้สองทางใช้ชุดเดียวกัน */
  external = null,      // { docKind, ref } — null = ใบที่ระบบเจนจากแม่แบบ
  externalDocKinds = [],// [{ value, label }]
  onExternalPatch,      // (patch) => void
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
     · ชนิดที่ยังไม่มีต้นฉบับ (สัญญาบริการ/จ้างผลิต) ที่ระบบเจนก็ตกอยู่ในสภาพเดียวกัน
       แต่เหตุคนละข้อ — อันนั้น "ยังไม่มีแม่แบบ" อันนี้ "ไม่ใช้แม่แบบ" ⇒ คำอธิบายต้องต่างกัน */
  return (
    <div className="form-grid">
      <FormZone
        title={party.length ? "คู่สัญญา" : (external ? "เอกสารที่ใช้แทนสัญญา" : "ข้อมูลของใบ")}
        className="col-span-2"
        note={party.length
          ? "ชื่อและที่อยู่ที่จะพิมพ์ลงบนสัญญา"
          : (external
            ? "ใบนี้ไม่มีช่องของแม่แบบ — ตัวสัญญาคือเอกสารที่ระบุไว้ข้างล่างและไฟล์ที่แนบไว้"
            : "ใบนี้ยังไม่มีแม่แบบในระบบ จึงมีแค่วันที่ให้กรอก")}
      />
      <label className="form-field">
        <span className="form-field-label">วันที่สัญญา <span className="required-mark">*</span></span>
        <DateInput value={contractDate || ""} disabled={disabled} onChange={onContractDate} />
      </label>
      {party.map(control)}

      {external ? (
        <>
          <div className="form-field span-2">
            <span className="form-field-label">ใช้เอกสารอะไรแทน <span className="required-mark">*</span></span>
            <OptionTiles
              ariaLabel="ชนิดเอกสารที่ใช้แทนสัญญา"
              value={external.docKind || ""}
              onChange={(value) => onExternalPatch?.({ externalDocKind: value })}
              disabled={disabled}
              options={externalDocKinds}
            />
          </div>
          <label className="form-field span-2">
            <span className="form-field-label">เลขที่/หัวข้ออ้างอิง</span>
            <Input
              value={external.ref || ""}
              onChange={(e) => onExternalPatch?.({ externalRef: e.target.value })}
              disabled={disabled}
              maxLength={200}
              autoComplete="off"
              placeholder="เช่น PO-2569-0142 หรือหัวข้ออีเมลที่ลูกค้ายืนยัน"
            />
            <span className="hint">ตัวไฟล์แนบที่การ์ดไฟล์ของสัญญา</span>
          </label>
        </>
      ) : null}

      {terms.length > 0 && (
        <FormZone title="เงื่อนไขตามสัญญา" className="col-span-2" note="ตัวเลขที่จะถูกเติมลงในข้อสัญญา" />
      )}
      {terms.map(control)}
    </div>
  );
}
