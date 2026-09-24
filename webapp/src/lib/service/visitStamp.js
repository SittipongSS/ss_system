// ── ประทับเวลาเข้าจริงของนัด ที่ server (มติ 2026-08-02 ข้อ 5) ─────────────
//
// ⭐ ปุ่ม "เริ่มงาน"/"ส่งงาน"/"ปิดงาน" ไม่ได้เพิ่มข้อมูลใหม่ มันทำให้ช่องที่มีอยู่แล้วเชื่อถือได้ ·
//    เวลามาจาก **นาฬิกาไทยของ server** (businessDate/businessTimeKey) ไม่ใช่นาฬิกามือถือ
//    ⚠️ ตารางเก็บ date + time แยกกันเป็นเวลาไทยล้วน (mig 0187/0188) ไม่ใช่ timestamptz
//
// 🐞 **ปิดงานข้ามวันพัง** (มติเจ้าของ 24/09 ข้อ 4 · ใช้กับนัดทุกชนิด) — เดิมประทับแค่ "เวลาจบ"
//    แล้ววันยังเป็น `actualDate` (วันที่กดเริ่ม) ⇒ เริ่ม 24/09 14:00 ส่งงาน 25/09 09:00 = 14:00 → 09:00
//    ฐานตีกลับด้วย CHECK ที่เทียบเวลาอย่างเดียว (0300) · เริ่ม 09:00 จบวันถัดไป 10:00 ผ่านแต่กลายเป็น 1 ชม.
//    ⇒ เก็บ **วันที่เสร็จจริง** (`actualEndDate` · mig 0386) เมื่อไม่ใช่วันเดียวกับวันเข้า · NULL = วันเดียวกัน
//
// ⚠️ `hasEndDateColumn` = แถวที่อ่านมามีคอลัมน์ `actualEndDate` แล้ว (`'actualEndDate' in before`)
//    — โค้ดขึ้นก่อนรัน 0386 ได้: ยังไม่มีคอลัมน์ = ไม่ใส่คีย์นี้เลย ⇒ พฤติกรรมเดิมทุกอย่าง
//    (ใส่คีย์ที่ไม่มีคอลัมน์ = PostgREST ตีกลับทั้งคำขอ ⇒ ปิดงานวันเดียวกันพังตามไปด้วย)
import { businessDate } from '@/lib/businessDate';
import { businessTimeKey } from '@/lib/datePeriods';

/** คอลัมน์ที่ปุ่มจับเวลาเป็นเจ้าของ — ค่าพวกนี้บนคำขอที่เป็นปุ่มจับเวลามาจากแถวในฐานเท่านั้น */
const STAMPED_KEYS = ['actualStartTime', 'actualEndTime', 'actualEndDate'];

/**
 * ค่าที่ route ส่งเข้า `normalizeVisitInput` — `{ ...before, ...body }` แต่ **คำขอที่เป็นปุ่มจับเวลา**
 * (`stamp: 'start' | 'end'`) ใช้เวลาเข้าจริงของแถวในฐาน ไม่ใช่ของที่จอส่งมา
 *
 * 🐞 **แผ่นปิดงาน (งานวันนี้) ปิดงานไม่ได้เมื่อเริ่มช้ากว่าเวลานัดจบ** — แผ่นส่งฟอร์มทั้งก้อนมาด้วย
 *   (`closeFormDefaults` เคยเติมเวลาจบเป็นเวลานัดจบ) ⇒ นัด 08:00–10:00 กดเริ่ม 14:00 แล้วกดปิดงาน
 *   = ตัวตรวจเทียบ 14:00 กับ 10:00 ⇒ 400 "เวลาเริ่มต้องไม่หลังเวลาสิ้นสุด" ทั้งวันเดียวกันและข้ามวัน
 *   ทั้งที่ตัวประทับจะเขียนทับเวลาจบด้วย "ตอนนี้" อยู่แล้ว (ตรวจค่าที่กำลังจะถูกทิ้ง)
 * ⭐ เวลาเข้าจริงของปุ่มจับเวลามาจากนาฬิกา server ทางเดียว (มติ 2026-08-02 ข้อ 5) ⇒ ของที่จอส่งมาไม่มีความหมาย
 *   ⇒ ใช้ของในฐาน (เวลาเริ่มที่ประทับไว้ · ไม่มี = ตัวประทับเติม "ตอนนี้" ให้) แล้วให้ `stampVisitTimes` ประทับ
 * ⚠️ แถวที่ยังไม่มีคอลัมน์ (ฐานยังไม่รัน 0386) = ไม่มีคีย์นั้นเลย — ห้ามเติมคีย์ของคอลัมน์ที่ไม่มีอยู่
 */
export function stampVisitInput(before = {}, body = {}) {
  const input = { ...before, ...body };
  if (body?.stamp !== 'start' && body?.stamp !== 'end') return input;
  for (const key of STAMPED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(before || {}, key)) input[key] = before[key];
    else delete input[key];
  }
  return input;
}

/**
 * คืน patch ใหม่ที่ประทับเวลาแล้ว (ไม่แก้ของที่ส่งมา)
 *
 * @param patch             ค่าหลังผ่าน `normalizeVisitInput` แล้ว
 * @param stamp             'start' | 'end' | อื่น ๆ (= คำขอจากฟอร์มแก้ ไม่ประทับ)
 * @param nowIso            จุดเวลาที่กด (ISO)
 * @param hasEndDateColumn  ฐานมีคอลัมน์ `actualEndDate` แล้วหรือยัง (mig 0386)
 */
export function stampVisitTimes(patch = {}, { stamp = null, nowIso, hasEndDateColumn = false } = {}) {
  const next = { ...patch };
  /* ⭐ **กดเริ่ม = รอบทำงานใหม่** — วันกับเวลาเริ่มมาจากการอ่านนาฬิกาครั้งเดียวกัน และยังไม่มีเวลาจบ
     🐞 นัดที่ปิดข้ามวันแล้วถูกเปิดกลับ (ฟอร์มแก้นัดคืนสถานะ "นัดไว้") ยังถือวันเข้า/เวลาจบ/วันเสร็จของรอบเก่า
       ⇒ เดิมเก็บวันเข้าเก่าไว้ (`actualDate || วันนี้`) และไม่ล้างเวลาจบ ⇒ เริ่ม 28/09 10:00 จบ 12:00
       ถูกบันทึกเป็น 24/09 10:00 → 28/09 12:00 = งานสี่วันที่ไม่มีใครทำ */
  if (stamp === 'start') {
    next.actualDate = businessDate(nowIso);
    next.actualStartTime = businessTimeKey(nowIso);
    next.actualEndTime = null;
    if (hasEndDateColumn) next.actualEndDate = null;
    return next;
  }
  if (stamp !== 'end') return next;

  const today = businessDate(nowIso);
  const now = businessTimeKey(nowIso);
  next.actualDate = next.actualDate || today;
  next.actualEndTime = now;
  /* เผลอปิดงานโดยไม่เคยกดเริ่ม — ยังต้องมีเวลาเริ่มไว้คิดชั่วโมงงาน
     ⚠️ เวลาเริ่มที่เติมตรงนี้คือ "ตอนนี้" ⇒ เริ่ม = จบ ในนาทีเดียวกัน **ไม่ใช่งานข้ามวัน**
        ถึง `actualDate` จะเป็นวันนัดเก่า (ตัวตรวจเติมวันนัดให้ใบที่ปิด) ก็ห้ามบวกวันเสร็จ —
        ไม่งั้นได้งานที่ยาวหลายวันทั้งที่ไม่มีใครกดเริ่มเลย */
  const hadStart = !!next.actualStartTime;
  if (!hadStart) next.actualStartTime = now;
  if (hasEndDateColumn) {
    next.actualEndDate = hadStart && today > String(next.actualDate).slice(0, 10) ? today : null;
  }
  return next;
}
