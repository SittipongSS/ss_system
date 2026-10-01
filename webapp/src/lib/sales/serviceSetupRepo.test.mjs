// ── ตัวโหลดบริบทงานบริการ + ตัวห่อ RPC (mig 0392 · PR-A) — ทดสอบด้วย supabase ปลอม ──────────────────────
//
// สิ่งที่ชุดนี้ล็อกไว้:
//   · อ่านพังที่ไหนก็ตาม = throw ข้อความไทย (รวมตัวเลือก FG เมื่อขอ) — ด่านที่เดาว่า "ไม่มี" คือด่านที่เปิดเงียบ
//   · `withFgOptions: true` ⇒ `fgOptionIds` เป็น Set เสมอ (ว่างได้ ไม่ใช่ null) — serviceSetupIssues fail-closed
//   · ลิสต์ที่โตตามข้อมูลซอยก้อน (`.in` ≤ 150) และไล่หน้าเกิน 1,000 แถวได้ครบ
//   · สายธุรกิจ: ใช้โครงการ/ดีลที่แนบมากับใบเมื่อมีค่า line · ไม่มีก็อ่านเอง · บริบทพูดตรงกับ serviceSetupRequired
//   · รอบขายของใบอื่นบนโซน = เฉพาะที่ยังมีผล และไม่ใช่ของใบนี้เอง
//   · RPC: รหัสของฐาน → ข้อความ/สถานะ (A.2) · DETAIL → detailCodes · ไม่รู้จัก = 500
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveServiceBackfill, loadServiceFgOptions, loadServiceReopenBlockers, loadServiceSetupContext, loadSiblingSiteCounts,
  rejectServiceBackfill, reopenServiceSetup, rpcServiceSetup, saveServiceSetup, submitServiceBackfill,
} from './serviceSetupRepo.js';
import { serviceSetupFlow, serviceSetupIssues, serviceSetupRequired, serviceSetupView } from './serviceSetup.js';
import { IN_CHUNK_SIZE } from '../supabaseInChunks.js';

const MAX_ROWS = 1000;

/* ── supabase ปลอม: กรองตาม eq/neq/in/is/or · เรียงตาม .order() · ตัด 1,000 แถว · เคารพ .range() ───────────── */
function likeToRegExp(pattern) {
  return new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
}
function orPredicate(expr) {
  const parts = String(expr).split(',').map((part) => {
    const [column, op, ...rest] = part.split('.');
    const value = rest.join('.');
    if (op === 'eq') return (row) => String(row[column] ?? '') === value;
    if (op === 'is' && value === 'null') return (row) => row[column] === null || row[column] === undefined;
    if (op === 'like') return (row) => likeToRegExp(value).test(String(row[column] ?? ''));
    throw new Error(`fake or: ไม่รู้จัก ${part}`);
  });
  return (row) => parts.some((test) => test(row));
}

function fakeSupabase(tables = {}, { fail = null, rpc = {} } = {}) {
  const calls = [];
  const rpcCalls = [];
  const from = (table) => {
    const state = { table, select: '', preds: [], orders: [], range: null, single: false, limit: null, inSize: null, inColumn: null };
    const builder = {
      select(columns) { state.select = columns; return builder; },
      eq(column, value) { state.preds.push((row) => row[column] === value); return builder; },
      neq(column, value) { state.preds.push((row) => row[column] !== value); return builder; },
      is(column, value) { state.preds.push((row) => (value === null ? row[column] === null || row[column] === undefined : row[column] === value)); return builder; },
      in(column, values) {
        state.inSize = values.length;
        state.inColumn = column;
        state.preds.push((row) => values.includes(row[column]));
        return builder;
      },
      or(expr) { state.preds.push(orPredicate(expr)); return builder; },
      order(column, { ascending = true } = {}) { state.orders.push([column, ascending]); return builder; },
      range(a, b) { state.range = [a, b]; return builder; },
      limit(n) { state.limit = n; return builder; },
      maybeSingle() { state.single = true; return builder; },
      then(resolve, reject) {
        calls.push({ table, select: state.select, inSize: state.inSize, inColumn: state.inColumn, range: state.range, single: state.single });
        const error = typeof fail === 'function' ? fail(state) : null;
        if (error) return Promise.resolve({ data: null, error }).then(resolve, reject);
        let rows = (tables[table] || []).filter((row) => state.preds.every((p) => p(row)));
        rows = [...rows].sort((a, b) => {
          for (const [column, asc] of state.orders) {
            if (a[column] === b[column]) continue;
            if (a[column] === null || a[column] === undefined) return 1;
            if (b[column] === null || b[column] === undefined) return -1;
            return (a[column] < b[column] ? -1 : 1) * (asc ? 1 : -1);
          }
          return 0;
        });
        if (state.single) {
          if (rows.length > 1) return Promise.resolve({ data: null, error: { message: 'multiple rows' } }).then(resolve, reject);
          return Promise.resolve({ data: rows[0] || null, error: null }).then(resolve, reject);
        }
        if (state.limit !== null) rows = rows.slice(0, state.limit);
        rows = state.range
          ? rows.slice(state.range[0], Math.min(state.range[1] + 1, state.range[0] + MAX_ROWS))
          : rows.slice(0, MAX_ROWS);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return builder;
  };
  const client = {
    from,
    rpc(fn, params) {
      rpcCalls.push({ fn, params });
      const out = typeof rpc[fn] === 'function' ? rpc[fn](params) : (rpc[fn] || { data: null, error: { message: `no rpc ${fn}` } });
      return Promise.resolve(out);
    },
  };
  return { client, calls, rpcCalls };
}

const failWhen = (predicate, message = 'connection reset') => (state) => (predicate(state) ? { message, code: 'XX000' } : null);

/* ── ของจริงย่อส่วน ────────────────────────────────────────────────────────────────────────────────────── */
const TODAY = '2026-09-28';
const TAX = '0105556000123';
const baseOrder = (over = {}) => ({
  id: 'SO1', orderNumber: 'SO-26090001-0', status: 'draft', origin: 'pipeline', customerId: 'C1',
  dealId: 'DL1', projectId: 'PJ1', quotationId: 'QT1', revisedFromId: null, supersededById: null,
  totalAmount: 120000, actualAmount: 0, approvedAt: null, updatedAt: '2026-09-28T03:00:00Z', serviceContractId: 'CT1',
  servicePeriodFrom: '2026-10-01', servicePeriodTo: '2027-09-30', serviceTermsOpenedAt: null, serviceSetupState: null,
  metadata: {}, ...over,
});

const line = (id, sortOrder, over = {}) => ({
  id, salesOrderId: 'SO1', quotationLineId: `Q${id}`, productId: null, fgCode: null, description: `บรรทัด ${id}`,
  qty: 12, unit: 'แพ็คเกจ', sortOrder, metadata: { note: `สาขา ${id}` },
  serviceKind: null, serviceProductId: null, serviceFgCode: null, serviceRounds: null, ...over,
});

function world(over = {}) {
  return {
    customers: [
      { id: 'C1', arCode: 'AR-0100', name: 'บริษัท เอ', taxId: TAX, branchCode: '00000', isActive: true, isForeign: false, approvalStatus: 'approved', billingRule: { kind: 'monthly', day: 25 } },
      { id: 'C2', arCode: 'AR-0790', name: 'บริษัท เอ (สาขา)', taxId: TAX, branchCode: '00001', isActive: true, isForeign: false, approvalStatus: 'approved', billingRule: null },
      { id: 'C3', arCode: 'AR-0999', name: 'บริษัท อื่น', taxId: '0105556000999', branchCode: '00000', isActive: true, isForeign: false, approvalStatus: 'approved', billingRule: null },
    ],
    projects: [{ id: 'PJ1', line: 'SERVICE' }],
    sales_deals: [{ id: 'DL1', line: 'PRODUCT' }],
    sales_order_lines: [
      line('L2', 2, { serviceKind: 'package', serviceProductId: 'P1', serviceFgCode: 'FG-0100-02-001-00001', serviceRounds: 12 }),
      line('L1', 1, { fgCode: 'FG-0100-03-002-00009', productId: 'P9', description: 'ค่าขนส่ง' }),
      line('L3', 3),
      { ...line('LX', 1), salesOrderId: 'SO-OTHER' },
    ],
    sales_order_line_zones: [
      { id: 'A2', salesOrderId: 'SO1', salesOrderLineId: 'L2', zoneId: 'Z2', packsPerRound: 2, sortOrder: 1 },
      { id: 'A1', salesOrderId: 'SO1', salesOrderLineId: 'L2', zoneId: 'Z1', packsPerRound: 1, sortOrder: 0 },
    ],
    service_zones: [
      { id: 'Z1', code: 'ZN-1', name: 'Lobby', siteId: 'S1', isActive: true },
      { id: 'Z2', code: 'ZN-2', name: 'ห้องประชุม', siteId: 'S1', isActive: true },
      { id: 'Z3', code: 'ZN-3', name: 'ทางเข้า', siteId: 'S2', isActive: true },
    ],
    service_sites: [
      { id: 'S1', code: 'ST-1', name: 'บางนา', customerId: 'C1', kind: 'customer', isActive: true },
      { id: 'S2', code: 'ST-2', name: 'สีลม', customerId: 'C1', kind: 'customer', isActive: true },
      { id: 'S7', code: 'ST-7', name: 'สาขาพี่น้อง', customerId: 'C2', kind: 'customer', isActive: true },
      { id: 'S8', code: 'ST-8', name: 'ปิดแล้ว', customerId: 'C2', kind: 'customer', isActive: false },
      { id: 'S9', code: 'ST-9', name: 'ลูกค้าอื่น', customerId: 'C3', kind: 'customer', isActive: true },
    ],
    products: [
      { id: 'P1', fgCode: 'FG-0100-02-001-00001', productDescription: 'แพ็คเกจ SDS', customerId: 'C1', isActive: true, approvalStatus: 'approved' },
      { id: 'P2', fgCode: 'FG-0790-02-001-00002', productDescription: 'แพ็คเกจสาขา', customerId: 'C2', isActive: true, approvalStatus: null },
      { id: 'P3', fgCode: 'FG-0100-02-001-00003', productDescription: 'เลิกขาย', customerId: 'C1', isActive: false, approvalStatus: 'approved' },
      { id: 'P4', fgCode: 'FG-0100-02-001-00004', productDescription: 'รออนุมัติ', customerId: 'C1', isActive: true, approvalStatus: 'pending' },
      { id: 'P5', fgCode: 'FG-0100-03-002-00005', productDescription: 'น้ำหอมขวด', customerId: 'C1', isActive: true, approvalStatus: 'approved' },
      { id: 'P6', fgCode: 'FG-0999-02-001-00006', productDescription: 'ของลูกค้าอื่น', customerId: 'C3', isActive: true, approvalStatus: 'approved' },
      { id: 'P9', fgCode: 'FG-0100-03-002-00009', productDescription: 'ค่าขนส่ง', customerId: 'C1', isActive: true, approvalStatus: 'approved' },
    ],
    sales_order_installments: [
      { id: 'I2', salesOrderId: 'SO1', seq: 2, status: 'pending', amount: 60000 },
      { id: 'I1', salesOrderId: 'SO1', seq: 1, status: 'pending', amount: 60000 },
    ],
    sales_contracts: [{ id: 'CT1', contractNo: 'CT-2609-001', status: 'signed', effectiveDate: '2026-10-01', expiryDate: '2027-09-30', kind: 'service' }],
    service_zone_terms: [
      { id: 'T-own', zoneId: 'Z1', salesOrderId: 'SO1', startDate: null, endDate: null },
      { id: 'T-live', zoneId: 'Z1', salesOrderId: 'SO-A', startDate: '2025-10-01', endDate: '2026-12-31' },
      { id: 'T-ended', zoneId: 'Z2', salesOrderId: 'SO-B', startDate: '2024-01-01', endDate: '2025-01-01' },
      { id: 'T-revised', zoneId: 'Z2', salesOrderId: 'SO-C', startDate: null, endDate: null },
    ],
    sales_orders: [
      { id: 'SO1', orderNumber: 'SO-26090001-0', status: 'draft', supersededById: null },
      { id: 'SO-A', orderNumber: 'SO-26080073-0', status: 'approved', supersededById: null },
      { id: 'SO-B', orderNumber: 'SO-25010001-0', status: 'approved', supersededById: null },
      { id: 'SO-C', orderNumber: 'SO-26010002-0', status: 'revised', supersededById: 'SO-C1' },
      { id: 'SO0', orderNumber: 'SO-26080001-0', status: 'revised', supersededById: 'SO1' },
    ],
    service_plans: [
      { id: 'PL1', siteId: 'S1', salesOrderId: 'SO0', isActive: true },
      { id: 'PL2', siteId: 'S2', salesOrderId: 'SO0', isActive: true },
      { id: 'PL3', siteId: 'S1', salesOrderId: 'SO0', isActive: true },
      { id: 'PL4', siteId: 'S9', salesOrderId: 'SO0', isActive: false },
    ],
    ...over,
  };
}

/* ── บริบทเต็ม ─────────────────────────────────────────────────────────────────────────────────────────── */

test('loadServiceSetupContext — บริบทเต็มตามรูปของแผน · บรรทัดเรียงตาม sortOrder มีเลขรายการ · สายจากโครงการ', async () => {
  const { client, calls } = fakeSupabase(world());
  const order = baseOrder({ revisedFromId: 'SO0' });
  const ctx = await loadServiceSetupContext(client, order, { withFgOptions: true, todayIso: TODAY });

  assert.deepEqual(ctx.lines.map((l) => [l.id, l.lineNo]), [['L1', 1], ['L2', 2], ['L3', 3]]);
  assert.equal(ctx.lines[1].serviceFgCode, 'FG-0100-02-001-00001');
  assert.deepEqual(ctx.allocations.map((a) => a.id), ['A1', 'A2'], 'เรียง sortOrder แล้ว id');
  assert.deepEqual([...ctx.zonesById.keys()].sort(), ['Z1', 'Z2']);
  assert.deepEqual(ctx.zonesById.get('Z1'), { id: 'Z1', code: 'ZN-1', name: 'Lobby', siteId: 'S1', isActive: true });
  assert.deepEqual([...ctx.sitesById.keys()], ['S1']);
  assert.equal(ctx.sitesById.get('S1').kind, 'customer');
  assert.deepEqual(ctx.productsById.get('P1'), {
    id: 'P1', fgCode: 'FG-0100-02-001-00001', isActive: true, approvalStatus: 'approved', customerId: 'C1', name: 'แพ็คเกจ SDS',
  });
  assert.equal(ctx.productsById.size, 1, 'อ่านเฉพาะแพ็คเกจที่บรรทัดเลือกไว้');
  assert.deepEqual(ctx.installments.map((i) => i.seq), [1, 2]);
  assert.deepEqual(ctx.customerBillingRule, { kind: 'monthly', day: 25 });
  assert.deepEqual(ctx.contract, { id: 'CT1', contractNo: 'CT-2609-001', status: 'signed', effectiveDate: '2026-10-01', expiryDate: '2027-09-30' });
  assert.deepEqual(ctx.predecessor, { id: 'SO0', orderNumber: 'SO-26080001-0', activePlanSiteIds: ['S1', 'S2'] });
  assert.deepEqual(ctx.siblingSites, [{ customerId: 'C2', arCode: 'AR-0790', siteCount: 1 }]);
  assert.equal(ctx.unsaved, false);

  /* สายธุรกิจ: โครงการ SERVICE ชนะดีล PRODUCT · บริบทพูดตรงกับตัวตัดสินของ U2a */
  assert.equal(ctx.order.businessLine, 'SERVICE');
  assert.deepEqual(ctx.order.project, { id: 'PJ1', line: 'SERVICE' });
  assert.equal(serviceSetupRequired(ctx.order, ctx), true);
  assert.equal(serviceSetupFlow(ctx.order, ctx), 'pipeline');
  assert.equal(order.businessLine, undefined, 'ไม่แก้วัตถุของผู้เรียก');

  /* รอบขายของใบอื่นที่ยังมีผลเท่านั้น — ของใบตัวเอง/จบแล้ว/ใบถูก Rev. ทับ ไม่นับ */
  assert.deepEqual([...ctx.liveTermsByZone.keys()], ['Z1']);
  assert.deepEqual(ctx.liveTermsByZone.get('Z1').map((e) => [e.term.id, e.order.orderNumber]), [['T-live', 'SO-26080073-0']]);

  /* ตัวเลือก FG: ของลูกค้า + นิติบุคคลเดียวกัน (ติดป้าย AR) · ตัดที่เลิกขาย/ยังไม่อนุมัติ/ไม่ใช่ 02-001/นิติบุคคลอื่น */
  assert.deepEqual(ctx.fgOptions, [
    { id: 'P1', fgCode: 'FG-0100-02-001-00001', name: 'แพ็คเกจ SDS', customerId: 'C1', ownerArCode: null },
    { id: 'P2', fgCode: 'FG-0790-02-001-00002', name: 'แพ็คเกจสาขา', customerId: 'C2', ownerArCode: 'AR-0790' },
  ]);
  assert.ok(ctx.fgOptionIds instanceof Set);
  assert.deepEqual([...ctx.fgOptionIds], ['P1', 'P2']);

  /* ใช้ได้ทันทีกับตัวตัดสิน — ไม่ throw และบรรทัดที่ยังไม่เลือกชนิดขึ้นเป็นข้อที่ยังขาด */
  const issues = serviceSetupIssues(ctx);
  assert.ok(issues.some((i) => i.key === 'kind_missing' && i.lineId === 'L3' && i.lineNo === 3));
  const view = serviceSetupView(ctx, { canEdit: true, userId: 'U1', role: 'ae' });
  assert.deepEqual(view.liveTermsInfo, [{ zoneId: 'Z1', orderNumbers: ['SO-26080073-0'] }]);
  assert.deepEqual(view.revisedFrom, { id: 'SO0', orderNumber: 'SO-26080001-0' });

  /* ไม่มีคำสั่งไหนดึงบรรทัดของใบอื่น */
  assert.ok(calls.filter((c) => c.table === 'sales_order_lines').every((c) => c.range), 'บรรทัดต้องไล่หน้า');
});

test('loadServiceSetupContext — ส่ง lines มาเอง = ไม่อ่านบรรทัดซ้ำ · เลขรายการคิดจาก sortOrder (ไม่แก้ของผู้เรียก)', async () => {
  const { client, calls } = fakeSupabase(world());
  const given = [line('B', 5), line('A', 5), line('C', 1)];
  const ctx = await loadServiceSetupContext(client, baseOrder(), { lines: given, todayIso: TODAY });
  assert.equal(calls.some((c) => c.table === 'sales_order_lines'), false);
  assert.deepEqual(ctx.lines.map((l) => [l.id, l.lineNo]), [['C', 1], ['A', 2], ['B', 3]], 'sortOrder เท่ากัน = id');
  assert.equal(given[0].lineNo, undefined);
});

test('loadServiceSetupContext — ใช้โครงการ/ดีลที่แนบมากับใบเมื่อมีค่า line · ขาด line = อ่านเอง', async () => {
  const attached = fakeSupabase(world());
  const order = baseOrder({ project: { id: 'PJ1', code: 'PJ-1', line: 'PRODUCT' }, deal: { id: 'DL1', ownerId: 'U1', line: 'SERVICE' } });
  const ctx = await loadServiceSetupContext(attached.client, order, { todayIso: TODAY });
  assert.equal(attached.calls.some((c) => c.table === 'projects' || c.table === 'sales_deals'), false);
  assert.equal(ctx.order.businessLine, 'PRODUCT');
  assert.equal(ctx.order.deal.ownerId, 'U1', 'ก้อนดีลเดิมคงอยู่');
  assert.equal(serviceSetupRequired(ctx.order, ctx), false);

  /* loadScoped แนบดีลมาเต็ม แต่ไม่มีโครงการ ⇒ อ่านโครงการเอง */
  const scoped = fakeSupabase(world());
  const ctx2 = await loadServiceSetupContext(scoped.client, baseOrder({ deal: { id: 'DL1', line: 'PRODUCT', team: 'A' } }), { todayIso: TODAY });
  assert.deepEqual(scoped.calls.filter((c) => c.table === 'projects' || c.table === 'sales_deals').map((c) => c.table), ['projects']);
  assert.equal(ctx2.order.businessLine, 'SERVICE');
  assert.equal(serviceSetupRequired(ctx2.order, ctx2), true);

  /* ดีลที่แนบมาแต่ไม่มีคีย์ line (select แคบ) ⇒ อ่านดีลเอง · ไม่มีโครงการ ⇒ สายของดีล */
  const narrow = fakeSupabase(world({ sales_deals: [{ id: 'DL1', line: 'SERVICE' }] }));
  const ctx3 = await loadServiceSetupContext(narrow.client, baseOrder({ projectId: null, deal: { id: 'DL1', ownerId: 'U1' } }), { todayIso: TODAY });
  assert.equal(ctx3.order.businessLine, 'SERVICE');
  assert.equal(ctx3.order.deal.ownerId, 'U1');
  assert.equal(ctx3.order.deal.line, 'SERVICE');

  /* ไม่มีทั้งคู่ = null ไม่ใช่ PRODUCT */
  const none = fakeSupabase(world());
  const ctx4 = await loadServiceSetupContext(none.client, baseOrder({ projectId: null, dealId: null }), { todayIso: TODAY });
  assert.equal(ctx4.order.businessLine, null);
});

test('withFgOptions — ไม่ขอ = null · ขอแต่ไม่มีแพ็คเกจ = Set ว่าง (ไม่ใช่ null) · ลูกค้าไม่มีเลขภาษี = เฉพาะของตัวเอง', async () => {
  const off = await loadServiceSetupContext(fakeSupabase(world()).client, baseOrder(), { todayIso: TODAY });
  assert.equal(off.fgOptions, null);
  assert.equal(off.fgOptionIds, null);
  assert.throws(() => serviceSetupIssues(off), /fgOptionIds/, 'ด่านที่ลืมขอตัวเลือก FG ต้องพังดัง ๆ');

  const empty = await loadServiceSetupContext(fakeSupabase(world({ products: [] })).client, baseOrder(), { withFgOptions: true, todayIso: TODAY });
  assert.deepEqual(empty.fgOptions, []);
  assert.ok(empty.fgOptionIds instanceof Set);
  assert.equal(empty.fgOptionIds.size, 0);

  const noTax = world();
  noTax.customers = noTax.customers.map((c) => (c.id === 'C1' ? { ...c, taxId: null } : c));
  const solo = await loadServiceSetupContext(fakeSupabase(noTax).client, baseOrder(), { withFgOptions: true, todayIso: TODAY });
  assert.deepEqual(solo.fgOptions.map((o) => o.id), ['P1']);
  assert.deepEqual(solo.siblingSites, []);
});

test('loadServiceFgOptions / loadSiblingSiteCounts — ตัวเดี่ยว · พี่น้องที่ไม่มีไซต์ใช้งานไม่ขึ้น · ไม่มีลูกค้า = ว่าง', async () => {
  const { client } = fakeSupabase(world());
  assert.deepEqual((await loadServiceFgOptions(client, 'C1')).map((o) => [o.id, o.ownerArCode]), [['P1', null], ['P2', 'AR-0790']]);
  assert.deepEqual((await loadServiceFgOptions(client, 'C2')).map((o) => [o.id, o.ownerArCode]), [['P2', null], ['P1', 'AR-0100']],
    'ของใบลูกค้าที่ถามขึ้นก่อน');
  assert.deepEqual(await loadServiceFgOptions(client, null), []);
  assert.deepEqual(await loadSiblingSiteCounts(client, 'C1'), [{ customerId: 'C2', arCode: 'AR-0790', siteCount: 1 }]);
  assert.deepEqual(await loadSiblingSiteCounts(client, 'C2'), [{ customerId: 'C1', arCode: 'AR-0100', siteCount: 2 }]);
  assert.deepEqual(await loadSiblingSiteCounts(client, 'C3'), []);
  assert.deepEqual(await loadSiblingSiteCounts(client, null), []);
});

test('extraZoneIds — รวมกับโซนที่ตั้งไว้ · ตัดซ้ำ/ค่าว่าง · โซนที่ไม่มีในทะเบียนแค่ไม่อยู่ใน Map', async () => {
  const { client, calls } = fakeSupabase(world());
  const ctx = await loadServiceSetupContext(client, baseOrder(), { extraZoneIds: ['Z3', 'Z1', '', null, 'ZX', 'Z3'], todayIso: TODAY });
  assert.deepEqual([...ctx.zonesById.keys()].sort(), ['Z1', 'Z2', 'Z3']);
  assert.deepEqual([...ctx.sitesById.keys()].sort(), ['S1', 'S2']);
  const zoneCall = calls.find((c) => c.table === 'service_zones');
  assert.equal(zoneCall.inSize, 4, 'Z1 Z2 Z3 ZX — ไม่ซ้ำ ไม่ว่าง');
  assert.deepEqual([...ctx.liveTermsByZone.keys()], ['Z1'], 'รอบขายของใบอื่นดูเฉพาะโซนที่ตั้งไว้แล้ว');
});

test('ลิสต์ที่โตตามข้อมูล — ซอยก้อน .in ≤ 150 และไล่หน้าเกิน 1,000 แถวได้ครบ', async () => {
  const zones = Array.from({ length: 700 }, (_, i) => ({ id: `Z${String(i).padStart(4, '0')}`, code: `ZN-${i}`, name: `โซน ${i}`, siteId: `S${i % 320}`, isActive: true }));
  const sites = Array.from({ length: 320 }, (_, i) => ({ id: `S${i}`, code: `ST-${i}`, name: `ไซต์ ${i}`, customerId: 'C1', kind: 'customer', isActive: true }));
  /* 1,400 แถวจัดสรร (สองบรรทัด × 700 โซน) — เกินเพดาน 1,000 ของ PostgREST */
  const allocations = zones.flatMap((z, i) => ['L2', 'L3'].map((lineId, k) => ({
    id: `A${lineId}-${i}`, salesOrderId: 'SO1', salesOrderLineId: lineId, zoneId: z.id, packsPerRound: 1, sortOrder: i,
  })));
  const { client, calls } = fakeSupabase(world({ service_zones: zones, service_sites: sites, sales_order_line_zones: allocations, service_zone_terms: [] }));
  const ctx = await loadServiceSetupContext(client, baseOrder(), { todayIso: TODAY });
  assert.equal(ctx.allocations.length, 1400);
  assert.equal(ctx.zonesById.size, 700);
  assert.equal(ctx.sitesById.size, 320);
  const inCalls = calls.filter((c) => c.inSize !== null);
  assert.ok(inCalls.length > 0);
  assert.ok(inCalls.every((c) => c.inSize <= IN_CHUNK_SIZE), `ก้อนใหญ่สุด ${Math.max(...inCalls.map((c) => c.inSize))}`);
  assert.ok(calls.filter((c) => c.table === 'service_zones').length >= Math.ceil(700 / IN_CHUNK_SIZE));
  assert.ok(calls.filter((c) => ['sales_order_line_zones', 'service_zones', 'service_sites', 'products', 'service_zone_terms']
    .includes(c.table)).every((c) => c.range || c.single), 'ทุกคำสั่งอ่านตารางที่โตได้ต้องไล่หน้า');
});

test('อ่านพังที่ไหน = throw ข้อความไทย (ห้ามเดาว่า "ไม่มี")', async () => {
  const cases = [
    ['บรรทัด', (s) => s.table === 'sales_order_lines', /อ่านรายการของใบสั่งขายไม่สำเร็จ/],
    ['การจัดสรรโซน', (s) => s.table === 'sales_order_line_zones', /อ่านโซนที่ตั้งไว้ของใบนี้ไม่สำเร็จ/],
    ['โซน', (s) => s.table === 'service_zones', /อ่านโซนในทะเบียนไม่สำเร็จ/],
    ['ไซต์', (s) => s.table === 'service_sites' && s.select.includes('code'), /อ่านไซต์ในทะเบียนไม่สำเร็จ/],
    ['โครงการ', (s) => s.table === 'projects', /อ่านสายธุรกิจของใบไม่สำเร็จ/],
    ['งวด', (s) => s.table === 'sales_order_installments', /อ่านงวดชำระไม่สำเร็จ/],
    ['รอบวางบิล', (s) => s.table === 'customers' && s.select.includes('billingRule'), /อ่านรอบวางบิลของลูกค้าไม่สำเร็จ/],
    ['สัญญา', (s) => s.table === 'sales_contracts', /อ่านสัญญาที่ผูกกับใบไม่สำเร็จ/],
    ['รอบขายใบอื่น', (s) => s.table === 'service_zone_terms', /อ่านรอบขายของใบอื่นบนโซนที่ตั้งไม่สำเร็จ/],
    ['ใบเดิม', (s) => s.table === 'service_plans', /อ่านรอบบริการของใบเดิมไม่สำเร็จ/],
    ['แพ็คเกจที่เลือก', (s) => s.table === 'products' && s.inColumn === 'id', /อ่านแพ็คเกจที่เลือกไว้ไม่สำเร็จ/],
    ['นิติบุคคลเดียวกัน', (s) => s.table === 'customers' && s.select.includes('taxId'), /อ่านลูกค้านิติบุคคลเดียวกันไม่สำเร็จ/],
    ['ไซต์ของพี่น้อง', (s) => s.table === 'service_sites' && !s.select.includes('code'), /อ่านไซต์ของลูกค้านิติบุคคลเดียวกันไม่สำเร็จ/],
  ];
  for (const [label, predicate, message] of cases) {
    const { client } = fakeSupabase(world(), { fail: failWhen(predicate) });
    await assert.rejects(
      loadServiceSetupContext(client, baseOrder({ revisedFromId: 'SO0' }), { todayIso: TODAY }),
      (error) => error instanceof Error && message.test(error.message) && /connection reset/.test(error.message),
      label,
    );
  }
});

test('อ่านตัวเลือก FG พังเมื่อขอ withFgOptions = throw (ไม่มีทาง return { error }) · ไม่ขอ = ไม่แตะเลย', async () => {
  const fgFail = failWhen((s) => s.table === 'products' && s.inColumn === 'customerId');
  await assert.rejects(
    loadServiceSetupContext(fakeSupabase(world(), { fail: fgFail }).client, baseOrder(), { withFgOptions: true, todayIso: TODAY }),
    /อ่านแพ็คเกจ \(FG หมวด 02-001\) ของลูกค้าไม่สำเร็จ: connection reset/,
  );
  await assert.rejects(loadServiceFgOptions(fakeSupabase(world(), { fail: fgFail }).client, 'C1'), /ไม่สำเร็จ/);
  const ok = await loadServiceSetupContext(fakeSupabase(world(), { fail: fgFail }).client, baseOrder(), { todayIso: TODAY });
  assert.equal(ok.fgOptionIds, null);
  await assert.rejects(loadServiceSetupContext(fakeSupabase(world()).client, null), /ไม่พบใบสั่งขาย/);
});

test('ไม่มีสัญญา/ไม่ใช่ใบ Rev./ไม่มีลูกค้า — ไม่ยิงคำสั่งที่ไม่จำเป็น', async () => {
  const { client, calls } = fakeSupabase(world());
  const ctx = await loadServiceSetupContext(client, baseOrder({ serviceContractId: null, customerId: null }), { todayIso: TODAY });
  assert.equal(ctx.contract, null);
  assert.equal(ctx.predecessor, null);
  assert.equal(ctx.customerBillingRule, null);
  assert.deepEqual(ctx.siblingSites, []);
  for (const table of ['sales_contracts', 'service_plans', 'customers']) {
    assert.equal(calls.some((c) => c.table === table), false, table);
  }
});

/* ── RPC ─────────────────────────────────────────────────────────────────────────────────────────────── */

test('rpcServiceSetup — สำเร็จ = { data } · ไม่ครบ + DETAIL = 409 พร้อม detailCodes · stale = 409 · ไม่รู้จัก = 500', async () => {
  const { client } = fakeSupabase({}, {
    rpc: {
      ok_fn: () => ({ data: { updatedAt: 'x' }, error: null }),
      incomplete_fn: () => ({ data: null, error: { message: 'sales_order_service_setup_incomplete', details: 'kind_missing:L3,packs_missing:L2:Z1,,period_missing', code: 'P0001' } }),
      stale_fn: () => ({ data: null, error: { message: 'workflow_stale', details: null, code: 'P0001' } }),
      weird_fn: () => ({ data: null, error: { message: 'deadlock detected', code: '40P01' } }),
    },
  });
  assert.deepEqual(await rpcServiceSetup(client, 'ok_fn', {}), { data: { updatedAt: 'x' } });

  const incomplete = await rpcServiceSetup(client, 'incomplete_fn', {});
  assert.equal(incomplete.data, undefined);
  assert.deepEqual(incomplete.error, {
    status: 409, code: 'sales_order_service_setup_incomplete', message: 'งานบริการยังไม่ครบ — ตรวจรายการที่ขึ้นสีแดง',
    detailCodes: ['kind_missing:L3', 'packs_missing:L2:Z1', 'period_missing'],
  });

  const stale = await rpcServiceSetup(client, 'stale_fn', {});
  assert.deepEqual(stale.error, { status: 409, code: 'workflow_stale', message: 'ใบนี้ถูกแก้จากอีกหน้าต่าง — โหลดข้อมูลล่าสุดแล้ว', detailCodes: [] });

  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    const weird = await rpcServiceSetup(client, 'weird_fn', {});
    assert.equal(weird.error.status, 500);
    assert.equal(weird.error.code, null);
    assert.match(weird.error.message, /งานบริการไม่สำเร็จ/);
    assert.doesNotMatch(weird.error.message, /deadlock/, 'ข้อความดิบของฐานไม่ออกไปถึงจอ');
    assert.equal(logged.length, 1, 'ของที่ไม่รู้จักต้องลง log');
  } finally {
    console.error = originalError;
  }
});

test('ตัวห่อ RPC — ชื่อฟังก์ชัน/อาร์กิวเมนต์ตรงกับ 0392 · ผู้ทำ = บัญชีที่ล็อกอิน · เหตุผลตีกลับถูกตัดช่องว่าง', async () => {
  const ok = () => ({ data: { ok: true }, error: null });
  const { client, rpcCalls } = fakeSupabase({}, {
    rpc: {
      save_sales_order_service_setup: ok, submit_sales_order_service_setup: ok,
      approve_sales_order_service_setup: ok, reject_sales_order_service_setup: ok,
    },
  });
  const user = { id: 'U1', name: 'สมชาย', email: 's@x', role: 'ae_supervisor' };
  const actor = { p_actor_id: 'U1', p_actor_name: 'สมชาย', p_actor_role: 'ae_supervisor' };
  const payload = { lines: [{ lineId: 'L2', rounds: 12 }] };

  assert.deepEqual(await saveServiceSetup(client, { orderId: 'SO1', expectedUpdatedAt: 'T0', payload, user }), { data: { ok: true } });
  await submitServiceBackfill(client, { orderId: 'SO1', expectedUpdatedAt: 'T1', user });
  await approveServiceBackfill(client, { orderId: 'SO1', expectedUpdatedAt: 'T2', user });
  await approveServiceBackfill(client, { orderId: 'SO1', expectedUpdatedAt: 'T3', overrideReason: 'ผู้จัดการลาพักร้อนทั้งสัปดาห์', user });
  await rejectServiceBackfill(client, { orderId: 'SO1', expectedUpdatedAt: 'T4', reason: '   ใส่โซนผิดสาขา กรุณาแก้   ', user });
  await submitServiceBackfill(client, { orderId: 'SO1', expectedUpdatedAt: 'T5', user: { id: 'U2', email: 'e@x', role: 'ae' } });

  assert.deepEqual(rpcCalls, [
    { fn: 'save_sales_order_service_setup', params: { p_order_id: 'SO1', p_expected_updated_at: 'T0', p_payload: payload, ...actor } },
    { fn: 'submit_sales_order_service_setup', params: { p_order_id: 'SO1', p_expected_updated_at: 'T1', ...actor } },
    { fn: 'approve_sales_order_service_setup', params: { p_order_id: 'SO1', p_expected_updated_at: 'T2', ...actor, p_override_reason: null } },
    { fn: 'approve_sales_order_service_setup', params: { p_order_id: 'SO1', p_expected_updated_at: 'T3', ...actor, p_override_reason: 'ผู้จัดการลาพักร้อนทั้งสัปดาห์' } },
    { fn: 'reject_sales_order_service_setup', params: { p_order_id: 'SO1', p_expected_updated_at: 'T4', p_reason: 'ใส่โซนผิดสาขา กรุณาแก้', ...actor } },
    { fn: 'submit_sales_order_service_setup', params: { p_order_id: 'SO1', p_expected_updated_at: 'T5', p_actor_id: 'U2', p_actor_name: 'e@x', p_actor_role: 'ae' } },
  ]);
});

test('0396 ตัวห่อ RPC เปิดแก้ — ชื่อ/อาร์กิวเมนต์ตามลำดับของ reject · เหตุผลตัดช่องว่าง · เวลาดิบ · บล็อกพก detailCodes', async () => {
  const { client, rpcCalls } = fakeSupabase({}, {
    rpc: {
      reopen_sales_order_service_setup: (params) => (params.p_order_id === 'SO9'
        ? { data: null, error: { message: 'service_setup_reopen_blocked', details: 'plans_active:1,visits_live:3', code: 'P0001' } }
        : { data: { order: { id: params.p_order_id }, termsRemoved: 2 }, error: null }),
    },
  });
  const user = { id: 'U1', name: 'สมชาย', email: 's@x', role: 'ae' };
  const ok = await reopenServiceSetup(client, {
    orderId: 'SO1', expectedUpdatedAt: '2026-09-29T04:08:11.170722+00:00', reason: '   SA คีย์โซนผิด รายการ 2   ', user,
  });
  assert.deepEqual(ok, { data: { order: { id: 'SO1' }, termsRemoved: 2 } });
  assert.deepEqual(rpcCalls[0], {
    fn: 'reopen_sales_order_service_setup',
    params: {
      p_order_id: 'SO1', p_expected_updated_at: '2026-09-29T04:08:11.170722+00:00', p_reason: 'SA คีย์โซนผิด รายการ 2',
      p_actor_id: 'U1', p_actor_name: 'สมชาย', p_actor_role: 'ae',
    },
  });
  const blocked = await reopenServiceSetup(client, { orderId: 'SO9', expectedUpdatedAt: 'T', reason: 'x'.repeat(12), user });
  assert.deepEqual(blocked.error, {
    status: 409, code: 'service_setup_reopen_blocked', message: 'แก้งานบริการไม่ได้แล้ว — TS เริ่มงานของใบนี้แล้ว · ทางแก้: ย้อนการอนุมัติแล้วออก Rev.',
    detailCodes: ['plans_active:1', 'visits_live:3'],
  });
});

test('0396 รหัสบล็อกของฐาน — { codes } (ว่างได้) · อ่านพัง/รูปแปลก = { error } ห้ามเดาว่าไม่มีอะไรกัน', async () => {
  const { client, rpcCalls } = fakeSupabase({}, {
    rpc: {
      sales_order_service_reopen_blockers: (params) => {
        if (params.p_order_id === 'SO-EMPTY') return { data: [], error: null };
        if (params.p_order_id === 'SO-NULL') return { data: null, error: null };
        if (params.p_order_id === 'SO-GONE') return { data: null, error: { message: 'Could not find the function', code: 'PGRST202' } };
        return { data: ['plans_active:1', ' nothing_to_edit ', ''], error: null };
      },
    },
  });
  assert.deepEqual(await loadServiceReopenBlockers(client, 'SO1'), { codes: ['plans_active:1', 'nothing_to_edit'] });
  assert.deepEqual(rpcCalls[0], { fn: 'sales_order_service_reopen_blockers', params: { p_order_id: 'SO1' } });
  assert.deepEqual(await loadServiceReopenBlockers(client, 'SO-EMPTY'), { codes: [] });
  const odd = await loadServiceReopenBlockers(client, 'SO-NULL');
  assert.equal(odd.codes, undefined);
  assert.equal(odd.error.status, 500);
  const original = console.error;
  console.error = () => {};
  try {
    const gone = await loadServiceReopenBlockers(client, 'SO-GONE');
    assert.equal(gone.codes, undefined);
    assert.equal(gone.error.status, 500, 'ยังไม่รัน 0396 = อ่านไม่ได้ (ผู้เรียกแปลงเป็น unread)');
  } finally {
    console.error = original;
  }
});
