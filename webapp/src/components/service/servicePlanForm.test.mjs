// สถานะฟอร์มของโมดัลรอบบริการ (mig 0397 · ความถี่ตามปฏิทิน) — logic ล้วน
//
// ⭐ สิ่งที่ต้องไม่หลุด:
//   · รอบใหม่ = "ทุกเดือน" วันที่ของวันเริ่มรอบ (คำตอบเจ้าของข้อ 3) และขยับตามวันเริ่มจนกว่าจะแตะวันเอง
//   · "ทุก N วัน" ไม่มีค่าเริ่ม (30 เงียบ ๆ ของเดิม = 13 นัดต่อปี)
//   · ส่งหกช่องความถี่ครบเสมอ ช่องที่ชนิดนั้นไม่ใช้ = null (PATCH จะได้ไม่เหลือ everyDays ของรอบเดิมค้าง)
//   · โหมดช่วงวันที่ยังไม่ครบ บันทึกไม่ได้ (ส่งไปทั้งอย่างนั้น = กลายเป็นวันเดียวเงียบ ๆ)
//   · แถวก่อน mig 0397 (มีแต่ everyDays) เปิดเป็น "ทุก N วัน"
//   · ตัวเลขบรรทัดสรุปตรงกับตัวสร้างนัดของ server (cadence.js ตัวเดียวกัน)
// "SO247" = ช่วง 2026-10-22 → 2027-10-21 ของ SO-26090247-0 · H2026 = วันหยุดปี 2026 ในตาราง holidays ของจริง ณ 01/10
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EMPTY_PLAN_FORM, PLAN_SCHEDULE_CONFIRM, accessWarningText, applySuggestion, cancelVisitIdsOf, everyMonthOptions, everyWeekOptions,
  isWeekendDay, keptOfPreview, offDayVisitsText, pickRangeDay, pickSingleDay, planFormBlocker, planFormCadence, planFormFields,
  planFormFromPlan, planFormMonthDay, planFormWeekday, planGapYears, planSavedMessage, planSummary, rangeDays,
  scheduleConfirmOf, setDayMode, staysLineOf, weekdayOffAccess,
} from './servicePlanForm.js';
import {
  CADENCE_ERRORS, CADENCE_FIELDS, CADENCE_TEXT, cadenceText, defaultCadenceFor, normalizeCadence, sameCadence, suggestCadence,
} from '../../lib/service/cadence.js';
// ตัวตรวจ/ตัวเติมนัดของ server — เทสต์ทาบว่าสิ่งที่จอบอกตรงกับสิ่งที่ server ทำ (ตัวช่วยของฟอร์มเองไม่ import ไฟล์นี้)
import { ensureVisits, normalizePlanInput } from '../../lib/service/rounds.js';

const H2026 = new Set([
  '2026-01-01', '2026-03-03', '2026-04-06', '2026-04-13', '2026-04-14', '2026-04-15', '2026-05-01', '2026-05-04',
  '2026-05-31', '2026-06-01', '2026-06-03', '2026-07-28', '2026-07-29', '2026-07-30', '2026-08-12', '2026-10-13',
  '2026-10-23', '2026-12-07', '2026-12-10', '2026-12-31',
]);
const TODAY = '2026-10-01';
const SO247 = { startDate: '2026-10-22', endDate: '2027-10-21' };
const form = (over = {}) => ({ ...EMPTY_PLAN_FORM, ...over });
const six = (over) => ({
  cadenceKind: null, everyDays: null, cadenceEvery: null, cadenceWeekday: null, cadenceMonthDay: null, cadenceMonthDayTo: null, ...over,
});

/* ═══ ค่าเริ่ม ═══════════════════════════════════════════════════════════════════════════════ */

test('⭐ ฟอร์มใหม่ = ทุกเดือน ทุก 1 เดือน วันเดียว · วันที่ยังไม่ถูกแตะ (ตามวันเริ่มรอบ) · "ทุก N วัน" ว่าง', () => {
  assert.equal(EMPTY_PLAN_FORM.cadenceKind, 'monthly');
  assert.equal(EMPTY_PLAN_FORM.monthEvery, 1);
  assert.equal(EMPTY_PLAN_FORM.dayMode, 'single');
  assert.equal(EMPTY_PLAN_FORM.monthDay, null);
  assert.equal(EMPTY_PLAN_FORM.monthDayTo, null);
  assert.equal(EMPTY_PLAN_FORM.weekEvery, 1);
  assert.equal(EMPTY_PLAN_FORM.weekday, null);
  assert.equal(EMPTY_PLAN_FORM.everyDays, '', 'ไม่มี 30 เงียบ ๆ');
  assert.equal(EMPTY_PLAN_FORM.kind, 'refill');
  assert.equal(EMPTY_PLAN_FORM.isActive, true);
  assert.ok(Object.isFrozen(EMPTY_PLAN_FORM));
});

test('⭐ ค่าเริ่มของรอบใหม่ = defaultCadenceFor(วันเริ่ม) — และขยับตามวันเริ่มจนกว่าจะแตะวันเอง', () => {
  const opened = form(SO247);
  assert.deepEqual(planFormCadence(opened), defaultCadenceFor('2026-10-22'));
  assert.equal(cadenceText(planFormCadence(opened)), 'ทุกเดือน วันที่ 22');
  // TS เปลี่ยนวันเริ่ม ⇒ วันที่ของรอบตามไป
  assert.equal(planFormCadence({ ...opened, startDate: '2026-10-05' }).cadenceMonthDay, 5);
  // แตะวันเองแล้ว ⇒ ไม่ตามวันเริ่มอีก
  const picked = pickSingleDay(opened, 17);
  assert.equal(planFormCadence({ ...picked, startDate: '2026-10-05' }).cadenceMonthDay, 17);
  // เริ่มวันที่ 31 = สิ้นเดือน
  assert.equal(cadenceText(planFormCadence(form({ startDate: '2026-10-31' }))), 'ทุกเดือน สิ้นเดือน');
});

test('ยังไม่มีวันเริ่ม = ยังไม่รู้วันที่ของเดือน (null) — ตัวตรวจบอกให้เลือกวันที่ ไม่เดาให้', () => {
  const cadence = planFormCadence(form());
  assert.deepEqual(cadence, six({ cadenceKind: 'monthly', cadenceEvery: 1 }));
  assert.equal(normalizeCadence(cadence).error, CADENCE_ERRORS.monthDay);
  assert.equal(planFormMonthDay(form()), null);
});

test('รายสัปดาห์: วันตั้งต้น = วันในสัปดาห์ของวันเริ่ม · เริ่มเสาร์–อาทิตย์หรือยังไม่มีวันเริ่ม = วันจันทร์', () => {
  assert.equal(planFormWeekday(form({ startDate: '2026-10-22' })), 4, 'พฤหัสบดี');
  assert.equal(planFormWeekday(form({ startDate: '2026-10-24' })), 1, 'เริ่มวันเสาร์ → จันทร์');
  assert.equal(planFormWeekday(form({ startDate: '2026-10-25' })), 1, 'เริ่มวันอาทิตย์ → จันทร์');
  assert.equal(planFormWeekday(form()), 1);
  assert.equal(planFormWeekday(form({ startDate: '2026-10-22', weekday: 3 })), 3, 'เลือกเองแล้วไม่ตามวันเริ่ม');
  assert.equal(planFormWeekday(form({ startDate: '2026-10-22', weekday: 0 })), 0, 'ค่าที่เก็บไว้ (รอบเดิม) แสดงตามจริง แม้เป็นวันอาทิตย์');
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].filter(isWeekendDay), [0, 6]);
});

/* ═══ หกช่องที่ส่ง API ═══════════════════════════════════════════════════════════════════════ */

test('🔴 planFormCadence คืนครบหกช่องเสมอ ทุกชนิด — ช่องที่ไม่ใช้เป็น null · ผ่านตัวตรวจตัวเดียวกับ API', () => {
  const cases = [
    [form({ ...SO247 }), six({ cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 22 })],
    [form({ ...SO247, monthEvery: 3, monthDay: 31 }), six({ cadenceKind: 'monthly', cadenceEvery: 3, cadenceMonthDay: 31 })],
    [form({ ...SO247, dayMode: 'range', monthDay: 1, monthDayTo: 5 }), six({ cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 1, cadenceMonthDayTo: 5 })],
    [form({ ...SO247, cadenceKind: 'weekly', weekEvery: 2, weekday: 5 }), six({ cadenceKind: 'weekly', cadenceEvery: 2, cadenceWeekday: 5 })],
    [form({ ...SO247, cadenceKind: 'days', everyDays: '45' }), six({ cadenceKind: 'days', everyDays: 45 })],
  ];
  for (const [input, expected] of cases) {
    const cadence = planFormCadence(input);
    assert.deepEqual(Object.keys(cadence), CADENCE_FIELDS);
    assert.deepEqual(cadence, expected);
    assert.deepEqual(normalizeCadence(cadence), { value: expected, error: null });
  }
});

test('ค่าของชนิดอื่นที่ค้างในร่างไม่หลุดไปกับ payload (สลับแผ่นแล้วค่าที่เลือกไว้ยังอยู่ในฟอร์ม แต่ไม่ถูกส่ง)', () => {
  const draft = form({ ...SO247, monthDay: 15, monthDayTo: 20, dayMode: 'range', weekday: 3, weekEvery: 2, everyDays: '30' });
  assert.deepEqual(planFormCadence({ ...draft, cadenceKind: 'days' }), six({ cadenceKind: 'days', everyDays: 30 }));
  assert.deepEqual(planFormCadence({ ...draft, cadenceKind: 'weekly' }), six({ cadenceKind: 'weekly', cadenceEvery: 2, cadenceWeekday: 3 }));
  // โหมดวันเดียว = ไม่ส่งวันสุดท้ายของช่วงแม้ค่ายังค้างในร่าง
  assert.equal(planFormCadence({ ...draft, dayMode: 'single' }).cadenceMonthDayTo, null);
});

test('"ทุก N วัน": ช่องว่าง = null (ตัวตรวจตอบข้อความเดิม) · พิมพ์ผิดรูป = ตัวตรวจตีกลับ ไม่กลายเป็น 0/30', () => {
  assert.equal(planFormCadence(form({ cadenceKind: 'days' })).everyDays, null);
  assert.equal(normalizeCadence(planFormCadence(form({ cadenceKind: 'days' }))).error, CADENCE_ERRORS.days);
  assert.equal(normalizeCadence(planFormCadence(form({ cadenceKind: 'days', everyDays: '0' }))).error, CADENCE_ERRORS.days);
  assert.equal(normalizeCadence(planFormCadence(form({ cadenceKind: 'days', everyDays: '400' }))).error, CADENCE_ERRORS.days);
  assert.equal(normalizeCadence(planFormCadence(form({ cadenceKind: 'days', everyDays: '7.5' }))).error, CADENCE_ERRORS.days);
});

test('รายสัปดาห์วันเสาร์–อาทิตย์ถูกตีกลับด้วยตัวตรวจตัวเดียวกับ API', () => {
  assert.equal(normalizeCadence(planFormCadence(form({ cadenceKind: 'weekly', weekday: 6 }))).error, CADENCE_ERRORS.weekend);
  assert.equal(normalizeCadence(planFormCadence(form({ cadenceKind: 'weekly', weekday: 0 }))).error, CADENCE_ERRORS.weekend);
});

test('planFormFields = ช่องของรอบล้วน — ไม่มีช่องร่างของจอ และไม่มี salesOrderId (โมดัลใส่เองทุกครั้ง)', () => {
  const fields = planFormFields(form({ ...SO247, note: 'x', assigneeId: 'U1', assigneeName: 'ช่าง ก', isActive: false }));
  assert.deepEqual(fields, {
    kind: 'refill', startDate: '2026-10-22', endDate: '2027-10-21', assigneeId: 'U1', assigneeName: 'ช่าง ก', isActive: false, note: 'x',
  });
});

/* ═══ โหมดแก้ ═══════════════════════════════════════════════════════════════════════════════ */

test('โหมดแก้: โหลดความถี่ของรอบเดิมทั้งสามชนิด แล้วส่งกลับได้ค่าเดิมเป๊ะ', () => {
  const rows = [
    { cadenceKind: 'monthly', cadenceEvery: 3, cadenceMonthDay: 22, cadenceMonthDayTo: null, everyDays: null, cadenceWeekday: null },
    { cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 25, cadenceMonthDayTo: 31, everyDays: null, cadenceWeekday: null },
    { cadenceKind: 'weekly', cadenceEvery: 2, cadenceWeekday: 5, cadenceMonthDay: null, cadenceMonthDayTo: null, everyDays: null },
    { cadenceKind: 'days', everyDays: 45, cadenceEvery: null, cadenceWeekday: null, cadenceMonthDay: null, cadenceMonthDayTo: null },
  ];
  for (const row of rows) {
    const loaded = planFormFromPlan({ id: 'PL-1', kind: 'maintenance', ...SO247, ...row });
    assert.ok(sameCadence(planFormCadence(loaded), row), cadenceText(row));
    assert.equal(planFormBlocker(loaded), null);
  }
  assert.equal(planFormFromPlan({ ...rows[1], ...SO247 }).dayMode, 'range');
  assert.equal(planFormFromPlan({ ...rows[0], ...SO247 }).dayMode, 'single');
});

test('🔴 แถวก่อน mig 0397 (ไม่มี cadenceKind มีแต่ everyDays) เปิดเป็น "ทุก N วัน" ค่าเดิม', () => {
  const loaded = planFormFromPlan({ id: 'PL-OLD', kind: 'refill', everyDays: 30, startDate: '2026-01-01', endDate: '2026-12-31' });
  assert.equal(loaded.cadenceKind, 'days');
  assert.equal(loaded.everyDays, 30);
  assert.deepEqual(planFormCadence(loaded), six({ cadenceKind: 'days', everyDays: 30 }));
  assert.equal(planSummary(loaded, { todayIso: TODAY, holidays: H2026 }).estimate, 13, 'ตัวเลขเดิมของ "ทุก 30 วัน" ทั้งปี');
});

test('โหมดแก้: ช่องของรอบโหลดครบ · แถวที่ไม่มีอะไรเลยไม่ล้ม · ความถี่อ่านไม่ออกเปิดเป็นชนิดเดิมด้วยค่าว่าง', () => {
  const loaded = planFormFromPlan({
    kind: 'inspect', startDate: '2026-10-22', endDate: null, assigneeId: 'U9', assigneeName: 'ช่าง ข', isActive: false,
    note: 'โน้ต', salesOrderId: 'SOR-1', cadenceKind: 'weekly', cadenceEvery: 1, cadenceWeekday: 2,
  });
  assert.equal(loaded.kind, 'inspect');
  assert.equal(loaded.endDate, '');
  assert.equal(loaded.isActive, false);
  assert.equal(loaded.salesOrderId, 'SOR-1');
  assert.equal(loaded.assigneeName, 'ช่าง ข');
  assert.equal(loaded.weekday, 2);
  assert.equal(planFormFromPlan(null).cadenceKind, 'days');
  assert.equal(planFormFromPlan(null).everyDays, '');
  const broken = planFormFromPlan({ cadenceKind: 'monthly', cadenceEvery: null, cadenceMonthDay: null });
  assert.equal(broken.cadenceKind, 'monthly');
  assert.equal(broken.monthDay, null);
});

/* ═══ ตารางวันของเดือน ═════════════════════════════════════════════════════════════════════════ */

test('ช่วงวัน: แตะวันแรก → แตะวันหลัง = วันสุดท้าย → แตะอีกครั้ง = เริ่มช่วงใหม่ · วันที่ไม่เกินวันแรก = วันแรกใหม่', () => {
  let state = setDayMode(form({ startDate: '2026-10-22' }), 'range');
  assert.equal(state.dayMode, 'range');
  assert.equal(state.rangeAnchored, false, 'ยังไม่ได้แตะวันแรกของช่วงเอง');
  assert.equal(planFormMonthDay(state), 22, 'วันที่ของโหมดวันเดียวยังอยู่ (สลับกลับแล้วไม่หาย)');
  assert.deepEqual(rangeDays(state), [], 'ตารางว่าง — วันที่ค้างมาจากโหมดวันเดียวไม่ใช่วันแรกของช่วง');
  assert.equal(planFormBlocker(state), CADENCE_TEXT.rangeUnset, 'ยังไม่มีช่วง = บันทึกไม่ได้ และบอกให้เลือกทั้งสองวัน');

  state = pickRangeDay(state, 1);            // แตะครั้งแรก ⇒ วันแรก
  assert.deepEqual([state.monthDay, state.monthDayTo, state.rangeAnchored], [1, null, true]);
  assert.deepEqual(rangeDays(state), [1]);
  assert.equal(planFormBlocker(state), CADENCE_TEXT.rangePending, 'มีวันแรกแล้ว ยังไม่มีวันสุดท้าย');
  state = pickRangeDay(state, 5);            // หลังวันแรก ⇒ วันสุดท้าย
  assert.deepEqual([state.monthDay, state.monthDayTo], [1, 5]);
  assert.deepEqual(rangeDays(state), [1, 2, 3, 4, 5]);
  assert.equal(planFormBlocker(state), null);
  assert.equal(cadenceText(planFormCadence(state)), 'ทุกเดือน วันที่ 1–5');

  state = pickRangeDay(state, 10);           // ช่วงครบแล้ว ⇒ เริ่มช่วงใหม่
  assert.deepEqual([state.monthDay, state.monthDayTo], [10, null]);
  state = pickRangeDay(state, 10);           // แตะวันเดิม = ยังเป็นวันแรก
  assert.deepEqual([state.monthDay, state.monthDayTo], [10, null]);
  state = pickRangeDay(state, 4);            // ไม่เกินวันแรก ⇒ วันแรกใหม่
  assert.deepEqual([state.monthDay, state.monthDayTo], [4, null]);
  state = pickRangeDay(state, 31);
  assert.equal(cadenceText(planFormCadence(state)), 'ทุกเดือน วันที่ 4–สิ้นเดือน');
});

test('🔴 ช่วงวัน: การแตะครั้งแรกเป็น **วันแรก** เสมอ — วันที่ค้างมาจากวันเริ่มรอบ/โหมดวันเดียวไม่ถูกนับเป็นวันแรกของช่วง', () => {
  // วันเริ่มรอบ 1 พ.ย. อยากได้ช่วง 3–7: แตะ 3 แล้วแตะ 7 (เดิมแตะ 3 แล้วได้ "1–3" ที่บันทึกได้ทั้งที่ผิด)
  let state = setDayMode(form({ startDate: '2026-11-01' }), 'range');
  state = pickRangeDay(state, 3);
  assert.deepEqual([state.monthDay, state.monthDayTo], [3, null]);
  assert.equal(planFormBlocker(state), CADENCE_TEXT.rangePending, 'แตะครั้งเดียวยังบันทึกไม่ได้ — ไม่มีช่วงผิดหลุดไป');
  state = pickRangeDay(state, 7);
  assert.equal(cadenceText(planFormCadence(state)), 'ทุกเดือน วันที่ 3–7');
  // วันเริ่ม 22 อยากได้ 25–28 (เดิมแตะ 25 แล้วได้ "22–25")
  state = pickRangeDay(pickRangeDay(setDayMode(form({ startDate: '2026-10-22' }), 'range'), 25), 28);
  assert.equal(cadenceText(planFormCadence(state)), 'ทุกเดือน วันที่ 25–28');
  // วันที่แตะเลือกไว้ในโหมดวันเดียว (17) ก็ไม่ใช่วันแรกของช่วง
  state = pickRangeDay(setDayMode(pickSingleDay(form({ startDate: '2026-10-22' }), 17), 'range'), 20);
  assert.deepEqual([state.monthDay, state.monthDayTo], [20, null]);
  // ช่วงที่ตั้งแล้วไม่ขยับตามวันเริ่มรอบที่เปลี่ยนทีหลัง
  const fixed = pickRangeDay(pickRangeDay(setDayMode(form({ startDate: '2026-10-03' }), 'range'), 3), 7);
  assert.deepEqual([fixed.monthDay, fixed.monthDayTo], [3, 7]);
  assert.equal(cadenceText(planFormCadence({ ...fixed, startDate: '2026-10-20' })), 'ทุกเดือน วันที่ 3–7');
});

test('ช่วงวัน: ยังไม่มีวันเริ่มและยังไม่แตะ = ตารางว่าง · แตะครั้งแรกเป็นวันแรก', () => {
  const state = setDayMode(form(), 'range');
  assert.deepEqual(rangeDays(state), []);
  assert.deepEqual([pickRangeDay(state, 9).monthDay, pickRangeDay(state, 9).monthDayTo], [9, null]);
});

test('กลับเป็น "วันเดียว" ล้างวันสุดท้าย วันแรกคงเดิม · แตะวันในโหมดวันเดียวล้างช่วง', () => {
  const ranged = form({ startDate: '2026-10-22', dayMode: 'range', monthDay: 1, monthDayTo: 5, rangeAnchored: true });
  const single = setDayMode(ranged, 'single');
  assert.deepEqual([single.dayMode, single.monthDay, single.monthDayTo, single.rangeAnchored], ['single', 1, null, false]);
  assert.deepEqual(planFormCadence(single), six({ cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 1 }));
  assert.equal(pickSingleDay(ranged, 17).monthDayTo, null);
  assert.equal(setDayMode(ranged, 'อะไรก็ไม่รู้').dayMode, 'single');
});

test('🔴 แตะชิปของโหมดที่เลือกอยู่แล้ว = ไม่เกิดอะไร — ช่วงที่บันทึกไว้ไม่ถูกล้างวันสุดท้าย', () => {
  // รอบที่บันทึกไว้ "ทุกเดือน วันที่ 1–5" เปิดแก้ แล้วแตะชิป "ช่วงวัน" ที่ติดอยู่ (ChoiceChips ส่ง onChange ให้ชิปที่ติดอยู่ด้วย)
  const loaded = planFormFromPlan({ kind: 'refill', startDate: '2026-10-22', cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 1, cadenceMonthDayTo: 5 });
  assert.deepEqual([loaded.dayMode, loaded.monthDay, loaded.monthDayTo, loaded.rangeAnchored], ['range', 1, 5, true]);
  const again = setDayMode(loaded, 'range');
  assert.equal(again, loaded, 'คืนฟอร์มตัวเดิม');
  assert.deepEqual(rangeDays(again), [1, 2, 3, 4, 5]);
  assert.equal(planFormBlocker(again), null);
  assert.equal(cadenceText(planFormCadence(again)), 'ทุกเดือน วันที่ 1–5');
  // โหมดวันเดียวก็เหมือนกัน
  const single = form({ startDate: '2026-10-22', monthDay: 9 });
  assert.equal(setDayMode(single, 'single'), single);
  // ช่วงที่บันทึกไว้ แตะวันถัดไป = เริ่มช่วงใหม่ที่วันนั้น (ช่วงครบแล้ว)
  assert.deepEqual([pickRangeDay(loaded, 10).monthDay, pickRangeDay(loaded, 10).monthDayTo], [10, null]);
});

/* ═══ ชิปตัวเลือก ════════════════════════════════════════════════════════════════════════════ */

test('ชิป "ทุก n เดือน/สัปดาห์" = ชุดกลาง + ค่าของรอบเองเมื่ออยู่นอกชุด (เรียงตามเลข)', () => {
  assert.deepEqual(everyMonthOptions(form()).map((o) => o.value), [1, 2, 3, 4, 6, 12]);
  assert.deepEqual(everyMonthOptions(form()).map((o) => o.label), ['1 เดือน', '2 เดือน', '3 เดือน', '4 เดือน', '6 เดือน', '12 เดือน']);
  assert.deepEqual(everyMonthOptions(form({ monthEvery: 5 })).map((o) => o.value), [1, 2, 3, 4, 5, 6, 12]);
  assert.deepEqual(everyWeekOptions(form()).map((o) => o.label), ['1 สัปดาห์', '2 สัปดาห์']);
  assert.deepEqual(everyWeekOptions(form({ weekEvery: 4 })).map((o) => o.value), [1, 2, 4]);
  assert.deepEqual(everyWeekOptions(form({ weekEvery: null })).map((o) => o.value), [1, 2]);
});

test('คำเตือนวันที่ไซต์ไม่เปิดให้เข้า: เฉพาะรายสัปดาห์ · ไซต์ที่จำกัดวัน 1–6 วัน · วันที่เลือกอยู่นอกลิสต์', () => {
  const weekly = form({ cadenceKind: 'weekly', startDate: '2026-10-22' });   // พฤหัสบดี
  assert.equal(weekdayOffAccess(weekly, [1, 2, 3]), true);
  assert.equal(weekdayOffAccess(weekly, [1, 2, 3, 4]), false);
  assert.equal(weekdayOffAccess(weekly, ['4']), false, 'ค่าที่มาเป็นสตริงก็อ่านได้');
  assert.equal(weekdayOffAccess(weekly, []), false, 'ไม่ได้จำกัดวัน');
  assert.equal(weekdayOffAccess(weekly, [0, 1, 2, 3, 4, 5, 6]), false);
  assert.equal(weekdayOffAccess(weekly, null), false);
  assert.equal(weekdayOffAccess(form({ startDate: '2026-10-22' }), [1]), false, 'รายเดือนไม่เตือน');
});

/* ═══ ปุ่ม "ใช้" ของชิปจำนวนรอบบริการ ═══════════════════════════════════════════════════════════ */

test('⭐ SO-26090247-0 (1 รอบ): ข้อเสนอ = ทุก 12 เดือน วันที่ 22 ≠ ค่าเริ่ม ⇒ ชิปขึ้น · กด "ใช้" แล้วเท่ากัน ⇒ ชิปหาย', () => {
  const opened = form(SO247);
  const suggestion = suggestCadence({ ...SO247, rounds: 1 });
  assert.equal(cadenceText(suggestion), 'ทุก 12 เดือน วันที่ 22');
  assert.equal(sameCadence(suggestion, planFormCadence(opened)), false);
  const used = applySuggestion(opened, suggestion);
  assert.equal(sameCadence(suggestion, planFormCadence(used)), true);
  assert.equal(used.cadenceKind, 'monthly');
  assert.equal(used.monthEvery, 12);
  assert.equal(used.monthDay, 22);
  assert.ok(everyMonthOptions(used).some((o) => o.value === used.monthEvery), 'ข้อเสนอที่กดแล้วต้องมีชิปให้ติด');
});

test('12 รอบ 12 เดือน: ค่าเริ่มตรงกับข้อเสนออยู่แล้ว ⇒ ไม่มีอะไรให้เสนอ', () => {
  const suggestion = suggestCadence({ ...SO247, rounds: 12 });
  assert.equal(sameCadence(suggestion, planFormCadence(form(SO247))), true);
});

test('ปุ่ม "ใช้" เขียนความถี่ทั้งก้อน: รายสัปดาห์สลับแผ่น + วัน · ทุก N วันเติมตัวเลข · ข้อเสนออ่านไม่ออก = ไม่แตะ', () => {
  const opened = form({ ...SO247, dayMode: 'range', monthDay: 1, monthDayTo: 5 });
  const weekly = suggestCadence({ ...SO247, rounds: 26 });
  assert.equal(weekly.cadenceKind, 'weekly');
  const usedWeekly = applySuggestion(opened, weekly);
  assert.deepEqual(planFormCadence(usedWeekly), six({ cadenceKind: 'weekly', cadenceEvery: 2, cadenceWeekday: weekly.cadenceWeekday }));
  const days = suggestCadence({ ...SO247, rounds: 24 });
  assert.equal(days.cadenceKind, 'days');
  assert.equal(applySuggestion(opened, days).everyDays, days.everyDays);
  // ข้อเสนอรายเดือนวันเดียวต้องล้างโหมดช่วงวันของร่างเดิม
  const monthly = applySuggestion(opened, suggestCadence({ ...SO247, rounds: 4 }));
  assert.deepEqual([monthly.dayMode, monthly.monthDayTo, monthly.monthEvery], ['single', null, 3]);
  assert.equal(applySuggestion(opened, null), opened);
  assert.equal(applySuggestion(opened, { visits: 3 }), opened);
});

/* ═══ บรรทัดสรุป ═════════════════════════════════════════════════════════════════════════════ */

test('⭐ สรุปของ SO247 ค่าเริ่ม: 12 นัด · นัดถัดไป 22 ต.ค. · 23 พ.ย. (22 ตรงวันอาทิตย์) · 22 ธ.ค. · ล่วงหน้า 90 วัน · ปี 2027 ยังไม่มีวันหยุด', () => {
  const summary = planSummary(form(SO247), { todayIso: TODAY, holidays: H2026 });
  assert.equal(summary.readable, true);
  assert.equal(summary.text, 'ทุกเดือน วันที่ 22');
  assert.equal(summary.shiftText, 'ตกวันหยุดเลื่อนไปวันทำการในเดือนเดียวกัน');
  assert.equal(summary.estimate, 12);
  assert.equal(summary.needEndDate, false);
  assert.equal(summary.horizonDays, 90);
  assert.deepEqual(summary.next.map((v) => v.date), ['2026-10-22', '2026-11-23', '2026-12-22']);
  assert.equal(summary.nextText, '22 ต.ค. · 23 พ.ย. (22 ตรงวันอาทิตย์) · 22 ธ.ค.');
  assert.deepEqual(summary.gapYears, [2027]);
  assert.deepEqual(summary.cadence, defaultCadenceFor('2026-10-22'));
});

test('สรุป: "ทุก 30 วัน" ทั้งปี 2026 = 13 นัด (เลขเดิม) · วงเล็บของนัดที่เลื่อนบอกวันที่ย่อของช่อง', () => {
  const summary = planSummary(form({ startDate: '2026-10-22', endDate: '2027-10-21', cadenceKind: 'days', everyDays: '30' }), { todayIso: TODAY, holidays: H2026 });
  assert.equal(summary.text, 'ทุก 30 วัน');
  assert.equal(summary.estimate, 13);
  assert.equal(summary.shiftText, 'ตกวันหยุดเลื่อนไปวันทำการถัดไป');
  // ช่อง 21 พ.ย. เป็นวันเสาร์ → นัดวันจันทร์ 23 พ.ย.
  assert.equal(summary.nextText, '22 ต.ค. · 23 พ.ย. (21 พ.ย. ตรงวันเสาร์) · 21 ธ.ค.');
});

test('สรุป: นัดถัดไปนับจากวันนี้เมื่อรอบเริ่มไปแล้ว · รอบหลายเดือนมองไกลตามระยะเติมนัดของรอบ', () => {
  const started = planSummary(form({ startDate: '2026-01-05', endDate: '2026-12-31', monthDay: 5 }), { todayIso: TODAY, holidays: H2026 });
  // 5 ธ.ค. = เสาร์ → ไปข้างหน้าในเดือน: อา. 6 · จ. 7 เป็นวันหยุด → อังคาร 8 ธ.ค.
  assert.deepEqual(started.next.map((v) => v.date), ['2026-10-05', '2026-11-05', '2026-12-08']);
  assert.match(started.nextText, /8 ธ\.ค\. \(5 ตรงวันเสาร์\)$/);
  const quarterly = planSummary(form({ ...SO247, monthEvery: 3 }), { todayIso: TODAY, holidays: H2026 });
  assert.equal(quarterly.horizonDays, 100);
  assert.equal(quarterly.estimate, 4);
  assert.deepEqual(quarterly.next.map((v) => v.date), ['2026-10-22', '2027-01-22']);
  const yearly = planSummary(form({ ...SO247, monthEvery: 12 }), { todayIso: TODAY, holidays: H2026 });
  assert.equal(yearly.horizonDays, 372);
  assert.equal(yearly.estimate, 1);
  // รอบทุก 12 เดือนสองปี: นัดที่สองอยู่ปีหน้า ⇒ มีเลขปี ("2 พ.ย. · 29 ต.ค." เฉย ๆ อ่านเหมือนถอยหลัง)
  const twoYears = planSummary(form({ startDate: '2026-10-31', endDate: '2028-10-30', monthEvery: 12 }), { todayIso: TODAY, holidays: H2026 });
  assert.equal(twoYears.text, 'ทุก 12 เดือน สิ้นเดือน');
  assert.equal(twoYears.nextText, '2 พ.ย. (31 ตรงวันเสาร์) · 29 ต.ค. 27 (31 ตรงวันอาทิตย์)');
  assert.equal(quarterly.nextText, '22 ต.ค. · 22 ม.ค. 27');
});

test('สรุป: ช่วงวัน 1–5 นัดวันทำการแรกของช่วง · วันหยุดในช่วงถูกข้าม', () => {
  const ranged = form({ startDate: '2026-11-01', endDate: '2027-01-31', dayMode: 'range', monthDay: 1, monthDayTo: 5 });
  const summary = planSummary(ranged, { todayIso: TODAY, holidays: H2026 });
  assert.equal(summary.text, 'ทุกเดือน วันที่ 1–5');
  assert.equal(summary.shiftText, 'นัดวันทำการแรกของช่วง');
  assert.equal(summary.estimate, 3);
  // 1 พ.ย. 2026 = อาทิตย์ → จันทร์ 2 พ.ย. · 1 ธ.ค. = อังคาร · 1 ม.ค. 2027 = ศุกร์ (ยังไม่มีวันหยุดปี 2027 ในชุด)
  assert.deepEqual(summary.next.map((v) => v.date), ['2026-11-02', '2026-12-01', '2027-01-01']);
  assert.equal(summary.nextText, '2 พ.ย. (1 ตรงวันอาทิตย์) · 1 ธ.ค. · 1 ม.ค. 27', 'นัดที่ข้ามปีมีเลขปีต่อท้าย');
});

test('สรุป: ไม่มีวันสิ้นสุด = ประมาณไม่ได้ (บอกให้ใส่วันสิ้นสุด) แต่ยังบอกนัดถัดไป · ไม่มีวันเริ่ม = ไม่มีนัดถัดไป', () => {
  const open = planSummary(form({ startDate: '2026-10-22' }), { todayIso: TODAY, holidays: H2026 });
  assert.equal(open.estimate, null);
  assert.equal(open.needEndDate, true);
  assert.equal(open.next.length, 3);
  // รอบปลายเปิด: ช่วงเตือนวันหยุด = ถึงวันนัดสุดท้ายที่ตัวเติมนัดสร้างให้วันนี้ — กติกาเดียวกับ server
  //   รอบยังไม่เริ่ม (22 ต.ค.) ⇒ ระยะนับจากวันเริ่มรอบ: 22 ต.ค. + 90 วัน = 20 ม.ค. 2027 → ไปถึงปีที่ยังไม่มีวันหยุด
  assert.deepEqual(open.gapYears, [2027]);
  //   รอบเริ่มไปแล้ว: วันนี้ + 90 วัน (1 ต.ค. → 30 ธ.ค. 2026) ยังไม่ถึงปี 2027
  assert.deepEqual(planSummary(form({ startDate: '2026-09-22' }), { todayIso: TODAY, holidays: H2026 }).gapYears, []);
  assert.deepEqual(planSummary(form({ startDate: '2026-10-22' }), { todayIso: '2026-11-15', holidays: H2026 }).gapYears, [2027]);
  const noStart = planSummary(form({ monthDay: 22 }), { todayIso: TODAY, holidays: H2026 });
  assert.equal(noStart.readable, true);
  assert.equal(noStart.text, 'ทุกเดือน วันที่ 22');
  assert.deepEqual(noStart.next, []);
  assert.equal(noStart.nextText, '');
  assert.deepEqual(noStart.gapYears, []);
});

test('สรุป: ความถี่ยังอ่านไม่ออก (ทุก N วันยังว่าง · ช่วงวันยังไม่ครบ) = ไม่มีข้อความ/ตัวเลข ไม่ใช่ตัวเลขผิด', () => {
  const empty = planSummary(form({ ...SO247, cadenceKind: 'days' }), { todayIso: TODAY, holidays: H2026 });
  assert.deepEqual([empty.readable, empty.text, empty.estimate, empty.nextText, empty.needEndDate], [false, null, null, '', false]);
  assert.equal(empty.horizonDays, 90);
  const unset = planSummary(setDayMode(form(SO247), 'range'), { todayIso: TODAY, holidays: H2026 });
  assert.equal(unset.pending, CADENCE_TEXT.rangeUnset);
  assert.deepEqual([unset.readable, unset.text, unset.estimate], [false, null, null]);
  const pending = planSummary(pickRangeDay(setDayMode(form(SO247), 'range'), 3), { todayIso: TODAY, holidays: H2026 });
  assert.equal(pending.pending, CADENCE_TEXT.rangePending);
  assert.deepEqual([pending.readable, pending.text, pending.estimate], [false, null, null]);
  assert.deepEqual(pending.gapYears, []);
});

test('🔴 สรุป: "ทุก N วัน" ที่บันทึกไม่ได้ (เกิน 365 · ทศนิยม · ศูนย์) ไม่ถูกโชว์เป็นความถี่ — ตัวตรวจตัวเดียวกับตอนบันทึก', () => {
  const of = (everyDays) => planSummary(form({ ...SO247, cadenceKind: 'days', everyDays }), { todayIso: TODAY, holidays: H2026 });
  for (const bad of ['400', '1.5', '0', '-3', 'abc']) {
    const summary = of(bad);
    assert.deepEqual([summary.readable, summary.text, summary.shiftText, summary.estimate, summary.nextText, summary.needEndDate],
      [false, null, null, null, '', false], `ทุก ${bad} วัน`);
    assert.equal(normalizePlanInput({ siteId: 'S1', kind: 'refill', ...SO247, ...planFormCadence(form({ cadenceKind: 'days', everyDays: bad })) }).error,
      CADENCE_ERRORS.days, `ทุก ${bad} วัน: ปุ่มบันทึกตีกลับด้วยข้อความเดียวกัน`);
  }
  // ขอบที่บันทึกได้ยังโชว์ตามปกติ
  assert.deepEqual([of('365').text, of('365').estimate], ['ทุก 365 วัน', 1]);
  assert.deepEqual([of('1').text, of(30).text], ['ทุก 1 วัน', 'ทุก 30 วัน']);
});

test('🔴 สรุป: "นัดถัดไป" = นัดที่ server จะสร้างตอนบันทึกจริง — รอบตามปฏิทินที่ยังไม่เริ่มได้นัดแรก · ทุก N วันที่เริ่มไกลกว่าระยะเติมนัดยังไม่มี', () => {
  // วันนี้ 1 ต.ค. 2026 · รอบเริ่ม 15 ม.ค. 2027 (อีก 106 วัน — เกินระยะเติมนัด 90 วันนับจากวันนี้)
  const future = { startDate: '2027-01-15', endDate: '2028-01-14' };
  const monthly = planSummary(form(future), { todayIso: TODAY, holidays: H2026 });
  assert.equal(monthly.nextText, '15 ม.ค. 27 · 15 ก.พ. 27 · 15 มี.ค. 27');
  assert.deepEqual(monthly.next.map((visit) => visit.date),
    ensureVisits({ id: 'P1', siteId: 'S1', kind: 'refill', isActive: true, ...monthly.cadence, ...future }, [], { from: TODAY, holidays: H2026 })
      .slice(0, 3).map((row) => row.scheduledDate), 'ตัวอย่างบนจอ = สามนัดแรกที่ตัวเติมนัดสร้างจริง');
  const days = planSummary(form({ ...future, cadenceKind: 'days', everyDays: '30' }), { todayIso: TODAY, holidays: H2026 });
  assert.deepEqual([days.readable, days.nextText], [true, ''], 'server ยังไม่สร้างนัดให้ จอจึงไม่โชว์วันที่ที่จะไม่มีจริง');
  assert.deepEqual(ensureVisits({ id: 'P1', siteId: 'S1', kind: 'refill', isActive: true, ...days.cadence, ...future }, [], { from: TODAY, holidays: H2026 }), []);
});

test('สรุป: วันหยุดยังโหลดไม่เสร็จ (Map ว่าง / null) = ไม่มีคำเตือนปีขาด · นัดเลื่อนหนีแค่เสาร์–อาทิตย์', () => {
  for (const holidays of [new Map(), null]) {
    const summary = planSummary(form(SO247), { todayIso: TODAY, holidays });
    assert.deepEqual(summary.gapYears, []);
    assert.equal(summary.nextText, '22 ต.ค. · 23 พ.ย. (22 ตรงวันอาทิตย์) · 22 ธ.ค.');
  }
  // Map<วัน, ชื่อ> ของ useHolidayMap ใช้ได้เหมือน Set
  const asMap = new Map([...H2026].map((day) => [day, 'วันหยุด']));
  const holiday = planSummary(form({ startDate: '2026-10-23', endDate: '2026-12-31', monthDay: 23 }), { todayIso: TODAY, holidays: asMap });
  assert.match(holiday.nextText, /^26 ต\.ค\. \(23 ตรงวันหยุด\)/);
});

test('ปีที่ยังไม่มีวันหยุด: กติกาเดียวกับ server — ช่วง [max(วันนี้, วันเริ่ม), วันสิ้นสุด] · รอบที่จบในปีที่มีวันหยุดครบ = []', () => {
  assert.deepEqual(planGapYears({ ...defaultCadenceFor('2026-10-22'), ...SO247 }, H2026, TODAY), [2027]);
  assert.deepEqual(planGapYears({ everyDays: 30, startDate: '2026-01-01', endDate: '2026-12-31' }, H2026, TODAY), []);
  assert.deepEqual(planGapYears({ everyDays: 30, startDate: '2025-01-01', endDate: '2026-12-31' }, H2026, TODAY), [], 'ปีที่ผ่านไปแล้วไม่นับ');
  assert.deepEqual(planGapYears({ everyDays: 30, startDate: '2026-01-01', endDate: '2028-03-01' }, H2026, TODAY), [2027, 2028]);
  assert.deepEqual(planGapYears({ everyDays: 30, startDate: '2026-01-01', endDate: '2026-06-30' }, H2026, TODAY), [], 'รอบที่จบไปแล้ว');
  // ปลายเปิด: วันนี้ + ระยะเติมนัด (ทุก 12 เดือน = 372 วัน ⇒ ถึงปี 2027)
  assert.deepEqual(planGapYears({ everyDays: 30, startDate: '2026-01-01', endDate: null }, H2026, TODAY), []);
  assert.deepEqual(planGapYears({ cadenceKind: 'monthly', cadenceEvery: 12, cadenceMonthDay: 1, startDate: '2026-01-01' }, H2026, TODAY), [2027]);
});

/* ═══ เปลี่ยนรอบที่มีนัดอยู่แล้ว (คำตอบ 409) + ข้อความหลังบันทึก ═════════════════════════════════════ */

const PREVIEW = {
  fromText: 'ทุก 30 วัน', toText: 'ทุกเดือน วันที่ 22',
  cancel: [
    { id: 'SVV-3', code: 'SV-26100007', scheduledDate: '2026-12-21', planSlotDate: '2026-12-21', status: 'draft', assigneeName: null },
    { id: 'SVV-4', code: 'SV-26100008', scheduledDate: '2027-01-20', planSlotDate: '2027-01-20', status: 'scheduled', assigneeName: 'ช่าง ก' },
  ],
  keptMoved: 1, keptStarted: 0, keptPast: 2, reslot: 1,
};
const apiError = (status, data, message = data?.error) => Object.assign(new Error(message), { status, data });

test('🔴 409 plan_schedule_confirm → รายการให้ยืนยัน + id ที่ส่งกลับ · error อื่นไม่ใช่คำถามยืนยัน', () => {
  assert.equal(PLAN_SCHEDULE_CONFIRM, 'plan_schedule_confirm');
  const asked = scheduleConfirmOf(apiError(409, { error: CADENCE_TEXT.confirm.needConfirm(2), code: PLAN_SCHEDULE_CONFIRM, stale: false, preview: PREVIEW }));
  assert.deepEqual(asked, { preview: PREVIEW, message: CADENCE_TEXT.confirm.needConfirm(2) });
  assert.deepEqual(cancelVisitIdsOf(asked.preview), ['SVV-3', 'SVV-4']);
  assert.deepEqual(keptOfPreview(asked.preview), { moved: 1, started: 0, past: 2, manual: 0 });
  assert.equal(CADENCE_TEXT.confirm.kept(keptOfPreview(asked.preview)), 'นัดตามรอบเดิมที่ไม่ถูกแตะ: ย้ายวันเอง 1 นัด · เลยวันนัดแล้ว 2 นัด — จัดการเองได้ที่หน้าจัดคิว');

  assert.equal(scheduleConfirmOf(apiError(409, { error: 'ติดด่านอื่น' })), null, '409 ของด่านอื่น');
  assert.equal(scheduleConfirmOf(apiError(500, { code: PLAN_SCHEDULE_CONFIRM, preview: PREVIEW })), null);
  assert.equal(scheduleConfirmOf(apiError(409, { code: PLAN_SCHEDULE_CONFIRM })), null, 'ไม่มีรายการ = ไม่มีอะไรให้ยืนยัน');
  assert.equal(scheduleConfirmOf(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')), null);
  assert.equal(scheduleConfirmOf(null), null);
  assert.deepEqual(cancelVisitIdsOf(null), []);
  assert.deepEqual(keptOfPreview(null), { moved: 0, started: 0, past: 0, manual: 0 });
  // นัดที่อยู่ต่อเป็นนัดของรอบใหม่ = บรรทัดของกล่องยืนยัน (คำเดียวกับ toast)
  assert.equal(staysLineOf(asked.preview), 'คงนัดเดิม 1 นัดไว้ตามรอบใหม่');
  assert.equal(staysLineOf({ ...PREVIEW, reslot: 0 }), null);
  assert.equal(staysLineOf(null), null);
  // นัดที่คนตั้งเอง (ไม่มีช่องของรอบ) ถูกบอกในบรรทัดเดียวกัน
  assert.deepEqual(keptOfPreview({ ...PREVIEW, keptManual: 1 }), { moved: 1, started: 0, past: 2, manual: 1 });
  assert.equal(CADENCE_TEXT.confirm.kept(keptOfPreview({ keptManual: 2 })), 'นัดตามรอบเดิมที่ไม่ถูกแตะ: ตั้งนัดเอง 2 นัด — จัดการเองได้ที่หน้าจัดคิว');
});

test('ข้อความหลังบันทึกรอบ: แต่ละท่อนขึ้นเฉพาะเมื่อเกิดจริง · สร้างรอบใหม่ได้ข้อความเดิม', () => {
  assert.equal(planSavedMessage({ plan: {}, generated: [{}, {}, {}], holidayGapYears: [] }), 'บันทึกรอบแล้ว · สร้างนัดให้ 3 ครั้ง');
  assert.equal(planSavedMessage({ plan: {}, generated: [] }), 'บันทึกรอบแล้ว · ยังไม่มีนัดใหม่ที่ต้องสร้าง');
  assert.equal(planSavedMessage(null), 'บันทึกรอบแล้ว · ยังไม่มีนัดใหม่ที่ต้องสร้าง');
  assert.equal(
    planSavedMessage({
      generated: [{}], cancelled: [{ id: 'a' }, { id: 'b' }], reslotted: 1, kept: { moved: 1, started: 0, past: 0 }, holidayGapYears: [2027],
    }),
    'บันทึกรอบแล้ว · ยกเลิกนัดตามรอบเดิม 2 นัด · คงนัดเดิม 1 นัดไว้ตามรอบใหม่ · สร้างนัดให้ 1 ครั้ง'
      + ' · นัดตามรอบเดิมที่ไม่ถูกแตะ: ย้ายวันเอง 1 นัด — จัดการเองได้ที่หน้าจัดคิว'
      + ' · ยังไม่มีวันหยุดปี 2027 ในระบบ — นัดของปีนั้นเลื่อนหนีเฉพาะเสาร์–อาทิตย์ · เพิ่มวันหยุดที่ ตั้งค่า → วันหยุด ก่อนถึงรอบสร้างนัด',
  );
});

test('ข้อความหลังบันทึกรอบ: นัดที่คนตั้งเอง + นัดที่ตรงวันหยุดถูกบอกรหัส (วันหยุดคีย์ทีหลังไม่ย้ายนัดที่สร้างไปแล้ว)', () => {
  assert.equal(offDayVisitsText([]), null);
  assert.equal(offDayVisitsText(null), null);
  assert.equal(offDayVisitsText([{ id: 'SVV-1', code: 'SV-27010001', scheduledDate: '2027-01-01' }]),
    'มีนัดตรงวันหยุดหรือเสาร์–อาทิตย์ 1 นัด: SV-27010001 (1 ม.ค.) — ย้ายวันได้ที่หน้าจัดคิว');
  const many = Array.from({ length: 7 }, (_, i) => ({ id: `SVV-${i}`, code: null, scheduledDate: '2027-04-13' }));
  assert.equal(offDayVisitsText(many),
    'มีนัดตรงวันหยุดหรือเสาร์–อาทิตย์ 7 นัด: SVV-0 (13 เม.ย.), SVV-1 (13 เม.ย.), SVV-2 (13 เม.ย.), SVV-3 (13 เม.ย.), SVV-4 (13 เม.ย.) และอีก 2 นัด — ย้ายวันได้ที่หน้าจัดคิว');
  assert.equal(
    planSavedMessage({
      generated: [], kept: { moved: 0, started: 0, past: 0, manual: 1 },
      offDayVisits: [{ id: 'SVV-1', code: 'SV-27010001', scheduledDate: '2027-01-01' }], holidayGapYears: [],
    }),
    'บันทึกรอบแล้ว · ยังไม่มีนัดใหม่ที่ต้องสร้าง · นัดตามรอบเดิมที่ไม่ถูกแตะ: ตั้งนัดเอง 1 นัด — จัดการเองได้ที่หน้าจัดคิว'
      + ' · มีนัดตรงวันหยุดหรือเสาร์–อาทิตย์ 1 นัด: SV-27010001 (1 ม.ค.) — ย้ายวันได้ที่หน้าจัดคิว',
  );
});

test('คำเตือนวันที่ไซต์ให้เข้า: บอกวันที่ให้เข้ากับวันที่เลือกด้วยชื่อ — ไม่มีคำว่า "วันนี้" ที่อ่านเป็น today', () => {
  const LABELS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const thursday = form({ cadenceKind: 'weekly', weekday: 4 });
  assert.equal(accessWarningText(thursday, [3, 1, 2], LABELS), 'ไซต์นี้ให้เข้าเฉพาะ จ. อ. พ. — วันพฤหัสบดีอยู่นอกวันที่ไซต์เปิดให้เข้า');
  assert.equal(accessWarningText(thursday, ['1', '2', '2'], LABELS), 'ไซต์นี้ให้เข้าเฉพาะ จ. อ. — วันพฤหัสบดีอยู่นอกวันที่ไซต์เปิดให้เข้า', 'เลขเป็นสตริง/ซ้ำก็อ่านได้');
  assert.doesNotMatch(accessWarningText(thursday, [1, 2, 3], LABELS), /วันนี้/);
  // วันที่เลือกอยู่ในลิสต์ · ไซต์ไม่จำกัดวัน · ไม่ใช่รอบรายสัปดาห์ · ไม่ส่งมา = ไม่มีอะไรให้เตือน
  assert.equal(accessWarningText(thursday, [1, 4], LABELS), null);
  assert.equal(accessWarningText(thursday, [], LABELS), null);
  assert.equal(accessWarningText(thursday, null, LABELS), null);
  assert.equal(accessWarningText(form({ cadenceKind: 'monthly' }), [1, 2, 3], LABELS), null);
  // วันที่ตามวันเริ่มรอบ (ยังไม่ได้แตะชิป): เริ่มวันพฤหัสฯ 22 ต.ค.
  assert.match(accessWarningText(form({ cadenceKind: 'weekly', startDate: '2026-10-22' }), [1], LABELS), /^ไซต์นี้ให้เข้าเฉพาะ จ\. — วันพฤหัสบดี/);
  // ไม่ส่งป้ายย่อมา = ใช้ชื่อเต็ม
  assert.equal(accessWarningText(thursday, [1]), 'ไซต์นี้ให้เข้าเฉพาะ จันทร์ — วันพฤหัสบดีอยู่นอกวันที่ไซต์เปิดให้เข้า');
});

/* ═══ ยามของไฟล์ ════════════════════════════════════════════════════════════════════════════ */

const SRC = readFileSync(new URL('./servicePlanForm.js', import.meta.url), 'utf8');
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('🔴 ไฟล์นี้ import ได้แค่ cadence · datePeriods · businessDate · format (ไม่ดึงไฟล์ฝั่ง server/ตัวคิวเข้ามา)', () => {
  const specs = [...CODE.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(specs, ['@/lib/businessDate', '@/lib/datePeriods', '@/lib/format', '@/lib/service/cadence']);
  assert.doesNotMatch(CODE, /rounds|intakePlanFacts|planGen|['"]\.\/intake/);
  assert.doesNotMatch(SRC, /^"use client"/, 'logic ล้วน — ใช้ได้ทั้งเทสต์และจอ');
});

test('🔴 ด่านวันไทย (check:thaitime มองไม่เห็นไฟล์ใหม่ที่ยังไม่เข้า git) — ไม่มีรูปตัดวันจากจุดเวลา/นาฬิกาเครื่อง', () => {
  assert.doesNotMatch(CODE, /new Date\(\)\s*\.toISOString\(\)\s*\.slice\(0,\s*(?:10|7)\)/);
  assert.doesNotMatch(CODE, /\b(?:now|nowIso|iso|createdAt|updatedAt|\w+At)\s*\.slice\(0,\s*(?:10|7)\)/);
  assert.doesNotMatch(CODE, /\.slice\(11,\s*(?:16|19)\)/);
  assert.doesNotMatch(CODE, /new Date\(\)\s*\.get(?:Hours|Minutes)\(\)|\bd\.get(?:Hours|Minutes)\(\)/);
  assert.doesNotMatch(CODE, /new Date\(/, '"วันนี้" มาจาก businessDate() เท่านั้น');
  assert.match(CODE, /todayIso = businessDate\(\)/);
});

test('สัปดาห์เริ่มวันอาทิตย์: ไม่มีตัวหาวันในสัปดาห์/ต้นสัปดาห์เขียนเอง — ถาม dayOfWeek ของ datePeriods', () => {
  assert.doesNotMatch(CODE, /getDay\(|getUTCDay\(/);
  assert.doesNotMatch(CODE, /\+ 6\) % 7/);
  assert.match(CODE, /import \{ addDays, dayOfWeek \} from '@\/lib\/datePeriods';/);
});

test('คำเรียกจำนวนรอบ: ไม่มีคำเก่าในไฟล์นี้ (ยามเดียวกับ roundsSoldWording)', () => {
  const OLD = /ไปกี่รอบ|ไป \$\{[^}]*\} รอบ|ขายไว้|ตามที่ขาย|รอบที่ขาย|รอบ\/โซน|ระบุไว้/;
  const hit = CODE.split('\n').find((line) => OLD.test(line));
  assert.equal(hit, undefined, hit?.trim());
});
