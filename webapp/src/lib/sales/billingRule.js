// ── กำหนดวางบิล: รอบวางบิลของลูกค้า → วันวางบิล / กำหนดชำระรายงวด (mig 0389) ──
//
// มติเจ้าของ 25–26/09/2026 (ม็อก mockups/billing-cycle):
//   · ตั้ง "รอบวางบิล" ครั้งเดียวที่ทะเบียนลูกค้า (customers."billingRule") → แต่ละงวดได้วันวางบิล
//     + กำหนดชำระ ที่คิดจากรอบนั้น แก้รายงวดได้
//   · "คิดให้" = SA แตะเลือกรอบ ระบบคิดต่อ — **ไม่เดาวันให้งวดที่ผูกเหตุการณ์** (รอเหตุการณ์)
//   · ไม่บังคับเลือกรอบทุกงวด (บางที่ไม่มีรอบวาง) · วันวางบิลตรงเสาร์/อาทิตย์ = เตือนอย่างเดียว ไม่เลื่อน
// มติเจ้าของ 28/09 (ข้อ 17): **ใช้เหมือนกันทุกลูกค้า ทุก SO ทุกประเภท** — ทุกใบมีวันวางบิล + กำหนดชำระ · ไม่มีเครดิต =
//   วางบิลได้ทุกวัน + ชำระวันวางบิล (`effectiveBillingRule` ตัวเดียว) · ลูกค้าที่ยังไม่ตั้ง = กรอกได้ทั้งสองช่อง ไม่มีอะไรคิดให้
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
   รูปมาตรฐาน (รุ่นสอง · mig 0390 · มติเจ้าของ 26/09: สวิตช์เครดิต + หลายรอบวางบิลต่อเดือน):
     null                                            ยังไม่ระบุ
     { credit: false, note? }                        ไม่มีเครดิต — อ่านเป็น "วางบิลได้ทุกวัน + ชำระวันวางบิล" (effectiveBillingRule)
     { billing, payment, note? }                     มีเครดิต
       billing: { mode: 'anyday' } | { mode: 'monthly', days: [1..31 เรียงน้อยไปมาก ไม่ซ้ำ · 1–4 รอบ] }
       payment: { mode: 'credit', days: 0..365 }     เครดิต n วันนับจากวันวางบิล (ทุกรอบเหมือนกัน)
              | { mode: 'monthly', rounds: [{ day: 1..31, monthOffset: 0|1 }] }
                 · คู่กับ billing.days ทีละรอบ (ยาวเท่ากัน) · วางบิลได้ทุกวัน = 1 ตัว
   ⭐ รับรูปรุ่นแรก (0389) ด้วย: billing.day / payment.day+monthOffset ⇒ แปลงเป็นรุ่นสองตอนอ่าน
   `null`/ไม่ส่ง = ล้าง · คืน `{ rule, error }` — error เป็นภาษาไทยพร้อมขึ้นจอ
   ⚠️ รูปต้องตรงกับ customer_billing_rule_ok() ของ mig 0390 (ฐานกันรูป · กติกาข้ามช่องอยู่ที่นี่) */
export const BILLING_ROUNDS_MAX = 4;

const roundWord = (i, count) => (count > 1 ? `รอบที่ ${i + 1} ` : '');

function normalizeNote(input) {
  if (input.note === undefined || input.note === null) return { note: '', error: null };
  if (typeof input.note !== 'string') return { note: '', error: 'หมายเหตุการวางบิลต้องเป็นข้อความ' };
  const note = input.note.trim();
  if (note.length > BILLING_NOTE_MAX) return { note: '', error: `หมายเหตุการวางบิลยาวเกิน ${BILLING_NOTE_MAX} ตัวอักษร` };
  return { note, error: null };
}

export function normalizeBillingRule(input) {
  if (input === null || input === undefined) return { rule: null, error: null };
  if (typeof input !== 'object' || Array.isArray(input)) return { rule: null, error: 'รูปแบบรอบวางบิลไม่ถูกต้อง' };
  const { note, error: noteError } = normalizeNote(input);
  if (noteError) return { rule: null, error: noteError };

  /* ไม่มีเครดิต — เก็บแค่สวิตช์ (+หมายเหตุ) · ข้ามส่วนที่เหลือทั้งหมด (ตอนคิดวันอ่านเป็นเครดิต 0 ที่ `effectiveBillingRule`) */
  if (input.credit === false) return { rule: note ? { credit: false, note } : { credit: false }, error: null };

  const billingMode = input.billing?.mode;
  let billing;
  if (billingMode === 'anyday') billing = { mode: 'anyday' };
  else if (billingMode === 'monthly') {
    const rawDays = Array.isArray(input.billing?.days) ? input.billing.days
      : input.billing?.day !== undefined ? [input.billing.day] : [];
    if (!rawDays.length) return { rule: null, error: 'ใส่วันที่วางบิล 1–31 หรือเลือก "สิ้นเดือน"' };
    if (rawDays.length > BILLING_ROUNDS_MAX) return { rule: null, error: `วางบิลได้ไม่เกิน ${BILLING_ROUNDS_MAX} รอบต่อเดือน` };
    const days = [];
    for (const raw of rawDays) {
      const day = intIn(raw, 1, 31);
      if (day === null) return { rule: null, error: 'ใส่วันที่วางบิล 1–31 หรือเลือก "สิ้นเดือน"' };
      days.push(day);
    }
    if (new Set(days).size !== days.length) return { rule: null, error: 'วันวางบิลซ้ำกัน — แต่ละรอบต้องคนละวัน' };
    billing = { mode: 'monthly', days };
  } else return { rule: null, error: 'เลือกว่าวางบิลได้ทุกวัน หรือทุกเดือนตามวันที่' };
  const roundCount = billing.mode === 'monthly' ? billing.days.length : 1;

  const paymentMode = input.payment?.mode;
  let payment;
  if (paymentMode === 'credit') {
    const days = intIn(input.payment?.days, 0, BILLING_CREDIT_MAX);
    if (days === null) return { rule: null, error: `ใส่จำนวนวันเครดิต 0–${BILLING_CREDIT_MAX}` };
    payment = { mode: 'credit', days };
  } else if (paymentMode === 'monthly') {
    /* รุ่นแรก: เงินเข้าวันเดียวใช้กับทุกรอบ ⇒ ขยายเป็นหนึ่งตัวต่อรอบ */
    const rawRounds = Array.isArray(input.payment?.rounds) ? input.payment.rounds
      : input.payment?.day !== undefined ? Array.from({ length: roundCount }, () => ({ day: input.payment.day, monthOffset: input.payment.monthOffset }))
        : [];
    if (rawRounds.length !== roundCount) {
      return { rule: null, error: roundCount > 1 ? 'ใส่วันเงินเข้าให้ครบทุกรอบ' : 'ใส่วันที่เงินเข้า 1–31 หรือเลือก "สิ้นเดือน"' };
    }
    const rounds = [];
    for (let i = 0; i < rawRounds.length; i += 1) {
      const day = intIn(rawRounds[i]?.day, 1, 31);
      if (day === null) return { rule: null, error: `${roundWord(i, roundCount)}ใส่วันที่เงินเข้า 1–31 หรือเลือก "สิ้นเดือน"`.trim() };
      const monthOffset = intIn(rawRounds[i]?.monthOffset, 0, 1);
      if (monthOffset === null) return { rule: null, error: `${roundWord(i, roundCount)}เลือกว่าเงินเข้าเดือนเดียวกับวางบิล หรือเดือนถัดไป`.trim() };
      /* เงินเข้าเดือนเดียวกันแต่วันก่อนวันวางบิล = เงินเข้าก่อนวางบิลทุกรอบ ⇒ เกือบแน่ว่าเลือกเดือนผิด */
      if (billing.mode === 'monthly' && monthOffset === 0 && day < billing.days[i]) {
        return { rule: null, error: `${roundWord(i, roundCount)}เงินเข้าก่อนวันวางบิลในเดือนเดียวกัน — เลือก "เดือนถัดไป" หรือแก้วันที่`.trim() };
      }
      rounds.push({ day, monthOffset });
    }
    payment = { mode: 'monthly', rounds };
  } else return { rule: null, error: 'เลือกว่าเงินเข้าแบบเครดิตกี่วัน หรือทุกเดือนตามวันที่' };

  /* เรียงรอบตามวันวางบิล (คู่เงินเข้าย้ายตาม) — ลำดับที่คนกดไม่มีความหมาย */
  if (billing.mode === 'monthly' && billing.days.length > 1) {
    const order = billing.days.map((day, i) => i).sort((a, b) => billing.days[a] - billing.days[b]);
    billing = { mode: 'monthly', days: order.map((i) => billing.days[i]) };
    if (payment.mode === 'monthly') payment = { mode: 'monthly', rounds: order.map((i) => payment.rounds[i]) };
  }
  const rule = { billing, payment };
  if (note) rule.note = note;
  return { rule, error: null };
}

/* อ่านรอบจากแถวลูกค้า/ค่าที่ไม่รู้ที่มา — รูปผิด = ถือว่ายังไม่ตั้ง (ไม่ throw บนจอ)
   ⚠️ นี่คือ **รูปที่เก็บ** (ไม่มีเครดิต = `{ credit:false }`) — ตัวคิดวัน/ตัวถามรูปของรอบอ่านผ่าน `effectiveBillingRule` */
export const billingRuleOf = (value) => normalizeBillingRule(value ?? null).rule;

/* ── กติกาที่ใช้คิดวันจริง (มติเจ้าของ 28/09 ข้อ 17: "กำหนดวางบิลใช้กับทุกลูกค้า ทุก SO ทุกประเภทให้เหมือนกัน") ──
   ⭐ **ที่เดียวที่ตัดสินว่า "ไม่มีเครดิต" คิดวันอย่างไร** — ไม่มีเครดิต = วางบิลได้ทุกวัน + **ชำระวันวางบิล** (กำหนดชำระ = วันวางบิล)
     ⇒ ตัวคิดทุกตัว (กำหนดชำระ · ตัวเติม · ตัวแก้ในโหมดตั้งวัน · ตัวเลือกบนหน้าสร้าง SO) เดินทางเดียวกับลูกค้าวางบิลได้ทุกวัน + เครดิต
       ไม่มีสาขา "ไม่มีเครดิต" แยกอีก (แทนมติ 26/09 "ไม่มีเครดิต = ทำเหมือนไม่มีรอบ" — ต้นเหตุที่ใบสินค้าเกือบทั้งหมดไม่มีวันวางบิล)
   ⚠️ ค่าที่เก็บที่ทะเบียนยังเป็น `{ credit:false }` (ไม่มี migration) — รูปนี้เป็น "ผลการอ่าน" ห้ามส่งกลับไปบันทึก
   ⚠️ `noCredit: true` = ธงเลือกคำ ("ไม่มีเครดิต · ชำระวันวางบิล") — **ห้ามพูด "เครดิต 0 วัน" / "ตามเครดิต 0 วัน"** ที่ไหนเลย
   · ส่งผลของตัวนี้กลับเข้ามาอีกรอบได้ (ได้รูปเดิม) — ผู้เรียกไม่ต้องจำว่าถือค่าดิบหรือค่าที่อ่านแล้ว
   @returns null (ยังไม่ตั้ง · รูปผิด) · รอบรูปมาตรฐาน (มีเครดิต) ·
            `{ billing:{ mode:'anyday' }, payment:{ mode:'credit', days:0 }, noCredit:true, note? }` (ไม่มีเครดิต) */
export function effectiveBillingRule(value) {
  const rule = billingRuleOf(value);
  if (!rule) return null;
  const again = value?.noCredit === true && rule.billing?.mode === 'anyday'
    && rule.payment?.mode === 'credit' && rule.payment.days === 0;
  if (rule.credit !== false && !again) return rule;
  const out = { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 0 }, noCredit: true };
  if (rule.note) out.note = rule.note;
  return out;
}

/* คำของ "ไม่มีเครดิต" ทุกจอ (ประโยครอบ · แถบบนการ์ด · ทะเบียน FN) และป้ายที่มาของกำหนดชำระ — ตัวเดียว ห้ามพิมพ์เอง */
export const NO_CREDIT_TEXT = 'ไม่มีเครดิต · ชำระวันวางบิล';
export const PAY_ON_BILLING_TEXT = 'ชำระวันวางบิล';
/* จำนวนวันเครดิตเป็นคำ — **0 = "ชำระวันวางบิล"** (มติ 28/09: ห้ามพูด "เครดิต 0 วัน") · ตัวเดียวของประโยครอบ · การ์ด/โมดัลทะเบียนลูกค้า
   🐞 review 28/09: การ์ด ("เงินเข้า / กำหนดชำระ") และหัวขั้นของโมดัลยังพิมพ์ "เครดิต 0 วัน" เอง ทั้งที่โมดัลรับ 0 ได้
     และบรรทัดหัวของรอบเดียวกันพูด "ชำระวันวางบิล" ⇒ จอเดียวพูดสองแบบ */
export const creditDaysText = (days) => (days === 0 ? PAY_ON_BILLING_TEXT : `เครดิต ${days} วัน`);

/* ── ตัวถามรูปของรอบ (จอใช้แทนการอ่านช่องข้างในตรง ๆ) — อ่านผ่าน `effectiveBillingRule` ทุกตัว ─────────── */
/* ไม่มีเครดิต — ใช้เลือก **คำ** เท่านั้น ("ไม่มีเครดิต · ชำระวันวางบิล") ห้ามใช้แยกทางคิดวัน (คิดผ่านรอบที่อ่านแล้วตัวเดียว) */
export const billingRuleNoCredit = (value) => effectiveBillingRule(value)?.noCredit === true;
/* มีรอบรายเดือนให้แตะ (ชิปรอบ · เติมเดือนละงวด · จัดวันใหม่) */
export const billingRuleMonthly = (value) => effectiveBillingRule(value)?.billing?.mode === 'monthly';
/* งวดที่ "ควรมีวันวางบิลแต่ยังไม่มี" นับว่าขาดไหม — เฉพาะรอบรายเดือน/เครดิต (ตั้งแล้วและมีเครดิต)
   ⭐ ไม่มีเครดิต = ไม่นับ (มติ 28/09 · ทะเบียน FN เลือกทางที่เงียบที่สุดที่ยังพูดจริง): กำหนดชำระของลูกค้าไม่มีเครดิต = วันวางบิล
     ใบเก่าที่มีแต่กำหนดชำระจึงไม่ได้ขาดอะไร · ยังไม่ตั้ง = ไม่นับ (ไม่มีกติกาให้ขาด) */
export const billingRuleNeedsBillingDate = (value) => {
  const rule = effectiveBillingRule(value);
  return Boolean(rule) && !rule.noCredit;
};
/* จำนวนรอบต่อเดือน — 0 = ไม่มีรอบ (ไม่ตั้ง · ไม่มีเครดิต · วางบิลได้ทุกวัน) */
export const billingRoundCount = (value) => {
  const rule = effectiveBillingRule(value);
  return rule?.billing?.mode === 'monthly' ? rule.billing.days.length : 0;
};
/* ป้ายของแต่ละรอบ ["วันที่ 10", "สิ้นเดือน"] — ปุ่มเลือกรอบของ "เติมตามรอบ"/"จัดวันใหม่" */
export function billingRoundLabels(value) {
  const rule = effectiveBillingRule(value);
  if (rule?.billing?.mode !== 'monthly') return [];
  return rule.billing.days.map((day) => (day === MONTH_END_DAY ? 'สิ้นเดือน' : `วันที่ ${day}`));
}

/* ── ข้อความ ──────────────────────────────────────────────────────────────── */
const dayWord = (day) => (day === MONTH_END_DAY ? 'สิ้นเดือน' : `วันที่ ${day}`);
const joinThai = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} และ ${items[items.length - 1]}`);
const sameRounds = (rounds) => rounds.every((r) => r.day === rounds[0].day && r.monthOffset === rounds[0].monthOffset);
const payWhen = (round, { short }) => {
  const when = round.day === MONTH_END_DAY ? 'สิ้นเดือน' : short ? String(round.day) : `ทุกวันที่ ${round.day}`;
  return `${when}${round.monthOffset === 1 ? ' เดือนถัดไป' : ''}`;
};

/**
 * ประโยครอบวางบิล
 * @param short true = แบบย่อในตาราง ("วางบิลทุกวันที่ 5 · เงินเข้า 25")
 * @returns '' เมื่อยังไม่ตั้ง (ผู้เรียกเลือกคำว่างเอง) · ไม่มีเครดิต = "ไม่มีเครดิต · ชำระวันวางบิล" (มติ 28/09 · ทั้งรูปเต็มและย่อ)
 */
export function describeBillingRule(value, { short = false } = {}) {
  const rule = effectiveBillingRule(value);
  if (!rule) return '';
  if (rule.noCredit) return NO_CREDIT_TEXT;
  const days = rule.billing.mode === 'monthly' ? rule.billing.days : [];
  let billing;
  if (rule.billing.mode === 'anyday') billing = 'วางบิลได้ทุกวัน';
  else if (days.length === 1) billing = days[0] === MONTH_END_DAY ? 'วางบิลสิ้นเดือน' : `วางบิลทุกวันที่ ${days[0]}`;
  else billing = `วางบิล${joinThai(days.map(dayWord))}`;

  if (rule.payment.mode === 'credit') {
    return `${billing} · ${creditDaysText(rule.payment.days)}`;
  }
  const { rounds } = rule.payment;
  if (sameRounds(rounds)) return `${billing} · เงินเข้า${short ? ' ' : ''}${payWhen(rounds[0], { short })}`;
  /* หลายรอบ เงินเข้าไม่เหมือนกัน — บอกเป็นคู่ "วางบิล → เงินเข้า" ทีละรอบ */
  return days.map((day, i) => `วางบิล ${day === MONTH_END_DAY ? 'สิ้นเดือน' : day} → เงินเข้า ${payWhen(rounds[i], { short: true })}`).join(' · ');
}

/* บรรทัดขยายของเงินเข้า — "เงินเข้าเดือนเดียวกับวางบิล" / "เดือนถัดไป" · เครดิต = "นับจากวันวางบิล" · หลายรอบต่างกัน = ''
   · ไม่มีเครดิต = '' (ประโยคหลักบอก "ชำระวันวางบิล" ครบแล้ว — ต่อซ้ำ = คำเดียวกันสองครั้งในบรรทัดเดียว) */
export function describeBillingRuleDetail(value) {
  const rule = effectiveBillingRule(value);
  if (!rule || rule.noCredit) return '';
  if (rule.payment.mode === 'credit') {
    return rule.payment.days === 0 ? 'เงินเข้าวันเดียวกับวันวางบิล' : `นับ ${rule.payment.days} วันจากวันวางบิล`;
  }
  if (!sameRounds(rule.payment.rounds)) return '';
  return rule.payment.rounds[0].monthOffset === 1 ? 'เงินเข้าเดือนถัดจากเดือนที่วางบิล' : 'เงินเข้าเดือนเดียวกับวางบิล';
}

/* ── คิดวัน ──────────────────────────────────────────────────────────────── */

/* เงินเข้าของรอบหนึ่ง: วันที่ n ของ (เดือนที่วางบิล + offset) — ตกก่อนวันวางบิลเมื่อไร (วางบิลได้ทุกวันแล้ววางหลังวันเงินเข้า
   / วันอื่นที่กรอกเอง) เลื่อนไปเดือนถัดไป */
function payDateFor(round, bill) {
  const [year, month] = partsOf(bill);
  let due = dayInMonth(year, month + round.monthOffset, round.day);
  if (due < bill) due = dayInMonth(year, month + round.monthOffset + 1, round.day);
  return due;
}

/* รอบของวันวางบิลที่ไม่ได้มาจากชิป (วันอื่น…) — รอบล่าสุดของเดือนที่วันวางบิลของมันไม่เกินวันนั้น ·
   ก่อนรอบแรกของเดือน = รอบสุดท้าย (ของรอบเดือนก่อน) */
function roundIndexForDate(rule, bill) {
  if (rule.billing.mode !== 'monthly') return 0;
  const [year, month, day] = partsOf(bill);
  let pick = rule.billing.days.length - 1;
  rule.billing.days.forEach((billDay, i) => {
    if (Number(dayInMonth(year, month, billDay).slice(8)) <= day) pick = i;
  });
  return pick;
}

/**
 * กำหนดชำระ ของงวดที่วางบิลวันนั้น ตามรอบของลูกค้า
 * เครดิต = วันวางบิล + n วัน · **ไม่มีเครดิต = วันวางบิลเอง** (ชำระวันวางบิล · มติ 28/09) · รายเดือน = เงินเข้าของรอบที่วันนั้นตกอยู่ ·
 * ยังไม่ตั้ง/วันผิด = '' (ไม่มีอะไรให้คิด — คนกรอกกำหนดชำระเอง)
 */
export function dueDateForBilling(value, billingDate) {
  const rule = effectiveBillingRule(value);
  const bill = dateOf(billingDate);
  if (!rule || !bill) return '';
  if (rule.payment.mode === 'credit') return addDays(bill, rule.payment.days) || '';
  return payDateFor(rule.payment.rounds[roundIndexForDate(rule, bill)], bill);
}

/**
 * รอบวางบิลถัดไป `count` รอบ นับจาก `fromIso` (รวมวันนั้น) — ชิปที่ SA แตะ · หลายรอบต่อเดือนเรียงตามวัน
 * ไม่มีรอบรายเดือน (วางบิลได้ทุกวัน · ไม่มีเครดิต · ไม่ตั้ง) = []
 * @param roundIndex จำกัดเฉพาะรอบนั้น (ปุ่มเติม/จัดวันใหม่ เดือนละงวด) · ไม่ส่ง = ทุกรอบ
 * @returns `[{ billingDate, dueDate, roundIndex }]`
 */
export function billingRounds(value, fromIso, count = 3, { roundIndex = null } = {}) {
  const rule = effectiveBillingRule(value);
  const from = dateOf(fromIso);
  if (!rule || !from || rule.billing?.mode !== 'monthly') return [];
  const [year, month] = partsOf(from);
  const indexes = rule.billing.days.map((d, i) => i).filter((i) => roundIndex === null || i === roundIndex);
  if (!indexes.length) return [];
  const out = [];
  const seen = new Set();
  for (let k = 0; out.length < count && k < count + 2; k += 1) {
    const inMonth = indexes
      .map((i) => ({ i, billingDate: dayInMonth(year, month + k, rule.billing.days[i]) }))
      .sort((a, b) => (a.billingDate < b.billingDate ? -1 : 1));
    for (const { i, billingDate } of inMonth) {
      /* 30 กับ 31 ในเดือนที่มี 30 วัน ตกวันเดียวกัน — นับรอบเดียว */
      if (billingDate < from || seen.has(billingDate) || out.length >= count) continue;
      seen.add(billingDate);
      const dueDate = rule.payment.mode === 'credit'
        ? addDays(billingDate, rule.payment.days)
        : payDateFor(rule.payment.rounds[i], billingDate);
      out.push({ billingDate, dueDate, roundIndex: i });
    }
  }
  return out;
}

/* ปุ่มเดือนละงวดของลูกค้าหลายรอบต้องรู้ว่าใช้รอบไหน — ตรวจ roundIndex ที่ส่งมา · คืน error ไทย หรือ null */
function monthlyRoundError(rule, roundIndex) {
  const count = rule.billing.days.length;
  if (count === 1) return null;
  if (roundIndex === null || roundIndex === undefined) return `ลูกค้ามี ${count} รอบต่อเดือน — เลือกก่อนว่าจะใช้รอบไหน`;
  return Number.isInteger(roundIndex) && roundIndex >= 0 && roundIndex < count ? null : 'รอบที่เลือกไม่มีในรอบวางบิลของลูกค้า';
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
export function planMonthlyFill(value, installments = [], todayIso, { roundIndex = null } = {}) {
  const rule = effectiveBillingRule(value);
  const today = dateOf(todayIso);
  if (!rule) return { rows: [], error: 'ลูกค้ายังไม่ตั้งรอบวางบิล' };
  /* ไม่มีเครดิต = วางบิลได้ทุกวัน (มติ 28/09) — ไม่มีรอบให้เติมเหมือนลูกค้าวางบิลได้ทุกวัน ต่างแค่คำ */
  if (rule.noCredit) return { rows: [], error: 'ลูกค้าไม่มีเครดิต (ชำระวันวางบิล) — ไม่มีรอบให้เติม เลือกวันวางบิลทีละงวด' };
  if (rule.billing.mode !== 'monthly') return { rows: [], error: 'ลูกค้าวางบิลได้ทุกวัน — ไม่มีรอบให้เติม เลือกวันวางบิลทีละงวด' };
  const roundError = monthlyRoundError(rule, roundIndex);
  if (roundError) return { rows: [], error: roundError };
  const only = rule.billing.days.length === 1 ? 0 : roundIndex;
  if (!today) return { rows: [], error: 'ไม่รู้วันนี้' };
  const sorted = [...(installments || [])].sort((a, b) => Number(a.seq) - Number(b.seq));
  const targets = sorted.filter(installmentBillingFillable);
  if (!targets.length) return { rows: [], error: 'ทุกงวดมีวันวางบิลหรือรอเหตุการณ์อยู่แล้ว' };
  const latest = sorted.map((row) => dateOf(row.billingDate)).filter(Boolean).sort().pop() || null;
  let cursor = latest && latest >= today ? addDays(latest, 1) : today;
  const rows = targets.map((row) => {
    const due = dateOf(row.dueDate);
    const [first] = billingRounds(rule, cursor, 1, { roundIndex: only });
    let pick = first;
    if (due) {
      /* ไล่รอบจาก cursor ไปจนเงินเข้าเลยกำหนดเดิม — เก็บรอบสุดท้ายที่ยังทัน (สูงสุด 2 ปี) */
      for (const round of billingRounds(rule, cursor, 24, { roundIndex: only })) {
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
export function planRedate(value, installments = [], todayIso, { requestedIds = new Set(), roundIndex = null } = {}) {
  const rule = effectiveBillingRule(value);
  const today = dateOf(todayIso);
  if (!rule) return { rows: [], error: 'ลูกค้ายังไม่ตั้งรอบวางบิล' };
  if (rule.noCredit) return { rows: [], error: 'ลูกค้าไม่มีเครดิต (ชำระวันวางบิล) — ไม่มีรอบให้จัด เลือกวันวางบิลทีละงวด' };
  if (rule.billing.mode !== 'monthly') return { rows: [], error: 'ลูกค้าวางบิลได้ทุกวัน — ไม่มีรอบให้จัด เลือกวันวางบิลทีละงวด' };
  const roundError = monthlyRoundError(rule, roundIndex);
  if (roundError) return { rows: [], error: roundError };
  const only = rule.billing.days.length === 1 ? 0 : roundIndex;
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
    const [pick] = billingRounds(rule, cursor, 1, { roundIndex: only });
    cursor = addDays(pick.billingDate, 1);
    const prevBillingDate = dateOf(row.billingDate);
    const prevDueDate = dateOf(row.dueDate);
    if (prevBillingDate === pick.billingDate && prevDueDate === pick.dueDate) continue;
    out.push({ id: row.id, seq: row.seq, billingDate: pick.billingDate, dueDate: pick.dueDate, prevBillingDate, prevDueDate });
  }
  if (!out.length) return { rows: [], error: 'วันของทุกงวดตรงกับรอบปัจจุบันอยู่แล้ว' };
  return { rows: out, error: null };
}

/* ── ตัวช่วยเติมวันงวดในโหมดตั้งวัน (แผงงวดแบบ C · มติเจ้าของ 28/09) ─────────────────────────────
   ร่างวันให้หลายงวดพร้อมกัน แล้วคนดูในตารางก่อนกดบันทึกครั้งเดียว — ไม่มีอะไรลงฐานจากตัวช่วยเหล่านี้ */

/* ชื่อเดือนสามชั้น (ชั้นบนชนะ): `full` ชื่อเต็ม · `short` ย่อมีจุด/อังกฤษย่อ · `bare` ย่อไม่มีจุด (นับเฉพาะเมื่อยืนเดี่ยว) */
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
/* ตัวอักษรไทย (พยัญชนะ · สระ · วรรณยุกต์) — ไม่รวมเลขไทย */
const THAI_LETTER = /[ก-๎]/;
const standsAlone = (text, at, len, letter) => !letter.test(text[at - 1] || '') && !letter.test(text[at + len] || '');

/**
 * เดือนที่ชื่องวดบอก — "1st Installment: October 2026 –" · "งวดที่ 2 ก.พ. 2570" → 'YYYY-MM' (พ.ศ. แปลงเป็น ค.ศ.)
 * ต้องมีทั้งชื่อเดือนและปี 4 หลัก ไม่งั้น '' (ไม่เดา) · ใช้เป็น "เบาะแส" ให้คนแตะ — ระบบไม่ตั้งวันเองจากตรงนี้
 * ⭐ ชั้นของชื่อก่อนตำแหน่ง: ชื่อเต็ม → ย่อมีจุด/อังกฤษย่อ → ย่อไม่มีจุด · ในชั้นเดียวกันตัวแรกสุดชนะ (ตำแหน่งเท่ากัน = ยาวกว่า)
 *    · ตัวที่ไม่มีปี 4 หลักตามหลัง ข้ามไปตัวถัดไป ("ม.ค. 2570 (ชำระภายในกุมภาพันธ์)" ยังได้ ม.ค.)
 * ⭐ ตัวย่อไม่มีจุดนับเฉพาะเมื่อยืนเดี่ยว (ข้างหน้า/ข้างหลังไม่ใช่ตัวอักษรไทย หรือเป็นต้น/ท้ายข้อความ) · คำอังกฤษต้องเป็นคำเต็ม
 * 🐞 review 28/09: เดิม indexOf ทุกคำแล้วตำแหน่งแรกสุดชนะ ⇒ ตัวย่อไม่มีจุดที่ซ่อนในคำธรรมดาชนะชื่อเดือนจริง
 *    ("รวมค่า"/"ตามความ" มี มค · "ลูกค้า" มี กค · "มีค่า" มี มีค · "ทรัพย์" มี พย) —
 *    "งวดที่ 3 รวมค่าติดตั้ง ธันวาคม 2569" ได้ 2026-01 แทน 2026-12 (ชิปทางลัด/ปฏิทิน/ตัวเติม "ตามเดือนในชื่องวด" ผิดเดือนทั้งหมด)
 */
export function installmentLabelMonth(label) {
  const text = String(label || '').toLowerCase();
  if (!text) return '';
  const hits = [];
  MONTH_TIERS.forEach((tier, rank) => {
    MONTH_WORDS.forEach((words, i) => {
      for (const word of words[tier]) {
        const latin = LATIN_LETTER.test(word[0]);
        for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
          /* "mar" ใน "summary" ไม่นับ · "มค" ใน "รวมค่า" ไม่นับ — ไล่ตัวถัดไปในข้อความต่อ ("ลูกค้า กค 2570" ยังได้ ก.ค.) */
          if (latin && !standsAlone(text, at, word.length, LATIN_LETTER)) continue;
          if (tier === 'bare' && !standsAlone(text, at, word.length, THAI_LETTER)) continue;
          hits.push({ rank, at, len: word.length, month: i + 1 });
        }
      }
    });
  });
  hits.sort((a, b) => a.rank - b.rank || a.at - b.at || b.len - a.len);
  for (const hit of hits) {
    const year = text.slice(hit.at).match(/(\d{4})/);
    if (!year) continue;
    let y = Number(year[1]);
    if (y >= 2400) y -= 543;
    if (y < 2000 || y > 2100) return '';
    return `${y}-${String(hit.month).padStart(2, '0')}`;
  }
  return '';
}

/* งวดที่ตัวช่วยเติมแตะได้ — เติมเฉพาะที่ว่าง หรือรวมงวดที่มีวันแล้ว (จัดใหม่) แต่ยังไม่ขอใบ/ไม่รอเหตุการณ์/ยังไม่รับเงิน */
function fillTargets(installments, { includeDated = false, requestedIds = new Set() } = {}) {
  const sorted = [...(installments || [])].sort((a, b) => Number(a.seq) - Number(b.seq));
  const pick = includeDated
    ? (row) => installmentBillingRedatable(row, { requested: requestedIds.has(row.id) })
    : (row) => installmentBillingFillable(row) && !dateOf(row.dueDate);
  return { sorted, targets: sorted.filter(pick) };
}

/* ข้อเสนอของ "ต่อจากงวดก่อน" สำหรับลูกค้าวางบิลได้ทุกวัน + เครดิต — ยึดวันที่ของกำหนดชำระงวดล่าสุดที่มีวัน · เดือนถัดไป
   (AR-015: งวด 2 กำหนดชำระ 25 ธ.ค. → งวดถัดไปกำหนดชำระ 25 ม.ค. — ไม่ยึดวันวางบิล ซึ่งทำให้กำหนดชำระเลื่อนไปวันที่ 24/27)
   ⭐ งวดล่าสุดตกวันสุดท้ายของเดือนที่สั้นกว่า 31 (30 พ.ย. · 28 ก.พ.) = "สิ้นเดือน" **เว้นแต่** งวดก่อนหน้าพิสูจน์ว่าเป็นวันที่ตายตัว —
     มีงวดก่อนที่ตกวันที่เดียวกันในเดือนที่ยาวกว่าวันนั้น (30 ต.ค. แล้ว 30 พ.ย. = วันที่ 30 ไม่ใช่สิ้นเดือน)
     งวดเดียว / งวดก่อนตกวันอื่น / งวดก่อนก็ตกวันสุดท้ายของเดือน (30 ก.ย.) = ยังอ่านเป็นสิ้นเดือน
   🐞 review 28/09: เดิมดูแค่งวดล่าสุด ⇒ 30 ต.ค. · 30 พ.ย. เสนอ "สิ้นเดือน" แล้วงวดถัดไปได้ 31 ธ.ค. · 28 ม.ค. · 28 ก.พ. ได้ 31 มี.ค. */
export function creditCadenceSuggestion(installments = []) {
  const dated = [...(installments || [])]
    .filter((row) => dateOf(row.dueDate))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const last = dated[dated.length - 1];
  if (!last) return null;
  const [y, m, d] = partsOf(last.dueDate);
  const fixedDay = dated.slice(0, -1).some((row) => {
    const [py, pm, pd] = partsOf(row.dueDate);
    return pd === d && lastDayOf(py, pm) > d;
  });
  const monthEnd = d === lastDayOf(y, m) && d < 31 && !fixedDay;
  return {
    fromSeq: last.seq,
    dueDay: monthEnd ? MONTH_END_DAY : d,
    startMonth: dayInMonth(y, m + 1, 1).slice(0, 7),
  };
}

/* วันที่ `day` ของเดือนของแต่ละงวด — `startMonth` 'YYYY-MM' = เดือนละงวดเรียงต่อกัน · `null` = เดือนจากชื่องวด
   ("1st Installment: October 2026" · AR-622) — งวดที่ชื่อไม่บอกเดือนถูกข้ามพร้อมบอก (`skipped`) ไม่เดาเดือนให้
   ⭐ ตัวเดียวของตัวเติมรายเดือนที่ยึดกำหนดชำระ (planCreditCadence · planNoCreditDates) — เดือนในชื่องวดไม่คิดซ้ำสองที่
   @returns `{ picks: [{ row, dueDate }], skipped: [seq], error }` */
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
 * เติมวันแบบเดือนละงวด สำหรับลูกค้า **วางบิลได้ทุกวัน + เครดิต N วัน** — ยึดกำหนดชำระ แล้วคิดวันวางบิลย้อนกลับ N วัน
 * ⭐ **ไม่มีเครดิตเดินทางนี้ด้วย** (มติ 28/09 · `effectiveBillingRule` = เครดิต 0) ⇒ วันวางบิล = กำหนดชำระ วันเดียวกัน
 * @param dueDay 1–31 (31 = สิ้นเดือน)
 * @param startMonth 'YYYY-MM' ของงวดแรกที่เติม (เดือนละงวดเรียงต่อกัน) · **`null` = เดือนจากชื่องวด** ("ตามเดือนในชื่องวด" ·
 *   AR-622: "1st Installment: October 2026" → ตุลาคม) — งวดที่ชื่อไม่บอกเดือน = ข้าม พร้อมบอกใน `skipped`
 *   ⚠️ ไม่ส่ง (undefined) = ยังไม่เลือก ⇒ error (ต้องเลือกเองว่าเรียงเดือนหรือตามชื่องวด — ไม่มีค่าตั้งต้นให้การตัดสินใจ)
 * @returns `{ rows: [{ id, seq, billingDate, dueDate, prevBillingDate, prevDueDate }], skipped: [seq], error }`
 */
export function planCreditCadence(value, installments = [], { dueDay, startMonth, includeDated = false, requestedIds = new Set() } = {}) {
  const rule = effectiveBillingRule(value);
  if (!rule || rule.payment?.mode !== 'credit') return { rows: [], skipped: [], error: 'ใช้กับลูกค้าที่มีเครดิตเป็นจำนวนวันหรือไม่มีเครดิตเท่านั้น' };
  const day = intIn(dueDay, 1, 31);
  if (day === null) return { rows: [], skipped: [], error: 'เลือกวันที่ของกำหนดชำระ' };
  if (startMonth !== null && !/^\d{4}-\d{2}$/.test(String(startMonth ?? ''))) return { rows: [], skipped: [], error: 'เลือกเดือนเริ่ม' };
  const { targets } = fillTargets(installments, { includeDated, requestedIds });
  if (!targets.length) return { rows: [], skipped: [], error: includeDated ? 'ไม่มีงวดที่จัดวันใหม่ได้' : 'ไม่มีงวดที่ว่าง' };
  const { picks, skipped, error } = monthlyDueDates(targets, { day, startMonth });
  if (error) return { rows: [], skipped, error };
  const rows = picks.map(({ row, dueDate }) => ({
    id: row.id,
    seq: row.seq,
    billingDate: addDays(dueDate, -rule.payment.days),
    dueDate,
    prevBillingDate: dateOf(row.billingDate),
    prevDueDate: dateOf(row.dueDate),
  }));
  return { rows, skipped, error: null };
}

/**
 * เติมกำหนดชำระให้ลูกค้า **ที่ยังไม่ตั้งกำหนดวางบิล** (ไม่มีอะไรให้คิดวันวางบิล) — วันที่ `day` ของแต่ละเดือน (31 = สิ้นเดือน)
 * ⚠️ ชื่อเดิมจากรอบที่ "ไม่มีเครดิต" ยังใช้ทางนี้ (ก่อนมติ 28/09) — วันนี้ไม่มีเครดิตไปทาง `planCreditCadence` แล้ว
 *    ที่นี่เหลือแค่ลูกค้าที่ยังไม่ตั้ง: เขียนกำหนดชำระอย่างเดียว วันวางบิลคงเดิม (ไม่บังคับ · คนเลือกเองในตัวแก้)
 * @param startMonth 'YYYY-MM' = เดือนละงวดเรียงต่อกัน · null = ใช้เดือนจากชื่องวด (งวดที่ชื่อไม่บอกเดือน = ข้าม พร้อมบอก)
 * @returns `{ rows: [{ id, seq, billingDate (วันเดิมของงวด · ว่าง = null), dueDate, prevDueDate }], skipped: [seq], error }`
 */
export function planNoCreditDates(installments = [], { day, startMonth = null, includeDated = false, requestedIds = new Set() } = {}) {
  const d = intIn(day, 1, 31);
  if (d === null) return { rows: [], skipped: [], error: 'เลือกวันที่ของกำหนดชำระ' };
  const { targets } = fillTargets(installments, { includeDated, requestedIds });
  if (!targets.length) return { rows: [], skipped: [], error: includeDated ? 'ไม่มีงวดที่จัดวันใหม่ได้' : 'ไม่มีงวดที่ว่าง' };
  const { picks, skipped, error } = monthlyDueDates(targets, { day: d, startMonth });
  if (error) return { rows: [], skipped, error };
  return {
    /* วันวางบิลที่คนเลือกไว้เอง (ไม่บังคับ) คงเดิม — ตัวเติมนี้เขียนกำหนดชำระอย่างเดียว */
    rows: picks.map(({ row, dueDate }) => ({
      id: row.id, seq: row.seq, billingDate: dateOf(row.billingDate), dueDate, prevDueDate: dateOf(row.dueDate),
    })),
    skipped,
    error: null,
  };
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
