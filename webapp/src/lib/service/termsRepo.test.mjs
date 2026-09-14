// ── รอบขายของโซนต้องอ่านครบเมื่อโตข้ามเพดาน (P0 ใบสั่งขายย้อนหลัง · 2026-09-14) ─────────────
//
// 🐞 `loadTerms` เคยยิงก้อนเดียวไม่มี `.range()` ⇒ ผู้เรียกแบบไม่ส่งตัวกรอง (คิวผูกโซน · ป้ายเมนู ·
// ทะเบียนต่อสัญญา · ด่านจัดสรรเกินของ intake/bind) ได้แค่ 1,000 แถวแรกเงียบ ๆ และ `zoneIds` ยาว
// ชนยาม URL 14,000 ไบต์ที่ ~720 โซน · term ไม่มีสถานะและไม่ถูกลบตอน Rev./ต่อสัญญา ⇒ โตสะสม
// (งานเก่ารอบแรก ~379 แถว + รอบต่อสัญญาทุกปี)
//
// client จำลองประกอบ URL แบบ PostgREST · ตีกลับเมื่อเกินยาม · ตัด 1,000 แถว · เรียงตาม .order()
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTerms, loadZonesForSites, loadAllZones } from './termsRepo.js';
import { POSTGREST_URL_LIMIT } from '../supabaseAdmin.js';
import { IN_CHUNK_SIZE } from '../supabaseInChunks.js';

const MAX_ROWS = 1000;

function fakeSupabase(tables) {
  const calls = [];
  const from = (table) => {
    const state = { filters: [], orders: [], range: null };
    const builder = {
      select() { return builder; },
      eq(column, value) { state.filters.push({ column, op: 'eq', value }); return builder; },
      in(column, values) { state.filters.push({ column, op: 'in', value: values }); return builder; },
      order(column, { ascending = true } = {}) { state.orders.push([column, ascending]); return builder; },
      range(a, b) { state.range = [a, b]; return builder; },
      then(resolve, reject) {
        const query = state.filters.map(({ column, op, value }) => (op === 'in'
          ? `${column}=${encodeURIComponent(`in.(${value.join(',')})`)}`
          : `${column}=eq.${encodeURIComponent(value)}`)).join('&');
        const url = `https://ibqq.supabase.co/rest/v1/${table}?select=*${query ? `&${query}` : ''}`;
        const inSize = state.filters.find((f) => f.op === 'in')?.value.length ?? null;
        calls.push({ table, url, inSize });
        if (url.length > POSTGREST_URL_LIMIT) {
          return Promise.resolve({ data: null, error: { message: `URL ${url.length} bytes` } }).then(resolve, reject);
        }
        let rows = [...(tables[table] || [])];
        for (const f of state.filters) {
          rows = rows.filter((r) => (f.op === 'in' ? f.value.includes(r[f.column]) : r[f.column] === f.value));
        }
        rows.sort((a, b) => {
          for (const [c, asc] of state.orders) {
            if (a[c] === b[c]) continue;
            return (a[c] < b[c] ? -1 : 1) * (asc ? 1 : -1);
          }
          return 0;
        });
        rows = state.range
          ? rows.slice(state.range[0], Math.min(state.range[1] + 1, state.range[0] + MAX_ROWS))
          : rows.slice(0, MAX_ROWS);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return builder;
  };
  return { from, calls };
}

/* id ยาวเท่าของจริง (genId = คำนำหน้า + 12 ตัว) — ความยาว id คือตัวตัดสินเส้น URL */
const gid = (prefix, i) => `${prefix}-${String(i).padStart(12, '0')}`;
const ZONES = 800;
const TERMS = 1200;
const terms = Array.from({ length: TERMS }, (_, i) => ({
  id: gid('SZT', i),
  zoneId: gid('SZN', i % ZONES),
  salesOrderId: gid('SOR', i % 400),
  /* createdAt ซ้ำกันเป็นกลุ่มละ 3 — บังคับให้ต้องมี id ปิดท้ายถึงจะนิ่ง */
  createdAt: `2026-09-${String(1 + (Math.floor(i / 3) % 28)).padStart(2, '0')}T00:00:00+00:00`,
}));
const expectedOrder = (rows) => [...rows].sort((a, b) => (a.createdAt === b.createdAt
  ? (a.id < b.id ? -1 : 1)
  : (a.createdAt < b.createdAt ? 1 : -1)));

test('loadTerms() ไม่ส่งตัวกรอง — ต้องได้ครบทุกแถวแม้เกิน 1,000 และเรียง createdAt ล่าสุดก่อน', async () => {
  const db = fakeSupabase({ service_zone_terms: terms });
  const rows = await loadTerms(db);
  assert.equal(rows.length, TERMS, 'ของเดิมได้ 1,000 แถวแล้วเงียบ');
  assert.deepEqual(rows.map((r) => r.id), expectedOrder(terms).map((r) => r.id));
});

test('loadTerms({ zoneIds }) — ลิสต์โซนยาวเกินเส้น URL ต้องซอยทีละก้อนและได้ครบ', async () => {
  const db = fakeSupabase({ service_zone_terms: terms });
  const zoneIds = Array.from({ length: ZONES }, (_, i) => gid('SZN', i));
  const rows = await loadTerms(db, { zoneIds });
  assert.equal(rows.length, TERMS);
  assert.ok(db.calls.every((c) => c.url.length <= POSTGREST_URL_LIMIT), 'ห้ามมีคำขอที่ยาวเกินยาม');
  assert.ok(db.calls.every((c) => c.inSize === null || c.inSize <= IN_CHUNK_SIZE));
  assert.deepEqual(rows.map((r) => r.id), expectedOrder(terms).map((r) => r.id),
    'เรียงซ้ำหลังรวมก้อน — PostgREST เรียงต่อก้อน ไม่ได้เรียงทั้งชุด');
});

test('loadTerms({ salesOrderId }) กับ zoneIds + salesOrderId — ตัวกรองยังมีผลครบ', async () => {
  const db = fakeSupabase({ service_zone_terms: terms });
  const target = gid('SOR', 7);
  const byOrder = await loadTerms(db, { salesOrderId: target });
  assert.equal(byOrder.length, terms.filter((t) => t.salesOrderId === target).length);
  assert.ok(byOrder.every((t) => t.salesOrderId === target));

  const zoneIds = [...new Set(byOrder.map((t) => t.zoneId))].slice(0, 1);
  const both = await loadTerms(db, { zoneIds, salesOrderId: target });
  assert.ok(both.length > 0);
  assert.ok(both.every((t) => t.salesOrderId === target && zoneIds.includes(t.zoneId)));
});

test('loadTerms({ zoneIds: [] }) — ไม่ยิงเลย', async () => {
  const db = fakeSupabase({ service_zone_terms: terms });
  assert.deepEqual(await loadTerms(db, { zoneIds: [] }), []);
  assert.equal(db.calls.length, 0);
});

test('loadZonesForSites / loadAllZones — ครบเมื่อเกินเพดานและเรียง name แล้ว id', async () => {
  const zones = Array.from({ length: 1100 }, (_, i) => ({
    id: gid('SZN', i), siteId: gid('SVS', i % 900), name: `โซน ${i % 50}`,
  }));
  const db = fakeSupabase({ service_zones: zones });
  const siteIds = Array.from({ length: 900 }, (_, i) => gid('SVS', i));
  const bySite = await loadZonesForSites(db, siteIds);
  assert.equal(bySite.length, 1100);
  assert.ok(db.calls.every((c) => c.url.length <= POSTGREST_URL_LIMIT));
  const all = await loadAllZones(db);
  assert.equal(all.length, 1100);
  const sorted = [...zones].sort((a, b) => (a.name === b.name ? (a.id < b.id ? -1 : 1) : (a.name < b.name ? -1 : 1)));
  assert.deepEqual(bySite.map((z) => z.id), sorted.map((z) => z.id));
  assert.deepEqual(all.map((z) => z.id), sorted.map((z) => z.id));
});
