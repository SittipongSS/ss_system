import {
  addDays,
  daysInRange,
  formatMonthLabel,
  isDayValue,
  isMonthValue,
  isYearValue,
  lastDayOfMonth,
  monthsInRange,
} from '@/lib/datePeriods';

/* ── งวดของรายงานยอดขาย (/sa/targets/report) — "รายเดือน | ช่วงวัน" แบบหน้าลีด ─────────
 * มติผู้ใช้ 2026-09-22 (แทนตัวเลือกช่วงเดือนข้ามปีของเดิม):
 *   month  = เดือนเดียว (MonthPicker)
 *   year   = ติ๊ก "ทุกเดือน" = ทุกเดือนของปีนั้น (ความหมายเดียวกับหน้าลีด)
 *   range  = ช่วงวัน (DayRangePicker) — ข้ามเดือน/ข้ามปีได้
 *
 * ⭐ แกนเดือน (`axis`) ≠ เดือนที่โชว์ (`months`)
 *    ทบยอดรีเซ็ตทุกต้นปี (มติ 2026-08-26) ⇒ เดือนเดียวต้องรู้ยอดที่ขาดตั้งแต่ ม.ค. ของปีนั้น
 *    ⇒ โหมด month โหลดแกน ม.ค.–เดือนที่เลือก แล้วโชว์เฉพาะเดือนท้าย (`lead` = จำนวนเดือนนำ)
 *    โหมด range ไม่มีทบยอด (เป็นแนวคิดรายเดือน) แกน = เดือนที่ช่วงวันคร่อม
 *
 * ⭐ ช่วงวันกับข้อมูลรายเดือน (มติผู้ใช้ 2026-09-22 "ปันเป้าตามจำนวนวัน"):
 *    - เป้าเดือน × (วันในช่วงที่ไม่เกินวันนี้ ∩ เดือนนั้น) ÷ วันทั้งเดือน — วันหลังวันนี้ยังไม่นับเป้า
 *    - ยอดกรอกย้อนหลัง (sales_history รายเดือน) ใช้ได้เฉพาะเดือนที่ช่วงคลุมครบทั้งเดือน
 *      แยกรายวันไม่ได้ — เดือนที่คลุมไม่ครบนับจากใบสั่งขายอย่างเดียว
 *
 * ⚠️ ทุกค่าเป็นสตริง YYYY-MM / YYYY-MM-DD ล้วน ไม่แปลงเป็น Date (เหตุผลที่ lib/datePeriods.js)
 */

export const REPORT_PERIOD_MODES = ['month', 'year', 'range'];

/** ช่วงวันยาวสุดที่รับ — แกนเดือนของช่วงวันเท่ากับเพดานเดิมของรายงาน (60 เดือน) */
export const MAX_RANGE_DAYS = 1830;

const firstDay = (month) => `${month}-01`;

/* ปีที่รับ — เดิมรับ 0000 แล้วฐานโยน "date/time field value out of range" กลับมาเป็น 500 (ตรวจ 2026-09-22) */
const YEAR_MIN = 2000;
const YEAR_MAX = 2100;
const saneYear = (year) => Number(year) >= YEAR_MIN && Number(year) <= YEAR_MAX;
/* วันที่มีจริงในปฏิทิน — รูปแบบถูกแต่ไม่มีจริง (2026-02-30) ต้องตีกลับ ไม่ใช่ส่งให้ฐานไปพังเอง */
const realDay = (day) => isDayValue(day) && addDays(day, 0) === day && saneYear(day.slice(0, 4));

/**
 * อ่านงวดจากพารามิเตอร์ของ URL/หน้าจอ
 *
 * @param input { mode, month, year, from, to }
 * @param today วันนี้ตามเวลาไทย (YYYY-MM-DD) — ใช้ตัดเป้าของช่วงวันไม่ให้นับวันในอนาคต
 * @returns { mode, month, year, from, to, months[], axis[], lead, today } | { error }
 *          from/to = ขอบของงวดเป็นวัน (ปิดทั้งสองข้าง) เสมอ ทุกโหมด
 */
export function parseReportPeriod(input = {}, { today } = {}) {
  const mode = String(input.mode || 'month');
  if (!isDayValue(today)) return { error: 'ไม่รู้วันปัจจุบัน' };

  if (mode === 'month') {
    const month = String(input.month || '');
    if (!isMonthValue(month) || !saneYear(month.slice(0, 4))) return { error: 'ต้องระบุเดือนเป็น YYYY-MM' };
    const axis = monthsInRange(`${month.slice(0, 4)}-01`, month);
    return {
      mode, month, year: month.slice(0, 4),
      from: firstDay(month), to: lastDayOfMonth(month),
      months: [month], axis, lead: axis.length - 1, today,
    };
  }

  if (mode === 'year') {
    const year = String(input.year || '');
    if (!isYearValue(year) || !saneYear(year)) return { error: 'ต้องระบุปีเป็น YYYY' };
    const axis = monthsInRange(`${year}-01`, `${year}-12`);
    return {
      mode, month: null, year,
      from: `${year}-01-01`, to: `${year}-12-31`,
      months: axis, axis, lead: 0, today,
    };
  }

  if (mode === 'range') {
    if (!realDay(input.from) || !realDay(input.to)) return { error: 'ต้องระบุช่วงวันเป็น YYYY-MM-DD ที่มีจริงทั้งสองด้าน' };
    const [from, to] = input.from <= input.to ? [input.from, input.to] : [input.to, input.from];
    if (daysInRange(from, to).length > MAX_RANGE_DAYS) return { error: 'ช่วงวันยาวเกิน 5 ปี' };
    const axis = monthsInRange(from.slice(0, 7), to.slice(0, 7));
    return { mode, month: null, year: null, from, to, months: axis, axis, lead: 0, today };
  }

  return { error: 'โหมดของงวดไม่ถูกต้อง' };
}

/**
 * อ่านงวดจาก URLSearchParams ของ route ที่เคยรับพารามิเตอร์รุ่นเก่า (ไฟล์ลีด · ไฟล์ FC · รายการดีล)
 *   ?mode=… (รุ่นปัจจุบัน) → parseReportPeriod
 *   รุ่นเก่า: ?year=YYYY → ทั้งปี · ?month=YYYY-MM → เดือนเดียว · ?from=&to= (วัน) → ช่วงวัน
 *   ไม่มีอะไรเลย → `null` = ไม่จำกัดงวด (ผู้เรียกตัดสินเองว่ารับได้ไหม)
 * ⭐ ลิงก์/บุ๊กมาร์กเก่ายังใช้ได้ ส่วนหน้าจอรุ่นใหม่ส่ง `reportPeriodQuery` ตัวเดียวกับจอ
 */
export function parseReportPeriodParams(params, { today } = {}) {
  const get = (key) => (params?.get ? params.get(key) : params?.[key]) || null;
  if (get('mode')) {
    return parseReportPeriod({ mode: get('mode'), month: get('month'), year: get('year'), from: get('from'), to: get('to') }, { today });
  }
  if (get('year')) return parseReportPeriod({ mode: 'year', year: get('year') }, { today });
  if (get('month')) return parseReportPeriod({ mode: 'month', month: get('month') }, { today });
  if (get('from') || get('to')) return parseReportPeriod({ mode: 'range', from: get('from'), to: get('to') }, { today });
  return null;
}

/** สัดส่วนของเดือนที่ช่วงวันคลุมและ "ถึงวันนี้แล้ว" — 0..1
 *  โหมดรายเดือน/ทั้งปีคืน 1 เสมอ (เป้าเต็มเดือน · เดือนที่ยังไม่จบกันด้วย closedCount ตามเดิม) */
export function targetFactorOf(period, month) {
  if (!period || period.mode !== 'range') return 1;
  const start = firstDay(month) > period.from ? firstDay(month) : period.from;
  const cap = period.to < period.today ? period.to : period.today;
  const last = lastDayOfMonth(month);
  const end = last < cap ? last : cap;
  if (!start || !end || start > end) return 0;
  return daysInRange(start, end).length / daysInRange(firstDay(month), last).length;
}

/** จำนวนวันที่นับ/วันทั้งเดือน — ป้ายกำกับเป้าที่ปันตามวัน ("13/30 วัน") */
export function coveredDaysOf(period, month) {
  const last = lastDayOfMonth(month);
  const total = daysInRange(firstDay(month), last).length;
  if (!period || period.mode !== 'range') return { days: total, total };
  return { days: Math.round(targetFactorOf(period, month) * total), total };
}

/** เดือนนี้ใช้ยอดกรอกย้อนหลัง (รายเดือน) ได้ไหม — ช่วงวันต้องคลุมครบทั้งเดือน */
export function historyAppliesTo(period, month) {
  if (!period || period.mode !== 'range') return true;
  return period.from <= firstDay(month) && period.to >= lastDayOfMonth(month);
}

/** querystring ของงวด — ตัวเดียวกันทั้ง API ข้อมูลและลิงก์ดาวน์โหลด (ไฟล์ต้องตรงกับจอ) */
export function reportPeriodQuery(period) {
  if (!period) return '';
  const params = new URLSearchParams({ mode: period.mode });
  if (period.mode === 'month') params.set('month', period.month);
  else if (period.mode === 'year') params.set('year', period.year);
  else { params.set('from', period.from); params.set('to', period.to); }
  return params.toString();
}

const dmy = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

/** ป้ายงวดภาษาไทย — หัวการ์ด/หัวไฟล์ */
export function reportPeriodLabel(period) {
  if (!period) return '';
  if (period.mode === 'month') return formatMonthLabel(period.month);
  if (period.mode === 'year') return `ทั้งปี ${period.year}`;
  return period.from === period.to ? dmy(period.from) : `${dmy(period.from)} – ${dmy(period.to)}`;
}

/** ชื่อไฟล์ Excel — มีงวดในชื่อ โหลดหลายงวดวันเดียวกันต้องไม่ทับกัน */
export function reportPeriodFilename(period) {
  const span = !period ? 'ไม่ระบุงวด'
    : period.mode === 'month' ? period.month
      : period.mode === 'year' ? period.year
        : `${period.from}_${period.to}`;
  return `รายงานยอดขาย_${span}.xlsx`;
}

/** ช่วงวันตั้งต้นของโหมดช่วงวัน = 14 วันล่าสุด (เท่าหน้าลีด) */
export function defaultDayRange(today) {
  return { from: addDays(today, -13), to: today };
}
