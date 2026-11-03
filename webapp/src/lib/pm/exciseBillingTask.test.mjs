// Q21 (มติเจ้าของ 03/11/2026): งานไทม์ไลน์ SA "วางบิลสินค้าก่อนส่ง + ค่าสรรพสามิต" ปิดเองเมื่อ SO ทุกใบของดีลจัดการค่าสรรพสามิตแล้ว
// · ย้อนการตัดสิน = งานกลับเป็นค้าง (เฉพาะงานที่ระบบติ๊ก) · ป้ายบนงานพาไปหน้า SO
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXCISE_BILLING_TASK_SOURCE, exciseBillingStepBadge, exciseBillingTaskUpdates, isExciseBillingTask,
} from './exciseBillingTask.js';
import { exciseBillingDealIdsFor, exciseBillingTaskAfter, exciseBillingTaskAround, syncExciseBillingTasks } from './exciseBillingTaskSync.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const task = (over = {}) => ({
  id: 'PT-1', projectId: 'PRJ-1', dealId: 'DL-1', role: 'SA', status: 'Pending',
  name: 'วางบิลสินค้าก่อนส่ง + ค่าสรรพสามิต [Optional]', workflowTemplateStepKey: 'npd-43',
  actualStartDate: null, systemCompletedBy: null, ...over,
});

// ฐานจำลองแบบเล็ก: กรอง eq/in/is · update คืนแถวที่ตรง (ใช้ทดสอบ CAS) · ไม่มีวันแตะฐานจริง
function fakeDb(tables) {
  const writes = [];
  const run = (q) => {
    const rows = (tables[q.table] || []).filter((row) => q.filters.every(([op, column, value]) => {
      if (op === 'eq') return row[column] === value;
      if (op === 'in') return value.includes(row[column]);
      if (op === 'is') return value === null ? row[column] == null : row[column] === value;
      return true;
    }));
    if (q.patch) {
      rows.forEach((row) => Object.assign(row, q.patch));
      writes.push({ table: q.table, filters: q.filters, patch: q.patch, count: rows.length });
    }
    if (q.single) return { data: rows[0] ? { ...rows[0] } : null, error: null };
    return { data: rows.map((row) => ({ ...row })), error: null };
  };
  const from = (table) => {
    const q = { table, filters: [], patch: null, single: false };
    const builder = {
      select: () => builder,
      order: () => builder,
      range: () => builder,
      eq: (column, value) => { q.filters.push(['eq', column, value]); return builder; },
      in: (column, value) => { q.filters.push(['in', column, value]); return builder; },
      is: (column, value) => { q.filters.push(['is', column, value]); return builder; },
      update: (patch) => { q.patch = patch; return builder; },
      maybeSingle: () => { q.single = true; return builder; },
      then: (resolve, reject) => Promise.resolve(run(q)).then(resolve, reject),
    };
    return builder;
  };
  return { from, writes, tables };
}

test('จับงานด้วยคีย์ขั้นของแม่แบบ (npd-43 · reorder-16) · งานเก่าไม่มีคีย์จับด้วยชื่อ · งานไม่มีสรรพสามิต/ฝ่ายอื่นไม่ใช่', () => {
  assert.equal(isExciseBillingTask(task()), true);
  assert.equal(isExciseBillingTask(task({ workflowTemplateStepKey: 'reorder-16' })), true);
  assert.equal(isExciseBillingTask(task({ workflowTemplateStepKey: null })), true, 'งานเก่า 2 แถวไม่มีคีย์');
  assert.equal(isExciseBillingTask(task({ workflowTemplateStepKey: 'npd-44', name: 'วางบิลสินค้าก่อนส่ง (ไม่มีสรรพสามิต)' })), false);
  assert.equal(isExciseBillingTask(task({ role: 'RA', workflowTemplateStepKey: 'npd-31', name: 'ขึ้นทะเบียนสรรพสามิต [Optional]' })), false);
});

test('ตัวตัดสิน: SO อนุมัติแล้ว + ไม่มีใบในคิวรอออก = ติ๊กเสร็จพร้อมป้ายระบบ · ยังมีใบค้าง/ยังไม่มี SO = ไม่แตะ', () => {
  const now = '2026-11-03T03:00:00.000Z';
  const doneStates = new Map([['DL-1', { approvedCount: 2, pendingCount: 0 }]]);
  const [update] = exciseBillingTaskUpdates([task({ status: 'In Progress', actualStartDate: '2026-10-30' })], { dealStates: doneStates, today: '2026-11-03', now });
  assert.deepEqual(update.patch, {
    status: 'Completed', actualStartDate: '2026-10-30', actualFinishDate: '2026-11-03',
    systemCompletedAt: now, systemCompletedBy: EXCISE_BILLING_TASK_SOURCE, updatedAt: now,
  });
  assert.equal(update.prevStatus, 'In Progress', 'เขียนแบบ CAS ด้วยสถานะเดิม');
  assert.equal(exciseBillingTaskUpdates([task()], { dealStates: doneStates, today: '2026-11-03', now })[0].patch.actualStartDate, '2026-11-03', 'ไม่เคยเริ่ม = เริ่มและจบวันเดียวกัน');
  assert.deepEqual(exciseBillingTaskUpdates([task()], { dealStates: new Map([['DL-1', { approvedCount: 1, pendingCount: 1 }]]) }), [], 'ยังมีใบรอออก');
  assert.deepEqual(exciseBillingTaskUpdates([task()], { dealStates: new Map([['DL-1', { approvedCount: 0, pendingCount: 0 }]]) }), [], 'ยังไม่มี SO อนุมัติ');
  assert.deepEqual(exciseBillingTaskUpdates([task({ status: 'Completed' })], { dealStates: doneStates }), [], 'เสร็จอยู่แล้ว');
  assert.deepEqual(exciseBillingTaskUpdates([task()], { dealStates: doneStates, closedProjectIds: new Set(['PRJ-1']) }), [], 'โครงการปิดแล้วแก้ขั้นตอนไม่ได้');
  assert.deepEqual(exciseBillingTaskUpdates([task({ dealId: 'DL-9' })], { dealStates: doneStates }), [], 'ดีลที่ไม่ได้ซิงก์รอบนี้');
});

test('ย้อนการตัดสิน: งานที่ระบบติ๊กกลับเป็นค้าง · งานที่คนติ๊ก Completed เองไม่แตะ', () => {
  const pending = new Map([['DL-1', { approvedCount: 1, pendingCount: 1 }]]);
  const [update] = exciseBillingTaskUpdates([task({ status: 'Completed', systemCompletedBy: EXCISE_BILLING_TASK_SOURCE })], { dealStates: pending, now: 'N' });
  assert.deepEqual(update.patch, {
    status: 'Pending', actualStartDate: null, actualFinishDate: null, systemCompletedAt: null, systemCompletedBy: null, updatedAt: 'N',
  });
  assert.deepEqual(exciseBillingTaskUpdates([task({ status: 'Completed' })], { dealStates: pending }), [], 'คนติ๊กเอง = ของคน');
  const cancelled = new Map([['DL-1', { approvedCount: 0, pendingCount: 0 }]]);
  assert.equal(exciseBillingTaskUpdates([task({ status: 'Completed', systemCompletedBy: EXCISE_BILLING_TASK_SOURCE })], { dealStates: cancelled })[0].patch.status, 'Pending', 'SO ถูกยกเลิกหมด');
});

test('ป้ายบนงาน: รอออกใบ n ใบ → หน้า SO ใบแรกของคิว · ระบบติ๊กครบ · งานอื่น/คนติ๊กเองไม่มีป้าย', () => {
  const awaiting = [
    { id: 'SO-A', orderNumber: 'SO-26100001-0', dealId: 'DL-1' },
    { id: 'SO-B', orderNumber: 'SO-26100002-0', dealId: 'DL-1' },
    { id: 'SO-X', orderNumber: 'SO-26100009-0', dealId: 'DL-2' },
  ];
  assert.deepEqual(exciseBillingStepBadge(task(), awaiting), {
    tone: 'warning', label: 'รอออกใบค่าสรรพสามิต 2 ใบ',
    title: 'ใบสั่งขายที่ยังไม่ออกใบค่าสรรพสามิต: SO-26100001-0, SO-26100002-0',
    href: '/sales-planning/sales-orders/SO-A',
  });
  assert.equal(exciseBillingStepBadge(task({ status: 'Completed', systemCompletedBy: EXCISE_BILLING_TASK_SOURCE }), []).label, 'ออกใบค่าสรรพสามิตครบ');
  assert.equal(exciseBillingStepBadge(task({ status: 'Completed' }), []), null);
  assert.equal(exciseBillingStepBadge(task({ workflowTemplateStepKey: 'npd-44', name: 'วางบิลสินค้าก่อนส่ง (ไม่มีสรรพสามิต)' }), awaiting), null);
});

test('ตัวซิงก์: อ่านงาน+SO+คิว แล้วเขียน CAS เฉพาะงานที่เปลี่ยน · เดินกราฟสถานะต่อ · ดีลไม่มีงานนี้จบที่คิวรีแรก', async () => {
  const db = fakeDb({
    project_tasks: [
      task(),
      task({ id: 'PT-2', dealId: 'DL-2', projectId: null, workflowTemplateStepKey: 'reorder-16' }),
      task({ id: 'PT-3', workflowTemplateStepKey: 'npd-44', name: 'วางบิลสินค้าก่อนส่ง (ไม่มีสรรพสามิต)' }),
    ],
    sales_orders: [
      { id: 'SO-1', dealId: 'DL-1', status: 'approved', supersededById: null, origin: 'pipeline' },
      { id: 'SO-2', dealId: 'DL-2', status: 'approved', supersededById: null, origin: 'pipeline' },
    ],
    projects: [{ id: 'PRJ-1', closeStatus: 'open' }],
  });
  const graphs = [];
  const result = await syncExciseBillingTasks(db, ['DL-1', 'DL-2'], {
    loadAwaiting: async (_supabase, dealIds) => {
      assert.deepEqual(dealIds.sort(), ['DL-1', 'DL-2']);
      return [{ id: 'SO-2', orderNumber: 'SO-2', dealId: 'DL-2' }];
    },
    propagate: async (_supabase, projectId, { dealId }) => graphs.push([projectId, dealId]),
    today: '2026-11-03', now: 'N',
  });
  assert.deepEqual(result, { updated: 1 });
  assert.equal(db.tables.project_tasks[0].status, 'Completed');
  assert.equal(db.tables.project_tasks[0].systemCompletedBy, EXCISE_BILLING_TASK_SOURCE);
  assert.equal(db.tables.project_tasks[1].status, 'Pending', 'ดีลที่ยังมีใบรอออก');
  assert.equal(db.tables.project_tasks[2].status, 'Pending', 'งานวางบิลแบบไม่มีสรรพสามิตไม่ใช่ของตัวนี้');
  assert.deepEqual(db.writes[0].filters, [['eq', 'id', 'PT-1'], ['eq', 'status', 'Pending']], 'CAS ด้วยสถานะเดิม');
  assert.deepEqual(graphs, [['PRJ-1', 'DL-1']]);

  const empty = fakeDb({ project_tasks: [] });
  let loaded = false;
  assert.deepEqual(await syncExciseBillingTasks(empty, ['DL-7'], { loadAwaiting: async () => { loaded = true; return []; } }), { updated: 0 });
  assert.equal(loaded, false, 'ดีลที่ไม่มีงานนี้ไม่โหลดคิว');
});

test('ตัวซิงก์: คนเปลี่ยนสถานะชนกันพอดี (CAS ไม่โดนแถว) = ข้าม ไม่นับ ไม่เดินกราฟ', async () => {
  const db = fakeDb({
    project_tasks: [task()],
    sales_orders: [{ id: 'SO-1', dealId: 'DL-1', status: 'approved', supersededById: null, origin: 'pipeline' }],
    projects: [{ id: 'PRJ-1', closeStatus: 'open' }],
  });
  const original = db.from;
  db.from = (table) => {
    const builder = original(table);
    const update = builder.update;
    builder.update = (patch) => { db.tables.project_tasks[0].status = 'In Progress'; return update(patch); };
    return builder;
  };
  const graphs = [];
  assert.deepEqual(await syncExciseBillingTasks(db, ['DL-1'], { loadAwaiting: async () => [], propagate: async (...args) => graphs.push(args) }), { updated: 0 });
  assert.equal(db.tables.project_tasks[0].status, 'In Progress');
  assert.deepEqual(graphs, []);
});

test('ดีลที่ได้รับผล: SO ลูกค้า = ดีลของใบ · SO/ใบค่าสรรพสามิต = ดีลของ SO ต้นทาง · ใบเสนอราคาลูกค้า = ไม่มี', async () => {
  const db = fakeDb({
    sales_orders: [
      { id: 'SO-C', dealId: 'DL-1', quotationId: 'QT-C' },
      { id: 'SO-E', dealId: null, quotationId: 'QT-E' },
    ],
    quotations: [
      { id: 'QT-C', sourceSalesOrderId: null },
      { id: 'QT-E', sourceSalesOrderId: 'SO-C' },
    ],
  });
  assert.deepEqual(await exciseBillingDealIdsFor(db, { salesOrderId: 'SO-C' }), ['DL-1']);
  assert.deepEqual(await exciseBillingDealIdsFor(db, { salesOrderId: 'SO-E' }), ['DL-1']);
  assert.deepEqual(await exciseBillingDealIdsFor(db, { quotationId: 'QT-E' }), ['DL-1']);
  assert.deepEqual(await exciseBillingDealIdsFor(db, { quotationId: 'QT-C' }), []);
  assert.deepEqual(await exciseBillingDealIdsFor(db, { salesOrderId: 'SO-404' }), []);
});

test('งานต่อท้าย route: ซิงก์เฉพาะคำตอบ 2xx · ซิงก์พลาดเขียน log ไม่ throw (action หลักบันทึกไปแล้ว)', async () => {
  const synced = [];
  const logs = [];
  const after = exciseBillingTaskAfter(async ({ ctx }) => ({ salesOrderId: (await ctx.params).id }), {
    resolveDeals: async (_supabase, key) => (key.salesOrderId === 'SO-BAD' ? Promise.reject(new Error('boom')) : ['DL-1']),
    sync: async (_supabase, dealIds) => synced.push(dealIds),
    log: (...args) => logs.push(args),
  });
  const ctx = (id) => ({ params: Promise.resolve({ id }) });
  await after({ supabase: {}, ctx: ctx('SO-1'), res: new Response('{}', { status: 409 }) });
  assert.deepEqual(synced, [], 'route ตอบไม่สำเร็จ = ไม่ซิงก์');
  await after({ supabase: {}, ctx: ctx('SO-1'), res: new Response('{}', { status: 200 }) });
  assert.deepEqual(synced, [['DL-1']]);
  await after({ supabase: {}, ctx: ctx('SO-BAD'), res: new Response('{}', { status: 200 }) });
  assert.equal(logs.length, 1);
});

test('withUser รับงานต่อท้าย (`after`) แล้วคืนคำตอบเดิม · ทุก route ที่เปลี่ยนสถานะค่าสรรพสามิตผูกตัวซิงก์', () => {
  const http = read('../http.js');
  assert.match(http, /export function withUser\(handler, \{ before = null, after = null \} = \{\}\)/);
  assert.match(http, /const prepared = before \? await before\(\{ user, supabase, req, ctx \}\) : undefined;/);
  assert.match(http, /if \(after\) await after\(\{ user, supabase, req, ctx, res, prepared \}\);\s*return res;/);
  const api = '../../app/api/sales-planning/';
  const wired = [
    ['quotations/[id]/route.js', 'PATCH', 'quotation'],
    ...['accept', 'approval', 'cancel', 'reject', 'revise', 'submit', 'unaccept', 'withdraw']
      .map((sub) => [`quotations/[id]/${sub}/route.js`, 'POST', 'quotation']),
    ['sales-orders/[id]/route.js', 'PATCH', 'salesOrder'],
    ['sales-orders/[id]/excise-quotation/route.js', 'POST', 'salesOrder'],
    ['sales-orders/route.js', 'POST', 'createdSalesOrder'],
    // ลบใบ: หาดีลก่อนลบ (ใบหายแล้วหาไม่ได้) — ช่องที่เคยรู้ของ 12.11
    ['quotations/[id]/route.js', 'DELETE', 'deletedQuotation'],
    ['sales-orders/[id]/route.js', 'DELETE', 'deletedSalesOrder'],
  ];
  for (const [path, method, preset] of wired) {
    const source = read(`${api}${path}`);
    const start = source.indexOf(`export const ${method} = withUser(`);
    assert.ok(start >= 0, `${path} ${method}`);
    const next = source.indexOf('\nexport const ', start + 1);
    const handler = source.slice(start, next === -1 ? undefined : next);
    assert.match(handler, new RegExp(`\\n\\}, EXCISE_TASK_SYNC\\.${preset}\\);`), `${path} ${method} ต้องต่อท้ายด้วย EXCISE_TASK_SYNC.${preset}`);
  }
});

test('คนเปลี่ยนสถานะเองล้างป้ายระบบ (route PATCH ของขั้นตอน) · คอลัมน์ตรงกับ mig 0421', () => {
  const route = read('../../app/api/pm/project-tasks/[id]/route.js');
  assert.match(route, /if \(body\.status !== undefined && body\.status !== task\.status\) \{[\s\S]*?if \(task\.systemCompletedBy\) \{\s*updates\.systemCompletedAt = null;\s*updates\.systemCompletedBy = null;/);
  const sql = read('../../../supabase/migrations/0421_project_task_system_completed.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "systemCompletedAt" timestamptz/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "systemCompletedBy" text/);
  assert.ok(EXCISE_BILLING_TASK_SOURCE.length <= 40, 'CHECK ของ 0421 รับไม่เกิน 40 ตัวอักษร');
});

test('ลบใบ: หาดีลไว้ก่อนลบ แล้วซิงก์ดีลชุดนั้นหลังลบสำเร็จ · ลบไม่สำเร็จ/หาดีลพลาด = ไม่ซิงก์ ไม่ throw', async () => {
  const synced = [];
  const logs = [];
  const around = exciseBillingTaskAround(async ({ ctx }) => ({ quotationId: (await ctx.params).id }), {
    resolveDeals: async (_supabase, key) => (key.quotationId === 'QT-BAD' ? Promise.reject(new Error('boom')) : ['DL-1']),
    sync: async (_supabase, dealIds) => synced.push(dealIds),
    log: (...args) => logs.push(args),
  });
  const ctx = (id) => ({ params: Promise.resolve({ id }) });
  const prepared = await around.before({ supabase: {}, ctx: ctx('QT-E') });
  assert.deepEqual(prepared, ['DL-1'], 'อ่านก่อน handler ลบ');
  await around.after({ supabase: {}, res: new Response('{}', { status: 409 }), prepared });
  assert.deepEqual(synced, [], 'ลบไม่สำเร็จ = ไม่ซิงก์');
  await around.after({ supabase: {}, res: new Response('{}', { status: 200 }), prepared });
  assert.deepEqual(synced, [['DL-1']]);
  assert.deepEqual(await around.before({ supabase: {}, ctx: ctx('QT-BAD') }), []);
  assert.equal(logs.length, 1);
});
