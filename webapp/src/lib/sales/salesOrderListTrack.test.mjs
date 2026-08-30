import test from 'node:test';
import assert from 'node:assert/strict';

import { salesOrderListTrack, salesOrderTrackSummary } from './salesOrderListTrack.js';

/* ⭐ **ลำดับใหม่ (มติผู้ใช้ 2026-08-30)**: AE Sup → เก็บเงินครบ → บัญชีปิดใบ
   ของเดิมวางบัญชีไว้กลาง ซึ่งไม่ตรงกับของจริงสองข้อ: ไม่มีโค้ดจุดไหนบังคับลำดับนั้น
   (สองแกนเดินขนานกัน) และหน้ารายละเอียด SO วางขั้นบัญชีไว้ท้ายสุดอยู่แล้ว
   ⇒ steps เรียง [doc, money, finance] · index 1 = เงิน · index 2 = ปิดใบ */
const cell = (extra = {}) => ({
  tracked: true, paid: 0, count: 1, complete: false, overdue: 0, reviewing: 0, rejected: 0, ...extra,
});
const at = (order) => salesOrderListTrack(order).steps.map((s) => `${s.key}:${s.state}`);
const paidUp = cell({ paid: 1, count: 1, complete: true });

test('ลำดับรางคือ เอกสาร → เงิน → ปิดใบ', () => {
  assert.deepEqual(salesOrderListTrack({ status: 'draft' }).steps.map((s) => s.key), ['doc', 'money', 'finance']);
});

test('ใบร่างและใบรออนุมัติ — ยังไม่ถึงทั้งขั้นเงินและขั้นปิดใบ', () => {
  assert.deepEqual(at({ status: 'draft' }), ['doc:todo', 'money:todo', 'finance:todo']);
  assert.deepEqual(at({ status: 'pending_approval' }), ['doc:now', 'money:todo', 'finance:todo']);
});

/* ⚠️ ตีกลับ = ธงแดงที่ **ขั้นนั้น** ไม่ใช่ถอยไปขั้นก่อนหน้า — คนที่ต้องลงมือคือผู้ยื่น */
test('ใบที่ถูกตีกลับขึ้นธงแดงที่ขั้นของตัวเอง', () => {
  assert.deepEqual(at({ status: 'rejected' }), ['doc:bad', 'money:todo', 'finance:todo']);
  assert.equal(salesOrderListTrack({ status: 'rejected' }).steps[0].note, 'ถูกตีกลับ');
});

/* 🔴 `financeStatus = null` มีสองความหมาย: ใบยังไม่อนุมัติ = ยังไม่ถึงคิว ·
   ใบอนุมัติแล้ว = **ออกก่อนมีขั้นนี้** (มติไม่ backfill) — อย่างหลังต้องมีโน้ต */
test('ใบเก่าที่อนุมัติก่อนมีขั้นบัญชี ต้องบอกว่ายังไม่ส่ง ไม่ใช่ปล่อยว่าง', () => {
  const s = salesOrderListTrack({ status: 'approved', financeStatus: null, payment: cell() });
  assert.equal(s.steps[2].state, 'todo');
  assert.equal(s.steps[2].note, 'ยังไม่ส่งให้บัญชี');
  assert.equal(salesOrderListTrack({ status: 'draft' }).steps[2].note, null);
});

/* 🔴 หัวใจของมติใหม่ — `pending` ไม่ได้แปลว่า "บัญชีกำลังทำ" อีกแล้ว
   บัญชีกดปิดได้ต่อเมื่อเก็บครบ ⇒ ใบที่ยังเก็บไม่ครบต้องเป็น todo พร้อมเหตุ
   ไม่ใช่ `now` ที่อ่านเหมือนบัญชีดองงานทั้งที่ยังไม่ถึงคิวเขา */
test('⭐ ขั้นปิดใบยังไม่ถึงคิวจนกว่าจะเก็บเงินครบ', () => {
  const notPaid = salesOrderListTrack({ status: 'approved', financeStatus: 'pending', payment: cell({ paid: 1, count: 2 }) });
  assert.equal(notPaid.steps[2].state, 'todo');
  assert.equal(notPaid.steps[2].note, 'รอเก็บเงินครบก่อน');

  const paid = salesOrderListTrack({ status: 'approved', financeStatus: 'pending', payment: paidUp });
  assert.equal(paid.steps[2].state, 'now');
  assert.equal(paid.steps[2].note, null);
});

test('ปิดใบแล้วขึ้นเขียวพร้อมป้าย "ปิดใบแล้ว"', () => {
  const done = salesOrderListTrack({ status: 'approved', financeStatus: 'approved', payment: paidUp }).steps[2];
  assert.equal(done.state, 'done');
  assert.equal(done.label, 'ปิดใบแล้ว');
});

/* คำสั่งตีกลับทั้งใบถูกถอดแล้ว แต่ค่าเก่าบนฐานต้องยังอ่านออก (ไม่มีสักใบ ณ 30/08) */
test('แถวเก่าที่บัญชีเคยตีกลับ ยังอ่านออกเป็นธงแดง', () => {
  const s = salesOrderListTrack({ status: 'approved', financeStatus: 'rejected', payment: cell() }).steps[2];
  assert.equal(s.state, 'bad');
  assert.match(s.note, /คำสั่งเก่า/);
});

// ── ขั้นเก็บเงิน ─────────────────────────────────────────────────────────
/* ⚠️ นับเฉพาะงวดที่บัญชีคอนเฟิร์ม — `reported` ไม่นับ (กติกา mig 0245) */
test('ป้ายเก็บเงินบอกจำนวนงวดที่เก็บได้จริง', () => {
  const money = (payment) => salesOrderListTrack({ status: 'approved', financeStatus: 'pending', payment }).steps[1];
  assert.equal(money(cell({ paid: 1, count: 2 })).label, 'เก็บเงิน 1/2');
  assert.equal(money(cell({ paid: 2, count: 2, complete: true })).label, 'เก็บครบ');
  assert.equal(money(cell({ paid: 2, count: 2, complete: true })).state, 'done');
});

test('เลยกำหนดและถูกตีกลับเป็นธงแดง แม้เก็บได้บางงวดแล้ว', () => {
  const money = (payment) => salesOrderListTrack({ status: 'approved', financeStatus: 'pending', payment }).steps[1];
  assert.equal(money(cell({ paid: 1, count: 2, overdue: 1 })).state, 'bad');
  assert.equal(money(cell({ paid: 1, count: 2, overdue: 1 })).note, 'เลยกำหนด 1 งวด');
  assert.equal(money(cell({ paid: 0, count: 1, rejected: 1 })).state, 'bad');
});

/* ⚠️ ใบที่ยังไม่เริ่มติดตาม ตัวเลขมาจากแผนใน QT ไม่ใช่งวดจริง ⇒ ยังไม่ใช่ `now` */
test('ใบที่ยังไม่เริ่มติดตามงวด ยังไม่นับว่าเดินถึงขั้นเก็บเงิน', () => {
  const s = salesOrderListTrack({ status: 'approved', financeStatus: 'pending', payment: cell({ tracked: false }) });
  assert.equal(s.steps[1].state, 'todo');
  assert.equal(s.steps[1].note, 'ยังไม่เริ่มติดตาม');
});

// ── ใบที่ยกเลิก ──────────────────────────────────────────────────────────
test('ใบที่ยกเลิกไม่มีราง', () => {
  const s = salesOrderListTrack({ status: 'cancelled', financeStatus: 'approved' });
  assert.equal(s.cancelled, true);
  assert.deepEqual(s.steps, []);
  assert.deepEqual(salesOrderTrackSummary({ status: 'cancelled' }), { label: 'ยกเลิกแล้ว', tone: 'neutral' });
});

// ── ป้ายสรุปสำหรับจอแคบ ──────────────────────────────────────────────────
test('ป้ายสรุปยกธงแดงขึ้นก่อนขั้นที่กำลังเดิน', () => {
  const withOverdue = { status: 'approved', financeStatus: 'pending', payment: cell({ overdue: 2 }) };
  assert.deepEqual(salesOrderTrackSummary(withOverdue), { label: 'เลยกำหนด 2 งวด', tone: 'danger' });
});

test('ป้ายสรุปบอกว่ารอใคร และใบที่ปิดแล้วบอกว่าจบ', () => {
  // เก็บครบแล้วแต่ยังไม่ปิด = รอบัญชี
  assert.deepEqual(
    salesOrderTrackSummary({ status: 'approved', financeStatus: 'pending', payment: paidUp }),
    { label: 'รอ บัญชีปิดใบ', tone: 'warning' },
  );
  // ยังเก็บไม่ครบ = รอเก็บเงิน ไม่ใช่รอบัญชี
  assert.deepEqual(
    salesOrderTrackSummary({ status: 'approved', financeStatus: 'pending', payment: cell({ paid: 0, count: 2 }) }),
    { label: 'รอ เก็บเงิน 0/2', tone: 'warning' },
  );
  assert.deepEqual(
    salesOrderTrackSummary({ status: 'approved', financeStatus: 'approved', payment: paidUp }),
    { label: 'เสร็จสมบูรณ์', tone: 'success' },
  );
});

test('ใบเก่าที่ไม่มีใครลงมือ ป้ายสรุปต้องบอกว่าค้างตรงไหน ไม่ใช่ปล่อยว่าง', () => {
  const s = salesOrderTrackSummary({ status: 'approved', financeStatus: null, payment: cell({ tracked: false }) });
  assert.equal(s.label, 'ยังไม่เริ่มติดตาม');
  assert.equal(s.tone, 'neutral');
});

// ── ใบยอด 0 ปิดเองตั้งแต่ AE Sup อนุมัติ (มติผู้ใช้ 2026-08-30) ──────────────
/* 🐞 ถ้าขั้นไหนยังเป็น todo ใบยอด 0 จะค้างครึ่งทางตลอดกาลและไม่มีวันขึ้น "เสร็จสมบูรณ์" */
test('⭐ ใบยอด 0 ที่อนุมัติแล้ว = จบทั้งราง ไม่ต้องรอบัญชี', () => {
  const { steps } = salesOrderListTrack({ status: 'approved', totalAmount: 0, payment: null });
  const money = steps.find((s) => s.key === 'money');
  const finance = steps.find((s) => s.key === 'finance');
  // ⚠️ ต้องเป็น skip ไม่ใช่ done — เขียวแปลว่า "ผ่านขั้นนี้มาแล้ว" ซึ่งไม่จริง
  assert.equal(money.state, 'skip');
  assert.equal(money.label, 'ไม่เก็บเงิน');
  assert.equal(finance.state, 'skip');
  assert.match(finance.note, /ปิดตั้งแต่อนุมัติ/);
  assert.equal(salesOrderTrackSummary({ status: 'approved', totalAmount: 0, payment: null }).label, 'เสร็จสมบูรณ์');
});

// ⚠️ ใบที่ไม่ได้ส่งยอดมา (fixture เก่า/แถวที่ยังโหลดไม่เสร็จ) ต้องไม่ถูกตัดสินว่ายอด 0
test('ไม่รู้ยอด ≠ ยอด 0 — รางยังเดินตามงวดตามปกติ', () => {
  const { steps } = salesOrderListTrack({
    status: 'approved', financeStatus: 'pending', payment: { tracked: true, paid: 1, count: 2 },
  });
  assert.equal(steps.find((s) => s.key === 'money').label, 'เก็บเงิน 1/2');
});
