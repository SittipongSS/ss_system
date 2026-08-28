// ── ตัวกรองช่วงเวลาของหน้าภาพรวมภาษี ───────────────────────────────────────
//
// 🐞 ของเดิมเขียนอยู่ในหน้า `/tax` และเรียก `new Date()` **ตอนเรนเดอร์** สองที่
// (`isWithinRange`) ⇒ ผิดสองทางพร้อมกัน:
//   1. อ่านนาฬิกา **ของเครื่องผู้ใช้** ไม่ใช่เวลาไทย — เครื่องที่ตั้งโซนเวลาอื่น
//      (หรือเปิดค้างข้ามเที่ยงคืน) จะได้ "เดือนนี้/ไตรมาสนี้" คนละช่วงกับคนอื่น
//   2. อ่านนาฬิกาตอนเรนเดอร์ = ค่าขยับระหว่างเรนเดอร์ และเทสต์ผูกกับวันที่รันเทสต์
// ⇒ "วันนี้" ต้องส่งเข้ามาเป็นวันไทย (`businessDate()`) เสมอ
//
// ⚠️ เทียบด้วย **สตริงวันไทย** ไม่ใช่ `new Date(...)` แล้วเทียบ getMonth() — timestamp
// ที่เก็บใน DB เป็น UTC ของจริงที่เจอ: `2026-08-01T02:00:00Z` = 1 ส.ค. ตามไทย
// แต่ 31 ก.ค. ตาม UTC ⇒ แถวต้นเดือนจะหลุดจากตัวกรอง "เดือนนี้" เงียบ ๆ

import { businessDate } from '@/lib/businessDate';

export const PERIODS = [
  { key: 'all', label: 'ทั้งหมด (All Time)' },
  { key: 'month', label: 'เดือนนี้ (This Month)' },
  { key: 'quarter', label: 'ไตรมาสนี้ (This Quarter)' },
];

/** เดือนของวันไทย (YYYY-MM) */
export const monthOf = (iso) => (iso ? String(iso).slice(0, 7) : null);

/** ไตรมาสของวันไทย → "2026-Q3" */
export function quarterOf(iso) {
  const month = monthOf(iso);
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, mm] = month.split('-');
  return `${year}-Q${Math.floor((Number(mm) - 1) / 3) + 1}`;
}

/**
 * แถวนี้อยู่ในช่วงที่เลือกไหม
 *
 * @param value    จุดเวลาของแถว (timestamp หรือวัน) · ว่าง = **นับเข้าเสมอ**
 *                 (แถวที่ไม่มีวันที่ต้องไม่หายจากจอเพราะตัวกรอง — กับดักเดียวกับ
 *                  ตัวกรองปีของหน้าผู้บริหาร ที่เคยกลืนแถวไร้วันที่ทั้งหมด)
 * @param range    all | month | quarter
 * @param todayIso วันไทยวันนี้ (`businessDate()`)
 */
export function withinPeriod(value, range, todayIso) {
  if (!range || range === 'all') return true;
  if (!value) return true;
  const day = thaiDay(value);
  if (!day) return true;
  if (range === 'month') return monthOf(day) === monthOf(todayIso);
  if (range === 'quarter') return quarterOf(day) === quarterOf(todayIso);
  return true;
}

/* timestamp ที่เก็บใน DB เป็น UTC — ต้องแปลงเป็น "วันตามเวลาไทย" ก่อนเทียบเดือน
   ไม่ใช่ตัด 10 ตัวแรกของสตริง ISO ซึ่งคือวันตาม UTC */
function thaiDay(value) {
  const raw = String(value);
  // ค่าที่เป็นวันล้วนอยู่แล้ว (YYYY-MM-DD) ไม่ต้องแปลงโซนเวลา
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return businessDate(date);
}
