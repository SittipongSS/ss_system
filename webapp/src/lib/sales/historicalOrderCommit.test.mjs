// ── ตัวเขียนใบสั่งขายย้อนหลัง: ด่าน · พรีวิว · ยืนยันใบซ้ำ · RPC · ส่งซ้ำ · audit ─────────────────
// ยิงด้วย supabase ปลอม (แพตเทิร์น lib/forceDelete.test.mjs) — ห้ามแตะฐานจริง (dev DB = prod DB)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { commitHistoricalOrder } from './historicalOrderCommit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = new Date('2026-09-15T10:00:00+07:00');
const KEY = '4f0c9d2e-1b7a-4c1e-9f3d-8a6b5c4d3e2f';
const REPLAY_ID = `SOR-H${createHash('md5').update(KEY).digest('hex').slice(0, 16)}`;
const supervisor = { id: 'U-SUP', name: 'หัวหน้าขาย', email: 'sup@example.test', role: 'ae_supervisor' };
const customer = { id: 'CUS-1', name: 'บจก. เอ็มไพร์', nameEn: 'Empire Co.', approvalStatus: 'approved', isActive: true };
const owner = { ok: true, ownerId: 'U-AE', ownerName: 'สมชาย ขายเก่ง', team: 'SV', teams: ['SV'] };
const products = [
  { id: 'P-SV', fgCode: 'FG-AAA-02-001-0001', productDescription: 'บริการกระจายกลิ่น', saleUnit: 'เครื่อง' },
];

function fakeDb({ probeError = null, customerRow = customer, deals = [], orders = [], auditRow = null, rpc = [] } = {}) {
  const calls = { from: [], rpc: [] };
  const respond = (q) => {
    switch (q.table) {
      case 'sales_orders':
        if (q.selected.includes('historicalIntakeHash')) return { data: [], error: probeError };
        return { data: orders, error: null };
      case 'sales_order_lines': return { data: [], error: null };
      case 'customers': return { data: customerRow, error: null };
      case 'products': {
        const ids = q.filters.find((f) => f[0] === 'in')?.[2] || [];
        return { data: products.filter((p) => ids.includes(p.id)), error: null };
      }
      case 'sales_deals': return { data: deals, error: null };
      case 'audit_logs': return { data: auditRow, error: null };
      default: throw new Error(`unexpected table ${q.table}`);
    }
  };
  const supabase = {
    from(table) {
      const q = { table, selected: '', filters: [] };
      calls.from.push(q);
      const builder = {
        select(cols) { q.selected = String(cols); return builder; },
        eq(col, val) { q.filters.push(['eq', col, val]); return builder; },
        in(col, val) { q.filters.push(['in', col, val]); return builder; },
        order() { return builder; },
        range() { return builder; },
        limit() { return builder; },
        maybeSingle() { return builder; },
        then(resolve, reject) {
          try { resolve(respond(q)); } catch (error) { reject(error); }
        },
      };
      return builder;
    },
    rpc(name, args) {
      calls.rpc.push({ name, args });
      const next = rpc.length > 1 ? rpc.shift() : rpc[0];
      return Promise.resolve(typeof next === 'function' ? next(args) : next);
    },
  };
  return { supabase, calls };
}

const body = (extra = {}) => ({
  preview: false,
  intakeKey: KEY,
  running: true,
  customerId: 'CUS-1',
  ownerId: 'U-AE',
  orderDate: '2024-06-01',
  refs: { quote: 'Q#250313-0004-D', express: null, invoice: 'IV6801041' },
  lines: [
    { installationPoint: 'Empire Tower · ล็อบบี้ ชั้น G', productId: 'P-SV', qty: 2, lineAmount: 60320, serviceRounds: 36 },
  ],
  installments: [{ label: 'งวด 3/3', amount: 30160, dueDate: '2026-12-01', coversFrom: '2026-06-01', coversTo: '2027-05-31' }],
  ...extra,
});

const created = (extra = {}) => ({
  data: {
    replayed: false,
    order: {
      id: REPLAY_ID, orderNumber: 'SO-26090191-0', origin: 'historical', dealId: 'DEAL-NEW',
      historicalQuoteRef: 'Q#250313-0004-D', historicalInvoiceRef: 'IV6801041',
    },
    lines: [{ id: 'SOL-1' }],
    installments: [{ id: 'SOI-1' }],
    deal: { id: 'DEAL-NEW', code: 'DL-260900513', customerName: 'บจก. เอ็มไพร์', ownerName: 'สมชาย ขายเก่ง' },
    dealCreated: true,
    ...extra,
  },
  error: null,
});

async function run(db, extra = {}, { user = supervisor, ownerResult = owner } = {}) {
  const audits = [];
  const result = await commitHistoricalOrder({
    supabase: db.supabase,
    user,
    body: body(extra),
    now: NOW,
    audit: async (entry) => { audits.push(entry); },
    validateOwner: async () => ownerResult,
  });
  return { ...result, audits };
}

test('ด่าน: AE ธรรมดา = 403 และไม่อ่านฐานเลย', async () => {
  const db = fakeDb();
  const res = await run(db, {}, { user: { id: 'U-AE', role: 'ae' } });
  assert.equal(res.status, 403);
  assert.equal(db.calls.from.length, 0);
  assert.equal(db.calls.rpc.length, 0);
});

test('บันทึกจริงไม่มีรหัสการคีย์ = 400 ก่อนอ่านฐาน', async () => {
  const db = fakeDb();
  const res = await run(db, { intakeKey: '' });
  assert.equal(res.status, 400);
  assert.equal(db.calls.from.length, 0);
});

test('พรีวิว: คืนแผน และไม่เรียก RPC เด็ดขาด', async () => {
  const db = fakeDb({ rpc: [created()] });
  const res = await run(db, { preview: true, intakeKey: undefined });
  assert.equal(res.status, 200);
  assert.equal(res.body.preview, true);
  assert.equal(res.body.plan.header.totalAmount, 60320);
  assert.equal(res.body.plan.deal.willCreate, true);
  assert.equal(db.calls.rpc.length, 0);
});

test('ยังไม่ได้รัน 0360 (42703 ตอนตรวจคอลัมน์) = 503 ไม่ใช่ 500', async () => {
  const db = fakeDb({ probeError: { code: '42703', message: 'column sales_orders.origin does not exist' } });
  const res = await run(db);
  assert.equal(res.status, 503);
  assert.match(res.body.error, /0360/);
  assert.equal(db.calls.rpc.length, 0);
});

test('แผนมี error = 400 พร้อมรายช่อง · ไม่เรียก RPC', async () => {
  const db = fakeDb({ rpc: [created()] });
  const res = await run(db, { ownerId: null });
  assert.equal(res.status, 400);
  assert.ok(res.body.errors.some((e) => e.field === 'ownerId'));
  assert.equal(db.calls.rpc.length, 0);
});

test('ใบที่อาจซ้ำยังไม่ยืนยัน = 409 + รายการ · ยืนยันแล้วบันทึกต่อได้', async () => {
  const orders = [{ id: 'SOR-OLD', orderNumber: 'SO-26090001-0', orderDate: '2024-06-01', status: 'approved' }];
  const blocked = fakeDb({ orders, rpc: [created()] });
  const res = await run(blocked);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'historical_so_duplicate_unacknowledged');
  assert.deepEqual(res.body.duplicates.map((d) => d.id), ['SOR-OLD']);
  assert.equal(blocked.calls.rpc.length, 0);

  const acknowledged = fakeDb({ orders, rpc: [created()] });
  assert.equal((await run(acknowledged, { acknowledgeDuplicates: true })).status, 201);
  assert.equal(acknowledged.calls.rpc.length, 1);
});

test('ส่งซ้ำหลังเน็ตหลุด: ใบของรหัสการคีย์นี้เองไม่นับเป็นใบซ้ำ', async () => {
  const orders = [{ id: REPLAY_ID, orderNumber: 'SO-26090191-0', orderDate: '2024-06-01', status: 'approved' }];
  const db = fakeDb({ orders, rpc: [created({ replayed: true, dealCreated: false })], auditRow: { id: 'AUD-1' } });
  const res = await run(db);
  assert.equal(res.status, 200);
  assert.equal(db.calls.rpc.length, 1);
});

test('บันทึก: RPC ครั้งเดียว · ลายนิ้วมือ 64 hex · ดีลใหม่ได้ถัง/prefix/ความกว้าง DL · audit ใบ + ดีล', async () => {
  const db = fakeDb({ rpc: [created()] });
  const res = await run(db);
  assert.equal(res.status, 201);
  assert.equal(res.body.replayed, false);
  assert.equal(db.calls.rpc.length, 1);
  const { name, args } = db.calls.rpc[0];
  assert.equal(name, 'create_historical_sales_order');
  assert.equal(args.p_intake_key, KEY);
  assert.match(args.p_intake_hash, /^[0-9a-f]{64}$/);
  assert.equal(args.p_actor_role, 'ae_supervisor');
  assert.equal(args.p_header.ownerId, 'U-AE');
  assert.equal(args.p_header.team, 'SV');
  assert.equal(args.p_new_deal.ownerName, 'สมชาย ขายเก่ง');
  assert.equal(args.p_new_deal.month, '26');
  assert.equal(args.p_new_deal.prefix, 'DL-2609');
  assert.equal(args.p_new_deal.width, 5);
  assert.match(args.p_new_deal.id, /^DEAL-/);
  assert.match(args.p_new_deal.historyId, /^DSH-/);
  assert.match(args.p_new_deal.title, /บจก\. เอ็มไพร์/);
  assert.deepEqual(res.audits.map((a) => a.entityType), ['sales_order', 'sales_deal']);
  assert.match(res.audits[0].summary, /SO-26090191-0/);
  assert.match(res.audits[0].summary, /IV6801041/);

  const reuse = fakeDb({ rpc: [created({ dealCreated: false })] });
  const second = await run(reuse);
  assert.deepEqual(second.audits.map((a) => a.entityType), ['sales_order']);
  // คำขอเดิมทุกตัวอักษร = ลายนิ้วมือเดิม · ต่างช่องเดียว = คนละลายนิ้วมือ
  assert.equal(reuse.calls.rpc[0].args.p_intake_hash, args.p_intake_hash);
  const changed = fakeDb({ rpc: [created()] });
  await run(changed, { notes: 'ต่างไปหนึ่งช่อง' });
  assert.notEqual(changed.calls.rpc[0].args.p_intake_hash, args.p_intake_hash);
});

test('23505 ของ sales_orders_pkey = ยิงซ้ำหนึ่งครั้ง (2 calls)', async () => {
  const db = fakeDb({
    rpc: [
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "sales_orders_pkey"' } },
      created({ replayed: true, dealCreated: false }),
    ],
    auditRow: { id: 'AUD-1' },
  });
  const res = await run(db);
  assert.equal(db.calls.rpc.length, 2);
  assert.equal(res.status, 200);
});

test('แข่งกับการย้ายเจ้าของ: race code หรือ 23505 ของดีลภาชนะที่หลุดมา = 409 "กดบันทึกอีกครั้ง" ไม่ใช่ข้อความของการย้ายเจ้าของ', async () => {
  for (const error of [
    { code: 'P0001', message: 'historical_so_container_deal_race' },
    { code: '23505', message: 'duplicate key value violates unique constraint "sales_deals_historical_container_uk"' },
  ]) {
    const db = fakeDb({ rpc: [{ data: null, error }] });
    const res = await run(db);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'historical_so_container_deal_race');
    assert.match(res.body.error, /กดบันทึกอีกครั้ง/);
    assert.doesNotMatch(res.body.error, /อยู่แล้ว/);
    assert.equal(db.calls.rpc.length, 1);
  }
});

test('ส่งซ้ำ: รอบแรกยังไม่มี audit = เขียน (บันทึกจากการส่งซ้ำ) · มีแล้ว = ไม่เขียนซ้ำ', async () => {
  const missing = fakeDb({ rpc: [created({ replayed: true, dealCreated: false })], auditRow: null });
  const first = await run(missing);
  assert.equal(first.status, 200);
  assert.equal(first.audits.length, 1);
  assert.match(first.audits[0].summary, /ส่งซ้ำ/);
  const auditRead = missing.calls.from.find((q) => q.table === 'audit_logs');
  assert.deepEqual(auditRead.filters, [['eq', 'entityType', 'sales_order'], ['eq', 'entityId', REPLAY_ID], ['eq', 'action', 'create']]);

  const present = fakeDb({ rpc: [created({ replayed: true, dealCreated: false })], auditRow: { id: 'AUD-1' } });
  assert.equal((await run(present)).audits.length, 0);
});

test('รหัสการคีย์ชนกับคำขออีกชุด = 409 พร้อม id ใบที่สร้างไว้', async () => {
  const db = fakeDb({ rpc: [{ data: null, error: { code: 'P0001', message: 'historical_so_intake_key_conflict' } }] });
  const res = await run(db);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'historical_so_intake_key_conflict');
  assert.equal(res.body.existingOrderId, REPLAY_ID);
});

test('RPC ยังไม่มีบนฐาน (PGRST202) = 503 · รหัสอื่นผ่านตัวแปลกลาง', async () => {
  const missing = fakeDb({ rpc: [{ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.create_historical_sales_order' } }] });
  assert.equal((await run(missing)).status, 503);
  const inactive = fakeDb({ rpc: [{ data: null, error: { code: 'P0001', message: 'historical_so_customer_inactive' } }] });
  const res = await run(inactive);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'historical_so_customer_inactive');
});

test('โหลดดีลภาชนะ/ใบย้อนหลังด้วยตัวกรอง origin ของ historicalOrders (ไม่พิมพ์ literal เอง)', async () => {
  const db = fakeDb({ rpc: [created()] });
  await run(db);
  const deals = db.calls.from.find((q) => q.table === 'sales_deals');
  const orders = db.calls.from.filter((q) => q.table === 'sales_orders' && !q.selected.includes('historicalIntakeHash'));
  assert.ok(deals.filters.some((f) => f[1] === 'origin' && f[2] === 'historical'));
  assert.ok(deals.filters.some((f) => f[1] === 'customerId' && f[2] === 'CUS-1'));
  assert.equal(orders.length, 1);
  assert.ok(orders[0].filters.some((f) => f[1] === 'origin' && f[2] === 'historical'));
});

test('ตัวเขียนไม่ยืมของขั้นอนุมัติ: ไม่ import ตัวหยุดยอดงวด/ตัวตรึงฉบับ · route มีด่านสิทธิ์ของตัวเอง', () => {
  const commit = readFileSync(join(HERE, 'historicalOrderCommit.js'), 'utf8');
  const route = readFileSync(join(HERE, '../../app/api/sales-planning/sales-orders/historical/route.js'), 'utf8');
  for (const source of [commit, route]) {
    assert.doesNotMatch(source, /freezeInstallments|captureIssuedSalesOrderSnapshot/);
  }
  assert.match(route, /if \(!user\) return unauthorized\(\);/);
  assert.match(route, /if \(!canKeyHistoricalSalesOrder\(user\)\) return forbidden\(/);
});
