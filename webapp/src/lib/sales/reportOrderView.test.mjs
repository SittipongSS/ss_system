import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDER_SORT_DIR,
  filterOrders,
  financeStateOf,
  groupOrders,
  matchesQuery,
  sortOrders,
} from './reportOrderView.js';

const o = (over) => ({
  orderNumber: 'SO-1', quoteNumber: 'QT-1', customerId: 'AR-1', customerName: 'ลูกค้า ก',
  ownerId: 'u1', ownerName: 'สมชาย', team: 'KA', month: '2026-08', amount: 100,
  financeStatus: 'approved', ...over,
});

test('ใบเก่าที่ financeStatus เป็น null ต้องนับเป็น "รอบัญชีตรวจ"', () => {
  assert.equal(financeStateOf(o({ financeStatus: null })), 'pending');
  assert.equal(financeStateOf(o({ financeStatus: 'pending' })), 'pending');
  assert.equal(financeStateOf(o({ financeStatus: 'approved' })), 'approved');
  // กรองแล้วต้องได้ใบ null มาด้วย ไม่งั้นใบชุดเดิมหายจากตัวกรองเงียบ ๆ
  const rows = [o({ orderNumber: 'A', financeStatus: null }), o({ orderNumber: 'B', financeStatus: 'approved' })];
  assert.deepEqual(filterOrders(rows, { finance: ['pending'] }).map((r) => r.orderNumber), ['A']);
});

test('คำค้นหาได้ทั้งเลขที่ใบ ใบเสนอราคา ลูกค้า รหัสลูกค้า และชื่อผู้รับผิดชอบ', () => {
  const row = o({ orderNumber: 'SO-26080001-0', quoteNumber: 'QT-26080001-1', customerName: 'บจก. เดอะคอมมอนส์', customerId: 'AR-518', ownerName: 'Sunichacha' });
  for (const q of ['26080001', 'qt-2608', 'คอมมอนส์', 'ar-518', 'sunichacha', '  ']) {
    assert.equal(matchesQuery(row, q), true, `ควรเจอด้วยคำ "${q}"`);
  }
  assert.equal(matchesQuery(row, 'ไม่มีคำนี้'), false);
});

test('กลุ่มที่ไม่ได้เลือกอะไร = ไม่กรองด้วยกลุ่มนั้น (ไม่ใช่กรองทิ้งหมด)', () => {
  const rows = [o({ orderNumber: 'A', ownerId: 'u1', team: 'KA' }), o({ orderNumber: 'B', ownerId: 'u2', team: 'SV' })];
  assert.equal(filterOrders(rows, {}).length, 2);
  assert.deepEqual(filterOrders(rows, { owners: ['u2'] }).map((r) => r.orderNumber), ['B']);
  assert.deepEqual(filterOrders(rows, { teams: ['KA'] }).map((r) => r.orderNumber), ['A']);
  // หลายกลุ่มพร้อมกัน = และ ระหว่างกลุ่ม
  assert.deepEqual(filterOrders(rows, { owners: ['u1'], teams: ['SV'] }), []);
});

test('เรียงข้อความใช้ลำดับภาษาไทย และแถวค่าเท่ากันไม่สลับที่', () => {
  const rows = [o({ orderNumber: 'B', customerName: 'ฮ' }), o({ orderNumber: 'A', customerName: 'ก' })];
  assert.deepEqual(sortOrders(rows, 'customer', 'asc').map((r) => r.customerName), ['ก', 'ฮ']);
  assert.deepEqual(sortOrders(rows, 'customer', 'desc').map((r) => r.customerName), ['ฮ', 'ก']);
  // ยอดเท่ากันทั้งคู่ ⇒ ตัดสินด้วยเลขที่ใบเสมอ เรนเดอร์ซ้ำได้ลำดับเดิม
  const tie = [o({ orderNumber: 'SO-9', amount: 5 }), o({ orderNumber: 'SO-2', amount: 5 })];
  assert.deepEqual(sortOrders(tie, 'amount', 'desc').map((r) => r.orderNumber), ['SO-2', 'SO-9']);
});

test('ทิศทางตั้งต้นของแต่ละแบบเรียงตรงกับที่คนคาดหวัง', () => {
  assert.equal(ORDER_SORT_DIR.month, 'desc');
  assert.equal(ORDER_SORT_DIR.amount, 'desc');
  assert.equal(ORDER_SORT_DIR.customer, 'asc');
});

test('ไม่จัดกลุ่ม = กลุ่มเดียวไม่มีป้าย ผู้เรียกวาดด้วยโค้ดชุดเดียว', () => {
  const rows = [o({ amount: 10 }), o({ amount: 5 })];
  const groups = groupOrders(rows, 'none');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, null);
  assert.equal(groups[0].total, 15);
  // ค่า groupBy ที่ไม่รู้จักต้องไม่พัง — ถอยเป็นกลุ่มเดียว
  assert.equal(groupOrders(rows, 'ไม่มีแบบนี้').length, 1);
});

test('จัดกลุ่มแล้วกลุ่มยอดมากอยู่บน และยอดรวมต่อกลุ่มถูก', () => {
  const rows = [
    o({ orderNumber: 'A', ownerId: 'u1', ownerName: 'เอ', amount: 100 }),
    o({ orderNumber: 'B', ownerId: 'u2', ownerName: 'บี', amount: 300 }),
    o({ orderNumber: 'C', ownerId: 'u1', ownerName: 'เอ', amount: 50 }),
  ];
  const groups = groupOrders(rows, 'owner');
  assert.deepEqual(groups.map((g) => [g.label, g.total, g.count]), [['บี', 300, 1], ['เอ', 150, 2]]);
});

test('จัดกลุ่มตามทีมใช้ป้ายไทย และของที่ไม่มีค่าไม่หายไป', () => {
  const rows = [o({ team: 'KA' }), o({ team: null, ownerName: 'ไร้ทีม' })];
  const groups = groupOrders(rows, 'team', { teamLabels: { KA: 'Key Account' } });
  assert.deepEqual(groups.map((g) => g.label).sort(), ['Key Account', 'ไม่ระบุทีม']);
  assert.equal(groups.reduce((s, g) => s + g.count, 0), 2);
});
