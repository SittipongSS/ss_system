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

test('ยอดศูนย์บอกตรง ๆ ไม่ใช่ปล่อยให้กรอก 50% แล้วได้ 0 บาท', () => {
  assert.match(billingQuotationError(qt({ totalAmount: 0 })), /ยอดเป็นศูนย์/);
  assert.match(billingQuotationError(qt({ totalAmount: null })), /ยอดเป็นศูนย์/);
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
    qt({ id: 'C', totalAmount: 0 }),
  ]);
  assert.equal(skips.total, 3);
  assert.equal(skips.notApproved + skips.dead + skips.zeroAmount, skips.total);
  assert.deepEqual(skips, { notApproved: 1, dead: 1, zeroAmount: 1, total: 3 });
  assert.match(billingQuotationSkipHint(skips), /ยังไม่อนุมัติ 1 ใบ/);
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
  assert.match(billAmountFor({ mode: 'percent', percent: 50, baseAmount: 0 }).error, /ยอดเป็นศูนย์/);
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
  assert.match(resolveBillAmount({ amount: 50, baseAmount: 0 }).error, /ยอดเป็นศูนย์/);
  // เต็มจำนวนได้ — ขอใบกำกับเต็มยอดเป็นเรื่องปกติ
  assert.equal(resolveBillAmount({ percent: 100, amount: 100, baseAmount: 100 }).percent, 100);
});
