// ── ประเมินจากแบบ งวด 4 — "ฝ่ายขายยื่นมาแบบไหน" (S4 §2.5 · แผน §3.1) ─────────────────────────
//
// ⭐ **pure · ใช้ได้ทั้งเบราว์เซอร์และ server** — ไม่อ่านสวิตช์ ไม่แตะฐานข้อมูล · สวิตช์ `SURVEY_DRAWING_METHOD`
//    อ่านที่ route ใต้ `src/app/api/` เท่านั้น (`surveyDrawingMethodEnabled()`) แล้วส่งค่าบูลีนเข้ามาที่นี่
//
// 🔴 **`variant` = สิ่งที่ฝ่ายขายขอ ไม่ใช่วิธีปัจจุบัน** — หัวหน้า TS สลับวิธีรายพื้นที่ได้หลังรับเรื่อง (S2a)
//    ⇒ ด่าน · ขั้นคิว · ราง · กระดาษ อ่านแถวพื้นที่ (`surveyNeedsVisit`) เสมอ · ไฟล์นี้ตอบได้แค่
//    "ฝ่ายขายขออะไร" (บรรทัด `ฝ่ายขายขอ: ประเมินจากแบบ`) กับ "ผู้ขออยากให้เข้าวันไหน"
//
// 🔴 **ใบที่ยื่นเป็นประเมินจากแบบ เก็บ `requestedDueDate` = กระจกของวันรับผล** (คอลัมน์ต้องมีค่า ·
//    `requestNormalizeDates`) ⇒ `surveyWishedVisit` คือ **ตัวอ่านเดียว** ของ "วันที่อยากให้เข้าพื้นที่"
//    ทุก view-model และภาพนิ่งของกระดาษ — อ่านคอลัมน์นั้นตรง ๆ เมื่อไร วันรับผลจะกลายเป็นวันนัดที่ไม่มีใครขอ
//
// ⚠️ import ได้ตัวเดียว: `surveyMethodSwitch.js` (pure) — ห้ามดึง `survey.js` หรือไฟล์กระดาษเข้ามา
//    (`surveyReportSnapshot.js` import ไฟล์นี้ · วงจร import = ค่าเป็น undefined ตอนโหลดโดยไม่มี error)
import { SURVEY_METHOD_CHIP, SURVEY_METHOD_ERRORS } from '@/lib/service/surveyMethodSwitch';

export const SURVEY_VARIANT_DRAWING = 'drawing';

export const SURVEY_SALES_ASKED = Object.freeze({
  label: 'ฝ่ายขายขอ',
  value: 'ประเมินจากแบบ',
  line: 'ฝ่ายขายขอ: ประเมินจากแบบ',
});

export const SURVEY_NO_VISIT_WISH_TEXT = 'ยังไม่ได้ระบุ (ยื่นเป็นประเมินจากแบบ) — ดูเธรด';
export const SURVEY_NO_VISIT_WISH_LINE = `ผู้ขออยากให้เข้า: ${SURVEY_NO_VISIT_WISH_TEXT}`;

/* ร่างที่เปลี่ยนวิธี **เป็นจากแบบ** แล้วพื้นที่มีผลประเมินลงหน้างานอยู่ — ตีกลับ ไม่เขียนทับ (S4 §2.6 · surveyIntakeSeed.js)
   ⚠️ ทิศ "เป็นลงหน้างาน" ไม่ตีกลับแล้ว (O8 = ข · 19/10) — แถวที่มีผลถูกประทับให้วัดใหม่แทน
   สองประโยค หนึ่งประโยคต่อหนึ่งที่ที่พูด: ASSESSED = ตอนบันทึกร่าง · MISMATCH = ตอนกดส่ง */
export const SURVEY_RESEED_ASSESSED_ERROR = 'พื้นที่ของใบนี้มีผลประเมินบันทึกไว้แล้ว — เปลี่ยนวิธีประเมินจากฟอร์มนี้ไม่ได้ · ส่งคำร้องแล้วเปลี่ยนได้ที่ฝ่ายบริการ (หัวหน้า TS)';
export const SURVEY_RESEED_MISMATCH_ERROR = 'พื้นที่ของใบนี้มีผลประเมินจากวิธีเดิมบันทึกไว้ — กด “แก้ไข” แล้วเลือกวิธีประเมินเดิมก่อนส่งคำร้อง';

/* ⭐ มติเจ้าของ 19/10 (S4 O8 = ข) — ร่างที่ถูกตีกลับ แล้วฝ่ายขายสลับเป็นลงหน้างานทั้งที่พื้นที่จากแบบมีผลของหัวหน้าแล้ว:
   **รับการสลับ** แล้วประทับแถวนั้นว่า "สลับแล้ว" (`surveyIntakeSeed.js`) ⇒ ด่านขนาดของช่างบังคับบันทึกใหม่หลังสลับ
   ประโยคนี้ = `methodReason` ของแถวที่ประทับ · ตัวโหลดคิวใช้มันแยก "ฝ่ายขายสลับก่อนส่ง" ออกจาก "หัวหน้าสลับกลับ"
   (บรรทัด `หัวหน้าเปลี่ยนเป็นลงหน้างาน: …` ต้องไม่ขึ้นกับแถวที่หัวหน้าไม่ได้สลับ) · ≤ 300 ตัวอักษร (CHECK ของ mig 0408) */
export const SURVEY_INTAKE_SWITCH_REASON = 'ฝ่ายขายเปลี่ยนวิธีประเมินเป็นลงหน้างานก่อนส่งคำร้อง';

/* ราคาของการสลับข้างบน — ต่อท้ายกล่องยืนยันบนฟอร์ม เมื่อร่างมีพื้นที่ที่หัวหน้าประเมินจากแบบไว้แล้ว (UAT S4 รอบ 4 ข้อ 7)
   ⚠️ ผลเดิมไม่ถูกลบ (ช่างวัดทับ) แต่ไม่ถูกใช้เป็นผลของใบอีก ⇒ บอกก่อนกด ไม่ใช่ให้ไปเจอที่ป้าย "รอวัดใหม่" ทีหลัง */
export const SURVEY_INTAKE_SWITCH_NOTE = 'ผลประเมินจากแบบของหัวหน้า TS ที่มีอยู่จะไม่ถูกใช้ — ทุกพื้นที่ต้องวัดที่หน้างานใหม่';

/* ป้ายของแถวที่ถูกตราข้างบน บนตารางพื้นที่ของหน้าคำร้อง — ตัวเลขในแถวยังเป็นของหัวหน้า (จากแบบ) จนกว่าช่างจะบันทึกทับ
   (ค่าตั้งต้น A ของคำถามเจ้าของ · UAT S4 รอบ 4 ข้อ 17) · คำแรกเป็นคำเดียวกับป้ายวิธี ("จากแบบ") */
export const SURVEY_INTAKE_REMEASURE_CHIP = `${SURVEY_METHOD_CHIP.drawing} · รอวัดใหม่`;

/* คำของรายการพื้นที่บนฟอร์มฝ่ายขาย: 'measure' = ข้อความวันนี้ · 'assess' = ฟอร์มที่เลือกประเมินจากแบบ
   (ฟอร์มที่บอกว่าไม่มีใครไป ต้องไม่พูดว่า "วัดซ้ำ" / "ไม่เคยวัด") */
export const SURVEY_ZONE_REPEAT_TEXT = Object.freeze({ measure: 'วัดซ้ำพื้นที่เดิม', assess: 'ประเมินซ้ำพื้นที่เดิม' });
/* พื้นที่เดิมในทะเบียนที่ **ยังไม่เคยมีผล** — "…ซ้ำ" จะขัดกับไทล์ที่เพิ่งบอก "ยังไม่เคยวัด/ประเมิน" (UAT S4 รอบ 4 ข้อ 5) */
export const SURVEY_ZONE_KNOWN_TEXT = 'พื้นที่เดิมในทะเบียน';

export function surveyZoneWording(variant) {
  return variant === SURVEY_VARIANT_DRAWING ? 'assess' : 'measure';
}

/* บรรทัดรองของแถวพื้นที่เดิมที่ติ๊กแล้ว — "ซ้ำ" เฉพาะเมื่อทะเบียนบอกว่าพื้นที่นั้นเคยมีผล
   ⭐ ข้อมูลชุดเดียวกับที่ไทล์ใช้พิมพ์ "ยังไม่เคย…" (`surveyedAt` ของแถวทะเบียน · `zonePickState`) ⇒ สองที่พูดตรงกันเสมอ
   ⚠️ แถวทะเบียนยังไม่มา (โหลดไม่สำเร็จ) = ไม่รู้ ⇒ คำกลาง ไม่เดาว่า "ซ้ำ" */
export function surveyZoneRowText(wording, registryZone) {
  return registryZone?.surveyedAt
    ? (SURVEY_ZONE_REPEAT_TEXT[wording] || SURVEY_ZONE_REPEAT_TEXT.measure)
    : SURVEY_ZONE_KNOWN_TEXT;
}

/* ใบนี้ฝ่ายขายยื่นเป็น "ประเมินจากแบบ" ไหม — แถวที่ไม่มี `kind` ติดมา (แถวคิวของฝ่ายบริการ ซึ่งเป็น
   ประเมินพื้นที่ทุกแถว) ตัดสินจาก `variant` อย่างเดียว */
export function surveyFiledAsDrawing(request) {
  if (!request) return false;
  if (request.kind != null && request.kind !== 'site_survey') return false;
  return request.variant === SURVEY_VARIANT_DRAWING;
}

// บรรทัด "ฝ่ายขายขอ: ประเมินจากแบบ" — ⚠️ ไม่มีบรรทัดคู่ของลงหน้างาน (ใบส่วนใหญ่ = noise ทุกแถว)
export function surveySalesAskedLine(request) {
  return surveyFiledAsDrawing(request) ? SURVEY_SALES_ASKED.line : null;
}

/* วันที่ผู้ขออยากให้เข้าพื้นที่ — `{ known, date, time }`
   ยื่นเป็นประเมินจากแบบ ⇒ ไม่รู้เสมอ (คอลัมน์ถือกระจกของวันรับผล ไม่ใช่วันที่ใครขอให้เข้า) */
export function surveyWishedVisit(request) {
  if (surveyFiledAsDrawing(request)) return { known: false, date: '', time: '' };
  const date = request?.requestedDueDate || '';
  return { known: !!date, date, time: request?.requestedDueTime || '' };
}

// วิธีที่ฟอร์มต้องซ่อน — สวิตช์เปิด (`true` เท่านั้น) = ไม่ซ่อนอะไร
export function surveyVariantsOff(enabled) {
  return enabled === true ? [] : [SURVEY_VARIANT_DRAWING];
}

/* ด่านฝั่ง server ตอนสร้าง/แก้ใบ: ขอประเมินจากแบบขณะสวิตช์ปิด = ตีกลับ
   ⚠️ ใบที่ถือค่านี้อยู่แล้ว (`current`) บันทึกต่อได้ — สวิตช์ที่ถูกปิดทีหลังต้องไม่ทำให้ร่างเดิมแก้ไม่ได้ */
export function surveyVariantRefusal({ variant, enabled, current } = {}) {
  if (variant !== SURVEY_VARIANT_DRAWING || enabled === true || current === SURVEY_VARIANT_DRAWING) return null;
  return SURVEY_METHOD_ERRORS.off;
}
