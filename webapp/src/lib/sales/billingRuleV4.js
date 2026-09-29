// ── ตัวคิด "กำหนดวางบิล · กำหนดชำระ รุ่นสี่" (billing rules v4 · มติเจ้าของ 28–29/09/2026) — JS ล้วน ไม่อ่านนาฬิกา ไม่แตะฐาน ──
//
// ย้ายมาจากต้นแบบ mockups/billing-cycle/rework-v4/system/calc.mjs (system-design.md §4 · เทสต์ billingRuleV4.test.mjs)
// ⭐ จอ/API/cron เรียกผ่าน `lib/sales/billingRule.js` (re-export ชื่อรุ่นสี่ทั้งหมด + ชื่อเดิมเป็นตัวห่อ) — ไฟล์นี้คือตัวคิดตัวเดียว
//    ห้ามคิดวันซ้ำที่อื่น (กรรมการ 29/09 ข้อ 17: จอสองจุดต้องพูดตรงกันเพราะเรียกฟังก์ชันเดียวกัน ไม่ใช่เพราะเขียนเหมือนกัน)
// ⚠️ ผู้เรียกส่ง `todayIso` จาก `businessDate()` (นาฬิกาไทย) เสมอ · `holidays` (Map วัน → ชื่อ) ใช้กับวันที่ระบบเสนอเองเท่านั้น
// ⚠️ รูปที่ตัวตรวจรับต้องตรงกับ customer_billing_rule_v4_ok() ของ mig 0393 — ตัวอย่างถูก/ผิดชุดเดียวกันอยู่ที่
//    billingRuleFixtures.json (เทสต์ของไฟล์นี้ + เทสต์ PGlite ของ migration ใช้ไฟล์เดียวกัน)
// ⚠️ วันจ่ายรายสัปดาห์ (AR-035) **ตัวตรวจรับรูปได้แต่ยังไม่มีจอเขียน** (นอกขอบเขต)
//
// ── ปฏิทินรายปีของลูกค้า (รอบห้า · มติเจ้าของ 29/09 "แล้ววางบิลที่มีตามปฏิทินมีมั้ย") ────────────────────────────────
//   · ⭐ ปีที่ยังไม่มีปฏิทิน = **หยุด** (Q3 "หยุดรอปฏิทินใหม่") — ไม่มีประมาณการที่ไหนเลย: ไม่มีวันคิดให้ · ไม่มีป้าย "ประมาณการ" ·
//     ไม่มีรอย dueEstimatedAs · จอบอก "ยังไม่มีปฏิทิน YYYY · ใส่วันเองได้" (calendarGapText) · ใส่วันเองได้เสมอ
//     ตัวคิดไม่มีกิ่ง estimate เหลือ — ส่ง { fallback:'estimate' } มาก็ไม่มีผล (เทสต์ตรึง) · CALENDAR_FALLBACK = 'stop'
//   · ช่องว่างก่อนเดือนแรกของปฏิทิน (เดือนที่ผ่านแล้วไม่ต้องกรอก) ไม่หยุดชิป — หยุดที่ช่องว่าง **หลัง** เดือนที่มีปฏิทินเท่านั้น
//   · เตือนขอปฏิทินปีหน้า: 1 ธ.ค. หรือ 30 วันก่อนวันตัดรอบสุดท้าย อันไหนก่อน · ซ้ำทุกสัปดาห์ (อา–ส) จนใส่ปีถัดไป (calendarReminder)
//   · เวลาตัดรอบ (cutoffTime) = ช่อง + กระดิ่งเช้าวันตัดรอบ (cutoffBell · cutoffDigest) · เครดิต N ไม่พูดเวลา
//   · ตัวช่วยจอแก้ปฏิทิน (ตาราง · ร่าง · ตรงกับรูป · ปฏิทินเล็ก) อยู่ที่ billingCalendarEdit.js — ไฟล์นี้คือตัวคิดวัน
//
// รุ่นสี่ = รุ่นสาม + **แกน "ต้องวางบิลไหม"** นำหน้าทุกอย่าง (มติ 28/09 ข้อ 5):
//   need   'none'      ไม่ต้องวางบิล — งวดมีแต่กำหนดชำระ (ตั้งเองรายงวด) · ไม่มีเตือนวางบิล/เลยรอบวางบิล/ชวนขอใบวางบิล
//          'required'  ต้องวางบิล — billing null = "ยังไม่ตั้งรอบ" (รู้ว่าต้องวาง แต่ยังไม่รู้วัน) · มีรอบ = สามแกนของรุ่นสาม:
//                        ① วันรับวางบิล  billing   { mode:'anyday' } | { mode:'monthly', days:[1..31 ≤4] }
//                        ② เครดิต        creditDays 0..365 (นับจากวันวางบิล · 0 = ชำระวันวางบิล)
//                        ③ รอบจ่าย       runs null | { kind:'monthly', rounds:[{cutoffDay,payDay,payMonthOffset}] }
//                                              | { kind:'weekday', weekday:0..6, nths:[1..5] }   (ใหม่ · AR-035 "พุธที่ 2,4")
//                                              | { kind:'calendar', years:{YYYY:{runs:[{cutoff,pay}], fileId?}}, cutoffTime? }
//   null = ยังไม่ระบุ (unknown) — กรอกได้ทั้งสองช่อง ไม่มีอะไรคิดให้ (เหมือนวันนี้)
//   กำหนดชำระ = วันจ่ายของรอบแรกที่ "วันตัดรอบ ≥ วันวางบิล + เครดิต" · ไม่มีรอบจ่าย = วันวางบิล + เครดิต
//   รูปเดิม { credit:false } (449 แถว) อ่านเป็น "ต้องวางบิล · ได้ทุกวัน · ชำระวันวางบิล" + ธง legacyNoCredit — กำหนดชำระ/ชิป/ทะเบียน FN
//   เท่า prod วันนี้ **ยกเว้นตัวแก้วัน** ที่เปิดแบบ free (กำหนดชำระนำ · ไม่ต้องใส่วันวางบิลปลอม — รอบกรรมการ 29/09) จนกว่า backfill
//   ของรอมติ ข้อ 4 จะเขียนทับ — ตัวคิดไม่ตัดสินข้อ 4 แทน
//
// รอบกรรมการ 29/09 (system-design.md §11): ข้อยกเว้นรายงวดสองทาง (วันวางบิลที่ยืนยัน · billingSkip) · กระดิ่งครบกำหนดทุกงวด ·
//   ลิงก์ทะเบียนในทุกกระดิ่ง · ด่าน backfill ใน JS · อ่านกติกาพลาดปิดแค่ช่องวันวางบิล
//
// ที่มาของกำหนดชำระ (`source` · ป้ายเดียวต่อวัน):
//   'calendar' ตามปฏิทินลูกค้า · 'rule' ตามรอบ · 'credit' ตามเครดิต N วัน · 'payOnBilling' ชำระวันวางบิล
//   บนงวด (derived · dueSourceOf): + 'override' แก้ทับ · 'manual' ใส่เอง · 'calendarMissing' ปีนั้นยังไม่มีปฏิทิน ·
//   'direct' (ลูกค้าไม่ต้องวางบิล — กำหนดชำระคือกำหนดชำระ ไม่มีป้าย) · 'waiting' รอเหตุการณ์

import { isOpeningInstallment } from './historicalOrders.js';

/* ── ค่าคงที่ ────────────────────────────────────────────────────────────────────────────────── */
export const RULE_VERSION = 4;
export const NEED_NONE = 'none';
export const NEED_REQUIRED = 'required';
export const NEED_UNKNOWN = 'unknown';          // ค่าที่อ่านได้ (ไม่ใช่ค่าที่เก็บ) — billingRule = null
export const MONTH_END_DAY = 31;
export const ROUNDS_MAX = 4;                    // รอบต่อเดือนไม่เกิน 4 (มติ 26/09) — ทุกแกน
export const CREDIT_MAX = 365;
export const NOTE_MAX = 1000;
export const EVENT_MAX = 120;
export const CALENDAR_RUNS_MAX_PER_YEAR = ROUNDS_MAX * 12;
export const PAY_GAP_MAX_DAYS = 120;
export const BILLING_REMIND_DAYS = 3;           // กระดิ่งวันวางบิล 0..3 วัน (ค่าเดิมของ prod)
export const DUE_REMIND_DAYS = 3;               // กระดิ่งครบกำหนดชำระ 0..3 วัน (ใหม่ — ทุกงวดที่มีกำหนดชำระ · รวมกับกระดิ่งวางบิลเมื่อวันเดียวกัน · §6)
/* ปฏิทินปีหน้า — มติ 29/09: เริ่มเตือน 1 ธ.ค. หรือ 30 วันก่อนวันตัดรอบสุดท้าย อันไหนก่อน · ซ้ำทุกสัปดาห์ (อา–ส) จนใส่ปีถัดไป */
export const REMIND_CALENDAR_FROM_MMDD = '12-01';
export const REMIND_CALENDAR_LEAD_DAYS = 30;
/* ปฏิทินขาด = **หยุด** (มติ 29/09 Q3 "หยุดรอปฏิทินใหม่") — ค่าเดียว ไม่มีทางเลือก · ฟังก์ชันไม่รับ { fallback } แล้ว (ส่งมาก็ไม่มีผล)
   ⚠️ CALENDAR_FALLBACK_DEFAULT เหลือเป็นชื่อเดิมให้ผู้เรียกเก่า — ค่าเท่ากัน */
export const CALENDAR_FALLBACK = 'stop';
export const CALENDAR_FALLBACK_DEFAULT = CALENDAR_FALLBACK;
/* คำท้ายของงวดที่ปีนั้นยังไม่มีปฏิทิน — ระบบไม่คิดวันให้ แต่คนใส่วันเองได้เสมอ */
export const CALENDAR_MANUAL_HINT = 'ใส่วันเองได้';

export const NO_CREDIT_TEXT = 'ไม่มีเครดิต · ชำระวันวางบิล';
export const NO_BILLING_TEXT = 'ไม่ต้องวางบิล';
export const NO_TIMING_TEXT = 'ต้องวางบิล · ยังไม่ตั้งรอบ';
export const UNKNOWN_TEXT = 'ยังไม่ระบุว่าต้องวางบิลไหม';
/* ประโยคที่ API ตีกลับ (400) เมื่อตั้งวันวางบิลใหม่ให้งวดของลูกค้าที่ไม่ต้องวางบิล **โดยไม่ได้ยืนยันข้อยกเว้น** — ตัวเดียวกับที่จอขึ้น
   (รอบกรรมการ 29/09: ไม่ปิดตาย — ลูกค้าขอใบวางบิลงวดเดียวได้ผ่าน "งวดนี้ต้องวางบิล…" ที่ส่ง billingException:true + ลงประวัติ) */
export const NO_BILLING_WRITE_ERROR = 'ลูกค้ารายนี้ไม่ต้องวางบิล — ถ้างวดนี้ลูกค้าขอใบวางบิล ใช้ "งวดนี้ต้องวางบิล…" (ยืนยันรายงวด · ลงประวัติ)';
/* อ่านกติกาลูกค้าไม่ได้ตอนบันทึก — ปิดเฉพาะช่องวันวางบิล/ติ๊กรายงวด · กำหนดชำระบันทึกได้ตามปกติ (รอบกรรมการ 29/09) */
export const RULE_UNAVAILABLE_ERROR = 'อ่านกำหนดวางบิลของลูกค้าไม่ได้ชั่วคราว — บันทึกกำหนดชำระได้ แต่วันวางบิลต้องลองใหม่';
/* ติ๊กรายงวด "งวดนี้ไม่ต้องวางบิล" (คอลัมน์ billingSkip) */
export const SKIP_TEXT = 'งวดนี้ไม่ต้องวางบิล';
/* โหมดบันทึกตีกลับสูตรประมาณการของปฏิทิน (มติ 29/09 Q3 — ปีที่ยังไม่มีปฏิทินระบบหยุด ไม่ประมาณ) */
export const CALENDAR_ESTIMATE_ERROR = 'ปฏิทินของลูกค้าไม่มีสูตรประมาณการแล้ว — ปีที่ยังไม่มีปฏิทินระบบหยุดรอ ใส่วันเองได้';

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const WEEKDAYS_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const WEEKDAYS_FULL_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

/* ── วันที่ (สตริง YYYY-MM-DD ล้วน · สำเนารุ่นสาม) ─────────────────────────────────────────────── */
const pad = (n) => String(n).padStart(2, '0');
export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const partsOf = (day) => day.split('-').map(Number);
const text = (v) => String(v ?? '').trim();

export function dateOf(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = partsOf(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= lastDayOf(y, m) ? s : null;
}
export function addDays(day, n) {
  const ok = dateOf(day);
  if (!ok) return null;
  const base = new Date(`${ok}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + Number(n || 0));
  return iso(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}
export function daysBetween(a, b) {
  const x = dateOf(a);
  const y = dateOf(b);
  if (!x || !y) return null;
  return Math.round((new Date(`${y}T00:00:00Z`) - new Date(`${x}T00:00:00Z`)) / 86400000);
}
export function dayInMonth(year, month, day) {
  const y = year + Math.floor((month - 1) / 12);
  const m = (((month - 1) % 12) + 12) % 12 + 1;
  return iso(y, m, Math.min(day, lastDayOf(y, m)));
}
const monthIndexOf = (day) => { const [y, m] = partsOf(day); return y * 12 + (m - 1); };
const monthOfIndex = (k) => ({ year: Math.floor(k / 12), month: (k % 12) + 1 });
const monthKeyOf = (k) => { const { year, month } = monthOfIndex(k); return `${year}-${pad(month)}`; };
export const weekdayOf = (day) => { const [y, m, d] = partsOf(day); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

/* เสาร์/อาทิตย์ = **คำเตือน** เท่านั้น — ระบบไม่เลื่อนวันเอง (มติ 26/09) */
export function weekendNote(day) {
  const ok = dateOf(day);
  if (!ok) return '';
  const dow = weekdayOf(ok);
  return dow === 6 ? 'ตรงวันเสาร์' : dow === 0 ? 'ตรงวันอาทิตย์' : '';
}
function holidayNameOf(holidays, day) {
  if (!holidays) return null;
  if (holidays instanceof Map) return holidays.has(day) ? String(holidays.get(day) || '') : null;
  if (holidays instanceof Set) return holidays.has(day) ? '' : null;
  return null;
}
/* วันทำงานของเรา — ใช้กับ **วันที่ระบบเสนอเอง** เท่านั้น (ชิปวันวางบิลเครดิต N · วันยิงกระดิ่ง) ไม่ใช่วันที่ลูกค้าประกาศ */
export function isWorkday(day, holidays = null) {
  const ok = dateOf(day);
  return Boolean(ok) && !weekendNote(ok) && holidayNameOf(holidays, ok) === null;
}
export function firstWorkdayOnOrAfter(day, holidays = null) {
  let d = dateOf(day);
  if (!d) return null;
  for (let i = 0; i < 14 && !isWorkday(d, holidays); i += 1) d = addDays(d, 1);
  return d;
}
export function lastWorkdayOnOrBefore(day, holidays = null) {
  let d = dateOf(day);
  if (!d) return null;
  for (let i = 0; i < 14 && !isWorkday(d, holidays); i += 1) d = addDays(d, -1);
  return d;
}
/* "จ. 28 ก.ย. 2026" · ว่าง = '—' */
export function fmtDate(value, { withYear = true } = {}) {
  const day = dateOf(value);
  if (!day) return '—';
  const [y, m, d] = partsOf(day);
  return `${WEEKDAYS_TH[weekdayOf(day)]} ${d} ${MONTHS_TH[m - 1]}${withYear ? ` ${y}` : ''}`;
}
const intIn = (value, lo, hi) => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

/* ── อ่านรูปรุ่นหนึ่ง/สอง (0389/0390 · สำเนาความหมายของ normalizeBillingRule) ─────────────────────────── */
function readV2(input) {
  const billingMode = input.billing?.mode;
  let billing;
  if (billingMode === 'anyday') billing = { mode: 'anyday' };
  else if (billingMode === 'monthly') {
    const raw = Array.isArray(input.billing?.days) ? input.billing.days
      : input.billing?.day !== undefined ? [input.billing.day] : [];
    const days = raw.map((d) => intIn(d, 1, 31));
    if (!days.length || days.length > ROUNDS_MAX || days.includes(null) || new Set(days).size !== days.length) {
      return { error: 'รอบวางบิลรุ่นสองไม่ถูกต้อง' };
    }
    billing = { mode: 'monthly', days };
  } else return { error: 'รอบวางบิลรุ่นสองไม่ถูกต้อง' };
  const count = billing.mode === 'monthly' ? billing.days.length : 1;
  let payment;
  if (input.payment?.mode === 'credit') {
    const days = intIn(input.payment.days, 0, CREDIT_MAX);
    if (days === null) return { error: `ใส่จำนวนวันเครดิต 0–${CREDIT_MAX}` };
    payment = { mode: 'credit', days };
  } else if (input.payment?.mode === 'monthly') {
    const raw = Array.isArray(input.payment.rounds) ? input.payment.rounds
      : input.payment.day !== undefined ? Array.from({ length: count }, () => ({ day: input.payment.day, monthOffset: input.payment.monthOffset }))
        : [];
    if (raw.length !== count) return { error: 'ใส่วันเงินเข้าให้ครบทุกรอบ' };
    const rounds = raw.map((r) => ({ day: intIn(r?.day, 1, 31), monthOffset: intIn(r?.monthOffset, 0, 1) }));
    if (rounds.some((r) => r.day === null || r.monthOffset === null)) return { error: 'รอบเงินเข้ารุ่นสองไม่ถูกต้อง' };
    if (billing.mode === 'monthly' && rounds.some((r, i) => r.monthOffset === 0 && r.day < billing.days[i])) {
      return { error: 'เงินเข้าก่อนวันวางบิลในเดือนเดียวกัน' };
    }
    payment = { mode: 'monthly', rounds };
  } else return { error: 'รอบวางบิลรุ่นสองไม่ถูกต้อง' };
  if (billing.mode === 'monthly' && billing.days.length > 1) {
    const order = billing.days.map((_, i) => i).sort((a, b) => billing.days[a] - billing.days[b]);
    billing = { mode: 'monthly', days: order.map((i) => billing.days[i]) };
    if (payment.mode === 'monthly') payment = { mode: 'monthly', rounds: order.map((i) => payment.rounds[i]) };
  }
  return { rule: { billing, payment }, error: null };
}

/**
 * รุ่นสอง → รุ่นสี่ (ตัวแปลงตอนอ่าน · ไม่เขียนฐาน) — ความหมายของ toV3 (calendar-v3 §2.3) + need 'required'
 * ทุกรูปที่มีจริง (10 เครดิต + AR-281) ได้กำหนดชำระ **เท่าเดิมทุกวัน** (เทสต์ 731 วัน)
 * { credit:false } → "ต้องวางบิล · ได้ทุกวัน · ชำระวันวางบิล" + legacyNoCredit (= effectiveBillingRule ของ prod วันนี้)
 */
export function toV4(v2) {
  if (!v2) return null;
  const withNote = (rule) => (v2.note ? { ...rule, note: v2.note } : rule);
  if (v2.credit === false) {
    return withNote({ v: RULE_VERSION, need: NEED_REQUIRED, billing: { mode: 'anyday' }, creditDays: 0, runs: null, legacyNoCredit: true });
  }
  const base = { v: RULE_VERSION, need: NEED_REQUIRED };
  if (v2.payment.mode === 'credit') return withNote({ ...base, billing: v2.billing, creditDays: v2.payment.days, runs: null });
  const { rounds } = v2.payment;
  if (v2.billing.mode === 'anyday' || v2.billing.days.length === 1) {
    const [r] = rounds;
    const run = { cutoffDay: r.monthOffset === 0 ? r.day : MONTH_END_DAY, payDay: r.day, payMonthOffset: r.monthOffset };
    return withNote({ ...base, billing: v2.billing, creditDays: 0, runs: { kind: 'monthly', rounds: [run] } });
  }
  return withNote({
    ...base,
    billing: { mode: 'anyday' },
    creditDays: 0,
    runs: { kind: 'monthly', rounds: v2.billing.days.map((d, i) => ({ cutoffDay: d, payDay: rounds[i].day, payMonthOffset: rounds[i].monthOffset })) },
  });
}

/* ── ตรวจ + ทำรูปมาตรฐาน ───────────────────────────────────────────────────────────────────────── */
function normalizeNote(input) {
  if (input.note === undefined || input.note === null) return { note: '', error: null };
  if (typeof input.note !== 'string') return { note: '', error: 'หมายเหตุการวางบิลต้องเป็นข้อความ' };
  const note = input.note.trim();
  return note.length > NOTE_MAX ? { note: '', error: `หมายเหตุการวางบิลยาวเกิน ${NOTE_MAX} ตัวอักษร` } : { note, error: null };
}

function normalizeRounds(raw, label) {
  if (!Array.isArray(raw) || !raw.length) return { error: `${label}: ใส่วันตัดรอบอย่างน้อย 1 รอบ` };
  if (raw.length > ROUNDS_MAX) return { error: `${label}: ได้ไม่เกิน ${ROUNDS_MAX} รอบต่อเดือน` };
  const rounds = [];
  for (let i = 0; i < raw.length; i += 1) {
    const cutoffDay = intIn(raw[i]?.cutoffDay, 1, 31);
    const payDay = intIn(raw[i]?.payDay, 1, 31);
    const payMonthOffset = intIn(raw[i]?.payMonthOffset, 0, 1);
    if (cutoffDay === null) return { error: `${label} รอบที่ ${i + 1}: ใส่วันตัดรอบ 1–31 หรือ "สิ้นเดือน"` };
    if (payDay === null) return { error: `${label} รอบที่ ${i + 1}: ใส่วันจ่าย 1–31 หรือ "สิ้นเดือน"` };
    if (payMonthOffset === null) return { error: `${label} รอบที่ ${i + 1}: เลือกว่าจ่ายเดือนเดียวกัน หรือเดือนถัดไป` };
    if (payMonthOffset === 0 && payDay < cutoffDay) {
      return { error: `${label} รอบที่ ${i + 1}: วันจ่ายก่อนวันตัดรอบในเดือนเดียวกัน — เลือก "เดือนถัดไป" หรือแก้วันที่` };
    }
    rounds.push({ cutoffDay, payDay, payMonthOffset });
  }
  rounds.sort((a, b) => a.cutoffDay - b.cutoffDay);
  if (new Set(rounds.map((r) => r.cutoffDay)).size !== rounds.length) return { error: `${label}: วันตัดรอบซ้ำกัน` };
  return { rounds, error: null };
}

/* วันจ่ายประจำแบบ "วัน…ที่ n ของเดือน" (AR-035 "จ่ายทุกวันพุธ ที่ 2,4") · 5 = สุดท้ายของเดือน · วันจ่ายอย่างเดียว (ตัด = จ่าย) */
function normalizeWeekday(raw) {
  const weekday = intIn(raw?.weekday, 0, 6);
  if (weekday === null) return { error: 'เลือกวันในสัปดาห์ของวันจ่าย' };
  const list = Array.isArray(raw?.nths) ? raw.nths.map((n) => intIn(n, 1, 5)) : [];
  if (!list.length || list.includes(null)) return { error: 'เลือกสัปดาห์ของวันจ่าย (ที่ 1–4 หรือ สุดท้าย)' };
  if (list.length > ROUNDS_MAX) return { error: `วันจ่ายได้ไม่เกิน ${ROUNDS_MAX} ครั้งต่อเดือน` };
  if (new Set(list).size !== list.length) return { error: 'สัปดาห์ของวันจ่ายซ้ำกัน' };
  return { spec: { kind: 'weekday', weekday, nths: [...list].sort((a, b) => a - b) }, error: null };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ปฏิทินหนึ่งปีของลูกค้า — **ไม่เลื่อน ไม่ปัด** (สำเนารุ่นสาม) · @returns `{ runs, errors, warnings }` */
export function validateCalendarYear(year, rawRuns, { holidays = null } = {}) {
  const errors = [];
  const warnings = [];
  const y = intIn(year, 2000, 2100);
  if (y === null) return { runs: [], errors: ['ปีของปฏิทินไม่ถูกต้อง'], warnings };
  if (!Array.isArray(rawRuns) || !rawRuns.length) return { runs: [], errors: [`ปฏิทินปี ${y} ยังไม่มีรอบ`], warnings };
  if (rawRuns.length > CALENDAR_RUNS_MAX_PER_YEAR) return { runs: [], errors: [`ปฏิทินปี ${y} มีได้ไม่เกิน ${CALENDAR_RUNS_MAX_PER_YEAR} รอบ`], warnings };
  const runs = [];
  rawRuns.forEach((raw, i) => {
    const cutoff = dateOf(raw?.cutoff);
    const pay = dateOf(raw?.pay);
    if (!cutoff || !pay) { errors.push(`ปี ${y} แถวที่ ${i + 1}: วันที่ไม่ถูกต้อง`); return; }
    if (Number(cutoff.slice(0, 4)) !== y) { errors.push(`วันตัดรอบ ${fmtDate(cutoff)} ไม่อยู่ในปี ${y}`); return; }
    if (pay < cutoff) { errors.push(`วันจ่าย ${fmtDate(pay)} อยู่ก่อนวันตัดรอบ ${fmtDate(cutoff)}`); return; }
    if (daysBetween(cutoff, pay) > PAY_GAP_MAX_DAYS) { errors.push(`วันจ่าย ${fmtDate(pay)} ห่างวันตัดรอบเกิน ${PAY_GAP_MAX_DAYS} วัน — ตรวจปี/เดือน`); return; }
    runs.push({ cutoff, pay });
  });
  runs.sort((a, b) => (a.cutoff < b.cutoff ? -1 : a.cutoff > b.cutoff ? 1 : 0));
  for (let i = 1; i < runs.length; i += 1) {
    if (runs[i].cutoff === runs[i - 1].cutoff) errors.push(`วันตัดรอบ ${fmtDate(runs[i].cutoff)} ซ้ำกัน — หนึ่งวันตัดรอบมีได้รอบเดียว`);
    else if (runs[i].pay < runs[i - 1].pay) warnings.push({ date: runs[i].pay, text: `รอบตัด ${fmtDate(runs[i].cutoff, { withYear: false })} จ่ายก่อนรอบก่อนหน้า — ตรวจกับรูปปฏิทิน` });
  }
  const perMonth = new Map();
  for (const r of runs) perMonth.set(r.cutoff.slice(0, 7), (perMonth.get(r.cutoff.slice(0, 7)) || 0) + 1);
  for (const [month, n] of perMonth) if (n > ROUNDS_MAX) errors.push(`เดือน ${month} มี ${n} รอบ — ได้ไม่เกิน ${ROUNDS_MAX} รอบต่อเดือน`);
  if (runs.length) {
    const a = monthIndexOf(runs[0].cutoff);
    const b = monthIndexOf(runs[runs.length - 1].cutoff);
    for (let k = a + 1; k < b; k += 1) {
      if (!perMonth.has(monthKeyOf(k))) warnings.push({ date: `${monthKeyOf(k)}-01`, text: `เดือน ${MONTHS_TH[monthOfIndex(k).month - 1]} ไม่มีรอบ — ถ้าลูกค้าไม่มีรอบเดือนนี้จริง ไม่ต้องแก้` });
    }
  }
  for (const r of runs) {
    for (const [field, word] of [['cutoff', 'วันตัดรอบ'], ['pay', 'วันจ่าย']]) {
      const note = weekendNote(r[field]);
      if (note) warnings.push({ date: r[field], text: `${word} ${fmtDate(r[field], { withYear: false })} ${note}` });
      const holidayName = holidayNameOf(holidays, r[field]);
      if (holidayName !== null) warnings.push({ date: r[field], text: `${word} ${fmtDate(r[field], { withYear: false })} ตรงวันหยุดในระบบ${holidayName ? ` (${holidayName})` : ''} — ข้อมูลประกอบ วันที่ลูกค้าประกาศชนะเสมอ` });
    }
  }
  return { runs, errors, warnings };
}

const V4_KEYS = new Set(['v', 'need', 'billing', 'creditDays', 'runs', 'note', 'legacyNoCredit']);
const present = (v) => v !== undefined && v !== null;

/**
 * ตรวจ + ทำรูปมาตรฐาน · อ่านได้ทุกรุ่น: null · { credit:false } · รุ่นหนึ่ง/สอง · รุ่นสี่ (รุ่นสามไม่เคยลงฐาน — ไม่รับ)
 * @param allowLegacy false = โหมดบันทึกของระยะ 2+ (โมดัลรุ่นสี่): ตีกลับรูปเก่าทุกแบบ รวมธง legacyNoCredit ที่เป็น "ผลการอ่าน"
 * @returns `{ rule, error, warnings, converted }` · converted = อ่านจากรูปเก่า (API ตัดสินตอนบันทึก)
 * ⚠️ รูปต้องตรงกับ customer_billing_rule_v4_ok() ของ migration (ฐานกันรูป · กติกาข้ามช่องอยู่ที่นี่ด้วย)
 */
export function normalizeRule(input, { holidays = null, allowLegacy = true } = {}) {
  const fail = (error) => ({ rule: null, error, warnings: [], converted: false });
  if (input === null || input === undefined) return { rule: null, error: null, warnings: [], converted: false };
  if (typeof input !== 'object' || Array.isArray(input)) return fail('รูปแบบกำหนดวางบิลไม่ถูกต้อง');
  const { note, error: noteError } = normalizeNote(input);
  if (noteError) return fail(noteError);
  const withNote = (rule) => (note ? { ...rule, note } : rule);
  const legacyError = 'รูปเดิม (ไม่มีเครดิต/รุ่นสอง) เลิกบันทึกแล้ว — เลือกว่าลูกค้าต้องวางบิลไหม';

  if (input.credit === false) {
    if (!allowLegacy) return fail(legacyError);
    return { rule: toV4(note ? { credit: false, note } : { credit: false }), error: null, warnings: [], converted: true };
  }
  if (input.v === undefined && (input.billing || input.payment)) {
    if (!allowLegacy) return fail(legacyError);
    const v2 = readV2(input);
    if (v2.error) return fail(v2.error);
    return { rule: toV4(note ? { ...v2.rule, note } : v2.rule), error: null, warnings: [], converted: true };
  }
  if (input.v !== RULE_VERSION) return fail('รูปแบบกำหนดวางบิลไม่ถูกต้อง');
  const unknown = Object.keys(input).filter((k) => !V4_KEYS.has(k));
  if (unknown.length) return fail(`ช่องที่ไม่รู้จัก: ${unknown.join(', ')}`);

  if (input.need === NEED_NONE) {
    if (present(input.billing) || present(input.creditDays) || present(input.runs) || input.legacyNoCredit) {
      return fail('ลูกค้าที่ไม่ต้องวางบิลไม่มีวันวางบิล/เครดิต/รอบจ่าย');
    }
    return { rule: withNote({ v: RULE_VERSION, need: NEED_NONE }), error: null, warnings: [], converted: false };
  }
  if (input.need !== NEED_REQUIRED) return fail('เลือกว่าลูกค้า "ต้องวางบิล" หรือ "ไม่ต้องวางบิล"');

  if (!present(input.billing)) {
    if (present(input.creditDays) || present(input.runs) || input.legacyNoCredit) return fail('ตั้งวันวางบิลก่อนเครดิต/รอบจ่าย');
    return { rule: withNote({ v: RULE_VERSION, need: NEED_REQUIRED, billing: null }), error: null, warnings: [], converted: false };
  }

  let billing;
  if (input.billing?.mode === 'anyday') billing = { mode: 'anyday' };
  else if (input.billing?.mode === 'monthly') {
    const raw = Array.isArray(input.billing.days) ? input.billing.days : [];
    const days = raw.map((d) => intIn(d, 1, 31));
    if (!days.length || days.includes(null)) return fail('ใส่วันรับวางบิล 1–31 หรือเลือก "สิ้นเดือน"');
    if (days.length > ROUNDS_MAX) return fail(`วันรับวางบิลได้ไม่เกิน ${ROUNDS_MAX} วันต่อเดือน`);
    if (new Set(days).size !== days.length) return fail('วันรับวางบิลซ้ำกัน');
    billing = { mode: 'monthly', days: [...days].sort((a, b) => a - b) };
  } else return fail('เลือกว่าวางบิลได้ทุกวัน หรือเฉพาะวันที่');

  /* ไม่มีค่าตั้งต้นให้การตัดสินใจ — ต้องส่งเครดิตมาเสมอ (0 = ชำระวันวางบิล) */
  const creditDays = intIn(input.creditDays, 0, CREDIT_MAX);
  if (creditDays === null) return fail(`ใส่จำนวนวันเครดิต 0–${CREDIT_MAX} (0 = ชำระวันวางบิล)`);

  const warnings = [];
  const time = input.runs?.cutoffTime;
  if (present(time) && time !== '' && !TIME_RE.test(String(time))) return fail('เวลาตัดรอบต้องเป็น HH:MM เช่น 16:00');
  const cutoffTime = time ? String(time) : null;
  let runs = null;
  if (!present(input.runs)) runs = null;
  else if (input.runs.kind === 'monthly') {
    const { rounds, error } = normalizeRounds(input.runs.rounds, 'รอบจ่าย');
    if (error) return fail(error);
    runs = { kind: 'monthly', rounds };
    if (cutoffTime) runs.cutoffTime = cutoffTime;
  } else if (input.runs.kind === 'weekday') {
    if (cutoffTime) return fail('วันจ่ายประจำไม่มีเวลาตัดรอบ — ใส่เวลาในหมายเหตุ');
    const { spec, error } = normalizeWeekday(input.runs);
    if (error) return fail(error);
    runs = spec;
  } else if (input.runs.kind === 'calendar') {
    if (billing.mode !== 'anyday') return fail('ปฏิทินของลูกค้าใช้วันตัดรอบเป็นวันวางบิล — เลือก "วางบิลได้ทุกวัน"');
    const rawYears = input.runs.years;
    if (!rawYears || typeof rawYears !== 'object' || Array.isArray(rawYears) || !Object.keys(rawYears).length) return fail('ปฏิทินของลูกค้ายังไม่มีปีไหนเลย');
    const years = {};
    for (const key of Object.keys(rawYears).sort()) {
      if (!/^\d{4}$/.test(key)) return fail(`ปี "${key}" ไม่ถูกต้อง`);
      const block = rawYears[key];
      const { runs: yearRuns, errors, warnings: w } = validateCalendarYear(key, block?.runs, { holidays });
      if (errors.length) return fail(errors[0]);
      warnings.push(...w);
      years[key] = { runs: yearRuns };
      if (block?.fileId) years[key].fileId = String(block.fileId).slice(0, 64);
    }
    runs = { kind: 'calendar', years };
    /* สูตรประมาณการ (runs.estimate) เลิกแล้ว — มติ 29/09 Q3 ปีที่ขาด = หยุด · โหมดบันทึกตีกลับ (จอไม่ส่ง) ·
       โหมดอ่านทิ้งช่องนี้เงียบ ๆ (CHECK ของ 0393 ยังรับรูปนี้ — ค่าที่หลุดเข้าฐานต้องไม่ทำให้ลูกค้าทั้งรายกลายเป็น "ยังไม่ระบุ") */
    if (present(input.runs.estimate) && !allowLegacy) return fail(CALENDAR_ESTIMATE_ERROR);
    if (cutoffTime) runs.cutoffTime = cutoffTime;
  } else return fail('รอบจ่ายต้องเป็น "ทุกวันที่" · "วันในสัปดาห์" หรือ "ตามปฏิทินของลูกค้า"');

  /* ธง legacyNoCredit = ผลการอ่าน { credit:false } เท่านั้น (ส่งกลับเข้ามาได้ ได้รูปเดิม) — ห้ามบันทึก */
  if (input.legacyNoCredit) {
    if (!allowLegacy) return fail(legacyError);
    if (billing.mode !== 'anyday' || creditDays !== 0 || runs) return fail('ธงรูปเดิมใช้กับ "ไม่มีเครดิต" เท่านั้น');
  }
  const rule = { v: RULE_VERSION, need: NEED_REQUIRED, billing, creditDays, runs };
  if (input.legacyNoCredit) rule.legacyNoCredit = true;
  return { rule: withNote(rule), error: null, warnings, converted: Boolean(input.legacyNoCredit) };
}

/* รูปจากแถวลูกค้า — รูปผิด = ถือว่ายังไม่ระบุ (ไม่ throw บนจอ) · ส่งผลกลับเข้ามาได้ */
export const ruleOf = (value) => normalizeRule(value ?? null).rule;
/* กติกาสองค่าพูดเรื่องเดียวกันไหม (API ตัดสิน "ไม่มีอะไรเปลี่ยน" = ไม่เขียน ไม่ลงประวัติ) — เทียบผลการอ่าน ⇒ รุ่นสองกับรุ่นสี่ที่ความหมายเท่ากัน
   = เท่ากัน · รูปเดิม { credit:false } ≠ "วางบิล ชำระวันวางบิล" รุ่นสี่ (ธง legacyNoCredit ต่าง) ⇒ ตอบ "ต้องวางบิลไหม" แล้วเขียนเสมอ */
export const sameRule = (a, b) => JSON.stringify(ruleOf(a)) === JSON.stringify(ruleOf(b));

/* ── ตัวถามรูป (จอ/กระดิ่ง/ทะเบียนถามตัวนี้ ห้ามอ่านช่องข้างในตรง ๆ) ─────────────────────────────────── */
/* ต้องวางบิลไหม — 'none' | 'required' | 'unknown' (ยังไม่ระบุ) */
export function billingNeed(value) {
  const rule = ruleOf(value);
  return rule ? rule.need : NEED_UNKNOWN;
}
/* มีรอบให้คิดวัน (ต้องวางบิล + ตั้งวันวางบิลแล้ว) */
export const hasTiming = (value) => { const rule = ruleOf(value); return Boolean(rule?.need === NEED_REQUIRED && rule.billing); };
/* ทะเบียน FN ชวน "ยังไม่มีวันวางบิล" ไหม — ต้องวางบิลจริง (รูปเดิม { credit:false } ไม่ชวน = เท่ากับ prod วันนี้) */
export const nagsMissingBilling = (value) => { const rule = ruleOf(value); return rule?.need === NEED_REQUIRED && !rule.legacyNoCredit; };
/* ลูกค้ายังต้องตอบ "ต้องวางบิลไหม" (ยังไม่ระบุ · รูปเดิมที่ 0390 แปลงจากข้อความ) — ถามบนแผงงวด/หน้าสร้าง SO */
export const asksNeed = (value) => { const rule = ruleOf(value); return !rule || Boolean(rule.legacyNoCredit); };

/**
 * งวดนี้ต้องวางบิลไหม — **ตัวตัดสินเดียว** (กระดิ่ง · ทะเบียน FN · เมนูขอใบวางบิล · ตัวแก้วัน)
 * ⭐ วันวางบิลที่เก็บอยู่แล้ว **ไม่ถูกซ่อน** ไม่ว่ากติกาลูกค้าจะเปลี่ยนเป็นอะไร (ไม่มีอะไรเปลี่ยนเงียบ) — ล้างได้ด้วยคนเท่านั้น
 * ไม่มีวันวางบิล = ตามลูกค้า ('none' | 'required' | 'unknown')
 */
export function installmentNeed(row, value) {
  if (dateOf(row?.billingDate)) return NEED_REQUIRED;
  if (row?.billingSkip === true) return NEED_NONE;
  return billingNeed(value);
}
/**
 * งวดนี้ยกเว้นจากค่าของลูกค้าไหม (รอบกรรมการ 29/09 — ข้อยกเว้นรายงวดสองทาง ไม่มีธงระดับใบ):
 *   'billing' = ลูกค้าไม่ต้องวางบิล แต่งวดนี้มีวันวางบิล (ผ่าน "งวดนี้ต้องวางบิล…" · ไม่มีคอลัมน์ใหม่ — วันวางบิลคือตัวยกเว้น)
 *   'skip'    = ลูกค้าต้องวางบิล/ยังไม่ระบุ แต่งวดนี้ติ๊ก "งวดนี้ไม่ต้องวางบิล" (billingSkip · เช่น มัดจำโอนก่อน)
 *   null      = ตามลูกค้า
 */
export function needOverrideOf(row, value) {
  const cust = billingNeed(value);
  if (dateOf(row?.billingDate)) return cust === NEED_NONE ? 'billing' : null;
  if (row?.billingSkip === true && cust !== NEED_NONE) return 'skip';
  return null;
}
/* เมนู/ปุ่ม "ขอใบวางบิลงวดนี้" — ไม่ชวนเมื่อไม่ต้องวางบิล (ข้อ 5) · ยังไม่ระบุ = ยังชวนได้ (เหมือนวันนี้) */
export const canRequestBilling = (row, value) => installmentNeed(row, value) !== NEED_NONE;

/* ── รอบจ่าย ────────────────────────────────────────────────────────────────────────────────── */
function formulaRuns(rounds, fromK, toK, source) {
  const out = [];
  for (let k = fromK; k <= toK; k += 1) {
    const { year, month } = monthOfIndex(k);
    const seen = new Set();
    let slot = 0;
    for (const r of rounds) {
      const cutoff = dayInMonth(year, month, r.cutoffDay);
      if (seen.has(cutoff)) continue;
      seen.add(cutoff);
      let pay = dayInMonth(year, month + r.payMonthOffset, r.payDay);
      if (pay < cutoff) pay = dayInMonth(year, month + r.payMonthOffset + 1, r.payDay);
      out.push({ cutoff, pay, source, slot });
      slot += 1;
    }
  }
  return out;
}
/* วัน…ที่ n ของเดือน (5 = สุดท้าย) · วันจ่ายอย่างเดียว ⇒ cutoff = pay (ครบเครดิตภายในวันจ่ายนั้น = ได้รอบนั้น) */
function weekdayRuns(spec, fromK, toK, source) {
  const out = [];
  for (let k = fromK; k <= toK; k += 1) {
    const { year, month } = monthOfIndex(k);
    const days = [];
    for (let d = 1; d <= lastDayOf(year, month); d += 1) {
      const day = iso(year, month, d);
      if (weekdayOf(day) === spec.weekday) days.push(day);
    }
    const seen = new Set();
    let slot = 0;
    for (const n of spec.nths) {
      const day = n === 5 ? days[days.length - 1] : days[n - 1];
      if (!day || seen.has(day)) continue;
      seen.add(day);
      out.push({ cutoff: day, pay: day, source, slot });
      slot += 1;
    }
  }
  return out;
}
const latestYearRuns = (years) => {
  const keys = Object.keys(years || {}).sort();
  return keys.length ? years[keys[keys.length - 1]].runs : [];
};
function coveredMonths(years) {
  const covered = new Set();
  for (const key of Object.keys(years || {})) {
    const runs = years[key].runs;
    if (!runs.length) continue;
    for (let k = monthIndexOf(runs[0].cutoff); k <= monthIndexOf(runs[runs.length - 1].cutoff); k += 1) covered.add(k);
  }
  return covered;
}

/* เดือนแรกที่ปฏิทินครอบ (monthIndex) — ช่องว่างก่อนเดือนนี้ = "ยังไม่ได้กรอกเดือนที่ผ่านแล้ว" (ไม่หยุดชิป) */
const firstCoveredMonth = (years) => {
  const firsts = Object.keys(years || {}).map((key) => years[key].runs[0]?.cutoff).filter(Boolean).sort();
  return firsts.length ? monthIndexOf(firsts[0]) : null;
};

/**
 * รอบจ่ายที่วันตัดรอบอยู่ในช่วง (ขยายหัวท้ายเดือนละหนึ่ง) (สำเนารุ่นสาม + weekday)
 * ⭐ ปฏิทินขาด = **หมุดช่องว่าง** `{ gap:true, pay:null, month, year, yearKnown, pre }` เสมอ (มติ 29/09 — ไม่มีประมาณการ)
 *   cutoff ของหมุด = วันสุดท้ายของเดือน (ให้ dueFor เจอหมุดก่อนรอบของเดือนถัดไป) · `pre` = เดือนก่อนเดือนแรกของปฏิทิน
 *   `yearKnown` = ปีนั้นมีปฏิทินบางเดือนแล้ว (คำบนจอ "ปฏิทิน 2027 ยังไม่มีเดือน ก.ค." แทน "ยังไม่มีปฏิทิน 2027")
 */
export function payRuns(value, fromIso, toIso) {
  const rule = ruleOf(value);
  const from = dateOf(fromIso);
  const to = dateOf(toIso);
  if (!rule?.runs || !from || !to) return [];
  const fromK = monthIndexOf(from) - 1;
  const toK = monthIndexOf(to) + 1;
  if (rule.runs.kind === 'monthly') return formulaRuns(rule.runs.rounds, fromK, toK, 'rule');
  if (rule.runs.kind === 'weekday') return weekdayRuns(rule.runs, fromK, toK, 'rule');
  const { years } = rule.runs;
  const covered = coveredMonths(years);
  const firstK = firstCoveredMonth(years);
  const out = [];
  for (const key of Object.keys(years)) {
    const bySlot = new Map();
    for (const r of years[key].runs) {
      const k = monthIndexOf(r.cutoff);
      if (k < fromK || k > toK) continue;
      const slot = bySlot.get(k) || 0;
      bySlot.set(k, slot + 1);
      out.push({ cutoff: r.cutoff, pay: r.pay, source: 'calendar', slot });
    }
  }
  for (let k = fromK; k <= toK; k += 1) {
    if (covered.has(k)) continue;
    const { year, month } = monthOfIndex(k);
    out.push({
      cutoff: iso(year, month, lastDayOf(year, month)), pay: null, source: 'none', slot: 0, gap: true,
      month: monthKeyOf(k), year, yearKnown: Boolean(years[String(year)]?.runs?.length), pre: firstK === null || k < firstK,
    });
  }
  return out.sort((a, b) => (a.cutoff < b.cutoff ? -1 : a.cutoff > b.cutoff ? 1 : 0));
}

/* หมุดช่องว่าง → ข้อมูลที่จอต้องใช้ (ปี · เดือน · คำ) */
const gapInfo = (gap) => (gap ? { year: gap.year, month: gap.month, yearKnown: gap.yearKnown, text: calendarGapText(gap) } : null);
/**
 * คำของงวด/ชิปที่ปฏิทินยังไม่ครอบ — "ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้" · ปีนั้นมีบางเดือนแล้ว = "ปฏิทิน 2027 ยังไม่มีเดือน ก.ค. · ใส่วันเองได้"
 * @param gap `{ year, month: 'YYYY-MM', yearKnown }` (จาก dueFor · calendarGapFor · roundChoices · planFill)
 */
export function calendarGapText(gap) {
  const year = Number(gap?.year);
  if (!Number.isInteger(year)) return '';
  const m = Number(String(gap?.month || '').slice(5, 7));
  const head = gap?.yearKnown && m >= 1 && m <= 12 ? `ปฏิทิน ${year} ยังไม่มีเดือน ${MONTHS_TH[m - 1]}` : `ยังไม่มีปฏิทิน ${year}`;
  return `${head} · ${CALENDAR_MANUAL_HINT}`;
}

/** สูตรที่ใกล้ปฏิทินที่สุด (มัธยฐานตัวล่าง · สำเนารุ่นสาม) — มีเมตตา 2026 → ตัด 8 → 15 · ตัด 22 → 30 */
export function deriveFormula(runs) {
  if (!Array.isArray(runs) || !runs.length) return null;
  const byMonth = new Map();
  for (const r of runs) {
    const k = monthIndexOf(r.cutoff);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(r);
  }
  const counts = new Map();
  for (const list of byMonth.values()) counts.set(list.length, (counts.get(list.length) || 0) + 1);
  const n = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const months = [...byMonth.values()].filter((list) => list.length === n);
  const lowerMedian = (xs) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];
  const mode = (xs) => {
    const c = new Map();
    xs.forEach((x) => c.set(x, (c.get(x) || 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  };
  const rounds = [];
  for (let i = 0; i < n; i += 1) {
    const cut = months.map((list) => list[i].cutoff);
    const pays = months.map((list) => list[i].pay);
    const allMonthEnd = (days) => days.every((d) => { const [y, m, dd] = partsOf(d); return dd === lastDayOf(y, m); });
    const cutoffDay = allMonthEnd(cut) ? MONTH_END_DAY : lowerMedian(cut.map((d) => partsOf(d)[2]));
    const payDay = allMonthEnd(pays) ? MONTH_END_DAY : lowerMedian(pays.map((d) => partsOf(d)[2]));
    let payMonthOffset = Math.min(1, Math.max(0, mode(months.map((list) => monthIndexOf(list[i].pay) - monthIndexOf(list[i].cutoff)))));
    if (payMonthOffset === 0 && payDay < cutoffDay) payMonthOffset = 1;
    if (!rounds.some((r) => r.cutoffDay === cutoffDay)) rounds.push({ cutoffDay, payDay, payMonthOffset });
  }
  return rounds.sort((a, b) => a.cutoffDay - b.cutoffDay).slice(0, ROUNDS_MAX);
}

/* ── กำหนดชำระ ← วันวางบิล ───────────────────────────────────────────────────────────────────── */
/**
 * กำหนดชำระของงวดที่วางบิลวันนั้น + ที่มา
 * @returns `{ dueDate: '' | 'YYYY-MM-DD', source, run?, reason?, year?, month?, yearKnown?, text? }`
 *   reason: 'unset' ยังไม่ระบุ · 'notNeeded' ไม่ต้องวางบิล (ไม่มีอะไรคิดจากวันวางบิล) · 'noTiming' ต้องวางบิลแต่ยังไม่ตั้งรอบ ·
 *           'calendarMissing' วันวางบิล + เครดิต ตกเดือนที่ปฏิทินยังไม่ครอบ — **หยุด** (มติ 29/09 · year/month = ที่ต้องขอ ·
 *           text = "ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้")
 */
export function dueFor(value, billingIso) {
  const rule = ruleOf(value);
  if (!rule) return { dueDate: '', source: 'none', reason: 'unset' };
  if (rule.need === NEED_NONE) return { dueDate: '', source: 'none', reason: 'notNeeded' };
  if (!rule.billing) return { dueDate: '', source: 'none', reason: 'noTiming' };
  const bill = dateOf(billingIso);
  if (!bill) return { dueDate: '', source: 'none', reason: 'noBilling' };
  const target = addDays(bill, rule.creditDays);
  if (!rule.runs) return { dueDate: target, source: rule.creditDays === 0 ? 'payOnBilling' : 'credit' };
  const hit = payRuns(rule, target, addDays(target, 400)).find((r) => r.cutoff >= target);
  if (!hit) return { dueDate: '', source: 'none', reason: 'noRun' };
  if (hit.gap) return { dueDate: '', source: 'none', reason: 'calendarMissing', ...gapInfo(hit) };
  return { dueDate: hit.pay, source: hit.source, run: { cutoff: hit.cutoff, pay: hit.pay, slot: hit.slot } };
}
/* งวดที่วางบิลวันนั้นตกช่องว่างของปฏิทินไหม — null = ไม่ตก (มีวัน · ไม่ใช่ปฏิทิน · ไม่มีวันวางบิล) · ตก = `{ year, month, yearKnown, text }` */
const gapOfDue = (hit) => (hit?.reason === 'calendarMissing' ? { year: hit.year, month: hit.month, yearKnown: hit.yearKnown, text: hit.text } : null);
export const calendarGapFor = (value, billingIso) => gapOfDue(dueFor(value, billingIso));
export const dueDateForBilling = (value, billingIso, opts) => dueFor(value, billingIso, opts).dueDate;

/* จำนวนรอบต่อเดือนที่ต้องเลือกตอนเติมเดือนละงวด — 0 = ไม่มีชิป (ไม่ต้องวางบิล · ยังไม่ตั้งรอบ · ได้ทุกวันไม่มีรอบ) */
export function slotCount(value) {
  const rule = ruleOf(value);
  if (!rule || rule.need !== NEED_REQUIRED || !rule.billing) return 0;
  if (rule.billing.mode === 'monthly') return rule.billing.days.length;
  if (!rule.runs) return 0;
  if (rule.runs.kind === 'monthly') return rule.runs.rounds.length;
  if (rule.runs.kind === 'weekday') return rule.runs.nths.length;
  const perMonth = new Map();
  for (const key of Object.keys(rule.runs.years)) {
    for (const r of rule.runs.years[key].runs) perMonth.set(r.cutoff.slice(0, 7), (perMonth.get(r.cutoff.slice(0, 7)) || 0) + 1);
  }
  return Math.max(0, ...perMonth.values());
}
const dayWord = (d) => (d === MONTH_END_DAY ? 'สิ้นเดือน' : `วันที่ ${d}`);
const nthWord = (n) => (n === 5 ? 'สุดท้าย' : `ที่ ${n}`);
export function slotLabels(value) {
  const rule = ruleOf(value);
  if (!slotCount(rule)) return [];
  if (rule.billing.mode === 'monthly') return rule.billing.days.map(dayWord);
  if (rule.runs.kind === 'monthly') return rule.runs.rounds.map((r) => `ตัดรอบ${dayWord(r.cutoffDay)}`);
  if (rule.runs.kind === 'weekday') return rule.runs.nths.map((n) => `วัน${WEEKDAYS_FULL_TH[rule.runs.weekday]}${nthWord(n)}`);
  /* "ราววันที่ 8" เป็นแค่ป้ายบอกว่ารอบที่เท่าไรของเดือน (สูตรที่ใกล้ปฏิทินปีล่าสุด) — ไม่ใช่วันที่คิดให้ */
  const formula = deriveFormula(latestYearRuns(rule.runs.years)) || [];
  return Array.from({ length: slotCount(rule) }, (_, i) => (formula[i] ? `รอบที่ ${i + 1} (ตัดรอบราว${dayWord(formula[i].cutoffDay)})` : `รอบที่ ${i + 1}`));
}
function slotMatches(run, slot, countInMonth) {
  if (slot === null || slot === undefined) return true;
  return run.slot === Math.min(slot, countInMonth - 1);
}

/**
 * ชิปวันวางบิล `count` ตัวถัดไปนับจาก `fromIso` (สำเนารุ่นสาม) — มีวันรับวางบิล = วันนั้น · มีรอบจ่าย: เครดิต 0 = วันตัดรอบ ·
 * เครดิต N = วันทำงานสุดท้ายที่ยังทันรอบ · ⭐ ทุกชิป dueDate = dueFor(billingDate)
 * ไม่ต้องวางบิล / ยังไม่ตั้งรอบ / ได้ทุกวันไม่มีรอบ / ยังไม่ระบุ = []
 * ⭐ ปฏิทินของลูกค้า: ชิป **หยุดที่ช่องว่างแรกหลังเดือนที่มีปฏิทิน** (มติ 29/09 — ไม่ข้ามปีที่ขาดไปหยิบปีถัดไป) · เหตุที่หยุดถาม roundChoices
 * @returns `[{ billingDate, dueDate, source, slot, run, weekend }]`
 */
export function billingChoices(value, fromIso, count = 3, { slot = null, holidays = null } = {}) {
  return roundChoices(value, fromIso, count, { slot, holidays }).chips;
}

/**
 * ชิปรอบ + เหตุที่หยุด — ตัวที่แผงงวด/แผงเติม/ตัวอย่างในโมดัลใช้เมื่อต้องบอกคนว่า "ทำไมชิปหมด"
 * @returns `{ chips, missing }` · missing = null | `{ year, month, yearKnown, text }` (ชิปได้ไม่ครบ `count` เพราะปฏิทินยังไม่ครอบ)
 *   ⚠️ ช่องว่างก่อนเดือนแรกของปฏิทิน (เดือนที่ผ่านแล้วไม่ได้กรอก) ไม่หยุดชิป และไม่ขึ้นเป็น missing
 */
export function roundChoices(value, fromIso, count = 3, { slot = null, holidays = null } = {}) {
  const none = { chips: [], missing: null };
  const rule = ruleOf(value);
  const from = dateOf(fromIso);
  if (!rule || rule.need !== NEED_REQUIRED || !rule.billing || !from || count <= 0) return none;
  const out = [];
  if (rule.billing.mode === 'monthly') {
    const [year, month] = partsOf(from);
    const seen = new Set();
    const indexes = rule.billing.days.map((_, i) => i).filter((i) => slot === null || slot === undefined || i === slot);
    for (let k = 0; out.length < count && k < count + 2 + 24; k += 1) {
      const inMonth = indexes
        .map((i) => ({ i, billingDate: dayInMonth(year, month + k, rule.billing.days[i]) }))
        .sort((a, b) => (a.billingDate < b.billingDate ? -1 : 1));
      for (const { i, billingDate } of inMonth) {
        if (billingDate < from || seen.has(billingDate) || out.length >= count) continue;
        seen.add(billingDate);
        const due = dueFor(rule, billingDate);
        out.push({ billingDate, dueDate: due.dueDate, source: due.source, slot: i, run: due.run || null, weekend: weekendNote(billingDate) });
      }
    }
    return { chips: out, missing: null };
  }
  if (!rule.runs) return none;
  const n = rule.creditDays;
  const start = addDays(from, n);
  let stop = null;
  /* ขอบฟ้า 48 เดือน — เริ่มที่ count + 2 แต่ไม่เกินเพดาน (count ≥ 47 เคยได้ชิปว่างทั้งแผง: "ดูรอบถัดไปอีก" กดครั้งที่ 15) */
  for (let span = Math.min(count + 2, 48); span <= 48 && out.length < count && !stop; span += 12) {
    out.length = 0;
    const seen = new Set();
    /* รอบที่รู้จริง: ข้ามช่องว่างก่อนเดือนแรกของปฏิทิน (pre) และช่องว่างที่จบก่อนวันเริ่ม · หยุดที่ช่องว่างแรกหลังจากนั้น
       ⚠️ รอบก่อนวันเริ่มยังต้องอยู่ในรายการ — นับ "รอบที่เท่าไรของเดือน" (slotMatches) จากทั้งเดือน ไม่ใช่จากส่วนที่เหลือ */
    const runs = [];
    stop = null;
    for (const r of payRuns(rule, start, addDays(start, span * 31))) {
      if (r.gap) {
        if (r.pre || r.cutoff < start) continue;
        stop = r;
        break;
      }
      runs.push(r);
    }
    const perMonth = new Map();
    for (const r of runs) perMonth.set(r.cutoff.slice(0, 7), (perMonth.get(r.cutoff.slice(0, 7)) || 0) + 1);
    for (const r of runs) {
      if (out.length >= count) break;
      if (!slotMatches(r, slot, perMonth.get(r.cutoff.slice(0, 7)))) continue;
      const latest = addDays(r.cutoff, -n);
      const billingDate = n === 0 ? latest : lastWorkdayOnOrBefore(latest, holidays);
      if (billingDate < from || seen.has(billingDate)) continue;
      if (n > 0) {
        const hit = dueFor(rule, billingDate);
        if (!hit.run || hit.run.cutoff !== r.cutoff) continue;
      }
      seen.add(billingDate);
      out.push({ billingDate, dueDate: r.pay, source: r.source, slot: r.slot, run: { cutoff: r.cutoff, pay: r.pay, slot: r.slot }, weekend: weekendNote(billingDate) });
    }
  }
  const chips = out.slice(0, count);
  return { chips, missing: chips.length < count && stop ? gapInfo(stop) : null };
}

/**
 * ⭐ ใหม่ — วันวางบิลถอยจากกำหนดชำระ (จอที่ตั้งกำหนดชำระก่อน: ลูกค้าบอก "จ่าย 25 พ.ย." → ต้องวางบิลภายในวันไหน)
 * · ไม่ต้องวางบิล = ไม่มีวันวางบิล (reason 'notNeeded') · ยังไม่ระบุ/ยังไม่ตั้งรอบ = null (ไม่มีอะไรคิดให้)
 * · ได้ทุกวัน ไม่มีรอบจ่าย = กำหนดชำระ − เครดิต (ตรงเสาร์/อาทิตย์ = คำเตือน ไม่เลื่อน — เท่ากับ planCreditCadence ของ prod)
 * · มีรอบ = ชิปที่ช้าที่สุดที่กำหนดชำระ ≤ วันที่ขอ (ชิปกฎเดียวกับ billingChoices ⇒ dueFor(billingDate) = dueDate เสมอ)
 *   exact:false = วันที่ขอไม่ใช่วันจ่ายของลูกค้า — dueDate คือวันจ่ายจริงที่ได้ (เร็วกว่า) · `next` = ทางเลือกที่ช้ากว่า
 *   ⚠️ ระบบไม่เลือกให้ระหว่างสองทาง — จอโชว์ทั้งคู่
 * ⭐ ปฏิทินขาด (มติ 29/09 หยุด): กำหนดชำระตั้งแต่เดือนแรกที่ปฏิทินไม่ครอบ = ไม่รู้ว่ามีรอบที่ช้ากว่านี้ไหม ⇒ `reason:'calendarMissing'`
 *   (billingDate null · `earlier` = รอบสุดท้ายที่รู้ ถ้ามี · year/month/text ของช่องว่าง) · กำหนดชำระก่อนช่องว่างยังตอบได้ตามเดิม
 *   แต่ `next` ที่ไม่รู้ = null + `nextMissing` (คำของช่องว่าง)
 * @returns null | `{ billingDate, dueDate, exact, source, weekend, next?, nextMissing?, reason?, earlier?, year?, month?, text? }`
 */
export function billingForDue(value, dueIso, { holidays = null } = {}) {
  const rule = ruleOf(value);
  const due = dateOf(dueIso);
  if (!rule || !due) return null;
  if (rule.need === NEED_NONE) return { billingDate: null, dueDate: due, exact: true, source: 'none', weekend: '', reason: 'notNeeded' };
  if (!rule.billing) return null;
  if (!rule.runs && rule.billing.mode === 'anyday') {
    const billingDate = addDays(due, -rule.creditDays);
    return { billingDate, dueDate: due, exact: true, source: dueFor(rule, billingDate).source, weekend: weekendNote(billingDate) };
  }
  /* ไล่ชิปเป็นชุด (roundChoices ขอได้ครั้งละไม่เกิน ~46 ตัว) จนเจอชิปแรกที่กำหนดชำระเลยวันที่ขอ — วันจ่ายห่างวันตัดรอบได้ถึง 120 วัน */
  let cursor = addDays(due, -(rule.creditDays + PAY_GAP_MAX_DAYS + 10));
  let best = null;
  let next = null;
  let missing = null;
  for (let guard = 0; guard < 12 && !next && !missing && cursor; guard += 1) {
    const { chips, missing: stop } = roundChoices(rule, cursor, 24, { holidays });
    for (const c of chips) {
      if (!c.dueDate) continue;
      if (c.dueDate <= due) best = c;
      else { next = c; break; }
    }
    if (next) break;
    if (stop) { missing = stop; break; }
    if (!chips.length) break;
    cursor = addDays(chips[chips.length - 1].billingDate, 1);
  }
  const shape = (c) => (c ? { billingDate: c.billingDate, dueDate: c.dueDate, source: c.source, weekend: c.weekend } : null);
  /* ชิปหมดที่ช่องว่างก่อนเจอวันที่ช้ากว่ากำหนดชำระ: กำหนดชำระตกเดือนที่ปฏิทินไม่ครอบ = ไม่รู้ (รอบในเดือนนั้นอาจจ่ายก่อนวันนี้) */
  if (missing && due >= `${missing.month}-01`) {
    /* คำพูดถึงเดือนของกำหนดชำระเอง (ถ้าเดือนนั้นไม่มีปฏิทิน) — "ยังไม่มีปฏิทิน 2028" ไม่ใช่ช่องว่างแรกที่ไล่ชิปไปชน */
    const own = gapInfo(payRuns(rule, due, due).find((r) => r.gap && r.month === due.slice(0, 7)));
    return { billingDate: null, dueDate: null, exact: false, source: 'none', weekend: '', next: null, reason: 'calendarMissing', earlier: shape(best), ...(own || missing) };
  }
  if (!best) return { billingDate: null, dueDate: null, exact: false, source: 'none', weekend: '', next: shape(next), reason: 'noRound' };
  const exact = best.dueDate === due;
  const out = { ...shape(best), exact, next: exact ? null : shape(next) };
  if (!exact && !next && missing) out.nextMissing = missing.text;
  return out;
}

/* ── งวด: ค่า · ด่านเขียน · สถานะ · ที่มา ─────────────────────────────────────────────────────── */
const OPEN_STATUSES = new Set(['pending', 'rejected']);
/* งวดยกมา (0374) — ตัวตัดสินเดียวของระบบ (historicalOrders.js) */
const isOpening = isOpeningInstallment;
export function datesOf(row) {
  const billingDate = dateOf(row?.billingDate);
  return { billingDate, billingEvent: billingDate ? '' : text(row?.billingEvent).slice(0, EVENT_MAX), dueDate: dateOf(row?.dueDate) };
}

/**
 * ด่านเขียนวันของงวด (schedule · schedule-many · หน้าสร้าง SO) — ข้อความไทย หรือ null
 * @param row  งวดในฐานตอนนี้ ({} = งวดใหม่) · @param next ค่าที่จะเป็น `{ billingDate, billingEvent, dueDate }` · @param value รอบของลูกค้า
 * ⭐ ใหม่: (1) ลูกค้าไม่ต้องวางบิล ตั้งวันวางบิลใหม่ได้ **เฉพาะเมื่อยืนยันข้อยกเว้น** (`next.billingException === true` จากโมดัล
 *             "งวดนี้ต้องวางบิล…" · API ลงประวัติ) · ไม่ยืนยัน = 400 · ล้าง/คงวันเดิมได้เสมอ (วันเดิมไม่ถูกซ่อน)
 *         (2) งวดรอเหตุการณ์ไม่มีกำหนดชำระ (ระบบไม่เดาวันของงวดที่ผูกเหตุการณ์ · จอวันนี้ล้างกำหนดชำระอยู่แล้ว)
 *         (3) ติ๊ก "งวดนี้ไม่ต้องวางบิล" (`billingSkip`) ไปกับวันวางบิลไม่ได้ · ลูกค้าไม่ต้องวางบิลอยู่แล้วไม่ต้องติ๊ก
 *         (4) `ruleUnavailable` (อ่านกติกาลูกค้าพลาด) = ตีกลับเฉพาะการเปลี่ยนวันวางบิล/ติ๊ก · กำหนดชำระผ่าน (ไม่ใช่ 500 ทั้งคำขอ)
 * ⚠️ ไม่ตีกลับค่าที่ส่งมา "เงียบ ๆ" — ทุกข้อเป็น 400 พร้อมเหตุ
 */
export function validateInstallmentDates(row, next, value, { ruleUnavailable = false } = {}) {
  const rawBill = text(next?.billingDate);
  const bill = rawBill ? dateOf(rawBill) : null;
  if (rawBill && !bill) return 'วันวางบิลไม่ถูกต้อง';
  const rawDue = text(next?.dueDate);
  const due = rawDue ? dateOf(rawDue) : null;
  if (rawDue && !due) return 'กำหนดชำระไม่ถูกต้อง';
  /* ช่วงปีเดียวกับ CHECK ของฐาน (dates_sane 0245 · billing_sane 0389) — พิมพ์ปีพลาด (2202 · ปี พ.ศ.) ต้องได้ 400 ภาษาไทย ไม่ใช่ 23514 ดิบ */
  const yearOk = (d) => d >= '2000-01-01' && d <= '2100-12-31';
  if (bill && !yearOk(bill)) return 'ปีของวันวางบิลผิด';
  if (due && !yearOk(due)) return 'ปีของกำหนดชำระผิด';
  const event = text(next?.billingEvent);
  if (event.length > EVENT_MAX) return `ชื่อเหตุการณ์ยาวเกิน ${EVENT_MAX} ตัวอักษร`;
  if (isOpening(row) && (bill || event || due)) return 'งวดยกมา — เงินเก็บไปแล้วก่อนเข้าระบบ ไม่มีวันวางบิล/กำหนดชำระ';
  if (bill && event) return 'เลือกวันวางบิล หรือ รอเหตุการณ์ อย่างใดอย่างหนึ่ง';
  if (event && due) return 'งวดที่รอเหตุการณ์ยังไม่มีกำหนดชำระ — ล้างกำหนดชำระ หรือเลือกวันแทน "รอเหตุการณ์"';
  const skip = next?.billingSkip === true;
  if (skip && bill) return `ติ๊ก "${SKIP_TEXT}" แล้วมีวันวางบิลไม่ได้ — ล้างวันวางบิล หรือเอาติ๊กออก`;
  const billChanged = Boolean(bill) && bill !== dateOf(row?.billingDate);
  const skipChanged = skip !== (row?.billingSkip === true);
  if (ruleUnavailable) return billChanged || skipChanged ? RULE_UNAVAILABLE_ERROR : null;
  if (skip && skipChanged && billingNeed(value) === NEED_NONE) return 'ลูกค้าไม่ต้องวางบิลอยู่แล้ว — ไม่ต้องติ๊กรายงวด';
  if (billChanged && billingNeed(value) === NEED_NONE && next?.billingException !== true) return NO_BILLING_WRITE_ERROR;
  return null;
}

/**
 * ที่มาของกำหนดชำระบนงวด (ป้ายข้างช่อง) — derived ทั้งหมด (มติ 29/09: ไม่มีประมาณการ ⇒ ไม่มีรอยให้อ่าน)
 * @returns `{ key, label, source?, computed?, gap? }`
 *   key: '' (ไม่มีกำหนดชำระ) · 'waiting' รอเหตุการณ์ · 'missing' มีวันวางบิล กติกาคิดได้แต่ยังไม่มีกำหนดชำระ ·
 *        'calendarMissing' มีวันวางบิล ไม่มีกำหนดชำระ และปฏิทินปีนั้นยังไม่มี (label = "ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้" · gap) ·
 *        'direct' ไม่ต้องวางบิล (ไม่มีป้าย) · 'manual' ใส่เอง (รวมงวดที่ปฏิทินยังไม่ครอบแล้วคนใส่เอง — gap บอกปีที่ขาด) ·
 *        'rule' (ตามรอบ/ตามปฏิทินลูกค้า/ตามเครดิต N วัน/ชำระวันวางบิล) · 'override' แก้ทับ
 */
export function dueSourceOf(value, row) {
  const v = datesOf(row);
  const rule = ruleOf(value);
  if (!v.dueDate) {
    if (v.billingEvent) return { key: 'waiting', label: '' };
    if (v.billingDate) {
      const c = dueFor(rule, v.billingDate);
      if (c.dueDate) return { key: 'missing', label: '', computed: c.dueDate, source: c.source };
      if (c.reason === 'calendarMissing') return { key: 'calendarMissing', label: c.text, gap: gapOfDue(c) };
    }
    return { key: '', label: '' };
  }
  if (installmentNeed(row, rule) === NEED_NONE) return { key: 'direct', label: '' };
  if (!v.billingDate) return { key: 'manual', label: 'ใส่เอง' };
  const c = dueFor(rule, v.billingDate);
  const credit = rule?.creditDays || 0;
  if (c.dueDate && c.dueDate === v.dueDate) return { key: 'rule', label: sourceLabel(c.source, { creditDays: credit }), source: c.source };
  if (c.reason === 'calendarMissing') return { key: 'manual', label: 'ใส่เอง', gap: gapOfDue(c) };
  if (!c.dueDate) return { key: 'manual', label: 'ใส่เอง' };
  return { key: 'override', label: 'แก้ทับ', computed: c.dueDate };
}

/* สถานะการวางบิลของงวด — ของ prod + 'notNeeded' (ไม่ต้องวางบิล: ไม่มี late/soon/today) */
export function billingState(row, value, { todayIso, requested = false } = {}) {
  if (!row) return { key: 'none', days: null };
  if (isOpening(row)) return { key: 'carried', days: null };
  const status = String(row.status || 'pending');
  if (row.refundedAt || ['reported', 'confirmed', 'refunded'].includes(status)) return { key: 'settled', days: null };
  const bill = dateOf(row.billingDate);
  /* คำร้องที่ส่งแล้วเป็นข้อเท็จจริง — ขึ้นก่อน "ไม่ต้องวางบิล" (ลูกค้าเปลี่ยนเป็นไม่ต้องวางบิลทีหลัง คำร้องเดิมไม่หายจากจอ) */
  if (requested) return { key: 'requested', days: bill && dateOf(todayIso) ? daysBetween(todayIso, bill) : null };
  if (!bill && installmentNeed(row, value) === NEED_NONE) return { key: 'notNeeded', days: null };
  if (!bill) return text(row.billingEvent) ? { key: 'waiting', days: null } : { key: 'none', days: null };
  const days = daysBetween(todayIso, bill);
  if (days === null) return { key: 'upcoming', days: null };
  if (days < 0) return { key: 'late', days };
  if (days === 0) return { key: 'today', days };
  if (days <= BILLING_REMIND_DAYS) return { key: 'soon', days };
  return { key: 'upcoming', days };
}
/* สถานะกำหนดชำระ — 'late' = ป้ายแดง "เลยกำหนด" (อ่านกำหนดชำระช่องเดียว · มติเดิม) */
export function dueState(row, { todayIso } = {}) {
  if (!row) return { key: 'none', days: null };
  if (isOpening(row)) return { key: 'carried', days: null };
  const status = String(row.status || 'pending');
  if (row.refundedAt || ['reported', 'confirmed', 'refunded'].includes(status)) return { key: 'settled', days: null };
  const due = dateOf(row.dueDate);
  /* รอเหตุการณ์ชนะเสมอ — แถวเก่าที่มีทั้งเหตุการณ์และกำหนดชำระ (CHECK ระดับฐานยังไม่ใส่ · §5.2) ไม่ขึ้นแดง ไม่ยิงกระดิ่ง */
  if (text(row.billingEvent) && !dateOf(row.billingDate)) return { key: 'waiting', days: null };
  if (!due) return { key: 'none', days: null };
  const days = daysBetween(todayIso, due);
  if (days === null) return { key: 'upcoming', days: null };
  if (days < 0) return { key: 'late', days };
  if (days === 0) return { key: 'today', days };
  if (days <= DUE_REMIND_DAYS) return { key: 'soon', days };
  return { key: 'upcoming', days };
}

/* ── ตัวเติม (ร่างอย่างเดียว — คนเห็นในตารางก่อนกดบันทึกครั้งเดียว) ───────────────────────────────── */
export function installmentBillingFillable(row) {
  if (!row || isOpening(row) || !OPEN_STATUSES.has(String(row.status || 'pending')) || row.refundedAt) return false;
  return !dateOf(row.billingDate) && !text(row.billingEvent);
}
export function installmentBillingRedatable(row, { requested = false } = {}) {
  if (!row || isOpening(row) || !OPEN_STATUSES.has(String(row.status || 'pending')) || row.refundedAt) return false;
  if (text(row.billingEvent)) return false;
  return !requested;
}
function slotError(rule, slot) {
  const n = slotCount(rule);
  if (n <= 1) return null;
  if (slot === null || slot === undefined) return `ลูกค้ามี ${n} รอบต่อเดือน — เลือกก่อนว่าจะใช้รอบไหน`;
  return Number.isInteger(slot) && slot >= 0 && slot < n ? null : 'รอบที่เลือกไม่มีในรอบวางบิลของลูกค้า';
}
function roundsPrecondition(rule, verb) {
  if (!rule) return 'ลูกค้ายังไม่ระบุว่าต้องวางบิลไหม';
  if (rule.need === NEED_NONE) return `ลูกค้าไม่ต้องวางบิล — ไม่มีรอบให้${verb} ตั้งกำหนดชำระรายงวด`;
  if (!rule.billing) return `ลูกค้ายังไม่ตั้งรอบวางบิล — ไม่มีรอบให้${verb}`;
  if (!slotCount(rule)) return `ลูกค้าวางบิลได้ทุกวัน — ไม่มีรอบให้${verb} ใช้ "เดือนละงวด ตามวันที่ของกำหนดชำระ"`;
  return null;
}
/* ชนิดของแผงเติม — 'rounds' (มีรอบ: ชิป/ปฏิทิน) · 'cadence' (ทุกแบบที่เหลือ: ยึดกำหนดชำระ) */
export const fillKindOf = (value) => (slotCount(value) > 0 ? 'rounds' : 'cadence');

/**
 * เติมเดือนละงวดตามรอบ (สำเนา planFill รุ่นสาม) — rows มี source (ร่าง · คนเห็นก่อนบันทึก)
 * ⭐ ปฏิทินขาด (มติ 29/09 หยุด): งวดที่รอบหมดก่อนถึง = **ข้ามพร้อมเหตุ** ไม่คิดวันให้ — `skipped` (+ `unfilled` เลขงวดแบบเดิม) ·
 *   งวดที่มีกำหนดชำระอยู่แล้วแต่กำหนดชำระตกเดือนที่ปฏิทินไม่ครอบ = ข้ามด้วย (ไม่รู้ว่ารอบที่ถูกคือรอบไหน)
 * @returns `{ rows: [{ id, seq, billingDate, dueDate, keptDue, source }], unfilled: [seq],
 *            skipped: [{ id, seq, reason:'calendarMissing', year, month, yearKnown, text }], reason?, missing?, error }`
 */
export function planFill(value, installments = [], todayIso, { slot = null, holidays = null } = {}) {
  const rule = ruleOf(value);
  const empty = (error) => ({ rows: [], unfilled: [], skipped: [], error });
  const pre = roundsPrecondition(rule, 'เติม');
  if (pre) return empty(pre);
  const se = slotError(rule, slot);
  if (se) return empty(se);
  const only = slotCount(rule) === 1 ? 0 : slot;
  const today = dateOf(todayIso);
  if (!today) return empty('ไม่รู้วันนี้');
  const sorted = [...(installments || [])].sort((a, b) => Number(a.seq) - Number(b.seq));
  /* งวดที่ติ๊ก "งวดนี้ไม่ต้องวางบิล" ไม่รับวันวางบิล (ด่านเขียนตีกลับคู่นี้อยู่แล้ว — ตัวเติมต้องไม่ร่างสิ่งที่บันทึกไม่ได้) */
  const targets = sorted.filter((row) => installmentBillingFillable(row) && row.billingSkip !== true);
  if (!targets.length) return empty('ทุกงวดมีวันวางบิลหรือรอเหตุการณ์อยู่แล้ว');
  const latest = sorted.map((row) => dateOf(row.billingDate)).filter(Boolean).sort().pop() || null;
  let cursor = latest && latest >= today ? addDays(latest, 1) : today;
  const rows = [];
  const skipped = [];
  const unknown = [];
  let missing = null;
  for (const row of targets) {
    const due = dateOf(row.dueDate);
    const { chips, missing: stop } = roundChoices(rule, cursor, 24, { slot: only, holidays });
    const [first] = chips;
    if (!first) {
      if (stop) { missing = missing || stop; skipped.push({ id: row.id, seq: row.seq, reason: 'calendarMissing', ...stop }); } else unknown.push(row.seq);
      continue;
    }
    let pick = first;
    let passed = false;
    if (due) {
      for (const choice of chips) {
        if (!choice.dueDate || choice.dueDate > due) { passed = true; break; }
        pick = choice;
      }
      /* ชิปหมดที่ช่องว่างก่อนเลยกำหนดชำระ และกำหนดชำระตกเดือนที่ไม่มีปฏิทิน = รอบที่ถูกอาจอยู่ในปีที่ยังไม่มี ⇒ ไม่เดา */
      if (!passed && stop && due >= `${stop.month}-01`) {
        missing = missing || stop;
        skipped.push({ id: row.id, seq: row.seq, reason: 'calendarMissing', ...stop });
        continue;
      }
    }
    cursor = addDays(pick.billingDate, 1);
    rows.push({ id: row.id, seq: row.seq, billingDate: pick.billingDate, dueDate: due || pick.dueDate, keptDue: Boolean(due), source: due ? 'kept' : pick.source });
  }
  const unfilled = [...skipped.map((s) => s.seq), ...unknown].sort((a, b) => Number(a) - Number(b));
  if (!rows.length) {
    const error = missing ? `ไม่มีรอบถัดไปให้เติม — ${missing.text}` : 'ไม่มีรอบถัดไปให้เติม';
    return { rows: [], unfilled, skipped, ...(missing ? { reason: 'calendarMissing', missing } : {}), error };
  }
  return { rows, unfilled, skipped, ...(missing ? { reason: 'calendarMissing', missing } : {}), error: null };
}

/**
 * "จัดใหม่งวดที่มีวันแล้วด้วย" ของลูกค้ามีรอบ (สำเนา planRedate รุ่นสาม) — วันวางบิล + กำหนดชำระใหม่ เดือนละงวดตั้งแต่วันนี้
 * ไม่แตะงวดที่ขอใบแล้ว/รอเหตุการณ์/แจ้งชำระแล้ว · งวดหลังไม่ย้อนมาก่อนงวดที่ไม่แตะ · แถวที่วันเท่าเดิมตัดทิ้ง
 * ⭐ ปฏิทินขาด (มติ 29/09 หยุด): งวดที่รอบหมดก่อนถึง **คงวันเดิม** + `skipped: [{ id, seq, reason:'calendarMissing', year, month, text }]`
 * @returns `{ rows: [{ id, seq, billingDate, dueDate, source, prevBillingDate, prevDueDate }], skipped, missing?, error }`
 */
export function planRedate(value, installments = [], todayIso, { requestedIds = new Set(), slot = null, holidays = null } = {}) {
  const rule = ruleOf(value);
  const pre = roundsPrecondition(rule, 'จัด');
  if (pre) return { rows: [], skipped: [], error: pre };
  const se = slotError(rule, slot);
  if (se) return { rows: [], skipped: [], error: se };
  const only = slotCount(rule) === 1 ? 0 : slot;
  const today = dateOf(todayIso);
  if (!today) return { rows: [], skipped: [], error: 'ไม่รู้วันนี้' };
  const sorted = [...(installments || [])].sort((a, b) => Number(a.seq) - Number(b.seq));
  /* งวดที่ติ๊ก "งวดนี้ไม่ต้องวางบิล" ไม่ถูกจัดวันวางบิลให้ (คงไว้ตามเดิม) */
  const isTarget = (row) => row.billingSkip !== true && installmentBillingRedatable(row, { requested: requestedIds.has(row.id) });
  if (!sorted.some(isTarget)) return { rows: [], skipped: [], error: 'ไม่มีงวดที่จัดวันใหม่ได้ (ขอใบวางบิลแล้ว · รอเหตุการณ์ · หรือแจ้งชำระแล้วทุกงวด)' };
  let cursor = today;
  const out = [];
  const skipped = [];
  let missing = null;
  const keepCursor = (row) => {
    const kept = dateOf(row.billingDate);
    if (kept && kept >= cursor) cursor = addDays(kept, 1);
  };
  for (const row of sorted) {
    if (!isTarget(row)) { keepCursor(row); continue; }
    const { chips: [pick], missing: stop } = roundChoices(rule, cursor, 1, { slot: only, holidays });
    /* ปฏิทินขาด (มติ 29/09 หยุด): งวดนี้คงวันเดิม + เหตุ — ไม่ล้มทั้งแผน (งวดก่อนหน้ายังจัดได้) */
    if (!pick) {
      if (stop) missing = missing || stop;
      skipped.push({ id: row.id, seq: row.seq, reason: stop ? 'calendarMissing' : 'noRound', ...(stop || {}) });
      keepCursor(row);
      continue;
    }
    cursor = addDays(pick.billingDate, 1);
    const prevBillingDate = dateOf(row.billingDate);
    const prevDueDate = dateOf(row.dueDate);
    if (prevBillingDate === pick.billingDate && prevDueDate === pick.dueDate) continue;
    out.push({ id: row.id, seq: row.seq, billingDate: pick.billingDate, dueDate: pick.dueDate, source: pick.source, prevBillingDate, prevDueDate });
  }
  const tail = missing ? { missing } : {};
  if (!out.length && skipped.length) return { rows: [], skipped, ...tail, error: `ไม่มีรอบถัดไปให้จัด — ${missing ? missing.text : 'ลูกค้าไม่มีรอบถัดไป'}` };
  if (!out.length) return { rows: [], skipped, error: 'วันของทุกงวดตรงกับรอบปัจจุบันอยู่แล้ว' };
  return { rows: out, skipped, ...tail, error: null };
}

/* ── ชื่องวดบอกเดือน (สำเนา installmentLabelMonth ของ prod) ─────────────────────────────────────── */
const MONTH_WORDS = [
  { full: ['january', 'มกราคม'], short: ['jan', 'ม.ค.'], bare: ['มค'] },
  { full: ['february', 'กุมภาพันธ์'], short: ['feb', 'ก.พ.'], bare: ['กพ'] },
  { full: ['march', 'มีนาคม'], short: ['mar', 'มี.ค.'], bare: ['มีค'] },
  { full: ['april', 'เมษายน'], short: ['apr', 'เม.ย.'], bare: ['เมย'] },
  { full: ['may', 'พฤษภาคม'], short: ['พ.ค.'], bare: ['พค'] },
  { full: ['june', 'มิถุนายน'], short: ['jun', 'มิ.ย.'], bare: ['มิย'] },
  { full: ['july', 'กรกฎาคม'], short: ['jul', 'ก.ค.'], bare: ['กค'] },
  { full: ['august', 'สิงหาคม'], short: ['aug', 'ส.ค.'], bare: ['สค'] },
  { full: ['september', 'กันยายน'], short: ['sep', 'sept', 'ก.ย.'], bare: ['กย'] },
  { full: ['october', 'ตุลาคม'], short: ['oct', 'ต.ค.'], bare: ['ตค'] },
  { full: ['november', 'พฤศจิกายน'], short: ['nov', 'พ.ย.'], bare: ['พย'] },
  { full: ['december', 'ธันวาคม'], short: ['dec', 'ธ.ค.'], bare: ['ธค'] },
];
const MONTH_TIERS = ['full', 'short', 'bare'];
const LATIN_LETTER = /[a-z]/;
const THAI_LETTER = /[ก-๎]/;
const standsAlone = (s, at, len, letter) => !letter.test(s[at - 1] || '') && !letter.test(s[at + len] || '');
/**
 * เดือนที่ชื่องวดบอก — "1st Installment: October 2026 –" · "งวดที่ 2 ก.พ. 2570" → 'YYYY-MM' (พ.ศ. แปลงเป็น ค.ศ.)
 * ต้องมีทั้งชื่อเดือนและปี 4 หลัก ไม่งั้น '' (ไม่เดา) · ใช้เป็น "เบาะแส" ให้คนแตะ — ระบบไม่ตั้งวันเองจากตรงนี้
 * ⭐ ชั้นของชื่อก่อนตำแหน่ง: ชื่อเต็ม → ย่อมีจุด/อังกฤษย่อ → ย่อไม่มีจุด · ในชั้นเดียวกันตัวแรกสุดชนะ (ตำแหน่งเท่ากัน = ยาวกว่า)
 *    · ตัวที่ไม่มีปี 4 หลักตามหลัง ข้ามไปตัวถัดไป ("ม.ค. 2570 (ชำระภายในกุมภาพันธ์)" ยังได้ ม.ค.)
 * ⭐ ตัวย่อไม่มีจุดนับเฉพาะเมื่อยืนเดี่ยว (ข้างหน้า/ข้างหลังไม่ใช่ตัวอักษรไทย หรือเป็นต้น/ท้ายข้อความ) · คำอังกฤษต้องเป็นคำเต็ม
 * 🐞 review 28/09: เดิม indexOf ทุกคำแล้วตำแหน่งแรกสุดชนะ ⇒ ตัวย่อไม่มีจุดที่ซ่อนในคำธรรมดาชนะชื่อเดือนจริง
 *    ("รวมค่า"/"ตามความ" มี มค · "ลูกค้า" มี กค · "มีค่า" มี มีค · "ทรัพย์" มี พย) —
 *    "งวดที่ 3 รวมค่าติดตั้ง ธันวาคม 2569" ได้ 2026-01 แทน 2026-12 (ชิปทางลัด/ปฏิทิน/ตัวเติม "ตามเดือนในชื่องวด" ผิดเดือนทั้งหมด)
 * ⚠️ ย้ายมาจาก billingRule.js ทุกตัวอักษร (29/09) — เทสต์เดิมใน billingRule.test.mjs ยังครอบ (re-export)
 */
export function installmentLabelMonth(label) {
  const s = String(label || '').toLowerCase();
  if (!s) return '';
  const hits = [];
  MONTH_TIERS.forEach((tier, rank) => {
    MONTH_WORDS.forEach((words, i) => {
      for (const word of words[tier]) {
        const latin = LATIN_LETTER.test(word[0]);
        for (let at = s.indexOf(word); at !== -1; at = s.indexOf(word, at + 1)) {
          if (latin && !standsAlone(s, at, word.length, LATIN_LETTER)) continue;
          if (tier === 'bare' && !standsAlone(s, at, word.length, THAI_LETTER)) continue;
          hits.push({ rank, at, len: word.length, month: i + 1 });
        }
      }
    });
  });
  hits.sort((a, b) => a.rank - b.rank || a.at - b.at || b.len - a.len);
  for (const hit of hits) {
    const year = s.slice(hit.at).match(/(\d{4})/);
    if (!year) continue;
    let y = Number(year[1]);
    if (y >= 2400) y -= 543;
    if (y < 2000 || y > 2100) return '';
    return `${y}-${pad(hit.month)}`;
  }
  return '';
}

/* "ต่อจากงวดก่อน" — ยึดวันที่ของกำหนดชำระงวดล่าสุดที่มีวัน · เดือนถัดไป (ย้ายมาจาก billingRule.js ทุกตัวอักษร 29/09)
   (AR-015: งวด 2 กำหนดชำระ 25 ธ.ค. → งวดถัดไปกำหนดชำระ 25 ม.ค. — ไม่ยึดวันวางบิล ซึ่งทำให้กำหนดชำระเลื่อนไปวันที่ 24/27)
   ⭐ งวดล่าสุดตกวันสุดท้ายของเดือนที่สั้นกว่า 31 (30 พ.ย. · 28 ก.พ.) = "สิ้นเดือน" **เว้นแต่** งวดก่อนหน้าพิสูจน์ว่าเป็นวันที่ตายตัว —
     มีงวดก่อนที่ตกวันที่เดียวกันในเดือนที่ยาวกว่าวันนั้น (30 ต.ค. แล้ว 30 พ.ย. = วันที่ 30 ไม่ใช่สิ้นเดือน)
     งวดเดียว / งวดก่อนตกวันอื่น / งวดก่อนก็ตกวันสุดท้ายของเดือน (30 ก.ย.) = ยังอ่านเป็นสิ้นเดือน
   🐞 review 28/09: เดิมดูแค่งวดล่าสุด ⇒ 30 ต.ค. · 30 พ.ย. เสนอ "สิ้นเดือน" แล้วงวดถัดไปได้ 31 ธ.ค. · 28 ม.ค. · 28 ก.พ. ได้ 31 มี.ค. */
export function creditCadenceSuggestion(installments = []) {
  const dated = [...(installments || [])].filter((row) => dateOf(row.dueDate)).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const last = dated[dated.length - 1];
  if (!last) return null;
  const [y, m, d] = partsOf(last.dueDate);
  const fixedDay = dated.slice(0, -1).some((row) => { const [py, pm, pd] = partsOf(row.dueDate); return pd === d && lastDayOf(py, pm) > d; });
  const monthEnd = d === lastDayOf(y, m) && d < 31 && !fixedDay;
  return { fromSeq: last.seq, dueDay: monthEnd ? MONTH_END_DAY : d, startMonth: dayInMonth(y, m + 1, 1).slice(0, 7) };
}

function fillTargets(installments, { includeDated = false, requestedIds = new Set() } = {}) {
  const sorted = [...(installments || [])].sort((a, b) => Number(a.seq) - Number(b.seq));
  const pick = includeDated
    ? (row) => installmentBillingRedatable(row, { requested: requestedIds.has(row.id) })
    : (row) => installmentBillingFillable(row) && !dateOf(row.dueDate);
  return sorted.filter(pick);
}
function monthlyDueDates(targets, { day, startMonth }) {
  if (startMonth !== null && !/^\d{4}-\d{2}$/.test(String(startMonth ?? ''))) return { picks: [], skipped: [], error: 'เลือกเดือนเริ่ม' };
  const [sy, sm] = startMonth ? startMonth.split('-').map(Number) : [0, 0];
  const picks = [];
  const skipped = [];
  targets.forEach((row, k) => {
    if (startMonth) { picks.push({ row, dueDate: dayInMonth(sy, sm + k, day) }); return; }
    const month = installmentLabelMonth(row.label);
    if (!month) { skipped.push(row.seq); return; }
    const [y, m] = month.split('-').map(Number);
    picks.push({ row, dueDate: dayInMonth(y, m, day) });
  });
  if (!picks.length) return { picks, skipped, error: 'ชื่องวดไม่บอกเดือน — เลือกเดือนเริ่มแทน' };
  return { picks, skipped, error: null };
}

/**
 * ⭐ ตัวเติมตัวเดียวที่ **ยึดกำหนดชำระ** (รวม planCreditCadence + planNoCreditDates ของ prod) — เดือนละงวด วันที่ `dueDay`
 * (31 = สิ้นเดือน) · `startMonth` 'YYYY-MM' เรียงเดือน · `null` = เดือนจากชื่องวด (AR-622) · ไม่ส่ง = ยังไม่เลือก ⇒ error
 * วันวางบิลของแถว: ต้องวางบิล + ได้ทุกวันไม่มีรอบ = กำหนดชำระ − เครดิต (prod เดิม) · ทุกแบบที่เหลือ (ไม่ต้องวางบิล ·
 * ยังไม่ระบุ · ยังไม่ตั้งรอบ) = **คงวันเดิมของแถว** (ปกติว่าง — ตัวเติมไม่ล้างวันวางบิลที่มีอยู่เงียบ ๆ)
 * ลูกค้ามีรอบ ⇒ error (ใช้ planFill — วันจ่ายของลูกค้าไม่ใช่ "วันที่ X ทุกเดือน" ที่คนเลือกเอง)
 * @returns `{ rows: [{ id, seq, billingDate, dueDate, prevBillingDate, prevDueDate, weekend }], skipped, error }`
 */
export function planDueCadence(value, installments = [], { dueDay, startMonth, includeDated = false, requestedIds = new Set() } = {}) {
  const rule = ruleOf(value);
  if (slotCount(rule) > 0) return { rows: [], skipped: [], error: 'ลูกค้ามีรอบวางบิล/รอบจ่าย — ใช้ "เติมตามรอบ"' };
  const day = intIn(dueDay, 1, 31);
  if (day === null) return { rows: [], skipped: [], error: 'เลือกวันที่ของกำหนดชำระ' };
  if (startMonth !== null && !/^\d{4}-\d{2}$/.test(String(startMonth ?? ''))) return { rows: [], skipped: [], error: 'เลือกเดือนเริ่ม' };
  const targets = fillTargets(installments, { includeDated, requestedIds });
  if (!targets.length) return { rows: [], skipped: [], error: includeDated ? 'ไม่มีงวดที่จัดวันใหม่ได้' : 'ไม่มีงวดที่ว่าง' };
  const { picks, skipped, error } = monthlyDueDates(targets, { day, startMonth });
  if (error) return { rows: [], skipped, error };
  /* รอบกรรมการ 29/09: รูปเดิม { credit:false } ยึดกำหนดชำระ (โหมด free) — ไม่เติมวันวางบิล "วันเดียวกัน" ให้ (ไม่มีวันวางบิลปลอม) */
  const timed = hasTiming(rule) && !rule.legacyNoCredit;
  const rows = picks.map(({ row, dueDate }) => {
    /* งวดที่ติ๊ก "งวดนี้ไม่ต้องวางบิล" ได้แต่กำหนดชำระ (วันวางบิลคงเดิม = ว่าง) */
    const billingDate = timed && row.billingSkip !== true ? addDays(dueDate, -rule.creditDays) : dateOf(row.billingDate);
    return {
      id: row.id, seq: row.seq, billingDate, dueDate,
      prevBillingDate: dateOf(row.billingDate), prevDueDate: dateOf(row.dueDate),
      weekend: billingDate ? weekendNote(billingDate) : '',
    };
  });
  return { rows, skipped, error: null };
}

/* ── กติกาลูกค้าเปลี่ยน → จอ "งวดที่วันจะเปลี่ยน" (เสนอ · คนยืนยัน · ระบบไม่ย้ายวันเองตอนบันทึกรอบ) ─────────── */
/**
 * @returns `{ rows: [{ id, seq, change, prevBillingDate, billingDate, prevDueDate, dueDate, source?, later?, typedInGap? }], kept: [...], error }`
 *   change: 'clearBilling' (ต้อง → ไม่ต้องวางบิล: ล้างวันวางบิล คงกำหนดชำระ) · 'addBilling' (ไม่ต้อง/ไม่รู้ → ต้องวางบิลมีรอบ:
 *           วันวางบิลถอยจากกำหนดชำระ เฉพาะที่ตรงวันจ่ายของลูกค้า) · 'newDue' (รอบเปลี่ยน: คงวันวางบิล กำหนดชำระตามรอบใหม่)
 *   ⭐ typedInGap = กำหนดชำระที่คนใส่เองตอนปฏิทินปีนั้นยังไม่มี (มติ 29/09 "ใส่วันเองได้") — ใส่ปฏิทินปีนั้นแล้ว **เสนอ** วันตามปฏิทิน
 *     (คนยืนยันบนจอ "งวดที่วันจะเปลี่ยน" · ไม่ย้ายเอง) · ใส่เองตอนปฏิทินมีอยู่แล้ว = 'manual' ไม่แตะเหมือนเดิม
 *   kept: คนแก้เอง (manual) · กำหนดชำระไม่ใช่วันจ่ายของลูกค้า (dueNotOnRound — โชว์สองทาง ไม่เลือกให้ · `laterMissing` = ทางที่ช้ากว่า
 *         อยู่ในปีที่ยังไม่มีปฏิทิน) · ขอใบวางบิลแล้ว (requested) · ติ๊กไม่ต้องวางบิล (skip) ·
 *         'calendarMissing' (กติกาใหม่ไม่มีปฏิทินของปีนั้น — `{ year, month, yearKnown, text }` "ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้")
 */
export function planRuleChange(beforeValue, afterValue, installments = [], { requestedIds = new Set(), holidays = null } = {}) {
  const after = ruleOf(afterValue);
  const needAfter = billingNeed(after);
  const rows = [];
  const kept = [];
  const sorted = [...(installments || [])].sort((a, b) => Number(a.seq) - Number(b.seq));
  for (const row of sorted) {
    const requested = requestedIds.has(row.id);
    if (!installmentBillingRedatable(row, { requested })) {
      if (requested && installmentBillingRedatable(row)) kept.push({ id: row.id, seq: row.seq, reason: 'requested' });
      continue;
    }
    const bill = dateOf(row.billingDate);
    const prev = dateOf(row.dueDate);
    const base = { id: row.id, seq: row.seq, prevBillingDate: bill, prevDueDate: prev };
    if (needAfter === NEED_NONE) {
      if (bill) rows.push({ ...base, change: 'clearBilling', billingDate: null, dueDate: prev });
      continue;
    }
    if (needAfter !== NEED_REQUIRED || !after.billing) continue;
    if (!bill) {
      if (!prev) continue;
      if (row.billingSkip === true) { kept.push({ id: row.id, seq: row.seq, reason: 'skip', dueDate: prev }); continue; }
      const back = billingForDue(after, prev, { holidays });
      if (back?.billingDate && back.exact) rows.push({ ...base, change: 'addBilling', billingDate: back.billingDate, dueDate: prev, source: back.source, weekend: back.weekend });
      else if (back?.reason === 'calendarMissing') kept.push({ id: row.id, seq: row.seq, reason: 'calendarMissing', dueDate: prev, earlier: back.earlier ? { billingDate: back.earlier.billingDate, dueDate: back.earlier.dueDate } : null, ...gapOfDue(back) });
      else {
        const miss = { id: row.id, seq: row.seq, reason: 'dueNotOnRound', dueDate: prev, earlier: back?.billingDate ? { billingDate: back.billingDate, dueDate: back.dueDate } : null, later: back?.next || null };
        kept.push(back?.nextMissing ? { ...miss, laterMissing: back.nextMissing } : miss);
      }
      continue;
    }
    const beforeDue = dueFor(beforeValue, bill);
    const typedInGap = Boolean(prev) && beforeDue.reason === 'calendarMissing';
    const fromRule = Boolean(prev) && prev === beforeDue.dueDate;
    if (prev && !fromRule && !typedInGap) { kept.push({ id: row.id, seq: row.seq, reason: 'manual', dueDate: prev }); continue; }
    const next = dueFor(after, bill);
    if (next.reason === 'calendarMissing') { kept.push({ id: row.id, seq: row.seq, reason: 'calendarMissing', billingDate: bill, dueDate: prev, ...gapOfDue(next) }); continue; }
    if (!next.dueDate || next.dueDate === prev) continue;
    const change = { ...base, change: 'newDue', billingDate: bill, dueDate: next.dueDate, source: next.source, later: Boolean(prev) && next.dueDate > prev };
    rows.push(typedInGap ? { ...change, typedInGap: true } : change);
  }
  return { rows, kept, error: null };
}

/* ── ปฏิทิน: ร่าง · เทียบ · สถานะ · วันตัดรอบ ──────────────────────────────────────────────────── */
function nearestWorkdays(day, holidays) {
  const off = (d) => weekendNote(d) || holidayNameOf(holidays, d) !== null;
  let before = addDays(day, -1);
  while (off(before)) before = addDays(before, -1);
  let after = addDays(day, 1);
  while (off(after)) after = addDays(after, 1);
  return { before, after };
}
/**
 * ร่างปฏิทินหนึ่งปีจาก "รอบประจำ" (ตัดราววันที่ D → จ่าย P) — **ไม่เลื่อนวันเอง** · วันที่ตรงเสาร์/อาทิตย์/วันหยุดในระบบได้ธง +
 * วันทำงานก่อน/หลังให้คนเลือก (ลูกค้าประกาศวันจริง — ร่างเป็นแค่จุดเริ่ม คนเทียบกับรูปทีละเดือน)
 * @param fromMonth 1..12 — ร่างตั้งแต่เดือนนี้ (เดือนที่ผ่านแล้วไม่ต้องกรอก)
 * @returns `{ runs: [{ cutoff, pay, slot, flags: [{ field, text, before, after }] }], error }`
 */
export function draftCalendarYear(year, rounds, { holidays = null, fromMonth = 1 } = {}) {
  const { rounds: clean, error } = normalizeRounds(rounds, 'สูตรร่าง');
  if (error) return { runs: [], error };
  const y = intIn(year, 2000, 2100);
  if (y === null) return { runs: [], error: 'ปีของปฏิทินไม่ถูกต้อง' };
  const m0 = intIn(fromMonth, 1, 12) || 1;
  const runs = formulaRuns(clean, y * 12 + (m0 - 1), y * 12 + 11, 'draft').map((r) => {
    const flags = [];
    for (const field of ['cutoff', 'pay']) {
      const weekend = weekendNote(r[field]);
      const holidayName = holidayNameOf(holidays, r[field]);
      if (weekend || holidayName !== null) flags.push({ field, text: weekend || `ตรงวันหยุดในระบบ${holidayName ? ` (${holidayName})` : ''}`, ...nearestWorkdays(r[field], holidays) });
    }
    return { cutoff: r.cutoff, pay: r.pay, slot: r.slot, flags };
  });
  return { runs, error: null };
}
export function calendarDiff(beforeRuns = [], afterRuns = []) {
  const { changed, added, removed } = keyedCalendarDiff(beforeRuns, afterRuns);
  const bare = (x) => ({ cutoff: x.run.cutoff, pay: x.run.pay });
  return {
    changed: changed.map((x) => ({ from: x.from, to: x.to })), added: added.map(bare), removed: removed.map(bare),
    count: changed.length + added.length + removed.length,
  };
}
/* เทียบรายเดือน × ลำดับรอบในเดือน (ต.ค. รอบ 2 เทียบกับ ต.ค. รอบ 2) — ตัวเดียวของ calendarDiff + calendarDiffSummary */
function keyedCalendarDiff(beforeRuns = [], afterRuns = []) {
  const keyed = (runs) => {
    const map = new Map();
    const count = new Map();
    for (const r of [...(runs || [])].sort((a, b) => (a.cutoff < b.cutoff ? -1 : 1))) {
      const month = r.cutoff.slice(0, 7);
      const i = count.get(month) || 0;
      count.set(month, i + 1);
      map.set(`${month}#${i}`, { run: r, month, index: i });
    }
    return map;
  };
  const a = keyed(beforeRuns);
  const b = keyed(afterRuns);
  const changed = [];
  const added = [];
  const removed = [];
  for (const [key, cur] of b) {
    const old = a.get(key);
    if (!old) added.push(cur);
    else if (old.run.cutoff !== cur.run.cutoff || old.run.pay !== cur.run.pay) changed.push({ from: old.run, to: cur.run, month: cur.month, index: cur.index });
  }
  for (const [key, old] of a) if (!b.has(key)) removed.push(old);
  const order = (x, y) => (x.month < y.month ? -1 : x.month > y.month ? 1 : x.index - y.index);
  return { changed: changed.sort(order), added: added.sort(order), removed: removed.sort(order) };
}

/**
 * ⭐ สรุปการแก้ปฏิทินสำหรับเธรด/audit ของลูกค้า (มติ 29/09 "ทุกการแก้ต้องลงประวัติ · บรรทัดเธรดมีสรุปปฏิทิน")
 * ประโยคกติกา (describeRule) บอกได้แค่ "ตามปฏิทินลูกค้า ปี 2026 (24 รอบ)" — แก้วันเดียวแล้วประโยคเท่าเดิม ⇒ ต้องมีตัวนี้ต่อท้าย
 * สองฝั่งต้องเป็นปฏิทิน (ฝั่งเดียว = ประโยคกติกาเปลี่ยนอยู่แล้ว → lines ว่าง)
 * @returns `{ lines: string[], text, count }` · count = จำนวนรอบที่เปลี่ยน (เพิ่ม/ลบ/แก้) · ไม่เปลี่ยน = `{ lines: [], text: '', count: 0 }`
 *   เช่น ["ปฏิทิน 2026: แก้ 1 รอบ — ต.ค. รอบ 2: ตัด พ. 21 ต.ค. → พฤ. 22 ต.ค.", "เพิ่มปฏิทิน 2027 (24 รอบ)", "เวลาตัดรอบ 16:00 → —"]
 */
export function calendarDiffSummary(beforeValue, afterValue, { maxPerYear = 3 } = {}) {
  const cal = (value) => { const rule = ruleOf(value); return rule?.runs?.kind === 'calendar' ? rule.runs : null; };
  const a = cal(beforeValue);
  const b = cal(afterValue);
  if (!a || !b) return { lines: [], text: '', count: 0 };
  const short = (d) => fmtDate(d, { withYear: false });
  const label = (x) => `${MONTHS_TH[Number(x.month.slice(5, 7)) - 1]} รอบ ${x.index + 1}`;
  const lines = [];
  let count = 0;
  for (const y of [...new Set([...Object.keys(a.years), ...Object.keys(b.years)])].sort()) {
    const ra = a.years[y]?.runs || [];
    const rb = b.years[y]?.runs || [];
    if (!ra.length && rb.length) { lines.push(`เพิ่มปฏิทิน ${y} (${rb.length} รอบ)`); count += rb.length; }
    else if (ra.length && !rb.length) { lines.push(`ลบปฏิทิน ${y} (${ra.length} รอบ)`); count += ra.length; }
    else {
      const { changed, added, removed } = keyedCalendarDiff(ra, rb);
      const details = [
        ...changed.map((x) => `${label(x)}: ${[
          x.from.cutoff !== x.to.cutoff ? `ตัด ${short(x.from.cutoff)} → ${short(x.to.cutoff)}` : '',
          x.from.pay !== x.to.pay ? `จ่าย ${short(x.from.pay)} → ${short(x.to.pay)}` : '',
        ].filter(Boolean).join(' · ')}`),
        ...added.map((x) => `${label(x)} เพิ่ม: ตัด ${short(x.run.cutoff)} → จ่าย ${short(x.run.pay)}`),
        ...removed.map((x) => `${label(x)} ลบ (ตัด ${short(x.run.cutoff)} → จ่าย ${short(x.run.pay)})`),
      ];
      if (details.length) {
        const rest = details.length - maxPerYear;
        lines.push(`ปฏิทิน ${y}: แก้ ${details.length} รอบ — ${details.slice(0, maxPerYear).join(' · ')}${rest > 0 ? ` · และอีก ${rest} รอบ` : ''}`);
        count += details.length;
      }
    }
    const fa = a.years[y]?.fileId || '';
    const fb = b.years[y]?.fileId || '';
    if (fa !== fb) lines.push(!fa ? `แนบรูปปฏิทิน ${y}` : !fb ? `เอารูปปฏิทิน ${y} ออก` : `เปลี่ยนรูปปฏิทิน ${y}`);
  }
  if ((a.cutoffTime || '') !== (b.cutoffTime || '')) lines.push(`เวลาตัดรอบ ${a.cutoffTime || '—'} → ${b.cutoffTime || '—'}`);
  return { lines, text: lines.join('\n'), count };
}

/**
 * สถานะปฏิทิน ณ วันนี้ (การ์ดลูกค้า · ทะเบียน FN · กระดิ่งปีหน้า) — มติ 29/09
 * · เตือนขอปฏิทินปีถัดไปตั้งแต่ `remindFrom` = 1 ธ.ค. ของปีวันตัดรอบสุดท้าย หรือ 30 วันก่อนวันตัดรอบสุดท้าย **อันไหนก่อน**
 *   (มีเมตตา 2026: ตัดรอบสุดท้าย อ. 22 ธ.ค. → อา. 22 พ.ย. → กระดิ่งแรก `firstDigest` จ. 23 พ.ย. 2026 — วันทำงานแรก ≥ remindFrom)
 * · ใส่ปีถัดไปแล้ว วันตัดรอบสุดท้ายเลื่อน ⇒ remindFrom เลื่อนตาม ⇒ หยุดเตือนเอง (ไม่มีธงให้ลืมล้าง)
 * · `lastCoveredBilling` = วันวางบิลสุดท้ายที่ยังได้กำหนดชำระ (วันตัดรอบสุดท้าย − เครดิต) — เลยจากนี้ = "ยังไม่มีปฏิทิน YYYY · ใส่วันเองได้"
 * @returns null (ไม่ใช่ปฏิทิน) | `{ years, coveredThrough, coveredThroughText, lastCutoff, lastCoveredBilling, missingFrom, missingYear,
 *            nextYearMissing, partial, daysLeft, remindFrom, firstDigest, remind, requestText }`
 */
export function calendarStatus(value, todayIso, { leadDays = REMIND_CALENDAR_LEAD_DAYS, fromMmdd = REMIND_CALENDAR_FROM_MMDD, holidays = null } = {}) {
  const rule = ruleOf(value);
  const today = dateOf(todayIso);
  if (rule?.runs?.kind !== 'calendar' || !today) return null;
  const years = Object.keys(rule.runs.years).sort().map(Number);
  const all = years.flatMap((y) => rule.runs.years[String(y)].runs);
  const lastCutoff = all.map((r) => r.cutoff).sort().pop();
  const coveredThroughK = monthIndexOf(lastCutoff);
  const missingFrom = monthKeyOf(coveredThroughK + 1);
  const { year: cy, month: cm } = monthOfIndex(coveredThroughK);
  const missingYear = Number(missingFrom.slice(0, 4));
  const missingMonth = Number(missingFrom.slice(5, 7));
  const partial = missingMonth !== 1;
  const remindFrom = [`${lastCutoff.slice(0, 4)}-${fromMmdd}`, addDays(lastCutoff, -leadDays)].sort()[0];
  return {
    years, coveredThrough: monthKeyOf(coveredThroughK), coveredThroughText: `${MONTHS_TH[cm - 1]} ${cy}`,
    lastCutoff, lastCoveredBilling: addDays(lastCutoff, -rule.creditDays), missingFrom, missingYear, nextYearMissing: !partial, partial,
    daysLeft: daysBetween(today, lastCutoff), remindFrom, firstDigest: firstWorkdayOnOrAfter(remindFrom, holidays), remind: today >= remindFrom,
    requestText: partial ? `ขอปฏิทิน ${missingYear} ตั้งแต่ ${MONTHS_TH[missingMonth - 1]}` : `ขอปฏิทิน ${missingYear}`,
  };
}
/* วันอาทิตย์ของสัปดาห์ (มติ 26/09 สัปดาห์เริ่มวันอาทิตย์) */
export const weekStartOf = (day) => { const d = dateOf(day); return d ? addDays(d, -weekdayOf(d)) : null; };
/**
 * กระดิ่งเช้า "ขอปฏิทินปีหน้า" ของลูกค้าหนึ่งราย (cron daily-digest 08:30 จ.–ศ.) — มติ 29/09
 * ยิงทุกวันทำงานตั้งแต่ remindFrom · **กุญแจรายสัปดาห์** (อา–ส) ⇒ ตารางกระดิ่งเก็บแถวแรกของสัปดาห์แถวเดียว = ซ้ำทุกสัปดาห์
 *   (เช้าวันจันทร์พลาด วันอังคารยังส่งได้) · หยุดเองเมื่อมีปีถัดไป · ผู้รับ = ฝ่ายขายที่ดูแลลูกค้า + FN (ผู้เรียกเลือก)
 * @returns null | `{ kind, key, weekStart, year, missingFrom, partial, text, href, firstDigest }`
 */
export function calendarReminder(value, todayIso, { holidays = null, customerId = '', customer = 'ลูกค้า' } = {}) {
  const st = calendarStatus(value, todayIso, { holidays });
  const today = dateOf(todayIso);
  if (!st || !st.remind || !isWorkday(today, holidays)) return null;
  const weekStart = weekStartOf(today);
  const head = st.partial
    ? `ขอปฏิทินวางบิลของ ${customer} ตั้งแต่ ${MONTHS_TH[Number(st.missingFrom.slice(5, 7)) - 1]} ${st.missingYear}`
    : `ขอปฏิทินวางบิลปี ${st.missingYear} ของ ${customer}`;
  return {
    kind: BELL.CALENDAR_MISSING, key: `billing_calendar_missing:${customerId}:${st.missingFrom}:${weekStart}`, weekStart,
    year: st.missingYear, missingFrom: st.missingFrom, partial: st.partial, firstDigest: st.firstDigest,
    text: `${head} — ปฏิทินที่มีใช้ได้ถึงวันตัดรอบ ${fmtDate(st.lastCutoff)}`, href: LEDGER_HREF.calendar(customerId),
  };
}
/* งวดที่วางบิลวันนี้เข้ารอบไหน + วันสุดท้ายที่ยังทันรอบ · kind: 'cutoffDay' (เครดิต 0 · พูดเวลาตัดรอบ) · 'lastBillingDay' (เครดิต N · ไม่พูดเวลา)
   ปีที่ยังไม่มีปฏิทิน = null (ไม่มีรอบ ไม่มีกระดิ่ง)
   ⚠️ เฉพาะลูกค้าที่ "วางบิลได้ทุกวัน" — ลูกค้าที่รับวางบิลแค่บางวัน (billing.mode 'monthly') วันตัดรอบไม่ใช่เส้นตายวางบิลจริง
     (AR-281 รุ่นสองแปลงเป็นตัดรอบสิ้นเดือนสมมุติ · "วางบิลวันที่ 10 · เครดิต 30 แล้วจ่ายวันที่ 25" ได้เส้นตาย 26 ต.ค. ที่ลูกค้าไม่รับ)
     ⇒ null · ลูกค้ากลุ่มนี้มีกระดิ่งวันวางบิล (sales_order_billing_due) อยู่แล้ว · ธงทะเบียน cutoff/cutoffOn ตามไปเอง */
export function cutoffInfo(value, billingIso) {
  const rule = ruleOf(value);
  const bill = dateOf(billingIso);
  if (!rule?.runs || rule.billing?.mode !== 'anyday' || !bill) return null;
  const due = dueFor(rule, bill);
  if (!due.run) return null;
  const lastBillingDate = addDays(due.run.cutoff, -rule.creditDays);
  return {
    kind: rule.creditDays === 0 ? 'cutoffDay' : 'lastBillingDay', run: due.run, lastBillingDate, onLastDay: lastBillingDate === bill,
    cutoffTime: rule.creditDays === 0 ? rule.runs.cutoffTime || null : null, source: due.source,
  };
}
/**
 * กระดิ่งเช้าวันตัดรอบของงวดหนึ่ง — ยิง 'today' วันทำงานสุดท้าย ≤ เส้นตาย (ตารางวันหยุดของเรา · เส้นตายตรงเสาร์/อาทิตย์/วันหยุด =
 * เตือนวันทำงานก่อนหน้า) · 'next' วันทำงานก่อนนั้น ("พรุ่งนี้…") · เครดิต 0 = "วันตัดรอบของ … — ส่งเอกสารก่อน 16:00 น." ·
 * เครดิต N = "วันสุดท้ายที่วางบิล … แล้วทันรอบจ่าย …" ไม่พูดเวลา (system-design §6) · ปีที่ยังไม่มีปฏิทิน = ไม่ยิง
 */
export function cutoffBell(value, billingIso, todayIso, { holidays = null, customer = 'ลูกค้า' } = {}) {
  const info = cutoffInfo(value, billingIso);
  const today = dateOf(todayIso);
  if (!info || !today) return null;
  const deadline = info.lastBillingDate;
  const fireToday = lastWorkdayOnOrBefore(deadline, holidays);
  const fireNext = lastWorkdayOnOrBefore(addDays(fireToday, -1), holidays);
  const when = today === fireToday ? 'today' : today === fireNext ? 'next' : null;
  if (!when) return null;
  const day = (d) => fmtDate(d, { withYear: false });
  const offDay = !isWorkday(deadline, holidays);
  const lead = offDay
    ? (when === 'today' ? 'วันนี้เป็นวันทำการสุดท้าย' : `${day(fireToday)} เป็นวันทำการสุดท้าย`)
    : (today === deadline ? 'วันนี้เป็น' : addDays(today, 1) === deadline ? `พรุ่งนี้ (${day(deadline)}) เป็น` : `${day(deadline)} (วันทำการถัดไป) เป็น`);
  const tail = offDay ? ` (วันสุดท้ายจริง ${day(deadline)} ${weekendNote(deadline) || 'ตรงวันหยุดในระบบ'})` : '';
  const msg = info.kind === 'cutoffDay'
    ? `${lead}${offDay ? 'ก่อน' : ''}วันตัดรอบของ ${customer} — ส่งเอกสาร${info.cutoffTime && !offDay ? `ก่อน ${info.cutoffTime} น.` : 'ภายในวันนั้น'}${tail}`
    : `${lead}${offDay ? 'ที่' : 'วันสุดท้ายที่'}วางบิล ${customer} แล้วทันรอบจ่าย ${day(info.run.pay)}${tail}`;
  return { when, kind: info.kind, deadline, fireOn: when === 'today' ? fireToday : fireNext, run: info.run, cutoffTime: info.cutoffTime, text: msg };
}
/**
 * ⭐ กระดิ่งวันตัดรอบแบบรวมต่อรอบ (digest เช้า · มติ 29/09 "บอกงวดที่ยังรอวางบิลของรอบนั้น") — ลูกค้าหนึ่งราย หลายงวด
 * ตัวตัดสินรายงวดคือ `bellsFor` ตัวเดียว (ยอด > 0 · รอชำระ · ไม่ใช่งวดยกมา · มีวันวางบิล · ยังไม่ขอใบวางบิล) → รวมตาม (เส้นตาย, today|next)
 * @param rows งวดของลูกค้ารายนี้ (ทุกใบ) — ต้องมี `id, seq, status, amount, kind, billingDate, billingEvent, dueDate, billingSkip` (+ salesOrderId ถ้ามี)
 * @returns `[{ kind, deadline, when, fireOn, cutoffKind, run, cutoffTime, text, ledgerHref, rows: [{ id, seq, billingDate, amount, salesOrderId? }] }]`
 *   (เรียงเส้นตาย) · กุญแจกันยิงซ้ำ/ผู้รับเป็นของผู้เรียก — แนะนำ `billing_cutoff:{salesOrderId|customerId}:{deadline}:{when}`
 */
export function cutoffDigest(rows = [], value, todayIso, { holidays = null, customer = 'ลูกค้า', requestedIds = new Set() } = {}) {
  const groups = new Map();
  for (const row of rows || []) {
    const bell = bellsFor(row, value, { todayIso, requested: requestedIds.has(row.id), holidays, customer }).find((b) => b.kind === BELL.BILLING_CUTOFF);
    if (!bell) continue;
    const key = `${bell.date}|${bell.when}`;
    if (!groups.has(key)) {
      groups.set(key, {
        kind: BELL.BILLING_CUTOFF, deadline: bell.date, when: bell.when, fireOn: bell.fireOn, cutoffKind: bell.cutoffKind, run: bell.run,
        cutoffTime: bell.cutoffTime, text: bell.text, ledgerHref: bell.ledgerHref, rows: [],
      });
    }
    const line = { id: row.id, seq: row.seq, billingDate: dateOf(row.billingDate), amount: Number(row.amount) };
    if (row.salesOrderId) line.salesOrderId = row.salesOrderId;
    groups.get(key).rows.push(line);
  }
  return [...groups.values()].sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0));
}

/* ── กระดิ่ง + ทะเบียน FN ─────────────────────────────────────────────────────────────────────── */
export const BELL = Object.freeze({
  BILLING_DUE: 'sales_order_billing_due',          // มีแล้ว (prod) — วันวางบิล 0..3 วัน
  BILLING_CUTOFF: 'sales_order_billing_cutoff',    // ใหม่ (มติ 29/09) — เช้าวันตัดรอบ/วันสุดท้ายที่ทันรอบ · cutoffBell / cutoffDigest
  DUE_SOON: 'sales_order_due_soon',                // ใหม่ — ครบกำหนดชำระ 0..3 วัน · ทุกงวดที่มีกำหนดชำระ (รอบกรรมการ 29/09)
  CALENDAR_MISSING: 'customer_billing_calendar_missing', // ใหม่ (มติ 29/09) — ขอปฏิทินปีหน้า รายสัปดาห์ · calendarReminder
});

/* ลิงก์ของแถวสรุป FN — ทุกกระดิ่งพาไปทะเบียนที่กรองตรงกับกระดิ่ง (รอบกรรมการ 29/09: กระดิ่งวันตัดรอบเดิมไม่มีทางไปต่อ) */
export const LEDGER_HREF = Object.freeze({
  billingSoon: '/finance/payments?billing=soon',
  cutoff: (day) => `/finance/payments?billing=cutoff&on=${day}`,
  dueSoon: '/finance/payments?due=soon',
  calendar: (customerId) => `/database/customers/${customerId}#billing-rule`,
});

/**
 * กระดิ่งของงวดเช้านี้ (รอบกรรมการ 29/09 — เลิก "หนึ่งงวดหนึ่งวันนำ"):
 *   · มีวันวางบิล = เตือนวันวางบิล 0..3 วัน (+ วันตัดรอบถ้ามีรอบจ่าย) · หยุดเมื่อขอใบวางบิลแล้ว
 *   · **ทุกงวดที่มีกำหนดชำระ** = เตือนครบกำหนดชำระ 0..3 วัน (เจ้าของบอก "เราตั้งกำหนดชำระเพื่อไว้ติดตาม" — ลูกค้าเครดิต 30
 *     ก็ต้องได้กระดิ่งก่อนเงินเข้า) · ไม่หยุดเมื่อขอใบแล้ว (ขอใบ ≠ ได้เงิน)
 *   · รวมเป็นกระดิ่งเดียวเฉพาะเมื่อวันวางบิล = กำหนดชำระ (ชำระวันวางบิล) และกระดิ่งวางบิลยังยิงอยู่ (sameDayDue)
 *   · รอเหตุการณ์ = เงียบ (แม้แถวเก่าจะมีกำหนดชำระค้าง)
 * @returns `[{ kind, date, key, days?, text?, missingBilling?, sameDayDue?, ledgerHref, when?, fireOn?, cutoffKind?, run?, cutoffTime? }]`
 *   key = กุญแจกันยิงซ้ำ (งวด + วัน · แบบ prod) · กระดิ่งวันตัดรอบ: date = เส้นตาย (= ?billing=cutoff&on=) · when 'today'|'next'
 */
export function bellsFor(row, value, { todayIso, requested = false, holidays = null, customer = 'ลูกค้า' } = {}) {
  if (!row?.id || String(row.status || '') !== 'pending' || !(Number(row.amount) > 0) || isOpening(row)) return [];
  const out = [];
  const bill = dateOf(row.billingDate);
  const due = dateOf(row.dueDate);
  if (!bill && text(row.billingEvent)) return out;
  let billingBell = false;
  if (bill) {
    const st = billingState(row, value, { todayIso, requested });
    if (st.key === 'today' || st.key === 'soon') {
      billingBell = true;
      out.push({ kind: BELL.BILLING_DUE, date: bill, key: `billing_due:${row.id}:${bill}`, days: st.days, sameDayDue: due === bill, ledgerHref: LEDGER_HREF.billingSoon });
    }
    if (!requested) {
      const cb = cutoffBell(value, bill, todayIso, { holidays, customer });
      if (cb) {
        out.push({
          kind: BELL.BILLING_CUTOFF, date: cb.deadline, key: `billing_cutoff:${row.id}:${cb.deadline}:${cb.when}`, text: cb.text, ledgerHref: LEDGER_HREF.cutoff(cb.deadline),
          when: cb.when, fireOn: cb.fireOn, cutoffKind: cb.kind, run: cb.run, cutoffTime: cb.cutoffTime,
        });
      }
    }
  }
  const days = due ? daysBetween(todayIso, due) : null;
  if (days !== null && days >= 0 && days <= DUE_REMIND_DAYS && !(billingBell && due === bill)) {
    out.push({
      kind: BELL.DUE_SOON, date: due, key: `due_soon:${row.id}:${due}`, days,
      missingBilling: !bill && installmentNeed(row, value) === NEED_REQUIRED && nagsMissingBilling(value), ledgerHref: LEDGER_HREF.dueSoon,
    });
  }
  return out;
}
/* ชนิดกระดิ่งที่ลูกค้าแบบนี้ "มีได้" — ตารางสรุปของจอ/เอกสาร (§5) */
export function reminderKinds(value) {
  const rule = ruleOf(value);
  const need = billingNeed(rule);
  if (need === NEED_NONE) return [BELL.DUE_SOON];
  const kinds = [BELL.BILLING_DUE, BELL.DUE_SOON];
  /* กระดิ่งวันตัดรอบ = ตัวเดียวกับ cutoffInfo — รับวางบิลแค่บางวันไม่มีกระดิ่งนี้ (ชิปการ์ดต้องไม่สัญญาเกินที่ cron ยิง) */
  if (rule?.runs && rule.billing?.mode === 'anyday') kinds.push(BELL.BILLING_CUTOFF);
  if (rule?.runs?.kind === 'calendar') kinds.push(BELL.CALENDAR_MISSING);
  return kinds;
}
/**
 * ธงของแถวทะเบียน FN — ตัวเดียวกับกระดิ่ง/แผงงวด · ตัวกรองของทะเบียนอ่านธงนี้ (ไม่คิดซ้ำ):
 *   `?due=soon` = dueSoon (กำหนดชำระ 0..3 วัน · งวดรอชำระ · รอเหตุการณ์ไม่นับ — ชุดของกระดิ่ง sales_order_due_soon
 *   รวมงวดที่กระดิ่งถูกรวมเข้ากระดิ่งวางบิลวันเดียวกัน) · `?billing=missing` = missingBilling
 *   ⭐ `?billing=cutoff&on=YYYY-MM-DD` = `cutoffOn === on` (มติ 29/09) — เส้นตายของรอบที่งวดนี้ยังรอวางบิล (วันตัดรอบ − เครดิต ·
 *     = `date` ของกระดิ่งวันตัดรอบ ⇒ หัวข้อกระดิ่ง "N งวด" = แถวที่ลิงก์เปิดมาเจอในเช้าวันที่ยิง) · ขอใบแล้ว/ยอด 0/ไม่ใช่รอชำระ = null
 *   `cutoff` = ข้อมูลรอบของงวด (cutoffInfo · ไม่สนว่าขอใบแล้วไหม) ให้แถวลูกค้าโชว์ "ตัดรอบ … ก่อน 16:00 น." · ปีที่ยังไม่มีปฏิทิน = null +
 *   `calendarGap` = `{ year, month, text }`
 */
export function ledgerFlags(row, value, { todayIso, requested = false } = {}) {
  const need = installmentNeed(row, value);
  const pending = String(row?.status || 'pending') === 'pending' && !isOpening(row);
  const bill = dateOf(row?.billingDate);
  const due = dueState(row, { todayIso });
  const cutoff = bill ? cutoffInfo(value, bill) : null;
  return {
    need,
    billing: billingState(row, value, { todayIso, requested }),
    due,
    dueSoon: pending && (due.key === 'today' || due.key === 'soon'),
    missingBilling: pending && need === NEED_REQUIRED && nagsMissingBilling(value) && !bill && !text(row?.billingEvent),
    requestable: canRequestBilling(row, value),
    override: needOverrideOf(row, value),
    cutoff,
    cutoffOn: cutoff && pending && !requested && Number(row?.amount) > 0 ? cutoff.lastBillingDate : null,
    calendarGap: bill ? calendarGapFor(value, bill) : null,
  };
}
/* ตัวกรองทะเบียน `?billing=cutoff&on=` — ตัวเดียวกับที่หน้า/route ใช้ (ไม่มีวัน = ไม่มีแถว) */
export const matchesCutoffFilter = (flags, onIso) => Boolean(dateOf(onIso)) && flags?.cutoffOn === dateOf(onIso);

/**
 * "รอบถัดไปของลูกค้า" (แถวลูกค้าในทะเบียน FN · การ์ดลูกค้า) — ลูกค้าที่มีรอบเท่านั้น (ไม่มีรอบ = null)
 * @returns null | `{ choice, missing, cutoffTime, text }` · choice = ตัวเลือกแรกจากวันนี้ (billingChoices) · ปฏิทินหมด = choice null + missing
 *   text: "วางบิลภายใน พฤ. 8 ต.ค. 2026 ก่อน 16:00 น. → กำหนดชำระ พฤ. 15 ต.ค. 2026 · ตามปฏิทินลูกค้า" (เวลาเฉพาะเครดิต 0) ·
 *         ปฏิทินหมด = "ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้"
 */
export function nextRunInfo(value, todayIso, { holidays = null } = {}) {
  const rule = ruleOf(value);
  if (!slotCount(rule)) return null;
  const { chips: [first], missing } = roundChoices(rule, todayIso, 1, { holidays });
  if (!first) return missing ? { choice: null, missing, cutoffTime: null, text: missing.text } : null;
  const cutoffTime = rule.creditDays === 0 ? rule.runs?.cutoffTime || null : null;
  const src = sourceLabel(first.source, { creditDays: rule.creditDays });
  return {
    choice: first, missing: null, cutoffTime,
    text: `วางบิลภายใน ${fmtDate(first.billingDate)}${cutoffTime ? ` ก่อน ${cutoffTime} น.` : ''} → กำหนดชำระ ${fmtDate(first.dueDate)}${src ? ` · ${src}` : ''}`,
  };
}

/* ── ข้อมูลเพี้ยนที่ต้องเตือน (เตือน ไม่แก้ให้) ───────────────────────────────────────────────────── */
/**
 * วันที่พิมพ์ไว้ในชื่อ/หมายเหตุงวด ("วางบิล 24/10/2026" · "ชำระวันที่ 14/11/2569") ไม่ตรงกับช่องวัน — data survey: ตรงแค่ 5/22
 * @returns `[{ field: 'billing'|'due', noted, stored, days }]` (stored null = ช่องว่าง)
 */
export function noteDateHints(row) {
  const s = `${row?.label || ''} ${row?.note || ''}`;
  const out = [];
  const re = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    let y = Number(m[3]);
    if (y >= 2400) y -= 543;
    const noted = dateOf(iso(y, Number(m[2]), Number(m[1])));
    if (!noted) continue;
    const before = s.slice(Math.max(0, m.index - 16), m.index);
    const field = /วางบิล/.test(before) ? 'billing' : /ชำระ|จ่าย|โอน/.test(before) ? 'due' : null;
    if (!field) continue;
    const stored = dateOf(field === 'billing' ? row?.billingDate : row?.dueDate);
    if (stored === noted) continue;
    out.push({ field, noted, stored, days: stored ? daysBetween(noted, stored) : null });
  }
  return out;
}
/* ชุดงวดรายเดือนที่มีเดือนหาย (AR-015 SO-26090230-0: ธ.ค. 2026 → ก.พ. 2027 · ม.ค. ไม่มีงวดครบกำหนด) */
export function dueSeriesGaps(installments = []) {
  const dated = [...(installments || [])].filter((r) => !isOpening(r) && dateOf(r.dueDate)).sort((a, b) => Number(a.seq) - Number(b.seq));
  if (dated.length < 3) return [];
  const steps = dated.slice(1).map((r, i) => ({ from: dated[i], to: r, gap: monthIndexOf(r.dueDate) - monthIndexOf(dated[i].dueDate) }));
  if (steps.filter((x) => x.gap === 1).length * 2 < steps.length) return [];
  return steps.filter((x) => x.gap >= 2).map((x) => ({
    afterSeq: x.from.seq, beforeSeq: x.to.seq,
    missing: Array.from({ length: x.gap - 1 }, (_, i) => monthKeyOf(monthIndexOf(x.from.dueDate) + i + 1)),
  }));
}

/* ── ย้ายข้อมูล: backfill ของรอมติ ข้อ 4 (ตัวคิดล้วน · SQL ของ migration ต้องให้ผลเท่ากันด้วยไฟล์ตัวอย่างเดียว) ───── */
/* ตัวเลขชุดเดียวทุกจอ/เอกสาร = **ข้ามสหมิตร AR-109** (skipArCodes) — data survey นับ 14/38/490 เพราะรวมสหมิตร */
export const NEED_BACKFILL_OPTIONS = Object.freeze({
  1: 'ไม่ต้องวางบิลทั้งหมด (541 · สหมิตรไม่แตะ)',
  2: 'วางบิล ชำระวันวางบิล (449) · ยังไม่ตั้งคงเดิม',
  3: 'ตามหลักฐาน: ต้อง 13 · ไม่ต้อง 38 · ยังไม่ระบุ 491',
  4: 'ยังไม่ระบุทั้งหมด (542)',
});
const isLegacyNoCredit = (raw) => raw && typeof raw === 'object' && raw.credit === false;
/**
 * แถวลูกค้าหนึ่งแถวภายใต้ทางเลือก `option` — แตะเฉพาะ null กับ { credit:false } · ลูกค้าที่ตั้งเครดิต/รอบแล้ว (11) ไม่แตะทุกทาง
 * @param evidence `{ billed: Set<AR>, prepaid: Set<AR> }` (รายชื่อจาก data survey — ไม่ใช่ heuristics ใน SQL)
 * @returns `{ next, changed }` · next = รูปรุ่นสี่ที่จะเขียน หรือ null (ยังไม่ระบุ)
 */
export function backfillRuleFor(customer, option, evidence = { billed: new Set(), prepaid: new Set() }) {
  const raw = customer?.billingRule ?? null;
  const legacy = isLegacyNoCredit(raw);
  if (raw !== null && !legacy) return { next: raw, changed: false };
  const note = legacy && raw.note ? { note: raw.note } : {};
  const none = { v: RULE_VERSION, need: NEED_NONE, ...note };
  const sameDay = { v: RULE_VERSION, need: NEED_REQUIRED, billing: { mode: 'anyday' }, creditDays: 0, runs: null, ...note };
  const noTiming = { v: RULE_VERSION, need: NEED_REQUIRED, billing: null, ...note };
  let next;
  switch (Number(option)) {
    case 1: next = none; break;
    case 2: next = legacy ? sameDay : null; break;
    case 3:
      if (evidence.billed.has(customer.arCode)) next = legacy ? sameDay : noTiming;
      else if (evidence.prepaid.has(customer.arCode)) next = none;
      else next = null;
      break;
    case 4: next = null; break;
    default: throw new Error(`ทางเลือกข้อ 4 ไม่รู้จัก: ${option}`);
  }
  return { next, changed: JSON.stringify(next) !== JSON.stringify(raw) };
}
/**
 * แผน backfill ทั้งฐาน + ด่านหยุด — ⭐ ลูกค้าที่จะกลายเป็น "ไม่ต้องวางบิล" แต่มีงวดเปิดที่มีวันวางบิล = **หยุดทั้ง migration**
 * (ต้องผ่านจอ "งวดที่วันจะเปลี่ยน" ของคนก่อน) · วันนี้ = 0 งวด (วันวางบิลมีแค่ AR-015 + AR-281)
 * @returns `{ counts: { none, required, unknown, untouched }, changes: [...], blockers: [...], review: [...] }`
 */
export function backfillPlan(customers = [], installments = [], option, evidence, { review = [], skipArCodes = [] } = {}) {
  const counts = { none: 0, required: 0, unknown: 0, untouched: 0 };
  const changes = [];
  const willBeNone = new Set();
  const skip = new Set(skipArCodes);
  for (const c of customers) {
    /* ลูกค้าที่เงินอยู่นอกระบบ (สหมิตร AR-109 · SAHAMIT_AR_CODE — กระดิ่งข้ามอยู่แล้ว) ไม่แตะ: ทาง 3 จะเปิดคำชวน 45 งวดของใบที่ FN ไม่ได้ตาม */
    const { next, changed } = skip.has(c.arCode) ? { next: c.billingRule ?? null, changed: false } : backfillRuleFor(c, option, evidence);
    if (!changed && next !== null && !isLegacyNoCredit(next)) counts.untouched += 1;
    else if (next === null || isLegacyNoCredit(next)) counts.unknown += 1;
    else if (next.need === NEED_NONE) { counts.none += 1; willBeNone.add(c.id); }
    else counts.required += 1;
    if (changed) changes.push({ id: c.id, arCode: c.arCode, before: c.billingRule ?? null, after: next });
  }
  const blockers = (installments || []).filter((r) => willBeNone.has(r.customerId) && dateOf(r.billingDate)
    && OPEN_STATUSES.has(String(r.status || 'pending')) && !isOpening(r));
  const reviewHits = changes.filter((c) => review.includes(c.arCode)).map((c) => c.arCode);
  return { counts, changes, blockers, review: reviewHits };
}
/**
 * ⭐ ด่านหยุดของ backfill — อยู่ใน JS ที่รันจริง (รอบกรรมการ 29/09: สคริปต์ node PATCH ผ่าน PostgREST ไม่มี RAISE ของ SQL ให้พึ่ง)
 * สคริปต์ต้องเรียกตัวนี้ก่อน PATCH แถวแรก · ok:false = ออกทันที ไม่มีแถวไหนถูกเขียน
 */
export function backfillGate(plan) {
  const n = plan?.blockers?.length || 0;
  if (n) return { ok: false, error: `หยุด: ${n} งวดเปิดมีวันวางบิลของลูกค้าที่จะเป็น "ไม่ต้องวางบิล" — ผ่านจอ "งวดที่วันจะเปลี่ยน" ก่อน` };
  return { ok: true, error: null };
}

/* ── โมดัล: ฟอร์ม ⇄ รูปที่เก็บ (สัญญาของงาน UI) ────────────────────────────────────────────────────
   ฟอร์ม = { need: null|'none'|'required', bill: null|'anyday'|'monthly'|'calendar', days, creditDays,
             rounds: [{day, off}] (ทุกเดือน D → P · คู่วันตัดรอบ) , payDays: null|{kind:'monthly',days}|{kind:'weekday',weekday,nths},
             calPay: null|'same'|'credit' (รอมติ ข้อ 1 — ไม่มีค่าตั้งต้น), calendar: { years: { YYYY: [{cutoff,pay}] }, cutoffTime, files: { YYYY: fileId } }, note,
             legacy?: true (รูปผ่อนปรนของ AR-281) , legacyNoCredit?: true (ต้องตอบ need ใหม่) }
   ⭐ รูปเดิม { credit:false } เปิดมาเป็น need:null — โมดัลไม่เลือก "ต้องวางบิล" ให้ (รอมติ ข้อ 4 · ห้ามเดาเงียบ) */
const payOnlyRounds = (rounds) => rounds.every((r) => r.cutoffDay === r.payDay && r.payMonthOffset === 0);
export function formOf(value) {
  const rule = ruleOf(value);
  if (!rule) return { need: null };
  const note = rule.note || '';
  if (rule.legacyNoCredit) return { need: null, legacyNoCredit: true, note, was: NO_CREDIT_TEXT };
  if (rule.need === NEED_NONE) return { need: NEED_NONE, note };
  if (!rule.billing) return { need: NEED_REQUIRED, bill: null, note };
  const base = { need: NEED_REQUIRED, note, creditDays: rule.creditDays, days: rule.billing.days || [] };
  if (!rule.runs) return { ...base, bill: rule.billing.mode, payDays: null };
  if (rule.runs.kind === 'weekday') return { ...base, bill: rule.billing.mode, payDays: { kind: 'weekday', weekday: rule.runs.weekday, nths: [...rule.runs.nths] } };
  if (rule.runs.kind === 'calendar') {
    const years = {};
    const files = {};
    for (const y of Object.keys(rule.runs.years)) {
      years[y] = rule.runs.years[y].runs.map((r) => ({ ...r }));
      if (rule.runs.years[y].fileId) files[y] = rule.runs.years[y].fileId;
    }
    return {
      ...base, bill: 'calendar', days: [], calPay: rule.creditDays === 0 ? 'same' : 'credit',
      calendar: { years, cutoffTime: rule.runs.cutoffTime || null, files },
    };
  }
  const { rounds } = rule.runs;
  /* วันจ่ายอย่างเดียว (ตัด = จ่าย เดือนเดียวกัน) = "จ่ายทุกวันที่ P" — ใช้ได้กับวางบิลทุกวัน/เฉพาะวันที่ และมีเครดิตหรือไม่ก็ได้ */
  if (payOnlyRounds(rounds)) return { ...base, bill: rule.billing.mode, payDays: { kind: 'monthly', days: rounds.map((r) => r.payDay) } };
  /* วันรับวางบิล + คู่ตัด → จ่ายที่ไม่ใช่วันจ่ายอย่างเดียว = รูปผ่อนปรนของ toV4 (AR-281 แถวเดียว) — อ่านอย่างเดียว บันทึกซ้ำ = แบบวันตัดรอบ */
  if (rule.billing.mode === 'monthly') {
    const at = (i) => rounds[Math.min(i, rounds.length - 1)];
    return { ...base, bill: 'monthly', payDays: null, rounds: rule.billing.days.map((_, i) => ({ day: at(i).payDay, off: at(i).payMonthOffset })), legacy: true };
  }
  return { ...base, bill: 'monthly', days: rounds.map((r) => r.cutoffDay), payDays: null, rounds: rounds.map((r) => ({ day: r.payDay, off: r.payMonthOffset })) };
}
/* ฟอร์ม → รูปรุ่นสี่ (ยังไม่ตรวจ — ส่งต่อให้ normalizeRule(…, { allowLegacy:false })) · null = ยังตั้งไม่ครบ */
export function ruleFromForm(form = {}) {
  const note = form.note ? { note: form.note } : {};
  if (form.need === NEED_NONE) return { v: RULE_VERSION, need: NEED_NONE, ...note };
  if (form.need !== NEED_REQUIRED) return null;
  if (!form.bill) return { v: RULE_VERSION, need: NEED_REQUIRED, billing: null, ...note };
  const n = form.creditDays === '' || form.creditDays === null || form.creditDays === undefined ? null : Number(form.creditDays);
  if (form.bill === 'calendar') {
    const cal = form.calendar || {};
    const years = {};
    for (const [y, runs] of Object.entries(cal.years || {})) {
      if (!runs || !runs.length) continue;
      years[y] = { runs: runs.map((r) => ({ cutoff: r.cutoff, pay: r.pay })) };
      if (cal.files && cal.files[y]) years[y].fileId = cal.files[y];
    }
    const runs = { kind: 'calendar', years };
    if (cal.cutoffTime) runs.cutoffTime = cal.cutoffTime;
    return { v: RULE_VERSION, need: NEED_REQUIRED, billing: { mode: 'anyday' }, creditDays: form.calPay === 'same' ? 0 : form.calPay === 'credit' ? n : null, runs, ...note };
  }
  if (form.bill === 'monthly' && Array.isArray(form.rounds) && form.rounds.length && !form.payDays) {
    const rounds = form.days.map((d, i) => ({ cutoffDay: d, payDay: form.rounds[i]?.day ?? null, payMonthOffset: form.rounds[i]?.off ?? null }));
    /* "วางบิลวันที่ D → จ่ายวันที่ P" ตอบเรื่องเงินครบแล้ว (เครดิต 0) · "เครดิต + คู่ตัด → จ่าย" ส่งเครดิตมาเอง */
    return { v: RULE_VERSION, need: NEED_REQUIRED, billing: { mode: 'anyday' }, creditDays: n === null ? 0 : n, runs: { kind: 'monthly', rounds }, ...note };
  }
  const billing = form.bill === 'monthly' ? { mode: 'monthly', days: [...(form.days || [])] } : { mode: 'anyday' };
  let runs = null;
  if (form.payDays?.kind === 'monthly') runs = { kind: 'monthly', rounds: form.payDays.days.map((d) => ({ cutoffDay: d, payDay: d, payMonthOffset: 0 })) };
  else if (form.payDays?.kind === 'weekday') runs = { kind: 'weekday', weekday: form.payDays.weekday, nths: [...form.payDays.nths] };
  return { v: RULE_VERSION, need: NEED_REQUIRED, billing, creditDays: n, runs, ...note };
}

/* ── คำ ──────────────────────────────────────────────────────────────────────────────────── */
const joinThai = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} และ ${xs[xs.length - 1]}`);
/* ประโยคกติกา (การ์ดลูกค้า · บรรทัดบนแผงงวด · ทะเบียน FN · เธรด · audit) — '' = ยังไม่ระบุ · ห้ามพูด "เครดิต 0 วัน" */
export function describeRule(value) {
  const rule = ruleOf(value);
  if (!rule) return '';
  if (rule.need === NEED_NONE) return NO_BILLING_TEXT;
  if (!rule.billing) return NO_TIMING_TEXT;
  if (rule.legacyNoCredit) return NO_CREDIT_TEXT;
  const credit = rule.creditDays > 0 ? `เครดิต ${rule.creditDays} วัน` : '';
  const billWord = rule.billing.mode === 'monthly' ? `วางบิล${joinThai(rule.billing.days.map(dayWord))}` : 'วางบิลได้ทุกวัน';
  const parts = [];
  if (!rule.runs) {
    parts.push(billWord, credit || 'ชำระวันวางบิล');
  } else if (rule.runs.kind === 'weekday') {
    const wd = WEEKDAYS_FULL_TH[rule.runs.weekday];
    const nums = rule.runs.nths.filter((n) => n !== 5).map(String);
    const bits = [];
    if (nums.length) bits.push(`วัน${wd}ที่ ${joinThai(nums)} `);
    if (rule.runs.nths.includes(5)) bits.push(`วัน${wd}สุดท้าย`);
    const days = `${joinThai(bits.map((b, i) => (i < bits.length - 1 ? b.trim() : b)))}ของเดือน`;
    parts.push(billWord, credit ? `${credit} แล้วจ่าย${days}` : `จ่าย${days}`);
  } else if (rule.runs.kind === 'monthly' && payOnlyRounds(rule.runs.rounds)) {
    const days = `ทุก${joinThai(rule.runs.rounds.map((r) => dayWord(r.payDay)))}`;
    parts.push(billWord, credit ? `${credit} แล้วจ่าย${days}` : `จ่าย${days}`);
  } else if (rule.runs.kind === 'monthly') {
    const { rounds } = rule.runs;
    const days = rule.billing.mode === 'monthly' ? rule.billing.days : rounds.map((r) => r.cutoffDay);
    const at = (i) => rounds[Math.min(i, rounds.length - 1)];
    parts.push(days.map((d, i) => `วางบิล${dayWord(d)} → กำหนดชำระ${dayWord(at(i).payDay)}${at(i).payMonthOffset ? ' เดือนถัดไป' : ''}`).join(' · '));
    if (credit) parts.push(credit);
  } else {
    const years = Object.keys(rule.runs.years).sort();
    const count = years.reduce((n, y) => n + rule.runs.years[y].runs.length, 0);
    parts.push(`ตามปฏิทินลูกค้า ปี ${years.join(', ')} (${count} รอบ)`);
    /* ชื่อเดียวกับข้อ ③ ของโมดัล (calendarPayWord · ตัวเลือก Segmented) — หนึ่งสิ่งหนึ่งชื่อ ทั้งท้ายโมดัล/toast/เธรด/audit */
    parts.push(rule.creditDays > 0 ? `ครบเครดิต ${rule.creditDays} วันแล้วเข้ารอบจ่าย` : 'วันจ่ายของรอบเดียวกัน');
    if (rule.runs.cutoffTime) parts.push(rule.creditDays === 0 ? `ส่งเอกสารก่อน ${rule.runs.cutoffTime} น. ของวันตัดรอบ` : `ลูกค้าตัดรอบ ${rule.runs.cutoffTime} น.`);
  }
  return parts.join(' · ');
}
/* ป้ายที่มาของกำหนดชำระ — ตัวเดียวทุกจอ */
export function sourceLabel(source, { creditDays = 0 } = {}) {
  switch (source) {
    case 'calendar': return 'ตามปฏิทินลูกค้า';
    case 'rule': return 'ตามรอบ';
    case 'credit': return `ตามเครดิต ${creditDays} วัน`;
    case 'payOnBilling': return 'ชำระวันวางบิล';
    case 'manual': return 'ใส่เอง';
    case 'kept': return 'คงวันเดิม';
    default: return '';
  }
}
/* เซลล์ "วันวางบิล" ของงวด — คอลัมน์อยู่ทุกใบ (มติ 17) · ลูกค้าไม่ต้องวางบิลขึ้นคำ ไม่ใช่ช่องว่างที่ชวนกรอก */
export function billingCellText(row, value) {
  const v = datesOf(row);
  if (v.billingDate) return fmtDate(v.billingDate);
  if (installmentNeed(row, value) === NEED_NONE) return NO_BILLING_TEXT;
  if (v.billingEvent) return `รอเหตุการณ์ (${v.billingEvent})`;
  return '—';
}
/* เซลล์ "กำหนดชำระ" — ลูกค้าไม่ต้องวางบิลที่รอเหตุการณ์ พูดเหตุการณ์ในช่องนี้ (ช่องนำของเขา) */
export function dueCellText(row, value) {
  const v = datesOf(row);
  if (v.dueDate) return fmtDate(v.dueDate);
  if (v.billingEvent && installmentNeed(row, value) === NEED_NONE) return `รอเหตุการณ์ (${v.billingEvent})`;
  return '—';
}

/**
 * ตัวแก้วันของงวดเปิดแบบไหน (โหมดตั้งวัน · หน้าสร้าง SO ใช้ตัวเดียวกัน)
 * @returns `{ kind, views, start, lead, billingColumn, askNeed }` · `start` = มุมมองที่เปิดก่อน (= ช่องนำ) —
 *   ลำดับปุ่มใน views คงวันวางบิล → กำหนดชำระ เสมอ (เจ้าของ 28/09 ข้อ 4) ช่องนำบอกด้วย start ไม่ใช่ด้วยตำแหน่ง
 *   'dueOnly'  ไม่ต้องวางบิล: [กำหนดชำระ | รอเหตุการณ์] · ช่องนำ = กำหนดชำระ
 *   'free'     ยังไม่ระบุ / ต้องวางบิลแต่ยังไม่ตั้งรอบ / **รูปเดิม { credit:false }** (รอบกรรมการ 29/09 — ไม่ต้องใส่วันวางบิลปลอม
 *              ระหว่างรอมติข้อ 4 · 0 งวดของ 449 รายมีวันวางบิล): [วันวางบิล | กำหนดชำระ | รอเหตุการณ์] เปิดที่กำหนดชำระ
 *   'cadence'  ได้ทุกวัน ไม่มีรอบ (เครดิต N / ชำระวันวางบิล): [ต่อจากงวดก่อน | วันอื่น | รอเหตุการณ์]
 *   'rounds'   มีรอบ: [ตามรอบ | วันอื่น | รอเหตุการณ์]
 * ⭐ ส่ง `row` = โหมดของ **งวดนั้น** (ข้อยกเว้นรายงวด · รอบกรรมการ 29/09 · ม็อก recommended.js `modeFor`):
 *   'exception' ลูกค้าไม่ต้องวางบิล แต่งวดนี้ต้องวางบิล (มีวันวางบิลแล้ว หรือกำลังยืนยันผ่านโมดัล "งวดนี้ต้องวางบิล…" = `{ exception:true }`)
 *               [วันวางบิล | กำหนดชำระ | รอเหตุการณ์] เปิดที่วันวางบิล (มีวันแล้ว = เปิดที่กำหนดชำระ) · `override:'billing'`
 *   'dueOnly' + `override:'skip'`  ลูกค้าต้องวางบิล/ยังไม่ระบุ แต่งวดนี้ติ๊ก "งวดนี้ไม่ต้องวางบิล" (billingSkip) — งวดนี้มีแต่กำหนดชำระ
 *   ไม่ส่ง `row` = โหมดของลูกค้า (หัวคอลัมน์ · หน้าสร้าง SO ก่อนมีงวด) · `override` = null
 */
export function dateModeOf(value, row = null, { exception = false } = {}) {
  const rule = ruleOf(value);
  const askNeed = asksNeed(rule);
  const base = (() => {
    if (rule?.need === NEED_NONE) return { kind: 'dueOnly', views: ['due', 'event'], start: 'due', lead: 'due', billingColumn: 'notNeeded', askNeed };
    if (!rule || !rule.billing || rule.legacyNoCredit) {
      const expected = Boolean(rule && rule.need === NEED_REQUIRED && !rule.legacyNoCredit);
      return { kind: 'free', views: ['bill', 'due', 'event'], start: 'due', lead: 'due', billingColumn: expected ? 'expected' : 'optional', askNeed };
    }
    if (slotCount(rule) > 0) return { kind: 'rounds', views: ['round', 'other', 'event'], start: 'round', lead: 'billing', billingColumn: 'required', askNeed };
    return { kind: 'cadence', views: ['follow', 'other', 'event'], start: 'follow', lead: 'billing', billingColumn: 'required', askNeed };
  })();
  if (!row) return { ...base, override: null };
  const override = needOverrideOf(row, rule);
  if (base.kind === 'dueOnly' && (exception || override === 'billing')) {
    return { ...base, kind: 'exception', views: ['bill', 'due', 'event'], start: dateOf(row.billingDate) ? 'due' : 'bill', override: 'billing' };
  }
  if (override === 'skip') return { kind: 'dueOnly', views: ['due', 'event'], start: 'due', lead: 'due', billingColumn: 'skip', askNeed, override: 'skip' };
  return { ...base, override: null };
}

/**
 * เมนูแถวของข้อยกเว้นรายงวด (รอบกรรมการ 29/09 · ม็อก recommended.js เมนูแถว) — ตัวถามเดียวของจอ · ด่านเขียนจริงคือ validateInstallmentDates
 * ⚠️ ไม่รวมล็อกของงวด (ชำระแล้ว/ขอใบแล้ว/ยกมา…) — ผู้เรียกถาม `installmentDateLock` ก่อน · งวดล็อก = ไม่มีเมนูทั้งคู่
 * @returns `{ requireBilling, skip, unskip }`
 *   requireBilling = "งวดนี้ต้องวางบิล…" (ลูกค้าไม่ต้องวางบิล · งวดยังไม่มีวันวางบิล · ไม่ได้ติ๊กไว้)
 *   skip / unskip  = "งวดนี้ไม่ต้องวางบิล" / "เอาติ๊กออก" (ลูกค้าต้องวางบิลจริง — รูปเดิม/ยังไม่ระบุไม่ชวน · ไม่มีวันวางบิล · ไม่รอเหตุการณ์)
 */
export function needExceptionActions(row, value) {
  const off = { requireBilling: false, skip: false, unskip: false };
  if (!row || isOpening(row)) return off;
  const bill = dateOf(row.billingDate);
  const skipped = row.billingSkip === true;
  const requireBilling = !bill && !skipped && billingNeed(value) === NEED_NONE;
  const canTick = !bill && !text(row.billingEvent) && nagsMissingBilling(value);
  return { requireBilling, skip: canTick && !skipped, unskip: skipped };
}

/**
 * ผลก่อนบันทึกในโมดัล — "วางบิล X → กำหนดชำระ Y" 2–3 รอบ หรือประโยคของแบบที่ไม่มีรอบ
 * ⭐ ปฏิทินที่รอบหมดก่อนครบ `count` = `missing` (มติ 29/09 — โมดัลบอก "ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้" แทนแถวประมาณการ)
 * @returns `{ kind, text, rows: [{ billingDate, dueDate, source }], missing? }`
 */
export function policyPreview(value, todayIso, { count = 3, holidays = null } = {}) {
  const rule = ruleOf(value);
  if (!rule) return { kind: 'unknown', text: UNKNOWN_TEXT, rows: [] };
  if (rule.need === NEED_NONE) return { kind: 'none', text: `${NO_BILLING_TEXT} — กำหนดชำระตั้งรายงวดบนใบ SO · เตือนก่อนครบกำหนดชำระ`, rows: [] };
  if (!rule.billing) return { kind: 'noTiming', text: `${NO_TIMING_TEXT} — เลือกวันวางบิลรายงวด`, rows: [] };
  if (slotCount(rule) > 0) {
    const { chips, missing } = roundChoices(rule, todayIso, count, { holidays });
    const out = { kind: 'rounds', text: describeRule(rule), rows: chips.map((c) => ({ billingDate: c.billingDate, dueDate: c.dueDate, source: c.source })) };
    return missing ? { ...out, missing } : out;
  }
  const rows = [];
  let d = firstWorkdayOnOrAfter(todayIso, holidays);
  for (let i = 0; i < count && d; i += 1) {
    const hit = dueFor(rule, d);
    rows.push({ billingDate: d, dueDate: hit.dueDate, source: hit.source });
    d = firstWorkdayOnOrAfter(addDays(d, 7), holidays);
  }
  return { kind: 'cadence', text: describeRule(rule), rows };
}
