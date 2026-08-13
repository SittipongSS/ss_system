import test from 'node:test';
import assert from 'node:assert/strict';

import { salesOrderListTrack, salesOrderTrackSummary } from './salesOrderListTrack.js';

const cell = (extra = {}) => ({
  tracked: true, paid: 0, count: 1, complete: false, overdue: 0, reviewing: 0, rejected: 0, ...extra,
});
const at = (order) => salesOrderListTrack(order).steps.map((s) => `${s.key}:${s.state}`);

// ── สามขั้นคือสายงานจริง ไม่ใช่การตกแต่ง ─────────────────────────────────
test('ใบร่างและใบรออนุมัติ — ขั้นบัญชีกับเก็บเงินยังไม่ถึงคิว', () => {
  assert.deepEqual(at({ status: 'draft' }), ['doc:todo', 'finance:todo', 'money:todo']);
  assert.deepEqual(at({ status: 'pending_approval' }), ['doc:now', 'finance:todo', 'money:todo']);
});

/* ⚠️ ตีกลับ = ธงแดงที่ **ขั้นนั้น** ไม่ใช่ถอยไปขั้นก่อนหน้า — คนที่ต้องลงมือคือผู้ยื่น
   ซึ่งอยู่ตรงจุดนี้พอดี · ถอยหมุดกลับทำให้อ่านเหมือนงานหายไปจากระบบ */
test('ใบที่ถูกตีกลับขึ้นธงแดงที่ขั้นของตัวเอง', () => {
  assert.deepEqual(at({ status: 'rejected' }), ['doc:bad', 'finance:todo', 'money:todo']);
  const [doc] = salesOrderListTrack({ status: 'rejected' }).steps;
  assert.equal(doc.note, 'ถูกตีกลับ');
});

/* 🔴 `financeStatus = null` มีสองความหมาย ต้องแยกให้ออก:
   ใบยังไม่อนุมัติ = ยังไม่ถึงคิว · ใบอนุมัติแล้ว = **ออกก่อนมีขั้นนี้** (มติไม่ backfill)
   สองอย่างนี้เป็น todo เหมือนกัน แต่อย่างหลังต้องมีโน้ต ไม่งั้นอ่านเหมือนบัญชีดองงาน */
test('ใบเก่าที่อนุมัติก่อนมีขั้นบัญชี ต้องบอกว่ายังไม่ส่ง ไม่ใช่ปล่อยว่าง', () => {
  const s = salesOrderListTrack({ status: 'approved', financeStatus: null, payment: cell() });
  assert.equal(s.steps[1].state, 'todo');
  assert.equal(s.steps[1].note, 'ยังไม่ส่งให้บัญชี');
  // ใบที่ยังไม่อนุมัติไม่ต้องมีโน้ตนั้น — มันยังไม่ถึงคิวจริง ๆ
  assert.equal(salesOrderListTrack({ status: 'draft' }).steps[1].note, null);
});

test('ขั้นบัญชีเดินตาม financeStatus', () => {
  const of = (financeStatus) => salesOrderListTrack({ status: 'approved', financeStatus, payment: cell() }).steps[1];
  assert.equal(of('pending').state, 'now');
  assert.equal(of('approved').state, 'done');
  assert.equal(of('rejected').state, 'bad');
  assert.equal(of('rejected').note, 'บัญชีตีกลับ');
});

// ── ขั้นเก็บเงิน ─────────────────────────────────────────────────────────
/* ⚠️ นับเฉพาะงวดที่บัญชีคอนเฟิร์ม — `reported` ไม่นับ (กติกา mig 0245) */
test('ป้ายเก็บเงินบอกจำนวนงวดที่เก็บได้จริง', () => {
  const money = (payment) => salesOrderListTrack({ status: 'approved', financeStatus: 'approved', payment }).steps[2];
  assert.equal(money(cell({ paid: 1, count: 2 })).label, 'เก็บเงิน 1/2');
  assert.equal(money(cell({ paid: 2, count: 2, complete: true })).label, 'เก็บครบ');
  assert.equal(money(cell({ paid: 2, count: 2, complete: true })).state, 'done');
});

test('เลยกำหนดและถูกตีกลับเป็นธงแดง แม้เก็บได้บางงวดแล้ว', () => {
  const money = (payment) => salesOrderListTrack({ status: 'approved', financeStatus: 'approved', payment }).steps[2];
  assert.equal(money(cell({ paid: 1, count: 2, overdue: 1 })).state, 'bad');
  assert.equal(money(cell({ paid: 1, count: 2, overdue: 1 })).note, 'เลยกำหนด 1 งวด');
  assert.equal(money(cell({ paid: 0, count: 1, rejected: 1 })).state, 'bad');
});

/* ⚠️ ใบที่ยังไม่เริ่มติดตาม ตัวเลขมาจากแผนใน QT ไม่ใช่งวดจริง ⇒ ยังไม่ใช่ `now` */
test('ใบที่ยังไม่เริ่มติดตามงวด ยังไม่นับว่าเดินถึงขั้นเก็บเงิน', () => {
  const s = salesOrderListTrack({ status: 'approved', financeStatus: 'approved', payment: cell({ tracked: false }) });
  assert.equal(s.steps[2].state, 'todo');
  assert.equal(s.steps[2].note, 'ยังไม่เริ่มติดตาม');
});

// ── ใบที่ยกเลิก ──────────────────────────────────────────────────────────
/* 🔴 ใบยกเลิกไม่มีรางให้เดิน — ลากรางที่ตายแล้วมาแสดงทำให้อ่านเหมือนใบยังเดินอยู่ */
test('ใบที่ยกเลิกไม่มีราง', () => {
  const s = salesOrderListTrack({ status: 'cancelled', financeStatus: 'approved' });
  assert.equal(s.cancelled, true);
  assert.deepEqual(s.steps, []);
  assert.deepEqual(salesOrderTrackSummary({ status: 'cancelled' }), { label: 'ยกเลิกแล้ว', tone: 'neutral' });
});

// ── ป้ายสรุปสำหรับจอแคบ ──────────────────────────────────────────────────
/* ⭐ บอก "ขั้นที่ต้องลงมือ" — ธงแดงมาก่อนเสมอ เพราะเป็นสิ่งเดียวที่ต้องการคนไปทำอะไร */
test('ป้ายสรุปยกธงแดงขึ้นก่อนขั้นที่กำลังเดิน', () => {
  const withOverdue = { status: 'approved', financeStatus: 'pending', payment: cell({ overdue: 2 }) };
  assert.deepEqual(salesOrderTrackSummary(withOverdue), { label: 'เลยกำหนด 2 งวด', tone: 'danger' });
});

test('ป้ายสรุปของใบปกติบอกว่ารอใคร และของใบที่จบแล้วบอกว่าจบ', () => {
  assert.deepEqual(
    salesOrderTrackSummary({ status: 'approved', financeStatus: 'pending', payment: cell() }),
    { label: 'รอ บัญชีตรวจ', tone: 'warning' },
  );
  assert.deepEqual(
    salesOrderTrackSummary({
      status: 'approved', financeStatus: 'approved',
      payment: cell({ paid: 1, count: 1, complete: true }),
    }),
    { label: 'เสร็จสมบูรณ์', tone: 'success' },
  );
});

test('ใบเก่าที่ไม่มีใครลงมือ ป้ายสรุปต้องบอกว่าค้างตรงไหน ไม่ใช่ปล่อยว่าง', () => {
  const s = salesOrderTrackSummary({ status: 'approved', financeStatus: null, payment: cell({ tracked: false }) });
  assert.equal(s.label, 'ยังไม่ส่งให้บัญชี');
  assert.equal(s.tone, 'neutral');
});
