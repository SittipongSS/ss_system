// ── ตั้งวันงวดทีละหลายงวด (action `schedule-many` · แผงงวดแบบ C "โหมดตั้งวัน" · มติเจ้าของ 28/09) ─────────────────
// สี่เรื่อง:
//   1. ล็อกของโหมดตั้งวัน (installmentDateLock) — ตัวเดียวที่ทั้งจอและ API ถาม
//   2. ตรวจทุกงวดก่อนเขียน: รูปคำขอ 400 · ของเปลี่ยนใต้มือ 409 พร้อมรายชื่องวด · ด่าน/ค่าวัน 400 บอกเลขงวด · งวดที่ค่าตรงแล้วข้าม
//   3. เขียนทีละงวดแบบมีเงื่อนไข updatedAt · หยุดที่งวดแรกที่พัง · พังตั้งแต่งวดแรก = โยน (ยังไม่มีอะไรลงฐาน)
//   4. ยามต้นทาง (อ่าน source): route ต่อสายครบ — สิทธิ์ก่อนโหลด · ตรวจครบก่อนเขียน · audit ก่อนตอบ 409 · ก่อนด่าน installmentId
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCHEDULE_MANY_MAX, SCHEDULE_MANY_ROW_STALE, billingFlagShapeError, installmentDateLock, installmentsAfterWrite,
  scheduleExceptionSummary, scheduleExceptionText, scheduleExceptionsOf, scheduleManyCheck,
  scheduleManyConflictMessage, scheduleManyShapeError, scheduleManyStoppedMessage, writeScheduleMany,
} from './installmentScheduleMany.js';
import { NO_BILLING_WRITE_ERROR, RULE_UNAVAILABLE_ERROR } from './billingRule.js';
import { BILLING_V4_SCHEMA_MISSING } from './billingPolicySchema.js';
import { installmentActionError } from './salesOrderPayments.js';
import { dateLockView } from './installmentDateDrafts.js';
import { updateInstallment } from './salesOrderInstallmentsStore.js';

const T1 = '2026-09-28T01:00:00.000Z';
const rows = () => [
  { id: 'I1', seq: 1, status: 'pending', label: 'งวดที่ 1', billingDate: '2026-10-05', billingEvent: null, dueDate: '2026-11-04', updatedAt: T1 },
  { id: 'I2', seq: 2, status: 'pending', label: 'งวดที่ 2', billingDate: null, billingEvent: null, dueDate: null, updatedAt: T1 },
  { id: 'I3', seq: 3, status: 'rejected', label: 'งวดที่ 3', billingDate: null, billingEvent: 'หลังติดตั้ง', dueDate: null, updatedAt: T1 },
  { id: 'I4', seq: 4, status: 'reported', label: 'งวดที่ 4', billingDate: null, billingEvent: null, dueDate: '2026-12-25', updatedAt: T1 },
];
const sent = (id, fields = {}) => ({ id, updatedAt: T1, ...fields });

// ── 1. ล็อกของโหมดตั้งวัน ─────────────────────────────────────────────────────────────────────────────
test('installmentDateLock: งวดเปิด (pending/rejected) ตั้งได้ · แจ้งชำระ/ชำระแล้ว/คืนเงิน/ยกมา/ขอใบวางบิล/โมฆะ ล็อกพร้อมเหตุ', () => {
  assert.equal(installmentDateLock({ id: 'a', status: 'pending' }), null);
  assert.equal(installmentDateLock({ id: 'a', status: 'rejected' }), null, 'บัญชีตีกลับ = ยังต้องตามเก็บ ตั้งวันได้');
  assert.equal(installmentDateLock({ id: 'a' }), null, 'ไม่มีสถานะ = pending');
  assert.equal(installmentDateLock({ id: 'a', status: 'reported' }), 'แจ้งชำระแล้ว — รอบัญชีตรวจ');
  assert.equal(installmentDateLock({ id: 'a', status: 'confirmed' }), 'รับเงินแล้ว — บัญชีรับรองแล้ว');
  assert.match(installmentDateLock({ id: 'a', status: 'confirmed', refundedAt: '2026-09-20T00:00:00Z' }), /^คืนเงินแล้ว/,
    'คืนเงินแล้วบอกเหตุนั้นก่อน "รับเงินแล้ว"');
  assert.match(installmentDateLock({ id: 'a', status: 'refunded' }), /^คืนเงินแล้ว/, 'สถานะ refunded ล็อกเหมือนมี refundedAt');
  assert.match(installmentDateLock({ id: 'a', status: 'confirmed', kind: 'opening' }), /^งวดยกมา — /);
  assert.match(installmentDateLock({ id: 'a', status: 'pending' }, { requested: true }), /^ขอใบวางบิลแล้ว — บัญชีออกใบตามวันเดิม/);
  assert.match(installmentDateLock({ id: 'a', status: 'pending' }, { requested: true, requestNo: 'RQ-2609-0012' }),
    /^ขอใบวางบิลแล้ว · RQ-2609-0012 — /, 'จอมีเลขคำร้อง ต่อท้ายให้เห็น');
  assert.equal(installmentDateLock({ id: 'a', status: 'reported' }, { requested: true }), 'แจ้งชำระแล้ว — รอบัญชีตรวจ',
    'เงินเดินแล้วบอกก่อนเรื่องคำร้อง');
  // โมฆะตามใบ — ใบยกเลิก/ถูกออก Rev. ทับ: งวดรอชำระไม่ต้องตามเก็บแล้ว
  assert.match(installmentDateLock({ id: 'a', status: 'pending' }, { order: { status: 'cancelled' } }), /^โมฆะ/);
  assert.equal(installmentDateLock({ id: 'a', status: 'pending' }, { order: { status: 'approved' } }), null);
  assert.equal(installmentDateLock(null), 'ไม่พบงวดที่ระบุ');
});

test('ล็อกของจอ (dateLockView) ถามตัวเดียวกับ API — ล็อกงวดชุดเดียวกัน หัวคำเหตุตรงกัน', () => {
  /* จอไม่มีรายการล็อกของตัวเอง — dateLockView (installmentDateDrafts.js) เรียก installmentDateLock ตัวนี้แล้วแค่แยกประโยคเป็น
     { reason, hint } + เพิ่ม requestUnknown/gateError ที่ server ไม่รู้ · เทสต์นี้กันวันที่มีคนเติมเงื่อนไขล็อกซ้ำที่ฝั่งจอแล้วหลุดจากกัน:
     จอปล่อยให้ร่างงวดที่ API ตีกลับ = 409 ทุกครั้งที่กดบันทึก · จอล็อกงวดที่ API ยอม = แม่กุญแจหลอก */
  const cancelled = { status: 'cancelled' };
  const cases = [
    [{ id: 'a', status: 'pending' }, {}],
    [{ id: 'a', status: 'rejected' }, {}],
    [{ id: 'a', status: 'reported' }, {}],
    [{ id: 'a', status: 'confirmed' }, {}],
    [{ id: 'a', status: 'refunded' }, {}],
    [{ id: 'a', status: 'confirmed', refundedAt: '2026-09-20T00:00:00Z' }, {}],
    [{ id: 'a', status: 'confirmed', kind: 'opening' }, {}],
    [{ id: 'a', status: 'pending' }, { requested: true }],
    [{ id: 'a', status: 'reported' }, { requested: true }],
    [{ id: 'a', status: 'pending' }, { order: cancelled }],
    [{ id: 'a', status: 'pending' }, { requested: true, order: cancelled }],
  ];
  const head = (value) => String(value).split(' — ')[0].split(' · ')[0];
  for (const [row, { requested = false, order = null }] of cases) {
    const api = installmentDateLock(row, { requested, order });
    const view = dateLockView(row, { requested, order });
    assert.equal(Boolean(api), Boolean(view), `ล็อกไม่ตรงกัน: ${JSON.stringify({ row, requested, order })}`);
    if (!api) continue;
    assert.equal(head(api), head(view.reason), `หัวคำเหตุไม่ตรงกัน: ${api} ≠ ${view.reason}`);
  }
});

// ── 2. รูปคำขอ ────────────────────────────────────────────────────────────────────────────────────
test('scheduleManyShapeError: อาเรย์ 1..60 · ทุกแถวมี id + updatedAt · id ไม่ซ้ำ · ค่าวันเป็นสตริง/null เท่านั้น', () => {
  assert.equal(scheduleManyShapeError([sent('I1', { dueDate: '2026-11-05' })]), null);
  assert.match(scheduleManyShapeError(undefined), /ไม่ได้ส่งงวดที่จะบันทึกมา/);
  assert.match(scheduleManyShapeError([]), /ไม่ได้ส่งงวดที่จะบันทึกมา/);
  assert.match(scheduleManyShapeError({ I1: {} }), /ไม่ได้ส่งงวดที่จะบันทึกมา/);
  assert.equal(SCHEDULE_MANY_MAX, 60);
  const many = Array.from({ length: 61 }, (_, i) => sent(`X${i}`));
  assert.equal(scheduleManyShapeError(many), 'บันทึกได้ครั้งละไม่เกิน 60 งวด');
  assert.equal(scheduleManyShapeError(many.slice(0, 60)), null);
  assert.equal(scheduleManyShapeError([null]), 'รูปแบบงวดที่ส่งมาไม่ถูกต้อง');
  assert.equal(scheduleManyShapeError([{ updatedAt: T1 }]), 'ไม่ได้ระบุงวดที่ต้องการ');
  assert.equal(scheduleManyShapeError([{ id: 12, updatedAt: T1 }]), 'ไม่ได้ระบุงวดที่ต้องการ');
  assert.match(scheduleManyShapeError([sent('I1'), sent(' I1 ')]), /ถูกส่งมาซ้ำ/);
  assert.match(scheduleManyShapeError([{ id: 'I1' }]), /ไม่ได้ส่งรุ่นของงวด/, 'ไม่มี updatedAt = ตรวจข้อมูลเก่าไม่ได้ ⇒ ไม่รับ');
  assert.match(scheduleManyShapeError([sent('I1', { billingEvent: { name: 'x' } })]), /รูปแบบวันงวด/,
    'ออบเจกต์ต้องไม่กลายเป็นชื่อเหตุการณ์ "[object Object]"');
  assert.match(scheduleManyShapeError([sent('I1', { dueDate: 20261105 })]), /รูปแบบวันงวด/);
});

// ── 3. ตรวจทุกงวดก่อนเขียน ──────────────────────────────────────────────────────────────────────────
test('scheduleManyCheck: patch เฉพาะช่องที่เปลี่ยน · คีย์ที่ไม่ส่ง = คงเดิม · null = ล้าง · เรียงตามเลขงวด · งวดที่ค่าตรงแล้วข้าม', () => {
  const live = rows();
  const built = scheduleManyCheck(live, [
    sent('I3', { billingDate: '2026-12-05', billingEvent: null, dueDate: '2027-01-04' }),
    sent('I2', { billingDate: '2026-11-05', dueDate: '2026-12-05' }),
    sent('I1', { billingDate: '2026-10-05', billingEvent: null, dueDate: '2026-11-04' }),
  ]);
  assert.equal(built.error, undefined);
  assert.deepEqual(built.rows.map((r) => [r.id, r.seq, r.patch]), [
    ['I2', 2, { billingDate: '2026-11-05', dueDate: '2026-12-05' }],
    ['I3', 3, { billingDate: '2026-12-05', billingEvent: null, dueDate: '2027-01-04' }],
  ], 'งวด 1 ค่าตรงเดิมทุกช่อง = ไม่เขียน (กดซ้ำหลังหยุดกลางทางปลอดภัย)');
  assert.equal(built.rows[0].before, live[1], 'before = แถวสด (audit + ตัวล็อก updatedAt)');

  // ล้างวัน: ส่ง null ทุกช่อง
  const cleared = scheduleManyCheck(live, [sent('I1', { billingDate: null, billingEvent: null, dueDate: null })]);
  assert.deepEqual(cleared.rows[0].patch, { billingDate: null, dueDate: null });
  // '' = ล้างเหมือน null
  assert.deepEqual(scheduleManyCheck(live, [sent('I1', { dueDate: '' })]).rows[0].patch, { dueDate: null });
  // เปลี่ยนเฉพาะกำหนดชำระ (แก้ทับ) — วันวางบิลคงเดิม ไม่อยู่ใน patch
  assert.deepEqual(scheduleManyCheck(live, [sent('I1', { dueDate: '2026-11-10' })]).rows[0].patch, { dueDate: '2026-11-10' });
  // รอเหตุการณ์ (รวมลูกค้าไม่มีเครดิต — มติ 28/09 ข้อ 8): เก็บชื่อเหตุการณ์ ไม่มีวันวางบิล · ตัดช่องว่าง
  assert.deepEqual(scheduleManyCheck(live, [sent('I2', { billingDate: null, billingEvent: '  ก่อนส่งสินค้า ' })]).rows[0].patch,
    { billingEvent: 'ก่อนส่งสินค้า' });
  // วันวางบิล/รอเหตุการณ์ = คู่เดียวกัน (กติกาเดียวกับ `schedule`): ส่งคีย์ใดคีย์หนึ่ง = ตั้งทั้งคู่ อีกตัวว่าง
  // รุ่นสี่ (system-design §3.1): รอเหตุการณ์ ⇒ ไม่มีกำหนดชำระ — จอล้างกำหนดชำระมาพร้อมกัน (I1 มีกำหนดชำระอยู่)
  assert.deepEqual(scheduleManyCheck(live, [sent('I1', { billingDate: null, billingEvent: 'หลังติดตั้ง', dueDate: null })]).rows[0].patch,
    { billingDate: null, billingEvent: 'หลังติดตั้ง', dueDate: null });
  assert.deepEqual(scheduleManyCheck(live, [sent('I1', { billingEvent: 'หลังติดตั้ง', dueDate: null })]).rows[0].patch,
    { billingDate: null, billingEvent: 'หลังติดตั้ง', dueDate: null }, 'วันวางบิล → รอเหตุการณ์ ด้วย billingEvent ตัวเดียว');
  assert.deepEqual(scheduleManyCheck(live, [sent('I1', { billingEvent: 'หลังติดตั้ง' })]),
    { error: 'งวดที่ 1: งวดที่รอเหตุการณ์ยังไม่มีกำหนดชำระ — ล้างกำหนดชำระ หรือเลือกวันแทน "รอเหตุการณ์"', status: 400 },
    'กำหนดชำระเดิมที่ไม่ได้ล้าง = ไม่เดาวันให้งวดที่ผูกเหตุการณ์ (ด่าน API ตีกลับ ไม่ล้างเงียบ)');
  assert.deepEqual(scheduleManyCheck(live, [sent('I3', { billingDate: '2026-12-05' })]).rows[0].patch,
    { billingDate: '2026-12-05', billingEvent: null }, 'รอเหตุการณ์ → วันวางบิล ด้วย billingDate ตัวเดียว ไม่ชนเหตุการณ์เดิมเป็น 400');
  assert.match(scheduleManyCheck(live, [sent('I3', { dueDate: '2027-01-04' })]).error, /^งวดที่ 3: งวดที่รอเหตุการณ์ยังไม่มีกำหนดชำระ/,
    'ไม่ส่งทั้งคู่ = คงเหตุการณ์เดิม (ด่านจึงเห็นเหตุการณ์คู่กับกำหนดชำระที่ส่งมา)');
  // ส่งทั้งสองอย่างมาพร้อมกันตั้งใจ = 400 (อย่างใดอย่างหนึ่ง)
  assert.deepEqual(scheduleManyCheck(live, [sent('I2', { billingDate: '2026-11-05', billingEvent: 'หลังติดตั้ง' })]),
    { error: 'งวดที่ 2: เลือกวันวางบิล หรือ รอเหตุการณ์ อย่างใดอย่างหนึ่ง', status: 400 });
  // ทุกงวดตรงค่าเดิม = ไม่มีอะไรต้องเขียน
  assert.deepEqual(scheduleManyCheck(live, [sent('I2', { dueDate: null })]), { rows: [] });
});

test('scheduleManyCheck: งวดที่ค่าตรงฐานแล้วข้ามก่อนด่านทุกตัว — ส่งทั้งตาราง (รวมงวดล็อก) ได้ · กดซ้ำด้วยตัวล็อกรุ่นเก่าไม่ 409 วน', () => {
  const live = rows();
  const asIs = (row) => sent(row.id, { billingDate: row.billingDate, billingEvent: row.billingEvent, dueDate: row.dueDate });
  // ทั้งตาราง: งวด 4 แจ้งชำระแล้ว (ล็อก) ไม่ได้แก้ · งวด 3 ตัวล็อกรุ่นเก่าแต่ไม่ได้แก้ ⇒ ไม่ใช่เหตุให้ทั้งคำขอตก
  const whole = scheduleManyCheck(live, [
    asIs(live[0]),
    sent('I2', { billingDate: '2026-11-05', billingEvent: null, dueDate: '2026-12-05' }),
    { ...asIs(live[2]), updatedAt: 'old' },
    asIs(live[3]),
  ], { gate: (row) => (row.status === 'reported' ? 'ห้ามแตะงวดที่แจ้งชำระแล้ว' : null) });
  assert.equal(whole.error, undefined);
  assert.deepEqual(whole.rows.map((r) => r.id), ['I2']);
  // งวดที่ลงไปแล้วในรอบก่อน (หยุดกลางทาง) — จอยังถือตัวล็อกรุ่นก่อนเขียน แต่ค่าตรงฐานแล้ว ⇒ ข้าม · งวดที่เหลือเขียนต่อ
  const afterPartial = live.map((row) => (row.id === 'I2'
    ? { ...row, billingDate: '2026-11-05', dueDate: '2026-12-05', updatedAt: 'after-own-write' } : row));
  const retry = scheduleManyCheck(afterPartial, [
    sent('I2', { billingDate: '2026-11-05', billingEvent: null, dueDate: '2026-12-05' }),
    sent('I3', { billingDate: '2026-12-05', billingEvent: null, dueDate: '2027-01-04' }),
  ]);
  assert.deepEqual(retry.rows.map((r) => r.id), ['I3']);
  // แต่งวดที่ **แก้** ต้องผ่านทุกด่าน: แก้งวดที่ล็อก = 409 · ตัวล็อกรุ่นเก่า = 409
  assert.equal(scheduleManyCheck(live, [sent('I4', { dueDate: '2027-01-05' })]).status, 409);
  assert.equal(scheduleManyCheck(afterPartial, [sent('I2', { dueDate: '2026-12-10' })]).status, 409);
  // งวดที่ไม่อยู่ในใบแล้ว = 409 เสมอ (ไม่มีค่าในฐานให้เทียบ)
  assert.equal(scheduleManyCheck(live, [sent('GONE', { dueDate: null })]).status, 409);
});

test('scheduleManyCheck: ค่าวันผิด = 400 บอกเลขงวด (วันไม่มีจริง · ปีนอก 2000–2100 · ชื่อเหตุการณ์ยาวเกิน) — ลำดับ/เสาร์อาทิตย์ไม่บล็อก', () => {
  const live = rows();
  assert.deepEqual(scheduleManyCheck(live, [sent('I2', { dueDate: '2026-02-30' })]),
    { error: 'งวดที่ 2: กำหนดชำระไม่ถูกต้อง', status: 400 });
  assert.deepEqual(scheduleManyCheck(live, [sent('I2', { dueDate: '26-11-05' })]),
    { error: 'งวดที่ 2: กำหนดชำระไม่ถูกต้อง', status: 400 });
  assert.deepEqual(scheduleManyCheck(live, [sent('I2', { dueDate: '2202-08-06' })]),
    { error: 'งวดที่ 2: ปีของกำหนดชำระผิด', status: 400 });
  assert.deepEqual(scheduleManyCheck(live, [sent('I2', { billingDate: '2026-02-29' })]),
    { error: 'งวดที่ 2: วันวางบิลไม่ถูกต้อง', status: 400 });
  assert.deepEqual(scheduleManyCheck(live, [sent('I2', { billingEvent: 'ก'.repeat(121) })]),
    { error: 'งวดที่ 2: ชื่อเหตุการณ์ยาวเกิน 120 ตัวอักษร', status: 400 });
  // มติ 28/09: เตือน ไม่บล็อก — กำหนดชำระก่อนวันวางบิล / ย้อนงวดก่อน / ตรงวันอาทิตย์ ผ่านหมด
  const odd = scheduleManyCheck(live, [
    sent('I1', { billingDate: '2026-12-20', dueDate: '2026-12-01' }),
    sent('I2', { billingDate: '2026-10-04', dueDate: '2026-10-11' }),
  ]);
  assert.equal(odd.error, undefined);
  assert.equal(odd.rows.length, 2);
  // งวดแรกที่ผิดในลำดับเลขงวดคือตัวที่ตอบ — ไม่มีงวดไหนถูกเขียน
  assert.deepEqual(scheduleManyCheck(live, [sent('I3', { dueDate: 'x' }), sent('I2', { dueDate: '2026-13-01' })]),
    { error: 'งวดที่ 2: กำหนดชำระไม่ถูกต้อง', status: 400 });
});

test('scheduleManyCheck: ของเปลี่ยนใต้มือ = 409 พร้อมทุกงวด (ไม่อยู่ในใบ · รุ่นเก่า · ถูกแจ้งชำระ/ขอใบวางบิลระหว่างร่าง)', () => {
  const live = rows();
  // รุ่นเดียวกันคนละรูปแบบเวลา ≠ รุ่นเก่า (installmentStale ตัวเดียวกับ PATCH งวดเดียว)
  assert.equal(scheduleManyCheck(live, [{ id: 'I2', updatedAt: '2026-09-28T01:00:00+00:00', dueDate: '2026-11-05' }]).error, undefined);

  const stale = scheduleManyCheck(live, [sent('I2', { dueDate: '2026-11-05' }), { ...sent('I3', { dueDate: '2026-12-05' }), updatedAt: 'old' }]);
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.conflicts, [{ id: 'I3', seq: 3, reason: 'เพิ่งถูกแก้จากอีกหน้าต่าง' }]);
  assert.equal(stale.error, 'ยังไม่ได้บันทึกงวดไหน — งวดที่ 3: เพิ่งถูกแก้จากอีกหน้าต่าง · โหลดงวดล่าสุดแล้วตรวจอีกครั้ง');

  const all = scheduleManyCheck(live, [
    { ...sent('I2', { dueDate: '2026-11-05' }), updatedAt: 'old' },
    sent('I4', { dueDate: '2027-01-05' }),
    sent('GONE', { dueDate: '2027-01-05' }),
    sent('I1', { dueDate: '2026-11-10' }),
    sent('GONE-B', { dueDate: '2027-02-05' }),
  ], { requestedIds: new Set(['I1']) });
  assert.equal(all.status, 409);
  assert.deepEqual(all.conflicts.map((c) => [c.id, c.seq]), [['GONE', null], ['GONE-B', null], ['I1', 1], ['I2', 2], ['I4', 4]],
    'ครบทุกงวด ไม่ใช่แค่งวดแรก — จอใช้บอกว่างวดไหนเปลี่ยนใต้มือ · งวดที่ไม่อยู่ในใบขึ้นก่อนตามลำดับที่ส่ง (ตัวเทียบสมมาตร)');
  assert.match(all.conflicts[2].reason, /^ขอใบวางบิลแล้ว/);
  assert.equal(all.conflicts[4].reason, 'แจ้งชำระแล้ว — รอบัญชีตรวจ');
  assert.match(all.error, /^ยังไม่ได้บันทึกงวดไหน — มีงวดที่ไม่อยู่ในใบนี้แล้ว \(อาจถูกปรับแผนงวด\) · งวดที่ 1: ขอใบวางบิลแล้ว/,
    'สองงวดที่ไม่อยู่ในใบ = ประโยคเดียว ไม่พูดซ้ำ');

  // ถูกแจ้งชำระระหว่างร่าง: updatedAt ก็เปลี่ยน — บอกเหตุจริง ไม่ใช่ "เพิ่งถูกแก้"
  const reported = scheduleManyCheck(live, [{ ...sent('I4', { dueDate: '2027-01-05' }), updatedAt: 'old' }]);
  assert.deepEqual(reported.conflicts, [{ id: 'I4', seq: 4, reason: 'แจ้งชำระแล้ว — รอบัญชีตรวจ' }]);
  // ใบยกเลิก: งวดรอชำระเป็นโมฆะ (route ตอบล็อกทั้งใบก่อนถึงนี่ — ตัวตรวจกันซ้ำอีกชั้น)
  assert.equal(scheduleManyCheck(live, [sent('I2', { dueDate: '2026-11-05' })], { order: { status: 'cancelled' } }).status, 409);
  assert.equal(scheduleManyConflictMessage([{ seq: 2, reason: 'x' }, { seq: 5, reason: 'y' }]),
    'ยังไม่ได้บันทึกงวดไหน — งวดที่ 2: x · งวดที่ 5: y · โหลดงวดล่าสุดแล้วตรวจอีกครั้ง');
});

test('scheduleManyCheck: ด่าน schedule ทีละงวด (ตัวเดียวกับแผง) — ไม่มีสิทธิ์ = 400 บอกเลขงวด · FN ผ่าน · ฝ่ายอื่นไม่ผ่าน', () => {
  const live = rows();
  const body = [sent('I2', { billingDate: '2026-11-05', dueDate: '2026-12-05' })];
  const gateFor = (user) => (row) => installmentActionError(row, 'schedule', user, { rows: live });
  assert.equal(scheduleManyCheck(live, body, { gate: gateFor({ id: 'sa', role: 'ae' }) }).rows.length, 1);
  assert.equal(scheduleManyCheck(live, body, { gate: gateFor({ id: 'fn', role: 'finance', department: 'FN' }) }).rows.length, 1,
    'มติ 26/09 ข้อ 4: ฝ่ายบัญชีแก้วันงวดได้');
  assert.deepEqual(scheduleManyCheck(live, body, { gate: gateFor({ id: 'pc', role: 'pc', department: 'PC' }) }),
    { error: 'งวดที่ 2: ไม่มีสิทธิ์แก้กำหนดชำระ', status: 400 });
  // ของเปลี่ยนใต้มือตอบก่อนด่าน — คนที่ต้องโหลดใหม่ควรรู้ก่อนว่าต้องโหลดใหม่
  assert.equal(scheduleManyCheck(live, [{ ...body[0], updatedAt: 'old' }], { gate: () => 'ห้าม' }).status, 409);
});

// ── 4. เขียนทีละงวด ───────────────────────────────────────────────────────────────────────────────
const TABLE = 'sales_order_installments';
const condDb = (seed) => {
  const store = new Map(seed.map((r) => [r.id, { ...r }]));
  const writes = [];
  const failOn = new Set();
  return {
    store,
    writes,
    failOn,
    from(table) {
      assert.equal(table, TABLE);
      return {
        update: (patch) => {
          const where = {};
          const q = {
            eq: (col, value) => { where[col] = value; return q; },
            select: () => ({
              maybeSingle: async () => {
                if (failOn.has(where.id)) return { data: null, error: { code: '23514', message: 'check violation' } };
                const cur = store.get(where.id);
                if (!cur || ('updatedAt' in where && cur.updatedAt !== where.updatedAt)) return { data: null, error: null };
                const next = { ...cur, ...patch };
                store.set(where.id, next);
                writes.push({ id: where.id, patch, expected: where.updatedAt });
                return { data: next, error: null };
              },
            }),
          };
          return q;
        },
      };
    },
  };
};
const writerFor = (db) => (id, patch, expectedUpdatedAt) => updateInstallment(db, id, patch, { expectedUpdatedAt });
const twoRowPlan = (live) => scheduleManyCheck(live, [
  sent('I2', { billingDate: '2026-11-05', dueDate: '2026-12-05' }),
  sent('I3', { billingDate: '2026-12-05', billingEvent: null, dueDate: '2027-01-04' }),
]).rows;

test('writeScheduleMany + updateInstallment: เขียนทีละงวดแบบมีเงื่อนไข updatedAt ของแถวที่ด่านตัดสิน · before/after เฉพาะที่เขียนจริง', async () => {
  const live = rows();
  const db = condDb(live);
  const res = await writeScheduleMany(twoRowPlan(live), writerFor(db));
  assert.equal(res.stopped, null);
  assert.deepEqual(db.writes.map((w) => [w.id, w.expected, w.patch.billingDate, w.patch.dueDate, 'billingEvent' in w.patch]), [
    ['I2', T1, '2026-11-05', '2026-12-05', false],
    ['I3', T1, '2026-12-05', '2027-01-04', true],
  ]);
  assert.deepEqual(res.before.map((r) => r.id), ['I2', 'I3']);
  assert.deepEqual(res.after.map((r) => [r.id, r.billingDate, r.billingEvent]), [['I2', '2026-11-05', null], ['I3', '2026-12-05', null]]);
  assert.equal(db.store.get('I1').billingDate, '2026-10-05', 'งวดที่ไม่ได้ส่งมาไม่ถูกแตะ');
});

test('writeScheduleMany: อีกหน้าต่างเขียนแทรก = หยุดที่งวดนั้น (งวดที่ลงแล้วคงอยู่) · ฐานตีกลับกลางทาง = หยุดพร้อม error · พังงวดแรก = โยน', async () => {
  const live = rows();
  const raced = condDb(live);
  raced.store.set('I3', { ...raced.store.get('I3'), updatedAt: 'other-window' });
  const res = await writeScheduleMany(twoRowPlan(live), writerFor(raced));
  assert.deepEqual(res.stopped, { id: 'I3', seq: 3, error: null });
  assert.deepEqual(res.after.map((r) => r.id), ['I2']);
  assert.equal(raced.store.get('I3').billingEvent, 'หลังติดตั้ง', 'งวดที่หยุดไม่ถูกเขียน');
  assert.equal(scheduleManyStoppedMessage(res.after.length, { seq: 3, message: SCHEDULE_MANY_ROW_STALE }),
    'บันทึกแล้ว 1 งวด หยุดที่งวด 3 — งวดนี้เพิ่งถูกแก้จากอีกหน้าต่าง · โหลดงวดล่าสุดแล้วบันทึกงวดที่เหลืออีกครั้ง');
  // กดซ้ำหลังโหลดใหม่: งวด 2 ค่าตรงแล้ว ⇒ ไม่อยู่ในชุดที่เขียน
  const reloaded = [...raced.store.values()];
  const again = scheduleManyCheck(reloaded, [
    { ...sent('I2', { billingDate: '2026-11-05', dueDate: '2026-12-05' }), updatedAt: raced.store.get('I2').updatedAt },
    { ...sent('I3', { billingDate: '2026-12-05', billingEvent: null, dueDate: '2027-01-04' }), updatedAt: 'other-window' },
  ]);
  assert.deepEqual(again.rows.map((r) => r.id), ['I3']);

  const midFail = condDb(live);
  midFail.failOn.add('I3');
  const mid = await writeScheduleMany(twoRowPlan(live), writerFor(midFail));
  assert.equal(mid.stopped.seq, 3);
  assert.equal(mid.stopped.error.code, '23514');
  assert.deepEqual(mid.after.map((r) => r.id), ['I2']);

  const firstFail = condDb(live);
  firstFail.failOn.add('I2');
  await assert.rejects(writeScheduleMany(twoRowPlan(live), writerFor(firstFail)), (e) => e.code === '23514',
    'พังตั้งแต่งวดแรก = ยังไม่มีอะไรลงฐาน ⇒ โยนให้ route แปลแบบงวดเดียว (มิก 0389 · รหัสของฐาน)');

  const firstStale = condDb(live);
  firstStale.store.set('I2', { ...firstStale.store.get('I2'), updatedAt: 'other-window' });
  const none = await writeScheduleMany(twoRowPlan(live), writerFor(firstStale));
  assert.deepEqual([none.after.length, none.stopped], [0, { id: 'I2', seq: 2, error: null }]);
  assert.match(scheduleManyStoppedMessage(0, { seq: 2, message: SCHEDULE_MANY_ROW_STALE }), /^ยังไม่ได้บันทึก — หยุดที่งวด 2 — /);
});

test('installmentsAfterWrite: อ่านงวดสดพลาดหลังเขียนครบ — งวดก่อนเขียนแทนด้วยแถวที่เพิ่งเขียน (ลำดับ/งวดอื่นคงเดิม)', () => {
  const live = rows();
  const written = [{ ...live[1], dueDate: '2026-11-05', updatedAt: '2026-09-28T02:00:00.000Z' }];
  const merged = installmentsAfterWrite(live, written);
  assert.deepEqual(merged.map((row) => row.id), ['I1', 'I2', 'I3', 'I4']);
  assert.equal(merged[1], written[0], 'แถวที่เขียนแล้วมาจากฐาน (select * รูปเดียวกับ loadInstallments) — ใช้ทั้งแถว รวม updatedAt ใหม่');
  assert.equal(merged[0], live[0]);
  assert.deepEqual(installmentsAfterWrite(live, []), live);
  assert.deepEqual(installmentsAfterWrite(undefined, written), []);
});

// ── 5. ยามต้นทาง: route ต่อสายครบ ────────────────────────────────────────────────────────────────────
const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const code = (rel) => readFileSync(join(SRC, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}
const ROUTE = 'app/api/sales-planning/sales-orders/[id]/installments/route.js';

test('route งวด: schedule-many เป็นคำสั่งของทั้งใบ (ก่อนด่าน installmentId) · fill/redate = 410 · สิทธิ์ก่อนโหลด · ตรวจครบก่อนเขียน · audit ก่อน 409', () => {
  const route = code(ROUTE);
  const patch = slice(route, 'export const PATCH');
  const guard = patch.indexOf('if (!installmentId) return badRequest(');
  for (const line of [
    "if (action === 'schedule-many') return scheduleManyDates({ user, supabase, req, id, body });",
    'if (RETIRED_BILLING_ACTIONS.includes(action)) return fail(RETIRED_BILLING_MESSAGE, 410);',
  ]) {
    const at = patch.indexOf(line);
    assert.ok(at > 0 && at < guard, `proxy ให้ FN ผ่านเฉพาะ PATCH ของ route นี้ — ${line}`);
  }
  /* ตัดถึงปลายฟังก์ชันเอง (ไม่ใช่ฟังก์ชันถัดไป) — หลัง merge กับ PR-A งานบริการ `fillCoverage` มาอยู่ถัดจากตัวนี้และมี recordAudit ของมันเอง */
  const fn = slice(route, 'async function scheduleManyDates(', '\n}\n');
  const steps = [
    "if (!installmentScheduleAllowed(user)) return forbidden('ไม่มีสิทธิ์แก้กำหนดชำระ');",
    'const shapeError = scheduleManyShapeError(body.rows);',
    'const { order, error } = await loadOrderForUser(supabase, user, id);',
    'const live = await loadInstallments(supabase, order.id);',
    'const requestedIds = await loadBillingRequestedIds(supabase, live);',
    "const orderLock = historicalInstallmentLock(order) || pipelineInstallmentLock(order, 'schedule');",
    'if (orderLock) return badRequest(orderLock);',
    'const billingRule = await loadScheduleRule(supabase, order.customerId);',
    'const skipReady = await billingSkipReady(supabase, live);',
    'const built = scheduleManyCheck(live, body.rows, {',
    "gate: (row) => installmentActionError(row, 'schedule', user, gateOptions),",
    'rule: billingRule.rule, ruleUnavailable: billingRule.ruleUnavailable, skipReady,',
    'if (built.status === 409) {',
    'written = await writeScheduleMany(built.rows,',
    'await recordAudit({',
    'if (stopped) {',
    'scheduleManyStoppedMessage(after.length, stopped)',
  ];
  let at = -1;
  for (const step of steps) {
    const next = fn.indexOf(step, at + 1);
    assert.ok(next > at, `ลำดับผิด/หาไม่เจอ: ${step}`);
    at = next;
  }
  assert.doesNotMatch(fn, /loadInstallments\([^)]*\)\s*\.catch/, 'อ่านสดแบบโยน error');
  // ตัวเลือกของด่านชุดเดียวกับแผง/fill/redate — ใบบริการ · ใบย้อนหลัง · ใบยกเลิก
  const options = slice(fn, 'const gateOptions = {', '};');
  for (const key of ['serviceRounds: orderHasServiceRounds(order, order.lines)', 'historical: isHistoricalOrder(order)',
    'contractEnd: openingCoverageEnd(order, live)', "orderCancelled: order.status === 'cancelled' && !isHistoricalOrder(order)"]) {
    assert.ok(options.includes(key), `gateOptions ขาด ${key}`);
  }
  // เขียนแบบมีเงื่อนไข updatedAt · error งวดแรกแปลแบบงวดเดียว (มิก 0389 ก่อน)
  assert.match(fn, /updateInstallment\(\s*supabase, rowId, patch, \{ expectedUpdatedAt \},\s*\)/);
  const writeCatch = slice(fn, '} catch (writeError) {', 'const { before, after } = written;');
  assert.ok(writeCatch.indexOf('installmentBillingSchemaError(writeError)') < writeCatch.indexOf('documentWorkflowError(writeError'));
  /* รุ่นสี่: ตัวแปล 0393 (billingSkip) ก่อน 0389 — ตัวของ 0389 ไม่รู้จักคอลัมน์ติ๊ก · ทั้งทางพังงวดแรกและทางหยุดกลางทาง */
  assert.ok(writeCatch.indexOf('billingV4SchemaError(writeError)') >= 0
    && writeCatch.indexOf('billingV4SchemaError(writeError)') < writeCatch.indexOf('installmentBillingSchemaError(writeError)'));
  const failMessage = slice(fn, 'const failMessage = (writeError) =>', ';');
  assert.ok(failMessage.indexOf('billingV4SchemaError') < failMessage.indexOf('installmentBillingSchemaError'));
  // audit ก้อนเดียว before/after ทุกงวดที่เขียนจริง (+ ข้อยกเว้นรายงวด) · 409 พก conflicts + งวดสด
  assert.match(fn, /before: \{ installments: before \},/);
  assert.match(fn, /after: \{ installments: after, schedule: 'many', exceptions \},/);
  assert.match(fn, /\+ scheduleExceptionSummary\(exceptions, user\.name \|\| user\.email \|\| ''\)/);
  assert.equal((fn.match(/await recordAudit\(\{/g) || []).length, 1);
  assert.match(fn, /return ok\(\{ error: built\.error, conflicts: built\.conflicts, installments: installmentsForScreen\(order, live\) \}, 409\);/);
  /* สำเร็จครบ: อ่านงวดสดพลาดหลังเขียน ≠ 500 "ไม่สำเร็จ" (ทุกงวดลงจริง + audit แล้ว) — ถอยไปงวดก่อนเขียนที่แทนด้วยแถวที่เพิ่งเขียน */
  const success = slice(fn, "after: { installments: after, schedule: 'many', exceptions },", '} catch (scheduleError) {');
  const tail = success.slice(success.lastIndexOf('if (stopped) {'));
  const tailAfterStopped = tail.slice(tail.indexOf('}, 409);'));
  assert.match(tailAfterStopped, /settled = await loadInstallments\(supabase, order\.id\);\s*\} catch \{\s*settled = installmentsAfterWrite\(live, after\);/);
  assert.match(tailAfterStopped, /return ok\(\{ saved: after\.length, installments: installmentsForScreen\(order, settled\) \}\);/);
  /* fill-billing / redate-billing ถอดทั้งตัว (system-design §7.5) — ไม่เหลือตัวคิดรอบรุ่นสองฝั่ง server */
  assert.doesNotMatch(route, /async function (fillBillingDates|redateBillingDates)\(|billingFillCheck|billingRedateCheck|writeBillingFill/);
  assert.match(route, /const RETIRED_BILLING_MESSAGE = 'คำสั่งนี้เลิกใช้แล้ว — โหลดหน้าใหม่';/);
});

test('lib ตั้งวันหลายงวดไม่แตะฐานเอง (client ใช้ได้) · ไม่อ่านนาฬิกา', () => {
  const lib = code('lib/sales/installmentScheduleMany.js');
  assert.doesNotMatch(lib, /supabase|getSupabase|from\('/);
  assert.doesNotMatch(lib, /new Date\(\)|Date\.now\(/);
});

test('⭐ มติ 28/09 ข้อ 17: server เก็บกำหนดชำระตามที่จอส่งมา — ไม่คิดใหม่จากกติกาลูกค้า · รับวันวางบิลทุกกติกา/ทุกสายของใบ', () => {
  /* งวดของลูกค้าไม่มีเครดิต/ยังไม่ตั้ง/เครดิต: วันวางบิลกับกำหนดชำระที่ส่งมาลงตรงตามนั้น (รวม "แก้ทับ" ที่ไม่ตรงกติกา) */
  const live = rows();
  const built = scheduleManyCheck(live, [
    sent('I2', { billingDate: '2026-11-01', billingEvent: null, dueDate: '2026-11-15' }),
  ]);
  assert.deepEqual(built.rows[0].patch, { billingDate: '2026-11-01', dueDate: '2026-11-15' });
  /* ตัวคิดของ lib ไม่รู้จักกติกาหรือสายของใบเลย — ไม่มีอะไรให้ "คิดกำหนดชำระให้ใหม่" ฝั่ง server */
  const lib = code('lib/sales/installmentScheduleMany.js');
  assert.doesNotMatch(lib, /dueDateForBilling|dueFor\(|billingRuleOf|effectiveBillingRule|pickerRuleOf|planFill|planRedate|serviceRounds|\.line\b/);
  assert.match(lib, /import \{\s*NEED_NONE, SKIP_TEXT, billingNeed, normalizeInstallmentBilling, validateInstallmentDates,\s*\} from '@\/lib\/sales\/billingRule';/,
    'ตัวตรวจรูป + ด่านรุ่นสี่ตัวเดียวกับทุกเส้น');
  /* route: schedule-many อ่านกติกาของลูกค้าเพื่อ **ด่าน** เท่านั้น (รุ่นสี่ · ลูกค้าไม่ต้องวางบิล/ติ๊ก) — ไม่คิดกำหนดชำระให้ใหม่ */
  const route = code('app/api/sales-planning/sales-orders/[id]/installments/route.js');
  const fn = slice(route, 'async function scheduleManyDates(', '\n}\n');
  assert.match(fn, /loadScheduleRule\(supabase, order\.customerId\)/);
  assert.doesNotMatch(fn, /dueDateForBilling|dueFor\(|billingRuleOf|effectiveBillingRule|planFill|planRedate/);
});

// ── 6. รุ่นสี่ "ต้องวางบิลไหม" (mig 0393 · system-design §7.3) ─────────────────────────────────────────────────────
const NONE = { v: 4, need: 'none' };
const REQUIRED = { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 30, runs: null };
const NO_CREDIT = { credit: false };
/* งวดสดหลังรัน 0393 — select('*') คืนคีย์ billingSkip (null = ตามลูกค้า) */
const rowsV4 = () => rows().map((row) => ({ ...row, billingSkip: row.id === 'I2' ? true : null }));

test('รุ่นสี่: ลูกค้าไม่ต้องวางบิล — วันวางบิลใหม่ต้องยืนยัน "งวดนี้ต้องวางบิล…" · วันเดิมคง/ล้างได้ · กำหนดชำระตั้งเดี่ยวได้เสมอ', () => {
  const live = rowsV4();
  const opts = { rule: NONE, skipReady: true };
  assert.deepEqual(scheduleManyCheck(live, [sent('I3', { billingDate: '2026-12-05' })], opts),
    { error: `งวดที่ 3: ${NO_BILLING_WRITE_ERROR}`, status: 400 });
  const confirmed = scheduleManyCheck(live, [sent('I3', { billingDate: '2026-12-05', billingException: true })], opts);
  assert.deepEqual(confirmed.rows[0].patch, { billingDate: '2026-12-05', billingEvent: null });
  assert.deepEqual(confirmed.rows[0].exceptions, ['billing'], 'ข้อยกเว้นลงประวัติ — ไม่มีคอลัมน์ของตัวเอง');
  assert.equal('billingException' in confirmed.rows[0].patch, false, 'billingException ไม่ลงฐาน');
  // I1 มีวันวางบิลเดิม (ก่อนลูกค้าเปลี่ยนเป็นไม่ต้องวางบิล): แก้กำหนดชำระอย่างเดียวได้ · ล้างวันวางบิลได้ · ไม่ถูกซ่อน/บังคับ
  assert.deepEqual(scheduleManyCheck(live, [sent('I1', { dueDate: '2026-11-20' })], opts).rows[0].patch, { dueDate: '2026-11-20' });
  assert.deepEqual(scheduleManyCheck(live, [sent('I1', { billingDate: null })], opts).rows[0].patch, { billingDate: null });
  // กำหนดชำระอย่างเดียวของงวดที่ไม่มีวันวางบิล — ไม่ต้องยืนยันอะไร
  const dueOnly = scheduleManyCheck(live, [sent('I4', { dueDate: '2027-01-05' })], { ...opts, gate: () => null });
  assert.equal(dueOnly.status, 409, 'งวดที่แจ้งชำระแล้วยังล็อกตามเดิม (ล็อกไม่ใช่เรื่องของด่านรุ่นสี่)');
  // ยืนยันข้อยกเว้นบนลูกค้าที่ต้องวางบิลอยู่แล้ว = ไม่ใช่ข้อยกเว้น (ไม่ลงประวัติเกินจริง)
  assert.deepEqual(scheduleManyCheck(live, [sent('I3', { billingDate: '2026-12-05', billingException: true })], { rule: REQUIRED }).rows[0].exceptions, []);
});

test('รุ่นสี่: ติ๊ก "งวดนี้ไม่ต้องวางบิล" — เก็บ true/null · อยู่ใน patch เฉพาะเมื่อเปลี่ยน · ไม่ส่งคีย์ = คงติ๊กเดิม', () => {
  const live = rowsV4();
  const opts = { rule: REQUIRED, skipReady: true };
  const tick = scheduleManyCheck(live, [sent('I3', { billingSkip: true, billingEvent: null })], opts);
  assert.deepEqual(tick.rows[0].patch, { billingEvent: null, billingSkip: true });
  assert.deepEqual(tick.rows[0].exceptions, ['skip']);
  const untick = scheduleManyCheck(live, [sent('I2', { billingSkip: false })], opts);
  assert.deepEqual(untick.rows[0].patch, { billingSkip: null }, 'ไม่เก็บ false — null = ตามลูกค้า');
  assert.deepEqual(untick.rows[0].exceptions, ['unskip']);
  // งวด 2 ติ๊กอยู่แล้ว: แก้กำหนดชำระโดยไม่ส่งคีย์ติ๊ก = ติ๊กคงเดิม (ไม่ใช่ "เอาติ๊กออก")
  const dueOnly = scheduleManyCheck(live, [sent('I2', { dueDate: '2026-12-01' })], opts);
  assert.deepEqual(dueOnly.rows[0].patch, { dueDate: '2026-12-01' });
  assert.deepEqual(dueOnly.rows[0].exceptions, []);
  assert.deepEqual(scheduleManyCheck(live, [sent('I2', { billingSkip: true })], opts), { rows: [] }, 'ติ๊กซ้ำ = ค่าตรงฐาน ข้าม');
  // ติ๊กคู่วันวางบิล = 400 · ลูกค้าไม่ต้องวางบิลอยู่แล้วติ๊กไม่ได้
  assert.match(scheduleManyCheck(live, [sent('I2', { billingDate: '2026-11-05' })], opts).error,
    /^งวดที่ 2: ติ๊ก "งวดนี้ไม่ต้องวางบิล" แล้วมีวันวางบิลไม่ได้/, 'ติ๊กเดิมที่ไม่ได้ส่งก็ถูกนับ (รวมค่าเดิมก่อนตรวจ)');
  assert.deepEqual(scheduleManyCheck(live, [sent('I2', { billingDate: '2026-11-05', billingSkip: false })], opts).rows[0].patch,
    { billingDate: '2026-11-05', billingSkip: null }, 'เอาติ๊กออกพร้อมใส่วันวางบิลในคำขอเดียว = ได้');
  assert.equal(scheduleManyCheck(live, [sent('I3', { billingSkip: true, billingEvent: null })], { rule: NONE, skipReady: true }).error,
    'งวดที่ 3: ลูกค้าไม่ต้องวางบิลอยู่แล้ว — ไม่ต้องติ๊กรายงวด');
  // รูป: ติ๊ก/ยืนยันต้องเป็น boolean (สตริง "true" เป็น truthy — ไม่ปล่อยให้ตัวแปลงตีความ)
  assert.match(scheduleManyShapeError([sent('I3', { billingSkip: 'true' })]), /รูปแบบติ๊ก "งวดนี้ไม่ต้องวางบิล"/);
  assert.match(scheduleManyShapeError([sent('I3', { billingException: 1 })]), /งวดนี้ต้องวางบิล/);
  assert.equal(billingFlagShapeError({ billingSkip: null, billingException: false }), null);
});

test('รุ่นสี่: ก่อนรัน 0393 — ติ๊กเปลี่ยน = 503 "รอรัน migration 0393" (ไม่มีงวดไหนถูกเขียน) · คำขอที่ไม่แตะติ๊กไม่เอ่ยคอลัมน์', () => {
  const before0393 = rows(); // select('*') ไม่คืนคีย์ billingSkip
  assert.deepEqual(scheduleManyCheck(before0393, [
    sent('I2', { dueDate: '2026-11-05' }),
    sent('I3', { billingSkip: true, billingEvent: null }),
  ], { rule: REQUIRED, skipReady: false }), { error: BILLING_V4_SCHEMA_MISSING, status: 503 });
  const plain = scheduleManyCheck(before0393, [sent('I2', { dueDate: '2026-11-05' })], { rule: REQUIRED, skipReady: false });
  assert.deepEqual(plain.rows[0].patch, { dueDate: '2026-11-05' }, 'ไม่มีคีย์ billingSkip ใน patch ⇒ ไม่ชน PGRST204');
  assert.deepEqual(scheduleManyCheck(before0393, [sent('I2', { billingSkip: false, dueDate: '2026-11-05' })], { skipReady: false }).rows[0].patch,
    { dueDate: '2026-11-05' }, 'ส่ง false ของงวดที่ไม่เคยติ๊ก = ไม่เปลี่ยน ไม่ต้องมีคอลัมน์');
});

test('รุ่นสี่: อ่านกติกาลูกค้าไม่ขึ้น (ruleUnavailable) — ปิดเฉพาะงวดที่เปลี่ยนวันวางบิล/ติ๊ก · กำหนดชำระบันทึกได้ (ไม่ 500)', () => {
  const live = rowsV4();
  const opts = { ruleUnavailable: true, skipReady: true };
  assert.deepEqual(scheduleManyCheck(live, [sent('I1', { dueDate: '2026-11-30' })], opts).rows[0].patch, { dueDate: '2026-11-30' });
  assert.deepEqual(scheduleManyCheck(live, [sent('I3', { billingDate: '2026-12-05' })], opts),
    { error: `งวดที่ 3: ${RULE_UNAVAILABLE_ERROR}`, status: 400 });
  assert.equal(scheduleManyCheck(live, [sent('I2', { billingSkip: false })], opts).error, `งวดที่ 2: ${RULE_UNAVAILABLE_ERROR}`);
});

test('รุ่นสี่: รูปเดิม { credit:false } = เหมือนวันนี้ (วันวางบิลตั้งได้โดยไม่ต้องยืนยัน) · กำหนดชำระเก็บตามที่ส่ง ไม่คิดใหม่', () => {
  const built = scheduleManyCheck(rowsV4(), [sent('I3', { billingDate: '2026-12-05', dueDate: '2026-12-20' })], { rule: NO_CREDIT, skipReady: true });
  assert.deepEqual(built.rows[0].patch, { billingDate: '2026-12-05', billingEvent: null, dueDate: '2026-12-20' },
    'ชำระวันวางบิลของรูปเดิมคือตัวช่วยบนจอ — server ไม่ทับกำหนดชำระที่คนเลือก');
});

test('ข้อยกเว้นรายงวด: ประโยคในประวัติ (contracts §10 7.3) · สรุปหลายงวด · งวดใหม่ของหน้าสร้าง', () => {
  assert.equal(scheduleExceptionText('billing', 'สมชาย'), 'ยกเว้น: งวดนี้ต้องวางบิล โดย สมชาย');
  assert.equal(scheduleExceptionText('skip', 'สมชาย'), 'ยกเว้น: งวดนี้ไม่ต้องวางบิล โดย สมชาย');
  assert.equal(scheduleExceptionText('unskip', 'สมชาย'), 'เอาติ๊ก "งวดนี้ไม่ต้องวางบิล" ออก');
  assert.equal(scheduleExceptionSummary([{ seq: 2, exceptions: ['billing'] }, { seq: 3, exceptions: [] }, { seq: 4, exceptions: ['skip'] }], 'ก'),
    ' · งวดที่ 2 ยกเว้น: งวดนี้ต้องวางบิล โดย ก · งวดที่ 4 ยกเว้น: งวดนี้ไม่ต้องวางบิล โดย ก');
  assert.equal(scheduleExceptionSummary([{ seq: 1 }]), '');
  assert.deepEqual(scheduleExceptionsOf({}, { billingDate: '2026-10-05', billingException: true }, NONE), ['billing']);
  assert.deepEqual(scheduleExceptionsOf({}, { billingDate: '2026-10-05', billingException: true }, null), [], 'ยังไม่ระบุ = ไม่ใช่ข้อยกเว้น');
  assert.deepEqual(scheduleExceptionsOf({ billingDate: '2026-10-05' }, { billingDate: '2026-10-05', billingException: true }, NONE), [],
    'วันเดิมไม่เปลี่ยน = ไม่ได้ยกเว้นใหม่');
});

test('writeScheduleMany: ติ๊กลงฐานผ่านตัวเขียนเดียวกัน (patch เฉพาะช่องที่เปลี่ยน · มีเงื่อนไข updatedAt)', async () => {
  const live = rowsV4();
  const db = condDb(live);
  const plan = scheduleManyCheck(live, [sent('I3', { billingSkip: true, billingEvent: null }), sent('I2', { billingSkip: false })],
    { rule: REQUIRED, skipReady: true }).rows;
  const res = await writeScheduleMany(plan, writerFor(db));
  assert.equal(res.stopped, null);
  assert.deepEqual(db.writes.map((w) => [w.id, w.patch.billingSkip]), [['I2', null], ['I3', true]]);
  assert.equal(db.store.get('I3').billingSkip, true);
});

// ── 7. route ตัวจริง (fetch ปลอม · devBypass admin) — ด่านรุ่นสี่ถึงฐานครบทาง ─────────────────────────────────────────
/* ไม่มีฐานจริง: fetch ปลอมตอบตามตาราง · next/headers ต่อเป็นโมดูลว่าง (raw Node แกะ subpath ของ next ไม่ได้ · ทาง devBypass ไม่อ่าน cookie) */
async function installmentsRoute(t, { customers, installments }) {
  const { register } = await import('node:module');
  register('data:text/javascript,' + encodeURIComponent(`
    export async function resolve(spec, ctx, next) {
      if (spec === 'next/headers') {
        return { url: 'data:text/javascript,export function cookies(){throw new Error("no cookie in devBypass")}export const headers=cookies;', shortCircuit: true };
      }
      return next(spec, ctx);
    }
  `));
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    SUPABASE_URL: 'http://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role', NEXT_PUBLIC_DEV_BYPASS_ROLE: 'admin',
  };
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  t.after(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });

  const store = new Map(installments.map((r) => [r.id, { ...r }]));
  const writes = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input?.url || String(input));
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const table = url.pathname.replace('/rest/v1/', '');
    const one = String(new Headers(init.headers || {}).get('accept') || '').includes('vnd.pgrst.object');
    const reply = (rows) => json(one ? (rows[0] ?? null) : rows);
    if (table === 'sales_orders') return reply([{ id: 'SOR-1', orderNumber: 'SO-26090001-0', dealId: 'D1', quotationId: 'Q1', customerId: 'CUS-1', status: 'approved', totalAmount: 1000 }]);
    if (table === 'sales_deals') return reply([{ id: 'D1', team: 'KA', ownerId: 'u-1' }]);
    if (table === 'quotations') return reply([{ id: 'Q1', quoteNumber: 'QT-1', status: 'accepted', paymentPlan: null }]);
    if (table === 'customers') return customers();
    if (table === 'sales_order_installments' && method === 'GET') {
      const id = url.searchParams.get('id');
      const rows = [...store.values()].filter((r) => !id || `eq.${r.id}` === id).sort((a, b) => a.seq - b.seq);
      return reply(rows);
    }
    if (table === 'sales_order_installments' && method === 'PATCH') {
      const id = url.searchParams.get('id').replace(/^eq\./, '');
      const patch = JSON.parse(init.body);
      writes.push({ id, patch });
      const next = { ...store.get(id), ...patch };
      store.set(id, next);
      return reply([next]);
    }
    if (method === 'POST') return json(one ? {} : [], 201);
    return reply([]);
  });
  const { PATCH } = await import('../../app/api/sales-planning/sales-orders/[id]/installments/route.js');
  const call = async (body) => {
    const res = await PATCH(new Request('http://localhost/api/sales-planning/sales-orders/SOR-1/installments', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: 'SOR-1' }) });
    return { status: res.status, body: await res.json() };
  };
  return { call, writes, store };
}
const liveRow = (id, seq, over = {}) => ({
  id, salesOrderId: 'SOR-1', seq, status: 'pending', amount: 500, label: `งวดที่ ${seq}`, frozenAt: T1,
  billingDate: null, billingEvent: null, dueDate: null, billingSkip: null, billingRequestId: null, updatedAt: T1, ...over,
});

test('⭐ route: อ่านกติกาลูกค้าไม่ขึ้น — schedule-many บันทึกกำหนดชำระได้ (ไม่ 500) · งวดที่เปลี่ยนวันวางบิลได้ 400 บอกเหตุ', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { call, writes } = await installmentsRoute(t, {
    customers: () => new Response(JSON.stringify({ code: '57014', message: 'canceling statement due to statement timeout' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    installments: [liveRow('I1', 1), liveRow('I2', 2)],
  });
  const due = await call({ action: 'schedule-many', rows: [{ id: 'I1', updatedAt: T1, dueDate: '2026-11-05' }] });
  assert.equal(due.status, 200, JSON.stringify(due.body));
  assert.deepEqual(writes.map((w) => [w.id, w.patch.dueDate, 'billingDate' in w.patch]), [['I1', '2026-11-05', false]]);
  const bill = await call({ action: 'schedule-many', rows: [{ id: 'I2', updatedAt: T1, billingDate: '2026-10-05' }] });
  assert.equal(bill.status, 400);
  assert.equal(bill.body.error, `งวดที่ 2: ${RULE_UNAVAILABLE_ERROR}`);
  assert.equal(writes.length, 1, 'ไม่มีอะไรถูกเขียนเพิ่ม');
});

test('⭐ route: ลูกค้าไม่ต้องวางบิล — schedule งวดเดียวตีกลับวันวางบิลที่ไม่ยืนยัน · ยืนยันแล้วเขียน · fill-billing = 410', async (t) => {
  const { call, writes } = await installmentsRoute(t, {
    customers: () => new Response(JSON.stringify([{ id: 'CUS-1', billingRule: { v: 4, need: 'none' } }]), { status: 200, headers: { 'content-type': 'application/json' } }),
    installments: [liveRow('I1', 1), { ...liveRow('I2', 2), billingSkip: undefined }],
  });
  const blocked = await call({ action: 'schedule', installmentId: 'I1', dueDate: '2026-10-05', billingDate: '2026-10-05', expectedUpdatedAt: T1 });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.error, NO_BILLING_WRITE_ERROR);
  assert.equal(writes.length, 0);
  const confirmed = await call({
    action: 'schedule', installmentId: 'I1', dueDate: '2026-10-05', billingDate: '2026-10-05', billingException: true, expectedUpdatedAt: T1,
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.deepEqual(writes[0].patch.billingDate, '2026-10-05');
  assert.equal('billingException' in writes[0].patch, false, 'ธงยืนยันไม่ลงฐาน');
  const retired = await call({ action: 'fill-billing', plan: [] });
  assert.deepEqual([retired.status, retired.body.error], [410, 'คำสั่งนี้เลิกใช้แล้ว — โหลดหน้าใหม่']);
});

test('⭐ route: ฐานยังไม่รัน 0393 (แถวไม่มีคีย์ billingSkip) — ติ๊ก = 503 "รอรัน migration 0393" ก่อนเขียน · แก้กำหนดชำระไม่เอ่ยคอลัมน์', async (t) => {
  const before0393 = (id, seq) => { const row = liveRow(id, seq); delete row.billingSkip; return row; };
  const { call, writes } = await installmentsRoute(t, {
    customers: () => new Response(JSON.stringify([{ id: 'CUS-1', billingRule: null }]), { status: 200, headers: { 'content-type': 'application/json' } }),
    installments: [before0393('I1', 1), before0393('I2', 2)],
  });
  const one = await call({ action: 'schedule', installmentId: 'I1', dueDate: '2026-10-05', billingSkip: true, expectedUpdatedAt: T1 });
  assert.deepEqual([one.status, one.body.error], [503, BILLING_V4_SCHEMA_MISSING]);
  const many = await call({ action: 'schedule-many', rows: [{ id: 'I2', updatedAt: T1, dueDate: '2026-11-05', billingSkip: true }] });
  assert.deepEqual([many.status, many.body.error], [503, BILLING_V4_SCHEMA_MISSING]);
  assert.equal(writes.length, 0);
  const due = await call({ action: 'schedule', installmentId: 'I1', dueDate: '2026-10-05', expectedUpdatedAt: T1 });
  assert.equal(due.status, 200, JSON.stringify(due.body));
  assert.equal('billingSkip' in writes[0].patch, false);
});
