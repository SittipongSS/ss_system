// ใบไหนส่ง · แบ่งหน้าด้วย changeSeq ไม่ซ้ำไม่ขาด · ตัดแถวใหม่กว่า 60 วินาที · ร่องรอยใบที่ถูกลบ
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFeedPage, loadOneOrder, mergeFeedWindow, parseFeedParams, qualifyingOrderIds } from './salesOrderFeed.js';
import { fakeDb } from './fakeDb.testutil.mjs';

const NOW = new Date('2026-11-17T10:00:00Z');
const OLD = '2026-11-17T09:00:00Z';
const so = (id, seq, over = {}) => ({
  id, orderNumber: `SO-${id}-0`, baseNumber: `SO-${id}`, revisionNo: 0, status: 'approved', origin: 'pipeline',
  supersededById: null, revisedFromId: null, customerId: 'CUS-1', customerName: 'ลูกค้า', subtotal: 100, discountAmount: 0,
  vatAmount: 7, totalAmount: 107, changeSeq: seq, changedAt: OLD, ...over,
});
const line = (orderId, fgCode, over = {}) => ({ id: `L-${orderId}-${fgCode}`, salesOrderId: orderId, productId: null, fgCode, qty: 1, unitPrice: 100, discountAmount: 0, lineTotal: 100, sortOrder: 0, packQty: null, ...over });

test('พารามิเตอร์: after ≥ 0 · limit 1–100 (ตั้งต้น 100)', () => {
  const p = (q) => parseFeedParams(new URLSearchParams(q));
  assert.deepEqual(p(''), { after: 0, limit: 100 });
  assert.deepEqual(p('after=5&limit=10'), { after: 5, limit: 10 });
  for (const bad of ['after=-1', 'after=1.5', 'after=x', 'limit=0', 'limit=101', 'limit=abc']) assert.ok(p(bad).error, bad);
});

test('เกณฑ์ใบ: pipeline + บรรทัด 01/02 · พิมพ์เองอ่านหมวดใน metadata · Rev. ที่ถอด 01/02 หมดยังส่งถ้าใบก่อนเข้าเกณฑ์', () => {
  const orders = [
    { id: 'A', origin: 'pipeline' }, // 01
    { id: 'B', origin: 'pipeline' }, // 03 อย่างเดียว
    { id: 'C', origin: 'historical' }, // 01 แต่ใบย้อนหลัง
    { id: 'D', origin: 'pipeline' }, // พิมพ์เอง หมวด 02
    { id: 'E', origin: 'pipeline', revisedFromId: 'A0' }, // Rev. ไม่มี 01/02 · ใบก่อนมี
    { id: 'F', origin: 'pipeline', revisedFromId: 'B0' }, // Rev. ไม่มี · ใบก่อนก็ไม่มี
    { id: 'G', origin: 'pipeline', revisedFromId: 'E1' }, // ต่อสองชั้น
  ];
  const chain = new Map([
    ['A0', { id: 'A0', origin: 'pipeline' }], ['B0', { id: 'B0', origin: 'pipeline' }],
    ['E1', { id: 'E1', origin: 'pipeline', revisedFromId: 'E0' }], ['E0', { id: 'E0', origin: 'pipeline' }],
  ]);
  const lines = new Map([
    ['A', [line('A', 'FG-001-01-005-0001')]], ['B', [line('B', 'FG-001-03-010-0001')]], ['C', [line('C', 'FG-001-01-005-0001')]],
    ['D', [line('D', null, { metadataCategory: '02-035' })]], ['E', [line('E', 'FG-001-04-001-0001')]], ['F', []],
    ['A0', [line('A0', 'FG-001-02-001-0001')]], ['B0', [line('B0', 'FG-001-03-001-0001')]], ['E0', [line('E0', 'FG-001-01-001-0001')]],
  ]);
  assert.deepEqual([...qualifyingOrderIds(orders, chain, lines)].sort(), ['A', 'D', 'E', 'G']);
});

test('แบ่งหน้า: SO + ร่องรอยเรียงตาม changeSeq · nextAfter = แถวสุดท้ายที่สแกน · เดินครบไม่ซ้ำไม่ขาด', () => {
  const orders = [so('A', 1), so('B', 3), so('C', 4), so('D', 7)];
  const deleted = [{ changeSeq: 2, orderNumber: 'SO-X-0' }, { changeSeq: 6, orderNumber: 'SO-Y-0' }];
  const seen = [];
  let after = 0;
  for (let guard = 0; guard < 10; guard += 1) {
    const page = mergeFeedWindow(orders.filter((o) => o.changeSeq > after).slice(0, 3), deleted.filter((d) => d.changeSeq > after).slice(0, 3), { after, limit: 2 });
    seen.push(...page.window.map((item) => item.seq));
    after = page.nextAfter;
    if (!page.hasMore) break;
  }
  assert.deepEqual(seen, [1, 2, 3, 4, 6, 7]);
});

test('ตัวโหลดหน้า: กรอง origin/สถานะ/60 วินาทีที่ฐาน · ใบไม่เข้าเกณฑ์ถูกข้ามแต่ nextAfter เดินผ่าน · ร่องรอยมาด้วย', async () => {
  const db = fakeDb({
    sales_orders: [
      so('A', 1), so('B', 2), so('C', 3, { status: 'draft' }), so('D', 4, { origin: 'excise' }),
      so('E', 5, { changedAt: '2026-11-17T09:59:30Z' }), // ใหม่กว่า 60 วินาที
      so('F', 6, { status: 'revised', supersededById: 'G' }), so('G', 7, { status: 'draft' }),
    ],
    sales_order_lines: [line('A', 'FG-001-01-005-0001'), line('B', 'FG-001-03-010-0001'), line('F', 'FG-001-02-001-0001')],
    sales_orders_deleted: [{ changeSeq: 8, orderNumber: 'SO-Z-0', baseNumber: 'SO-Z', revisionNo: 0, deletedAt: OLD }],
    customers: [{ id: 'CUS-1', arCode: 'AR-1' }],
  });
  const page = await loadFeedPage(db, { after: 0, limit: 100, now: NOW });
  assert.deepEqual(page.data.map((r) => [r.orderNumber, r.status]), [['SO-A-0', 'approved'], ['SO-F-0', 'revised'], ['SO-Z-0', 'deleted']]);
  assert.equal(page.data[1].supersededBy, 'SO-G-0', 'ใบที่มาแทนบอกเลขที่ใบแม้ยังเป็นร่าง');
  assert.equal(page.data[0].customer.arCode, 'AR-1');
  assert.equal(page.nextAfter, 8);
  assert.equal(page.hasMore, false);
  const soQuery = db.calls.find((c) => c.table === 'sales_orders' && c.filters.some(([k]) => k === 'gt'));
  assert.deepEqual(soQuery.filters.map(([k, col]) => `${k}:${col}`), ['eq:origin', 'in:status', 'gt:changeSeq', 'lte:changedAt']);
  assert.equal(soQuery.limit, 101, 'ขอเกินหนึ่งแถวเพื่อรู้ว่ายังมีต่อ');
});

test('ตัวโหลดหน้า: อ่านฐานไม่ได้ = throw (ห้ามตอบหน้าว่าง)', async () => {
  const db = fakeDb({ sales_orders: [so('A', 1)] }, { failOn: (s) => s.table === 'sales_orders_deleted' });
  await assert.rejects(() => loadFeedPage(db, { after: 0, limit: 10, now: NOW }), /อ่านร่องรอยใบที่ถูกลบไม่สำเร็จ/);
});

test('ใบเดียว: ส่งเฉพาะใบที่เข้าเกณฑ์ · ใบที่ถูกลบตอบ deleted · นอกนั้น null', async () => {
  const db = fakeDb({
    sales_orders: [so('A', 1), so('B', 2, { status: 'draft' }), so('C', 3)],
    sales_order_lines: [line('A', 'FG-001-01-005-0001'), line('B', 'FG-001-01-005-0001'), line('C', 'FG-001-04-001-0001')],
    sales_orders_deleted: [{ changeSeq: 9, orderNumber: 'SO-Z-0', baseNumber: 'SO-Z', revisionNo: 0, deletedAt: OLD }],
    customers: [],
  });
  assert.equal((await loadOneOrder(db, 'SO-A-0')).orderNumber, 'SO-A-0');
  assert.equal(await loadOneOrder(db, 'SO-B-0'), null, 'ร่าง');
  assert.equal(await loadOneOrder(db, 'SO-C-0'), null, 'ไม่มีบรรทัด 01/02');
  assert.equal((await loadOneOrder(db, 'SO-Z-0')).status, 'deleted');
  assert.equal(await loadOneOrder(db, 'SO-NOPE'), null);
});
