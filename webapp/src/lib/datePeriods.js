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

/* ── ช่วงงวดเดือน `{ from, to }` ─────────────────────────────────────────
   ⭐ รายงานยอดขายต้องดูช่วงที่ **ข้ามปีปฏิทิน** ได้ (มติผู้ใช้ 2026-08-25) เช่น
   ก.ย. 2025 – ส.ค. 2026 · ของเดิมทั้งระบบคิดเป็น "ปีหนึ่งปี" หรือ "เดือนหนึ่งเดือน"
   เท่านั้น จึงต้องมีชนิดข้อมูลกลางของช่วงเดือนก่อน แล้วค่อยมีตัวเลือกบนจอ

   ⚠️ **ความละเอียดเป็นเดือน ไม่ใช่วัน** ต่างจาก `DayRangePicker` ของหน้าลีดโดยตั้งใจ —
   ยอดขายไม่มี resolution ระดับวัน (ยอดปิดบัคเก็ตเป็นเดือน · เป้าและยอดย้อนหลังเก็บ
   รายเดือน) ช่วงรายวันจะให้ตัวเลขที่ไม่มีทางถูก

   🪤 ทรงเป็น `{ from, to }` ไม่ใช่ `{ first, last }` ของ `monthRangeOfYear` ข้างล่าง —
   ตัวนั้นเป็นตัวช่วยเทียบคอลัมน์ที่มีผู้เรียกอยู่แล้ว ส่วนชุดนี้เป็นค่าที่ผู้ใช้เลือก
   และจะไปโผล่เป็น query string `?from=&to=` (ทรงเดียวกับคิว KPI ลีด) */

/** ช่วงที่ถูกต้อง = สองค่าเป็นงวดเดือนจริง และ from ไม่มากกว่า to (สลับให้เองถ้ากลับด้าน) */
export function normalizeMonthRange(range) {
  const from = range?.from;
  const to = range?.to;
  if (!isMonthValue(from) || !isMonthValue(to)) return null;
  return compareMonths(from, to) > 0 ? { from: to, to: from } : { from, to };
}

/** ทุกงวดเดือนในช่วง (รวมปลายทั้งสองข้าง) เรียงจากเก่าไปใหม่ */
export function monthsInRange(from, to) {
  const range = normalizeMonthRange({ from, to });
  if (!range) return [];
  const out = [];
  let cursor = range.from;
  // เพดานกันวนไม่รู้จบเมื่อได้ค่าประหลาดมา — 100 ปีเกินพอสำหรับรายงานยอดขาย
  for (let guard = 0; guard < 1200 && cursor && compareMonths(cursor, range.to) <= 0; guard += 1) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}

/** จำนวนเดือนในช่วง — นับปลายทั้งสองข้าง (ก.ย.–ก.ย. = 1 เดือน) */
export function monthCountInRange(from, to) {
  return monthsInRange(from, to).length;
}

/** ช่วง N เดือนล่าสุดโดยนับเดือนที่ยืนอยู่เป็นเดือนสุดท้าย */
export function lastNMonths(count, { now = new Date(), anchor } = {}) {
  const end = isMonthValue(anchor) ? anchor : currentMonth(now);
  const n = Math.trunc(Number(count));
  if (!end || !Number.isFinite(n) || n < 1) return null;
  return { from: addMonths(end, -(n - 1)), to: end };
}

/** ไตรมาสที่ครอบงวดเดือนนั้น (ไตรมาสปฏิทิน ม.ค.–มี.ค. เป็นต้นไป) */
export function quarterRangeOfMonth(month) {
  const parts = partsOf(month);
  if (!parts) return null;
  const startMonth = Math.floor((parts.month - 1) / 3) * 3 + 1;
  const year = String(parts.year).padStart(4, '0');
  return {
    from: `${year}-${String(startMonth).padStart(2, '0')}`,
    to: `${year}-${String(startMonth + 2).padStart(2, '0')}`,
  };
}

/** ช่วงของทั้งปีในทรง `{ from, to }` */
export function monthRangeOfWholeYear(year) {
  if (!isYearValue(year)) return null;
  return { from: `${year}-01`, to: `${year}-12` };
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

/** เวลา (HH:MM) ของ timestamp **ตามเวลาไทย**
 *  ⚠️ คู่กับ `businessDayKey` เสมอ — ถ้าวันมาจากนาฬิกาไทยแต่เวลามาจากนาฬิกาเครื่อง
 *  สองส่วนของข้อความเดียวกันจะมาจากคนละโซนเวลา ซึ่งเพี้ยนเงียบบนเครื่องที่ตั้งโซนอื่น */
export function businessTimeKey(value) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + BUSINESS_OFFSET_MS).toISOString().slice(11, 16);
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

/* ── ช่วงวัน (IS-26080023) ────────────────────────────────────────────────
   Marketing นับลีดรายวัน/รายสัปดาห์เทียบยอด Spending Ads · ทุกอย่างข้างล่างทำงานกับ
   **สตริง YYYY-MM-DD ล้วน** ไม่แปลงเป็น Date ก่อน

   🔴 เหตุผลที่ห้ามใช้ `new Date(iso).getDay()` หาวันในสัปดาห์: `new Date('2026-07-20')`
   ถูกอ่านเป็นเที่ยงคืน **UTC** = เจ็ดโมงเช้าไทย แต่พอเรียก `getUTCDay()` กับ timestamp
   ที่มี offset +07 จะได้วันก่อนหน้า ⇒ ลีดวันจันทร์ตกไปอยู่สัปดาห์ก่อนทั้งก้อน
   (เจอจริงตอนสำรวจข้อมูลก่อนทำใบนี้ — ยอดรายสัปดาห์เพี้ยนทุกสัปดาห์โดยไม่มีอะไรฟ้อง) */
const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isDayValue(value) {
  return DAY_PATTERN.test(String(value || ''));
}

/** บวก/ลบวันบนสตริงวัน — คำนวณที่เที่ยงคืน UTC ล้วน ไม่มี timezone เข้ามาเกี่ยว */
export function addDays(day, amount) {
  if (!isDayValue(day)) return null;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + Number(amount || 0))).toISOString().slice(0, 10);
}

/** 0 = จันทร์ … 6 = อาทิตย์ (สัปดาห์ไทยเริ่มวันจันทร์) */
export function dayOfWeek(day) {
  if (!isDayValue(day)) return null;
  const [y, m, d] = day.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** วันจันทร์ของสัปดาห์ที่วันนั้นอยู่ — คีย์ของถังรายสัปดาห์ */
export function weekStartOf(day) {
  const dow = dayOfWeek(day);
  return dow === null ? null : addDays(day, -dow);
}

/** วันสุดท้ายของงวดเดือน (YYYY-MM → YYYY-MM-DD) — คิดจากปฏิทินจริง ไม่ใช่ตาราง 30/31 */
export function lastDayOfMonth(month) {
  if (!isMonthValue(month)) return null;
  const [y, m] = String(month).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** รายการวันทั้งหมดในช่วง (รวมปลายทั้งสองข้าง) — สลับให้เองถ้าส่งกลับหัว */
export function daysInRange(from, to) {
  if (!isDayValue(from) || !isDayValue(to)) return [];
  const [a, b] = from <= to ? [from, to] : [to, from];
  const out = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}

/** ขอบเขตของช่วงวันแบบครึ่งเปิด [from, until) — `until` = วันถัดจากวันสุดท้าย
 *  เพื่อให้ลีดที่เข้ามาระหว่างวันสุดท้ายถูกนับครบทั้งวัน ไม่ใช่ตัดที่เที่ยงคืน */
export function dateRangeOfBusinessDays(from, to) {
  if (!isDayValue(from) || !isDayValue(to)) return null;
  const [a, b] = from <= to ? [from, to] : [to, from];
  return { from: businessDayStart(a), until: businessDayStart(addDays(b, 1)) };
}

/** ขอบเขตของทั้งปีแบบครึ่งเปิด [from, until) — นับตามวันไทย ไม่ใช่ UTC */
export function dateRangeOfBusinessYear(year) {
  if (!isYearValue(year)) return null;
  return {
    from: businessDayStart(`${year}-01-01`),
    until: businessDayStart(`${Number(year) + 1}-01-01`),
  };
}
