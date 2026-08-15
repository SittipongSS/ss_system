import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  billAmountFor, billingQuotationError, billingQuotationOptions,
  billingQuotationSkipHint, billingQuotationSkips, resolveBillAmount,
} from './billingQuotations.js';

const qt = (over = {}) => ({
  id: 'QT-1', quoteNumber: 'Q#260731-0006', dealId: 'D1',
  status: 'sent', approvalStatus: 'approved', totalAmount: 181016.25, ...over,
});

test('ต้องเป็นใบที่อนุมัติแล้ว — อ่านแกน approvalStatus ไม่ใช่ status', () => {
  assert.equal(billingQuotationError(qt()), null);
  // ⚠️ ใบที่รออนุมัติยังเป็น status='draft' อยู่ — ด่านที่ดูแค่ status จะปล่อยผ่าน
  assert.match(billingQuotationError(qt({ status: 'draft', approvalStatus: 'pending' })), /ยังไม่อนุมัติ/);
  assert.match(billingQuotationError(qt({ approvalStatus: 'not_submitted' })), /ยังไม่อนุมัติ/);
  // ⭐ ใบร่างที่อนุมัติแล้วผ่านได้ — สถานะเอกสารกับสถานะอนุมัติเป็นคนละแกน
  assert.equal(billingQuotationError(qt({ status: 'draft' })), null);
});

test('ใบที่ตายแล้วขอเอกสารไม่ได้ แม้เคยอนุมัติ', () => {
  for (const status of ['rejected', 'cancelled']) {
    assert.match(billingQuotationError(qt({ status })), /ตีกลับหรือยกเลิก/);
  }
  assert.equal(billingQuotationError(qt({ status: 'accepted' })), null);
});

/* ⭐ **ยอดสุทธิศูนย์ = ของจริงของธุรกิจ ไม่ใช่ข้อมูลพัง** (มติผู้ใช้ 2026-08-15:
   *"บางทีตั้งใจให้ actual เป็น 0 เพราะบางทีเราให้ลูกค้าฟรี"*) — ตรวจ prod แล้ว
   ใบยอดสุทธิ 0 ทุกใบมีส่วนลดเท่ากับยอดก่อนภาษีพอดี ⇒ คำนวณถูกต้อง
   ⚠️ กันไว้เหมือนเดิมทั้งสองแบบ แต่ **บอกคนละเหตุผล** — คำที่ชวนให้คนไปตามแก้ของที่
   ถูกอยู่แล้วคือคำที่ผิด */
test('ให้ฟรี กับ ใบยังไม่มียอด — กันเหมือนกันแต่บอกคนละคำ', () => {
  // ลดเต็มจำนวน = ให้ฟรี · ไม่ใช่ความผิดพลาดที่ต้องไปตามแก้
  assert.match(billingQuotationError(qt({ subtotal: 750000, totalAmount: 0 })), /ให้ฟรี/);
  // ไม่มียอดก่อนภาษีเลย = ใบยังไม่ได้ใส่ของ — อันนี้ต้องไปทำต่อจริง
  assert.match(billingQuotationError(qt({ subtotal: 0, totalAmount: 0 })), /ยังไม่มียอด/);
  assert.match(billingQuotationError(qt({ totalAmount: null })), /ยังไม่มียอด/);
});

test('ไม่มีใบเลย = ข้อความ "ต้องเลือก" ไม่ใช่พัง', () => {
  assert.match(billingQuotationError(null), /ต้องเลือกใบเสนอราคา/);
});

test('ลิสต์กรองด้วยด่านตัวเดียวกับ server · ค่าที่เลือกไว้แล้วไม่หาย', () => {
  const rows = [qt(), qt({ id: 'QT-2', approvalStatus: 'pending' })];
  assert.deepEqual(billingQuotationOptions(rows).map((q) => q.id), ['QT-1']);
  // ใบที่สถานะเปลี่ยนระหว่างกรอกต้องยังอยู่ในลิสต์ ไม่งั้นช่องว่างทั้งที่ค่ายังอยู่
  assert.deepEqual(billingQuotationOptions(rows, { keepId: 'QT-2' }).map((q) => q.id), ['QT-1', 'QT-2']);
});

test('เหตุผลที่ซ่อน — นับข้อแรกที่ติดเท่านั้น ผลรวมห้ามเกินจำนวนใบที่ซ่อน', () => {
  const skips = billingQuotationSkips([
    qt(),
    qt({ id: 'A', approvalStatus: 'pending', status: 'cancelled', totalAmount: 0 }),
    qt({ id: 'B', status: 'cancelled' }),
    qt({ id: 'C', subtotal: 30000, totalAmount: 0 }),   // ลดเต็ม = ให้ฟรี
    qt({ id: 'D', subtotal: 0, totalAmount: 0 }),       // ใบยังไม่มีของ
  ]);
  assert.equal(skips.total, 4);
  assert.equal(skips.notApproved + skips.dead + skips.free + skips.noAmount, skips.total);
  assert.deepEqual(skips, { notApproved: 1, dead: 1, free: 1, noAmount: 1, total: 4 });
  /* ⭐ "ให้ฟรี" ต้องอ่านไม่เหมือนความผิดพลาด — ยุบรวมกับ "ยังไม่มียอด" เมื่อไร
     คนอ่านจะนึกว่าระบบพังทั้งกอง ทั้งที่ส่วนใหญ่คือของที่ตั้งใจให้ฟรี */
  const hint = billingQuotationSkipHint(skips);
  assert.match(hint, /ให้ฟรี 1 ใบ/);
  assert.match(hint, /ยังไม่มียอด 1 ใบ/);
  assert.equal(billingQuotationSkipHint(billingQuotationSkips([qt()])), '');
});

test('ยอดที่ขอ: โหมด % คูณจากยอดใบ และไม่ปัดเศษ', () => {
  const out = billAmountFor({ mode: 'percent', percent: 50, baseAmount: 181016.25 });
  assert.equal(out.error, null);
  assert.equal(out.percent, 50);
  // ⭐ เลขที่ทีมส่งกันจริงในแชทคือ 90,508.125 — ปัดที่นี่แปลว่าคำร้องไม่ตรงกับที่คุย
  assert.equal(out.amount, 90508.125);
});

test('ยอดที่ขอ: โหมดจำนวนเงิน คิด % กลับให้', () => {
  const out = billAmountFor({ mode: 'amount', amount: 90508.125, baseAmount: 181016.25 });
  assert.equal(out.error, null);
  assert.equal(out.amount, 90508.125);
  assert.equal(out.percent, 50);
});

test('ยอดที่ขอ: ขอเกินยอดใบไม่ได้ · % นอกช่วงไม่ได้', () => {
  assert.match(billAmountFor({ mode: 'amount', amount: 200000, baseAmount: 181016.25 }).error, /เกินยอด/);
  assert.match(billAmountFor({ mode: 'amount', amount: 0, baseAmount: 100 }).error, /มากกว่า 0/);
  assert.match(billAmountFor({ mode: 'percent', percent: 101, baseAmount: 100 }).error, /0–100/);
  assert.match(billAmountFor({ mode: 'percent', percent: 0, baseAmount: 100 }).error, /0–100/);
});

test('ยอดที่ขอ: ยังกรอกไม่ครบ = ไม่ใช่ error (ห้ามแดงระหว่างพิมพ์)', () => {
  for (const form of [
    { mode: 'percent', percent: '', baseAmount: 100 },
    { mode: 'amount', amount: null, baseAmount: 100 },
  ]) {
    const out = billAmountFor(form);
    assert.equal(out.error, null);
    assert.equal(out.amount, null);
  }
});

test('ยอดที่ขอ: ฐานเป็นศูนย์ตอบด้วยข้อความเดียวกับด่านของใบ', () => {
  assert.match(billAmountFor({ mode: 'percent', percent: 50, baseAmount: 0 }).error, /ไม่มียอดให้วางบิล/);
});

test('ฝั่ง server: ยอดเป็นตัวจริง ฐานมาจากแถวจริง', () => {
  const out = resolveBillAmount({ percent: 50, amount: 90508.125, baseAmount: 181016.25 });
  assert.equal(out.error, null);
  assert.equal(out.amount, 90508.125);
  // ⭐ % ที่ผู้ใช้พิมพ์เองต้องรอด ไม่ใช่ 50.000000000000004 ที่คิดกลับมา
  assert.equal(out.percent, 50);
});

test('ฝั่ง server: % ที่ไม่ตรงกับยอดถูกคิดใหม่ ไม่เชื่อ client', () => {
  // client อ้าง 90% แต่ยอดที่ส่งมาคือครึ่งเดียว — ยอดชนะ
  const out = resolveBillAmount({ percent: 90, amount: 50, baseAmount: 100 });
  assert.equal(out.amount, 50);
  assert.equal(out.percent, 50);
});

test('ฝั่ง server: ด่านตรวจที่ยอด ไม่ใช่ที่ %', () => {
  assert.match(resolveBillAmount({ amount: 0, baseAmount: 100 }).error, /ต้องระบุยอด/);
  assert.match(resolveBillAmount({ amount: null, baseAmount: 100 }).error, /ต้องระบุยอด/);
  assert.match(resolveBillAmount({ amount: 101, baseAmount: 100 }).error, /เกินยอด/);
  assert.match(resolveBillAmount({ amount: 50, baseAmount: 0 }).error, /ไม่มียอดให้วางบิล/);
  // เต็มจำนวนได้ — ขอใบกำกับเต็มยอดเป็นเรื่องปกติ
  assert.equal(resolveBillAmount({ percent: 100, amount: 100, baseAmount: 100 }).percent, 100);
});
