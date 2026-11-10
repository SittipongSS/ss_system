// ── ยอดจ่ายก่อน VAT บนทะเบียนบัญชี (รื้อรายการ SO + บัญชี PR-1 · มติเจ้าของ 09/11 "ยอดจ่ายสนใจทั้งก่อนและหลัง VAT") ──
// ⭐ ตรึงสามเรื่อง: คิดจากคอลัมน์ของใบ (totalAmount − vatAmount) เป็นสตางค์ · ไม่รู้ = null ไม่ใช่ยอดรวม VAT ·
//   ค่าระดับใบรอดถึงหัวก้อนของ groupLedgerByOrder · และ route เลือก "vatAmount" มาจริง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupLedgerByOrder, ledgerRow } from './paymentLedger.js';

const TODAY = '2026-11-09';
const make = (order = {}) => ledgerRow({
  installment: { id: 'SOI-1', seq: 1, amount: 128400, status: 'confirmed', evidence: [], frozenAt: '2026-10-01T00:00:00Z' },
  order: { id: 'SOR-1', orderNumber: 'SO-26110390-0', status: 'approved', ...order },
  quotation: null,
  customer: { id: 'CUS-1', name: 'บจก. ตัวอย่าง', arCode: 'AR-1' },
  todayIso: TODAY,
});

test('orderNet = ยอดรวม VAT − VAT ของใบ (สตางค์ไม่เพี้ยน)', () => {
  assert.equal(make({ totalAmount: 256800, vatAmount: 16800 }).orderNet, 240000);
  assert.equal(make({ totalAmount: 19634.5, vatAmount: 1284.5 }).orderNet, 18350);
  assert.equal(make({ totalAmount: 0.3, vatAmount: 0.1 }).orderNet, 0.2);
});

test('ยอดใบหรือ VAT ไม่รู้ = null — ไม่ถอยไปโชว์ยอดรวม VAT ในช่องก่อน VAT', () => {
  assert.equal(make({ totalAmount: 256800 }).orderNet, null);
  assert.equal(make({ vatAmount: 16800 }).orderNet, null);
});

test('ยอดรวม/ก่อน VAT รอดถึงหัวก้อนราย SO', () => {
  const [group] = groupLedgerByOrder([make({ totalAmount: 256800, vatAmount: 16800 })]);
  assert.equal(group.orderTotal, 256800);
  assert.equal(group.orderNet, 240000);
});

test('route ทะเบียนบัญชีเลือก "vatAmount" ใน select ของใบ', () => {
  const src = readFileSync(new URL('../../app/api/finance/payments/route.js', import.meta.url), 'utf8');
  assert.match(src, /\/\* money-decider feed \*\/\s*\.select\('[^']*"vatAmount"[^']*'\)/);
});
