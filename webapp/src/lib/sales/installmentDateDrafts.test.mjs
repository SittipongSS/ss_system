// ── โหมดตั้งวันงวดในตาราง (แบบ C · มติ 28/09) — ร่าง · สรุป · ล็อก · คำเตือน · ทางลัด · แผงเติม ──
//
// สิ่งที่ชุดนี้ล็อกไว้: ร่างนับจากความต่างจริง · งวดที่ล็อกถูกทิ้งพร้อมเหตุ (ไม่ส่งขึ้น API) · body ของ schedule-many ·
// ข้อมูลตัวอย่างในบรีฟ (AR-281 รอบ 21→30 · AR-622 ไม่มีเครดิต 4 งวด · AR-015 เครดิต 30 วัน 12 งวด) ได้วันตรงม็อก
// · ปฏิทินเริ่มวันอาทิตย์ · ไม่มีค่าตั้งต้น (ทุกทางลัดต้องมีคนแตะ)
// ⭐ รุ่นสี่ (มติเจ้าของ 29/09 แบบ A): ตัวแก้ตาม `dateModeOf` (rounds · cadence · free · dueOnly + รายงวด exception/skip) ·
//   รูปเดิม { credit:false } = free (ไม่มีวันวางบิลปลอม — รอบกรรมการ 29/09) · ติ๊ก billingSkip เป็นร่าง · billingException ไปกับวันวางบิลใหม่
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_DATES, applyFillPlan, calendarMonthFor, clearedDates, continueChoiceFor, creditDaysOf, creditFillSuggestion, currentDates,
  dateCellTapCloses, dateModeKind, dateRuleShape, dateViewOf, dateWarnings, datedFillCount, datesEmpty, datesOf, draftChanges,
  dueSourceOf, fillInputRows, openViewOf, rowDateMode, splitsFields,
  dateLockView, fillKindOf, fillStartMonths, fillTargetsOf, keepDueChoiceFor, nextEmptyRow, pickBillingDate, planDateFill,
  quickDueChoices, replacesSavedDue, roundChoicesFor, sameDates, scheduleManyRows, shiftMonth, sundayFirstCells, withDraft,
} from './installmentDateDrafts.js';
import { installmentDateLock } from './installmentScheduleMany.js';
import { NO_BILLING_WRITE_ERROR, validateInstallmentDates } from './billingRule.js';

const TODAY = '2026-09-28';
/* AR-281: วางบิลทุกวันที่ 21 → เงินเข้าวันที่ 30 เดือนถัดไป */
const AR281 = { billing: { mode: 'monthly', days: [21] }, payment: { mode: 'monthly', rounds: [{ day: 30, monthOffset: 1 }] } };
/* ลูกค้าสองรอบ (แต่ง): 10 → 25 เดือนเดียวกัน · 25 → 10 เดือนถัดไป */
const TWO = { billing: { mode: 'monthly', days: [10, 25] }, payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }, { day: 10, monthOffset: 1 }] } };
const CREDIT30 = { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 30 } };
const ANYDAY_25 = { billing: { mode: 'anyday' }, payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 1 }] } };
const NO_CREDIT = { credit: false };
/* รุ่นสี่ (mig 0393) */
const NONE = { v: 4, need: 'none' };
const NO_TIMING = { v: 4, need: 'required', billing: null };
const PAY_SAME = { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 0, runs: null };

const inst = (seq, over = {}) => ({
  id: `i${seq}`, seq, status: 'pending', kind: 'regular', amount: 1000, updatedAt: `u${seq}`, label: `งวดที่ ${seq}`, ...over,
});

test('ค่าของงวด — ว่างเป็นสตริงว่าง · วันผิดปฏิทินตัดทิ้ง · วันวางบิลชนะเหตุการณ์ (CHECK)', () => {
  assert.deepEqual(datesOf(null), EMPTY_DATES);
  assert.deepEqual(datesOf({ billingDate: '2026-02-31', dueDate: '2026-10-05' }),
    { billingDate: '', billingEvent: '', dueDate: '2026-10-05', billingSkip: false });
  assert.equal(datesOf({ billingSkip: true }).billingSkip, true);
  assert.equal(datesOf({ billingSkip: null }).billingSkip, false, 'null ในฐาน = ไม่ติ๊ก (ตามลูกค้า)');
  assert.ok(datesEmpty({ billingSkip: true }), 'ติ๊กไม่ใช่วัน');
  assert.ok(!sameDates({ billingSkip: true }, {}), 'ติ๊กเปลี่ยน = ร่างต่างจากฐาน');
  assert.deepEqual(clearedDates({ billingDate: '2026-10-01', dueDate: '2026-10-05', billingSkip: true }), { ...EMPTY_DATES, billingSkip: true },
    'ล้างวันคงติ๊ก');
  assert.deepEqual(datesOf({ billingDate: '2026-10-21', billingEvent: 'หลังติดตั้ง' }).billingEvent, '');
  assert.equal(datesOf({ billingEvent: '  หลังติดตั้ง ' }).billingEvent, 'หลังติดตั้ง');
  assert.ok(datesEmpty({}));
  assert.ok(sameDates({ dueDate: '2026-10-05', billingDate: null }, { dueDate: '2026-10-05', billingDate: '' }));
});

test('ร่าง: เท่าค่าในฐาน = ถอดออกเอง · จำ updatedAt ตอนเริ่มร่าง · ค่าปัจจุบันอ่านร่างก่อน', () => {
  const row = inst(1, { dueDate: '2026-10-05' });
  let drafts = withDraft({}, row, { dueDate: '2026-10-20' });
  assert.deepEqual(drafts.i1, { billingDate: '', billingEvent: '', dueDate: '2026-10-20', billingSkip: false, baseUpdatedAt: 'u1' });
  assert.equal(currentDates(row, drafts).dueDate, '2026-10-20');
  drafts = withDraft(drafts, { ...row, updatedAt: 'u1-new' }, { dueDate: '2026-10-25' });
  assert.equal(drafts.i1.baseUpdatedAt, 'u1', 'แก้ร่างซ้ำไม่เลื่อนตัวล็อก — ยังรู้ว่าแถวเปลี่ยนใต้มือ');
  drafts = withDraft(drafts, row, { dueDate: '2026-10-05' });
  assert.deepEqual(drafts, {}, 'กลับไปค่าเดิม = ไม่มีอะไรเปลี่ยน');
});

test('สรุปการเปลี่ยน: งวดที่ล็อก/หายไปถูกทิ้งพร้อมเหตุ · แถวที่ถูกแก้จากอีกหน้าต่างติดธง stale · เรียงตามงวด', () => {
  const rows = [inst(2, { dueDate: '2026-11-01' }), inst(1), inst(3, { status: 'reported' }), inst(4, { updatedAt: 'u4-new' })];
  const drafts = {
    i2: { dueDate: '2026-11-15', baseUpdatedAt: 'u2' },
    i1: { dueDate: '2026-10-15', baseUpdatedAt: 'u1' },
    i3: { dueDate: '2026-12-15', baseUpdatedAt: 'u3' },
    i4: { dueDate: '2027-01-15', baseUpdatedAt: 'u4' },
    gone: { dueDate: '2027-02-15', baseUpdatedAt: 'x' },
  };
  const lockOf = (row) => dateLockView(row);
  const { changes, dropped } = draftChanges(rows, drafts, lockOf);
  assert.deepEqual(changes.map((c) => [c.row.seq, c.stale]), [[1, false], [2, false], [4, true]]);
  assert.deepEqual(dropped.map((d) => d.reason), ['งวดนี้ไม่อยู่ในใบแล้ว', 'แจ้งชำระแล้ว — รอบัญชีตรวจ']);
  assert.equal(changes.filter(replacesSavedDue).length, 1, 'แทนกำหนดชำระเดิมเฉพาะงวด 2');
  assert.deepEqual(scheduleManyRows(changes), [
    { id: 'i1', billingDate: null, billingEvent: null, dueDate: '2026-10-15', updatedAt: 'u1' },
    { id: 'i2', billingDate: null, billingEvent: null, dueDate: '2026-11-15', updatedAt: 'u2' },
    { id: 'i4', billingDate: null, billingEvent: null, dueDate: '2027-01-15', updatedAt: 'u4-new' },
  ], 'ส่งตัวล็อกของแถวที่ตาเห็นตอนนี้ — หลังบอก stale แล้วกดซ้ำต้องไม่ 409 วน');
});

test('body ของ schedule-many: รอเหตุการณ์ไม่มีวันวางบิล · ล้างวัน = null ทั้งสามช่อง', () => {
  const rows = [inst(1, { billingDate: '2026-10-21', dueDate: '2026-11-30' }), inst(2, { dueDate: '2026-12-01' })];
  const drafts = withDraft(withDraft({}, rows[0], { billingEvent: 'หลังติดตั้ง' }), rows[1], EMPTY_DATES);
  const body = scheduleManyRows(draftChanges(rows, drafts).changes);
  assert.deepEqual(body[0], { id: 'i1', billingDate: null, billingEvent: 'หลังติดตั้ง', dueDate: null, updatedAt: 'u1' });
  assert.deepEqual(body[1], { id: 'i2', billingDate: null, billingEvent: null, dueDate: null, updatedAt: 'u2' });
});

test('🔴 ชื่อเหตุการณ์ที่พิมพ์เอง: ร่างเก็บตามที่พิมพ์ (ช่องว่างท้าย/กลางคำไม่หาย) · ตัดช่องว่างตอนเทียบและตอนส่งเท่านั้น', () => {
  const row = inst(1);
  /* 🐞 review R-UI: เดิม withDraft เก็บ datesOf(value) ที่ trim ⇒ "รอ " กลายเป็น "รอ" แล้วพิมพ์ต่อได้ "รอPO" */
  let drafts = withDraft({}, row, { ...EMPTY_DATES, billingEvent: 'รอ ' });
  assert.equal(drafts.i1.billingEvent, 'รอ ', 'ช่องว่างท้ายอยู่รอดระหว่างพิมพ์');
  drafts = withDraft(drafts, row, { ...EMPTY_DATES, billingEvent: 'รอ PO' });
  assert.equal(drafts.i1.billingEvent, 'รอ PO', 'ช่องว่างกลางคำไม่หาย');
  assert.equal(currentDates(row, drafts).billingEvent, 'รอ PO');
  /* ชื่อที่ขึ้นต้นด้วยชื่อสำเร็จรูป ("หลังติดตั้ง" → "หลังติดตั้งเสร็จ") พิมพ์ต่อได้ — ร่างไม่ถูกแทนทั้งคำ */
  drafts = withDraft(drafts, row, { ...EMPTY_DATES, billingEvent: 'หลังติดตั้ง' });
  drafts = withDraft(drafts, row, { ...EMPTY_DATES, billingEvent: 'หลังติดตั้งเสร็จ' });
  assert.equal(drafts.i1.billingEvent, 'หลังติดตั้งเสร็จ');
  /* ตอนส่ง = ตัดช่องว่างหัวท้าย · ความยาวตัดที่ BILLING_EVENT_MAX */
  drafts = withDraft({}, row, { ...EMPTY_DATES, billingEvent: '  รอ PO  ' });
  assert.equal(scheduleManyRows(draftChanges([row], drafts).changes)[0].billingEvent, 'รอ PO');
  assert.equal(withDraft({}, row, { billingEvent: 'ก'.repeat(500) }).i1.billingEvent.length, 120);
  /* เทียบแบบตัดช่องว่าง: พิมพ์ช่องว่างท้ายชื่อที่บันทึกไว้ = ไม่นับเป็นการเปลี่ยน · ช่องว่างล้วน = ไม่มีร่าง */
  const saved = inst(2, { billingEvent: 'รอ PO' });
  assert.deepEqual(withDraft({}, saved, { ...EMPTY_DATES, billingEvent: 'รอ PO ' }), {});
  assert.deepEqual(withDraft({}, row, { ...EMPTY_DATES, billingEvent: '   ' }), {});
  /* มีวันวางบิล = ไม่มีเหตุการณ์ (CHECK) — ข้อความที่พิมพ์ค้างไม่ติดไปกับร่าง */
  assert.equal(withDraft({}, row, { billingDate: '2026-10-21', billingEvent: 'รอ ', dueDate: '' }).i1.billingEvent, '');
});

test('ล้างวันวางบิลของลูกค้ารูปเดิม/งวดยกเว้น (ปุ่ม "ล้างวันวางบิล" ของตัวแก้): ส่ง billingDate null · กำหนดชำระคงเดิม', () => {
  /* งวดมีวันวางบิลค้างจากรอบเดิม (รอบถูกถอดทีหลัง) — ไม่ล้างได้ = ป้าย "เลยรอบวางบิล" ค้างถาวร */
  const row = inst(1, { billingDate: '2026-09-21', dueDate: '2026-10-30' });
  const v = currentDates(row, {});
  const drafts = withDraft({}, row, { ...v, billingDate: '' });
  assert.deepEqual(scheduleManyRows(draftChanges([row], drafts).changes),
    [{ id: 'i1', billingDate: null, billingEvent: null, dueDate: '2026-10-30', updatedAt: 'u1' }]);
});

test('รูปของรอบ → ตัวแก้ · ที่มาของกำหนดชำระ (ตามรอบ · ตามเครดิต N วัน · ชำระวันวางบิล · แก้ทับ · ใส่เอง)', () => {
  assert.equal(dateModeKind(AR281), 'rounds');
  assert.equal(dateModeKind(CREDIT30), 'cadence');
  /* รุ่นสอง "ทุกวัน + เงินเข้าตามวันที่" = รอบจ่ายของรุ่นสี่ (ชิปรอบ · 0 ลูกค้าบน prod ใช้รูปนี้ 28/09) */
  assert.equal(dateModeKind(ANYDAY_25), 'rounds');
  /* ⭐ รอบกรรมการ 29/09: รูปเดิม { credit:false } = free (กำหนดชำระนำ วันวางบิลไม่บังคับ) — ไม่ต้องใส่วันวางบิลปลอมระหว่างรอมติข้อ 4 */
  assert.equal(dateModeKind(NO_CREDIT), 'free');
  assert.equal(dateModeKind(null), 'free');
  assert.equal(dateModeKind(NO_TIMING), 'free');
  assert.equal(dateModeKind(NONE), 'dueOnly');
  assert.equal(dateModeKind(PAY_SAME), 'cadence');
  assert.equal(creditDaysOf(CREDIT30), 30);
  assert.equal(creditDaysOf(NO_CREDIT), 0);
  assert.equal(creditDaysOf(PAY_SAME), 0);
  assert.equal(creditDaysOf(AR281), null);
  assert.equal(creditDaysOf(null), null);
  assert.equal(creditDaysOf(NONE), null);
  /* รูปเดิม: เลือกวันวางบิล = กำหนดชำระวันเดียวกัน **ถ้ายังว่าง** (§2.4) · ป้าย "ชำระวันวางบิล" (ห้าม "ตามเครดิต 0 วัน") · ย้ายวัน = "แก้ทับ" */
  assert.deepEqual(pickBillingDate(NO_CREDIT, '2026-10-12'),
    { billingDate: '2026-10-12', billingEvent: '', dueDate: '2026-10-12', billingSkip: false });
  assert.equal(pickBillingDate(NO_CREDIT, '2026-10-12', { dueDate: '2026-10-30' }).dueDate, '2026-10-30',
    'free: กำหนดชำระที่ตั้งไว้แล้วไม่ถูกทับ (ช่องนำ)');
  assert.equal(pickBillingDate(PAY_SAME, '2026-10-12', { dueDate: '2026-10-30' }).dueDate, '2026-10-12',
    'cadence: แตะวันวางบิลใหม่ = ตัดสินใหม่ตามกติกา');
  assert.equal(dueSourceOf(NO_CREDIT, pickBillingDate(NO_CREDIT, '2026-10-12')).label, 'ชำระวันวางบิล');
  assert.deepEqual(Object.values(dueSourceOf(NO_CREDIT, { billingDate: '2026-10-12', dueDate: '2026-10-20' })).slice(0, 2), ['override', 'แก้ทับ']);
  assert.equal(dueSourceOf({ billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 0 } },
    { billingDate: '2026-10-12', dueDate: '2026-10-12' }).label, 'ชำระวันวางบิล');
  assert.doesNotMatch(dueSourceOf(NO_CREDIT, pickBillingDate(NO_CREDIT, '2026-10-12')).label, /เครดิต 0/);
  /* ยังไม่ตั้ง: ทั้งสองช่องกรอกเองได้ — ไม่มีอะไรคิดให้ (วันวางบิลไม่ขยับกำหนดชำระ) */
  assert.equal(dueSourceOf(null, { billingDate: '2026-10-01', dueDate: '2026-10-30' }).label, 'ใส่เอง');
  assert.deepEqual(pickBillingDate(null, '2026-10-01'), { billingDate: '2026-10-01', billingEvent: '', dueDate: '', billingSkip: false });
  assert.equal(dueSourceOf(AR281, { billingDate: '2026-10-21', dueDate: '2026-11-30' }).label, 'ตามรอบ');
  assert.equal(dueSourceOf(CREDIT30, pickBillingDate(CREDIT30, '2026-12-26')).label, 'ตามเครดิต 30 วัน');
  const over = dueSourceOf(AR281, { billingDate: '2026-10-21', dueDate: '2026-12-05' });
  assert.deepEqual([over.key, over.label, over.computed], ['override', 'แก้ทับ', '2026-11-30']);
  assert.equal(dueSourceOf(AR281, { dueDate: '2026-12-05' }).label, 'ใส่เอง');
  assert.equal(dueSourceOf(NO_CREDIT, { dueDate: '2026-12-05' }).label, 'ใส่เอง', 'มีแต่กำหนดชำระ (ใบเก่า) = ใส่เอง ทุกแบบ');
  assert.equal(dueSourceOf(AR281, {}).label, '');
  assert.deepEqual(pickBillingDate(AR281, '2026-11-21'), { billingDate: '2026-11-21', billingEvent: '', dueDate: '2026-12-30', billingSkip: false });
  /* ไม่ต้องวางบิล: กำหนดชำระตรงตัว ไม่มีป้าย ('direct') · งวดยกเว้น (มีวันวางบิล) กำหนดชำระไม่คิดจากวันวางบิล */
  assert.deepEqual(dueSourceOf(NONE, { dueDate: '2026-10-05' }), { key: 'direct', label: '' });
  assert.equal(pickBillingDate(NONE, '2026-10-01', { dueDate: '2026-10-05' }).dueDate, '2026-10-05');
  assert.equal(pickBillingDate(NONE, '2026-10-01').dueDate, '', 'ไม่ต้องวางบิล = ไม่มีกติกาให้คิดกำหนดชำระ');
});

test('⭐ รุ่นสี่: ตัวแก้รายงวด — ไม่ต้องวางบิล [กำหนดชำระ | รอเหตุการณ์] · งวดยกเว้น "งวดนี้ต้องวางบิล…" · ติ๊ก "งวดนี้ไม่ต้องวางบิล"', () => {
  const plain = rowDateMode(NONE, inst(1));
  assert.deepEqual([plain.kind, plain.views, plain.start, plain.billingColumn], ['dueOnly', ['due', 'event'], 'due', 'notNeeded']);
  /* ยืนยันในโมดัลแล้ว (ธงของโหมด) / มีวันวางบิลแล้ว = exception [วันวางบิล | กำหนดชำระ | รอเหตุการณ์] — ลำดับวันวางบิล → กำหนดชำระ */
  const ex = rowDateMode(NONE, inst(1), { exception: true });
  assert.deepEqual([ex.kind, ex.views, ex.start, ex.override], ['exception', ['bill', 'due', 'event'], 'bill', 'billing']);
  assert.equal(rowDateMode(NONE, inst(1, { billingDate: '2026-10-01' })).start, 'due', 'มีวันวางบิลแล้ว = เปิดที่กำหนดชำระ');
  /* ติ๊กของลูกค้าต้องวางบิล = dueOnly เฉพาะงวดนั้น */
  const skip = rowDateMode(CREDIT30, inst(1, { billingSkip: true }));
  assert.deepEqual([skip.kind, skip.override, skip.billingColumn], ['dueOnly', 'skip', 'skip']);
  /* free = เปิดที่กำหนดชำระ แต่ปุ่มยังเรียงวันวางบิล → กำหนดชำระ (§11 ข้อ 15 ไม่รับการสลับลำดับ) */
  const free = rowDateMode(NO_CREDIT, inst(1));
  assert.deepEqual([free.kind, free.views, free.start, free.billingColumn], ['free', ['bill', 'due', 'event'], 'due', 'optional']);
  assert.equal(rowDateMode(NO_TIMING, inst(1)).billingColumn, 'expected');
  assert.ok(splitsFields(plain) && splitsFields(ex) && splitsFields(free));
  assert.ok(!splitsFields(rowDateMode(CREDIT30, inst(1))) && !splitsFields(rowDateMode(AR281, inst(1))));
});

test('⭐ รุ่นสี่: body ของ schedule-many — billingSkip เฉพาะงวดที่ติ๊กเปลี่ยน · billingException เฉพาะงวดยืนยันที่ได้วันวางบิลใหม่', () => {
  const rows = [inst(1), inst(2, { billingSkip: true }), inst(3, { dueDate: '2026-10-05' }), inst(4, { billingDate: '2026-10-01' })];
  let drafts = withDraft({}, rows[0], { ...EMPTY_DATES, billingSkip: true, dueDate: '2026-10-01' });
  drafts = withDraft(drafts, rows[1], { ...EMPTY_DATES, billingSkip: false });
  drafts = withDraft(drafts, rows[2], { dueDate: '2026-10-05', billingDate: '2026-10-02' });
  drafts = withDraft(drafts, rows[3], { billingDate: '2026-10-01', dueDate: '2026-10-09' });
  const body = scheduleManyRows(draftChanges(rows, drafts).changes, { exceptionIds: new Set(['i3', 'i4']) });
  assert.deepEqual(body, [
    { id: 'i1', billingDate: null, billingEvent: null, dueDate: '2026-10-01', billingSkip: true, updatedAt: 'u1' },
    { id: 'i2', billingDate: null, billingEvent: null, dueDate: null, billingSkip: false, updatedAt: 'u2' },
    { id: 'i3', billingDate: '2026-10-02', billingEvent: null, dueDate: '2026-10-05', billingException: true, updatedAt: 'u3' },
    /* งวด 4 ยืนยันไว้ แต่วันวางบิลเดิม (แก้แค่กำหนดชำระ) — ไม่ใช่ข้อยกเว้นใหม่ ไม่ลงประวัติซ้ำ */
    { id: 'i4', billingDate: '2026-10-01', billingEvent: null, dueDate: '2026-10-09', updatedAt: 'u4' },
  ]);
  /* ด่านเขียนของ API ตัวเดียวกัน: ลูกค้าไม่ต้องวางบิล + วันวางบิลใหม่ ต้องมีธงยืนยัน */
  const next = (row) => ({ ...datesOf(row), ...body.find((b) => b.id === row.id) });
  assert.equal(validateInstallmentDates(rows[2], next(rows[2]), NONE), null);
  assert.equal(validateInstallmentDates(rows[2], { ...next(rows[2]), billingException: false }, NONE), NO_BILLING_WRITE_ERROR);
  assert.equal(validateInstallmentDates(rows[0], next(rows[0]), CREDIT30), null, 'ติ๊กงวดที่ไม่มีวันวางบิลของลูกค้าต้องวางบิล = ผ่าน');
});

test('🔴 review 29/09: เลื่อนวันวางบิลของงวดยกเว้นที่บันทึกไว้แล้ว (ลูกค้าไม่ต้องวางบิล) ส่งธงยืนยันเอง — ไม่ตีกลับ 400', () => {
  /* งวด 2 มีวันวางบิลในฐาน = "งวดนี้ต้องวางบิล…" ที่ยืนยันรอบก่อน (หรือวันค้างจากก่อนลูกค้าเปลี่ยน) — เมนูยืนยันไม่ขึ้นแล้ว
     (needExceptionActions ตอบ requireBilling เท็จ) ⇒ ธงต้องมาจากกติกา ไม่ใช่ exceptionIds ของรอบนี้ */
  const saved = inst(2, { billingDate: '2026-10-10', dueDate: '2026-10-10' });
  const plain = inst(3, { dueDate: '2026-10-20' });
  let drafts = withDraft({}, saved, { billingDate: '2026-10-15', dueDate: '2026-10-15' });
  drafts = withDraft(drafts, plain, { dueDate: '2026-10-21' });
  const changes = draftChanges([saved, plain], drafts).changes;
  const body = scheduleManyRows(changes, { exceptionIds: new Set(), rule: NONE });
  assert.equal(body[0].billingException, true);
  assert.equal(body[1].billingException, undefined, 'งวดที่ไม่มีวันวางบิล ไม่ได้ธงลอย ๆ');
  const next = { ...datesOf(saved), ...body[0] };
  assert.equal(validateInstallmentDates(saved, next, NONE), null, 'ด่านเขียนของ API ตัวเดียวกันรับ');
  /* ล้างวันวางบิลทิ้ง (กลับไปไม่ต้องวางบิล) = ไม่ใช่ข้อยกเว้น */
  const cleared = scheduleManyRows(draftChanges([saved], withDraft({}, saved, { dueDate: '2026-10-15' })).changes, { rule: NONE });
  assert.equal(cleared[0].billingException, undefined);
  /* ลูกค้าต้องวางบิล = ไม่ใช่ข้อยกเว้น · ไม่ส่ง rule (ผู้เรียกเดิม) = พฤติกรรมเดิม */
  assert.equal(scheduleManyRows(changes, { rule: CREDIT30 })[0].billingException, undefined);
  assert.equal(scheduleManyRows(changes)[0].billingException, undefined);
});

test('🔴 review 28/09: มีวันวางบิลแต่ไม่มีกำหนดชำระ (กติกาคิดได้) = "missing" พร้อมวันที่คิดได้ — ปุ่มแตะเดียวในตัวแก้', () => {
  /* ไม่มีเครดิต = วันวางบิลเอง ("ใช้วันวางบิล") · เครดิต N = +N · รอบรายเดือน = เงินเข้าของรอบ — ป้ายว่าง (เซลล์บอก "ยังไม่มีกำหนดชำระ") */
  const missing = (value, row) => { const x = dueSourceOf(value, row); return { key: x.key, label: x.label, computed: x.computed }; };
  assert.deepEqual(missing(NO_CREDIT, { billingDate: '2026-10-12' }), { key: 'missing', label: '', computed: '2026-10-12' });
  assert.deepEqual(missing(CREDIT30, { billingDate: '2026-10-12', dueDate: '' }), { key: 'missing', label: '', computed: '2026-11-11' });
  assert.deepEqual(missing(AR281, { billingDate: '2026-10-21' }), { key: 'missing', label: '', computed: '2026-11-30' });
  /* ไม่มีอะไรให้คิด = ไม่ใช่ missing (ยังไม่ตั้ง · ไม่มีวันวางบิล · รอเหตุการณ์) */
  assert.deepEqual(dueSourceOf(null, { billingDate: '2026-10-12' }), { key: '', label: '' }, 'ยังไม่ตั้ง — วันวางบิลไม่คิดกำหนดชำระให้');
  assert.deepEqual(dueSourceOf(NO_CREDIT, {}), { key: '', label: '' });
  assert.deepEqual(dueSourceOf(NO_CREDIT, { billingEvent: 'หลังติดตั้ง' }), { key: 'waiting', label: '' }, 'รอเหตุการณ์ (รุ่นสี่) — ไม่ใช่ missing');
  /* แตะปุ่มแล้ว = ค่าเดียวกับเลือกวันวางบิลใหม่ → ที่มากลับเป็น "ชำระวันวางบิล" */
  const fixed = { billingDate: '2026-10-12', dueDate: dueSourceOf(NO_CREDIT, { billingDate: '2026-10-12' }).computed };
  assert.equal(dueSourceOf(NO_CREDIT, fixed).label, 'ชำระวันวางบิล');
});

test('🔴 review 28/09 (MAJOR): กติกาเปลี่ยนระหว่างอยู่ในโหมด — วิธีที่จำไว้ของชนิดเก่าถูกข้าม · ลายเซ็นกติกาจับทุกการเปลี่ยนที่มีผลกับวัน', () => {
  /* ชุดวิธีของแต่ละแบบ (dateModeOf) — เรียง วันวางบิล → กำหนดชำระ เสมอ (เจ้าของทัก 28/09) */
  const views = (value, row = inst(1)) => rowDateMode(value, row).views;
  assert.deepEqual(views(null), ['bill', 'due', 'event']);
  assert.deepEqual(views(CREDIT30), ['follow', 'other', 'event']);
  assert.deepEqual(views(AR281), ['round', 'other', 'event']);
  assert.deepEqual(views(NONE), ['due', 'event']);
  /* ยังไม่ระบุ → ตั้ง "เครดิต 30" แล้วกลับมา: 'bill'/'due' ที่จำไว้ไม่มีในชุด cadence ⇒ ใช้ที่ตัดสินตอนเปิด/ค่าตั้งต้นของชนิดใหม่
     (ไม่วาดสาขา "ยังไม่ระบุ" ต่อ — เลือกวันวางบิลแล้วกำหนดชำระต้องตาม) */
  assert.equal(dateViewOf(views(CREDIT30), 'bill', 'due', 'other'), 'other');
  assert.equal(dateViewOf(views(CREDIT30), 'due', 'follow', 'other'), 'follow');
  assert.equal(dateViewOf(views(AR281), 'due', undefined, 'round'), 'round');
  /* ขากลับ (กติกาถูกล้าง): 'other' ของชนิดเก่า ⇒ ไม่ใช่ปฏิทิน "วันอื่น" */
  assert.equal(dateViewOf(views(null), 'other', 'follow', 'due'), 'due');
  assert.equal(dateViewOf(views(null), 'bill', 'due', 'due'), 'bill', 'ค่าที่จำไว้ที่ใช้ได้ชนะเสมอ');
  assert.equal(dateViewOf(views(CREDIT30), 'event'), 'event', 'รอเหตุการณ์มีทุกชนิด');
  assert.equal(dateViewOf(views(CREDIT30)), 'other', 'ไม่มีอะไรใช้ได้ = วันอื่น (เปิดได้เสมอ)');
  assert.equal(dateViewOf(views(null)), 'due');
  /* ติ๊ก "งวดนี้ไม่ต้องวางบิล" ระหว่างตัวแก้เปิด 'follow' = ชุดของงวดเปลี่ยน ⇒ ถอยไปกำหนดชำระ */
  assert.equal(dateViewOf(views(CREDIT30, inst(1, { billingSkip: true })), 'follow', 'other', 'due'), 'due');
  /* ช่องที่โหมดจำไว้ให้งวดที่เปิดอยู่ (เปิดทีละช่อง) */
  const free = rowDateMode(null, inst(1));
  assert.equal(openViewOf('bill', { dueDate: '2026-10-30' }, free), 'bill');
  assert.equal(openViewOf(null, { billingEvent: 'หลังติดตั้ง' }, free), 'event');
  assert.equal(openViewOf(null, {}, free), 'due');
  assert.equal(openViewOf('bill', {}, rowDateMode(NONE, inst(1))), 'due', 'ไม่ต้องวางบิล: แตะเซลล์วันวางบิล = ช่องนำ');
  assert.equal(openViewOf(null, {}, rowDateMode(NONE, inst(1), { exception: true })), 'bill', 'งวดยกเว้นเปิดที่วันวางบิล');
  /* ลายเซ็น: เปลี่ยนชนิด / จำนวนวันเครดิต / วันของรอบ / ต้อง ↔ ไม่ต้องวางบิล / รูปเดิม → ตอบแล้ว = เปลี่ยน ·
     หมายเหตุ / รุ่นสอง vs รุ่นสี่ที่ความหมายเท่ากัน = ไม่เปลี่ยน */
  assert.equal(dateRuleShape(null), 'unknown');
  assert.equal(dateRuleShape({ billing: 'x' }), 'unknown', 'รูปผิด = ยังไม่ระบุ');
  assert.notEqual(dateRuleShape(NO_CREDIT), dateRuleShape(null));
  assert.notEqual(dateRuleShape(NONE), dateRuleShape(null));
  assert.notEqual(dateRuleShape(NONE), dateRuleShape(NO_TIMING));
  assert.notEqual(dateRuleShape(CREDIT30), dateRuleShape({ ...CREDIT30, payment: { mode: 'credit', days: 45 } }));
  assert.notEqual(dateRuleShape(AR281), dateRuleShape({ ...AR281, billing: { mode: 'monthly', days: [10] } }));
  assert.equal(dateRuleShape({ credit: false, note: 'แนบ PO' }), dateRuleShape(NO_CREDIT));
  assert.equal(dateRuleShape({ ...NONE, note: 'โอนก่อนส่งของ' }), dateRuleShape(NONE));
  /* ⭐ รอบกรรมการ 29/09: รูปเดิม (free) ≠ "ชำระวันวางบิล" ที่ตอบแล้ว (cadence) — ตัวแก้คนละแบบ ต้องตั้งต้นใหม่ */
  assert.notEqual(dateRuleShape(NO_CREDIT), dateRuleShape(PAY_SAME));
  assert.equal(dateRuleShape({ billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 0 } }), dateRuleShape(PAY_SAME),
    'รุ่นสองเครดิต 0 กับรุ่นสี่ชำระวันวางบิลคิดวันเหมือนกัน — ไม่ต้องตั้งต้นใหม่');
});

test('🔴 review 28/09: เปิดทีละช่อง — แตะอีกช่องของงวดที่เปิดอยู่ = สลับช่อง (ไม่ใช่ปิด) · ตัวแก้สองช่องในตัวเดียว = แตะช่องไหนก็ปิด', () => {
  const free = rowDateMode(null, inst(1));
  assert.equal(dateCellTapCloses(free, 'due', 'bill'), false, 'เปิดวันวางบิลอยู่ แตะกำหนดชำระ = สลับไปกำหนดชำระ');
  assert.equal(dateCellTapCloses(free, 'bill', 'due'), false);
  assert.equal(dateCellTapCloses(free, 'bill', 'event'), false, 'อยู่ที่รอเหตุการณ์ แตะเซลล์วันวางบิล = ไปช่องวันวางบิล');
  assert.equal(dateCellTapCloses(free, 'bill', undefined), false, 'ไม่รู้ว่าเปิดช่องไหน = เปิดช่องที่แตะ (ไม่ปิดทิ้ง)');
  assert.equal(dateCellTapCloses(free, 'due', 'due'), true, 'แตะช่องที่เปิดอยู่ = ปิด');
  assert.equal(dateCellTapCloses(rowDateMode(NONE, inst(1)), 'due', 'event'), false, 'ไม่ต้องวางบิล: รอเหตุการณ์ → กำหนดชำระ = สลับ');
  /* ตัวแก้ตัวเดียวแก้ทั้งสองช่อง */
  assert.equal(dateCellTapCloses(rowDateMode(CREDIT30, inst(1)), 'due', 'other'), true);
  assert.equal(dateCellTapCloses(rowDateMode(AR281, inst(1)), 'bill', 'round'), true);
});

test('งวดที่ล็อก: ประโยคเดียวกับ route (installmentDateLock) · เหตุคำร้องแยกทางออกไป hint · ด่าน schedule มาทีหลัง', () => {
  assert.equal(dateLockView(inst(1)), null);
  /* ประโยคล็อกของ route (409) — จอไม่เขียนรายการล็อกซ้ำ */
  const same = (row, options = {}) => assert.equal(dateLockView(row, options).reason, installmentDateLock(row, options));
  same(inst(1, { status: 'confirmed' }));
  same(inst(1, { status: 'reported' }));
  same(inst(1, { kind: 'opening' }));
  same(inst(1, { refundedAt: '2026-09-01T00:00:00Z', status: 'refunded' }));
  assert.equal(dateLockView(inst(1, { status: 'reported' })).reason, 'แจ้งชำระแล้ว — รอบัญชีตรวจ');
  assert.match(dateLockView(inst(1, { status: 'reported' })).hint, /ดึงกลับการแจ้งชำระ/);
  /* ชำระแล้วชนะด่าน schedule (เหตุที่ชัดกว่า "แก้กำหนดชำระไม่ได้") */
  assert.equal(dateLockView(inst(1, { status: 'confirmed' }), { gateError: 'งวดนี้บัญชีคอนเฟิร์มแล้ว แก้กำหนดชำระไม่ได้' }).reason,
    installmentDateLock(inst(1, { status: 'confirmed' })));
  const asked = dateLockView(inst(1), { requested: true, requestNo: 'RQ-2609-0188' });
  assert.equal(asked.reason, 'ขอใบวางบิลแล้ว · RQ-2609-0188', 'แถวเหลือเหตุสั้น');
  assert.match(asked.hint, /ถอดคำร้อง/, 'ทางออกย้ายไป hint (toast)');
  assert.equal(dateLockView(inst(1), { requested: true, requestUnknown: true }).reason, 'อ่านคำร้องขอเอกสารไม่สำเร็จ',
    'อ่านคำร้องไม่ขึ้น ≠ ยังไม่ขอ');
  assert.equal(dateLockView(inst(1), { gateError: 'ไม่มีสิทธิ์แก้กำหนดชำระ' }).reason, 'ไม่มีสิทธิ์แก้กำหนดชำระ');
  /* โมฆะตามใบ — ใบยกเลิกแล้ว งวดที่ยังไม่ชำระหลุดจากการตามเก็บ */
  const voided = dateLockView(inst(1), { order: { status: 'cancelled' } });
  assert.ok(voided && voided.reason, 'งวดโมฆะของใบที่ยกเลิกล็อก');
});

test('ชนิดของแผงเติม — มีรอบ (rounds) · ที่เหลือยึดกำหนดชำระ (cadence)', () => {
  assert.equal(fillKindOf(AR281), 'rounds');
  assert.equal(fillKindOf(ANYDAY_25), 'rounds');
  assert.equal(fillKindOf(CREDIT30), 'cadence');
  assert.equal(fillKindOf(NO_CREDIT), 'cadence');
  assert.equal(fillKindOf(NONE), 'cadence');
  assert.equal(fillKindOf(null), 'cadence');
});

test('⭐ รอบกรรมการ 29/09: แผงเติมของรูปเดิม { credit:false } — ตามเดือนในชื่องวด (AR-622) เขียนกำหนดชำระอย่างเดียว (ไม่มีวันวางบิลปลอม) · ชำระวันวางบิลที่ตอบแล้ว = สองช่องวันเดียวกัน', () => {
  const rows = [
    inst(1, { label: '1st Installment: October 2026 –' }), inst(2, { label: '2nd Installment: February 2027' }),
    inst(3, { label: '3rd Installment: June 2027' }), inst(4, { label: '4th Installment: October 2027' }),
  ];
  const input = fillInputRows(rows);
  const want = ['2026-10-31', '2027-02-28', '2027-06-30', '2027-10-31'];
  const legacy = planDateFill(NO_CREDIT, input, { kind: 'cadence', dueDay: 31, startMonth: null }, TODAY);
  assert.equal(legacy.error, null);
  assert.deepEqual(legacy.rows.map((r) => [r.billingDate, r.dueDate]), want.map((d) => ['', d]));
  /* ตอบแล้ว "ต้องวางบิล ชำระวันวางบิล" = วันวางบิล = กำหนดชำระ (เท่า prod ของไม่มีเครดิต) */
  const answered = planDateFill(PAY_SAME, input, { kind: 'cadence', dueDay: 31, startMonth: null }, TODAY);
  assert.deepEqual(answered.rows.map((r) => [r.billingDate, r.dueDate]), want.map((d) => [d, d]));
  const drafts = applyFillPlan({}, rows, answered.rows);
  assert.deepEqual(scheduleManyRows(draftChanges(rows, drafts).changes).map((r) => [r.billingDate, r.dueDate]), want.map((d) => [d, d]));
  /* ไม่ต้องวางบิล = กำหนดชำระอย่างเดียว */
  const none = planDateFill(NONE, input, { kind: 'cadence', dueDay: 5, startMonth: null }, TODAY);
  assert.deepEqual(none.rows.map((r) => [r.billingDate, r.dueDate]), [['', '2026-10-05'], ['', '2027-02-05'], ['', '2027-06-05'], ['', '2027-10-05']]);
  /* งวดที่ชื่อไม่บอกเดือนถูกข้ามพร้อมบอก */
  const mixed = planDateFill(NO_CREDIT, fillInputRows([inst(1, { label: 'October 2026' }), inst(2, { label: 'งวดสุดท้าย' })]),
    { kind: 'cadence', dueDay: 15, startMonth: null }, TODAY);
  assert.deepEqual(mixed.skipped, [2]);
  /* ชำระวันวางบิล (ตอบแล้ว): ต่อจากงวดก่อน = ยึดกำหนดชำระของงวดก่อน เดือนถัดไป · วันวางบิล = วันเดียวกัน */
  const two = [inst(1, { billingDate: '2026-10-25', dueDate: '2026-10-25' }), inst(2)];
  assert.deepEqual(continueChoiceFor(PAY_SAME, two, datesOf, two[1]),
    { fromSeq: 1, billingDate: '2026-11-25', dueDate: '2026-11-25', dueDay: 25 });
  assert.equal(continueChoiceFor(NO_CREDIT, two, datesOf, two[1]), null, 'รูปเดิม = free ไม่มี "ต่อจากงวดก่อน" แบบวันวางบิลนำ');
  /* ใบสินค้าเก่าที่มีแต่กำหนดชำระ: แตะ "ตามกำหนดชำระเดิม" = วันวางบิลวันเดียวกับกำหนดชำระ (ลูกค้าที่ตอบแล้วว่าชำระวันวางบิล) */
  assert.deepEqual(keepDueChoiceFor(PAY_SAME, inst(1, { dueDate: '2026-10-05' })), { billingDate: '2026-10-05', dueDate: '2026-10-05' });
  assert.equal(keepDueChoiceFor(NO_CREDIT, inst(1, { dueDate: '2026-10-05' })), null);
});

test('⭐ รุ่นสี่: ตัวเติมไม่ร่างวันวางบิลให้งวดที่ติ๊ก "งวดนี้ไม่ต้องวางบิล" (บันทึกไม่ได้) · ติ๊กของฐานอยู่ต่อหลังเติม', () => {
  const rows = [inst(1, { billingSkip: true }), inst(2)];
  /* ยึดกำหนดชำระ: งวดที่ติ๊กได้แต่กำหนดชำระ */
  const cadence = planDateFill(CREDIT30, fillInputRows(rows), { kind: 'cadence', dueDay: 25, startMonth: '2026-11' }, TODAY);
  assert.deepEqual(cadence.rows.map((r) => [r.seq, r.billingDate, r.dueDate]), [[1, '', '2026-11-25'], [2, '2026-11-25', '2026-12-25']]);
  const drafts = applyFillPlan({}, rows, cadence.rows);
  assert.equal(currentDates(rows[0], drafts).billingSkip, true, 'ติ๊กไม่หายเพราะตัวเติม');
  /* มีรอบ: งวดที่ติ๊กไม่ถูกเติม (ตัวเติมตามรอบให้แต่วันวางบิล) — รุ่นสองก็ไม่ร่างให้ */
  const input = fillInputRows(rows);
  assert.deepEqual(fillTargetsOf('rounds', input).map((r) => r.seq), [2]);
  const rounds = planDateFill(AR281, input, { kind: 'rounds', roundIndex: null }, TODAY);
  assert.deepEqual(rounds.rows.map((r) => r.seq), [2]);
});

test('⭐ ยังไม่ตั้งกำหนดวางบิล — แผงเติมเขียนกำหนดชำระอย่างเดียว วันวางบิลที่เลือกไว้เองคงเดิม', () => {
  const rows = [inst(1, { billingDate: '2026-10-01' }), inst(2)];
  const input = fillInputRows(rows);
  const plan = planDateFill(null, input, { kind: 'cadence', dueDay: 25, startMonth: '2026-10', includeDated: true }, TODAY);
  assert.deepEqual(plan.rows.map((r) => [r.seq, r.billingDate, r.dueDate]), [[1, '2026-10-01', '2026-10-25'], [2, '', '2026-11-25']]);
  const drafts = applyFillPlan({}, rows, plan.rows);
  assert.equal(currentDates(rows[0], drafts).billingDate, '2026-10-01', 'วันวางบิลที่เลือกเองไม่ถูกล้าง');
});

test('คำเตือน: ผ่านแล้ว (เฉพาะที่เปลี่ยน) · กำหนดชำระก่อนวันวางบิล · ก่อนงวดก่อน/หลังงวดถัดไป · วันซ้ำ = เบา', () => {
  const rows = [
    inst(1, { dueDate: '2026-11-25' }),
    inst(2, { dueDate: '2026-11-20', billingDate: '2026-11-21' }),
    inst(3, { dueDate: '2026-09-01' }),
    inst(4, { billingDate: '2026-11-21', status: 'confirmed' }),
  ];
  const w = dateWarnings(rows, datesOf, {
    todayIso: TODAY, changedIds: new Set(['i2', 'i3']), isLocked: (row) => row.status === 'confirmed',
  });
  const texts = (id) => (w[id] || []).map((x) => x.text);
  assert.deepEqual(texts('i2'), ['กำหนดชำระอยู่ก่อนวันวางบิล', 'กำหนดชำระก่อนงวด 1', 'กำหนดชำระหลังงวด 3']);
  assert.deepEqual(texts('i3'), ['กำหนดชำระผ่านมาแล้ว — ขึ้นเลยกำหนดทันทีที่บันทึก', 'กำหนดชำระก่อนงวด 2']);
  assert.deepEqual(texts('i1'), ['กำหนดชำระหลังงวด 2']);
  assert.equal(w.i4, undefined, 'งวดที่ล็อกไม่เตือน');
  const same = dateWarnings([inst(1, { billingDate: '2026-10-21' }), inst(2, { billingDate: '2026-10-21' })], datesOf, { todayIso: TODAY });
  assert.deepEqual(same.i2, [{ tone: 'muted', field: 'bill', text: 'วางบิลวันเดียวกับงวด 1' }]);
});

test('ไปงวดถัดไปที่ว่างและแก้ได้ — ข้ามงวดล็อก/มีวัน · ไม่วนกลับต้นใบ', () => {
  const rows = [inst(1), inst(2, { dueDate: '2026-10-01' }), inst(3, { status: 'reported' }), inst(4)];
  assert.equal(nextEmptyRow(rows, datesOf, 1, (row) => row.status === 'reported')?.seq, 4);
  assert.equal(nextEmptyRow(rows, datesOf, 4), null);
});

test('AR-281 รอบ 21 → 30 เดือนถัดไป: รอบถัดไปจากวันนี้ · ห่างกี่วัน · งวดอื่นใช้รอบนั้นอยู่', () => {
  const rows = [inst(1, { billingDate: '2026-10-21', dueDate: '2026-11-30' }), inst(2)];
  const own = roundChoicesFor(AR281, rows, datesOf, rows[0], TODAY, 3);
  assert.deepEqual(own.list.map((r) => [r.billingDate, r.dueDate, r.gap]), [
    ['2026-10-21', '2026-11-30', 40], ['2026-11-21', '2026-12-30', 39], ['2026-12-21', '2027-01-30', 40],
  ]);
  assert.equal(own.followSeq, null);
  const next = roundChoicesFor(AR281, rows, datesOf, rows[1], TODAY, 3);
  assert.equal(next.followSeq, 1, 'งวด 2 เริ่มต่อจากวันวางบิลของงวด 1');
  assert.equal(next.list[0].billingDate, '2026-11-21');
  const used = roundChoicesFor(AR281, [rows[0], inst(2, { billingDate: '2026-11-21' }), inst(3)], datesOf, rows[0], TODAY, 3);
  assert.equal(used.list[1].usedBySeq, 2);
  const two = roundChoicesFor(TWO, [inst(1)], datesOf, inst(1), TODAY, 4);
  assert.deepEqual(two.list.map((r) => [r.billingDate, r.dueDate]), [
    ['2026-10-10', '2026-10-25'], ['2026-10-25', '2026-11-10'], ['2026-11-10', '2026-11-25'], ['2026-11-25', '2026-12-10'],
  ]);
});

test('AR-015 เครดิต 30: "ต่อจากงวดก่อน" ยึดกำหนดชำระวันที่ 25 แล้วถอยวันวางบิล 30 วัน · ตามกำหนดชำระเดิม', () => {
  const rows = [inst(1, { dueDate: '2026-11-25' }), inst(2, { dueDate: '2026-12-25' }), inst(3), inst(4)];
  assert.deepEqual(continueChoiceFor(CREDIT30, rows, datesOf, rows[2]),
    { fromSeq: 2, billingDate: '2026-12-26', dueDate: '2027-01-25', dueDay: 25 });
  const drafts = withDraft({}, rows[2], { billingDate: '2026-12-26', dueDate: '2027-01-25' });
  assert.equal(continueChoiceFor(CREDIT30, rows, (row) => currentDates(row, drafts), rows[3]).dueDate, '2027-02-25',
    'ต่อจากร่างของงวดก่อนด้วย (แตะไล่ทีละงวดได้)');
  assert.equal(continueChoiceFor(CREDIT30, rows, datesOf, rows[0]), null, 'งวดแรกไม่มีงวดก่อน');
  assert.deepEqual(keepDueChoiceFor(CREDIT30, rows[0]), { billingDate: '2026-10-26', dueDate: '2026-11-25' });
  assert.equal(keepDueChoiceFor(AR281, rows[0]), null);
  const anyday = [inst(1, { billingDate: '2026-10-05', dueDate: '2026-11-25' }), inst(2)];
  assert.equal(continueChoiceFor(ANYDAY_25, anyday, datesOf, anyday[1]), null, 'รอบจ่าย (รุ่นสี่ rounds) ใช้รายการรอบแทน');
  assert.equal(continueChoiceFor(AR281, anyday, datesOf, anyday[1]), null, 'รอบรายเดือนใช้รายการรอบแทน');
});

test('AR-622 ไม่มีเครดิต: ทางลัดจากเดือนในชื่องวด + วันแบบงวดก่อน + นับจากงวดก่อน (ไม่เดาวันเอง)', () => {
  const rows = [
    inst(1, { label: '1st Installment: October 2026 –' }),
    inst(2, { label: '2nd Installment: February 2027' }),
    inst(3, { label: 'งวดสุดท้าย' }),
  ];
  assert.deepEqual(quickDueChoices(rows, datesOf, rows[0]).map((c) => [c.label, c.dueDate]), [
    ['ต้นเดือน', '2026-10-01'], ['กลางเดือน', '2026-10-15'], ['สิ้นเดือน', '2026-10-31'],
  ]);
  const drafts = withDraft({}, rows[0], { dueDate: '2026-10-31' });
  const cur = (row) => currentDates(row, drafts);
  assert.deepEqual(quickDueChoices(rows, cur, rows[1]).map((c) => c.label), [
    'ต้นเดือน', 'กลางเดือน', 'สิ้นเดือน', '+7 วันจากงวดก่อน', '+15 วันจากงวดก่อน', '+30 วันจากงวดก่อน',
  ], '"วันที่ 31 แบบงวดก่อน" ใน ก.พ. = 28 ก.พ. ซ้ำกับสิ้นเดือน — ไม่ขึ้นชิปซ้ำ');
  const later = withDraft(drafts, rows[1], { dueDate: '2027-02-10' });
  assert.deepEqual(quickDueChoices(rows, (row) => currentDates(row, later), rows[2]).map((c) => [c.label, c.dueDate]), [
    ['วันที่ 10 แบบงวดก่อน', '2027-03-10'], ['+7 วันจากงวดก่อน', '2027-02-17'],
    ['+15 วันจากงวดก่อน', '2027-02-25'], ['+30 วันจากงวดก่อน', '2027-03-12'],
  ]);
  assert.deepEqual(quickDueChoices([inst(1, { label: 'มัดจำ' })], datesOf, inst(1, { label: 'มัดจำ' })), []);
  assert.equal(calendarMonthFor(rows[1], rows, datesOf, 'dueDate', TODAY), '2027-02', 'ปฏิทินเปิดเดือนในชื่องวด');
  assert.equal(calendarMonthFor(rows[2], rows, cur, 'dueDate', TODAY), '2026-11', 'ไม่มีเบาะแส = เดือนหลังงวดก่อน');
});

test('ปฏิทินเริ่มวันอาทิตย์ — ต.ค. 2026 เริ่มวันพฤหัส (เว้น 4 ช่อง) · ครบสัปดาห์', () => {
  const cells = sundayFirstCells('2026-10');
  assert.deepEqual(cells.slice(0, 5), [null, null, null, null, '2026-10-01']);
  assert.equal(cells.length % 7, 0);
  assert.equal(cells.filter(Boolean).length, 31);
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('แผงเติม · AR-015: ข้อเสนอ "ต่อจากงวด 2 · ทุกวันที่ 25" → งวด 3–12 ลงร่างตรงม็อก', () => {
  const rows = [
    inst(1, { dueDate: '2026-11-25' }), inst(2, { dueDate: '2026-12-25' }),
    ...Array.from({ length: 10 }, (_, i) => inst(i + 3)),
  ];
  const input = fillInputRows(rows, datesOf);
  const sug = creditFillSuggestion(input);
  assert.deepEqual(sug, { fromSeq: 2, dueDay: 25, startMonth: '2027-01', keep: false });
  const plan = planDateFill(CREDIT30, input, { kind: 'cadence', dueDay: sug.dueDay, startMonth: sug.startMonth }, TODAY);
  assert.equal(plan.error, null);
  assert.deepEqual([plan.rows[0].seq, plan.rows[0].billingDate, plan.rows[0].dueDate], [3, '2026-12-26', '2027-01-25']);
  assert.deepEqual([plan.rows[9].seq, plan.rows[9].billingDate, plan.rows[9].dueDate], [12, '2027-09-25', '2027-10-25']);
  const drafts = applyFillPlan({}, rows, plan.rows);
  assert.equal(Object.keys(drafts).length, 10, 'เติมลงร่างอย่างเดียว');
  assert.equal(drafts.i3.baseUpdatedAt, 'u3');
  assert.equal(datedFillCount('cadence', input), 2, 'สวิตช์ "จัดใหม่งวดที่มีวันแล้วด้วย (2 งวด)"');
  /* จัดใหม่ทั้งชุด — ไม่มีงวดนอกแผนให้ยึด ⇒ ยึดกำหนดชำระเดิมงวด 1 (ไม่ไหลเป็น 24/27) */
  const keep = creditFillSuggestion(input, { includeDated: true });
  assert.deepEqual(keep, { fromSeq: 1, dueDay: 25, startMonth: '2026-11', keep: true });
  const all = planDateFill(CREDIT30, input, { kind: 'cadence', dueDay: 25, startMonth: '2026-11', includeDated: true }, TODAY);
  assert.equal(all.rows.length, 12);
  assert.ok(all.rows.every((r) => r.dueDate.endsWith('-25')));
});

test('🔴 แผงเติม: หลักยึดต้องอยู่ก่อนงวดแรกที่เติม — งวดหลังที่มีวันแล้วไม่ถูกยึด (งวด 2 ไม่ได้วันหลังงวด 3)', () => {
  /* 🐞 review R-UI: งวด 1 (25 ต.ค.) · 2 ว่าง · 3 (25 ธ.ค.) เดิมได้ "ต่อจากงวด 3" → งวด 2 กำหนดชำระ 25 ม.ค. 2027 */
  const rows = [inst(1, { dueDate: '2026-10-25' }), inst(2), inst(3, { dueDate: '2026-12-25' })];
  const input = fillInputRows(rows, datesOf);
  const sug = creditFillSuggestion(input);
  assert.deepEqual(sug, { fromSeq: 1, dueDay: 25, startMonth: '2026-11', keep: false });
  const plan = planDateFill(CREDIT30, input, { kind: 'cadence', dueDay: sug.dueDay, startMonth: sug.startMonth }, TODAY);
  assert.deepEqual(plan.rows.map((r) => [r.seq, r.dueDate]), [[2, '2026-11-25']]);
  const targets = new Set(fillTargetsOf('cadence', input).map((r) => r.id));
  assert.deepEqual(fillStartMonths(input, targets, TODAY), ['2026-11', '2026-12', '2027-01'], 'เดือนเริ่มต่อจากงวด 1 ไม่ใช่งวด 3');
  /* ไม่มีงวดก่อนงวดแรกที่เติม = ไม่มีข้อเสนอ "ต่อจาก" (ไม่ย้อนไปยึดงวดหลัง) · เดือนเริ่ม = เดือนนี้ */
  const late = fillInputRows([inst(1), inst(2, { dueDate: '2026-12-25' })], datesOf);
  assert.equal(creditFillSuggestion(late), null);
  assert.deepEqual(fillStartMonths(late, new Set(['i1']), TODAY), ['2026-09', '2026-10', '2026-11']);
});

test('แผงเติม · AR-622 ยังไม่ระบุ: สิ้นเดือนตามเดือนในชื่องวด (ต.ค. 31 · ก.พ. 28 · มิ.ย. 30 · ต.ค. 31) — กำหนดชำระอย่างเดียว', () => {
  const rows = ['1st Installment: October 2026 –', '2nd Installment: February 2027', '3rd Installment: June 2027', '4th Installment: October 2027']
    .map((label, i) => inst(i + 1, { label }));
  const plan = planDateFill(null, fillInputRows(rows, datesOf), { kind: 'cadence', dueDay: 31, startMonth: null }, TODAY);
  assert.deepEqual(plan.rows.map((r) => [r.billingDate, r.dueDate]), [
    ['', '2026-10-31'], ['', '2027-02-28'], ['', '2027-06-30'], ['', '2027-10-31'],
  ]);
  const seqPlan = planDateFill(null, fillInputRows(rows, datesOf), { kind: 'cadence', dueDay: 5, startMonth: '2026-11' }, TODAY);
  assert.equal(seqPlan.rows[3].dueDate, '2027-02-05');
  assert.deepEqual(fillStartMonths(fillInputRows(rows, datesOf), new Set(rows.map((r) => r.id)), TODAY), ['2026-09', '2026-10', '2026-11']);
});

test('แผงเติม · รอบรายเดือน: หลายรอบต้องเลือกก่อน (ไม่เลือกให้) · งวดที่ล็อกไม่ถูกแตะแต่กันไม่ให้ย้อนแซง', () => {
  const rows = [inst(1, { billingDate: '2026-11-10', status: 'confirmed' }), inst(2), inst(3)];
  const input = fillInputRows(rows, datesOf, (row) => row.status === 'confirmed');
  assert.match(planDateFill(TWO, input, { kind: 'rounds', roundIndex: null }, TODAY).error, /เลือกก่อนว่าจะใช้รอบไหน/);
  const plan = planDateFill(TWO, input, { kind: 'rounds', roundIndex: 1 }, TODAY);
  assert.deepEqual(plan.rows.map((r) => [r.seq, r.billingDate, r.dueDate]), [
    [2, '2026-11-25', '2026-12-10'], [3, '2026-12-25', '2027-01-10'],
  ]);
  /* งวดที่ขอใบวางบิลแล้วแต่ยังไม่มีวัน (ล็อก) — ตัวเติมรอบรายเดือนต้องไม่ลงวันให้ */
  const requested = fillInputRows([inst(1), inst(2)], datesOf, (row) => row.id === 'i1');
  assert.deepEqual(fillTargetsOf('rounds', requested).map((r) => r.seq), [2]);
  const one = planDateFill(AR281, requested, { kind: 'rounds', roundIndex: null }, TODAY);
  assert.deepEqual(one.rows.map((r) => [r.seq, r.billingDate, r.dueDate]), [[2, '2026-10-21', '2026-11-30']]);
  /* จัดใหม่งวดที่มีวันแล้วด้วย = planRedate (แทนกำหนดชำระเดิม) */
  const dated = fillInputRows([inst(1, { billingDate: '2026-10-05', dueDate: '2026-10-30' }), inst(2)], datesOf);
  const redate = planDateFill(AR281, dated, { kind: 'rounds', includeDated: true }, TODAY);
  assert.deepEqual(redate.rows.map((r) => [r.seq, r.billingDate, r.dueDate]), [[1, '2026-10-21', '2026-11-30'], [2, '2026-11-21', '2026-12-30']]);
});

test('แผงเติม · รุ่นสอง "ทุกวัน + เงินเข้าตามวันที่" = รอบจ่ายของรุ่นสี่ — เติมตามรอบ (ไม่มีแผง "วันวางบิลวันที่ …" แยกอีก)', () => {
  const rows = [inst(1), inst(2)];
  const plan = planDateFill(ANYDAY_25, fillInputRows(rows, datesOf), { kind: 'rounds', roundIndex: null }, TODAY);
  assert.equal(plan.error, null);
  assert.equal(plan.rows.length, 2);
  assert.ok(plan.rows.every((r) => r.billingDate && r.dueDate.endsWith('-25')), 'กำหนดชำระ = วันจ่ายวันที่ 25 ของลูกค้า');
});
