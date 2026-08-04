// ── "ดีลใบไหนต้องย้ายเดือน FC" ────────────────────────────────────────────
//
// กติกาของบริษัท (มติผู้ใช้ 2026-08-05): เดือน FC ต้องสะท้อนความจริง — ดีลที่ไม่ปิด
// ตามเดือนที่คาดไว้ SA/AE ต้องเลื่อนเดือนเอง ระบบไม่ทบยอดข้ามเดือนให้
//
// ปัญหาคือ **ไม่มีอะไรบอกว่าใบไหนต้องเลื่อน** — ตรวจ prod 2026-08-05 เจอดีลที่ยัง
// เปิดอยู่ 144 ใบ ในนั้น **71 ใบ (≈6 ล้าน) ค้างเดือน FC ที่ผ่านไปแล้ว** (67 ใบค้าง
// จากเดือนก่อน อีก 4 ใบค้างมาตั้งแต่ 2025-09) ⇒ FC คงเหลือของเดือนเก่าไม่มีวันเคลียร์
// และ FC ของเดือนปัจจุบันต่ำกว่าความจริง
//
// โมดูลนี้เป็นตัวตัดสินที่เดียวให้ทั้ง **ป้ายในแถว · ตัวกรอง · แถบเตือนนับถอยหลัง**
// ใช้ร่วมกัน — ไม่งั้นสามที่จะนับ "เลยกำหนด" คนละแบบ
import { isClosedStage, monthKey } from '@/lib/salesPlanning';

/** จำนวนเดือนที่ห่างกันของ 'YYYY-MM' สองตัว (b - a) · ไม่รู้ = null */
export function monthsBetween(a, b) {
  const ma = monthKey(a);
  const mb = monthKey(b);
  if (!ma || !mb) return null;
  const [ya, moa] = ma.split('-').map(Number);
  const [yb, mob] = mb.split('-').map(Number);
  return (yb * 12 + mob) - (ya * 12 + moa);
}

/**
 * ดีลใบนี้ต้องเลื่อนเดือน FC ไหม
 * @param currentMonth 'YYYY-MM' ของวันนี้ (ผู้เรียกส่งมา — ห้ามอ่านนาฬิกาในนี้
 *   เพราะ React ห้ามเรียก Date ระหว่าง render และเทสต์ต้องคุมเวลาได้)
 * @returns { overdue, monthsLate, missing }
 *   overdue = เดือน FC ผ่านไปแล้วแต่ดีลยังเปิดอยู่ · missing = ยังไม่เคยระบุเดือน
 */
export function forecastDueState(deal, currentMonth) {
  const closed = isClosedStage(deal?.stage);
  const fc = monthKey(deal?.forecastMonth);
  if (closed) return { overdue: false, monthsLate: 0, missing: false };
  // ไม่มีเดือน FC = ต้องกรอกเหมือนกัน แต่คนละอาการกับ "เลยกำหนด" (แยกป้ายกัน)
  if (!fc) return { overdue: false, monthsLate: 0, missing: true };
  const late = monthsBetween(fc, currentMonth);
  if (late == null || late <= 0) return { overdue: false, monthsLate: 0, missing: false };
  return { overdue: true, monthsLate: late, missing: false };
}

export const isForecastOverdue = (deal, currentMonth) => forecastDueState(deal, currentMonth).overdue;

/** วันสุดท้ายของเดือนนั้น (จาก 'YYYY-MM-DD') */
export function daysLeftInMonth(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return Math.max(0, lastDay - d);
}

/* หน้าต่างทบทวน FC ก่อนขึ้นเดือนใหม่ (มติผู้ใช้ 2026-08-05): 7 วันสุดท้ายของเดือน
   ขึ้นแถบเตือนพร้อมนับถอยหลังทุกวัน — ให้ AE เคลียร์เดือน FC ก่อนตัวเลขปิดงวด */
export const FORECAST_REVIEW_DAYS = 7;

export function forecastReviewWindow(isoDate) {
  const left = daysLeftInMonth(isoDate);
  if (left == null) return { active: false, daysLeft: null };
  return { active: left <= FORECAST_REVIEW_DAYS, daysLeft: left };
}
