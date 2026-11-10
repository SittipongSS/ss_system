import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTALLMENT_CHIP_KINDS, INSTALLMENT_CHIP_LABELS, installmentChipKind, salesOrderMoneyCell } from './salesOrderMoney.js';
import { salesOrderPaymentCell } from './salesOrderPayments.js';

const TODAY = '2026-11-09';
const FROZEN = '2026-10-01T00:00:00Z';
const order = (over = {}) => ({ status: 'approved', totalAmount: 256800, vatAmount: 16800, ...over });
const inst = (over = {}) => ({ id: `I${over.seq || 1}`, seq: 1, status: 'pending', amount: 128400, dueDate: '2026-11-30', frozenAt: FROZEN, ...over });

test('ชนิดชิป: สถานะในฐาน + เลยกำหนด + ตามแผน + จ่ายก่อนอนุมัติ + คืนเงิน', () => {
  assert.equal(installmentChipKind(inst({ status: 'confirmed' }), { todayIso: TODAY }), 'confirmed');
  assert.equal(installmentChipKind(inst({ status: 'reported' }), { todayIso: TODAY }), 'reported');
  assert.equal(installmentChipKind(inst({ status: 'rejected' }), { todayIso: TODAY }), 'rejected');
  assert.equal(installmentChipKind(inst({ dueDate: '2026-11-30' }), { todayIso: TODAY }), 'pending');
  assert.equal(installmentChipKind(inst({ dueDate: '2026-11-08' }), { todayIso: TODAY }), 'overdue');
  // วันครบกำหนด = วันนี้ ยังไม่เลย (ขอบเดียวกับตัวนับ overdue ของ salesOrderPaymentCell)
  assert.equal(installmentChipKind(inst({ dueDate: TODAY }), { todayIso: TODAY }), 'pending');
  // งวดที่รอตรวจ/ตีกลับไม่ขึ้นเลยกำหนด — มีคนลงมือแล้ว
  assert.equal(installmentChipKind(inst({ status: 'reported', dueDate: '2026-10-01' }), { todayIso: TODAY }), 'reported');
  assert.equal(installmentChipKind(inst({ frozenAt: null }), { todayIso: TODAY }), 'plan');
  assert.equal(installmentChipKind(inst({ frozenAt: null, paidOn: '2026-11-01' }), { todayIso: TODAY }), 'prepaid');
  assert.equal(installmentChipKind(inst({ status: 'confirmed', refundedAt: '2026-11-02T00:00:00Z' }), { todayIso: TODAY }), 'refunded');
  // ไม่มีวันนี้ = ไม่ตัดสินเลยกำหนด
  assert.equal(installmentChipKind(inst({ dueDate: '2020-01-01' })), 'pending');
});

test('ทุกชนิดชิปมีคำ — และห้าตัวยืมป้ายกลางของงวด', () => {
  for (const kind of INSTALLMENT_CHIP_KINDS) assert.ok(INSTALLMENT_CHIP_LABELS[kind], kind);
  assert.equal(INSTALLMENT_CHIP_LABELS.confirmed, 'ชำระแล้ว');
  assert.equal(INSTALLMENT_CHIP_LABELS.reported, 'รอบัญชีตรวจ');
});

test('ใบอนุมัติแล้ว: ยอดจ่ายรวม/ก่อน VAT · เก็บแล้วนับเฉพาะที่รับรอง · รอตรวจแยก · ค้าง', () => {
  const cell = salesOrderMoneyCell([
    inst({ seq: 1, status: 'confirmed', amount: 128400, taxInvoiceNo: 'IV6910-0143', dueDate: '2026-10-20' }),
    inst({ seq: 2, status: 'reported', amount: 128400, dueDate: '2026-11-30' }),
  ], order(), { todayIso: TODAY });
  assert.equal(cell.payable, 256800);
  assert.equal(cell.payableNet, 240000);
  assert.equal(cell.collected, 128400);
  assert.equal(cell.reviewing, 128400);
  assert.equal(cell.outstanding, 128400);
  assert.equal(cell.stranded, 0);
  assert.equal(cell.tracked, true);
  assert.deepEqual(cell.installments.map((i) => i.kind), ['confirmed', 'reported']);
  assert.equal(cell.installments[0].taxInvoiceNo, 'IV6910-0143');
  assert.equal(cell.next, null);
});

test('งวดถัดไป: เลยกำหนดเก่าสุดมาก่อน (บอกจำนวนวัน) · ไม่มีก็งวดรอชำระที่ใกล้สุด', () => {
  const overdue = salesOrderMoneyCell([
    inst({ seq: 1, dueDate: '2026-10-28', amount: 51360 }),
    inst({ seq: 2, dueDate: '2026-12-28', amount: 51360 }),
  ], order({ totalAmount: 102720, vatAmount: 6720 }), { todayIso: TODAY });
  assert.deepEqual(overdue.next, { seq: 1, dueDate: '2026-10-28', overdueDays: 12 });
  assert.deepEqual(overdue.overdue, { count: 1, amount: 51360 });

  const upcoming = salesOrderMoneyCell([
    inst({ seq: 1, status: 'confirmed' }),
    inst({ seq: 2, dueDate: '2026-11-30' }),
  ], order(), { todayIso: TODAY });
  assert.deepEqual(upcoming.next, { seq: 2, dueDate: '2026-11-30' });
});

test('งวดเรียงตาม seq ไม่ว่าฐานส่งมาลำดับไหน', () => {
  const cell = salesOrderMoneyCell([inst({ seq: 3 }), inst({ seq: 1 }), inst({ seq: 2 })], order(), { todayIso: TODAY });
  assert.deepEqual(cell.installments.map((i) => i.seq), [1, 2, 3]);
});

test('ใบยกเลิก: เงินที่ยังอยู่ = เงินค้าง ไม่ใช่เก็บแล้ว · งวดโมฆะไม่ขึ้นชิป · ไม่มีเงินเหลือ = null', () => {
  const cancelled = order({ status: 'cancelled', totalAmount: 32100, vatAmount: 2100 });
  const cell = salesOrderMoneyCell([
    inst({ seq: 1, status: 'confirmed', amount: 32100 }),
    inst({ seq: 2, status: 'pending', amount: 0 }),
  ], cancelled, { todayIso: TODAY });
  assert.equal(cell.stranded, 32100);
  assert.equal(cell.collected, 0);
  assert.equal(cell.outstanding, null);
  assert.deepEqual(cell.installments.map((i) => i.seq), [1]);

  assert.equal(salesOrderMoneyCell([inst({ status: 'pending' }), inst({ seq: 2, status: 'rejected' })], cancelled, { todayIso: TODAY }), null);
  // คืนเงินแล้วไม่ใช่เงินค้าง
  const refunded = salesOrderMoneyCell([inst({ status: 'confirmed', amount: 32100, refundedAt: '2026-11-01T00:00:00Z' })], cancelled, { todayIso: TODAY });
  assert.equal(refunded.stranded, 0);
  assert.equal(refunded.installments[0].kind, 'refunded');
});

test('ใบออก Rev. ทับ และใบยอด 0 = ไม่มีก้อนเงิน (กติกาเดียวกับคอลัมน์งวดเดิม)', () => {
  assert.equal(salesOrderMoneyCell([inst()], order({ status: 'revised' }), { todayIso: TODAY }), null);
  assert.equal(salesOrderMoneyCell([inst()], order({ totalAmount: 0, vatAmount: 0 }), { todayIso: TODAY }), null);
  assert.equal(salesOrderPaymentCell([inst()], null, TODAY, 0, 'approved'), null);
});

test('ใบยังไม่อนุมัติที่ยังไม่มีแถวงวด: ชิปตามแผน QT แบ่งยอดด้วยตัวคำนวณเดียวกับตอนสร้างงวด', () => {
  const plan = { type: 'installment', installments: [{ label: 'มัดจำ', percent: 50 }, { label: 'ส่งมอบ', percent: 50 }] };
  const cell = salesOrderMoneyCell([], order({ status: 'pending_approval', totalAmount: 45475, vatAmount: 2975 }), { plan, todayIso: TODAY });
  assert.equal(cell.tracked, false);
  assert.equal(cell.outstanding, null);
  assert.deepEqual(cell.installments.map((i) => [i.seq, i.kind, i.amount]), [[1, 'plan', 22737.5], [2, 'plan', 22737.5]]);
  assert.equal(cell.payableNet, 42500);
  // ไม่มีแผนเลย = จ่ายเต็มจำนวนงวดเดียว (paymentScheduleRows)
  const full = salesOrderMoneyCell([], order({ status: 'draft' }), { plan: null, todayIso: TODAY });
  assert.deepEqual(full.installments.map((i) => [i.kind, i.amount]), [['plan', 256800]]);
});

test('ใบยังไม่อนุมัติที่มีงวดร่างแล้ว: ร่าง = ตามแผน · จ่ายมาก่อน = prepaid · ยังไม่มีหนี้ค้าง', () => {
  const cell = salesOrderMoneyCell([
    inst({ seq: 1, frozenAt: null, paidOn: '2026-11-05' }),
    inst({ seq: 2, frozenAt: null }),
  ], order({ status: 'pending_approval' }), { todayIso: TODAY });
  assert.deepEqual(cell.installments.map((i) => i.kind), ['prepaid', 'plan']);
  assert.equal(cell.collected, 0);
  assert.equal(cell.outstanding, null);
});

test('ยอดรวมไม่เพี้ยนจากทศนิยม (บวกเป็นสตางค์)', () => {
  const cell = salesOrderMoneyCell(
    Array.from({ length: 3 }, (_, i) => inst({ seq: i + 1, status: 'confirmed', amount: 0.1 + 0.2 })),
    order({ totalAmount: 0.9, vatAmount: 0 }),
    { todayIso: TODAY },
  );
  assert.equal(cell.collected, 0.9);
  assert.equal(cell.outstanding, 0);
});

test('งวดยกมาของใบย้อนหลังติดธง opening ให้จอบอก', () => {
  const cell = salesOrderMoneyCell([inst({ status: 'confirmed', kind: 'opening' })], order(), { todayIso: TODAY });
  assert.equal(cell.installments[0].opening, true);
});

test('route รายการ SO: ส่งก้อน money ทุกแถว และ select งวดชุดแรกพกช่องที่ก้อนเงินต้องใช้', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../app/api/sales-planning/sales-orders/route.js', import.meta.url), 'utf8');
  assert.match(src, /money: salesOrderMoneyCell\(\s*installmentsByOrder\.get\(row\.id\) \|\| \[\],\s*row,/);
  const loader = src.slice(src.indexOf('async function loadListInstallments'));
  const selects = [...loader.matchAll(/\.from\('sales_order_installments'\)\s*\.select\('([^']+)'\)/g)].map((m) => m[1]);
  assert.equal(selects.length, 3, 'สามชุด: ปัจจุบัน · ก่อน 0412 · ก่อน 0378');
  // ชุดถอยสองชุดไม่รันบน production แล้ว (0378/0412 รันครบ) — ตรึงเฉพาะชุดแรก
  for (const col of ['id', 'seq', 'amount', '"paidOn"', '"frozenAt"', '"updatedAt"', '"dueDate"', '"taxInvoiceNo"', '"refundedAt"', 'kind']) {
    assert.ok(selects[0].includes(col), `select งวดชุดแรกขาด ${col}: ${selects[0]}`);
  }
});

test('ก้อนเงินจากแถวทะเบียนบัญชี: คิดจากชุดก่อนกรองทั้งใบ · VAT = orderTotal − orderNet · เอาเฉพาะใบที่ขอ', async () => {
  const { ledgerOrderMoney } = await import('./salesOrderMoney.js');
  const base = { orderStatus: 'approved', orderTotal: 256800, orderNet: 240000 };
  const all = [
    { ...base, id: 'I1', orderId: 'A', seq: 1, status: 'confirmed', amount: 128400, dueDate: '2026-10-20', taxInvoiceNo: 'IV1' },
    { ...base, id: 'I2', orderId: 'A', seq: 2, status: 'reported', amount: 128400, dueDate: '2026-11-30' },
    { ...base, id: 'I3', orderId: 'B', seq: 1, status: 'pending', amount: 10, dueDate: '2026-11-01', orderTotal: 10, orderNet: 10 },
  ];
  const money = ledgerOrderMoney(all, { todayIso: TODAY, orderIds: ['A'] });
  assert.deepEqual(Object.keys(money), ['A']);
  assert.equal(money.A.payableNet, 240000);
  assert.equal(money.A.collected, 128400);
  assert.equal(money.A.reviewing, 128400);
  assert.deepEqual(money.A.installments.map((i) => i.kind), ['confirmed', 'reported'], 'แถวทะเบียนตรึงแล้วทุกแถว — ไม่ใช่ "ตามแผน"');
  const everything = ledgerOrderMoney(all, { todayIso: TODAY });
  assert.equal(everything.B.installments[0].kind, 'overdue');
  assert.deepEqual(ledgerOrderMoney([{ ...all[0], orderTotal: null }], { todayIso: TODAY }), {}, 'ยอดใบไม่รู้ = ไม่มีก้อน');
});

test('route ทะเบียนบัญชีส่ง orderMoney จากชุดก่อนกรอง (all) ไม่ใช่ชุดที่กรองแล้ว', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../app/api/finance/payments/route.js', import.meta.url), 'utf8');
  assert.match(src, /const orderMoney = ledgerOrderMoney\(all, \{ todayIso, orderIds: \[\.\.\.new Set\(filtered\.map\(\(r\) => r\.orderId\)\)\] \}\);/);
  assert.match(src, /rows: filtered,\s*orderMoney,/);
});
