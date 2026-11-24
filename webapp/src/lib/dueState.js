// ── วันกำหนด / เลยกำหนด — ตัวกลางของทุกจอ (งวด 2 · docs/due-overdue-system.md) ─────────────────────────
//
// ⭐ **ที่เดียวที่แปลง "วันกำหนด + วันนี้" เป็นสถานะ คำ และสี** — ก่อนงวดนี้ ~70 จุดคิดเอง ~10 ตัวช่วยนับวัน
//    (UTC บ้าง เที่ยงคืนเครื่องบ้าง ชั่วโมง/24 บ้าง) และพูดคนละคำ ("เลย n วัน" · "เลยกำหนดมา n วัน" · "เกินกำหนด" ·
//    "ใกล้ครบกำหนด" · "ค้างมา n วัน") ⇒ จอสองจอบอกคนละเรื่องกับของชิ้นเดียวกัน
//
// ⭐ **มติเจ้าของ 23/11/2026**
//    · คำชุด "เลยกำหนด": `เลยกำหนด N วัน` (แดง) · `ครบกำหนดวันนี้` (เหลือง) · `อีก N วัน` · `ค้าง N วัน` (อายุงาน)
//    · ช่วงเตือนล่วงหน้า (เหลือง) มาตรฐาน **3 วัน** (`DUE_SOON_DAYS`) — ยกเว้นของที่หมดอายุ (น้ำหอม 14 · ต่อรอบบริการ 30/90)
//      ซึ่งส่ง `soonDays` ของตัวเอง
//    · "ใครค้าง / ใบจบหรือยัง" ไม่ใช่งานของไฟล์นี้ — ผู้เรียกตัดสินก่อน (เช่น `requestDueOwed` · `installmentOverdue`)
//      แล้วส่งเฉพาะวันที่ยังเป็นคำสัญญาอยู่เข้ามา · ไม่มีวัน = `none`
//
// ⚠️ **วันไทยล้วน** — `today` ต้องมาจาก `businessDate()` (หรือ `useThaiToday()` ในจอ) · ค่า timestamp ผ่าน `thaiDay` ก่อนเสมอ
//    เลขคณิตเป็นปฏิทินล้วน (`T00:00:00Z` ทั้งสองฝั่ง) จึงไม่ขึ้นกับโซนเวลาของเครื่องที่รัน
import { businessDayKey } from '@/lib/datePeriods';

/** เตือนล่วงหน้ากี่วัน (เหลือง) — มาตรฐานทั้งระบบ (มติเจ้าของ 23/11/2026) */
export const DUE_SOON_DAYS = 3;

const DAY_MS = 86400000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** วันไทย `YYYY-MM-DD` ของค่าวันล้วนหรือ timestamp — null เมื่ออ่านไม่ออก */
export function thaiDay(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : businessDayKey(value.toISOString());
  const text = String(value).trim();
  if (ISO_DAY.test(text)) return text;
  return businessDayKey(text);
}

/** จำนวนวันปฏิทินจาก `from` ถึง `to` (บวก = `to` อยู่หลัง) — null เมื่อวันใดวันหนึ่งอ่านไม่ออก */
export function calendarDays(from, to) {
  const a = thaiDay(from);
  const b = thaiDay(to);
  if (!a || !b) return null;
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/**
 * สถานะของวันกำหนดเทียบวันนี้ — `{ key, days }`
 *   · `late`  = เลยแล้ว (`days` < 0) · `today` = ครบวันนี้ · `soon` = อีก 1..soonDays วัน · `later` = ไกลกว่านั้น
 *   · `none`  = ไม่มีวัน / ไม่รู้วันนี้ (เฟรมแรกก่อน effect) — ไม่ตัดสิน ไม่ใช่ "ยังไม่ถึง"
 * ⚠️ วันครบกำหนดเองยังไม่ "เลย" (เทียบ `<` ไม่ใช่ `<=`) — กติกาเดียวทั้งระบบ
 */
export function dueState(due, today, { soonDays = DUE_SOON_DAYS } = {}) {
  const days = calendarDays(today, due);
  if (days === null) return { key: 'none', days: null };
  if (days < 0) return { key: 'late', days };
  if (days === 0) return { key: 'today', days };
  if (days <= soonDays) return { key: 'soon', days };
  return { key: 'later', days };
}

/** คำของสถานะ — `เลยกำหนด N วัน` · `ครบกำหนดวันนี้` · `อีก N วัน` · `none` = null */
export function dueText(state) {
  if (!state || state.days == null) return null;
  if (state.key === 'late') return `เลยกำหนด ${Math.abs(state.days)} วัน`;
  if (state.key === 'today') return 'ครบกำหนดวันนี้';
  return `อีก ${state.days} วัน`;
}

/** โทน (ตรงกับ `StatusBadge` · `data-tone`) — แดง = เลย · เหลือง = ครบวันนี้/ใกล้ · ที่เหลือเป็นกลาง */
export function dueTone(state) {
  if (state?.key === 'late') return 'danger';
  if (state?.key === 'today' || state?.key === 'soon') return 'warning';
  return 'neutral';
}

/** ทางลัด: วัน + วันนี้ → `{ key, days, text, tone }` */
export function dueInfo(due, today, opts) {
  const state = dueState(due, today, opts);
  return { ...state, text: dueText(state), tone: dueTone(state) };
}

/**
 * อายุงาน "ค้าง N วัน" — นับจาก `since` (วันหรือ timestamp) ถึงวันนี้ · วันเดียวกัน = "วันนี้"
 * ⚠️ คนละคำถามกับวันกำหนด: ไม่มีใครรับปากวันไหน แค่บอกว่าของรออยู่นานแค่ไหน — ผู้เรียกเลือกเกณฑ์แดงเอง
 */
export function ageDays(since, today) {
  const days = calendarDays(since, today);
  return days === null ? null : Math.max(0, days);
}

export function ageText(days) {
  if (days == null) return null;
  return days === 0 ? 'วันนี้' : `ค้าง ${days} วัน`;
}
