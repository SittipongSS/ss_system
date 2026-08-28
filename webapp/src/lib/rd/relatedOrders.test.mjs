import test from 'node:test';
import assert from 'node:assert/strict';
import { referencedOrderIds, relatedOrderRows } from './relatedOrders.js';

const req = (over) => ({ id: 'DR-1', docNo: 'RQ-1', kind: 'scent_dev', status: 'acknowledged', ...over });

test('เอา id ใบสั่งขายที่ถูกอ้าง — ไม่ซ้ำ และข้ามใบที่ไม่ได้อ้าง', () => {
  const ids = referencedOrderIds([
    req({ salesOrderId: 'SOR-1' }),
    req({ id: 'DR-2', salesOrderId: 'SOR-1' }),
    req({ id: 'DR-3', salesOrderId: null }),
    req({ id: 'DR-4', salesOrderId: 'SOR-2' }),
  ]);
  assert.deepEqual(ids, ['SOR-1', 'SOR-2']);
  assert.deepEqual(referencedOrderIds(), []);
});

test('ใบเดียวถูกอ้างหลายคำร้อง = แถวเดียว คำร้องอยู่ในแถวนั้น', () => {
  const rows = relatedOrderRows({
    requests: [req({ salesOrderId: 'SOR-1' }), req({ id: 'DR-2', docNo: 'RQ-2', salesOrderId: 'SOR-1' })],
    orders: [{ id: 'SOR-1', orderNumber: 'SO-001', orderDate: '2026-08-01' }],
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].requests.map((r) => r.docNo), ['RQ-1', 'RQ-2']);
});

test('🐞 คำร้องที่ชี้ใบซึ่งถูกลบไปแล้ว ต้องไม่กลายเป็นแถวเปล่า', () => {
  const rows = relatedOrderRows({
    requests: [req({ salesOrderId: 'SOR-หาย' })],
    orders: [{ id: 'SOR-1', orderNumber: 'SO-001' }],
  });
  assert.deepEqual(rows, []);
});

test('บรรทัดสินค้าเข้าใบของตัวเอง เรียงตาม sortOrder', () => {
  const rows = relatedOrderRows({
    requests: [req({ salesOrderId: 'SOR-1' })],
    orders: [{ id: 'SOR-1', orderNumber: 'SO-001' }],
    lines: [
      { id: 'L2', salesOrderId: 'SOR-1', fgCode: 'FG-2', sortOrder: 2 },
      { id: 'L1', salesOrderId: 'SOR-1', fgCode: 'FG-1', sortOrder: 1 },
      { id: 'LX', salesOrderId: 'SOR-อื่น', fgCode: 'FG-9', sortOrder: 1 },
    ],
  });
  assert.deepEqual(rows[0].lines.map((l) => l.fgCode), ['FG-1', 'FG-2']);
});

test('ใบใหม่สุดขึ้นก่อน · ใบที่ไม่มีวันที่ไปท้าย ไม่ใช่หายไป', () => {
  const rows = relatedOrderRows({
    requests: [
      req({ salesOrderId: 'A' }), req({ id: 'DR-2', salesOrderId: 'B' }), req({ id: 'DR-3', salesOrderId: 'C' }),
    ],
    orders: [
      { id: 'A', orderDate: '2026-07-01' },
      { id: 'B', orderDate: '2026-08-20' },
      { id: 'C', orderDate: null },
    ],
  });
  assert.deepEqual(rows.map((r) => r.id), ['B', 'A', 'C']);
});
