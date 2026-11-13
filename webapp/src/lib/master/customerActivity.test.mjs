// ความเคลื่อนไหวรวมของหน้าลูกค้า (H3 · มติเจ้าของ 13/11/2026 ข้อ 7) — ล็อก:
//  · สิทธิ์อ่านรายเธรดมาจากทะเบียนเธรดกลาง (ไม่เห็นดีล = ไม่เห็นเธรดดีล · ร่างคำร้องของคนอื่นไม่ขึ้น)
//  · แบ่งหน้าด้วยเคอร์เซอร์ (createdAt|id) ไม่ซ้ำ ไม่ข้าม รวมแถวที่เวลาชนกัน
//  · ข้อความที่ถูกลบเหลือแต่รอย · นับต่อแหล่ง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  activityCounts, activityParents, activitySources, cursorOf, loadActivityPage, parseCursor,
} from './customerActivity.js';

function query(getRows) {
  const filters = [];
  let order = null;
  let lim = null;
  let head = false;
  const chain = {
    eq(col, val) { filters.push((r) => r[col] === val); return chain; },
    in(col, vals) { filters.push((r) => vals.includes(r[col])); return chain; },
    lte(col, val) { filters.push((r) => r[col] <= val); return chain; },
    order(col, opts) { if (!order) order = [col, opts?.ascending !== false]; return chain; },
    limit(n) { lim = n; return chain; },
    range(from, to) { chain.window = [from, to + 1]; return chain; },
    then(resolve, reject) {
      let data = getRows().filter((r) => filters.every((f) => f(r)));
      if (order && order[0] === 'createdAt') {
        data = [...data].sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : (a.createdAt < b.createdAt ? -1 : 1)));
        if (!order[1]) data.reverse();
      }
      if (chain.window) data = data.slice(...chain.window);
      if (lim != null) data = data.slice(0, lim);
      return Promise.resolve(head ? { count: data.length, error: null } : { data, error: null }).then(resolve, reject);
    },
  };
  chain.select = (_cols, opts) => { head = !!opts?.head; return chain; };
  return chain;
}
const fake = (rows) => ({ from: (table) => query(() => rows[table] || []) });

const CUSTOMER = { id: 'C1', arCode: 'AR-148', team: 'KA' };
const ROWS = {
  sales_deals: [
    { id: 'D1', code: 'DL-1', title: 'ดีลของฉัน', customerId: 'C1', team: 'KA', ownerId: 'u-ae', leadId: 'L1', createdAt: '2026-10-01' },
    { id: 'D2', code: 'DL-2', title: 'ดีลทีมอื่น', customerId: 'C1', team: 'X', ownerId: 'u-x', createdAt: '2026-10-02' },
  ],
  sales_leads: [{ id: 'L1', company: 'WWG', team: 'KA', assigneeId: 'u-ae', createdBy: 'u-mkt' }],
  dept_requests: [
    { id: 'R1', docNo: 'RQ-1', title: 'ของฉัน', customerId: 'C1', status: 'acknowledged', dept: 'RD', requestedById: 'u-ae', team: 'KA' },
    { id: 'R2', docNo: null, title: 'ร่างคนอื่น', customerId: 'C1', status: 'draft', dept: 'RD', requestedById: 'u-x', team: 'X' },
  ],
  excise_registrations: [],
  entity_updates: [
    { id: 'U01', entityType: 'customer', entityId: 'C1', kind: 'approve', createdAt: '2026-10-01T01:00:00Z' },
    { id: 'U02', entityType: 'deal', entityId: 'D1', kind: 'doc_submit', createdAt: '2026-10-02T01:00:00Z' },
    { id: 'U03', entityType: 'deal', entityId: 'D2', kind: 'note', body: 'ความลับทีมอื่น', createdAt: '2026-10-03T01:00:00Z' },
    { id: 'U04', entityType: 'dept_request', entityId: 'R1', kind: 'comment', body: 'สวัสดี', createdAt: '2026-10-04T01:00:00Z' },
    { id: 'U05', entityType: 'dept_request', entityId: 'R2', kind: 'comment', body: 'ร่าง', createdAt: '2026-10-05T01:00:00Z' },
    { id: 'U06', entityType: 'lead', entityId: 'L1', kind: 'comment', body: 'โทรแล้ว', createdAt: '2026-10-06T01:00:00Z' },
    // สองแถวเวลาเท่ากัน — หน้าต้องตัดตรงกลางคู่นี้ได้โดยไม่ซ้ำ/ไม่ข้าม
    { id: 'U07', entityType: 'deal', entityId: 'D1', kind: 'doc_approve', createdAt: '2026-10-07T01:00:00Z' },
    { id: 'U08', entityType: 'deal', entityId: 'D1', kind: 'doc_accept', createdAt: '2026-10-07T01:00:00Z' },
    { id: 'U09', entityType: 'customer', entityId: 'C1', kind: 'comment', body: 'ลบแล้ว', deletedAt: '2026-10-09', attachments: [{ id: 'f' }], createdAt: '2026-10-08T01:00:00Z' },
  ],
};
const AE = { id: 'u-ae', role: 'ae', team: 'KA', teams: ['KA'] };

test('ต้นทาง: เห็นเฉพาะเธรดที่ทะเบียนเธรดกลางให้อ่าน (ดีลทีมอื่น · ร่างคำร้องของคนอื่น ไม่ขึ้น)', async () => {
  const parents = await activityParents(fake(ROWS), CUSTOMER, AE);
  assert.ok(parents.customer);
  assert.deepEqual(parents.deal.map((d) => d.id), ['D1']);
  assert.deepEqual(parents.dept_request.map((r) => r.id), ['R1']);
  assert.deepEqual(parents.lead.map((l) => l.id), ['L1'], 'ลีดผ่านดีลที่เห็นได้ (มติ 3)');
  const page = await loadActivityPage(fake(ROWS), parents, { limit: 50 });
  const ids = page.items.map((r) => r.id);
  assert.ok(!ids.includes('U03'), 'เธรดดีลทีมอื่นรั่วมาไม่ได้');
  assert.ok(!ids.includes('U05'), 'เธรดร่างคำร้องของคนอื่นรั่วมาไม่ได้');
  assert.deepEqual(ids, ['U09', 'U08', 'U07', 'U06', 'U04', 'U02', 'U01'], 'ใหม่ไปเก่า · เวลาชนกันเรียงด้วย id');
  assert.equal(page.nextCursor, null);
});

test('ไม่มีสิทธิ์สายขาย/คำร้อง = เหลือเธรดลูกค้าอย่างเดียว', async () => {
  const parents = await activityParents(fake(ROWS), CUSTOMER, { id: 'u-wh', role: 'wh' });
  assert.deepEqual([parents.deal.length, parents.dept_request.length, parents.lead.length], [0, 0, 0]);
  const page = await loadActivityPage(fake(ROWS), parents);
  assert.deepEqual(page.items.map((r) => r.entityType), ['customer', 'customer']);
});

test('แบ่งหน้า: เคอร์เซอร์ตัดกลางคู่เวลาชนกันได้ ไม่ซ้ำ ไม่ข้าม · หน้าสุดท้ายไม่มีเคอร์เซอร์', async () => {
  const parents = await activityParents(fake(ROWS), CUSTOMER, AE);
  const seen = [];
  let before = null;
  for (let i = 0; i < 10; i += 1) {
    const page = await loadActivityPage(fake(ROWS), parents, { before, limit: 2 });
    seen.push(...page.items.map((r) => r.id));
    if (!page.nextCursor) break;
    before = page.nextCursor;
  }
  assert.deepEqual(seen, ['U09', 'U08', 'U07', 'U06', 'U04', 'U02', 'U01']);
});

test('กรองแหล่ง: source=deal ได้แต่เธรดดีลที่เห็นได้', async () => {
  const parents = await activityParents(fake(ROWS), CUSTOMER, AE);
  const page = await loadActivityPage(fake(ROWS), parents, { source: 'deal' });
  assert.deepEqual(page.items.map((r) => r.id), ['U08', 'U07', 'U02']);
});

test('ข้อความที่ถูกลบเหลือแต่รอย (เนื้อ/ไฟล์แนบหาย) เหมือนเธรดรายใบ', async () => {
  const parents = await activityParents(fake(ROWS), CUSTOMER, AE);
  const [deleted] = (await loadActivityPage(fake(ROWS), parents, { source: 'customer' })).items;
  assert.equal(deleted.id, 'U09');
  assert.equal(deleted.body, null);
  assert.deepEqual(deleted.attachments, []);
});

test('นับต่อแหล่ง + รวม · ป้ายต้นทางชี้หน้าของใบ', async () => {
  const parents = await activityParents(fake(ROWS), CUSTOMER, AE);
  const counts = await activityCounts(fake(ROWS), parents);
  assert.deepEqual(counts, { customer: 2, deal: 3, dept_request: 1, lead: 1, excise_registration: 0, all: 7 });
  const sources = activitySources(parents);
  assert.deepEqual(sources['deal:D1'], { type: 'deal', code: 'DL-1', title: 'ดีลของฉัน', href: '/sa/deals/D1' });
  assert.equal(sources['dept_request:R1'].href, '/requests/R1');
});

test('เคอร์เซอร์: พังรูป = หน้าแรก · กลับไปกลับมาได้', () => {
  assert.equal(parseCursor('ขยะ'), null);
  assert.equal(parseCursor(''), null);
  const row = { createdAt: '2026-10-07T01:00:00Z', id: 'U08' };
  assert.deepEqual(parseCursor(cursorOf(row)), { at: row.createdAt, id: 'U08' });
});

test('route: ต้องล็อกอิน · ลูกค้าไม่มี = 404 · error ของ query ลูกค้าเป็น 500 ก่อนสรุปว่าไม่พบ · มี alias ใต้ /api/master', () => {
  const route = readFileSync(new URL('../../app/api/customers/[id]/activity/route.js', import.meta.url), 'utf8');
  assert.match(route, /if \(!user\) return Response\.json\(\{ error: 'ต้องเข้าสู่ระบบ' \}, \{ status: 401 \}\)/);
  assert.ok(route.indexOf('if (customerError)') < route.indexOf('if (!customer)'));
  const alias = readFileSync(new URL('../../app/api/master/customers/[id]/activity/route.js', import.meta.url), 'utf8');
  assert.match(alias, /export \{ GET \} from "\.\.\/\.\.\/\.\.\/\.\.\/customers\/\[id\]\/activity\/route"/);
});
