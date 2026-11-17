// แนบ / ถอด SO — ฝั่ง DB (ม-164 · PR-2) · เดินกับตัวจำลองในหน่วยความจำ · audit/เธรด/พี่น้องนิติบุคคลเป็นตัวจำลองเสมอ
import test from 'node:test';
import assert from 'node:assert/strict';
import { attachScentOrder, detachScentOrder, loadAttachCandidates, releaseScentOrderLinks } from './scentOrderAttachAdmin.js';

/* ตัวจำลอง supabase — select · in · eq · neq · order · range · limit · maybeSingle · insert · delete
   `failInsert` = error ที่ insert ของตารางนั้นจะได้ (จำลอง unique/trigger) */
function fakeSupabase(tables, { failInsert = {} } = {}) {
  const writes = [];
  const from = (table) => {
    const filters = [];
    let op = 'select';
    let payload = null;
    let lo = 0;
    let hi = Infinity;
    let single = false;
    const rowsOf = () => (tables[table] || []);
    const builder = {
      select() { return builder; },
      in(col, values) { filters.push((r) => values.includes(r[col])); return builder; },
      eq(col, value) { filters.push((r) => r[col] === value); return builder; },
      neq(col, value) { filters.push((r) => r[col] !== value); return builder; },
      order() { return builder; },
      range(a, b) { lo = a; hi = b; return builder; },
      limit(n) { hi = n - 1; return builder; },
      maybeSingle() { single = true; return builder; },
      insert(row) { op = 'insert'; payload = row; return builder; },
      delete() { op = 'delete'; return builder; },
      then(resolve, reject) {
        let result;
        if (op === 'insert') {
          if (failInsert[table]) result = { data: null, error: failInsert[table] };
          else { (tables[table] ||= []).push(payload); writes.push({ table, op, row: payload }); result = { data: null, error: null }; }
        } else if (op === 'delete') {
          const keep = rowsOf().filter((r) => !filters.every((f) => f(r)));
          const removed = rowsOf().length - keep.length;
          tables[table] = keep;
          writes.push({ table, op, removed });
          result = { data: null, error: null };
        } else {
          const rows = rowsOf().filter((r) => filters.every((f) => f(r))).slice(lo, hi + 1);
          result = { data: single ? (rows[0] || null) : rows, error: null };
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  };
  return { from, writes };
}

const spies = () => {
  const calls = { audit: [], append: [] };
  return {
    calls,
    deps: {
      audit: async (entry) => { calls.audit.push(entry); },
      append: async (_sb, entry) => { calls.append.push(entry); return { row: {}, error: null }; },
      siblings: async (_sb, customerId) => (customerId === 'CUS-A' ? ['CUS-A', 'CUS-A2'] : [customerId]),
      newId: () => 'DRSO-1',
    },
  };
};

// ทิพย์นที — คำร้อง R1 บน SO-MAIN (จ่าย 2) · ซื้อเพิ่ม SO-ADD (03-002 ×1) + SO-REV (03-010 ×1) ยังไม่มีคำร้อง
const db = () => ({
  sales_orders: [
    { id: 'SO-MAIN', orderNumber: 'SO-26080132-0', status: 'approved', origin: 'pipeline', orderDate: '2026-08-20', customerId: 'CUS-A', dealId: 'D1', revisedFromId: null, supersededById: null },
    { id: 'SO-ADD', orderNumber: 'SO-26110385-0', status: 'approved', origin: 'pipeline', orderDate: '2026-11-03', customerId: 'CUS-A2', dealId: 'D2', revisedFromId: null, supersededById: null },
    { id: 'SO-REV', orderNumber: 'SO-26110382-0', status: 'approved', origin: 'pipeline', orderDate: '2026-11-02', customerId: 'CUS-A', dealId: 'D2', revisedFromId: null, supersededById: null },
    { id: 'SO-OTHER', orderNumber: 'SO-26110400-0', status: 'approved', origin: 'pipeline', orderDate: '2026-11-05', customerId: 'CUS-B', dealId: 'D9', revisedFromId: null, supersededById: null },
    { id: 'SO-GOODS', orderNumber: 'SO-26110401-0', status: 'approved', origin: 'pipeline', orderDate: '2026-11-06', customerId: 'CUS-A', dealId: 'D2', revisedFromId: null, supersededById: null },
    { id: 'SO-TAKEN', orderNumber: 'SO-26090001-0', status: 'approved', origin: 'pipeline', orderDate: '2026-09-01', customerId: 'CUS-A', dealId: 'D3', revisedFromId: null, supersededById: null },
    // ใบย้อนหลังของลูกค้าเดียวกันที่ขายออกแบบกลิ่น — ต้องไม่ขึ้นเป็นตัวเลือก (pipelineRowsOnly)
    { id: 'SO-HIST', orderNumber: 'SO-26070001-0', status: 'approved', origin: 'historical', orderDate: '2026-07-01', customerId: 'CUS-A', dealId: 'D3', revisedFromId: null, supersededById: null },
  ],
  sales_order_lines: [
    { id: 'L1', salesOrderId: 'SO-MAIN', qty: '2', fgCode: 'FG-1-03-002', description: 'x' },
    { id: 'L2', salesOrderId: 'SO-ADD', qty: '1', fgCode: 'FG-1-03-002', description: 'y' },
    { id: 'L3', salesOrderId: 'SO-REV', qty: '1', fgCode: 'FG-1-03-010', description: 'z' },
    { id: 'L4', salesOrderId: 'SO-OTHER', qty: '1', fgCode: 'FG-9-03-002', description: 'o' },
    { id: 'L5', salesOrderId: 'SO-GOODS', qty: '500', fgCode: 'FG-1-01-001', description: 'g' },
    { id: 'L6', salesOrderId: 'SO-TAKEN', qty: '1', fgCode: 'FG-1-03-002', description: 't' },
    { id: 'L7', salesOrderId: 'SO-HIST', qty: '1', fgCode: 'FG-1-03-002', description: 'h' },
  ],
  sales_deals: [{ id: 'D1', ownerId: 'U-SA' }, { id: 'D2', ownerId: 'U-OWN' }, { id: 'D3', ownerId: 'U-SA' }],
  dept_requests: [
    { id: 'R1', docNo: 'RQ-SB-26090014', status: 'acknowledged', kind: 'scent_dev', salesOrderId: 'SO-MAIN' },
    { id: 'R2', docNo: 'RQ-SB-26090099', status: 'acknowledged', kind: 'scent_dev', salesOrderId: 'SO-TAKEN' },
  ],
  dept_request_sales_orders: [],
  scent_order_dismissals: [{ salesOrderId: 'SO-REV', reason: 'ทำนอกระบบ', dismissedAt: '2026-11-10', dismissedByName: 'Sup' }],
});

const request = (over = {}) => ({
  id: 'R1', docNo: 'RQ-SB-26090014', kind: 'scent_dev', status: 'acknowledged', salesOrderId: 'SO-MAIN',
  customerId: 'CUS-A', requestedById: 'U-SA', team: 'T1',
  salesOrderLines: [{ id: 'L1', qty: '2', fgCode: 'FG-1-03-002' }],
  attachedOrders: [], scentSlots: { slots: 2, paidRevisions: 0 }, items: [],
  ...over,
});
const sa = { id: 'U-SA', name: 'SA', role: 'senior_ae' };

test('ตัวเลือก: ลูกค้าเดียวกันทั้งนิติบุคคล · อนุมัติแล้ว · มีงานพัฒนากลิ่น · ยังไม่มีเจ้าของ · ใหม่สุดก่อน', async () => {
  const { deps } = spies();
  const out = await loadAttachCandidates(fakeSupabase(db()), request(), deps);
  assert.deepEqual(out.candidates.map((c) => c.orderNumber), ['SO-26110385-0', 'SO-26110382-0']);
  assert.equal(out.hidden.owned, 1); // SO-TAKEN มีคำร้อง R2 แล้ว
  const rev = out.candidates.find((c) => c.id === 'SO-REV');
  assert.deepEqual(rev.adds, { slots: 0, revisions: 1 });
  assert.equal(rev.linesText, '03-010 ×1');
  assert.equal(rev.dismissed.reason, 'ทำนอกระบบ');
  assert.equal(out.requestError, null);
});

test('ตัวเลือกของใบที่ปิดแล้ว: ยังโหลดได้ แต่บอกเหตุที่แนบไม่ได้', async () => {
  const { deps } = spies();
  const out = await loadAttachCandidates(fakeSupabase(db()), request({ status: 'closed' }), deps);
  assert.match(out.requestError, /ต่อจากคำร้อง/);
});

test('แนบ: เขียนลิงก์ · ล้างการปัดออก · ลงเธรด so_attach พร้อมตัวเลขก่อน/หลัง · audit', async () => {
  const tables = db();
  const sb = fakeSupabase(tables);
  const { deps, calls } = spies();
  const out = await attachScentOrder({ supabase: sb, user: sa, request: request(), salesOrderId: 'SO-REV' }, deps);
  assert.equal(out.status, 200);
  assert.deepEqual(tables.dept_request_sales_orders, [{
    id: 'DRSO-1', requestId: 'R1', salesOrderId: 'SO-REV', createdById: 'U-SA', createdByName: 'SA',
  }]);
  assert.equal(tables.scent_order_dismissals.length, 0);
  assert.equal(calls.append[0].kind, 'so_attach');
  assert.equal(calls.append[0].body, 'แนบใบสั่งขาย SO-26110382-0 (03-010 ×1) — รอบแก้ที่ซื้อ 0 เป็น 1');
  assert.equal(calls.audit.length, 1);
  assert.deepEqual(calls.audit[0].after.attachedSalesOrderIds, ['SO-REV']);
});

test('แนบ: เจ้าของดีลของ SO แนบได้แม้ไม่ใช่ผู้ขอ · RD แนบไม่ได้ (403)', async () => {
  const { deps } = spies();
  const owner = await attachScentOrder({
    supabase: fakeSupabase(db()), user: { id: 'U-OWN', role: 'senior_ae' }, request: request(), salesOrderId: 'SO-ADD',
  }, deps);
  assert.equal(owner.status, 200);
  const rd = await attachScentOrder({
    supabase: fakeSupabase(db()), user: { id: 'U-RD', role: 'rd', department: 'RD' }, request: request(), salesOrderId: 'SO-ADD',
  }, deps);
  assert.equal(rd.status, 403);
});

test('แนบ: ลูกค้าอื่น · ใบมีเจ้าของแล้ว · ใบไม่มี = 409/404 ไม่เขียนอะไร', async () => {
  const tables = db();
  const sb = fakeSupabase(tables);
  const { deps, calls } = spies();
  const other = await attachScentOrder({ supabase: sb, user: sa, request: request(), salesOrderId: 'SO-OTHER' }, deps);
  assert.equal(other.status, 409);
  assert.match(other.error, /ลูกค้ารายอื่น/);
  const taken = await attachScentOrder({ supabase: sb, user: sa, request: request(), salesOrderId: 'SO-TAKEN' }, deps);
  assert.match(taken.error, /เปิดคำร้องไปแล้ว \(RQ-SB-26090099\)/);
  const missing = await attachScentOrder({ supabase: sb, user: sa, request: request(), salesOrderId: 'SO-NONE' }, deps);
  assert.equal(missing.status, 404);
  assert.equal(tables.dept_request_sales_orders.length, 0);
  assert.equal(calls.append.length + calls.audit.length, 0);
});

test('แนบ: ชน unique / trigger ที่ฐาน = 409 ข้อความไทย (ตัดรหัส [scent_order_*] ออก)', async () => {
  const { deps } = spies();
  const dup = await attachScentOrder({
    supabase: fakeSupabase(db(), { failInsert: { dept_request_sales_orders: { code: '23505', message: 'duplicate key' } } }),
    user: sa, request: request(), salesOrderId: 'SO-ADD',
  }, deps);
  assert.equal(dup.status, 409);
  assert.match(dup.error, /เพิ่งถูกแนบ/);
  const trig = await attachScentOrder({
    supabase: fakeSupabase(db(), { failInsert: { dept_request_sales_orders: { code: 'P0001', message: 'คำร้องนี้ปิดหรือยกเลิกแล้ว แนบใบสั่งขายเพิ่มไม่ได้ [scent_order_link_request_closed]' } } }),
    user: sa, request: request(), salesOrderId: 'SO-ADD',
  }, deps);
  assert.equal(trig.error, 'คำร้องนี้ปิดหรือยกเลิกแล้ว แนบใบสั่งขายเพิ่มไม่ได้');
});

const attachedReq = (over = {}) => request({
  attachedOrders: [{ linkId: 'DRSO-1', salesOrderId: 'SO-ADD', orderNumber: 'SO-26110385-0', lines: [{ id: 'L2', qty: '1', fgCode: 'FG-1-03-002' }] }],
  scentSlots: { slots: 3, paidRevisions: 0 },
  ...over,
});

test('ถอด: ลบลิงก์ของใบนี้ · เธรด so_detach บอกจำนวนกลิ่นก่อน/หลัง', async () => {
  const tables = { ...db(), dept_request_sales_orders: [{ id: 'DRSO-1', requestId: 'R1', salesOrderId: 'SO-ADD' }] };
  const { deps, calls } = spies();
  const out = await detachScentOrder({ supabase: fakeSupabase(tables), user: sa, request: attachedReq(), salesOrderId: 'SO-ADD' }, deps);
  assert.equal(out.status, 200);
  assert.equal(tables.dept_request_sales_orders.length, 0);
  assert.equal(calls.append[0].body, 'ถอดใบสั่งขาย SO-26110385-0 ออกจากคำร้อง — จำนวนกลิ่น 3 เป็น 2');
});

test('ถอด: คอนเฟิร์มไปแล้ว 3 กลิ่น ถอดแล้วเหลือ 2 = บล็อก ไม่ลบอะไร', async () => {
  const tables = { ...db(), dept_request_sales_orders: [{ id: 'DRSO-1', requestId: 'R1', salesOrderId: 'SO-ADD' }] };
  const { deps } = spies();
  const items = Array.from({ length: 3 }, () => ({ outcome: 'confirmed' }));
  const out = await detachScentOrder({ supabase: fakeSupabase(tables), user: sa, request: attachedReq({ items }), salesOrderId: 'SO-ADD' }, deps);
  assert.equal(out.status, 409);
  assert.equal(tables.dept_request_sales_orders.length, 1);
});

test('ถอด: ใบที่ไม่ได้แนบ = 404', async () => {
  const { deps } = spies();
  const out = await detachScentOrder({ supabase: fakeSupabase(db()), user: sa, request: request(), salesOrderId: 'SO-ADD' }, deps);
  assert.equal(out.status, 404);
});

test('ยกเลิกคำร้อง: ปลด SO แนบทุกใบ + ลงเธรด · ไม่มี SO แนบ = ไม่ทำอะไร', async () => {
  const tables = { ...db(), dept_request_sales_orders: [
    { id: 'K1', requestId: 'R1', salesOrderId: 'SO-ADD' }, { id: 'K2', requestId: 'R9', salesOrderId: 'SO-X' },
  ] };
  const { deps, calls } = spies();
  const text = await releaseScentOrderLinks(fakeSupabase(tables), { request: attachedReq(), user: sa }, deps);
  assert.match(text, /ปลดใบสั่งขายที่แนบ 1 ใบกลับเข้าคิว.*SO-26110385-0/);
  assert.deepEqual(tables.dept_request_sales_orders.map((r) => r.id), ['K2']);
  assert.equal(calls.append[0].kind, 'so_detach');
  assert.equal(await releaseScentOrderLinks(fakeSupabase(db()), { request: request(), user: sa }, deps), '');
});
