// ป้าย "ไม่นับ Actual" บนจอระดับดีล (รายการดีล · ลิ้นชักดีลแดชบอร์ด · การ์ดดีลหน้าลีด) — mig 0439 · ตรวจ 23/11
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ACTUAL_NONE_ORDER_COLS, actualNoneTitle, attachActualNone, loadDealActualNone, orderActualNoneText, summarizeActualNone,
} from './dealActualNone.js';

const REASON = 'ใบตัวอย่างฟรีให้ลูกค้าทดลอง ไม่นับยอดขาย';
const NONE_SO = { id: 'S1', dealId: 'D1', status: 'approved', origin: 'pipeline', actualMode: 'none', actualNoneReason: REASON };
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('ป้ายของใบ: ไม่นับ + เหตุผล · ใบแบบอื่น / ย้อนอนุมัติแล้ว / ใบย้อนหลัง = ไม่มีป้าย', () => {
  assert.equal(orderActualNoneText(NONE_SO), `ไม่นับ Actual · ${REASON}`);
  assert.equal(orderActualNoneText({ ...NONE_SO, actualMode: 'order', actualNoneReason: null }), '');
  assert.equal(orderActualNoneText({ ...NONE_SO, status: 'approval_revoked' }), '');
  assert.equal(orderActualNoneText({ ...NONE_SO, origin: 'historical' }), '');
});

test('สรุปของดีล: ใบเดียว / หลายใบ · short ไม่มีเหตุผล (ช่องเงิน nowrap) · reasons ครบทุกใบ', () => {
  assert.deepEqual(summarizeActualNone([NONE_SO]), {
    count: 1, text: `ไม่นับ Actual · ${REASON}`, short: 'ไม่นับ Actual', reasons: [REASON],
  });
  const two = summarizeActualNone([NONE_SO, { ...NONE_SO, id: 'S2', actualNoneReason: 'ของแถมงานเปิดตัว ไม่คิดเงิน' }]);
  assert.equal(two.short, 'ไม่นับ Actual 2 ใบ');
  assert.equal(two.text, 'ไม่นับ Actual 2 ใบ');
  assert.deepEqual(two.reasons, [REASON, 'ของแถมงานเปิดตัว ไม่คิดเงิน']);
  assert.equal(summarizeActualNone([]), null);
  assert.equal(summarizeActualNone([{ ...NONE_SO, actualMode: 'order' }]), null);
  assert.equal(actualNoneTitle(summarizeActualNone([NONE_SO])), `อนุมัติแล้วแบบไม่นับ Actual — ${REASON}`);
});

/* ตัวจำลอง query builder — จดตัวกรองที่ถูกเรียก (เทสต์ห้ามต่อฐานจริง · AGENTS.md) */
function fakeSupabase(rows, calls) {
  return {
    from(table) {
      const q = { table, filters: [] };
      calls.push(q);
      const builder = {
        select(cols) { q.cols = cols; return builder; },
        in(col, vals) { q.filters.push(['in', col, vals]); return builder; },
        eq(col, val) { q.filters.push(['eq', col, val]); return builder; },
        order() { return builder; },
        then(resolve) { resolve({ data: rows.filter((r) => q.filters.find((f) => f[0] === 'in')[2].includes(r.dealId)), error: null }); },
      };
      return builder;
    },
  };
}
const passThrough = {
  fetchInChunks: async (ids, make) => {
    const out = [];
    for (let i = 0; i < ids.length; i += 2) {
      const { data, error } = await make(ids.slice(i, i + 2));
      if (error) return { data: null, error };
      out.push(...data);
    }
    return { data: out, error: null };
  },
  fetchAllResult: async (make) => make(),
};

const won = (id, extra = {}) => ({ id, stage: 'won', ...extra });

test('ตัวโหลด: ถามเฉพาะดีล Won ที่ไม่ใช่ดีลภาชนะ · กรองที่ฐาน (pipeline + none + approved) · ซอย id · จับกลุ่มตามดีล', async () => {
  const calls = [];
  const rows = [NONE_SO, { ...NONE_SO, id: 'S9', dealId: 'D3' }];
  const deals = [won('D1'), won('D2'), won('D3'), won('D1'), { id: 'D4', stage: 'quotation' }, won('D5', { origin: 'historical' })];
  const { map, error } = await loadDealActualNone(fakeSupabase(rows, calls), deals, passThrough);
  assert.equal(error, null);
  assert.equal(calls.length, 2, 'ซอยลิสต์ id (ตัวจำลองซอยทีละ 2) · id ซ้ำถูกตัด');
  for (const c of calls) {
    assert.equal(c.table, 'sales_orders');
    assert.equal(c.cols, ACTUAL_NONE_ORDER_COLS);
    assert.ok(c.filters.some((f) => f[0] === 'eq' && f[1] === 'actualMode' && f[2] === 'none'));
    assert.ok(c.filters.some((f) => f[0] === 'eq' && f[1] === 'status' && f[2] === 'approved'));
    assert.ok(c.filters.some((f) => f[0] === 'eq' && f[1] === 'origin' && f[2] === 'pipeline'), 'ห่อ pipelineRowsOnly');
  }
  const asked = calls.flatMap((c) => c.filters.find((f) => f[0] === 'in')[2]);
  assert.deepEqual(asked.sort(), ['D1', 'D2', 'D3'], 'ไม่ถามดีลเปิด/ดีลภาชนะ · id ซ้ำถูกตัด');
  assert.equal(map.get('D1').short, 'ไม่นับ Actual');
  assert.equal(map.get('D3').count, 1);
  assert.equal(map.has('D2'), false);
});

test('ตัวโหลด: ไม่มีดีล = ไม่ยิง query · error ของฐานส่งกลับ (supabase ไม่ throw)', async () => {
  const calls = [];
  assert.equal((await loadDealActualNone(fakeSupabase([], calls), [], passThrough)).map.size, 0);
  assert.equal((await loadDealActualNone(fakeSupabase([], calls), [{ id: 'D9', stage: 'lead' }], passThrough)).map.size, 0);
  assert.equal(calls.length, 0);
  const boom = { message: 'boom' };
  const res = await loadDealActualNone(fakeSupabase([], calls), [won('D1')], { ...passThrough, fetchInChunks: async () => ({ data: null, error: boom }) });
  assert.equal(res.error, boom);
});

test('แนบสรุปให้แถวดีล: ไม่มี = null', () => {
  const map = new Map([['D1', summarizeActualNone([NONE_SO])]]);
  const [a, b] = attachActualNone([{ id: 'D1', title: 'x' }, { id: 'D2' }], map);
  assert.equal(a.actualNone.short, 'ไม่นับ Actual');
  assert.equal(a.title, 'x');
  assert.equal(b.actualNone, null);
});

test('API ดีล + API หน้าลีด แนบ actualNone ให้ดีล Won · จอสามจุดวาดป้ายจากตัวเดียวกัน', () => {
  const dealsRoute = read('../../app/api/sales-planning/deals/route.js');
  assert.match(dealsRoute, /loadDealActualNone\(supabase, visible, \{ fetchInChunks, fetchAllResult \}\)/);
  assert.match(dealsRoute, /actualNone: actualNoneMap\.get\(d\.id\) \|\| null/);
  const leadRoute = read('../../app/api/sales-planning/leads/[id]/route.js');
  assert.match(leadRoute, /loadDealActualNone\(supabase, relatedDeals \|\| \[\], \{ fetchInChunks, fetchAllResult \}\)/);
  assert.match(leadRoute, /relatedDeals: attachActualNone\(/);
  for (const page of ['../../app/sales-planning/deals/page.js', '../../app/sales-planning/leads/[id]/page.js', '../../components/salesPlanning/DealDrillDownModal.js']) {
    assert.match(read(page), /<ActualNoneNote /, `${page} ต้องวาดป้ายด้วยชิ้นกลาง`);
  }
  // ตาเห็นบนแถว = ค้นเจอ (รายการดีล)
  assert.match(read('../../app/sales-planning/deals/page.js'), /deal\.actualNone\?\.short, \.\.\.\(deal\.actualNone\?\.reasons \|\| \[\]\)/);
});
