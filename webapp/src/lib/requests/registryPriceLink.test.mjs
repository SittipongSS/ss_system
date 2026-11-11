// มติเจ้าของ 11/11/2026 — ใส่ราคาใหม่ที่ทะเบียนกลิ่น/สูตร (แท็บกลิ่น/สูตรของหน้า "ราคา + Ingredient List" หรือหน้าทะเบียน)
//   ผูกเข้าแถวคำร้องที่รอราคาของตัวนั้นเอง ไม่ต้องกด "ใช้ราคานี้" ซ้ำ · "ใช้ราคานี้" เหลือไว้ยืนยัน **ราคาเก่าที่ค้างอยู่** (ม-153)
//   เจ้าของ: *"ถ้ามีราคาเก่าค้างอยู่ ให้ rd เฟิร์มราคาก่อน แต่ถ้าไม่มี กรอกใหม่ ก็จะไม่ต้องเฟิร์มราคา"*
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linkRegistryPriceToWaitingRows, mayBeAffected, rowsToLink } from './registryPriceLink.js';
import { makeRegistryPriceHandler } from '../master/registryPriceRoute.js';

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// แถวที่ลูกค้าคอนเฟิร์มแล้ว ยังไม่มีราคา (ขั้น "รอใส่ราคา")
const row = (over = {}) => ({
  id: 'IT-1', requestId: 'RQ-1', lineKind: 'product_dev', label: 'หัวน้ำหอม',
  ackAt: '2026-10-01', readyAt: '2026-10-02', pickedUpAt: '2026-10-03', sentAt: '2026-10-04',
  outcome: 'confirmed', outcomeAt: '2026-10-21', answerStatus: 'pending', answeredRevisionId: null,
  producedFormulaId: 'FML-OIL', producedScentId: null,
  ...over,
});
const priced = (key, revisionId, over = {}) => ({
  key, short: key, text: `ราคา ${key}`, source: { id: 'X', code: 'PF1', name: 'กลิ่น' },
  price: { state: 'ready', unitPrice: 2866.7, revisionId, revisionNo: 2, ...over },
});
const live = (current, ingredient = { required: false }) => ({ current, ingredient });
const NEW = new Set(['REV-NEW']);

test('🔴 ผูกเฉพาะแถวที่ "ใช้ราคานี้" จะเลือก rev ที่เพิ่งเขียน — ราคาเก่าที่ค้างอยู่ยังต้องให้ RD ยืนยัน', () => {
  const rows = [
    row({ id: 'a' }),                                   // หัวน้ำหอม 02-020: F ช่องเดียว = rev ใหม่ → ผูก
    row({ id: 'b', producedFormulaId: 'FML-B' }),       // สูตรที่มี FB เก่าอยู่ ใส่แค่ F ใหม่ → ช่องหลักยังเป็น FB เก่า → ไม่แตะ
    row({ id: 'c', producedFormulaId: 'FML-C' }),       // ราคาเก่าทั้งชุด (ไม่ได้เพิ่งเขียน) → ไม่แตะ
    row({ id: 'd', answerStatus: 'done', answeredRevisionId: 'R' }), // จบแล้ว → ไม่แตะ
  ];
  const links = rowsToLink(rows, [
    live([priced('F', 'REV-NEW')]),
    live([priced('F', 'REV-NEW'), priced('FB', 'REV-OLD-FB')]),
    live([priced('FB', 'REV-OLD')]),
    live([priced('F', 'REV-NEW')]),
  ], NEW);
  assert.deepEqual(links.map((l) => l.row.id), ['a']);
  assert.equal(links[0].entry.price.revisionId, 'REV-NEW');
});

test('ราคาที่เพิ่งเขียนแต่ใช้ไม่ได้ (หมดอายุ/วัสดุร่าง) = ไม่ผูก · สูตรขาด Ingredient List = ผูกแล้วไปรอ Ingredient List', () => {
  const links = rowsToLink(
    [row({ id: 'x' }), row({ id: 'y', producedFormulaId: 'FML-Y' })],
    [
      live([priced('F', 'REV-NEW', { state: 'expired' })]),
      live([priced('FB', 'REV-NEW')], { required: true, formulaId: 'FML-Y', current: null }),
    ],
    NEW,
  );
  assert.deepEqual(links.map((l) => [l.row.id, l.waitIngredients]), [['y', true]]);
});

test('คัดหยาบ: ช่องของสูตร → แถวที่ผลิตสูตรนั้น · ช่อง F → แถวกลิ่นล้วนของกลิ่นนั้น + แถวสูตรทุกแถว (F ของสูตรลงกลิ่นของสูตร)', () => {
  const formulaOnly = { formulaIds: new Set(['FML-1']), scentIds: new Set() };
  assert.equal(mayBeAffected({ producedFormulaId: 'FML-1' }, formulaOnly), true);
  assert.equal(mayBeAffected({ producedFormulaId: 'FML-2' }, formulaOnly), false);
  assert.equal(mayBeAffected({ producedScentId: 'SC-1' }, formulaOnly), false);
  const scentOnly = { formulaIds: new Set(), scentIds: new Set(['SC-1']) };
  assert.equal(mayBeAffected({ producedScentId: 'SC-1' }, scentOnly), true);
  assert.equal(mayBeAffected({ producedScentId: 'SC-2' }, scentOnly), false);
  assert.equal(mayBeAffected({ producedFormulaId: 'FML-9' }, scentOnly), true);
});

/* ── ทั้งเส้นด้วยตัวจำลอง (ห้ามแตะฐานจริง) ─────────────────────────────────────────────────────────── */
function fakeSupabase(waiting) {
  const chain = {
    select() { return chain; }, eq() { return chain; }, is() { return chain; }, not() { return chain; }, order() { return chain; },
    range() { return Promise.resolve({ data: waiting, error: null }); },
  };
  return { from: (table) => { assert.equal(table, 'dept_request_items'); return chain; } };
}
const RD = { id: 'U1', name: 'RD', role: 'rd', department: 'RD' };
const ask = (over = {}) => ({ id: 'RQ-1', docNo: 'RQ-FD-26100344', dept: 'RD', status: 'acknowledged', items: [row({ id: 'a' })], ...over });

async function runLink({ asks, waiting, liveFor, user = RD, written = [{ slot: { stampColumn: 'scentId', id: 'SC-1' }, revision: { id: 'REV-NEW' } }] }) {
  const calls = { settle: [], record: [], append: [], audit: [] };
  const linked = await linkRegistryPriceToWaitingRows(fakeSupabase(waiting), {
    written, user,
    loadRequest: async (_sb, id) => asks.find((a) => a.id === id) || null,
    loadLive: async (_sb, rows) => rows.map(liveFor),
    settle: async (_sb, args) => { calls.settle.push(args); },
    record: async (_sb, args) => { calls.record.push(args); },
    append: async (_sb, args) => { calls.append.push(args); },
    audit: async (entry) => { calls.audit.push(entry); },
    now: () => '2026-11-11T03:00:00.000Z',
  });
  return { linked, calls };
}

test('🔴 ทั้งเส้น: แถว SOFT RELEASE #1 ได้ราคา F ใหม่ = จบแถวด้วย settleRow ตัวเดียวกับทุกทาง + เธรด/audit ใบละหนึ่ง', async () => {
  const { linked, calls } = await runLink({
    asks: [ask()],
    waiting: [{ id: 'a', requestId: 'RQ-1', producedFormulaId: 'FML-OIL', producedScentId: null }],
    liveFor: () => live([priced('F', 'REV-NEW')]),
  });
  assert.deepEqual(linked, [{ requestId: 'RQ-1', docNo: 'RQ-FD-26100344', itemId: 'a', waitIngredients: false }]);
  assert.deepEqual(calls.settle, [{ id: 'RQ-1', itemId: 'a', revisionId: 'REV-NEW', user: RD, nowIso: '2026-11-11T03:00:00.000Z' }]);
  assert.equal(calls.record.length, 0);
  assert.equal(calls.append.length, 1);
  assert.match(calls.append[0].body, /^ใส่ราคาที่ทะเบียน PF1 — F 2,866\.7.* ฿\/กก\. \(rev 2\) · ผูกเข้า 1 รายการ$/);
  assert.equal(calls.audit.length, 1);
  assert.equal(calls.audit[0].entityId, 'RQ-1');
});

test('ด่านต่อใบ: ใบปิด/ยกเลิก · ฝ่ายอื่น · คนกดตอบฝ่ายนี้ไม่ได้ = ไม่แตะ · สูตรขาด Ingredient List = ประทับราคาไว้ (ไม่จบ)', async () => {
  const waiting = ['RQ-C', 'RQ-PC', 'RQ-W'].map((requestId) => ({ id: `i-${requestId}`, requestId, producedFormulaId: 'FML-1' }));
  const asks = [
    ask({ id: 'RQ-C', status: 'closed', items: [row({ id: 'i-RQ-C', requestId: 'RQ-C' })] }),
    ask({ id: 'RQ-PC', dept: 'PC', items: [row({ id: 'i-RQ-PC', requestId: 'RQ-PC' })] }),
    ask({ id: 'RQ-W', items: [row({ id: 'i-RQ-W', requestId: 'RQ-W', producedFormulaId: 'FML-1' })] }),
  ];
  const { linked, calls } = await runLink({
    asks, waiting,
    written: [{ slot: { stampColumn: 'formulaId', id: 'FML-1' }, revision: { id: 'REV-NEW' } }],
    liveFor: () => live([priced('FB', 'REV-NEW')], { required: true, formulaId: 'FML-1', current: null }),
  });
  assert.deepEqual(linked.map((l) => [l.requestId, l.waitIngredients]), [['RQ-W', true]]);
  assert.deepEqual(calls.record.map((r) => r.itemId), ['i-RQ-W']);
  assert.equal(calls.settle.length, 0);
  assert.match(calls.append[0].body, /รอ Ingredient List 1 รายการ$/);

  // ฝ่ายขายใส่ราคาทะเบียนไม่ได้อยู่แล้ว แต่ถ้าหลุดมาถึง ต้องไม่ปิดงานของ RD แทน
  const sales = await runLink({
    asks, waiting, user: { id: 'U9', role: 'ae', department: 'SA' },
    written: [{ slot: { stampColumn: 'formulaId', id: 'FML-1' }, revision: { id: 'REV-NEW' } }],
    liveFor: () => live([priced('FB', 'REV-NEW')]),
  });
  assert.deepEqual(sales.linked, []);
});

test('ไม่มี rev ใหม่ = ไม่อ่านอะไรเลย · ไม่มีแถวรอราคาที่เกี่ยวข้อง = ไม่เปิดใบ', async () => {
  const none = await linkRegistryPriceToWaitingRows({ from() { throw new Error('ไม่ควรอ่าน'); } }, { written: [], user: RD });
  assert.deepEqual(none, []);
  const { linked, calls } = await runLink({
    asks: [], waiting: [{ id: 'z', requestId: 'RQ-Z', producedScentId: 'SC-OTHER' }],
    liveFor: () => live([]),
  });
  assert.deepEqual(linked, []);
  assert.deepEqual(calls.append, []);
});

/* ── handler ราคาทะเบียน ─────────────────────────────────────────────────────────────────────────── */
function fakeRegistrySupabase() {
  const materials = [];
  const chain = (table) => {
    const c = {
      _f: {},
      select() { return c; }, eq(k, v) { c._f[k] = v; return c; }, is(k, v) { c._f[k] = v; return c; }, in() { return c; },
      order() { return Promise.resolve({ data: c._rows(), error: null }); },
      single() { return Promise.resolve({ data: c._one(), error: null }); },
      maybeSingle() { return Promise.resolve({ data: c._one(), error: null }); },
      then(resolve) { return resolve({ data: c._rows(), error: null }); },
      insert(r) { if (table === 'material_prices') materials.push({ ...r }); return { select: () => ({ single: () => Promise.resolve({ data: { ...r }, error: null }) }) }; },
      update() { return { eq: () => Promise.resolve({ error: null }) }; },
      _rows() { return table === 'material_prices' ? materials.filter((m) => Object.entries(c._f).every(([k, v]) => k === 'id' || (m[k] ?? null) === v)) : []; },
      _one() {
        if (table === 'material_prices') return materials.find((m) => m.id === c._f.id) || null;
        if (table === 'material_price_revisions') return { id: 'REV-NEW', revisionNo: 1 };
        return null;
      },
    };
    return c;
  };
  return { from: chain, rpc: () => Promise.resolve({ data: { revisionId: 'REV-NEW' }, error: null }) };
}
const SCENT = { id: 'SC-1', code: 'PF10390102', name: 'SOFT RELEASE', customerId: 'CUS-1', customerName: 'ลูกค้า', status: 'active' };
const scentHandler = (linkRows) => makeRegistryPriceHandler({
  audit: async () => {}, linkRows,
  kind: 'RM_F', stampColumn: 'scentId', entityType: 'scent', entityLabel: 'กลิ่น',
  find: async () => SCENT, usableError: () => null,
});
const post = (h) => h({
  user: RD, supabase: fakeRegistrySupabase(), req: { json: async () => ({ price: 2866.7 }) }, ctx: { params: Promise.resolve({ id: 'SC-1' }) },
});

test('🔴 handler ราคาทะเบียน: ส่ง rev ที่เพิ่งเขียนให้ตัวผูก · ตอบ linkedRows · ตัวผูกพัง = ราคายังบันทึก (200) + linkError บอกทางออก', async () => {
  let seen = null;
  const ok = await post(scentHandler(async (_sb, args) => { seen = args; return [{ requestId: 'RQ-1', itemId: 'a', waitIngredients: false }]; }));
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.deepEqual(data.linkedRows, [{ requestId: 'RQ-1', itemId: 'a', waitIngredients: false }]);
  assert.equal(data.linkError, '');
  assert.deepEqual(seen.written.map((w) => [w.slot.key, w.revision.id]), [['F', 'REV-NEW']]);
  assert.equal(seen.user, RD);

  const broken = await post(scentHandler(async () => { throw new Error('ฐานล่ม'); }));
  assert.equal(broken.status, 200, 'ราคาเขียนไปแล้ว — ห้ามบอกว่าบันทึกราคาไม่สำเร็จ');
  const bad = await broken.json();
  assert.deepEqual(bad.linkedRows, []);
  assert.match(bad.linkError, /ฐานล่ม/);
  assert.match(bad.linkError, /ใช้ราคานี้/);
});

test('ยามซอร์ส: โมดัลราคาบอกจำนวนที่ผูก · ตัวผูกถาม currentPriceToUse ตัวเดียวกับปุ่ม · จบแถวด้วย settleRow/recordRowPrice', () => {
  const modal = src('../../components/database/RegistryPriceModal.js');
  assert.match(modal, /ผูกเข้า \$\{linked\.length\} รายการในคำร้องที่รอราคา/);
  assert.match(modal, /data\?\.linkError/);
  const lib = src('./registryPriceLink.js');
  assert.match(lib, /currentPriceToUse\(live\?\.\[i\]\?\.current \|\| \[\]\)/);
  assert.match(lib, /settle = settleRow, record = recordRowPrice/);
  assert.match(lib, /REQUEST_OPEN_STATUSES\.includes\(ask\.status\)/);
});
