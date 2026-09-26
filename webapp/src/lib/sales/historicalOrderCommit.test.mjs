// ── ตัวเขียนใบสั่งขายย้อนหลัง (0374): ด่าน · พรีวิว · ยืนยันใบซ้ำ · RPC สร้าง/แก้ · ส่งซ้ำ · หลักฐานงวดยกมา · audit ────
// ยิงด้วย supabase ปลอม (แพตเทิร์น lib/forceDelete.test.mjs) — ห้ามแตะฐานจริง (dev DB = prod DB)
// ข้อมูลชุดม็อก (mockups/legacy-so-service-flow) ย่อเหลือ 2 โซน แบบบรรทัดใบเสนอราคา (มติ 23/09):
//   จำนวน 72 + 48 × ราคาในทะเบียน 1,200 = ยอดรวมสินค้า/บริการ 144,000 · VAT 10,080 · รวม 154,080
//   ยกมา 115,560 ครอบ ม.ค.–ก.ย. + งวด ต.ค.–ธ.ค. 38,520 = ยอดใบพอดี ครอบต่อเนื่องเต็มสัญญา 2026
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { commitHistoricalOrder, sanitizeHistoricalEvidence } from './historicalOrderCommit.js';
import { PRIVATE_EVIDENCE_BUCKET } from '../upload/privateEvidence.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = new Date('2026-09-22T10:00:00+07:00');
const KEY = '4f0c9d2e-1b7a-4c1e-9f3d-8a6b5c4d3e2f';
const REPLAY_ID = `SOR-H${createHash('md5').update(KEY).digest('hex').slice(0, 16)}`;
const EDIT_ID = 'SOR-HEDIT0000000001';
const UPDATED_AT = '2026-09-22T03:00:00.000Z';

const supervisor = { id: 'U-SUP', name: 'หัวหน้าขาย', email: 'sup@example.test', role: 'ae_supervisor', teams: [] };
const pim = { id: 'U-PIM', name: 'พิมพ์ชนก รัตนา', role: 'ae', team: 'SV', teams: ['SV'] };
const spw = { id: 'CUS-SPW', name: 'บจก. สยามพิวรรธน์', nameEn: 'Siam Piwat', approvalStatus: 'approved', isActive: true };
const pimOwner = { ok: true, ownerId: 'U-PIM', ownerName: 'พิมพ์ชนก รัตนา', team: 'SV', teams: ['SV'] };
const PRODUCTS = [
  { id: 'P-PKG', fgCode: 'FG-SNS-02-001-0012', productDescription: 'แพ็คเกจกลิ่นรายเดือน (30 วัน)', saleUnit: 'แพ็คเกจ', costPrice: 1200 },
];
/* ตาราง products ปลอมคืน **เฉพาะคอลัมน์ที่ select มา** — ลืม select "costPrice" = แผนตอบ "อ่านราคาไม่ได้" (ไม่ใช่ราคา 0)
   ⇒ เทสต์พรีวิวด้านล่างล้มทันทีถ้าตัวเขียนเลิกอ่านราคาจากทะเบียน */
const selectedColumns = (selected) => String(selected).split(',').map((c) => c.trim().replace(/"/g, '')).filter(Boolean);
const project = (row, selected) => Object.fromEntries(selectedColumns(selected).filter((c) => c in row).map((c) => [c, row[c]]));
const SITES = [
  { id: 'ST-1002', code: 'ST-1002', name: 'สยามพารากอน', customerId: 'CUS-SPW', kind: 'customer', isActive: true },
  { id: 'ST-1044', code: 'ST-1044', name: 'สยามดิสคัฟเวอรี่', customerId: 'CUS-SPW', kind: 'customer', isActive: true },
];
const ZONES = [
  { id: 'Z-1002-01', siteId: 'ST-1002', name: 'ชั้น G ล็อบบี้', code: 'ZN-26090001', isActive: true },
  { id: 'Z-1044-01', siteId: 'ST-1044', name: 'ทางเข้าหลัก', code: 'ZN-26090002', isActive: true },
];
const containerDeal = (team = 'SV') => ({
  id: 'DEAL-C', code: 'DL-260900007', title: 'งานบริการย้อนหลัง · บจก. สยามพิวรรธน์', ownerId: 'U-PIM', ownerName: 'พิมพ์ชนก รัตนา',
  customerId: 'CUS-SPW', stage: 'won', line: 'SERVICE', projectId: null, team,
});
const editRow = (extra = {}) => ({
  id: EDIT_ID, orderNumber: 'SO-26090200-0', origin: 'historical', status: 'draft', customerId: 'CUS-SPW',
  dealId: 'DEAL-C', serviceContractId: 'CTR-HEDIT', updatedAt: UPDATED_AT, deal: containerDeal(), ...extra,
});
const inIds = (q, column) => q.filters.find((f) => f[0] === 'in' && f[1] === column)?.[2] || [];

function fakeDb({
  probeError = null, customerRow = spw, deals = [], orders = [], terms = [], termOrders = [], loaded = null,
  auditRow = null, rpc = [], stored = null, beforeLines = [], beforeInstallments = [], beforeContract = null, products = null,
} = {}) {
  const calls = { from: [], rpc: [], storage: [] };
  const respond = (q) => {
    switch (q.table) {
      case 'sales_order_lines':
        if (q.selected.includes('serviceZoneId')) return { data: [], error: probeError };
        return { data: beforeLines, error: null };
      case 'sales_order_installments':
        if (q.selected === 'kind') return { data: [], error: probeError };
        return { data: beforeInstallments, error: null };
      case 'sales_orders':
        if (q.selected.startsWith('*')) return { data: loaded, error: null };            // loadScoped
        if (q.filters.some((f) => f[0] === 'in' && f[1] === 'id')) {                    // ใบแม่ของรอบขาย
          return { data: termOrders.filter((o) => inIds(q, 'id').includes(o.id)), error: null };
        }
        return { data: orders, error: null };                                           // ใบย้อนหลังของลูกค้า
      case 'customers': return { data: customerRow, error: null };
      case 'products':
        return { data: (products || PRODUCTS).filter((p) => inIds(q, 'id').includes(p.id)).map((p) => project(p, q.selected)), error: null };
      case 'service_zones': return { data: ZONES.filter((z) => inIds(q, 'id').includes(z.id)), error: null };
      case 'service_sites': return { data: SITES.filter((s) => inIds(q, 'id').includes(s.id)), error: null };
      case 'service_zone_terms': return { data: terms.filter((t) => inIds(q, 'zoneId').includes(t.zoneId)), error: null };
      case 'sales_deals': return { data: deals, error: null };
      case 'sales_contracts': return { data: beforeContract, error: null };
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
    storage: {
      from(bucket) {
        return {
          list(folder, { search } = {}) {
            calls.storage.push({ bucket, folder, search });
            const hit = !stored || stored.has(`${folder}/${search}`);
            return Promise.resolve({ data: hit ? [{ name: search }] : [], error: null });
          },
        };
      },
    },
  };
  return { supabase, calls };
}

const body = (extra = {}) => ({
  preview: false,
  intakeKey: KEY,
  customerId: 'CUS-SPW',
  ownerId: 'U-PIM',
  contract: { docKind: 'customer_po', ref: 'PO-SPW-2026-0118', startDate: '2026-01-01', endDate: '2026-12-31' },
  refs: { quote: null, express: null, invoice: 'IV-2601-0412' },
  vatRate: 7,
  notes: null,
  zones: [
    { zoneId: 'Z-1002-01', productId: 'P-PKG', qty: 72, discountType: null, discountValue: 0, rounds: 12 },
    { zoneId: 'Z-1044-01', productId: 'P-PKG', qty: 48, discountType: null, discountValue: 0, rounds: 12 },
  ],
  opening: { amount: 115560, coversTo: '2026-09-30', paidOn: '2026-09-15', note: 'เก็บผ่าน Express แล้ว ม.ค.–ก.ย.' },
  installments: [
    { label: 'งวด ต.ค.–ธ.ค. 2026', amount: 38520, dueDate: '2026-10-01', coversFrom: '2026-10-01', coversTo: '2026-12-31' },
  ],
  ...extra,
});
/* ฟอร์มแก้ = ฟอร์มสร้าง: body ก้อนเดียวกัน ต่างแค่ไม่มีรหัสการคีย์ และมีเวลาที่จอเห็น */
const editBody = (extra = {}) => {
  const { intakeKey, ...rest } = body();
  assert.ok(intakeKey);
  return { ...rest, expectedUpdatedAt: UPDATED_AT, ...extra };
};

const created = (extra = {}) => ({
  data: {
    replayed: false,
    order: {
      id: REPLAY_ID, orderNumber: 'SO-26090191-0', origin: 'historical', status: 'draft', dealId: 'DEAL-NEW',
      historicalInvoiceRef: 'IV-2601-0412',
    },
    lines: [{ id: 'SOL-1' }, { id: 'SOL-2' }],
    installments: [{ id: 'SOI-1', kind: 'opening' }, { id: 'SOI-2', kind: 'regular' }],
    contract: { id: 'CTR-H1', status: 'draft', externalDocKind: 'customer_po', externalRef: 'PO-SPW-2026-0118' },
    deal: { id: 'DEAL-NEW', code: 'DL-260900513', customerName: 'บจก. สยามพิวรรธน์', ownerName: 'พิมพ์ชนก รัตนา' },
    dealCreated: true,
    ...extra,
  },
  error: null,
});
const updated = () => ({
  data: {
    order: { id: EDIT_ID, orderNumber: 'SO-26090200-0', origin: 'historical', status: 'draft' },
    lines: [{ id: 'SOL-1' }],
    installments: [{ id: 'SOI-1', kind: 'opening' }],
    contract: { id: 'CTR-HEDIT', status: 'draft' },
  },
  error: null,
});

async function run(db, extra = {}, { user = supervisor, ownerResult = pimOwner, orderId = null, payload = null } = {}) {
  const audits = [];
  const owners = [];
  const result = await commitHistoricalOrder({
    supabase: db.supabase,
    user,
    body: payload || (orderId ? editBody(extra) : body(extra)),
    orderId,
    now: NOW,
    audit: async (entry) => { audits.push(entry); },
    validateOwner: async (...args) => { owners.push(args); return ownerResult; },
  });
  return { ...result, audits, owners };
}
const runEdit = (db, extra = {}, options = {}) => run(db, extra, { orderId: EDIT_ID, ...options });

// ── ด่าน ─────────────────────────────────────────────────────────────────────────────────
test('ด่าน: ฝ่ายที่ไม่ใช่ฝ่ายขาย (บัญชี) = 403 และไม่อ่านฐานเลย — ทั้งสร้างและแก้', async () => {
  for (const orderId of [null, EDIT_ID]) {
    const db = fakeDb();
    const res = await run(db, {}, { user: { id: 'U-FN', role: 'finance' }, orderId });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'historical_so_actor_forbidden');
    assert.equal(db.calls.from.length, 0);
    assert.equal(db.calls.rpc.length, 0);
  }
});

test('บันทึกจริงไม่มีรหัสการคีย์ = 400 ก่อนอ่านฐาน · แก้ใบไม่ส่งเวลาที่จอเห็น = 400 ก่อนอ่านฐาน', async () => {
  const noKey = fakeDb();
  const res = await run(noKey, { intakeKey: '' });
  assert.equal(res.status, 400);
  assert.equal(noKey.calls.from.length, 0);

  const noExpected = fakeDb({ loaded: editRow() });
  const edit = await runEdit(noExpected, { expectedUpdatedAt: undefined });
  assert.equal(edit.status, 400);
  assert.equal(noExpected.calls.from.length, 0);
});

test('ยังไม่ได้รัน 0374 (42703 ตอนตรวจคอลัมน์ serviceZoneId/kind) = 503 ไม่ใช่ 500', async () => {
  const db = fakeDb({ probeError: { code: '42703', message: 'column sales_order_lines.serviceZoneId does not exist' } });
  const res = await run(db);
  assert.equal(res.status, 503);
  assert.match(res.body.error, /0374/);
  assert.equal(db.calls.rpc.length, 0);
  const probes = db.calls.from.slice(0, 2).map((q) => `${q.table}:${q.selected}`);
  assert.deepEqual(probes, ['sales_order_lines:"serviceZoneId"', 'sales_order_installments:kind']);
});

// ── พรีวิว + ตัวตัดสินเดียว ────────────────────────────────────────────────────────────────────
test('พรีวิว: คืนแผน · ไม่เรียก RPC · ไม่แตะที่เก็บไฟล์', async () => {
  const db = fakeDb({ rpc: [created()] });
  const res = await run(db, { preview: true, intakeKey: undefined });
  assert.equal(res.status, 200);
  assert.equal(res.body.preview, true);
  assert.deepEqual(res.body.plan.errors, []);
  assert.equal(res.body.plan.header.subtotal, 144000);
  assert.equal(res.body.plan.header.totalAmount, 154080);
  assert.equal(res.body.plan.lines[0].installationPoint, 'ST-1002 สยามพารากอน · ชั้น G ล็อบบี้');
  assert.equal(res.body.plan.deal.willCreate, true);
  assert.equal(db.calls.rpc.length, 0);
  assert.equal(db.calls.storage.length, 0);
});

/* ⭐ มติ 23/09: ราคา/หน่วยของบรรทัดโซนอ่านจากทะเบียน (ราคาผลิต — ตัวเดียวกับใบเสนอราคา) ที่ตัวเขียนนี้ที่เดียว */
test('⭐ ราคา/หน่วยอ่านจาก products."costPrice" · ราคาที่จอส่งมาไม่ถูกใช้ · ไม่ select ราคา = ตีกลับ ไม่ใช่ราคา 0', async () => {
  const db = fakeDb({ rpc: [created()] });
  const res = await run(db, {
    preview: true, intakeKey: undefined,
    zones: body().zones.map((z) => ({ ...z, unitPrice: 1, lineTotal: 1, lineAmount: 1 })),
  });
  assert.equal(res.status, 200);
  const select = db.calls.from.find((q) => q.table === 'products').selected;
  assert.ok(selectedColumns(select).includes('costPrice'), select);
  assert.deepEqual(res.body.plan.lines.map((l) => [l.qty, l.unit, l.unitPrice, l.lineTotal]),
    [[72, 'แพ็คเกจ', 1200, 86400], [48, 'แพ็คเกจ', 1200, 57600]]);
  // แพ็คเกจยังไม่ตั้งราคาในทะเบียน = 400 พร้อมข้อความรายช่อง · ไม่เรียก RPC
  //   มติ 25/09 (ตารางแบบใบเสนอราคา): ข้อความชี้ช่องแพ็คเกจของบรรทัด (ราคาเป็นของแพ็คเกจ — ตารางไม่มีช่องราคาให้แก้)
  const unpriced = fakeDb({ rpc: [created()], products: [{ ...PRODUCTS[0], costPrice: null }] });
  const bad = await run(unpriced);
  assert.equal(bad.status, 400);
  assert.ok(bad.body.errors.some((e) => e.field === 'zones.0.productId' && /ยังไม่ตั้งราคาในฐานข้อมูลสินค้า/.test(e.message)),
    JSON.stringify(bad.body.errors));
  assert.equal(unpriced.calls.rpc.length, 0);
});

test('แผนมี error = 400 พร้อมรายช่อง · ไม่เรียก RPC', async () => {
  const db = fakeDb({ rpc: [created()] });
  const res = await run(db, { zones: [] });
  assert.equal(res.status, 400);
  assert.ok(res.body.errors.some((e) => e.field === 'zones'));
  assert.equal(db.calls.rpc.length, 0);
});

/* 🐞 **R7 ครึ่งที่ยังค้าง** — พรีวิวตอบ 400 **เปล่า** ทุกครั้งที่ฟอร์มยังไม่ผ่าน (ฟอร์มที่ยังไม่มีงวด
   สักงวดมี error `installments` เสมอ) ⇒ จอไม่เคยได้ยอดใบจาก server เลยตลอดรอบคีย์ใบใหม่ แล้วต้อง
   คิดยอดเองเพื่อวาดแผ่นแบ่งงวด ⇒ เลขคู่ขนานสองชุดที่วันหนึ่งจะตอบไม่เท่ากันเงียบ ๆ
   ⇒ คืน "ครึ่งเงิน" ของแผนมาพร้อม 400 ของพรีวิว · **สถานะ 400 และ errors[] ต้องคงรูปเดิมเป๊ะ** */
test('R7: พรีวิวที่ยังไม่ผ่านคืนยอดใบของ server มาด้วย — สถานะ 400 กับ errors[] คงเดิม', async () => {
  const db = fakeDb({ rpc: [created()] });
  const res = await run(db, {
    preview: true, intakeKey: undefined, opening: null, installments: [],
  });
  assert.equal(res.status, 400, 'สถานะต้องไม่เปลี่ยน — ผู้เรียกฝั่งจอแยกพรีวิวที่ไม่ผ่านด้วย 400');
  assert.ok(res.body.errors.some((e) => e.field === 'installments'), JSON.stringify(res.body.errors));
  assert.equal(res.body.error, res.body.errors[0].message, 'ข้อความหลักยังเป็นข้อแรกเหมือนเดิม');
  /* ยอดชุดเดียวกับที่พรีวิวที่ผ่านแล้วตอบ (144,000 + 10,080 = 154,080) */
  assert.deepEqual(res.body.money, {
    subtotal: 144000, discountAmount: 0, vatAmount: 10080, totalAmount: 154080,
  });
  assert.equal(db.calls.rpc.length, 0);
  assert.equal(db.calls.storage.length, 0);
});

/* ⚠️ อีกครึ่งของข้อเดียวกัน: **ห้ามแกล้งรู้** — แผนตั้งบล็อกเงินเป็นศูนย์ทั้งก้อนเมื่อด่านเงินไม่ผ่าน
   ⇒ ส่งศูนย์ไปให้จอ = จอพิมพ์ "0 บาท" เป็นยอดใบ ซึ่งเป็นคำตอบผิด (ต่างจากใบยอด 0 บาทจริง) */
test('R7: พรีวิวที่ "ยอดเองยังผิด" ต้องตอบ money = null ไม่ใช่ศูนย์ที่อ่านเหมือนใบ ฿0', async () => {
  const bad = fakeDb({ rpc: [created()] });
  const res = await run(bad, {
    preview: true, intakeKey: undefined,
    zones: [{ zoneId: 'Z-1002-01', productId: 'P-PKG', qty: '', discountType: null, discountValue: 0, rounds: 12 }],
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.money, null, 'ยอดคิดไม่ได้ = ยังไม่รู้ ห้ามส่งศูนย์');

  /* ไม่มีโซนเลย = ยังไม่มีอะไรให้คิดยอด */
  const empty = fakeDb({ rpc: [created()] });
  const none = await run(empty, { preview: true, intakeKey: undefined, zones: [] });
  assert.equal(none.status, 400);
  assert.equal(none.body.money, null);

  /* ยังไม่เลือก VAT = คิดยอดไม่ได้ (ตัวเดียวกับที่ฟอร์มบอกให้ "เลือกภาษีมูลค่าเพิ่มในกล่องสรุปท้ายตารางรายการ (ขั้น ②)" —
     มติ 25/09 ย้าย VAT จากขั้น ① ไปกล่องสรุปแบบใบเสนอราคา) */
  const noVat = fakeDb({ rpc: [created()] });
  const vat = await run(noVat, { preview: true, intakeKey: undefined, vatRate: null });
  assert.equal(vat.status, 400);
  assert.equal(vat.body.money, null);

  /* ส่วนลดท้ายใบที่แผนตีกลับ (% เกิน 100 · ติดลบ · ชนิดแปลก) = ยอดยังไม่รู้เหมือนยังไม่เลือก VAT
     ⚠️ ห้ามตอบยอด "ไม่ลด" แทน — จอจะวาดแผ่นแบ่งงวดจากยอดที่ใหญ่กว่าที่ผู้คีย์ตั้งใจ */
  for (const discount of [
    { discountType: 'percent', discountValue: 150 },
    { discountType: 'amount', discountValue: -1 },
    { discountType: 'baht', discountValue: 1000 },
  ]) {
    const badDiscount = fakeDb({ rpc: [created()] });
    const res = await run(badDiscount, { preview: true, intakeKey: undefined, ...discount });
    assert.equal(res.status, 400, JSON.stringify(discount));
    assert.ok(res.body.errors.some((e) => e.field === 'discount'), JSON.stringify(res.body.errors));
    assert.equal(res.body.money, null, JSON.stringify(discount));
  }
});

/* ⭐ มติ 25/09 ส่วนลดท้ายใบ — ยอดครึ่งเงินของพรีวิว 400 ต้องพกยอดส่วนลดมาด้วย (จอวาดกล่องสรุป + แผ่นแบ่งงวด
   จากก้อนนี้ก้อนเดียว) · 144,000 − 1,000 = 143,000 → VAT 10,010 → รวม 153,010 */
test('R7: ยอดของพรีวิว 400 พก discountAmount ของส่วนลดท้ายใบ · VAT คิดจากยอดหลังหัก', async () => {
  for (const [discount, money] of [
    [{ discountType: 'amount', discountValue: 1000 }, { subtotal: 144000, discountAmount: 1000, vatAmount: 10010, totalAmount: 153010 }],
    [{ discountType: 'percent', discountValue: '10' }, { subtotal: 144000, discountAmount: 14400, vatAmount: 9072, totalAmount: 138672 }],
  ]) {
    const db = fakeDb({ rpc: [created()] });
    const res = await run(db, { preview: true, intakeKey: undefined, opening: null, installments: [], ...discount });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.some((e) => e.field === 'installments'), JSON.stringify(res.body.errors));
    assert.deepEqual(res.body.money, money, JSON.stringify(discount));
    assert.equal(db.calls.rpc.length, 0);
  }
});

/* ใบยอด 0 บาทจริง (มติข้อ 12) ≠ "คิดยอดไม่ได้" — แผนบอกด้วย `zeroValue` ⇒ ยอดต้องไหลไปให้จอ */
test('R7: ใบยอด 0 บาทจริงยังคืนยอดมา (zeroValue) — แยกจาก "คิดยอดไม่ได้"', async () => {
  const db = fakeDb({ rpc: [created()] });
  const res = await run(db, {
    preview: true, intakeKey: undefined,
    /* ใบ ฿0 แบบใบเสนอราคา = ส่วนลดเต็มจำนวน */
    zones: [
      { zoneId: 'Z-1002-01', productId: 'P-PKG', qty: 72, discountType: 'percent', discountValue: 100, rounds: 12 },
      { zoneId: 'Z-1044-01', productId: 'P-PKG', qty: 48, discountType: 'percent', discountValue: 100, rounds: 12 },
    ],
    opening: null,
    installments: [],
  });
  assert.equal(res.status, 400);
  /* error ที่ค้างคือของมติข้อ 11 (ใบยอด 0 บาทต้องมีหมายเหตุ) — ยอด 0 ของมัน "รู้แล้ว" ไม่ใช่ "ยังไม่รู้" */
  assert.ok(res.body.errors.some((e) => e.field === 'notes'), JSON.stringify(res.body.errors));
  assert.deepEqual(res.body.money, { subtotal: 0, discountAmount: 0, vatAmount: 0, totalAmount: 0 });
});

/* การบันทึกจริงที่ตีกลับไม่พูดเรื่องยอด — จอไม่ได้ขอตรวจ มันขอเขียน (และ 400 ก้อนเดิมมีผู้เรียกอื่น) */
test('R7: 400 ของการบันทึกจริง (ไม่ใช่พรีวิว) ไม่มีคีย์ money ติดมา', async () => {
  const db = fakeDb({ rpc: [created()] });
  const res = await run(db, { opening: null, installments: [] });
  assert.equal(res.status, 400);
  assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'money'), false);
  assert.ok(res.body.errors.some((e) => e.field === 'installments'));
});

test('AE / Senior AE เลือก AE คนอื่น = 400 (ไม่ถาม Auth ด้วยซ้ำ) · ไม่เรียก RPC', async () => {
  for (const role of ['ae', 'senior_ae']) {
    const db = fakeDb({ rpc: [created()] });
    const res = await run(db, { ownerId: 'U-OTHER' }, { user: { ...pim, role } });
    assert.equal(res.status, 400, role);
    assert.ok(res.body.errors.some((e) => e.field === 'ownerId' && /เฉพาะของตัวเอง/.test(e.message)), role);
    assert.equal(res.owners.length, 0, 'ไม่ต้องถาม validateDealOwner');
    assert.equal(db.calls.rpc.length, 0);
  }
  // คีย์ของตัวเองได้ · ส่ง role ของผู้คีย์เข้า RPC
  const own = fakeDb({ rpc: [created()] });
  const res = await run(own, {}, { user: pim });
  assert.equal(res.status, 201);
  assert.equal(own.calls.rpc[0].args.p_actor_role, 'ae');
});

test('AC: ดีลภาชนะเดิมของคู่นี้อยู่ทีมอื่น = 400 ทั้งพรีวิวและบันทึก · ไม่เรียก RPC (กันร่างกำพร้า)', async () => {
  const ac = { id: 'U-AC', name: 'เอซี', role: 'ac', team: 'SV', teams: ['SV'] };
  for (const preview of [true, false]) {
    const db = fakeDb({ deals: [containerDeal('ODM')], rpc: [created()] });
    const res = await run(db, { preview }, { user: ac });
    assert.equal(res.status, 400, `preview=${preview}`);
    assert.ok(res.body.errors.some((e) => e.field === 'ownerId' && /อยู่ทีม ODM ซึ่งคุณไม่ได้ดูแล/.test(e.message)));
    assert.equal(db.calls.rpc.length, 0);
  }
  // ดีลภาชนะทีมเดียวกับ AC = ผ่าน
  const same = fakeDb({ deals: [containerDeal('SV')], rpc: [created({ dealCreated: false })] });
  assert.equal((await run(same, {}, { user: ac })).status, 201);
});

test('โซนที่มีรอบขายของใบอื่นยังมีผล = คำเตือนในพรีวิว · อ่านรอบขายซอยตามโซน และใบแม่ด้วย id', async () => {
  const db = fakeDb({
    terms: [
      { id: 'SZT-1', zoneId: 'Z-1002-01', salesOrderId: 'SOR-X', startDate: null, endDate: '2026-12-31' },
      { id: 'SZT-2', zoneId: 'Z-1044-01', salesOrderId: 'SOR-DEAD', startDate: null, endDate: null },
    ],
    termOrders: [
      { id: 'SOR-X', orderNumber: 'SO-26050011-0', status: 'approved', supersededById: null },
      { id: 'SOR-DEAD', orderNumber: 'SO-26050012-0', status: 'cancelled', supersededById: null },
    ],
  });
  const res = await run(db, { preview: true });
  assert.equal(res.status, 200);
  const hits = res.body.plan.warnings.filter((w) => /มีรอบขายของ/.test(w));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /SO-26050011-0 อยู่แล้ว \(ถึง 31\/12\/2026\)/);
  assert.deepEqual(res.body.plan.liveTerms.map((t) => t.orderId), ['SOR-X']);
  const termRead = db.calls.from.find((q) => q.table === 'service_zone_terms');
  assert.deepEqual(inIds(termRead, 'zoneId'), ['Z-1002-01', 'Z-1044-01']);
  const parents = db.calls.from.find((q) => q.table === 'sales_orders' && inIds(q, 'id').length);
  assert.deepEqual(inIds(parents, 'id'), ['SOR-X', 'SOR-DEAD']);
});

// ── สร้าง ──────────────────────────────────────────────────────────────────────────────────
test('ใบที่อาจซ้ำยังไม่ยืนยัน = 409 + รายการ · ยืนยันแล้วบันทึกต่อได้ · ใบของรหัสการคีย์นี้เองไม่นับ', async () => {
  const orders = [{ id: 'SOR-OLD', orderNumber: 'SO-26090001-0', orderDate: '2026-01-01', status: 'approved' }];
  const blocked = fakeDb({ orders, rpc: [created()] });
  const res = await run(blocked);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'historical_so_duplicate_unacknowledged');
  assert.deepEqual(res.body.duplicates.map((d) => d.id), ['SOR-OLD']);
  assert.equal(blocked.calls.rpc.length, 0);

  const acknowledged = fakeDb({ orders, rpc: [created()] });
  assert.equal((await run(acknowledged, { acknowledgedDuplicateIds: ['SOR-OLD'], duplicateNote: 'คนละอาคาร' })).status, 201);
  assert.equal(acknowledged.calls.rpc.length, 1);
  /* ⭐ มติ 26/09: บันทึกว่าใบไหน · ใคร · เมื่อไร · เหตุผล ลง intake ในทรานแซกชันเดียวกับใบ (ไม่ต้องแก้ฐาน) */
  const review = acknowledged.calls.rpc[0].args.p_header.intake.duplicateReview;
  assert.deepEqual({ ...review, orders: review.orders.map((o) => [o.id, o.orderNumber, o.status, o.matchedOn]) }, {
    v: 1, checkedAt: NOW.toISOString(), byId: supervisor.id, byName: supervisor.name, byRole: supervisor.role,
    basis: 'ids', note: 'คนละอาคาร',
    orders: [['SOR-OLD', 'SO-26090001-0', 'approved', [{ kind: 'startDate', value: '2026-01-01' }]]],
  });

  /* ยืนยันไม่ครบ (มีใบที่ผู้คีย์ไม่เคยเห็น) = 409 เหมือนไม่ยืนยัน */
  const partial = fakeDb({ orders: [...orders, { ...orders[0], id: 'SOR-NEW', orderNumber: 'SO-26090009-0' }], rpc: [created()] });
  assert.equal((await run(partial, { acknowledgedDuplicateIds: ['SOR-OLD'] })).status, 409);
  assert.equal(partial.calls.rpc.length, 0);

  /* แท็บรุ่นก่อน (ธง true ไม่มีรายการ) ยังบันทึกได้ — บันทึกเป็น basis 'flag' */
  const legacy = fakeDb({ orders, rpc: [created()] });
  assert.equal((await run(legacy, { acknowledgeDuplicates: true })).status, 201);
  assert.equal(legacy.calls.rpc[0].args.p_header.intake.duplicateReview.basis, 'flag');

  const self = fakeDb({ orders: [{ ...orders[0], id: REPLAY_ID }], rpc: [created({ replayed: true, dealCreated: false })], auditRow: { id: 'AUD-1' } });
  assert.equal((await run(self)).status, 200);
});

test('สร้าง: RPC ครั้งเดียว · อาร์กิวเมนต์รุ่น 0374 + บรรทัดแบบใบเสนอราคา (0379) · ลายนิ้วมือ 64 hex · ดีลใหม่ได้ถัง/prefix/ความกว้าง DL', async () => {
  const db = fakeDb({ rpc: [created()] });
  const res = await run(db);
  assert.equal(res.status, 201);
  assert.equal(res.body.replayed, false);
  assert.equal(res.body.contract.id, 'CTR-H1');
  assert.equal(db.calls.rpc.length, 1);
  const { name, args } = db.calls.rpc[0];
  assert.equal(name, 'create_historical_sales_order');
  assert.deepEqual(Object.keys(args).sort(), [
    'p_actor_id', 'p_actor_name', 'p_actor_role', 'p_contract', 'p_header', 'p_installments', 'p_intake_hash',
    'p_intake_key', 'p_lines', 'p_new_deal',
  ]);
  assert.equal(args.p_intake_key, KEY);
  assert.match(args.p_intake_hash, /^[0-9a-f]{64}$/);
  assert.equal(args.p_actor_role, 'ae_supervisor');
  assert.equal(args.p_header.ownerId, 'U-PIM');
  assert.equal(args.p_header.team, 'SV');
  assert.equal(args.p_header.totalAmount, 154080);
  assert.deepEqual(args.p_contract, { docKind: 'customer_po', ref: 'PO-SPW-2026-0118', startDate: '2026-01-01', endDate: '2026-12-31' });
  assert.deepEqual(args.p_lines.map((l) => l.zoneId), ['Z-1002-01', 'Z-1044-01']);
  assert.deepEqual(args.p_lines[0], {
    zoneId: 'Z-1002-01', productId: 'P-PKG', qty: 72, unitPrice: 1200, discountType: null, discountValue: 0,
    discountAmount: 0, lineTotal: 86400, serviceRounds: 12,
  });
  // intake = ของที่คอลัมน์เก็บไม่ได้แต่ฟอร์มแก้ต้องได้คืน: ตัวเลือก VAT + ชนิด/ค่าส่วนลดท้ายใบ (มติ 25/09 · ไม่ลด = null/0)
  // + บันทึกการยืนยันใบที่อาจซ้ำ (มติ 26/09) — เขียนทุกครั้งแม้ไม่มีใบที่อาจซ้ำ (`orders: []`) ⇒ "ไม่มีบันทึก" = ใบก่อนมีระบบนี้
  const { duplicateReview, ...intake } = args.p_header.intake;
  assert.deepEqual(intake, { vatRate: 7, discountType: null, discountValue: 0 });
  assert.deepEqual(duplicateReview, {
    v: 1, checkedAt: NOW.toISOString(), byId: supervisor.id, byName: supervisor.name, byRole: supervisor.role, basis: 'none', orders: [],
  });
  assert.equal(args.p_header.discountAmount, 0);
  assert.deepEqual(args.p_installments.map((r) => r.kind), ['opening', 'regular']);
  assert.ok(args.p_installments.every((r) => !('evidence' in r)), 'ตอนสร้างยังไม่มีหลักฐาน (โฟลเดอร์ของใบยังไม่เกิด)');
  assert.equal(args.p_new_deal.ownerName, 'พิมพ์ชนก รัตนา');
  assert.equal(args.p_new_deal.month, '26');
  assert.equal(args.p_new_deal.prefix, 'DL-2609');
  assert.equal(args.p_new_deal.width, 5);
  assert.match(args.p_new_deal.id, /^DEAL-/);
  assert.match(args.p_new_deal.historyId, /^DSH-/);
  assert.match(args.p_new_deal.title, /บจก\. สยามพิวรรธน์/);
  assert.equal(db.calls.storage.length, 0);

  // คำขอเดิมทุกตัวอักษร = ลายนิ้วมือเดิม (แม้แนบหลักฐานมา) · ต่างช่องเดียว = คนละลายนิ้วมือ
  const again = fakeDb({ rpc: [created()] });
  await run(again, { opening: { ...body().opening, evidence: [{ storagePath: 'x' }] } });
  assert.equal(again.calls.rpc[0].args.p_intake_hash, args.p_intake_hash);
  const changed = fakeDb({ rpc: [created()] });
  await run(changed, { notes: 'ต่างไปหนึ่งช่อง' });
  assert.notEqual(changed.calls.rpc[0].args.p_intake_hash, args.p_intake_hash);
});

/* ⭐ มติ 25/09 ส่วนลดท้ายใบ — JS ล้วน ไม่มี migration: ฐานเก็บยอดที่คอลัมน์ discountAmount และชนิด/ค่าใน
   metadata.historicalIntake (0374 เขียน `p_header->'intake'` ทั้งก้อน) ⇒ ตัวเขียนต้องส่งทั้งสองทางครบ ไม่งั้น
   ใบลงฐานได้ แต่เปิดแก้แล้วส่วนลดหาย (หรือสมการหัวใบของฐานตีกลับ historical_so_money_mismatch) */
test('สร้าง: ส่วนลดท้ายใบไหลถึง RPC — p_header.discountAmount + intake ชนิด/ค่า · งวดเท่ายอดหลังหัก · ลายนิ้วมือต่างจากไม่ลด', async () => {
  const discounted = {
    discountType: 'amount', discountValue: 1000,
    installments: [{ ...body().installments[0], amount: 37450 }],            // 115,560 + 37,450 = 153,010
  };
  const db = fakeDb({ rpc: [created()] });
  const res = await run(db, discounted);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { args } = db.calls.rpc[0];
  assert.deepEqual(
    { subtotal: args.p_header.subtotal, discountAmount: args.p_header.discountAmount, vatAmount: args.p_header.vatAmount, totalAmount: args.p_header.totalAmount },
    { subtotal: 144000, discountAmount: 1000, vatAmount: 10010, totalAmount: 153010 },
  );
  const { duplicateReview: _review, ...intake } = args.p_header.intake;
  assert.deepEqual(intake, { vatRate: 7, discountType: 'amount', discountValue: 1000 });
  // ส่วนลดท้ายใบไม่ถูกเกลี่ยลงบรรทัด — ฐาน (0374 ⑦) ตรวจ ผลรวมบรรทัด = subtotal
  assert.deepEqual(args.p_lines.map((l) => [l.discountAmount, l.lineTotal]), [[0, 86400], [0, 57600]]);

  const plain = fakeDb({ rpc: [created()] });
  await run(plain, { ...discounted, discountType: null, discountValue: 0 });
  assert.equal(plain.calls.rpc.length, 0, 'ไม่ลดแล้วงวดเกินยอด = 400 ก่อนถึง RPC');
  const again = fakeDb({ rpc: [created()] });
  await run(again, discounted);
  assert.equal(again.calls.rpc[0].args.p_intake_hash, args.p_intake_hash, 'คำขอเดิม (รวมส่วนลด) = ลายนิ้วมือเดิม');
  const other = fakeDb({ rpc: [created()] });
  await run(other, { ...discounted, discountType: 'percent', discountValue: 10, installments: [{ ...body().installments[0], amount: 23112 }] });
  assert.equal(other.calls.rpc.length, 1);
  assert.notEqual(other.calls.rpc[0].args.p_intake_hash, args.p_intake_hash, 'ส่วนลดต่าง = คำขอคนละก้อน');
});

test('audit ของการสร้าง: ใบ + เอกสารแทนสัญญา + ดีลที่เพิ่งเกิด อย่างละครั้ง · ดีลเดิม = ไม่มี audit ดีล', async () => {
  const db = fakeDb({ rpc: [created()] });
  const res = await run(db);
  assert.deepEqual(res.audits.map((a) => `${a.action}:${a.entityType}`), ['create:sales_order', 'create:sales_contract', 'create:sales_deal']);
  assert.match(res.audits[0].summary, /ร่าง\) SO-26090191-0/);
  assert.match(res.audits[0].summary, /IV-2601-0412/);
  assert.equal(res.audits[0].after.contract.id, 'CTR-H1');
  assert.match(res.audits[1].summary, /ใบสั่งซื้อ|PO/);
  assert.match(res.audits[1].summary, /PO-SPW-2026-0118/);

  const reuse = fakeDb({ rpc: [created({ dealCreated: false })] });
  assert.deepEqual((await run(reuse)).audits.map((a) => a.entityType), ['sales_order', 'sales_contract']);
});

test('ส่งซ้ำ: รอบแรกยังไม่มี audit = เขียน (บันทึกจากการส่งซ้ำ) · มีแล้ว = ไม่เขียนซ้ำ', async () => {
  const missing = fakeDb({ rpc: [created({ replayed: true, dealCreated: false })], auditRow: null });
  const first = await run(missing);
  assert.equal(first.status, 200);
  assert.equal(first.body.replayed, true);
  assert.deepEqual(first.audits.map((a) => a.entityType), ['sales_order', 'sales_contract']);
  assert.ok(first.audits.every((a) => /ส่งซ้ำ/.test(a.summary)));
  const auditRead = missing.calls.from.find((q) => q.table === 'audit_logs');
  assert.deepEqual(auditRead.filters, [['eq', 'entityType', 'sales_order'], ['eq', 'entityId', REPLAY_ID], ['eq', 'action', 'create']]);

  const present = fakeDb({ rpc: [created({ replayed: true, dealCreated: false })], auditRow: { id: 'AUD-1' } });
  assert.equal((await run(present)).audits.length, 0);
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

test('รหัสการคีย์ชนกับคำขออีกชุด = 409 พร้อม orderId ที่คำนวณฝั่ง server (ฟอร์มเสนอเปิดใบในฟอร์มแก้ไข)', async () => {
  const db = fakeDb({ rpc: [{ data: null, error: { code: 'P0001', message: 'historical_so_intake_key_conflict' } }] });
  const res = await run(db);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'historical_so_intake_key_conflict');
  assert.equal(res.body.orderId, REPLAY_ID);
  assert.equal(res.audits.length, 0);
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

test('RPC ยังไม่มีบนฐาน (PGRST202) = 503 ของ 0374 · รหัสอื่นผ่านตัวแปลกลาง', async () => {
  const missing = fakeDb({ rpc: [{ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.create_historical_sales_order' } }] });
  const gone = await run(missing);
  assert.equal(gone.status, 503);
  assert.match(gone.body.error, /0374/);
  const zone = fakeDb({ rpc: [{ data: null, error: { code: 'P0001', message: 'historical_so_zone_invalid' } }] });
  const res = await run(zone);
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'historical_so_zone_invalid');
});

test('โหลดดีลภาชนะ/ใบย้อนหลังด้วยตัวกรอง origin ของ historicalOrders (ไม่พิมพ์ literal เอง) · ดีลต้องพกทีม', async () => {
  const db = fakeDb({ rpc: [created()] });
  await run(db);
  const deals = db.calls.from.find((q) => q.table === 'sales_deals');
  const orders = db.calls.from.filter((q) => q.table === 'sales_orders' && !inIds(q, 'id').length);
  assert.ok(deals.filters.some((f) => f[1] === 'origin' && f[2] === 'historical'));
  assert.ok(deals.filters.some((f) => f[1] === 'customerId' && f[2] === 'CUS-SPW'));
  assert.match(deals.selected, /\bteam\b/);
  assert.equal(orders.length, 1);
  assert.ok(orders[0].filters.some((f) => f[1] === 'origin' && f[2] === 'historical'));
});

// ── แก้ใบ (PATCH historical/[id]) ─────────────────────────────────────────────────────────────
test('แก้ใบ: โหลดผ่าน loadScoped (edit) · นอกขอบเขต = 403 · ไม่พบ = 404 · ไม่เรียก RPC', async () => {
  const outsider = fakeDb({ loaded: editRow(), rpc: [updated()] });
  const res = await runEdit(outsider, {}, { user: { ...pim, id: 'U-OTHER' } });
  assert.equal(res.status, 403);
  const load = outsider.calls.from.find((q) => q.table === 'sales_orders' && q.selected.startsWith('*'));
  assert.equal(load.selected, '*, deal:sales_deals(*)');
  assert.deepEqual(load.filters, [['eq', 'id', EDIT_ID]]);
  assert.equal(outsider.calls.rpc.length, 0);

  const none = fakeDb({ loaded: null, rpc: [updated()] });
  assert.equal((await runEdit(none)).status, 404);
  assert.equal(none.calls.rpc.length, 0);
});

test('แก้ใบ: รออนุมัติ/อนุมัติแล้ว = 409 edit_state_invalid · ใบ pipeline = 409 · ไม่เรียก RPC', async () => {
  for (const status of ['pending_approval', 'approved', 'cancelled']) {
    const db = fakeDb({ loaded: editRow({ status }), rpc: [updated()] });
    const res = await runEdit(db);
    assert.equal(res.status, 409, status);
    assert.equal(res.body.code, 'historical_so_edit_state_invalid');
    assert.equal(db.calls.rpc.length, 0);
  }
  const pipeline = fakeDb({ loaded: editRow({ origin: 'pipeline' }), rpc: [updated()] });
  const res = await runEdit(pipeline);
  assert.equal(res.status, 409);
  assert.match(res.body.error, /ไม่ใช่ใบสั่งขายย้อนหลัง/);
});

test('แก้ใบ: ลูกค้า/AE ล็อกหลังบันทึกครั้งแรก — ส่งคู่อื่นมา = 409 owner_locked ก่อนวางแผน', async () => {
  for (const extra of [{ customerId: 'CUS-OTHER' }, { ownerId: 'U-OTHER' }]) {
    const db = fakeDb({ loaded: editRow(), rpc: [updated()] });
    const res = await runEdit(db, extra);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'historical_so_owner_locked');
    assert.equal(res.owners.length, 0);
    assert.equal(db.calls.rpc.length, 0);
  }
});

test('แก้ใบ: พรีวิวไม่ต้องมีเวลาที่จอเห็น · ใบนี้เองไม่นับเป็นใบซ้ำ · ไม่เรียก RPC', async () => {
  const orders = [{ id: EDIT_ID, orderNumber: 'SO-26090200-0', orderDate: '2026-01-01', status: 'draft' }];
  const db = fakeDb({ loaded: editRow(), deals: [containerDeal()], orders, rpc: [updated()] });
  const res = await runEdit(db, { preview: true, expectedUpdatedAt: undefined });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.plan.duplicates, []);
  assert.equal(res.body.plan.deal.willCreate, false);
  assert.equal(db.calls.rpc.length, 0);
});

/* 🐞 ทางตันของมติข้อ 9 (สัญญาสิ้นสุดไปแล้ว = ตีกลับ): ใบตีกลับไม่มีปุ่มยื่นอนุมัติที่หน้ารายละเอียด
   ทางเดียวคือฟอร์มคีย์ ซึ่ง PATCH ก่อนส่งเสมอ ⇒ ใบที่นอนข้ามวันสิ้นสุดแก้ไม่ได้ ส่งไม่ได้ตลอดกาล
   ⇒ ตัวเขียนต้องบอกแผนว่ากำลัง "แก้ใบ" (ctx.editing) — `selfOrderId` มีค่าทั้งสองทาง แยกไม่ได้ */
const EXPIRED = {
  contract: { docKind: 'customer_po', ref: 'PO-SPW-2025-0118', startDate: '2025-01-01', endDate: '2025-12-31' },
  opening: { ...body().opening, coversTo: '2025-09-30', paidOn: '2025-09-15' },
  installments: [
    { label: 'งวด ต.ค.–ธ.ค. 2025', amount: 38520, dueDate: '2025-10-01', coversFrom: '2025-10-01', coversTo: '2025-12-31' },
  ],
};

test('สัญญาสิ้นสุดไปแล้ว: คีย์ใบใหม่ = 400 ทั้งพรีวิวและบันทึก · แก้ใบที่ตีกลับ = ผ่าน พร้อมคำเตือน (มติข้อ 9)', async () => {
  for (const preview of [true, false]) {
    const db = fakeDb({ deals: [containerDeal()], rpc: [created()] });
    const res = await run(db, { ...EXPIRED, preview });
    assert.equal(res.status, 400, `สร้าง preview=${preview}`);
    assert.ok(res.body.errors.some((e) => e.field === 'contract.endDate' && /มติข้อ 9/.test(e.message)));
    assert.equal(db.calls.rpc.length, 0);
  }

  const previewDb = fakeDb({ loaded: editRow({ status: 'rejected' }), deals: [containerDeal()], rpc: [updated()] });
  const previewRes = await runEdit(previewDb, { ...EXPIRED, preview: true, expectedUpdatedAt: undefined });
  assert.equal(previewRes.status, 200);
  assert.deepEqual(previewRes.body.plan.errors, []);
  assert.ok(previewRes.body.plan.warnings.some((w) => /มติข้อ 9/.test(w)), JSON.stringify(previewRes.body.plan.warnings));

  const saveDb = fakeDb({ loaded: editRow({ status: 'rejected' }), deals: [containerDeal()], rpc: [updated()] });
  const saveRes = await runEdit(saveDb, EXPIRED);
  assert.equal(saveRes.status, 200);
  assert.equal(saveDb.calls.rpc.length, 1);
  assert.equal(saveDb.calls.rpc[0].name, 'update_historical_sales_order');
  assert.equal(saveDb.calls.rpc[0].args.p_contract.endDate, '2025-12-31', 'วันสิ้นสุดของจริงต้องไม่ถูกแตะ');
});

const OWN_REF = {
  storageBucket: PRIVATE_EVIDENCE_BUCKET, storagePath: `sales-orders/${EDIT_ID}/payments/1_slip.pdf`, fileName: 'slip.pdf',
  mimeType: 'application/pdf', sizeBytes: 1200, fileUrl: 'https://example.test/leak',
};
const FOREIGN_REF = { storageBucket: PRIVATE_EVIDENCE_BUCKET, storagePath: 'sales-orders/SOR-OTHER/payments/2_x.pdf', fileName: 'x.pdf' };
const LEGACY_REF = { fileUrl: 'https://drive.example.test/abc', fileName: 'old.pdf' };
const WRONG_BUCKET = { storageBucket: 'public', storagePath: `sales-orders/${EDIT_ID}/payments/3_y.pdf`, fileName: 'y.pdf' };

test('แก้ใบ: RPC update ครั้งเดียว · หลักฐานเหลือเฉพาะไฟล์ใต้โฟลเดอร์ของใบนี้ (ตัดของใบอื่น/URL เก่า/bucket อื่น)', async () => {
  const db = fakeDb({ loaded: editRow(), deals: [containerDeal()], rpc: [updated()] });
  const res = await runEdit(db, { opening: { ...body().opening, evidence: [OWN_REF, FOREIGN_REF, LEGACY_REF, WRONG_BUCKET] } });
  assert.equal(res.status, 200);
  assert.equal(db.calls.rpc.length, 1);
  const { name, args } = db.calls.rpc[0];
  assert.equal(name, 'update_historical_sales_order');
  assert.deepEqual(Object.keys(args).sort(), [
    'p_actor_id', 'p_actor_name', 'p_actor_role', 'p_contract', 'p_expected_updated_at', 'p_header', 'p_installments',
    'p_lines', 'p_order_id',
  ]);
  assert.equal(args.p_order_id, EDIT_ID);
  assert.equal(args.p_expected_updated_at, UPDATED_AT);
  /* ⚠️ RPC แก้ใบแทน historicalIntake ทั้งก้อน — ต้องแนบบันทึกใหม่ทุกครั้ง ไม่งั้นบันทึกเดิมหาย */
  assert.equal(args.p_header.intake.duplicateReview.basis, 'none');
  assert.deepEqual(args.p_header.intake.duplicateReview.orders, []);
  const [opening, regular] = args.p_installments;
  assert.equal(opening.kind, 'opening');
  assert.deepEqual(opening.evidence.map((ref) => ref.storagePath), [OWN_REF.storagePath]);
  assert.equal(opening.evidence[0].fileUrl, null, 'ref ส่วนตัวไม่พก URL ไปด้วย');
  assert.ok(!('evidence' in regular));
  assert.deepEqual(db.calls.storage, [{
    bucket: PRIVATE_EVIDENCE_BUCKET, folder: `sales-orders/${EDIT_ID}/payments`, search: '1_slip.pdf',
  }]);
  assert.equal(res.body.deal.id, 'DEAL-C');
  assert.equal(res.body.dealCreated, false);
});

test('แก้ใบ: ไฟล์หลักฐานที่อ้างไม่มีอยู่จริงใน bucket = 400 · ไม่เรียก RPC', async () => {
  const db = fakeDb({ loaded: editRow(), deals: [containerDeal()], rpc: [updated()], stored: new Set() });
  const res = await runEdit(db, { opening: { ...body().opening, evidence: [OWN_REF] } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /ไม่พบไฟล์ slip\.pdf/);
  assert.equal(db.calls.rpc.length, 0);
});

test('แก้ใบ: เอกสารถูกเปลี่ยนจากอีกหน้าต่าง (workflow_stale) = 409 · สถานะเปลี่ยนระหว่างทาง = 409 · ไม่มี audit', async () => {
  for (const [message, code] of [['workflow_stale', 'workflow_stale'], ['historical_so_edit_state_invalid', 'historical_so_edit_state_invalid']]) {
    const db = fakeDb({ loaded: editRow(), deals: [containerDeal()], rpc: [{ data: null, error: { code: 'P0001', message } }] });
    const res = await runEdit(db);
    assert.equal(res.status, 409, message);
    assert.equal(res.body.code, code);
    assert.equal(res.audits.length, 0);
  }
});

test('แก้ใบ: audit update ครั้งเดียว — before เก็บใบ (ไม่พกดีล) + บรรทัด + งวด + เอกสารแทนสัญญา · ใบตีกลับบอกว่ากลับเป็นร่าง', async () => {
  const db = fakeDb({
    loaded: editRow({ status: 'rejected', rejectionReason: 'ยอดงวดผิด' }), deals: [containerDeal()], rpc: [updated()],
    beforeLines: [{ id: 'SOL-OLD' }], beforeInstallments: [{ id: 'SOI-OLD' }], beforeContract: { id: 'CTR-HEDIT', externalRef: 'เดิม' },
  });
  const res = await runEdit(db);
  assert.equal(res.status, 200);
  assert.equal(res.audits.length, 1);
  const [entry] = res.audits;
  assert.equal(entry.action, 'update');
  assert.equal(entry.entityType, 'sales_order');
  assert.equal(entry.entityId, EDIT_ID);
  assert.equal(entry.before.order.status, 'rejected');
  assert.ok(!('deal' in entry.before.order));
  assert.deepEqual(entry.before.lines, [{ id: 'SOL-OLD' }]);
  assert.deepEqual(entry.before.installments, [{ id: 'SOI-OLD' }]);
  assert.equal(entry.before.contract.externalRef, 'เดิม');
  assert.equal(entry.after.contract.id, 'CTR-HEDIT');
  assert.match(entry.summary, /ถูกตีกลับ — กลับเป็นร่าง/);
  const contractRead = db.calls.from.find((q) => q.table === 'sales_contracts');
  assert.deepEqual(contractRead.filters, [['eq', 'id', 'CTR-HEDIT']]);
});

test('ตัวกรองหลักฐาน (ใช้ร่วมกับขั้นส่งอนุมัติ): ว่าง = ไม่ถามที่เก็บไฟล์ · เหลือ storagePath ของใบนี้เท่านั้น', async () => {
  const db = fakeDb();
  assert.deepEqual(await sanitizeHistoricalEvidence({ supabase: db.supabase, orderId: EDIT_ID, refs: [] }), { evidence: [], error: null });
  assert.deepEqual(await sanitizeHistoricalEvidence({ supabase: db.supabase, orderId: EDIT_ID, refs: 'x' }), { evidence: [], error: null });
  assert.equal(db.calls.storage.length, 0);
  const kept = await sanitizeHistoricalEvidence({ supabase: db.supabase, orderId: EDIT_ID, refs: [FOREIGN_REF, OWN_REF] });
  assert.equal(kept.error, null);
  assert.deepEqual(kept.evidence.map((ref) => ref.fileName), ['slip.pdf']);
});

// ── ซอร์ส ────────────────────────────────────────────────────────────────────────────────
test('ตัวเขียนไม่ยืมของขั้นอนุมัติ: ไม่ import ตัวหยุดยอดงวด/ตัวคิดยอดสด/ตัวตรึงฉบับ · route ทั้งสองมีด่านสิทธิ์ของตัวเองและไม่โหลดแถวเอง', () => {
  const commit = readFileSync(join(HERE, 'historicalOrderCommit.js'), 'utf8');
  const routes = [
    readFileSync(join(HERE, '../../app/api/sales-planning/sales-orders/historical/route.js'), 'utf8'),
    readFileSync(join(HERE, '../../app/api/sales-planning/sales-orders/historical/[id]/route.js'), 'utf8'),
  ];
  for (const source of [commit, ...routes]) {
    assert.doesNotMatch(source, /freezeInstallments|withLiveAmounts|captureIssuedSalesOrderSnapshot/);
  }
  for (const route of routes) {
    assert.match(route, /if \(!user\) return unauthorized\(\);/);
    assert.match(route, /if \(!canKeyHistoricalSalesOrder\(user\)\) return forbidden\('คีย์ใบสั่งขายย้อนหลังได้เฉพาะฝ่ายขายและแอดมิน'\);/);
    assert.match(route, /commitHistoricalOrder\(\{/);
    assert.doesNotMatch(route, /\.from\(/, 'การโหลดทั้งหมดอยู่ใน lib');
  }
  assert.match(routes[1], /export const PATCH = withUser/);
  assert.match(routes[1], /orderId: id/);
  assert.match(commit, /loadScoped\(supabase, 'sales_orders', orderId, user, 'edit'\)/);
});

/* 🔴 มติ 26/09: บันทึกการยืนยันใบที่อาจซ้ำ **ต้องไม่เข้าลายนิ้วมือของคำขอ** — เวลา · ผู้คีย์ · รายการ · เหตุผลที่ต่างกันระหว่างส่งซ้ำ
   (เน็ตหลุดแล้วกดใหม่) ต้องได้แฮชเดิม ไม่งั้นส่งซ้ำได้ intake_key_conflict ทุกครั้ง · ยามนี้แดงถ้าวันหนึ่งบันทึกถูกย้ายเข้า
   historicalServiceRpcArgs / plan.header */
test('🔴 บันทึกการยืนยันใบที่อาจซ้ำไม่เข้าลายนิ้วมือ — เวลา/ผู้คีย์/รายการ/เหตุผลต่างกัน = p_intake_hash เดิม', async () => {
  const orders = [{ id: 'SOR-OLD', orderNumber: 'SO-26090001-0', orderDate: '2026-01-01', status: 'approved' }];
  const a = fakeDb({ orders, rpc: [created()] });
  await run(a, { acknowledgedDuplicateIds: ['SOR-OLD'], duplicateNote: 'รอบแรก' });
  const b = fakeDb({ orders: [...orders, { ...orders[0], id: 'SOR-OTHER', orderNumber: 'SO-26090002-0' }], rpc: [created()] });
  await run(b, { acknowledgedDuplicateIds: ['SOR-OLD', 'SOR-OTHER'], duplicateNote: 'รอบสองพิมพ์ใหม่' }, { user: { ...supervisor, id: 'U-OTHER', name: 'อีกคน' } });
  const c = fakeDb({ rpc: [created()] });
  await run(c);
  const hashes = [a, b, c].map((db) => db.calls.rpc[0].args.p_intake_hash);
  assert.equal(new Set(hashes).size, 1, 'แฮชต้องเท่ากันทั้งสามรอบ');
  assert.notDeepEqual(a.calls.rpc[0].args.p_header.intake.duplicateReview, b.calls.rpc[0].args.p_header.intake.duplicateReview);
});

