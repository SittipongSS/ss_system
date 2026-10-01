// ตัวโหลด "ช่วงบริการของรอบขาย" (mig 0400 · ใบแยกรายรายการ) — ไม่มีใบโหมด line = ไม่ยิง · ซอยก้อน · อ่านไม่ขึ้น = โยน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachLinePeriods, loadLinePeriodsOfTerms } from './termPeriodRepo.js';
import { termPeriodOf, termsSoldNow } from './terms.js';

/* supabase ปลอม: `.from().select().in().order().range()` — `range` คือจุดที่ fetchAll ยิงจริง */
function fakeSupabase(tables, { failOn = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table, columns: null, inCol: null, inVals: null, orders: [], range: null };
      const builder = {
        select(columns) { q.columns = columns; return builder; },
        in(column, values) { q.inCol = column; q.inVals = [...values]; return builder; },
        order(column, opts = {}) { q.orders.push([column, opts.ascending !== false]); return builder; },
        range(from, to) {
          q.range = [from, to];
          calls.push(q);
          if (failOn === table) return Promise.resolve({ data: null, error: { message: `อ่าน ${table} ไม่ขึ้น` } });
          const rows = (tables[table] || []).filter((r) => !q.inCol || q.inVals.includes(r[q.inCol]));
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return builder;
    },
  };
}

const STAMP = '2026-09-29T03:00:00Z';
const order = (id, over = {}) => ({
  id, orderNumber: id, status: 'approved', supersededById: null, serviceTermsOpenedAt: STAMP,
  servicePeriodFrom: '2026-09-02', servicePeriodTo: '2027-09-25', servicePeriodMode: 'whole', ...over,
});
const ORDERS = new Map([
  ['SO-LINE', order('SO-LINE', { servicePeriodMode: 'line' })],
  ['SO-WHOLE', order('SO-WHOLE')],
]);
const TABLES = {
  sales_order_lines: [
    { id: 'L1', servicePeriodFrom: '2026-09-02', servicePeriodTo: '2027-09-01' },
    { id: 'L2', servicePeriodFrom: '2026-09-26', servicePeriodTo: '2027-09-25' },
    { id: 'LW', servicePeriodFrom: null, servicePeriodTo: null },
  ],
};
const TERMS = [
  { id: 'T1', zoneId: 'Z1', salesOrderId: 'SO-LINE', salesOrderLineId: 'L1' },
  { id: 'T2', zoneId: 'Z2', salesOrderId: 'SO-LINE', salesOrderLineId: 'L2' },
  { id: 'T3', zoneId: 'Z2', salesOrderId: 'SO-LINE', salesOrderLineId: 'L2' },
  { id: 'TW', zoneId: 'Z3', salesOrderId: 'SO-WHOLE', salesOrderLineId: 'LW' },
  { id: 'TX', zoneId: 'Z4', salesOrderId: 'SO-GONE', salesOrderLineId: 'L1' },
];

test('ไม่มีรอบขายของใบโหมด line = Map ว่าง ไม่ยิงสักคำขอ (ใบเกือบทั้งหมดเป็นโหมดทั้งใบ)', async () => {
  const supabase = fakeSupabase(TABLES);
  const whole = TERMS.filter((t) => t.salesOrderId !== 'SO-LINE');
  assert.equal((await loadLinePeriodsOfTerms(supabase, whole, ORDERS)).size, 0);
  assert.equal((await loadLinePeriodsOfTerms(supabase, [], ORDERS)).size, 0);
  assert.equal((await loadLinePeriodsOfTerms(supabase, null, ORDERS)).size, 0);
  assert.equal((await loadLinePeriodsOfTerms(supabase, TERMS, new Map())).size, 0, 'ไม่รู้จักใบ = ไม่เดาว่าเป็น line');
  /* ใบที่ select ไม่พกโหมด (ผู้เรียกลืมคอลัมน์) = ไม่ยิง — ยาม termPeriodLoaders กันฝั่ง select */
  assert.equal((await loadLinePeriodsOfTerms(supabase, TERMS, new Map([['SO-LINE', { id: 'SO-LINE' }]]))).size, 0);
  const same = await attachLinePeriods(supabase, whole, ORDERS);
  assert.deepEqual(same.map((t, i) => t === whole[i]), [true, true], 'term ของใบทั้งใบเป็นออบเจ็กต์เดิม');
  assert.equal(supabase.calls.length, 0);
});

test('ใบโหมด line: อ่านเฉพาะบรรทัดที่รอบขายของใบนั้นอ้าง (ไม่ซ้ำ) · คอลัมน์ตามชื่อ · ปิดท้ายด้วย order id · แนบช่วงให้ term', async () => {
  const supabase = fakeSupabase(TABLES);
  const map = await loadLinePeriodsOfTerms(supabase, TERMS, ORDERS);
  assert.deepEqual([...map.keys()].sort(), ['L1', 'L2']);
  assert.equal(supabase.calls.length, 1);
  const [call] = supabase.calls;
  assert.equal(call.table, 'sales_order_lines');
  assert.equal(call.columns, 'id, "servicePeriodFrom", "servicePeriodTo"');
  assert.equal(call.inCol, 'id');
  assert.deepEqual(call.inVals, ['L1', 'L2'], 'บรรทัดของใบทั้งใบ (LW) และของใบที่ไม่รู้จักไม่ต้องอ่าน · L2 ครั้งเดียว');
  assert.deepEqual(call.orders.at(-1), ['id', true]);

  const out = await attachLinePeriods(fakeSupabase(TABLES), TERMS, Object.fromEntries(ORDERS));
  assert.deepEqual(out.map((t) => [t.id, t.linePeriodFrom ?? null, t.linePeriodTo ?? null]), [
    ['T1', '2026-09-02', '2027-09-01'], ['T2', '2026-09-26', '2027-09-25'], ['T3', '2026-09-26', '2027-09-25'], ['TW', null, null], ['TX', null, null],
  ]);
  assert.equal(TERMS[0].linePeriodFrom, undefined, 'ไม่แก้ term ของผู้เรียก');
  /* ตัวตัดสินล้วนอ่านช่วงที่แนบ: สาขาแรกจบ 01/09/2027 ทั้งที่ช่วงรวมของใบจบ 25/09/2027 */
  assert.deepEqual(termPeriodOf(out[0], ORDERS.get('SO-LINE')), { from: '2026-09-02', to: '2027-09-01' });
  assert.deepEqual(termsSoldNow(out, ORDERS, '2027-09-10').map((t) => t.id), ['T2', 'T3', 'TW']);
});

test('ลิสต์บรรทัดยาว ⇒ ซอยก้อน (PostgREST 16 KB) และไล่หน้าเกิน 1,000 แถวได้ครบ', async () => {
  const lines = Array.from({ length: 320 }, (_, i) => ({ id: `L${i}`, servicePeriodFrom: '2026-10-01', servicePeriodTo: '2027-09-30' }));
  const terms = lines.map((line, i) => ({ id: `T${i}`, zoneId: `Z${i}`, salesOrderId: 'SO-LINE', salesOrderLineId: line.id }));
  const supabase = fakeSupabase({ sales_order_lines: lines });
  const map = await loadLinePeriodsOfTerms(supabase, terms, ORDERS);
  assert.equal(map.size, 320);
  assert.deepEqual(supabase.calls.map((c) => c.inVals.length), [150, 150, 20]);
  assert.ok(supabase.calls.every((c) => Array.isArray(c.range)), 'ทุกก้อนไล่หน้า (.range)');
});

test('🔴 อ่านไม่ขึ้น = โยน ไม่ใช่ตอบว่า "ไม่มีช่วง" (ไม่งั้นรอบขายถอยไปใช้ช่วงรวมของใบเงียบ ๆ)', async () => {
  const failed = (e) => /ไม่ขึ้น/.test(e?.message);
  await assert.rejects(loadLinePeriodsOfTerms(fakeSupabase(TABLES, { failOn: 'sales_order_lines' }), TERMS, ORDERS), failed);
  await assert.rejects(attachLinePeriods(fakeSupabase(TABLES, { failOn: 'sales_order_lines' }), TERMS, ORDERS), failed);
});

test('รูปซอร์ส: อ่าน sales_order_lines เท่านั้น (ไม่เพิ่มคำสั่งอ่านใบ) · import แค่ตัวซอยก้อน + terms — ไม่ลากตัวตัดสินงานบริการของฝ่ายขาย', () => {
  const src = readFileSync(new URL('./termPeriodRepo.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const tables = [...src.matchAll(/\.from\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  assert.deepEqual(tables, ['sales_order_lines'], 'ยามเงินของใบย้อนหลังนับคำสั่งอ่าน sales_orders — ไฟล์นี้ต้องไม่มี');
  const imports = [...src.matchAll(/^import[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['./terms', '@/lib/supabaseInChunks']);
  assert.doesNotMatch(src, /select\(\s*['"]\*/, 'เลือกคอลัมน์ตามชื่อ');
  assert.match(src, /fetchAllInChunks\(lineIds,/);
  assert.match(src, /\.order\('id', \{ ascending: true \}\)/);
});
