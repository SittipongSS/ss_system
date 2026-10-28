// ── ใบยืนยันหน้างาน (ประเมินจากแบบ งวด S5 กลุ่ม B) — ชีวิตของลิงก์บน route คำร้อง + route ดึงผลกลับ ─────────────────────
//
// ⭐ ล็อกห้าเรื่อง:
//   ① ด่านตอนยื่น (B-2) — N2 · N3 · ไม่เหลือพื้นที่ · N11 (ใบพี่น้อง / ใบลงหน้างานที่ไม่ผูก) · N25 · N6a / N6b · ตีกลับแล้วแถวพื้นที่
//      ไม่ถูกแตะ (ไม่ตั้งวิธี · ไม่ออกรหัสพื้นที่ · ไม่ออกเลข) · 🔴 อ่านใบต้นทาง/บริบทพัง = 500 ไม่ใช่ "ลิงก์ลอย" (F4)
//   ② ล็อกวิธีประเมิน (B-6 · R2) — `update` ที่ขอ `'drawing'` บนใบยืนยัน = 409 N25 ก่อนเขียนอะไร · ใบธรรมดาเดินทาง S4 เดิม
//   ③ บรรทัดบนเธรดของใบต้นทาง — เปิดใบ (ครั้งเดียวต่อใบ) · ยกเลิก / ปิดโดยไม่ได้ประเมิน (หางเฉพาะพื้นที่ยังรอ) · "ยังไม่จบ" /
//      ดึงผลกลับ เฉพาะเมื่อเคยประกาศผล (R12) · ร่างที่ไม่เคยส่ง · ลิงก์ลอย = ไม่เขียน
//   ④ 🔴 บล็อกหลัง commit (F13) — ตัวอ่าน/ตัวสร้างประโยคของงวดโยน ⇒ action ยังตอบ 200 และ audit + เหตุการณ์ของ route ยังถูกเขียน
//   ⑤ ไม่มีการปฏิเสธใหม่ — ดึงกลับ / "ยังไม่จบ" ของใบต้นทางที่มีลูกครบสามแบบยังทำได้
//
// ⚠️ เรียก handler **ตัวจริง** ผ่าน supabase ปลอม — hook ของ `crew/routeTestKit.mjs` ถอดตัวอ่านผู้ใช้และ client จริง
//    (ลบ env ของ Supabase ก่อน import · dev DB = prod DB) ⇒ ไม่มีอะไรถึงฐานจริง
// ⚠️ ตัวห่อของงวด (hook ข้างล่าง) ห่อเฉพาะตอน **route** import `surveyConfirmRepo` / `surveyConfirmLink` — ของจริงทุกตัว
//    เว้นแต่เทสต์สั่ง `trip(ชื่อ)` ให้ชื่อนั้นโยน (จำลองบั๊กในตัวสร้างประโยค/ตัวอ่าน) · ไม่ import โมดูลที่แตะ supabaseAdmin แบบ static
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { callRoute } from './crew/routeTestKit.mjs';
import {
  SURVEY_CONFIRM_VARIANT_ERROR, surveyConfirmEndedText, surveyConfirmOpenedText,
} from './surveyConfirmLink.js';

const WEBAPP = process.cwd();
const fileUrl = (rel) => pathToFileURL(path.join(WEBAPP, rel)).href;
const dataUrl = (src) => `data:text/javascript,${encodeURIComponent(src)}`;
/* ตัวห่อ: ส่งออกทุกชื่อของของจริง แล้วทับชื่อที่ระบุด้วยตัวที่โยนได้เมื่อ `globalThis.__s5Trip` มีชื่อนั้น */
const tripWrap = (rel, names) => dataUrl(`
  import * as real from ${JSON.stringify(fileUrl(rel))};
  export * from ${JSON.stringify(fileUrl(rel))};
  const trip = (name, fn) => function tripped(...args) {
    if (globalThis.__s5Trip?.has(name)) throw new Error('trip ' + name);
    return fn.apply(this, args);
  };
  ${names.map((n) => `export const ${n} = trip(${JSON.stringify(n)}, real.${n});`).join('\n  ')}
`);
const WRAPS = {
  '@/lib/service/surveyConfirmRepo': tripWrap('src/lib/service/surveyConfirmRepo.js', [
    'appendSurveyConfirmLines', 'loadSurveyConfirmContext', 'loadSurveyConfirmLink', 'loadSurveyConfirmOriginal',
  ]),
  '@/lib/service/surveyConfirmLink': tripWrap('src/lib/service/surveyConfirmLink.js', [
    'surveyConfirmEndedText', 'surveyConfirmOpenedText', 'surveyConfirmPlan', 'surveyConfirmSubmitMismatch',
    'surveyConfirmZoneStates',
  ]),
};
register(dataUrl(`
  const WRAPS = ${JSON.stringify(WRAPS)};
  export async function resolve(s, c, n) {
    if (Object.hasOwn(WRAPS, s) && /\\/app\\/api\\//.test(c.parentURL || '')) return { url: WRAPS[s], shortCircuit: true };
    return n(s, c);
  }
`));
const { PATCH: requestPatch } = await import('../../app/api/sa/requests/[id]/route.js');
const { POST: recallPost } = await import('../../app/api/service/surveys/[id]/recall/route.js');

const trip = (...names) => { globalThis.__s5Trip = new Set(names); };
test.afterEach(() => { delete globalThis.__s5Trip; });
test.beforeEach((t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'info', () => {});
});

async function withFlag(on, run) {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'SURVEY_DRAWING_METHOD');
  const old = process.env.SURVEY_DRAWING_METHOD;
  if (on) process.env.SURVEY_DRAWING_METHOD = 'on';
  else delete process.env.SURVEY_DRAWING_METHOD;
  try {
    return await run();
  } finally {
    if (had) process.env.SURVEY_DRAWING_METHOD = old;
    else delete process.env.SURVEY_DRAWING_METHOD;
  }
}
const FLAGS = [true, false];

/* ── ฐานข้อมูลปลอม (กรองจริงตาม eq / neq / in / is · range / limit · single / maybeSingle) — ลอกจาก
   `surveyIntakeSubmitRoute.test.mjs` · RPC `assign_dept_request_doc_no` (mig 0243) = ออกเลขเมื่อใบยังไม่มี + เขียน patch ─── */
const WRITES = ['insert', 'update', 'upsert', 'delete'];
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
    return true;
  };
  const exec = (q) => {
    const list = rowsOf(q.table);
    const hit = () => list.filter((row) => q.filters.every(pass(row)));
    let out;
    if (q.write === 'rpc') {
      const row = list.find((r) => same(r.id, q.args.p_id));
      if (!row) return { data: null, error: { message: 'request_not_found' } };
      if (!row.docNo) row.docNo = `${q.args.p_prefix}${'1'.padStart(q.args.p_width, '0')}`;
      Object.assign(row, structuredClone(q.args.p_patch));
      return { data: structuredClone(row), error: null };
    }
    if (q.write === 'insert') {
      out = [].concat(q.payload).map((r) => structuredClone(r));
      list.push(...out);
    } else if (q.write === 'upsert') {
      out = [].concat(q.payload).map((r) => { list.push(structuredClone(r)); return r; });
    } else if (q.write === 'update') {
      out = hit();
      for (const row of out) Object.assign(row, structuredClone(q.payload));
    } else if (q.write === 'delete') {
      out = hit();
      tables[q.table] = list.filter((row) => !out.includes(row));
    } else {
      out = hit();
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
  const api = { tables, calls };
  const run = (q) => hook?.(q, api) ?? exec(q);
  const blank = (table) => ({ table, filters: [], write: null, payload: null, select: undefined, limit: null, range: null, single: null, head: false });
  const from = (table) => {
    const q = blank(table);
    calls.push(q);
    const builder = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return (resolve, reject) => Promise.resolve().then(() => run(q)).then(resolve, reject);
        return (...args) => {
          if (['eq', 'neq', 'in', 'is'].includes(prop)) q.filters.push([prop, args[0], args[1]]);
          else if (WRITES.includes(prop)) { q.write = prop; q.payload = args[0]; }
          else if (prop === 'select') { q.select = args[0] ?? null; if (args[1]?.head) q.head = true; }
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
      const isDoc = name === 'assign_dept_request_doc_no';
      const q = { ...blank(isDoc ? 'dept_requests' : name), write: isDoc ? 'rpc' : null, rpc: name, args };
      calls.push(q);
      if (!q.write) return { data: null, error: null };
      return run(q);
    },
    auth: { admin: {
      listUsers: async ({ page = 1 } = {}) => ({ data: { users: page === 1 ? users : [] }, error: null }),
      getUserById: async () => ({ data: { user: null }, error: { status: 404, message: 'User not found' } }),
    } },
    writes: (table) => calls.filter((c) => (c.write || c.rpc) && (!table || c.table === table)),
    rows: (table) => rowsOf(table),
  });
}

/* ── คน + ของตั้งต้น ─────────────────────────────────────────────────────────────────────────── */
const SALES = { id: 'sa-1', name: 'เซลเอ', role: 'ae', team: 'KA' };
const HEAD = { id: 'u-head', name: 'อานนท์', role: 'ts_manager', department: 'TS' };
const DIRECTORY = [
  { id: 'u-head', email: 'head@example.test', user_metadata: { name: 'อานนท์' }, app_metadata: { role: 'ts_manager', department: 'TS' } },
];
const ORIG_DOC = 'RQ-AS-26100100';
const CHILD_DOC = 'RQ-AS-26100150';
const VISIT = '2026-10-20';
const RESULT = '2026-10-25';
const SITE = { id: 'SITE-1', code: 'SS-0001', name: 'โรงแรมทดสอบ', customerId: 'C-1' };
const REGISTRY_ZONES = [1, 2, 3].map((n) => ({
  id: `SZN-${n}`, siteId: 'SITE-1', code: `ZN-000${n}`, name: `พื้นที่ ${n}`, floor: 'G', isActive: true,
}));

const ORIGINAL = Object.freeze({
  id: 'DR-O', docNo: ORIG_DOC, kind: 'site_survey', dept: 'TS', status: 'answered', variant: 'drawing',
  title: 'ประเมินพื้นที่ โรงแรมทดสอบ', body: 'รายละเอียด', requestedById: 'sa-1', requestedByName: 'เซลเอ', team: 'KA',
  dealId: 'D-1', customerId: 'C-1', customerName: 'บริษัท ทดสอบ จำกัด', siteId: 'SITE-1',
  submittedAt: '2026-10-01T02:10:00.000Z', acknowledgedAt: '2026-10-02T02:00:00.000Z',
  answeredAt: '2026-10-08T03:00:00.000Z', answeredById: 'u-head', answeredByName: 'อานนท์', surveyConfirm: 'needed',
  closedAt: null, cancelledAt: null, createdAt: '2026-10-01T02:00:00.000Z', updatedAt: '2026-10-08T03:00:00.000Z',
});
const original = (over = {}) => ({ ...ORIGINAL, ...over });
/* แถวจากแบบของใบต้นทาง — ส่งผลแล้ว (มีตัวเลข) */
const oRow = (n, over = {}) => ({
  id: `OZ-${n}`, requestId: 'DR-O', zoneId: `SZN-${n}`, zoneName: `พื้นที่ ${n}`, floor: 'G', status: 'ok', sortOrder: n,
  method: 'drawing', parts: [{ label: 'ห้อง', widthM: 6, lengthM: 8, heightM: 3 }], packageSize: 'SM', packageQty: 1,
  surveyedAt: '2026-10-07T02:00:00.000Z', ...over,
});
/* ร่างใบยืนยัน — ลงหน้างาน · ยกพื้นที่ 1 และ 2 มาจากใบต้นทาง */
const child = (over = {}) => ({
  id: 'DR-C', docNo: null, kind: 'site_survey', dept: 'TS', status: 'draft', variant: 'standard', surveyConfirmOfId: 'DR-O',
  title: `ยืนยันหน้างาน — ${ORIGINAL.title}`, body: 'รายละเอียด', urgent: false, urgentReason: null,
  requestedById: 'sa-1', requestedByName: 'เซลเอ', team: 'KA',
  dealId: 'D-1', customerId: 'C-1', customerName: 'บริษัท ทดสอบ จำกัด', siteId: 'SITE-1',
  requestedDueDate: VISIT, requestedDueTime: '10:00', requestedResultDate: RESULT, pdrRefNo: null,
  submittedAt: null, acknowledgedAt: null, answeredAt: null, closedAt: null, cancelledAt: null,
  createdAt: '2026-10-10T02:00:00.000Z', updatedAt: '2026-10-10T02:00:00.000Z',
  ...over,
});
const pending = (over = {}) => child({ status: 'pending', docNo: CHILD_DOC, submittedAt: '2026-10-10T03:00:00.000Z', ...over });
const acknowledged = (over = {}) => pending({ status: 'acknowledged', acknowledgedAt: '2026-10-11T02:00:00.000Z', ...over });
const answered = (over = {}) => acknowledged({
  status: 'answered', answeredAt: '2026-10-12T02:00:00.000Z', answeredById: 'u-head', answeredByName: 'อานนท์', ...over,
});
/* ไฟล์ในช่อง "แบบ / ผังพื้นที่ที่ให้ประเมิน" ของร่าง (รูปแถวจริงของ `attachments`) */
const SPEC_FILE = {
  id: 'ATT-1', entityType: 'dept_request', entityId: 'DR-C', docType: 'spec', fileName: 'แบบ.pdf', metadata: {},
  createdAt: '2026-10-10T02:30:00.000Z',
};
const cRow = (n, over = {}) => ({
  id: `CZ-${n}`, requestId: 'DR-C', zoneId: `SZN-${n}`, zoneName: `พื้นที่ ${n}`, floor: 'G', status: 'ok', sortOrder: n - 1, ...over,
});

/* ใบอื่นบนพื้นที่เดียวกัน (ไม่ผูก) — ลงหน้างาน */
const other = (id, docNo, over = {}) => ({
  id, docNo, kind: 'site_survey', dept: 'TS', status: 'pending', variant: 'standard', title: 'ใบอื่น',
  requestedById: 'sa-2', team: 'KA', dealId: 'D-1', customerId: 'C-1', siteId: 'SITE-1',
  answeredAt: null, closedAt: null, createdAt: '2026-10-09T02:00:00.000Z', ...over,
});
const otherRow = (id, requestId, n, over = {}) => ({
  id, requestId, zoneId: `SZN-${n}`, zoneName: `พื้นที่ ${n}`, floor: 'G', status: 'ok', sortOrder: 0, ...over,
});

const world = ({
  orig = original(), req = child(), oZones = [oRow(1), oRow(2)], cZones = [cRow(1), cRow(2)],
  extraRequests = [], extraZones = [], thread = [], files = [], hook = null,
} = {}) => fakeDb({
  dept_requests: [orig, req, ...extraRequests].filter(Boolean),
  service_survey_zones: [...oZones, ...cZones, ...extraZones],
  service_sites: [SITE],
  service_zones: REGISTRY_ZONES,
  service_visits: [],
  attachments: files,
  entity_updates: thread,
  audit_logs: [],
  notifications: [],
  service_survey_reports: [],
}, { hook, users: DIRECTORY });

const patch = (db, body, user = SALES, id = 'DR-C') => callRoute(requestPatch, {
  user, db, method: 'PATCH', path: `/api/sa/requests/${id}`, params: { id }, body,
});
const submit = (db, user = SALES) => patch(db, { action: 'submit' }, user);
const cancel = (db, user = SALES) => patch(db, { action: 'cancel', cancelReason: 'ลูกค้าเลื่อนงาน' }, user);
const CLOSE_REASON = 'ห้องยังก่อสร้างไม่เสร็จ เข้าไม่ได้';
const closeUnassessed = (db, user = HEAD) => patch(db, { action: 'close-unassessed', reason: CLOSE_REASON }, user);
const reopen = (db, user = SALES, id = 'DR-C') => patch(db, { action: 'reopen', reason: 'ตัวเลขยังไม่ตรง', waitSide: 'dept' }, user, id);
const recall = (db, id = 'DR-C') => callRoute(recallPost, {
  user: HEAD, db, method: 'POST', path: `/api/service/surveys/${id}/recall`, params: { id }, body: { reason: 'ตัวเลขห้องหนึ่งผิด ต้องแก้' },
});

/* แถวเธรดของใบหนึ่ง · บรรทัดของงวดบนใบต้นทาง */
const threadOf = (db, id) => db.rows('entity_updates').filter((r) => r.entityType === 'dept_request' && r.entityId === id);
const confirmLines = (db) => threadOf(db, 'DR-O').filter((r) => String(r.kind).startsWith('survey_confirm'));
const auditOf = (db, id) => db.rows('audit_logs').filter((r) => r.entityId === id);
const isDocNo = (q) => q.rpc === 'assign_dept_request_doc_no';
const isReseedRead = (q) => q.table === 'service_survey_zones' && !q.write && /methodChangedAt/.test(String(q.select || ''));
const ownZoneReads = (db, id) => db.calls.filter((q) => q.table === 'service_survey_zones' && !q.write
  && q.select === '*' && q.filters.some(([op, col, val]) => op === 'eq' && col === 'requestId' && val === id));
const failOn = (pred, message = 'boom') => (q) => (pred(q) ? { data: null, error: { message } } : undefined);
const isOriginalRead = (q) => q.table === 'dept_requests' && !q.write && q.single === 'maybe'
  && q.filters.some(([op, col, val]) => op === 'eq' && col === 'id' && val === 'DR-O');
const isOriginalZones = (q) => q.table === 'service_survey_zones' && !q.write
  && q.filters.some(([op, col, val]) => op === 'eq' && col === 'requestId' && val === 'DR-O');
const isExistingLines = (q) => q.table === 'entity_updates' && !q.write
  && q.filters.some(([op, col, val]) => op === 'in' && col === 'kind' && (val || []).includes('survey_confirm'));
const sentRow = (childId = 'DR-C') => ({
  id: 'EUP-SENT', entityType: 'dept_request', entityId: 'DR-O', kind: 'survey_confirm', body: 'ผลใบยืนยันหน้างาน …',
  meta: { key: `sent:${childId}:2026-10-12T02:00:00.000Z:0`, childId, event: 'sent' }, createdAt: '2026-10-12T02:00:01.000Z',
});

/* ══ ① ด่านตอนยื่น ═══════════════════════════════════════════════════════════════════════════ */

test('⭐ ยื่นร่างใบยืนยันที่ตรงทุกข้อ = 200 · ออกเลข · บรรทัด "เปิดใบ" หนึ่งบรรทัดบนเธรดของใบต้นทาง (สวิตช์เปิดและปิด)', async () => {
  for (const on of FLAGS) {
    await withFlag(on, async () => {
      const db = world();
      const res = await submit(db);
      assert.equal(res.status, 200, JSON.stringify(res.json));
      const row = db.rows('dept_requests').find((r) => r.id === 'DR-C');
      assert.equal(row.status, 'pending');
      assert.ok(row.docNo);
      const lines = confirmLines(db);
      assert.equal(lines.length, 1);
      assert.equal(lines[0].kind, 'survey_confirm');
      assert.equal(lines[0].body, surveyConfirmOpenedText(row));
      assert.equal(lines[0].body, `ฝ่ายขายขอยืนยันหน้างาน — เปิดใบ ${row.docNo}`);
      assert.equal(lines[0].meta.key, 'opened:DR-C');
      assert.equal(lines[0].meta.event, 'opened');
      // เหตุการณ์ของ route เองยังอยู่บนเธรดของใบนี้ · audit ของใบนี้หนึ่งแถว
      assert.ok(threadOf(db, 'DR-C').length >= 1);
      assert.equal(auditOf(db, 'DR-C').length, 1);
    });
  }
});

/* ด่านที่ตีกลับ — ไม่เขียนอะไรเลย: ไม่ตั้งวิธี (ไม่อ่านแบบตัวตั้งวิธี) · ไม่ออกรหัสพื้นที่ (อ่านแถวของใบแค่ครั้งเดียวของ findRequest) ·
   ไม่ออกเลข · สถานะไม่เปลี่ยน · ไม่มีบรรทัดของงวด */
function assertRefusedUntouched(db, at) {
  assert.deepEqual(db.writes(), [], at);
  assert.equal(db.calls.filter(isReseedRead).length, 0, `${at}: ตัวตั้งวิธีของ S4 ต้องไม่ถูกเรียก`);
  assert.equal(ownZoneReads(db, 'DR-C').length, 1, `${at}: materializeSurveyZones ต้องไม่ถูกเรียก`);
  assert.equal(db.calls.filter(isDocNo).length, 0, at);
  assert.equal(db.rows('dept_requests').find((r) => r.id === 'DR-C').status, 'draft', at);
  assert.equal(confirmLines(db).length, 0, at);
}

const N2 = `ใบ ${ORIG_DOC} ยังไม่มีผลที่ส่งแล้ว (อาจถูกดึงผลกลับมาแก้) — รอ TS ส่งผลก่อนจึงขอยืนยันหน้างานได้`;
const N3 = `TS แจ้งว่าใบ ${ORIG_DOC} ไม่ต้องยืนยันหน้างาน — ถ้ายังต้องการให้เข้าวัด เปิดคำร้องประเมินพื้นที่แบบลงหน้างานตามปกติ`;
const NONE_LEFT = `ใบนี้ไม่มีพื้นที่ที่รอยืนยันหน้างานของ ${ORIG_DOC}`;
const N6A = `พื้นที่ของร่างนี้ไม่ตรงกับพื้นที่ที่ยังรอยืนยันหน้างานของ ${ORIG_DOC} แล้ว — ลบร่างนี้ แล้วกด “ขอยืนยันหน้างาน” ที่ใบ ${ORIG_DOC} ใหม่`;
const N6B = `พื้นที่ของใบนี้ไม่ตรงกับพื้นที่ที่ยังรอยืนยันหน้างานของ ${ORIG_DOC} แล้ว — ยกเลิกใบนี้ แล้วกด “ขอยืนยันหน้างาน” ที่ใบ ${ORIG_DOC} ใหม่`;

/* วัดแล้วในใบอื่น (ไม่ผูก · ส่งผลแล้ว · วัดทีหลังผลจากแบบ) */
const measuredElsewhere = (zones) => ({
  extraRequests: [other('DR-X', 'RQ-AS-26100120', { status: 'answered', answeredAt: '2026-10-09T05:00:00.000Z' })],
  extraZones: zones.map((n) => otherRow(`XZ-${n}`, 'DR-X', n, { surveyedAt: '2026-10-09T04:00:00.000Z', packageSize: 'SM', packageQty: 1 })),
});

test('🔴 ด่านตอนยื่น: แต่ละด่านตอบประโยคของตัวเอง · ตีกลับแล้วแถวพื้นที่ไม่ถูกแตะ ไม่ออกเลข (สวิตช์เปิดและปิด)', async () => {
  const cases = [
    ['N2 ใบต้นทางถูกดึงผลกลับ', { orig: original({ answeredAt: null, status: 'acknowledged', surveyConfirm: null }) }, 409, N2],
    ['N3 ใบต้นทางตอบไม่ต้องยืนยัน', { orig: original({ surveyConfirm: 'not_needed' }) }, 409, N3],
    ['ไม่เหลือพื้นที่ — วัดในใบอื่นครบแล้ว', measuredElsewhere([1, 2]), 409, NONE_LEFT],
    // ไฟล์แบบครบ — ด่านไฟล์บังคับของ S4 อยู่ก่อนด่านของงวดนี้ (B-2) จึงต้องผ่านก่อนถึง N25
    ['N25 ร่างถือวิธีจากแบบ', { req: child({ variant: 'drawing' }), files: [SPEC_FILE] }, 409, SURVEY_CONFIRM_VARIANT_ERROR],
    ['N6a ชุดพื้นที่ขาดไปหนึ่ง', { cZones: [cRow(1)] }, 409, N6A],
    ['N6a มีพื้นที่เกิน', { cZones: [cRow(1), cRow(2), cRow(3)] }, 409, N6A],
    ['N6a พื้นที่ใหม่ไม่มี zoneId', { cZones: [cRow(1), cRow(2), cRow(3, { zoneId: null, zoneName: 'ห้องใหม่' })] }, 409, N6A],
    ['N6a ใบอื่นยืนยันพื้นที่ 2 ไปแล้วระหว่างนั้น', measuredElsewhere([2]), 409, N6A],
  ];
  for (const on of FLAGS) {
    for (const [name, fixture, status, error] of cases) {
      await withFlag(on, async () => {
        const db = world(fixture);
        const res = await submit(db);
        const at = `${name} · flag ${on}`;
        assert.equal(res.status, status, `${at}: ${JSON.stringify(res.json)}`);
        assert.equal(res.json.error, error, at);
        assertRefusedUntouched(db, at);
      });
    }
  }
});

test('🔴 N11 — พื้นที่ที่ยกมาถูกใบอื่นที่ยังเปิดถืออยู่ (ใบลงหน้างานที่ไม่ผูก · ใบยืนยันพี่น้อง) = 409 ไม่มีคำว่า "เอารายการนี้ออก"', async () => {
  const cases = [
    ['ใบลงหน้างานที่ไม่ผูก', other('DR-Y', 'RQ-AS-26100200'), 'RQ-AS-26100200'],
    ['ใบยืนยันพี่น้อง', other('DR-C2', 'RQ-AS-26100210', { status: 'acknowledged', surveyConfirmOfId: 'DR-O' }), 'RQ-AS-26100210'],
  ];
  for (const [name, holder, docNo] of cases) {
    const db = world({ extraRequests: [holder], extraZones: [otherRow('HZ-2', holder.id, 2)] });
    const res = await submit(db);
    assert.equal(res.status, 409, name);
    assert.equal(res.json.error, `พื้นที่ พื้นที่ 2: มีใบสั่งวัดค้างอยู่แล้ว ${docNo} — รอใบนั้นจบก่อน`, name);
    assert.doesNotMatch(res.json.error, /เอารายการนี้ออก/, name);
    assertRefusedUntouched(db, name);
  }
});

test('ด่านล็อกพื้นที่ตอนยื่นคือแผนแถว 6 ตัวเดียว — route ไม่เรียกตัวล็อกของ POST (loadZoneSurveyLocks / surveyZoneBusyError)', () => {
  const src = fs.readFileSync(path.join(WEBAPP, 'src/app/api/sa/requests/[id]/route.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.doesNotMatch(src, /surveyZoneBusyError|loadZoneSurveyLocks/);
  assert.match(src, /surveyConfirmPlan\(\{ original, \.\.\.ctx, selfId: id, stage: 'submit' \}\)/);
});

test('🔴 ใบยืนยันที่ถูกตีกลับ (มีเลข · ลบไม่ได้): N6b / N3 บอกให้ยกเลิก · แล้วยกเลิกได้ 200', async () => {
  const bounced = child({ docNo: CHILD_DOC, submittedAt: '2026-10-10T03:00:00.000Z', bouncedAt: '2026-10-10T05:00:00.000Z' });
  for (const [name, fixture, error] of [
    ['N6b', { req: bounced, cZones: [cRow(1)] }, N6B],
    ['N3', { req: bounced, orig: original({ surveyConfirm: 'not_needed' }) }, N3],
  ]) {
    const db = world(fixture);
    const res = await submit(db);
    assert.equal(res.status, 409, name);
    assert.equal(res.json.error, error, name);
    assert.deepEqual(db.writes(), [], name);
    const out = await cancel(db);
    assert.equal(out.status, 200, `${name}: ${JSON.stringify(out.json)}`);
    assert.equal(db.rows('dept_requests').find((r) => r.id === 'DR-C').status, 'cancelled', name);
  }
});

test('🔴 F4 — อ่านใบต้นทางพัง / อ่านบริบทพัง ตอนยื่น = 500 · ไม่ปล่อยผ่านเป็นใบธรรมดา · ไม่เขียนอะไร', async () => {
  for (const [name, pred] of [['ใบต้นทาง', isOriginalRead], ['บริบท (แถวพื้นที่ของใบต้นทาง)', isOriginalZones]]) {
    const db = world({ hook: failOn(pred) });
    const res = await submit(db);
    assert.equal(res.status, 500, name);
    assertRefusedUntouched(db, name);
  }
});

test('ลิงก์ลอย (ใบต้นทางถูกลบ · อ่านสำเร็จแต่ไม่มีแถว) = ส่งเป็นใบธรรมดา 200 · ไม่มีบรรทัดของงวด · ยกเลิกต่อได้ ไม่เขียนอะไรของงวด', async () => {
  const db = world({ orig: null, req: child({ surveyConfirmOfId: 'DR-GONE' }) });
  const res = await submit(db);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(db.rows('entity_updates').filter((r) => String(r.kind).startsWith('survey_confirm')).length, 0);
  const out = await cancel(db);
  assert.equal(out.status, 200, JSON.stringify(out.json));
  assert.equal(db.rows('entity_updates').filter((r) => String(r.kind).startsWith('survey_confirm')).length, 0);
});

/* ══ ② ล็อกวิธีประเมิน (B-6) ════════════════════════════════════════════════════════════════ */

const editBody = (row, over = {}) => ({
  action: 'update', title: row.title, body: row.body, urgent: false, urgentReason: null,
  requestedDueDate: row.requestedDueDate, requestedDueTime: row.requestedDueTime ?? '', requestedResultDate: row.requestedResultDate,
  variant: row.variant, ...over,
});
const TO_DRAWING = { variant: 'drawing', requestedDueDate: '', requestedDueTime: '' };

test('🔴 N25 — update ขอ "drawing" บนร่างใบยืนยัน = 409 ก่อนเขียนอะไร · ไม่มีรอบลองตั้งวิธี (สวิตช์เปิดและปิด)', async () => {
  for (const on of FLAGS) {
    await withFlag(on, async () => {
      const db = world();
      const res = await patch(db, editBody(child(), TO_DRAWING));
      assert.equal(res.status, 409, `flag ${on}`);
      assert.equal(res.json.error, SURVEY_CONFIRM_VARIANT_ERROR);
      assert.deepEqual(db.writes(), []);
      assert.equal(db.calls.filter(isReseedRead).length, 0);
      assert.equal(db.rows('dept_requests').find((r) => r.id === 'DR-C').variant, 'standard');
    });
  }
});

test('ร่างธรรมดา (ไม่ผูก) ขอ "drawing" ตอนสวิตช์เปิด = ทาง S4 เดิม 200 · ร่างใบยืนยันแก้ปกติ (variant standard) = 200', async () => {
  await withFlag(true, async () => {
    const plain = world({ req: child({ surveyConfirmOfId: null }) });
    const res = await patch(plain, editBody(child(), TO_DRAWING));
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(plain.rows('dept_requests').find((r) => r.id === 'DR-C').variant, 'drawing');

    const db = world();
    const ok = await patch(db, editBody(child(), { title: 'ยืนยันหน้างาน — แก้ชื่อ' }));
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    const row = db.rows('dept_requests').find((r) => r.id === 'DR-C');
    assert.equal(row.title, 'ยืนยันหน้างาน — แก้ชื่อ');
    assert.equal(row.variant, 'standard');
    // แถวพื้นที่ยังเป็นลงหน้างาน (ตัวตั้งวิธีของ S4 ไม่มีงานบน 'standard')
    assert.equal(db.rows('service_survey_zones').filter((z) => z.requestId === 'DR-C' && z.method === 'drawing').length, 0);
  });
});

/* ══ ③ บรรทัดบนเธรดของใบต้นทาง ═════════════════════════════════════════════════════════════ */

test('ล้มที่ออกรหัสพื้นที่ (materializeSurveyZones) และที่ออกเลข/เขียนสถานะ แล้วกดใหม่ = เลขเดียว · บรรทัด "เปิดใบ" บรรทัดเดียว', async () => {
  let seenReseed = false;
  let failMaterialize = 1;
  let failDocNo = 1;
  const db = world({
    hook: (q) => {
      if (isReseedRead(q)) seenReseed = true;
      if (seenReseed && failMaterialize > 0 && q.table === 'service_survey_zones' && !q.write && q.select === '*'
        && q.filters.some(([op, col, val]) => op === 'eq' && col === 'requestId' && val === 'DR-C')) {
        failMaterialize -= 1;
        return { data: null, error: { message: 'zones read failed' } };
      }
      if (isDocNo(q) && failDocNo > 0) {
        failDocNo -= 1;
        return { data: null, error: { message: 'rpc failed' } };
      }
      return undefined;
    },
  });
  const first = await submit(db);
  assert.equal(first.status, 500, 'ล้มที่ออกรหัสพื้นที่');
  assert.equal(db.calls.filter(isDocNo).length, 0);
  seenReseed = false;
  const second = await submit(db);
  assert.equal(second.status, 500, 'ล้มที่ออกเลข');
  assert.equal(db.rows('dept_requests').find((r) => r.id === 'DR-C').status, 'draft');
  assert.equal(confirmLines(db).length, 0);
  const third = await submit(db);
  assert.equal(third.status, 200, JSON.stringify(third.json));
  const row = db.rows('dept_requests').find((r) => r.id === 'DR-C');
  assert.equal(row.status, 'pending');
  assert.equal(confirmLines(db).length, 1);
  assert.equal(confirmLines(db)[0].meta.key, 'opened:DR-C');
});

test('เขียนบรรทัด "เปิดใบ" พลาด = ยื่นยังได้ 200 · กดซ้ำได้ "คำร้องนี้ส่งไปแล้ว" และบรรทัดยังขาด (best effort · ลง log)', async () => {
  let failLines = 1;
  const db = world({
    hook: (q) => {
      if (isExistingLines(q) && failLines > 0) { failLines -= 1; return { data: null, error: { message: 'thread read failed' } }; }
      return undefined;
    },
  });
  const res = await submit(db);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(confirmLines(db).length, 0);
  assert.ok(console.error.mock.calls.some((c) => c.arguments.includes('DR-C') && c.arguments.includes('DR-O')), 'ลง log พร้อม id ทั้งสองใบ');
  const again = await submit(db);
  assert.equal(again.status, 409);
  assert.equal(again.json.error, 'คำร้องนี้ส่งไปแล้ว');
  assert.equal(confirmLines(db).length, 0);
});

test('ใบยืนยันที่ถูกตีกลับแล้วยื่นใหม่ = เลขเดิม · ไม่มีบรรทัด "เปิดใบ" ซ้ำ', async () => {
  const db = world();
  assert.equal((await submit(db)).status, 200);
  const docNo = db.rows('dept_requests').find((r) => r.id === 'DR-C').docNo;
  const bounced = await patch(db, { action: 'bounce', reason: 'ขอวันเข้าหน้างานใหม่' }, HEAD);
  assert.equal(bounced.status, 200, JSON.stringify(bounced.json));
  assert.equal(db.rows('dept_requests').find((r) => r.id === 'DR-C').status, 'draft');
  const again = await submit(db);
  assert.equal(again.status, 200, JSON.stringify(again.json));
  assert.equal(db.rows('dept_requests').find((r) => r.id === 'DR-C').docNo, docNo);
  assert.equal(confirmLines(db).length, 1);
});

const ENDED_CANCEL = `ใบยืนยันหน้างาน ${CHILD_DOC} ถูกยกเลิก`;
const TAIL = ' — พื้นที่ยังรอยืนยันหน้างาน';

test('⭐ ยกเลิกใบยืนยันที่ส่งแล้ว — บรรทัดบนใบต้นทาง · หางเฉพาะพื้นที่ยังรอ (ไม่มีหางเมื่อดึงกลับ / not_needed / วัดที่อื่นแล้ว / อ่านบริบทไม่ได้)', async () => {
  const cases = [
    ['พื้นที่ยังรอ', {}, ENDED_CANCEL + TAIL],
    ['ใบต้นทางถูกดึงผลกลับ', { orig: original({ answeredAt: null, status: 'acknowledged', surveyConfirm: null }) }, ENDED_CANCEL],
    ['ใบต้นทางตอบไม่ต้องยืนยัน', { orig: original({ surveyConfirm: 'not_needed' }) }, ENDED_CANCEL],
    ['วัดในใบอื่นครบแล้ว', measuredElsewhere([1, 2]), ENDED_CANCEL],
    ['อ่านบริบทไม่ได้', { hook: failOn(isOriginalZones) }, ENDED_CANCEL],
  ];
  for (const [name, fixture, line] of cases) {
    const db = world({ req: pending(), ...fixture });
    const res = await cancel(db);
    assert.equal(res.status, 200, `${name}: ${JSON.stringify(res.json)}`);
    const lines = confirmLines(db);
    assert.equal(lines.length, 1, name);
    assert.equal(lines[0].body, line, name);
    assert.equal(lines[0].kind, 'survey_confirm', name);
    assert.match(lines[0].meta.key, /^ended:DR-C:cancel:/, name);
    assert.equal(lines[0].meta.event, 'cancel', name);
  }
});

test('ยกเลิกร่างที่ไม่เคยส่ง = ไม่มีบรรทัดบนใบต้นทาง (ไม่อ่านใบต้นทางเลย)', async () => {
  const db = world();
  const res = await cancel(db);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(confirmLines(db).length, 0);
  assert.equal(db.calls.filter(isOriginalRead).length, 0);
});

test('⭐ ปิดโดยไม่ได้ประเมิน — บรรทัด N9 + หาง (พื้นที่ยังรอ) + เหตุผล', async () => {
  const db = world({ req: acknowledged() });
  const res = await closeUnassessed(db);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const [line] = confirmLines(db);
  assert.equal(line.body, `ใบยืนยันหน้างาน ${CHILD_DOC} ถูกปิดโดยไม่ได้ประเมิน${TAIL} · ${CLOSE_REASON}`);
  assert.equal(line.body, surveyConfirmEndedText(db.rows('dept_requests').find((r) => r.id === 'DR-C'), 'close-unassessed', {
    reason: CLOSE_REASON, stillAwaiting: true,
  }));
  assert.match(line.meta.key, /^ended:DR-C:close-unassessed:/);
});

const N10 = `ใบยืนยันหน้างาน ${CHILD_DOC} ถูกเปิดกลับมาแก้ — ผลยืนยันหน้างานที่แจ้งไว้ยังไม่นิ่ง รอ TS ส่งผลใหม่`;

test('⭐ R12 — "ยังไม่จบ" / ดึงผลกลับ ของใบยืนยันที่เคยประกาศผลบนใบต้นทาง = N10 · ไม่เคยประกาศ = ไม่เขียน', async () => {
  for (const [name, act] of [['ยังไม่จบ', (db) => reopen(db)], ['ดึงผลกลับ', (db) => recall(db)]]) {
    const announced = world({ req: answered(), thread: [sentRow()] });
    const res = await act(announced);
    assert.equal(res.status, 200, `${name}: ${JSON.stringify(res.json)}`);
    const lines = confirmLines(announced).filter((r) => r.id !== 'EUP-SENT');
    assert.equal(lines.length, 1, name);
    assert.equal(lines[0].body, N10, name);
    assert.equal(lines[0].meta.event, 'reopened', name);
    assert.match(lines[0].meta.key, /^ended:DR-C:reopened:/, name);

    const silent = world({ req: answered() });
    assert.equal((await act(silent)).status, 200, name);
    assert.equal(confirmLines(silent).length, 0, `${name}: ไม่เคยประกาศผล ⇒ ไม่มีอะไรให้ถอน`);

    // ผลของใบยืนยันใบอื่นที่ประกาศไว้ ไม่นับ
    const sibling = world({ req: answered(), thread: [sentRow('DR-C9')] });
    assert.equal((await act(sibling)).status, 200, name);
    assert.equal(confirmLines(sibling).filter((r) => r.id !== 'EUP-SENT').length, 0, name);
  }
});

test('"ยังไม่จบ" ของใบยืนยันที่ยังไม่เคยตอบ (ผู้ขอถอนตราปิดของตัวเอง) = ไม่อ่านใบต้นทาง ไม่เขียน', async () => {
  const db = world({ req: acknowledged({ closedAt: '2026-10-12T02:00:00.000Z', closedById: 'sa-1' }), thread: [sentRow()] });
  const res = await reopen(db);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(confirmLines(db).filter((r) => r.id !== 'EUP-SENT').length, 0);
  assert.equal(db.calls.filter(isOriginalRead).length, 0);
});

/* ══ ④ บล็อกหลัง commit (F13) ═══════════════════════════════════════════════════════════════ */

test('🔴 F13 — ตัวอ่าน/ตัวสร้างประโยคของงวดโยนหลัง commit: ส่ง · ยกเลิก · ปิดโดยไม่ได้ประเมิน · ยังไม่จบ · ดึงกลับ ยังตอบ 200 + audit + เหตุการณ์ของ route', async () => {
  const cases = [
    ['ส่ง · ตัวเขียนเธรด', ['appendSurveyConfirmLines'], {}, (db) => submit(db)],
    ['ส่ง · ตัวสร้างประโยค', ['surveyConfirmOpenedText'], {}, (db) => submit(db)],
    ['ยกเลิก · ตัวอ่านใบต้นทาง', ['loadSurveyConfirmOriginal'], { req: pending() }, (db) => cancel(db)],
    ['ยกเลิก · ตัวสร้างประโยค', ['surveyConfirmEndedText'], { req: pending() }, (db) => cancel(db)],
    ['ปิดโดยไม่ได้ประเมิน · ตัวจัดสภาพ', ['surveyConfirmZoneStates'], { req: acknowledged() }, (db) => closeUnassessed(db)],
    ['ปิดโดยไม่ได้ประเมิน · ตัวอ่านบริบท', ['loadSurveyConfirmContext'], { req: acknowledged() }, (db) => closeUnassessed(db)],
    ['ยังไม่จบ · ตัวอ่านใบต้นทาง', ['loadSurveyConfirmOriginal'], { req: answered(), thread: [sentRow()] }, (db) => reopen(db)],
    ['ยังไม่จบ · ตัวสร้างประโยค', ['surveyConfirmEndedText'], { req: answered(), thread: [sentRow()] }, (db) => reopen(db)],
    ['ดึงกลับ · ตัวอ่านใบต้นทาง', ['loadSurveyConfirmOriginal'], { req: answered(), thread: [sentRow()] }, (db) => recall(db)],
    ['ดึงกลับ · ตัวสร้างประโยค', ['surveyConfirmEndedText'], { req: answered(), thread: [sentRow()] }, (db) => recall(db)],
  ];
  for (const [name, names, fixture, act] of cases) {
    const db = world(fixture);
    const before = threadOf(db, 'DR-C').length;
    trip(...names);
    const res = await act(db);
    delete globalThis.__s5Trip;
    assert.equal(res.status, 200, `${name}: ${JSON.stringify(res.json)}`);
    assert.equal(auditOf(db, 'DR-C').length, 1, `${name}: audit ของ route`);
    assert.equal(threadOf(db, 'DR-C').length, before + 1, `${name}: เหตุการณ์ของ route บนเธรดของใบนี้`);
    assert.equal(confirmLines(db).filter((r) => r.id !== 'EUP-SENT').length, 0, name);
    assert.ok(console.error.mock.calls.some((c) => String(c.arguments[0]).includes('[surveyConfirm]')), `${name}: ลง log`);
  }
});

test('ตัวห่อทำงานจริง — โยนในด่านตอนยื่น (ก่อน commit) = 500 ไม่เขียนอะไร · ใบที่ไม่ผูกไม่เรียกตัวของงวดเลย', async () => {
  const db = world();
  trip('surveyConfirmPlan');
  const res = await submit(db);
  delete globalThis.__s5Trip;
  assert.equal(res.status, 500);
  assert.equal(res.json.error, 'trip surveyConfirmPlan');
  assertRefusedUntouched(db, 'trip ก่อน commit');

  const plain = world({ req: child({ surveyConfirmOfId: null }) });
  trip('loadSurveyConfirmOriginal', 'loadSurveyConfirmContext', 'surveyConfirmPlan', 'appendSurveyConfirmLines');
  const ok = await submit(plain);
  delete globalThis.__s5Trip;
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(plain.calls.filter(isOriginalRead).length, 0);
});

test('ซอร์ส: บล็อกของงวดใน route คำร้องอยู่หลัง appendRequestEvent ก่อน return · ใน route ดึงกลับอยู่หลัง recordAudit ก่อน return ok', () => {
  const read = (rel) => fs.readFileSync(path.join(WEBAPP, rel), 'utf8');
  const req = read('src/app/api/sa/requests/[id]/route.js');
  const hook = req.indexOf('await surveyConfirmAfterAction(supabase, {');
  const event = req.indexOf('await appendRequestEvent(supabase, {\n      request: after, action,');
  const finalReturn = req.indexOf('    return Response.json({\n      ...after,');
  assert.ok(event > 0 && hook > event && finalReturn > hook, 'opened / ended อยู่หลังเหตุการณ์ของ route');
  assert.equal(req.split('await surveyConfirmAfterAction(').length - 1, 1, 'บล็อกเดียว');
  // ด่านตอนยื่นอยู่ก่อนตัวตั้งวิธีของ S4 และก่อนออกรหัสพื้นที่
  const gate = req.indexOf('await surveyConfirmSubmitGate(supabase, { id, before })');
  assert.ok(gate > 0 && gate < req.indexOf('const reseed = await reseedSurveyZoneMethods(supabase, {\n          requestId: id, variant: before.variant'));
  assert.ok(gate < req.indexOf('await materializeSurveyZones(supabase, {'));
  // ล็อกวิธีอยู่ก่อนด่านสวิตช์ของ S4
  const lock = req.indexOf("if (before.surveyConfirmOfId && next.variant !== undefined && next.variant !== 'standard')");
  assert.ok(lock > 0 && lock < req.indexOf('const variantRefusal = requestNeedsRef(before.kind'));

  const rec = read('src/app/api/service/surveys/[id]/recall/route.js');
  const audit = rec.indexOf('await recordAudit({');
  const block = rec.indexOf('if (request.surveyConfirmOfId && request.answeredAt)');
  const ret = rec.indexOf('return ok({ request: data, totals, supersededReport: voidedDocNo });');
  assert.ok(audit > 0 && block > audit && ret > block);
});

/* ══ ⑤ ไม่มีการปฏิเสธใหม่ ═════════════════════════════════════════════════════════════════════ */

test('🔴 ใบต้นทางที่มีใบยืนยันเปิดอยู่ · ส่งผลแล้ว · ยกเลิกแล้ว — ดึงผลกลับและ "ยังไม่จบ" ทำได้ 200 (ไม่ถูกปฏิเสธเพราะลูก)', async () => {
  const kids = [
    other('DR-K1', 'RQ-AS-26100301', { status: 'pending', surveyConfirmOfId: 'DR-O' }),
    other('DR-K2', 'RQ-AS-26100302', { status: 'answered', answeredAt: '2026-10-12T02:00:00.000Z', surveyConfirmOfId: 'DR-O' }),
    other('DR-K3', 'RQ-AS-26100303', { status: 'cancelled', cancelledAt: '2026-10-11T02:00:00.000Z', surveyConfirmOfId: 'DR-O' }),
  ];
  const zones = [otherRow('KZ-1', 'DR-K1', 1), otherRow('KZ-2', 'DR-K2', 2, { surveyedAt: '2026-10-11T02:00:00.000Z' })];
  const rec = world({ req: null, extraRequests: kids, extraZones: zones });
  const recalled = await recall(rec, 'DR-O');
  assert.equal(recalled.status, 200, JSON.stringify(recalled.json));
  assert.equal(rec.rows('dept_requests').find((r) => r.id === 'DR-O').answeredAt, null);

  const reo = world({ req: null, extraRequests: kids, extraZones: zones });
  const reopened = await reopen(reo, SALES, 'DR-O');
  assert.equal(reopened.status, 200, JSON.stringify(reopened.json));
  // ลูกไม่ถูกแตะ · ไม่มีบรรทัดของงวด (ใบต้นทางไม่ใช่ใบยืนยัน)
  for (const db of [rec, reo]) {
    for (const kid of kids) assert.deepEqual(db.rows('dept_requests').find((r) => r.id === kid.id), kid);
    assert.equal(db.rows('entity_updates').filter((r) => String(r.kind).startsWith('survey_confirm')).length, 0);
  }
});
