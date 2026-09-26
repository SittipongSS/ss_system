// สถานะฟอร์มของโมดัล "เครดิตและรอบวางบิล" (รุ่นสอง · มติเจ้าของ 26/09)
// ⭐ สิ่งที่ต้องไม่หลุด: ไม่มีค่าตั้งต้น · ทาง 3 แตะของ AR-267 · หลายรอบต่อเดือน (≤4) · ไม่มีเครดิต = { credit:false }
//    · ตัวตัดสินคือ normalizeBillingRule ตัวเดียวกับ API
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeRoundAfterToggle, applyQuickCredit, blankForm, chooseBillMode, chooseCredit, choosePay, crossErrorOf, evaluateForm, fixCrossError,
  formOf, gateMessageOf, missingAnswersOf, nextRoundNeedingDay, payChoiceOf, payDayState, quickCreditOn, roundsOf,
  ruleInputOf, sameMonthBlocked, setCreditDays, setPayDay, setRoundMonth, toggleBillDay,
} from './CustomerBillingRuleState.js';
import { normalizeBillingRule } from '../../lib/sales/billingRule.js';

const tap = (form, day) => toggleBillDay(form, day).form;

test('ฟอร์มว่าง = ยังไม่ตัดสินอะไรเลย (สวิตช์เครดิตไม่ติด) · บันทึกไม่ได้ และไม่ใช่ "ล้าง"', () => {
  const form = blankForm();
  assert.equal(form.credit, null);
  const got = evaluateForm(form);
  assert.equal(got.rule, null);
  assert.deepEqual(got.missing, ['เครดิต']);
  assert.equal(gateMessageOf(got), 'ยังบันทึกไม่ได้ — ขาด เครดิต');
});

test('ไม่มีเครดิต = { credit:false } · หมายเหตุไปด้วย · ส่วนที่เหลือไม่นับ', () => {
  const form = { ...chooseCredit(blankForm(), 'none'), note: '  โอนก่อนส่งของ  ' };
  const got = evaluateForm(form);
  assert.deepEqual(got.rule, { credit: false, note: 'โอนก่อนส่งของ' });
  assert.deepEqual(missingAnswersOf(form), []);
  assert.deepEqual(formOf({ credit: false }), { ...blankForm(), credit: 'none' });
});

test('⭐ AR-267 สามแตะ: 5 → เดือนเดียวกัน → 25 (แตะข้อ ① = มีเครดิตไปในตัว)', () => {
  let form = tap(blankForm(), 5);
  assert.equal(form.credit, 'yes');
  assert.equal(form.billMode, 'monthly');
  form = choosePay(form, 'm0');
  form = setPayDay(form, 0, 25);
  assert.deepEqual(evaluateForm(form).rule, {
    billing: { mode: 'monthly', days: [5] },
    payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }] },
  });
});

test('ทางลัด "เครดิต 30 วัน" แตะเดียว = มีเครดิต + วางบิลได้ทุกวัน + เครดิต 30 · ชิปติดเฉพาะตอนฟอร์มตรงจริง', () => {
  const form = applyQuickCredit(blankForm(), 30);
  assert.deepEqual(evaluateForm(form).rule, { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 30 } });
  assert.equal(quickCreditOn(form, 30), true);
  assert.equal(quickCreditOn(form, 14), false);
  assert.equal(quickCreditOn(setCreditDays(form, '31'), 30), false);
  assert.equal(setCreditDays(form, '1a2b34').creditDays, '123', 'ตัวเลขล้วน สามหลัก');
});

test('รูปที่บันทึก ↔ ฟอร์ม เดินกลับได้ครบ (รวมรูปรุ่นแรกของ 0389)', () => {
  const rules = [
    { billing: { mode: 'monthly', days: [10, 25] }, payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }, { day: 10, monthOffset: 1 }] }, note: 'แนบ PO' },
    { billing: { mode: 'monthly', days: [5, 31] }, payment: { mode: 'credit', days: 45 } },
    { billing: { mode: 'anyday' }, payment: { mode: 'monthly', rounds: [{ day: 31, monthOffset: 1 }] } },
    { credit: false, note: 'เงินสด' },
  ];
  for (const rule of rules) assert.deepEqual(evaluateForm(formOf(rule)).rule, rule);
  // รุ่นแรก (0389) อ่านแล้วเป็นรุ่นสอง
  const v1 = { billing: { mode: 'monthly', day: 5 }, payment: { mode: 'monthly', day: 25, monthOffset: 0 } };
  assert.deepEqual(formOf(v1).billDays, [5]);
  assert.deepEqual(formOf(v1).payRounds, [{ day: 25, monthOffset: 0 }]);
});

test('⭐ หลายรอบ: แตะวัน = เพิ่ม/ถอดรอบ เรียงเอง · รอบใหม่ได้เดือนที่ทุกรอบเลือกไว้ แต่ยังไม่มีวันเงินเข้า', () => {
  let form = choosePay(tap(blankForm(), 25), 'm0');
  form = setPayDay(form, 0, 28);
  form = tap(form, 10);
  assert.deepEqual(form.billDays, [10, 25]);
  assert.deepEqual(form.payRounds, [{ day: null, monthOffset: 0 }, { day: 28, monthOffset: 0 }]);
  assert.equal(nextRoundNeedingDay(form), 0);
  assert.deepEqual(missingAnswersOf(form), ['วันที่เงินเข้า รอบวันที่ 10']);
  form = setPayDay(form, 0, 20);
  assert.deepEqual(evaluateForm(form).rule.payment.rounds, [{ day: 20, monthOffset: 0 }, { day: 28, monthOffset: 0 }]);
  // ถอดรอบ 10 — คู่ของรอบ 25 อยู่ครบ
  form = tap(form, 10);
  assert.deepEqual(form.billDays, [25]);
  assert.deepEqual(form.payRounds, [{ day: 28, monthOffset: 0 }]);
});

test('แตะรอบที่ 5 = ไม่เปลี่ยน + บอกเพดาน', () => {
  let form = blankForm();
  for (const day of [1, 8, 15, 22]) form = tap(form, day);
  const got = toggleBillDay(form, 29);
  assert.equal(got.limited, true);
  assert.equal(got.form, form);
  assert.equal(toggleBillDay(form, 8).limited, false, 'ถอดตัวที่มีอยู่ได้เสมอ');
});

test('หลายรอบเงินเข้าคนละเดือน: แถบบนไม่ติดสักตัว · แตะแถบบน = ใช้กับทุกรอบ', () => {
  let form = choosePay(tap(tap(blankForm(), 10), 25), 'm0');
  form = setPayDay(setPayDay(form, 0, 25), 1, 10);
  form = setRoundMonth(form, 1, 1);
  assert.equal(payChoiceOf(form), null);
  assert.deepEqual(evaluateForm(form).rule, {
    billing: { mode: 'monthly', days: [10, 25] },
    payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }, { day: 10, monthOffset: 1 }] },
  });
  // "เดือนเดียวกัน" กับทุกรอบจะทำให้รอบ 25 → 10 ผิด ⇒ ปิด
  assert.equal(sameMonthBlocked(form), true);
  assert.equal(payChoiceOf(choosePay(form, 'm1')), 'm1');
});

test('⭐ รอบเดียวย้ายวันวางบิล 5 → 28 = คู่เงินเข้าตามไป · เห็นเหตุข้ามช่อง + ปุ่มแก้แตะเดียว', () => {
  let form = formOf({ billing: { mode: 'monthly', days: [5] }, payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }] } });
  form = tap(tap(form, 5), 28);
  assert.deepEqual(form.payRounds, [{ day: 25, monthOffset: 0 }]);
  assert.deepEqual(crossErrorOf(form), { index: 0, billDay: 28, payDay: 25 });
  const got = evaluateForm(form);
  assert.equal(got.rule, null);
  assert.equal(gateMessageOf(got), 'ยังบันทึกไม่ได้ — แก้ข้อ 2 ก่อน: เงินเข้าก่อนวันวางบิล');
  const fixed = fixCrossError(form);
  assert.deepEqual(evaluateForm(fixed).rule.payment.rounds, [{ day: 25, monthOffset: 1 }]);
});

test('วันก่อนวันวางบิลในเดือนเดียวกันปิด · ตัวที่เลือกค้างขึ้นแดงแทนการปิด · เดือนถัดไปเปิดหมด', () => {
  const round = { billDay: 10, day: null, monthOffset: 0 };
  assert.deepEqual(payDayState(round, 9), { blocked: true, invalid: false, isBill: false });
  assert.deepEqual(payDayState(round, 10), { blocked: false, invalid: false, isBill: true });
  assert.deepEqual(payDayState({ ...round, day: 9 }, 9), { blocked: false, invalid: true, isBill: false });
  assert.deepEqual(payDayState({ ...round, monthOffset: 1 }, 1), { blocked: false, invalid: false, isBill: false });
  assert.deepEqual(payDayState({ billDay: null, day: null, monthOffset: 0 }, 1), { blocked: false, invalid: false, isBill: false }, 'วางบิลได้ทุกวัน = ไม่มีเส้นแบ่ง');
});

test('ด่านบอกทุกช่องที่ขาดในครั้งเดียว — เรียกชื่อตามที่ตาเห็น', () => {
  assert.deepEqual(missingAnswersOf(chooseCredit(blankForm(), 'yes')), ['1. วางบิล', '2. เงินเข้า']);
  assert.deepEqual(missingAnswersOf(chooseBillMode(choosePay(blankForm(), 'credit'), 'monthly')), ['วันที่วางบิล', 'จำนวนวันเครดิต']);
  const multi = { ...tap(tap(blankForm(), 31), 15), payMode: 'monthly' };
  assert.deepEqual(missingAnswersOf(multi), [
    'วันที่เงินเข้า รอบวันที่ 15', 'เดือนที่เงินเข้า รอบวันที่ 15', 'วันที่เงินเข้า รอบสิ้นเดือน', 'เดือนที่เงินเข้า รอบสิ้นเดือน',
  ]);
  // ทุกช่องที่ลิสต์ = ตัวตรวจของ API ปฏิเสธ (ข้อความไม่มีทางบอกว่าขาดทั้งที่ปุ่มผ่าน)
  assert.ok(normalizeBillingRule(ruleInputOf(multi)).error);
});

test('ได้ทุกวัน → แตะวัน = รายเดือนรอบเดียววันนั้น · สลับแผ่นกลับไปมาไม่ทิ้งวันที่แตะไว้', () => {
  let form = tap(tap(blankForm(), 10), 25);
  form = chooseBillMode(form, 'anyday');
  assert.deepEqual(roundsOf(form).length, 1);
  assert.deepEqual(chooseBillMode(form, 'monthly').billDays, [10, 25]);
  form = tap(form, 3);
  assert.equal(form.billMode, 'monthly');
  assert.deepEqual(form.billDays, [3]);
  assert.equal(form.payRounds.length, 1);
});

/* ── ตารางวันเงินเข้าใช้ร่วมกันทุกรอบ ชี้ด้วยตำแหน่ง — เพิ่ม/ถอดรอบแล้วต้องยังชี้รอบเดิม ─────────────────── */
function threeRounds() {
  let form = choosePay(tap(tap(tap(blankForm(), 5), 15), 25), 'm1');
  form = setPayDay(setPayDay(setPayDay(form, 0, 10), 1, 20), 2, 30);
  return form;
}

test('⭐ ถอดรอบที่อยู่ก่อนรอบที่เลือก = ตารางยังชี้รอบเดิม (ของเดิมสลับไปแก้รอบอื่นเงียบ ๆ)', () => {
  const prev = threeRounds();
  const next = tap(prev, 5);
  assert.deepEqual(next.billDays, [15, 25]);
  // เลือกรอบวันที่ 15 อยู่ (ตำแหน่ง 1) → ถอดรอบ 5 → รอบ 15 อยู่ตำแหน่ง 0 (ตำแหน่ง 1 ตอนนี้คือรอบ 25)
  assert.equal(roundsOf(next)[activeRoundAfterToggle(prev, next, 5, 1)].billDay, 15);
  assert.equal(roundsOf(next)[activeRoundAfterToggle(prev, next, 5, 2)].billDay, 25);
});

test('ถอดรอบที่อยู่หลัง = อยู่ที่เดิม · ถอดรอบที่เลือกเอง = ไปรอบที่ยังขาดวัน ไม่มีก็ตำแหน่งเดิม', () => {
  const prev = threeRounds();
  assert.equal(roundsOf(tap(prev, 25))[activeRoundAfterToggle(prev, tap(prev, 25), 25, 0)].billDay, 5);
  // ถอดรอบ 15 ที่เลือกอยู่ ไม่มีรอบขาดวัน → ตำแหน่งเดิม (รอบ 25 ขยับมาแทน)
  assert.equal(activeRoundAfterToggle(prev, tap(prev, 15), 15, 1), 1);
  // มีรอบขาดวัน → ไปรอบนั้น
  const gap = setPayDay(prev, 2, null);
  assert.equal(roundsOf(tap(gap, 15))[activeRoundAfterToggle(gap, tap(gap, 15), 15, 1)].billDay, 25);
});

test('เพิ่มรอบ = ไปรอบใหม่ที่ยังไม่มีวันเงินเข้า · เหลือรอบเดียว = ตำแหน่ง 0', () => {
  const prev = threeRounds();
  const next = tap(prev, 1);
  assert.equal(roundsOf(next)[activeRoundAfterToggle(prev, next, 1, 2)].billDay, 1);
  const single = tap(tap(blankForm(), 5), 15);
  assert.equal(activeRoundAfterToggle(single, tap(single, 15), 15, 1), 0);
});
