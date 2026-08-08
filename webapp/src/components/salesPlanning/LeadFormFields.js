"use client";
// ── ชุดช่องกรอกลีดมาตรฐาน — ใช้ร่วมทั้ง "รับลีดใหม่/แก้ลีด" (โมดัลหน้าคิวลีด)
// และฟอร์มแก้บนหน้ารายละเอียดลีด (การ์ด "ข้อมูลผู้ติดต่อและความต้องการ")
//
// ⭐ ยกออกมาเพราะสองที่นั้น **เพี้ยนกันจริงแล้ว** ตามที่ AGENTS.md เตือน (ตรวจ 2026-08-08):
//   · แหล่งที่มา: โมดัลเป็นเรดิโอ 8 ตัวจัดกลุ่ม · หน้ารายละเอียดเป็นดรอปดาวน์แบน
//   · ป้ายคนละคำ 5 ช่อง — "เบอร์โทร"/"โทรศัพท์" · "Budget (บาท)"/"งบประมาณ" ·
//     "ช่องทางอื่น"/"ช่องทางติดต่อเพิ่มเติม" · "บริษัท/แบรนด์"/"บริษัท" ·
//     ชื่อผู้ติดต่อใช้ทะเบียนกลาง vs พิมพ์เอง
//   · 🐞 **ด่านบังคับหาย**: `SERVICE_DETAIL_REQUIRED` (สนใจ "สินค้า/อื่นๆ" ต้องระบุ
//     รายละเอียด — spec ผู้ใช้) มีเฉพาะในโมดัล ⇒ แก้จากหน้ารายละเอียดปล่อยว่างได้
//   · 🐞 **PhoneInput หาย**: หน้ารายละเอียดใช้ `<input>` ดิบ ⇒ เบอร์ไม่ถูกจัดรูป
//
// ต่างกันได้แค่ "โหมด" ผ่าน props ไม่ใช่คนละไฟล์ (กฎ AGENTS.md) — ตัวเดียวที่ต่างคือ
// `compact` สำหรับการ์ดบนหน้ารายละเอียดที่มีที่น้อยกว่าโมดัล
import PhoneInput from "@/components/ui/PhoneInput";
import MoneyInput from "@/components/ui/MoneyInput";
import Textarea from "@/components/ui/Textarea";
import OptionTiles from "@/components/ui/OptionTiles";
import ChoiceChips from "@/components/ui/ChoiceChips";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";
import {
  CHANNEL_GROUP_LABELS, LEAD_CHANNELS, LEAD_CHANNEL_LABELS, channelGroupOf,
  SERVICE_INTERESTS, SERVICE_INTEREST_LABELS, SERVICE_DETAIL_REQUIRED,
} from "@/lib/sales/leads";

/** ช่องที่ต้องกรอกก่อนบันทึกได้ — ตัวเดียวกันทั้งสองที่เรียกใช้ (ห้ามเขียนกฎซ้ำ) */
export function leadFormBlocker(form = {}) {
  if (!String(form.contactName || "").trim()) return `กรุณาระบุ${CUSTOMER_NAME_LABEL}`;
  if (!form.serviceInterest) return "กรุณาเลือกประเภทบริการที่สนใจ";
  if (SERVICE_DETAIL_REQUIRED.has(form.serviceInterest) && !String(form.serviceDetail || "").trim()) {
    return `เลือก "${SERVICE_INTEREST_LABELS[form.serviceInterest]}" แล้วต้องระบุรายละเอียดบริการ`;
  }
  return "";
}

export default function LeadFormFields({
  form,
  onPatch,              // (patchObject) => void
  disabled = false,
  // การ์ดบนหน้ารายละเอียดมีที่น้อยกว่าโมดัล — ย่อชิปช่องทางเป็นกลุ่มเดียวเรียงยาว
  compact = false,
}) {
  const set = (key) => (value) => onPatch({ [key]: value });

  return (
    <>
      {/* ── ช่องทางที่รับลีด — ตัวกำหนดบริบทของทั้งใบ จึงอยู่บนสุด
          (docs/form-design-rules.md §1) · 8 ตัวตายตัวแบ่ง 3 กลุ่มที่มีสีประจำอยู่แล้ว
          (CHANNEL_GROUP_COLORS) ⇒ ชิปจัดกลุ่ม ไม่ใช่ดรอปดาวน์แบนที่ทิ้งกลุ่มไป
          เดิมเป็นเรดิโอเรียงคอลัมน์ = ภาษาเดียวที่เหลืออยู่ในระบบ */}
      <div className="form-field span-2">
        <span className="form-field-label">ช่องทางที่รับลีด <span className="required-mark">*</span></span>
        <div className={compact ? "lead-channel-groups is-compact" : "lead-channel-groups"}>
          {Object.entries(CHANNEL_GROUP_LABELS).map(([group, groupLabel]) => (
            <div className="lead-channel-group" key={group} data-group={group}>
              <span className="lead-channel-group-name">{groupLabel}</span>
              <ChoiceChips
                value={form.channel || ""}
                onChange={set("channel")}
                disabled={disabled}
                ariaLabel={`ช่องทาง ${groupLabel}`}
                options={LEAD_CHANNELS.filter((c) => channelGroupOf(c) === group)
                  .map((c) => ({ value: c, label: LEAD_CHANNEL_LABELS[c] }))}
              />
            </div>
          ))}
        </div>
      </div>

      <label className="form-field">
        <span className="form-field-label">{CUSTOMER_NAME_LABEL} <span className="required-mark">*</span></span>
        <input className="premium-input" value={form.contactName || ""} disabled={disabled}
          onChange={(e) => set("contactName")(e.target.value)} required />
      </label>
      <label className="form-field">
        <span className="form-field-label">บริษัท / แบรนด์</span>
        <input className="premium-input" value={form.company || ""} disabled={disabled}
          onChange={(e) => set("company")(e.target.value)} />
      </label>

      <label className="form-field">
        <span className="form-field-label">เบอร์โทร</span>
        <PhoneInput value={form.phone || ""} disabled={disabled} onChange={set("phone")} />
      </label>
      <label className="form-field">
        <span className="form-field-label">อีเมล</span>
        <input type="email" className="premium-input" value={form.email || ""} disabled={disabled}
          onChange={(e) => set("email")(e.target.value)} />
      </label>
      <label className="form-field span-2">
        <span className="form-field-label">ช่องทางติดต่ออื่น <span className="soft">(LINE ID ฯลฯ)</span></span>
        <input className="premium-input" value={form.contactChannel || ""} disabled={disabled}
          onChange={(e) => set("contactChannel")(e.target.value)} placeholder="LINE ID ฯลฯ" />
      </label>

      {/* บริการที่สนใจ 4 ตัวตายตัว ⇒ แผ่นเลือก · สองตัวที่ต้องระบุต่อมีคำกำกับในแผ่น
          ⇒ คนเห็นตั้งแต่ก่อนกดว่าเลือกแล้วจะมีช่องงอก (ช่องเงื่อนไขอยู่ใต้ตัวที่ทำให้โผล่) */}
      <div className="form-field span-2">
        <span className="form-field-label">ประเภทบริการที่สนใจ <span className="required-mark">*</span></span>
        <OptionTiles
          value={form.serviceInterest || ""}
          onChange={set("serviceInterest")}
          disabled={disabled}
          ariaLabel="ประเภทบริการที่สนใจ"
          options={SERVICE_INTERESTS.map((s) => ({
            value: s,
            label: SERVICE_INTEREST_LABELS[s].replace(/\s*\(.*\)$/, ""),
            description: SERVICE_DETAIL_REQUIRED.has(s) ? "ต้องระบุรายละเอียด" : undefined,
          }))}
        />
      </div>
      {SERVICE_DETAIL_REQUIRED.has(form.serviceInterest) && (
        <label className="form-field span-2">
          <span className="form-field-label">รายละเอียดบริการ <span className="required-mark">*</span></span>
          <input className="premium-input" value={form.serviceDetail || ""} disabled={disabled}
            onChange={(e) => set("serviceDetail")(e.target.value)}
            placeholder={form.serviceInterest === "product" ? "ระบุสินค้าที่สนใจ" : "ระบุ"} />
        </label>
      )}

      <label className="form-field">
        <span className="form-field-label">งบประมาณ <span className="soft">(บาท)</span></span>
        <MoneyInput value={form.budget} disabled={disabled} onChange={(value) => set("budget")(value ?? "")} />
      </label>

      <label className="form-field span-2">
        <span className="form-field-label">รายละเอียดเพิ่มเติม</span>
        <Textarea rows={3} value={form.details || ""} disabled={disabled}
          onChange={(e) => set("details")(e.target.value)} />
      </label>
    </>
  );
}
