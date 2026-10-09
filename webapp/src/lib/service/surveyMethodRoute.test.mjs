// ── เส้นสลับวิธีประเมินรายพื้นที่ · POST /api/service/surveys/[id]/method (งวด S2a §4) ──────────────────
//
// ⭐ เรียก handler **ตัวจริง** ผ่าน supabase ปลอมที่จำแถวข้ามรอบ — ด่าน · การเลือกนัด · แผน · ตัวเขียน · เธรด · กระดิ่ง · audit
//   วิ่งของจริงทั้งสาย ⇒ "พังที่ขั้น k แล้วกดซ้ำ" คือการส่ง body เดิมอีกครั้งจริง ๆ
//   (ตัวเขียนรายขั้นมีเทสต์ของมันเองที่ `surveyMethodWrites.test.mjs` — ไฟล์นี้ถามสิ่งที่ **route** เป็นคนตัดสิน)
// 🔴 ทุกเคสที่ถูกตีกลับต้องยืนยันว่า **ไม่มีอะไรถูกเขียน** — ด่านที่ตีกลับหลังเขียนไปครึ่งทางคือบั๊กที่เส้นนี้มีไว้กัน
// ⚠️ ตัวอ่านผู้ใช้และ client จริงถูกถอดด้วย hook ของ `crew/routeTestKit.mjs` (ลบ env ของ Supabase ก่อน import ด้วย ·
//    dev DB = prod DB) ⇒ ไม่มีอะไรถึงฐานจริง ไม่มีเครือข่าย · import ไฟล์นั้นก่อน `await import(route)` เสมอ
// ⚠️ นาฬิกาตรึงที่ 9 ต.ค. 2026 11:00 เวลาไทย (นาฬิกาปลอมของ node:test) — `clock(n)` เลื่อนเป็นนาทีเมื่อเคสต้องการ "ครั้งถัดไป"
// ⚠️ สวิตช์ `SURVEY_DRAWING_METHOD` ถูกตั้งและคืนค่าในเทสต์ทีละตัว (`flagged`)
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { callRoute } from './crew/routeTestKit.mjs';
import { surveyMethodMix } from './surveyMethod.js';
import { SURVEY_METHOD_CANCEL_ONLY_REASON, surveyMethodPlanKey } from './surveyMethodSwitch.js';

const NOW = '2026-10-09T04:00:00.000Z';
const NOW_MS = Date.parse(NOW);
mock.timers.enable({ apis: ['Date'], now: NOW_MS });
const clock = (minutes = 0) => {
  mock.timers.setTime(NOW_MS + minutes * 60_000);
  return new Date().toISOString();
};

const { POST } = await import('../../app/api/service/surveys/[id]/method/route.js');
const { PATCH: visitPatch } = await import('../../app/api/service/visits/[id]/route.js');

/* ข้อความที่ผู้ใช้เห็น — เขียนตรงตัวที่นี่โดยตั้งใจ (สเปค §4.2) · route หรือทะเบียนคำแก้เมื่อไร เทสต์ต้องแดง */
const T = {
  role: 'เปลี่ยนวิธีประเมินได้เฉพาะหัวหน้าฝ่ายบริการ',
  off: 'ยังไม่เปิดใช้การประเมินจากแบบ',
  notFound: 'ไม่พบใบประเมินพื้นที่',
  sent: 'ส่งผลไปแล้ว — เปลี่ยนวิธีประเมินไม่ได้ โหลดหน้าใหม่',
  notAcknowledged: 'กด “รับเรื่อง” ก่อน แล้วค่อยเปลี่ยนวิธีประเมิน',
  cancelled: 'ใบนี้ถูกยกเลิกไปแล้ว — แก้ผลประเมินไม่ได้',
  closed: 'ใบนี้ถูกปิดไปแล้ว — แก้ผลประเมินไม่ได้ · ถ้าต้องประเมินใหม่ ให้เปิดใบใหม่',
  body: 'วิธีประเมินไม่ถูกต้อง',
  stale: 'ใบนี้ถูกแก้โดยคนอื่นระหว่างที่เปิดกล่องนี้ — โหลดหน้าใหม่',
  nothing: 'ยังไม่ได้เปลี่ยนวิธีประเมินของพื้นที่ไหน',
  reason: 'ต้องบอกเหตุผลอย่างน้อย 10 ตัวอักษร',
  reasonLong: 'เหตุผลยาวเกิน 300 ตัวอักษร',
  resultDate: 'ต้องระบุวันที่จะส่งผลประเมิน',
  resultDateBad: 'วันที่จะส่งผลประเมินไม่ถูกต้อง',
  partial: 'บันทึกไม่ครบ — กด “บันทึกวิธีประเมิน” อีกครั้ง',
};
const DB_DOWN = 'ฐานล่มชั่วคราว';

/* ── ฐานปลอม: ตารางในหน่วยความจำ + ตัวสร้างคำสั่งแบบ supabase + จุดฉีดความพัง ────────────────────────
   (ทรงเดียวกับของ `surveyMethodWrites.test.mjs` · เพิ่ม upsert แบบ onConflict ให้กระดิ่งกันซ้ำเหมือน unique index จริง
   และยอมเมธอดที่ไม่รู้จัก — handler ตัวจริงเรียกตัวอ่านหลายตัวที่ไฟล์นี้ไม่สนใจ) */
const clone = (v) => structuredClone(v);
const same = (a, b) => (a == null || b == null ? a == null && b == null : String(a) === String(b));
const firstRow = (call) => [].concat(call.rows || [])[0] || {};

const authUser = (id, name, role) => ({
  id, email: `${id.toLowerCase()}@example.test`, user_metadata: { name }, app_metadata: { role, department: 'TS' },
});
const DIRECTORY = [
  authUser('U-HEAD', 'หัวหน้า ก', 'ts_manager'),
  authUser('U-HEAD2', 'หัวหน้า ข', 'ts_audit'),
  authUser('U-TECH', 'Phuwadol Aoonnankad', 'ts'),
  authUser('U-AST', 'ผู้ช่วยช่าง', 'ts'),
  authUser('U-PLAN', 'ผู้จัดคิว', 'ts_planner'),
];

function fakeDb(seed) {
  const tables = clone(seed);
  const calls = [];
  const hooks = [];
  const db = {
    tables,
    calls,
    auth: { admin: { listUsers: async ({ page = 1 } = {}) => ({ data: { users: page === 1 ? DIRECTORY : [] }, error: null }) } },
    rpc: async () => ({ data: null, error: null }),
    /** ครั้งที่ `nth` ที่คำสั่งตรง `match`: `effect(tables)` รันก่อนคำสั่ง · คืน error = คำสั่งนั้นพังโดยไม่เขียน */
    on(match, effect, nth = 1) { hooks.push({ match, effect, nth, seen: 0 }); return db; },
    failOn(match, nth = 1, message = DB_DOWN) { return db.on(match, () => ({ message, code: '57014' }), nth); },
  };
  db.from = (table) => {
    const q = { op: 'select', where: [], tests: [], patch: null, rows: null, cols: null, orders: [], limit: null, options: null };
    const run = (mode) => {
      const call = { table, op: q.op, patch: q.patch, rows: q.rows, where: q.where, cols: q.cols };
      let injected = null;
      for (const hook of hooks) {
        if (!hook.match(call)) continue;
        hook.seen += 1;
        if (hook.seen === hook.nth) injected = hook.effect(tables) || injected;
      }
      calls.push(call);
      if (injected) { call.failed = true; return { data: null, error: injected }; }
      const store = (tables[table] ||= []);
      const hit = (row) => q.tests.every((fn) => fn(row));
      let out;
      if (q.op === 'insert') {
        out = [].concat(q.rows).map(clone);
        store.push(...out);
      } else if (q.op === 'upsert') {
        const keys = String(q.options?.onConflict || 'id').split(',').map((k) => k.trim());
        out = [];
        for (const row of [].concat(q.rows)) {
          const old = store.find((r) => keys.every((k) => r[k] != null && same(r[k], row[k])));
          if (old) { if (!q.options?.ignoreDuplicates) Object.assign(old, clone(row)); continue; }
          out.push(clone(row));
          store.push(out[out.length - 1]);
        }
      } else if (q.op === 'update') {
        out = store.filter(hit);
        for (const row of out) Object.assign(row, clone(q.patch));
        call.hit = out.length;
      } else {
        out = store.filter(hit);
        for (const [col, asc] of [...q.orders].reverse()) {
          out = [...out].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (asc ? 1 : -1));
        }
        if (q.limit != null) out = out.slice(0, q.limit);
      }
      out = out.map(clone);
      // select แบบระบุคอลัมน์คืนเฉพาะคอลัมน์นั้น (ชื่อในเครื่องหมายคำพูดแบบ PostgREST ถูกถอดออก)
      if (q.op === 'select' && q.cols && q.cols !== '*' && !q.cols.includes('(')) {
        const cols = q.cols.split(',').map((col) => col.trim().replace(/"/g, ''));
        out = out.map((row) => Object.fromEntries(cols.map((col) => [col, row[col]])));
      }
      if (mode === 'maybeSingle') return { data: out[0] || null, error: null };
      if (mode === 'single') return out[0] ? { data: out[0], error: null } : { data: null, error: { message: 'ไม่มีแถว' } };
      return { data: out, error: null };
    };
    const filter = (kind, col, value, fn) => { q.where.push([kind, col, value]); q.tests.push(fn); return builder; };
    const known = {
      select(cols = '*') { if (q.op === 'select') q.cols = cols; return builder; },
      update(patch) { q.op = 'update'; q.patch = patch; return builder; },
      insert(rows) { q.op = 'insert'; q.rows = rows; return builder; },
      upsert(rows, options) { q.op = 'upsert'; q.rows = rows; q.options = options || null; return builder; },
      eq: (col, value) => filter('eq', col, value, (row) => same(row[col], value)),
      neq: (col, value) => filter('neq', col, value, (row) => !same(row[col] ?? null, value)),
      in: (col, list) => filter('in', col, list, (row) => list.some((v) => same(row[col], v))),
      is: (col, value) => filter('is', col, value, (row) => (row[col] ?? null) === value),
      not: (col, op, value) => filter('not', col, value, (row) => (op === 'is' ? (row[col] ?? null) !== value : true)),
      order(col, { ascending = true } = {}) { q.orders.push([col, ascending]); return builder; },
      limit(n) { q.limit = n; return builder; },
      maybeSingle: async () => run('maybeSingle'),
      single: async () => run('single'),
      then: (resolve, reject) => Promise.resolve().then(() => run('many')).then(resolve, reject),
    };
    const builder = new Proxy(known, {
      get: (target, prop) => (prop in target || typeof prop !== 'string' ? target[prop] : () => builder),
    });
    return builder;
  };
  return db;
}

/* ตัวจับคำสั่ง — ตัวอ่านของ route (ด่าน ③ ⑦) และขั้นเขียนของ §4.4 */
const has = (call, kind, col, value) => call.where.some(([k, c, v]) => k === kind && c === col && (value === undefined || v === value));
const M = {
  requestRead: (c) => c.table === 'dept_requests' && c.op === 'select' && c.cols === '*',
  zonesRead: (c) => c.table === 'service_survey_zones' && c.op === 'select' && has(c, 'eq', 'requestId') && !has(c, 'eq', 'id'),
  sendBackRead: (c) => c.table === 'entity_updates' && c.op === 'select' && has(c, 'in', 'kind'),
  openVisitRead: (c) => c.table === 'service_visits' && c.op === 'select' && has(c, 'in', 'status'),
  latestVisitRead: (c) => c.table === 'service_visits' && c.op === 'select' && c.cols === '*'
    && has(c, 'eq', 'requestId') && !has(c, 'eq', 'id') && !has(c, 'in', 'status'),
  namedVisitRead: (c) => c.table === 'service_visits' && c.op === 'select' && c.cols === '*' && has(c, 'eq', 'id') && has(c, 'eq', 'requestId'),
  proofRead: (c) => c.table === 'entity_updates' && c.op === 'select' && has(c, 'eq', 'entityType', 'service_visit') && has(c, 'eq', 'kind', 'cancel'),
  filesRead: (c) => c.table === 'attachments' && c.op === 'select',
  threadFilesRead: (c) => c.table === 'entity_updates' && c.op === 'select' && /attachments/.test(c.cols || ''),
  touch: (c) => c.table === 'dept_requests' && c.op === 'update',
  recheck: (c) => c.table === 'dept_requests' && c.op === 'select' && c.cols !== '*' && /answeredAt/.test(c.cols || ''),
  cancel: (c) => c.table === 'service_visits' && c.op === 'update',
  visitLine: (c) => c.table === 'entity_updates' && c.op === 'insert' && firstRow(c).entityType === 'service_visit',
  toDrawing: (c) => c.table === 'service_survey_zones' && c.op === 'update' && 'methodReason' in c.patch && !('spots' in c.patch),
  toOnsite: (c) => c.table === 'service_survey_zones' && c.op === 'update' && 'spots' in c.patch,
  cutMark: (c) => c.table === 'service_survey_zones' && c.op === 'update' && !('methodReason' in c.patch),
  dedupeRead: (c) => c.table === 'entity_updates' && c.op === 'select' && has(c, 'eq', 'kind', 'method'),
  thread: (c) => c.table === 'entity_updates' && c.op === 'insert' && firstRow(c).entityType === 'dept_request',
};
const matcherOf = (step) => {
  const [name, nth] = step.split('#');
  return [M[name], Number(nth || 1)];
};

/* คำสั่งเขียนที่ถูกส่งออกไป (ไม่นับคำสั่งที่ถูกฉีดให้พัง) · `effective` = ตัวที่โดนแถวจริง */
const writesOf = (db, from = 0) => db.calls.slice(from).filter((c) => !c.failed && c.op !== 'select');
const effective = (db, from = 0) => writesOf(db, from).filter((c) => c.op !== 'update' || c.hit > 0);

/* ชื่อขั้นของ §4.4 ตามลำดับที่เขียนจริง — `2` ยกเลิกนัด + `2-line` บรรทัดบนเธรดของนัด + `2-audit` · `4(…)` พกวันแบบไหน */
function dateStep(patch) {
  const cols = Object.keys(patch).filter((col) => col !== 'updatedAt');
  if (!cols.length) return '4';
  if (!('committedResultDate' in patch)) return '4(sync)';
  return patch.committedResultDate === null ? '4(clear)' : '4(set)';
}
function stepsOf(db, from = 0) {
  let touches = 0;
  return effective(db, from).filter((c) => c.table !== 'notifications').map((c) => {
    if (M.touch(c)) { touches += 1; return touches === 1 ? '1' : dateStep(c.patch); }
    if (M.cancel(c)) return '2';
    if (M.visitLine(c)) return '2-line';
    if (M.toDrawing(c)) return '3a';
    if (M.toOnsite(c)) return '3b';
    if (M.cutMark(c)) return '3c';
    if (M.thread(c)) return '5';
    if (c.table === 'audit_logs') return firstRow(c).entityType === 'service_visit' ? '2-audit' : '6';
    return `?${c.table}.${c.op}`;
  });
}

/* ── ของตั้งต้น — เคส B ของม็อก: สามพื้นที่ · นัด SV-26100011 อ. 13 ต.ค. 2026 · ช่าง Phuwadol ─────────── */
const head = { id: 'U-HEAD', name: 'หัวหน้า ก', role: 'ts_manager', department: 'TS' };
const REASON = 'หน้างานยังก่อสร้าง ถึงสิ้นเดือน';
const CHIP = 'หน้างานยังก่อสร้าง';
const DATE = '2026-10-12';
const ACTION = { a: '0b1e6c0e-6a0b-4f0e-9a39-2f0f6f1f7c11', b: '7f3d2a10-1111-4222-8333-444455556666', c: 'c0ffee00-2222-4333-8444-555566667777' };
const keyOf = (actionId, user = head) => surveyMethodPlanKey({ userId: user.id, actionId });

const requestRow = (over = {}) => ({
  id: 'RQ1', kind: 'site_survey', dept: 'TS', docNo: 'RQ-AS-26100312', title: 'ประเมินพื้นที่ชั้น 12', status: 'acknowledged',
  requestedById: 'U-AE', requestedByName: 'เซลเอ', acknowledgedAt: '2026-10-08T00:00:00+00:00',
  answeredAt: null, cancelledAt: null, closedAt: null,
  committedDueDate: '2026-10-13', committedDueTime: '10:00', committedResultDate: '2026-10-15',
  assigneeId: 'U-TECH', assigneeName: 'Phuwadol Aoonnankad', updatedAt: '2026-10-08T00:00:00+00:00', ...over,
});
/* ใบงานโต๊ะที่หัวหน้าอีกคนรับปากวันส่งผลไว้แล้ว — วันเข้าพื้นที่ = วันส่งผล ไม่มีเวลา ผู้รับผิดชอบคือหัวหน้า */
const deskRequest = (over = {}) => requestRow({
  committedDueDate: '2026-10-15', committedDueTime: null, assigneeId: 'U-HEAD2', assigneeName: 'หัวหน้า ข', ...over,
});
const zone = (id, zoneName, over = {}) => ({
  id, requestId: 'RQ1', zoneName, status: 'ok', method: 'onsite', sortOrder: Number(id.slice(-1)), spots: [],
  updatedAt: `2026-10-08T0${id.slice(-1)}:00:00+00:00`, ...over,
});
const drawn = { method: 'drawing', methodReason: 'ลูกค้ายังไม่ให้เข้า', methodChangedByName: 'หัวหน้า ข', methodChangedAt: '2026-10-07T02:00:00+00:00' };
const cutLine = { status: 'cut', cutReason: 'ซ้ำกับพื้นที่อื่นของใบ' };
const SPOTS = [{ id: 's1', selected: true, x: 0.2, y: 0.4 }, { id: 's2', selected: false, x: 0.6, y: 0.1 }];
const SHEETS = {
  // ลงหน้างานล้วน + แถวลงหน้างานที่ตัดไปแล้วหนึ่งแถว (ให้ขั้น 3c มีงานทำเมื่อใบพลิก)
  onsite: () => [zone('Z0', 'ห้องเก็บของ', cutLine), zone('Z1', 'ล็อบบี้'), zone('Z2', 'ห้องประชุม'), zone('Z3', 'ห้องน้ำ')],
  mixed: () => [zone('Z0', 'ห้องเก็บของ', cutLine), zone('Z1', 'ล็อบบี้'), zone('Z2', 'ห้องประชุม', { ...drawn, spots: SPOTS }), zone('Z3', 'ห้องน้ำ', drawn)],
  // จากแบบทั้งใบ — แถวที่ตัดยังเป็นลงหน้างาน (ยังไม่ถูกทำให้ตาม)
  desk: () => [zone('Z0', 'ห้องเก็บของ', cutLine), zone('Z1', 'ล็อบบี้', { ...drawn, spots: SPOTS }), zone('Z2', 'ห้องประชุม', drawn), zone('Z3', 'ห้องน้ำ', drawn)],
};
const visitRow = (status, over = {}) => ({
  id: 'V1', requestId: 'RQ1', code: 'SV-26100011', kind: 'survey', status, scheduledDate: '2026-10-13', startTime: '10:00:00',
  assigneeId: 'U-TECH', assigneeName: 'Phuwadol Aoonnankad', assistantIds: ['U-AST'], createdAt: '2026-10-08T01:00:00+00:00', ...over,
});
/* แบบที่ฝ่ายขายแนบมากับคำร้อง — เก็บเป็นชนิด "อื่น ๆ" เหมือนใบจริงก่อนมีฟอร์มรุ่นใหม่ */
const drawingFile = (over = {}) => ({
  id: 'ATT-1', entityType: 'dept_request', entityId: 'RQ1', docType: 'other', fileName: 'แบบชั้น 12.pdf',
  fileUrl: 'https://files.example.test/a.pdf', metadata: {}, createdAt: '2026-10-01T00:00:00+00:00', ...over,
});
const world = ({ zones = SHEETS.onsite(), visits = [visitRow('scheduled')], req = requestRow(), files = [drawingFile()], updates = [] } = {}) => fakeDb({
  dept_requests: [req],
  service_survey_zones: zones,
  service_visits: visits,
  attachments: files,
  entity_updates: updates,
  notifications: [],
  audit_logs: [],
});

const toDrawing = (...ids) => ids.map((zoneId) => ({ zoneId, method: 'drawing' }));
const toOnsite = (...ids) => ids.map((zoneId) => ({ zoneId, method: 'onsite' }));
const mixOf = (db) => {
  const { onsite, drawing } = surveyMethodMix(db.tables.service_survey_zones);
  return { onsite, drawing };
};
/* body ของการกดหนึ่งครั้ง — `seenMix` ถ่ายจากแถวตอนสร้าง (= ตอนโมดัลเปิด) · กดซ้ำต้องส่งออบเจ็กต์เดิม ไม่สร้างใหม่ */
const bodyFor = (db, over = {}) => ({ actionId: ACTION.a, changes: [], reason: REASON, seenMix: mixOf(db), ...over });

/* กระดิ่งยิงแบบไม่รอ (`after` นอก request scope = ยิงทันทีแบบ async) — รอให้คิวว่างก่อนอ่านตาราง */
const settle = async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
/* กลืน console.error ระหว่างรัน แล้วคืนสิ่งที่ถูก log */
async function quiet(fn) {
  const logged = [];
  const original = console.error;
  console.error = (...args) => { logged.push(args.map(String).join(' ')); };
  try {
    return { value: await fn(), logged };
  } finally {
    console.error = original;
  }
}
const post = async (db, body, user = head) => {
  const { value } = await quiet(async () => {
    const out = await callRoute(POST, {
      user, db, method: 'POST', path: '/api/service/surveys/RQ1/method', params: { id: 'RQ1' }, body,
    });
    await settle();
    return out;
  });
  return value;
};

/* ตั้งสวิตช์ระหว่างเทสต์ตัวนั้น แล้วคืนค่าเดิมเสมอ · `UNSET` = ไม่มีตัวแปรนี้เลย (สภาพของ production วันนี้) */
const UNSET = Symbol('unset');
const flagged = (fn, value = 'on') => async (t) => {
  const before = process.env.SURVEY_DRAWING_METHOD;
  if (value === UNSET) delete process.env.SURVEY_DRAWING_METHOD;
  else process.env.SURVEY_DRAWING_METHOD = value;
  clock(0);
  try {
    await fn(t);
  } finally {
    if (before === undefined) delete process.env.SURVEY_DRAWING_METHOD;
    else process.env.SURVEY_DRAWING_METHOD = before;
  }
};

const CREW_KIND = 'survey_method_changed';
const HEAD_KIND = 'survey_desk_ready';
const bellRows = (db) => db.tables.notifications.filter((n) => n.kind === CREW_KIND || n.kind === HEAD_KIND);
const bellSends = (db, kind) => db.calls.filter((c) => c.table === 'notifications' && c.op === 'upsert' && firstRow(c).kind === kind);
/* กระดิ่งของการสลับแบบย่อ — `{ crew: 'cancel' | 'zones' | null, head: boolean }` */
const bellsOf = (db) => {
  const crew = bellRows(db).find((n) => n.kind === CREW_KIND);
  let kind = null;
  if (crew) kind = crew.title.startsWith('ยกเลิกนัด') ? 'cancel' : 'zones';
  return { crew: kind, head: bellRows(db).some((n) => n.kind === HEAD_KIND) };
};
const threadRows = (db, entityType = 'dept_request') => db.tables.entity_updates
  .filter((u) => u.entityType === entityType && (entityType !== 'dept_request' || u.kind === 'method'));
const rowOf = (db, id) => db.tables.service_survey_zones.find((r) => r.id === id);

/* สถานะที่คนเห็น — ไม่รวมเวลาที่ต่างกันทุกรอบโดยธรรมชาติ (`updatedAt` ของใบ · เวลาและ id ของบรรทัดเธรด / กระดิ่ง) */
function visible(db) {
  const t = db.tables;
  const r = t.dept_requests[0];
  return {
    zones: t.service_survey_zones.map(({ id, status, method, methodReason, methodChangedByName, methodChangedAt, spots }) => (
      { id, status, method, methodReason, methodChangedByName, methodChangedAt, spots })),
    visits: t.service_visits.map(({ id, status }) => ({ id, status })),
    request: {
      committedDueDate: r.committedDueDate, committedDueTime: r.committedDueTime, committedResultDate: r.committedResultDate,
      assigneeId: r.assigneeId, assigneeName: r.assigneeName, dueCommittedAt: r.dueCommittedAt ?? null, answeredAt: r.answeredAt,
    },
    thread: threadRows(db).map(({ kind, body, meta }) => ({ kind, body, meta })),
    visitLines: threadRows(db, 'service_visit').map(({ kind, body, meta }) => ({ kind, body, meta })),
    bells: bellRows(db).map(({ userId, kind, title, updateId, href }) => ({ userId, kind, title, updateId, href }))
      .sort((a, b) => `${a.kind}${a.userId}`.localeCompare(`${b.kind}${b.userId}`)),
  };
}

/* คำขอที่ถูกตีกลับก่อนขั้นเขียนแรก: สถานะและข้อความตรงตัว · ไม่มีคำสั่งเขียนสักคำสั่ง · ไม่มีกระดิ่ง */
async function refused(db, body, status, error, user = head) {
  const before = clone(db.tables);
  const out = await post(db, body, user);
  assert.equal(out.json.error, error);
  assert.equal(out.status, status);
  assert.deepEqual(writesOf(db), [], 'ต้องไม่มีคำสั่งเขียน');
  assert.deepEqual(db.tables, before, 'ตารางต้องเหมือนเดิมทุกแถว');
  return out;
}

/* ═══ ด่าน ① ② — สิทธิ์ แล้วค่อยสวิตช์ · ทั้งคู่ก่อนแตะฐาน ═══════════════════════════════════════ */

test('ด่าน ①: ช่าง · ผู้จัดคิว · ฝ่ายขาย ได้ 403 ก่อนถามสวิตช์และก่อนแตะฐาน — ไม่ว่าสวิตช์เปิดหรือปิด', async () => {
  const others = [
    { id: 'U-TECH', name: 'ช่างเอ', role: 'ts', department: 'TS' },
    { id: 'U-PLAN', name: 'ผู้จัดคิว', role: 'ts_planner', department: 'TS' },
    { id: 'U-AE', name: 'เซลเอ', role: 'ae', department: 'SA' },
    null,
  ];
  for (const value of ['on', UNSET]) {
    await flagged(async () => {
      for (const user of others) {
        const db = world();
        await refused(db, bodyFor(db, { changes: toDrawing('Z3') }), 403, T.role, user);
        assert.equal(db.calls.length, 0, `${user?.role}: ต้องไม่แตะฐานเลย`);
      }
    }, value)();
  }
});

for (const value of [UNSET, '', 'off', '1', 'true', 'yes']) {
  test(`ด่าน ②: สวิตช์ ${value === UNSET ? 'ไม่ได้ตั้ง' : JSON.stringify(value)} = ปิด — หัวหน้าได้ 409 และ route ไม่อ่านอะไรเลย`, flagged(async () => {
    const db = world();
    await refused(db, bodyFor(db, { changes: toDrawing('Z3') }), 409, T.off);
    assert.equal(db.calls.length, 0, 'สวิตช์ปิด = ไม่มีคำสั่งไปถึงฐานสักคำสั่ง (รวมการอ่านใบ)');
  }, value));
}

/* ═══ ด่าน ③ ④ ⑤ — ใบประเมินของฝ่ายเรา ที่รับเรื่องแล้วและยังไม่ส่งผล ═════════════════════════════ */

test('ด่าน ③: ไม่มีใบ / ไม่ใช่ใบประเมินพื้นที่ = 404 ข้อความเดียวกัน · ไม่อ่านแถวพื้นที่', flagged(async () => {
  const none = world();
  none.tables.dept_requests = [];
  await refused(none, { actionId: ACTION.a, changes: [], reason: REASON, seenMix: { onsite: 3, drawing: 0 } }, 404, T.notFound);

  const other = world({ req: requestRow({ kind: 'sample' }) });
  await refused(other, bodyFor(other, { changes: toDrawing('Z3') }), 404, T.notFound);
  assert.equal(other.calls.length, 1, 'อ่านใบแล้วจบ');
}));

test('ด่าน ④: ใบที่ไม่ได้ส่งถึงฝ่ายของคนกด = 403 พร้อมชื่อฝ่ายของใบ', flagged(async () => {
  const db = world({ req: requestRow({ dept: 'RD' }) });
  await refused(db, bodyFor(db, { changes: toDrawing('Z3') }), 403, 'ตอบได้เฉพาะฝ่าย RD');
  assert.equal(db.calls.length, 1);

  // CD/CM (มติ 24/09 "สิทธิ์ TS manager") และแอดมิน ตอบใบของฝ่าย TS ได้ ⇒ สลับวิธีได้เหมือนหัวหน้าฝ่าย
  for (const user of [
    { id: 'U-CM', name: 'ผู้จัดการ', role: 'commercial_manager', department: 'SA' },
    { id: 'U-CD', name: 'ผู้อำนวยการ', role: 'commercial_director', department: 'SA' },
    { id: 'U-ADM', name: 'แอดมิน', role: 'admin', department: 'IT' },
  ]) {
    const ts = world();
    const out = await post(ts, bodyFor(ts, { changes: toDrawing('Z3') }), user);
    assert.equal(out.status, 200, `${user.role}: ${out.json.error}`);
    assert.equal(rowOf(ts, 'Z3').methodChangedByName, user.name);
    assert.equal(threadRows(ts)[0].meta.key, keyOf(ACTION.a, user));
  }
}));

test('ด่าน ⑤: ส่งผลแล้ว · ยกเลิก · ปิดโดยไม่ได้ผล · ยังไม่รับเรื่อง = 409 ข้อความของแต่ละสภาพ · ไม่อ่านอะไรต่อ', flagged(async () => {
  const states = [
    [{ answeredAt: '2026-10-08T05:00:00+00:00', status: 'answered' }, T.sent],
    [{ answeredAt: '2026-10-08T05:00:00+00:00', cancelledAt: '2026-10-08T06:00:00+00:00' }, T.sent],
    [{ cancelledAt: '2026-10-08T06:00:00+00:00', status: 'cancelled' }, T.cancelled],
    [{ status: 'closed', closedAt: '2026-10-08T06:00:00+00:00' }, T.closed],
    [{ status: 'pending', acknowledgedAt: null }, T.notAcknowledged],
    [{ status: 'draft', acknowledgedAt: null }, T.notAcknowledged],
    [{ status: 'acknowledged', acknowledgedAt: null }, T.notAcknowledged],
  ];
  for (const [over, error] of states) {
    const db = world({ req: requestRow(over) });
    await refused(db, bodyFor(db, { changes: toDrawing('Z3') }), 409, error);
    assert.equal(db.calls.length, 1, `${error}: อ่านใบแล้วจบ`);
  }
}));

/* ═══ ด่าน ⑥ — รูปของ body ═══════════════════════════════════════════════════════════════ */

test('ด่าน ⑥: actionId · changes · seenMix · cancelVisitId ผิดรูป = 400 ข้อความเดียว · ไม่อ่านแถวพื้นที่', flagged(async () => {
  const good = { actionId: ACTION.a, changes: toDrawing('Z3'), reason: REASON, seenMix: { onsite: 3, drawing: 0 } };
  const bad = {
    'ไม่มี actionId': { ...good, actionId: undefined },
    'actionId ว่าง': { ...good, actionId: '' },
    'actionId สั้นกว่า 8': { ...good, actionId: 'abc1234' },
    'actionId ยาวกว่า 64': { ...good, actionId: 'a'.repeat(65) },
    'actionId มีช่องว่าง': { ...good, actionId: 'abcd efgh' },
    'actionId เป็นตัวเลข': { ...good, actionId: 1234567890 },
    'ไม่มี changes': { ...good, changes: undefined },
    'changes ไม่ใช่อาร์เรย์': { ...good, changes: { zoneId: 'Z3', method: 'drawing' } },
    'method ไม่รู้จัก': { ...good, changes: [{ zoneId: 'Z3', method: 'desk' }] },
    'method ตัวพิมพ์ใหญ่': { ...good, changes: [{ zoneId: 'Z3', method: 'Drawing' }] },
    'พื้นที่เดียวมาสองครั้ง': { ...good, changes: [...toDrawing('Z3'), ...toOnsite('Z3')] },
    'ไม่มี zoneId': { ...good, changes: [{ method: 'drawing' }] },
    'ไม่มี seenMix': { ...good, seenMix: undefined },
    'seenMix เป็นสตริง': { ...good, seenMix: { onsite: '3', drawing: '0' } },
    'seenMix ขาด drawing': { ...good, seenMix: { onsite: 3 } },
    'seenMix ติดลบ': { ...good, seenMix: { onsite: -1, drawing: 0 } },
    'seenMix เป็นอาร์เรย์': { ...good, seenMix: [3, 0] },
    'cancelVisitId เป็นออบเจ็กต์': { ...good, cancelVisitId: { id: 'V1' } },
  };
  for (const [name, body] of Object.entries(bad)) {
    const db = world();
    await refused(db, body, 400, T.body);
    assert.equal(db.calls.length, 1, `${name}: อ่านใบแล้วจบ`);
  }
  // body ที่ไม่ใช่ JSON / ไม่ใช่ออบเจ็กต์ ก็ได้คำตอบเดียวกัน
  for (const body of [[], 'x', 5, null]) {
    const db = world();
    await refused(db, body, 400, T.body);
  }
}));

/* ═══ ด่าน ⑦ — ล้าสมัย: แถวไม่ตรงกับที่โมดัลเห็น ══════════════════════════════════════════════ */

test('ด่าน ⑦: พื้นที่ไม่มีอยู่ · ถูกตัดไปแล้ว · คนอื่นสลับไปแล้ว · จำนวนที่โมดัลเห็นไม่ตรง · โมดัลพูดถึงนัดอีกใบ = 409 ล้าสมัย', flagged(async () => {
  const cases = {
    'ไม่รู้จักพื้นที่': [world(), (db) => bodyFor(db, { changes: toDrawing('Z9') })],
    'พื้นที่ถูกตัดไปแล้ว': [world(), (db) => bodyFor(db, { changes: toDrawing('Z0') })],
    'คนอื่นสลับเป็นจากแบบไปแล้ว (เหตุผล/คนสลับไม่ใช่ของการกดนี้)': [
      world({ zones: SHEETS.mixed() }), (db) => bodyFor(db, { changes: toDrawing('Z3'), seenMix: { onsite: 2, drawing: 1 } }),
    ],
    'อีกจอเพิ่มพื้นที่ระหว่างที่กล่องเปิดอยู่ (seenMix มากไป)': [world(), (db) => bodyFor(db, { changes: toDrawing('Z3'), seenMix: { onsite: 2, drawing: 0 } })],
    'อีกจอสลับพื้นที่อื่น (seenMix คนละส่วนผสม)': [world({ zones: SHEETS.mixed() }), (db) => bodyFor(db, { changes: toOnsite('Z2'), seenMix: { onsite: 2, drawing: 1 } })],
    'โมดัลบอกนัดอีกใบ ทั้งที่นัดที่เปิดอยู่คือ V1': [
      world(), (db) => bodyFor(db, { changes: toDrawing('Z1', 'Z2', 'Z3'), committedResultDate: DATE, cancelVisitId: 'V-OLD' }),
    ],
  };
  for (const [name, [db, make]] of Object.entries(cases)) {
    await refused(db, make(db), 409, T.stale);
    assert.ok(db.calls.some(M.zonesRead), `${name}: ต้องอ่านแถวจริงก่อนตอบ`);
  }
  // ลำดับ: "ล้าสมัย" (⑦) มาก่อนด่านช่องกรอก (⑨) — กล่องที่ไม่ใช่ของใบนี้แล้ว ไม่ควรถูกบอกให้แก้เหตุผล
  for (const over of [
    { changes: toDrawing('Z1', 'Z2', 'Z3'), reason: 'สั้น', cancelVisitId: 'V-OLD' },   // โมดัลพูดถึงนัดอีกใบ
    { changes: toDrawing('Z9'), reason: 'สั้น' },                                        // ไม่รู้จักพื้นที่
    { changes: toDrawing('Z3'), reason: 'สั้น', seenMix: { onsite: 1, drawing: 2 } },    // จำนวนไม่ตรง
  ]) {
    const db = world();
    await refused(db, bodyFor(db, over), 409, T.stale);
  }
}));

/* ═══ ด่าน ⑧ ⑨ ⑩ ════════════════════════════════════════════════════════════════════════ */

test('ด่าน ⑧: ไม่มีพื้นที่ไหนเปลี่ยน และไม่มีนัดให้ยกเลิก = 409', flagged(async () => {
  // ใบยังต้องมีนัด — `changes: []` ไม่ใช่การยกเลิกนัดอย่างเดียว
  const mixed = world({ zones: SHEETS.mixed() });
  await refused(mixed, bodyFor(mixed), 409, T.nothing);
  // ใบงานโต๊ะที่ไม่มีนัดค้าง
  const desk = world({ zones: SHEETS.desk(), visits: [], req: deskRequest() });
  await refused(desk, bodyFor(desk, { reason: SURVEY_METHOD_CANCEL_ONLY_REASON }), 409, T.nothing);
  // ลำดับ: "ไม่มีอะไรให้ทำ" (⑧) มาก่อนด่านนัด (⑩) และก่อนด่านช่องกรอก (⑨) — แม้ body จะเอ่ยถึงนัดที่เปิดอยู่และไม่มีเหตุผล
  const named = world({ zones: SHEETS.mixed() });
  await refused(named, bodyFor(named, { cancelVisitId: 'V1', reason: '' }), 409, T.nothing);
}));

test('ด่าน ⑨: เหตุผลสั้น / ยาวเกิน · วันส่งผลไม่กรอก / ผิดรูป = 400 ตามลำดับ · วันถามเฉพาะตอนใบพลิกเป็นงานโต๊ะ', flagged(async () => {
  const whole = { changes: toDrawing('Z1', 'Z2', 'Z3'), cancelVisitId: 'V1' };
  const cases = [
    [{ changes: toDrawing('Z3'), reason: '123456789' }, T.reason],
    [{ changes: toDrawing('Z3'), reason: '   สั้นไป   ' }, T.reason],
    [{ changes: toDrawing('Z3'), reason: undefined }, T.reason],
    [{ changes: toDrawing('Z3'), reason: { text: 'ไม่ใช่ข้อความ ไม่ใช่ข้อความ' } }, T.reason],
    [{ changes: toDrawing('Z3'), reason: 'ก'.repeat(301) }, T.reasonLong],
    [{ ...whole, reason: 'สั้น' }, T.reason],                       // เหตุผลมาก่อนวัน
    [{ ...whole }, T.resultDate],
    [{ ...whole, committedResultDate: '' }, T.resultDate],
    [{ ...whole, committedResultDate: '12/10/2026' }, T.resultDateBad],
    [{ ...whole, committedResultDate: 20261012 }, T.resultDate],     // ไม่ใช่สตริง = ไม่ได้กรอก
    // ลำดับ: ช่องกรอก (⑨) มาก่อนด่านนัด (⑩) — โมดัลที่ไม่ได้บอกว่าจะยกเลิกนัด ยังได้คำตอบเรื่องช่องกรอกก่อน
    [{ changes: toDrawing('Z1', 'Z2', 'Z3'), reason: 'สั้น' }, T.reason],
    [{ changes: toDrawing('Z1', 'Z2', 'Z3') }, T.resultDate],
  ];
  for (const [over, error] of cases) {
    const db = world();
    await refused(db, bodyFor(db, over), 400, error);
  }
  // ขอบของเหตุผล: 10 และ 300 ตัวอักษรผ่าน · ใบยังผสม ไม่ถามวัน
  for (const reason of ['1234567890', 'ก'.repeat(300)]) {
    const db = world();
    const out = await post(db, bodyFor(db, { changes: toDrawing('Z3'), reason }));
    assert.equal(out.status, 200, out.json.error);
    assert.equal(rowOf(db, 'Z3').methodReason, reason);
  }
}));

test('ด่าน ⑩: แผนยกเลิกนัดแต่โมดัลไม่ได้บอก · โมดัลบอกว่าจะยกเลิกแต่ช่างกดเริ่มงานไปแล้ว = 409 ล้าสมัย', flagged(async () => {
  // ทั้งใบเป็นจากแบบ + นัดไว้: โมดัลรุ่นที่เปิดก่อนมีนัด ไม่ได้บอกว่าจะยกเลิกนัด
  const unsaid = world();
  await refused(unsaid, bodyFor(unsaid, { changes: toDrawing('Z1', 'Z2', 'Z3'), committedResultDate: DATE }), 409, T.stale);

  // โมดัลบอกว่าจะยกเลิก V1 แต่ช่างกด "เริ่มงาน" ไปแล้ว — แผนไม่ยกเลิก (keep-open)
  const started = world({ visits: [visitRow('in_progress')] });
  await refused(started, bodyFor(started, { changes: toDrawing('Z1', 'Z2', 'Z3'), committedResultDate: DATE, cancelVisitId: 'V1' }), 409, T.stale);

  // ใบยังผสม นัดยังอยู่: โมดัลที่บอกว่าจะยกเลิกนัด = ไม่ใช่กล่องของใบนี้แล้ว
  const stays = world();
  await refused(stays, bodyFor(stays, { changes: toDrawing('Z3'), cancelVisitId: 'V1' }), 409, T.stale);
}));

/* ═══ ด่าน ⑪ — การอ่านที่พัง = 500 และยังไม่มีอะไรถูกเขียน ═════════════════════════════════════ */

test('ด่าน ⑪: อ่านใบ · แถวพื้นที่ · เรื่องส่งกลับ · นัดที่เปิดอยู่ · นัดล่าสุด ไม่สำเร็จ = 500 พร้อมข้อความของฐาน · ไม่เขียนอะไร', flagged(async () => {
  for (const name of ['requestRead', 'zonesRead', 'sendBackRead', 'openVisitRead']) {
    const db = world();
    db.failOn(M[name]);
    await refused(db, bodyFor(db, { changes: toDrawing('Z3') }), 500, DB_DOWN);
  }
  // ไม่มีนัดค้าง และ body ไม่เอ่ยถึงนัด ⇒ route อ่านนัดล่าสุด
  const latest = world({ visits: [visitRow('done')] });
  latest.failOn(M.latestVisitRead);
  await refused(latest, bodyFor(latest, { changes: toDrawing('Z3') }), 500, DB_DOWN);
}));

/* ═══ ทุกสถานะของนัด × ทุกทิศ (§4.4) — ขั้นที่เขียนจริงเทียบกับตาราง ═════════════════════════════ */

const VISIT_STATES = [null, 'draft', 'scheduled', 'in_progress', 'done', 'partial', 'unable', 'cancelled', 'rescheduled'];
const CANCELLABLE = ['draft', 'scheduled'];
const OPEN = ['draft', 'scheduled', 'in_progress'];
const liveCrew = (v) => v === 'scheduled' || v === 'in_progress';
const CANCEL_STEPS = ['2', '2-line', '2-audit'];
const DIRECTIONS = {
  'เป็นจากแบบ ใบยังผสม': {
    seed: () => ({ zones: SHEETS.onsite() }),
    body: () => ({ changes: toDrawing('Z3') }),
    steps: () => ['1', '3a', '4', '5', '6'],
    plan: (v) => ({ kind: 'switch', flip: null, visitAction: liveCrew(v) ? 'stays' : 'none' }),
    bells: (v) => ({ crew: liveCrew(v) ? 'zones' : null, head: false }),
    visitAfter: (v) => v,
  },
  'พื้นที่สุดท้ายเป็นจากแบบ (ใบพลิกเป็นงานโต๊ะ)': {
    seed: () => ({ zones: SHEETS.onsite() }),
    body: (v) => ({ changes: toDrawing('Z1', 'Z2', 'Z3'), committedResultDate: DATE, ...(CANCELLABLE.includes(v) ? { cancelVisitId: 'V1' } : {}) }),
    steps: (v) => ['1', ...(CANCELLABLE.includes(v) ? CANCEL_STEPS : []), '3a', '3c', '4(set)', '5', '6'],
    plan: (v) => {
      let visitAction = 'history';
      if (!v) visitAction = 'none';
      else if (CANCELLABLE.includes(v)) visitAction = 'cancel';
      else if (v === 'in_progress') visitAction = 'keep-open';
      return { kind: 'switch', flip: 'to-desk', visitAction };
    },
    bells: (v) => {
      let crew = null;
      if (CANCELLABLE.includes(v)) crew = 'cancel';
      else if (v === 'in_progress') crew = 'zones';
      return { crew, head: true };
    },
    visitAfter: (v) => (CANCELLABLE.includes(v) ? 'cancelled' : v),
  },
  'กลับเป็นลงหน้างาน ใบยังผสม': {
    seed: () => ({ zones: SHEETS.mixed() }),
    body: () => ({ changes: toOnsite('Z2') }),
    steps: () => ['1', '3b', '4', '5', '6'],
    plan: (v) => ({ kind: 'switch', flip: null, visitAction: liveCrew(v) ? 'stays' : 'none' }),
    bells: () => ({ crew: null, head: false }),
    visitAfter: (v) => v,
  },
  'พื้นที่แรกกลับเป็นลงหน้างาน (ใบกลับมาต้องมีนัด)': {
    seed: () => ({ zones: SHEETS.desk(), req: deskRequest() }),
    body: () => ({ changes: toOnsite('Z1') }),
    steps: (v) => ['1', '3b', OPEN.includes(v) ? '4(sync)' : '4(clear)', '5', '6'],
    plan: () => ({ kind: 'switch', flip: 'to-visit', visitAction: 'none' }),
    bells: () => ({ crew: null, head: false }),
    visitAfter: (v) => v,
  },
  'ยกเลิกนัดอย่างเดียว': {
    seed: () => ({ zones: SHEETS.desk(), req: deskRequest() }),
    body: (v) => ({ changes: [], reason: SURVEY_METHOD_CANCEL_ONLY_REASON, ...(CANCELLABLE.includes(v) ? { cancelVisitId: 'V1' } : {}) }),
    steps: (v) => (CANCELLABLE.includes(v) ? ['1', ...CANCEL_STEPS, '3c', '4', '5', '6'] : null),
    plan: () => ({ kind: 'cancel-only', flip: null, visitAction: 'cancel' }),
    bells: () => ({ crew: 'cancel', head: false }),
    visitAfter: () => 'cancelled',
  },
};

for (const [name, dir] of Object.entries(DIRECTIONS)) {
  test(`§4.4 ${name} × สถานะนัดเก้าแบบ: ขั้นที่เขียนตรงตาราง · กระดิ่งตรงแผน · คำตอบพกแถวสด`, flagged(async () => {
    for (const v of VISIT_STATES) {
      const label = `นัด ${v || 'ไม่มี'}`;
      const db = world({ ...dir.seed(), visits: v ? [visitRow(v)] : [] });
      const body = bodyFor(db, dir.body(v));
      const want = dir.steps(v);
      if (!want) {
        await refused(db, body, 409, T.nothing);
        continue;
      }
      const out = await post(db, body);
      assert.equal(out.status, 200, `${label}: ${out.json.error}`);
      assert.deepEqual(stepsOf(db), want, label);
      assert.deepEqual(out.json.plan, dir.plan(v), label);
      assert.equal(out.json.ok, true);
      assert.equal(out.json.already, false);
      assert.deepEqual(bellsOf(db), dir.bells(v), label);
      assert.equal(db.tables.service_visits[0]?.status ?? null, dir.visitAfter(v), `${label}: สถานะนัดหลังสลับ`);
      assert.equal(threadRows(db).length, 1, `${label}: เธรดของใบหนึ่งบรรทัด`);
      // คำตอบ = แถวสดหลังเขียน (จอวาดต่อได้โดยไม่เดา)
      assert.deepEqual(out.json.zones.map((z) => [z.id, z.method]), db.tables.service_survey_zones.map((z) => [z.id, z.method]), label);
      assert.equal(out.json.request.updatedAt, db.tables.dept_requests[0].updatedAt, label);
      // 🔴 เส้นนี้ไม่เขียนผลวัด ตราผู้วัด หรือสถานะของแถว — เฉพาะคอลัมน์วิธี (+ จุดที่ถูกปลดเลือก)
      for (const call of db.calls.filter((c) => c.table === 'service_survey_zones' && c.op === 'update')) {
        for (const col of Object.keys(call.patch)) {
          assert.ok(['method', 'methodReason', 'methodChangedAt', 'methodChangedByName', 'updatedAt', 'spots'].includes(col), `${label}: ${col}`);
        }
      }
    }
  }));
}

/* ═══ เส้นปกติ — ของที่ลงฐานตรงกับที่กล่องผลลัพธ์บอก ════════════════════════════════════════════ */

test('ทั้งใบเป็นจากแบบ + นัดไว้: นัดถูกยกเลิก · วันบนใบเป็นวันส่งผล · เธรดหนึ่งบรรทัด · กระดิ่งช่างและหัวหน้าอีกคน', flagged(async () => {
  const db = world();
  const body = bodyFor(db, { changes: toDrawing('Z1', 'Z2', 'Z3'), committedResultDate: DATE, cancelVisitId: 'V1' });
  const out = await post(db, body);
  assert.equal(out.status, 200, out.json.error);
  assert.deepEqual(Object.keys(out.json), ['ok', 'already', 'plan', 'zones', 'request']);
  assert.deepEqual(out.json.plan, { kind: 'switch', flip: 'to-desk', visitAction: 'cancel' });

  const KEY = keyOf(ACTION.a);
  const thread = 'เปลี่ยนวิธีประเมินเป็น “ประเมินจากแบบ” 3 พื้นที่ (ล็อบบี้ · ห้องประชุม · ห้องน้ำ) — หน้างานยังก่อสร้าง ถึงสิ้นเดือน'
    + ' · ยกเลิกนัด SV-26100011 · ส่งผล 12/10/2026';
  const state = visible(db);
  const stamp = { method: 'drawing', methodReason: REASON, methodChangedByName: 'หัวหน้า ก', methodChangedAt: NOW, spots: [] };
  assert.deepEqual(state.zones, [
    // แถวที่ตัดไปแล้วตามไปเป็นจากแบบ (ขั้น 3c) — ไม่ได้ตราเหตุผล เพราะไม่ใช่พื้นที่ที่หัวหน้าเลือก
    { id: 'Z0', status: 'cut', method: 'drawing', methodReason: undefined, methodChangedByName: undefined, methodChangedAt: undefined, spots: [] },
    { id: 'Z1', status: 'ok', ...stamp },
    { id: 'Z2', status: 'ok', ...stamp },
    { id: 'Z3', status: 'ok', ...stamp },
  ]);
  assert.deepEqual(state.visits, [{ id: 'V1', status: 'cancelled' }]);
  assert.deepEqual(state.request, {
    committedDueDate: DATE, committedDueTime: null, committedResultDate: DATE,
    assigneeId: 'U-HEAD', assigneeName: 'หัวหน้า ก', dueCommittedAt: NOW, answeredAt: null,
  });
  assert.deepEqual(state.thread, [{
    kind: 'method',
    body: thread,
    meta: { key: KEY, kind: 'switch', flip: 'to-desk', toDrawing: ['Z1', 'Z2', 'Z3'], toOnsite: [], cancelledVisitId: 'V1', resultDate: DATE },
  }]);
  assert.deepEqual(state.visitLines, [{ kind: 'cancel', body: `เปลี่ยนเป็นประเมินจากแบบ: ${REASON}`, meta: { methodKey: KEY } }]);
  const crewBell = { kind: CREW_KIND, title: 'ยกเลิกนัด SV-26100011 — ใบนี้เปลี่ยนเป็นประเมินจากแบบ', updateId: `survey-method:RQ1:${KEY}`, href: '/service/surveys/RQ1' };
  assert.deepEqual(state.bells, [
    { userId: 'U-HEAD2', kind: HEAD_KIND, title: 'คำร้องประเมินจากแบบ RQ-AS-26100312 — รอหัวหน้าประเมิน', updateId: `survey-desk-ready:RQ1:${KEY}`, href: '/service/surveys/RQ1?tab=result' },
    { userId: 'U-AST', ...crewBell },
    { userId: 'U-TECH', ...crewBell },
  ]);

  // สองคำสั่งบนใบ: แตะก่อน (เวลาของคำขอ) · แตะปิดท้ายพร้อมวัน (เวลาที่ต่างออกไป) — ทั้งคู่มีเงื่อนไข "ยังไม่ส่งผล"
  const [touch1, touch2] = db.calls.filter(M.touch);
  assert.deepEqual(touch1.patch, { updatedAt: NOW });
  assert.notEqual(touch2.patch.updatedAt, NOW);
  // 🔑 ขั้น 1 จองด้วยรุ่นของใบที่ route อ่าน (หัวหน้าสองคนพร้อมกันผ่านได้คนเดียว) · แตะปิดท้ายผูกแค่ "ยังไม่ส่งผล"
  assert.deepEqual(touch1.where, [['eq', 'id', 'RQ1'], ['is', 'answeredAt', null], ['eq', 'updatedAt', '2026-10-08T00:00:00+00:00']]);
  assert.deepEqual(touch2.where, [['eq', 'id', 'RQ1'], ['is', 'answeredAt', null]]);
  assert.equal(out.json.request.updatedAt, touch2.patch.updatedAt);

  const audits = db.tables.audit_logs;
  assert.deepEqual(audits.map((a) => a.entityType), ['service_visit', 'dept_request']);
  assert.equal(audits[1].summary, `RQ-AS-26100312 · ${thread}`);
  assert.equal(audits[1].actorId, 'U-HEAD');
  assert.equal(audits[1].before.committedResultDate, '2026-10-15');
  assert.equal(audits[1].after.committedResultDate, DATE);
}));

test('ช่างกดเริ่มงานแล้ว + พื้นที่ลงหน้างานสุดท้ายเป็นจากแบบ: 200 · แถวนัดไม่ถูกแตะ · ช่างได้กระดิ่งว่าไม่ต้องวัด', flagged(async () => {
  const db = world({ zones: SHEETS.mixed(), visits: [visitRow('in_progress')] });
  const visitBefore = clone(db.tables.service_visits[0]);
  const out = await post(db, bodyFor(db, { changes: toDrawing('Z1'), committedResultDate: DATE }));
  assert.equal(out.status, 200, out.json.error);
  assert.deepEqual(out.json.plan, { kind: 'switch', flip: 'to-desk', visitAction: 'keep-open' });
  assert.deepEqual(db.tables.service_visits[0], visitBefore, 'นัดที่กำลังทำไม่ถูกยกเลิกและไม่ถูกแก้');
  assert.equal(db.calls.filter((c) => c.table === 'service_visits' && c.op !== 'select').length, 0);
  assert.deepEqual(threadRows(db, 'service_visit'), [], 'ไม่มีบรรทัดยกเลิกบนเธรดของนัด');
  assert.equal(threadRows(db)[0].body, `เปลี่ยนวิธีประเมินเป็น “ประเมินจากแบบ” 1 พื้นที่ (ล็อบบี้) — ${REASON} · ส่งผล 12/10/2026`);
  assert.equal(threadRows(db)[0].meta.cancelledVisitId, null);
  const crew = bellRows(db).filter((n) => n.kind === CREW_KIND);
  assert.deepEqual(crew.map((n) => n.userId).sort(), ['U-AST', 'U-TECH']);
  assert.equal(crew[0].title, 'หัวหน้าเปลี่ยน “ล็อบบี้” เป็นประเมินจากแบบ — ไม่ต้องวัดพื้นที่นี้');
  assert.equal(crew[0].body, `RQ-AS-26100312 ประเมินพื้นที่ชั้น 12 — ${REASON}`);
}));

test('กลับเป็นลงหน้างาน: จุดถูกปลดเลือกครบทุกจุด (จำนวนเท่าเดิม) · ไม่มีคำสั่งไหนเขียนตราผู้วัด · ไม่มีกระดิ่ง', flagged(async () => {
  const db = world({ zones: SHEETS.desk(), visits: [], req: deskRequest() });
  const out = await post(db, bodyFor(db, { changes: toOnsite('Z1') }));
  assert.equal(out.status, 200, out.json.error);
  assert.deepEqual(out.json.plan, { kind: 'switch', flip: 'to-visit', visitAction: 'none' });

  const [write] = db.calls.filter(M.toOnsite);
  assert.deepEqual(write.patch, {
    method: 'onsite', methodReason: REASON, methodChangedAt: NOW, methodChangedByName: 'หัวหน้า ก',
    spots: [{ id: 's1', selected: false, x: 0.2, y: 0.4 }, { id: 's2', selected: false, x: 0.6, y: 0.1 }], updatedAt: NOW,
  });
  assert.deepEqual(write.where, [
    ['eq', 'id', 'Z1'], ['eq', 'requestId', 'RQ1'], ['eq', 'updatedAt', '2026-10-08T01:00:00+00:00'], ['neq', 'status', 'cut'],
  ]);
  for (const call of writesOf(db)) {
    const payload = JSON.stringify(call.table === 'audit_logs' ? {} : (call.patch || call.rows));
    assert.ok(!/surveyedAt|surveyedById|surveyedByName/.test(payload), `${call.table}.${call.op} เขียนตราผู้วัด`);
  }
  // ใบกลับไป "รอลงคิว": วันทั้งสามถูกล้าง · เธรดบอกฝ่ายขาย
  const [, touch2] = db.calls.filter(M.touch);
  assert.deepEqual({ ...touch2.patch, updatedAt: null }, { committedDueDate: null, committedDueTime: null, committedResultDate: null, updatedAt: null });
  assert.equal(threadRows(db)[0].body,
    `เปลี่ยนวิธีประเมินเป็น “ลงหน้างาน” 1 พื้นที่ (ล็อบบี้) — ${REASON} · ใบกลับไปรอลงคิว · ฝ่ายขายแจ้งวันที่หน้างานเข้าได้ในเธรดนี้`);
  assert.deepEqual(bellRows(db), []);
  assert.equal(rowOf(db, 'Z0').method, 'onsite', 'แถวที่ตัดไม่ถูกแตะเมื่อใบกลับมาต้องมีนัด');
}));

test('กลับเป็นลงหน้างานตอนมีนัดค้าง: วัน เวลา ช่าง ของนัดกลับขึ้นใบ — ไม่มีคีย์วันส่งผลในคำสั่ง (คำสัญญากับฝ่ายขายคงเดิม)', flagged(async () => {
  const running = visitRow('in_progress', { scheduledDate: '2026-10-14', startTime: '09:30:00' });
  const db = world({ zones: SHEETS.desk(), visits: [running], req: deskRequest() });
  const out = await post(db, bodyFor(db, { changes: toOnsite('Z1') }));
  assert.equal(out.status, 200, out.json.error);
  const [, touch2] = db.calls.filter(M.touch);
  assert.deepEqual(Object.keys(touch2.patch), ['committedDueDate', 'committedDueTime', 'assigneeId', 'assigneeName', 'updatedAt']);
  assert.deepEqual({ ...touch2.patch, updatedAt: null }, {
    committedDueDate: '2026-10-14', committedDueTime: '09:30', assigneeId: 'U-TECH', assigneeName: 'Phuwadol Aoonnankad', updatedAt: null,
  });
  assert.equal(db.tables.dept_requests[0].committedResultDate, '2026-10-15');
  assert.equal(threadRows(db)[0].body, `เปลี่ยนวิธีประเมินเป็น “ลงหน้างาน” 1 พื้นที่ (ล็อบบี้) — ${REASON}`, 'ไม่มีท้าย "กลับไปรอลงคิว" — ใบมีนัดอยู่');

  // นัดร่างที่ยังไม่มีช่างและไม่มีเวลา: เวลาเป็น null · ไม่มีคีย์ผู้รับผิดชอบ (ไม่เขียนทับด้วยค่าว่าง)
  const draft = world({
    zones: SHEETS.desk(), req: deskRequest(),
    visits: [visitRow('draft', { startTime: null, assigneeId: null, assigneeName: null, assistantIds: [] })],
  });
  assert.equal((await post(draft, bodyFor(draft, { changes: toOnsite('Z1') }))).status, 200);
  const [, draftTouch] = draft.calls.filter(M.touch);
  assert.deepEqual({ ...draftTouch.patch, updatedAt: null }, { committedDueDate: '2026-10-13', committedDueTime: null, updatedAt: null });
  assert.equal(draft.tables.dept_requests[0].assigneeId, 'U-HEAD2');
}));

test('ยกเลิกนัดอย่างเดียว: ยกเลิกหนึ่งครั้ง + เธรดของใบหนึ่งบรรทัด · ไม่มีนัดให้ยกเลิก = 409 ไม่มีอะไรให้ทำ', flagged(async () => {
  const db = world({ zones: SHEETS.desk(), req: deskRequest() });
  const out = await post(db, bodyFor(db, { reason: SURVEY_METHOD_CANCEL_ONLY_REASON, cancelVisitId: 'V1' }));
  assert.equal(out.status, 200, out.json.error);
  assert.deepEqual(out.json.plan, { kind: 'cancel-only', flip: null, visitAction: 'cancel' });
  assert.equal(effective(db).filter(M.cancel).length, 1);
  assert.deepEqual(threadRows(db).map((u) => u.body), ['ยกเลิกนัด SV-26100011 — ใบนี้ประเมินจากแบบทั้งใบ']);
  assert.deepEqual(threadRows(db, 'service_visit').map((u) => u.body), [`เปลี่ยนเป็นประเมินจากแบบ: ${SURVEY_METHOD_CANCEL_ONLY_REASON}`]);
  assert.equal(rowOf(db, 'Z0').method, 'drawing', 'แถวที่ตัดไปแล้วถูกทำให้ตาม (ขั้น 3c)');
  // วันบนใบไม่ถูกแตะ — เฉพาะ `updatedAt`
  const [, touch2] = db.calls.filter(M.touch);
  assert.deepEqual(Object.keys(touch2.patch), ['updatedAt']);

  // กดใหม่ (เลขใหม่) หลังนัดถูกยกเลิกไปแล้ว — ไม่มีอะไรให้ยกเลิกอีก
  clock(5);
  await refusedAfter(db, bodyFor(db, { actionId: ACTION.b, reason: SURVEY_METHOD_CANCEL_ONLY_REASON }), 409, T.nothing);
}));

/* ตีกลับบนฐานที่เคยเขียนไปแล้ว — ไม่มีคำสั่งเขียนใหม่ และตารางเหมือนก่อนกด */
async function refusedAfter(db, body, status, error, user = head) {
  const from = db.calls.length;
  const before = clone(db.tables);
  const out = await post(db, body, user);
  assert.equal(out.json.error, error);
  assert.equal(out.status, status);
  assert.deepEqual(writesOf(db, from), [], 'ต้องไม่มีคำสั่งเขียน');
  assert.deepEqual(db.tables, before);
  return out;
}

/* ═══ ท้ายบรรทัดเธรด "ถ้ายังไม่ได้ส่งแบบ" — ถามจากไฟล์ที่แผง "แบบจากฝ่ายขาย" โชว์ ═════════════════ */

test('ท้ายเธรดทวงแบบ: เฉพาะใบที่ไม่มีไฟล์ของคำร้องและไม่มีไฟล์ในเธรด · อ่านไม่ได้ = ไม่ทวง และการสลับยังสำเร็จ', flagged(async () => {
  const TAIL = ' · ถ้ายังไม่ได้ส่งแบบ แนบในเธรดนี้ได้เลย';
  const posted = (over = {}) => ({
    id: 'EUP-OLD', entityType: 'dept_request', entityId: 'RQ1', kind: 'comment', body: 'แนบแบบเพิ่ม', meta: {},
    attachments: [{ fileUrl: 'https://files.example.test/plan.jpg', fileName: 'plan.jpg' }], authorId: 'U-AE',
    createdAt: '2026-10-02T00:00:00+00:00', deletedAt: null, ...over,
  });
  const cases = {
    'ไฟล์ของคำร้อง ชนิดอื่น ๆ (ใบก่อนมีฟอร์มรุ่นใหม่)': [{ files: [drawingFile()] }, false],
    'ไฟล์ของคำร้อง ชนิด spec': [{ files: [drawingFile({ docType: 'spec' })] }, false],
    'ไม่มีไฟล์เลย': [{ files: [] }, true],
    'มีแต่แถวเอกสาร Google': [{ files: [drawingFile({ metadata: { kind: 'google_doc' } })] }, true],
    'ไฟล์แนบในเธรดของใบ': [{ files: [], updates: [posted()] }, false],
    'ข้อความในเธรดที่ถูกลบไปแล้ว': [{ files: [], updates: [posted({ deletedAt: '2026-10-03T00:00:00+00:00' })] }, true],
    'ข้อความในเธรดที่ไม่มีไฟล์': [{ files: [], updates: [posted({ attachments: [] })] }, true],
  };
  for (const [name, [seed, tail]] of Object.entries(cases)) {
    const db = world(seed);
    const out = await post(db, bodyFor(db, { changes: toDrawing('Z3') }));
    assert.equal(out.status, 200, `${name}: ${out.json.error}`);
    assert.equal(threadRows(db)[0].body.endsWith(TAIL), tail, name);
  }
  for (const name of ['filesRead', 'threadFilesRead']) {
    const db = world({ files: [] });
    db.failOn(M[name]);
    const out = await post(db, bodyFor(db, { changes: toDrawing('Z3') }));
    assert.equal(out.status, 200, `${name}: ${out.json.error}`);
    assert.equal(threadRows(db)[0].body.endsWith(TAIL), false, `${name}: อ่านไม่ได้ต้องไม่ทวงแบบ`);
  }
  // กลับเป็นลงหน้างาน / ยกเลิกนัดอย่างเดียว ไม่มีประโยคนี้ — ไม่ว่าใบจะมีไฟล์หรือไม่
  const back = world({ zones: SHEETS.mixed(), files: [] });
  assert.equal((await post(back, bodyFor(back, { changes: toOnsite('Z2') }))).status, 200);
  assert.equal(threadRows(back)[0].body, `เปลี่ยนวิธีประเมินเป็น “ลงหน้างาน” 1 พื้นที่ (ห้องประชุม) — ${REASON}`);
  const only = world({ zones: SHEETS.desk(), req: deskRequest(), files: [] });
  assert.equal((await post(only, bodyFor(only, { reason: SURVEY_METHOD_CANCEL_ONLY_REASON, cancelVisitId: 'V1' }))).status, 200);
  assert.equal(threadRows(only)[0].body, 'ยกเลิกนัด SV-26100011 — ใบนี้ประเมินจากแบบทั้งใบ');
}));

/* ═══ กดซ้ำ ≠ กดใหม่ (§4.5) ═══════════════════════════════════════════════════════════════ */

test('🔑 กดใหม่ที่เนื้อหาเหมือนเดิมไม่ใช่การกดซ้ำ: จากแบบ → กลับ → จากแบบด้วยชิปเดิม = เธรดสามบรรทัด กระดิ่งช่างสองใบคนละกุญแจ', flagged(async () => {
  const db = world();
  const first = await post(db, bodyFor(db, { actionId: ACTION.a, changes: toDrawing('Z3'), reason: CHIP }));
  assert.equal(first.status, 200, first.json.error);
  clock(1);
  const second = await post(db, bodyFor(db, { actionId: ACTION.b, changes: toOnsite('Z3'), reason: CHIP }));
  assert.equal(second.status, 200, second.json.error);
  clock(2);
  const third = await post(db, bodyFor(db, { actionId: ACTION.c, changes: toDrawing('Z3'), reason: CHIP }));
  assert.equal(third.status, 200, third.json.error);
  assert.deepEqual([first, second, third].map((o) => o.json.already), [false, false, false]);

  const line = (label) => `เปลี่ยนวิธีประเมินเป็น “${label}” 1 พื้นที่ (ห้องน้ำ) — ${CHIP}`;
  assert.deepEqual(threadRows(db).map((u) => u.body), [line('ประเมินจากแบบ'), line('ลงหน้างาน'), line('ประเมินจากแบบ')]);
  assert.deepEqual(threadRows(db).map((u) => u.meta.key), [keyOf(ACTION.a), keyOf(ACTION.b), keyOf(ACTION.c)]);
  // นัดไว้ + ใบยังผสม ⇒ ช่างได้กระดิ่ง "ไม่ต้องวัดพื้นที่นี้" ทั้งสองครั้งที่เป็นจากแบบ — กุญแจเดียวกัน = ครั้งที่สองถูกกลืนถาวร
  const tech = bellRows(db).filter((n) => n.kind === CREW_KIND && n.userId === 'U-TECH');
  assert.deepEqual(tech.map((n) => n.updateId), [`survey-method:RQ1:${keyOf(ACTION.a)}`, `survey-method:RQ1:${keyOf(ACTION.c)}`]);
  assert.equal(bellSends(db, CREW_KIND).length, 2);
  assert.equal(rowOf(db, 'Z3').method, 'drawing');
  assert.equal(rowOf(db, 'Z3').methodChangedAt, clock(2));
}));

test('🔑 body เดิม + actionId เดิม ส่งสองครั้ง: เธรดหนึ่งบรรทัด กระดิ่งหนึ่งชุด · ครั้งที่สองตอบ already: true', flagged(async () => {
  const db = world();
  const body = bodyFor(db, { changes: toDrawing('Z3'), reason: CHIP });
  const one = await post(db, body);
  clock(1);
  const two = await post(db, body);
  assert.deepEqual([one.status, two.status], [200, 200], two.json.error);
  assert.deepEqual([one.json.already, two.json.already], [false, true]);
  assert.deepEqual(two.json.plan, one.json.plan);
  assert.equal(threadRows(db).length, 1);
  assert.equal(bellSends(db, CREW_KIND).length, 1, 'ครั้งที่สองต้องไม่ยิงกระดิ่งเลย (ไม่ใช่ยิงแล้วให้ฐานกันซ้ำ)');
  assert.equal(rowOf(db, 'Z3').methodChangedAt, NOW, 'แถวที่การกดนี้เขียนไปแล้วไม่ถูกเขียนซ้ำ — เวลาสลับคือของครั้งแรก');
  assert.equal(db.calls.filter(M.toDrawing).length, 1);

  // หัวหน้าอีกคนส่ง body เดียวกัน (เลขเดียวกัน) = คนละการกด: แถวถึงเป้าด้วยมือคนอื่นแล้ว ⇒ ล้าสมัย
  const other = { id: 'U-HEAD2', name: 'หัวหน้า ข', role: 'ts_audit', department: 'TS' };
  clock(2);
  await refusedAfter(db, body, 409, T.stale, other);
}));

test('🔴 แท็บที่สองของหัวหน้าคนเดียวกัน ด้วยชิปเหตุผลเดียวกัน (เลขการกดใหม่) หลังแท็บแรกสลับครบแล้ว: 409 ล้าสมัย · วันส่งผลไม่ถูกเขียนทับ · ไม่มีเธรด / กระดิ่งซ้ำ', flagged(async () => {
  const db = world({ visits: [] });
  // สองแท็บเปิดโมดัลตอนใบยังลงหน้างานสามพื้นที่ — `seenMix` ของทั้งคู่ = 3 / 0
  const tabOne = bodyFor(db, { actionId: ACTION.a, changes: toDrawing('Z1', 'Z2', 'Z3'), reason: CHIP, committedResultDate: DATE });
  const tabTwo = bodyFor(db, { actionId: ACTION.b, changes: toDrawing('Z1', 'Z2', 'Z3'), reason: CHIP, committedResultDate: '2026-10-20' });
  const one = await post(db, tabOne);
  assert.equal(one.status, 200, one.json.error);
  assert.equal(db.tables.dept_requests[0].committedResultDate, DATE);
  const sends = bellRows(db).length;

  clock(1);
  const from = db.calls.length;
  const two = await post(db, tabTwo);
  assert.equal(two.status, 409);
  assert.deepEqual(two.json, { error: T.stale, code: 'stale' });
  assert.deepEqual(writesOf(db, from), [], 'ต้องไม่มีคำสั่งเขียน');
  assert.equal(db.tables.dept_requests[0].committedResultDate, DATE, 'วันส่งผลของแท็บแรกต้องอยู่');
  assert.equal(threadRows(db).length, 1);
  assert.equal(bellRows(db).length, sends);

  // อ่านบรรทัดเธรดเพื่อตัดสินไม่สำเร็จ = 500 (ยังไม่ได้เขียนอะไร) — ไม่ปล่อยผ่านเป็น "กดซ้ำ"
  const down = world({ visits: [] });
  assert.equal((await post(down, bodyFor(down, { actionId: ACTION.a, changes: toDrawing('Z1', 'Z2', 'Z3'), reason: CHIP, committedResultDate: DATE }))).status, 200);
  down.failOn(M.dedupeRead);
  const mark = down.calls.length;
  const failed = await post(down, { ...tabTwo });
  assert.equal(failed.status, 500);
  assert.deepEqual(writesOf(down, mark), []);
}));

test('คำตอบที่ไม่สำเร็จพก `code` ให้จอแยก "กดซ้ำด้วยเลขเดิม" (partial) ออกจาก "โหลดใหม่ เปิดกล่องใหม่" (stale · sent) และ "ไม่มีอะไรให้ทำ" (nothing)', flagged(async () => {
  // partial — ฐานพังกลางทาง (ขั้น 3a)
  const broken = world();
  broken.failOn(M.toDrawing);
  const partial = await post(broken, bodyFor(broken, { changes: toDrawing('Z3'), reason: CHIP }));
  assert.deepEqual([partial.status, partial.json], [409, { error: T.partial, code: 'partial' }]);

  // stale — ช่างกดเริ่มงานก่อนคำสั่งยกเลิกนัดถึง (ขั้น 2) · สถานะ 409 เท่ากับ partial จึงต้องแยกด้วย code
  const moved = world();
  moved.on(M.cancel, (t) => { t.service_visits[0].status = 'in_progress'; });
  const stale = await post(moved, bodyFor(moved, { changes: toDrawing('Z1', 'Z2', 'Z3'), committedResultDate: DATE, cancelVisitId: 'V1' }));
  assert.deepEqual([stale.status, stale.json], [409, { error: T.stale, code: 'stale' }]);

  // stale ก่อนเขียน — สัดส่วนที่โมดัลเห็นไม่ตรงกับใบ
  const seen = world();
  const wrong = await post(seen, { ...bodyFor(seen, { changes: toDrawing('Z3'), reason: CHIP }), seenMix: { onsite: 1, drawing: 2 } });
  assert.deepEqual([wrong.status, wrong.json], [409, { error: T.stale, code: 'stale' }]);

  // sent — ใบถูกส่งผลไประหว่างทาง (จองใบไม่ติด)
  const answered = world();
  answered.on(M.touch, (t) => { t.dept_requests[0].answeredAt = NOW; });
  const sent = await post(answered, bodyFor(answered, { changes: toDrawing('Z3'), reason: CHIP }));
  assert.deepEqual([sent.status, sent.json], [409, { error: T.sent, code: 'sent' }]);

  // nothing — ไม่ได้เปลี่ยนอะไร และไม่มีนัดให้ยกเลิก
  const idle = world({ visits: [] });
  const nothing = await post(idle, bodyFor(idle, { changes: [] }));
  assert.deepEqual([nothing.status, nothing.json], [409, { error: T.nothing, code: 'nothing' }]);
}));

/* ═══ ยกเลิกนัดอย่างเดียวที่พังหลังยกเลิกนัดสำเร็จ — กดซ้ำต้องจบได้ ════════════════════════════════ */

for (const step of ['dedupeRead', 'thread']) {
  test(`ยกเลิกนัดอย่างเดียว พังที่ขั้น 5 (${step}) แล้วส่ง body เดิม: 200 · เธรดหนึ่งบรรทัด · กระดิ่งช่างหนึ่งใบ · นัดถูกยกเลิกครั้งเดียว`, flagged(async () => {
    const db = world({ zones: SHEETS.desk(), req: deskRequest() });
    // การอ่านกันซ้ำมีสองครั้ง (หลังจองใบ · ก่อนเขียนเธรด) — ข้อนี้พังครั้งที่สอง ซึ่งเป็นของขั้น 5
    db.failOn(M[step], step === 'dedupeRead' ? 2 : 1);
    const body = bodyFor(db, { reason: SURVEY_METHOD_CANCEL_ONLY_REASON, cancelVisitId: 'V1' });
    const one = await post(db, body);
    assert.equal(one.status, 409);
    assert.equal(one.json.error, T.partial);
    assert.equal(db.tables.service_visits[0].status, 'cancelled');
    assert.deepEqual(threadRows(db), []);
    assert.deepEqual(bellRows(db), [], 'กระดิ่งมาหลังบรรทัดเธรดเสมอ');

    // รอบสอง: ไม่มีนัดค้างแล้ว — route อ่านนัดที่ body เอ่ยถึง แล้วพิสูจน์จากบรรทัดยกเลิกที่รอบแรกเขียนไว้
    const from = db.calls.length;
    const two = await post(db, body);
    assert.equal(two.status, 200, two.json.error);
    assert.deepEqual(two.json.plan, { kind: 'cancel-only', flip: null, visitAction: 'cancel' });
    assert.equal(two.json.already, false);
    assert.ok(db.calls.slice(from).some(M.proofRead), 'ต้องพิสูจน์จากเธรดของนัด');
    assert.deepEqual(threadRows(db).map((u) => u.body), ['ยกเลิกนัด SV-26100011 — ใบนี้ประเมินจากแบบทั้งใบ']);
    assert.equal(threadRows(db)[0].meta.cancelledVisitId, 'V1');
    assert.equal(threadRows(db, 'service_visit').length, 1, 'บรรทัดยกเลิกบนเธรดของนัดไม่ถูกเขียนซ้ำ');
    assert.equal(effective(db).filter(M.cancel).length, 1, 'นัดถูกยกเลิกครั้งเดียว');
    assert.equal(db.calls.slice(from).filter(M.cancel).length, 0, 'รอบสองไม่สั่งยกเลิกนัดอีก');
    assert.equal(bellSends(db, CREW_KIND).length, 1);
    assert.deepEqual(bellsOf(db), { crew: 'cancel', head: false });

    // รอบสาม (คำตอบรอบสองหายกลางทาง)
    const three = await post(db, body);
    assert.equal(three.status, 200, three.json.error);
    assert.equal(three.json.already, true);
    assert.equal(threadRows(db).length, 1);
    assert.equal(bellSends(db, CREW_KIND).length, 1);
  }));
}

/* ═══ "นัดถูกยกเลิกโดยการกดนี้" ต้องพิสูจน์ ไม่เชื่อ body ════════════════════════════════════════ */

test('🔴 เลขนัดเก่าที่ถูกยกเลิกด้วยเหตุอื่น · นัดของใบอื่น · นัดที่ยังไม่ถูกยกเลิก = 409 ล้าสมัย — ไม่มีเธรด ไม่มีกระดิ่ง', flagged(async () => {
  const oldLine = {
    id: 'EUP-1', entityType: 'service_visit', entityId: 'V1', kind: 'cancel', body: 'ลูกค้าขอเลื่อน', meta: {},
    authorId: 'U-PLAN', createdAt: '2026-10-08T03:00:00+00:00',
  };
  const whole = (db, cancelVisitId) => bodyFor(db, { changes: toDrawing('Z1', 'Z2', 'Z3'), committedResultDate: DATE, cancelVisitId });

  // นัดเก่าของใบนี้ ถูกยกเลิกโดยผู้จัดคิวเมื่อวาน — ไม่มีบรรทัดไหนพกกุญแจของการกดนี้
  const old = world({ visits: [visitRow('cancelled')], updates: [oldLine] });
  await refused(old, whole(old, 'V1'), 409, T.stale);
  assert.ok(old.calls.some(M.proofRead));

  // บรรทัดยกเลิกที่พกกุญแจของ **การกดอื่น** ก็ไม่ใช่หลักฐาน
  const otherKey = world({ visits: [visitRow('cancelled')], updates: [{ ...oldLine, meta: { methodKey: keyOf(ACTION.b) } }] });
  await refused(otherKey, whole(otherKey, 'V1'), 409, T.stale);

  // นัดของใบอื่น (ถูกยกเลิกและมีบรรทัดพกกุญแจนี้ด้วยซ้ำ) — คำสั่งอ่านผูก requestId จึงไม่เจอ
  const foreign = world({
    visits: [visitRow('cancelled', { id: 'V9', requestId: 'RQ-OTHER', code: 'SV-26100099' })],
    updates: [{ ...oldLine, entityId: 'V9', meta: { methodKey: keyOf(ACTION.a) } }],
  });
  await refused(foreign, whole(foreign, 'V9'), 409, T.stale);
  assert.equal(foreign.calls.some(M.proofRead), false, 'ไม่ถึงขั้นพิสูจน์ — นัดนี้ไม่ใช่ของใบ');

  // ไม่มีนัดค้าง และนัดที่ body เอ่ยถึงจบไปแล้วแบบอื่น (เข้าแล้ว / เลื่อน) หรือไม่มีอยู่
  for (const status of ['done', 'partial', 'unable', 'rescheduled']) {
    // มีบรรทัดพกกุญแจนี้ค้างอยู่ด้วยซ้ำ (นัดถูกยกเลิกแล้วเปิดกลับมาปิดเป็นอย่างอื่น) — สถานะต้องเป็น "ยกเลิก" ก่อน จึงค่อยดูหลักฐาน
    const closed = world({ visits: [visitRow(status)], updates: [{ ...oldLine, meta: { methodKey: keyOf(ACTION.a) } }] });
    await refused(closed, whole(closed, 'V1'), 409, T.stale);
    assert.equal(closed.calls.some(M.proofRead), false, `${status}: นัดที่ไม่ได้ถูกยกเลิกไม่ต้องอ่านหลักฐาน`);
  }
  const missing = world({ visits: [] });
  await refused(missing, whole(missing, 'V-NONE'), 409, T.stale);
}));

test('🔴 อ่านนัดที่ body เอ่ยถึง / อ่านหลักฐานไม่สำเร็จ = 500 — ไม่ตกไปเป็น "ไม่ใช่" และไม่ตกไปเป็น "ใช่"', flagged(async () => {
  const proofLine = {
    id: 'EUP-1', entityType: 'service_visit', entityId: 'V1', kind: 'cancel', body: `เปลี่ยนเป็นประเมินจากแบบ: ${REASON}`,
    meta: { methodKey: keyOf(ACTION.a) }, authorId: 'U-HEAD', createdAt: '2026-10-09T03:00:00+00:00',
  };
  for (const name of ['namedVisitRead', 'proofRead']) {
    const db = world({ visits: [visitRow('cancelled')], updates: [proofLine] });
    db.failOn(M[name]);
    await refused(db, bodyFor(db, { changes: toDrawing('Z1', 'Z2', 'Z3'), committedResultDate: DATE, cancelVisitId: 'V1' }), 500, DB_DOWN);
  }
  // หลักฐานอ่านได้และตรงกุญแจ ⇒ เดินต่อได้ (นัดถูกยกเลิกไปแล้วโดยการกดนี้ — ไม่มีคำสั่งยกเลิกรอบสอง)
  const db = world({ visits: [visitRow('cancelled')], updates: [proofLine] });
  const out = await post(db, bodyFor(db, { changes: toDrawing('Z1', 'Z2', 'Z3'), committedResultDate: DATE, cancelVisitId: 'V1' }));
  assert.equal(out.status, 200, out.json.error);
  assert.deepEqual(out.json.plan, { kind: 'switch', flip: 'to-desk', visitAction: 'cancel' });
  assert.equal(db.calls.filter(M.cancel).length, 0);
  assert.ok(threadRows(db)[0].body.includes(' · ยกเลิกนัด SV-26100011'));
  assert.deepEqual(bellsOf(db), { crew: 'cancel', head: true });
}));

/* ═══ การชน (§4.6 ตารางที่สอง) — ตอบข้อความของมันเอง ไม่ใช่ "กดอีกครั้ง" ══════════════════════════ */

test('นัดเดินไประหว่างแผนกับขั้น 2 (ช่างกดเริ่มงาน): 409 ล้าสมัย ไม่ใช่ "บันทึกไม่ครบ" · เขียนไปแค่การแตะใบ', flagged(async () => {
  const db = world();
  db.on(M.cancel, (tables) => { tables.service_visits[0].status = 'in_progress'; });
  const out = await post(db, bodyFor(db, { changes: toDrawing('Z1', 'Z2', 'Z3'), committedResultDate: DATE, cancelVisitId: 'V1' }));
  assert.equal(out.status, 409);
  assert.equal(out.json.error, T.stale);
  assert.deepEqual(stepsOf(db), ['1'], 'ของที่เขียนลงจริงมีแค่การแตะใบของขั้น 1');
  assert.equal(db.tables.service_visits[0].status, 'in_progress');
  assert.deepEqual(db.tables.service_survey_zones.map((z) => z.method), ['onsite', 'onsite', 'onsite', 'onsite']);
  assert.deepEqual(threadRows(db), []);
  assert.deepEqual(bellRows(db), []);
}));

test('ใบถูกส่งผลระหว่างที่ route อ่านกับขั้นแตะใบ: 409 "ส่งผลไปแล้ว" · ไม่มีอะไรถูกเขียน', flagged(async () => {
  const db = world();
  db.on(M.touch, (tables) => { tables.dept_requests[0].answeredAt = '2026-10-09T03:59:59+00:00'; });
  const before = clone(db.tables);
  const out = await post(db, bodyFor(db, { changes: toDrawing('Z3') }));
  assert.equal(out.status, 409);
  assert.equal(out.json.error, T.sent);
  assert.deepEqual(effective(db), [], 'คำสั่งแตะใบไม่โดนแถว (มีเงื่อนไข "ยังไม่ส่งผล") และไม่มีคำสั่งเขียนอื่น');
  assert.deepEqual(db.tables.service_survey_zones, before.service_survey_zones);
  assert.deepEqual(threadRows(db), []);
}));

test('ใบถูกส่งผลหลังขั้นแตะใบ (การอ่านซ้ำก่อนเขียนตารางอื่น): 409 "ส่งผลไปแล้ว" · เขียนไปแค่การแตะใบ — นัดและแถวพื้นที่ไม่ถูกแตะ', flagged(async () => {
  const cases = {
    'ก่อนยกเลิกนัด (ขั้น 2)': [() => world(), { changes: toDrawing('Z1', 'Z2', 'Z3'), committedResultDate: DATE, cancelVisitId: 'V1' }],
    'ก่อนเขียนพื้นที่เป็นจากแบบ (ขั้น 3a)': [() => world(), { changes: toDrawing('Z3') }],
    'ก่อนเขียนพื้นที่กลับเป็นลงหน้างาน (ขั้น 3b)': [() => world({ zones: SHEETS.mixed() }), { changes: toOnsite('Z2') }],
  };
  for (const [name, [make, over]] of Object.entries(cases)) {
    const db = make();
    const zonesBefore = clone(db.tables.service_survey_zones);
    db.on(M.recheck, (tables) => { tables.dept_requests[0].answeredAt = '2026-10-09T04:00:00+00:00'; });
    const out = await post(db, bodyFor(db, over));
    assert.equal(out.status, 409, name);
    assert.equal(out.json.error, T.sent, name);
    assert.deepEqual(stepsOf(db), ['1'], name);
    assert.deepEqual(db.tables.service_survey_zones, zonesBefore, name);
    assert.equal(db.tables.service_visits[0].status, 'scheduled', name);
    assert.deepEqual(threadRows(db), [], name);
    assert.deepEqual(bellRows(db), [], name);
  }
}));

test('หัวหน้าสองคนเปิดกล่องพร้อมกันแล้วสลับคนละพื้นที่: คนที่สองได้ 409 ล้าสมัย — ไม่มีอะไรถูกเขียนทับ', flagged(async () => {
  const db = world();
  const seen = mixOf(db);                                       // ทั้งสองกล่องเปิดตอนใบยังลงหน้างานล้วน
  const other = { id: 'U-HEAD2', name: 'หัวหน้า ข', role: 'ts_audit', department: 'TS' };
  const first = await post(db, { actionId: ACTION.a, changes: toDrawing('Z3'), reason: REASON, seenMix: seen });
  assert.equal(first.status, 200, first.json.error);
  clock(1);
  await refusedAfter(db, { actionId: ACTION.b, changes: toDrawing('Z2'), reason: CHIP, seenMix: seen }, 409, T.stale, other);
  // คนที่สองเลือกพื้นที่เดียวกับคนแรก (ไปเป้าเดียวกัน) ก็ล้าสมัย — แถวถึงเป้าด้วยมือคนอื่นแล้ว
  await refusedAfter(db, { actionId: ACTION.c, changes: toDrawing('Z3'), reason: REASON, seenMix: seen }, 409, T.stale, other);
  assert.equal(rowOf(db, 'Z3').methodChangedByName, 'หัวหน้า ก');
  assert.equal(threadRows(db).length, 1);
}));

test('ขั้น 3b: แถวถูกบันทึกแทรก (updatedAt ขยับ) = อ่านใหม่หนึ่งครั้งแล้วเขียนด้วยจุดชุดใหม่ · ขยับอีกรอบ = 409 ล้าสมัย', flagged(async () => {
  const saved = (tables, stamp, spots) => {
    const row = tables.service_survey_zones.find((r) => r.id === 'Z2');
    row.updatedAt = stamp;
    row.spots = spots;
  };
  const FRESH = [{ id: 's1', selected: true, x: 0.2, y: 0.4 }, { id: 's9', selected: true, x: 0.9, y: 0.9 }];

  const db = world({ zones: SHEETS.mixed() });
  db.on(M.toOnsite, (tables) => saved(tables, '2026-10-09T03:59:00+00:00', FRESH));
  const out = await post(db, bodyFor(db, { changes: toOnsite('Z2') }));
  assert.equal(out.status, 200, out.json.error);
  const writes = db.calls.filter(M.toOnsite);
  assert.equal(writes.length, 2, 'เขียนสองครั้ง: ครั้งแรกไม่โดนแถว ครั้งที่สองผูกกับรุ่นใหม่');
  assert.equal(writes[0].hit, 0);
  assert.equal(writes[1].hit, 1);
  assert.deepEqual(writes[1].where[2], ['eq', 'updatedAt', '2026-10-09T03:59:00+00:00']);
  // จุดที่อีกคนเพิ่งบันทึกไม่หาย — แค่ถูกปลดเลือก
  assert.deepEqual(rowOf(db, 'Z2').spots, FRESH.map((spot) => ({ ...spot, selected: false })));
  assert.equal(rowOf(db, 'Z2').method, 'onsite');
  assert.equal(db.calls.filter((c) => c.table === 'service_survey_zones' && c.op === 'select' && has(c, 'eq', 'id', 'Z2')).length, 1);

  const twice = world({ zones: SHEETS.mixed() });
  twice.on(M.toOnsite, (tables) => saved(tables, '2026-10-09T03:59:00+00:00', FRESH));
  twice.on(M.toOnsite, (tables) => saved(tables, '2026-10-09T03:59:30+00:00', FRESH), 2);
  const stale = await post(twice, bodyFor(twice, { changes: toOnsite('Z2') }));
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error, T.stale);
  assert.equal(rowOf(twice, 'Z2').method, 'drawing');
  assert.deepEqual(threadRows(twice), []);

  // แถวถูกตัดไประหว่างนั้น = ชน เหมือนกัน
  const cut = world({ zones: SHEETS.mixed() });
  cut.on(M.toOnsite, (tables) => {
    saved(tables, '2026-10-09T03:59:00+00:00', FRESH);
    tables.service_survey_zones.find((r) => r.id === 'Z2').status = 'cut';
  });
  const gone = await post(cut, bodyFor(cut, { changes: toOnsite('Z2') }));
  assert.equal(gone.status, 409);
  assert.equal(gone.json.error, T.stale);

  /* สองแถว แถวที่สองชน: แถวแรกเป็นลงหน้างานไปแล้ว · วันบนใบและเธรดยังไม่ถูกเขียน (สภาพค้างของ §4.6 ตารางที่สอง)
     ทางออก = โหลดใหม่แล้วสลับแถวที่เหลือ: เป็นการกดใหม่ที่มีบรรทัดเธรดของมันเอง */
  const two = world({ zones: SHEETS.desk(), visits: [], req: deskRequest() });
  const moveZ2 = (stamp) => (tables) => { tables.service_survey_zones.find((r) => r.id === 'Z2').updatedAt = stamp; };
  const isZ2 = (c) => M.toOnsite(c) && has(c, 'eq', 'id', 'Z2');
  two.on(isZ2, moveZ2('2026-10-09T03:59:00+00:00'));
  two.on(isZ2, moveZ2('2026-10-09T03:59:30+00:00'), 2);
  const half = await post(two, bodyFor(two, { changes: toOnsite('Z1', 'Z2') }));
  assert.equal(half.status, 409);
  assert.equal(half.json.error, T.stale);
  assert.deepEqual(stepsOf(two), ['1', '3b']);
  assert.deepEqual([rowOf(two, 'Z1').method, rowOf(two, 'Z2').method], ['onsite', 'drawing']);
  assert.equal(two.tables.dept_requests[0].committedResultDate, '2026-10-15', 'วันบนใบยังไม่ถูกล้าง');
  assert.deepEqual(threadRows(two), []);
  clock(3);
  const rest = await post(two, bodyFor(two, { actionId: ACTION.b, changes: toOnsite('Z2') }));
  assert.equal(rest.status, 200, rest.json.error);
  assert.deepEqual(rest.json.plan, { kind: 'switch', flip: null, visitAction: 'none' }, 'ใบต้องมีนัดอยู่แล้วจากแถวแรก — การกดใหม่ไม่พลิกใบ');
  assert.deepEqual(threadRows(two).map((u) => u.body), [`เปลี่ยนวิธีประเมินเป็น “ลงหน้างาน” 1 พื้นที่ (ห้องประชุม) — ${REASON}`]);
}));

/* ═══ แข่งกับการส่งผล (§4.5) — การแตะปิดท้ายทำให้การเคลมของเส้นส่งผลไม่โดนแถว ═══════════════════ */

for (const [name, seed, over, zoneWrite] of [
  ['ใบพลิกเป็นงานโต๊ะ (ขั้น 4 พกวัน)', () => ({}), { changes: toDrawing('Z1', 'Z2', 'Z3'), committedResultDate: DATE, cancelVisitId: 'V1' }, 'toDrawing'],
  ['ใบยังผสม (ขั้น 4 ไม่มีวัน — แตะอย่างเดียว)', () => ({}), { changes: toDrawing('Z3') }, 'toDrawing'],
  ['กลับเป็นลงหน้างาน ใบยังผสม', () => ({ zones: SHEETS.mixed() }), { changes: toOnsite('Z2') }, 'toOnsite'],
]) {
  test(`แข่งกับการส่งผล · ${name}: ส่งผลที่อ่านใบหลังขั้น 1 และอ่านแถวก่อนขั้น 3 เคลมใบไม่ได้`, flagged(async () => {
    const db = world(seed());
    /* "เส้นส่งผล" ปลอม: อ่านใบและแถวพื้นที่ ณ จังหวะก่อนคำสั่งเขียนพื้นที่ — ใบถูกแตะด้วยเวลาของคำขอไปแล้ว แถวยังเป็นวิธีเก่า */
    let seen = null;
    db.on(M[zoneWrite], (tables) => {
      seen = { updatedAt: tables.dept_requests[0].updatedAt, methods: tables.service_survey_zones.map((z) => z.method) };
    });
    const out = await post(db, bodyFor(db, over));
    assert.equal(out.status, 200, out.json.error);
    assert.equal(seen.updatedAt, NOW, 'การส่งผลอ่านใบหลังขั้น 1');
    assert.notDeepEqual(seen.methods, db.tables.service_survey_zones.map((z) => z.method), 'การส่งผลถือวิธีเก่าของแถว');

    // การเคลมของเส้นส่งผล: `update … eq('updatedAt', <ค่าที่อ่านไว้>)` — ต้องไม่โดนแถว
    const claim = await db.from('dept_requests').update({ updatedAt: '2026-10-09T05:00:00.000Z' })
      .eq('id', 'RQ1').eq('updatedAt', seen.updatedAt).is('answeredAt', null).select('id').maybeSingle();
    assert.equal(claim.data, null, 'เคลมด้วย updatedAt ที่อ่านก่อนสลับเสร็จ ต้องได้ศูนย์แถว');
    assert.notEqual(db.tables.dept_requests[0].updatedAt, seen.updatedAt);
  }));
}

/* ═══ ฐานพังรายขั้นแล้วส่ง body เดิม (§4.6 ตารางแรก) — ผ่าน route ทั้งสาย ════════════════════════ */

const SCENARIOS = {
  'ทั้งใบเป็นจากแบบ + นัดไว้': {
    world: () => world(),
    body: { changes: toDrawing('Z1', 'Z2', 'Z3'), committedResultDate: DATE, cancelVisitId: 'V1' },
    steps: ['touch', 'dedupeRead', 'recheck', 'cancel', 'visitLine', 'toDrawing', 'cutMark', 'touch#2', 'dedupeRead#2', 'thread'],
  },
  'สองพื้นที่กลับเป็นลงหน้างาน ไม่มีนัด': {
    world: () => world({ zones: SHEETS.desk(), visits: [], req: deskRequest() }),
    body: { changes: toOnsite('Z1', 'Z2') },
    steps: ['touch', 'dedupeRead', 'recheck', 'toOnsite', 'toOnsite#2', 'touch#2', 'dedupeRead#2', 'thread'],
  },
  'ยกเลิกนัดอย่างเดียว': {
    world: () => world({ zones: SHEETS.desk(), req: deskRequest() }),
    body: { changes: [], reason: SURVEY_METHOD_CANCEL_ONLY_REASON, cancelVisitId: 'V1' },
    steps: ['touch', 'dedupeRead', 'recheck', 'cancel', 'visitLine', 'cutMark', 'touch#2', 'dedupeRead#2', 'thread'],
  },
};

for (const [name, sc] of Object.entries(SCENARIOS)) {
  test(`ฐานพังทีละขั้นแล้วส่ง body เดิม → จบที่สถานะเดียวกับรอบที่ไม่พัง · ${name}`, flagged(async () => {
    const clean = sc.world();
    const cleanOut = await post(clean, bodyFor(clean, sc.body));
    assert.equal(cleanOut.status, 200, cleanOut.json.error);
    const want = visible(clean);
    const wantSteps = stepsOf(clean);
    const sends = (db) => [bellSends(db, CREW_KIND).length, bellSends(db, HEAD_KIND).length];
    const wantSends = sends(clean);
    assert.equal(want.thread.length, 1);

    for (const step of sc.steps) {
      const db = sc.world();
      const body = bodyFor(db, sc.body);
      const [match, nth] = matcherOf(step);
      db.failOn(match, nth, `พังที่ ${step}`);

      const one = await post(db, body);
      if (step === 'touch') {
        // ขั้น 1 พัง = ยังไม่มีอะไรถูกเขียน ⇒ 500 พร้อมข้อความจริง ไม่ใช่ "กดอีกครั้ง"
        assert.equal(one.status, 500, step);
        assert.equal(one.json.error, `พังที่ ${step}`);
        assert.deepEqual(effective(db), [], `${step}: ต้องยังไม่มีอะไรถูกเขียน`);
      } else {
        assert.equal(one.status, 409, step);
        assert.equal(one.json.error, T.partial, step);
        // ของที่เขียนไปแล้ว = ขั้นก่อนหน้าขั้นที่พัง ตามลำดับของรอบที่ไม่พัง (ไม่มีขั้นไหนข้ามไปเขียนก่อน)
        const done = stepsOf(db);
        assert.deepEqual(done, wantSteps.slice(0, done.length), `${step}: ลำดับของที่เขียนก่อนพัง`);
        assert.ok(done.length < wantSteps.length, step);
      }
      assert.deepEqual(threadRows(db), [], `${step}: รอบที่พังต้องยังไม่มีบรรทัดเธรดของใบ`);
      assert.deepEqual(bellRows(db), [], `${step}: รอบที่พังต้องยังไม่ยิงกระดิ่ง`);

      const two = await post(db, body);
      if (step === 'visitLine') {
        /* นัดถูกยกเลิกแล้วแต่บรรทัดหลักฐานไม่ลง ⇒ กดซ้ำพิสูจน์ไม่ได้ว่าเป็นของการกดนี้ = ล้าสมัย (สภาพค้างที่ยอมรับ §4.6) */
        assert.equal(two.status, 409, step);
        assert.equal(two.json.error, T.stale, step);
        assert.equal(db.tables.service_visits[0].status, 'cancelled');
        assert.deepEqual(threadRows(db), []);
        continue;
      }
      assert.equal(two.status, 200, `${step}: กดซ้ำ — ${two.json.error}`);
      assert.equal(two.json.already, false, step);
      assert.deepEqual(two.json.plan, cleanOut.json.plan, `${step}: แผนของรอบกดซ้ำ = แผนของรอบแรก`);
      assert.deepEqual(visible(db), want, `${step}: สถานะหลังกดซ้ำ`);

      // ครั้งที่สาม (คำตอบรอบสองหายกลางทาง) = ไม่มีเธรด / กระดิ่งรอบสอง
      const three = await post(db, body);
      assert.equal(three.status, 200, `${step}: ครั้งที่สาม — ${three.json.error}`);
      assert.equal(three.json.already, true, step);
      assert.deepEqual(visible(db), want, `${step}: สถานะหลังครั้งที่สาม`);
      // เธรดและกระดิ่งแต่ละชนิดถูกส่งครั้งเดียวตลอดสามรอบ (นับคำสั่งที่ส่ง ไม่ใช่แถวที่ฐานกันซ้ำให้)
      assert.equal(db.calls.filter((c) => !c.failed && M.thread(c)).length, 1, step);
      assert.deepEqual(sends(db), wantSends, `${step}: จำนวนครั้งที่ยิงกระดิ่ง`);
    }
  }));
}

test('สลับสำเร็จแต่อ่านแถวกลับไม่ได้: ยังตอบ 200 (ของเขียนครบแล้ว) — zones / request เป็น null ทั้งคู่ ให้จอโหลดใหม่', flagged(async () => {
  /* การอ่านกลับเกิดหลัง audit ของใบ (ขั้น 6 — คำสั่งสุดท้ายของตัวเขียน) ⇒ ติดอาวุธตัวฉีดตอนนั้น */
  for (const name of ['zonesRead', 'requestRead']) {
    const db = world();
    let armed = false;
    db.on((c) => c.table === 'audit_logs' && firstRow(c).entityType === 'dept_request', () => { armed = true; });
    db.failOn((c) => armed && M[name](c));
    const out = await post(db, bodyFor(db, { changes: toDrawing('Z3') }));
    assert.equal(out.status, 200, `${name}: ${out.json.error}`);
    assert.equal(out.json.ok, true);
    assert.deepEqual(out.json.plan, { kind: 'switch', flip: null, visitAction: 'stays' });
    assert.equal(out.json.zones, null, name);
    assert.equal(out.json.request, null, name);
    assert.ok(db.calls.some((c) => c.failed), `${name}: ตัวฉีดต้องทำงานจริง`);
    assert.equal(rowOf(db, 'Z3').method, 'drawing');
    assert.equal(threadRows(db).length, 1);
  }
}));

/* ═══ PATCH ของนัด — แค่ย้ายบรรทัดเธรด "ยกเลิก" ไปใช้ตัวกลาง: แถวที่เขียนต้องเหมือนเดิมทุกคีย์ ═══════ */

test('PATCH ของนัด ยกเลิกนัด: บรรทัดเธรดของนัดเหมือนเดิม — เหตุผลของคนกด · meta ว่าง (ไม่มี methodKey)', async () => {
  clock(0);
  const planner = { id: 'U-PLAN', name: 'ผู้จัดคิว', role: 'ts_planner', department: 'TS' };
  const patch = async (db, body) => {
    const { value } = await quiet(async () => {
      const out = await callRoute(visitPatch, {
        user: planner, db, method: 'PATCH', path: '/api/service/visits/V1', params: { id: 'V1' }, body,
      });
      await settle();
      return out;
    });
    return value;
  };
  const seed = () => {
    const db = world({ visits: [visitRow('scheduled', { siteId: 'SITE-1', planId: null, endTime: null, note: null, attachments: [] })] });
    db.tables.service_sites = [{ id: 'SITE-1', code: 'SS-0001', name: 'โรงแรมทดสอบ', customerId: null, accessDays: [], accessFrom: null, accessTo: null }];
    return db;
  };

  const db = seed();
  const out = await patch(db, { status: 'cancelled', rescheduleReason: 'ลูกค้ายกเลิก' });
  assert.equal(out.status, 200, out.json.error);
  const lines = threadRows(db, 'service_visit').filter((u) => u.kind === 'cancel');
  assert.equal(lines.length, 1);
  const { id, createdAt, ...line } = lines[0];
  assert.match(id, /^EUP-/);
  assert.ok(createdAt);
  assert.deepEqual(line, {
    entityType: 'service_visit', entityId: 'V1', kind: 'cancel', body: 'ลูกค้ายกเลิก', meta: {}, attachments: [],
    authorId: 'U-PLAN', authorName: 'ผู้จัดคิว', authorDept: 'TS',
  });

  // แก้อย่างอื่นของนัดที่ยกเลิกไปแล้ว = ไม่มีบรรทัดยกเลิกรอบสอง
  const again = await patch(db, { note: 'โทรแจ้งลูกค้าแล้ว' });
  assert.equal(again.status, 200, again.json.error);
  assert.equal(threadRows(db, 'service_visit').filter((u) => u.kind === 'cancel').length, 1);

  // ไม่ได้บอกเหตุผล = ข้อความตั้งต้นเดิม
  const bare = seed();
  assert.equal((await patch(bare, { status: 'cancelled' })).status, 200);
  assert.deepEqual(threadRows(bare, 'service_visit').filter((u) => u.kind === 'cancel').map((u) => [u.body, u.meta]), [['ยกเลิกนัด', {}]]);
});

/* ═══ ยามของซอร์ส ═════════════════════════════════════════════════════════════════════════ */

const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('ยามซอร์ส: route อ่านสวิตช์ผ่านตัวอ่านกลางตัวเดียว · force-dynamic · ไม่เขียนเองสักคำสั่ง (ทุกการเขียนอยู่ในตัวเขียนของแผน)', () => {
  const route = code('../../app/api/service/surveys/[id]/method/route.js');
  assert.match(route, /export const dynamic = 'force-dynamic'/);
  assert.ok(!/process\.env/.test(route), 'ห้ามอ่าน process.env เอง — ผ่าน surveyDrawingMethodEnabled() เท่านั้น');
  assert.match(route, /surveyDrawingMethodEnabled\(\)/);
  assert.ok(!/\.(update|insert|upsert|delete)\(/.test(route), 'route ไม่มีคำสั่งเขียนของตัวเอง');
  assert.ok(!/appendUpdate|recordAudit|notifyUsers/.test(route), 'เธรด · audit · กระดิ่ง ออกจากตัวเขียนของแผนที่เดียว');
  assert.equal((route.match(/surveyMethodSwitchPlan\(/g) || []).length, 1, 'แผนถูกสร้างครั้งเดียว');
  // ลำดับด่าน: สิทธิ์ → สวิตช์ → อ่านใบ
  const role = route.indexOf('canSendSurveyResult(user)');
  const flag = route.indexOf('surveyDrawingMethodEnabled()');
  const read = route.indexOf(".from('dept_requests')");
  assert.ok(role > 0 && role < flag && flag < read, 'สิทธิ์ก่อนสวิตช์ ก่อนแตะฐาน');
  // เส้นเบา — ไม่ดึงโมดูลของเอกสารประเมินหรือของหนัก
  assert.ok(!/surveyReport|sharp|puppeteer|chromium/.test(route));
});

test('ยามซอร์ส: PATCH ของนัดเขียนบรรทัดยกเลิกผ่านตัวกลาง โดยไม่ส่ง meta', () => {
  const route = code('../../app/api/service/visits/[id]/route.js');
  assert.match(route, /await appendVisitCancelLine\(supabase, \{ visitId: id, reason, user \}\);/);
  assert.ok(!/kind: 'cancel'/.test(route), 'ไม่เหลือบรรทัดยกเลิกที่เขียนตรงในไฟล์นี้');
});
