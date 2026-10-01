// สถานะฟอร์มของโมดัล "วางบิลและกำหนดชำระ" (รุ่นสี่ · แบบ A · มติเจ้าของ 29/09)
// ⭐ สิ่งที่ต้องไม่หลุด: ไม่มีค่าตั้งต้น (รูปเดิมเปิดมา = ยังไม่ตอบ) · ตัวตัดสินคือ normalizeRule(allowLegacy:false) ตัวเดียวกับ API ·
//    กติกาเดิม (รุ่นสอง) เปิดแล้วบันทึกซ้ำได้วันเท่าเดิม · ไม่ทำลายกติกาที่จอนี้แก้ไม่ได้ · ห้ามพูด "เครดิต 0 วัน" ·
//    ไม่ต้องวางบิล = ไม่มีกระดิ่งวางบิล · 409 ไม่ทิ้งที่กรอก · ตัวล็อกเป็นสตริงดิบ
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRedateConflicts, blankForm, calendarCardOf, calendarCountOf, calendarUpcomingRuns, changeTextOf, chooseBill, chooseCalPay,
  chooseNeed, choosePay, clearTiming, conflictOf, creditNumber, cutoffBellPreviewOf, cutoffTimeOf, evaluateForm, everyDays,
  formFromStored, formWordsOf, keptTextOf, nextRoundNeedingDay, payDayStateOf, policyWordsOf, redatePayloadOf, reminderChipsOf,
  saveBlockOf, savePayloadOf, setCalCreditDays, setCreditDays, setCutoffTime, setRoundDay, setRoundOff, stampTextOf, toggleBillDay,
  togglePayDay, updateCalendar,
} from './CustomerBillingRuleState.js';
import { BELL, describeRule, dueDateForBilling, dueFor, normalizeRule, policyPreview, ruleOf, sameRule } from '../../lib/sales/billingRule.js';
import { BILLING_V4_SCHEMA_MISSING } from '../../lib/sales/billingPolicySchema.js';
import {
  confirmCalendarMonth, draftCalendarFromPattern, setCalendarCell, setCalendarFile,
} from '../../lib/sales/billingCalendarEdit.js';

const tap = (form, day) => toggleBillDay(form, day).form;
const tapPay = (form, day) => togglePayDay(form, day).form;
const off = (form, i, o) => setRoundOff(form, i, o).form;
const AR015 = { note: 'นับเครดิตหลังจัดส่งสินค้า', billing: { mode: 'anyday' }, payment: { days: 30, mode: 'credit' } };
const AR281 = { billing: { mode: 'monthly', days: [21] }, payment: { mode: 'monthly', rounds: [{ day: 30, monthOffset: 1 }] } };
const V2_5_25 = { billing: { mode: 'monthly', days: [5] }, payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }] } };

/* ── ไม่มีค่าตั้งต้น ─────────────────────────────────────────────── */
test('ฟอร์มว่าง = ยังไม่ตอบข้อ ① · บันทึกไม่ได้ และไม่ใช่ "ล้าง"', () => {
  const got = evaluateForm(blankForm());
  assert.equal(got.rule, undefined);
  assert.equal(got.clear, false);
  assert.equal(got.step, 1);
  assert.match(got.why, /ข้อ 1/);
});

test('⭐ รูปเดิม { credit:false } เปิดมา = ยังไม่ตอบ (ระบบไม่เลือก "ต้องวางบิล" ให้) · หมายเหตุติดมา', () => {
  const form = formFromStored({ credit: false, note: 'โอนก่อนส่งของ' });
  assert.equal(form.need, null);
  assert.equal(form.legacyNoCredit, true);
  assert.equal(form.note, 'โอนก่อนส่งของ');
  assert.equal(evaluateForm(form).rule, undefined);
  assert.equal(formWordsOf(form).need, 'legacy');
});

test('ลูกค้ายังไม่ระบุ (null) = แผ่น "ยังไม่ระบุ" ติดตามค่าที่เก็บอยู่จริง · บันทึก = ล้าง (null)', () => {
  const form = formFromStored(null);
  assert.equal(form.need, 'unknown');
  const got = evaluateForm(form);
  assert.equal(got.clear, true);
  assert.equal(got.rule, null);
  assert.deepEqual(savePayloadOf(got, null), { billingRule: null, baseUpdatedAt: null });
});

/* ── ① → ② → ③ ─────────────────────────────────────────────────── */
test('ไม่ต้องวางบิล = { v:4, need:"none" } · ข้อ ② ③ ที่เคยแตะไม่ติดไป · หมายเหตุไปด้วย', () => {
  let form = tap(chooseNeed(blankForm(), 'required'), 5);
  form = { ...chooseNeed(form, 'none'), note: '  โอนตามงวด  ' };
  assert.deepEqual(evaluateForm(form).rule, { v: 4, need: 'none', note: 'โอนตามงวด' });
});

test('ต้องวางบิลแต่ยังไม่รู้รอบ = ข้าม ② ③ ได้ → "ต้องวางบิล · ยังไม่ตั้งรอบ" · ปุ่มข้ามล้าง ② ③ กลับ', () => {
  const noTiming = { v: 4, need: 'required', billing: null };
  assert.deepEqual(evaluateForm(chooseNeed(blankForm(), 'required')).rule, noTiming);
  let form = choosePay(chooseBill(chooseNeed(blankForm(), 'required'), 'anyday'), 'same');
  assert.equal(evaluateForm(form).rule.billing.mode, 'anyday');
  form = clearTiming(form);
  assert.deepEqual(evaluateForm(form).rule, noTiming);
  assert.equal(policyWordsOf(evaluateForm(form).rule).noTiming, true);
});

test('② แล้วยังไม่ตอบ ③ = บอกข้อที่ขาด (ไม่มีค่าตั้งต้นของกำหนดชำระ)', () => {
  const form = chooseBill(chooseNeed(blankForm(), 'required'), 'anyday');
  const got = evaluateForm(form);
  assert.equal(got.rule, undefined);
  assert.equal(got.step, 3);
  const monthly = chooseBill(chooseNeed(blankForm(), 'required'), 'monthly');
  assert.equal(evaluateForm(monthly).step, 2, 'ทุกวันที่… แต่ยังไม่แตะวัน = ข้อ ②');
});

test('ชำระวันวางบิล / เครดิต N วัน — เครดิต 0 = กติกาเดียวกับชำระวันวางบิล · เกิน 365 บันทึกไม่ได้', () => {
  const base = chooseBill(chooseNeed(blankForm(), 'required'), 'anyday');
  const same = evaluateForm(choosePay(base, 'same')).rule;
  assert.deepEqual(same, { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 0, runs: null });
  assert.deepEqual(evaluateForm(setCreditDays(base, '0')).rule, same);
  assert.equal(evaluateForm(setCreditDays(base, '30')).rule.creditDays, 30);
  assert.equal(evaluateForm(setCreditDays(base, '999')).rule, undefined);
  assert.equal(evaluateForm(choosePay(base, 'credit')).rule, undefined, 'เลือกเครดิตแต่ยังไม่ใส่จำนวน');
  assert.equal(setCreditDays(base, '3a0').creditDays, '30');
  assert.equal(creditNumber(''), null);
});

test('⭐ AR-267 ตามรอบจ่าย: วันที่ 5 → วันจ่าย 25 เดือนเดียวกัน (เดือนไม่มีค่าตั้งต้น)', () => {
  let form = tap(chooseNeed(blankForm(), 'required'), 5);
  form = choosePay(form, 'runs');
  form = setRoundDay(form, 0, 25);
  assert.equal(form.rounds[0].off, null, 'วันจ่ายอยู่หลังวันวางบิล — เดือนยังต้องเลือก');
  assert.match(evaluateForm(form).why, /วันจ่ายและเดือน/);
  form = off(form, 0, 0);
  const { rule } = evaluateForm(form);
  assert.deepEqual(rule.runs, { kind: 'monthly', rounds: [{ cutoffDay: 5, payDay: 25, payMonthOffset: 0 }] });
  assert.equal(policyPreview(rule, '2026-09-29').rows[0].dueDate, '2026-10-25');
  assert.equal(policyWordsOf(rule).when, 'ทุกวันที่ 5');
  assert.equal(policyWordsOf(rule).pay, 'วันที่ 25 เดือนเดียวกัน');
});

test('วันจ่าย ≤ วันวางบิล = เดือนถัดไปทางเดียว (flow ตัดสิน) · กด "เดือนเดียวกัน" = ไม่เปลี่ยน บอกเหตุ', () => {
  let form = choosePay(tap(chooseNeed(blankForm(), 'required'), 25), 'runs');
  form = setRoundDay(form, 0, 10);
  assert.equal(form.rounds[0].off, 1);
  const tried = setRoundOff(form, 0, 0);
  assert.equal(tried.blocked, true);
  assert.equal(tried.form, form);
  const state = payDayStateOf(off(setRoundDay(form, 0, 28), 0, 0), 0, 20);
  assert.equal(state.blocked, true, 'เดือนเดียวกัน: วันก่อนวันวางบิลแตะไม่ได้');
  assert.equal(payDayStateOf(form, 0, 25).isBill, true);
});

test('หลายรอบ (≤4): แตะวันเพิ่ม/ถอด คู่วันจ่ายตามวันไปด้วย · รอบที่ 5 = ไม่เปลี่ยน', () => {
  let form = choosePay(tap(tap(chooseNeed(blankForm(), 'required'), 20), 5), 'runs');
  assert.deepEqual(form.days, [5, 20]);
  form = off(setRoundDay(form, 1, 10), 1, 1);
  form = tap(form, 10);
  assert.deepEqual(form.days, [5, 10, 20]);
  assert.deepEqual(form.rounds[2], { day: 10, off: 1 }, 'คู่ของวันที่ 20 เลื่อนตาม');
  assert.equal(nextRoundNeedingDay(form), 0);
  form = tap(form, 5);
  assert.deepEqual(form.days, [10, 20]);
  assert.deepEqual(form.rounds, [{ day: null, off: null }, { day: 10, off: 1 }]);
  const full = tap(tap(tap(form, 1), 31), 15);
  assert.equal(full.days.length, 4);
  assert.equal(toggleBillDay(full, 2).limited, true);
  assert.equal(everyDays([10, 31]), 'ทุกวันที่ 10 และสิ้นเดือน');
});

test('วางบิลได้ทุกวัน + วันจ่ายประจำ (รายเดือน) = รอบจ่ายแบบวันจ่ายอย่างเดียว', () => {
  let form = choosePay(chooseBill(chooseNeed(blankForm(), 'required'), 'anyday'), 'runs');
  assert.match(evaluateForm(form).why, /วันจ่าย/);
  form = tapPay(form, 25);
  const { rule } = evaluateForm(form);
  assert.deepEqual(rule.runs, { kind: 'monthly', rounds: [{ cutoffDay: 25, payDay: 25, payMonthOffset: 0 }] });
  assert.equal(policyWordsOf(rule).pay, 'จ่ายทุกวันที่ 25');
  const four = tapPay(tapPay(tapPay(form, 5), 10), 15);
  assert.equal(togglePayDay(four, 20).limited, true);
});

test('⭐ ทุกกติกาที่ฟอร์มสร้าง ผ่านด่านบันทึกของ API (allowLegacy:false) — ไม่มีธงรูปเดิมหลุดไป', () => {
  const forms = [
    chooseNeed(blankForm(), 'none'),
    chooseNeed(blankForm(), 'required'),
    choosePay(chooseBill(chooseNeed(formFromStored({ credit: false }), 'required'), 'anyday'), 'same'),
    setCreditDays(tap(chooseNeed(blankForm(), 'required'), 31), '45'),
  ];
  for (const form of forms) {
    const { rule } = evaluateForm(form);
    assert.ok(rule);
    assert.equal(normalizeRule(rule, { allowLegacy: false }).error, null);
    assert.equal(rule.legacyNoCredit, undefined);
  }
});

/* ── ค่าที่เก็บอยู่ → ฟอร์ม → บันทึกซ้ำ ─────────────────────────────── */
test('⭐ AR-015 (รุ่นสอง ทุกวัน + เครดิต 30 + หมายเหตุ) เปิดแล้วบันทึกซ้ำ = กติกาเดียวกัน (API ตอบ unchanged)', () => {
  const form = formFromStored(AR015);
  assert.deepEqual([form.need, form.bill, form.pay, form.creditDays, form.note], ['required', 'anyday', 'credit', '30', 'นับเครดิตหลังจัดส่งสินค้า']);
  const { rule } = evaluateForm(form);
  assert.equal(JSON.stringify(rule), JSON.stringify(ruleOf(AR015)), 'ตัวเทียบ unchanged ของ route');
  assert.equal(sameRule(AR015, rule), true);
});

test('AR-281 (รุ่นสอง วันที่ 21 → 30 เดือนถัดไป) = รูปผ่อนปรน · บันทึกซ้ำเป็นคู่วันตัดรอบ · วันที่คิดให้เท่าเดิม', () => {
  const form = formFromStored(AR281);
  assert.equal(form.legacyShape, true);
  assert.deepEqual([form.bill, form.days, form.pay, form.rounds], ['monthly', [21], 'runs', [{ day: 30, off: 1 }]]);
  const { rule } = evaluateForm(form);
  for (const bill of ['2026-10-21', '2026-11-21', '2027-02-21']) {
    assert.equal(dueFor(rule, bill).dueDate, dueDateForBilling(AR281, bill), bill);
  }
});

test('รุ่นสอง "วางบิล 5 → เงินเข้า 25 เดือนเดียวกัน" อ่านเป็นคู่ 5 → 25 · วันเท่าเดิม', () => {
  const form = formFromStored(V2_5_25);
  assert.deepEqual([form.bill, form.days, form.pay, form.rounds], ['monthly', [5], 'runs', [{ day: 25, off: 0 }]]);
  const { rule } = evaluateForm(form);
  assert.equal(dueFor(rule, '2026-10-05').dueDate, dueDateForBilling(V2_5_25, '2026-10-05'));
});

test('⭐ กติกาที่จอนี้แก้ไม่ได้ (วันในสัปดาห์ · เครดิต + รอบจ่าย · เวลาตัดรอบของรอบรายเดือน) = บอกเหตุ · ไม่ตอบข้อ ① ให้ (กดบันทึกเฉย ๆ ไม่ทับ)', () => {
  const stored = [
    { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 30, runs: { kind: 'weekday', weekday: 3, nths: [2, 4] } },
    { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 30, runs: { kind: 'monthly', rounds: [{ cutoffDay: 25, payDay: 25, payMonthOffset: 0 }] } },
    /* review 29/09: เวลาตัดรอบของรอบรายเดือนไม่มีช่องบนฟอร์ม (ช่องเวลามีเฉพาะปฏิทิน) — เดิมเปิดเป็นรอบจ่ายธรรมดา แล้วกดบันทึกเฉย ๆ ทิ้ง '16:00' เงียบ ๆ */
    { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 0, runs: { kind: 'monthly', rounds: [{ cutoffDay: 31, payDay: 15, payMonthOffset: 1 }], cutoffTime: '16:00' } },
  ];
  for (const value of stored) {
    assert.ok(ruleOf(value), 'fixture ต้องเป็นกติกาที่ถูกต้อง');
    const form = formFromStored(value);
    assert.equal(form.need, null);
    assert.ok(form.unsupported.length > 0);
    assert.equal(evaluateForm(form).rule, undefined);
  }
});

test('ไม่ต้องวางบิล / ยังไม่ตั้งรอบ ที่เก็บอยู่ เปิดมาตามจริง', () => {
  assert.equal(formFromStored({ v: 4, need: 'none', note: 'x' }).need, 'none');
  const noTiming = formFromStored({ v: 4, need: 'required', billing: null });
  assert.deepEqual([noTiming.need, noTiming.bill], ['required', null]);
});

/* ── คำ ──────────────────────────────────────────────────────────── */
test('⭐ ประโยคนโยบายไม่พูด "เครดิต 0 วัน" · ชำระวันวางบิล = "วันเดียวกับวางบิล"', () => {
  const zero = { v: 4, need: 'required', billing: { mode: 'monthly', days: [5, 20] }, creditDays: 0, runs: null };
  assert.equal(policyWordsOf(zero).pay, 'วันเดียวกับวางบิล');
  assert.equal(policyWordsOf(zero).when, 'ทุกวันที่ 5 และ 20');
  assert.equal(policyWordsOf(AR015).pay, 'เครดิต 30 วัน');
  assert.equal(policyWordsOf({ credit: false }).need, 'legacy');
  assert.equal(policyWordsOf(null).need, 'unknown');
  assert.equal(policyWordsOf({ v: 4, need: 'none' }).need, 'none');
  const base = chooseBill(chooseNeed(blankForm(), 'required'), 'anyday');
  assert.equal(formWordsOf(setCreditDays(base, '0')).pay, 'วันเดียวกับวางบิล');
  for (const words of [policyWordsOf(zero), formWordsOf(setCreditDays(base, '0'))]) {
    assert.doesNotMatch(JSON.stringify(words), /เครดิต 0 วัน/);
  }
});

test('⭐ การเตือน: ไม่ต้องวางบิล = ไม่มีกระดิ่งวางบิล (มีแต่ครบกำหนดชำระ) · มีรอบจ่าย = + กระดิ่งวันตัดรอบ (รุ่นห้า · ตัวเดียวกับ cron)', () => {
  const none = reminderChipsOf({ v: 4, need: 'none' });
  assert.deepEqual(none.filter((c) => c.on).map((c) => c.key), [BELL.DUE_SOON]);
  assert.ok(none.some((c) => !c.on && /วางบิล/.test(c.text)));
  const runs = reminderChipsOf({ v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 0, runs: { kind: 'monthly', rounds: [{ cutoffDay: 5, payDay: 25, payMonthOffset: 0 }] } });
  assert.deepEqual(runs.map((c) => c.key), [BELL.BILLING_DUE, BELL.DUE_SOON, BELL.BILLING_CUTOFF]);
  assert.match(runs[0].text, /0–3 วัน/);
  assert.match(runs[2].text, /^วันตัดรอบ \(เช้าวันก่อน \+ วันนั้น 08:30\)$/, 'ไม่มีเวลาตัดรอบ = ไม่พูดเวลา');
  assert.match(reminderChipsOf(null)[0].text, /งวดที่ใส่วันไว้/, 'ยังไม่ระบุ = กระดิ่งเฉพาะงวดที่มีวันวางบิล');
  assert.match(reminderChipsOf({ credit: false })[0].text, /งวดที่ใส่วันไว้/);
  const plain = reminderChipsOf({ v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 30, runs: null });
  assert.deepEqual(plain.map((c) => c.key), [BELL.BILLING_DUE, BELL.DUE_SOON], 'ไม่มีรอบจ่าย = ไม่มีกระดิ่งวันตัดรอบ');
});

/* ── บันทึก · 409 · ด่านลำดับ deploy ─────────────────────────────────── */
test('ตัวล็อกเป็นสตริงดิบจาก GET (ไม่แปลงผ่าน Date) · ไม่มีค่า = null (คีย์ต้องมีเสมอ)', () => {
  const raw = '2026-09-29T03:42:07.123456+00:00';
  const result = evaluateForm(chooseNeed(blankForm(), 'none'));
  assert.deepEqual(savePayloadOf(result, raw), { billingRule: { v: 4, need: 'none' }, baseUpdatedAt: raw });
  assert.equal(Object.hasOwn(savePayloadOf(result, undefined), 'baseUpdatedAt'), true);
});

test('ฐานยังไม่รัน 0393 = กติการุ่นสี่บันทึกไม่ได้ (บอกเหตุ) · ล้างเป็นยังไม่ระบุยังได้ · ไม่รู้ = ไม่ปิด', () => {
  const none = evaluateForm(chooseNeed(blankForm(), 'none'));
  assert.equal(saveBlockOf(none, false), BILLING_V4_SCHEMA_MISSING);
  assert.equal(saveBlockOf(evaluateForm(formFromStored(null)), false), '');
  assert.equal(saveBlockOf(none, undefined), '');
  assert.equal(saveBlockOf(none, true), '');
});

test('409 = ค่าล่าสุดของคนอื่น (ฟอร์มไม่ถูกแตะ) · อ่านค่าล่าสุดไม่ได้ = current null · error อื่นไม่ใช่ 409', () => {
  const current = { billingRule: { v: 4, need: 'none' }, billingRuleUpdatedAt: '2026-09-29T04:00:00Z', billingRuleUpdatedByName: 'Saowalak' };
  const hit = conflictOf({ status: 409, message: 'x', data: { error: 'มีคนแก้…', current } });
  assert.deepEqual(hit, { message: 'มีคนแก้…', current });
  assert.equal(conflictOf({ status: 409, data: { error: 'มีคนแก้…', current: null } }).current, null);
  assert.equal(conflictOf({ status: 400, data: { error: 'x' } }), null);
  assert.equal(conflictOf(new Error('net')), null);
});

test('แก้ล่าสุด = วันไทย + เวลาไทยของจุดเวลาเดียวกัน · ค่าเสีย = ว่าง', () => {
  assert.match(stampTextOf('2026-09-28T17:30:00Z'), /^อ\. 29 ก\.ย\. 2026 · /, 'ตีหนึ่งครึ่งเวลาไทย = วันถัดไป');
  assert.equal(stampTextOf(null), '');
  assert.equal(stampTextOf('not-a-date'), '');
});

/* ── จอ "งวดที่วันจะเปลี่ยน" ─────────────────────────────────────────── */
test('คำของงวดที่ระบบเสนอ / ไม่แตะ · ก้อนที่ส่งมีแต่งวดที่เลือก พร้อม updatedAt ของงวด', () => {
  const change = {
    rows: [
      { id: 'a', seq: 3, change: 'clearBilling', prevBillingDate: '2027-01-25', billingDate: null, prevDueDate: '2027-02-24', dueDate: '2027-02-24', updatedAt: 'u-a' },
      { id: 'b', seq: 1, change: 'newDue', prevBillingDate: '2026-10-21', billingDate: '2026-10-21', prevDueDate: '2026-11-30', dueDate: '2026-10-30', updatedAt: 'u-b' },
      { id: 'c', seq: 2, change: 'addBilling', prevBillingDate: null, billingDate: '2026-10-20', prevDueDate: '2026-11-19', dueDate: '2026-11-19', updatedAt: 'u-c' },
    ],
    kept: [],
  };
  assert.match(changeTextOf(change.rows[0]), /^ล้างวันวางบิล .* คงกำหนดชำระ$/);
  assert.match(changeTextOf(change.rows[1]), /^กำหนดชำระ .* → /);
  assert.match(changeTextOf(change.rows[2]), /^เพิ่มวันวางบิล/);
  assert.deepEqual(redatePayloadOf(change, new Set(['a', 'c'])), {
    rows: [
      { id: 'a', billingDate: null, dueDate: '2027-02-24', updatedAt: 'u-a' },
      { id: 'c', billingDate: '2026-10-20', dueDate: '2026-11-19', updatedAt: 'u-c' },
    ],
  });
  assert.deepEqual(redatePayloadOf(change, new Set()), { rows: [] }, 'ไม่มีค่าตั้งต้น — ไม่เลือก = ไม่ส่ง');
  assert.match(keptTextOf({ reason: 'manual' }), /แก้เองไว้/);
  assert.match(keptTextOf({ reason: 'requested' }), /ขอใบวางบิลแล้ว/);
  assert.match(keptTextOf({ reason: 'skip' }), /งวดนี้ไม่ต้องวางบิล/);
  assert.match(keptTextOf({ reason: 'locked', lock: 'รับเงินแล้ว' }), /ล็อกอยู่ — รับเงินแล้ว/);
  assert.match(keptTextOf({ reason: 'dueNotOnRound', earlier: { billingDate: '2026-10-08', dueDate: '2026-10-15' }, later: null }), /เร็วกว่า .* → .* ช้ากว่า —/);
});

test('409 ของ redate: งวดที่ติดหลุดจากที่เลือก (พร้อมเหตุ) · ที่เหลือคงที่คนเลือกไว้', () => {
  const { selected, blocked } = applyRedateConflicts(new Set(['a', 'b', 'c']), [{ id: 'b', reason: 'มีคนแก้งวดนี้' }]);
  assert.deepEqual([...selected], ['a', 'c']);
  assert.equal(blocked.get('b'), 'มีคนแก้งวดนี้');
});

/* ── ปฏิทินรายปีของลูกค้า (รุ่นห้า · มติเจ้าของ 29/09 "แล้ววางบิลที่มีตามปฏิทินมีมั้ย") ───────────────────────────────
   ตัวอย่างจริง: ปฏิทินมีเมตตา 2026 (AR-281 · calendar-v3/brief.md §1) · Q1 เครดิต 0 หรือ 30 ยังเปิด ⇒ เทสต์ทั้งสองทาง ·
   Q3 หยุดรอปฏิทินใหม่ (ไม่มีประมาณการ) */
const TODAY = '2026-09-29';
const MEEMETTA_TABLE = [
  [1, 9, 15, 22, 30], [2, 6, 16, 19, 27], [3, 6, 16, 23, 31], [4, 2, 16, 22, 30],
  [5, 8, 15, 21, 29], [6, 8, 15, 22, 30], [7, 8, 15, 23, 30], [8, 10, 17, 21, 31],
  [9, 8, 15, 22, 30], [10, 8, 15, 21, 30], [11, 9, 16, 20, 30], [12, 8, 15, 22, 30],
];
const d26 = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const MEEMETTA_2026 = MEEMETTA_TABLE.flatMap(([m, c1, p1, c2, p2]) => [{ cutoff: d26(m, c1), pay: d26(m, p1) }, { cutoff: d26(m, c2), pay: d26(m, p2) }]);
const FILE_2026 = '6f1c2d3e-4a5b-4c6d-8e7f-901234567890';
const meemetta = (creditDays, { cutoffTime = '16:00', years = { 2026: { runs: MEEMETTA_2026, fileId: FILE_2026 } } } = {}) => ({
  v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays, runs: { kind: 'calendar', years, ...(cutoffTime ? { cutoffTime } : {}) },
});
const newCalendarForm = () => chooseBill(chooseNeed(blankForm(), 'required'), 'calendar', { todayIso: TODAY });
const draftMonths = (form, year, pattern, fromMonth = 1) => updateCalendar(form, (c) => draftCalendarFromPattern(c, year, pattern, { fromMonth }).state);
const confirmAll = (form, year) => {
  let next = form;
  for (let mi = 0; mi < 12; mi += 1) next = updateCalendar(next, (c) => confirmCalendarMonth(c, year, mi));
  return next;
};
const MEE_PATTERN = [{ cutoffDay: 8, payDay: 15, payMonthOffset: 0 }, { cutoffDay: 22, payDay: 30, payMonthOffset: 0 }];

test('⭐ ปฏิทินที่เก็บอยู่ (มีเมตตา · เครดิต 0 และ 30) เปิดแล้วบันทึกซ้ำ = กติกาเดียวกัน (API ตอบ unchanged) · รูป/เวลาตัดรอบไม่หาย', () => {
  for (const credit of [0, 30]) {
    const stored = meemetta(credit);
    const form = formFromStored(stored, { todayIso: TODAY });
    assert.equal(form.need, 'required');
    assert.equal(form.bill, 'calendar');
    assert.equal(form.unsupported, '', 'ปฏิทินแก้บนจอนี้ได้แล้ว — ไม่ใช่ unsupported');
    assert.equal(form.calPay, credit ? 'credit' : 'same', 'คำตอบข้อ ③ มาจากค่าที่เก็บ ไม่ใช่ค่าตั้งต้น');
    assert.equal(form.creditDays, credit ? '30' : '');
    assert.equal(form.cutoffTime, '16:00');
    assert.deepEqual(Object.keys(form.calendar.years).sort(), ['2026', '2027'], 'แท็บปีนี้ + ปีหน้า "ยังไม่มี"');
    const { rule, why } = evaluateForm(form);
    assert.equal(why, '');
    assert.equal(sameRule(stored, rule), true, `เครดิต ${credit}: ตัวเทียบ unchanged ของ route`);
    assert.equal(rule.runs.years['2026'].fileId, FILE_2026);
    assert.equal(rule.runs.years['2027'], undefined, 'ปีที่ไม่มีวันไม่ถูกส่ง (ไม่มีปีว่าง)');
    assert.equal(normalizeRule(rule, { allowLegacy: false }).error, null);
  }
});

test('⭐ ตั้งปฏิทินใหม่: ด่านเรียงข้อ ②→③ · ร่างต้องแตะ "ตรงกับรูป" · ข้อ ③ ไม่มีค่าตั้งต้น (Q1) · ได้กติกาที่ API รับ', () => {
  let form = newCalendarForm();
  assert.equal(form.calPay, null, 'ไม่มีค่าตั้งต้นของข้อ ③');
  let got = evaluateForm(form);
  assert.deepEqual([got.rule, got.step], [undefined, 2]);
  assert.match(got.why, /อย่างน้อยหนึ่งรอบ/);

  form = draftMonths(form, 2026, MEE_PATTERN, 10);
  got = evaluateForm(form);
  assert.equal(got.step, 2);
  assert.match(got.why, /ร่างที่ยังไม่ได้เทียบกับรูป 3 เดือน/, 'ร่างที่ยังไม่เทียบ = บันทึกไม่ได้');
  form = confirmAll(form, 2026);
  got = evaluateForm(form);
  assert.equal(got.step, 3);
  assert.match(got.why, /ไม่มีค่าตั้งต้น/);

  const credit = chooseCalPay(form, 'credit');
  assert.equal(evaluateForm(credit).step, 3, 'เลือกมีเครดิตแต่ยังไม่ใส่วัน');
  assert.match(evaluateForm(setCalCreditDays(credit, '0')).why, /วันจ่ายของรอบเดียวกัน/, 'เครดิต 0 = ทางแรก ไม่ใช่ "เครดิต 0 วัน"');
  const c30 = evaluateForm(setCalCreditDays(credit, '30'));
  assert.equal(c30.rule.creditDays, 30);
  const same = evaluateForm(chooseCalPay(form, 'same'));
  assert.equal(same.rule.creditDays, 0);
  for (const rule of [c30.rule, same.rule]) {
    assert.equal(rule.billing.mode, 'anyday', 'ปฏิทิน = วางบิลได้ทุกวัน (วันตัดรอบ = วันวางบิล)');
    assert.equal(rule.runs.kind, 'calendar');
    assert.equal(rule.runs.years['2026'].runs.length, 6);
    assert.equal(rule.runs.estimate, undefined, 'ไม่มีสูตรประมาณการ (Q3)');
    assert.equal(normalizeRule(rule, { allowLegacy: false }).error, null);
  }
});

test('ช่องตารางที่อ่านไม่ได้/ครึ่งคู่ = ด่านข้อ ② (ตัวเดียวกับ calendarEditorIssues) · สลับไปทางอื่นแล้วกลับมา ตารางยังอยู่', () => {
  let form = newCalendarForm();
  form = updateCalendar(form, (c) => setCalendarCell(c, 2026, 9, 0, 'c', '8'));
  assert.deepEqual([evaluateForm(form).step, /1 ช่องที่ต้องแก้/.test(evaluateForm(form).why)], [2, true], 'คู่ครึ่งเดียว');
  form = updateCalendar(form, (c) => setCalendarCell(c, 2026, 9, 0, 'p', '45'));
  assert.deepEqual([evaluateForm(form).step, /ช่องที่ต้องแก้/.test(evaluateForm(form).why)], [2, true], 'วันที่ไม่มีจริง');
  form = updateCalendar(form, (c) => setCalendarCell(c, 2026, 9, 0, 'p', '15'));
  assert.equal(evaluateForm(form).step, 3);
  const back = chooseBill(chooseBill(form, 'anyday'), 'calendar', { todayIso: TODAY });
  assert.deepEqual(calendarCountOf(back.calendar), { count: 1, years: ['2026'] });
});

test('เวลาตัดรอบ: ไม่บังคับ · "1600"/"16.00" = 16:00 · รูปผิดบอกเหตุที่ข้อ ② · ว่าง = ไม่เก็บช่องนี้', () => {
  assert.deepEqual(cutoffTimeOf('1600'), { value: '16:00', error: '' });
  assert.deepEqual(cutoffTimeOf('9.30'), { value: '09:30', error: '' });
  assert.deepEqual(cutoffTimeOf(''), { value: null, error: '' });
  assert.match(cutoffTimeOf('25:00').error, /00:00–23:59/);
  assert.match(cutoffTimeOf('บ่ายสี่').error, /16:00/);
  const base = chooseCalPay(confirmAll(draftMonths(newCalendarForm(), 2026, MEE_PATTERN, 10), 2026), 'same');
  assert.equal(evaluateForm(base).rule.runs.cutoffTime, undefined);
  assert.equal(evaluateForm(setCutoffTime(base, '1600')).rule.runs.cutoffTime, '16:00');
  const bad = evaluateForm(setCutoffTime(base, '4 โมง'));
  assert.deepEqual([bad.rule, bad.step], [undefined, 2]);
});

test('รูปปฏิทินต่อปี: setCalendarFile → กติกาเก็บ fileId ของปีนั้น · เอาออก = ไม่มี fileId (ไฟล์ยังอยู่ในเอกสารของลูกค้า)', () => {
  const form = chooseCalPay(confirmAll(draftMonths(newCalendarForm(), 2026, MEE_PATTERN, 10), 2026), 'same');
  const withFile = updateCalendar(form, (c) => setCalendarFile(c, 2026, FILE_2026));
  assert.equal(evaluateForm(withFile).rule.runs.years['2026'].fileId, FILE_2026);
  const removed = updateCalendar(withFile, (c) => setCalendarFile(c, 2026, ''));
  assert.equal(evaluateForm(removed).rule.runs.years['2026'].fileId, undefined);
});

test('⭐ ประโยคนโยบายของปฏิทิน · เครดิต 0 พูดเวลาตัดรอบ · เครดิต N ไม่พูดเวลา · ไม่มี "เครดิต 0 วัน" · ไม่มี "ประมาณการ"', () => {
  const zero = policyWordsOf(meemetta(0));
  assert.equal(zero.when, 'ตามปฏิทินลูกค้า 2026 (24 รอบ)');
  assert.equal(zero.pay, 'วันจ่ายของรอบเดียวกัน');
  assert.equal(zero.cutoff, 'ส่งเอกสารก่อน 16:00 น.');
  const thirty = policyWordsOf(meemetta(30));
  assert.equal(thirty.pay, 'ครบเครดิต 30 วันแล้วเข้ารอบจ่าย');
  /* หนึ่งสิ่งหนึ่งชื่อ — ประโยค ③ ของโมดัล = ท้ายโมดัล/toast/เธรด (describeRule) */
  assert.ok(describeRule(meemetta(0)).includes(zero.pay), describeRule(meemetta(0)));
  assert.ok(describeRule(meemetta(30)).includes(thirty.pay), describeRule(meemetta(30)));
  assert.equal(thirty.cutoff, '', 'เครดิต N ไม่พูดเวลา (system-design §6)');
  const typing = formWordsOf(setCutoffTime(chooseCalPay(confirmAll(draftMonths(newCalendarForm(), 2026, MEE_PATTERN, 10), 2026), 'same'), '16:00'));
  assert.deepEqual([typing.when, typing.pay, typing.cutoff], ['ตามปฏิทินลูกค้า 2026 (6 รอบ)', 'วันจ่ายของรอบเดียวกัน', 'ส่งเอกสารก่อน 16:00 น.']);
  assert.equal(formWordsOf(newCalendarForm()).when, 'ตามปฏิทินลูกค้า');
  for (const words of [zero, thirty, typing]) assert.doesNotMatch(JSON.stringify(words), /เครดิต 0 วัน|ประมาณการ/);
});

test('⭐ การเตือนของลูกค้าปฏิทิน = วันตัดรอบ + ขอปฏิทินปีหน้า (ตัวเดียวกับ cron) · มีเมตตา กระดิ่งแรก จ. 23 พ.ย. 2026', () => {
  const zero = reminderChipsOf(meemetta(0), { todayIso: TODAY });
  assert.deepEqual(zero.map((c) => c.key), [BELL.BILLING_DUE, BELL.DUE_SOON, BELL.BILLING_CUTOFF, BELL.CALENDAR_MISSING]);
  assert.match(zero[2].text, /ส่งก่อน 16:00 น\./);
  assert.equal(zero[3].text, 'ขอปฏิทิน 2027 · ทุกสัปดาห์ตั้งแต่ จ. 23 พ.ย. 2026');
  const thirty = reminderChipsOf(meemetta(30), { todayIso: TODAY });
  assert.match(thirty[2].text, /วันสุดท้ายที่วางบิลแล้วทันรอบ/);
  assert.doesNotMatch(thirty[2].text, /16:00/, 'เครดิต N ไม่พูดเวลา');
  assert.equal(thirty[3].text, 'ขอปฏิทิน 2027 · ทุกสัปดาห์ตั้งแต่ จ. 23 พ.ย. 2026', 'เครดิต 30 วันแรกเดียวกัน');
});

test('⭐ การ์ด: ครอบ "ปฏิทิน 2026 · 24 รอบ" · แถบ "ขอปฏิทิน 2027" ขึ้นพร้อมกระดิ่ง (23 พ.ย.) · ใส่ปี 2027 แล้วหายเอง', () => {
  assert.equal(calendarCardOf({ v: 4, need: 'none' }, TODAY), null);
  const before = calendarCardOf(meemetta(0), TODAY);
  assert.equal(before.coverage, 'ปฏิทิน 2026 · 24 รอบ');
  assert.equal(before.banner, null, 'ยังไม่ถึงช่วงเตือน');
  assert.match(before.upcoming, /ปฏิทินใช้ได้ถึง ธ\.ค\. 2026 · เตือนขอปฏิทิน 2027 ทุกสัปดาห์ตั้งแต่ จ\. 23 พ\.ย\. 2026/);
  assert.deepEqual(before.years, [{ year: 2026, count: 24, fileId: FILE_2026 }]);
  assert.match(before.cutoffLine, /ส่งเอกสารก่อน 16:00 น\./);
  assert.match(calendarCardOf(meemetta(30), TODAY).cutoffLine, /ไม่พูดเวลา/);
  assert.equal(calendarCardOf(meemetta(0, { cutoffTime: null }), TODAY).cutoffLine, '');

  for (const credit of [0, 30]) {
    const due = calendarCardOf(meemetta(credit), '2026-11-23');
    assert.equal(due.banner.title, 'ขอปฏิทิน 2027');
    assert.equal(due.banner.year, 2027);
    assert.match(due.banner.text, /ใส่วันเองได้/);
    assert.doesNotMatch(due.banner.text, /ประมาณการ/);
    assert.equal(due.upcoming, '');
  }
  const runs2027 = MEEMETTA_2026.map((r) => ({ cutoff: r.cutoff.replace('2026', '2027'), pay: r.pay.replace('2026', '2027') }));
  const filled = calendarCardOf(meemetta(0, { years: { 2026: { runs: MEEMETTA_2026 }, 2027: { runs: runs2027 } } }), '2026-11-23');
  assert.equal(filled.banner, null, 'มีปีถัดไปแล้ว = หยุดเตือน');
  assert.equal(filled.coverage, 'ปฏิทิน 2026 · 24 รอบ · ปฏิทิน 2027 · 24 รอบ');
});

test('ตัวอย่างกระดิ่งวันตัดรอบ (ผลก่อนบันทึก) = ข้อความจาก cutoffBell ตัวเดียวกับ cron · ปฏิทินหมด = ไม่มีตัวอย่าง', () => {
  const zero = cutoffBellPreviewOf(meemetta(0), TODAY, { customer: 'บริษัท มีเมตตา จำกัด' });
  assert.equal(zero.fireOn, '2026-10-07');
  assert.equal(zero.text, 'พรุ่งนี้ (พฤ. 8 ต.ค.) เป็นวันตัดรอบของ บริษัท มีเมตตา จำกัด — ส่งเอกสารก่อน 16:00 น.');
  const thirty = cutoffBellPreviewOf(meemetta(30), TODAY, { customer: 'บริษัท มีเมตตา จำกัด' });
  assert.match(thirty.text, /วางบิล บริษัท มีเมตตา จำกัด แล้วทันรอบจ่าย/);
  assert.doesNotMatch(thirty.text, /16:00/);
  assert.equal(cutoffBellPreviewOf(meemetta(0), '2026-12-23'), null, 'หลังวันตัดรอบสุดท้าย = ไม่มีรอบถัดไป (หยุด ไม่เดา)');
  assert.equal(cutoffBellPreviewOf({ v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 30, runs: null }, TODAY), null);
});

test('⭐ Q3 หยุดรอปฏิทินใหม่: ผลก่อนบันทึกได้รอบเท่าที่มี + "ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้" · รอบถัดไปในตาราง (ก่อนตอบข้อ ③) ไม่สมมติเครดิต', () => {
  const pv = policyPreview(meemetta(0), '2026-12-10', { count: 3 });
  assert.equal(pv.rows.length, 1);
  assert.equal(pv.missing.text, 'ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้');
  const form = formFromStored(meemetta(0), { todayIso: TODAY });
  assert.deepEqual(calendarUpcomingRuns(form.calendar, TODAY), [
    { cutoff: '2026-10-08', pay: '2026-10-15' }, { cutoff: '2026-10-21', pay: '2026-10-30' }, { cutoff: '2026-11-09', pay: '2026-11-16' },
  ]);
});

test('จอ "งวดที่วันจะเปลี่ยน" ของปฏิทิน: ปีที่ยังไม่มีปฏิทิน = ไม่แตะพร้อมคำของ lib · ทางช้ากว่าอยู่ในปีที่ขาด · ใส่เองตอนยังไม่มีปฏิทิน = เสนอให้ยืนยัน', () => {
  assert.equal(keptTextOf({ reason: 'calendarMissing', year: 2027, month: '2027-01', text: 'ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้' }), 'ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้ — ระบบไม่เดาวัน ไม่แตะ');
  assert.match(keptTextOf({ reason: 'calendarMissing' }), /ใส่วันเองได้/);
  assert.match(
    keptTextOf({ reason: 'dueNotOnRound', earlier: { billingDate: '2026-12-08', dueDate: '2026-12-15' }, later: null, laterMissing: 'ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้' }),
    /ช้ากว่า ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้$/,
  );
  const typed = { id: 'x', seq: 4, change: 'newDue', prevBillingDate: '2027-01-09', billingDate: '2027-01-09', prevDueDate: '2027-01-20', dueDate: '2027-01-15', typedInGap: true };
  assert.match(changeTextOf(typed), /^กำหนดชำระ .* → .* · เดิมใส่เองตอนยังไม่มีปฏิทิน/);
  assert.doesNotMatch(changeTextOf({ ...typed, typedInGap: undefined }), /ใส่เอง/);
});
