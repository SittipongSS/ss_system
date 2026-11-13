// ตัวโหลด SO ของคำร้องพัฒนากลิ่น (ม-163) — เดินกับตัวจำลองในหน่วยความจำ ห้ามต่อฐานจริง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isMissingTableError, loadOrderChain, loadRequestScentOrders, loadScentOrderOwners,
} from './scentOrderLinksAdmin.js';

/* ตัวจำลอง supabase แบบเล็กที่สุด — รองรับเท่าที่ตัวโหลดใช้: select · in · eq · neq · order · range · limit
   `missing` = ชื่อตารางที่ทำตัวเหมือน migration ยังไม่รัน */
function fakeSupabase(tables, { missing = [] } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const filters = [];
      let lo = 0;
      let hi = Infinity;
      const builder = {
        select() { return builder; },
        in(col, values) { filters.push((r) => values.includes(r[col])); return builder; },
        eq(col, value) { filters.push((r) => r[col] === value); return builder; },
        neq(col, value) { filters.push((r) => r[col] !== value); return builder; },
        order() { return builder; },
        range(from, to) { lo = from; hi = to; return builder; },
        limit(n) { hi = n - 1; return builder; },
        then(resolve, reject) {
          calls.push(table);
          if (missing.includes(table)) {
            return Promise.resolve({ data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } })
              .then(resolve, reject);
          }
          const rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data: rows.slice(lo, hi + 1), error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const quiet = (fn) => async (...args) => {
  const warn = console.warn;
  console.warn = () => {};
  try { return await fn(...args); } finally { console.warn = warn; }
};

test('isMissingTableError จับได้ทั้งรหัส PostgREST/Postgres และข้อความ', () => {
  assert.equal(isMissingTableError({ code: 'PGRST205' }), true);
  assert.equal(isMissingTableError({ code: '42P01' }), true);
  assert.equal(isMissingTableError({ message: 'relation "x" does not exist' }), true);
  assert.equal(isMissingTableError({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(isMissingTableError(null), false);
});

test('เดินสาย Rev. ไปข้างหน้าและย้อนหลัง · ใบที่หายไม่ถูกถามซ้ำทุกรอบ', async () => {
  const sb = fakeSupabase({
    sales_orders: [
      { id: 'A', status: 'revised', supersededById: 'B', revisedFromId: null },
      { id: 'B', status: 'approved', supersededById: null, revisedFromId: 'A' },
    ],
  });
  const forward = await loadOrderChain(sb, ['A'], { direction: 'forward' });
  assert.deepEqual([...forward.keys()].sort(), ['A', 'B']);
  const back = await loadOrderChain(sb, ['B'], { direction: 'back' });
  assert.deepEqual([...back.keys()].sort(), ['A', 'B']);
  const sb2 = fakeSupabase({ sales_orders: [{ id: 'C', status: 'revised', supersededById: 'gone' }] });
  await loadOrderChain(sb2, ['C'], { direction: 'forward' });
  assert.equal(sb2.calls.filter((t) => t === 'sales_orders').length, 2); // C แล้ว gone ครั้งเดียว
});

const tiptanatee = () => ({
  sales_orders: [
    { id: 'SO-MAIN', orderNumber: 'SO-26080132-0', status: 'approved', supersededById: null, revisedFromId: null },
    { id: 'SO-ADD', orderNumber: 'SO-26110385-0', status: 'approved', supersededById: null, revisedFromId: null },
    { id: 'SO-REV', orderNumber: 'SO-26110382-0', status: 'approved', supersededById: null, revisedFromId: null },
  ],
  sales_order_lines: [
    { id: 'L1', salesOrderId: 'SO-MAIN', qty: '2', fgCode: 'FG-1-03-002', description: 'x' },
    { id: 'L2', salesOrderId: 'SO-ADD', qty: '1', fgCode: 'FG-1-03-002', description: 'y' },
    { id: 'L3', salesOrderId: 'SO-REV', qty: '1', fgCode: 'FG-1-03-010', description: 'z' },
  ],
  dept_requests: [{ id: 'R1', docNo: 'RQ-SB-26090014', status: 'acknowledged', kind: 'scent_dev', salesOrderId: 'SO-MAIN' }],
  dept_request_sales_orders: [
    { id: 'K1', requestId: 'R1', salesOrderId: 'SO-ADD', createdAt: '2026-11-14', createdByName: 'SA' },
    { id: 'K2', requestId: 'R1', salesOrderId: 'SO-REV', createdAt: '2026-11-14', createdByName: 'SA' },
  ],
});

test('คำร้องที่มี SO แนบ: จำนวนกลิ่น 3 · บรรทัดหลักแยกจากบรรทัดแนบ · ไม่หลุดคอลัมน์อื่นของใบสั่งขาย', async () => {
  const out = await loadRequestScentOrders(fakeSupabase(tiptanatee()), { id: 'R1', salesOrderId: 'SO-MAIN' });
  assert.deepEqual(out.salesOrderLines.map((l) => l.id), ['L1']);
  // คีย์ภายใน (`salesOrderId`) ไม่หลุดออกไป · คอลัมน์อื่นของใบสั่งขายไม่ถูก select ตั้งแต่ต้น (ยามซอร์สข้างล่าง)
  assert.deepEqual(Object.keys(out.salesOrderLines[0]).sort(), ['description', 'fgCode', 'id', 'qty']);
  assert.deepEqual(out.attachedOrders.map((a) => a.orderNumber), ['SO-26110385-0', 'SO-26110382-0']);
  assert.deepEqual(out.scentSlotLines.map((l) => l.id), ['L1', 'L2']);
  assert.equal(out.mainOrder, null);
});

test('SO หลักออก Rev. แล้ว = นับบรรทัดของใบ Rev. ที่อนุมัติ', async () => {
  const db = tiptanatee();
  db.sales_orders[0] = { ...db.sales_orders[0], status: 'revised', supersededById: 'SO-MAIN-1' };
  db.sales_orders.push({ id: 'SO-MAIN-1', orderNumber: 'SO-26080132-1', status: 'approved', supersededById: null, revisedFromId: 'SO-MAIN' });
  db.sales_order_lines.push({ id: 'L9', salesOrderId: 'SO-MAIN-1', qty: '3', fgCode: 'FG-1-03-002', description: 'x' });
  db.dept_request_sales_orders = [];
  const out = await loadRequestScentOrders(fakeSupabase(db), { id: 'R1', salesOrderId: 'SO-MAIN' });
  assert.deepEqual(out.salesOrderLines.map((l) => l.id), ['L9']);
  assert.deepEqual(out.mainOrder, { id: 'SO-MAIN-1', orderNumber: 'SO-26080132-1' });
});

test('mig 0436 ยังไม่รัน = ไม่มี SO แนบ ไม่ล้มทั้งหน้า', quiet(async () => {
  const sb = fakeSupabase(tiptanatee(), { missing: ['dept_request_sales_orders'] });
  const out = await loadRequestScentOrders(sb, { id: 'R1', salesOrderId: 'SO-MAIN' });
  assert.deepEqual(out.attachedOrders, []);
  assert.deepEqual(out.scentSlotLines.map((l) => l.id), ['L1']);
  const owners = await loadScentOrderOwners(sb, [{ id: 'SO-MAIN' }, { id: 'SO-ADD' }]);
  assert.equal(owners.ownerById.get('SO-MAIN').role, 'main');
  assert.equal(owners.ownerById.get('SO-ADD'), null);
}));

test('เจ้าของ: หลัก · แนบ · Rev. ของใบที่มีเจ้าของ · ว่าง', async () => {
  const db = tiptanatee();
  db.sales_orders.push(
    { id: 'SO-ADD-1', orderNumber: 'SO-26110385-1', status: 'approved', supersededById: null, revisedFromId: 'SO-ADD' },
    { id: 'SO-FREE', orderNumber: 'SO-26110400-0', status: 'approved', supersededById: null, revisedFromId: null },
  );
  const { ownerById } = await loadScentOrderOwners(fakeSupabase(db), [
    { id: 'SO-MAIN', revisedFromId: null },
    { id: 'SO-ADD', revisedFromId: null },
    { id: 'SO-ADD-1', revisedFromId: 'SO-ADD' },
    { id: 'SO-FREE', revisedFromId: null },
  ]);
  assert.equal(ownerById.get('SO-MAIN').role, 'main');
  assert.equal(ownerById.get('SO-ADD').role, 'attached');
  assert.equal(ownerById.get('SO-ADD').docNo, 'RQ-SB-26090014');
  assert.equal(ownerById.get('SO-ADD-1').viaRevision, true);
  assert.equal(ownerById.get('SO-ADD-1').viaOrderId, 'SO-ADD');
  assert.equal(ownerById.get('SO-FREE'), null);
});

test('คำร้องที่ยกเลิกแล้วไม่เป็นเจ้าของ — ทั้งหลักและแนบ', async () => {
  const db = tiptanatee();
  db.dept_requests[0].status = 'cancelled';
  const { ownerById } = await loadScentOrderOwners(fakeSupabase(db), [{ id: 'SO-MAIN' }, { id: 'SO-ADD' }]);
  assert.equal(ownerById.get('SO-MAIN'), null);
  assert.equal(ownerById.get('SO-ADD'), null);
});

test('error อื่นที่ไม่ใช่ "ตารางยังไม่มี" ต้องโยน ไม่กลืน', async () => {
  const sb = fakeSupabase(tiptanatee());
  const from = sb.from.bind(sb);
  sb.from = (table) => {
    const q = from(table);
    if (table !== 'dept_request_sales_orders') return q;
    q.then = (resolve) => Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' } }).then(resolve);
    return q;
  };
  // error ของ supabase เป็นอ็อบเจกต์ธรรมดา ไม่ใช่ Error — เทียบที่ข้อความ
  await assert.rejects(loadRequestScentOrders(sb, { id: 'R1', salesOrderId: 'SO-MAIN' }), { message: 'timeout' });
});

test('ยามซอร์ส: บรรทัดใบสั่งขายเลือกแค่คอลัมน์ที่ตัวนับกลิ่นใช้ — ไม่ select('*')', () => {
  const src = readFileSync(new URL('./scentOrderLinksAdmin.js', import.meta.url), 'utf8');
  assert.match(src, /from\('sales_order_lines'\)\.select\('id, qty, "fgCode", description, "salesOrderId"'\)/);
  assert.doesNotMatch(src, /from\('sales_order_lines'\)\.select\('\*'/);
});
