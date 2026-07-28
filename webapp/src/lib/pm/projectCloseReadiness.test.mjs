import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isInFlightSalesOrder,
  isOpenFiling,
  summarizeProjectCloseReadiness,
} from './projectCloseReadiness.js';

const so = (id, status, extra = {}) => ({ id, orderNumber: `SO-${id}`, status, supersededById: null, ...extra });

test('SO ที่ยังไม่ผ่านอนุมัติถือว่าค้าง — รวม approval_revoked ที่ปลายทางต้องออก Rev.', () => {
  for (const status of ['draft', 'pending_approval', 'rejected', 'approval_revoked']) {
    assert.equal(isInFlightSalesOrder(so('1', status)), true, status);
  }
  assert.equal(isInFlightSalesOrder(so('1', 'approved')), false);
});

test('SO ที่ตายแล้วไม่ใช่งานค้าง — ยกเลิก/ถูกแทนที่ด้วย Rev. ไม่ต้องตามต่อ', () => {
  assert.equal(isInFlightSalesOrder(so('1', 'cancelled')), false);
  assert.equal(isInFlightSalesOrder(so('1', 'draft', { supersededById: '2' })), false);
});

test('ใบยื่นภาษีปิดจริงที่ delivered เท่านั้น — ชำระแล้วแต่ยังไม่ส่งเอกสารยังนับว่าค้าง', () => {
  for (const status of ['draft', 'pending', 'received', 'filing', 'complete', 'rejected']) {
    assert.equal(isOpenFiling({ id: 'TAX-1', status }), true, status);
  }
  assert.equal(isOpenFiling({ id: 'TAX-1', status: 'delivered' }), false);
});

test('สรุปงานค้าง: ตัดหมวดที่เป็นศูนย์ทิ้ง และรวมยอดจากหมวดที่เหลือ', () => {
  const result = summarizeProjectCloseReadiness({
    awaitingSalesOrder: [{ id: 'Q1', quoteNumber: 'QT-2607001-0' }],
    awaitingFiling: [],
    salesOrders: [so('1', 'pending_approval'), so('2', 'approved'), so('3', 'cancelled')],
    filings: [{ id: 'TAX-1', status: 'received' }, { id: 'TAX-2', status: 'delivered' }],
  });
  assert.deepEqual(result.items.map((item) => [item.key, item.count]), [
    ['quotesAwaitingSalesOrder', 1],
    ['salesOrdersInFlight', 1],
    ['filingsOpen', 1],
  ]);
  assert.equal(result.total, 3);
});

test('โครงการที่เอกสารเดินจบหมด = ไม่มีคำเตือน (การ์ดต้องหายไปเลย ไม่ใช่ขึ้นว่า 0)', () => {
  const result = summarizeProjectCloseReadiness({
    awaitingSalesOrder: [],
    awaitingFiling: [],
    salesOrders: [so('1', 'approved')],
    filings: [{ id: 'TAX-1', status: 'delivered' }],
  });
  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
});

test('เรียกโดยไม่ส่งอะไรมาเลยต้องไม่ระเบิด (โครงการที่ยังไม่มีดีล)', () => {
  const result = summarizeProjectCloseReadiness();
  assert.equal(result.total, 0);
});

// ย้ำเจตนา B3 ไว้ในเทสต์: ถ้ามีใครเปลี่ยนตัวนี้เป็นด่านบล็อก เทสต์ต้องแดงก่อน
test('ผลลัพธ์ประกาศตัวเองว่าเป็นคำเตือน ไม่ใช่ด่านบล็อก (มติ B3)', () => {
  assert.equal(summarizeProjectCloseReadiness().blocking, false);
  assert.equal(summarizeProjectCloseReadiness({
    salesOrders: [so('1', 'draft')],
  }).blocking, false);
});
