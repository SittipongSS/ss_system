// Tests เงื่อนไขงวดชำระใบเสนอราคา (Q1). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import {
  MAX_INSTALLMENTS,
  evenPercents, computeInstallments, paymentScheduleRows, validatePaymentPlan, normalizePaymentPlan, planInstallmentAmounts,
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

/* 🐞 12/11/2026 SO-26110406-0 — 12 งวดของ ฿44,940 ได้ ฿3,743.50 × 11 + ฿3,761.50 (คิดจาก 8.33%) แทน ฿3,745.00 เท่ากัน
   ⇒ แผนที่ % ตรง evenPercents(n) และ n หาร 100.00% ไม่ลงตัว = แบ่งยอดเงินเท่ากัน (ปัดลงรายสตางค์ งวดสุดท้ายรับเศษ) */
test('🔴 computeInstallments: เกลี่ยเท่ากัน 12 งวด = ยอดเท่ากันทุกงวด ไม่ใช่ยอดจาก 8.33%', () => {
  const rows = computeInstallments(44940, evenPercents(12).map((percent) => ({ percent })));
  assert.deepEqual(rows.map((r) => r.amount), Array(12).fill(3745));
  // ใบจริงอีกสองแบบที่เพี้ยนบน prod (3 · 9 งวด) — หารลงตัวต้องได้เท่ากันทุกงวด
  assert.deepEqual(computeInstallments(41409, evenPercents(3).map((percent) => ({ percent }))).map((r) => r.amount), [13803, 13803, 13803]);
  assert.deepEqual(computeInstallments(124227, evenPercents(9).map((percent) => ({ percent }))).map((r) => r.amount), Array(9).fill(13803));
  // หารไม่ลงตัว: ปัดลงรายสตางค์ เศษไปงวดสุดท้าย · Σ = ยอดใบพอดี
  const odd = computeInstallments(46224.01, evenPercents(12).map((percent) => ({ percent })));
  assert.deepEqual(odd.slice(0, 11).map((r) => r.amount), Array(11).fill(3852));
  assert.equal(odd[11].amount, 3852.01);
  assert.equal(Math.round(odd.reduce((s, r) => s + r.amount, 0) * 100), 4622401);
  // ป้าย/% ของแถวคงเดิม
  assert.equal(rows[0].percent, 8.33);
  assert.equal(rows[11].percent, 8.37);
});

test('computeInstallments: % ที่ลงตัว หรือที่คนพิมพ์เอง ยังคิดจาก % ตามเดิม', () => {
  // 4 งวด 25% ลงตัว — ทางเดิม (ปัดครึ่งขึ้น) ไม่ใช่ทางเกลี่ยเงิน
  assert.deepEqual(computeInstallments(0.03, evenPercents(2).map((percent) => ({ percent }))).map((r) => r.amount), [0.02, 0.01]);
  // คนพิมพ์ % เองที่ไม่ตรง evenPercents ทุกแถว — ไม่เดาเจตนา
  const manual = computeInstallments(44940, [{ percent: 8.34 }, ...Array(10).fill({ percent: 8.33 }), { percent: 8.36 }]);
  assert.equal(manual[0].amount, 3748); // 44,940 × 8.34% = 3,747.996
  assert.equal(manual[1].amount, 3743.5);
  // มัดจำ + งวดเท่ากัน ไม่เข้าข่าย (% ไม่ตรงชุดเกลี่ย)
  const deposit = computeInstallments(1000, [{ percent: 50 }, { percent: 16.66 }, { percent: 16.66 }, { percent: 16.68 }]);
  assert.deepEqual(deposit.map((r) => r.amount), [500, 166.6, 166.6, 166.8]);
});

test('normalizePaymentPlan: เกลี่ยเท่ากันเก็บยอดเท่ากันลงแผน (ตัวที่พิมพ์ลงใบ)', () => {
  const plan = normalizePaymentPlan({ type: 'installment', installments: evenPercents(12).map((percent) => ({ percent })) }, 44940);
  assert.deepEqual(plan.installments.map((r) => r.amount), Array(12).fill(3745));
});

test('🔴 planInstallmentAmounts: แผนที่บันทึกแล้วยึดยอดที่เก็บไว้ — ใบเดิมไม่ขยับตามกติกาใหม่', () => {
  // แผนของ QT-26110600-0 ตามที่อยู่ในฐาน (บันทึกก่อนกติกาเกลี่ยเท่ากัน)
  const legacy = {
    type: 'installment',
    installments: [
      ...evenPercents(12).slice(0, 11).map((percent, i) => ({ no: i + 1, label: `งวด ${i + 1}`, percent, amount: 3743.5 })),
      { no: 12, label: 'งวด 12', percent: 8.37, amount: 3761.5 },
    ],
  };
  const rows = planInstallmentAmounts(legacy, 44940);
  assert.deepEqual(rows.map((r) => r.amount), [...Array(11).fill(3743.5), 3761.5]);
  assert.equal(rows[0].label, 'งวด 1');
  // ยอดใบไม่ตรงกับ Σ ที่เก็บไว้ (ยอดใบเปลี่ยน แผนยังไม่ถูกบันทึกใหม่) = คิดใหม่
  assert.deepEqual(planInstallmentAmounts(legacy, 44940.12).map((r) => r.amount).slice(0, 2), [3745.01, 3745.01]);
  // แถวไหนไม่มียอด = คิดใหม่ทั้งชุด
  const missing = { type: 'installment', installments: [{ percent: 50, amount: 600 }, { percent: 50 }] };
  assert.deepEqual(planInstallmentAmounts(missing, 1000).map((r) => r.amount), [500, 500]);
  // เต็มจำนวน = แถวเดียวเท่ายอดใบ
  assert.deepEqual(planInstallmentAmounts({ type: 'full' }, 1234.5).map((r) => r.amount), [1234.5]);
  assert.deepEqual(planInstallmentAmounts(null, 99).map((r) => r.amount), [99]);
});
