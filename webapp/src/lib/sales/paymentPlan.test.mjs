// Tests เงื่อนไขงวดชำระใบเสนอราคา (Q1). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import {
  MAX_INSTALLMENTS,
  evenPercents, computeInstallments, paymentScheduleRows, validatePaymentPlan, normalizePaymentPlan,
} from './paymentPlan.js';

test('evenPercents: รวมได้ 100 พอดี (เศษไปงวดสุดท้าย)', () => {
  assert.deepEqual(evenPercents(2), [50, 50]);
  assert.equal(evenPercents(3).reduce((a, b) => a + b, 0), 100);
  assert.equal(evenPercents(6).reduce((a, b) => a + b, 0), 100);
  // เพดาน 12 (มติผู้ใช้ 2026-08-17) — 100/12 ลงตัวไม่ได้ เศษต้องไปกองงวดสุดท้าย
  assert.equal(evenPercents(12).reduce((a, b) => a + b, 0), 100);
  assert.equal(evenPercents(1).length, 2); // บังคับขั้นต่ำ 2
  assert.equal(evenPercents(99).length, MAX_INSTALLMENTS); // เพดาน
});

test('computeInstallments: ยอดรวมทุกงวด = total พอดี (งวดท้ายซับเศษ)', () => {
  const rows = computeInstallments(1000, [{ percent: 30 }, { percent: 30 }, { percent: 40 }]);
  assert.deepEqual(rows.map((r) => r.amount), [300, 300, 400]);
  assert.equal(rows.reduce((s, r) => s + r.amount, 0), 1000);
  // เศษปัด: 3 งวดเท่ากันของ 100 → 33.33/33.33/33.34
  const r2 = computeInstallments(100, evenPercents(3).map((p) => ({ percent: p })));
  assert.equal(r2.reduce((s, r) => s + r.amount, 0), 100);
});

test('validatePaymentPlan: full ผ่านเสมอ / installment ต้องรวม 100 + 1–12 งวด', () => {
  assert.equal(validatePaymentPlan(null).ok, true);
  assert.equal(validatePaymentPlan({ type: 'full' }).ok, true);
  assert.equal(validatePaymentPlan({ type: 'installment', installments: [{ percent: 50 }, { percent: 50 }] }).ok, true);
  assert.equal(validatePaymentPlan({ type: 'installment', installments: [{ percent: 50 }, { percent: 40 }] }).ok, false); // รวม 90
  // ยอมรับข้อมูลเดิมที่เก็บ 1 งวด 100%
  assert.equal(validatePaymentPlan({ type: 'installment', installments: [{ percent: 100 }] }).ok, true);
  assert.equal(validatePaymentPlan({ type: 'installment', installments: [] }).ok, false); // ไม่มีงวดเลย
  assert.equal(validatePaymentPlan({ type: 'installment', installments: [{ percent: -10 }, { percent: 110 }] }).ok, false); // ติดลบ
  // เพดาน 12 งวด: ครบ 12 ต้องผ่าน · เกินไปหนึ่งต้องตก
  const evenRows = (n) => evenPercents(n).map((percent) => ({ percent }));
  assert.equal(validatePaymentPlan({ type: 'installment', installments: evenRows(12) }).ok, true);
  assert.equal(validatePaymentPlan({
    type: 'installment',
    installments: [...evenRows(12), { percent: 0 }],
  }).ok, false);
  assert.equal(validatePaymentPlan({ type: 'weird' }).ok, false);
});

test('normalizePaymentPlan: เติมยอด+label default, full → {type:full}', () => {
  assert.deepEqual(normalizePaymentPlan({ type: 'full' }), { type: 'full' });
  assert.deepEqual(normalizePaymentPlan(null), { type: 'full' });
  const p = normalizePaymentPlan({ type: 'installment', installments: [{ percent: 50, label: 'มัดจำ' }, { percent: 50 }] }, 2000);
  assert.equal(p.type, 'installment');
  assert.equal(p.installments.length, 2);
  assert.equal(p.installments[0].amount, 1000);
  assert.equal(p.installments[0].label, 'มัดจำ');
  assert.equal(p.installments[1].label, 'งวดที่ 2'); // default label
});

test('normalizePaymentPlan: preserves a trimmed payment method', () => {
  assert.deepEqual(normalizePaymentPlan({ type: 'full', paymentMethod: ' โอนเงิน ' }), { type: 'full', paymentMethod: 'โอนเงิน' });
  const plan = normalizePaymentPlan({
    type: 'installment',
    paymentMethod: 'เช็ค',
    installments: [{ percent: 50 }, { percent: 50 }],
  }, 1000);
  assert.equal(plan.paymentMethod, 'เช็ค');
});

test('paymentScheduleRows: ปิดแบ่งงวดแสดง 1 แถว 100% และเปิดใช้แถวจริง', () => {
  assert.deepEqual(paymentScheduleRows({ type: 'full' }), [
    { label: 'ชำระเต็มจำนวน', percent: 100, note: '' },
  ]);
  assert.deepEqual(paymentScheduleRows(null), [
    { label: 'ชำระเต็มจำนวน', percent: 100, note: '' },
  ]);
  const installments = [{ label: 'มัดจำ', percent: 50 }, { label: 'งวดสุดท้าย', percent: 50 }];
  assert.equal(paymentScheduleRows({ type: 'installment', installments }), installments);
});
