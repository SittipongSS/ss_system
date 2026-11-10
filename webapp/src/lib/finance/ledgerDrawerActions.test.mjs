import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEDGER_DRAWER_ACTION_LABELS, ledgerDrawerActions } from './ledgerDrawerActions.js';

const base = { id: 'SOI-1', orderId: 'SOR-1', seq: 1, amount: 100, origin: 'pipeline', orderStatus: 'approved', quotationStatus: 'accepted', quoteNumber: 'QT-1' };
const kinds = (row) => ledgerDrawerActions(row).map((a) => a.action);

test('งวดรอบัญชีตรวจ: รับรอง + ตีกลับ (+ ใบกำกับ ถ้ายังไม่ออก — ชุดเดียวกับคิว "ยังไม่ออกใบกำกับ")', () => {
  assert.deepEqual(kinds({ ...base, status: 'reported' }), ['confirm', 'reject', 'tax-invoice']);
  assert.deepEqual(kinds({ ...base, status: 'reported', taxInvoiceNo: 'IV-1' }), ['confirm', 'reject']);
  assert.equal(ledgerDrawerActions({ ...base, status: 'reported' })[0].lock, null);
});

test('งวดรับรองแล้ว: ใบกำกับ (ถ้ายังไม่ออก) · ถอนคำรับรองเสมอ · ใบยกเลิกที่มีเงินค้าง = คืนเงินด้วย', () => {
  assert.deepEqual(kinds({ ...base, status: 'confirmed' }), ['tax-invoice', 'unconfirm']);
  assert.deepEqual(kinds({ ...base, status: 'confirmed', taxInvoiceNo: 'IV-1' }), ['unconfirm']);
  assert.deepEqual(kinds({ ...base, status: 'confirmed', taxInvoiceNo: 'IV-1', orderStatus: 'cancelled', stranded: true }), ['refund', 'unconfirm']);
});

test('งวดยกมาไม่ต้องออกใบกำกับในระบบ (กติกาเดียวกับคิวใบกำกับ)', () => {
  assert.deepEqual(kinds({ ...base, status: 'confirmed', kind: 'opening' }), ['unconfirm']);
});

test('ไม่มีงานของบัญชี: รอชำระ · ตีกลับแล้ว · คืนเงินแล้ว', () => {
  assert.deepEqual(kinds({ ...base, status: 'pending' }), []);
  assert.deepEqual(kinds({ ...base, status: 'rejected' }), []);
  assert.deepEqual(kinds({ ...base, status: 'confirmed', refunded: true }), []);
});

test('ปุ่มกดไม่ได้ยังโชว์พร้อมเหตุ — ใบรายงวดที่งวดยังไม่นับ Actual', () => {
  const [confirm, reject] = ledgerDrawerActions({ ...base, status: 'reported', taxInvoiceNo: 'IV-1', actualMode: 'installment', actualAwaitingApproval: true, actualStatus: 'submitted' });
  assert.equal(confirm.action, 'confirm');
  assert.ok(confirm.lock, 'รับรองติดด่านนับ Actual');
  assert.equal(reject.lock, null, 'ตีกลับสลิปผิดต้องถอยได้เสมอ');
});

test('คำของปุ่มมีครบทุกคำสั่ง · หน้าบัญชีเรียกตัวตัดสินนี้ (ไม่ตัดสินเอง)', () => {
  for (const action of ['confirm', 'reject', 'tax-invoice', 'refund', 'unconfirm']) assert.ok(LEDGER_DRAWER_ACTION_LABELS[action]);
  const page = readFileSync(new URL('../../app/finance/payments/page.js', import.meta.url), 'utf8');
  assert.match(page, /ledgerDrawerActions\(row\)/);
  assert.match(page, /runAction\(liveRow\(unconfirmFor\.row\), "unconfirm", \{ reason: unconfirmFor\.reason \}\)/);
});
