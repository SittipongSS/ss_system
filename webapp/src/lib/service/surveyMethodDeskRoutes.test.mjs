// ── ใบประเมินจากแบบทั้งใบ บนเส้นเขียนที่มีอยู่แล้ว (mig 0408 · แผน survey-desk-assessment §2 แถว 21 · 22 · 36) ──
//
// ⭐ ล็อกสี่เรื่อง:
//   ① `commit-due` ของใบงานโต๊ะ = หัวหน้ารับปาก "วันส่งผล" — สองวันเท่ากัน · ไม่มีเวลา · ผู้รับผิดชอบคือหัวหน้าที่กด
//      · ไม่ค้นทะเบียนช่าง · ไม่ถามหานัด · **ไม่มีคำสั่งใดแตะ `service_visits`**
//   ② `reschedule` ของใบงานโต๊ะ = สองวันขยับพร้อมกัน · เหตุผลบังคับ · ไม่สร้างนัดแม้ใบไม่มีนัดเปิดเลย
//      (ช่องโหว่เดิม: เลื่อนวันของใบที่ไม่มีนัดเปิด = สร้างนัดจริงให้ช่างที่ชื่ออยู่บนใบ)
//   ③ PATCH ของนัดบนใบงานโต๊ะ: เปิดนัดที่จบแล้วกลับ = 409 ไม่เขียนอะไร · ปิด "เข้าไม่ได้" ไม่ถอยขั้นใบ
//      · แก้วันของนัดที่กำลังทำ ไม่เขียนวันทับคำสัญญาบนใบ — **ศูนย์คำสั่งเขียนลง `dept_requests`**
//   ④ 🔴 ใบลงหน้างาน (แถวไม่มีคีย์ `method` · `method: 'onsite'` · สี่คอลัมน์ใหม่เป็น null) = คำสั่งเขียนเดิมทุกตัว
//
// ⚠️ เรียก handler **ตัวจริง** ผ่าน supabase ปลอมที่จำแถวได้ — ตัวอ่านผู้ใช้และ client จริงถูกถอดด้วย hook ของ
//    `crew/routeTestKit.mjs` (ลบ env ของ Supabase ทิ้งก่อน import ด้วย · dev DB = prod DB) ⇒ ไม่มีอะไรถึงฐานจริง
// ⚠️ นาฬิกาตรึงที่ 9 ต.ค. 2026 10:00 เวลาไทย (นาฬิกาปลอมของ node:test) ⇒ `nowIso` ของ route เทียบตรงตัวได้
// ⚠️ S1 ยังไม่มีเส้นไหนเขียน `method: 'drawing'` ได้ — แถวจากแบบในไฟล์นี้เป็น fixture ล้วน
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { callRoute } from './crew/routeTestKit.mjs';
import { businessDate } from '../businessDate.js';
import { askActionUpdate } from '../costingUpdates.js';
import { fmtDate } from '../format.js';
import { IN_PROGRESS_STAMP_ERROR } from './crew/jobStart.js';
import { surveyNeedsVisit } from './surveyMethod.js';
import { surveyStepBackBody, surveyStepBackPlan } from './surveyStepBack.js';
import {
  SURVEY_DESK_COMMIT_FORBIDDEN, SURVEY_DESK_RESCHEDULE_FORBIDDEN, SURVEY_DESK_RESCHEDULE_REASON_ERROR,
  SURVEY_DESK_REVIVE_ERROR, surveyDeskCommitPatch, surveyDeskReschedulePatch,
} from './surveyVisit.js';

mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-09T03:00:00Z') });
const NOW = '2026-10-09T03:00:00.000Z';
const TODAY = '2026-10-09';

const { PATCH: requestPatch } = await import('../../app/api/sa/requests/[id]/route.js');
const { PATCH: visitPatch } = await import('../../app/api/service/visits/[id]/route.js');

test('นาฬิกาของเทสต์: วันนี้ (เวลาไทย) = 9 ต.ค. 2026', () => {
  assert.equal(businessDate(), TODAY);
  assert.equal(new Date().toISOString(), NOW);
});

const WEBAPP = process.cwd();
/* ตัดคอมเมนต์ก่อนตรวจซอร์ส — คอมเมนต์ในไฟล์เอ่ยชื่อของที่ยามนี้มองหา */
const code = (p) => fs.readFileSync(path.join(WEBAPP, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const REQUEST_ROUTE = 'src/app/api/sa/requests/[id]/route.js';
const VISIT_ROUTE = 'src/app/api/service/visits/[id]/route.js';

/* เงียบ console.error ระหว่างเคสที่ตั้งใจให้อ่านพลาด — คืนข้อความที่ถูกเขียนไว้ให้ตรวจ */
async function quiet(run) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => { lines.push(args.map(String).join(' ')); };
  try {
    return { result: await run(), lines };
  } finally {
    console.error = original;
  }
}

/* ── ฐานข้อมูลปลอม ───────────────────────────────────────────────────────────────────────────────
   กรองจริงตาม eq / neq / in / is / not-is · เรียงตาม order · ตัดตาม limit / range · single / maybeSingle
   ตัวกรองอื่น (or · gte · ilike …) ผ่านทุกแถว — ใช้กับตัวโหลดประกอบของสองเส้นซึ่งเทสต์นี้ไม่ได้ตัดสิน
   `hook(q, api)` ถูกเรียกก่อนทุกคำสั่ง — คืน `{ data, error }` เพื่อแทนคำตอบ · คืน undefined = ปกติ
   ⭐ ตัวออกรหัส (`create_entity_rows_with_code`) เขียนแถวลงตารางตาม scope ⇒ จดเป็นคำสั่ง insert ของตารางนั้น
      — "ไม่มีการสร้างนัด" จึงตรวจได้จากที่เดียว ไม่ว่าแถวจะเกิดทาง insert ตรงหรือทาง RPC */
const WRITES = ['insert', 'update', 'upsert', 'delete'];
const RPC_TABLE = { SV: 'service_visits' };
function fakeDb(seed = {}, { hook = null, users = [] } = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([t, rows]) => [t, rows.map((r) => structuredClone(r))]));
  const calls = [];
  const rowsOf = (t) => (tables[t] ||= []);
  const same = (a, b) => String(a ?? '') === String(b ?? '');
  const pass = (row) => ([op, col, val]) => {
    if (op === 'eq') return same(row[col], val);
    if (op === 'neq') return !same(row[col], val);
    if (op === 'in') return (val || []).some((v) => same(row[col], v));
    if (op === 'is') return (row[col] ?? null) === val;
    if (op === 'not-is') return (row[col] ?? null) !== val;
    return true;
  };
  const exec = (q) => {
    const list = rowsOf(q.table);
    const hit = () => list.filter((row) => q.filters.every(pass(row)));
    let out;
    if (q.write === 'insert') {
      out = [].concat(q.payload).map((r) => structuredClone(r));
      list.push(...out);
    } else if (q.write === 'upsert') {
      const keys = String(q.options?.onConflict || 'id').split(',');
      out = [].concat(q.payload).map((r) => {
        const found = list.find((row) => keys.every((k) => same(row[k], r[k])));
        if (found) return Object.assign(found, structuredClone(r));
        list.push(structuredClone(r));
        return list[list.length - 1];
      });
    } else if (q.write === 'update') {
      out = hit();
      for (const row of out) Object.assign(row, structuredClone(q.payload));
    } else if (q.write === 'delete') {
      out = hit();
      tables[q.table] = list.filter((row) => !out.includes(row));
    } else {
      out = hit();
    }
    for (const [col, asc] of [...q.orders].reverse()) {
      out = [...out].sort((a, b) => {
        if (a[col] === b[col]) return 0;
        if (a[col] == null) return 1;
        if (b[col] == null) return -1;
        return (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1);
      });
    }
    if (q.limit != null) out = out.slice(0, q.limit);
    if (q.range) out = out.slice(q.range[0], q.range[1] + 1);
    const copy = out.map((r) => structuredClone(r));
    if (q.head) return { data: null, count: copy.length, error: null };
    if (q.single === 'maybe') return { data: copy[0] ?? null, error: null };
    if (q.single === 'one') {
      return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } };
    }
    return { data: copy, error: null };
  };
  const api = { tables, calls, listUsers: 0 };
  const run = (q) => hook?.(q, api) ?? exec(q);
  const blank = (table) => ({
    table, filters: [], orders: [], write: null, payload: null, options: null,
    select: undefined, limit: null, range: null, single: null, head: false,
  });

  const from = (table) => {
    const q = blank(table);
    calls.push(q);
    const builder = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return (resolve, reject) => Promise.resolve().then(() => run(q)).then(resolve, reject);
        return (...args) => {
          if (['eq', 'neq', 'in', 'is'].includes(prop)) q.filters.push([prop, args[0], args[1]]);
          else if (prop === 'not') q.filters.push([`not-${args[1]}`, args[0], args[2]]);
          else if (WRITES.includes(prop)) { q.write = prop; q.payload = args[0]; q.options = args[1] || null; }
          else if (prop === 'select') { q.select = args[0] ?? null; if (args[1]?.head) q.head = true; }
          else if (prop === 'order') q.orders.push([args[0], args[1]?.ascending !== false]);
          else if (prop === 'limit') q.limit = args[0];
          else if (prop === 'range') q.range = [args[0], args[1]];
          else if (prop === 'maybeSingle') q.single = 'maybe';
          else if (prop === 'single') q.single = 'one';
          return builder;
        };
      },
    });
    return builder;
  };

  return Object.assign(api, {
    from,
    rpc: async (name, args) => {
      const table = name === 'create_entity_rows_with_code' ? RPC_TABLE[args?.p_scope] : null;
      if (!table) return { data: null, error: null };
      const q = blank(table);
      q.write = 'insert';
      q.rpc = name;
      q.payload = (args.p_rows || []).map((row, i) => ({
        ...row, code: `${args.p_prefix}${String(rowsOf(table).length + i + 1).padStart(args.p_width, '0')}`,
      }));
      calls.push(q);
      return run(q);
    },
    auth: {
      admin: {
        /* ทะเบียนบัญชี — เส้นลงคิวลงหน้างานค้นช่างจากที่นี่ (`loadUserDirectory`) · เส้นงานโต๊ะต้องไม่เรียกเลย */
        listUsers: async ({ page = 1 } = {}) => {
          api.listUsers += 1;
          return { data: { users: page === 1 ? users : [] }, error: null };
        },
        getUserById: async () => ({ data: { user: null }, error: { status: 404, message: 'User not found' } }),
      },
    },
    reads: (table) => calls.filter((c) => c.table === table && !c.write),
    writes: (table) => calls.filter((c) => c.write && (!table || c.table === table)),
    rows: (table) => rowsOf(table),
  });
}

/* ── คน ───────────────────────────────────────────────────────────────────────────────────── */
const HEAD = { id: 'u-head', name: 'อานนท์', role: 'ts_manager', department: 'TS' };
const SENIOR = { id: 'u-senior', name: 'หัวหน้าช่าง', role: 'ts_senior', department: 'TS' };
const ADMIN = { id: 'u-admin', name: 'แอดมิน', role: 'admin' };
const PLANNER = { id: 'u-plan', name: 'ผู้จัดคิว', role: 'ts_planner', department: 'TS' };
const CREW = { id: 'u-tech', name: 'ช่างเอ', role: 'ts', department: 'TS' };
const SALES = { id: 'sa-1', name: 'เซลเอ', role: 'ae', team: 'KA' };
const DIRECTORY = [
  { id: 'u-tech', email: 'tech@example.test', user_metadata: { name: 'ช่างเอ' }, app_metadata: { role: 'ts', department: 'TS' } },
  { id: 'u-head', email: 'head@example.test', user_metadata: { name: 'อานนท์' }, app_metadata: { role: 'ts_manager', department: 'TS' } },
];

/* ── ของตั้งต้น ─────────────────────────────────────────────────────────────────────────────── */
const D1 = '2026-10-15'; // วันส่งผลที่รับปาก
const D2 = '2026-10-20'; // วันส่งผลหลังเลื่อน
const SITE = { id: 'SITE-1', code: 'SS-0001', name: 'โรงแรมทดสอบ', customerId: null, accessDays: [], accessFrom: null, accessTo: null };
const request = (over = {}) => ({
  id: 'REQ-1', docNo: 'RQ-AS-26100001', kind: 'site_survey', dept: 'TS', status: 'acknowledged',
  title: 'ประเมินพื้นที่ โรงแรมทดสอบ', requestedById: 'sa-1', requestedByName: 'เซลเอ', team: 'KA',
  customerId: null, customerName: 'บริษัท ทดสอบ จำกัด', dealId: null, siteId: 'SITE-1',
  submittedAt: '2026-10-01T02:00:00+00:00', acknowledgedAt: '2026-10-02T02:00:00+00:00',
  committedDueDate: null, committedDueTime: null, committedResultDate: null, dueCommittedAt: null,
  assigneeId: null, assigneeName: null, assignedAt: null,
  answeredAt: null, closedAt: null, cancelledAt: null, reopenedAt: null, reopenWaitSide: null,
  createdAt: '2026-09-28T02:00:00+00:00', updatedAt: '2026-10-02T02:00:00+00:00',
  ...over,
});
/* ใบงานโต๊ะที่หัวหน้ารับปากวันส่งผลไปแล้ว */
const promised = (over = {}) => request({
  committedDueDate: D1, committedResultDate: D1, dueCommittedAt: '2026-10-05T02:00:00+00:00',
  assigneeId: 'u-head', assigneeName: 'อานนท์', assignedAt: '2026-10-05T02:00:00+00:00', ...over,
});
/* ใบลงหน้างานที่ลงคิวไปแล้ว — วันบนใบ = วันบนนัด */
const queued = (over = {}) => request({
  committedDueDate: TODAY, committedDueTime: '09:00', committedResultDate: '2026-10-14',
  dueCommittedAt: '2026-10-05T02:00:00+00:00',
  assigneeId: 'u-tech', assigneeName: 'ช่างเอ', assignedAt: '2026-10-05T02:00:00+00:00', ...over,
});

const zone = (n, over = {}) => ({
  id: `SZ-${n}`, requestId: 'REQ-1', zoneId: `ZN-${n}`, zoneName: `พื้นที่ ${n}`, status: 'ok', sortOrder: n, ...over,
});
const NEW_COLUMNS_NULL = { method: null, methodReason: null, methodChangedAt: null, methodChangedByName: null };
/* 🔴 สามรูปของแถวลงหน้างานที่ต้องเดินเหมือนกันทุกตัวอักษร: แถวเก่า/fixture เก่า (ไม่มีคีย์) · ค่าตั้งต้นของคอลัมน์ ·
   ฐานที่รัน 0408 แล้วแต่ select ได้ null */
const ONSITE_SHAPES = {
  'ไม่มีคีย์ method': () => [zone(1), zone(2)],
  "method: 'onsite'": () => [zone(1, { method: 'onsite' }), zone(2, { method: 'onsite' })],
  'สี่คอลัมน์ใหม่เป็น null': () => [zone(1, NEW_COLUMNS_NULL), zone(2, NEW_COLUMNS_NULL)],
};
/* รูปที่เป็นงานโต๊ะ — ทุกพื้นที่ที่ยังใช้อยู่เป็นจากแบบ */
const DESK_SHAPES = {
  'จากแบบทั้งใบ': () => [zone(1, { method: 'drawing' }), zone(2, { method: 'drawing' })],
  'พื้นที่ลงหน้างานถูกตัด เหลือแต่จากแบบ': () => [zone(1, { status: 'cut' }), zone(2, { method: 'drawing' })],
  'ตัดหมดทั้งใบ ทุกแถวจากแบบ': () => [zone(1, { status: 'cut', method: 'drawing' })],
};
const drawingRows = DESK_SHAPES['จากแบบทั้งใบ'];
const onsiteRows = ONSITE_SHAPES['ไม่มีคีย์ method'];
/* รูปที่ **ไม่ใช่** งานโต๊ะ ทั้งที่มีแถวจากแบบหรือไม่เหลือพื้นที่ — ต้องเดินเส้นลงคิวเดิม */
const NOT_DESK_SHAPES = {
  'ผสม: ลงหน้างาน 1 จากแบบ 1': () => [zone(1), zone(2, { method: 'drawing' })],
  'ตัดหมดทั้งใบ แถวเดียวลงหน้างาน (รูป RQ-AS-26090233)': () => [zone(1, { status: 'cut' })],
  'ไม่มีแถวพื้นที่เลย': () => [],
};

test('fixture: รูปของแถวตรงกับที่ตัวตัดสินกลางอ่าน', () => {
  for (const [name, rows] of Object.entries(ONSITE_SHAPES)) assert.equal(surveyNeedsVisit(rows()), true, name);
  for (const [name, rows] of Object.entries(NOT_DESK_SHAPES)) assert.equal(surveyNeedsVisit(rows()), true, name);
  for (const [name, rows] of Object.entries(DESK_SHAPES)) assert.equal(surveyNeedsVisit(rows()), false, name);
});

const visit = (over = {}) => ({
  id: 'SVV-1', code: 'SV-26100001', siteId: 'SITE-1', planId: null, requestId: 'REQ-1', kind: 'survey',
  scheduledDate: TODAY, startTime: '09:00', endTime: null,
  assigneeId: 'u-tech', assigneeName: 'ช่างเอ', assistantIds: [],
  status: 'scheduled', actualDate: null, actualStartTime: null, actualEndTime: null, actualEndDate: null,
  actualTimeEdited: false, unableReason: null, summary: null, note: 'ประเมินพื้นที่ตามคำร้อง RQ-AS-26100001',
  attachments: [], customerSignatureUrl: null,
  createdAt: '2026-10-05T02:00:00.000Z', updatedAt: '2026-10-05T02:00:00.000Z',
  ...over,
});
const running = (over = {}) => visit({ status: 'in_progress', actualDate: TODAY, actualStartTime: '09:05', ...over });
const UNABLE_REASON = 'อาคารปิดปรับปรุงทั้งสัปดาห์';
const CLOSED = {
  cancelled: () => visit({ status: 'cancelled' }),
  rescheduled: () => visit({ status: 'rescheduled' }),
  unable: () => visit({ status: 'unable', actualDate: TODAY, actualStartTime: '09:05', actualEndTime: '09:20', unableReason: UNABLE_REASON }),
  done: () => visit({ status: 'done', actualDate: TODAY, actualStartTime: '09:05', actualEndTime: '10:00' }),
  partial: () => visit({ status: 'partial', actualDate: TODAY, actualStartTime: '09:05', actualEndTime: '10:00' }),
};

const world = ({ rows = onsiteRows(), req = request(), visits = [], hook = null } = {}) => fakeDb({
  dept_requests: [req],
  service_survey_zones: rows,
  service_sites: [SITE],
  service_visits: visits,
}, { hook, users: DIRECTORY });

const patchRequest = (db, user, body) => callRoute(requestPatch, {
  user, db, method: 'PATCH', path: '/api/sa/requests/REQ-1', params: { id: 'REQ-1' }, body,
});
const patchVisit = (db, user, body, id = 'SVV-1') => callRoute(visitPatch, {
  user, db, method: 'PATCH', path: `/api/service/visits/${id}`, params: { id }, body,
});

const requestWrites = (db) => db.writes('dept_requests').map((c) => ({ write: c.write, filters: c.filters, payload: c.payload }));
const auditSummaries = (db) => db.rows('audit_logs').map((row) => row.summary);
const threadRows = (db, entityType, kind) => db.rows('entity_updates')
  .filter((row) => row.entityType === entityType && (!kind || row.kind === kind));
/* ตัวถามหานัดที่ยังเปิด (`findSurveyVisit` แบบ openOnly) — ตัวเดียวที่กรอง `status` ด้วย `.in()` */
const openVisitProbes = (db) => db.reads('service_visits')
  .filter((q) => q.filters.some(([op, col]) => op === 'in' && col === 'status'));
/* คำสั่งเขียนทั้งหมดตามลำดับ — ตัด id ที่สุ่มต่อครั้ง (แถวนัดใหม่ · แถวเธรด · กระดิ่ง) และภาพก่อน/หลังของ audit
   (พกแถวพื้นที่ทั้งชุด ซึ่งต่างกันที่คีย์ `method` โดยตั้งใจ) ⇒ โลกที่ต่างกันแค่รูปของแถวพื้นที่ต้องได้ลิสต์เท่ากันเป๊ะ */
const VOLATILE = new Set(['id', 'updateId', 'before', 'after']);
const scrub = (v) => {
  if (Array.isArray(v)) return v.map(scrub);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v).filter(([k]) => !VOLATILE.has(k)).map(([k, x]) => [k, scrub(x)]));
};
const writeLog = (db) => db.writes().map((c) => ({
  table: c.table, write: c.write, rpc: c.rpc || null, filters: c.filters, payload: scrub(c.payload),
}));
const sameAcrossShapes = (logs) => {
  const [[firstName, first], ...rest] = Object.entries(logs);
  assert.ok(first.length > 0, 'ต้องมีคำสั่งเขียนให้เทียบ');
  for (const [name, log] of rest) assert.deepEqual(log, first, `${name} ≠ ${firstName}`);
};

/* ═══ ① commit-due ของใบงานโต๊ะ ═══════════════════════════════════════════════════════════════ */

test('🔑 รับปากวันส่งผล: สองวันเท่ากัน · ไม่มีเวลา · ผู้รับผิดชอบ = หัวหน้าที่กด · ไม่มีคำสั่งใดแตะ service_visits', async () => {
  for (const [shape, rows] of Object.entries(DESK_SHAPES)) {
    for (const user of [HEAD, SENIOR, ADMIN]) {
      const db = world({ rows: rows() });
      const { status, json } = await patchRequest(db, user, { action: 'commit-due', committedResultDate: D1 });
      const at = `${shape} · ${user.role}`;
      assert.equal(status, 200, `${at}: ${json.error}`);
      assert.deepEqual(requestWrites(db), [{
        write: 'update',
        filters: [['eq', 'id', 'REQ-1']],
        payload: {
          updatedAt: NOW,
          committedDueDate: D1,
          committedResultDate: D1,
          committedDueTime: null,
          dueCommittedAt: NOW,
          assigneeId: user.id,
          assigneeName: user.name,
          assignedAt: NOW,
        },
      }], at);
      assert.deepEqual(requestWrites(db)[0].payload, { updatedAt: NOW, ...surveyDeskCommitPatch({ date: D1, user, nowIso: NOW }) });
      assert.deepEqual(db.writes('service_visits'), [], `${at}: ต้องไม่สร้างและไม่แก้นัด`);
      assert.deepEqual(openVisitProbes(db), [], `${at}: ต้องไม่ถามหานัด (requeue เป็น false เสมอ)`);
      assert.equal(db.listUsers, 0, `${at}: ต้องไม่ค้นทะเบียนช่าง`);
      assert.deepEqual(auditSummaries(db), [`รับปากส่งผลประเมินจากแบบ ${D1} · ${user.name}`], at);
      // เธรดของใบได้บรรทัดแจ้งวันหนึ่งบรรทัด และไม่ใช่บรรทัด "ลงคิวใหม่" ของเส้นกู้นัด
      const lines = threadRows(db, 'dept_request');
      assert.deepEqual(lines.map((row) => row.kind), ['commitDue'], at);
      assert.notEqual(lines[0].meta?.requeue, true, at);
      // 🔑 บรรทัดเธรดเล่าเป็น "วันส่งผล" ที่หัวหน้ารับปาก (แผน §3.2 ข้อ 2) — ไม่ใช่ "TS แจ้งกำหนดส่ง" ของใบลงคิว
      assert.equal(lines[0].body, `รับปากส่งผลประเมินจากแบบ ${fmtDate(D1)} · ${user.name}`, at);
      assert.equal(lines[0].meta?.desk, true, at);
      assert.equal(json.committedDueDate, D1);
      assert.equal(json.committedResultDate, D1);
      assert.equal(json.assigneeId, user.id);
      assert.equal('_warning' in json, false, `${at}: ไม่มีครึ่งหลังให้ล้ม`);
    }
  }
});

test('รับปากวันส่งผล: หมายเหตุต่อท้ายสรุป · เกิน 500 ตัว = 400 เหมือนเส้นเดิม', async () => {
  const db = world({ rows: drawingRows() });
  const ok = await patchRequest(db, HEAD, { action: 'commit-due', committedResultDate: D1, reason: '  รอแบบชั้นสองจากลูกค้า  ' });
  assert.equal(ok.status, 200, ok.json.error);
  assert.deepEqual(auditSummaries(db), [`รับปากส่งผลประเมินจากแบบ ${D1} · อานนท์ — รอแบบชั้นสองจากลูกค้า`]);

  const tooLong = world({ rows: drawingRows() });
  const bad = await patchRequest(tooLong, HEAD, { action: 'commit-due', committedResultDate: D1, reason: 'ก'.repeat(501) });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'เหตุผลยาวเกิน 500 ตัวอักษร');
  assert.deepEqual(tooLong.writes(), []);
});

test('🔴 การ์ดลงคิวเก่า (วันนัด + เวลา + ช่าง) ที่ยิงใส่ใบงานโต๊ะ = เส้นงานโต๊ะอยู่ดี — ไม่มีนัด ไม่มีช่าง', async () => {
  const db = world({ rows: drawingRows() });
  const { status, json } = await patchRequest(db, HEAD, {
    action: 'commit-due', committedDueDate: '2026-10-12', committedDueTime: '09:30', assigneeId: 'u-tech',
    assigneeName: 'ช่างเอ', committedResultDate: D1,
  });
  assert.equal(status, 200, json.error);
  assert.deepEqual(requestWrites(db)[0].payload, { updatedAt: NOW, ...surveyDeskCommitPatch({ date: D1, user: HEAD, nowIso: NOW }) });
  assert.deepEqual(db.writes('service_visits'), []);
  assert.equal(db.listUsers, 0);
});

test('🔴 รับปากวันส่งผลได้เฉพาะหัวหน้าฝ่ายบริการ — ผู้จัดคิว 403 ข้อความตรงตัว · ช่าง 403 · ไม่เขียนอะไร', async () => {
  for (const [shape, rows] of Object.entries(DESK_SHAPES)) {
    const db = world({ rows: rows() });
    const { status, json } = await patchRequest(db, PLANNER, { action: 'commit-due', committedResultDate: D1 });
    assert.equal(status, 403, shape);
    assert.equal(json.error, SURVEY_DESK_COMMIT_FORBIDDEN, shape);
    assert.deepEqual(db.writes(), [], shape);
  }
  /* ช่าง (`ts`) ไม่ถือ `requests:answer` ⇒ ตกด่านชั้นนอกของ route ตั้งแต่ก่อนถึงก้าวนี้ (ข้อความเดิมของด่านนั้น)
     ฝ่ายขายตกด่านฝ่ายของก้าวนี้ด้วยข้อความเดิม — ด่านงานโต๊ะมา **หลัง** ด่านเดิม ไม่ได้มาแทน */
  const crewDb = world({ rows: drawingRows() });
  const crew = await patchRequest(crewDb, CREW, { action: 'commit-due', committedResultDate: D1 });
  assert.equal(crew.status, 403);
  assert.equal(crew.json.error, 'forbidden');
  assert.deepEqual(crewDb.writes(), []);

  const salesDb = world({ rows: drawingRows() });
  const sales = await patchRequest(salesDb, SALES, { action: 'commit-due', committedResultDate: D1 });
  assert.equal(sales.status, 403);
  assert.equal(sales.json.error, 'แจ้งกำหนดส่งได้เฉพาะฝ่าย TS');
  assert.deepEqual(salesDb.writes(), []);
});

test('รับปากวันส่งผล: ไม่ระบุวัน / วันผิดรูป = 400 ข้อความตรงตัว · ไม่เขียนอะไร', async () => {
  const cases = [
    [{}, 'ต้องระบุวันที่จะส่งผลประเมิน'],
    [{ committedResultDate: '' }, 'ต้องระบุวันที่จะส่งผลประเมิน'],
    // วันนัดที่การ์ดเก่าพกมาไม่ถูกนับเป็นวันส่งผล
    [{ committedDueDate: D1 }, 'ต้องระบุวันที่จะส่งผลประเมิน'],
    [{ committedResultDate: '15/10/2026' }, 'วันที่จะส่งผลประเมินไม่ถูกต้อง'],
    [{ committedResultDate: '2026-10-5' }, 'วันที่จะส่งผลประเมินไม่ถูกต้อง'],
  ];
  for (const [body, error] of cases) {
    const db = world({ rows: drawingRows() });
    const { status, json } = await patchRequest(db, HEAD, { action: 'commit-due', ...body });
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(json.error, error, JSON.stringify(body));
    assert.deepEqual(db.writes(), [], JSON.stringify(body));
  }
});

test('🔴 ใบงานโต๊ะที่ถือวันอยู่แล้ว: รับปากซ้ำ = 409 "ใช้ปุ่มเลื่อน…" แม้ไม่มีนัดเปิด (ใบลงหน้างานรูปเดียวกัน = ลงคิวซ้ำได้)', async () => {
  const desk = world({ rows: drawingRows(), req: promised() });
  const refused = await patchRequest(desk, HEAD, { action: 'commit-due', committedResultDate: D2 });
  assert.equal(refused.status, 409);
  assert.equal(refused.json.error, 'ใบนี้แจ้งกำหนดส่งไปแล้ว — ใช้ปุ่มเลื่อนวันกำหนดส่งแทน');
  assert.deepEqual(desk.writes(), []);
  assert.deepEqual(openVisitProbes(desk), [], 'ไม่ถามหานัดเพื่อพิสูจน์ "ลงคิวซ้ำ"');

  /* เทียบ: ใบลงหน้างานที่ถือวันแต่ไม่มีนัดเปิด = เส้นกู้เดิม (requeue) ยังเดินได้ และสร้างนัดจริง */
  const onsite = world({ rows: onsiteRows(), req: queued() });
  const requeue = await patchRequest(onsite, PLANNER, {
    action: 'commit-due', committedDueDate: TODAY, assigneeId: 'u-tech', committedResultDate: '2026-10-14',
  });
  assert.equal(requeue.status, 200, requeue.json.error);
  assert.equal(onsite.writes('service_visits').filter((c) => c.write === 'insert').length, 1);
  assert.equal(threadRows(onsite, 'dept_request', 'commitDue')[0].meta.requeue, true);
});

test('ด่านของก้าวเดิมยังอยู่ครบบนใบงานโต๊ะ — ยังไม่รับเรื่อง = 409 ข้อความเดิม', async () => {
  const db = world({ rows: drawingRows(), req: request({ status: 'pending', acknowledgedAt: null }) });
  const { status, json } = await patchRequest(db, HEAD, { action: 'commit-due', committedResultDate: D1 });
  assert.equal(status, 409);
  assert.equal(json.error, 'ยังไม่ได้รับเรื่อง — รับเรื่องก่อนแจ้งกำหนดส่ง');
  assert.deepEqual(db.writes(), []);
});

test('🔴 ใบที่ยังต้องมีนัด (ผสม · ตัดหมดแต่เป็นแถวลงหน้างาน · ไม่มีแถว) ไม่เข้าเส้นงานโต๊ะ — ลงคิวแบบเดิม', async () => {
  for (const [shape, rows] of Object.entries(NOT_DESK_SHAPES)) {
    /* ส่งแค่วันส่งผล (รูปของเส้นงานโต๊ะ) ⇒ เส้นเดิมตีกลับด้วยข้อความของมันเอง ทั้งหัวหน้าและผู้จัดคิว */
    for (const user of [HEAD, PLANNER]) {
      const db = world({ rows: rows() });
      const { status, json } = await patchRequest(db, user, { action: 'commit-due', committedResultDate: D1 });
      assert.equal(status, 400, `${shape} · ${user.role}`);
      assert.equal(json.error, 'ต้องระบุวันกำหนดส่ง', `${shape} · ${user.role}`);
      assert.deepEqual(db.writes(), []);
    }
    /* ผู้จัดคิวลงคิวได้ตามเดิม และได้นัดจริง */
    const db = world({ rows: rows() });
    const { status, json } = await patchRequest(db, PLANNER, {
      action: 'commit-due', committedDueDate: '2026-10-12', assigneeId: 'u-tech', committedResultDate: '2026-10-14',
    });
    assert.equal(status, 200, `${shape}: ${json.error}`);
    assert.equal(db.writes('service_visits').length, 1, shape);
    assert.equal(db.rows('service_visits')[0].kind, 'survey', shape);
  }
});

/* ═══ ② reschedule ของใบงานโต๊ะ ═══════════════════════════════════════════════════════════════ */

test('🔑 เลื่อนวันส่งผล: สองวันขยับพร้อมกัน · ไม่แตะผู้รับผิดชอบ · ไม่มีคำสั่งใดแตะ service_visits แม้ใบไม่มีนัดเปิดเลย', async () => {
  const VISITS = {
    'ไม่เคยมีนัด': () => [],
    'มีแต่นัดที่ยกเลิกไปแล้ว': () => [CLOSED.cancelled()],
    'มีแต่นัดที่เข้าไม่ได้': () => [CLOSED.unable()],
    /* นัดที่ค้าง "กำลังทำ" ตอนใบพลิกเป็นงานโต๊ะ — วันของนัดนั้นไม่ใช่เรื่องของวันส่งผล ห้ามขยับตาม */
    'ยังมีนัดที่กำลังทำค้างอยู่': () => [running()],
  };
  for (const [shape, rows] of Object.entries(DESK_SHAPES)) {
    for (const [visitShape, visits] of Object.entries(VISITS)) {
      const db = world({ rows: rows(), req: promised(), visits: visits() });
      const { status, json } = await patchRequest(db, HEAD, {
        action: 'reschedule', committedResultDate: D2, reason: 'ลูกค้าส่งแบบแปลนช้า',
      });
      const at = `${shape} · ${visitShape}`;
      assert.equal(status, 200, `${at}: ${json.error}`);
      assert.deepEqual(requestWrites(db), [{
        write: 'update',
        filters: [['eq', 'id', 'REQ-1']],
        payload: { updatedAt: NOW, committedDueDate: D2, committedResultDate: D2, committedDueTime: null, dueCommittedAt: NOW },
      }], at);
      assert.deepEqual(requestWrites(db)[0].payload, { updatedAt: NOW, ...surveyDeskReschedulePatch({ date: D2, nowIso: NOW }) });
      assert.deepEqual(db.writes('service_visits'), [], `${at}: ต้องไม่สร้างและไม่ขยับนัด`);
      assert.deepEqual(openVisitProbes(db), [], `${at}: ต้องไม่ถามหานัด`);
      assert.deepEqual(auditSummaries(db), [`เลื่อนวันส่งผลประเมิน ${D1} → ${D2} — ลูกค้าส่งแบบแปลนช้า`], at);
      assert.deepEqual(threadRows(db, 'dept_request').map((row) => row.kind), ['reschedule'], at);
      // 🔑 บรรทัดเธรดของการเลื่อน (แผน §2 แถว 22) — เหตุผลอยู่บนบรรทัดเสมอ เพราะใบนี้ไม่มีเธรดของนัดให้เล่าแทน
      assert.equal(
        threadRows(db, 'dept_request')[0].body,
        `เลื่อนวันส่งผลประเมิน ${fmtDate(D1)} → ${fmtDate(D2)} — ลูกค้าส่งแบบแปลนช้า`, at,
      );
      assert.equal(json.committedDueDate, D2);
      assert.equal(json.committedResultDate, D2);
      assert.equal(json.assigneeId, 'u-head', 'ผู้รับผิดชอบคนเดิม');
      assert.equal('_warning' in json, false, at);
    }
  }
});

test('🔴 การ์ดเลื่อนวันนัดเก่า (วันนัด + เวลา) ที่ยิงใส่ใบงานโต๊ะ: อ่านเฉพาะวันส่งผล · ไม่มีนัดเกิด', async () => {
  const db = world({ rows: drawingRows(), req: promised() });
  const { status, json } = await patchRequest(db, HEAD, {
    action: 'reschedule', committedDueDate: '2026-10-12', committedDueTime: '09:30', committedResultDate: D2,
    reason: 'ลูกค้าส่งแบบแปลนช้า',
  });
  assert.equal(status, 200, json.error);
  assert.deepEqual(requestWrites(db)[0].payload, { updatedAt: NOW, ...surveyDeskReschedulePatch({ date: D2, nowIso: NOW }) });
  assert.deepEqual(db.writes('service_visits'), []);
});

test('เลื่อนวันส่งผล: เหตุผลบังคับ · วันบังคับ · ด่านเดิมของการเลื่อนยังอยู่ — ทุกเคสไม่เขียนอะไร', async () => {
  const reason = 'ลูกค้าส่งแบบแปลนช้า';
  const cases = [
    ['ไม่มีเหตุผล', promised(), { committedResultDate: D2 }, 400, SURVEY_DESK_RESCHEDULE_REASON_ERROR],
    ['เหตุผลมีแต่ช่องว่าง', promised(), { committedResultDate: D2, reason: '   ' }, 400, 'ต้องบอกเหตุผลที่เลื่อนวันส่งผล'],
    ['เหตุผลยาวเกิน', promised(), { committedResultDate: D2, reason: 'ก'.repeat(501) }, 400, 'เหตุผลยาวเกิน 500 ตัวอักษร'],
    ['ไม่ระบุวัน', promised(), { reason }, 400, 'ต้องระบุวันที่จะส่งผลประเมิน'],
    ['ส่งมาแต่วันนัด', promised(), { committedDueDate: D2, reason }, 400, 'ต้องระบุวันที่จะส่งผลประเมิน'],
    ['วันผิดรูป', promised(), { committedResultDate: '20/10/2026', reason }, 400, 'วันที่จะส่งผลประเมินไม่ถูกต้อง'],
    ['วันเดิม', promised(), { committedResultDate: D1, reason }, 409, 'วันเดิมกับที่แจ้งไว้แล้ว'],
    ['ยังไม่เคยรับปาก', request(), { committedResultDate: D2, reason }, 409, 'ใบนี้ยังไม่ได้แจ้งกำหนดส่ง — ใช้ปุ่มแจ้งกำหนดส่งแทน'],
  ];
  for (const [name, req, body, code, error] of cases) {
    const db = world({ rows: drawingRows(), req });
    const { status, json } = await patchRequest(db, HEAD, { action: 'reschedule', ...body });
    assert.equal(status, code, `${name}: ${json.error}`);
    assert.equal(json.error, error, name);
    assert.deepEqual(db.writes(), [], name);
  }
});

test('🔴 เลื่อนวันส่งผลได้เฉพาะหัวหน้าฝ่ายบริการ — ผู้จัดคิว 403 ข้อความตรงตัว · ไม่เขียนอะไร', async () => {
  for (const [shape, rows] of Object.entries(DESK_SHAPES)) {
    const db = world({ rows: rows(), req: promised() });
    const { status, json } = await patchRequest(db, PLANNER, {
      action: 'reschedule', committedResultDate: D2, reason: 'ลูกค้าส่งแบบแปลนช้า',
    });
    assert.equal(status, 403, shape);
    assert.equal(json.error, SURVEY_DESK_RESCHEDULE_FORBIDDEN, shape);
    assert.deepEqual(db.writes(), [], shape);
  }
  const salesDb = world({ rows: drawingRows(), req: promised() });
  const sales = await patchRequest(salesDb, SALES, { action: 'reschedule', committedResultDate: D2, reason: 'x' });
  assert.equal(sales.status, 403);
  assert.equal(sales.json.error, 'เลื่อนวันได้เฉพาะฝ่าย TS');
});

/* ═══ ④ ใบลงหน้างาน: คำสั่งเขียนเดิมทุกตัว ไม่ว่าแถวพื้นที่จะมีคีย์ method หรือไม่ ═══════════════════ */

test('🔴 ลงคิวใบลงหน้างาน (ผู้จัดคิว): ใบได้วัน + ช่างได้นัด เหมือนเดิมทุกตัว ทั้งสามรูปของแถว', async () => {
  const logs = {};
  for (const [shape, rows] of Object.entries(ONSITE_SHAPES)) {
    const db = world({ rows: rows() });
    const { status, json } = await patchRequest(db, PLANNER, {
      action: 'commit-due', committedDueDate: '2026-10-12', committedDueTime: '09:30', assigneeId: 'u-tech',
      committedResultDate: '2026-10-14', reason: 'ลูกค้าสะดวกช่วงเช้า',
    });
    assert.equal(status, 200, `${shape}: ${json.error}`);
    assert.deepEqual(requestWrites(db), [{
      write: 'update',
      filters: [['eq', 'id', 'REQ-1']],
      payload: {
        updatedAt: NOW,
        committedDueDate: '2026-10-12',
        dueCommittedAt: NOW,
        committedDueTime: '09:30',
        committedResultDate: '2026-10-14',
        assigneeId: 'u-tech',
        assigneeName: 'ช่างเอ',
        assignedAt: NOW,
      },
    }], shape);
    const visitWrites = db.writes('service_visits');
    assert.equal(visitWrites.length, 1, shape);
    assert.equal(visitWrites[0].write, 'insert', shape);
    const [made] = db.rows('service_visits');
    assert.deepEqual(scrub(made), {
      siteId: 'SITE-1', requestId: 'REQ-1', kind: 'survey', scheduledDate: '2026-10-12', startTime: '09:30',
      assigneeId: 'u-tech', assigneeName: 'ช่างเอ', note: 'ประเมินพื้นที่ตามคำร้อง RQ-AS-26100001',
      status: 'scheduled', createdById: 'u-plan', createdByName: 'ผู้จัดคิว', code: made.code,
    }, shape);
    assert.equal(db.listUsers > 0, true, `${shape}: ต้องค้นช่างจากทะเบียน`);
    assert.deepEqual(auditSummaries(db), [
      `ลงคิวเข้าพื้นที่ 2026-10-12 09:30 · ช่างเอ · ส่งผล 2026-10-14 — ลูกค้าสะดวกช่วงเช้า · นัด ${made.code}`,
    ], shape);
    logs[shape] = writeLog(db);
  }
  sameAcrossShapes(logs);
});

test('🔴 ลงคิวใบลงหน้างาน: ด่านเดิมตอบข้อความเดิม — ไม่มีช่าง / ไม่มีวันส่งผล (หัวหน้ากดเองก็เส้นเดิม)', async () => {
  for (const [shape, rows] of Object.entries(ONSITE_SHAPES)) {
    for (const user of [PLANNER, HEAD]) {
      const noTech = world({ rows: rows() });
      const a = await patchRequest(noTech, user, { action: 'commit-due', committedDueDate: '2026-10-12', committedResultDate: '2026-10-14' });
      assert.equal(a.status, 400, shape);
      assert.equal(a.json.error, 'ต้องเลือกเจ้าหน้าที่ผู้รับผิดชอบ', shape);
      const noResult = world({ rows: rows() });
      const b = await patchRequest(noResult, user, { action: 'commit-due', committedDueDate: '2026-10-12', assigneeId: 'u-tech' });
      assert.equal(b.status, 400, shape);
      assert.equal(b.json.error, 'ต้องระบุวันที่จะส่งผลประเมิน', shape);
      const early = world({ rows: rows() });
      const c = await patchRequest(early, user, {
        action: 'commit-due', committedDueDate: '2026-10-12', assigneeId: 'u-tech', committedResultDate: '2026-10-11',
      });
      assert.equal(c.json.error, 'วันที่จะส่งผลประเมินต้องไม่มาก่อนวันนัดเข้าพื้นที่', shape);
      assert.deepEqual([...noTech.writes(), ...noResult.writes(), ...early.writes()], []);
    }
  }
});

test('🔴 เลื่อนวันใบลงหน้างาน (มีนัดเปิด): ใบได้วันใหม่ + นัดเดิมถูกขยับ · เหตุผลไม่บังคับ — เหมือนเดิมทั้งสามรูปของแถว', async () => {
  const logs = {};
  for (const [shape, rows] of Object.entries(ONSITE_SHAPES)) {
    const db = world({ rows: rows(), req: queued(), visits: [visit()] });
    const { status, json } = await patchRequest(db, PLANNER, { action: 'reschedule', committedDueDate: '2026-10-13' });
    assert.equal(status, 200, `${shape}: ${json.error}`);
    assert.deepEqual(requestWrites(db), [{
      write: 'update',
      filters: [['eq', 'id', 'REQ-1']],
      payload: { updatedAt: NOW, committedDueDate: '2026-10-13', dueCommittedAt: NOW },
    }], shape);
    assert.deepEqual(db.writes('service_visits').map((c) => ({ write: c.write, filters: c.filters, payload: c.payload })), [{
      write: 'update', filters: [['eq', 'id', 'SVV-1']], payload: { scheduledDate: '2026-10-13', updatedAt: NOW },
    }], shape);
    assert.deepEqual(auditSummaries(db), [`เลื่อนวันนัดเข้าพื้นที่ ${TODAY} → 2026-10-13`], shape);
    logs[shape] = writeLog(db);
  }
  sameAcrossShapes(logs);
});

test('🔴 เลื่อนวันใบลงหน้างาน (ไม่มีนัดเปิด): เส้นกู้เดิมยังสร้างนัดใบใหม่ให้ช่างบนใบ — เหมือนเดิมทั้งสามรูปของแถว', async () => {
  const logs = {};
  for (const [shape, rows] of Object.entries(ONSITE_SHAPES)) {
    const db = world({ rows: rows(), req: queued(), visits: [CLOSED.cancelled()] });
    const { status, json } = await patchRequest(db, PLANNER, {
      action: 'reschedule', committedDueDate: '2026-10-13', committedDueTime: '13:00', committedResultDate: '2026-10-16',
      reason: 'ลูกค้าขอเลื่อน',
    });
    assert.equal(status, 200, `${shape}: ${json.error}`);
    assert.deepEqual(requestWrites(db)[0].payload, {
      updatedAt: NOW, committedDueDate: '2026-10-13', dueCommittedAt: NOW, committedDueTime: '13:00',
      committedResultDate: '2026-10-16',
    }, shape);
    const made = db.rows('service_visits').find((row) => row.id !== 'SVV-1');
    assert.ok(made, `${shape}: ต้องได้นัดใบใหม่`);
    assert.equal(made.assigneeId, 'u-tech', shape);
    assert.equal(made.scheduledDate, '2026-10-13', shape);
    assert.equal(made.startTime, '13:00', shape);
    assert.deepEqual(auditSummaries(db), [
      `เลื่อนวันนัดเข้าพื้นที่ ${TODAY} → 2026-10-13 · ส่งผล 2026-10-14 → 2026-10-16 — ลูกค้าขอเลื่อน · นัด ${made.code}`,
    ], shape);
    logs[shape] = writeLog(db);
  }
  sameAcrossShapes(logs);
});

/* ═══ ③ PATCH ของนัดบนใบงานโต๊ะ ═══════════════════════════════════════════════════════════════ */

test('🔴 เปิดนัดที่จบแล้วของใบงานโต๊ะกลับมา = 409 ข้อความตรงตัว · ไม่เขียนอะไรเลย', async () => {
  const REVIVES = [
    ['cancelled', { status: 'scheduled' }],
    ['unable', { status: 'scheduled' }],
    ['done', { status: 'scheduled' }],
    ['partial', { status: 'scheduled' }],
    ['rescheduled', { status: 'scheduled' }],
    ['cancelled', { status: 'draft' }],
  ];
  for (const [shape, rows] of Object.entries(DESK_SHAPES)) {
    for (const [from, body] of REVIVES) {
      for (const user of [PLANNER, HEAD]) {
        const db = world({ rows: rows(), req: promised(), visits: [CLOSED[from]()] });
        const { status, json } = await patchVisit(db, user, body);
        const at = `${shape} · ${from} → ${body.status} · ${user.role}`;
        assert.equal(status, 409, `${at}: ${json.error}`);
        assert.equal(json.error, 'ใบนี้ประเมินจากแบบทั้งใบ — เปิดนัดกลับไม่ได้ ให้หัวหน้าเปลี่ยนวิธีประเมินเป็นลงหน้างานก่อน', at);
        assert.equal(json.error, SURVEY_DESK_REVIVE_ERROR);
        assert.deepEqual(db.writes(), [], at);
        assert.equal(db.rows('service_visits')[0].status, from, at);
      }
    }
  }
});

test('ใบงานโต๊ะ: ข้อความงานโต๊ะมาก่อนข้อความ "มีนัดอื่นเปิดอยู่" — ไม่ถามหานัดอื่นเลย', async () => {
  const db = world({
    rows: drawingRows(), req: promised(),
    visits: [CLOSED.cancelled(), running({ id: 'SVV-2', code: 'SV-26100002', createdAt: '2026-10-06T02:00:00.000Z' })],
  });
  const { status, json } = await patchVisit(db, PLANNER, { status: 'scheduled' });
  assert.equal(status, 409);
  assert.equal(json.error, SURVEY_DESK_REVIVE_ERROR);
  assert.deepEqual(openVisitProbes(db), []);
  assert.deepEqual(db.writes(), []);
});

/* ⚠️ `done → in_progress` ไปไม่ถึงด่านเปิดนัดกลับ — "กำลังทำ" ตั้งได้จากปุ่มรับงานเท่านั้น และปุ่มนั้นใช้กับใบที่ปิดแล้ว
   ไม่ได้ (ด่านเดิมสองตัวที่อยู่ก่อนหน้าในเส้นเดียวกัน) ⇒ ได้ 409 ของด่านเดิม ทั้งใบงานโต๊ะและใบลงหน้างาน · ไม่เขียนอะไร */
test('done → in_progress: 409 จากด่านเดิมที่อยู่ก่อน (ทั้งสองแบบของใบ) · ไม่เขียนอะไร', async () => {
  for (const rows of [drawingRows, onsiteRows]) {
    const direct = world({ rows: rows(), req: promised(), visits: [CLOSED.done()] });
    const a = await patchVisit(direct, PLANNER, { status: 'in_progress' });
    assert.equal(a.status, 409);
    assert.equal(a.json.error, IN_PROGRESS_STAMP_ERROR);
    assert.deepEqual(direct.writes(), []);

    const stamped = world({ rows: rows(), req: promised(), visits: [CLOSED.done()] });
    const b = await patchVisit(stamped, PLANNER, { stamp: 'start' });
    assert.equal(b.status, 409);
    assert.match(b.json.error, /^ใบนี้ปิดงานแล้ว/);
    assert.deepEqual(stamped.writes(), []);
  }
});

test('🔴 ปิดนัดของใบงานโต๊ะเป็น "เข้าไม่ได้": นัดถูกปิดตามที่ขอ · ศูนย์คำสั่งเขียนลง dept_requests · ไม่มีบรรทัดถอยขั้น', async () => {
  for (const [shape, rows] of Object.entries(DESK_SHAPES)) {
    const db = world({ rows: rows(), req: promised(), visits: [running()] });
    const { status, json } = await patchVisit(db, PLANNER, { status: 'unable', unableReason: UNABLE_REASON });
    assert.equal(status, 200, `${shape}: ${json.error}`);
    assert.equal(json.visit.status, 'unable', shape);
    assert.equal(db.rows('service_visits')[0].status, 'unable', shape);
    assert.equal(json.steppedBackRequest, false, shape);
    assert.deepEqual(db.writes('dept_requests'), [], shape);
    assert.deepEqual(threadRows(db, 'dept_request'), [], `${shape}: เธรดของใบต้องไม่มีบรรทัดใหม่`);
    // คำสัญญาวันส่งผลยังอยู่
    assert.equal(db.rows('dept_requests')[0].committedDueDate, D1, shape);
    assert.equal(db.rows('dept_requests')[0].committedResultDate, D1, shape);
    // ประวัติของนัดเองยังถูกเล่าในเธรดของนัดตามเดิม
    assert.deepEqual(threadRows(db, 'service_visit').map((row) => row.kind), ['done'], shape);
    assert.equal(db.reads('service_survey_zones').length, 1, `${shape}: อ่านแถวพื้นที่ครั้งเดียว`);
  }
});

test('🔴 แก้วันของนัดที่กำลังทำ บนใบงานโต๊ะ: นัดได้วันใหม่ · ศูนย์คำสั่งเขียนลง dept_requests', async () => {
  for (const [shape, rows] of Object.entries(DESK_SHAPES)) {
    const db = world({ rows: rows(), req: promised(), visits: [running()] });
    const { status, json } = await patchVisit(db, PLANNER, { scheduledDate: '2026-10-12' });
    assert.equal(status, 200, `${shape}: ${json.error}`);
    assert.equal(db.rows('service_visits')[0].scheduledDate, '2026-10-12', shape);
    assert.deepEqual(db.writes('dept_requests'), [], shape);
    assert.deepEqual(threadRows(db, 'dept_request'), [], shape);
    assert.equal(db.rows('dept_requests')[0].committedDueDate, D1, shape);
    assert.equal(db.rows('dept_requests')[0].committedDueTime, null, shape);
  }
});

/* ── เส้นเดียวกันบนใบลงหน้างาน = คำสั่งเขียนของวันนี้ ───────────────────────────────────────────── */

test('🔴 ใบลงหน้างาน: ปิดนัดเป็น "เข้าไม่ได้" = ใบถอยขั้นเหมือนเดิม — ทั้งสามรูปของแถว', async () => {
  const logs = {};
  for (const [shape, rows] of Object.entries(ONSITE_SHAPES)) {
    const db = world({ rows: rows(), req: queued(), visits: [running()] });
    const { status, json } = await patchVisit(db, PLANNER, { status: 'unable', unableReason: UNABLE_REASON });
    assert.equal(status, 200, `${shape}: ${json.error}`);
    assert.equal(json.steppedBackRequest, true, shape);
    assert.deepEqual(requestWrites(db), [{
      write: 'update',
      filters: [['eq', 'id', 'REQ-1']],
      payload: { committedDueDate: null, committedDueTime: null, updatedAt: NOW },
    }], shape);
    const [line] = threadRows(db, 'dept_request', 'unable');
    assert.equal(line.body, `เข้าพื้นที่ไม่ได้ — ใบกลับไปขั้นลงคิว รอ TS ลงวันใหม่ · วันเดิม ${TODAY} — ${UNABLE_REASON}`, shape);
    assert.equal(line.body, surveyStepBackBody({ reason: UNABLE_REASON, previousDueDate: TODAY }));
    assert.equal(line.authorId, null, `${shape}: ไม่ผูก authorId ของคนกด`);
    assert.equal(line.authorName, 'ผู้จัดคิว', shape);
    logs[shape] = writeLog(db);
  }
  sameAcrossShapes(logs);
});

test('🔴 ใบลงหน้างาน: แก้วันของนัดที่กำลังทำ = วันถูกเขียนกลับลงใบเหมือนเดิม — ทั้งสามรูปของแถว', async () => {
  const logs = {};
  for (const [shape, rows] of Object.entries(ONSITE_SHAPES)) {
    const db = world({ rows: rows(), req: queued(), visits: [running()] });
    const { status, json } = await patchVisit(db, PLANNER, { scheduledDate: '2026-10-12' });
    assert.equal(status, 200, `${shape}: ${json.error}`);
    assert.deepEqual(requestWrites(db), [{
      write: 'update',
      filters: [['eq', 'id', 'REQ-1']],
      payload: { committedDueDate: '2026-10-12', committedDueTime: '09:00', updatedAt: NOW },
    }], shape);
    const [line] = threadRows(db, 'dept_request', 'reschedule');
    assert.match(line.body, /^TS เลื่อนวันนัดจากตารางเจ้าหน้าที่ .+ → .+ 09:00 น\.$/, shape);
    logs[shape] = writeLog(db);
  }
  sameAcrossShapes(logs);
});

test('🔴 ใบลงหน้างาน: เปิดนัดที่จบแล้วกลับมาได้เหมือนเดิม และวันถูกซิงก์กลับลงใบ — อ่านแถวพื้นที่ครั้งเดียวต่อคำขอ', async () => {
  const logs = {};
  for (const [shape, rows] of Object.entries(ONSITE_SHAPES)) {
    for (const from of ['unable', 'cancelled', 'done']) {
      /* ใบถอยขั้นไปแล้ว (วันถูกล้าง) ⇒ เปิดนัดกลับ = วันของนัดกลับขึ้นใบ */
      const db = world({ rows: rows(), req: queued({ committedDueDate: null, committedDueTime: null }), visits: [CLOSED[from]()] });
      const { status, json } = await patchVisit(db, PLANNER, { status: 'scheduled' });
      const at = `${shape} · ${from}`;
      assert.equal(status, 200, `${at}: ${json.error}`);
      assert.equal(db.rows('service_visits')[0].status, 'scheduled', at);
      assert.deepEqual(requestWrites(db), [{
        write: 'update',
        filters: [['eq', 'id', 'REQ-1']],
        payload: { committedDueDate: TODAY, committedDueTime: '09:00', updatedAt: NOW },
      }], at);
      assert.equal(db.reads('service_survey_zones').length, 1, `${at}: ถามตอนเปิดนัดกลับแล้วจำไว้ใช้ตอนซิงก์วัน`);
      (logs[from] ||= {})[shape] = writeLog(db);
    }
  }
  for (const byShape of Object.values(logs)) sameAcrossShapes(byShape);
});

test('ใบลงหน้างาน: เปิดนัดกลับขณะมีนัดอื่นเปิดอยู่ = 409 ข้อความเดิม', async () => {
  for (const [shape, rows] of Object.entries(ONSITE_SHAPES)) {
    const db = world({
      rows: rows(), req: queued(),
      visits: [CLOSED.cancelled(), running({ id: 'SVV-2', code: 'SV-26100002', createdAt: '2026-10-06T02:00:00.000Z' })],
    });
    const { status, json } = await patchVisit(db, PLANNER, { status: 'scheduled' });
    assert.equal(status, 409, shape);
    assert.equal(
      json.error,
      'ใบคำร้องนี้มีนัดที่ยังไม่ปิดอยู่แล้ว (SV-26100002) — ปิดหรือยกเลิกนัดนั้นก่อน ถึงจะเปิดนัดนี้กลับมาได้',
      shape,
    );
    assert.deepEqual(db.writes(), [], shape);
  }
});

/* ── อ่านแถวพื้นที่ไม่ได้: ถอยขั้น/ซิงก์วัน = เดินแบบใบลงหน้างาน · เปิดนัดกลับ = 500 (ด่านไม่เปิดเอง) ─────────── */

test('🔴 PATCH ของนัด: อ่านแถวพื้นที่ล้ม — เปิดนัดกลับ = 500 ไม่เขียนอะไร · ถอยขั้น/ซิงก์วัน = เดินเหมือนใบลงหน้างาน · ลง log ทุกจุด', async () => {
  const failZones = (q) => (q.table === 'service_survey_zones' && !q.write
    ? { data: null, error: { message: 'zones ล่ม' } } : undefined);

  /* ① เปิดนัดกลับ — ไม่รู้ว่าใบต้องมีนัดไหม = ไม่เปิด (ทั้งใบงานโต๊ะและใบลงหน้างาน) · ยังไม่ได้เขียนอะไร กดใหม่ได้
     🐞 เดิมอ่านล้ม = ปล่อยผ่าน ⇒ นัดของใบงานโต๊ะกลับขึ้นตารางช่าง และวันของนัดทับวันส่งผลบนใบ */
  for (const rows of [drawingRows(), ...Object.values(ONSITE_SHAPES).map((make) => make())]) {
    const reviveDb = world({ rows, req: queued({ committedDueDate: null, committedDueTime: null }), visits: [CLOSED.cancelled()], hook: failZones });
    const revive = await quiet(() => patchVisit(reviveDb, PLANNER, { status: 'scheduled' }));
    assert.equal(revive.result.status, 500);
    assert.equal(revive.result.json.error, 'อ่านวิธีประเมินของใบไม่สำเร็จ — ยังไม่ได้เปิดนัดกลับ กดอีกครั้ง');
    assert.deepEqual(reviveDb.writes(), []);
    assert.equal(reviveDb.rows('service_visits')[0].status, 'cancelled');
    assert.equal(revive.lines.some((line) => line.includes('zones ล่ม')), true, 'ต้องลง log ไม่ใช่กลืนเงียบ');
    assert.equal(reviveDb.reads('service_survey_zones').length, 1);
  }

  // ② ปิด "เข้าไม่ได้" — ใบถอยขั้นตามเดิม
  const unableDb = world({ rows: drawingRows(), req: queued(), visits: [running()], hook: failZones });
  const unable = await quiet(() => patchVisit(unableDb, PLANNER, { status: 'unable', unableReason: UNABLE_REASON }));
  assert.equal(unable.result.status, 200, unable.result.json.error);
  assert.equal(unable.result.json.steppedBackRequest, true);
  assert.deepEqual(requestWrites(unableDb).map((c) => c.payload), [{ committedDueDate: null, committedDueTime: null, updatedAt: NOW }]);
  assert.equal(unable.lines.some((line) => line.includes('zones ล่ม')), true);

  // ③ แก้วันของนัดที่กำลังทำ — วันถูกซิงก์ตามเดิม
  const syncDb = world({ rows: drawingRows(), req: queued(), visits: [running()], hook: failZones });
  const sync = await quiet(() => patchVisit(syncDb, PLANNER, { scheduledDate: '2026-10-12' }));
  assert.equal(sync.result.status, 200, sync.result.json.error);
  assert.deepEqual(requestWrites(syncDb).map((c) => c.payload), [{ committedDueDate: '2026-10-12', committedDueTime: '09:00', updatedAt: NOW }]);
});

/* ── ถามแถวพื้นที่เฉพาะตอนที่คำตอบเปลี่ยนผลได้ ───────────────────────────────────────────────── */

test('PATCH ของนัดไม่อ่านแถวพื้นที่เมื่อไม่มีอะไรต้องตัดสิน — นัดชนิดอื่น · แก้โน้ต · ยกเลิกนัด', async () => {
  // นัดเติมน้ำหอม (ไม่มีใบคำร้อง)
  const refill = world({ visits: [visit({ kind: 'refill', requestId: null })] });
  const a = await patchVisit(refill, PLANNER, { note: 'ลูกค้าขอเปลี่ยนกลิ่นรอบหน้า' });
  assert.equal(a.status, 200, a.json.error);
  assert.deepEqual(refill.reads('service_survey_zones'), []);

  for (const rows of [drawingRows, onsiteRows]) {
    // นัดประเมิน: แก้โน้ต — วันบนใบตรงกับวันของนัดอยู่แล้ว
    const note = world({ rows: rows(), req: queued(), visits: [visit()] });
    const b = await patchVisit(note, PLANNER, { note: 'โทรนัดลูกค้าแล้ว' });
    assert.equal(b.status, 200, b.json.error);
    assert.deepEqual(note.reads('service_survey_zones'), []);
    assert.deepEqual(note.writes('dept_requests'), []);

    // นัดประเมิน: ยกเลิกนัด — ไม่ใช่การเปิดกลับ ไม่ถอยขั้น ไม่ซิงก์วัน
    const cancel = world({ rows: rows(), req: queued(), visits: [visit()] });
    const c = await patchVisit(cancel, PLANNER, { status: 'cancelled', rescheduleReason: 'ลูกค้ายกเลิก' });
    assert.equal(c.status, 200, c.json.error);
    assert.deepEqual(cancel.reads('service_survey_zones'), []);
    assert.deepEqual(cancel.writes('dept_requests'), []);
  }
});

/* ═══ ตัวถอยขั้น × รูปของแถวพื้นที่ — คำตอบที่ route ส่งให้ตัวตัดสิน ═══════════════════════════════ */

test('🔑 surveyStepBackPlan(needsVisit: surveyNeedsVisit(rows)): ใบงานโต๊ะ = null · ใบที่ยังต้องมีนัด = แผนเดิมทุกตัวอักษร', () => {
  const closing = { ...running(), status: 'unable', unableReason: UNABLE_REASON };
  const args = { visit: closing, before: running(), request: queued() };
  const today = {
    patch: { committedDueDate: null, committedDueTime: null },
    reason: UNABLE_REASON,
    previousDueDate: TODAY,
  };
  assert.deepEqual(surveyStepBackPlan(args), today, 'ไม่ส่ง needsVisit = พฤติกรรมเดิม');
  for (const [name, rows] of Object.entries({ ...ONSITE_SHAPES, ...NOT_DESK_SHAPES })) {
    assert.deepEqual(surveyStepBackPlan({ ...args, needsVisit: surveyNeedsVisit(rows()) }), today, name);
  }
  for (const [name, rows] of Object.entries(DESK_SHAPES)) {
    assert.equal(surveyStepBackPlan({ ...args, needsVisit: surveyNeedsVisit(rows()) }), null, name);
  }
});

/* ═══ ของที่ต้องไม่ถูกแตะ: หัวข้ออื่น · action อื่นของใบประเมิน ═══════════════════════════════════ */

test('🔴 หัวข้อที่ไม่มีสถานที่: แจ้ง/เลื่อนกำหนดส่งเหมือนเดิม — ไม่อ่านแถวพื้นที่ ไม่แตะนัด', async () => {
  const RD = { id: 'u-rd', name: 'อาร์ดี', role: 'rd', department: 'RD' };
  const info = (over = {}) => request({ kind: 'info', dept: 'RD', docNo: 'RQ-RD-26100007', siteId: null, ...over });

  const commit = world({ rows: drawingRows(), req: info() });
  const a = await patchRequest(commit, RD, { action: 'commit-due', committedDueDate: D1, reason: 'รอวัตถุดิบ' });
  assert.equal(a.status, 200, a.json.error);
  assert.deepEqual(requestWrites(commit).map((c) => c.payload), [{ updatedAt: NOW, committedDueDate: D1, dueCommittedAt: NOW }]);
  assert.deepEqual(auditSummaries(commit), [`แจ้งกำหนดส่ง ${D1} — รอวัตถุดิบ`]);
  assert.deepEqual(commit.reads('service_survey_zones'), []);
  assert.deepEqual(commit.writes('service_visits'), []);

  const move = world({ rows: drawingRows(), req: info({ committedDueDate: D1, dueCommittedAt: '2026-10-05T02:00:00+00:00' }) });
  const b = await patchRequest(move, RD, { action: 'reschedule', committedDueDate: D2 });
  assert.equal(b.status, 200, b.json.error);
  assert.deepEqual(requestWrites(move).map((c) => c.payload), [{ updatedAt: NOW, committedDueDate: D2, dueCommittedAt: NOW }]);
  assert.deepEqual(auditSummaries(move), [`เลื่อนวันกำหนดส่ง ${D1} → ${D2}`]);
  assert.deepEqual(move.reads('service_survey_zones'), []);
  assert.deepEqual(move.writes('service_visits'), []);
});

test('🔴 action อื่นของใบประเมินไม่ถามว่าเป็นงานโต๊ะไหม — มอบหมายยังเปลี่ยนชื่อบนนัดที่เปิดอยู่เหมือนเดิม', async () => {
  const zoneReads = (db) => db.reads('service_survey_zones').length;
  const COMMIT = [
    [drawingRows, HEAD, { action: 'commit-due', committedResultDate: D1 }],
    [onsiteRows, PLANNER, { action: 'commit-due', committedDueDate: '2026-10-12', assigneeId: 'u-tech', committedResultDate: '2026-10-14' }],
  ];
  for (const [rows, committer, commitBody] of COMMIT) {
    const db = world({ rows: rows(), req: promised(), visits: [running()] });
    const { status, json } = await patchRequest(db, HEAD, { action: 'assign', assigneeId: 'u-senior', assigneeName: 'หัวหน้าช่าง' });
    assert.equal(status, 200, json.error);
    assert.deepEqual(db.writes('service_visits').map((c) => ({ filters: c.filters, payload: c.payload })), [{
      filters: [['eq', 'id', 'SVV-1']],
      payload: { assigneeId: 'u-senior', assigneeName: 'หัวหน้าช่าง', updatedAt: NOW },
    }]);
    /* เทียบกับก้าวแจ้งวันของใบรูปเดียวกัน: ก้าวนั้นอ่านแถวพื้นที่เพิ่มหนึ่งครั้งเพื่อแยกงานโต๊ะ · มอบหมายไม่อ่านเพิ่ม
       (ไม่ล็อกจำนวนครั้งของตัวโหลดใบ `findRequest` — นั่นเป็นเรื่องของตัวโหลด ไม่ใช่ของเส้นนี้) */
    const commit = world({ rows: rows() });
    const committed = await patchRequest(commit, committer, commitBody);
    assert.equal(committed.status, 200, committed.json.error);
    assert.equal(zoneReads(commit) - zoneReads(db), 1);
  }
});

/* ═══ ยามผูกกับซอร์สจริง ══════════════════════════════════════════════════════════════════════ */

test('🔒 ซอร์ส: สองเส้นถามตัวตัดสินกลาง (`surveyNeedsVisit`) ไม่เทียบคอลัมน์ method เอง · บล็อกนัดหลังเขียนใบข้ามใบงานโต๊ะ', () => {
  const requestRoute = code(REQUEST_ROUTE);
  const visitRoute = code(VISIT_ROUTE);
  for (const [name, src] of [[REQUEST_ROUTE, requestRoute], [VISIT_ROUTE, visitRoute]]) {
    assert.match(src, /import \{[^}]*\bsurveyNeedsVisit\b[^}]*\} from '@\/lib\/service\/surveyMethod';/, name);
    assert.match(src, /surveyNeedsVisit\(await loadSurveyZones\(supabase, /, name);
    assert.doesNotMatch(src, /\.method\b/, `${name}: ห้ามอ่านคอลัมน์ method ตรง ๆ`);
    assert.doesNotMatch(src, /['"]drawing['"]/, `${name}: ห้ามเทียบค่าของคอลัมน์เอง`);
  }
  // ข้อความอยู่ที่ surveyVisit.js ที่เดียว — route เรียกค่าคงที่ ไม่พิมพ์ซ้ำ
  for (const text of ['ใบประเมินจากแบบ', 'ประเมินจากแบบทั้งใบ', 'เลื่อนวันส่งผล']) {
    assert.equal(requestRoute.includes(text), false, text);
    assert.equal(visitRoute.includes(text), false, text);
  }
  assert.match(
    requestRoute,
    /requestNeedsRef\(before\.kind, 'site'\) && \(action === 'commit-due' \|\| action === 'reschedule'\) && !desk\)/,
    'บล็อกสร้าง/ขยับนัดหลังเขียนใบต้องข้ามใบงานโต๊ะ',
  );
  // บล็อกเปลี่ยนเจ้าหน้าที่บนนัด (action assign) ไม่เกี่ยวกับงานโต๊ะ — ต้องไม่ถูกผูกกับธงนี้
  assert.match(requestRoute, /requestNeedsRef\(before\.kind, 'site'\) && action === 'assign'\)/);

  // ด่านเปิดนัดกลับ: ข้อความงานโต๊ะต้องมาก่อนการถามหานัดอื่น และก่อนเขียนแถวนัด
  const patch = visitRoute.slice(visitRoute.indexOf('export const PATCH'), visitRoute.indexOf('export const DELETE'));
  const desk = patch.indexOf('conflict(SURVEY_DESK_REVIVE_ERROR)');
  const other = patch.indexOf('findSurveyVisit(supabase, before.requestId, { openOnly: true })');
  const write = patch.indexOf(".from('service_visits')\n      .update(");
  assert.ok(desk > 0 && other > desk && write > other, 'ลำดับ: ด่านงานโต๊ะ → ถามหานัดอื่น → เขียนแถวนัด');
  // ตัวถอยขั้นและตัวซิงก์วันถามคำตอบเดียวกัน
  assert.match(patch, /surveyStepBackPlan\(\{[^}]*needsVisit: await needsVisitOf\(\)[^}]*\}\)/);
  assert.match(patch, /if \(changed && await needsVisitOf\(\)\) \{/);
});

/* ═══ บรรทัดเธรดของใบงานโต๊ะ (ตัวประกอบข้อความล้วน) ═══════════════════════════════════════════ */

test('🔑 askActionUpdate: `desk` เปลี่ยนเฉพาะบรรทัดแจ้งวัน/เลื่อนวัน · ไม่ส่งหรือเป็น false = ข้อความเดิมทุกตัว', () => {
  const ask = { dept: 'TS', committedDueDate: D2, assigneeName: 'อานนท์' };
  assert.equal(
    askActionUpdate('commit-due', ask, { desk: true, reason: 'รอแบบชั้นสอง' }).body,
    `รับปากส่งผลประเมินจากแบบ ${fmtDate(D2)} · อานนท์ — รอแบบชั้นสอง`,
  );
  assert.equal(
    askActionUpdate('commit-due', { ...ask, assigneeName: null }, { desk: true }).body,
    `รับปากส่งผลประเมินจากแบบ ${fmtDate(D2)}`,
  );
  assert.equal(
    askActionUpdate('reschedule', ask, { desk: true, previousDueDate: D1, reason: 'แบบมาช้า' }).body,
    `เลื่อนวันส่งผลประเมิน ${fmtDate(D1)} → ${fmtDate(D2)} — แบบมาช้า`,
  );
  // kind เดิม ⇒ ป้ายในทะเบียนเธรดและกระดิ่งเดินตามเดิม
  assert.equal(askActionUpdate('commit-due', ask, { desk: true }).kind, 'commitDue');
  assert.equal(askActionUpdate('reschedule', ask, { desk: true }).kind, 'reschedule');
  // 🔴 ใบลงหน้างาน: ไม่ส่งคีย์ · false · ค่าที่ไม่ใช่ true ตรงตัว = ผลเท่ากันทั้งก้อน (ข้อความ + meta)
  for (const action of ['commit-due', 'reschedule', 'acknowledge', 'answer', 'submit']) {
    for (const opts of [{}, { previousDueDate: D1, reason: 'เหตุผล' }, { requeue: true }]) {
      const today = askActionUpdate(action, ask, opts);
      for (const desk of [false, undefined, null, 1, 'true']) {
        assert.deepEqual(askActionUpdate(action, ask, { ...opts, desk }), today, `${action} · desk=${desk}`);
      }
    }
  }
  assert.equal(askActionUpdate('commit-due', ask, {}).body, `TS แจ้งกำหนดส่ง ${fmtDate(D2)}`);
  assert.equal(
    askActionUpdate('reschedule', ask, { previousDueDate: D1 }).body,
    `TS เลื่อนวันกำหนดส่ง ${fmtDate(D1)} → ${fmtDate(D2)}`,
  );
  // ก้าวอื่นของใบงานโต๊ะไม่มีบรรทัดพิเศษ
  assert.deepEqual(askActionUpdate('acknowledge', ask, { desk: true }), askActionUpdate('acknowledge', ask, {}));
});
