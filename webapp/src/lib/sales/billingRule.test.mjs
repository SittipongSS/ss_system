// ── กำหนดวางบิล (mig 0389) — logic ล้วน ทดสอบได้โดยไม่แตะ DB ──
//
// สิ่งที่ชุดนี้ล็อกไว้: รอบวางบิล → วันวางบิล/กำหนดชำระ คิดตรงกับตัวอย่างในม็อก (AR-267 · AR-015) ·
// วันที่ 31 = สิ้นเดือน · "เลยรอบวางบิล" ไม่ใช่ "เลยกำหนด" (ไม่มีโทนแดง) · งวดยกมา/รับเงินแล้วไม่ถูกเติม
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BILLING_REMIND_DAYS,
  billingRequestLive,
  billingRoundCount,
  billingRoundLabels,
  billingRuleMonthly,
  billingRuleNoCredit,
  billingRounds,
  billingState,
  billingStateLabel,
  billingStateTone,
  describeBillingRule,
  describeBillingRuleDetail,
  dueDateForBilling,
  formatBillingDate,
  formatRoundChip,
  installmentBillingFillable,
  needsBillingReminder,
  normalizeBillingRule,
  normalizeInstallmentBilling,
  planMonthlyFill,
  planRedate,
  creditCadenceSuggestion,
  installmentLabelMonth,
  planCreditCadence,
  planNoCreditDates,
  weekendNote,
  effectiveBillingRule,
  billingRuleNeedsBillingDate,
  NO_CREDIT_TEXT,
  PAY_ON_BILLING_TEXT,
  creditDaysText,
} from './billingRule.js';

/* AR-267 เจอร์นัล แล็บ: วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25 เดือนเดียวกัน */
const AR267 = { billing: { mode: 'monthly', day: 5 }, payment: { mode: 'monthly', day: 25, monthOffset: 0 } };
/* AR-015 (ม็อก): วางบิลทุกวันที่ 25 · เงินเข้าวันที่ 25 เดือนถัดไป */
const AR015 = { billing: { mode: 'monthly', day: 25 }, payment: { mode: 'monthly', day: 25, monthOffset: 1 } };
const CREDIT30 = { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 30 } };

/* ── normalizeBillingRule ────────────────────────────────────────────── */

test('รอบที่ถูกผ่าน และได้รูปมาตรฐาน (ตัดช่องแปลกปลอมทิ้ง)', () => {
  const { rule, error } = normalizeBillingRule({ ...AR267, extra: 1, note: '  แนบสำเนา PO  ' });
  assert.equal(error, null);
  /* รูปรุ่นแรก (day เดี่ยว) ถูกแปลงเป็นรุ่นสองตอนอ่าน */
  assert.deepEqual(rule, {
    billing: { mode: 'monthly', days: [5] },
    payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }] },
    note: 'แนบสำเนา PO',
  });
});

test('null = ล้างรอบ ไม่ใช่ error · หมายเหตุว่างไม่ถูกเก็บ', () => {
  assert.deepEqual(normalizeBillingRule(null), { rule: null, error: null });
  assert.deepEqual(normalizeBillingRule({ ...CREDIT30, note: '   ' }).rule, CREDIT30);
});

test('ไม่มีค่าตั้งต้น — ไม่เลือกโหมดใด = error ไม่ใช่เดาให้', () => {
  assert.match(normalizeBillingRule({}).error, /วางบิลได้ทุกวัน/);
  assert.match(normalizeBillingRule({ billing: { mode: 'anyday' } }).error, /เงินเข้า/);
});

test('ตัวเลขนอกช่วง/ทศนิยม ถูกตีกลับ · สตริงตัวเลขจากฟอร์มรับได้', () => {
  assert.ok(normalizeBillingRule({ billing: { mode: 'monthly', day: 32 }, payment: CREDIT30.payment }).error);
  assert.ok(normalizeBillingRule({ billing: { mode: 'monthly', day: 5.5 }, payment: CREDIT30.payment }).error);
  assert.ok(normalizeBillingRule({ billing: CREDIT30.billing, payment: { mode: 'credit', days: 366 } }).error);
  assert.ok(normalizeBillingRule({ billing: CREDIT30.billing, payment: { mode: 'monthly', day: 25, monthOffset: 2 } }).error);
  assert.equal(normalizeBillingRule({ billing: { mode: 'monthly', day: '5' }, payment: { mode: 'credit', days: '0' } }).rule.billing.days[0], 5);
});

test('เงินเข้าเดือนเดียวกันแต่ก่อนวันวางบิล = เลือกเดือนผิด → error', () => {
  const r = normalizeBillingRule({ billing: { mode: 'monthly', day: 25 }, payment: { mode: 'monthly', day: 5, monthOffset: 0 } });
  assert.match(r.error, /เดือนถัดไป/);
  assert.equal(normalizeBillingRule({ billing: { mode: 'monthly', day: 25 }, payment: { mode: 'monthly', day: 5, monthOffset: 1 } }).error, null);
});

/* ── describe ────────────────────────────────────────────────────────── */

test('ประโยครอบ — แบบเต็มและแบบย่อ ตรงกับม็อก', () => {
  assert.equal(describeBillingRule(AR267), 'วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25');
  assert.equal(describeBillingRule(AR267, { short: true }), 'วางบิลทุกวันที่ 5 · เงินเข้า 25');
  assert.equal(describeBillingRule(AR015), 'วางบิลทุกวันที่ 25 · เงินเข้าทุกวันที่ 25 เดือนถัดไป');
  assert.equal(describeBillingRule(CREDIT30), 'วางบิลได้ทุกวัน · เครดิต 30 วัน');
  assert.equal(
    describeBillingRule({ billing: { mode: 'monthly', day: 31 }, payment: { mode: 'monthly', day: 15, monthOffset: 1 } }, { short: true }),
    'วางบิลสิ้นเดือน · เงินเข้า 15 เดือนถัดไป',
  );
  assert.equal(describeBillingRule(null), '');
  assert.equal(describeBillingRule({ billing: { mode: 'weekly' } }), '');
  assert.equal(describeBillingRuleDetail(AR267), 'เงินเข้าเดือนเดียวกับวางบิล');
});

/* ── dueDateForBilling / billingRounds ───────────────────────────────── */

test('AR-267 — รอบถัดไป 3 รอบจาก ศ. 25 ก.ย. 2026 ตรงกับม็อก', () => {
  assert.deepEqual(billingRounds(AR267, '2026-09-25'), [
    { billingDate: '2026-10-05', dueDate: '2026-10-25', roundIndex: 0 },
    { billingDate: '2026-11-05', dueDate: '2026-11-25', roundIndex: 0 },
    { billingDate: '2026-12-05', dueDate: '2026-12-25', roundIndex: 0 },
  ]);
});

test('วันวางบิลของเดือนนี้ยังไม่ผ่าน = รอบแรกคือเดือนนี้ (นับวันนี้ด้วย)', () => {
  assert.equal(billingRounds(AR267, '2026-10-05')[0].billingDate, '2026-10-05');
  assert.equal(billingRounds(AR267, '2026-10-01')[0].billingDate, '2026-10-05');
});

test('AR-015 — เงินเข้าเดือนถัดไป · ข้ามปีได้', () => {
  assert.equal(dueDateForBilling(AR015, '2026-12-25'), '2027-01-25');
  assert.deepEqual(billingRounds(AR015, '2026-09-26', 2), [
    { billingDate: '2026-10-25', dueDate: '2026-11-25', roundIndex: 0 },
    { billingDate: '2026-11-25', dueDate: '2026-12-25', roundIndex: 0 },
  ]);
});

test('วันที่ 31 = สิ้นเดือน ทั้งวางบิลและเงินเข้า (ก.พ. ใช้ 28/29)', () => {
  const r = { billing: { mode: 'monthly', day: 31 }, payment: { mode: 'monthly', day: 31, monthOffset: 0 } };
  assert.deepEqual(billingRounds(r, '2027-02-01', 2), [
    { billingDate: '2027-02-28', dueDate: '2027-02-28', roundIndex: 0 },
    { billingDate: '2027-03-31', dueDate: '2027-03-31', roundIndex: 0 },
  ]);
  assert.equal(billingRounds(r, '2028-02-10', 1)[0].billingDate, '2028-02-29');
});

test('เครดิต = วันวางบิล + n วัน · 0 วัน = วันเดียวกัน', () => {
  assert.equal(dueDateForBilling(CREDIT30, '2026-09-25'), '2026-10-25');
  assert.equal(dueDateForBilling({ ...CREDIT30, payment: { mode: 'credit', days: 0 } }, '2026-09-25'), '2026-09-25');
});

test('วางบิลได้ทุกวัน = ไม่มีชิปรอบ (กรอกวันเอง แล้วคิดกำหนดชำระให้)', () => {
  assert.deepEqual(billingRounds(CREDIT30, '2026-09-25'), []);
});

test('วางบิลได้ทุกวัน + เงินเข้ารายเดือน: วางหลังวันเงินเข้า = เลื่อนไปเดือนถัดไป (เงินไม่เข้าก่อนวางบิล)', () => {
  const r = { billing: { mode: 'anyday' }, payment: { mode: 'monthly', day: 25, monthOffset: 0 } };
  assert.equal(dueDateForBilling(r, '2026-10-10'), '2026-10-25');
  assert.equal(dueDateForBilling(r, '2026-10-26'), '2026-11-25');
});

test('ไม่มีรอบ / วันผิด = สตริงว่าง ไม่เดา', () => {
  assert.equal(dueDateForBilling(null, '2026-10-05'), '');
  assert.equal(dueDateForBilling(AR267, '5/10/2026'), '');
  assert.deepEqual(billingRounds(null, '2026-09-25'), []);
});

/* ── planMonthlyFill (ปุ่มเติมตามรอบ เดือนละงวด) ────────────────────── */

const inst = (seq, over = {}) => ({ id: `i${seq}`, seq, status: 'pending', kind: 'regular', amount: 38611.55, ...over });

test('AR-015 12 งวด — ตรงตารางในม็อก: งวด 1–2 คงกำหนดชำระเดิม · งวด 3–12 ได้ทั้งคู่', () => {
  const rows = [
    inst(1, { dueDate: '2026-11-25' }), inst(2, { dueDate: '2026-12-25' }),
    ...Array.from({ length: 10 }, (_, i) => inst(i + 3)),
  ];
  const { rows: plan, error } = planMonthlyFill(AR015, rows, '2026-09-25');
  assert.equal(error, null);
  assert.equal(plan.length, 12);
  assert.deepEqual(plan[0], { id: 'i1', seq: 1, billingDate: '2026-10-25', dueDate: '2026-11-25', keptDue: true });
  assert.deepEqual(plan[2], { id: 'i3', seq: 3, billingDate: '2026-12-25', dueDate: '2027-01-25', keptDue: false });
  assert.deepEqual(plan[11], { id: 'i12', seq: 12, billingDate: '2027-09-25', dueDate: '2027-10-25', keptDue: false });
});

test('ไม่แซงงวดที่มีวันวางบิลแล้ว — เริ่มหลังวันวางบิลล่าสุดในใบ', () => {
  const rows = [inst(1, { billingDate: '2026-11-25' }), inst(2), inst(3)];
  const { rows: plan } = planMonthlyFill(AR015, rows, '2026-09-25');
  assert.deepEqual(plan.map((r) => r.billingDate), ['2026-12-25', '2027-01-25']);
});

test('ข้ามงวดที่รับเงินแล้ว/แจ้งแล้ว/ยกมา/รอเหตุการณ์ · ไม่มีรอบ = error', () => {
  const rows = [
    inst(1, { status: 'confirmed' }), inst(2, { status: 'reported' }), inst(3, { kind: 'opening' }),
    inst(4, { billingEvent: 'หลังติดตั้ง' }), inst(5),
  ];
  assert.deepEqual(planMonthlyFill(AR015, rows, '2026-09-25').rows.map((r) => r.seq), [5]);
  assert.match(planMonthlyFill(CREDIT30, rows, '2026-09-25').error, /ทุกวัน/);
  assert.match(planMonthlyFill(null, rows, '2026-09-25').error, /ยังไม่ตั้ง/);
  assert.ok(planMonthlyFill(AR015, [inst(1, { status: 'confirmed' })], '2026-09-25').error);
});

test('installmentBillingFillable — ตีกลับแล้วยังเติมได้ (เงินยังไม่เข้า)', () => {
  assert.equal(installmentBillingFillable(inst(1, { status: 'rejected' })), true);
  assert.equal(installmentBillingFillable(inst(1, { refundedAt: '2026-09-01T00:00:00Z' })), false);
});

/* ── normalizeInstallmentBilling ──────────────────────────────────────── */

test('เลือกได้อย่างเดียว: วันวางบิล หรือ รอเหตุการณ์', () => {
  assert.deepEqual(normalizeInstallmentBilling({ billingDate: '2026-10-05' }).value, { billingDate: '2026-10-05', billingEvent: null });
  assert.deepEqual(normalizeInstallmentBilling({ billingEvent: ' ก่อนส่งสินค้า ' }).value, { billingDate: null, billingEvent: 'ก่อนส่งสินค้า' });
  assert.deepEqual(normalizeInstallmentBilling({}).value, { billingDate: null, billingEvent: null });
  assert.match(normalizeInstallmentBilling({ billingDate: '2026-10-05', billingEvent: 'x' }).error, /อย่างใดอย่างหนึ่ง/);
  assert.ok(normalizeInstallmentBilling({ billingDate: '05/10/2026' }).error);
  assert.ok(normalizeInstallmentBilling({ billingDate: '2202-10-05' }).error);
  assert.ok(normalizeInstallmentBilling({ billingDate: '2026-02-31' }).error, 'วันที่ไม่มีจริง');
  assert.ok(normalizeInstallmentBilling({ billingDate: '2026-13-01' }).error);
  assert.ok(normalizeInstallmentBilling({ billingEvent: 'x'.repeat(121) }).error);
});

/* ── billingState / reminder ─────────────────────────────────────────── */

const due = (billingDate, over = {}) => inst(1, { billingDate, dueDate: '2026-10-25', ...over });

test('สถานะตามวันนี้ — ตรงกับสถานะ 2/3/5 ของจอ C', () => {
  assert.deepEqual(billingState(due('2026-10-05'), { todayIso: '2026-09-25' }), { key: 'upcoming', days: 10 });
  assert.deepEqual(billingState(due('2026-10-05'), { todayIso: '2026-10-02' }), { key: 'soon', days: 3 });
  assert.deepEqual(billingState(due('2026-10-05'), { todayIso: '2026-10-05' }), { key: 'today', days: 0 });
  assert.deepEqual(billingState(due('2026-10-05'), { todayIso: '2026-10-07' }), { key: 'late', days: -2 });
  assert.equal(billingState(due('2026-10-05'), { todayIso: '2026-10-07', requested: true }).key, 'requested');
});

test('⭐ "เลยรอบวางบิล" ไม่ใช่ "เลยกำหนด" — ไม่มีโทนแดงเลยสักสถานะ', () => {
  for (const key of ['late', 'today', 'soon', 'upcoming', 'requested', 'waiting', 'none', 'settled']) {
    assert.notEqual(billingStateTone({ key }), 'danger');
  }
  assert.equal(billingStateLabel({ key: 'late', days: -2 }), 'เลยรอบวางบิล 2 วัน · ยังไม่ขอใบวางบิล');
  assert.equal(billingStateLabel({ key: 'waiting' }, { billingEvent: 'ก่อนส่งสินค้า' }), 'รอเหตุการณ์ (ก่อนส่งสินค้า)');
});

test('แจ้งชำระแล้ว/รับรองแล้ว/ยกมา = พ้นเรื่องวางบิล', () => {
  assert.equal(billingState(due('2026-10-05', { status: 'reported' }), { todayIso: '2026-10-07' }).key, 'settled');
  assert.equal(billingState(due('2026-10-05', { status: 'confirmed' }), { todayIso: '2026-10-07' }).key, 'settled');
  assert.equal(billingState(inst(1, { kind: 'opening' }), { todayIso: '2026-10-07' }).key, 'carried');
  assert.equal(billingState(inst(1, { billingEvent: 'หลังติดตั้ง' }), { todayIso: '2026-10-07' }).key, 'waiting');
  assert.equal(billingState(inst(1), { todayIso: '2026-10-07' }).key, 'none');
});

test(`กระดิ่ง: หน้าต่าง 0..${BILLING_REMIND_DAYS} วัน เฉพาะงวดรอชำระที่มียอดและยังไม่ขอใบวางบิล`, () => {
  const r = due('2026-10-05');
  assert.equal(needsBillingReminder(r, { todayIso: '2026-10-01' }), false);
  assert.equal(needsBillingReminder(r, { todayIso: '2026-10-02' }), true);
  assert.equal(needsBillingReminder(r, { todayIso: '2026-10-05' }), true);
  assert.equal(needsBillingReminder(r, { todayIso: '2026-10-06' }), false);
  assert.equal(needsBillingReminder(r, { todayIso: '2026-10-02', requested: true }), false);
  assert.equal(needsBillingReminder({ ...r, amount: 0 }, { todayIso: '2026-10-02' }), false);
  assert.equal(needsBillingReminder({ ...r, status: 'rejected' }, { todayIso: '2026-10-02' }), false);
});

/* ── วันที่ภาษาไทย ──────────────────────────────────────────────────── */

test('วันที่ไทยตรงกับม็อก + เตือนเสาร์อาทิตย์', () => {
  assert.equal(formatBillingDate('2026-10-05'), 'จ. 5 ต.ค. 2026');
  assert.equal(formatBillingDate('2026-10-25', { withYear: false }), 'อา. 25 ต.ค.');
  assert.equal(formatRoundChip('2026-12-05'), '5 ธ.ค.');
  assert.equal(weekendNote('2026-12-05'), 'ตรงวันเสาร์');
  assert.equal(weekendNote('2026-10-25'), 'ตรงวันอาทิตย์');
  assert.equal(weekendNote('2026-10-05'), '');
  assert.equal(formatBillingDate(null), '');
});

/* ── "ขอใบวางบิลแล้ว" ─────────────────────────────────────────────────── */

test('ขอใบวางบิลแล้ว = ส่งถึงบัญชีแล้วและยังไม่ถูกยกเลิก — ร่าง/ยกเลิก/หาไม่เจอ = ยังไม่ขอ', () => {
  for (const status of ['pending', 'acknowledged', 'answered', 'closed']) {
    assert.equal(billingRequestLive({ id: 'RQ-1', status }), true, status);
  }
  assert.equal(billingRequestLive({ id: 'RQ-1', status: 'draft' }), false);
  assert.equal(billingRequestLive({ id: 'RQ-1', status: 'cancelled' }), false);
  assert.equal(billingRequestLive(null), false);
  assert.equal(billingRequestLive({ status: 'pending' }), false);
});

/* ── planRedate (ลูกค้าเปลี่ยนรอบ — จัดวันใหม่ทั้งใบ) ─────────────────── */

test('ลูกค้าเปลี่ยนรอบจากวันที่ 25 เป็นวันที่ 10 — งวดที่ยังเปิดได้วันใหม่ทั้งคู่ · โชว์วันเดิมให้เทียบ', () => {
  const next = { billing: { mode: 'monthly', day: 10 }, payment: { mode: 'credit', days: 30 } };
  const rows = [
    inst(1, { billingDate: '2026-10-25', dueDate: '2026-11-25' }),
    inst(2, { billingDate: '2026-11-25', dueDate: '2026-12-25' }),
  ];
  const { rows: plan, error } = planRedate(next, rows, '2026-09-26');
  assert.equal(error, null);
  assert.deepEqual(plan, [
    { id: 'i1', seq: 1, billingDate: '2026-10-10', dueDate: '2026-11-09', prevBillingDate: '2026-10-25', prevDueDate: '2026-11-25' },
    { id: 'i2', seq: 2, billingDate: '2026-11-10', dueDate: '2026-12-10', prevBillingDate: '2026-11-25', prevDueDate: '2026-12-25' },
  ]);
});

test('ไม่แตะงวดที่ขอใบแล้ว/รอเหตุการณ์/แจ้งชำระแล้ว — และงวดหลังจากนั้นไม่ย้อนมาก่อนงวดที่ไม่แตะ', () => {
  const rows = [
    inst(1, { billingDate: '2026-10-25', dueDate: '2026-11-25' }), // ขอใบแล้ว
    inst(2, { billingDate: '2026-10-30', dueDate: '2026-11-30' }),
    inst(3, { billingEvent: 'หลังติดตั้ง' }),
    inst(4, { status: 'reported', billingDate: '2026-12-25' }),
    inst(5),
  ];
  const { rows: plan } = planRedate(AR267, rows, '2026-09-26', { requestedIds: new Set(['i1']) });
  assert.deepEqual(plan.map((r) => [r.seq, r.billingDate]), [[2, '2026-11-05'], [5, '2027-01-05']]);
});

test('วันตรงรอบอยู่แล้ว = ไม่มีอะไรเปลี่ยน · ไม่มีรอบ/วางบิลได้ทุกวัน = error', () => {
  const rows = [inst(1, { billingDate: '2026-10-05', dueDate: '2026-10-25' })];
  assert.match(planRedate(AR267, rows, '2026-09-26').error, /ตรงกับรอบปัจจุบัน/);
  assert.match(planRedate(CREDIT30, rows, '2026-09-26').error, /ทุกวัน/);
  assert.match(planRedate(AR267, [inst(1, { status: 'confirmed' })], '2026-09-26').error, /ไม่มีงวดที่จัดวันใหม่ได้/);
});

/* ── รุ่นสอง (mig 0390 · มติ 26/09): สวิตช์เครดิต + หลายรอบวางบิลต่อเดือน ─────── */

const TWO = {
  billing: { mode: 'monthly', days: [10, 25] },
  payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }, { day: 10, monthOffset: 1 }] },
};

test('ไม่มีเครดิต = รูปของตัวเองตอนเก็บ · อ่านเป็นวางบิลได้ทุกวัน + ชำระวันวางบิล (มติ 28/09 ข้อ 17 · แทน "ทำเหมือนไม่มีรอบ")', () => {
  const { rule, error } = normalizeBillingRule({ credit: false, billing: { mode: 'weekly' }, note: ' ชำระก่อนผลิต ' });
  assert.equal(error, null);
  /* ค่าที่เก็บไม่เปลี่ยน (ไม่มี migration) */
  assert.deepEqual(rule, { credit: false, note: 'ชำระก่อนผลิต' });
  assert.equal(describeBillingRule(rule), 'ไม่มีเครดิต · ชำระวันวางบิล');
  assert.equal(describeBillingRule(rule, { short: true }), 'ไม่มีเครดิต · ชำระวันวางบิล');
  assert.equal(describeBillingRuleDetail(rule), '');
  assert.equal(billingRuleNoCredit(rule), true);
  assert.equal(billingRuleMonthly(rule), false);
  assert.equal(billingRoundCount(rule), 0);
  assert.deepEqual(billingRounds(rule, '2026-09-26'), []);
  /* ⭐ กำหนดชำระ = วันวางบิลเอง (ชำระวันวางบิล) — เดิม '' */
  assert.equal(dueDateForBilling(rule, '2026-10-05'), '2026-10-05');
  /* ไม่มีรอบรายเดือนให้เติม/จัด (เหมือนลูกค้าวางบิลได้ทุกวัน) — ข้อความยังบอกว่าเป็นเรื่องไม่มีเครดิต */
  assert.match(planMonthlyFill(rule, [inst(1)], '2026-09-26').error, /ไม่มีเครดิต/);
  assert.match(planRedate(rule, [inst(1)], '2026-09-26').error, /ไม่มีเครดิต/);
});

test('⭐ effectiveBillingRule — ที่เดียวที่ตัดสินว่าไม่มีเครดิตคิดวันอย่างไร · ส่งผลกลับเข้ามาได้ · ไม่ตั้ง/รูปผิด = null', () => {
  const NO_CREDIT_RULE = { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 0 }, noCredit: true };
  assert.deepEqual(effectiveBillingRule({ credit: false }), NO_CREDIT_RULE);
  assert.deepEqual(effectiveBillingRule({ credit: false, note: 'โอนก่อนส่ง' }), { ...NO_CREDIT_RULE, note: 'โอนก่อนส่ง' });
  /* ส่งผลของตัวเองกลับเข้ามา = รูปเดิม (ผู้เรียกไม่ต้องจำว่าถือค่าดิบหรือค่าที่อ่านแล้ว) */
  const once = effectiveBillingRule({ credit: false, note: 'โอนก่อนส่ง' });
  assert.deepEqual(effectiveBillingRule(once), once);
  assert.equal(describeBillingRule(once), 'ไม่มีเครดิต · ชำระวันวางบิล', 'ธงไม่หลุดเมื่อส่งรูปที่อ่านแล้วเข้าตัวข้อความ');
  assert.equal(billingRuleNoCredit(once), true);
  /* มีเครดิต = รูปมาตรฐานเดิม (ไม่มีธง) · เครดิต 0 ที่ตั้งเองไม่ใช่ "ไม่มีเครดิต" แต่คิดวันเหมือนกัน */
  assert.deepEqual(effectiveBillingRule(CREDIT30), { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 30 } });
  const credit0 = { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 0 } };
  assert.equal(effectiveBillingRule(credit0).noCredit, undefined);
  assert.equal(describeBillingRule(credit0), 'วางบิลได้ทุกวัน · ชำระวันวางบิล');
  assert.equal(dueDateForBilling(credit0, '2026-10-05'), dueDateForBilling({ credit: false }, '2026-10-05'));
  /* ธงที่ติดมากับรอบอื่น (ไม่ใช่รูปของไม่มีเครดิต) ไม่มีผล */
  assert.equal(effectiveBillingRule({ ...CREDIT30, noCredit: true }).noCredit, undefined);
  assert.equal(effectiveBillingRule(null), null);
  assert.equal(effectiveBillingRule({ billing: 'x' }), null);
  /* คำกลาง — ห้ามพูด "เครดิต 0 วัน" */
  assert.equal(NO_CREDIT_TEXT, 'ไม่มีเครดิต · ชำระวันวางบิล');
  assert.equal(PAY_ON_BILLING_TEXT, 'ชำระวันวางบิล');
  for (const value of [{ credit: false }, credit0]) {
    assert.doesNotMatch(describeBillingRule(value), /เครดิต 0 วัน/);
    assert.doesNotMatch(describeBillingRule(value, { short: true }), /เครดิต 0 วัน/);
  }
  /* 🔴 review 28/09: จำนวนวันเครดิตเป็นคำ — ตัวเดียวของประโยครอบ + การ์ด/โมดัลทะเบียนลูกค้า (เดิมการ์ดพิมพ์ "เครดิต 0 วัน" เอง) */
  assert.equal(creditDaysText(0), PAY_ON_BILLING_TEXT);
  assert.equal(creditDaysText(30), 'เครดิต 30 วัน');
  assert.equal(creditDaysText(1), 'เครดิต 1 วัน');
  assert.equal(describeBillingRule({ billing: { mode: 'monthly', days: [10, 25] }, payment: { mode: 'credit', days: 0 } }),
    'วางบิลวันที่ 10 และ วันที่ 25 · ชำระวันวางบิล');
});

test('⭐ งวดที่ขาดวันวางบิลนับเฉพาะรอบรายเดือน/เครดิต — ไม่มีเครดิต/ยังไม่ตั้งไม่นับ (ทะเบียน FN · มติ 28/09)', () => {
  assert.equal(billingRuleNeedsBillingDate(AR267), true);
  assert.equal(billingRuleNeedsBillingDate(CREDIT30), true);
  assert.equal(billingRuleNeedsBillingDate({ credit: false }), false);
  assert.equal(billingRuleNeedsBillingDate(effectiveBillingRule({ credit: false })), false);
  assert.equal(billingRuleNeedsBillingDate(null), false);
});

test('สองรอบต่อเดือน — รอบถัดไปเรียงตามวัน แต่ละรอบใช้วันเงินเข้าของตัวเอง', () => {
  assert.equal(normalizeBillingRule(TWO).error, null);
  assert.deepEqual(billingRounds(TWO, '2026-09-26', 4), [
    { billingDate: '2026-10-10', dueDate: '2026-10-25', roundIndex: 0 },
    { billingDate: '2026-10-25', dueDate: '2026-11-10', roundIndex: 1 },
    { billingDate: '2026-11-10', dueDate: '2026-11-25', roundIndex: 0 },
    { billingDate: '2026-11-25', dueDate: '2026-12-10', roundIndex: 1 },
  ]);
  assert.equal(billingRoundCount(TWO), 2);
  assert.deepEqual(billingRoundLabels(TWO), ['วันที่ 10', 'วันที่ 25']);
  assert.equal(describeBillingRule(TWO), 'วางบิล 10 → เงินเข้า 25 · วางบิล 25 → เงินเข้า 10 เดือนถัดไป');
});

test('สองรอบ เงินเข้าแบบเครดิต/วันเดียวกันทุกรอบ = ประโยคสั้น', () => {
  const credit = { billing: { mode: 'monthly', days: [25, 10] }, payment: { mode: 'credit', days: 30 } };
  assert.deepEqual(normalizeBillingRule(credit).rule.billing.days, [10, 25], 'เรียงวันให้');
  assert.equal(describeBillingRule(credit), 'วางบิลวันที่ 10 และ วันที่ 25 · เครดิต 30 วัน');
  const samePay = { billing: { mode: 'monthly', days: [5, 20] }, payment: { mode: 'monthly', day: 25, monthOffset: 1 } };
  assert.deepEqual(normalizeBillingRule(samePay).rule.payment.rounds, [{ day: 25, monthOffset: 1 }, { day: 25, monthOffset: 1 }], 'รุ่นแรกขยายเป็นทุกรอบ');
  assert.equal(describeBillingRule(samePay), 'วางบิลวันที่ 5 และ วันที่ 20 · เงินเข้าทุกวันที่ 25 เดือนถัดไป');
});

test('เรียงรอบใหม่แล้วคู่เงินเข้าย้ายตาม · วันซ้ำ/เกิน 4 รอบ/เงินเข้าไม่ครบ = error', () => {
  const swapped = normalizeBillingRule({
    billing: { mode: 'monthly', days: [25, 10] },
    payment: { mode: 'monthly', rounds: [{ day: 10, monthOffset: 1 }, { day: 25, monthOffset: 0 }] },
  }).rule;
  assert.deepEqual(swapped, TWO);
  assert.match(normalizeBillingRule({ billing: { mode: 'monthly', days: [5, 5] }, payment: { mode: 'credit', days: 30 } }).error, /ซ้ำ/);
  assert.match(normalizeBillingRule({ billing: { mode: 'monthly', days: [1, 5, 10, 15, 20] }, payment: { mode: 'credit', days: 30 } }).error, /ไม่เกิน 4/);
  assert.match(normalizeBillingRule({ billing: { mode: 'monthly', days: [5, 20] }, payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }] } }).error, /ครบทุกรอบ/);
  assert.match(normalizeBillingRule({
    billing: { mode: 'monthly', days: [10, 25] },
    payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }, { day: 10, monthOffset: 0 }] },
  }).error, /รอบที่ 2 เงินเข้าก่อนวันวางบิล/);
});

test('วันอื่น… ที่ไม่ตรงรอบ ใช้เงินเข้าของรอบที่วันนั้นตกอยู่', () => {
  assert.equal(dueDateForBilling(TWO, '2026-10-12'), '2026-10-25', 'หลังรอบวันที่ 10 = รอบที่ 1');
  assert.equal(dueDateForBilling(TWO, '2026-10-27'), '2026-11-10', 'หลังรอบวันที่ 25 = รอบที่ 2');
  assert.equal(dueDateForBilling(TWO, '2026-10-03'), '2026-11-10', 'ก่อนรอบแรกของเดือน = รอบสุดท้าย (ของเดือนก่อน)');
});

test('เติม/จัดวันใหม่ เดือนละงวด ของลูกค้าหลายรอบ ต้องบอกว่าใช้รอบไหน', () => {
  const rows = [inst(1), inst(2), inst(3)];
  assert.match(planMonthlyFill(TWO, rows, '2026-09-26').error, /2 รอบต่อเดือน/);
  assert.deepEqual(planMonthlyFill(TWO, rows, '2026-09-26', { roundIndex: 1 }).rows.map((r) => [r.billingDate, r.dueDate]), [
    ['2026-10-25', '2026-11-10'], ['2026-11-25', '2026-12-10'], ['2026-12-25', '2027-01-10'],
  ]);
  assert.deepEqual(planRedate(TWO, rows, '2026-09-26', { roundIndex: 0 }).rows.map((r) => r.billingDate), ['2026-10-10', '2026-11-10', '2026-12-10']);
  assert.match(planMonthlyFill(TWO, rows, '2026-09-26', { roundIndex: 5 }).error, /ไม่มีในรอบ/);
});

test('30 กับ 31 ในเดือน 30 วัน = รอบเดียว (ไม่ขึ้นชิปซ้ำ)', () => {
  const r = { billing: { mode: 'monthly', days: [30, 31] }, payment: { mode: 'credit', days: 0 } };
  assert.deepEqual(billingRounds(r, '2026-11-01', 2).map((x) => x.billingDate), ['2026-11-30', '2026-12-30']);
});

/* ── ตัวช่วยเติมวันในโหมดตั้งวัน (แบบ C · มติ 28/09) ─────────────────────── */

test('เดือนจากชื่องวด — อังกฤษ/ไทย/พ.ศ. · ไม่มีปีหรือไม่มีเดือน = ว่าง (ไม่เดา)', () => {
  assert.equal(installmentLabelMonth('1st Installment: October 2026 –'), '2026-10');
  assert.equal(installmentLabelMonth('2nd Installment: February 2027'), '2027-02');
  assert.equal(installmentLabelMonth('งวดที่ 3 ก.พ. 2570'), '2027-02');
  assert.equal(installmentLabelMonth('ชำระ มิถุนายน 2027'), '2027-06');
  assert.equal(installmentLabelMonth('Summary 2026'), '', 'mar ในคำอื่นไม่นับ');
  assert.equal(installmentLabelMonth('งวดสุดท้าย'), '');
  assert.equal(installmentLabelMonth('October'), '');
  assert.equal(installmentLabelMonth('Sept 2026'), '2026-09');
  assert.equal(installmentLabelMonth('งวดที่ 2 มิ.ย. 2027'), '2027-06');
});

test('🔴 review 28/09: ตัวย่อไม่มีจุดที่ซ่อนในคำธรรมดาไม่ชนะชื่อเดือนจริง — ชื่อเต็ม → ย่อมีจุด → ย่อไม่มีจุดที่ยืนเดี่ยว', () => {
  /* ห้าคำที่เจอจริง: รวมค่า/ตามความ (มค) · ลูกค้า (กค) · มีค่า (มีค) · ทรัพย์ (พย) — ข้างชื่อเดือนจริง + ปี */
  assert.equal(installmentLabelMonth('งวดที่ 3 รวมค่าติดตั้ง ธันวาคม 2569'), '2026-12', 'เดิมได้ 2026-01 จาก "มค" ใน "รวมค่า"');
  assert.equal(installmentLabelMonth('ชำระตามความคืบหน้า ก.พ. 2570'), '2027-02');
  assert.equal(installmentLabelMonth('ลูกค้าชำระ มีนาคม 2027'), '2027-03');
  assert.equal(installmentLabelMonth('มีค่าบริการเพิ่ม ต.ค. 2569'), '2026-10');
  assert.equal(installmentLabelMonth('ทรัพย์สิน ส.ค. 2570'), '2027-08');
  /* คำพวกนั้นอยู่ลำพังกับปี = ไม่มีเดือน (ไม่เดา) */
  for (const word of ['รวมค่าติดตั้ง 2569', 'ตามความคืบหน้า 2570', 'ลูกค้าจ่าย 2027', 'มีค่า 2569', 'ทรัพย์สิน 2570']) {
    assert.equal(installmentLabelMonth(word), '', word);
  }
  /* ย่อไม่มีจุดยังใช้ได้เมื่อยืนเดี่ยว (ต้น/ท้ายข้อความ · ช่องว่าง · วงเล็บ · ตัวเลข) — ไล่ตัวถัดไปในข้อความต่อ */
  assert.equal(installmentLabelMonth('งวด 2 มค 2570'), '2027-01');
  assert.equal(installmentLabelMonth('งวด 2 (กพ 2570)'), '2027-02');
  assert.equal(installmentLabelMonth('ลูกค้า กค 2570'), '2027-07', '"กค" ใน "ลูกค้า" ข้ามไป — ตัวที่ยืนเดี่ยวข้างหลังยังนับ');
  /* ชั้นของชื่อก่อนตำแหน่ง · ตัวที่ไม่มีปีตามหลังข้ามไปตัวถัดไป */
  assert.equal(installmentLabelMonth('ม.ค. 2570 (ชำระภายในกุมภาพันธ์)'), '2027-01');
  assert.equal(installmentLabelMonth('งวด 1 มค 2570 · มีนาคม 2570'), '2027-03', 'ชื่อเต็มชนะตัวย่อไม่มีจุด');
});

test('AR-015 เครดิต 30 วัน — ต่อจากงวด 2 กำหนดชำระทุกวันที่ 25 · วันวางบิลย้อน 30 วัน (ไม่เลื่อนไป 24/27)', () => {
  const rows = [
    inst(1, { dueDate: '2026-11-25' }), inst(2, { dueDate: '2026-12-25' }),
    ...Array.from({ length: 10 }, (_, i) => inst(i + 3)),
  ];
  const sug = creditCadenceSuggestion(rows);
  assert.deepEqual(sug, { fromSeq: 2, dueDay: 25, startMonth: '2027-01' });
  const { rows: plan, error } = planCreditCadence(CREDIT30, rows, sug);
  assert.equal(error, null);
  assert.equal(plan.length, 10, 'เติมเฉพาะงวดที่ว่าง (งวด 1–2 มีกำหนดชำระแล้ว)');
  assert.deepEqual(plan[0], { id: 'i3', seq: 3, billingDate: '2026-12-26', dueDate: '2027-01-25', prevBillingDate: null, prevDueDate: null });
  assert.deepEqual(plan[9].dueDate, '2027-10-25');
  assert.ok(plan.every((r) => r.dueDate.endsWith('-25')));
});

test('🔴 review 28/09: วันสุดท้ายของเดือนสั้น ≠ สิ้นเดือน เมื่องวดก่อนพิสูจน์ว่าเป็นวันที่ตายตัว', () => {
  /* 30 ต.ค. · 30 พ.ย. = วันที่ 30 ทุกเดือน (ต.ค. มี 31 วันแต่ลงวันที่ 30) — เดิมเสนอ "สิ้นเดือน" แล้วงวดถัดไปได้ 31 ธ.ค. */
  const thirty = [inst(1, { dueDate: '2026-10-30' }), inst(2, { dueDate: '2026-11-30' }), inst(3)];
  const a = creditCadenceSuggestion(thirty);
  assert.deepEqual(a, { fromSeq: 2, dueDay: 30, startMonth: '2026-12' });
  assert.equal(planCreditCadence(CREDIT30, thirty, a).rows[0].dueDate, '2026-12-30');
  /* 28 ม.ค. · 28 ก.พ. = วันที่ 28 — เดิมได้ 31 มี.ค. */
  const twentyEight = [inst(1, { dueDate: '2027-01-28' }), inst(2, { dueDate: '2027-02-28' }), inst(3)];
  const b = creditCadenceSuggestion(twentyEight);
  assert.deepEqual(b, { fromSeq: 2, dueDay: 28, startMonth: '2027-03' });
  assert.equal(planCreditCadence(CREDIT30, twentyEight, b).rows[0].dueDate, '2027-03-28');
  /* หลักฐานว่าเป็นสิ้นเดือนจริง / ไม่มีหลักฐานขัด = ยังเป็นสิ้นเดือน */
  assert.equal(creditCadenceSuggestion([inst(1, { dueDate: '2026-10-31' }), inst(2, { dueDate: '2026-11-30' })]).dueDay, 31);
  assert.equal(creditCadenceSuggestion([inst(1, { dueDate: '2026-09-30' }), inst(2, { dueDate: '2026-11-30' })]).dueDay, 31,
    '30 ก.ย. เองก็เป็นวันสุดท้ายของเดือน — ไม่ขัด');
  assert.equal(creditCadenceSuggestion([inst(1, { dueDate: '2026-10-15' }), inst(2, { dueDate: '2026-11-30' })]).dueDay, 31,
    'งวดก่อนตกวันอื่น — ไม่ขัด');
});

test('ต่อจากงวดก่อนที่ครบสิ้นเดือน = สิ้นเดือนต่อไป · ไม่มีงวดที่มีวัน = ไม่มีข้อเสนอ', () => {
  assert.equal(creditCadenceSuggestion([inst(1, { dueDate: '2026-11-30' })]).dueDay, 31);
  assert.equal(creditCadenceSuggestion([inst(1)]), null);
  assert.match(planCreditCadence(AR267, [inst(1)], { dueDay: 25, startMonth: '2026-10' }).error, /เครดิตเป็นจำนวนวัน/);
  assert.match(planCreditCadence(CREDIT30, [inst(1)], { dueDay: 25 }).error, /เดือนเริ่ม/);
});

test('ยังไม่ตั้งกำหนดวางบิล (กำหนดชำระอย่างเดียว) — ใช้เดือนจากชื่องวด (AR-622) หรือเรียงเดือนจากเดือนเริ่ม · สิ้นเดือนตามเดือน', () => {
  const rows = [
    inst(1, { label: '1st Installment: October 2026 –' }), inst(2, { label: '2nd Installment: February 2027' }),
    inst(3, { label: '3rd Installment: June 2027' }), inst(4, { label: '4th Installment: October 2027' }),
  ];
  const byLabel = planNoCreditDates(rows, { day: 31 });
  assert.equal(byLabel.error, null);
  assert.deepEqual(byLabel.rows.map((r) => r.dueDate), ['2026-10-31', '2027-02-28', '2027-06-30', '2027-10-31']);
  assert.ok(byLabel.rows.every((r) => r.billingDate === null));
  const seq = planNoCreditDates(rows, { day: 5, startMonth: '2026-11' });
  assert.deepEqual(seq.rows.map((r) => r.dueDate), ['2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05']);
  const mixed = planNoCreditDates([inst(1, { label: 'October 2026' }), inst(2, { label: 'งวดสุดท้าย' })], { day: 15 });
  assert.deepEqual(mixed.skipped, [2]);
  assert.match(planNoCreditDates([inst(1, { label: 'งวดสุดท้าย' })], { day: 15 }).error, /ชื่องวดไม่บอกเดือน/);
});

test('⭐ AR-622 ไม่มีเครดิต + ตามเดือนในชื่องวด + วันที่ 31 — วันวางบิล = กำหนดชำระ (planCreditCadence · startMonth null)', () => {
  const rows = [
    inst(1, { label: '1st Installment: October 2026 –' }), inst(2, { label: '2nd Installment: February 2027' }),
    inst(3, { label: '3rd Installment: June 2027' }), inst(4, { label: '4th Installment: October 2027' }),
  ];
  const plan = planCreditCadence({ credit: false }, rows, { dueDay: 31, startMonth: null });
  assert.equal(plan.error, null);
  assert.deepEqual(plan.skipped, []);
  const want = ['2026-10-31', '2027-02-28', '2027-06-30', '2027-10-31'];
  assert.deepEqual(plan.rows.map((r) => r.dueDate), want);
  assert.deepEqual(plan.rows.map((r) => r.billingDate), want, 'ชำระวันวางบิล = วันเดียวกัน');
  /* เครดิต N วัน + เดือนในชื่องวด = วันวางบิลย้อน N วันจากกำหนดชำระ */
  const credit = planCreditCadence(CREDIT30, rows, { dueDay: 31, startMonth: null });
  assert.deepEqual(credit.rows.map((r) => [r.billingDate, r.dueDate]), [
    ['2026-10-01', '2026-10-31'], ['2027-01-29', '2027-02-28'], ['2027-05-31', '2027-06-30'], ['2027-10-01', '2027-10-31'],
  ]);
  /* งวดที่ชื่อไม่บอกเดือน = ข้าม พร้อมบอก · ไม่มีงวดไหนบอกเดือนเลย = error (ไม่เดาเดือน) */
  const mixed = planCreditCadence({ credit: false }, [inst(1, { label: 'October 2026' }), inst(2, { label: 'งวดสุดท้าย' })], { dueDay: 15, startMonth: null });
  assert.deepEqual(mixed.skipped, [2]);
  assert.deepEqual(mixed.rows.map((r) => r.billingDate), ['2026-10-15']);
  assert.match(planCreditCadence({ credit: false }, [inst(1, { label: 'งวดสุดท้าย' })], { dueDay: 15, startMonth: null }).error, /ชื่องวดไม่บอกเดือน/);
  /* ไม่ส่งเดือนเลย (undefined) = ยังไม่เลือก — ไม่ใช่ "ตามชื่องวด" เงียบ ๆ (ไม่มีค่าตั้งต้นให้การตัดสินใจ) */
  assert.match(planCreditCadence({ credit: false }, rows, { dueDay: 31 }).error, /เดือนเริ่ม/);
  /* ไม่มีเครดิต + เรียงเดือนจากเดือนเริ่ม */
  const seq = planCreditCadence({ credit: false }, rows, { dueDay: 5, startMonth: '2026-11' });
  assert.deepEqual(seq.rows.map((r) => r.billingDate), ['2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05']);
  /* ยังไม่ตั้งกติกา = ไม่มีอะไรคิดวันวางบิลให้ */
  assert.match(planCreditCadence(null, rows, { dueDay: 31, startMonth: null }).error, /เครดิต/);
});

test('ยังไม่ตั้งกำหนดวางบิล — ตัวเติมเขียนกำหนดชำระอย่างเดียว วันวางบิลที่เลือกไว้เองคงเดิม (planNoCreditDates)', () => {
  const plan = planNoCreditDates([inst(1, { billingDate: '2026-10-01' }), inst(2)], { day: 25, startMonth: '2026-10', includeDated: true });
  assert.deepEqual(plan.rows.map((r) => [r.seq, r.billingDate, r.dueDate]), [[1, '2026-10-01', '2026-10-25'], [2, null, '2026-11-25']]);
});

test('จัดใหม่งวดที่มีวันแล้วด้วย — ไม่แตะงวดที่ขอใบแล้ว/รับเงินแล้ว', () => {
  const rows = [
    inst(1, { dueDate: '2026-10-05', billingDate: '2026-09-05', status: 'confirmed' }),
    inst(2, { dueDate: '2026-11-05', billingDate: '2026-10-06' }),
    inst(3, { dueDate: '2026-12-05', billingDate: '2026-11-05' }),
  ];
  const plan = planCreditCadence(CREDIT30, rows, { dueDay: 25, startMonth: '2026-11', includeDated: true, requestedIds: new Set(['i3']) });
  assert.deepEqual(plan.rows.map((r) => [r.seq, r.dueDate, r.prevDueDate]), [[2, '2026-11-25', '2026-11-05']]);
});
