// Tests สูตรเงินใบเสนอราคา FM-SA-01 (เฟส D): ส่วนลดรายบรรทัด + ส่วนลดท้ายใบ + VAT.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { discountAmountOf, quoteLineNet, quoteTotals } from './salesPlanning';

test('discountAmountOf: percent/amount + เพดานไม่เกินฐาน', () => {
  assert.equal(discountAmountOf(1000, 'percent', 10), 100);
  assert.equal(discountAmountOf(1000, 'amount', 250), 250);
  assert.equal(discountAmountOf(1000, 'amount', 5000), 1000); // ไม่เกินฐาน
  assert.equal(discountAmountOf(1000, 'percent', 150), 1000); // % เกิน 100 → เต็มฐาน
  assert.equal(discountAmountOf(1000, null, 50), 0);          // ไม่ระบุชนิด = ไม่ลด
});

test('quoteLineNet: qty×ราคา − ส่วนลดบรรทัด', () => {
  const r = quoteLineNet({ qty: 10, unitPrice: 100, discountType: 'percent', discountValue: 5 });
  assert.equal(r.gross, 1000);
  assert.equal(r.discountAmount, 50);
  assert.equal(r.lineTotal, 950);
  assert.equal(quoteLineNet({ qty: 2, unitPrice: 300 }).lineTotal, 600); // ไม่มีส่วนลด
});

test('quoteTotals: ลดรายบรรทัด → ลดท้ายใบ → VAT 7% จากฐานหลังลด', () => {
  const lines = [
    { qty: 10, unitPrice: 100, discountType: 'percent', discountValue: 10 }, // 900
    { qty: 1, unitPrice: 600, discountType: 'amount', discountValue: 100 },  // 500
  ];
  const t = quoteTotals(lines, { discountType: 'amount', discountValue: 400, vatRate: 7 });
  assert.equal(t.subtotal, 1400);
  assert.equal(t.discountAmount, 400);
  assert.equal(t.vatAmount, 70);      // (1400−400)×7%
  assert.equal(t.totalAmount, 1070);
});

test('quoteTotals default: ไม่มีส่วนลดท้ายใบ + vatRate 0 (ราคารวม VAT แล้ว) — เข้ากับ caller เดิม', () => {
  const t = quoteTotals([{ qty: 2, unitPrice: 500 }]);
  assert.equal(t.subtotal, 1000);
  assert.equal(t.discountAmount, 0);
  assert.equal(t.vatAmount, 0);
  assert.equal(t.totalAmount, 1000);
});
