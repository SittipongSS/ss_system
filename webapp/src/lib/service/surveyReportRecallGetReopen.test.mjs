// ── ยามของสามเส้นที่แตะเอกสารประเมินโดยไม่ได้ออกเอกสารเอง (สเปก PR-2 §6 · §10 · §15 "Recall" · "Reopen" · "Leak" ข้อ 6) ──
//
// ⭐ สี่ชั้นที่ต้องล็อก:
//   1. **ดึงผลกลับ** — กดซ้ำได้ผลครั้งเดียว (409 · ไม่มีแถวเธรด) · บรรทัดในเธรด/audit/คำตอบ เอ่ยเลข SU ที่เพิ่งใช้ไม่ได้
//      · อ่านเลข **หลัง** update (เอกสารที่ RPC เขียนแทรกระหว่างอ่านใบกับ update ยังถูกเอ่ย) · เหตุผลยังแกะได้
//   2. **GET ใบประเมิน / GET คำร้อง** — คีย์ `document` / `surveyDocument` ตามสิทธิ์: ช่างได้ `{ access: 'none' }` เป๊ะ
//      โดยไม่มีการอ่านแถวเอกสาร · ผู้ขอไม่ได้ `history`/`send`/`issue` · Planner บน GET คำร้องได้แค่ `access` กับ `voids`
//      · ไล่คีย์ทุกชั้นของคำตอบ: ไม่มีภาพนิ่ง / HTML / id ของแถว / ที่อยู่ไฟล์ แม้แถวที่ฐานคืนมาจะมีครบ
//   3. **"ยังไม่จบ"** — ใบประเมินที่ตอบแล้วมีเอกสาร: เธรดและ audit เอ่ยเลขที่ · หัวข้ออื่นไม่อ่านแถวเอกสารเลย
//   4. น้ำหนักของสามเส้น — import ได้เฉพาะตัวอ่านแถว · เส้น import ทั้งสายไม่ถึง sharp / chromium / ตัวเรนเดอร์
//
// ⚠️ เรียก handler **ตัวจริง** ผ่าน supabase ปลอมที่จำแถวได้ — ตัวอ่านผู้ใช้และ client จริงถูกถอดด้วย hook ของ
//    `crew/routeTestKit.mjs` (ลบ env ของ Supabase ทิ้งก่อน import ด้วย · dev DB = prod DB) ⇒ ไม่มีอะไรถึงฐานจริง
// ⚠️ ฐานปลอมของไฟล์นี้ **ไม่ตัดคอลัมน์ตาม select** โดยตั้งใจ: แถวเอกสารพกภาพนิ่ง/HTML ครบ ⇒ เทสต์ของรั่วพิสูจน์ว่า
//    route "คัดคีย์เอง" ไม่ได้พึ่งว่า select จะไม่ขอของพวกนั้นมา · และจำลองทริกเกอร์ 0401 ⑤ (ล้างคำตอบ = แทนที่เอกสาร)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { callRoute } from './crew/routeTestKit.mjs';
import { ROLES, canSendSurveyResult } from '../permissions.js';
import { surveyRecallRecord, surveyTotals } from './survey.js';

const { POST: recallPost } = await import('../../app/api/service/surveys/[id]/recall/route.js');
const { GET: surveyGet } = await import('../../app/api/service/surveys/[id]/route.js');
const { GET: requestGet, PATCH: requestPatch } = await import('../../app/api/sa/requests/[id]/route.js');

const WEBAPP = process.cwd();
const read = (p) => fs.readFileSync(path.join(WEBAPP, p), 'utf8');
/* ตัดคอมเมนต์ก่อนตรวจ — คอมเมนต์ในไฟล์เอ่ยชื่อสิ่งต้องห้ามไว้สอนคน */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const RECALL_ROUTE = 'src/app/api/service/surveys/[id]/recall/route.js';
const SURVEY_ROUTE = 'src/app/api/service/surveys/[id]/route.js';
const REQUEST_ROUTE = 'src/app/api/sa/requests/[id]/route.js';
const ROUTES = [RECALL_ROUTE, SURVEY_ROUTE, REQUEST_ROUTE];
/* `import … from 'x'` · `export … from 'x'` · `import 'x'` — ทั้งบรรทัดเดียวและหลายบรรทัด */
const STATIC_IMPORT = /^(?:import|export)\s(?:[^;'"]*?from\s+)?'([^']+)';/gm;

/* ── env ของยามเขียนของถาวร / ธงออกเอกสารตอนส่งผล — ตั้งแล้วคืนค่าเดิมเสมอ ────────────────────────────── */
async function withEnv(values, run) {
  const keys = ['VERCEL_ENV', 'SURVEY_REPORT_ISSUE_AT_SEND'];
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) {
    if (values[k] === undefined) delete process.env[k];
    else process.env[k] = values[k];
  }
  try {
    return await run();
  } finally {
    for (const k of keys) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
}
const PROD_ON = { VERCEL_ENV: 'production', SURVEY_REPORT_ISSUE_AT_SEND: 'on' };

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
   ตัวกรองอื่น (or · gte · ilike …) ผ่านทุกแถว — ใช้กับตัวโหลดประกอบของสามเส้นซึ่งเทสต์นี้ไม่ได้ตัดสิน
   `hook(q, api)` ถูกเรียกก่อนทุกคำสั่ง — คืน `{ data, error }` เพื่อแทนคำตอบ · โยน = คำสั่งโยน · คืน undefined = ปกติ
     (`api.exec(q)` = รันคำสั่งนั้นจริงโดยไม่ผ่าน hook — ใช้จำลอง "อีกคำขอแทรกหลังคำสั่งนี้")
   `trigger: false` = ทริกเกอร์ 0401 ⑤ ไม่ยิง (ฐานที่ยังไม่รัน migration / ทริกเกอร์ถูกถอด) */
const WRITES = ['insert', 'update', 'upsert', 'delete'];
function fakeDb(seed = {}, { hook = null, trigger = true } = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([t, rows]) => [t, rows.map((r) => structuredClone(r))]));
  const calls = [];
  const rpcs = [];
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
  /* 0401 ⑤ — AFTER UPDATE OF "answeredAt": NOT NULL → NULL บนหัวข้อ site_survey ⇒ ฉบับที่ใช้อยู่ถูกแทนที่
     เหตุ: "reopenedAt" เปลี่ยนในคำสั่งเดียวกัน = 'reopen' · ไม่เปลี่ยน = 'recall' */
  const supersede = (old, row) => {
    if (old.answeredAt == null || row.answeredAt != null || row.kind !== 'site_survey') return;
    for (const report of rowsOf('service_survey_reports')) {
      if (report.requestId !== row.id || report.status !== 'current') continue;
      report.status = 'superseded';
      report.supersededAt = '2026-10-01T09:00:00.000000+00:00';
      report.supersededReason = (old.reopenedAt ?? null) !== (row.reopenedAt ?? null) ? 'reopen' : 'recall';
    }
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
      for (const row of out) {
        const old = { ...row };
        Object.assign(row, structuredClone(q.payload));
        if (trigger && q.table === 'dept_requests') supersede(old, row);
      }
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
  const api = { tables, calls, rpcs, exec };
  const run = (q) => hook?.(q, api) ?? exec(q);

  const from = (table) => {
    const q = {
      table, filters: [], orders: [], write: null, payload: null, options: null,
      select: undefined, limit: null, range: null, single: null, head: false,
    };
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
    /* 🔴 สามเส้นนี้ห้ามออกเลข · ห้ามแตะที่เก็บไฟล์ — เรียกเมื่อไรเทสต์ต้องรู้ */
    rpc: async (name, args) => { rpcs.push({ name, args }); return { data: null, error: null }; },
    storage: { from() { throw new Error('เส้นนี้ห้ามแตะ storage'); } },
    auth: { admin: { getUserById: async () => ({ data: { user: null }, error: { status: 404, message: 'User not found' } }) } },
    of: (table) => calls.filter((c) => c.table === table),
    reads: (table) => calls.filter((c) => c.table === table && !c.write),
    writes: (table) => calls.filter((c) => c.table === table && c.write),
    rows: (table) => rowsOf(table),
  });
}

/* ── ของตั้งต้น ─────────────────────────────────────────────────────────────────────────────── */
/* รูปที่ PostgREST คืนจริง: ไมโครวินาที + `+00:00` — ตัวอ่านต้องเทียบเป็นจุดเวลา ไม่ใช่สตริง */
const ANSWERED_AT = '2026-10-01T05:00:00.123456+00:00';
const REQ = Object.freeze({
  id: 'REQ-1', docNo: 'RQ-TS-26100001', kind: 'site_survey', dept: 'TS', status: 'answered',
  title: 'ประเมินพื้นที่ โรงแรมทดสอบ', requestedById: 'sa-1', requestedByName: 'เซลเอ', team: 'KA',
  customerId: null, customerName: 'บริษัท เอสล่า จำกัด', dealId: null, siteId: null,
  answeredAt: ANSWERED_AT, answeredById: 'u-head', answeredByName: 'อานนท์',
  closedAt: null, closedById: null, closedByName: null, cancelledAt: null,
  reopenedAt: null, reopenWaitSide: null, createdAt: '2026-09-28T02:00:00+00:00',
});
const OPEN_REQ = Object.freeze({ ...REQ, status: 'acknowledged', answeredAt: null, answeredById: null, answeredByName: null });
/* คำร้องหัวข้ออื่นที่ฝ่ายตอบแล้ว — ผู้ขอกด "ยังไม่จบ" ได้เหมือนกัน แต่ไม่มีเอกสารประเมินให้พูดถึง */
const INFO_REQ = Object.freeze({
  ...REQ, id: 'REQ-INFO', docNo: 'RQ-RD-26100007', kind: 'info', dept: 'RD', title: 'สอบถามสูตร',
});

const HEAD = { id: 'u-head', name: 'อานนท์', role: 'ts_manager', department: 'TS' };
const CREW = { id: 'u-tech', name: 'ช่างเอ', role: 'ts', department: 'TS' };
const PLANNER = { id: 'u-plan', name: 'ผู้จัดคิว', role: 'ts_planner', department: 'TS' };
const REQUESTER = { id: 'sa-1', name: 'เซลเอ', role: 'ae', team: 'ODM' };

/* ของที่ห้ามออกจาก payload ไม่ว่าทางไหน — ใส่เครื่องหมายไว้ในค่าด้วย เผื่อคีย์ถูกเปลี่ยนชื่อระหว่างทาง */
const SECRET = { snapshot: 'SECRET-SNAPSHOT', customerHtml: 'SECRET-CUSTOMER-HTML', internalHtml: 'SECRET-INTERNAL-HTML' };
const reportRow = (extra = {}) => ({
  id: 'SVR-SECRET-1', requestId: 'REQ-1', baseNo: 'SU-26100001', rev: 0, docNo: 'SU-26100001-0',
  status: 'current', supersededAt: null, supersededReason: null,
  snapshot: { marker: SECRET.snapshot, customer: { name: 'บริษัท เอสล่า จำกัด' }, zones: [{ spots: [{ id: 'spot-1' }] }] },
  images: [{ sha: 'a'.repeat(64), attId: 'ATT-SECRET-1', kind: 'spot' }],
  customerHtml: `<html>${SECRET.customerHtml}</html>`,
  internalHtml: `<html>${SECRET.internalHtml}</html>`,
  rendererVersion: 'survey-report/1', frozenAt: '2026-10-01T05:01:00+00:00',
  customerPdfPath: 'pdf/SVR-SECRET-1/customer.pdf', internalPdfPath: 'pdf/SVR-SECRET-1/internal.pdf',
  approvedById: 'u-head', approvedByName: 'อานนท์', approvedAt: ANSWERED_AT,
  issuedById: 'u-head', issuedByName: 'อานนท์', issuedAt: '2026-10-01T05:00:05+00:00',
  updatedAt: '2026-10-01T05:01:00+00:00',
  ...extra,
});
/* ฉบับของรอบส่งก่อนหน้า — ถูกแทนที่ไปแล้วตั้งแต่ตอนดึงผลกลับรอบนั้น */
const OLD_ROUND_AT = '2026-09-29T03:00:00.000000+00:00';
const oldRoundRow = () => reportRow({
  id: 'SVR-SECRET-0', status: 'superseded', supersededAt: '2026-09-30T01:00:00+00:00', supersededReason: 'recall',
  approvedAt: OLD_ROUND_AT, issuedAt: '2026-09-29T03:00:04+00:00',
  customerPdfPath: 'pdf/SVR-SECRET-0/customer.pdf', internalPdfPath: 'pdf/SVR-SECRET-0/internal.pdf',
});
const zoneRows = () => [
  { id: 'SZ-1', requestId: 'REQ-1', zoneId: 'ZN-1', zoneName: 'ล็อบบี้', status: 'ok', sortOrder: 1, packageQty: 2, packageSize: 'ST' },
  { id: 'SZ-2', requestId: 'REQ-1', zoneId: 'ZN-2', zoneName: 'ห้องอาหาร', status: 'ok', sortOrder: 2, packageQty: 1, packageSize: 'SM' },
];
const seed = ({ request = REQ, reports = [reportRow()], extra = {} } = {}) => ({
  dept_requests: [request],
  service_survey_zones: zoneRows(),
  service_survey_reports: reports,
  ...extra,
});

const REASON = 'ตัวเลขพื้นที่ล็อบบี้ผิด ต้องวัดใหม่';
const voidedSentence = (docNo) => `เอกสาร ${docNo} ใช้ไม่ได้แล้ว ห้ามใช้ฉบับที่ส่งลูกค้าไปแล้ว`;
const voidedNote = (docNo) => ` · ${voidedSentence(docNo)}`;
/* กระดิ่งตัดข้อความของแถวเธรดที่ 500 ตัว (`notifyThreadUpdate`) — ตัวเลขเดียวกับที่เส้นจริงใช้ */
const BELL_CLIP = 500;
const recall = (db, user = HEAD, body = { reason: REASON }) => callRoute(recallPost, {
  user, db, method: 'POST', path: '/api/service/surveys/REQ-1/recall', params: { id: 'REQ-1' }, body,
});
const getSurvey = (db, user) => callRoute(surveyGet, { user, db, path: '/api/service/surveys/REQ-1', params: { id: 'REQ-1' } });
const getRequest = (db, user, id = 'REQ-1') => callRoute(requestGet, { user, db, path: `/api/sa/requests/${id}`, params: { id } });
const reopen = (db, user, { id = 'REQ-1', reason = 'ลูกค้าขอเพิ่มพื้นที่ชั้นสอง', waitSide = 'dept' } = {}) => callRoute(requestPatch, {
  user, db, method: 'PATCH', path: `/api/sa/requests/${id}`, params: { id }, body: { action: 'reopen', reason, waitSide },
});

const threadRows = (db, kind) => db.rows('entity_updates').filter((row) => row.entityType === 'dept_request' && row.kind === kind);
const auditRows = (db) => db.rows('audit_logs');
/* กระดิ่งที่แถวเธรดชนิดนั้นแจก — หนึ่งแถวต่อผู้รับ (ผู้ขอ `sa-1` เมื่อคนกดไม่ใช่ผู้ขอเอง) */
const bellRows = (db, kind) => {
  const ids = threadRows(db, kind).map((row) => row.id);
  return db.rows('notifications').filter((row) => ids.includes(row.updateId));
};
/* ลำดับของคำสั่ง — "อ่านเอกสารหลัง update คำร้อง" เป็นสัญญา ไม่ใช่รายละเอียด */
const firstIndex = (db, match) => db.calls.findIndex(match);

/* ── ตัวไล่ของรั่ว — คีย์ต้องห้ามทุกชั้น + เครื่องหมายในค่า (เผื่อคีย์ถูกเปลี่ยนชื่อ) ───────────────────── */
const FORBIDDEN_KEYS = ['snapshot', 'customerHtml', 'internalHtml'];
const FORBIDDEN_VALUES = [...Object.values(SECRET), 'SVR-SECRET', 'ATT-SECRET', 'pdf/SVR'];
function leaks(value, trail = '$') {
  if (value == null) return [];
  if (typeof value === 'string') return FORBIDDEN_VALUES.filter((mark) => value.includes(mark)).map((mark) => `${trail} มี ${mark}`);
  if (Array.isArray(value)) return value.flatMap((item, i) => leaks(item, `${trail}[${i}]`));
  if (typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => [
    ...(FORBIDDEN_KEYS.includes(key) ? [`${trail}.${key}`] : []),
    ...leaks(item, `${trail}.${key}`),
  ]);
}

test('ตัวไล่ของรั่วจับได้จริง — คีย์ต้องห้ามชั้นลึก · เครื่องหมายในค่า · id ของแถว · ที่อยู่ไฟล์', () => {
  assert.equal(leaks({ a: [{ b: { snapshot: {} } }] }).length, 1);
  assert.equal(leaks({ note: `x ${SECRET.internalHtml} y` }).length, 1);
  assert.equal(leaks({ current: { id: 'SVR-SECRET-1', path: 'pdf/SVR-SECRET-1/customer.pdf' } }).length, 3);
  assert.deepEqual(leaks({ docNo: 'SU-26100001-0', access: { customer: true }, history: [] }), []);
  /* แถวเอกสารของฐานปลอมต้อง "สกปรก" จริง — ไม่งั้นเทสต์ของรั่วข้างล่างผ่านเพราะไม่มีอะไรให้รั่ว */
  assert.ok(leaks(reportRow()).length >= 6);
});

/* ══ 1. ดึงผลกลับ (§6 · §15 "Recall") ═══════════════════════════════════════════════════════════ */

test('⭐ ดึงผลกลับใบที่มีเอกสาร — เธรด · meta · audit · คำตอบ เอ่ยเลข SU ที่เพิ่งใช้ไม่ได้ · เหตุผลยังแกะได้', async () => {
  const db = fakeDb(seed());
  const { status, json } = await recall(db);
  assert.equal(status, 200, json.error);

  /* ทริกเกอร์ของฐานเป็นคนแทนที่ — เส้นนี้ไม่มี update ลงตารางเอกสารเอง */
  assert.equal(db.rows('service_survey_reports')[0].status, 'superseded');
  assert.equal(db.rows('service_survey_reports')[0].supersededReason, 'recall');
  assert.deepEqual(db.writes('service_survey_reports'), []);
  assert.deepEqual(db.rpcs, []);

  assert.equal(json.supersededReport, 'SU-26100001-0');
  assert.equal(json.request.answeredAt, null);
  assert.equal(json.request.status, 'acknowledged');
  const totals = surveyTotals(zoneRows());
  assert.deepEqual(json.totals, JSON.parse(JSON.stringify(totals)));

  const rows = threadRows(db, 'recall');
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(totals.packageQty, 3, 'ของตั้งต้นต้องมีตัวเลขจริงให้ตรึง');
  assert.ok(row.body.startsWith(`TS ดึงผลประเมินกลับมาแก้ — ${REASON} · ตัวเลขที่ส่งไปแล้ว 2 พื้นที่ · ${totals.areaSqm} ตร.ม. · 3 แพ็คเกจ`), row.body);
  assert.ok(row.body.endsWith(` — อย่าเพิ่งใช้ตั้งราคา${voidedNote('SU-26100001-0')}`), row.body);
  /* meta: ตัวเลขเดิม (รอบส่งถัดไปหยิบมาเทียบ) + เลขที่เอกสาร — ไม่มี id ของแถวเอกสาร (= ที่อยู่ไฟล์ PDF) */
  assert.deepEqual(row.meta, { totals: json.totals, supersededDocNo: 'SU-26100001-0' });
  assert.equal(row.authorId, 'u-head');
  /* ตัวแกะเหตุผลตัดทุกอย่างหลัง "· ตัวเลขที่ส่งไปแล้ว" ทิ้ง ⇒ ประโยคเอกสารที่ต่อท้ายไม่ปนเข้าเหตุผลบนจอ */
  assert.equal(surveyRecallRecord(row).reason, REASON);
  assert.deepEqual(surveyRecallRecord(row).totals, json.totals);

  const audits = auditRows(db);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'update');
  assert.equal(audits[0].entityType, 'dept_request');
  assert.ok(audits[0].summary.startsWith(`ดึงผลประเมินกลับมาแก้ RQ-TS-26100001 — ${REASON} · ตัวเลขเดิม 2 พื้นที่`), audits[0].summary);
  assert.ok(audits[0].summary.endsWith(voidedNote('SU-26100001-0')), audits[0].summary);

  /* ของรั่ว: คำตอบ · แถวเธรด · audit (before/after เป็นแถวคำร้อง ไม่ใช่แถวเอกสาร) */
  assert.deepEqual(leaks(json), []);
  assert.deepEqual(leaks(rows), []);
  assert.deepEqual(leaks(audits), []);
});

test('🔴 อ่านเลขเอกสาร **หลัง** update คำร้องเท่านั้น — ไม่มีการอ่านแถวเอกสารล่วงหน้า · update กรอง answeredAt ที่ยังไม่ว่าง', async () => {
  const db = fakeDb(seed());
  await recall(db);
  const update = firstIndex(db, (c) => c.table === 'dept_requests' && c.write === 'update');
  const reportRead = firstIndex(db, (c) => c.table === 'service_survey_reports');
  assert.ok(update >= 0 && reportRead > update, `update ${update} · อ่านเอกสาร ${reportRead}`);
  assert.equal(db.reads('service_survey_reports').length, 1);
  /* กลับด้านกับผลวัด: อ่าน **ก่อน** update (ใบยังล็อก = ตัวเลขที่ฝ่ายขายถืออยู่ · อ่านพลาดแล้วยังไม่มีอะไรถูกเขียน) */
  const zoneRead = firstIndex(db, (c) => c.table === 'service_survey_zones');
  assert.ok(zoneRead >= 0 && zoneRead < update, `อ่านผลวัด ${zoneRead} · update ${update}`);
  assert.equal(db.of('service_survey_zones').length, 1);
  assert.deepEqual(db.calls[update].filters, [['eq', 'id', 'REQ-1'], ['not-is', 'answeredAt', null]]);
  assert.equal(db.calls[update].single, 'maybe', 'ศูนย์แถว = คำตอบ ไม่ใช่ error ⇒ maybeSingle');
});

test('⭐ เอกสารที่ RPC เขียนแทรกระหว่าง "อ่านใบ" กับ "update" ยังถูกเอ่ย (ดึงกลับมาถึงกลาง RPC แล้วรอล็อก)', async () => {
  /* ตอนเส้นดึงกลับอ่านใบ ยังไม่มีเอกสาร — RPC ออกเลขถือล็อกแถวคำร้องอยู่ · update ของเราได้ล็อกหลัง RPC commit
     ⇒ ทริกเกอร์แทนที่แถวที่ RPC เพิ่งเขียน · ตัวที่อ่านเอกสารก่อน update จะไม่เห็นแถวนี้เลย */
  const db = fakeDb(seed({ reports: [] }), {
    hook: (q, api) => {
      if (q.table === 'dept_requests' && q.write === 'update') api.tables.service_survey_reports.push(reportRow());
      return undefined;
    },
  });
  const { status, json } = await recall(db);
  assert.equal(status, 200, json.error);
  assert.equal(json.supersededReport, 'SU-26100001-0');
  assert.ok(threadRows(db, 'recall')[0].body.endsWith(voidedNote('SU-26100001-0')));
  assert.equal(db.rows('service_survey_reports')[0].status, 'superseded');
});

test('🔴 กดซ้ำ: อีกคำขอดึงผลกลับไปแล้วระหว่างที่เรายังถือใบที่ "ตอบอยู่" ⇒ 409 · ไม่มีแถวเธรด ไม่มี audit ไม่มีกระดิ่ง', async () => {
  let taken = false;
  const db = fakeDb(seed(), {
    hook: (q, api) => {
      /* คำขอที่สองอ่านใบตอนยังตอบอยู่ (ผ่านด่าน) แล้วคำขอแรก update สำเร็จไปก่อน */
      if (q.table === 'dept_requests' && !q.write && !taken) {
        taken = true;
        const res = api.exec(q);
        Object.assign(api.tables.dept_requests[0], { answeredAt: null, answeredById: null, answeredByName: null, status: 'acknowledged' });
        return res;
      }
      return undefined;
    },
  });
  const { status, json } = await recall(db);
  assert.equal(status, 409);
  assert.equal(json.error, 'ใบนี้ถูกดึงผลกลับไปแล้ว — โหลดหน้าใหม่');
  assert.deepEqual(db.rows('entity_updates'), []);
  assert.deepEqual(db.rows('audit_logs'), []);
  assert.deepEqual(db.rows('notifications'), []);
  /* ตีกลับก่อนอ่านเอกสาร — ไม่มีอะไรให้เอ่ย · ผลวัดถูกอ่านไว้ก่อน update แล้ว (อ่านอย่างเดียว) */
  assert.deepEqual(db.of('service_survey_reports'), []);
  assert.deepEqual(db.writes('service_survey_zones'), []);
});

test('🔴 อ่านผลวัดไม่สำเร็จ ⇒ 500 **ก่อน** เขียนอะไรทั้งสิ้น (ใบยังตอบอยู่ · เอกสารยังใช้อยู่) · กดใหม่สำเร็จ ได้เธรด/กระดิ่ง/audit ครบ', async () => {
  /* 🐞 เดิมอ่านผลวัดหลัง update: คำตอบถูกล้าง + ทริกเกอร์แทนที่เอกสารไปแล้ว แล้วเส้นตอบ 500 โดยไม่มีแถวเธรด/กระดิ่ง/audit
     กดใหม่ได้ 409 "ถูกดึงผลกลับไปแล้ว" ⇒ ฝ่ายขายไม่มีวันรู้ว่าตัวเลขถูกดึงกลับและ SU-…-0 ใช้ไม่ได้แล้ว */
  for (const fail of [
    () => ({ data: null, error: { message: 'connection reset' } }),
    () => { throw new Error('fetch failed'); },
  ]) {
    let broken = true;
    const db = fakeDb(seed(), { hook: (q) => (q.table === 'service_survey_zones' && broken ? fail() : undefined) });
    const { result: first } = await quiet(() => recall(db));
    assert.equal(first.status, 500);
    assert.deepEqual(db.calls.filter((c) => c.write), [], 'อ่านพลาด = ยังไม่มีคำสั่งเขียนสักตัว');
    assert.equal(db.rows('dept_requests')[0].answeredAt, ANSWERED_AT);
    assert.equal(db.rows('dept_requests')[0].status, 'answered');
    assert.equal(db.rows('service_survey_reports')[0].status, 'current');
    assert.deepEqual(db.of('service_survey_reports'), []);
    assert.deepEqual(db.rows('entity_updates'), []);
    assert.deepEqual(db.rows('notifications'), []);

    broken = false;
    const second = await recall(db);
    assert.equal(second.status, 200, second.json.error);
    assert.equal(second.json.supersededReport, 'SU-26100001-0');
    assert.equal(threadRows(db, 'recall').length, 1);
    assert.ok(threadRows(db, 'recall')[0].body.endsWith(voidedNote('SU-26100001-0')));
    assert.equal(auditRows(db).length, 1);
    assert.equal(bellRows(db, 'recall').length, 1);
  }
});

test('ตัวเลขที่ตรึง = ตัวเลขตอนใบยังล็อก — ช่างที่บันทึกแทรกหลังใบปลดล็อกไม่เปลี่ยน "ตัวเลขที่ส่งไปแล้ว"', async () => {
  const db = fakeDb(seed(), {
    hook: (q, api) => {
      /* update ของการดึงกลับปลดล็อกใบ ⇒ ช่างบันทึกผลวัดได้ทันที: จำลองว่าเขาแก้จำนวนแพ็คเกจในช่องนั้น */
      if (q.table === 'dept_requests' && q.write === 'update') {
        const res = api.exec(q);
        api.tables.service_survey_zones[0].packageQty = 99;
        return res;
      }
      return undefined;
    },
  });
  const { status, json } = await recall(db);
  assert.equal(status, 200, json.error);
  const sent = JSON.parse(JSON.stringify(surveyTotals(zoneRows())));
  assert.deepEqual(json.totals, sent);
  assert.deepEqual(threadRows(db, 'recall')[0].meta.totals, sent);
  assert.ok(threadRows(db, 'recall')[0].body.includes(' · 3 แพ็คเกจ'), threadRows(db, 'recall')[0].body);
});

test('🔴 กระดิ่งของการดึงกลับ (ตัดที่ 500) มีประโยคเอกสารครบเสมอ — ใบใหญ่ + เหตุผลยาว: ของที่สั้นลงคือเหตุผล ไม่ใช่คำเตือน', async () => {
  const long = 'ก'.repeat(400);

  /* ใบทั่วไป: เหตุผลในบรรทัดยังตัดที่ 300 ตัวเท่าเดิม และทั้งบรรทัดอยู่ในขอบกระดิ่ง */
  const small = fakeDb(seed());
  assert.equal((await recall(small, HEAD, { reason: long })).status, 200);
  const [smallRow] = threadRows(small, 'recall');
  assert.ok(smallRow.body.startsWith(`TS ดึงผลประเมินกลับมาแก้ — ${'ก'.repeat(300)} · ตัวเลขที่ส่งไปแล้ว`), 'เหตุผลในบรรทัดตัดที่ 300');
  assert.ok(smallRow.body.length <= BELL_CLIP, `${smallRow.body.length}`);

  /* 🐞 ใบ 12 พื้นที่ สี่ขนาด: เหตุผล 300 ตัวตายตัว = บรรทัด 505 ตัว ⇒ กระดิ่งขาด "…ไปแล้ว" ท้ายคำเตือน */
  const sizes = ['ST', 'SM', 'LG', 'XL'];
  const bigZones = Array.from({ length: 12 }, (_, i) => ({
    id: `SZ-${i + 1}`, requestId: 'REQ-1', zoneId: `ZN-${i + 1}`, zoneName: `พื้นที่ ${i + 1}`, status: 'ok', sortOrder: i + 1,
    packageQty: 12, packageSize: sizes[i % sizes.length],
  }));
  const big = fakeDb(seed({ extra: { service_survey_zones: bigZones } }));
  const { status, json } = await recall(big, HEAD, { reason: long });
  assert.equal(status, 200, json.error);
  const [row] = threadRows(big, 'recall');
  assert.ok(row.body.includes(' · 144 แพ็คเกจ (LG 36 · SM 36 · ST 36 · XL 36) — อย่าเพิ่งใช้ตั้งราคา'), row.body.slice(-200));
  const [bell] = bellRows(big, 'recall');
  assert.equal(bell.userId, 'sa-1');
  assert.equal(bell.body, row.body, 'ทั้งบรรทัดอยู่ในกระดิ่ง ไม่มีอะไรถูกตัด');
  assert.ok(bell.body.endsWith(voidedNote('SU-26100001-0')), bell.body.slice(-90));
  /* เหตุผลสั้นลงเท่าที่จำเป็น (ไม่ใช่หายไป) · ตัวแกะของจอยังได้เหตุผลล้วน · ฉบับเต็มอยู่ใน audit */
  const shown = surveyRecallRecord(row).reason;
  assert.match(shown, /^ก+$/);
  assert.ok(shown.length >= 100 && shown.length < 300, `${shown.length}`);
  assert.ok(auditRows(big)[0].summary.includes(long));
});

test('กดสองครั้งต่อกัน: ครั้งแรกสำเร็จ · ครั้งที่สอง 409 จากด่าน — ทั้งสองทางรวมกันได้แถวเธรดแถวเดียว', async () => {
  const db = fakeDb(seed());
  const first = await recall(db);
  assert.equal(first.status, 200, first.json.error);
  const second = await recall(db);
  assert.equal(second.status, 409);
  assert.equal(threadRows(db, 'recall').length, 1);
  assert.equal(auditRows(db).length, 1);
});

test('ใบที่ส่งผลโดยไม่มีเอกสาร (ธงปิด / ออกเลขไม่สำเร็จ) — บรรทัดเดิมทุกตัวอักษร ไม่อ้างเอกสาร', async () => {
  const db = fakeDb(seed({ reports: [] }));
  const { status, json } = await recall(db);
  assert.equal(status, 200, json.error);
  assert.equal(json.supersededReport, null);
  const [row] = threadRows(db, 'recall');
  assert.ok(row.body.endsWith(' — อย่าเพิ่งใช้ตั้งราคา'), row.body);
  assert.equal(row.body.includes('เอกสาร'), false);
  assert.deepEqual(row.meta, { totals: json.totals });
  assert.equal(auditRows(db)[0].summary.includes('เอกสาร'), false);
});

test('เอกสารของรอบส่งก่อนหน้า (ถูกแทนที่ไปแล้ว · approvedAt คนละจุดเวลา) ไม่ถูกเอ่ยว่า "เพิ่งใช้ไม่ได้"', async () => {
  const db = fakeDb(seed({ reports: [oldRoundRow()] }));
  const { status, json } = await recall(db);
  assert.equal(status, 200, json.error);
  assert.equal(json.supersededReport, null);
  assert.equal(threadRows(db, 'recall')[0].body.includes('เอกสาร'), false);
});

test('🔴 ทริกเกอร์ไม่ยิง (ฉบับล่าสุดยังเป็นฉบับที่ใช้อยู่) — ลง log · เธรดไม่อ้างสิ่งที่ฐานไม่ได้ทำ · การดึงกลับยังสำเร็จ', async () => {
  const db = fakeDb(seed(), { trigger: false });
  const { result, lines } = await quiet(() => recall(db));
  assert.equal(result.status, 200, result.json.error);
  assert.equal(result.json.supersededReport, null);
  assert.equal(threadRows(db, 'recall')[0].body.includes('เอกสาร'), false);
  assert.ok(lines.some((line) => line.includes('SU-26100001-0') && line.includes('ทริกเกอร์')), lines.join('\n'));
});

test('อ่านแถวเอกสารไม่สำเร็จ (error · โยน) — การดึงกลับสำเร็จตามเดิม ไม่อ้างเอกสาร ไม่ 500', async () => {
  for (const fail of [
    () => ({ data: null, error: { message: 'connection reset' } }),
    () => { throw new Error('fetch failed'); },
  ]) {
    const db = fakeDb(seed(), { hook: (q) => (q.table === 'service_survey_reports' ? fail() : undefined) });
    const { result } = await quiet(() => recall(db));
    assert.equal(result.status, 200, result.json.error);
    assert.equal(result.json.supersededReport, null);
    assert.equal(threadRows(db, 'recall').length, 1);
    assert.equal(threadRows(db, 'recall')[0].body.includes('เอกสาร'), false);
  }
});

test('ด่านเดิมของการดึงกลับไม่เปลี่ยน — ช่าง 403 · เหตุผลสั้น 400 · ใบที่ยังไม่ส่งผล 409 · ไม่มีการเขียนใด ๆ', async () => {
  const crew = fakeDb(seed());
  assert.equal((await recall(crew, CREW)).status, 403);
  const short = fakeDb(seed());
  assert.equal((await recall(short, HEAD, { reason: 'ผิด' })).status, 400);
  const open = fakeDb(seed({ request: OPEN_REQ, reports: [] }));
  assert.equal((await recall(open)).status, 409);
  for (const db of [crew, short, open]) {
    assert.deepEqual(db.calls.filter((c) => c.write), []);
    assert.deepEqual(db.of('service_survey_reports'), []);
    assert.deepEqual(db.of('service_survey_zones'), [], 'ผลวัดถูกอ่านหลังด่านเท่านั้น');
  }
  /* ช่างยังได้ข้อความของด่านหัวหน้า ไม่ใช่ "เฉพาะฝ่าย TS" ซึ่งเขาอยู่ในฝ่ายนั้นเอง */
  assert.equal((await recall(fakeDb(seed()), CREW)).json.error, 'ดึงผลกลับมาแก้ได้เฉพาะหัวหน้าฝ่ายบริการ');
});

test('🔴 ดึงผลกลับเป็นของใบประเมินพื้นที่ของฝ่ายเราเท่านั้น — หัวข้ออื่น 404 · ใบของฝ่ายอื่น 403 · ไม่มีการเขียน ไม่มีกระดิ่ง', async () => {
  /* 🐞 เดิมด่านถามแค่ตำแหน่ง/สถานะ/เหตุผล ⇒ หัวหน้าฝ่ายบริการยิง id ของคำร้องที่ RD ตอบแล้วมาที่เส้นนี้: คำตอบกับตราปิดถูกล้าง
     ใบกลับเป็น `acknowledged` และผู้ขอได้กระดิ่ง "TS ดึงผลประเมินกลับมาแก้ … 0 พื้นที่ · 0 ตร.ม." */
  const recallOf = (db, user, id) => callRoute(recallPost, {
    user, db, method: 'POST', path: `/api/service/surveys/${id}/recall`, params: { id }, body: { reason: REASON },
  });
  const untouched = (db, row) => {
    assert.deepEqual(db.calls.filter((c) => c.write), []);
    assert.deepEqual(db.rows('entity_updates'), []);
    assert.deepEqual(db.rows('notifications'), []);
    assert.deepEqual(db.of('service_survey_zones'), []);
    assert.deepEqual(db.of('service_survey_reports'), []);
    assert.equal(db.rows('dept_requests')[0].answeredAt, row.answeredAt);
    assert.equal(db.rows('dept_requests')[0].closedAt, row.closedAt);
    assert.equal(db.rows('dept_requests')[0].status, row.status);
  };

  /* หัวข้ออื่น: RD ตอบแล้ว ฝ่ายขายปิดแล้ว — แม้แอดมิน (ตอบได้ทุกฝ่าย) ก็ดึงกลับทางนี้ไม่ได้ */
  const closedInfo = { ...INFO_REQ, status: 'closed', closedAt: '2026-10-01T06:00:00+00:00', closedById: 'sa-1', closedByName: 'เซลเอ' };
  for (const user of [HEAD, { id: 'u-admin', name: 'แอดมิน', role: 'admin' }]) {
    const db = fakeDb({ dept_requests: [closedInfo] });
    const { status, json } = await recallOf(db, user, 'REQ-INFO');
    assert.equal(status, 404, user.role);
    assert.equal(json.error, 'ไม่พบใบประเมินพื้นที่');
    untouched(db, closedInfo);
  }

  /* ใบประเมินที่ส่งถึงฝ่ายอื่น (ไม่ควรมี แต่ด่านต้องไม่พึ่งว่าไม่มี) — หัวหน้าฝ่ายบริการตอบใบของฝ่ายนั้นไม่ได้ ⇒ ดึงกลับไม่ได้ */
  const otherDept = { ...REQ, dept: 'RD' };
  const db = fakeDb(seed({ request: otherDept }));
  const { status, json } = await recall(db);
  assert.equal(status, 403);
  assert.equal(json.error, 'ดึงผลกลับได้เฉพาะฝ่าย RD');
  untouched(db, otherDept);
  assert.equal(db.rows('service_survey_reports')[0].status, 'current');
});

test('ด่านฝ่ายไม่ปิดประตูใส่ใครที่เคยดึงกลับได้ — ทุก role ที่ส่งผลประเมินได้ ยังดึงผลกลับใบของฝ่าย TS ได้', async () => {
  const heads = ROLES.filter((role) => canSendSurveyResult({ role }));
  assert.ok(heads.length >= 4, heads.join(' '));
  for (const role of heads) {
    const db = fakeDb(seed());
    const { status, json } = await recall(db, { id: `u-${role}`, name: role, role });
    assert.equal(status, 200, `${role}: ${json.error}`);
    assert.equal(threadRows(db, 'recall').length, 1, role);
  }
});

/* ══ 2. GET ใบประเมิน — คีย์ `document` (§10 · "Leak" ข้อ 6) ═══════════════════════════════════════ */

const READY = () => [reportRow({ id: 'SVR-SECRET-1', rev: 1, docNo: 'SU-26100001-1' }), oldRoundRow()];

test('🔴 ช่าง / Planner บน GET ใบประเมิน ได้ `{ access: "none" }` เป๊ะ — ไม่มีการอ่านแถวเอกสารเลย', async () => {
  for (const user of [CREW, PLANNER]) {
    const db = fakeDb(seed({ reports: READY() }));
    const { status, json } = await getSurvey(db, user);
    assert.equal(status, 200, json.error);
    assert.deepEqual(json.document, { access: 'none' }, user.role);
    assert.deepEqual(db.of('service_survey_reports'), [], user.role);
    assert.deepEqual(leaks(json), [], user.role);
    /* คีย์เดิมของคำตอบอยู่ครบ — จอช่างอ่านจากก้อนเดียวกัน */
    for (const key of ['request', 'zones', 'filesByZone', 'visit', 'crew', 'canWrite', 'canDecide', 'packageSizes']) {
      assert.ok(key in json, key);
    }
  }
});

test('⭐ หัวหน้าฝ่ายบน GET ใบประเมิน — สถานะ · ฉบับที่ใช้อยู่ · ประวัติฉบับที่ถูกแทนที่ · ไม่มีภาพนิ่ง/HTML/id/ที่อยู่ไฟล์', async () => {
  const db = fakeDb(seed({ reports: READY() }));
  const { status, json } = await getSurvey(db, HEAD);
  assert.equal(status, 200, json.error);
  const doc = json.document;
  assert.deepEqual(doc.access, { customer: true, internal: true, issue: true, draft: true, history: true });
  assert.equal(doc.state, 'ready');
  assert.deepEqual(Object.keys(doc.current).sort(), [
    'approvedAt', 'approvedByName', 'docNo', 'frozenAt', 'issuedAt', 'issuedByName', 'ready', 'rev',
  ]);
  assert.equal(doc.current.docNo, 'SU-26100001-1');
  assert.deepEqual(doc.current.ready, { customer: true, internal: true });
  assert.deepEqual(doc.history, [{
    docNo: 'SU-26100001-0', rev: 0, issuedAt: '2026-09-29T03:00:04+00:00',
    supersededAt: '2026-09-30T01:00:00+00:00', supersededReason: 'recall',
  }]);
  /* มีฉบับที่ใช้อยู่ ⇒ ไม่มีอะไรให้ตรวจ: `send` / `issue` เป็น null · ไม่มีเลขถัดไป */
  assert.equal(doc.send, null);
  assert.equal(doc.issue, null);
  assert.equal(doc.nextDocNo, null);
  assert.equal(doc.issueAtSend, false);
  assert.equal(doc.storeAllowed, false);
  assert.deepEqual(leaks(json), []);
  assert.equal(db.reads('service_survey_reports').length, 1);
  assert.deepEqual(db.writes('service_survey_reports'), []);
  assert.deepEqual(db.rpcs, []);
});

test('ผู้ขอ (ฝ่ายขาย) บน GET ใบประเมิน — ได้ฉบับลูกค้าอย่างเดียว · ไม่มีคีย์ history / nextDocNo / send / issue', async () => {
  const db = fakeDb(seed({ reports: READY() }));
  const { status, json } = await getSurvey(db, REQUESTER);
  assert.equal(status, 200, json.error);
  const doc = json.document;
  assert.deepEqual(doc.access, { customer: true, internal: false, issue: false, draft: false, history: false });
  for (const key of ['history', 'nextDocNo', 'send', 'issue', 'voids']) assert.equal(key in doc, false, key);
  assert.equal(doc.current.docNo, 'SU-26100001-1');
  assert.deepEqual(leaks(json), []);
});

test('⭐ ใบที่ตอบแล้วไม่มีเอกสาร (`missing`) — หัวหน้าได้ผลตรวจของ server ใน `issue` · ตรวจไม่ได้ก็ไม่ทำให้ GET ล้ม', async () => {
  /* ตอบไปนานแล้ว + ธงปิด ⇒ `missing` · ตัวตรวจตัวจริงวิ่งบนฐานปลอมที่ไม่มีไซต์/บริษัท/แบบฟอร์ม ⇒ มีเหตุขวางแน่นอน */
  const db = fakeDb(seed({ request: { ...REQ, answeredAt: '2026-09-20T05:00:00+00:00' }, reports: [] }));
  const { result } = await quiet(() => getSurvey(db, HEAD));
  assert.equal(result.status, 200, result.json.error);
  const doc = result.json.document;
  assert.equal(doc.state, 'missing');
  assert.equal(doc.current, null);
  assert.equal(doc.send, null);
  assert.deepEqual(Object.keys(doc.issue).sort(), ['blockers', 'unknown', 'warnings']);
  assert.ok(doc.issue.blockers.length > 0, 'ฐานว่าง = ต้องมีเหตุขวาง');
  for (const b of doc.issue.blockers) {
    assert.ok(['content', 'system'].includes(b.kind));
    assert.equal(typeof b.text, 'string');
  }
  /* ช่างบนใบเดียวกัน: ไม่มีการตรวจ ไม่มีการอ่านเอกสาร */
  const crewDb = fakeDb(seed({ request: { ...REQ, answeredAt: '2026-09-20T05:00:00+00:00' }, reports: [] }));
  assert.deepEqual((await getSurvey(crewDb, CREW)).json.document, { access: 'none' });
  assert.deepEqual(crewDb.of('service_survey_reports'), []);
});

test('🔴 ธงปิด: ตัวตรวจเนื้อเอกสาร (ตัวโหลดข้อมูลเอกสารทั้งชุด) วิ่งเฉพาะ หัวหน้า × ใบที่ตอบแล้ว × ไม่มีเอกสาร — ที่อื่นไม่จ่าย', async () => {
  /* ราคาที่สเปก §10 ยอมรับ ("for heads only") และ docs/survey-report-doc.md จดไว้ใต้ "ราคาที่จ่ายแม้สวิตช์ปิด" — เทสต์นี้ล็อก **ขอบเขต**:
     ใครขยายให้ตัวตรวจวิ่งบนใบที่ยังไม่ตอบ / ใบที่มีเอกสาร / คนที่ออกเอกสารไม่ได้ ขณะธงปิด = จอช่างและฝ่ายขายช้าลงโดยไม่มีใครใช้ผล
     ⚠️ เครื่องหมายของ "ตัวโหลดวิ่ง" = การอ่านแบบฟอร์มเอกสาร — GET ใบประเมินเองไม่เคยอ่านตารางนี้ */
  const loaderRan = (db) => db.of('document_standard_versions').length > 0;
  const OLD = { ...REQ, answeredAt: '2026-09-20T05:00:00+00:00' };
  await withEnv({}, async () => {
    const paid = fakeDb(seed({ request: OLD, reports: [] }));
    const { result } = await quiet(() => getSurvey(paid, HEAD));
    assert.equal(result.json.document.state, 'missing');
    assert.equal(loaderRan(paid), true, 'เครื่องหมายต้องจับได้จริงในเคสที่ตัวตรวจวิ่ง');

    for (const [label, user, state] of [
      ['หัวหน้า · ใบยังไม่ตอบ', HEAD, { request: OPEN_REQ, reports: [] }],
      ['หัวหน้า · ดึงผลกลับแล้ว', HEAD, { request: OPEN_REQ, reports: [oldRoundRow()] }],
      ['หัวหน้า · มีเอกสารพร้อม', HEAD, { request: REQ, reports: READY() }],
      ['ผู้ขอ · ตอบแล้วไม่มีเอกสาร', REQUESTER, { request: OLD, reports: [] }],
      ['ช่าง · ตอบแล้วไม่มีเอกสาร', CREW, { request: OLD, reports: [] }],
      ['Planner · ตอบแล้วไม่มีเอกสาร', PLANNER, { request: OLD, reports: [] }],
    ]) {
      const db = fakeDb(seed(state));
      const { result: res } = await quiet(() => getSurvey(db, user));
      assert.equal(res.status, 200, `${label}: ${res.json.error}`);
      assert.equal(loaderRan(db), false, label);
      assert.equal(res.json.document.send ?? null, null, label);
      assert.equal(res.json.document.issue ?? null, null, label);
    }
  });
});

test('ธงออกเอกสารตอนส่งผลเปิด + ใบยังไม่ส่งผล — หัวหน้าได้ `send` (เหตุขวางเป็นข้อความ + คำเตือนให้ส่งกลับ) · ช่างยังได้ none', async () => {
  await withEnv(PROD_ON, async () => {
    const db = fakeDb(seed({ request: OPEN_REQ, reports: [] }));
    const { result } = await quiet(() => getSurvey(db, HEAD));
    assert.equal(result.status, 200, result.json.error);
    const doc = result.json.document;
    assert.equal(doc.issueAtSend, true);
    assert.equal(doc.storeAllowed, true);
    assert.equal(doc.state, 'not_sent');
    assert.equal(doc.issue, null);
    assert.deepEqual(Object.keys(doc.send).sort(), ['blockers', 'unknown', 'warnings']);
    for (const text of doc.send.blockers) assert.equal(typeof text, 'string');
    /* GET ไม่ออกเลข ไม่เขียนอะไร แม้อยู่บน production และธงเปิด */
    assert.deepEqual(db.rpcs, []);
    assert.deepEqual(db.calls.filter((c) => c.write), []);

    const crewDb = fakeDb(seed({ request: OPEN_REQ, reports: [] }));
    assert.deepEqual((await getSurvey(crewDb, CREW)).json.document, { access: 'none' });
    assert.deepEqual(crewDb.of('service_survey_reports'), []);
  });
});

test('อ่านแถวเอกสารไม่สำเร็จ — GET ใบประเมินยัง 200 · `document.unknown` บอกว่าไม่รู้ ไม่ใช่ตอบว่าไม่มีเอกสาร', async () => {
  for (const fail of [
    () => ({ data: null, error: { message: 'connection reset' } }),
    () => { throw new Error('fetch failed'); },
  ]) {
    const db = fakeDb(seed(), { hook: (q) => (q.table === 'service_survey_reports' ? fail() : undefined) });
    const { result } = await quiet(() => getSurvey(db, HEAD));
    assert.equal(result.status, 200, result.json.error);
    assert.equal(result.json.document.unknown, true);
    assert.equal(result.json.document.state, null);
    assert.equal(result.json.document.current, null);
    assert.equal(result.json.zones.length, 2, 'ผลวัดซึ่งเป็นเนื้อหลักของจอยังมาครบ');
  }
});

/* ══ 3. GET คำร้อง — คีย์ `surveyDocument` (§10 · "Leak" ข้อ 6) ═════════════════════════════════════ */

test('🔴 Planner บน GET คำร้อง ได้แค่ `access` กับ `voids` — พอให้โมดัล "ยังไม่จบ" บอกผลของการกด (#1223)', async () => {
  const db = fakeDb(seed({ reports: READY() }));
  const { status, json } = await getRequest(db, PLANNER);
  assert.equal(status, 200, json.error);
  assert.deepEqual(json.surveyDocument, { access: 'none', voids: 'SU-26100001-1' });
  assert.deepEqual(leaks(json), []);
});

test('ผู้ขอบน GET คำร้อง — ฉบับลูกค้า + `voids` · ไม่มี history / nextDocNo / send / issue', async () => {
  const db = fakeDb(seed({ reports: READY() }));
  const { status, json } = await getRequest(db, REQUESTER);
  assert.equal(status, 200, json.error);
  const doc = json.surveyDocument;
  assert.deepEqual(doc.access, { customer: true, internal: false, issue: false, draft: false, history: false });
  assert.equal(doc.voids, 'SU-26100001-1');
  assert.equal(doc.state, 'ready');
  assert.deepEqual(doc.current.ready, { customer: true, internal: true });
  for (const key of ['history', 'nextDocNo', 'send', 'issue']) assert.equal(key in doc, false, key);
  assert.deepEqual(leaks(json), []);
  assert.equal(db.reads('service_survey_reports').length, 1, 'อ่านแถวเอกสารรอบเดียว — `voids` มาจากการอ่านเดียวกัน');
});

test('หัวหน้าฝ่ายบน GET คำร้อง — ประวัติ + voids · **ไม่ตรวจเนื้อเอกสาร** ที่เส้นนี้ แม้ใบจะอยู่สถานะ missing', async () => {
  const ready = fakeDb(seed({ reports: READY() }));
  const full = (await getRequest(ready, HEAD)).json.surveyDocument;
  assert.equal(full.history.length, 1);
  assert.equal(full.voids, 'SU-26100001-1');
  assert.equal(full.send, null);
  assert.equal(full.issue, null);

  const missing = fakeDb(seed({ request: { ...REQ, answeredAt: '2026-09-20T05:00:00+00:00' }, reports: [] }));
  const { status, json } = await getRequest(missing, HEAD);
  assert.equal(status, 200, json.error);
  assert.equal(json.surveyDocument.state, 'missing');
  assert.equal(json.surveyDocument.issue, null, 'ผลตรวจเป็นของ GET ใบประเมินเท่านั้น');
  assert.equal(json.surveyDocument.voids, null);
  /* ตัวตรวจอ่านมาตรฐานเอกสาร/ข้อมูลบริษัท — เส้นนี้ต้องไม่ไปถึงตรงนั้น */
  assert.deepEqual(missing.of('document_standards'), []);
  assert.deepEqual(missing.of('document_standard_versions'), []);
});

test('🔴 คำร้องหัวข้ออื่น — ไม่มีคีย์ `surveyDocument` และไม่อ่านแถวเอกสารเลย', async () => {
  const db = fakeDb({ dept_requests: [INFO_REQ], service_survey_reports: [reportRow({ requestId: 'REQ-INFO' })] });
  const { status, json } = await getRequest(db, REQUESTER, 'REQ-INFO');
  assert.equal(status, 200, json.error);
  assert.equal('surveyDocument' in json, false);
  assert.deepEqual(db.of('service_survey_reports'), []);
});

test('🔴 ของรั่วต่อ role: ทุก role ใน ROLES × สองเส้น GET × สามสภาพใบ — ไม่มีคีย์/ค่าต้องห้ามในคำตอบไหนเลย', async () => {
  const states = [
    { name: 'ready', request: REQ, reports: READY() },
    { name: 'recalled', request: OPEN_REQ, reports: [oldRoundRow()] },
    { name: 'missing', request: { ...REQ, answeredAt: '2026-09-20T05:00:00+00:00' }, reports: [] },
  ];
  let answered = 0;
  for (const role of ROLES) {
    for (const who of [
      { id: `u-${role}`, name: role, role, department: 'TS', team: 'ODM' },
      { id: 'sa-1', name: role, role, team: 'KA' }, // ผู้ขอ / ทีมเดียวกับใบ
    ]) {
      for (const state of states) {
        for (const [label, get] of [['ใบประเมิน', getSurvey], ['คำร้อง', getRequest]]) {
          const db = fakeDb(seed(state));
          const { result } = await quiet(() => get(db, who));
          const where = `${label} · ${role} · ${who.id} · ${state.name}`;
          assert.ok([200, 403].includes(result.status), `${where}: ${result.status} ${result.json.error}`);
          assert.deepEqual(leaks(result.json), [], where);
          assert.deepEqual(db.calls.filter((c) => c.write), [], where);
          assert.deepEqual(db.rpcs, [], where);
          if (result.status !== 200) continue;
          answered += 1;
          const doc = label === 'ใบประเมิน' ? result.json.document : result.json.surveyDocument;
          assert.ok(doc && (doc.access === 'none' || typeof doc.access === 'object'), where);
          /* ไม่มีสิทธิ์ฉบับภายใน = ไม่ได้ของหัวหน้าฝ่าย (ประวัติ · ผลตรวจ · เลขถัดไป) */
          if (doc.access === 'none' || !doc.access.history) assert.equal('history' in doc, false, where);
          if (doc.access === 'none' || !doc.access.issue) {
            for (const key of ['nextDocNo', 'send', 'issue']) assert.equal(key in doc, false, `${where} · ${key}`);
          }
          if (label === 'ใบประเมิน') assert.equal('voids' in doc, false, where);
        }
      }
    }
  }
  assert.ok(answered > ROLES.length, `ต้องมีคำตอบ 200 ให้ไล่จริง (${answered})`);
});

/* ══ 4. "ยังไม่จบ" (§6 · §15 "Reopen") ══════════════════════════════════════════════════════════ */

test('⭐ "ยังไม่จบ" บนใบประเมินที่มีเอกสารใช้อยู่ — เธรดและ audit เอ่ยเลขที่ · เอกสารถูกแทนที่ด้วยเหตุ reopen', async () => {
  for (const user of [HEAD, REQUESTER]) {
    const db = fakeDb(seed());
    const { status, json } = await reopen(db, user);
    assert.equal(status, 200, `${user.role}: ${json.error}`);
    assert.equal(json.answeredAt, null);

    const [report] = db.rows('service_survey_reports');
    assert.equal(report.status, 'superseded');
    assert.equal(report.supersededReason, 'reopen');
    assert.deepEqual(db.writes('service_survey_reports'), [], 'ทริกเกอร์ของฐานเป็นคนแทนที่ — route ไม่เขียนตารางเอกสาร');

    const rows = threadRows(db, 'reopen');
    assert.equal(rows.length, 1);
    /* ประโยคเอกสารอยู่ **หน้า** เหตุผลของคนกด — กระดิ่งตัดที่ 500 ตัว เหตุผลยาวได้ถึง 500 (เทสต์ถัดไป) */
    assert.equal(rows[0].body, `ยังไม่จบ — เปิดเรื่องกลับมา · รอ TS ทำต่อ · ${voidedSentence('SU-26100001-0')} · ลูกค้าขอเพิ่มพื้นที่ชั้นสอง`);
    assert.equal('reportId' in rows[0].meta, false);

    const audit = auditRows(db).find((row) => row.entityType === 'dept_request');
    assert.ok(audit.summary.startsWith('ยังไม่จบ — ถอนการปิดของ'), audit.summary);
    assert.ok(audit.summary.endsWith(`ลูกค้าขอเพิ่มพื้นที่ชั้นสอง${voidedNote('SU-26100001-0')}`), audit.summary);

    /* อ่านเอกสารหลัง update คำร้อง · ครั้งเดียว */
    const update = firstIndex(db, (c) => c.table === 'dept_requests' && c.write === 'update');
    const reportRead = firstIndex(db, (c) => c.table === 'service_survey_reports');
    assert.ok(update >= 0 && reportRead > update, `update ${update} · อ่านเอกสาร ${reportRead}`);
    assert.equal(db.reads('service_survey_reports').length, 1);
    const thread = firstIndex(db, (c) => c.table === 'entity_updates' && c.write === 'insert');
    assert.ok(reportRead < thread, 'อ่านเลขที่ก่อนเขียนเธรด');

    assert.deepEqual(leaks(json), []);
    assert.deepEqual(leaks(rows), []);
    assert.deepEqual(leaks(auditRows(db)), []);
    assert.deepEqual(db.rpcs, []);
  }
});

test('🔴 เหตุผลยาวสุด 500 ตัว — ประโยคเอกสารอยู่ครบทั้งในเธรด (ตัดที่ 1,000) **และในกระดิ่ง (ตัดที่ 500)**', async () => {
  /* 🐞 เดิมประโยคต่อท้ายเหตุผล: เหตุผลราว 420 ตัวขึ้นไป กระดิ่งเหลือแค่ "ยังไม่จบ — เปิดเรื่องกลับมา … <เหตุผล>"
     ("ใช้ไม่ได้แล้ว" หลุดขอบ · 500 ตัวเลข SU หายด้วย) ทั้งที่กระดิ่งคือเหตุผลเดียวที่ hook นี้มีอยู่ (สเปก §6) */
  const reason = 'ก'.repeat(500);
  for (const waitSide of ['dept', 'requester']) {
    const db = fakeDb(seed());
    const { status, json } = await reopen(db, HEAD, { reason, waitSide });
    assert.equal(status, 200, json.error);
    const [row] = threadRows(db, 'reopen');
    /* เธรด: ประโยคเอกสาร + เหตุผลครบทุกตัว ไม่มีอะไรถูกตัด */
    assert.ok(row.body.endsWith(` · ${voidedSentence('SU-26100001-0')} · ${reason}`), row.body.slice(0, 160));
    /* กระดิ่งถึงผู้ขอ: 500 ตัวแรกของแถวเดียวกัน — ของที่หลุดขอบคือหางของเหตุผล ไม่ใช่คำเตือน */
    const [bell] = bellRows(db, 'reopen');
    assert.equal(bell.userId, 'sa-1');
    assert.equal(bell.body, row.body.slice(0, BELL_CLIP));
    assert.ok(row.body.length > BELL_CLIP, 'เคสนี้ต้องยาวเกินขอบกระดิ่งจริง');
    assert.ok(bell.body.includes(` · ${voidedSentence('SU-26100001-0')} · กกก`), bell.body.slice(0, 160));
  }
});

test('🔴 หัวข้ออื่นกด "ยังไม่จบ" — ไม่อ่านแถวเอกสารเลย · บรรทัดเดิมทุกตัวอักษร', async () => {
  const db = fakeDb({ dept_requests: [INFO_REQ], service_survey_reports: [reportRow({ requestId: 'REQ-INFO' })] });
  const { status, json } = await reopen(db, REQUESTER, { id: 'REQ-INFO' });
  assert.equal(status, 200, json.error);
  assert.deepEqual(db.of('service_survey_reports'), []);
  const [row] = threadRows(db, 'reopen');
  assert.ok(row.body.endsWith('ลูกค้าขอเพิ่มพื้นที่ชั้นสอง'), row.body);
  assert.equal(auditRows(db).find((a) => a.entityType === 'dept_request').summary.includes('เอกสาร'), false);
  /* แถวเอกสารที่ (ไม่ควรมี) ของหัวข้ออื่นไม่ถูกแตะ — ทริกเกอร์ผูกกับ site_survey หัวข้อเดียว */
  assert.equal(db.rows('service_survey_reports')[0].status, 'current');
});

test('ใบประเมินที่ฝ่ายยังไม่ตอบ (ผู้ขอถอนตราปิดของตัวเอง) — ไม่มีคำตอบให้ล้าง ⇒ ไม่อ่านแถวเอกสาร', async () => {
  const closedByRequester = {
    ...OPEN_REQ, closedAt: '2026-10-01T06:00:00+00:00', closedById: 'sa-1', closedByName: 'เซลเอ',
  };
  const db = fakeDb(seed({ request: closedByRequester, reports: [oldRoundRow()] }));
  const { status, json } = await reopen(db, REQUESTER);
  assert.equal(status, 200, json.error);
  assert.deepEqual(db.of('service_survey_reports'), []);
  assert.equal(threadRows(db, 'reopen')[0].body.includes('เอกสาร'), false);
});

test('ใบประเมินที่ตอบแล้วแต่ไม่มีเอกสาร / มีแต่ของรอบก่อน — อ่านหนึ่งครั้ง ไม่อ้างเอกสาร', async () => {
  for (const reports of [[], [oldRoundRow()]]) {
    const db = fakeDb(seed({ reports }));
    const { status, json } = await reopen(db, HEAD);
    assert.equal(status, 200, json.error);
    assert.equal(db.reads('service_survey_reports').length, 1);
    assert.ok(threadRows(db, 'reopen')[0].body.endsWith('ลูกค้าขอเพิ่มพื้นที่ชั้นสอง'));
  }
});

test('🔴 "ยังไม่จบ": ทริกเกอร์ไม่ยิง / อ่านเอกสารพลาด — ไม่อ้างเอกสาร · การเปิดใบกลับยังสำเร็จ', async () => {
  const stale = fakeDb(seed(), { trigger: false });
  const first = await quiet(() => reopen(stale, HEAD));
  assert.equal(first.result.status, 200, first.result.json.error);
  assert.equal(threadRows(stale, 'reopen')[0].body.includes('เอกสาร'), false);
  assert.ok(first.lines.some((line) => line.includes('SU-26100001-0') && line.includes('ทริกเกอร์')), first.lines.join('\n'));

  const broken = fakeDb(seed(), {
    hook: (q) => (q.table === 'service_survey_reports' ? { data: null, error: { message: 'connection reset' } } : undefined),
  });
  const second = await quiet(() => reopen(broken, HEAD));
  assert.equal(second.result.status, 200, second.result.json.error);
  assert.equal(threadRows(broken, 'reopen').length, 1);
  assert.equal(threadRows(broken, 'reopen')[0].body.includes('เอกสาร'), false);
});

test('"ยังไม่จบ" ที่ถูกตีกลับ (ไม่มีเหตุผล · ไม่บอกว่ารอใคร) — ไม่มีการเขียน ไม่อ่านแถวเอกสาร', async () => {
  const noReason = fakeDb(seed());
  assert.equal((await reopen(noReason, HEAD, { reason: '' })).status, 400);
  const noSide = fakeDb(seed());
  assert.equal((await reopen(noSide, HEAD, { waitSide: null })).status, 400);
  for (const db of [noReason, noSide]) {
    assert.deepEqual(db.calls.filter((c) => c.write), []);
    assert.deepEqual(db.of('service_survey_reports'), []);
    assert.equal(db.rows('service_survey_reports')[0].status, 'current');
  }
});

/* ══ 4ข. คำตอบ "ต้องยืนยันหน้างานไหม" ถูกล้างเมื่อผลถูกเปิดกลับ (ประเมินจากแบบ งวด S2a · mig 0408) ═════════════
   คำตอบเป็นของรอบที่ส่งไปแล้ว — ระหว่างแก้ วิธีประเมินของพื้นที่เปลี่ยนได้ ⇒ ส่งรอบใหม่หัวหน้าต้องเลือกใหม่
   สองเส้นนี้ไม่ปฏิเสธอะไรเพิ่ม · ไม่อ่านอะไรเพิ่ม */

const recallWrite = (db) => db.writes('dept_requests').find((c) => c.write === 'update');
/* ใบจากแบบที่ส่งผลแล้วและตอบว่า "ต้องยืนยันหน้างาน" · พื้นที่ทั้งสองเป็นจากแบบ */
const DESK_REQ = Object.freeze({ ...REQ, surveyConfirm: 'needed' });
const deskSeed = (request = DESK_REQ, extra = {}) => ({
  ...seed({ request, reports: [] }),
  service_survey_zones: zoneRows().map((z) => ({ ...z, method: 'drawing' })),
  ...extra,
});

test('⭐ ดึงผลกลับ: คำสั่งเขียนลงใบพก `surveyConfirm: null` เสมอ — ใบจากแบบถูกล้างคำตอบ · ใบลงหน้างานได้คีย์เดียวกัน (ค่าว่าง)', async () => {
  const desk = fakeDb(deskSeed());
  const first = await recall(desk);
  assert.equal(first.status, 200, first.json.error);
  assert.deepEqual(recallWrite(desk).payload, {
    answeredAt: null, answeredById: null, answeredByName: null,
    closedAt: null, closedById: null, closedByName: null,
    status: 'acknowledged',
    surveyConfirm: null,
    updatedAt: recallWrite(desk).payload.updatedAt,
  });
  assert.equal(desk.rows('dept_requests')[0].surveyConfirm, null);
  assert.equal(first.json.request.surveyConfirm, null);
  assert.equal(threadRows(desk, 'recall').length, 1);

  // ใบลงหน้างานล้วน (คอลัมน์ว่างอยู่แล้ว) — คำสั่งเดียวกัน ไม่มีคำตอบอื่น ไม่มีการอ่านเพิ่ม
  const onsite = fakeDb(seed());
  assert.equal((await recall(onsite)).status, 200);
  assert.equal(recallWrite(onsite).payload.surveyConfirm, null);
  assert.deepEqual(Object.keys(recallWrite(onsite).payload), Object.keys(recallWrite(desk).payload));
  assert.deepEqual(
    onsite.calls.filter((c) => !c.write).map((c) => c.table),
    desk.calls.filter((c) => !c.write).map((c) => c.table),
    'ใบจากแบบไม่ถูกอ่านอะไรเพิ่มจากใบลงหน้างาน',
  );
});

test('🔴 ดึงผลกลับไม่ถูกปฏิเสธเพราะพื้นที่เดียวกันมีใบประเมินใบหลัง (ใบยืนยันหน้างานของงวดถัดไป) — ดึงกลับได้ตามเดิม', async () => {
  /* ใบที่สองบนโซนเดียวกัน เปิดทีหลัง ยังไม่ตอบ และชี้กลับมาที่ใบนี้ — เส้นดึงกลับไม่อ่านและไม่ถามถึงมัน */
  const later = {
    ...OPEN_REQ, id: 'REQ-2', docNo: 'RQ-TS-26100009', createdAt: '2026-10-03T02:00:00+00:00', surveyConfirmOfId: 'REQ-1',
  };
  const db = fakeDb(deskSeed(DESK_REQ, {
    dept_requests: [DESK_REQ, later],
    service_survey_zones: [
      ...zoneRows().map((z) => ({ ...z, method: 'drawing' })),
      { id: 'SZ-9', requestId: 'REQ-2', zoneId: 'ZN-1', zoneName: 'ล็อบบี้', status: 'ok', sortOrder: 1 },
    ],
  }));
  const { status, json } = await recall(db);
  assert.equal(status, 200, json.error);
  assert.equal(db.rows('dept_requests').find((r) => r.id === 'REQ-1').surveyConfirm, null);
  // ใบหลังไม่ถูกแตะ และไม่ถูกอ่าน
  assert.deepEqual(db.rows('dept_requests').find((r) => r.id === 'REQ-2'), later);
  assert.equal(db.calls.some((c) => c.filters.some(([, , val]) => val === 'REQ-2')), false);
});

test('⭐ "ยังไม่จบ": ใบประเมินได้ `surveyConfirm: null` · หัวข้ออื่นไม่มีคีย์นี้ในคำสั่งเขียน · ไม่มีใครถูกปฏิเสธ', async () => {
  for (const user of [HEAD, REQUESTER]) {
    const db = fakeDb(deskSeed());
    const { status, json } = await reopen(db, user);
    assert.equal(status, 200, `${user.role}: ${json.error}`);
    const { payload } = recallWrite(db);
    assert.equal('surveyConfirm' in payload, true, user.role);
    assert.equal(payload.surveyConfirm, null, user.role);
    assert.equal(db.rows('dept_requests')[0].surveyConfirm, null, user.role);
    assert.equal(json.surveyConfirm, null, user.role);
  }

  // ใบประเมินลงหน้างานล้วนก็ได้คีย์ (ค่าว่างอยู่แล้ว) — ตัดสินจากหัวข้อของใบ ไม่ใช่จากวิธีประเมินของแถวพื้นที่
  const onsite = fakeDb(seed());
  assert.equal((await reopen(onsite, HEAD)).status, 200);
  assert.equal(recallWrite(onsite).payload.surveyConfirm, null);

  // ผู้ขอถอนตราปิดของตัวเองบนใบประเมินที่ฝ่ายยังไม่ตอบ — ยังเป็นใบประเมิน ได้คีย์เหมือนกัน
  const closedByRequester = { ...OPEN_REQ, closedAt: '2026-10-01T06:00:00+00:00', closedById: 'sa-1', closedByName: 'เซลเอ' };
  const open = fakeDb(seed({ request: closedByRequester, reports: [] }));
  assert.equal((await reopen(open, REQUESTER)).status, 200);
  assert.equal(recallWrite(open).payload.surveyConfirm, null);

  // 🔴 หัวข้ออื่น: คอลัมน์ของใบประเมินไม่ถูกส่งไปกับคำร้อง (บทเรียน mig 0351)
  const info = fakeDb({ dept_requests: [INFO_REQ] });
  const other = await reopen(info, REQUESTER, { id: 'REQ-INFO' });
  assert.equal(other.status, 200, other.json.error);
  assert.equal('surveyConfirm' in recallWrite(info).payload, false);
  assert.equal(recallWrite(info).payload.status, 'acknowledged');
});

/* ══ 5. ซอร์สของสามเส้น (§14 · มติ 24 · มติ 34) ═════════════════════════════════════════════════ */

test('🔴 สามเส้น import เอกสารประเมินได้เฉพาะตัวอ่านแถว — ไม่มี import แบบ lazy ของหนัก · ไม่ออกเลข ไม่แตะที่เก็บไฟล์', () => {
  for (const file of ROUTES) {
    const src = code(file);
    const specs = [
      ...[...src.matchAll(STATIC_IMPORT)].map((m) => m[1]),
      ...[...src.matchAll(/\bimport\(\s*['"`]([^'"`]+)['"`]\s*\)/g)].map((m) => m[1]),
    ];
    const reportSpecs = specs.filter((spec) => /surveyReport/.test(spec));
    assert.deepEqual([...new Set(reportSpecs)], ['@/lib/service/surveyReportRows'], file);
    for (const spec of specs) {
      assert.equal(/sharp|puppeteer|chromium|htmlPdf|documents\/|\/drive$/.test(spec), false, `${file} import ${spec}`);
    }
    assert.equal(src.includes('issue_survey_report'), false, file);
    assert.equal(/\.storage\b/.test(src), false, file);
    assert.equal(src.includes("from('service_survey_reports')"), false, `${file}: อ่านแถวเอกสารผ่านตัวอ่านกลางเท่านั้น`);
    /* บรรทัดเธรด "ออกเอกสารประเมินแล้ว" เป็นของ route เอกสารเส้นเดียว (มติ 34) */
    assert.equal(read(file).includes('report_issued'), false, file);
  }
});

test('🔴 เส้น import แบบ static ทั้งสายของสามเส้น (ไล่ทุกชั้น) ไม่ถึง sharp · chromium · googleapis · ตัวเรนเดอร์/ขั้นออกเลข', () => {
  const resolve = (from, spec) => {
    const base = spec.startsWith('@/') ? path.join('src', spec.slice(2)) : path.join(path.dirname(from), spec);
    return [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')]
      .find((p) => fs.existsSync(path.join(WEBAPP, p)) && fs.statSync(path.join(WEBAPP, p)).isFile()) || null;
  };
  for (const route of ROUTES) {
    const seen = new Set();
    const packages = new Set();
    const walk = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const m of code(file).matchAll(STATIC_IMPORT)) {
        const spec = m[1];
        if (spec.startsWith('.') || spec.startsWith('@/')) {
          const next = resolve(file, spec);
          assert.ok(next, `แกะ import '${spec}' ของ ${file} ไม่ได้`);
          walk(next);
        } else {
          packages.add(spec);
        }
      }
    };
    walk(route);
    assert.ok(seen.size >= 20, `${route}: ไล่ได้จริง (${seen.size} ไฟล์)`);
    assert.ok(seen.has('src/lib/service/surveyReportRows.js'), `${route}: ต้องถึงตัวอ่านแถว`);
    for (const heavy of ['sharp', 'puppeteer-core', '@sparticuz/chromium', 'googleapis']) {
      assert.equal([...packages].some((p) => p === heavy || p.startsWith(`${heavy}/`)), false, `${route} → แพ็กเกจ ${heavy}`);
    }
    const reached = [...seen].map((f) => path.basename(f));
    for (const heavy of ['htmlPdf.js', 'drive.js', 'surveyReportInputs.js', 'surveyReportSnapshot.js', 'surveyReportLayout.js',
      'surveyReportDocument.js', 'surveyReportView.js', 'surveyReportIssue.js', 'surveyReportImages.js', 'surveyReportPaper.js',
      'quotationDocumentFonts.js']) {
      assert.equal(reached.includes(heavy), false, `${route} → ${heavy}`);
    }
  }
});

test('ซอร์สของเส้นดึงกลับ: ยามกดซ้ำอยู่บน update · อ่านเลขเอกสารหลัง update · ประโยคเอกสารต่อท้ายตัวเลข', () => {
  const src = code(RECALL_ROUTE);
  const update = src.indexOf('.update(patch)');
  const guard = src.indexOf(".not('answeredAt', 'is', null)");
  const voided = src.indexOf('surveyReportVoided(supabase');
  assert.ok(update > 0 && guard > update && guard - update < 80, 'ยามอยู่บนคำสั่ง update เดียวกัน');
  assert.match(src.slice(update, update + 200), /\.select\(\)\.maybeSingle\(\)/);
  assert.equal(src.includes('.single()'), false);
  assert.ok(voided > guard, 'อ่านเลขเอกสารหลัง update');
  /* ผลวัดกลับด้าน: อ่านก่อน update และหลัง update ไม่มีการอ่านที่โยนได้เหลืออยู่ */
  assert.equal(src.split('loadSurveyZones(supabase').length - 1, 1);
  assert.ok(src.indexOf('loadSurveyZones(supabase') < update, 'อ่านผลวัดก่อน update');
  assert.ok(src.indexOf('surveyRecallError(request') < src.indexOf('loadSurveyZones(supabase'), 'อ่านผลวัดหลังด่าน');
  /* ด่านหัวข้อ/ฝ่าย อยู่ก่อนด่านของปุ่มและก่อนการเขียนทุกตัว */
  const kindGate = src.indexOf("if (request.kind !== 'site_survey') return notFound(");
  const deptGate = src.indexOf('!canAnswerRequest(user, request)');
  assert.ok(kindGate > 0 && deptGate > kindGate && deptGate < src.indexOf('surveyRecallError(request'), 'หัวข้อ → ฝ่าย → ด่านของปุ่ม');
  assert.match(src, /answeredAt: request\.answeredAt/, 'ส่ง answeredAt ที่อ่านไว้ก่อน update');
  assert.match(src, /if \(!data\) return conflict\('ใบนี้ถูกดึงผลกลับไปแล้ว — โหลดหน้าใหม่'\);/);
  /* การเรียกเขียนเธรดยังเป็นค่าคงที่ — ยาม `updateKindCallSites.test.mjs` อ่านจากตรงนี้ */
  assert.match(src, /entityType: 'dept_request', entityId: id, kind: 'recall'/);
  assert.ok(src.indexOf('อย่าเพิ่งใช้ตั้งราคา') < src.indexOf('+ voidedNote'), 'ประโยคเอกสารอยู่ท้ายตัวเลข');
});

test('ซอร์สของสอง GET และ hook "ยังไม่จบ": ตัวเลือกของสรุป · สรุปล้มไม่ลาก GET · hook แคบเฉพาะ site_survey ที่ตอบแล้ว', () => {
  const survey = code(SURVEY_ROUTE);
  assert.match(survey, /surveyDocumentSummary\(supabase, request, user, \{ withChecks: true, zones \}\)\.catch\(/);
  assert.match(survey, /document: reportDoc,/);
  /* อยู่ในรอบขนานเดียวกับของประกอบอื่น — ไม่เพิ่มรอบเดินทางให้จอช่าง */
  const parallel = survey.slice(survey.indexOf('await Promise.all(['), survey.indexOf('const filesByZone'));
  assert.ok(parallel.includes('surveyDocumentSummary('), 'ต้องอยู่ใน Promise.all ก้อนเดิม');
  assert.equal(survey.includes('surveyReportVoided'), false);

  const request = code(REQUEST_ROUTE);
  assert.match(request, /row\.kind === 'site_survey'\s*\? surveyDocumentSummary\(getSupabaseAdmin\(\), row, user, \{ withVoids: true \}\)\.catch\(/);
  assert.equal(request.includes('withChecks'), false, 'GET คำร้องไม่ตรวจเนื้อเอกสาร');
  assert.match(request, /\.\.\.\(surveyDocument \? \{ surveyDocument \} : \{\}\),/);
  assert.match(request, /if \(action === 'reopen' && before\.kind === 'site_survey' && before\.answeredAt\) \{/);
  assert.equal(request.split('surveyReportVoided(').length - 1, 1, 'hook เดียว ที่เดียว');
  const hook = request.indexOf('surveyReportVoided(');
  assert.ok(hook > request.indexOf(".from('dept_requests').update(patch).eq('id', id)"), 'หลัง update');
  assert.ok(hook < request.indexOf('await appendRequestEvent(supabase, {'), 'ก่อนเขียนเธรด');
  assert.ok(hook < request.lastIndexOf("user, action: 'update', entityType: 'dept_request', entityId: id, before, after, summary, request,"), 'ก่อน audit');
  assert.match(request, /answeredAt: before\.answeredAt/);
});

test('ประโยค "เอกสาร … ใช้ไม่ได้แล้ว" เป็นประโยคเดียวกันทั้งเส้นดึงกลับและ "ยังไม่จบ"', () => {
  /* เส้นดึงกลับต่อท้ายตัวเลข (นำด้วย " · ") · "ยังไม่จบ" วางหน้าเหตุผลในเธรด — ตัวประโยคต้องเป็นตัวเดียวกันทุกตัวอักษร */
  const sentence = /เอกสาร \$\{voidedDocNo\} ใช้ไม่ได้แล้ว ห้ามใช้ฉบับที่ส่งลูกค้าไปแล้ว`/g;
  assert.equal((code(RECALL_ROUTE).match(sentence) || []).length, 1);
  assert.equal((code(REQUEST_ROUTE).match(sentence) || []).length, 1);
});
