// ── ตัวคิดเงินตอนถอดจุดออกจากใบย้อนหลัง (มติข้อ 23 ส่วน ข2 · mig 0366) ─────────
//
// ⭐ เลขที่โมดัลโชว์ต้องเป็นเลขที่ฐานจะเขียนจริง — คนกดโดยเชื่อเลขหนึ่งแล้วได้อีกเลขหนึ่ง
//   คือความเสียหายที่ย้อนกลับไม่ได้ (ลบบรรทัดแล้วลบเลย) ⇒ เทสต์นี้เรียกฟังก์ชันจริงทุกข้อ
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REMOVE_REASON_MAX, REMOVE_REASON_MIN, amountsAfterRemoval, installmentsTotal,
  removalBlock, removalPreview, removeReasonError, round2,
} from './siteLineRemoval.js';

const AT = '2026-09-18T03:00:00.000Z';
/* ใบตัวอย่างจากม็อก: 2 จุด × 30,160 (รวม VAT 7%) ⇒ subtotal 56,373.83 · vat 3,946.17 · total 60,320 */
const order = (extra = {}) => ({
  id: 'SOR-H1', origin: 'historical', status: 'approved',
  subtotal: 56373.83, discountAmount: 0, vatAmount: 3946.17, totalAmount: 60320,
  ...extra,
});
const flagged = (extra = {}) => ({
  id: 'SOL-2', installationPoint: 'Empire Tower โถงลิฟต์ ชั้น 3', lineTotal: 28186.92,
  siteNotFoundAt: AT, siteNotFoundById: 'U-TS', siteNotFoundReason: 'branch_closed',
  ...extra,
});
const both = (line) => [{ id: 'SOL-1', lineTotal: 28186.91 }, line];

test('ยอดใหม่ — VAT เดินตามสัดส่วนเดิม และยอดรวมคิดจาก subtotal + vat', () => {
  const a = amountsAfterRemoval(order(), flagged());
  assert.equal(a.subtotal, 28186.91);
  assert.equal(a.vat, 1973.08);
  assert.equal(a.total, round2(28186.91 + 1973.08));
  // สูตรเดียวกับทุกตัวเขียน SO — actual = total - vat
  assert.equal(a.actual, 28186.91);
  // ยอดเดิมติดมาด้วยเสมอ โมดัลจะได้วาด "เดิม → ใหม่" โดยไม่ต้องคิดเอง
  assert.equal(a.totalBefore, 60320);
});

test('ใบ VAT 0 — ยอดใหม่ไม่งอก VAT ขึ้นมาเอง', () => {
  const a = amountsAfterRemoval(order({ subtotal: 200, vatAmount: 0, totalAmount: 200 }),
    { lineTotal: 120 });
  assert.equal(a.vat, 0);
  assert.equal(a.total, 80);
});

test('🪤 ใบ subtotal 0 (ทุกบรรทัดยอด 0) — หารศูนย์ไม่ได้ ต้องตอบ 0 ไม่ใช่ NaN', () => {
  const a = amountsAfterRemoval(order({ subtotal: 0, vatAmount: 0, totalAmount: 0 }), { lineTotal: 0 });
  assert.equal(a.subtotal, 0);
  assert.equal(a.vat, 0);
  assert.equal(a.total, 0);
  assert.ok(Number.isFinite(a.actual));
});

test('ยอดบรรทัดที่เพี้ยนจนเกิน subtotal ไม่ทำให้ยอดติดลบ', () => {
  const a = amountsAfterRemoval(order({ subtotal: 100, vatAmount: 7, totalAmount: 107 }),
    { lineTotal: 999 });
  assert.equal(a.subtotal, 0);
  assert.equal(a.total, 0);
});

test('เหตุผล 10–500 ตัวอักษร · นับแบบ code point', () => {
  assert.ok(removeReasonError(''));
  assert.ok(removeReasonError('สั้นไป'));
  assert.equal(removeReasonError('สาขานี้ปิดถาวรตั้งแต่ปีที่แล้ว'), null);
  assert.equal(removeReasonError('ก'.repeat(REMOVE_REASON_MAX)), null);
  assert.ok(removeReasonError('ก'.repeat(REMOVE_REASON_MAX + 1)));
  assert.equal(removeReasonError('🙂'.repeat(REMOVE_REASON_MIN)), null, 'อีโมจิหนึ่งตัวนับหนึ่ง');
});

test('ผลรวมงวดนับทุกสถานะ รวมงวดที่บัญชีตีกลับ', () => {
  const rows = [
    { amount: 10000, status: 'confirmed' },
    { amount: 5000, status: 'rejected' },
    { amount: 2500, status: 'pending' },
  ];
  assert.equal(installmentsTotal(rows), 17500);
  assert.equal(installmentsTotal([]), 0);
  assert.equal(installmentsTotal(), 0);
});

test('🔴 ด่านครบและเรียงตรงกับ RPC — แต่ละข้อบอกเหตุคนละข้อความ', () => {
  const line = flagged();
  const lines = both(line);
  // ผ่านทุกด่าน
  assert.equal(removalBlock({ order: order(), line, lines, installments: [] }), null);

  assert.match(removalBlock({ order: order({ origin: 'pipeline' }), line, lines }), /ใบสั่งขายย้อนหลัง/);
  assert.match(removalBlock({ order: order({ status: 'cancelled' }), line, lines }), /ยกเลิก/);
  assert.match(removalBlock({ order: order({ discountAmount: 500 }), line, lines }), /ส่วนลดหัวใบ/);
  assert.match(removalBlock({ order: order(), line: { ...line, siteNotFoundAt: null }, lines }), /ยังไม่ถูกแจ้ง/);
  assert.match(removalBlock({ order: order(), line: { ...line, siteClosedAt: AT }, lines }), /ตัดสินไปแล้ว/);
  assert.match(removalBlock({ order: order(), line, lines: [line] }), /เหลือจุดเดียว/);
});

test('🔴 งวดที่คีย์ไว้เกินยอดใหม่ = ถอดไม่ได้ (เกณฑ์เดียวกับ append_historical_installments)', () => {
  const line = flagged();
  const lines = both(line);
  // ยอดใหม่ 30,159.99 — งวด 40,000 เกิน
  assert.match(
    removalBlock({ order: order(), line, lines, installments: [{ amount: 40000 }] }),
    /เกินยอดใบใหม่/,
  );
  // เท่ากับยอดใหม่พอดี = ผ่าน (เผื่อ 0.01 เหมือน SQL)
  const { total } = amountsAfterRemoval(order(), line);
  assert.equal(removalBlock({ order: order(), line, lines, installments: [{ amount: total }] }), null);
});

test('🔴 ถอดแล้วเหลือยอด 0 ต้องยกเว้นด่านเงินไว้ก่อน — ไม่งั้นนัดบริการติดด่านถาวร', () => {
  const zero = order({ subtotal: 100, vatAmount: 0, totalAmount: 100 });
  const line = flagged({ lineTotal: 100 });
  const lines = both(line);
  assert.match(removalBlock({ order: zero, line, lines }), /ยกเว้นด่านเงิน/);
  assert.equal(removalBlock({ order: { ...zero, paymentGateExemptAt: AT }, line, lines }), null);
});

test('ก้อนพรีวิวของโมดัล — เดิม/ใหม่/งวด/จำนวนบรรทัดที่เหลือ ครบในครั้งเดียว', () => {
  const line = flagged();
  const p = removalPreview({ order: order(), line, lines: both(line), installments: [{ amount: 10000 }] });
  assert.equal(p.totalBefore, 60320);
  assert.equal(p.installmentsTotal, 10000);
  assert.equal(p.installmentsCount, 1);
  assert.equal(p.remainingAfterInstallments, round2(p.total - 10000));
  assert.equal(p.linesLeft, 1);
  assert.equal(p.block, null);
});
