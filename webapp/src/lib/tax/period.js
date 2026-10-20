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

/* ── ช่วงเวลาของภาพรวม → ช่วงวันของคิว (ตรวจตัวเลข M7 · 20/10/2026) ─────────────────────
   🐞 เลือก "เดือนนี้" บน /tax แล้วการ์ด "ขึ้นทะเบียนแล้ว" บอกเลขของเดือนนี้ แต่กดแล้วคิวเปิดใบที่อนุมัติแล้ว **ทั้งหมดตลอดกาล**
      — ลิงก์ของการ์ดพาไปแค่ `?status=` · คิวมีช่อง "จาก–ถึง" อยู่แล้วแต่ไม่มีใครเติมให้
   ⇒ การ์ดพาช่วงวันไปด้วย (`taxQueueHref`) แล้วคิวกรองด้วย `withinDateRange` ซึ่งตัดสินด้วย **วันไทย** ตัวเดียวกับ
      `withinPeriod` ⇒ `rows.filter(withinPeriod(ช่วง))` = `rows.filter(withinDateRange(periodRange(ช่วง)))` เป๊ะ (เทสต์ล็อกไว้)
   ⚠️ ปุ่มโหลด Excel/พิมพ์ของคิวส่ง from/to เดียวกันขึ้น server ⇒ `lib/tax/reports.js` ต้องใช้ตัวตัดสินตัวนี้ด้วย
      ไม่งั้นจอกับไฟล์ได้คนละชุด (มติ §3.1 "ปุ่มโหลดทำงานกับสิ่งที่เห็นบนจอ") */

const pad2 = (n) => String(n).padStart(2, '0');
const isLeapYear = (year) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
// วันสุดท้ายของเดือน (1–12) — คิดจากปฏิทินล้วน ไม่สร้าง Date (ไม่มีโซนเวลาให้พลาด)
const lastDayOfMonth = (year, month) => [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

/**
 * ช่วงวันไทย (รวมหัวท้าย) ของตัวเลือกช่วงเวลา
 * @returns {{from: string, to: string} | null} `null` = ทั้งหมด (ไม่กรอง)
 */
export function periodRange(range, todayIso) {
  const month = monthOf(todayIso);
  if (!range || range === 'all' || !month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, mm] = month.split('-').map(Number);
  if (range === 'month') {
    return { from: `${month}-01`, to: `${month}-${pad2(lastDayOfMonth(year, mm))}` };
  }
  if (range === 'quarter') {
    const first = Math.floor((mm - 1) / 3) * 3 + 1;
    const last = first + 2;
    return { from: `${year}-${pad2(first)}-01`, to: `${year}-${pad2(last)}-${pad2(lastDayOfMonth(year, last))}` };
  }
  return null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** ค่า from/to จาก URL — รับเฉพาะ YYYY-MM-DD (ค่าพิมพ์ผิดต้องไม่กลายเป็นตัวกรองที่ทำให้คิวว่างเงียบ ๆ) */
export const dayParam = (value) => (ISO_DAY.test(String(value || '')) ? String(value) : '');

/**
 * แถวนี้อยู่ในช่วงวันที่ (รวมหัวท้าย) ไหม — ตัดสินด้วย **วันไทย** ของค่า
 *
 * ⚠️ กติกาแถวไม่มีวันที่ = นับเข้าเสมอ (เหมือน `withinPeriod`) — ทั้งตารางคิวและไฟล์ที่โหลดใช้ตัวนี้ตัวเดียว
 * @param value จุดเวลาของแถว (timestamp UTC หรือวัน YYYY-MM-DD)
 * @param from  วันไทยเริ่ม (YYYY-MM-DD) · ว่าง = ไม่มีขอบล่าง
 * @param to    วันไทยสุดท้าย (YYYY-MM-DD) · ว่าง = ไม่มีขอบบน
 */
export function withinDateRange(value, from, to) {
  if (!from && !to) return true;
  if (!value) return true;
  const day = thaiDay(value);
  if (!day) return true;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/**
 * ลิงก์ของการ์ด KPI บนภาพรวม → คิว พร้อมช่วงวันของตัวเลือกช่วงเวลา
 * ⚠️ ทั้งหมด (`all`) = ไม่ส่ง from/to · แถบ "ค้างเกินเกณฑ์" **ไม่ใช้ตัวนี้** (มติ 19/10 ไม่ขึ้นกับช่วงเวลา)
 */
export function taxQueueHref(path, status, range, todayIso) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const span = periodRange(range, todayIso);
  if (span) {
    params.set('from', span.from);
    params.set('to', span.to);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
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
