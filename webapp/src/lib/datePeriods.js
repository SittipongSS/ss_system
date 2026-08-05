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
