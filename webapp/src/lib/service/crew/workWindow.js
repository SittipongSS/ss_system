// ── ช่วงวันของคิวงานช่าง — `my-visits` แบบมี from/to (แผน operation-crew §5 · S2) ─────────────
//
// ⭐ ขอบเท่าปฏิทินของช่าง (ย้อน 31 วัน · ล่วง 90 วัน · อดีตอ่านอย่างเดียว) · ช่วงเดียวยาวสุด 62 วัน
//    (ตารางเดือน 6 สัปดาห์ + ขอบ) — แถบวันของจอขอ วันนี้…+13 · ปฏิทินขอทีละเดือน
// ⚠️ ช่วงผิดรูป/ยาวเกิน = คำขอผิด (400) ไม่ใช่ตัดให้เงียบ ๆ — จอที่ขอผิดต้องรู้ตัว
// ⚠️ ทุกอย่างเป็นเลขคณิตของ **สตริงวัน** (`addDays`) — "วันนี้" ผู้เรียกส่งมาจาก `businessDate()` (นาฬิกาไทย)
import { addDays, isDayValue } from '@/lib/datePeriods';

export const MY_WORK_BACK_DAYS = 31;
export const MY_WORK_AHEAD_DAYS = 90;
export const MY_WORK_MAX_SPAN_DAYS = 62;

const spanDays = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/**
 * ช่วงวันของแบบใหม่ — คืน `{ from, to }` ที่บีบเข้าขอบแล้ว หรือ `{ error }` (ข้อความไทย)
 * ⚠️ บีบ **หลัง** ตรวจความยาว — ช่วงที่ขอถูกต้องแต่ล้นขอบ (เลื่อนปฏิทินไปเดือนสุดท้าย) ได้เฉพาะส่วนที่อยู่ในขอบ
 *    (ช่วงที่อยู่นอกขอบทั้งก้อนได้ `from > to` ⇒ query ช่วงวันคืนว่างเอง · ช่องค้างยังตอบตามจริง)
 */
export function myWorkWindow(rawFrom, rawTo, today) {
  // 🐞 review S2 28/09: `isDayValue` รับวันที่ไม่มีจริง (2026-02-30 · 2026-09-31) และ `Date.parse` ปัดข้ามเดือนเงียบ ๆ
  //    ⇒ ผ่านด่านความยาว แล้วคอลัมน์ `date` ของ Postgres ตีกลับเป็น 500 ภาษาอังกฤษ · วนผ่าน `addDays(…, 0)` ต้องได้ค่าเดิม
  if (!isDayValue(rawFrom) || !isDayValue(rawTo) || addDays(rawFrom, 0) !== rawFrom || addDays(rawTo, 0) !== rawTo) {
    return { error: 'ช่วงวันไม่ถูกต้อง — ต้องส่ง from และ to เป็น YYYY-MM-DD' };
  }
  if (rawFrom > rawTo) return { error: 'ช่วงวันไม่ถูกต้อง — from ต้องไม่หลัง to' };
  if (spanDays(rawFrom, rawTo) > MY_WORK_MAX_SPAN_DAYS) {
    return { error: `ช่วงวันยาวเกิน ${MY_WORK_MAX_SPAN_DAYS} วัน — ขอทีละเดือน` };
  }
  const min = addDays(today, -MY_WORK_BACK_DAYS);
  const max = addDays(today, MY_WORK_AHEAD_DAYS);
  return { from: rawFrom < min ? min : rawFrom, to: rawTo > max ? max : rawTo };
}
