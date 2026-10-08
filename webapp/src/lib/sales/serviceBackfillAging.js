// ── "งานบริการของใบนี้ค้างมากี่วันแล้ว" — เลขคณิตของวัน + คำ (มติเจ้าของ 08/10 "ตามงานค้าง") ─────────────────────
//
// ⭐ **ทำไมมีไฟล์นี้**: ตรวจข้อมูลจริง 08/10 (อ่านอย่างเดียว) — ใบสายบริการที่อนุมัติแล้วแต่งานยังไม่ถึง TS มี 59 ใบ
//   (58 ใบยังไม่ยื่นตรวจ · 1 ใบรอผู้จัดการ) ค้างเฉลี่ย 27 วัน · มัธยฐาน 22 วัน · นานสุด 56 วัน และไม่มีจอไหนบอกว่าค้างมานานเท่าไร
//   ⇒ เจ้าของสั่ง "ตามงานค้าง": ชิป "ค้าง n วัน" บนทุกผิวที่บอกสถานะตั้งงานบริการย้อนหลังอยู่แล้ว
//   (ทะเบียน SO · คิวผู้จัดการ · หน้าใบ · แท็บ TS)
//
// ⭐ **ไฟล์ใบไม้** — เลขคณิต + คำ + ตัวเรียงเท่านั้น ไม่รู้จักใบสั่งขาย:
//   "ใครถืองานอยู่ · นาฬิกาเริ่มเดินเมื่อไร" ตัดสินที่ `serviceBackfillAging(order)` ของ `serviceSetup.js` ตัวเดียว
//   (ตัวนั้นถาม `serviceBackfillAwaitingReview` ได้ — ไฟล์อื่นห้ามอ่าน `serviceSetupState` เอง · D28)
//   🔴 ไฟล์นี้ **ห้าม import `serviceSetup.js`** — ทะเบียน SO ฝั่งจอดึงไฟล์นี้ไปใช้ (คำ + ตัวเรียง) โดยไม่พก serviceSetup.js ทั้งก้อน
//   และ `serviceSetup.js` import ไฟล์นี้ (ทิศเดียว ไม่มีวง · ยาม serviceSetupImports.test.mjs)
//
// 🔴 **วัน = วันในปฏิทินไทยเสมอ** (กฎของระบบ: "วันนี้" มาจากนาฬิกาไทย)
//   · วันของนาฬิกา = `businessDayKey(since)` — ห้ามตัดสตริง ISO (นั่นคือวันแบบ UTC: อนุมัติตี 00:30 เวลาไทย = เมื่อวานของ UTC)
//   · "วันนี้" = `todayIso` ที่ **ผู้เรียกส่งมา** (server ใช้ `businessDate()`) — ไฟล์นี้ไม่อ่านนาฬิกาเอง ⇒ เทสต์ได้ และผลเท่ากันทุกโซนเวลาของเครื่อง
//   · จำนวนวัน = ผลต่างของสองวันในปฏิทิน (ตรึงที่ `T00:00:00Z` ทั้งคู่ = เลขคณิตของปฏิทิน ไม่มีโซนเวลาเกี่ยว)
//
// ⚠️ ค่าคงที่ระดับบนสุดเป็น literal ทั้งหมด — `fmtNumber` / `fmtDate` ถูกอ่านในฟังก์ชันเท่านั้น (กฎ 16)
import { businessDayKey } from '@/lib/datePeriods';
import { fmtDate, fmtNumber } from '@/lib/format';

/* เกณฑ์ของโทน — ต่ำกว่า 7 วัน = กลาง · 7 วันขึ้นไป = โทนเตือนของระบบ (amber) · 30 วันขึ้นไป = โทนเตือน + ไอคอนนาฬิกาทรายนำหน้า
   (เดิมเป็นจุดนำ — ผลตรวจทาน 08/10: บนแท็บ TS ป้ายขั้นที่อยู่ข้าง ๆ มีจุดนำเสมอ ระดับ 30 วันจึงแยกจาก 7–29 วันไม่ออก)
   ⚠️ ไม่ใช้แดง: แดงของระบบคือ "ข้อผิดพลาด/ถูกตีกลับ" — งานค้างไม่ใช่ข้อผิดพลาดของฟอร์ม
   ⚠️ ไม่ใช้โทน accent: ตัวอักษร accent บนพื้น accent-soft คอนทราสต์ 2.84:1 (globals.css) — ไม่ผ่าน AA สำหรับตัวหนังสือของป้าย */
export const SERVICE_AGING_WARN_DAYS = 7;
export const SERVICE_AGING_LONG_DAYS = 30;

/* ⭐ คำของเรื่องนี้ทั้งหมด — จอ/route ไม่พิมพ์ "ค้าง" เอง
   chip           ป้ายบนแถว/แบนเนอร์/การ์ดราง · ศูนย์วัน = ไม่มีป้าย (ศูนย์วันไม่ใช่การค้าง — หลักเดียวกับ `requestAgeText`)
   title          คำบอกเมื่อชี้ที่ป้าย: งานอยู่ขั้นไหน นับจากวันไหน (วันไทย)
   rowLabel       คำข้างป้ายบนแถวทะเบียน SO — แถวนั้นมีกำหนดชำระอยู่ด้วย ป้าย "ค้าง n วัน" ลอย ๆ จะอ่านเป็นค้างชำระ
   summary        บรรทัดสรุปของคิว (คำอธิบายของแผงตอนเปิดปุ่ม "ยังไม่ตั้งงานบริการ" · โน้ตของแท็บ TS)
   sortLabel      ตัวเลือกในเมนูเรียงของทะเบียน SO
   🔴 **คำของฝั่ง `sales` บอก "ขั้น" ไม่บอก "คน"** (ผลตรวจทาน 08/10): ตัวตัดสินรู้แค่สองขั้น — ยื่นตรวจแล้ว (รอผู้จัดการ · พิสูจน์ได้จาก
      แถวใบ) กับ **ยังไม่ยื่นตรวจ** · ขั้นหลังไม่ได้แปลว่าฝ่ายขายลงมือได้เสมอ: ลูกค้าที่ยังไม่มีไซต์ในทะเบียน ฝ่ายขายเลือกโซนไม่ได้จนกว่า
      TS เพิ่มไซต์ (ข้อมูลจริง 08/10: 11 จาก 58 ใบ รวม 4 ใน 5 ใบที่ค้างนานสุด) และแถวใบไม่รู้เรื่องไซต์ ⇒ ห้ามเขียน "รอฝ่ายขาย" ที่นี่
      · "นับจาก" ไม่ใช่ "รอ…ตั้งแต่": นาฬิกาของใบเดิมเริ่มที่วันอนุมัติใบ ซึ่งมาก่อนวันที่เส้นตั้งย้อนหลังเปิดใช้ (29/09 · mig 0392) —
        คำบอกจึงบอกแค่ว่านับจากวันไหน ไม่อ้างว่ามีคนถูกรอมาตั้งแต่วันนั้น */
export const SERVICE_BACKFILL_AGING_TEXT = Object.freeze({
  chip: (days) => `ค้าง ${fmtNumber(days)} วัน`,
  title: Object.freeze({
    sales: (since) => `ยังไม่ยื่นตรวจงานบริการ · นับจาก ${fmtDate(since)}`,
    manager: (since) => `รอผู้จัดการฝ่ายขายตรวจตั้งแต่ ${fmtDate(since)}`,
  }),
  rowLabel: Object.freeze({ sales: 'งานบริการ · ยังไม่ยื่นตรวจ', manager: 'งานบริการ · รอผู้จัดการตรวจ' }),
  summary: (count) => `งานบริการที่ยังไม่ส่ง TS ${fmtNumber(count)} ใบ`,
  summaryLongest: (days) => ` · ค้างนานสุด ${fmtNumber(days)} วัน`,
  sortLabel: 'งานบริการค้างนานสุด',
});

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

/* รับเฉพาะสตริงที่มีค่า — `Date.parse(0)` / `Date.parse(123)` อ่านเลขเป็น "ปี" แล้วได้วันจริงออกมา (ไม่ใช่ NaN) */
const clockOf = (value) => (typeof value === 'string' && value ? value : null);
const instantOf = (value) => {
  const clock = clockOf(value);
  const ms = clock ? Date.parse(clock) : NaN;
  return Number.isFinite(ms) ? ms : null;
};

/**
 * จุดเวลาที่ **เกิดทีหลังสุด** ของชุด → คืนสตริงตัวเดิมที่ส่งมา (ไม่แปลงรูป) · ค่าว่าง/อ่านไม่ออกถูกข้าม · ไม่มีเลย = null
 * เทียบกันด้วยจุดเวลา ไม่ใช่ตัวอักษร ("…+07:00" กับ "…Z" ของจุดเวลาเดียวกันเรียงตามตัวอักษรไม่ได้) · เท่ากัน = ตัวแรกที่เจอ
 */
export function latestTimestamp(values) {
  let best = null;
  let bestMs = null;
  for (const value of Array.isArray(values) ? values : []) {
    const ms = instantOf(value);
    if (ms === null) continue;
    if (bestMs === null || ms > bestMs) { best = value; bestMs = ms; }
  }
  return best;
}

/**
 * จำนวนวันในปฏิทินไทยจากวันของ `since` ถึง `todayIso` — จำนวนเต็ม ≥ 0 หรือ null (ไม่มีนาฬิกา · ไม่มีวันนี้ · อ่านไม่ออก)
 * @param since    จุดเวลา (สตริง timestamptz จากฐาน)
 * @param todayIso วันนี้ตามเวลาไทย 'YYYY-MM-DD' (`businessDate()` ของ server)
 * ⚠️ นาฬิกาที่อยู่หลังวันนี้ (เครื่องเดินไม่ตรง) = 0 ไม่ติดลบ
 */
export function serviceAgingDays(since, todayIso) {
  const clock = clockOf(since);
  const sinceDay = clock ? businessDayKey(clock) : null;
  if (!sinceDay || typeof todayIso !== 'string' || !DAY_KEY.test(todayIso)) return null;
  const from = Date.parse(`${sinceDay}T00:00:00Z`);
  const to = Date.parse(`${todayIso}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

function levelOf(days) {
  if (days === null || days < 1) return 'none';
  if (days >= SERVICE_AGING_LONG_DAYS) return 'long';
  if (days >= SERVICE_AGING_WARN_DAYS) return 'warn';
  return 'fresh';
}

/**
 * ⭐ ก้อน "ค้างมานานเท่าไร" ที่ทุกผิววาดจากตัวเดียว
 *   `{ waitingOn, since, sinceDay, days, level, tone, strong, label, title }`
 *   waitingOn 'sales' | 'manager' — งานอยู่ขั้นไหน: 'manager' = ยื่นตรวจแล้ว รอผู้จัดการ · 'sales' = **ยังไม่ยื่นตรวจ**
 *             (⚠️ ไม่ได้พิสูจน์ว่าฝ่ายขายลงมือได้ — ลูกค้าที่ไม่มีไซต์ในทะเบียนติดที่ TS · ดูหัวแคตตาล็อกคำ)
 *   since     ค่าดิบของคอลัมน์ที่นาฬิกาเริ่มเดิน (หรือ null) · sinceDay = วันไทยของมัน
 *   days      วันในปฏิทินไทย ≥ 0 · null = ไม่มีนาฬิกา หรือผู้เรียกไม่ส่ง "วันนี้"
 *   level     'none' (ไม่มีนาฬิกา/วันเดียวกัน) | 'fresh' (1–6) | 'warn' (7–29) | 'long' (≥ 30)
 *   tone      'neutral' | 'warning' · strong = true เฉพาะ 'long' (ชิปวาดไอคอนนาฬิกาทรายนำหน้า — สัญญาณที่ไม่พึ่งสี
 *             และไม่ซ้ำกับจุดนำของป้ายขั้นที่อยู่ข้าง ๆ บนแท็บ TS)
 *   label     "ค้าง n วัน" เมื่อ days ≥ 1 · ไม่งั้น null (**วันเดียวกัน = ไม่มีป้าย**)
 *   title     คำบอกของป้ายเมื่อรู้วันเริ่ม · ไม่งั้น null
 */
export function serviceAgingOf({ waitingOn, since } = {}, todayIso = null) {
  const who = waitingOn === 'manager' ? 'manager' : 'sales';
  const clock = clockOf(since);
  const sinceDay = clock ? businessDayKey(clock) : null;
  const days = serviceAgingDays(clock, todayIso);
  const level = levelOf(days);
  return {
    waitingOn: who,
    since: clock,
    sinceDay,
    days,
    level,
    tone: level === 'warn' || level === 'long' ? 'warning' : 'neutral',
    strong: level === 'long',
    label: level === 'none' ? null : SERVICE_BACKFILL_AGING_TEXT.chip(days),
    title: sinceDay ? SERVICE_BACKFILL_AGING_TEXT.title[who](clock) : null,
  };
}

/**
 * ตัวเทียบ "ค้างนานสุดก่อน" — นาฬิกาที่เริ่มก่อนอยู่หน้า · ไม่มีก้อน/ไม่มีนาฬิกา/อ่านไม่ออก อยู่ท้าย · เท่ากัน = 0
 * ⚠️ เทียบจากจุดเวลาเริ่ม ไม่ใช่จากจำนวนวัน ⇒ ไม่ต้องรู้ "วันนี้" และใบที่ค้างวันเดียวกันยังเรียงตามเวลาที่เริ่มจริง
 */
export function compareLongestWaiting(a, b) {
  const x = instantOf(a?.since);
  const y = instantOf(b?.since);
  if (x === null || y === null) return x === y ? 0 : (x === null ? 1 : -1);
  return x === y ? 0 : (x < y ? -1 : 1);
}

/**
 * เรียง "ค้างนานสุดก่อน" **เฉพาะแถวที่มีก้อนอายุ** แล้ววางกลับลงช่องเดิมของแถวพวกนั้น — แถวอื่นอยู่ที่เดิมทุกแถว
 * ใช้กับคิวผสม (คิวผู้จัดการ: ใบรออนุมัติ + งานบริการรอตรวจ) ⇒ ใบรออนุมัติไม่ถูกดันออกจากพรีวิว 3 แถวแรก
 * @param agingOf (row) => ก้อนอายุ หรือ null (แถวที่ไม่ร่วมเรียง) · คืน array ใหม่ ไม่แก้ตัวที่ส่งมา · ลำดับเดิมคงไว้เมื่อเท่ากัน
 */
export function longestWaitingFirst(rows, agingOf) {
  const list = Array.isArray(rows) ? rows : [];
  const slots = [];
  const picked = [];
  list.forEach((row, index) => {
    const aging = agingOf(row);
    if (!aging) return;
    slots.push(index);
    picked.push({ row, aging, order: picked.length });
  });
  picked.sort((a, b) => compareLongestWaiting(a.aging, b.aging) || a.order - b.order);
  const out = [...list];
  slots.forEach((index, i) => { out[index] = picked[i].row; });
  return out;
}

/**
 * บรรทัดสรุปของคิว — "งานบริการที่ยังไม่ส่ง TS n ใบ · ค้างนานสุด n วัน" · ไม่มีใบ = null (ไม่วาดอะไร)
 * @param count  จำนวนใบของคิว (ผู้เรียกนับเอง — ฐานเดียวกับป้ายตัวเลขที่จอมีอยู่แล้ว)
 * @param agings ก้อนอายุของใบในคิว (null/ไม่มีนาฬิกาถูกข้าม) · ไม่มีใบไหนค้างถึง 1 วัน = ไม่มีท่อนหลัง
 */
export function serviceAgingSummaryText(count, agings) {
  const n = Number(count) || 0;
  if (n <= 0) return null;
  let max = null;
  for (const aging of Array.isArray(agings) ? agings : []) {
    const days = aging?.days;
    if (Number.isFinite(days) && (max === null || days > max)) max = days;
  }
  return SERVICE_BACKFILL_AGING_TEXT.summary(n)
    + (max !== null && max >= 1 ? SERVICE_BACKFILL_AGING_TEXT.summaryLongest(max) : '');
}
