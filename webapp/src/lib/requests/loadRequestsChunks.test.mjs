// ── ตัวโหลดคิวคำร้องต้องไม่ล้มเมื่อจำนวนใบโตข้ามเพดาน (2026-09-11) ─────────────────
//
// 🐞 `loadRequests` (lib/materialPricesAdmin.js) เคยส่ง id ของ **ทุกใบ** เข้า `.in('requestId', …)` ก้อนเดียว
// · วัดของจริง 188 ใบ = URL 7,985 ไบต์ จากเพดาน 14,000 (`POSTGREST_URL_LIMIT`) ⇒ ชนที่ ~330 ใบ
// (ใบโต 74 → 188 ใน 26 วัน ≈ กลาง ต.ค. 69) แล้วคิว "ทั้งหมด" ของแอดมิน + ป้ายตัวเลขบนเมนู
// (`loadVisibleRequests` ใช้ตัวโหลดตัวเดียวกัน) ล้มพร้อมกัน · และหัวใบไม่มี `.range()` ⇒ ใบที่ 1,001
// ขึ้นไปหายเงียบ ๆ (Max rows = 1,000)
//
// เทสต์นี้ใช้ client จำลองที่ประกอบ URL แบบ PostgREST แล้ว **ตีกลับเหมือนยามจริง** (`guardedFetch`)
// เมื่อ URL เกินเพดาน · และตัดผลที่ 1,000 แถวเมื่อไม่มี `.range()` เหมือนฐานจริง — ไม่แตะฐานข้อมูล
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRequests } from '../materialPricesAdmin.js';
import { POSTGREST_URL_LIMIT } from '../supabaseAdmin.js';
import { IN_CHUNK_SIZE } from '../supabaseInChunks.js';

const MAX_ROWS = 1000;
const uuid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

function fakeSupabase(tables) {
  const calls = [];
  const from = (table) => {
    const state = { filters: [], range: null };
    const builder = {
      select() { return builder; },
      eq(column, value) { state.filters.push({ column, op: 'eq', value }); return builder; },
      in(column, values) { state.filters.push({ column, op: 'in', value: values }); return builder; },
      order() { return builder; },
      range(fromRow, toRow) { state.range = [fromRow, toRow]; return builder; },
      then(resolve, reject) {
        const query = state.filters.map(({ column, op, value }) => (op === 'in'
          ? `${column}=${encodeURIComponent(`in.(${value.join(',')})`)}`
          : `${column}=eq.${encodeURIComponent(value)}`)).join('&');
        const url = `https://ibqq.supabase.co/rest/v1/${table}?select=*${query ? `&${query}` : ''}`;
        calls.push({ table, url, filters: state.filters });
        // ⚠️ ยามจริง (`guardedFetch`) โยน error เมื่อเกินเพดาน — supabase-js ส่งต่อเป็น `{ error }`
        if (url.length > POSTGREST_URL_LIMIT) {
          return Promise.resolve({ data: null, error: { message: `URL ${url.length} bytes` } }).then(resolve, reject);
        }
        let rows = tables[table] || [];
        for (const { column, op, value } of state.filters) {
          rows = rows.filter((r) => (op === 'in' ? value.includes(r[column]) : r[column] === value));
        }
        rows = state.range ? rows.slice(state.range[0], state.range[1] + 1) : rows.slice(0, MAX_ROWS);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return builder;
  };
  return { from, calls };
}

// 1,200 ใบ (เกินทั้งเพดาน URL ~330 ใบ และเพดาน 1,000 แถว) · ใบละ 1 แถว · ลูกค้า/ดีล/โครงการไม่ซ้ำกันทุกใบ
const N = 1200;
const requests = Array.from({ length: N }, (_, i) => ({
  id: `DR-${uuid(i)}`,
  kind: 'document',
  dept: 'RD',
  status: 'acknowledged',
  createdAt: `2026-09-11T00:00:${String(i % 60).padStart(2, '0')}Z`,
  customerId: `CUS-${uuid(i)}`,
  projectId: `PRJ-${String(i).padStart(12, '0')}`,
  dealId: `DEAL-${String(i).padStart(12, '0')}`,
}));
const tables = {
  dept_requests: requests,
  dept_request_items: requests.map((r, i) => ({ id: `DRI-${uuid(i)}`, requestId: r.id, sortOrder: 0 })),
  customers: requests.map((r) => ({ id: r.customerId, arCode: `AR-${r.id.slice(-4)}`, brands: [] })),
  projects: requests.map((r) => ({ id: r.projectId, code: `PJ-${r.id.slice(-4)}`, name: 'p' })),
  sales_deals: requests.map((r) => ({ id: r.dealId, code: `DL-${r.id.slice(-4)}`, title: 't', metadata: {} })),
};

test('🔴 ใบ 1,200 ใบ: ทุกคำขอ URL ไม่เกินเพดาน · ลิสต์ id ถูกซอยเป็นก้อน · ได้ครบทุกใบทุกแถว', async () => {
  const supabase = fakeSupabase(tables);
  const rows = await loadRequests(supabase);

  // หัวใบครบ (ไล่หน้าเกิน 1,000) และทุกใบได้แถวของตัวเอง + ข้อมูลเติมจากทะเบียน
  assert.equal(rows.length, N);
  assert.ok(rows.every((r) => r.items.length === 1), 'ทุกใบต้องได้แถวของตัวเอง');
  assert.ok(rows.every((r) => r.customerArCode && r.projectCode), 'ทะเบียนเติมครบทุกใบ');

  const tooLong = supabase.calls.filter((c) => c.url.length > POSTGREST_URL_LIMIT);
  assert.deepEqual(tooLong.map((c) => `${c.table} ${c.url.length}`), []);

  for (const table of ['dept_request_items', 'customers', 'projects', 'sales_deals']) {
    const chunks = supabase.calls.filter((c) => c.table === table)
      .map((c) => c.filters.find((f) => f.op === 'in')?.value || []);
    assert.ok(chunks.length >= Math.ceil(N / IN_CHUNK_SIZE), `${table}: ต้องยิงหลายก้อน (ได้ ${chunks.length})`);
    assert.ok(chunks.every((ids) => ids.length <= IN_CHUNK_SIZE), `${table}: ก้อนต้องไม่เกิน ${IN_CHUNK_SIZE}`);
    assert.equal(new Set(chunks.flat()).size, N, `${table}: ต้องครอบทุก id ไม่ตกหล่น`);
  }
  // หัวใบไล่หน้า (Max rows = 1,000) — ไม่มี `.range()` = ได้แค่ 1,000 ใบแรกเงียบ ๆ
  assert.ok(supabase.calls.filter((c) => c.table === 'dept_requests').length >= 2, 'หัวใบต้องไล่หน้า');
});

test('โหมด lean (ป้ายตัวเลขบนเมนู) ยังไม่ยิงทะเบียน แต่แถวคำร้องซอยเป็นก้อนเหมือนกัน', async () => {
  const supabase = fakeSupabase(tables);
  const rows = await loadRequests(supabase, { lean: true });
  assert.equal(rows.length, N);
  assert.deepEqual(
    [...new Set(supabase.calls.map((c) => c.table))].sort(),
    ['dept_request_items', 'dept_requests'],
  );
  assert.ok(supabase.calls.every((c) => c.url.length <= POSTGREST_URL_LIMIT));
});
