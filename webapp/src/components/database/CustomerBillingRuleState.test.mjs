// สถานะฟอร์มของโมดัล "วางบิลและกำหนดชำระ" (รุ่นสี่ · แบบ A · มติเจ้าของ 29/09)
// ⭐ สิ่งที่ต้องไม่หลุด: ไม่มีค่าตั้งต้น (รูปเดิมเปิดมา = ยังไม่ตอบ) · ตัวตัดสินคือ normalizeRule(allowLegacy:false) ตัวเดียวกับ API ·
//    กติกาเดิม (รุ่นสอง) เปิดแล้วบันทึกซ้ำได้วันเท่าเดิม · ไม่ทำลายกติกาที่จอนี้แก้ไม่ได้ · ห้ามพูด "เครดิต 0 วัน" ·
//    ไม่ต้องวางบิล = ไม่มีกระดิ่งวางบิล · 409 ไม่ทิ้งที่กรอก · ตัวล็อกเป็นสตริงดิบ
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRedateConflicts, blankForm, changeTextOf, chooseBill, chooseNeed, choosePay, clearTiming, conflictOf, creditNumber,
  evaluateForm, everyDays, formFromStored, formWordsOf, keptTextOf, nextRoundNeedingDay, payDayStateOf, policyWordsOf,
  redatePayloadOf, reminderChipsOf, saveBlockOf, savePayloadOf, setCreditDays, setRoundDay, setRoundOff, stampTextOf,
  toggleBillDay, togglePayDay,
} from './CustomerBillingRuleState.js';
import { BELL, dueDateForBilling, dueFor, normalizeRule, policyPreview, ruleOf, sameRule } from '../../lib/sales/billingRule.js';
import { BILLING_V4_SCHEMA_MISSING } from '../../lib/sales/billingPolicySchema.js';

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

test('⭐ กติกาที่จอนี้แก้ไม่ได้ (ปฏิทิน · วันในสัปดาห์ · เครดิต + รอบจ่าย) = บอกเหตุ · ไม่ตอบข้อ ① ให้ (กดบันทึกเฉย ๆ ไม่ทับ)', () => {
  const stored = [
    { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 30, runs: { kind: 'weekday', weekday: 3, nths: [2, 4] } },
    { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 30, runs: { kind: 'monthly', rounds: [{ cutoffDay: 25, payDay: 25, payMonthOffset: 0 }] } },
    { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 0, runs: { kind: 'calendar', years: { 2026: { runs: [{ cutoff: '2026-10-08', pay: '2026-10-15' }] } } } },
    /* review 29/09: เวลาตัดรอบไม่มีช่องบนฟอร์ม — เดิมเปิดเป็นรอบจ่ายธรรมดา แล้วกดบันทึกเฉย ๆ ทิ้ง '16:00' เงียบ ๆ */
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

test('⭐ การเตือน: ไม่ต้องวางบิล = ไม่มีกระดิ่งวางบิล (มีแต่ครบกำหนดชำระ) · กระดิ่งวันตัดรอบ (4b) ไม่พูดในรอบนี้', () => {
  const none = reminderChipsOf({ v: 4, need: 'none' });
  assert.deepEqual(none.filter((c) => c.on).map((c) => c.key), [BELL.DUE_SOON]);
  assert.ok(none.some((c) => !c.on && /วางบิล/.test(c.text)));
  const runs = reminderChipsOf({ v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 0, runs: { kind: 'monthly', rounds: [{ cutoffDay: 5, payDay: 25, payMonthOffset: 0 }] } });
  assert.deepEqual(runs.map((c) => c.key), [BELL.BILLING_DUE, BELL.DUE_SOON]);
  assert.match(runs[0].text, /0–3 วัน/);
  assert.match(reminderChipsOf(null)[0].text, /งวดที่ใส่วันไว้/, 'ยังไม่ระบุ = กระดิ่งเฉพาะงวดที่มีวันวางบิล');
  assert.match(reminderChipsOf({ credit: false })[0].text, /งวดที่ใส่วันไว้/);
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
