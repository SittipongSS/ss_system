// รอบบริการตามปฏิทิน (mig 0397) — ฝั่ง rounds.js: ตรวจข้อมูลรอบ · เติมนัด · นัดถัดไป · เปลี่ยนรอบที่มีนัดแล้ว
//
// ⭐ มติเจ้าของ 29/09 + คำตอบ 4 ข้อ (แผน mockups/so-service-lines/IMPL_PLAN_C2.md §6–§7)
//    ไฟล์นี้ตรึง **ตัวที่ผู้อ่านรอบทุกจุดเรียก** — เลขคณิตของรอบเองตรึงอยู่ที่ cadence.test.mjs
//    กติกาที่ยึด: รอบตามปฏิทินต้องไม่ "ได้นัดศูนย์ใบเงียบ ๆ" ที่ผู้อ่านคนไหนเลย · รอบทุก N วันเดินเหมือนเดิมทุกกรณี
//
// ชุดวันหยุด = 20 แถวของปี 2026 ในตาราง holidays ของจริง ณ 01/10 (ไม่มีปี 2027 — ตั้งใจให้เห็นช่องโหว่ข้อมูล)
// "SO247" = ช่วง 2026-10-22 → 2027-10-21 (12 เดือนพอดี เริ่มวันพฤหัสบดี)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  cancelConfirmation, ensureVisits, estimateVisitCount, mergePlanPatch, nextAfterDone, normalizePlanInput,
  planScheduleDiff, plannedDates, suggestEveryDays,
} from './rounds.js';
import {
  CADENCE_ERRORS, CADENCE_FIELDS, cadenceText, countSlots, horizonDaysFor, suggestCadence,
  suggestEveryDays as suggestEveryDaysOfCadence,
} from './cadence.js';
import { getHolidays } from '../pm/dateHelpers.js';
import { addDays } from '../datePeriods.js';
import { visitQueue } from './intake.js';
import { isLiveVisit } from './visitStatus.js';
import { periodEndFromMonths, roundChipsFromPeriod } from '../sales/serviceSetup.js';

const H2026 = new Set([
  '2026-01-01', '2026-03-03', '2026-04-06', '2026-04-13', '2026-04-14', '2026-04-15', '2026-05-01', '2026-05-04',
  '2026-05-31', '2026-06-01', '2026-06-03', '2026-07-28', '2026-07-29', '2026-07-30', '2026-08-12', '2026-10-13',
  '2026-10-23', '2026-12-07', '2026-12-10', '2026-12-31',
]);
const TODAY = '2026-10-01';
const SO247 = { startDate: '2026-10-22', endDate: '2027-10-21' };
const base = { id: 'P1', siteId: 'S1', kind: 'refill', isActive: true, assigneeId: 'U1', assigneeName: 'ช่างเอ', ...SO247 };
const monthly = (day, over = {}) => ({
  ...base, cadenceKind: 'monthly', everyDays: null, cadenceEvery: 1, cadenceWeekday: null, cadenceMonthDay: day, cadenceMonthDayTo: null, ...over,
});
const weekly = (weekday, over = {}) => ({
  ...base, cadenceKind: 'weekly', everyDays: null, cadenceEvery: 1, cadenceWeekday: weekday, cadenceMonthDay: null, cadenceMonthDayTo: null, ...over,
});
const days = (everyDays, over = {}) => ({
  ...base, cadenceKind: 'days', everyDays, cadenceEvery: null, cadenceWeekday: null, cadenceMonthDay: null, cadenceMonthDayTo: null, ...over,
});
const opts = (over = {}) => ({ from: TODAY, holidays: H2026, ...over });

/** แถวที่ ensureVisits คืน → นัดในฐาน (id รัน · สถานะร่าง) */
let seq = 0;
const made = (rows, status = 'draft') => rows.map((row) => ({ ...row, id: `V${String(seq += 1).padStart(3, '0')}`, status }));
const slotAt = (visits) => visits.map((v) => `${v.planSlotDate}@${v.scheduledDate}`);
const body = (over = {}) => ({ siteId: 'S1', kind: 'refill', startDate: '2026-10-22', endDate: '2027-10-21', ...over });

// ── normalizePlanInput ─────────────────────────────────────────────────────────────────────
test('normalizePlanInput: คืนความถี่ครบหกช่องทุกชนิด — ช่องที่ชนิดนั้นไม่ใช้เป็น null', () => {
  const of = (over) => {
    const { value, error } = normalizePlanInput(body(over));
    assert.equal(error, null, JSON.stringify(over));
    for (const key of CADENCE_FIELDS) assert.ok(key in value, `ต้องมีคีย์ ${key}`);
    return Object.fromEntries(CADENCE_FIELDS.map((key) => [key, value[key]]));
  };
  assert.deepEqual(of({ cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 22 }), {
    cadenceKind: 'monthly', everyDays: null, cadenceEvery: 1, cadenceWeekday: null, cadenceMonthDay: 22, cadenceMonthDayTo: null,
  });
  assert.deepEqual(of({ cadenceKind: 'monthly', cadenceEvery: 3, cadenceMonthDay: 1, cadenceMonthDayTo: 5 }), {
    cadenceKind: 'monthly', everyDays: null, cadenceEvery: 3, cadenceWeekday: null, cadenceMonthDay: 1, cadenceMonthDayTo: 5,
  });
  assert.deepEqual(of({ cadenceKind: 'weekly', cadenceEvery: 2, cadenceWeekday: 5 }), {
    cadenceKind: 'weekly', everyDays: null, cadenceEvery: 2, cadenceWeekday: 5, cadenceMonthDay: null, cadenceMonthDayTo: null,
  });
  assert.deepEqual(of({ cadenceKind: 'days', everyDays: 30 }), {
    cadenceKind: 'days', everyDays: 30, cadenceEvery: null, cadenceWeekday: null, cadenceMonthDay: null, cadenceMonthDayTo: null,
  });
  // ผู้เรียกรุ่นก่อน 0397: ส่งแค่ everyDays = รอบชนิด days
  assert.deepEqual(of({ everyDays: 45 }), {
    cadenceKind: 'days', everyDays: 45, cadenceEvery: null, cadenceWeekday: null, cadenceMonthDay: null, cadenceMonthDayTo: null,
  });
  // ฟอร์มส่งเลขมาเป็นสตริง
  assert.equal(of({ everyDays: '14' }).everyDays, 14);
});

test('🔴 normalizePlanInput: เปลี่ยนชนิดแล้ว ช่องของชนิดเดิมถูกล้าง — ไม่เหลือ everyDays ค้างให้ CHECK ของฐานตีกลับ', () => {
  // PATCH ผสม {...before, ...body}: รอบเดิมทุก 30 วัน + body ที่เปลี่ยนเป็นรายเดือน
  const { value } = normalizePlanInput({ ...days(30), cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 22 });
  assert.equal(value.cadenceKind, 'monthly');
  assert.equal(value.everyDays, null, 'everyDays ของรอบเดิมต้องไม่ติดมา');
  // กลับทาง: รายเดือน (มีช่วงวัน) → รายสัปดาห์
  const back = normalizePlanInput({ ...monthly(1, { cadenceMonthDayTo: 5 }), cadenceKind: 'weekly', cadenceEvery: 1, cadenceWeekday: 3 }).value;
  assert.deepEqual([back.cadenceMonthDay, back.cadenceMonthDayTo, back.everyDays], [null, null, null]);
});

test('normalizePlanInput: ข้อความผิดเดิมยังเป็นคำเดิม · ลำดับตรวจ ไซต์ → ชนิดงาน → วัน → ความถี่ → หมายเหตุ', () => {
  const error = (over) => normalizePlanInput(body(over)).error;
  // ผิดจุดเดียว = ข้อความเดิมทุกตัวอักษร
  assert.equal(error({ siteId: '', everyDays: 30 }), 'ต้องระบุไซต์');
  assert.equal(error({ kind: 'install', everyDays: 30 }), 'ชนิดรอบบริการไม่ถูกต้อง');
  assert.equal(error({ everyDays: 0 }), 'รอบต้องเป็นจำนวนวันระหว่าง 1–365');
  assert.equal(error({ everyDays: 366 }), 'รอบต้องเป็นจำนวนวันระหว่าง 1–365');
  assert.equal(error({ everyDays: 30, startDate: '' }), 'ต้องระบุวันเริ่มรอบ');
  assert.equal(error({ everyDays: 30, endDate: '2026-01-01' }), 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มรอบ');
  assert.equal(error({ everyDays: 30, note: 'ก'.repeat(1001) }), 'หมายเหตุยาวเกิน 1000 ตัวอักษร');
  // ข้อความของความถี่มาจากตัวตรวจตัวเดียว (cadence.js)
  assert.equal(error({}), CADENCE_ERRORS.kind, 'ไม่ส่งความถี่มาเลย');
  assert.equal(error({ cadenceKind: 'yearly' }), CADENCE_ERRORS.kind);
  assert.equal(error({ cadenceKind: 'weekly', cadenceEvery: 1, cadenceWeekday: 6 }), CADENCE_ERRORS.weekend, 'API ปฏิเสธเสาร์–อาทิตย์เหมือนจอ');
  assert.equal(error({ cadenceKind: 'weekly', cadenceEvery: 1 }), CADENCE_ERRORS.weekday);
  assert.equal(error({ cadenceKind: 'monthly', cadenceEvery: 1 }), CADENCE_ERRORS.monthDay);
  assert.equal(error({ cadenceKind: 'monthly', cadenceEvery: 13, cadenceMonthDay: 22 }), CADENCE_ERRORS.monthEvery);
  assert.equal(error({ cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 5, cadenceMonthDayTo: 5 }), CADENCE_ERRORS.monthDayTo);
  // ลำดับ: วันผิด + ความถี่ผิด = บอกเรื่องวันก่อน · ความถี่ผิด + หมายเหตุยาว = บอกเรื่องความถี่ก่อน
  assert.equal(error({ everyDays: 0, startDate: '' }), 'ต้องระบุวันเริ่มรอบ');
  assert.equal(error({ everyDays: 0, note: 'ก'.repeat(1001) }), 'รอบต้องเป็นจำนวนวันระหว่าง 1–365');
  assert.equal(error({ siteId: '', kind: 'install', everyDays: 0 }), 'ต้องระบุไซต์');
});

test('normalizePlanInput: `cancelVisitIds` และคีย์แปลกปลอมไม่หลุดเข้าแถวรอบ', () => {
  const { value } = normalizePlanInput(body({ everyDays: 30, cancelVisitIds: ['V1'], planSlotDate: '2026-10-22', code: 'x' }));
  assert.deepEqual(Object.keys(value).sort(), [
    'assigneeId', 'assigneeName', 'cadenceEvery', 'cadenceKind', 'cadenceMonthDay', 'cadenceMonthDayTo', 'cadenceWeekday',
    'endDate', 'everyDays', 'isActive', 'kind', 'note', 'salesOrderId', 'siteId', 'startDate',
  ]);
});

// ── mergePlanPatch (D12) ───────────────────────────────────────────────────────────────────
test('mergePlanPatch: body ใหม่ทับรอบเดิม · days → monthly ไม่เหลือ everyDays หลังผ่านตัวตรวจ', () => {
  const { merged, error } = mergePlanPatch(days(30), { cadenceKind: 'monthly', everyDays: null, cadenceEvery: 1, cadenceMonthDay: 22 });
  assert.equal(error, null);
  const { value } = normalizePlanInput(merged);
  assert.equal(cadenceText(value), 'ทุกเดือน วันที่ 22');
  assert.equal(value.everyDays, null);
  // body ที่ส่งแค่ช่องของชนิดใหม่ (ไม่ส่ง everyDays: null) ก็ต้องได้ผลเดียวกัน
  const partial = normalizePlanInput(mergePlanPatch(days(30), { cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 22 }).merged).value;
  assert.equal(partial.everyDays, null);
});

test('mergePlanPatch: แท็บรุ่นเก่า (`everyDays` ไม่มี `cadenceKind`) บนรอบ days = ยังเป็น days ตามที่ส่งมา', () => {
  const { merged, error } = mergePlanPatch(days(30), { everyDays: 45 });
  assert.equal(error, null);
  assert.equal(merged.cadenceKind, 'days');
  assert.equal(normalizePlanInput(merged).value.everyDays, 45);
  // แถวก่อน mig 0397 (ไม่มีคอลัมน์ cadenceKind เลย) เดินเหมือนกัน
  const { id, siteId, kind, isActive, startDate, endDate } = base;
  const legacy = mergePlanPatch({ id, siteId, kind, isActive, startDate, endDate, everyDays: 30 }, { everyDays: 14 });
  assert.equal(legacy.error, null);
  assert.equal(normalizePlanInput(legacy.merged).value.cadenceKind, 'days');
  assert.equal(normalizePlanInput(legacy.merged).value.everyDays, 14);
});

test('🔴 mergePlanPatch: แท็บรุ่นเก่าบนรอบที่ตั้งตามปฏิทิน = ปฏิเสธ — ไม่เปลี่ยน "ทุกเดือน วันที่ 22" เป็น "ทุก 30 วัน" เงียบ ๆ', () => {
  for (const before of [monthly(22), weekly(3)]) {
    const out = mergePlanPatch(before, { everyDays: 30, assigneeId: 'U9' });
    assert.deepEqual(out, { merged: null, error: CADENCE_ERRORS.staleClient });
  }
  // ชนิดที่ส่งมาเป็นค่าว่าง = ไม่ได้บอกชนิด (กติกาเดียวกับ normalizeCadence) — ต้องปฏิเสธเหมือนกัน
  assert.equal(mergePlanPatch(monthly(22), { cadenceKind: null, everyDays: 30 }).error, CADENCE_ERRORS.staleClient);
  assert.equal(mergePlanPatch(monthly(22), { cadenceKind: '', everyDays: 30 }).error, CADENCE_ERRORS.staleClient);
  assert.match(CADENCE_ERRORS.staleClient, /รีเฟรช/, 'ข้อความต้องบอกทางออก');
});

test('mergePlanPatch: body ที่ไม่แตะความถี่ = รอบคงความถี่เดิม · body บอกชนิดเอง = ใช้ตามนั้น', () => {
  const keep = mergePlanPatch(monthly(22), { assigneeId: 'U9', isActive: false });
  assert.equal(keep.error, null);
  const value = normalizePlanInput(keep.merged).value;
  assert.equal(cadenceText(value), 'ทุกเดือน วันที่ 22');
  assert.equal(value.assigneeId, 'U9');
  assert.equal(value.isActive, false);
  // everyDays ว่าง (null / '') ไม่ถือว่าเป็นแท็บรุ่นเก่า
  assert.equal(mergePlanPatch(monthly(22), { everyDays: null, note: 'x' }).error, null);
  assert.equal(mergePlanPatch(monthly(22), { everyDays: '', note: 'x' }).error, null);
  // ลูกข่ายรุ่นใหม่ตั้งใจเปลี่ยนเป็นทุก N วัน = ได้
  const toDays = mergePlanPatch(monthly(22), { cadenceKind: 'days', everyDays: 30, cadenceEvery: null, cadenceMonthDay: null });
  assert.equal(toDays.error, null);
  assert.equal(cadenceText(normalizePlanInput(toDays.merged).value), 'ทุก 30 วัน');
});

test('mergePlanPatch: รอบเดิมที่อ่านความถี่ไม่ออก + แท็บรุ่นเก่าส่ง everyDays = บันทึกเป็น days ได้ (ไม่ค้างเป็นรอบที่แก้ไม่ได้)', () => {
  // แถวแบบนี้ CHECK ของ 0397 ไม่ปล่อยให้เกิด แต่ถ้ามี (แก้ฐานด้วยมือ) ฟอร์มเดิมต้องยังซ่อมได้
  const broken = { ...base, cadenceKind: 'monthly', everyDays: null, cadenceEvery: null, cadenceWeekday: null, cadenceMonthDay: null, cadenceMonthDayTo: null };
  const { merged, error } = mergePlanPatch(broken, { everyDays: 30 });
  assert.equal(error, null);
  assert.equal(merged.cadenceKind, 'days');
  assert.equal(cadenceText(normalizePlanInput(merged).value), 'ทุก 30 วัน');
});

// ── estimateVisitCount / plannedDates / suggestEveryDays ───────────────────────────────────
test('estimateVisitCount: ทุกชนิดนับจากตัวเดียว (`countSlots`) · ทุก 30 วันทั้งปี 2026 ยังได้ 13', () => {
  assert.equal(estimateVisitCount({ startDate: '2026-01-01', endDate: '2026-12-31', everyDays: 30 }), 13);
  assert.equal(estimateVisitCount(monthly(22)), 12);
  assert.equal(estimateVisitCount(weekly(5, { cadenceEvery: 2 })), 26);
  assert.equal(estimateVisitCount(weekly(4, { cadenceEvery: 2 })), 27, 'เริ่มวันพฤหัสฯ ยึดวันพฤหัสฯ ได้ 27');
  assert.equal(estimateVisitCount(monthly(22, { cadenceEvery: 3 })), 4);
  assert.equal(estimateVisitCount(monthly(22, { endDate: null })), null, 'ไม่มีวันสิ้นสุด = ไม่เดา');
  assert.equal(estimateVisitCount(), null);
  assert.equal(estimateVisitCount({ ...SO247 }), null, 'ไม่มีความถี่');
  for (const plan of [monthly(22), weekly(3), days(30)]) assert.equal(estimateVisitCount(plan), countSlots(plan));
});

test('🔴 plannedDates: รอบตามปฏิทินได้วันนัดจริง (เดิมคืน [] เพราะไม่มี everyDays) · เลื่อนหนีวันหยุดในเดือนเดียวกัน', () => {
  assert.deepEqual(
    plannedDates(monthly(22), { from: '2026-10-01', to: '2027-01-31', holidays: H2026 }),
    ['2026-10-22', '2026-11-23', '2026-12-22', '2027-01-22'],          // 22 พ.ย. ตรงวันอาทิตย์ → จันทร์ 23
  );
  assert.deepEqual(
    plannedDates(monthly(31), { from: '2026-10-01', to: '2027-01-31', holidays: H2026 }),
    ['2026-10-30', '2026-11-30', '2026-12-30', '2027-01-29'],          // สิ้นเดือนตกเสาร์/หยุด/อาทิตย์ → ถอยในเดือนเดียวกัน
  );
  assert.deepEqual(
    plannedDates(weekly(5), { from: '2026-10-22', to: '2026-11-08', holidays: H2026 }),
    ['2026-10-22', '2026-10-30', '2026-11-06'],                        // ศุกร์ 23 ต.ค. หยุด → พฤหัสฯ 22 (สัปดาห์เดียวกัน)
  );
  // ไม่ส่ง holidays = ชุดกลางของ pm/dateHelpers (ฝั่ง client + เทสต์เดิม) — ชุดตั้งต้นมีวันหยุดปี 2026 ชุดเดียวกัน
  assert.ok(getHolidays().has('2026-10-23'));
  assert.deepEqual(plannedDates(weekly(5), { from: '2026-10-22', to: '2026-10-25' }), ['2026-10-22']);
  // holidays: null = ดูแค่เสาร์–อาทิตย์
  assert.deepEqual(plannedDates(weekly(5), { from: '2026-10-22', to: '2026-10-25', holidays: null }), ['2026-10-23']);
});

test('suggestEveryDays ของ rounds.js คือตัวเดียวกับ cadence.js (re-export)', () => {
  assert.equal(suggestEveryDays, suggestEveryDaysOfCadence);
});

// ── ensureVisits (R5 · R7) ─────────────────────────────────────────────────────────────────
test('R5-g ensureVisits: SO247 วันที่ 22 จากวันนี้ 1 ต.ค. = สามนัด · ทุกแถวพกช่องของรอบ (`planSlotDate`)', () => {
  const rows = ensureVisits(monthly(22), [], opts());
  assert.deepEqual(rows, [
    { siteId: 'S1', planId: 'P1', kind: 'refill', scheduledDate: '2026-10-22', planSlotDate: '2026-10-22', assigneeId: 'U1', assigneeName: 'ช่างเอ' },
    { siteId: 'S1', planId: 'P1', kind: 'refill', scheduledDate: '2026-11-23', planSlotDate: '2026-11-22', assigneeId: 'U1', assigneeName: 'ช่างเอ' },
    { siteId: 'S1', planId: 'P1', kind: 'refill', scheduledDate: '2026-12-22', planSlotDate: '2026-12-22', assigneeId: 'U1', assigneeName: 'ช่างเอ' },
  ]);
  assert.ok(rows.every((row) => !('status' in row)), 'สถานะเป็นเรื่องของด่าน (planGen) ไม่ใช่ของตัวเติม');
  // รอบทุก N วันก็พกช่อง (วันตามรอบก่อนเลื่อน)
  assert.deepEqual(slotAt(ensureVisits(days(30), [], opts())), ['2026-10-22@2026-10-22', '2026-11-21@2026-11-23', '2026-12-21@2026-12-21']);
});

test('R5-a เติมนัดซ้ำไม่ได้นัดใหม่ — รายเดือน · รายสัปดาห์ · ทุก N วัน', () => {
  for (const plan of [monthly(22), monthly(31), monthly(1, { cadenceMonthDayTo: 5 }), weekly(3), weekly(5, { cadenceEvery: 2 }), days(30)]) {
    const first = made(ensureVisits(plan, [], opts()));
    assert.ok(first.length > 0, cadenceText(plan));
    assert.deepEqual(ensureVisits(plan, first, opts()), [], cadenceText(plan));
  }
});

test('R5-b นัดที่คนย้ายวันแล้ว ไม่ถูกสร้างซ้ำกลับมาที่วันเดิม — กันซ้ำด้วยช่อง ไม่ใช่ด้วยวันนัด', () => {
  const visits = made(ensureVisits(monthly(22), [], opts()));
  const moved = visits.map((v) => (v.planSlotDate === '2026-11-22' ? { ...v, scheduledDate: '2026-11-27' } : v));
  assert.deepEqual(ensureVisits(monthly(22), moved, opts()), []);
});

test('R5-c วันหยุดที่เพิ่มทีหลังบนวันที่นัดไปแล้ว ไม่ทำให้ช่องเดิมได้นัดใบที่สอง', () => {
  const visits = made(ensureVisits(monthly(22), [], opts()));
  const later = new Set([...H2026, '2026-12-22']);     // เจ้าของคีย์วันหยุดเพิ่ม: 22 ธ.ค.
  assert.deepEqual(ensureVisits(monthly(22), visits, opts({ holidays: later })), []);
  // รอบที่ยังไม่มีนัดจะได้วันใหม่ตามวันหยุดชุดใหม่
  assert.equal(ensureVisits(monthly(22), [], opts({ holidays: later })).at(-1).scheduledDate, '2026-12-23');
});

test('R5-d นัดที่ **คน** ยกเลิก (ยังอยู่ในรอบ ยังจำช่อง) ยังถือช่อง — ระบบไม่ gen กลับมาเอง', () => {
  const visits = made(ensureVisits(monthly(22), [], opts()));
  const cancelled = visits.map((v, i) => (i === 0 ? { ...v, status: 'cancelled' } : v));
  assert.deepEqual(ensureVisits(monthly(22), cancelled, opts()), []);
});

test('R5-e ห้ามกันซ้ำข้ามรอบ — สองรอบของสองใบที่ไซต์เดียวกันได้นัดสองชุด', () => {
  const planB = { ...monthly(22), id: 'P2', salesOrderId: 'SO2' };
  const ofA = made(ensureVisits(monthly(22), [], opts()));
  const ofB = ensureVisits(planB, ofA, opts());
  assert.deepEqual(ofB.map((v) => v.scheduledDate), ofA.map((v) => v.scheduledDate));
  assert.ok(ofB.every((v) => v.planId === 'P2'));
});

test('R5-f นัดของรอบที่ไม่มีช่อง (คนสร้างเอง · ก่อน mig 0397): อยู่ตรงวันที่ระบบจะนัด = ถือช่องนั้น · คนละวัน = ไม่ถือ', () => {
  const manual = (scheduledDate) => [{ id: 'M1', planId: 'P1', siteId: 'S1', kind: 'refill', status: 'scheduled', scheduledDate }];
  // 23 พ.ย. คือวันที่ระบบนัดให้ช่อง 22 พ.ย. (อาทิตย์)
  assert.deepEqual(slotAt(ensureVisits(monthly(22), manual('2026-11-23'), opts())), ['2026-10-22@2026-10-22', '2026-12-22@2026-12-22']);
  // ช่องดิบ 22 พ.ย. ไม่ใช่วันนัด — นัดมือที่ลงวันอาทิตย์ไม่ถือช่อง
  assert.equal(ensureVisits(monthly(22), manual('2026-11-22'), opts()).length, 3);
  assert.equal(ensureVisits(monthly(22), manual('2026-11-25'), opts()).length, 3, 'ข้อจำกัดที่รู้: นัดมือคนละวันถูกเติมซ้อนได้ (เหมือนเดิม)');
  // นัดของรอบอื่น / งานนอกรอบ บนวันเดียวกัน ไม่เกี่ยว
  assert.equal(ensureVisits(monthly(22), [{ ...manual('2026-11-23')[0], planId: null }], opts()).length, 3);
});

test('R5-i นัดที่ถือช่อง X แล้วถูกย้ายไปลงวันที่ระบบนัดให้ช่อง Y — ช่อง Y ยังได้นัดของตัวเอง (เห็นซ้อน ไม่ใช่รอบหายเงียบ)', () => {
  const visits = made(ensureVisits(monthly(22), [], opts()));
  // ย้ายนัดของช่อง 22 ต.ค. ไปลง 23 พ.ย. แล้วลบนัดของช่อง 22 พ.ย. ออกจากชุด
  const moved = visits
    .filter((v) => v.planSlotDate !== '2026-11-22')
    .map((v) => (v.planSlotDate === '2026-10-22' ? { ...v, scheduledDate: '2026-11-23' } : v));
  assert.deepEqual(slotAt(ensureVisits(monthly(22), moved, opts())), ['2026-11-22@2026-11-23']);
});

test('R5-j ช่องที่วันนัดถอยไปก่อนวันนี้ ไม่ถูกสร้าง — ตัวเติมไม่สร้างนัดในอดีต', () => {
  // สิ้นเดือน ต.ค. 2026 = เสาร์ 31 → นัดศุกร์ 30 · เติมนัดวันเสาร์ 31 ⇒ ไม่สร้างนัดของ 30 ต.ค.
  const rows = ensureVisits(monthly(31), [], opts({ from: '2026-10-31', horizonDays: 40 }));
  assert.deepEqual(slotAt(rows), ['2026-11-30@2026-11-30']);
  assert.deepEqual(slotAt(ensureVisits(monthly(31), [], opts({ from: '2026-10-30', horizonDays: 40 }))),
    ['2026-10-31@2026-10-30', '2026-11-30@2026-11-30']);
});

test('R7-a ระยะเติมนัดตั้งต้น = horizonDaysFor(plan) — รอบทุก 3 เดือนที่มอง 90 วันไม่มีนัดข้างหน้าเลย', () => {
  const quarterly = monthly(22, { cadenceEvery: 3 });
  assert.equal(horizonDaysFor(quarterly), 100);
  const from = '2026-10-23';      // วันถัดจากนัดแรกของรอบ
  assert.deepEqual(ensureVisits(quarterly, [], opts({ from, horizonDays: 90 })), []);
  assert.deepEqual(slotAt(ensureVisits(quarterly, [], opts({ from, horizonDays: 100 }))), ['2027-01-22@2027-01-22']);
  assert.deepEqual(slotAt(ensureVisits(quarterly, [], opts({ from }))), ['2027-01-22@2027-01-22'], 'ไม่ส่ง horizonDays = ใช้ของรอบ');
  // ทุก N วัน: 90 วันเท่าเดิม
  assert.equal(horizonDaysFor(days(30)), 90);
  assert.deepEqual(ensureVisits(days(30), [], opts()), ensureVisits(days(30), [], opts({ horizonDays: 90 })));
});

test('ensureVisits: รอบปิด · วันเริ่มเติมไม่ใช่วัน · ความถี่อ่านไม่ออก = ไม่สร้างอะไร (ไม่พัง)', () => {
  assert.deepEqual(ensureVisits(monthly(22, { isActive: false }), [], opts()), []);
  assert.deepEqual(ensureVisits(monthly(22), [], opts({ from: 'x' })), []);
  assert.deepEqual(ensureVisits({ ...base, cadenceKind: 'monthly', cadenceEvery: 1 }, [], opts()), []);
  assert.deepEqual(ensureVisits(null, [], opts()), []);
});

// ── nextAfterDone (R6) ─────────────────────────────────────────────────────────────────────
test('R6-a ทุก N วัน: รูปเดิมทุกคีย์ — นับจากวันที่ทำจริง · ไม่มี planSlotDate ในข้อเสนอ', () => {
  const plan = days(30, { endDate: null });
  const done = { id: 'V1', planId: 'P1', scheduledDate: '2026-10-22', actualDate: '2026-10-27', planSlotDate: '2026-10-22', status: 'done' };
  assert.deepEqual(nextAfterDone(plan, done, { holidays: H2026 }), {
    siteId: 'S1', planId: 'P1', kind: 'refill', scheduledDate: '2026-11-26', assigneeId: 'U1', assigneeName: 'ช่างเอ', status: 'scheduled',
  });
  // ตกวันหยุด/เสาร์–อาทิตย์ → วันทำการถัดไป (ข้ามเดือนได้) · เลยวันสิ้นสุด = null
  assert.equal(nextAfterDone(plan, { actualDate: '2026-10-01' }, { holidays: H2026 }).scheduledDate, '2026-11-02');   // 31 ต.ค. = เสาร์
  assert.equal(nextAfterDone(days(30, { endDate: '2026-11-20' }), done, { holidays: H2026 }), null);
  // ไม่มีเจ้าหน้าที่ประจำรอบ = ใช้ของนัดที่เพิ่งปิด
  const noStaff = nextAfterDone(days(30, { assigneeId: null, assigneeName: null }), { ...done, assigneeId: 'U7', assigneeName: 'ช่างบี' }, { holidays: H2026 });
  assert.deepEqual([noStaff.assigneeId, noStaff.assigneeName], ['U7', 'ช่างบี']);
});

test('🔴 R6-b รอบตามปฏิทิน: ข้อเสนอ = นัดตามรอบตัวถัดไป (เดิมคืน null เพราะไม่มี everyDays) — วันของรอบไม่ไหลตามวันที่ทำ', () => {
  const plan = monthly(22);
  const slot1 = { id: 'V1', planId: 'P1', planSlotDate: '2026-10-22', scheduledDate: '2026-10-22', status: 'done' };
  const next = (visit) => nextAfterDone(plan, visit, { holidays: H2026 });
  assert.deepEqual(next({ ...slot1, actualDate: '2026-10-22' }), {
    siteId: 'S1', planId: 'P1', kind: 'refill', scheduledDate: '2026-11-23', planSlotDate: '2026-11-22',
    assigneeId: 'U1', assigneeName: 'ช่างเอ', status: 'scheduled',
  });
  assert.equal(next({ ...slot1, actualDate: '2026-10-20' }).scheduledDate, '2026-11-23', 'เข้าก่อนกำหนด');
  assert.equal(next({ ...slot1, actualDate: '2026-10-28' }).scheduledDate, '2026-11-23', 'เข้าช้า — รอบหน้ายังเป็นวันของรอบ');
  assert.equal(next({ ...slot1, actualDate: '2026-11-25' }).scheduledDate, '2026-12-22', 'ช้าจนเลยรอบถัดไป');
  // นัดของช่อง 22 พ.ย. ที่ย้ายมาทำ 10 พ.ย. — ไม่เสนอ 23 พ.ย. ซึ่งคือช่องของมันเอง
  const early = next({ id: 'V2', planId: 'P1', planSlotDate: '2026-11-22', scheduledDate: '2026-11-10', actualDate: '2026-11-10', status: 'done' });
  assert.deepEqual([early.planSlotDate, early.scheduledDate], ['2026-12-22', '2026-12-22']);
  // นัดไม่มีช่อง (คนสร้างเอง) ทำ 20 พ.ย. → 23 พ.ย.
  assert.equal(next({ id: 'V3', planId: 'P1', scheduledDate: '2026-11-20', actualDate: '2026-11-20', status: 'done' }).scheduledDate, '2026-11-23');
  // ช่องสุดท้ายของรอบ = ไม่มีข้อเสนอ
  assert.equal(next({ id: 'V9', planId: 'P1', planSlotDate: '2027-09-22', scheduledDate: '2027-09-22', actualDate: '2027-09-22', status: 'done' }), null);
  // ไม่ส่งวันที่ทำจริง = ใช้วันนัด
  assert.equal(next({ ...slot1, actualDate: null }).scheduledDate, '2026-11-23');
  // หลัง **max(วันที่ทำจริง, วันที่นัด)**: นัดไม่มีช่องที่นัดไว้ 25 พ.ย. แต่เข้าก่อน 20 พ.ย. → ไม่เสนอ 23 พ.ย. ที่อยู่ก่อนวันนัดของมันเอง
  assert.equal(next({ id: 'V4', planId: 'P1', scheduledDate: '2026-11-25', actualDate: '2026-11-20', status: 'done' }).scheduledDate, '2026-12-22');
  assert.equal(next({ id: 'V5', planId: 'P1', scheduledDate: '2026-11-20', actualDate: '2026-11-25', status: 'done' }).scheduledDate, '2026-12-22');
});

test('R6-b รายสัปดาห์ + รอบที่ปิด/อ่านไม่ออก', () => {
  const plan = weekly(3);                                              // ทุกวันพุธ
  const done = { id: 'V1', planId: 'P1', planSlotDate: '2026-10-28', scheduledDate: '2026-10-28', actualDate: '2026-10-29', status: 'done' };
  const next = nextAfterDone(plan, done, { holidays: H2026 });
  assert.deepEqual([next.planSlotDate, next.scheduledDate, next.status], ['2026-11-04', '2026-11-04', 'scheduled']);
  assert.equal(nextAfterDone(monthly(22, { isActive: false }), done, { holidays: H2026 }), null);
  assert.equal(nextAfterDone({ ...base, cadenceKind: 'weekly', cadenceEvery: 1 }, done, { holidays: H2026 }), null);
  assert.equal(nextAfterDone(plan, { scheduledDate: null }, { holidays: H2026 }), null);
  assert.equal(nextAfterDone(null, done), null);
});

// ── planScheduleDiff (§7.1) ────────────────────────────────────────────────────────────────
const diffOf = (before, after, visits, over = {}) => planScheduleDiff({ before, after, visits, todayIso: TODAY, holidays: H2026, ...over });
const ids = (list) => list.map((v) => v.id);
const shape = (diff) => ({
  cancel: ids(diff.cancel), reslot: diff.reslot.map((r) => `${r.visit.id}→${r.slot}`),
  keptMoved: ids(diff.keptMoved), keptStarted: ids(diff.keptStarted), keptPast: ids(diff.keptPast),
});
const EMPTY = { cancel: [], reslot: [], keptMoved: [], keptStarted: [], keptPast: [] };
/** ทุกกลุ่มของผล รวมกลุ่มที่เส้น PATCH เขียนเงียบ ๆ (`hold` ถือช่องใหม่ · `release` ล้างช่องเดิม) และนัดที่คนตั้งเอง */
const full = (diff) => ({
  ...shape(diff), keptManual: ids(diff.keptManual),
  hold: diff.hold.map((r) => `${r.visit.id}→${r.slot}`), release: ids(diff.release),
});
const NOTHING = { ...EMPTY, keptManual: [], hold: [], release: [] };

test('§7.1 ทุก 30 วัน → ทุกเดือน วันที่ 22: นัดแรกตามรอบใหม่อยู่แล้ว · นัดที่วันตรงกัน **ย้ายช่อง** · ที่เหลือยกเลิก', () => {
  const [v1, v2, v3] = made(ensureVisits(days(30), [], opts()));
  assert.deepEqual(slotAt([v1, v2, v3]), ['2026-10-22@2026-10-22', '2026-11-21@2026-11-23', '2026-12-21@2026-12-21']);
  const diff = diffOf(days(30), monthly(22), [v1, v2, v3]);
  assert.deepEqual(shape(diff), { ...EMPTY, reslot: [`${v2.id}→2026-11-22`], cancel: [v3.id] });
  // เขียนตามลำดับของเส้น PATCH แล้วเติมนัด = ได้เพิ่มใบเดียว (22 ธ.ค.) · เติมซ้ำไม่ได้อะไร
  const after = applyDiff([v1, v2, v3], diff);
  const added = made(ensureVisits(monthly(22), after, opts()));
  assert.deepEqual(slotAt(added), ['2026-12-22@2026-12-22']);
  assert.deepEqual(ensureVisits(monthly(22), [...after, ...added], opts()), []);
});

test('§7.1 นัดที่คนย้ายวันเอง · เริ่มงานแล้ว · เลยวันนัดแล้ว = ไม่ถูกแตะ (ไม่อยู่ในรายการยกเลิก)', () => {
  const [v1, v2, v3] = made(ensureVisits(days(30), [], opts()));
  // ย้ายเอง: V3 จาก 21 ธ.ค. → 18 ธ.ค.
  assert.deepEqual(shape(diffOf(days(30), monthly(22), [v1, v2, { ...v3, scheduledDate: '2026-12-18' }])),
    { ...EMPTY, reslot: [`${v2.id}→2026-11-22`], keptMoved: [v3.id] });
  // กำลังทำ
  assert.deepEqual(shape(diffOf(days(30), monthly(22), [v1, v2, { ...v3, status: 'in_progress' }])),
    { ...EMPTY, reslot: [`${v2.id}→2026-11-22`], keptStarted: [v3.id] });
  // เลยวันนัดแล้ว (วันนี้ = 22 ธ.ค.) — V2 กับ V3 ค้าง คนจัดคิวตัดสินเอง
  const late = diffOf(days(30), monthly(22), [v1, v2, v3], { todayIso: '2026-12-22' });
  assert.deepEqual(shape(late), { ...EMPTY, keptPast: [v2.id, v3.id] });
  // ปิดงานแล้ว / ยกเลิกแล้ว / เลื่อนแล้ว ไม่เป็นตัวเลือก
  for (const status of ['done', 'partial', 'unable', 'cancelled', 'rescheduled']) {
    assert.deepEqual(shape(diffOf(days(30), monthly(22), [v1, v2, { ...v3, status }])),
      { ...EMPTY, reslot: [`${v2.id}→2026-11-22`] }, status);
  }
});

test('§7.1 ตารางไม่เปลี่ยน = ว่างทุกกลุ่ม · ร่นวันสิ้นสุด = นัดหลังวันสิ้นสุดถูกยกเลิก · เลื่อนวันเริ่ม = ช่องขยับทั้งชุด', () => {
  const visits = made(ensureVisits(monthly(22), [], opts()));
  assert.deepEqual(shape(diffOf(monthly(22), monthly(22), visits)), EMPTY);
  assert.deepEqual(shape(diffOf(monthly(22), monthly(22, { assigneeId: 'U9', note: 'x' }), visits)), EMPTY, 'แก้เจ้าหน้าที่/หมายเหตุ');
  // นัดที่คนย้ายวันบนรอบเดิม ก็ยังเป็นนัดของรอบ (ช่องยังอยู่)
  assert.deepEqual(shape(diffOf(monthly(22), monthly(22), visits.map((v) => ({ ...v, scheduledDate: '2026-12-30' })))), EMPTY);
  // ร่นวันสิ้นสุดเป็น 30 พ.ย. — นัดของช่อง 22 ธ.ค. ไม่ใช่ช่องของรอบอีกแล้ว
  assert.deepEqual(shape(diffOf(monthly(22), monthly(22, { endDate: '2026-11-30' }), visits)), { ...EMPTY, cancel: [visits[2].id] });
  // ทุก 30 วัน เลื่อนวันเริ่ม 22 → 25 ต.ค.: ทุกช่องขยับ ไม่มีวันไหนตรงกัน
  const every30 = made(ensureVisits(days(30), [], opts()));
  assert.deepEqual(shape(diffOf(days(30), days(30, { startDate: '2026-10-25' }), every30)), { ...EMPTY, cancel: ids(every30) });
});

test('§7.1 ปิดรอบ / ความถี่ใหม่อ่านไม่ออก = ไม่แตะนัดเลย · นัดไม่มีช่องกับนัดที่ถูกถอดออกจากรอบแล้ว ไม่เคยอยู่ในรายการ', () => {
  const visits = made(ensureVisits(monthly(22), [], opts()));
  assert.deepEqual(shape(diffOf(monthly(22), monthly(15, { isActive: false }), visits)), EMPTY);
  assert.deepEqual(shape(diffOf(monthly(22), { ...base, cadenceKind: 'monthly', cadenceEvery: 1 }, visits)), EMPTY);
  assert.deepEqual(shape(planScheduleDiff()), EMPTY);
  const slotless = visits.map((v) => ({ ...v, planSlotDate: null }));
  assert.deepEqual(shape(diffOf(monthly(22), monthly(15), slotless)), EMPTY, 'นัดไม่มีช่อง = ไม่มีตัวตนในตาราง');
  const released = visits.map((v) => ({ ...v, status: 'cancelled', planId: null, planSlotDate: null }));
  assert.deepEqual(shape(diffOf(monthly(22), monthly(15), released)), EMPTY);
  const otherPlan = visits.map((v) => ({ ...v, planId: 'P2' }));
  assert.deepEqual(shape(diffOf(monthly(22), monthly(15), otherPlan)), EMPTY, 'นัดของรอบอื่น');
});

test('§7.1 แถวรอบก่อน mig 0397 (ไม่มี cadenceKind) เป็นรอบเดิมได้ · ทุกกลุ่มเรียงตามวันนัดแล้วตาม id', () => {
  const visits = made(ensureVisits(days(30), [], opts()));
  const { id, siteId, kind, isActive, startDate, endDate } = base;
  const legacy = { id, siteId, kind, isActive, startDate, endDate, everyDays: 30 };
  assert.deepEqual(shape(diffOf(legacy, monthly(15), visits)), { ...EMPTY, cancel: ids(visits) });
  // ลำดับ: ส่งนัดกลับหัว ผลยังเรียงตามวันนัด
  const out = diffOf(legacy, monthly(15), [...visits].reverse());
  assert.deepEqual(out.cancel.map((v) => v.scheduledDate), ['2026-10-22', '2026-11-23', '2026-12-21']);
});

test('§7.1 ย้ายช่องได้ช่องละนัดเดียว — ช่องใหม่ที่มีนัดของรอบถืออยู่แล้ว (ทุกสถานะ) ไม่ว่าง', () => {
  const [v1, v2, v3] = made(ensureVisits(days(30), [], opts()));
  // มีนัดที่คนยกเลิกเองถือช่อง 22 พ.ย. ของรอบใหม่อยู่แล้ว ⇒ V2 ไม่มีช่องว่างให้ย้าย → ยกเลิก
  const holder = { id: 'H1', planId: 'P1', planSlotDate: '2026-11-22', scheduledDate: '2026-11-23', status: 'cancelled' };
  assert.deepEqual(shape(diffOf(days(30), monthly(22), [v1, v2, v3, holder])), { ...EMPTY, cancel: [v2.id, v3.id] });
});

test('🔴 §7.1 "ย้ายวันเอง" เทียบกับวันที่ **รอบเดิม** นัดให้ — ไม่ใช่กติกาเลื่อนของรอบใหม่', () => {
  // สิ้นเดือน: 31 ต.ค. (เสาร์) ถอยมาศุกร์ 30 · 31 ธ.ค. (หยุด) ถอยมา 30 — รอบใหม่ทุก 30 วันเลื่อน **ไปข้างหน้า** (2 พ.ย. / 1 ม.ค.)
  const visits = made(ensureVisits(monthly(31), [], opts()));
  assert.deepEqual(slotAt(visits), ['2026-10-31@2026-10-30', '2026-11-30@2026-11-30', '2026-12-31@2026-12-30']);
  const diff = diffOf(monthly(31), days(30), visits);
  assert.deepEqual(shape(diff), { ...EMPTY, cancel: ids(visits) },
    'นัดที่ระบบวางไว้เองตามรอบเดิมต้องถูกนับว่า "ไม่มีใครย้าย" — เทียบกับรอบใหม่จะกลายเป็น "ย้ายเอง" แล้วค้างซ้อนกับนัดใหม่');
});

test('§7.1 ช่องว่างของรอบใหม่รับได้นัดเดียว — นัดตามรอบเดิมสองใบที่ลงวันเดียวกัน ใบแรกย้ายช่อง ใบที่สองยกเลิก', () => {
  // รอบเดิมทุก 1 วันจากเสาร์ 21 พ.ย.: ช่องเสาร์ 21 กับจันทร์ 23 ถูกนัดวันจันทร์ 23 ทั้งคู่ (ไม่มีนัดของช่องอาทิตย์ 22)
  const daily = days(1, { startDate: '2026-11-21' });
  const a = { id: 'A', planId: 'P1', planSlotDate: '2026-11-21', scheduledDate: '2026-11-23', status: 'draft' };
  const d = { id: 'D', planId: 'P1', planSlotDate: '2026-11-23', scheduledDate: '2026-11-23', status: 'draft' };
  const diff = diffOf(daily, monthly(22), [d, a]);
  assert.deepEqual(shape(diff), { ...EMPTY, reslot: ['A→2026-11-22'], cancel: ['D'] });
});

/** สิ่งที่เส้น PATCH เขียน: ยกเลิก = ถอดออกจากรอบด้วย (D26) · ย้ายช่อง/ถือช่อง = เปลี่ยนแค่ planSlotDate · ล้างช่อง = planSlotDate ว่าง */
function applyDiff(visits, diff) {
  return visits.map((v) => {
    const moved = [...diff.reslot, ...diff.hold].find((r) => r.visit.id === v.id);
    if (moved) return { ...v, planSlotDate: moved.slot };
    if (diff.release.some((r) => r.id === v.id)) return { ...v, planSlotDate: null };
    return diff.cancel.some((c) => c.id === v.id) ? { ...v, status: 'cancelled', planId: null, planSlotDate: null } : v;
  });
}
const openOf = (visits, plan) => visits.filter((v) => v.planId === plan.id && v.status !== 'cancelled');

test('🔴 R5-h เปลี่ยนรอบแล้วเปลี่ยนกลับ รอบยังมีนัดครบ — นัดที่ถูกยกเลิกเพราะเปลี่ยนรอบถูกถอดออกจากรอบ จึงไม่ถือช่อง', () => {
  const A = monthly(22);
  const B = monthly(15);
  const D30 = days(30);
  const step = (before, after, visits) => {
    const diff = diffOf(before, after, visits);
    const written = applyDiff(visits, diff);
    return { visits: [...written, ...made(ensureVisits(after, written, opts()))], diff };
  };
  let visits = made(ensureVisits(A, [], opts()));
  assert.deepEqual(slotAt(openOf(visits, A)), ['2026-10-22@2026-10-22', '2026-11-22@2026-11-23', '2026-12-22@2026-12-22']);

  let out = step(A, B, visits);                       // วันที่ 22 → วันที่ 15
  assert.deepEqual([out.diff.cancel.length, out.diff.reslot.length], [3, 0]);
  // รอบยังไม่เริ่ม (เริ่ม 22 ต.ค.) ⇒ ระยะเติมนัดนับจากวันเริ่มรอบ: ถึง 20 ม.ค. — ช่อง 15 ม.ค. อยู่ในระยะ ช่อง 22 ม.ค. ไม่อยู่
  assert.deepEqual(slotAt(openOf(out.visits, B)), ['2026-11-15@2026-11-16', '2026-12-15@2026-12-15', '2027-01-15@2027-01-15']);

  out = step(B, A, out.visits);                       // วันที่ 15 → วันที่ 22 (ย้อนกลับ)
  assert.deepEqual([out.diff.cancel.length, out.diff.reslot.length], [3, 0]);
  assert.deepEqual(slotAt(openOf(out.visits, A)), ['2026-10-22@2026-10-22', '2026-11-22@2026-11-23', '2026-12-22@2026-12-22'],
    'ต้องได้นัดครบสามเดือน — ของเดิม (ยกเลิกแต่ยังถือช่อง) ได้ 0 นัด และรอบไม่มีนัดเปิดอีกเลย');

  out = step(A, D30, out.visits);                     // วันที่ 22 → ทุก 30 วัน
  assert.deepEqual([out.diff.cancel.length, out.diff.reslot.length], [1, 1]);
  assert.deepEqual(slotAt(openOf(out.visits, D30)), ['2026-10-22@2026-10-22', '2026-11-21@2026-11-23', '2026-12-21@2026-12-21']);

  out = step(D30, A, out.visits);                     // ทุก 30 วัน → วันที่ 22
  assert.deepEqual([out.diff.cancel.length, out.diff.reslot.length], [1, 1]);
  assert.deepEqual(slotAt(openOf(out.visits, A)), ['2026-10-22@2026-10-22', '2026-11-22@2026-11-23', '2026-12-22@2026-12-22']);

  const again = step(A, A, out.visits);               // บันทึกซ้ำ
  assert.deepEqual(shape(again.diff), EMPTY);
  assert.equal(again.visits.length, out.visits.length, 'บันทึกซ้ำไม่สร้างนัด');

  // เทียบ: นัดที่ **คน** ยกเลิก ยังอยู่ในรอบ ⇒ ยังถือช่อง ไม่ถูกสร้างกลับ
  const firstOpen = openOf(out.visits, A)[0];
  const byPerson = out.visits.map((v) => (v.id === firstOpen.id ? { ...v, status: 'cancelled' } : v));
  assert.deepEqual(ensureVisits(A, byPerson, opts()), []);
});

// ── หนึ่งงวดหนึ่งนัดตอนเปลี่ยนรอบกลางงวด (คำตอบเจ้าของข้อ 2 · รีวิว 01/10) ─────────────────────────────
/** เขียนตามลำดับของเส้น PATCH แล้วเติมนัด ณ วันนั้น → นัดทั้งหมดหลังบันทึก */
function saveAt(today, before, after, visits) {
  const diff = planScheduleDiff({ before, after, visits, todayIso: today, holidays: H2026 });
  const written = applyDiff(visits, diff);
  const added = made(ensureVisits(after, written, { from: today, holidays: H2026 }));
  return { diff, visits: [...written, ...added], added };
}
/** นัดของรอบที่ยังนับเป็นนัดของงวด (ไม่รวมใบที่ถูกยกเลิกเพราะเปลี่ยนรอบ) เรียงตามวันนัด */
const datesOf = (visits, plan) => visits.filter((v) => v.planId === plan.id).map((v) => v.scheduledDate).sort();
const OCT = { startDate: '2026-10-01', endDate: '2027-09-30' };

test('🔴 เปลี่ยนวันของรอบรายเดือนหลังช่องใหม่ของเดือนนี้ผ่านไปแล้ว: นัดของเดือนนี้อยู่ต่อ — เดือนนี้ไม่หายทั้งรอบ', () => {
  // รอบวันที่ 22 · วันที่ 20 ต.ค. เปลี่ยนเป็นวันที่ 15 — ช่อง 15 ต.ค. เลยไปแล้ว ตัวเติมนัดสร้างให้ไม่ได้
  const before = monthly(22, OCT);
  const after = monthly(15, OCT);
  const [v1, v2, v3] = made(ensureVisits(before, [], opts()));
  assert.deepEqual(slotAt([v1, v2, v3]), ['2026-10-22@2026-10-22', '2026-11-22@2026-11-23', '2026-12-22@2026-12-22']);
  const out = saveAt('2026-10-20', before, after, [v1, v2, v3]);
  assert.deepEqual(full(out.diff), { ...NOTHING, reslot: [`${v1.id}→2026-10-15`], cancel: [v2.id, v3.id] });
  assert.deepEqual(datesOf(out.visits, after), ['2026-10-22', '2026-11-16', '2026-12-15', '2027-01-15'],
    'ต.ค. ยังมีนัด 22 (เดิมถูกยกเลิก แล้วเดือนนี้ไม่มีนัดเลย — สัญญา 12 รอบได้ 11)');
  // บันทึกซ้ำ / แก้หมายเหตุทีหลัง: นัด 22 ต.ค. ถือช่อง 15 ต.ค. ของรอบใหม่แล้ว ไม่ถูกถามอีก
  assert.deepEqual(full(planScheduleDiff({ before: after, after, visits: out.visits, todayIso: '2026-10-21', holidays: H2026 })), NOTHING);
  // วันที่ 14 ต.ค. (ช่อง 15 ยังมาไม่ถึง) = กติกาเดิม: ยกเลิกทั้งสามใบ แล้วสร้าง 15 ต.ค. ให้
  const early = saveAt('2026-10-14', before, after, [v1, v2, v3]);
  assert.deepEqual(full(early.diff), { ...NOTHING, cancel: [v1.id, v2.id, v3.id] });
  assert.deepEqual(datesOf(early.visits, after), ['2026-10-15', '2026-11-16', '2026-12-15']);
});

test('🔴 เปลี่ยนวันของรอบรายเดือนหลังนัดของเดือนนี้ปิดงานแล้ว: ไม่ได้นัดใบที่สองลงเดือนเดียวกัน', () => {
  // รอบวันที่ 15 · นัด 15 ต.ค. เข้าแล้ว · วันที่ 20 ต.ค. เปลี่ยนเป็นวันที่ 22
  const before = monthly(15, OCT);
  const after = monthly(22, OCT);
  const [v1, v2, v3] = made(ensureVisits(before, [], opts()));
  assert.deepEqual(slotAt([v1, v2, v3]), ['2026-10-15@2026-10-15', '2026-11-15@2026-11-16', '2026-12-15@2026-12-15']);
  const done = { ...v1, status: 'done', actualDate: '2026-10-15' };
  const out = saveAt('2026-10-20', before, after, [done, v2, v3]);
  assert.deepEqual(full(out.diff), { ...NOTHING, hold: [`${v1.id}→2026-10-22`], cancel: [v2.id, v3.id] });
  assert.deepEqual(datesOf(out.visits, after), ['2026-10-15', '2026-11-23', '2026-12-22'],
    'ต.ค. มีนัดเดียว (เดิมได้ 22 ต.ค. เพิ่มมาอีกใบ — 13 นัดในสัญญา 12 รอบ)');
  assert.equal(out.visits.find((v) => v.id === v1.id).status, 'done', 'นัดที่ปิดงานแล้วไม่ถูกแตะนอกจากช่องที่ถือ');
  // นัดที่กำลังทำ / เลยวันนัด / คนยกเลิกเอง ก็เป็นนัดของงวดนั้นเหมือนกัน
  for (const status of ['in_progress', 'partial', 'unable', 'cancelled', 'rescheduled']) {
    const again = saveAt('2026-10-20', before, after, [{ ...v1, status }, v2, v3]);
    assert.deepEqual(again.diff.hold.map((r) => `${r.visit.id}→${r.slot}`), [`${v1.id}→2026-10-22`], status);
    assert.equal(again.added.some((row) => row.planSlotDate === '2026-10-22'), false, `${status}: ไม่สร้าง 22 ต.ค. ซ้อน`);
  }
  const overdue = saveAt('2026-10-20', before, after, [v1, v2, v3]);            // นัด 15 ต.ค. ยังเปิดอยู่ = งานค้าง
  assert.deepEqual(full(overdue.diff), { ...NOTHING, keptPast: [v1.id], hold: [`${v1.id}→2026-10-22`], cancel: [v2.id, v3.id] });
  assert.equal(overdue.added.some((row) => row.planSlotDate === '2026-10-22'), false);
});

test('🔴 รายสัปดาห์: ศุกร์ → อังคาร ตอนวันพุธ = นัดวันศุกร์ของสัปดาห์นี้อยู่ต่อ · อังคาร → ศุกร์ หลังนัดวันอังคารปิดแล้ว = ไม่มีนัดวันศุกร์ซ้อน', () => {
  const W = { startDate: '2026-10-01', endDate: '2027-09-30' };
  const friday = weekly(5, W);
  const tuesday = weekly(2, W);
  const TODAY_WED = '2026-10-07';
  const inWeek = (visits, plan) => datesOf(visits, plan).filter((d) => d >= '2026-10-04' && d <= '2026-10-10');

  // ศุกร์ → อังคาร: ช่องวันอังคาร 6 ต.ค. เลยไปแล้ว
  const fridays = made(ensureVisits(friday, [], opts({ horizonDays: 30 })));
  assert.deepEqual(fridays.map((v) => v.scheduledDate), ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-22', '2026-10-30']);
  const open = fridays.map((v, i) => (i === 0 ? { ...v, status: 'done' } : v));
  const toTue = saveAt(TODAY_WED, friday, tuesday, open);
  assert.deepEqual(full(toTue.diff), {
    ...NOTHING, reslot: [`${fridays[1].id}→2026-10-06`], cancel: [fridays[2].id, fridays[3].id, fridays[4].id],
  });
  assert.deepEqual(inWeek(toTue.visits, tuesday), ['2026-10-09'], 'สัปดาห์นี้ยังมีนัดวันศุกร์ (เดิมถูกยกเลิก แล้วสัปดาห์นี้ไม่มีนัด)');
  // อังคาร 13 ต.ค. เป็นวันหยุด → พุธ 14 (สัปดาห์เดียวกัน)
  assert.deepEqual(datesOf(toTue.visits, tuesday).slice(0, 4), ['2026-10-02', '2026-10-09', '2026-10-14', '2026-10-20']);

  // อังคาร → ศุกร์: นัดวันอังคาร 6 ต.ค. เข้าแล้ว
  const tuesdays = made(ensureVisits(tuesday, [], opts({ horizonDays: 30 })));
  assert.deepEqual(tuesdays.map((v) => v.scheduledDate), ['2026-10-06', '2026-10-14', '2026-10-20', '2026-10-27']);
  const closed = tuesdays.map((v, i) => (i === 0 ? { ...v, status: 'done' } : v));
  const toFri = saveAt(TODAY_WED, tuesday, friday, closed);
  assert.deepEqual(full(toFri.diff), {
    ...NOTHING, hold: [`${tuesdays[0].id}→2026-10-09`], cancel: [tuesdays[1].id, tuesdays[2].id, tuesdays[3].id],
  });
  assert.deepEqual(inWeek(toFri.visits, friday), ['2026-10-06'], 'สัปดาห์นี้มีนัดเดียว (เดิมได้ศุกร์ 9 ต.ค. เพิ่มมาอีกใบ)');
  assert.deepEqual(datesOf(toFri.visits, friday).slice(0, 3), ['2026-10-06', '2026-10-16', '2026-10-22']);
});

test('🔴 ทุกคู่วัน × ทุกวันของเดือน: เปลี่ยนวันของรอบกลางงวดแล้ว งวดนี้กับงวดถัดไปมีนัดหนึ่งใบพอดี — ไม่หาย ไม่ซ้อน', () => {
  // รอบเดินมาตั้งแต่ ก.ค. · นัดที่เลยวันนี้ไปแล้วปิดงานครบ · ที่เหลือระบบวางไว้เองไม่มีใครย้าย → เปลี่ยนวันของรอบ ณ วันนั้น แล้วยืนยันทุกใบ
  const long = { startDate: '2026-07-01', endDate: '2027-06-30' };
  const eachDay = (from, to) => {
    const out = [];
    for (let day = from; day <= to; day = addDays(day, 1)) out.push(day);
    return out;
  };
  let checked = 0;
  const run = (before, after, today, periods) => {
    const all = made(ensureVisits(before, [], { from: long.startDate, horizonDays: 260, holidays: H2026 }))
      .map((v) => (v.scheduledDate < today ? { ...v, status: 'done' } : v));
    const out = saveAt(today, before, after, all);
    assert.deepEqual(ensureVisits(after, out.visits, { from: today, holidays: H2026 }), [], 'เติมนัดซ้ำไม่ได้นัดเพิ่ม');
    assert.deepEqual(full(planScheduleDiff({ before: after, after, visits: out.visits, todayIso: today, holidays: H2026 })), NOTHING, 'บันทึกซ้ำนิ่ง');
    for (const [from, to] of periods) {
      const inside = out.visits.filter((v) => v.planId === after.id && v.scheduledDate >= from && v.scheduledDate <= to);
      assert.equal(inside.length, 1,
        `${cadenceText(before)} → ${cadenceText(after)} วันนี้ ${today}: งวด ${from}–${to} มี ${inside.length} นัด (${inside.map((v) => v.scheduledDate).join(', ')})`);
      checked += 1;
    }
  };
  // รายเดือน: วันนี้ไล่ทั้งเดือน ต.ค. · ตรวจเดือน ต.ค. กับ พ.ย.
  const monthDays = [1, 10, 15, 22, 28, 31];
  for (const from of monthDays) {
    for (const to of monthDays) {
      if (from === to) continue;
      for (const today of eachDay('2026-10-01', '2026-10-31')) {
        run(monthly(from, long), monthly(to, long), today, [['2026-10-01', '2026-10-31'], ['2026-11-01', '2026-11-30']]);
      }
    }
  }
  // ช่วงวัน: วันเดียว → ช่วง 10–14 และกลับ
  for (const today of eachDay('2026-10-01', '2026-10-31')) {
    run(monthly(22, long), monthly(10, { ...long, cadenceMonthDayTo: 14 }), today, [['2026-10-01', '2026-10-31'], ['2026-11-01', '2026-11-30']]);
    run(monthly(10, { ...long, cadenceMonthDayTo: 14 }), monthly(22, long), today, [['2026-10-01', '2026-10-31'], ['2026-11-01', '2026-11-30']]);
  }
  // รายสัปดาห์: วันนี้ไล่สองสัปดาห์ (อา. 4 – ส. 17 ต.ค. · มีวันหยุดอังคาร 13) · ตรวจสัปดาห์ของวันนี้กับสัปดาห์ถัดไป
  for (const from of [1, 2, 3, 4, 5]) {
    for (const to of [1, 2, 3, 4, 5]) {
      if (from === to) continue;
      for (const today of eachDay('2026-10-04', '2026-10-17')) {
        const week = today <= '2026-10-10' ? ['2026-10-04', '2026-10-10'] : ['2026-10-11', '2026-10-17'];
        const next = today <= '2026-10-10' ? ['2026-10-11', '2026-10-17'] : ['2026-10-18', '2026-10-24'];
        run(weekly(from, long), weekly(to, long), today, [week, next]);
      }
    }
  }
  assert.equal(checked, (30 * 31 + 2 * 31 + 20 * 14) * 2);
});

test('รายสัปดาห์ → รายเดือน กลางเดือน: เดือนนี้เข้าไปแล้ว นัดที่เหลือของเดือนถูกยกเลิก ไม่ถูกเก็บไว้เป็น "นัดของเดือนนี้" ซ้ำ', () => {
  const W = { startDate: '2026-10-01', endDate: '2027-09-30' };
  const fridays = made(ensureVisits(weekly(5, W), [], opts({ horizonDays: 40 })));
  const visits = fridays.map((v, i) => (i < 3 ? { ...v, status: 'done' } : v));     // 2 · 9 · 16 ต.ค. เข้าแล้ว
  const out = saveAt('2026-10-20', weekly(5, W), monthly(15, W), visits);
  assert.deepEqual(out.diff.hold.map((r) => `${r.visit.id}→${r.slot}`), [`${fridays[0].id}→2026-10-15`], 'นัดแรกของเดือนถือช่องของเดือน');
  assert.deepEqual(ids(out.diff.cancel), fridays.slice(3).map((v) => v.id), 'นัดวันศุกร์ที่ยังไม่ได้เข้าทุกใบ');
  assert.deepEqual(out.diff.reslot, []);
  assert.deepEqual(out.added.map((row) => row.scheduledDate), ['2026-11-16', '2026-12-15', '2027-01-15']);
});

test('งวดที่จบไปแล้วทั้งงวดไม่ถูกเขียนย้อน — นัดในประวัติคงช่องเดิม · รอบที่ไม่มีงวด (ทุก N วัน) ถือช่องได้ทางเดียวคือวันนัดตรงกัน', () => {
  const long = { startDate: '2026-07-01', endDate: '2027-06-30' };
  const history = made(ensureVisits(monthly(22, long), [], { from: '2026-07-01', horizonDays: 180, holidays: H2026 }));
  assert.deepEqual(history.map((v) => v.scheduledDate), ['2026-07-22', '2026-08-24', '2026-09-22', '2026-10-22', '2026-11-23', '2026-12-22']);
  const visits = history.map((v, i) => (i < 3 ? { ...v, status: 'done' } : v));
  const out = saveAt(TODAY, monthly(22, long), monthly(15, long), visits);
  assert.deepEqual(full(out.diff), { ...NOTHING, cancel: history.slice(3).map((v) => v.id) }, 'ก.ค.–ก.ย. ไม่ถูกแตะ');
  assert.deepEqual(out.added.map((row) => row.scheduledDate), ['2026-10-15', '2026-11-16', '2026-12-15']);
  // → ทุก 30 วัน: ไม่มีงวด ⇒ นัดที่คนย้ายวันซึ่งไม่ตรงวันของรอบใหม่ถูกล้างช่อง (ยังเป็นนัดของรอบ)
  const [a, b, c] = made(ensureVisits(monthly(22), [], opts()));
  const moved = { ...b, scheduledDate: '2026-11-27' };
  const toDays = planScheduleDiff({ before: monthly(22), after: days(30), visits: [a, moved, c], todayIso: TODAY, holidays: H2026 });
  assert.deepEqual(full(toDays), { ...NOTHING, keptMoved: [b.id], release: [b.id], cancel: [c.id] });
});

test('🔴 server-1 นัดที่คนย้ายมาลงวันที่รอบใหม่นัดพอดี = อยู่ต่อเป็นนัดของช่องนั้น — ไม่ถูกนับว่า "ย้ายเอง" แล้วได้นัดซ้อนวันเดียวกัน', () => {
  // ทุก 30 วันจาก 22 ต.ค.: V2 ช่อง 21 พ.ย. (นัด 23 พ.ย.) · V3 ช่อง 21 ธ.ค. คนจัดคิวย้ายไป 22 ธ.ค. · แล้วเปลี่ยนเป็นทุกเดือน วันที่ 22
  const [v1, v2, v3] = made(ensureVisits(days(30), [], opts()));
  const moved = { ...v3, scheduledDate: '2026-12-22' };
  const out = saveAt('2026-10-23', days(30), monthly(22), [v1, v2, moved]);
  assert.deepEqual(full(out.diff), { ...NOTHING, reslot: [`${v2.id}→2026-11-22`, `${v3.id}→2026-12-22`] });
  assert.deepEqual(out.added, [], 'ไม่มีนัดใหม่ — ธ.ค. มีนัด 22 ธ.ค. ใบเดียว (เดิมได้ใบที่สองลงวันเดียวกัน)');
  assert.deepEqual(datesOf(out.visits, monthly(22)), ['2026-10-22', '2026-11-23', '2026-12-22']);
});

test('🔴 server-2 นัดที่ถูกเก็บไว้ตอนเปลี่ยนรอบ ไม่ถือช่องของรอบเดิมค้าง — บันทึกครั้งถัดไป (แก้แค่หมายเหตุ) ไม่ถูกเสนอยกเลิก', () => {
  // ทุก 7 วันจากเสาร์ 24 ต.ค.: ช่องเสาร์ 31 ต.ค. นัดจันทร์ 2 พ.ย. คนจัดคิวย้ายมาศุกร์ 30 ต.ค. · แล้วเปลี่ยนเป็นทุกสัปดาห์ วันอังคาร
  const start = { startDate: '2026-10-24', endDate: '2027-10-23' };
  const sevens = made(ensureVisits(days(7, start), [], { from: '2026-10-20', horizonDays: 25, holidays: H2026 }));
  assert.deepEqual(slotAt(sevens), ['2026-10-24@2026-10-26', '2026-10-31@2026-11-02', '2026-11-07@2026-11-09']);
  const visits = sevens.map((v, i) => (i === 1 ? { ...v, scheduledDate: '2026-10-30' } : v));
  const tuesday = weekly(2, start);
  const first = saveAt('2026-10-25', days(7, start), tuesday, visits);
  assert.deepEqual(full(first.diff), {
    ...NOTHING, keptMoved: [sevens[1].id], hold: [`${sevens[1].id}→2026-10-27`], cancel: [sevens[0].id, sevens[2].id],
  });
  assert.equal(first.added.some((row) => row.planSlotDate === '2026-10-27'), false, 'สัปดาห์ 25–31 ต.ค. มีนัดที่คนย้ายไว้แล้ว ไม่สร้างวันอังคารซ้อน');
  // ครั้งถัดไป: ตารางไม่เปลี่ยน (แก้หมายเหตุ/เจ้าหน้าที่) — ไม่มีอะไรให้ถาม
  const later = planScheduleDiff({ before: tuesday, after: { ...tuesday, note: 'x', assigneeId: 'U9' }, visits: first.visits, todayIso: '2026-10-26', holidays: H2026 });
  assert.deepEqual(full(later), NOTHING);

  // ไม่มีช่องใหม่ในงวดที่นัดอยู่ ⇒ ช่องเดิมถูกล้าง (ไม่ค้างให้ถูกตัดสินใหม่กับรอบที่ไม่ได้สร้างมัน)
  const thirty = { startDate: '2026-10-01', endDate: '2027-09-30' };
  const made30 = made(ensureVisits(days(30, thirty), [], { from: '2026-10-02', horizonDays: 60, holidays: H2026 }));
  assert.deepEqual(slotAt(made30), ['2026-10-31@2026-11-02', '2026-11-30@2026-11-30']);
  const hand = made30.map((v, i) => (i === 0 ? { ...v, scheduledDate: '2026-10-30' } : v));       // จันทร์ 2 พ.ย. → ศุกร์ 30 ต.ค.
  const wed = weekly(3, { ...thirty, cadenceEvery: 2 });                                           // ทุก 2 สัปดาห์ วันพุธ: 7 · 21 ต.ค. · 4 พ.ย. …
  const change = saveAt('2026-10-05', days(30, thirty), wed, hand);
  assert.deepEqual(full(change.diff), { ...NOTHING, keptMoved: [made30[0].id], release: [made30[0].id], cancel: [made30[1].id] });
  const kept = change.visits.find((v) => v.id === made30[0].id);
  assert.deepEqual([kept.planId, kept.planSlotDate, kept.scheduledDate, kept.status], ['P1', null, '2026-10-30', 'draft']);
  const again = planScheduleDiff({ before: wed, after: { ...wed, assigneeId: 'U9' }, visits: change.visits, todayIso: '2026-10-06', holidays: H2026 });
  assert.deepEqual(full(again), NOTHING, 'เดิม: 409 เสนอยกเลิกนัดที่คนย้ายด้วยมือ ทั้งที่แก้แค่เจ้าหน้าที่');
});

test('🔴 server-3 นัดของรอบที่ไม่มีช่อง (คนตั้งเอง · แถบ "ตั้งนัดรอบถัดไป" ของรอบทุก N วัน) ถูกนับให้จอบอก — ไม่ยกเลิก ไม่ย้าย', () => {
  const banner = { id: 'B1', planId: 'P1', siteId: 'S1', kind: 'refill', status: 'scheduled', scheduledDate: '2026-12-23' };
  const out = saveAt(TODAY, days(30), monthly(22), [banner]);
  assert.deepEqual(full(out.diff), { ...NOTHING, keptManual: ['B1'] });
  assert.equal(cancelConfirmation(out.diff, undefined).ok, true, 'ไม่มีอะไรให้ยืนยัน — บอกใน toast');
  // นับเฉพาะตอนตารางของรอบเปลี่ยนจริง (ความถี่ · วันเริ่ม · วันสิ้นสุด) — แก้เจ้าหน้าที่/หมายเหตุไม่พูดซ้ำทุกครั้ง
  const quiet = (after) => full(planScheduleDiff({ before: days(30), after, visits: [banner], todayIso: TODAY, holidays: H2026 }));
  assert.deepEqual(quiet(days(30, { assigneeId: 'U9', note: 'x', salesOrderId: 'SO9' })), NOTHING);
  assert.deepEqual(quiet(days(30, { endDate: '2027-01-31' })).keptManual, ['B1']);
  assert.deepEqual(quiet(days(30, { startDate: '2026-10-25' })).keptManual, ['B1']);
  assert.deepEqual(quiet(days(14)).keptManual, ['B1']);
  // ไม่นับ: ปิดงานแล้ว · ยกเลิกแล้ว · เลยวันนัด · ของรอบอื่น · งานนอกรอบ
  const not = (over) => full(planScheduleDiff({ before: days(30), after: monthly(22), visits: [{ ...banner, ...over }], todayIso: TODAY, holidays: H2026 })).keptManual;
  assert.deepEqual([not({ status: 'done' }), not({ status: 'cancelled' }), not({ scheduledDate: '2026-09-30' }), not({ planId: 'P2' }), not({ planId: null })],
    [[], [], [], [], []]);
  assert.deepEqual(not({ status: 'draft' }), ['B1']);
  assert.deepEqual(not({ status: 'in_progress' }), ['B1']);
});

test('🔴 server-4 วันที่ไม่มีจริงในปฏิทินตกที่ตัวตรวจ — ไม่ไปถึงขั้นยกเลิกนัดแล้วฐานตีรอบกลับ', () => {
  assert.equal(normalizePlanInput(body({ everyDays: 30, endDate: '2027-02-31' })).error, 'วันสิ้นสุดรอบไม่ถูกต้อง');
  assert.equal(normalizePlanInput(body({ everyDays: 30, startDate: '2026-02-30' })).error, 'วันเริ่มรอบไม่ถูกต้อง');
  assert.equal(normalizePlanInput(body({ everyDays: 30, startDate: '2026-13-01' })).error, 'วันเริ่มรอบไม่ถูกต้อง');
  assert.equal(normalizePlanInput(body({ everyDays: 30, startDate: '2028-02-29', endDate: '2029-02-28' })).error, null, 'ปีอธิกสุรทิน');
  assert.equal(normalizePlanInput(body({ everyDays: 30, endDate: '2027-02-29' })).error, 'วันสิ้นสุดรอบไม่ถูกต้อง');
  // ยามชั้นสอง: รอบใหม่ที่วันอ่านไม่ออก ไม่มีนัดใบไหนถูกเสนอยกเลิก (เดิมไม่มีช่องไหน "ยังเป็นของรอบ" ⇒ ทุกใบเข้ารายการยกเลิก)
  const visits = made(ensureVisits(monthly(22), [], opts()));
  for (const bad of [{ endDate: '2027-02-31' }, { startDate: '2026-02-30' }, { startDate: null }, { endDate: 'x' }]) {
    assert.deepEqual(full(diffOf(monthly(22), monthly(22, bad), visits)), NOTHING, JSON.stringify(bad));
  }
  assert.deepEqual(full(diffOf(monthly(22), monthly(22), visits, { todayIso: 'x' })), NOTHING);
});

test('🔴 รอบตามปฏิทินที่ยังไม่เริ่ม ได้นัดแรกตั้งแต่วันที่ตั้งรอบ (ระยะเติมนัดนับจากวันเริ่มรอบ) · ทุก N วันนับจากวันนี้เท่าเดิม', () => {
  const future = { startDate: '2027-01-15', endDate: '2028-01-14' };
  // วันนี้ 1 ต.ค. 2026 — วันเริ่มรอบอยู่ไกลกว่า 90 วัน
  assert.deepEqual(slotAt(ensureVisits(monthly(15, future), [], opts())),
    ['2027-01-15@2027-01-15', '2027-02-15@2027-02-15', '2027-03-15@2027-03-15', '2027-04-15@2027-04-15']);
  assert.deepEqual(slotAt(ensureVisits(monthly(15, { ...future, cadenceEvery: 12 }), [], opts())), ['2027-01-15@2027-01-15']);
  assert.equal(ensureVisits(weekly(3, future), [], opts())[0].scheduledDate, '2027-01-20');
  assert.deepEqual(ensureVisits(days(30, future), [], opts()), [], 'ทุก N วัน: พฤติกรรมเดิม (นับ 90 วันจากวันนี้)');
  // ⇒ รอบที่เพิ่งตั้งไม่ไปขึ้น "ครบรอบยังไม่มีนัด" ทั้งที่ยังไม่ถึงกำหนด
  const plan = monthly(15, future);
  const rows = visitQueue({
    plans: [plan], visits: made(ensureVisits(plan, [], opts()), 'scheduled'), sites: [{ id: 'S1', name: 'ไซต์ A' }], isLive: isLiveVisit, todayIso: TODAY,
  });
  assert.deepEqual(rows, []);
  // รอบที่เริ่มไปแล้ว: ช่วงเท่าเดิม (วันนี้ + ระยะของรอบ)
  assert.deepEqual(ensureVisits(monthly(22, { startDate: '2026-09-01' }), [], opts()).map((row) => row.scheduledDate),
    ['2026-10-22', '2026-11-23', '2026-12-22']);
});

test('กดบันทึกซ้ำหลังบันทึกรอบไปแล้วแต่จัดช่องไม่ครบ: นัดที่ช่องไม่ได้มาจากรอบที่บันทึกไว้ ไม่ถูกเสนอยกเลิก — ได้ช่องตามกติกาเดิม', () => {
  // รอบถูกบันทึกเป็น "ทุกเดือน วันที่ 22" แล้ว แต่นัดยังถือช่องของ "ทุก 30 วัน" (ย้ายช่องล้มกลางทาง)
  const saved = monthly(22);
  const [, v2, v3] = made(ensureVisits(days(30), [], opts()));
  const hand = { ...v3, scheduledDate: '2026-12-18' };
  const retry = planScheduleDiff({ before: saved, after: saved, visits: [v2, hand], todayIso: TODAY, holidays: H2026 });
  assert.deepEqual(full(retry), { ...NOTHING, reslot: [`${v2.id}→2026-11-22`], hold: [`${v3.id}→2026-12-22`] });
  // นัดที่วันนัดบังเอิญตรงกับวันที่รอบใหม่จะนัดให้ "ช่องเดิม" ก็ไม่ถูกเสนอยกเลิก (ไม่รู้ที่มา = เก็บไว้)
  const same = planScheduleDiff({ before: saved, after: saved, visits: [v3], todayIso: TODAY, holidays: H2026 });
  assert.deepEqual(full(same), { ...NOTHING, hold: [`${v3.id}→2026-12-22`] });
  assert.equal(cancelConfirmation(same, undefined).ok, true);
});

// ── แถว "ครบรอบยังไม่มีนัด" ─────────────────────────────────────────────────────────────────
test('visitQueue: แถวพกคำบอกความถี่ของรอบทุกชนิด (`cadenceText`) — จอไม่ต้องประกอบ "ทุก N วัน" จาก everyDays เอง', () => {
  const sites = [{ id: 'S1', name: 'ไซต์ A' }];
  const rows = visitQueue({
    plans: [monthly(22), { ...weekly(5, { cadenceEvery: 2 }), id: 'P2' }, { ...days(30), id: 'P3' },
      { id: 'P4', siteId: 'S1', kind: 'refill', isActive: true, everyDays: 14, startDate: '2026-10-22', endDate: null }],
    visits: [], sites, isLive: isLiveVisit, todayIso: TODAY,
  });
  assert.deepEqual(rows.map((row) => [row.planId, row.cadenceText, row.everyDays]), [
    ['P1', 'ทุกเดือน วันที่ 22', null], ['P2', 'ทุก 2 สัปดาห์ วันศุกร์', null], ['P3', 'ทุก 30 วัน', 30], ['P4', 'ทุก 14 วัน', 14],
  ]);
  // รอบตามปฏิทินที่มีนัดข้างหน้าแล้วไม่ขึ้นคิว (ตัวตัดสินเดิม ไม่ได้อ่านความถี่)
  const ahead = made(ensureVisits(monthly(22), [], opts()), 'scheduled');
  assert.deepEqual(visitQueue({ plans: [monthly(22)], visits: ahead, sites, isLive: isLiveVisit, todayIso: TODAY }), []);
});

// ── cancelConfirmation (D13) ───────────────────────────────────────────────────────────────
test('cancelConfirmation: ต้องยืนยันครบทุกใบที่จะถูกยกเลิก — ยืนยันมาเกินได้ · ไม่ครบ = stale · ไม่ส่งเลย = ยังไม่ถาม', () => {
  const visits = made(ensureVisits(monthly(22), [], opts()));
  const diff = diffOf(monthly(22), monthly(15), visits);
  const want = ids(diff.cancel);
  assert.equal(want.length, 3);
  assert.deepEqual(cancelConfirmation(diff, undefined), { ok: false, stale: false });
  assert.deepEqual(cancelConfirmation(diff, []), { ok: false, stale: false });
  assert.deepEqual(cancelConfirmation(diff, 'V1'), { ok: false, stale: false }, 'ไม่ใช่ array = ไม่ได้ยืนยัน');
  assert.deepEqual(cancelConfirmation(diff, want), { ok: true, stale: false });
  assert.deepEqual(cancelConfirmation(diff, [...want, 'V-GONE']), { ok: true, stale: false }, 'ยืนยันมาเกิน');
  assert.deepEqual(cancelConfirmation(diff, want.slice(0, 2)), { ok: false, stale: true }, 'ขาดหนึ่งใบ');
  assert.deepEqual(cancelConfirmation(diff, ['V-OTHER']), { ok: false, stale: true });
  // ไม่มีอะไรต้องยกเลิก = ผ่านเสมอ ไม่ว่าส่งอะไรมา
  const none = diffOf(monthly(22), monthly(22), visits);
  assert.deepEqual(cancelConfirmation(none, undefined), { ok: true, stale: false });
  assert.deepEqual(cancelConfirmation(none, ['V-X']), { ok: true, stale: false });
  assert.deepEqual(cancelConfirmation(planScheduleDiff(), null), { ok: true, stale: false });
});

// ── เลขเดียวกันสองฝั่ง: ชิปจำนวนรอบของฝ่ายขาย ↔ ข้อเสนอความถี่ของ TS (F5) ───────────────────────
test('F5 ชิป "ทุกเดือน ≈ n" ของฝ่ายขาย = จำนวนช่องของรอบรายเดือนวันเริ่มช่วง (ช่วงเต็มเดือน เริ่มวันที่ 1–28)', () => {
  for (const month of ['2026-01', '2026-02', '2026-10', '2027-02', '2028-02']) {
    for (const day of [1, 9, 15, 22, 28]) {
      const from = `${month}-${String(day).padStart(2, '0')}`;
      for (const months of [1, 3, 6, 12, 24]) {
        const to = periodEndFromMonths(from, months);
        const chip = roundChipsFromPeriod({ from, to }).find((c) => c.key === 'monthly');
        assert.equal(chip.rounds, months, `${from} +${months}`);
        const slots = countSlots({ cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: day, startDate: from, endDate: to });
        assert.equal(slots, chip.rounds, `${from} +${months}: ช่องของรอบต้องเท่าจำนวนรอบที่ชิปใส่ให้`);
        // ⇒ ขาย n รอบด้วยชิปนี้ TS ได้ข้อเสนอรายเดือนวันเริ่มช่วง พอดี n นัด (หรือความถี่รายเดือนที่ห่างกว่าเมื่อ n น้อยกว่า)
        const suggestion = suggestCadence({ startDate: from, endDate: to, rounds: chip.rounds });
        assert.deepEqual([suggestion.cadenceKind, suggestion.cadenceEvery, suggestion.cadenceMonthDay, suggestion.visits, suggestion.exact],
          ['monthly', 1, day, months, true], `${from} +${months}`);
      }
    }
  }
});

test('F5 ชิป "ทุก 2 สัปดาห์ ≈ 26" ของสัญญา 12 เดือน = ข้อเสนอ "ทุก 2 สัปดาห์" ที่ได้ 26 นัดพอดี — ตัวเลขของชิปไม่ถูกแก้', () => {
  // เลขของชิป (pin เดิมของ serviceSetup.test.mjs) ต้องอยู่อย่างเดิม: ช่องของรอบที่ยึดวันเริ่มได้ 27 ⇒ ห้ามเอาตัวนับช่องไปแทนเลขชิป
  assert.deepEqual(roundChipsFromPeriod({ from: '2026-10-01', to: '2027-09-30' }).map((c) => [c.key, c.rounds]),
    [['monthly', 12], ['biweekly', 26], ['quarterly', 4]]);
  for (const from of ['2026-10-01', '2026-10-22', '2026-01-05', '2027-03-14', '2028-02-10', '2027-06-26']) {
    const to = periodEndFromMonths(from, 12);
    const chips = roundChipsFromPeriod({ from, to });
    const biweekly = chips.find((c) => c.key === 'biweekly');
    assert.equal(biweekly.rounds, 26, from);
    const suggestion = suggestCadence({ startDate: from, endDate: to, rounds: biweekly.rounds });
    assert.deepEqual([suggestion.cadenceKind, suggestion.cadenceEvery, suggestion.visits, suggestion.exact], ['weekly', 2, 26, true], from);
    assert.ok(suggestion.cadenceWeekday >= 1 && suggestion.cadenceWeekday <= 5, `${from}: จันทร์–ศุกร์เท่านั้น`);
    // ไตรมาส: 4 รอบ = ทุก 3 เดือน
    const quarterly = chips.find((c) => c.key === 'quarterly');
    const q = suggestCadence({ startDate: from, endDate: to, rounds: quarterly.rounds });
    assert.deepEqual([q.cadenceKind, q.cadenceEvery, q.exact], ['monthly', 3, true], from);
  }
  assert.equal(cadenceText(suggestCadence({ ...SO247, rounds: 26 })), 'ทุก 2 สัปดาห์ วันศุกร์');
});

// ── ยามของซอร์ส ─────────────────────────────────────────────────────────────────────────────
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

test('🔴 ผู้อ่านรอบฝั่ง server ไม่ถาม `plan.everyDays` ตรง ๆ และไม่ประกอบ "ทุก N วัน" เอง — ถาม cadence.js', () => {
  const files = [
    './rounds.js', './planGen.js', './intake.js', './intakePlanFacts.js',
    '../../app/api/service/plans/route.js', '../../app/api/service/plans/[id]/route.js',
    '../../app/api/service/visits/route.js', '../../app/api/service/visits/[id]/route.js',
  ];
  for (const file of files) {
    const code = stripComments(read(file));
    assert.doesNotMatch(code, /ทุก \$\{[^}]*everyDays[^}]*\} วัน/, `${file}: คำบอกความถี่ต้องมาจาก cadenceText()`);
    assert.doesNotMatch(code, /!plan\?\.everyDays|Number\(plan\.everyDays\)/, `${file}: รอบตามปฏิทินไม่มี everyDays — ด่านแบบนี้ทำให้ได้นัดศูนย์ใบเงียบ ๆ`);
  }
  // rounds.js ไม่สร้าง Date สำหรับเลขคณิตของรอบอีกแล้ว และไม่เขียนทับชุดวันหยุดกลาง
  const rounds = stripComments(read('./rounds.js'));
  assert.doesNotMatch(rounds, /isBusinessDay|toLocalISODate|setDate\(/);
  for (const file of files) assert.doesNotMatch(stripComments(read(file)), /setHolidays\(/, `${file}: ห้ามเขียนทับชุดวันหยุดกลาง`);
});

test('🔴 เส้นบันทึกรอบอ่านวันหยุดจากตารางด้วยตัวที่โยน error (`loadPlanHolidays`) — ไม่ใช้ `holidaySet` ที่กลืน error', () => {
  const post = stripComments(read('../../app/api/service/plans/route.js'));
  const patch = stripComments(read('../../app/api/service/plans/[id]/route.js'));
  const gen = stripComments(read('./planGen.js'));
  for (const [name, code] of [['plans/route.js', post], ['plans/[id]/route.js', patch], ['planGen.js', gen]]) {
    assert.match(code, /loadPlanHolidays\(supabase\)/, name);
    assert.doesNotMatch(code, /holidaySet\(/, name);
  }
  // POST: อ่านวันหยุดก่อน insert รอบ — อ่านไม่ได้ต้องไม่ทิ้งรอบที่ไม่มีนัดไว้ในฐาน
  assert.ok(post.indexOf('loadPlanHolidays(supabase)') < post.indexOf(".from('service_plans').insert("), 'POST ต้องอ่านวันหยุดก่อนเขียนรอบ');
  // PATCH: ยกเลิกนัด → บันทึกรอบ → ย้ายช่อง → เติมนัด
  const cancelAt = patch.indexOf("status: 'cancelled', planId: null, planSlotDate: null");
  const saveAt = patch.indexOf(".from('service_plans')");
  const reslotAt = patch.indexOf('update({ planSlotDate: slot');
  const genAt = patch.indexOf('generateVisitsForPlan({');
  assert.ok(cancelAt > 0 && saveAt > cancelAt && reslotAt > saveAt && genAt > reslotAt, 'ลำดับเขียนของ PATCH');
  assert.ok(patch.indexOf('loadPlanHolidays(supabase)') < cancelAt, 'PATCH ต้องอ่านวันหยุดก่อนเขียนอะไร');
  assert.match(patch, /ok\(\{[\s\S]*?code: 'plan_schedule_confirm'[\s\S]*?\}, 409\)/, '409 ต้องพกรายการ (ok(payload, 409)) ไม่ใช่ fail()');
  // เส้นปิดงานของนัดใช้ตัวที่ไม่ throw — ปิดงานต้องไม่ล้มเพราะตารางวันหยุด
  assert.match(stripComments(read('../../app/api/service/visits/[id]/route.js')), /nextAfterDone\(plan, data, \{ holidays: await holidaySet\(supabase\) \}\)/);
});
