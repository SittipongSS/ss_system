export const MONTH_LABELS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const BUSINESS_TIME_ZONE = "Asia/Bangkok";

function partsOf(value) {
  const match = MONTH_PATTERN.exec(String(value || ""));
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function isMonthValue(value) {
  return Boolean(partsOf(value));
}

export function currentMonth(date = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

// Compatibility name used by the Sales Planning pages.
export const thisMonth = currentMonth;

export function compareMonths(left, right) {
  if (!isMonthValue(left) || !isMonthValue(right)) return null;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function isMonthInRange(value, { min, max } = {}) {
  if (!isMonthValue(value)) return false;
  if (isMonthValue(min) && value < min) return false;
  if (isMonthValue(max) && value > max) return false;
  return true;
}

export function clampMonth(value, { min, max, fallback } = {}) {
  const validFallback = isMonthValue(fallback) ? fallback : currentMonth();
  let next = isMonthValue(value) ? value : validFallback;
  if (isMonthValue(min) && next < min) next = min;
  if (isMonthValue(max) && next > max) next = max;
  return next;
}

export function addMonths(value, amount) {
  const parts = partsOf(value);
  if (!parts || !Number.isInteger(amount)) return null;
  const absoluteMonth = (parts.year * 12) + parts.month - 1 + amount;
  const year = Math.floor(absoluteMonth / 12);
  const month = (absoluteMonth % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function monthsForYear(year, { min, max } = {}) {
  const numericYear = Number(year);
  if (!Number.isInteger(numericYear) || numericYear < 0 || numericYear > 9999) return [];
  return Array.from(
    { length: 12 },
    (_, index) => `${String(numericYear).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`,
  ).filter((month) => isMonthInRange(month, { min, max }));
}

export function yearOptionsForMonth(
  value,
  { min, max, pastYears = 3, futureYears = 3, now = new Date() } = {},
) {
  const selected = partsOf(clampMonth(value, { min, max, fallback: currentMonth(now) }));
  const currentYear = now.getFullYear();
  let start = isMonthValue(min) ? partsOf(min).year : Math.min(currentYear, selected.year) - pastYears;
  let end = isMonthValue(max) ? partsOf(max).year : Math.max(currentYear, selected.year) + futureYears;
  if (start > end) [start, end] = [end, start];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

/* ⭐ มติผู้ใช้ 2026-08-05: **ปีเป็น ค.ศ. ทั้งระบบ**
   ของเดิมแสดง พ.ศ. ตรงตัวเลือกงวดเดือน (MonthPicker) แต่ที่อื่นเป็น ค.ศ. หมด —
   fmtDate/fmtDateTime เป็น ค.ศ. มาแต่ต้น และหน้าเป้าหมาย/แผนเป้าเขียน `ปี {y}` ดิบ ๆ
   คนกด "ตั้งเป้าเดือนนี้" จากแดชบอร์ด (ปี 2569) มาถึงหน้าเป้าหมายเจอ "ปี 2026" ทันที
   ⇒ ตัดพารามิเตอร์ `calendar` ทิ้ง ไม่เก็บไว้เป็นตัวเลือกที่ไม่มีใครใช้
     (ตัวเลือกที่ค้างไว้คือช่องให้ระบบกลับไปมีสองมาตรฐานอีกรอบ)
   ⚠️ ค่าที่ "เก็บ" ยังเป็น ค.ศ. เหมือนเดิมทุกที่ — การเปลี่ยนนี้แตะแค่ชั้นแสดงผล */
export function displayYear(year) {
  const numericYear = Number(year);
  if (!Number.isFinite(numericYear)) return "";
  return String(numericYear);
}

export function formatMonthLabel(value, { includeYear = true } = {}) {
  const parts = partsOf(value);
  if (!parts) return "";
  const month = MONTH_LABELS[parts.month - 1];
  return includeYear ? `${month} ${displayYear(parts.year)}` : month;
}

/* ── ช่วง "ทุกเดือนของปีหนึ่ง" ────────────────────────────────────────────
   มติผู้ใช้ 2026-07-29: ติ๊ก "ทุกเดือน" = ทุกเดือน**ของปีที่เลือก** ไม่ใช่ทุกปี
   ของเดิมฝั่ง API ตัดตัวกรองทิ้งทั้งก้อน (ดีล) หรือส่ง month=all (ลีด) ซึ่งแปลว่า
   "ทั้งหมดตั้งแต่เปิดระบบ" — ตัวเลขที่เห็นจึงไม่ตรงกับปีที่ค้างอยู่บนปุ่ม */

export function isYearValue(value) {
  return /^\d{4}$/.test(String(value ?? ""));
}

/** ปีของค่างวดเดือน ("2026-07" → "2026") · คืน null ถ้าไม่ใช่งวดที่ถูกต้อง */
export function yearOfMonth(value) {
  return isMonthValue(value) ? String(value).slice(0, 4) : null;
}

/** ป้ายบอกงวดที่กำลังดู — "เดือน ส.ค. 2026" หรือ "ทั้งปี 2026" เมื่อติ๊ก "ทุกเดือน"
 *  ⚠️ ทุกจอที่มีติ๊ก "ทุกเดือน" ต้องพิมพ์งวดกำกับตัวเลขเสมอ — ตัวติ๊กอยู่บนหัวหน้า
 *  ส่วนตัวเลขอยู่กลางหน้า เลื่อนจอลงมาแล้วไม่มีอะไรบอกว่ากำลังดูเดือนเดียวหรือทั้งปี */
export function periodScopeLabel(month, allMonths, { short = false } = {}) {
  if (!allMonths) return short ? formatMonthLabel(month) : `เดือน ${formatMonthLabel(month)}`;
  const year = yearOfMonth(month) || String(month || "").slice(0, 4);
  return `ทั้งปี ${displayYear(year)}`;
}

/** ขอบเขตงวดเดือนของทั้งปี — ใช้เทียบกับคอลัมน์ที่เก็บเป็น YYYY-MM */
export function monthRangeOfYear(year) {
  if (!isYearValue(year)) return null;
  return { first: `${year}-01`, last: `${year}-12` };
}

/** ขอบเขตวันที่ของทั้งปีแบบครึ่งเปิด [from, until) — ใช้กับคอลัมน์ timestamp */
export function dateRangeOfYear(year) {
  if (!isYearValue(year)) return null;
  return { from: `${year}-01-01`, until: `${Number(year) + 1}-01-01` };
}

/* ── เขตเวลาของธุรกิจ ─────────────────────────────────────────────────────
   🐞 ตรวจตัวเลขลีด 2026-08-08: คอลัมน์ timestamptz เก็บเป็น UTC และเวลาเทียบขอบเดือน
   ด้วยสตริงเปล่า ๆ (`gte('createdAt', '2026-08-01')`) Postgres อ่านเป็น **00:00 UTC
   = 07:00 กรุงเทพ** ⇒ ลีดที่เข้ามาช่วง 00:00–07:00 ตามเวลาไทย **ตกไปนับเป็นเดือนก่อน**
   และ `String(createdAt).slice(0, 10)` ที่ใช้ทำกราฟรายวันก็ได้ "วันแบบ UTC" เลื่อนไป
   วันก่อนหน้าด้วยเหตุผลเดียวกัน · ช่องทางรับลีดคือ LINE/Meta/TikTok/IG/เว็บไซต์/Typeform
   ซึ่งลีดดึกมีจริงทุกวัน — ไม่มี error อะไรฟ้อง ตัวเลขแค่ผิดเงียบ ๆ

   ทุกคนที่ใช้ระบบนี้อยู่ไทย และป้ายวัน/เดือนบนจอเป็นเวลาไทยทั้งหมด "วันทำการ" จึงต้อง
   หมายถึงวันตามเวลาไทยเสมอ · ไทยไม่มี DST และเป็น UTC+7 มาตั้งแต่ พ.ศ. 2463
   ⇒ offset คงที่ตัวเดียวพอ ไม่ต้องพึ่ง ICU (ซึ่งอาจไม่ครบใน runtime บางตัว) */
export const BUSINESS_TZ = 'Asia/Bangkok';
export const BUSINESS_UTC_OFFSET = '+07:00';
const BUSINESS_OFFSET_MS = 7 * 60 * 60 * 1000;

/** ต้นวันตามเวลาไทย ในรูปที่ Postgres อ่านขอบได้ถูก ("2026-08-01" → "2026-08-01T00:00:00+07:00") */
export function businessDayStart(date) {
  return `${date}T00:00:00${BUSINESS_UTC_OFFSET}`;
}

/**
 * วันของ timestamp **ตามเวลาไทย** (YYYY-MM-DD)
 * ⚠️ ไม่ใช่ `String(iso).slice(0, 10)` ซึ่งเป็นวันแบบ UTC — ต่างกันทุกครั้งที่เหตุการณ์
 * เกิดหลังห้าโมงเย็นเวลาไทย (17:00 +07 = 10:00Z ยังวันเดียวกัน · 00:30 +07 = 17:30Z เมื่อวาน)
 */
export function businessDayKey(value) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + BUSINESS_OFFSET_MS).toISOString().slice(0, 10);
}

/** งวดเดือน (YYYY-MM) ของ timestamp ตามเวลาไทย */
export function businessMonthKey(value) {
  const day = businessDayKey(value);
  return day ? day.slice(0, 7) : null;
}

/** ขอบเขตของงวดเดือนแบบครึ่งเปิด [from, until) — นับตามวันไทย ไม่ใช่ UTC */
export function dateRangeOfBusinessMonth(month) {
  if (!isMonthValue(month)) return null;
  const [year, m] = String(month).split('-').map(Number);
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  return {
    from: businessDayStart(`${month}-01`),
    until: businessDayStart(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`),
  };
}

/** ขอบเขตของทั้งปีแบบครึ่งเปิด [from, until) — นับตามวันไทย ไม่ใช่ UTC */
export function dateRangeOfBusinessYear(year) {
  if (!isYearValue(year)) return null;
  return {
    from: businessDayStart(`${year}-01-01`),
    until: businessDayStart(`${Number(year) + 1}-01-01`),
  };
}
