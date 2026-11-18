// คิว "SO ออกแบบกลิ่นรอเปิดคำร้อง" (ม-164 PR-5) — logic ล้วน + ฝั่ง DB กับตัวจำลอง (audit เป็นตัวจำลองเสมอ)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canSeeAllScentOrders, canUseScentOrderQueue, dismissScentOrderError, scentOrderNewRequestHref, scentOrderQueueRows, scentOrderQueueScope,
  undismissScentOrderError,
} from './scentOrderQueue.js';
import { dismissScentOrder, loadScentOrderQueue, undismissScentOrder } from './scentOrderQueueAdmin.js';

const fg = (category, qty) => ({ fgCode: `FG-1-${category}`, qty: String(qty) });
const sa = { id: 'U-SA', name: 'SA', role: 'senior_ae' };
const sup = { id: 'U-SUP', name: 'Sup', role: 'ac_supervisor' };
const other = { id: 'U-X', name: 'X', role: 'senior_ae' };

test('แถวคิว: เฉพาะงานพัฒนากลิ่นที่ยังไม่มีเจ้าของ · ปัดออกแยกกอง · ค้างนานสุดก่อน', () => {
  const orders = [
    { id: 'A', orderNumber: 'SO-A', customerId: 'C1', dealId: 'D1', approvedAt: '2026-08-01' },
    { id: 'B', orderNumber: 'SO-B', customerId: 'C1', dealId: 'D1', approvedAt: '2026-11-01' },
    { id: 'G', orderNumber: 'SO-G', customerId: 'C1', dealId: 'D1', approvedAt: '2026-11-01' },
    { id: 'T', orderNumber: 'SO-T', customerId: 'C1', dealId: 'D1', approvedAt: '2026-11-01' },
    { id: 'X', orderNumber: 'SO-X', customerId: 'C1', dealId: 'D1', approvedAt: '2026-09-01' },
  ];
  const linesBySo = new Map([
    ['A', [fg('03-010', 1)]], ['B', [fg('03-002', 1)]], ['G', [fg('01-001', 500)]], ['T', [fg('03-002', 1)]], ['X', [fg('03-002', 1)]],
  ]);
  const { pending, dismissed } = scentOrderQueueRows({
    orders, linesBySo,
    ownerById: new Map([['T', { requestId: 'R1' }]]),
    dismissals: new Map([['X', { reason: 'ทำนอกระบบ', dismissedById: 'U-SA' }]]),
    dealsById: new Map([['D1', { id: 'D1', code: 'DL-1', ownerId: 'U-SA', ownerName: 'SA' }]]),
    latestRequestByCustomer: new Map([['C1', { id: 'R0', docNo: 'SB-1' }]]),
    today: '2026-11-18',
  });
  assert.deepEqual(pending.map((r) => r.orderNumber), ['SO-A', 'SO-B']);
  assert.equal(pending[0].waitingDays, 109);
  assert.equal(pending[0].linesText, '03-010 ×1');
  assert.deepEqual(pending[0].adds, { slots: 0, revisions: 1 });
  assert.equal(pending[0].dealOwnerId, 'U-SA');
  assert.deepEqual(dismissed.map((r) => r.orderNumber), ['SO-X']);
  // ⭐ มติเจ้าของ 18/11/2026: หมวด = รหัส + ชื่อ — ส่งทะเบียนหมวดมา ชื่อขึ้นในสิ่งที่ SO ขาย
  const named = scentOrderQueueRows({
    orders, linesBySo, today: '2026-11-18',
    productTypes: [{ mainCategoryCode: '03', typeCode: '010', nameTh: 'แก้ไขกลิ่น', nameEn: 'Fragrance Modification' }],
  });
  assert.equal(named.pending.find((r) => r.orderNumber === 'SO-A').linesText, '03-010 แก้ไขกลิ่น ×1');
});

test('ขอบเขต: ของฉัน = ดีลของฉัน · ทั้งหมด = หัวหน้าฝ่ายขาย/แอดมิน (คนอื่นขอทั้งหมดได้ของตัวเอง)', () => {
  const rows = [{ id: 'A', dealOwnerId: 'U-SA' }, { id: 'B', dealOwnerId: 'U-X' }];
  assert.deepEqual(scentOrderQueueScope(rows, { user: sa, scope: 'mine' }).map((r) => r.id), ['A']);
  assert.deepEqual(scentOrderQueueScope(rows, { user: sa, scope: 'all' }).map((r) => r.id), ['A']);
  assert.deepEqual(scentOrderQueueScope(rows, { user: sup, scope: 'all' }).map((r) => r.id), ['A', 'B']);
  assert.deepEqual(scentOrderQueueScope(rows, { user: sup, scope: 'all', inScope: (r) => r.id === 'B' }).map((r) => r.id), ['B']);
  assert.equal(canSeeAllScentOrders(sup), true);
  assert.equal(canSeeAllScentOrders({ id: 'A', role: 'admin' }), true);
  assert.equal(canSeeAllScentOrders(sa), false);
  // ใช้คิวได้: ฝ่ายขายทุกตำแหน่ง + แอดมิน · RD/บัญชีไม่มีวันเป็นเจ้าของดีล ⇒ server ไม่ต้องอ่านทะเบียน SO
  assert.equal(canUseScentOrderQueue(sa), true);
  assert.equal(canUseScentOrderQueue({ role: 'ae' }), true);
  assert.equal(canUseScentOrderQueue({ role: 'admin' }), true);
  assert.equal(canUseScentOrderQueue({ role: 'rd' }), false);
  assert.equal(canUseScentOrderQueue({ role: 'accounting' }), false);
  assert.equal(canUseScentOrderQueue(null), false);
});

test('ปัดออก: เหตุผลบังคับ · เฉพาะเจ้าของดีล/หัวหน้า/แอดมิน · ปัดซ้ำไม่ได้ · ไม่อยู่ในคิว = บอกเหตุ', () => {
  const row = { id: 'A', dealOwnerId: 'U-SA', dismissal: null };
  assert.equal(dismissScentOrderError({ user: sa, row, reason: 'ทำนอกระบบ' }), null);
  assert.equal(dismissScentOrderError({ user: sup, row, reason: 'x' }), null);
  assert.match(dismissScentOrderError({ user: other, row, reason: 'x' }), /เฉพาะเจ้าของดีล/);
  assert.match(dismissScentOrderError({ user: sa, row, reason: ' ' }), /เหตุผล/);
  assert.match(dismissScentOrderError({ user: sa, row, reason: 'x'.repeat(501) }), /500/);
  assert.match(dismissScentOrderError({ user: sa, row: { ...row, dismissal: { reason: 'x' } }, reason: 'y' }), /ไปแล้ว/);
  assert.match(dismissScentOrderError({ user: sa, row: null, reason: 'x' }), /ไม่อยู่ในคิว/);
});

test('คืนเข้าคิว: คนที่ปัดเอง · เจ้าของดีล · หัวหน้า', () => {
  const row = { id: 'A', dealOwnerId: 'U-SA', dismissal: { reason: 'x', dismissedById: 'U-X' } };
  assert.equal(undismissScentOrderError({ user: other, row }), null);
  assert.equal(undismissScentOrderError({ user: sa, row }), null);
  assert.match(undismissScentOrderError({ user: { id: 'U-Y', role: 'senior_ae' }, row }), /เฉพาะคนที่ปัดออก/);
  assert.match(undismissScentOrderError({ user: sa, row: { ...row, dismissal: null } }), /ไม่ได้ถูกปัด/);
});

test('ลิงก์เปิดคำร้องใหม่: พา SO + ตั้งต้นต่อจากใบล่าสุดของลูกค้า + กลับมาที่คิว', () => {
  const href = scentOrderNewRequestHref({ id: 'SO1', latestRequest: { id: 'R0' } });
  const q = new URLSearchParams(href.split('?')[1]);
  assert.equal(q.get('kind'), 'scent_dev');
  assert.equal(q.get('salesOrderId'), 'SO1');
  assert.equal(q.get('continues'), 'R0');
  assert.equal(q.get('returnTo'), '/requests');
  assert.equal(new URLSearchParams(scentOrderNewRequestHref({ id: 'SO1' }).split('?')[1]).get('continues'), null);
});

/* ตัวจำลอง supabase — select · in · eq · neq · order · range · limit · maybeSingle · insert · delete */
function fakeSupabase(tables) {
  return {
    from(table) {
      const filters = [];
      let op = 'select';
      let payload = null;
      let lo = 0;
      let hi = Infinity;
      let single = false;
      const b = {
        select() { return b; },
        in(col, values) { filters.push((r) => values.includes(r[col])); return b; },
        eq(col, value) { filters.push((r) => r[col] === value); return b; },
        neq(col, value) { filters.push((r) => r[col] !== value); return b; },
        order() { return b; },
        range(a, z) { lo = a; hi = z; return b; },
        limit(n) { hi = n - 1; return b; },
        maybeSingle() { single = true; return b; },
        insert(row) { op = 'insert'; payload = row; return b; },
        delete() { op = 'delete'; return b; },
        then(resolve, reject) {
          let result;
          if (op === 'insert') { (tables[table] ||= []).push(payload); result = { data: null, error: null }; }
          else if (op === 'delete') {
            tables[table] = (tables[table] || []).filter((r) => !filters.every((f) => f(r)));
            result = { data: null, error: null };
          } else {
            const rows = (tables[table] || []).filter((r) => filters.every((f) => f(r))).slice(lo, hi + 1);
            result = { data: single ? (rows[0] || null) : rows, error: null };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return b;
    },
  };
}

const db = () => ({
  sales_orders: [
    { id: 'S1', orderNumber: 'SO-26080018-0', status: 'approved', origin: 'pipeline', customerId: 'C1', dealId: 'D1', approvedAt: '2026-08-10', revisedFromId: null },
    { id: 'S2', orderNumber: 'SO-26080132-0', status: 'approved', origin: 'pipeline', customerId: 'C1', dealId: 'D1', approvedAt: '2026-08-20', revisedFromId: null },
    { id: 'S3', orderNumber: 'SO-26070001-0', status: 'approved', origin: 'historical', customerId: 'C1', dealId: 'D1', approvedAt: '2026-07-01', revisedFromId: null },
  ],
  sales_order_lines: [
    { id: 'L1', salesOrderId: 'S1', qty: '1', fgCode: 'FG-1-03-010' },
    { id: 'L2', salesOrderId: 'S2', qty: '2', fgCode: 'FG-1-03-002' },
    { id: 'L3', salesOrderId: 'S3', qty: '1', fgCode: 'FG-1-03-002' },
  ],
  dept_requests: [{ id: 'R1', docNo: 'SB-26080006', status: 'closed', kind: 'scent_dev', salesOrderId: 'S2', customerId: 'C1', createdAt: '2026-08-21' }],
  dept_request_sales_orders: [],
  scent_order_dismissals: [],
  sales_deals: [{ id: 'D1', code: 'DL-26080183', title: 'VARIDA', ownerId: 'U-SA', ownerName: 'SA', team: 'T1' }],
});

test('คิวจากฐาน: ใบที่มีคำร้องแล้วไม่ขึ้น · ใบย้อนหลังไม่ขึ้น · พาใบล่าสุดของลูกค้ามาเป็นค่าตั้งต้น', async () => {
  const { pending } = await loadScentOrderQueue(fakeSupabase(db()), { today: '2026-11-18' });
  assert.deepEqual(pending.map((r) => r.orderNumber), ['SO-26080018-0']);
  assert.equal(pending[0].latestRequest.docNo, 'SB-26080006');
  assert.equal(pending[0].dealOwnerName, 'SA');
});

test('ปัดออก/คืนเข้าคิว: เขียน/ลบแถว + audit (ตัวจำลอง) · คนนอกโดน 403 ไม่เขียนอะไร', async () => {
  const tables = db();
  const calls = [];
  const deps = { audit: async (e) => { calls.push(e); } };
  const denied = await dismissScentOrder(fakeSupabase(tables), { user: other, salesOrderId: 'S1', reason: 'x' }, deps);
  assert.equal(denied.status, 403);
  assert.equal(tables.scent_order_dismissals.length, 0);
  const ok = await dismissScentOrder(fakeSupabase(tables), { user: sa, salesOrderId: 'S1', reason: 'แก้กลิ่นนอกระบบแล้ว' }, deps);
  assert.equal(ok.status, 200);
  assert.deepEqual(tables.scent_order_dismissals.map((r) => [r.salesOrderId, r.reason, r.dismissedById]), [['S1', 'แก้กลิ่นนอกระบบแล้ว', 'U-SA']]);
  assert.match(calls[0].summary, /ปัด SO-26080018-0 ออกจากคิว/);
  const again = await dismissScentOrder(fakeSupabase(tables), { user: sa, salesOrderId: 'S1', reason: 'y' }, deps);
  assert.equal(again.status, 409);
  const back = await undismissScentOrder(fakeSupabase(tables), { user: sa, salesOrderId: 'S1' }, deps);
  assert.equal(back.status, 200);
  assert.equal(tables.scent_order_dismissals.length, 0);
  // ใบที่มีคำร้องรับแล้ว (S2) ไม่อยู่ในคิว · ใบย้อนหลัง (S3) ไม่อยู่ในคิว
  assert.equal((await dismissScentOrder(fakeSupabase(tables), { user: sa, salesOrderId: 'S2', reason: 'x' }, deps)).status, 404);
  assert.equal((await dismissScentOrder(fakeSupabase(tables), { user: sa, salesOrderId: 'S3', reason: 'x' }, deps)).status, 404);
});
