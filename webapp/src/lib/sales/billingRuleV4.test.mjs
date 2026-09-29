// ── เทสต์ตัวคิดกำหนดวางบิล · กำหนดชำระ รุ่นสี่ (billingRuleV4.js) — ย้ายมาจาก mockups/billing-cycle/rework-v4/system/calc.test.mjs ──
//
// สิ่งที่ชุดนี้พิสูจน์ (system-design.md):
//   §1 รูปรุ่นสี่ (แกน "ต้องวางบิลไหม" + สามแกนรุ่นสาม + วันจ่ายรายสัปดาห์) ตรวจ/ทำรูปมาตรฐาน/ตีกลับ
//   §2 แถวจริงทุกรูปในฐานวันนี้ (11 ตั้งแล้ว + { credit:false } 449) ได้กำหนดชำระ + ชิปเท่าเดิมทุกวัน 24 เดือน · ป้ายที่มาของ 13 งวดที่มีวันวางบิลเท่าเดิม
//   §3 ความหมายรายงวด: กำหนดชำระตั้งเดี่ยวได้เสมอ · วันวางบิลมีเมื่อต้องวางบิล · วันวางบิลที่เก็บแล้วไม่ถูกซ่อน · รอเหตุการณ์ไม่มีวัน
//   §4 ตัวอย่าง A–H (บรีฟ) + I–M (data survey) · §5 วันวางบิลถอยจากกำหนดชำระ · §6 ตัวเติม · §7 ที่มา + ประมาณการค้าง
//   §8 กติกาลูกค้าเปลี่ยน · §9 กระดิ่ง (ครบกำหนดทุกงวด · รอบกรรมการ 29/09) · §10 ย้ายข้อมูล (รอมติ ข้อ 4 ทั้งสี่ทาง + ด่านหยุด) · §11 สัญญาโมดัล · §12 ความจริงที่ห้ามพัง
//   รอบกรรมการ 29/09: ข้อยกเว้นรายงวดสองทาง · รูปเดิมเปิดแบบ free · ป้ายประมาณการค้าง/ยืนยันแล้ว · อ่านกติกาพลาดปิดแค่วันวางบิล
// ⭐ ย้ายเข้าแอป 29/09: เนื้อเทสต์เท่าต้นแบบทุกข้อ · ต่างแค่ dateModeOf คืน `override` (null เมื่อไม่ส่งงวด) — ข้อต่อท้าย §13 ครอบส่วนที่เพิ่ม
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BELL, NO_BILLING_TEXT, NO_BILLING_WRITE_ERROR, NO_CREDIT_TEXT, NO_TIMING_TEXT,
  addDays, asksNeed, backfillPlan, backfillRuleFor, billingCellText, billingChoices, billingForDue, billingNeed, billingState, bellsFor,
  calendarStatus, canRequestBilling, cutoffBell, dateModeOf, dateOf, describeRule, dueCellText, dueDateForBilling, dueEstimatedAsFor, dueFor,
  dueSeriesGaps, dueSourceOf, dueState, fillKindOf, fmtDate, formOf, hasTiming, installmentLabelMonth, installmentNeed, isEstimate,
  ledgerFlags, nagsMissingBilling, normalizeRule, noteDateHints, payRuns, planDueCadence, planFill, planRedate, planRuleChange, policyPreview,
  reminderKinds, ruleFromForm, ruleOf, slotCount, slotLabels, sourceLabel, validateInstallmentDates, weekendNote, creditCadenceSuggestion,
  needOverrideOf, backfillGate, LEDGER_HREF, RULE_UNAVAILABLE_ERROR, SKIP_TEXT, NEED_BACKFILL_OPTIONS,
  needExceptionActions, sameRule,
} from './billingRuleV4.js';

/* ═══ รุ่นสองอ้างอิง — สำเนาความหมายจาก webapp/src/lib/sales/billingRule.js (อ่าน 28/09/2026 · รวม effectiveBillingRule
       ของมติ 28/09 ข้อ 17: ไม่มีเครดิต = ชำระวันวางบิล) + addDays ของ paymentCoverage.js · ใช้เทียบเท่านั้น ═══════════════ */
const v2 = (() => {
  const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dOf = (value) => {
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
  const isoOf = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  function dayInMonth(year, month, day) {
    const y = year + Math.floor((month - 1) / 12);
    const m = ((month - 1) % 12 + 12) % 12 + 1;
    return isoOf(y, m, Math.min(day, lastDayOf(y, m)));
  }
  const partsOf = (s) => s.split('-').map(Number);
  function add(dateIso, days) {
    const day = dOf(dateIso);
    if (!day) return null;
    const base = new Date(`${day}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + Number(days || 0));
    return isoOf(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
  }
  function normalizeBillingRule(input) {
    if (input === null || input === undefined) return { rule: null, error: null };
    if (typeof input !== 'object' || Array.isArray(input)) return { rule: null, error: 'x' };
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (input.credit === false) return { rule: note ? { credit: false, note } : { credit: false }, error: null };
    const billingMode = input.billing?.mode;
    let billing;
    if (billingMode === 'anyday') billing = { mode: 'anyday' };
    else if (billingMode === 'monthly') {
      const rawDays = Array.isArray(input.billing?.days) ? input.billing.days : input.billing?.day !== undefined ? [input.billing.day] : [];
      if (!rawDays.length || rawDays.length > 4) return { rule: null, error: 'x' };
      const days = [];
      for (const raw of rawDays) { const day = intIn(raw, 1, 31); if (day === null) return { rule: null, error: 'x' }; days.push(day); }
      if (new Set(days).size !== days.length) return { rule: null, error: 'x' };
      billing = { mode: 'monthly', days };
    } else return { rule: null, error: 'x' };
    const roundCount = billing.mode === 'monthly' ? billing.days.length : 1;
    const paymentMode = input.payment?.mode;
    let payment;
    if (paymentMode === 'credit') {
      const days = intIn(input.payment?.days, 0, 365);
      if (days === null) return { rule: null, error: 'x' };
      payment = { mode: 'credit', days };
    } else if (paymentMode === 'monthly') {
      const rawRounds = Array.isArray(input.payment?.rounds) ? input.payment.rounds
        : input.payment?.day !== undefined ? Array.from({ length: roundCount }, () => ({ day: input.payment.day, monthOffset: input.payment.monthOffset })) : [];
      if (rawRounds.length !== roundCount) return { rule: null, error: 'x' };
      const rounds = [];
      for (let i = 0; i < rawRounds.length; i += 1) {
        const day = intIn(rawRounds[i]?.day, 1, 31);
        const monthOffset = intIn(rawRounds[i]?.monthOffset, 0, 1);
        if (day === null || monthOffset === null) return { rule: null, error: 'x' };
        if (billing.mode === 'monthly' && monthOffset === 0 && day < billing.days[i]) return { rule: null, error: 'x' };
        rounds.push({ day, monthOffset });
      }
      payment = { mode: 'monthly', rounds };
    } else return { rule: null, error: 'x' };
    if (billing.mode === 'monthly' && billing.days.length > 1) {
      const order = billing.days.map((d, i) => i).sort((a, b) => billing.days[a] - billing.days[b]);
      billing = { mode: 'monthly', days: order.map((i) => billing.days[i]) };
      if (payment.mode === 'monthly') payment = { mode: 'monthly', rounds: order.map((i) => payment.rounds[i]) };
    }
    const rule = { billing, payment };
    if (note) rule.note = note;
    return { rule, error: null };
  }
  const billingRuleOf = (value) => normalizeBillingRule(value ?? null).rule;
  function effectiveBillingRule(value) {
    const rule = billingRuleOf(value);
    if (!rule) return null;
    if (rule.credit !== false) return rule;
    return { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 0 }, noCredit: true };
  }
  function payDateFor(round, bill) {
    const [year, month] = partsOf(bill);
    let due = dayInMonth(year, month + round.monthOffset, round.day);
    if (due < bill) due = dayInMonth(year, month + round.monthOffset + 1, round.day);
    return due;
  }
  function roundIndexForDate(rule, bill) {
    if (rule.billing.mode !== 'monthly') return 0;
    const [year, month, day] = partsOf(bill);
    let pick = rule.billing.days.length - 1;
    rule.billing.days.forEach((billDay, i) => { if (Number(dayInMonth(year, month, billDay).slice(8)) <= day) pick = i; });
    return pick;
  }
  function dueDateForBilling(value, billingDate) {
    const rule = effectiveBillingRule(value);
    const bill = dOf(billingDate);
    if (!rule || !bill) return '';
    if (rule.payment.mode === 'credit') return add(bill, rule.payment.days) || '';
    return payDateFor(rule.payment.rounds[roundIndexForDate(rule, bill)], bill);
  }
  function billingRounds(value, fromIso, count = 3, { roundIndex = null } = {}) {
    const rule = effectiveBillingRule(value);
    const from = dOf(fromIso);
    if (!rule || !from || rule.billing?.mode !== 'monthly') return [];
    const [year, month] = partsOf(from);
    const indexes = rule.billing.days.map((d, i) => i).filter((i) => roundIndex === null || i === roundIndex);
    if (!indexes.length) return [];
    const out = [];
    const seen = new Set();
    for (let k = 0; out.length < count && k < count + 2; k += 1) {
      const inMonth = indexes.map((i) => ({ i, billingDate: dayInMonth(year, month + k, rule.billing.days[i]) }))
        .sort((a, b) => (a.billingDate < b.billingDate ? -1 : 1));
      for (const { i, billingDate } of inMonth) {
        if (billingDate < from || seen.has(billingDate) || out.length >= count) continue;
        seen.add(billingDate);
        const dueDate = rule.payment.mode === 'credit' ? add(billingDate, rule.payment.days) : payDateFor(rule.payment.rounds[i], billingDate);
        out.push({ billingDate, dueDate, roundIndex: i });
      }
    }
    return out;
  }
  return { dueDateForBilling, billingRounds, normalizeBillingRule };
})();

/* ═══ ข้อมูลตัวอย่าง ═══════════════════════════════════════════════════════════════════════════════ */
const TODAY = '2026-09-28';
const everyDay = (from, days) => Array.from({ length: days }, (_, i) => addDays(from, i));
const DAYS_24M = everyDay(TODAY, 731);
const R = (over) => ({ v: 4, need: 'required', ...over });

/* A · AR-281 มีเมตตา — ปฏิทิน 2026 ถอดจาก meemetta-2026.jpg (calendar-v3/brief.md §1) [เดือน, ตัด1, จ่าย1, ตัด2, จ่าย2] */
const MEEMETTA_TABLE = [
  [1, 9, 15, 22, 30], [2, 6, 16, 19, 27], [3, 6, 16, 23, 31], [4, 2, 16, 22, 30],
  [5, 8, 15, 21, 29], [6, 8, 15, 22, 30], [7, 8, 15, 23, 30], [8, 10, 17, 21, 31],
  [9, 8, 15, 22, 30], [10, 8, 15, 21, 30], [11, 9, 16, 20, 30], [12, 8, 15, 22, 30],
];
const d26 = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const MEEMETTA_2026 = MEEMETTA_TABLE.flatMap(([m, c1, p1, c2, p2]) => [{ cutoff: d26(m, c1), pay: d26(m, p1) }, { cutoff: d26(m, c2), pay: d26(m, p2) }]);
const meemetta = (creditDays, years = { 2026: { runs: MEEMETTA_2026 } }) => R({
  billing: { mode: 'anyday' }, creditDays, runs: { kind: 'calendar', cutoffTime: '16:00', years },
});
const HOLIDAYS_2026 = new Map([
  ['2026-01-01', 'วันขึ้นปีใหม่'], ['2026-03-03', 'วันมาฆบูชา'], ['2026-04-06', 'วันจักรี'], ['2026-04-13', 'วันสงกรานต์'],
  ['2026-04-14', 'วันสงกรานต์'], ['2026-04-15', 'วันสงกรานต์'], ['2026-05-01', 'วันแรงงาน'], ['2026-05-04', 'วันฉัตรมงคล'],
  ['2026-05-31', 'วันวิสาขบูชา'], ['2026-06-01', 'ชดเชยวันวิสาขบูชา'], ['2026-06-03', 'วันเฉลิมฯ พระราชินี'],
  ['2026-07-28', 'วันเฉลิมฯ ร.10'], ['2026-07-29', 'วันอาสาฬหบูชา'], ['2026-07-30', 'วันเข้าพรรษา'], ['2026-08-12', 'วันแม่แห่งชาติ'],
  ['2026-10-13', 'วันคล้ายวันสวรรคต ร.9'], ['2026-10-23', 'วันปิยมหาราช'], ['2026-12-07', 'ชดเชยวันพ่อแห่งชาติ'],
  ['2026-12-10', 'วันรัฐธรรมนูญ'], ['2026-12-31', 'วันสิ้นปี'],
]);
/* B · AR-267 วางบิลวันที่ 5 → เงินเข้า 25 เดือนเดียวกัน · C · สองรอบ (แต่ง) · H · สิ้นเดือน → 15 เดือนถัดไป (แต่ง) */
const B = R({ billing: { mode: 'anyday' }, creditDays: 0, runs: { kind: 'monthly', rounds: [{ cutoffDay: 5, payDay: 25, payMonthOffset: 0 }] } });
const C = R({ billing: { mode: 'anyday' }, creditDays: 0, runs: { kind: 'monthly', rounds: [{ cutoffDay: 10, payDay: 25, payMonthOffset: 0 }, { cutoffDay: 25, payDay: 10, payMonthOffset: 1 }] } });
const H = R({ billing: { mode: 'anyday' }, creditDays: 0, runs: { kind: 'monthly', rounds: [{ cutoffDay: 31, payDay: 15, payMonthOffset: 1 }] } });
/* I · AR-035 ซี.พี.แลนด์ — QT-26090310-0 "เครดิต 30 วัน วางบิลตามรอบบริษัท" + RQ-DF-26090114 "จ่ายทุกวันพุธ ที่ 2,4" (ตัวอย่างของรูปใหม่ · ในฐานยังเป็น { credit:false }) */
const I = R({ billing: { mode: 'anyday' }, creditDays: 30, runs: { kind: 'weekday', weekday: 3, nths: [2, 4] } });
const NONE = { v: 4, need: 'none' };
const NO_TIMING = { v: 4, need: 'required', billing: null };
const SAME_DAY = R({ billing: { mode: 'anyday' }, creditDays: 0, runs: null });
const CREDIT30 = R({ billing: { mode: 'anyday' }, creditDays: 30, runs: null });

/* แถวจริงใน customers."billingRule" ที่ไม่ใช่ null (GET อ่านอย่างเดียว 28/09/2026 · 460 แถว = 449 { credit:false } + 11 ตัวนี้) */
const REAL_V2 = {
  'AR-281': { billing: { days: [21], mode: 'monthly' }, payment: { mode: 'monthly', rounds: [{ day: 30, monthOffset: 1 }] } },
  'AR-890': { billing: { mode: 'anyday' }, payment: { days: 30, mode: 'credit' } },
  'AR-003': { billing: { mode: 'anyday' }, payment: { days: 30, mode: 'credit' } },
  'AR-428': { billing: { mode: 'anyday' }, payment: { days: 14, mode: 'credit' } },
  'AR-483': { billing: { mode: 'anyday' }, payment: { days: 30, mode: 'credit' } },
  'AR-106': { billing: { mode: 'anyday' }, payment: { days: 30, mode: 'credit' } },
  'AR-778': { billing: { mode: 'anyday' }, payment: { days: 30, mode: 'credit' } },
  'AR-809': { billing: { mode: 'anyday' }, payment: { days: 30, mode: 'credit' } },
  'AR-521': { billing: { mode: 'anyday' }, payment: { days: 30, mode: 'credit' } },
  'AR-374': { note: 'นับเครดิตหลังจากติดตั้ง', billing: { mode: 'anyday' }, payment: { days: 30, mode: 'credit' } },
  'AR-015': { note: 'นับเครดิตหลังจัดส่งสินค้า', billing: { mode: 'anyday' }, payment: { days: 30, mode: 'credit' } },
  'no-credit ×449': { credit: false },
};
const LEGACY = { credit: false };
const inst = (seq, over = {}) => ({ id: `i${seq}`, seq, status: 'pending', kind: 'regular', amount: 11235, ...over });

/* งวดจริง (inst.json · GET 28/09) — D · AR-015 SO-26090230-0 (12 งวด) */
const D_DUES = ['2026-11-25', '2026-12-25', '2027-02-24', '2027-03-27', '2027-04-24', '2027-05-25', '2027-06-24', '2027-07-25', '2027-08-24', '2027-09-24', '2027-10-25', '2027-11-24'];
const D_BILLS = [null, null, '2027-01-25', '2027-02-25', '2027-03-25', '2027-04-25', '2027-05-25', '2027-06-25', '2027-07-25', '2027-08-25', '2027-09-25', '2027-10-25'];
const D_NOTES = ['24/10/2026', '24/11/2026', '24/12/2026', '24/01/2027', '24/02/2027', '24/03/2027', '24/04/2027', '24/05/2027', '24/06/2027', '24/07/2027', '24/08/2027', '24/09/2027'];
const SO_D = D_DUES.map((due, i) => inst(i + 1, {
  id: `d${i + 1}`, label: `งวดที่ ${i + 1}`, amount: i === 11 ? 38796.95 : 38611.55, dueDate: due, billingDate: D_BILLS[i], note: `วางบิล ${D_NOTES[i]} เครดิต 30 วัน`,
}));
/* A · AR-281 สามใบ (วันวางบิลตรงวันตัดรอบจริง · กำหนดชำระใช้คนละกติกา — data survey ข้อแก้ในบรีฟ) */
const SO_A = [
  inst(1, { id: 'SO-26090228-0#1', billingDate: '2026-10-08', dueDate: '2026-11-07' }),
  inst(2, { id: 'SO-26090229-0#1', billingDate: '2026-10-21', dueDate: '2026-11-30' }),
  inst(3, { id: 'SO-26090227-0#1', billingDate: '2026-11-20', dueDate: '2026-12-20' }),
];
/* E · AR-622 SO-26090223-0 (ชื่องวดบอกเดือน) */
const SO_E = ['1st Installment: October 2026 –', '2nd Installment: February 2027', '3rd Installment: June 2027', '4th Installment: October 2027']
  .map((label, i) => inst(i + 1, { id: `e${i + 1}`, label, amount: 37236 }));
/* F · AR-638 SO-26090209-0 · J · AR-903 SO-26090173-0 · L · AR-885 SO-26090182-0 · K · AR-730 SO-26090195-0 · G · AR-711 SO-26080138-1 */
const SO_F = [inst(1, { id: 'f1', label: 'มัดจำ', status: 'confirmed', amount: 58850, dueDate: '2026-09-18' }), inst(2, { id: 'f2', label: 'งวดสุดท้าย', amount: 58850, billingEvent: 'ก่อนส่งสินค้า' })];
const SO_J = [inst(1, { id: 'j1', label: 'มัดจำ', status: 'reported', amount: 86670, dueDate: '2026-09-09' }), inst(2, { id: 'j2', label: 'งวดสุดท้าย', amount: 86670, billingEvent: 'ก่อนส่งสินค้า' })];
const SO_L = [
  inst(1, { id: 'l1', label: 'ชำระงวดที่ 1', status: 'reported', amount: 19099.5, dueDate: '2026-09-11', note: 'ชำระก่อนติดตั้ง' }),
  inst(2, { id: 'l2', label: 'ชำระงวดที่ 2', amount: 9549.75, dueDate: '2026-10-14', note: 'ชำระวันที่ 14/10/2569' }),
  inst(3, { id: 'l3', label: 'ชำระงวดสุดท้าย', amount: 9549.75, dueDate: '2026-10-14', note: 'ชำระวันที่ 14/11/2569' }),
];
const SO_K = [inst(1, { id: 'k1', label: 'ชำระเต็มจำนวน', amount: 11235, dueDate: '2026-09-25' })];
const SO_G = [inst(1, { id: 'g1', label: 'มัดจำ', status: 'confirmed', amount: 80517.5 }), inst(2, { id: 'g2', label: 'งวดสุดท้าย', amount: 80517.5 })];

/* ═══ §1 · รูปรุ่นสี่ ════════════════════════════════════════════════════════════════════════════ */

test('§1 รูปรุ่นสี่ทุกแบบผ่านตัวตรวจ และทำซ้ำได้ผลเดิม (ไม่ต้องวางบิล · ยังไม่ตั้งรอบ · ทุกวัน · วันที่ · คู่ตัด→จ่าย · วันจ่ายรายสัปดาห์ · ปฏิทิน)', () => {
  const samples = [NONE, { ...NONE, note: 'โอนก่อนส่งของ' }, NO_TIMING, SAME_DAY, CREDIT30, B, C, H, I, meemetta(0), meemetta(30),
    R({ billing: { mode: 'monthly', days: [25, 10] }, creditDays: 30, runs: null }),
    R({ billing: { mode: 'monthly', days: [5] }, creditDays: 30, runs: { kind: 'monthly', rounds: [{ cutoffDay: 25, payDay: 25, payMonthOffset: 0 }] } })];
  for (const s of samples) {
    const { rule, error } = normalizeRule(s, { allowLegacy: false });
    assert.equal(error, null, JSON.stringify(s));
    assert.deepEqual(normalizeRule(rule, { allowLegacy: false }).rule, rule);
  }
  assert.deepEqual(normalizeRule(R({ billing: { mode: 'monthly', days: [25, 10] }, creditDays: 30, runs: null })).rule.billing.days, [10, 25]);
  assert.deepEqual(normalizeRule(R({ billing: { mode: 'anyday' }, creditDays: 0, runs: { kind: 'weekday', weekday: 3, nths: [4, 2] } })).rule.runs.nths, [2, 4]);
});

test('§1 ตัวตรวจตีกลับ — ไม่ต้องวางบิลแต่มีรอบ · เครดิตก่อนวันวางบิล · ไม่ส่งเครดิต (ไม่มีค่าตั้งต้น) · ช่องแปลก · ปฏิทิน+วันรับวางบิล · วันจ่ายรายสัปดาห์ผิด', () => {
  const bad = [
    [{ v: 4, need: 'none', billing: { mode: 'anyday' } }, 'ไม่มีวันวางบิล'],
    [{ v: 4, need: 'none', creditDays: 30 }, 'ไม่มีวันวางบิล'],
    [{ v: 4, need: 'required', billing: null, creditDays: 30 }, 'ตั้งวันวางบิลก่อน'],
    [{ v: 4, need: 'maybe' }, 'ต้องวางบิล'],
    [{ v: 4 }, 'ต้องวางบิล'],
    [R({ billing: { mode: 'anyday' }, runs: null }), 'เครดิต'],
    [R({ billing: { mode: 'anyday' }, creditDays: 0, runs: null, payment: {} }), 'ช่องที่ไม่รู้จัก'],
    [R({ billing: { mode: 'monthly', days: [21] }, creditDays: 0, runs: { kind: 'calendar', years: { 2026: { runs: MEEMETTA_2026 } } } }), 'วางบิลได้ทุกวัน'],
    [R({ billing: { mode: 'anyday' }, creditDays: 30, runs: { kind: 'weekday', weekday: 7, nths: [2] } }), 'วันในสัปดาห์'],
    [R({ billing: { mode: 'anyday' }, creditDays: 30, runs: { kind: 'weekday', weekday: 3, nths: [2, 2] } }), 'ซ้ำ'],
    [R({ billing: { mode: 'anyday' }, creditDays: 30, runs: { kind: 'weekday', weekday: 3, nths: [2], cutoffTime: '16:00' } }), 'เวลาตัดรอบ'],
    [R({ billing: { mode: 'anyday' }, creditDays: 0, runs: { kind: 'monthly', rounds: [{ cutoffDay: 5, payDay: 25, payMonthOffset: 0 }], cutoffTime: '4pm' } }), 'HH:MM'],
    [{ v: 3, billing: { mode: 'anyday' }, creditDays: 0, runs: null }, 'ไม่ถูกต้อง'],
  ];
  for (const [input, word] of bad) {
    const { rule, error } = normalizeRule(input);
    assert.equal(rule, null, JSON.stringify(input));
    assert.match(error, new RegExp(word), JSON.stringify(input));
  }
});

test('§1 รูปเดิม { credit:false } อ่านเป็น "ต้องวางบิล · ได้ทุกวัน · ชำระวันวางบิล" + ธงรูปเดิม — ไม่ชวนเติมวันวางบิล (เท่า prod) · ต้องถาม "ต้องวางบิลไหม" · โมดัลรุ่นสี่บันทึกรูปเดิมไม่ได้', () => {
  const { rule, converted } = normalizeRule(LEGACY);
  assert.equal(converted, true);
  assert.deepEqual(rule, { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 0, runs: null, legacyNoCredit: true });
  assert.deepEqual(ruleOf(rule), rule, 'ส่งผลการอ่านกลับเข้ามาได้');
  assert.equal(billingNeed(LEGACY), 'required');
  assert.equal(nagsMissingBilling(LEGACY), false, 'prod วันนี้: ไม่มีเครดิตไม่นับว่าขาดวันวางบิล');
  assert.equal(asksNeed(LEGACY), true);
  assert.equal(asksNeed(null), true);
  assert.equal(asksNeed(NONE), false);
  assert.equal(describeRule(LEGACY), NO_CREDIT_TEXT);
  assert.deepEqual(formOf(LEGACY), { need: null, legacyNoCredit: true, note: '', was: NO_CREDIT_TEXT });
  for (const old of [LEGACY, rule, REAL_V2['AR-015']]) assert.match(normalizeRule(old, { allowLegacy: false }).error, /เลิกบันทึก/);
});

/* ═══ §2 · แถวจริงเท่าเดิมทุกวัน ════════════════════════════════════════════════════════════════════ */

test('§2 ⭐ แถวจริงทั้งหมดในฐาน (11 ตั้งแล้ว + { credit:false } 449) — กำหนดชำระเท่ารุ่นสองทุกวันใน 24 เดือน + ชิปเท่ากัน', () => {
  for (const [name, raw] of Object.entries(REAL_V2)) {
    for (const day of DAYS_24M) assert.equal(dueDateForBilling(raw, day), v2.dueDateForBilling(raw, day), `${name} ${day}`);
    const mine = billingChoices(raw, TODAY, 24).map((c) => [c.billingDate, c.dueDate]);
    const theirs = v2.billingRounds(raw, TODAY, 24).map((c) => [c.billingDate, c.dueDate]);
    assert.deepEqual(mine, theirs, name);
  }
});

test('§2 ป้ายที่มาของ 13 งวดจริงที่มีวันวางบิลเท่า prod — AR-015 ×10 "ตามเครดิต 30 วัน" · AR-281: 21 ต.ค. "ตามรอบ" · 8 ต.ค./20 พ.ย. "แก้ทับ"', () => {
  for (const row of SO_D.slice(2)) assert.equal(dueSourceOf(REAL_V2['AR-015'], row).label, 'ตามเครดิต 30 วัน', row.id);
  assert.deepEqual(SO_A.map((row) => dueSourceOf(REAL_V2['AR-281'], row).label), ['แก้ทับ', 'ตามรอบ', 'แก้ทับ']);
  assert.deepEqual(SO_A.map((row) => dueSourceOf(REAL_V2['AR-281'], row).computed ?? null), ['2026-11-30', null, '2026-12-30']);
});

/* ═══ §3 · ความหมายรายงวด ═════════════════════════════════════════════════════════════════════════ */

test('§3 "ต้องวางบิลไหม" รายงวด — ตามลูกค้า · วันวางบิลที่เก็บแล้วไม่ถูกซ่อน · เมนูขอใบวางบิลหายเมื่อไม่ต้องวางบิล · เซลล์ขึ้น "ไม่ต้องวางบิล"', () => {
  const dueOnly = inst(1, { dueDate: '2026-10-14' });
  const billed = inst(2, { billingDate: '2026-10-05', dueDate: '2026-10-05' });
  assert.equal(installmentNeed(dueOnly, NONE), 'none');
  assert.equal(installmentNeed(dueOnly, null), 'unknown');
  assert.equal(installmentNeed(dueOnly, CREDIT30), 'required');
  assert.equal(installmentNeed(billed, NONE), 'required', 'ลูกค้าเปลี่ยนเป็นไม่ต้องวางบิลทีหลัง — วันเดิมยังเห็น ยังเตือน จนคนล้าง');
  assert.equal(canRequestBilling(dueOnly, NONE), false);
  assert.equal(canRequestBilling(dueOnly, null), true);
  assert.equal(canRequestBilling(billed, NONE), true);
  assert.equal(billingCellText(dueOnly, NONE), NO_BILLING_TEXT);
  assert.equal(billingCellText(dueOnly, CREDIT30), '—');
  assert.equal(billingCellText(billed, NONE), 'จ. 5 ต.ค. 2026');
  assert.equal(dueCellText(dueOnly, NONE), 'พ. 14 ต.ค. 2026');
});

test('§3 ด่านเขียนวัน — ไม่ต้องวางบิลตั้งวันวางบิลใหม่ไม่ได้ (ล้าง/คงวันเดิมได้) · รอเหตุการณ์ไม่มีกำหนดชำระ · งวดยกมาไม่มีวัน · สองช่องแยกกัน', () => {
  const stored = inst(1, { billingDate: '2026-10-05', dueDate: '2026-10-20' });
  assert.equal(validateInstallmentDates({}, { dueDate: '2026-10-20' }, NONE), null, 'กำหนดชำระตั้งเดี่ยวได้เสมอ');
  assert.equal(validateInstallmentDates({}, { billingDate: '2026-10-05', dueDate: '2026-10-20' }, NONE), NO_BILLING_WRITE_ERROR);
  assert.equal(validateInstallmentDates(stored, { billingDate: '2026-10-05', dueDate: '2026-10-25' }, NONE), null, 'คงวันเดิม แก้กำหนดชำระ');
  assert.equal(validateInstallmentDates(stored, { billingDate: '2026-10-06', dueDate: '2026-10-20' }, NONE), NO_BILLING_WRITE_ERROR);
  assert.equal(validateInstallmentDates(stored, { billingDate: null, dueDate: '2026-10-20' }, NONE), null, 'ล้างได้');
  assert.match(validateInstallmentDates({}, { billingEvent: 'ก่อนส่งสินค้า', dueDate: '2026-10-20' }, NONE), /รอเหตุการณ์ยังไม่มีกำหนดชำระ/);
  assert.equal(validateInstallmentDates({}, { billingEvent: 'ก่อนส่งสินค้า' }, NONE), null, 'ไม่ต้องวางบิลก็รอเหตุการณ์ได้ (เหตุการณ์คุมกำหนดชำระ)');
  assert.match(validateInstallmentDates({}, { billingDate: '2026-10-05', billingEvent: 'x' }, CREDIT30), /อย่างใดอย่างหนึ่ง/);
  assert.match(validateInstallmentDates({ kind: 'opening' }, { dueDate: '2026-10-05' }, CREDIT30), /งวดยกมา/);
  assert.equal(validateInstallmentDates({}, { billingDate: '2026-10-05', dueDate: '2026-09-01' }, CREDIT30), null, 'ด่านไม่คิดกำหนดชำระใหม่ — เก็บตามที่ส่ง (คำเตือนอยู่ที่จอ)');
  assert.equal(validateInstallmentDates({}, { billingDate: '2026-10-05' }, null), null, 'ยังไม่ระบุ = ตั้งได้ทั้งสองช่อง');
  assert.match(validateInstallmentDates({}, { dueDate: '2026-02-31' }, NONE), /กำหนดชำระไม่ถูกต้อง/);
});

test('§3 ⭐ ข้อยกเว้นรายงวดสองทาง (รอบกรรมการ 29/09) — ไม่ต้องวางบิลแต่งวดนี้ขอใบ = ยืนยันแล้วเขียนวันวางบิลได้ · ต้องวางบิลแต่งวดนี้โอนก่อน = ติ๊ก · อ่านกติกาพลาดปิดแค่ช่องวันวางบิล', () => {
  const next = { billingDate: '2026-10-05', dueDate: '2026-10-20' };
  assert.equal(validateInstallmentDates({}, next, NONE), NO_BILLING_WRITE_ERROR, 'ไม่ยืนยัน = 400 เหมือนเดิม');
  assert.equal(validateInstallmentDates({}, { ...next, billingException: true }, NONE), null, 'ยืนยันผ่านโมดัล "งวดนี้ต้องวางบิล…"');
  const excepted = inst(2, { billingDate: '2026-10-05', dueDate: '2026-10-20' });
  assert.equal(needOverrideOf(excepted, NONE), 'billing');
  assert.equal(installmentNeed(excepted, NONE), 'required');
  assert.equal(canRequestBilling(excepted, NONE), true, 'งวดนั้นขอใบวางบิลได้ · งวดอื่นไม่ชวน');
  assert.equal(canRequestBilling(inst(3, { dueDate: '2026-10-20' }), NONE), false);
  const skipped = inst(1, { dueDate: '2026-09-25', billingSkip: true });
  assert.equal(validateInstallmentDates({}, { dueDate: '2026-09-25', billingSkip: true }, CREDIT30), null);
  assert.match(validateInstallmentDates({}, { billingDate: '2026-09-25', billingSkip: true }, CREDIT30), new RegExp(SKIP_TEXT));
  assert.match(validateInstallmentDates({}, { dueDate: '2026-09-25', billingSkip: true }, NONE), /อยู่แล้ว/);
  assert.equal(installmentNeed(skipped, CREDIT30), 'none');
  assert.equal(needOverrideOf(skipped, CREDIT30), 'skip');
  assert.equal(billingCellText(skipped, CREDIT30), NO_BILLING_TEXT);
  assert.equal(ledgerFlags(skipped, CREDIT30, { todayIso: TODAY }).missingBilling, false, 'ทะเบียน FN ไม่ชวน "ยังไม่มีวันวางบิล"');
  assert.equal(ledgerFlags(skipped, CREDIT30, { todayIso: TODAY }).override, 'skip');
  assert.equal(canRequestBilling(skipped, CREDIT30), false);
  assert.deepEqual(planRuleChange(NONE, CREDIT30, [skipped, inst(2, { dueDate: '2026-11-25' })]).rows.map((r) => r.seq), [2], 'ลูกค้าเปลี่ยนเป็นต้องวางบิล — งวดที่ติ๊กไม่ถูกเสนอวันวางบิล');
  assert.equal(needOverrideOf(inst(4, { billingDate: '2026-10-05' }), CREDIT30), null, 'ตามลูกค้า = ไม่ใช่ข้อยกเว้น');
  assert.equal(validateInstallmentDates({}, { dueDate: '2026-10-20' }, null, { ruleUnavailable: true }), null, 'อ่านกติกาพลาด: กำหนดชำระยังบันทึกได้');
  assert.equal(validateInstallmentDates({}, next, null, { ruleUnavailable: true }), RULE_UNAVAILABLE_ERROR, 'แต่วันวางบิลใหม่ไม่ผ่าน (ไม่เดา)');
  assert.equal(validateInstallmentDates(excepted, { billingDate: '2026-10-05', dueDate: '2026-10-22' }, null, { ruleUnavailable: true }), null, 'คงวันวางบิลเดิม แก้กำหนดชำระ = ผ่าน');
});

test('§3 สถานะวางบิล/กำหนดชำระ — ไม่ต้องวางบิลไม่มี "เลยรอบวางบิล" · แดงอ่านกำหนดชำระช่องเดียว · คำร้องที่ส่งแล้วไม่หายเมื่อลูกค้าเปลี่ยน', () => {
  const late = inst(1, { dueDate: '2026-09-25' });
  assert.equal(billingState(late, NONE, { todayIso: TODAY }).key, 'notNeeded');
  assert.equal(billingState(late, CREDIT30, { todayIso: TODAY }).key, 'none');
  assert.equal(billingState(late, NONE, { todayIso: TODAY, requested: true }).key, 'requested');
  assert.equal(dueState(late, { todayIso: TODAY }).key, 'late', 'ป้ายแดง "เลยกำหนด"');
  const billPast = inst(2, { billingDate: '2026-09-20', dueDate: '2026-10-20' });
  assert.equal(billingState(billPast, CREDIT30, { todayIso: TODAY }).key, 'late', 'เลยรอบวางบิล = โทนเตือน');
  assert.equal(dueState(billPast, { todayIso: TODAY }).key, 'upcoming', 'วันวางบิลผ่านแล้วไม่ทำให้แดง');
  assert.equal(billingState(billPast, NONE, { todayIso: TODAY }).key, 'late', 'วันวางบิลเดิมของลูกค้าที่เปลี่ยนเป็นไม่ต้องวางบิลยังเห็น');
  assert.equal(dueState(inst(3, { billingEvent: 'ก่อนส่งสินค้า' }), { todayIso: TODAY }).key, 'waiting');
  assert.equal(dueState(inst(4, { status: 'confirmed', dueDate: '2026-09-01' }), { todayIso: TODAY }).key, 'settled');
});

/* ═══ §4 · ตัวอย่าง A–M ══════════════════════════════════════════════════════════════════════════ */

test('§4 A · มีเมตตา — เครดิต 30: 21 ต.ค. → 30 พ.ย. · 8 ต.ค. → 16 พ.ย. · เครดิต 0: 21 ต.ค. → 30 ต.ค. (ตามปฏิทินลูกค้า) · ชิปจากวันนี้', () => {
  assert.deepEqual(dueFor(meemetta(30), '2026-10-21'), { dueDate: '2026-11-30', source: 'calendar', run: { cutoff: '2026-11-20', pay: '2026-11-30', slot: 1 } });
  assert.equal(dueDateForBilling(meemetta(30), '2026-10-08'), '2026-11-16');
  assert.equal(dueDateForBilling(meemetta(0), '2026-10-21'), '2026-10-30');
  assert.deepEqual(billingChoices(meemetta(0), TODAY, 3).map((c) => [c.billingDate, c.dueDate]), [['2026-10-08', '2026-10-15'], ['2026-10-21', '2026-10-30'], ['2026-11-09', '2026-11-16']]);
  assert.deepEqual(billingChoices(meemetta(30), TODAY, 4, { holidays: HOLIDAYS_2026 }).map((c) => [c.billingDate, c.dueDate]),
    [['2026-10-09', '2026-11-16'], ['2026-10-21', '2026-11-30'], ['2026-11-06', '2026-12-15'], ['2026-11-20', '2026-12-30']]);
});

test('§4 A · AR-281 สามใบจริงกับรอมติ ข้อ 1 — ระบบเสนอ ไม่เปลี่ยนเงียบ · สองใบที่ใส่ +30 เองไม่แตะ (แก้ทับ)', () => {
  const credit0 = SO_A.map((r) => dueDateForBilling(meemetta(0), r.billingDate));
  const credit30 = SO_A.map((r) => dueDateForBilling(meemetta(30), r.billingDate));
  assert.deepEqual(credit0, ['2026-10-15', '2026-10-30', '2026-11-30']);
  assert.deepEqual(credit30, ['2026-11-16', '2026-11-30', '2026-12-30']);
  const to30 = planRuleChange(REAL_V2['AR-281'], meemetta(30), SO_A);
  assert.deepEqual(to30.rows, [], 'เครดิต 30: SO-26090229-0 (21 ต.ค. → 30 พ.ย.) ไม่เปลี่ยน');
  assert.deepEqual(to30.kept.map((k) => [k.id, k.reason]), [['SO-26090228-0#1', 'manual'], ['SO-26090227-0#1', 'manual']]);
  const to0 = planRuleChange(REAL_V2['AR-281'], meemetta(0), SO_A);
  assert.deepEqual(to0.rows.map((r) => [r.id, r.change, r.prevDueDate, r.dueDate, r.later]), [['SO-26090229-0#1', 'newDue', '2026-11-30', '2026-10-30', false]]);
  assert.deepEqual(SO_A.map((r) => dueSourceOf(meemetta(30), r).key), ['override', 'rule', 'override'], 'ป้ายหลังใส่ปฏิทิน: สองใบเป็น "แก้ทับ" พร้อมวันตามปฏิทินให้แตะ');
});

test('§4 B · C · H — วันที่ 5 → 25 · สองรอบ 10 → 25 / 25 → 10 เดือนถัดไป · สิ้นเดือน → 15 เดือนถัดไป', () => {
  assert.deepEqual(billingChoices(B, TODAY, 3).map((c) => [c.billingDate, c.dueDate]), [['2026-10-05', '2026-10-25'], ['2026-11-05', '2026-11-25'], ['2026-12-05', '2026-12-25']]);
  assert.equal(dueDateForBilling(B, '2026-10-06'), '2026-11-25', 'เลยวันที่ 5 = รอบถัดไป');
  assert.deepEqual(billingChoices(C, TODAY, 3).map((c) => [c.billingDate, c.dueDate, c.weekend]),
    [['2026-10-10', '2026-10-25', 'ตรงวันเสาร์'], ['2026-10-25', '2026-11-10', 'ตรงวันอาทิตย์'], ['2026-11-10', '2026-11-25', '']]);
  assert.equal(slotCount(C), 2);
  assert.deepEqual(slotLabels(C), ['ตัดรอบวันที่ 10', 'ตัดรอบวันที่ 25']);
  assert.equal(dueDateForBilling(H, '2027-01-31'), '2027-02-15');
  assert.equal(dueDateForBilling(H, '2027-02-01'), '2027-03-15');
  assert.equal(describeRule(H), 'วางบิลสิ้นเดือน → กำหนดชำระวันที่ 15 เดือนถัดไป');
});

test('§4 D · AR-015 SO-26090230-0 — งวด 1–2 ขาดวันวางบิล (ทะเบียนชวน) · ถอยจากกำหนดชำระ 30 วัน · ม.ค. 2027 ไม่มีงวด · หมายเหตุไม่ตรงช่อง', () => {
  const rule = REAL_V2['AR-015'];
  assert.deepEqual(SO_D.slice(0, 2).map((r) => ledgerFlags(r, rule, { todayIso: TODAY }).missingBilling), [true, true]);
  assert.deepEqual(SO_D.slice(0, 2).map((r) => billingForDue(rule, r.dueDate).billingDate), ['2026-10-26', '2026-11-25']);
  assert.deepEqual(dueSeriesGaps(SO_D), [{ afterSeq: 2, beforeSeq: 3, missing: ['2027-01'] }]);
  assert.deepEqual(noteDateHints(SO_D[2]), [{ field: 'billing', noted: '2026-12-24', stored: '2027-01-25', days: 32 }]);
  assert.deepEqual(noteDateHints(SO_D[0]), [{ field: 'billing', noted: '2026-10-24', stored: null, days: null }]);
  const back = billingForDue(rule, '2027-01-25');
  assert.equal(back.billingDate, '2026-12-26');
  assert.equal(back.weekend, 'ตรงวันเสาร์', 'เตือน ไม่เลื่อน');
});

test('§4 D · "ต่อจากงวด 2" (กำหนดชำระวันที่ 25) เติมงวด 3–12 ใหม่ = ปิดรู ม.ค. 2027 — ร่างให้คนดู ไม่ลงฐานเอง', () => {
  const rule = REAL_V2['AR-015'];
  const suggestion = creditCadenceSuggestion(SO_D.slice(0, 2));
  assert.deepEqual(suggestion, { fromSeq: 2, dueDay: 25, startMonth: '2027-01' });
  const plan = planDueCadence(rule, SO_D.slice(2), { dueDay: suggestion.dueDay, startMonth: suggestion.startMonth, includeDated: true });
  assert.equal(plan.error, null);
  assert.deepEqual(plan.rows.slice(0, 2).map((r) => [r.seq, r.billingDate, r.dueDate, r.prevDueDate]), [[3, '2026-12-26', '2027-01-25', '2027-02-24'], [4, '2027-01-26', '2027-02-25', '2027-03-27']]);
  assert.deepEqual(dueSeriesGaps([...SO_D.slice(0, 2), ...plan.rows.map((r, i) => ({ ...SO_D[i + 2], dueDate: r.dueDate }))]), []);
});

test('§4 E · AR-622 เดือนจากชื่องวด — ผลของรอมติ ข้อ 4: "ไม่ต้องวางบิล" ได้กำหนดชำระอย่างเดียว · "วางบิล ชำระวันวางบิล" ได้วันวางบิล = กำหนดชำระ · รูปเดิมยึดกำหนดชำระ ไม่มีวันวางบิลปลอม (รอบกรรมการ 29/09)', () => {
  assert.deepEqual(SO_E.map((r) => installmentLabelMonth(r.label)), ['2026-10', '2027-02', '2027-06', '2027-10']);
  const asNone = planDueCadence(NONE, SO_E, { dueDay: 5, startMonth: null });
  assert.deepEqual(asNone.rows.map((r) => [r.billingDate, r.dueDate]), [[null, '2026-10-05'], [null, '2027-02-05'], [null, '2027-06-05'], [null, '2027-10-05']]);
  const same = planDueCadence(SAME_DAY, SO_E, { dueDay: 5, startMonth: null });
  assert.deepEqual(same.rows.map((r) => [r.billingDate, r.dueDate]), [['2026-10-05', '2026-10-05'], ['2027-02-05', '2027-02-05'], ['2027-06-05', '2027-06-05'], ['2027-10-05', '2027-10-05']]);
  const legacy = planDueCadence(LEGACY, SO_E, { dueDay: 5, startMonth: null });
  assert.deepEqual(legacy.rows.map((r) => [r.billingDate, r.dueDate]), [[null, '2026-10-05'], [null, '2027-02-05'], [null, '2027-06-05'], [null, '2027-10-05']], 'รูปเดิม (ระหว่างรอมติข้อ 4) = โหมด free: ตัวเติมไม่ใส่วันวางบิลให้');
  assert.match(planDueCadence(NONE, SO_E, { dueDay: 5 }).error, /เลือกเดือนเริ่ม/, 'ไม่ส่ง = ยังไม่เลือก (ไม่มีค่าตั้งต้น)');
});

test('§4 F · J · AR-638 / AR-903 ไม่ต้องวางบิล — งวดสุดท้าย "ก่อนส่งสินค้า" รอเหตุการณ์ในช่องกำหนดชำระ · ไม่มีกระดิ่ง · ไม่ชวนขอใบวางบิล', () => {
  for (const so of [SO_F, SO_J]) {
    const [first, last] = so;
    assert.equal(billingCellText(last, NONE), NO_BILLING_TEXT);
    assert.equal(dueCellText(last, NONE), 'รอเหตุการณ์ (ก่อนส่งสินค้า)');
    assert.equal(dueSourceOf(NONE, last).key, 'waiting');
    assert.deepEqual(bellsFor(last, NONE, { todayIso: TODAY }), []);
    assert.equal(canRequestBilling(last, NONE), false);
    assert.equal(billingState(first, NONE, { todayIso: TODAY }).key, 'settled');
  }
  assert.equal(dueCellText(SO_F[1], SAME_DAY), '—', 'ต้องวางบิล: เหตุการณ์อยู่ช่องวันวางบิล');
  assert.equal(billingCellText(SO_F[1], SAME_DAY), 'รอเหตุการณ์ (ก่อนส่งสินค้า)');
});

test('§4 G · AR-711 ยังไม่ระบุ — ตั้งได้ทั้งสองช่อง ไม่มีอะไรคิดให้ · ถาม "ต้องวางบิลไหม" · ไม่ชวนเติมวันวางบิล · ได้กระดิ่งครบกำหนดเมื่อมีกำหนดชำระ', () => {
  assert.deepEqual(dateModeOf(null), { kind: 'free', views: ['bill', 'due', 'event'], start: 'due', lead: 'due', billingColumn: 'optional', askNeed: true, override: null });
  assert.equal(ledgerFlags(SO_G[1], null, { todayIso: TODAY }).missingBilling, false);
  assert.equal(billingForDue(null, '2026-10-30'), null);
  const withDue = { ...SO_G[1], dueDate: '2026-09-30' };
  assert.deepEqual(bellsFor(withDue, null, { todayIso: TODAY }).map((b) => b.kind), [BELL.DUE_SOON]);
});

test('§4 I · AR-035 วันจ่ายพุธที่ 2,4 + เครดิต 30 — รอบ ต.ค.–ธ.ค. · ชิปวันจันทร์ที่ทันรอบ · ถอยจากวันจ่าย · ไม่ใช่วันจ่าย = สองทางให้เลือก', () => {
  assert.deepEqual(payRuns(I, '2026-10-01', '2026-12-31').filter((r) => r.cutoff >= '2026-10-01' && r.cutoff <= '2026-12-31').map((r) => r.pay),
    ['2026-10-14', '2026-10-28', '2026-11-11', '2026-11-25', '2026-12-09', '2026-12-23']);
  assert.equal(dueDateForBilling(I, '2026-09-28'), '2026-10-28');
  assert.equal(dueDateForBilling(I, '2026-09-29'), '2026-11-11');
  assert.deepEqual(billingChoices(I, TODAY, 3, { holidays: HOLIDAYS_2026 }).map((c) => [c.billingDate, c.dueDate]),
    [['2026-09-28', '2026-10-28'], ['2026-10-12', '2026-11-11'], ['2026-10-26', '2026-11-25']]);
  assert.deepEqual(billingForDue(I, '2026-11-11', { holidays: HOLIDAYS_2026 }), { billingDate: '2026-10-12', dueDate: '2026-11-11', source: 'rule', weekend: '', exact: true, next: null });
  const off = billingForDue(I, '2026-11-18', { holidays: HOLIDAYS_2026 });
  assert.deepEqual([off.exact, off.billingDate, off.dueDate, off.next.billingDate, off.next.dueDate], [false, '2026-10-12', '2026-11-11', '2026-10-26', '2026-11-25']);
  assert.equal(describeRule(I), 'วางบิลได้ทุกวัน · เครดิต 30 วัน แล้วจ่ายวันพุธที่ 2 และ 4 ของเดือน');
  assert.deepEqual(slotLabels(I), ['วันพุธที่ 2', 'วันพุธที่ 4']);
  const last = R({ billing: { mode: 'anyday' }, creditDays: 0, runs: { kind: 'weekday', weekday: 5, nths: [4, 5] } });
  assert.deepEqual(payRuns(last, '2026-10-01', '2026-10-31').filter((r) => r.cutoff.startsWith('2026-10')).map((r) => r.pay), ['2026-10-23', '2026-10-30'], 'ต.ค. 2026 มีศุกร์ 5 ตัว');
  assert.deepEqual(payRuns(last, '2026-09-01', '2026-09-30').filter((r) => r.cutoff.startsWith('2026-09')).map((r) => r.pay), ['2026-09-25'], 'ก.ย. 2026 ศุกร์ที่ 4 = ศุกร์สุดท้าย นับรอบเดียว');
});

test('§4 K · AR-730 เลยกำหนดแล้ว ไม่มีวันวางบิล — วันนี้ (รูปเดิม) ไม่ชวน · ถ้าข้อ 4 = ตามหลักฐาน (ต้องวางบิล) ทะเบียนชวน + วันวางบิลถอยได้วันเดียวกัน', () => {
  const [row] = SO_K;
  assert.equal(dueState(row, { todayIso: TODAY }).key, 'late');
  assert.equal(ledgerFlags(row, LEGACY, { todayIso: TODAY }).missingBilling, false);
  assert.equal(ledgerFlags(row, SAME_DAY, { todayIso: TODAY }).missingBilling, true);
  assert.equal(billingForDue(SAME_DAY, row.dueDate).billingDate, '2026-09-25');
  assert.equal(ledgerFlags(row, NONE, { todayIso: TODAY }).missingBilling, false);
});

test('§4 L · M — หมายเหตุพิมพ์วันไม่ตรงช่อง: AR-885 งวด 3 "14/11/2569" แต่กำหนดชำระ 14 ต.ค. · AR-015 SO-26090206-0 "วางบิล 24/09/2026" ช่องว่าง', () => {
  assert.deepEqual(noteDateHints(SO_L[1]), []);
  assert.deepEqual(noteDateHints(SO_L[2]), [{ field: 'due', noted: '2026-11-14', stored: '2026-10-14', days: -31 }]);
  assert.equal(dueSourceOf(NONE, SO_L[2]).key, 'direct', 'ไม่ต้องวางบิล: กำหนดชำระไม่มีป้ายที่มา');
  const m1 = inst(1, { label: 'งวดที่ 1', dueDate: '2026-10-25', note: 'เครดิต 30 วัน วางบิล 24/09/2026' });
  assert.deepEqual(noteDateHints(m1), [{ field: 'billing', noted: '2026-09-24', stored: null, days: null }]);
  assert.equal(billingForDue(REAL_V2['AR-015'], m1.dueDate).billingDate, '2026-09-25', 'ถอยตามเครดิตได้ 25 ก.ย. — หมายเหตุเขียน 24 · จอโชว์ทั้งสอง ไม่เลือกให้');
});

/* ═══ §5 · ถอยจากกำหนดชำระ ═══════════════════════════════════════════════════════════════════════ */

test('§5 ⭐ ถอยจากกำหนดชำระ — ทุกชิปของทุก fixture ย้อนกลับได้วันวางบิลที่ dueFor ให้กำหนดชำระเดิมพอดี', () => {
  const fixtures = { B, C, H, I, credit0: meemetta(0), credit30: meemetta(30), AR281: REAL_V2['AR-281'], monthlyCredit: R({ billing: { mode: 'monthly', days: [10, 25] }, creditDays: 30, runs: null }) };
  for (const [name, rule] of Object.entries(fixtures)) {
    for (const chip of billingChoices(rule, TODAY, 12, { holidays: HOLIDAYS_2026 })) {
      const back = billingForDue(rule, chip.dueDate, { holidays: HOLIDAYS_2026 });
      assert.equal(back.exact, true, `${name} ${chip.dueDate}`);
      assert.equal(dueDateForBilling(rule, back.billingDate), chip.dueDate, `${name} ${chip.dueDate}`);
      assert.ok(back.billingDate >= chip.billingDate, `${name}: วันวางบิลที่ช้าที่สุดที่ยังทัน`);
    }
  }
});

test('§5 มีเมตตา — กำหนดชำระที่ไม่ใช่วันจ่าย (25 พ.ย.) ได้สองทาง: วางบิล 9 ต.ค. → 16 พ.ย. หรือ 21 ต.ค. → 30 พ.ย. · ไม่ต้องวางบิล/ยังไม่ตั้งรอบ = ไม่มีวันวางบิลให้', () => {
  const off = billingForDue(meemetta(30), '2026-11-25', { holidays: HOLIDAYS_2026 });
  assert.deepEqual([off.exact, off.billingDate, off.dueDate, off.next.billingDate, off.next.dueDate], [false, '2026-10-09', '2026-11-16', '2026-10-21', '2026-11-30']);
  assert.equal(billingForDue(meemetta(0), '2026-10-30').billingDate, '2026-10-21');
  assert.deepEqual(billingForDue(NONE, '2026-10-30'), { billingDate: null, dueDate: '2026-10-30', exact: true, source: 'none', weekend: '', reason: 'notNeeded' });
  assert.equal(billingForDue(NO_TIMING, '2026-10-30'), null);
});

/* ═══ §6 · ตัวเติม ═══════════════════════════════════════════════════════════════════════════════ */

test('§6 เติมตามรอบ (มีเมตตา 12 งวด รอบปลายเดือน) — 3 งวดตามปฏิทิน + 9 ประมาณการ · ประมาณการได้รอยให้ API เขียน · ต้องเลือกรอบก่อน', () => {
  const rows = Array.from({ length: 12 }, (_, i) => inst(i + 1));
  assert.match(planFill(meemetta(0), rows, TODAY).error, /เลือกก่อนว่าจะใช้รอบไหน/);
  const plan = planFill(meemetta(0), rows, TODAY, { slot: 1 });
  assert.equal(plan.error, null);
  assert.deepEqual(plan.rows.slice(0, 3).map((r) => [r.billingDate, r.dueDate, r.source]), [['2026-10-21', '2026-10-30', 'calendar'], ['2026-11-20', '2026-11-30', 'calendar'], ['2026-12-22', '2026-12-30', 'calendar']]);
  assert.deepEqual(plan.rows.slice(3).map((r) => r.source), Array(9).fill('estimate'));
  assert.deepEqual(plan.rows.map((r) => dueEstimatedAsFor(meemetta(0), r)), [null, null, null, ...plan.rows.slice(3).map((r) => r.dueDate)]);
  const stop = planFill(meemetta(0), rows, TODAY, { slot: 1, fallback: 'none' });
  assert.equal(stop.rows.length, 3);
  assert.equal(stop.reason, 'calendarMissing');
  const redate = planRedate(B, [inst(1, { billingDate: '2026-10-05', dueDate: '2026-10-25' }), inst(2, { billingDate: '2026-10-20', dueDate: '2026-11-25' }), inst(3, { billingDate: '2026-12-01', dueDate: '2026-12-01' })], TODAY, { requestedIds: new Set(['i1']) });
  assert.deepEqual(redate.rows.map((r) => [r.seq, r.billingDate, r.dueDate]), [[2, '2026-11-05', '2026-11-25'], [3, '2026-12-05', '2026-12-25']], 'ขอใบแล้วไม่แตะ · งวดหลังไม่ย้อนมาก่อน');
  assert.match(planRedate(NONE, [inst(1)], TODAY).error, /ไม่ต้องวางบิล/);
});

test('§6 ตัวเติมเลือกตามแบบของลูกค้า — มีรอบใช้ "เติมตามรอบ" · ที่เหลือยึดกำหนดชำระ · ไม่ต้องวางบิลไม่มีวันวางบิล · ตัวเติมไม่ล้างวันวางบิลเดิมเงียบ ๆ', () => {
  assert.equal(fillKindOf(meemetta(30)), 'rounds');
  assert.equal(fillKindOf(I), 'rounds');
  for (const rule of [NONE, null, NO_TIMING, SAME_DAY, CREDIT30, LEGACY]) assert.equal(fillKindOf(rule), 'cadence', JSON.stringify(rule));
  assert.match(planFill(NONE, [inst(1)], TODAY).error, /ไม่ต้องวางบิล/);
  assert.match(planFill(NO_TIMING, [inst(1)], TODAY).error, /ยังไม่ตั้งรอบ/);
  assert.match(planFill(CREDIT30, [inst(1)], TODAY).error, /เดือนละงวด/);
  assert.match(planDueCadence(meemetta(30), [inst(1)], { dueDay: 25, startMonth: '2026-10' }).error, /เติมตามรอบ/);
  const legacyBill = inst(2, { billingDate: '2026-10-05', dueDate: '2026-10-05' });
  const plan = planDueCadence(NONE, [inst(1), legacyBill], { dueDay: 25, startMonth: '2026-10', includeDated: true });
  assert.deepEqual(plan.rows.map((r) => [r.seq, r.billingDate, r.dueDate]), [[1, null, '2026-10-25'], [2, '2026-10-05', '2026-11-25']]);
});

/* ═══ §7 · ที่มา + ประมาณการค้าง ════════════════════════════════════════════════════════════════════ */

test('§7 ป้ายที่มา (derived) — ตามปฏิทินลูกค้า · ตามรอบ · ตามเครดิต N วัน · ชำระวันวางบิล · แก้ทับ · ใส่เอง · ไม่ต้องวางบิลไม่มีป้าย · ยังไม่มีกำหนดชำระ', () => {
  const at = (bill, due, over = {}) => inst(1, { billingDate: bill, dueDate: due, ...over });
  assert.equal(dueSourceOf(meemetta(30), at('2026-10-21', '2026-11-30')).label, 'ตามปฏิทินลูกค้า');
  assert.equal(dueSourceOf(B, at('2026-10-05', '2026-10-25')).label, 'ตามรอบ');
  assert.equal(dueSourceOf(CREDIT30, at('2026-10-05', '2026-11-04')).label, 'ตามเครดิต 30 วัน');
  assert.equal(dueSourceOf(SAME_DAY, at('2026-10-05', '2026-10-05')).label, 'ชำระวันวางบิล');
  assert.equal(dueSourceOf(LEGACY, at('2026-10-05', '2026-10-05')).label, 'ชำระวันวางบิล');
  assert.deepEqual(dueSourceOf(CREDIT30, at('2026-10-05', '2026-11-10')), { key: 'override', label: 'แก้ทับ', computed: '2026-11-04' });
  assert.equal(dueSourceOf(CREDIT30, at(null, '2026-11-10')).label, 'ใส่เอง');
  assert.equal(dueSourceOf(null, at('2026-10-05', '2026-11-10')).label, 'ใส่เอง');
  assert.deepEqual(dueSourceOf(NONE, at(null, '2026-11-10')), { key: 'direct', label: '' });
  assert.deepEqual(dueSourceOf(CREDIT30, at('2026-10-05', null)), { key: 'missing', label: '', computed: '2026-11-04', source: 'credit' });
});

test('§7 ⭐ ประมาณการค้างหลังปฏิทินจริงมา — รอยเก็บวันประมาณการ · ปฏิทินให้วันอื่น = "ประมาณการ" ที่ต้องเสนอใหม่ แม้เคยกดข้าม · ให้วันเดิม = ตามปฏิทิน · ทางเขียนอื่นแก้วันแล้วรอยไม่โกหก', () => {
  const before = meemetta(0);
  const row = inst(1, { billingDate: '2027-01-20', dueDate: '2027-01-30' });
  assert.equal(dueFor(before, row.billingDate).source, 'estimate');
  const saved = { ...row, dueEstimatedAs: dueEstimatedAsFor(before, row) };
  assert.equal(saved.dueEstimatedAs, '2027-01-30');
  assert.equal(dueSourceOf(before, saved).key, 'estimate');
  assert.equal(ledgerFlags(saved, before, { todayIso: TODAY }).estimate, true);
  const jan2027 = { runs: [{ cutoff: '2027-01-08', pay: '2027-01-15' }, { cutoff: '2027-01-22', pay: '2027-01-29' }] };
  const after = meemetta(0, { 2026: { runs: MEEMETTA_2026 }, 2027: jan2027 });
  assert.deepEqual(dueSourceOf(after, saved), { key: 'estimateStale', label: 'ประมาณการ · ปฏิทินลูกค้าให้วันอื่น', computed: '2027-01-29', source: 'calendar' }, 'ป้ายของตัวเอง + computed ให้แตะ "ใช้วันตามปฏิทิน"');
  assert.notEqual(dueSourceOf(after, saved).label, dueSourceOf(before, saved).label, 'ประมาณการค้างต้องดูต่างจากประมาณการปกติ');
  const change = planRuleChange(before, after, [saved]);
  assert.deepEqual(change.rows.map((r) => [r.change, r.prevDueDate, r.dueDate, r.source]), [['newDue', '2027-01-30', '2027-01-29', 'calendar']]);
  const again = planRuleChange(after, after, [saved]);
  assert.equal(again.rows.length, 1, 'กดข้ามไปก่อน — บันทึกรอบครั้งต่อไปยังเสนองวดนี้ (รอยยังอยู่)');
  const same = meemetta(0, { 2026: { runs: MEEMETTA_2026 }, 2027: { runs: [{ cutoff: '2027-01-22', pay: '2027-01-30' }] } });
  assert.equal(dueSourceOf(same, saved).label, 'ตามปฏิทินลูกค้า');
  const touched = { ...saved, dueDate: '2027-02-01' };
  assert.equal(isEstimate(touched), false);
  assert.equal(dueSourceOf(before, touched).key, 'override');
  assert.equal(dueEstimatedAsFor(before, { billingDate: '2026-10-21', dueDate: '2026-10-30' }), null, 'วันจากปฏิทินจริงไม่มีรอย');
  /* รอบกรรมการ 29/09: ยืนยันวันประมาณการกับลูกค้าแล้ว = ไม่มีรอย → หลุดจากตัวกรอง FN · ป้ายบอกว่ายืนยันแล้ว · ปฏิทินจริงมาให้วันอื่น = แก้ทับ (มีวันตามปฏิทินให้แตะ) */
  const confirmed = { ...row, dueEstimatedAs: dueEstimatedAsFor(before, { ...row, estimateConfirmed: true }) };
  assert.equal(confirmed.dueEstimatedAs, null);
  assert.equal(ledgerFlags(confirmed, before, { todayIso: TODAY }).estimate, false, 'หลุดจาก ?billing=estimate');
  assert.deepEqual(dueSourceOf(before, confirmed), { key: 'estimateConfirmed', label: 'ประมาณการ · ยืนยันกับลูกค้าแล้ว', source: 'estimate' });
  assert.deepEqual(dueSourceOf(after, confirmed), { key: 'override', label: 'แก้ทับ', computed: '2027-01-29' });
});

/* ═══ §8 · กติกาลูกค้าเปลี่ยน ════════════════════════════════════════════════════════════════════════ */

test('§8 ต้องวางบิล → ไม่ต้องวางบิล — เสนอ "ล้างวันวางบิล" (คงกำหนดชำระ) · ขอใบแล้ว/แจ้งชำระแล้วไม่แตะ · ไม่มีอะไรลงฐานเอง', () => {
  const rows = [
    inst(1, { billingDate: '2026-10-26', dueDate: '2026-11-25' }),
    inst(2, { billingDate: '2026-11-25', dueDate: '2026-12-25' }),
    inst(3, { billingDate: '2026-09-01', dueDate: '2026-10-01', status: 'reported' }),
    inst(4, { dueDate: '2027-01-25' }),
  ];
  const snapshot = JSON.stringify(rows);
  const plan = planRuleChange(CREDIT30, NONE, rows, { requestedIds: new Set(['i2']) });
  assert.deepEqual(plan.rows.map((r) => [r.seq, r.change, r.billingDate, r.dueDate]), [[1, 'clearBilling', null, '2026-11-25']]);
  assert.deepEqual(plan.kept, [{ id: 'i2', seq: 2, reason: 'requested' }]);
  assert.equal(JSON.stringify(rows), snapshot);
});

test('§8 ไม่ต้อง/ไม่รู้ → ต้องวางบิล — เครดิต 30 ถอยได้ทุกงวด · ปฏิทิน: ตรงวันจ่าย = เสนอ · ไม่ตรง = สองทาง ไม่เลือกให้', () => {
  const rows = [inst(1, { dueDate: '2026-11-25' }), inst(2, { dueDate: '2026-11-30' }), inst(3, { billingEvent: 'ก่อนส่งสินค้า' })];
  assert.deepEqual(planRuleChange(NONE, CREDIT30, rows).rows.map((r) => [r.seq, r.change, r.billingDate, r.dueDate]), [[1, 'addBilling', '2026-10-26', '2026-11-25'], [2, 'addBilling', '2026-10-31', '2026-11-30']]);
  const cal = planRuleChange(null, meemetta(30), rows, { holidays: HOLIDAYS_2026 });
  assert.deepEqual(cal.rows.map((r) => [r.seq, r.billingDate, r.dueDate]), [[2, '2026-10-21', '2026-11-30']]);
  assert.deepEqual(cal.kept, [{ id: 'i1', seq: 1, reason: 'dueNotOnRound', dueDate: '2026-11-25', earlier: { billingDate: '2026-10-09', dueDate: '2026-11-16' }, later: { billingDate: '2026-10-21', dueDate: '2026-11-30', source: 'calendar', weekend: '' } }]);
  assert.deepEqual(planRuleChange(NONE, NO_TIMING, rows).rows, [], 'ต้องวางบิลแต่ยังไม่ตั้งรอบ — ไม่มีอะไรคิดให้ (ทะเบียนชวนแทน)');
});

/* ═══ §9 · กระดิ่ง ════════════════════════════════════════════════════════════════════════════════ */

test('§9 ⭐ กระดิ่งครบกำหนดทุกงวดที่มีกำหนดชำระ (รอบกรรมการ 29/09) — มีวันวางบิลก็ได้ · รวมเป็นกระดิ่งเดียวเมื่อวันเดียวกัน · ขอใบแล้วยังเตือนครบกำหนด · รอเหตุการณ์/ชำระแล้ว/ยอด 0 = เงียบ', () => {
  const kinds = (row, rule, opts = {}) => bellsFor(row, rule, { todayIso: TODAY, ...opts }).map((b) => b.kind);
  assert.deepEqual(kinds(inst(1, { dueDate: '2026-09-30' }), NONE), [BELL.DUE_SOON]);
  assert.deepEqual(kinds(inst(1, { dueDate: '2026-10-02' }), NONE), [], 'เกิน 3 วัน');
  assert.deepEqual(kinds(inst(1, { billingDate: '2026-09-30', dueDate: '2026-09-30' }), SAME_DAY), [BELL.BILLING_DUE], 'ชำระวันวางบิล = กระดิ่งเดียว');
  assert.equal(bellsFor(inst(1, { billingDate: '2026-09-30', dueDate: '2026-09-30' }), SAME_DAY, { todayIso: TODAY })[0].sameDayDue, true);
  assert.deepEqual(kinds(inst(1, { billingDate: '2026-09-30', dueDate: '2026-09-30' }), SAME_DAY, { requested: true }), [BELL.DUE_SOON], 'ขอใบแล้ว ≠ ได้เงิน — ยังเตือนครบกำหนด');
  assert.deepEqual(kinds(inst(1, { billingDate: '2026-08-31', dueDate: '2026-09-30' }), CREDIT30), [BELL.DUE_SOON], 'เครดิต 30: วันวางบิลผ่านไปแล้ว ยังได้กระดิ่งก่อนเงินเข้า');
  assert.deepEqual(kinds(inst(1, { billingDate: '2026-09-30', dueDate: '2026-10-30' }), CREDIT30), [BELL.BILLING_DUE]);
  assert.deepEqual(kinds(inst(1, { billingDate: '2026-10-28', dueDate: '2026-09-29' }), CREDIT30), [BELL.DUE_SOON], 'สองวันต่างกัน สองกระดิ่งคนละเรื่อง');
  assert.deepEqual(kinds(inst(1, { billingEvent: 'ก่อนส่งสินค้า' }), NONE), []);
  assert.deepEqual(kinds(inst(1, { billingEvent: 'ก่อนส่งสินค้า', dueDate: '2026-09-29' }), NONE), [], 'แถวเก่ามีทั้งเหตุการณ์และวัน = รอเหตุการณ์ชนะ (CHECK ฐานยังไม่ใส่)');
  assert.equal(dueState(inst(1, { billingEvent: 'ก่อนส่งสินค้า', dueDate: '2026-09-01' }), { todayIso: TODAY }).key, 'waiting', 'ไม่ขึ้นแดง');
  assert.deepEqual(kinds(inst(1, { dueDate: '2026-09-30', status: 'reported' }), NONE), []);
  assert.deepEqual(kinds(inst(1, { dueDate: '2026-09-30', amount: 0 }), NONE), []);
  const missing = bellsFor(inst(1, { dueDate: '2026-09-29' }), CREDIT30, { todayIso: TODAY });
  assert.deepEqual(missing.map((b) => [b.kind, b.key, b.missingBilling, b.days, b.ledgerHref]), [[BELL.DUE_SOON, 'due_soon:i1:2026-09-29', true, 1, LEDGER_HREF.dueSoon]]);
  assert.equal(bellsFor(inst(1, { dueDate: '2026-09-29' }), LEGACY, { todayIso: TODAY })[0].missingBilling, false);
  assert.equal(bellsFor(inst(1, { dueDate: '2026-09-29', billingSkip: true }), CREDIT30, { todayIso: TODAY })[0].missingBilling, false, 'ติ๊กงวดนี้ไม่ต้องวางบิล = ไม่ต่อท้าย "ยังไม่มีวันวางบิล"');
  assert.equal(bellsFor(inst(1, { billingDate: '2026-09-30' }), CREDIT30, { todayIso: TODAY })[0].key, 'billing_due:i1:2026-09-30', 'กุญแจเดิมของ prod');
});

test('§9 กระดิ่งวันตัดรอบผ่าน bellsFor — มีเมตตาเครดิต 0: อ. 20 ต.ค. "พรุ่งนี้ … ส่งเอกสารก่อน 16:00 น." · เครดิต 30: วันสุดท้ายที่ทันรอบ ไม่พูด 16:00', () => {
  const row = inst(1, { billingDate: '2026-10-21', dueDate: '2026-10-30' });
  const bells = bellsFor(row, meemetta(0), { todayIso: '2026-10-20', holidays: HOLIDAYS_2026, customer: 'บริษัท มีเมตตา จำกัด' });
  assert.deepEqual(bells.map((b) => b.kind), [BELL.BILLING_DUE, BELL.BILLING_CUTOFF]);
  assert.equal(bells[1].text, 'พรุ่งนี้ (พ. 21 ต.ค.) เป็นวันตัดรอบของ บริษัท มีเมตตา จำกัด — ส่งเอกสารก่อน 16:00 น.');
  assert.equal(bells[1].ledgerHref, '/finance/payments?billing=cutoff&on=2026-10-21', 'รอบกรรมการ 29/09: กระดิ่งวันตัดรอบพาไปทะเบียนที่กรองวันตัดรอบนั้น');
  const c30 = cutoffBell(meemetta(30), '2026-10-21', '2026-10-21', { holidays: HOLIDAYS_2026, customer: 'มีเมตตา' });
  assert.equal(c30.text, 'วันนี้เป็นวันสุดท้ายที่วางบิล มีเมตตา แล้วทันรอบจ่าย จ. 30 พ.ย.');
  assert.equal(cutoffBell(meemetta(0), '2027-01-20', '2027-01-21'), null, 'ประมาณการไม่ยิง');
});

test('§9 กระดิ่งที่ลูกค้าแต่ละแบบมีได้ + ปฏิทินปีหน้า (ข้อเสนอรอมติ ข้อ 3: 1 ธ.ค. หรือ 30 วันก่อนวันตัดสุดท้าย)', () => {
  assert.deepEqual(reminderKinds(NONE), [BELL.DUE_SOON]);
  assert.deepEqual(reminderKinds(null), [BELL.BILLING_DUE, BELL.DUE_SOON]);
  assert.deepEqual(reminderKinds(CREDIT30), [BELL.BILLING_DUE, BELL.DUE_SOON]);
  assert.deepEqual(reminderKinds(I), [BELL.BILLING_DUE, BELL.DUE_SOON, BELL.BILLING_CUTOFF]);
  assert.deepEqual(reminderKinds(meemetta(0)), [BELL.BILLING_DUE, BELL.DUE_SOON, BELL.BILLING_CUTOFF, BELL.CALENDAR_MISSING]);
  const st = calendarStatus(meemetta(0), TODAY, { holidays: HOLIDAYS_2026 });
  assert.deepEqual([st.coveredThroughText, st.nextYearMissing, st.remindFrom, st.firstDigest, st.remind], ['ธ.ค. 2026', true, '2026-11-22', '2026-11-23', false]);
  const st30 = calendarStatus(meemetta(30), TODAY, { holidays: HOLIDAYS_2026 });
  assert.deepEqual([st30.lastCoveredBilling, st30.leadBeforeEstimate, st30.firstDigestAlt, st30.leadBeforeEstimateAlt], ['2026-11-22', 0, '2026-10-26', 28]);
  assert.equal(calendarStatus(CREDIT30, TODAY), null);
});

/* ═══ §10 · ย้ายข้อมูล (รอมติ ข้อ 4) ═══════════════════════════════════════════════════════════════ */

const LIST = (s) => s.split(',');
const NC_PREPAID = LIST('AR-018,AR-047,AR-056,AR-088,AR-1021,AR-1026,AR-1034,AR-129,AR-140,AR-147,AR-148,AR-152,AR-158,AR-166,AR-254,AR-284,AR-321,AR-336,AR-337,AR-388,AR-600,AR-792,AR-840,AR-858,AR-859,AR-862,AR-887,AR-892');
const UN_PREPAID = LIST('AR-1014,AR-491,AR-659,AR-732,AR-796,AR-802,AR-812,AR-835,AR-871,AR-898');
const NC_BILLED = LIST('AR-035,AR-112,AR-354,AR-364,AR-386,AR-413,AR-425,AR-622,AR-726,AR-730');
const UN_BILLED = LIST('AR-108,AR-109,AR-267,AR-637');
const NC_INVOICE = LIST('AR-105,AR-352,AR-510');
const UN_INVOICE = LIST('AR-160,AR-635,AR-830');
const EVIDENCE = { billed: new Set([...NC_BILLED, ...UN_BILLED]), prepaid: new Set([...NC_PREPAID, ...UN_PREPAID]) };
const CUSTOMERS_553 = (() => {
  const out = [];
  const add = (arCode, billingRule) => out.push({ id: `c-${arCode}`, arCode, billingRule });
  [...NC_PREPAID, ...NC_BILLED, ...NC_INVOICE].forEach((ar) => add(ar, { credit: false }));
  for (let i = 1; i <= 408; i += 1) add(`AR-NC-${i}`, { credit: false });
  [...UN_PREPAID, ...UN_BILLED, ...UN_INVOICE].forEach((ar) => add(ar, null));
  for (let i = 1; i <= 76; i += 1) add(`AR-UN-${i}`, null);
  for (const [ar, rule] of Object.entries(REAL_V2)) if (ar.startsWith('AR-')) add(ar, rule);
  return out;
})();
const DATED = [...SO_D.filter((r) => r.billingDate).map((r) => ({ ...r, customerId: 'c-AR-015' })), ...SO_A.map((r) => ({ ...r, customerId: 'c-AR-281' }))];

test('§10 ⭐ รอมติ ข้อ 4 ทั้งสี่ทางบนลูกค้า 553 ราย — จำนวนตรง data survey · 11 รายที่ตั้งแล้วไม่ถูกแตะทุกทาง · งวดที่มีวันวางบิล 13 งวดไม่ขวาง', () => {
  assert.equal(CUSTOMERS_553.length, 553);
  assert.equal(DATED.length, 13);
  const expected = {
    1: { none: 542, required: 0, unknown: 0, untouched: 11 },
    2: { none: 0, required: 449, unknown: 93, untouched: 11 },
    3: { none: 38, required: 14, unknown: 490, untouched: 11 },
    4: { none: 0, required: 0, unknown: 542, untouched: 11 },
  };
  for (const option of [1, 2, 3, 4]) {
    const plan = backfillPlan(CUSTOMERS_553, DATED, option, EVIDENCE, { review: ['AR-035', 'AR-622'] });
    assert.deepEqual(plan.counts, expected[option], `ทาง ${option}`);
    assert.deepEqual(plan.blockers, [], `ทาง ${option}`);
    for (const ar of ['AR-015', 'AR-281', 'AR-428']) assert.equal(plan.changes.some((c) => c.arCode === ar), false, `ทาง ${option} ไม่แตะ ${ar}`);
  }
  assert.deepEqual(backfillPlan(CUSTOMERS_553, DATED, 3, EVIDENCE, { review: ['AR-035', 'AR-622'] }).review, ['AR-035', 'AR-622'], 'ทาง 3 ต้องมีคนตรวจ AR-035 (เครดิต 30 + พุธที่ 2,4) กับ AR-622 (รายไตรมาส)');
  assert.deepEqual(backfillPlan(CUSTOMERS_553, DATED, 3, EVIDENCE, { skipArCodes: ['AR-109'] }).counts, { none: 38, required: 13, unknown: 491, untouched: 11 }, 'สหมิตร (เงินนอกระบบ) ไม่แตะ');
  assert.deepEqual(backfillPlan(CUSTOMERS_553, DATED, 1, EVIDENCE, { skipArCodes: ['AR-109'] }).counts, { none: 541, required: 0, unknown: 1, untouched: 11 });
  for (const ar of ['AR-015', 'AR-281']) {
    const c = CUSTOMERS_553.find((x) => x.arCode === ar);
    for (const r of DATED.filter((x) => x.customerId === c.id)) assert.equal(dueSourceOf(c.billingRule, r).key === 'rule' || dueSourceOf(c.billingRule, r).key === 'override', true);
  }
});

test('§10 backfill รายแถว — ทาง 3: เคยขอใบวางบิลจากรูปเดิม = ชำระวันวางบิล (คงเครื่องคิดเดิม) · จากยังไม่ตั้ง = ต้องวางบิลยังไม่ตั้งรอบ · โอนก่อน = ไม่ต้องวางบิล · หมายเหตุติดไป', () => {
  const at = (arCode, billingRule) => backfillRuleFor({ arCode, billingRule }, 3, EVIDENCE).next;
  assert.deepEqual(at('AR-730', { credit: false }), SAME_DAY);
  assert.deepEqual(at('AR-267', null), NO_TIMING);
  assert.deepEqual(at('AR-148', { credit: false, note: 'โอนก่อน' }), { v: 4, need: 'none', note: 'โอนก่อน' });
  assert.equal(at('AR-105', { credit: false }), null, 'ขอแค่ใบแจ้งหนี้ = ยังไม่ระบุ');
  for (const next of [at('AR-730', { credit: false }), at('AR-267', null), at('AR-148', { credit: false })]) {
    assert.equal(normalizeRule(next, { allowLegacy: false }).error, null, 'ทุกค่าที่ backfill เขียนผ่านตัวตรวจรุ่นสี่');
  }
  const blocker = backfillPlan([{ id: 'x', arCode: 'AR-148', billingRule: { credit: false } }], [inst(1, { customerId: 'x', billingDate: '2026-10-05' })], 1, EVIDENCE);
  assert.equal(blocker.blockers.length, 1, 'งวดเปิดที่มีวันวางบิลของลูกค้าที่จะเป็นไม่ต้องวางบิล = หยุดทั้ง migration');
  assert.throws(() => backfillRuleFor({ arCode: 'x', billingRule: null }, 5, EVIDENCE));
  /* รอบกรรมการ 29/09: ด่านหยุดอยู่ใน JS ที่สคริปต์ backfill เรียกก่อน PATCH แถวแรก (ไม่พึ่ง RAISE ของ SQL) */
  assert.deepEqual(backfillGate(blocker).ok, false);
  assert.match(backfillGate(blocker).error, /หยุด: 1 งวด/);
  assert.deepEqual(backfillGate(backfillPlan(CUSTOMERS_553, DATED, 3, EVIDENCE, { skipArCodes: ['AR-109'] })), { ok: true, error: null });
  const c3 = backfillPlan(CUSTOMERS_553, DATED, 3, EVIDENCE, { skipArCodes: ['AR-109'] }).counts;
  assert.match(NEED_BACKFILL_OPTIONS[3], new RegExp(`ต้อง ${c3.required} · ไม่ต้อง ${c3.none} · ยังไม่ระบุ ${c3.unknown}`), 'ตัวเลขชุดเดียวทุกจอ = ข้ามสหมิตร');
  assert.match(NEED_BACKFILL_OPTIONS[1], new RegExp(String(backfillPlan(CUSTOMERS_553, DATED, 1, EVIDENCE, { skipArCodes: ['AR-109'] }).counts.none)));
});

/* ═══ §11 · สัญญาโมดัล ═══════════════════════════════════════════════════════════════════════════ */

test('§11 ⭐ เปิดโมดัลแล้วบันทึกซ้ำ = กติกาเดิม — ทุกรูปรุ่นสี่ + แถวเครดิตจริง 10 ราย (อ่านจากรุ่นสอง แล้วบันทึกเป็นรุ่นสี่)', () => {
  const samples = [NONE, { ...NONE, note: 'โอนก่อน' }, NO_TIMING, SAME_DAY, CREDIT30, B, C, H, I, meemetta(0), meemetta(30),
    R({ billing: { mode: 'anyday' }, creditDays: 30, runs: { kind: 'monthly', rounds: [{ cutoffDay: 25, payDay: 25, payMonthOffset: 0 }] } }),
    R({ billing: { mode: 'monthly', days: [5] }, creditDays: 30, runs: { kind: 'monthly', rounds: [{ cutoffDay: 25, payDay: 25, payMonthOffset: 0 }] } }),
    R({ billing: { mode: 'monthly', days: [10, 25] }, creditDays: 30, runs: null }),
    ...Object.entries(REAL_V2).filter(([ar]) => ar.startsWith('AR-') && ar !== 'AR-281').map(([, raw]) => raw)];
  for (const s of samples) {
    const want = ruleOf(s);
    const got = normalizeRule(ruleFromForm(formOf(s)), { allowLegacy: false });
    assert.equal(got.error, null, JSON.stringify(s));
    assert.deepEqual(got.rule, want, JSON.stringify(s));
  }
  assert.equal(ruleFromForm({ need: null }), null, 'ยังไม่ตอบ = บันทึกไม่ได้');
  assert.match(normalizeRule(ruleFromForm({ need: 'required', bill: 'calendar', calPay: null, calendar: { years: { 2026: MEEMETTA_2026 } } }), { allowLegacy: false }).error, /เครดิต/, 'ปฏิทิน: รอบเดียวกัน/ครบเครดิต ไม่มีค่าตั้งต้น (รอมติ ข้อ 1)');
});

test('§11 AR-281 รูปผ่อนปรน — โมดัลบอก legacy · บันทึกซ้ำเป็นแบบวันตัดรอบ · ชิปวันที่ 21 และ SO-26090229-0 ไม่เปลี่ยน · วันนอกรอบที่เปลี่ยนไปเข้าจอยืนยัน', () => {
  const form = formOf(REAL_V2['AR-281']);
  assert.equal(form.legacy, true);
  const saved = normalizeRule(ruleFromForm(form), { allowLegacy: false }).rule;
  assert.deepEqual(saved.runs.rounds, [{ cutoffDay: 21, payDay: 30, payMonthOffset: 1 }]);
  assert.equal(dueDateForBilling(saved, '2026-10-21'), '2026-11-30');
  assert.deepEqual(billingChoices(saved, TODAY, 3).map((c) => c.billingDate), billingChoices(REAL_V2['AR-281'], TODAY, 3).map((c) => c.billingDate));
  assert.deepEqual(planRuleChange(REAL_V2['AR-281'], saved, SO_A).rows, []);
  assert.equal(describeRule(REAL_V2['AR-281']), 'วางบิลวันที่ 21 → กำหนดชำระวันที่ 30 เดือนถัดไป');
});

/* ═══ §12 · ความจริงที่ห้ามพัง ════════════════════════════════════════════════════════════════════ */

test('§12 ⭐ กำหนดชำระไม่ถอยหลัง และไม่มาก่อนวันวางบิล — ทุก fixture ทุกวัน 24 เดือน (รวมวันจ่ายรายสัปดาห์ + ปฏิทินข้ามไปประมาณการ)', () => {
  const fixtures = { B, C, H, I, SAME_DAY, CREDIT30, credit0: meemetta(0), credit30: meemetta(30), AR281: REAL_V2['AR-281'], LEGACY };
  for (const [name, rule] of Object.entries(fixtures)) {
    let prev = '';
    for (const day of DAYS_24M) {
      const due = dueDateForBilling(rule, day);
      assert.ok(due, `${name} ${day}`);
      assert.ok(due >= day, `${name} ${day} → ${due}`);
      assert.ok(due >= prev, `${name} ${day} → ${due} ถอยหลังจาก ${prev}`);
      prev = due;
    }
  }
});

test('§12 ไม่ต้องวางบิล/ยังไม่ตั้งรอบ/ยังไม่ระบุ ไม่คิดวันจากวันวางบิล · ไม่มีชิป · คำไม่มี "เครดิต 0 วัน" ที่ไหนเลย', () => {
  for (const [rule, reason] of [[NONE, 'notNeeded'], [NO_TIMING, 'noTiming'], [null, 'unset']]) {
    assert.deepEqual(dueFor(rule, '2026-10-05'), { dueDate: '', source: 'none', reason });
    assert.deepEqual(billingChoices(rule, TODAY, 3), []);
    assert.equal(hasTiming(rule), false);
  }
  const all = [NONE, NO_TIMING, SAME_DAY, CREDIT30, B, C, H, I, meemetta(0), meemetta(30), LEGACY, ...Object.values(REAL_V2)];
  for (const s of all) {
    assert.doesNotMatch(describeRule(s), /เครดิต 0 วัน/);
    assert.doesNotMatch(policyPreview(s, TODAY).text, /เครดิต 0 วัน/);
  }
  assert.equal(describeRule(NONE), NO_BILLING_TEXT);
  assert.equal(describeRule(NO_TIMING), NO_TIMING_TEXT);
  assert.equal(describeRule(SAME_DAY), 'วางบิลได้ทุกวัน · ชำระวันวางบิล');
  assert.equal(sourceLabel('payOnBilling'), 'ชำระวันวางบิล');
});

test('§12 ระบบไม่เลื่อนวันเอง — วันตัดรอบ/วันจ่ายที่ลูกค้าประกาศไม่ถูกปัด · ชิปเครดิต N เป็นวันทำงาน (ระบบเสนอ) · ถอยตามเครดิตตรงเสาร์ = เตือน', () => {
  for (const r of MEEMETTA_2026) {
    assert.equal(dueDateForBilling(meemetta(0), r.cutoff), r.pay, r.cutoff);
    assert.equal(weekendNote(r.cutoff), '');
  }
  assert.equal(dueDateForBilling(meemetta(0), '2026-07-23'), '2026-07-30', 'จ่าย พฤ. 30 ก.ค. ตรงวันเข้าพรรษาของเรา — ไม่ขยับ');
  for (const c of billingChoices(meemetta(30), TODAY, 10, { holidays: HOLIDAYS_2026 })) assert.equal(weekendNote(c.billingDate), '', c.billingDate);
  assert.equal(billingForDue(CREDIT30, '2027-01-25').weekend, 'ตรงวันเสาร์');
});

test('§12 จอสองจุดพูดตรงกัน — ตัวแก้วัน (หน้าสร้าง SO = โหมดตั้งวัน) · ผลก่อนบันทึกในโมดัล', () => {
  assert.deepEqual(dateModeOf(NONE), { kind: 'dueOnly', views: ['due', 'event'], start: 'due', lead: 'due', billingColumn: 'notNeeded', askNeed: false, override: null });
  assert.deepEqual(dateModeOf(LEGACY), { kind: 'free', views: ['bill', 'due', 'event'], start: 'due', lead: 'due', billingColumn: 'optional', askNeed: true, override: null }, 'รอบกรรมการ 29/09: รูปเดิมเปิดที่กำหนดชำระ วันวางบิลไม่บังคับ');
  assert.equal(dateModeOf(NO_TIMING).kind, 'free');
  assert.equal(dateModeOf(NO_TIMING).billingColumn, 'expected', 'ต้องวางบิลแต่ยังไม่ตั้งรอบ = ชวน');
  for (const rule of [NONE, null, LEGACY, NO_TIMING, SAME_DAY, CREDIT30, B, C, I, meemetta(0)]) {
    const m = dateModeOf(rule);
    assert.ok(m.views.includes(m.start), JSON.stringify(rule));
    if (m.views.includes('bill') && m.views.includes('due')) assert.ok(m.views.indexOf('bill') < m.views.indexOf('due'), 'ลำดับวันวางบิล → กำหนดชำระ (เจ้าของข้อ 4)');
  }
  assert.equal(dateModeOf(meemetta(30)).kind, 'rounds');
  assert.equal(dateModeOf(CREDIT30).kind, 'cadence');
  assert.deepEqual(policyPreview(NONE, TODAY).rows, []);
  assert.match(policyPreview(NONE, TODAY).text, /^ไม่ต้องวางบิล — /);
  assert.deepEqual(policyPreview(meemetta(30), TODAY, { holidays: HOLIDAYS_2026 }).rows.map((r) => [r.billingDate, r.dueDate, r.source]),
    [['2026-10-09', '2026-11-16', 'calendar'], ['2026-10-21', '2026-11-30', 'calendar'], ['2026-11-06', '2026-12-15', 'calendar']]);
  assert.deepEqual(policyPreview(CREDIT30, TODAY).rows.map((r) => [r.billingDate, r.dueDate]), [['2026-09-28', '2026-10-28'], ['2026-10-05', '2026-11-04'], ['2026-10-12', '2026-11-11']]);
  assert.equal(fmtDate('2026-09-28'), 'จ. 28 ก.ย. 2026');
  assert.equal(fmtDate(''), '—');
  assert.equal(dateOf('2026-02-31'), null);
});

/* ═══ §13 · ส่วนที่เพิ่มตอนย้ายเข้าแอป (29/09) ═══════════════════════════════════════════════════════════ */
const FIXTURES = JSON.parse(readFileSync(new URL('./billingRuleFixtures.json', import.meta.url), 'utf8'));

test('§13 ⭐ billingRuleFixtures.json (ชุดเดียวกับเทสต์ PGlite ของ mig 0393) — ถูกผ่านตัวตรวจ + ทำซ้ำได้ผลเดิม · ผิดตีกลับด้วยเหตุที่ระบุ', () => {
  assert.ok(FIXTURES.valid.length >= 20 && FIXTURES.invalid.length >= 30, 'ชุดตัวอย่างหายไป — เทสต์นี้ตาบอดแล้ว');
  for (const { name, rule } of FIXTURES.valid) {
    const { rule: out, error } = normalizeRule(rule);
    assert.equal(error, null, name);
    if (rule?.v === 4) {
      const strict = normalizeRule(rule, { allowLegacy: false });
      assert.equal(strict.error, null, `${name} (โหมดบันทึก)`);
      assert.deepEqual(normalizeRule(strict.rule, { allowLegacy: false }).rule, strict.rule, `${name} ทำซ้ำได้ผลเดิม`);
      assert.equal('legacyNoCredit' in strict.rule, false, name);
    } else if (rule) {
      assert.equal(out.v, 4, `${name} อ่านเป็นรุ่นสี่ได้`);
    }
  }
  for (const { name, rule, jsError, allowLegacy = true } of FIXTURES.invalid) {
    const { rule: out, error } = normalizeRule(rule, { allowLegacy });
    assert.equal(out, null, name);
    assert.match(String(error), new RegExp(jsError), name);
  }
});

test('§13 รายชื่อ backfill ในไฟล์ตัวอย่าง = รายชื่อที่เทสต์ §10 พิสูจน์ (สคริปต์อ่านไฟล์นี้ ไม่ใช่รายชื่อพิมพ์ซ้ำ)', () => {
  const b = FIXTURES.backfill;
  assert.deepEqual(b.billed.noCredit, NC_BILLED);
  assert.deepEqual(b.billed.unset, UN_BILLED);
  assert.deepEqual(b.prepaid.noCredit, NC_PREPAID);
  assert.deepEqual(b.prepaid.unset, UN_PREPAID);
  assert.deepEqual(b.invoiceOnly.noCredit, NC_INVOICE);
  assert.deepEqual(b.invoiceOnly.unset, UN_INVOICE);
  assert.deepEqual(b.skipArCodes, ['AR-109']);
  const evidence = { billed: new Set([...b.billed.noCredit, ...b.billed.unset]), prepaid: new Set([...b.prepaid.noCredit, ...b.prepaid.unset]) };
  for (const option of ['1', '3']) {
    const plan = backfillPlan(CUSTOMERS_553, DATED, Number(option), evidence, { skipArCodes: b.skipArCodes, review: b.review });
    assert.deepEqual(plan.counts, b.expectedCounts[option], `ทาง ${option}`);
    assert.deepEqual(backfillGate(plan), { ok: true, error: null });
  }
  assert.match(NEED_BACKFILL_OPTIONS[3], new RegExp(`ต้อง ${b.expectedCounts['3'].required} · ไม่ต้อง ${b.expectedCounts['3'].none} · ยังไม่ระบุ ${b.expectedCounts['3'].unknown}`));
});

test('§13 dateModeOf รายงวด — ข้อยกเว้น "งวดนี้ต้องวางบิล" ได้ช่องวันวางบิลเฉพาะงวดนั้น · งวดติ๊ก "ไม่ต้องวางบิล" มีแต่กำหนดชำระ · ลำดับวันวางบิล → กำหนดชำระคงเดิม', () => {
  const plain = inst(1, { dueDate: '2026-10-20' });
  const excepted = inst(2, { billingDate: '2026-10-05', dueDate: '2026-10-20' });
  assert.equal(dateModeOf(NONE, plain).kind, 'dueOnly');
  assert.equal(dateModeOf(NONE, plain).override, null);
  const pending = dateModeOf(NONE, plain, { exception: true });
  assert.deepEqual([pending.kind, pending.views, pending.start, pending.override], ['exception', ['bill', 'due', 'event'], 'bill', 'billing'], 'กำลังยืนยันผ่านโมดัล = เปิดที่วันวางบิล');
  const saved = dateModeOf(NONE, excepted);
  assert.deepEqual([saved.kind, saved.start, saved.override], ['exception', 'due', 'billing'], 'มีวันวางบิลแล้ว = เปิดที่กำหนดชำระ');
  const skipped = dateModeOf(CREDIT30, inst(3, { dueDate: '2026-10-20', billingSkip: true }));
  assert.deepEqual([skipped.kind, skipped.views, skipped.billingColumn, skipped.override], ['dueOnly', ['due', 'event'], 'skip', 'skip']);
  assert.equal(dateModeOf(CREDIT30, plain).kind, 'cadence', 'งวดปกติ = โหมดของลูกค้า');
  assert.equal(dateModeOf(CREDIT30, excepted).override, null, 'ลูกค้าต้องวางบิลมีวันวางบิล = ไม่ใช่ข้อยกเว้น');
  assert.equal(dateModeOf(LEGACY, plain).kind, 'free');
  for (const m of [pending, saved]) assert.ok(m.views.indexOf('bill') < m.views.indexOf('due'));
});

test('§13 needExceptionActions — "งวดนี้ต้องวางบิล…" เฉพาะลูกค้าไม่ต้องวางบิล · ติ๊ก "ไม่ต้องวางบิล" เฉพาะลูกค้าต้องวางบิลจริง · งวดยกมาไม่มีเมนู', () => {
  const open = inst(1, { dueDate: '2026-10-20' });
  assert.deepEqual(needExceptionActions(open, NONE), { requireBilling: true, skip: false, unskip: false });
  assert.deepEqual(needExceptionActions(open, CREDIT30), { requireBilling: false, skip: true, unskip: false });
  assert.deepEqual(needExceptionActions(inst(2, { dueDate: '2026-10-20', billingSkip: true }), CREDIT30), { requireBilling: false, skip: false, unskip: true });
  assert.deepEqual(needExceptionActions(open, LEGACY), { requireBilling: false, skip: false, unskip: false }, 'รูปเดิม = ยังไม่ชวน (ต้องตอบ "ต้องวางบิลไหม" ก่อน)');
  assert.deepEqual(needExceptionActions(open, null), { requireBilling: false, skip: false, unskip: false });
  assert.equal(needExceptionActions(inst(3, { billingDate: '2026-10-05' }), NONE).requireBilling, false, 'มีวันวางบิลแล้ว = เป็นข้อยกเว้นอยู่แล้ว');
  assert.equal(needExceptionActions(inst(4, { billingEvent: 'ก่อนส่งสินค้า' }), CREDIT30).skip, false, 'รอเหตุการณ์ = ไม่ชวนติ๊ก');
  assert.deepEqual(needExceptionActions(inst(5, { kind: 'opening' }), NONE), { requireBilling: false, skip: false, unskip: false });
});

test('§13 ⭐ ตัวเติมไม่ร่างวันวางบิลให้งวดที่ติ๊ก "ไม่ต้องวางบิล" (ด่านเขียนตีกลับคู่นี้ — ร่างที่บันทึกไม่ได้ = ทางตัน)', () => {
  const rows = [inst(1, { billingSkip: true }), inst(2), inst(3, { billingSkip: true, dueDate: '2026-12-25' })];
  const fill = planFill(B, rows, TODAY);
  assert.deepEqual(fill.rows.map((r) => r.seq), [2]);
  const redate = planRedate(B, [inst(1, { billingSkip: true, dueDate: '2026-10-25' }), inst(2, { billingDate: '2026-12-05', dueDate: '2026-12-25' })], TODAY);
  assert.deepEqual(redate.rows.map((r) => [r.seq, r.billingDate]), [[2, '2026-10-05']]);
  const cadence = planDueCadence(CREDIT30, [inst(1, { billingSkip: true }), inst(2)], { dueDay: 25, startMonth: '2026-10' });
  assert.deepEqual(cadence.rows.map((r) => [r.seq, r.billingDate, r.dueDate]), [[1, null, '2026-10-25'], [2, '2026-10-26', '2026-11-25']]);
  for (const r of cadence.rows) {
    const row = rows.find((x) => x.seq === r.seq) || inst(r.seq);
    assert.equal(validateInstallmentDates(row, { billingDate: r.billingDate, dueDate: r.dueDate, billingSkip: row.billingSkip === true }, CREDIT30), null, `งวด ${r.seq} บันทึกได้`);
  }
});

test('§13 sameRule — "ไม่มีอะไรเปลี่ยน" ของ API: รุ่นสองกับรุ่นสี่ความหมายเดียวกัน = เท่ากัน · รูปเดิมไม่มีเครดิต ≠ ชำระวันวางบิลรุ่นสี่', () => {
  assert.equal(sameRule(REAL_V2['AR-015'], R({ billing: { mode: 'anyday' }, creditDays: 30, runs: null, note: 'นับเครดิตหลังจัดส่งสินค้า' })), true);
  assert.equal(sameRule(LEGACY, SAME_DAY), false, 'ตอบ "ต้องวางบิล" ให้รูปเดิม = เขียน (ไม่ใช่ไม่มีอะไรเปลี่ยน)');
  assert.equal(sameRule(null, null), true);
  assert.equal(sameRule(null, NONE), false);
  assert.equal(sameRule(R({ billing: { mode: 'monthly', days: [25, 10] }, creditDays: 30, runs: null }), R({ billing: { mode: 'monthly', days: [10, 25] }, creditDays: 30, runs: null })), true, 'ลำดับที่คนกดไม่มีความหมาย');
});

test('§13 ด่านเขียนวันตีกลับปีนอกช่วงของ CHECK ฐาน (2000–2100) เป็นภาษาไทย — ไม่ปล่อยให้ 23514 ดิบกลายเป็น 500', () => {
  assert.equal(validateInstallmentDates({}, { dueDate: '2569-10-05' }, CREDIT30), 'ปีของกำหนดชำระผิด', 'พิมพ์ปี พ.ศ.');
  assert.equal(validateInstallmentDates({}, { billingDate: '2202-10-05', dueDate: '2026-10-05' }, CREDIT30), 'ปีของวันวางบิลผิด');
  assert.equal(validateInstallmentDates({}, { billingDate: '2026-10-05', dueDate: '2026-11-04' }, CREDIT30), null);
});

test('§13 ledgerFlags.dueSoon = ชุดของ ?due=soon — กำหนดชำระ 0..3 วัน งวดรอชำระ · รอเหตุการณ์/ชำระแล้ว/ยกมาไม่นับ · รวมงวดที่กระดิ่งถูกรวมกับวันวางบิล', () => {
  const flag = (row, rule = CREDIT30) => ledgerFlags(row, rule, { todayIso: TODAY }).dueSoon;
  assert.equal(flag(inst(1, { dueDate: '2026-09-28' })), true);
  assert.equal(flag(inst(2, { dueDate: '2026-10-01' })), true);
  assert.equal(flag(inst(3, { dueDate: '2026-10-02' })), false, '4 วัน = นอกหน้าต่าง');
  assert.equal(flag(inst(4, { dueDate: '2026-09-27' })), false, 'เลยกำหนดแล้ว = ป้ายแดง ไม่ใช่ใกล้ครบ');
  assert.equal(flag(inst(5, { dueDate: '2026-09-29', status: 'reported' })), false);
  assert.equal(flag(inst(6, { dueDate: '2026-09-29', billingEvent: 'ก่อนส่งสินค้า' })), false, 'รอเหตุการณ์ชนะ');
  assert.equal(flag(inst(7, { dueDate: '2026-09-29' }), NONE), true, 'ลูกค้าไม่ต้องวางบิลก็เตือนครบกำหนด');
  const merged = inst(8, { billingDate: '2026-09-29', dueDate: '2026-09-29' });
  assert.deepEqual(bellsFor(merged, SAME_DAY, { todayIso: TODAY }).map((b) => b.kind), [BELL.BILLING_DUE], 'กระดิ่งรวมเป็นอันเดียว');
  assert.equal(flag(merged, SAME_DAY), true, 'แต่ทะเบียน ?due=soon ยังเห็นงวดนี้');
});

