// ── เส้น `…/sales-orders/[id]/service-setup` (mig 0392 · PR-A · แผน §2.4) — handler จริงกับ supabase ปลอม + ยามรูปซอร์ส ──
//
// สิ่งที่ชุดนี้ล็อกไว้:
//   · GET: อ่านใบด้วย loadScoped โหมด view · อ่านพัง (รวมตัวเลือก FG) = 500 ข้อความไทย ไม่เดา · canEdit มาจาก server
//   · PATCH: ด่านสิทธิ์แก้ก่อนเขียนทุกอย่าง · ล็อกตัดสินจากสายธุรกิจของบริบท (โครงการก่อนดีล) · fieldErrors 400
//     · เวลาของใบส่งค่าดิบเข้า RPC · workflow_stale = 409 · audit หลัง RPC เท่านั้น
//   · POST: submit (ขั้นย้อนหลัง + ข้อที่ยังขาด) · approve (ผู้จัดการ · ยื่นเองอนุมัติเองไม่ได้ · Admin ต้องมีเหตุผล 10–500)
//     · reject (เหตุผลตัดช่องว่างก่อนนับ) · สถานะ 'submitted' ที่ค้างบนใบที่ย้อนการอนุมัติไม่มีผล (D28)
//   · ทุกจุดโหลดบริบทส่ง withFgOptions: true (serviceSetupIssues fail-closed) · ไม่มี .in() / rpc ดิบในเส้นนี้
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serviceSetupGet, serviceSetupPatch, serviceSetupPost } from './serviceSetupRoute.js';
import { SERVICE_SETUP_EDIT_TEXT, SERVICE_SETUP_SQL_MESSAGES } from './serviceSetup.js';
import { apiWriteAllowed, lockedOut } from '../../proxy.js';

const WEBAPP = process.cwd();
const ROUTE_FILE = 'src/app/api/sales-planning/sales-orders/[id]/service-setup/route.js';
const LIB_FILE = 'src/lib/sales/serviceSetupRoute.js';
const MAX_ROWS = 1000;
const MSG = SERVICE_SETUP_SQL_MESSAGES;
const UPDATED_AT = '2026-09-28T03:00:00.123456+00:00';

/* ── supabase ปลอม: กรอง eq/neq/in/is/or · เรียง · ตัด 1,000 แถว · range · maybeSingle · embed ดีลของ loadScoped ── */
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
  return (row) => parts.some((check) => check(row));
}

function fakeSupabase(tables, { fail = null, rpc = {} } = {}) {
  const calls = [];
  const rpcCalls = [];
  const events = [];
  const from = (table) => {
    const state = { table, select: '', preds: [], orders: [], range: null, single: false, limit: null, inColumn: null, inValues: null };
    const builder = {
      select(columns) { state.select = columns; return builder; },
      eq(column, value) { state.preds.push((row) => row[column] === value); return builder; },
      neq(column, value) { state.preds.push((row) => row[column] !== value); return builder; },
      is(column, value) { state.preds.push((row) => (value === null ? row[column] === null || row[column] === undefined : row[column] === value)); return builder; },
      in(column, values) {
        state.inColumn = column;
        state.inValues = [...values];
        state.preds.push((row) => values.includes(row[column]));
        return builder;
      },
      or(expr) { state.preds.push(orPredicate(expr)); return builder; },
      order(column, { ascending = true } = {}) { state.orders.push([column, ascending]); return builder; },
      range(a, b) { state.range = [a, b]; return builder; },
      limit(n) { state.limit = n; return builder; },
      maybeSingle() { state.single = true; return builder; },
      then(resolve, reject) {
        calls.push({ table, select: state.select, inColumn: state.inColumn, inValues: state.inValues, single: state.single });
        events.push(`read:${table}`);
        const error = typeof fail === 'function' ? fail(state) : null;
        if (error) return Promise.resolve({ data: null, error }).then(resolve, reject);
        let rows = (tables[table] || []).filter((row) => state.preds.every((p) => p(row)));
        if (/deal:sales_deals\(\*\)/.test(state.select)) {
          rows = rows.map((row) => ({ ...row, deal: (tables.sales_deals || []).find((deal) => deal.id === row.dealId) || null }));
        }
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
      events.push(`rpc:${fn}`);
      const out = typeof rpc[fn] === 'function' ? rpc[fn](params) : (rpc[fn] || { data: null, error: { message: `no rpc ${fn}` } });
      return Promise.resolve(out);
    },
  };
  const audits = [];
  const audit = async (entry) => { audits.push(entry); events.push('audit'); };
  return { client, calls, rpcCalls, events, audits, audit };
}

/* ── ผู้ใช้ ─────────────────────────────────────────────────────────────────────────────────────────────── */
const AE = { id: 'U-AE', role: 'ae', team: 'T1', teams: ['T1'], name: 'เอ ขายดี' };
const AE_OTHER = { id: 'U-AE2', role: 'ae', team: 'T1', teams: ['T1'], name: 'บี ขายเก่ง' };
const SUP = { id: 'U-SUP', role: 'ae_supervisor', team: 'T1', teams: ['T1'], name: 'หัวหน้า เอ' };
const SUP2 = { id: 'U-SUP2', role: 'commercial_manager', team: 'T1', teams: ['T1'], name: 'ผู้จัดการ บี' };
const ADMIN = { id: 'U-ADM', role: 'admin', team: null, teams: [], name: 'แอดมิน' };
const FN = { id: 'U-FN', role: 'finance', team: null, teams: [], name: 'บัญชี' };

/* ── โลกย่อส่วน: ใบสาย SERVICE (โครงการ SERVICE · ดีล PRODUCT) ตั้งงานบริการครบ ──────────────────────────── */
const TAX = '0105556000123';
const soRow = (over = {}) => ({
  id: 'SO1', orderNumber: 'SO-26090001-0', status: 'draft', origin: 'pipeline', customerId: 'C1',
  dealId: 'DL1', projectId: 'PJ1', quotationId: 'QT1', revisedFromId: null, supersededById: null,
  totalAmount: 120000, actualAmount: 0, approvedAt: null, updatedAt: UPDATED_AT, serviceContractId: 'CT1',
  servicePeriodFrom: '2026-10-01', servicePeriodTo: '2027-09-30', serviceTermsOpenedAt: null,
  serviceSetupState: null, serviceSetupSubmittedAt: null, serviceSetupSubmittedById: null, serviceSetupSubmittedByName: null,
  createdBy: 'U-AE', submittedBy: null, submittedByName: null, metadata: {}, ...over,
});
const backfillRow = (over = {}) => soRow({
  status: 'approved', approvedAt: '2026-08-15T02:00:00+00:00', actualAmount: 120000, ...over,
});
const submittedRow = (over = {}) => backfillRow({
  serviceSetupState: 'submitted', serviceSetupSubmittedAt: '2026-09-27T02:00:00+00:00',
  serviceSetupSubmittedById: 'U-AE', serviceSetupSubmittedByName: 'เอ ขายดี', ...over,
});

const line = (id, sortOrder, over = {}) => ({
  id, salesOrderId: 'SO1', quotationLineId: `Q${id}`, productId: null, fgCode: null, description: `บรรทัด ${id}`,
  qty: 12, unit: 'แพ็คเกจ', sortOrder, metadata: { note: `สาขา ${id}` },
  serviceKind: null, serviceProductId: null, serviceFgCode: null, serviceRounds: null, ...over,
});

function world({ order = soRow(), over = {}, lines = null } = {}) {
  return {
    customers: [
      { id: 'C1', arCode: 'AR-0100', name: 'บริษัท เอ', taxId: TAX, branchCode: '00000', isActive: true, isForeign: false, approvalStatus: 'approved', billingRule: { kind: 'monthly', day: 25 } },
      { id: 'C2', arCode: 'AR-0790', name: 'บริษัท เอ (สาขา)', taxId: TAX, branchCode: '00001', isActive: true, isForeign: false, approvalStatus: 'approved', billingRule: null },
      { id: 'C3', arCode: 'AR-0999', name: 'บริษัท อื่น', taxId: '0105556000999', branchCode: '00000', isActive: true, isForeign: false, approvalStatus: 'approved', billingRule: null },
    ],
    projects: [{ id: 'PJ1', line: 'SERVICE' }],
    sales_deals: [{ id: 'DL1', line: 'PRODUCT', ownerId: 'U-AE', team: 'T1' }],
    sales_orders: [
      order,
      { id: 'SO-A', orderNumber: 'SO-26080073-0', status: 'approved', supersededById: null },
    ],
    sales_order_lines: lines || [
      line('L1', 1, { fgCode: 'FG-0100-03-002-00009', productId: 'P9', description: 'ค่าขนส่ง' }),
      line('L2', 2, { serviceKind: 'package', serviceProductId: 'P1', serviceFgCode: 'FG-0100-02-001-00001', serviceRounds: 12 }),
      line('L3', 3, { serviceKind: 'not_service', description: 'ค่าออกแบบ' }),
    ],
    sales_order_line_zones: [
      { id: 'A1', salesOrderId: 'SO1', salesOrderLineId: 'L2', zoneId: 'Z1', packsPerRound: 1, sortOrder: 0 },
      { id: 'A2', salesOrderId: 'SO1', salesOrderLineId: 'L2', zoneId: 'Z2', packsPerRound: 2, sortOrder: 1 },
    ],
    service_zones: [
      { id: 'Z1', code: 'ZN-1', name: 'Lobby', siteId: 'S1', isActive: true },
      { id: 'Z2', code: 'ZN-2', name: 'ห้องประชุม', siteId: 'S1', isActive: true },
      { id: 'Z3', code: 'ZN-3', name: 'ทางเข้า', siteId: 'S2', isActive: true },
      { id: 'Z9', code: 'ZN-9', name: 'โซนลูกค้าอื่น', siteId: 'S9', isActive: true },
    ],
    service_sites: [
      { id: 'S1', code: 'ST-1', name: 'บางนา', customerId: 'C1', kind: 'customer', isActive: true },
      { id: 'S2', code: 'ST-2', name: 'สีลม', customerId: 'C1', kind: 'customer', isActive: true },
      { id: 'S7', code: 'ST-7', name: 'สาขาพี่น้อง', customerId: 'C2', kind: 'customer', isActive: true },
      { id: 'S9', code: 'ST-9', name: 'ลูกค้าอื่น', customerId: 'C3', kind: 'customer', isActive: true },
    ],
    products: [
      { id: 'P1', fgCode: 'FG-0100-02-001-00001', productDescription: 'แพ็คเกจ SDS', customerId: 'C1', isActive: true, approvalStatus: 'approved' },
      { id: 'P2', fgCode: 'FG-0790-02-001-00002', productDescription: 'แพ็คเกจสาขา', customerId: 'C2', isActive: true, approvalStatus: null },
      { id: 'P6', fgCode: 'FG-0999-02-001-00006', productDescription: 'ของลูกค้าอื่น', customerId: 'C3', isActive: true, approvalStatus: 'approved' },
      { id: 'P9', fgCode: 'FG-0100-03-002-00009', productDescription: 'ค่าขนส่ง', customerId: 'C1', isActive: true, approvalStatus: 'approved' },
    ],
    sales_order_installments: [
      { id: 'I1', salesOrderId: 'SO1', seq: 1, status: 'pending', amount: 60000, dueDate: '2026-10-25', billingDate: '2026-10-25', coversFrom: '2026-10-01', coversTo: '2027-03-31' },
      { id: 'I2', salesOrderId: 'SO1', seq: 2, status: 'pending', amount: 60000, dueDate: '2027-04-25', billingDate: '2027-04-25', coversFrom: '2027-04-01', coversTo: '2027-09-30' },
    ],
    sales_contracts: [{ id: 'CT1', contractNo: 'CT-2609-001', status: 'signed', effectiveDate: '2026-10-01', expiryDate: '2027-09-30' }],
    service_zone_terms: [],
    service_plans: [],
    ...over,
  };
}

const rpcOk = (data) => () => ({ data, error: null });
const rpcRaise = (message, details = '') => () => ({ data: null, error: { message, details, code: 'P0001' } });
const withoutUnset = (tables) => tables.sales_order_lines.map((l) => (l.id === 'L3' ? { ...l, serviceKind: null } : l));

/* ══ GET ═══════════════════════════════════════════════════════════════════════════════════════════ */

test('GET — เจ้าของดีลเห็นก้อนเต็มของ serviceSetupView · โหมดแก้ · เวลาของใบดิบ · สายธุรกิจจากโครงการ', async () => {
  const f = fakeSupabase(world());
  const res = await serviceSetupGet({ supabase: f.client, user: AE, id: 'SO1' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const body = res.body;
  assert.equal(body.orderId, 'SO1');
  assert.equal(body.updatedAt, UPDATED_AT, 'ส่งค่าดิบ (ไมโครวินาที) ให้จอส่งกลับเป็น expectedUpdatedAt');
  assert.equal(body.flow, 'pipeline', 'ดีล PRODUCT แต่โครงการ SERVICE ⇒ ใบสายบริการ');
  assert.equal(body.mode, 'edit');
  assert.equal(body.editBlockedReason, null);
  assert.deepEqual(body.lines.map((l) => [l.lineId, l.lineNo, l.role]), [['L1', 1, 'not_service'], ['L2', 2, 'package'], ['L3', 3, 'not_service']]);
  assert.deepEqual(body.issues, [], 'ตั้งครบแล้ว');
  assert.deepEqual(body.fgOptions.map((o) => [o.id, o.ownerArCode]), [['P1', null], ['P2', 'AR-0790']], 'ตัวเลือก FG ของนิติบุคคลเดียวกัน');
  for (const key of ['warnings', 'totals', 'approvalEffects', 'approvalChecklist', 'approvalSubject', 'submitLine', 'stripText',
    'hero', 'backfillSubmitPrompt', 'revisedFrom', 'backfill', 'liveTermsInfo', 'allocations', 'zones', 'sites', 'siblingSites', 'state', 'period']) {
    assert.ok(Object.prototype.hasOwnProperty.call(body, key), `ก้อน GET ต้องมี ${key}`);
  }
  assert.equal(body.totals.zones, 2);
  assert.equal(f.rpcCalls.length, 0, 'GET ไม่เขียนอะไร');
  const orderRead = f.calls.find((c) => c.table === 'sales_orders' && c.single);
  assert.match(orderRead.select, /deal:sales_deals\(\*\)/, 'อ่านใบผ่าน loadScoped (join ดีลมาตรวจขอบเขต)');
});

test('GET — ฝ่ายบัญชีอ่านได้แต่แก้ไม่ได้ ⇒ โหมดอ่าน + เหตุผลจาก server', async () => {
  const f = fakeSupabase(world());
  const res = await serviceSetupGet({ supabase: f.client, user: FN, id: 'SO1' });
  assert.equal(res.status, 200);
  assert.equal(res.body.mode, 'read');
  assert.equal(res.body.editBlockedReason, SERVICE_SETUP_EDIT_TEXT.noRight);
  assert.equal(res.body.backfill.canSubmit, false);
});

test('GET — อ่านตัวเลือก FG ไม่ขึ้น = 500 ข้อความไทย (ไม่เดาว่าไม่มีแพ็คเกจ)', async () => {
  const f = fakeSupabase(world(), {
    fail: (state) => (state.table === 'products' && state.inColumn === 'customerId' ? { message: 'connection reset' } : null),
  });
  const res = await serviceSetupGet({ supabase: f.client, user: AE, id: 'SO1' });
  assert.equal(res.status, 500);
  assert.match(res.body.error, /^โหลดงานบริการไม่สำเร็จ: /);
  assert.match(res.body.error, /connection reset/);
});

test('GET — นอกขอบเขตอ่าน = 403 ก่อนแตะบริบท · ไม่พบใบ = 404', async () => {
  const f = fakeSupabase(world());
  const res = await serviceSetupGet({ supabase: f.client, user: AE_OTHER, id: 'SO1' });
  assert.equal(res.status, 403);
  assert.deepEqual([...new Set(f.calls.map((c) => c.table))], ['sales_orders'], 'ไม่โหลดงานบริการของใบที่ไม่มีสิทธิ์');
  const missing = await serviceSetupGet({ supabase: fakeSupabase(world()).client, user: AE, id: 'SO-NONE' });
  assert.equal(missing.status, 404);
});

/* ══ PATCH ═════════════════════════════════════════════════════════════════════════════════════════ */

const patchBody = (over = {}) => ({
  expectedUpdatedAt: UPDATED_AT,
  period: { from: '2026-10-01', to: '2027-09-30' },
  lines: [{ lineId: 'L2', serviceProductId: 'P1', rounds: 12, zones: [{ zoneId: 'Z1', packsPerRound: 1 }, { zoneId: 'Z3', packsPerRound: 3 }] }],
  ...over,
});

test('PATCH — บันทึกสำเร็จ: RPC ได้ก้อนที่ตรวจแล้ว + เวลาดิบ + ผู้ทำ · audit หลัง RPC · ตอบข้อที่ยังขาดของบริบทใหม่', async () => {
  const tables = world();
  const f = fakeSupabase(tables, {
    rpc: {
      save_sales_order_service_setup: (params) => {
        /* จำลองฐาน: เขียนโซนของบรรทัด L2 ใหม่ทั้งชุด + เวลาใหม่ */
        const next = params.p_payload.lines[0].zones.map((z, i) => ({
          id: `SLZ-${z.zoneId}`, salesOrderId: 'SO1', salesOrderLineId: 'L2', zoneId: z.zoneId, packsPerRound: z.packsPerRound, sortOrder: i,
        }));
        tables.sales_order_line_zones = next;
        tables.sales_orders[0] = { ...tables.sales_orders[0], updatedAt: '2026-09-28T04:00:00.654321+00:00' };
        return { data: { updatedAt: '2026-09-28T04:00:00.654321+00:00', lines: 1, zones: next.length }, error: null };
      },
    },
  });
  const request = { headers: new Map() };
  const res = await serviceSetupPatch({ supabase: f.client, user: AE, id: 'SO1', body: patchBody(), request, audit: f.audit });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(f.rpcCalls.length, 1);
  const { fn, params } = f.rpcCalls[0];
  assert.equal(fn, 'save_sales_order_service_setup');
  assert.equal(params.p_order_id, 'SO1');
  assert.equal(params.p_expected_updated_at, UPDATED_AT, 'ห้ามแปลงผ่าน Date — ไมโครวินาทีต้องอยู่ครบ');
  assert.deepEqual(params.p_payload, {
    period: { from: '2026-10-01', to: '2027-09-30' },
    lines: [{ lineId: 'L2', serviceProductId: 'P1', rounds: 12, zones: [{ zoneId: 'Z1', packsPerRound: 1, sortOrder: 0 }, { zoneId: 'Z3', packsPerRound: 3, sortOrder: 1 }] }],
  });
  assert.equal(params.p_actor_id, 'U-AE');
  assert.equal(params.p_actor_role, 'ae');
  assert.equal(res.body.updatedAt, '2026-09-28T04:00:00.654321+00:00');
  assert.deepEqual(res.body.issues, []);
  assert.equal(res.body.totals.zones, 2);
  assert.equal(res.body.totals.sites, 2, 'บริบทใหม่เห็นโซน Z3 ของไซต์สีลม');
  assert.ok(Array.isArray(res.body.warnings));

  assert.equal(f.audits.length, 1);
  const entry = f.audits[0];
  assert.equal(entry.entityType, 'sales_order');
  assert.equal(entry.entityId, 'SO1');
  assert.equal(entry.request, request);
  assert.equal(entry.summary, 'บันทึกงานบริการ SO-26090001-0 — 1 รายการ · 2 โซน');
  assert.deepEqual(entry.before.serviceSetup.lines.find((l) => l.lineId === 'L2').zones.map((z) => z.zoneId), ['Z1', 'Z2']);
  assert.deepEqual(entry.after.serviceSetup.lines.find((l) => l.lineId === 'L2').zones.map((z) => z.zoneId), ['Z1', 'Z3']);
  assert.ok(f.events.indexOf('audit') > f.events.indexOf('rpc:save_sales_order_service_setup'), 'audit หลัง RPC');
  const zoneRead = f.calls.find((c) => c.table === 'service_zones' && c.inValues?.includes('Z3'));
  assert.ok(zoneRead, 'โซนที่ก้อนอ้าง (Z3) ต้องโหลดมาให้ตัวตรวจเห็นไซต์ของมันก่อนยิง RPC');
});

test('PATCH — ก้อนผิดรูป = 400 fieldErrors ก่อนถึง RPC (แพ็ค 0 · รอบ 0 · โซนของลูกค้าอื่น)', async () => {
  const f = fakeSupabase(world());
  const body = patchBody({
    lines: [{ lineId: 'L2', rounds: 0, zones: [{ zoneId: 'Z1', packsPerRound: 0 }, { zoneId: 'Z9', packsPerRound: 1 }] }],
  });
  const res = await serviceSetupPatch({ supabase: f.client, user: AE, id: 'SO1', body, audit: f.audit });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'บันทึกงานบริการไม่ได้ — ตรวจช่องที่ขึ้นสีแดง');
  const fields = res.body.fieldErrors.map((e) => `${e.field}:${e.zoneId || ''}`).sort();
  assert.deepEqual(fields, ['packs:Z1', 'rounds:', 'zones:Z9']);
  assert.match(res.body.fieldErrors.find((e) => e.zoneId === 'Z9').message, /ลูกค้ารายอื่น/);
  assert.equal(f.rpcCalls.length, 0);
  assert.equal(f.audits.length, 0);
});

test('PATCH — ใบถูกแก้จากอีกหน้าต่าง (workflow_stale) = 409 ข้อความไทย · ไม่ลง audit', async () => {
  const f = fakeSupabase(world(), { rpc: { save_sales_order_service_setup: rpcRaise('workflow_stale') } });
  const res = await serviceSetupPatch({ supabase: f.client, user: AE, id: 'SO1', body: patchBody(), audit: f.audit });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'ใบนี้ถูกแก้จากอีกหน้าต่าง — โหลดข้อมูลล่าสุดแล้ว');
  assert.equal(res.body.code, 'workflow_stale');
  assert.equal(f.audits.length, 0);
});

test('PATCH — รหัสที่ฐานตอบแต่ไม่รู้จัก = 500 ข้อความกลาง (ไม่ส่งข้อความดิบของฐานออกจอ)', async () => {
  const f = fakeSupabase(world(), { rpc: { save_sales_order_service_setup: rpcRaise('relation "x" does not exist') } });
  const original = console.error;
  console.error = () => {};
  try {
    const res = await serviceSetupPatch({ supabase: f.client, user: AE, id: 'SO1', body: patchBody(), audit: f.audit });
    assert.equal(res.status, 500);
    assert.doesNotMatch(res.body.error, /relation/);
  } finally {
    console.error = original;
  }
  assert.equal(f.audits.length, 0);
});

test('PATCH — ไม่มีสิทธิ์แก้ (บัญชี) = 403 ก่อนอ่านอะไรเลย', async () => {
  const f = fakeSupabase(world());
  const res = await serviceSetupPatch({ supabase: f.client, user: FN, id: 'SO1', body: patchBody(), audit: f.audit });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, SERVICE_SETUP_EDIT_TEXT.noRight);
  assert.equal(f.calls.length, 0);
  assert.equal(f.rpcCalls.length, 0);
});

test('PATCH — ใบรออนุมัติ = 409 ข้อความล็อก · ไม่ยิง RPC', async () => {
  const f = fakeSupabase(world({ order: soRow({ status: 'pending_approval' }) }));
  const res = await serviceSetupPatch({ supabase: f.client, user: AE, id: 'SO1', body: patchBody(), audit: f.audit });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, SERVICE_SETUP_EDIT_TEXT.pending);
  assert.equal(f.rpcCalls.length, 0);
});

test('PATCH — สายธุรกิจตัดสินจากบริบท: โครงการไม่มีสาย + ดีล PRODUCT = ไม่ใช่ใบสายบริการ (409)', async () => {
  const f = fakeSupabase(world({ over: { projects: [{ id: 'PJ1', line: null }] } }));
  const res = await serviceSetupPatch({ supabase: f.client, user: AE, id: 'SO1', body: patchBody(), audit: f.audit });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, SERVICE_SETUP_EDIT_TEXT.notService);
  assert.equal(f.rpcCalls.length, 0);
});

test('PATCH — ไม่มีเวลาของใบในคำขอ = 400 · ก้อนอ้างโซนเกินเพดาน = 400 ก่อนไล่อ่านทะเบียน', async () => {
  const f = fakeSupabase(world());
  const noVersion = await serviceSetupPatch({ supabase: f.client, user: AE, id: 'SO1', body: { lines: [] }, audit: f.audit });
  assert.equal(noVersion.status, 400);
  assert.match(noVersion.body.error, /เวอร์ชันของเอกสาร/);

  const g = fakeSupabase(world());
  const huge = Array.from({ length: 11 }, (_, i) => ({
    lineId: `L${i}`, zones: Array.from({ length: 500 }, (__, j) => ({ zoneId: `ZX-${i}-${j}`, packsPerRound: 1 })),
  }));
  const res = await serviceSetupPatch({ supabase: g.client, user: AE, id: 'SO1', body: patchBody({ lines: huge }), audit: g.audit });
  assert.equal(res.status, 400);
  assert.equal(res.body.fieldErrors[0].field, 'payload');
  assert.equal(g.calls.some((c) => c.table === 'service_zones'), false, 'ไม่ไล่อ่านโซนหลายพันตัวก่อนตีกลับ');
});

/* ══ POST submit ═══════════════════════════════════════════════════════════════════════════════════ */

test('POST submit — ใบย้อนหลังที่ยังขาด = 400 พร้อมข้อที่ยังขาด · ไม่ยิง RPC', async () => {
  const tables = world({ order: backfillRow() });
  tables.sales_order_lines = withoutUnset(tables);
  const f = fakeSupabase(tables);
  const res = await serviceSetupPost({ supabase: f.client, user: AE, id: 'SO1', body: { action: 'submit', expectedUpdatedAt: UPDATED_AT }, audit: f.audit });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'ยื่นตรวจไม่ได้ — ยังขาด 1 ข้อ');
  assert.deepEqual(res.body.issues.map((i) => [i.key, i.lineId, i.lineNo]), [['kind_missing', 'L3', 3]]);
  assert.equal(f.rpcCalls.length, 0);
});

test('POST submit — ครบแล้ว: RPC ยื่นตรวจ · audit หลัง RPC · ตอบแถวใบ', async () => {
  const f = fakeSupabase(world({ order: backfillRow() }), {
    rpc: { submit_sales_order_service_setup: rpcOk({ id: 'SO1', serviceSetupState: 'submitted', serviceSetupSubmittedAt: '2026-09-28T05:00:00+00:00' }) },
  });
  const res = await serviceSetupPost({ supabase: f.client, user: AE, id: 'SO1', body: { action: 'submit', expectedUpdatedAt: UPDATED_AT }, audit: f.audit });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.order.serviceSetupState, 'submitted');
  assert.deepEqual(f.rpcCalls.map((c) => c.fn), ['submit_sales_order_service_setup']);
  assert.equal(f.rpcCalls[0].params.p_expected_updated_at, UPDATED_AT);
  assert.equal(f.audits[0].summary, 'ยื่นตรวจงานบริการ (ใบเดิม) SO-26090001-0 — 2 โซนใน 1 ไซต์');
  assert.ok(f.events.indexOf('audit') > f.events.indexOf('rpc:submit_sales_order_service_setup'));
});

test('POST submit — ใบร่าง (ขั้น pipeline) / ยื่นไปแล้ว = 409', async () => {
  const draft = fakeSupabase(world());
  const a = await serviceSetupPost({ supabase: draft.client, user: AE, id: 'SO1', body: { action: 'submit', expectedUpdatedAt: UPDATED_AT }, audit: draft.audit });
  assert.equal(a.status, 409);
  assert.equal(a.body.error, MSG.service_setup_state_invalid.message);

  const sent = fakeSupabase(world({ order: submittedRow() }));
  const b = await serviceSetupPost({ supabase: sent.client, user: AE, id: 'SO1', body: { action: 'submit', expectedUpdatedAt: UPDATED_AT }, audit: sent.audit });
  assert.equal(b.status, 409);
  assert.equal(b.body.error, SERVICE_SETUP_EDIT_TEXT.backfillSubmitted);
  assert.equal(draft.rpcCalls.length + sent.rpcCalls.length, 0);
});

test('POST submit — ฐานบอกว่ายังไม่ครบ (ของเปลี่ยนระหว่างทาง) = 409 + ข้อที่ยังขาดพร้อมเลขรายการ', async () => {
  const f = fakeSupabase(world({ order: backfillRow() }), {
    rpc: { submit_sales_order_service_setup: rpcRaise('sales_order_service_setup_incomplete', 'packs_missing:L2:Z2,period_missing') },
  });
  const res = await serviceSetupPost({ supabase: f.client, user: AE, id: 'SO1', body: { action: 'submit', expectedUpdatedAt: UPDATED_AT }, audit: f.audit });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'sales_order_service_setup_incomplete');
  assert.deepEqual(res.body.issues.map((i) => i.message), ['รายการ 2 · ห้องประชุม: ยังไม่ใส่แพ็คต่อรอบ', 'ยังไม่ใส่ช่วงบริการ (วันเริ่ม–วันสิ้นสุด)']);
  assert.equal(f.audits.length, 0);
});

/* ══ POST approve ══════════════════════════════════════════════════════════════════════════════════ */

const approveBody = (over = {}) => ({ action: 'approve', expectedUpdatedAt: UPDATED_AT, ...over });
const approvedResult = rpcOk({
  order: { id: 'SO1', serviceSetupState: null, serviceSetupApprovedAt: '2026-09-28T06:00:00+00:00', serviceTermsOpenedAt: '2026-09-28T06:00:00+00:00' },
  termsOpened: 2,
});

test('POST approve — ผู้จัดการคนอื่นอนุมัติ: RPC ไม่มีเหตุผล override · ตอบ order + termsOpened · audit หลัง RPC', async () => {
  const f = fakeSupabase(world({ order: submittedRow() }), { rpc: { approve_sales_order_service_setup: approvedResult } });
  const res = await serviceSetupPost({ supabase: f.client, user: SUP, id: 'SO1', body: approveBody(), audit: f.audit });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.termsOpened, 2);
  assert.equal(res.body.order.serviceSetupState, null);
  const { params } = f.rpcCalls[0];
  assert.equal(params.p_override_reason, null);
  assert.equal(params.p_actor_role, 'ae_supervisor');
  assert.equal(f.audits[0].summary, 'อนุมัติงานบริการ (ใบเดิม) SO-26090001-0 — เปิดรอบขาย 2 โซนให้ TS');
  assert.equal(f.audits[0].after.overrideReason, null);
  assert.ok(f.events.indexOf('audit') > f.events.indexOf('rpc:approve_sales_order_service_setup'));
});

test('POST approve — ผู้ยื่นที่ไม่ใช่แอดมินอนุมัติเอง = 403 ก่อนโหลดบริบท', async () => {
  const f = fakeSupabase(world({ order: submittedRow({ serviceSetupSubmittedById: 'U-SUP', serviceSetupSubmittedByName: 'หัวหน้า เอ' }) }));
  const res = await serviceSetupPost({ supabase: f.client, user: SUP, id: 'SO1', body: approveBody(), audit: f.audit });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'อนุมัติงานบริการที่ตัวเองยื่นไม่ได้ — ให้ผู้จัดการฝ่ายขายคนอื่นอนุมัติ');
  assert.equal(f.rpcCalls.length, 0);
  assert.deepEqual([...new Set(f.calls.map((c) => c.table))], ['sales_orders']);
});

test('POST approve — แอดมินที่ยื่นเอง: ไม่มีเหตุผล/สั้นไป = 400 · มีเหตุผล 10+ ตัวอักษร = RPC ได้เหตุผลที่จัดรูปแล้ว + ลง audit', async () => {
  const order = submittedRow({ serviceSetupSubmittedById: 'U-ADM', serviceSetupSubmittedByName: 'แอดมิน' });
  for (const overrideReason of [undefined, '', '   ', 'สั้นไป']) {
    const f = fakeSupabase(world({ order }), { rpc: { approve_sales_order_service_setup: approvedResult } });
    const res = await serviceSetupPost({ supabase: f.client, user: ADMIN, id: 'SO1', body: approveBody({ overrideReason }), audit: f.audit });
    assert.equal(res.status, 400, `เหตุผล ${JSON.stringify(overrideReason)}`);
    assert.equal(res.body.error, MSG.service_setup_override_reason_required.message);
    assert.equal(f.rpcCalls.length, 0);
  }
  const f = fakeSupabase(world({ order }), { rpc: { approve_sales_order_service_setup: approvedResult } });
  const res = await serviceSetupPost({
    supabase: f.client, user: ADMIN, id: 'SO1', body: approveBody({ overrideReason: '  ไม่มีผู้จัดการ   คนที่สองในวันนี้  ' }), audit: f.audit,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(f.rpcCalls[0].params.p_override_reason, 'ไม่มีผู้จัดการ คนที่สองในวันนี้');
  assert.match(f.audits[0].summary, / · Admin Override: ไม่มีผู้จัดการ คนที่สองในวันนี้$/);
  assert.equal(f.audits[0].after.overrideReason, 'ไม่มีผู้จัดการ คนที่สองในวันนี้');
});

test('POST approve — ใบที่ย้อนการอนุมัติแล้วแต่สถานะ submitted ค้าง = 409 (D28) · ไม่ยิง RPC', async () => {
  const f = fakeSupabase(world({ order: submittedRow({ status: 'approval_revoked' }) }));
  const res = await serviceSetupPost({ supabase: f.client, user: SUP, id: 'SO1', body: approveBody(), audit: f.audit });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, MSG.service_setup_review_state_invalid.message);
  assert.equal(f.rpcCalls.length, 0);
});

test('F1: POST approve — สายของโครงการเปลี่ยนเป็นสินค้าระหว่างรอตรวจ = 409 บอกทางออก (ตีกลับ) · ไม่ยิง RPC · ตีกลับยังทำได้', async () => {
  const tables = world({ order: submittedRow() });
  tables.projects = [{ id: 'PJ1', line: 'PRODUCT' }];
  const f = fakeSupabase(tables, { rpc: { approve_sales_order_service_setup: approvedResult } });
  const res = await serviceSetupPost({ supabase: f.client, user: SUP, id: 'SO1', body: approveBody(), audit: f.audit });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, SERVICE_SETUP_EDIT_TEXT.reviewNotService);
  assert.equal(SERVICE_SETUP_EDIT_TEXT.reviewNotService, 'ใบนี้ไม่ใช่ใบสายบริการแล้ว (สายของโครงการ/ดีลเปลี่ยน) — อนุมัติงานบริการไม่ได้ · ตีกลับเพื่อล้างคำขอตรวจ');
  assert.equal(f.rpcCalls.length, 0);
  assert.equal(f.audits.length, 0);
  const r = fakeSupabase(tables, { rpc: { reject_sales_order_service_setup: rpcOk({ id: 'SO1', serviceSetupState: 'rejected' }) } });
  const rejected = await serviceSetupPost({
    supabase: r.client, user: SUP, id: 'SO1', body: { action: 'reject', expectedUpdatedAt: UPDATED_AT, reason: 'สายเปลี่ยนเป็นสินค้าแล้ว ล้างคำขอ' }, audit: r.audit,
  });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
});

test('POST approve / reject — ไม่ใช่ผู้จัดการฝ่ายขาย = 403', async () => {
  for (const action of ['approve', 'reject']) {
    const f = fakeSupabase(world({ order: submittedRow() }));
    const res = await serviceSetupPost({
      supabase: f.client, user: AE, id: 'SO1', body: { action, expectedUpdatedAt: UPDATED_AT, reason: 'เหตุผลยาวพอสมควรแล้ว' }, audit: f.audit,
    });
    assert.equal(res.status, 403, action);
    assert.equal(res.body.error, MSG.service_setup_review_forbidden.message);
    assert.equal(f.rpcCalls.length, 0);
  }
});

test('POST approve — ของเปลี่ยนหลังยื่น (แพ็คเกจถูกปิด) = 409 ตีกลับให้แก้ · ไม่ยิง RPC', async () => {
  const tables = world({ order: submittedRow() });
  tables.products = tables.products.map((p) => (p.id === 'P1' ? { ...p, isActive: false } : p));
  const f = fakeSupabase(tables);
  const res = await serviceSetupPost({ supabase: f.client, user: SUP, id: 'SO1', body: approveBody(), audit: f.audit });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'อนุมัติไม่ได้ — งานบริการยังขาด 1 ข้อ · ตีกลับให้ฝ่ายขายแก้');
  assert.deepEqual(res.body.issues.map((i) => i.key), ['fg_invalid']);
  assert.equal(f.rpcCalls.length, 0);
});

test('POST approve — ฐานบอกว่ายังไม่ครบ = 409 + ข้อจาก DETAIL · รอบขายเดิมของ TS = 409 ข้อความ A.2', async () => {
  const f = fakeSupabase(world({ order: submittedRow() }), {
    rpc: { approve_sales_order_service_setup: rpcRaise('sales_order_service_setup_incomplete', 'zones_missing:L2') },
  });
  const res = await serviceSetupPost({ supabase: f.client, user: SUP, id: 'SO1', body: approveBody(), audit: f.audit });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body.issues.map((i) => i.message), ['รายการ 2: ยังไม่เลือกไซต์ · โซน']);
  assert.equal(f.audits.length, 0);

  const g = fakeSupabase(world({ order: submittedRow() }), {
    rpc: { approve_sales_order_service_setup: rpcRaise('service_setup_legacy_terms_exist') },
  });
  const legacy = await serviceSetupPost({ supabase: g.client, user: SUP, id: 'SO1', body: approveBody(), audit: g.audit });
  assert.equal(legacy.status, 409);
  assert.equal(legacy.body.error, MSG.service_setup_legacy_terms_exist.message);
});

/* ══ POST reject ═══════════════════════════════════════════════════════════════════════════════════ */

test('POST reject — เหตุผลตัดช่องว่างก่อนนับ: "   short   " = 400 · ยาวพอ = RPC ได้ค่าที่ตัดแล้ว + audit', async () => {
  const short = fakeSupabase(world({ order: submittedRow() }));
  const a = await serviceSetupPost({
    supabase: short.client, user: SUP, id: 'SO1', body: { action: 'reject', expectedUpdatedAt: UPDATED_AT, reason: '   short   ' }, audit: short.audit,
  });
  assert.equal(a.status, 400);
  assert.equal(a.body.error, MSG.workflow_reason_invalid.message);
  assert.equal(short.rpcCalls.length, 0);

  const f = fakeSupabase(world({ order: submittedRow() }), {
    rpc: { reject_sales_order_service_setup: rpcOk({ id: 'SO1', serviceSetupState: 'rejected' }) },
  });
  const reason = 'ช่วงบริการของสาขาบางนาไม่ตรงกับหมายเหตุ';
  const b = await serviceSetupPost({
    supabase: f.client, user: SUP2, id: 'SO1', body: { action: 'reject', expectedUpdatedAt: UPDATED_AT, reason: `  ${reason}  ` }, audit: f.audit,
  });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(f.rpcCalls[0].params.p_reason, reason);
  assert.equal(f.audits[0].summary, `ตีกลับงานบริการ (ใบเดิม) SO-26090001-0: ${reason}`);
  assert.ok(f.events.indexOf('audit') > f.events.indexOf('rpc:reject_sales_order_service_setup'));
});

test('POST — คำสั่งที่ไม่รู้จัก = 400 ก่อนอ่านอะไร', async () => {
  const f = fakeSupabase(world());
  const res = await serviceSetupPost({ supabase: f.client, user: AE, id: 'SO1', body: { action: 'withdraw' }, audit: f.audit });
  assert.equal(res.status, 400);
  assert.equal(f.calls.length, 0);
});

/* ══ proxy: เส้นนี้อยู่ใต้กฎ /api/sales-planning เดิม (ไม่แก้ proxy) ═════════════════════════════════════════════ */

test('proxy — ฝ่ายขายเขียนเส้นนี้ได้ · บัญชี/ผู้สังเกตการณ์เขียนไม่ได้ · อ่านได้ทุกคนที่ผ่านด่านหน้า', () => {
  const path_ = '/api/sales-planning/sales-orders/SO-1/service-setup';
  for (const method of ['PATCH', 'POST']) {
    assert.equal(apiWriteAllowed(method, path_, 'ae', []), true, `ae ${method}`);
    assert.equal(apiWriteAllowed(method, path_, 'ae_supervisor', []), true, `ae_supervisor ${method}`);
    assert.equal(apiWriteAllowed(method, path_, 'finance', []), false, `finance ${method}`);
    assert.equal(apiWriteAllowed(method, path_, 'viewer', []), false, `viewer ${method}`);
  }
  assert.equal(apiWriteAllowed('GET', path_, 'finance', []), true);
  assert.equal(lockedOut({ role: 'ae', extraCaps: [] }, path_, 'PATCH', true), false);
  assert.equal(lockedOut({ role: 'finance', extraCaps: [] }, path_, 'GET', true), false);
});

/* ══ ยามรูปซอร์ส ═════════════════════════════════════════════════════════════════════════════════════ */

const code = (file) => fs.readFileSync(path.join(WEBAPP, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ตัวฟังก์ชันระดับบนสุดตามชื่อ (ถึงฟังก์ชันถัดไป) */
function fnBody(src, name) {
  const start = src.search(new RegExp(`(async )?function ${name}\\(`));
  assert.ok(start >= 0, `ไม่พบฟังก์ชัน ${name}`);
  const rest = src.slice(start + 1);
  const next = rest.search(/\n(export )?(async )?function |\nconst [A-Z_]+ = \{/);
  return next >= 0 ? rest.slice(0, next) : rest;
}

test('รูปซอร์ส: route เป็นเปลือกบาง — withUser + ด่านอ่านทุก method + force-dynamic · ไม่แตะ supabase เอง', () => {
  const src = code(ROUTE_FILE);
  assert.match(src, /export const dynamic = 'force-dynamic';/);
  for (const method of ['GET', 'PATCH', 'POST']) {
    const block = src.slice(src.indexOf(`export const ${method} = withUser(`));
    assert.ok(src.includes(`export const ${method} = withUser(`), `${method} ต้องห่อด้วย withUser`);
    const own = block.slice(0, block.indexOf('});') + 3);
    assert.match(own, /if \(!user\) return unauthorized\(\);/);
    assert.match(own, /if \(!canViewSalesPlanning\(user\)\) return forbidden\(\);/);
  }
  assert.match(src, /serviceSetupGet\(\{ supabase, user, id \}\)/);
  assert.match(src, /serviceSetupPatch\(\{ supabase, user, id, body, request: req \}\)/);
  assert.match(src, /serviceSetupPost\(\{ supabase, user, id, body, request: req \}\)/);
  assert.equal(/\.from\(|\.rpc\(|\.in\(/.test(src), false, 'route ไม่อ่าน/เขียนฐานเอง — ตรรกะอยู่ที่ lib');
});

test('รูปซอร์ส: ทุกจุดโหลดบริบทส่ง withFgOptions: true (มีจุดเดียว) — serviceSetupIssues fail-closed', () => {
  for (const file of [ROUTE_FILE, LIB_FILE]) {
    const src = code(file);
    const calls = [...src.matchAll(/loadServiceSetupContext\(([^)]*)\)/g)];
    for (const call of calls) assert.match(call[1], /withFgOptions: true/, `${file}: ${call[0]}`);
    if (file === LIB_FILE) assert.equal(calls.length, 1, 'โหลดบริบทผ่าน contextOf จุดเดียว');
  }
});

test('รูปซอร์ส: GET อ่านใบด้วย loadScoped โหมด view · PATCH ตรวจสิทธิ์แก้และล็อกก่อนเขียน · audit หลัง RPC ทุกทาง', () => {
  const src = code(LIB_FILE);
  assert.match(fnBody(src, 'scopedOrder'), /loadScoped\(supabase, 'sales_orders', id, user, 'view'\)/);
  assert.match(fnBody(src, 'serviceSetupGet'), /scopedOrder\(supabase, user, id\)/);

  const patch = fnBody(src, 'serviceSetupPatch');
  const write = patch.indexOf('saveServiceSetup(');
  assert.ok(write > 0);
  assert.ok(patch.indexOf('canEditSalesPlanning(user)') < write, 'ด่าน cap ก่อนเขียน');
  assert.ok(patch.indexOf('canEditOrder(user, order)') < write, 'ด่านขอบเขตแก้ (inSalesEditScope) ก่อนเขียน');
  assert.ok(patch.indexOf('serviceSetupEditError(before.order') < write, 'ด่านล็อก (จากบริบท) ก่อนเขียน');
  assert.ok(patch.indexOf('validateServiceSetupPatch(body, before)') < write, 'ตรวจก้อนก่อนเขียน');
  assert.match(src, /const canEditOrder = \(user, order\) => canEditSalesPlanning\(user\) && inSalesEditScope\(user, order\?\.deal\);/);

  for (const [name, rpc] of [['serviceSetupPatch', 'saveServiceSetup('], ['submitBackfill', 'submitServiceBackfill('],
    ['approveBackfill', 'approveServiceBackfill('], ['rejectBackfill', 'rejectServiceBackfill(']]) {
    const body = fnBody(src, name);
    const at = body.indexOf(rpc);
    assert.ok(at > 0, `${name} ต้องเรียก ${rpc}`);
    assert.ok(body.indexOf('await auditOrder(audit') > at, `${name}: audit ต้องอยู่หลัง RPC`);
    assert.match(body, new RegExp(`const \\{ data, error \\} = await ${rpc.replace('(', '\\(')}`), `${name}: ต้องรับ error ของ RPC`);
    assert.match(body.slice(at), /if \(error\) return rpcFailure\(error/, `${name}: RPC พังต้องตอบก่อนลง audit`);
  }
});

test('รูปซอร์ส: ไม่มี .in() / supabase.rpc / .from ดิบในเส้นนี้ — อ่านผ่าน loadScoped + ตัวโหลดบริบท เขียนผ่าน RPC wrapper', () => {
  const src = code(LIB_FILE);
  assert.equal(/\.in\(/.test(src), false, 'ลิสต์โซนจากก้อนต้องผ่านตัวโหลดที่ซอยก้อน');
  assert.equal(/\.rpc\(/.test(src), false, 'RPC ผ่าน serviceSetupRepo (แปลรหัส/รับ error ให้แล้ว)');
  assert.equal(/\.from\(/.test(src), false);
  assert.equal(/new Date\(/.test(src), false, 'เวลาของใบห้ามผ่าน Date');
});
