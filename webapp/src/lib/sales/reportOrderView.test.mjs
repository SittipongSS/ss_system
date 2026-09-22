import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDER_SORT_DIR,
  filterOrders,
  financeStateOf,
  groupOrders,
  matchesQuery,
  sortOrders,
  ordersForDrill,
  drillCheck,
  activeFilterCount,
  NONE_VALUE,
  ORDER_SORT_DEFAULT,
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

test('ขั้นบัญชี: ใบยอด 0 ไม่เข้าแกนบัญชี · rejected (ค่าเก่า) อ่านออก ไม่ยุบเป็น "รอปิดใบ"', () => {
  assert.equal(financeStateOf(o({ financeStatus: 'rejected' })), 'rejected');
  assert.equal(financeStateOf(o({ financeStatus: null, totalAmount: 0, amount: 0 })), 'none');
  assert.equal(financeStateOf(o({ financeStatus: null, totalAmount: 1000 })), 'pending');
  const rows = [
    o({ orderNumber: 'A', financeStatus: 'rejected' }),
    o({ orderNumber: 'B', financeStatus: 'pending' }),
    o({ orderNumber: 'C', financeStatus: null, totalAmount: 0, amount: 0 }),
  ];
  assert.deepEqual(filterOrders(rows, { finance: ['pending'] }).map((r) => r.orderNumber), ['B']);
  assert.deepEqual(filterOrders(rows, { finance: ['none'] }).map((r) => r.orderNumber), ['C']);
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

/* ── เจาะจากตาราง "แยกยอด" (2026-09-22) ─────────────────────────────── */
test('เจาะ: เดือน / รวม / ทีม (ต้องมีเจ้าของ) / คน (เจ้าของ + ทีมของแถว)', () => {
  const rows = [
    o({ id: 1, orderNumber: 'A', month: '2026-08', ownerId: 'u1', team: 'KA', amount: 100 }),
    o({ id: 2, orderNumber: 'B', month: '2026-09', ownerId: 'u1', team: 'SV', amount: 200 }),
    o({ id: 3, orderNumber: 'C', month: '2026-08', ownerId: null, team: null, amount: 50 }),
    o({ id: 4, orderNumber: 'D', month: '2026-08', ownerId: 'u2', team: null, amount: 70 }),
  ];
  const nums = (list) => list.map((r) => r.orderNumber);
  assert.deepEqual(nums(ordersForDrill(rows, { kind: 'month', month: '2026-08' })), ['A', 'C', 'D']);
  assert.deepEqual(nums(ordersForDrill(rows, { kind: 'total', months: ['2026-09'] })), ['B']);
  assert.deepEqual(nums(ordersForDrill(rows, { kind: 'team', team: null, months: ['2026-08'] })), ['D']);
  assert.deepEqual(nums(ordersForDrill(rows, { kind: 'person', ownerId: 'u1', team: 'KA', months: ['2026-08', '2026-09'] })), ['A']);
  assert.deepEqual(nums(ordersForDrill(rows, null)), ['A', 'B', 'C', 'D']);
});

test('เทียบยอดที่เจาะ: ตรง ≤ 1 บาท · ต่างเพราะยอดกรอกมือบอกเหตุ', () => {
  const list = [o({ amount: 100 }), o({ amount: 50.4 })];
  assert.deepEqual(drillCheck(150.9, list), { ok: true, total: 150.4, gap: 0, reason: null });
  const miss = drillCheck(1000, list, { historyMonths: ['2026-07'] });
  assert.equal(miss.ok, false);
  assert.equal(miss.reason, 'history');
  assert.equal(Math.round(miss.gap * 100) / 100, 849.6);
});

test('ตัวกรองใหม่: ไม่มีเจ้าของ/ไม่ระบุทีม · งวด · ไม่คิดเงิน · ป้ายเลขนับของที่ใช้อยู่', () => {
  const rows = [
    o({ orderNumber: 'A', ownerId: null, team: null, month: '2026-08', free: true }),
    o({ orderNumber: 'B', ownerId: 'u1', team: 'KA', month: '2026-09', free: false }),
  ];
  assert.deepEqual(filterOrders(rows, { owners: [NONE_VALUE] }).map((r) => r.orderNumber), ['A']);
  assert.deepEqual(filterOrders(rows, { teams: [NONE_VALUE] }).map((r) => r.orderNumber), ['A']);
  assert.deepEqual(filterOrders(rows, { months: ['2026-09'] }).map((r) => r.orderNumber), ['B']);
  assert.deepEqual(filterOrders(rows, { kinds: ['free'] }).map((r) => r.orderNumber), ['A']);
  assert.equal(activeFilterCount({ owners: ['u1'], teams: [], months: ['2026-09', '2026-08'], q: 'ignored' }), 3);
});

test('เรียงตามวันอนุมัติเป็นค่าตั้งต้น (ใหม่ก่อน) · จัดกลุ่มตามงวดเรียงตามเวลา', () => {
  const rows = [
    o({ orderNumber: 'A', approvedAt: '2026-09-01T03:00:00Z', month: '2026-09', amount: 1 }),
    o({ orderNumber: 'B', approvedAt: '2026-09-05T03:00:00Z', month: '2026-09', amount: 1 }),
    o({ orderNumber: 'C', approvedAt: '2026-08-20T03:00:00Z', month: '2026-08', amount: 999 }),
  ];
  assert.equal(ORDER_SORT_DEFAULT, 'approvedAt');
  assert.deepEqual(sortOrders(rows).map((r) => r.orderNumber), ['B', 'A', 'C']);
  const groups = groupOrders(rows, 'month', { monthLabel: (m) => `งวด ${m}` });
  assert.deepEqual(groups.map((g) => g.label), ['งวด 2026-09', 'งวด 2026-08']);
});
