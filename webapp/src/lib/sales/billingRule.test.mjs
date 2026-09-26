// ── กำหนดวางบิล (mig 0389) — logic ล้วน ทดสอบได้โดยไม่แตะ DB ──
//
// สิ่งที่ชุดนี้ล็อกไว้: รอบวางบิล → วันวางบิล/กำหนดชำระ คิดตรงกับตัวอย่างในม็อก (AR-267 · AR-015) ·
// วันที่ 31 = สิ้นเดือน · "เลยรอบวางบิล" ไม่ใช่ "เลยกำหนด" (ไม่มีโทนแดง) · งวดยกมา/รับเงินแล้วไม่ถูกเติม
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BILLING_REMIND_DAYS,
  billingRequestLive,
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
  weekendNote,
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
  assert.deepEqual(rule, { ...AR267, note: 'แนบสำเนา PO' });
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
  assert.equal(normalizeBillingRule({ billing: { mode: 'monthly', day: '5' }, payment: { mode: 'credit', days: '0' } }).rule.billing.day, 5);
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
    { billingDate: '2026-10-05', dueDate: '2026-10-25' },
    { billingDate: '2026-11-05', dueDate: '2026-11-25' },
    { billingDate: '2026-12-05', dueDate: '2026-12-25' },
  ]);
});

test('วันวางบิลของเดือนนี้ยังไม่ผ่าน = รอบแรกคือเดือนนี้ (นับวันนี้ด้วย)', () => {
  assert.equal(billingRounds(AR267, '2026-10-05')[0].billingDate, '2026-10-05');
  assert.equal(billingRounds(AR267, '2026-10-01')[0].billingDate, '2026-10-05');
});

test('AR-015 — เงินเข้าเดือนถัดไป · ข้ามปีได้', () => {
  assert.equal(dueDateForBilling(AR015, '2026-12-25'), '2027-01-25');
  assert.deepEqual(billingRounds(AR015, '2026-09-26', 2), [
    { billingDate: '2026-10-25', dueDate: '2026-11-25' },
    { billingDate: '2026-11-25', dueDate: '2026-12-25' },
  ]);
});

test('วันที่ 31 = สิ้นเดือน ทั้งวางบิลและเงินเข้า (ก.พ. ใช้ 28/29)', () => {
  const r = { billing: { mode: 'monthly', day: 31 }, payment: { mode: 'monthly', day: 31, monthOffset: 0 } };
  assert.deepEqual(billingRounds(r, '2027-02-01', 2), [
    { billingDate: '2027-02-28', dueDate: '2027-02-28' },
    { billingDate: '2027-03-31', dueDate: '2027-03-31' },
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
