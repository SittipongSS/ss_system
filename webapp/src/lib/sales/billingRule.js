// ── กำหนดวางบิล: รอบวางบิลของลูกค้า → วันวางบิล / กำหนดชำระรายงวด (mig 0389) ──
//
// มติเจ้าของ 25–26/09/2026 (ม็อก mockups/billing-cycle):
//   · ตั้ง "รอบวางบิล" ครั้งเดียวที่ทะเบียนลูกค้า (customers."billingRule") → แต่ละงวดได้วันวางบิล
//     + กำหนดชำระ ที่คิดจากรอบนั้น แก้รายงวดได้
//   · "คิดให้" = SA แตะเลือกรอบ ระบบคิดต่อ — **ไม่เดาวันให้งวดที่ผูกเหตุการณ์** (รอเหตุการณ์)
//   · ไม่บังคับเลือกรอบทุกงวด (บางที่ไม่มีรอบวาง) · วันวางบิลตรงเสาร์/อาทิตย์ = เตือนอย่างเดียว ไม่เลื่อน
//
// ⭐ **สองช่องแยกกัน ห้ามรวม**
//   `billingDate` = วันที่นำใบวางบิลไปวางที่ลูกค้า (ช่องใหม่)
//   `dueDate`     = กำหนดชำระ (เงินต้องเข้า) — ป้ายแดง "เลยกำหนด" + ด่านช่าง (visitGate) อ่านช่องนี้ช่องเดียว
//   วันวางบิลที่ผ่านไปแล้ว **ไม่ทำให้แดง** — เป็น "เลยรอบวางบิล" โทนเตือน
//
// ⚠️ ไม่อ่านนาฬิกาในไฟล์นี้ — ผู้เรียกส่ง `todayIso` จาก `businessDate()` (นาฬิกาไทย) เสมอ
// ⚠️ เลขคณิตปฏิทินล้วน (สตริง YYYY-MM-DD) ไม่มีโซนเวลา — แบบเดียวกับ paymentCoverage.js
// ⚠️ ห้ามตั้งชื่อ `billingCycle` — จองไว้ให้ความถี่งวดของสัญญาบริการ

import { addDays, daysBetween } from './paymentCoverage.js';
import { isOpeningInstallment } from './historicalOrders.js';

/* เตือนก่อนถึงวันวางบิลกี่วัน (ปฏิทิน · หน้าต่าง 0..N — cron ไม่วิ่งเสาร์อาทิตย์ จับวันตรงเป๊ะจะหลุด) */
export const BILLING_REMIND_DAYS = 3;
export const BILLING_EVENT_MAX = 120;
export const BILLING_NOTE_MAX = 1000;
export const BILLING_CREDIT_MAX = 365;
/* ตัวเลือกเหตุการณ์ที่ใช้บ่อย — ชิปแตะครั้งเดียว (พิมพ์เองได้) */
export const BILLING_EVENT_PRESETS = Object.freeze(['ก่อนผลิต', 'ก่อนส่งสินค้า', 'หลังส่งสินค้า', 'หลังติดตั้ง']);
/* วันที่ 31 = "สิ้นเดือน" (เดือนที่ไม่มีวันนั้นใช้วันสุดท้าย — กติกาเดียวกันทั้งสองความหมาย) */
export const MONTH_END_DAY = 31;

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const WEEKDAYS_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

const lastDayOf = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
/* สตริงวันที่มีจริงบนปฏิทิน — "2026-02-31" ผ่านรูปแต่ไม่มีวันนั้น (ฐานตอบ 22008 เป็น 500 ดิบ) ⇒ ตีตกที่นี่ */
const dateOf = (value) => {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, d] = text.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= lastDayOf(y, m) ? text : null;
};

const intIn = (value, lo, hi) => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

const iso = (year, month, day) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
/* วันที่ `day` ของเดือน (year, month) — เดือนที่ไม่มีวันนั้นใช้วันสุดท้าย · month เลื่อนข้ามปีได้ */
function dayInMonth(year, month, day) {
  const y = year + Math.floor((month - 1) / 12);
  const m = ((month - 1) % 12 + 12) % 12 + 1;
  return iso(y, m, Math.min(day, lastDayOf(y, m)));
}
const partsOf = (dateIso) => dateIso.split('-').map(Number);

/* ── ตรวจ + ทำรูปมาตรฐาน ──────────────────────────────────────────────────
   `null`/ไม่ส่ง = ล้างรอบ (ยังไม่ตั้ง) · คืน `{ rule, error }` — error เป็นภาษาไทยพร้อมขึ้นจอ
   ⚠️ รูปต้องตรงกับ customer_billing_rule_ok() ของ mig 0389 (ฐานกันรูป · กติกาข้ามช่องอยู่ที่นี่) */
export function normalizeBillingRule(input) {
  if (input === null || input === undefined) return { rule: null, error: null };
  if (typeof input !== 'object' || Array.isArray(input)) return { rule: null, error: 'รูปแบบรอบวางบิลไม่ถูกต้อง' };

  const billingMode = input.billing?.mode;
  let billing;
  if (billingMode === 'anyday') billing = { mode: 'anyday' };
  else if (billingMode === 'monthly') {
    const day = intIn(input.billing?.day, 1, 31);
    if (day === null) return { rule: null, error: 'ใส่วันที่วางบิล 1–31 หรือเลือก "สิ้นเดือน"' };
    billing = { mode: 'monthly', day };
  } else return { rule: null, error: 'เลือกว่าวางบิลได้ทุกวัน หรือทุกเดือนตามวันที่' };

  const paymentMode = input.payment?.mode;
  let payment;
  if (paymentMode === 'credit') {
    const days = intIn(input.payment?.days, 0, BILLING_CREDIT_MAX);
    if (days === null) return { rule: null, error: `ใส่จำนวนวันเครดิต 0–${BILLING_CREDIT_MAX}` };
    payment = { mode: 'credit', days };
  } else if (paymentMode === 'monthly') {
    const day = intIn(input.payment?.day, 1, 31);
    if (day === null) return { rule: null, error: 'ใส่วันที่เงินเข้า 1–31 หรือเลือก "สิ้นเดือน"' };
    const monthOffset = intIn(input.payment?.monthOffset, 0, 1);
    if (monthOffset === null) return { rule: null, error: 'เลือกว่าเงินเข้าเดือนเดียวกับวางบิล หรือเดือนถัดไป' };
    /* เงินเข้าเดือนเดียวกันแต่วันก่อนวันวางบิล = เงินเข้าก่อนวางบิลทุกรอบ ⇒ เกือบแน่ว่าเลือกเดือนผิด */
    if (billing.mode === 'monthly' && monthOffset === 0 && day < billing.day) {
      return { rule: null, error: 'เงินเข้าก่อนวันวางบิลในเดือนเดียวกัน — เลือก "เดือนถัดไป" หรือแก้วันที่' };
    }
    payment = { mode: 'monthly', day, monthOffset };
  } else return { rule: null, error: 'เลือกว่าเงินเข้าแบบเครดิตกี่วัน หรือทุกเดือนตามวันที่' };

  const rule = { billing, payment };
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== 'string') return { rule: null, error: 'หมายเหตุการวางบิลต้องเป็นข้อความ' };
    const note = input.note.trim();
    if (note.length > BILLING_NOTE_MAX) return { rule: null, error: `หมายเหตุการวางบิลยาวเกิน ${BILLING_NOTE_MAX} ตัวอักษร` };
    if (note) rule.note = note;
  }
  return { rule, error: null };
}

/* อ่านรอบจากแถวลูกค้า/ค่าที่ไม่รู้ที่มา — รูปผิด = ถือว่ายังไม่ตั้ง (ไม่ throw บนจอ) */
export const billingRuleOf = (value) => normalizeBillingRule(value ?? null).rule;

/* ── ข้อความ ──────────────────────────────────────────────────────────────── */
const dayWord = (day) => (day === MONTH_END_DAY ? 'สิ้นเดือน' : `วันที่ ${day}`);

/**
 * ประโยครอบวางบิล
 * @param short true = แบบย่อในตาราง ("วางบิลทุกวันที่ 5 · เงินเข้า 25")
 * @returns '' เมื่อยังไม่ตั้ง (ผู้เรียกเลือกคำว่างเอง)
 */
export function describeBillingRule(value, { short = false } = {}) {
  const rule = billingRuleOf(value);
  if (!rule) return '';
  const billing = rule.billing.mode === 'anyday'
    ? 'วางบิลได้ทุกวัน'
    : rule.billing.day === MONTH_END_DAY ? 'วางบิลสิ้นเดือน' : `วางบิลทุกวันที่ ${rule.billing.day}`;
  let payment;
  if (rule.payment.mode === 'credit') {
    payment = rule.payment.days === 0 ? 'ชำระวันวางบิล' : `เครดิต ${rule.payment.days} วัน`;
  } else {
    const day = rule.payment.day;
    const when = short
      ? (day === MONTH_END_DAY ? 'สิ้นเดือน' : String(day))
      : (day === MONTH_END_DAY ? 'สิ้นเดือน' : `ทุกวันที่ ${day}`);
    payment = `เงินเข้า${short ? ' ' : ''}${when}${rule.payment.monthOffset === 1 ? ' เดือนถัดไป' : ''}`;
  }
  return `${billing} · ${payment}`;
}

/* บรรทัดขยายของเงินเข้าแบบรายเดือน — "เงินเข้าเดือนเดียวกับวางบิล" / "เดือนถัดไป" · แบบเครดิต = "นับจากวันวางบิล" */
export function describeBillingRuleDetail(value) {
  const rule = billingRuleOf(value);
  if (!rule) return '';
  if (rule.payment.mode === 'credit') {
    return rule.payment.days === 0 ? 'เงินเข้าวันเดียวกับวันวางบิล' : `นับ ${rule.payment.days} วันจากวันวางบิล`;
  }
  return rule.payment.monthOffset === 1 ? 'เงินเข้าเดือนถัดจากเดือนที่วางบิล' : 'เงินเข้าเดือนเดียวกับวางบิล';
}

/* ── คิดวัน ──────────────────────────────────────────────────────────────── */

/**
 * กำหนดชำระ ของงวดที่วางบิลวันนั้น ตามรอบของลูกค้า
 * เครดิต = วันวางบิล + n วัน · รายเดือน = วันที่ n ของ (เดือนที่วางบิล + offset) — ถ้าตกก่อนวันวางบิล
 * (ลูกค้าวางบิลได้ทุกวันแล้ววางหลังวันเงินเข้า) เลื่อนไปเดือนถัดไป · ไม่มีรอบ/วันผิด = ''
 */
export function dueDateForBilling(value, billingDate) {
  const rule = billingRuleOf(value);
  const bill = dateOf(billingDate);
  if (!rule || !bill) return '';
  if (rule.payment.mode === 'credit') return addDays(bill, rule.payment.days) || '';
  const [year, month] = partsOf(bill);
  let due = dayInMonth(year, month + rule.payment.monthOffset, rule.payment.day);
  if (due < bill) due = dayInMonth(year, month + rule.payment.monthOffset + 1, rule.payment.day);
  return due;
}

/**
 * รอบวางบิลถัดไป `count` รอบ นับจาก `fromIso` (รวมวันนั้น) — ชิปที่ SA แตะ
 * ลูกค้าวางบิลได้ทุกวัน = [] (ไม่มีรอบ — จอให้กรอกวันวางบิลเอง แล้วคิดกำหนดชำระให้)
 * @returns `[{ billingDate, dueDate }]`
 */
export function billingRounds(value, fromIso, count = 3) {
  const rule = billingRuleOf(value);
  const from = dateOf(fromIso);
  if (!rule || !from || rule.billing.mode !== 'monthly') return [];
  const [year, month] = partsOf(from);
  const out = [];
  for (let k = 0; out.length < count && k < count + 1; k += 1) {
    const billingDate = dayInMonth(year, month + k, rule.billing.day);
    if (billingDate < from) continue;
    out.push({ billingDate, dueDate: dueDateForBilling(rule, billingDate) });
  }
  return out;
}

/* งวดที่ "ยังเติมรอบได้" — ยังไม่รับเงิน · ไม่ใช่งวดยกมา · ยังไม่มีวันวางบิลและไม่ได้รอเหตุการณ์ */
const OPEN_STATUSES = new Set(['pending', 'rejected']);
export function installmentBillingFillable(row) {
  if (!row || isOpeningInstallment(row)) return false;
  if (!OPEN_STATUSES.has(String(row.status || 'pending'))) return false;
  if (row.refundedAt) return false;
  return !dateOf(row.billingDate) && !String(row.billingEvent || '').trim();
}

/**
 * ปุ่ม "เติมตามรอบ เดือนละงวด" — วางงวดที่ยังเติมได้ลงรอบทีละเดือนตามลำดับงวด
 * · เริ่มที่รอบแรกตั้งแต่วันนี้ และต้องหลังวันวางบิลล่าสุดที่มีอยู่แล้วในใบ (ไม่ย้อนแซงงวดก่อน)
 * · งวดที่มีกำหนดชำระอยู่แล้ว **คงวันเดิม** (`keptDue: true`) แล้วได้รอบ "ล่าสุดที่เงินยังเข้าทัน"
 *   กำหนดเดิม — เช่น กำหนดชำระ 25 พ.ย. ของลูกค้าที่เงินเข้าเดือนถัดไป = วางบิล 25 ต.ค. ไม่ใช่รอบแรกสุด
 *   ไม่มีรอบไหนทัน (กำหนดเดิมใกล้เกิน) = รอบแรกที่ว่าง
 * · ลูกค้าวางบิลได้ทุกวัน = ไม่มีรอบให้เติม → `{ rows: [], error }`
 * @returns `{ rows: [{ id, seq, billingDate, dueDate, keptDue }], error }`
 */
export function planMonthlyFill(value, installments = [], todayIso) {
  const rule = billingRuleOf(value);
  const today = dateOf(todayIso);
  if (!rule) return { rows: [], error: 'ลูกค้ายังไม่ตั้งรอบวางบิล' };
  if (rule.billing.mode !== 'monthly') return { rows: [], error: 'ลูกค้าวางบิลได้ทุกวัน — ไม่มีรอบให้เติม เลือกวันวางบิลทีละงวด' };
  if (!today) return { rows: [], error: 'ไม่รู้วันนี้' };
  const sorted = [...(installments || [])].sort((a, b) => Number(a.seq) - Number(b.seq));
  const targets = sorted.filter(installmentBillingFillable);
  if (!targets.length) return { rows: [], error: 'ทุกงวดมีวันวางบิลหรือรอเหตุการณ์อยู่แล้ว' };
  const latest = sorted.map((row) => dateOf(row.billingDate)).filter(Boolean).sort().pop() || null;
  let cursor = latest && latest >= today ? addDays(latest, 1) : today;
  const rows = targets.map((row) => {
    const due = dateOf(row.dueDate);
    const [first] = billingRounds(rule, cursor, 1);
    let pick = first;
    if (due) {
      /* ไล่รอบจาก cursor ไปจนเงินเข้าเลยกำหนดเดิม — เก็บรอบสุดท้ายที่ยังทัน (สูงสุด 2 ปี) */
      for (const round of billingRounds(rule, cursor, 24)) {
        if (round.dueDate > due) break;
        pick = round;
      }
    }
    cursor = addDays(pick.billingDate, 1);
    return {
      id: row.id,
      seq: row.seq,
      billingDate: pick.billingDate,
      dueDate: due || pick.dueDate,
      keptDue: Boolean(due),
    };
  });
  return { rows, error: null };
}

/* งวดที่ "จัดวันใหม่ได้" ตอนลูกค้าเปลี่ยนรอบ — ยังไม่รับเงิน · ไม่ใช่งวดยกมา · ไม่ได้รอเหตุการณ์ · **ยังไม่ขอใบวางบิล**
   (ขอใบแล้ว = บัญชีออกใบตามวันเดิมไปแล้ว ย้ายวันเงียบ ๆ = ใบวางบิลกับงวดบอกคนละวัน → ถอดคำร้องหรือแก้รายงวดเอง) */
export function installmentBillingRedatable(row, { requested = false } = {}) {
  if (!row || isOpeningInstallment(row)) return false;
  if (!OPEN_STATUSES.has(String(row.status || 'pending'))) return false;
  if (row.refundedAt) return false;
  if (String(row.billingEvent || '').trim()) return false;
  return !requested;
}

/**
 * ลูกค้าเปลี่ยนรอบ (มติ 26/09: "ลูกค้าเปลี่ยนฉุกเฉิน หรือเปลี่ยนรอบเลย") — จัดวันวางบิล **และ** กำหนดชำระใหม่
 * ให้งวดที่ยังเปิดอยู่ตามรอบปัจจุบัน เดือนละงวดตั้งแต่วันนี้
 * ต่างจาก planMonthlyFill: รวมงวดที่มีวันแล้ว และ **ไม่คงกำหนดชำระเดิม** (รอบเปลี่ยน = วันเดิมผิดทั้งคู่)
 * · งวดที่ไม่แตะ (ขอใบแล้ว/รอเหตุการณ์/รับเงินแล้ว) ที่มีวันวางบิล กันไม่ให้งวดหลังจากมันย้อนมาก่อน
 * · แถวที่วันใหม่ตรงวันเดิมทั้งคู่ ตัดทิ้ง (ไม่มีอะไรเปลี่ยน)
 * ⚠️ เป็นปุ่มที่คนกดแล้วเห็นตาราง "เดิม → ใหม่" ก่อนยืนยัน — ไม่ใช่สิ่งที่ระบบทำเองตอนแก้รอบของลูกค้า
 * @param requestedIds Set ของ id งวดที่ขอใบวางบิลแล้ว (ผู้เรียกตัดสินด้วย billingRequestLive)
 * @returns `{ rows: [{ id, seq, billingDate, dueDate, prevBillingDate, prevDueDate }], error }`
 */
export function planRedate(value, installments = [], todayIso, { requestedIds = new Set() } = {}) {
  const rule = billingRuleOf(value);
  const today = dateOf(todayIso);
  if (!rule) return { rows: [], error: 'ลูกค้ายังไม่ตั้งรอบวางบิล' };
  if (rule.billing.mode !== 'monthly') return { rows: [], error: 'ลูกค้าวางบิลได้ทุกวัน — ไม่มีรอบให้จัด เลือกวันวางบิลทีละงวด' };
  if (!today) return { rows: [], error: 'ไม่รู้วันนี้' };
  const sorted = [...(installments || [])].sort((a, b) => Number(a.seq) - Number(b.seq));
  const isTarget = (row) => installmentBillingRedatable(row, { requested: requestedIds.has(row.id) });
  if (!sorted.some(isTarget)) return { rows: [], error: 'ไม่มีงวดที่จัดวันใหม่ได้ (ขอใบวางบิลแล้ว · รอเหตุการณ์ · หรือแจ้งชำระแล้วทุกงวด)' };
  let cursor = today;
  const out = [];
  for (const row of sorted) {
    if (!isTarget(row)) {
      const kept = dateOf(row.billingDate);
      if (kept && kept >= cursor) cursor = addDays(kept, 1);
      continue;
    }
    const [pick] = billingRounds(rule, cursor, 1);
    cursor = addDays(pick.billingDate, 1);
    const prevBillingDate = dateOf(row.billingDate);
    const prevDueDate = dateOf(row.dueDate);
    if (prevBillingDate === pick.billingDate && prevDueDate === pick.dueDate) continue;
    out.push({ id: row.id, seq: row.seq, billingDate: pick.billingDate, dueDate: pick.dueDate, prevBillingDate, prevDueDate });
  }
  if (!out.length) return { rows: [], error: 'วันของทุกงวดตรงกับรอบปัจจุบันอยู่แล้ว' };
  return { rows: out, error: null };
}

/* ── ค่าที่ส่งเข้า action 'schedule' ของงวด ──────────────────────────────────
   เลือกได้อย่างเดียว: วันวางบิล หรือ รอเหตุการณ์ (CHECK ของ mig 0389) · ว่างทั้งคู่ = ยังไม่กำหนด */
export function normalizeInstallmentBilling({ billingDate = null, billingEvent = null } = {}) {
  const rawDate = billingDate === null || billingDate === undefined ? '' : String(billingDate).trim();
  const date = rawDate ? dateOf(rawDate) : null;
  if (rawDate && !date) return { value: null, error: 'วันวางบิลไม่ถูกต้อง' };
  if (date && (date < '2000-01-01' || date > '2100-12-31')) return { value: null, error: 'ปีของวันวางบิลผิด' };
  const event = billingEvent === null || billingEvent === undefined ? '' : String(billingEvent).trim();
  if (event.length > BILLING_EVENT_MAX) return { value: null, error: `ชื่อเหตุการณ์ยาวเกิน ${BILLING_EVENT_MAX} ตัวอักษร` };
  if (date && event) return { value: null, error: 'เลือกวันวางบิล หรือ รอเหตุการณ์ อย่างใดอย่างหนึ่ง' };
  return { value: { billingDate: date, billingEvent: event || null }, error: null };
}

/* ── สถานะการวางบิลของงวด (แผงงวด · ทะเบียน FN · กระดิ่ง ใช้ตัวเดียวกัน) ─────
   @param requested มีคำร้องขอใบวางบิลที่ยังไม่ถูกยกเลิกผูกกับงวดนี้ (ผู้เรียกตัดสิน)
   key: 'carried' (งวดยกมา) | 'settled' | 'requested' | 'waiting' | 'none' | 'late' | 'today' | 'soon' | 'upcoming'
   ⚠️ 'late' = "เลยรอบวางบิล" = วันวางบิลผ่านแล้ว + ยังไม่ขอใบวางบิล + ยังไม่แจ้งชำระ — **ไม่ใช่ "เลยกำหนด"** */
export function billingState(row, { todayIso, requested = false } = {}) {
  if (!row) return { key: 'none', days: null };
  if (isOpeningInstallment(row)) return { key: 'carried', days: null };
  const status = String(row.status || 'pending');
  if (row.refundedAt || status === 'reported' || status === 'confirmed' || status === 'refunded') {
    return { key: 'settled', days: null };
  }
  const bill = dateOf(row.billingDate);
  if (requested) return { key: 'requested', days: bill && dateOf(todayIso) ? daysBetween(todayIso, bill) : null };
  if (!bill) return String(row.billingEvent || '').trim() ? { key: 'waiting', days: null } : { key: 'none', days: null };
  const days = daysBetween(todayIso, bill);
  if (days === null) return { key: 'upcoming', days: null };
  if (days < 0) return { key: 'late', days };
  if (days === 0) return { key: 'today', days };
  if (days <= BILLING_REMIND_DAYS) return { key: 'soon', days };
  return { key: 'upcoming', days };
}

/* ── "ขอใบวางบิลแล้ว" — ตัวตัดสินเดียวของทุกจอ (แผงงวด · ทะเบียน FN · กระดิ่ง · ตัวผูกคำร้องอัตโนมัติ) ──
   คำร้องที่ผูกกับงวด (billingRequestId · 0260) นับว่า "ขอแล้ว" เมื่อ **ส่งถึงบัญชีแล้วและยังไม่ถูกยกเลิก**
   · ร่าง (draft) ยังไม่ถึงมือ FN = ยังไม่ขอ — ปุ่ม "ขอใบวางบิลงวดนี้" ผูกงวดตั้งแต่บันทึกร่าง ถ้านับร่าง
     กระดิ่งจะเงียบและทะเบียน FN ขึ้น "ขอใบแล้ว" ทั้งที่ยังไม่มีใครส่ง (review 26/09 · สามจอเคยตอบไม่ตรงกัน)
   · ยกเลิกคำร้องไม่ล้างลิงก์บนงวด ⇒ ต้องอ่านสถานะจริงทุกครั้ง · หาคำร้องไม่เจอ (ถูกลบ) = ยังไม่ขอ
   ⚠️ ห้ามเขียนกติกานี้ซ้ำที่อื่น — import ตัวนี้ */
/* `rejected` ไม่ใช่สถานะของ dept_requests วันนี้ (lib/requests/statuses.js) — ใส่กันไว้ตามสเปก ไม่มีผลกับข้อมูลจริง */
const BILLING_REQUEST_NOT_SENT = Object.freeze(['draft', 'cancelled', 'rejected']);
export function billingRequestLive(request) {
  return Boolean(request?.id) && !BILLING_REQUEST_NOT_SENT.includes(String(request.status || ''));
}

/* งวดนี้ควรขึ้นกระดิ่ง "ถึงรอบวางบิล" วันนี้ไหม — หน้าต่าง 0..N วัน · เฉพาะงวดรอชำระที่มียอด */
export function needsBillingReminder(row, { todayIso, requested = false } = {}) {
  if (!row || String(row.status || '') !== 'pending') return false;
  if (!(Number(row.amount) > 0)) return false;
  const state = billingState(row, { todayIso, requested });
  return state.key === 'today' || state.key === 'soon';
}

/* ── วันที่ภาษาไทย (ค.ศ. ตามระบบ) ────────────────────────────────────────── */
/* "จ. 5 ต.ค. 2026" · withYear false = "จ. 5 ต.ค." */
export function formatBillingDate(value, { withYear = true } = {}) {
  const day = dateOf(value);
  if (!day) return '';
  const [year, month, d] = partsOf(day);
  const weekday = WEEKDAYS_TH[new Date(Date.UTC(year, month - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${MONTHS_TH[month - 1]}${withYear ? ` ${year}` : ''}`;
}

/* "5 ต.ค." — ป้ายบนชิปรอบ */
export function formatRoundChip(value) {
  const day = dateOf(value);
  if (!day) return '';
  const [, month, d] = partsOf(day);
  return `${d} ${MONTHS_TH[month - 1]}`;
}

/* วันหยุดสุดสัปดาห์ — เตือนอย่างเดียว ไม่เลื่อนวัน (มติ 26/09) */
export function weekendNote(value) {
  const day = dateOf(value);
  if (!day) return '';
  const [year, month, d] = partsOf(day);
  const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
  if (dow === 6) return 'ตรงวันเสาร์';
  if (dow === 0) return 'ตรงวันอาทิตย์';
  return '';
}

/* ข้อความสั้นของสถานะ — ใช้ตรงกันทุกจอ */
export function billingStateLabel(state, { billingEvent = '' } = {}) {
  switch (state?.key) {
    case 'late': return `เลยรอบวางบิล ${Math.abs(state.days)} วัน · ยังไม่ขอใบวางบิล`;
    case 'today': return 'ถึงรอบวางบิลวันนี้';
    case 'soon': return `ถึงรอบวางบิลใน ${state.days} วัน`;
    case 'upcoming': return state.days === null ? '' : `อีก ${state.days} วัน`;
    case 'requested': return 'ขอใบวางบิลแล้ว';
    case 'waiting': return billingEvent ? `รอเหตุการณ์ (${billingEvent})` : 'รอเหตุการณ์';
    default: return '';
  }
}

/* โทนของป้าย — ⚠️ ไม่มี 'danger': แดงสงวนไว้ให้ "เลยกำหนด" (dueDate) เท่านั้น */
export function billingStateTone(state) {
  switch (state?.key) {
    case 'late':
    case 'today':
    case 'soon': return 'warning';
    case 'requested': return 'info';
    default: return 'neutral';
  }
}
