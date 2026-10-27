// ── ใบประเมินของใบยืนยันหน้างาน (ประเมินจากแบบ งวด S5 · กลุ่ม E) ─────────────────────────────────────────────
//
// ⭐ สี่ชั้นที่ล็อกไว้:
//   1. **GET ใบประเมิน** แนบคีย์ `confirmOf` เฉพาะใบที่ผูกกับใบต้นทาง และคนดูเป็นหัวหน้า/ผู้วางคิว — ใบอื่นและช่าง
//      **ไม่มีคีย์เลย** (ไม่ใช่ null · กติกา R-KEYS) และ **ไม่มีการอ่านเพิ่มสักคำสั่ง** · อ่านพัง = `unknown.confirmOf` ไม่ใช่ 500
//   2. **หัวงาน** — ข้อ "ยืนยันผลจากแบบของ" ต่อจากข้อวิธีประเมิน/ฝ่ายขายขอ (ใบลงหน้างานล้วน = ข้อแรก) · ใบต้นทางถูกลบ = ไม่มีลิงก์
//      · ไม่ส่ง `confirmOf` = หัวงานเดิมทุกคีย์
//   3. **FactValue** — ข้อที่มี `href` เป็นลิงก์ · ข้อที่ไม่มียังเป็นตัวหนังสือทางเดิม
//   4. **ตาราง** — บรรทัด "รอบจากแบบ (RQ…)" ใต้ชื่อ/ป้ายของแถวที่มีรายการ · แถวที่ตัดออก/หัวหน้าเพิ่มเองไม่มีบรรทัด
//
// ⚠️ เรียก handler **ตัวจริง** ผ่าน supabase ปลอมที่จำแถวได้ — ตัวอ่านผู้ใช้และ client จริงถูกถอดด้วย hook ของ
//    `crew/routeTestKit.mjs` (ลบ env ของ Supabase ทิ้งก่อน import · dev DB = prod DB) ⇒ ไม่มีอะไรถึงฐานจริง
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { callRoute } from './crew/routeTestKit.mjs';
import { surveyJobHeaderView } from './surveyFieldView.js';
import { SURVEY_UNKNOWN_TEXT } from './surveyControl.js';
import {
  SURVEY_CONFIRM_OF_LABEL, SURVEY_CONFIRM_ORIGINAL_MISSING, surveyConfirmPreviousRoundText,
} from './surveyConfirmLink.js';

const { GET: surveyGet } = await import('../../app/api/service/surveys/[id]/route.js');

const WEBAPP = process.cwd();
const read = (p) => fs.readFileSync(path.join(WEBAPP, p), 'utf8');
/* ตัดคอมเมนต์ก่อนตรวจ — คอมเมนต์ในไฟล์เอ่ยชื่อสิ่งที่ตรวจไว้สอนคน */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const ROUTE = 'src/app/api/service/surveys/[id]/route.js';
const HEADER = 'src/components/service/SurveyJobHeader.js';
const HEADER_CSS = 'src/components/service/SurveyJobHeader.module.css';
const TABLE = 'src/components/service/SurveyResultTable.js';
const PAGE = 'src/app/service/surveys/[id]/page.js';
const FIELD_VIEW = 'src/lib/service/surveyFieldView.js';

/* เงียบ console.error ระหว่างเคสที่ตั้งใจให้อ่านพลาด */
async function quiet(run) {
  const original = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = original;
  }
}

/* ── ฐานข้อมูลปลอม (ลอกรูปจาก surveyReportRecallGetReopen.test.mjs — ไม่ export จากไฟล์นั้น) ─────────────────
   กรองจริงตาม eq / neq / in / is · เรียงตาม order · ตัดตาม limit / range · single / maybeSingle
   `hook(q)` ถูกเรียกก่อนทุกคำสั่ง — คืน `{ data, error }` เพื่อแทนคำตอบ · โยน = คำสั่งโยน · คืน undefined = ปกติ */
const WRITES = ['insert', 'update', 'upsert', 'delete'];
function fakeDb(seed = {}, { hook = null } = {}) {
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
    let out = rowsOf(q.table).filter((row) => q.filters.every(pass(row)));
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
  const run = (q) => hook?.(q) ?? exec(q);
  const from = (table) => {
    const q = { table, filters: [], orders: [], write: null, limit: null, range: null, single: null, head: false };
    calls.push(q);
    const builder = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return (resolve, reject) => Promise.resolve().then(() => run(q)).then(resolve, reject);
        return (...args) => {
          if (['eq', 'neq', 'in', 'is'].includes(prop)) q.filters.push([prop, args[0], args[1]]);
          else if (prop === 'not') q.filters.push([`not-${args[1]}`, args[0], args[2]]);
          else if (WRITES.includes(prop)) q.write = prop;
          else if (prop === 'select' && args[1]?.head) q.head = true;
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
  return {
    tables, calls, from,
    rpc: async () => ({ data: null, error: null }),
    storage: { from() { throw new Error('เส้นนี้ห้ามแตะ storage'); } },
    auth: { admin: { getUserById: async () => ({ data: { user: null }, error: { status: 404, message: 'User not found' } }) } },
    writes: () => calls.filter((c) => c.write),
    /* คำสั่งอ่านที่กรองด้วยค่านี้ — "มีใครแตะใบต้นทางไหม" */
    readsOf: (table, col, value) => calls.filter((c) => c.table === table && !c.write
      && c.filters.some(([op, k, v]) => op === 'eq' && k === col && String(v) === String(value))),
  };
}

/* ── ของตั้งต้น ─────────────────────────────────────────────────────────────────────────────── */
const ORIGINAL_DOC = 'RQ-AS-26100345';
const BASE = Object.freeze({
  kind: 'site_survey', dept: 'TS', requestedById: 'sa-1', requestedByName: 'เซลเอ', team: 'KA',
  customerId: null, customerName: 'บริษัท เอสล่า จำกัด', dealId: null, siteId: null,
  closedAt: null, cancelledAt: null, reopenedAt: null, createdAt: '2026-10-20T02:00:00+00:00',
});
const ORIGINAL = Object.freeze({
  ...BASE, id: 'REQ-O', docNo: ORIGINAL_DOC, status: 'answered', variant: 'drawing', surveyConfirm: 'needed',
  title: 'ประเมินพื้นที่ โรงแรมทดสอบ', answeredAt: '2026-10-21T05:00:00+00:00',
});
const CONFIRM = Object.freeze({
  ...BASE, id: 'REQ-C', docNo: 'RQ-AS-26100400', status: 'acknowledged', variant: 'standard',
  title: 'ยืนยันหน้างาน — ประเมินพื้นที่ โรงแรมทดสอบ', answeredAt: null, surveyConfirmOfId: 'REQ-O',
});
const PLAIN = Object.freeze({ ...CONFIRM, id: 'REQ-P', docNo: 'RQ-AS-26100401', title: 'ประเมินพื้นที่ ร้านทดสอบ', surveyConfirmOfId: null });

/* แถวพื้นที่ของใบต้นทาง: สองแถวจากแบบมีตัวเลข · แถวจากแบบที่ตัดออก · แถวจากแบบไม่มีตัวเลข · แถวลงหน้างาน */
const originalZones = () => [
  { id: 'SZ-O1', requestId: 'REQ-O', zoneId: 'ZN-1', zoneName: 'ล็อบบี้', method: 'drawing', status: 'ok', sortOrder: 0, packageQty: 2, packageSize: 'ST' },
  { id: 'SZ-O2', requestId: 'REQ-O', zoneId: 'ZN-2', zoneName: 'ห้องอาหาร', method: 'drawing', status: 'ok', sortOrder: 1, packageQty: 1, packageSize: 'sm' },
  { id: 'SZ-O3', requestId: 'REQ-O', zoneId: 'ZN-3', zoneName: 'ทางเดิน', method: 'drawing', status: 'cut', sortOrder: 2, packageQty: 1, packageSize: 'SM' },
  { id: 'SZ-O4', requestId: 'REQ-O', zoneId: 'ZN-4', zoneName: 'ห้องประชุม', method: 'drawing', status: 'ok', sortOrder: 3, packageQty: null, packageSize: null },
  { id: 'SZ-O5', requestId: 'REQ-O', zoneId: 'ZN-5', zoneName: 'ห้องน้ำ', method: 'onsite', status: 'ok', sortOrder: 4, packageQty: 1, packageSize: 'SM' },
];
/* แถวของใบยืนยัน: สามพื้นที่ที่ยกมา (ลงหน้างาน) + หนึ่งพื้นที่ที่หัวหน้าเพิ่มเอง */
const confirmZones = (requestId = 'REQ-C') => [
  { id: `${requestId}-1`, requestId, zoneId: 'ZN-1', zoneName: 'ล็อบบี้', status: 'ok', sortOrder: 0 },
  { id: `${requestId}-2`, requestId, zoneId: 'ZN-2', zoneName: 'ห้องอาหาร', status: 'ok', sortOrder: 1 },
  { id: `${requestId}-4`, requestId, zoneId: 'ZN-4', zoneName: 'ห้องประชุม', status: 'ok', sortOrder: 2 },
  { id: `${requestId}-9`, requestId, zoneId: 'ZN-9', zoneName: 'ห้องรับรอง', status: 'added', sortOrder: 3 },
];
const seed = ({ request = CONFIRM, original = ORIGINAL } = {}) => ({
  dept_requests: [request, ...(original ? [original] : [])],
  service_survey_zones: [...confirmZones(request.id), ...originalZones()],
});

const HEAD = { id: 'u-head', name: 'อานนท์', role: 'ts_manager', department: 'TS' };
const PLANNER = { id: 'u-plan', name: 'ผู้จัดคิว', role: 'ts_planner', department: 'TS' };
const CREW = { id: 'u-tech', name: 'ช่างเอ', role: 'ts', department: 'TS' };

const getSurvey = (db, user, id = 'REQ-C') => callRoute(surveyGet, { user, db, path: `/api/service/surveys/${id}`, params: { id } });
const expectedPrevious = () => {
  const rows = originalZones();
  return {
    'ZN-1': surveyConfirmPreviousRoundText(rows[0], ORIGINAL_DOC),
    'ZN-2': surveyConfirmPreviousRoundText(rows[1], ORIGINAL_DOC),
  };
};
/* ใบต้นทางถูกแตะไหม — อ่านแถวหัว (id) หรือแถวพื้นที่ (requestId) */
const touchedOriginal = (db) => [
  ...db.readsOf('dept_requests', 'id', 'REQ-O'),
  ...db.readsOf('service_survey_zones', 'requestId', 'REQ-O'),
];

/* ══ 1. GET ใบประเมิน ═══════════════════════════════════════════════════════════════════════════ */

test('⭐ หัวหน้า / ผู้วางคิว บนใบยืนยัน — `confirmOf` = { id, docNo, missing, previousByZone } · รอบจากแบบเฉพาะแถวจากแบบที่มีตัวเลขและไม่ถูกตัด', async () => {
  for (const user of [HEAD, PLANNER]) {
    const db = fakeDb(seed());
    const { status, json } = await getSurvey(db, user);
    assert.equal(status, 200, json.error);
    assert.deepEqual(json.confirmOf, { id: 'REQ-O', docNo: ORIGINAL_DOC, missing: false, previousByZone: expectedPrevious() }, user.role);
    /* ตัวอย่างข้อความจริงหนึ่งบรรทัด — คำของตัวสร้างกลาง ไม่ใช่ของ route */
    assert.match(json.confirmOf.previousByZone['ZN-1'], /^รอบจากแบบ \(RQ-AS-26100345\): /);
    assert.equal(json.unknown.confirmOf, undefined, user.role);
    assert.deepEqual(db.writes(), [], 'GET ไม่เขียนอะไร');
  }
});

test('🔴 ช่างบนใบยืนยัน — ไม่มีคีย์ `confirmOf` และไม่มีการอ่านใบต้นทางเลยสักคำสั่ง', async () => {
  const db = fakeDb(seed());
  const { status, json } = await getSurvey(db, CREW);
  assert.equal(status, 200, json.error);
  assert.equal('confirmOf' in json, false);
  assert.equal(json.unknown.confirmOf, undefined);
  assert.deepEqual(touchedOriginal(db), []);
});

test('🔴 ใบที่ไม่ได้ผูก (ทุกคนดู) — ไม่มีคีย์ `confirmOf` · ไม่มีการอ่านเพิ่ม', async () => {
  for (const user of [HEAD, PLANNER, CREW]) {
    const db = fakeDb(seed({ request: PLAIN }));
    const { status, json } = await getSurvey(db, user, 'REQ-P');
    assert.equal(status, 200, json.error);
    assert.equal('confirmOf' in json, false, user.role);
    assert.equal(json.unknown.confirmOf, undefined, user.role);
    assert.deepEqual(touchedOriginal(db), [], user.role);
  }
});

test('ใบต้นทางถูกลบไปแล้ว — `missing: true` · ไม่มีเลขที่ · ไม่มีรอบจากแบบ · ไม่ใช่ 500', async () => {
  const db = fakeDb(seed({ original: null }));
  const { status, json } = await getSurvey(db, HEAD);
  assert.equal(status, 200, json.error);
  assert.deepEqual(json.confirmOf, { id: 'REQ-O', docNo: null, missing: true, previousByZone: {} });
  assert.equal(json.unknown.confirmOf, undefined);
});

test('🔴 อ่านใบต้นทางไม่สำเร็จ (error · โยน · แถวพื้นที่พัง) — ไม่มีคีย์ `confirmOf` · `unknown.confirmOf` · GET ยัง 200', async () => {
  const failures = {
    'อ่านหัวใบ error': (q) => (q.table === 'dept_requests' && q.filters.some(([, k, v]) => k === 'id' && v === 'REQ-O')
      ? { data: null, error: { message: 'boom' } } : undefined),
    'อ่านหัวใบโยน': (q) => {
      if (q.table === 'dept_requests' && q.filters.some(([, k, v]) => k === 'id' && v === 'REQ-O')) throw new Error('socket hang up');
      return undefined;
    },
    'แถวพื้นที่ของใบต้นทาง error': (q) => (q.table === 'service_survey_zones' && q.filters.some(([, k, v]) => k === 'requestId' && v === 'REQ-O')
      ? { data: null, error: { message: 'timeout' } } : undefined),
  };
  for (const [name, hook] of Object.entries(failures)) {
    const db = fakeDb(seed(), { hook });
    const { status, json } = await quiet(() => getSurvey(db, HEAD));
    assert.equal(status, 200, `${name}: ${json.error}`);
    assert.equal('confirmOf' in json, false, name);
    assert.equal(json.unknown.confirmOf, true, name);
  }
});

test('route: ยิงตัวโหลดในก้อนอ่านขนานรอบเดียว ใต้เงื่อนไขสองข้อ · คีย์แนบด้วย conditional spread · ไม่เอ่ยคอลัมน์ surveyConfirm เปล่า', () => {
  const route = code(ROUTE);
  assert.match(route, /import \{ loadSurveyConfirmSheetInfo \} from '@\/lib\/service\/surveyConfirmRepo';/);
  assert.match(route, /const wantsConfirmOf = !!request\.surveyConfirmOfId && \(canDecide \|\| canEditAll\);/);
  assert.match(route, /Promise\.all\(\[[\s\S]*?loadSiteVisitReached\(supabase, id\)[\s\S]*?wantsConfirmOf \? loadSurveyConfirmSheetInfo\(supabase, request\)[\s\S]*?: null,\s*\]\)/);
  assert.equal((route.match(/loadSurveyConfirmSheetInfo\(/g) || []).length, 1, 'อ่านครั้งเดียว');
  assert.match(route, /if \(confirmInfo\?\.error\) context\.unknown\.confirmOf = true;/);
  assert.match(route, /\.\.\.\(confirmInfo && !confirmInfo\.error \? \{ confirmOf: confirmInfo \} : \{\}\),/);
  assert.doesNotMatch(route, /confirmOf: (?:null|\[\]|confirmInfo \|\|)/, 'R-KEYS — ไม่มีคีย์ว่าง');
  assert.doesNotMatch(route, /\bsurveyConfirm\b/, 'ไม่อยู่ในลิสต์ปิดของคอลัมน์ surveyConfirm');
});

/* ══ 2. หัวงาน ═════════════════════════════════════════════════════════════════════════════════ */

const VISIT = Object.freeze({
  id: 'V1', code: 'SV-26100011', status: 'scheduled', scheduledDate: '2026-10-29', startTime: '10:00:00',
  assigneeId: 'u-tech', assigneeName: 'ช่างเอ',
});
const headerInput = (over = {}) => ({
  request: { ...CONFIRM }, customer: { arCode: 'AR-1', name: 'ลูกค้า' }, site: null, visit: VISIT,
  crew: [{ id: 'u-tech', name: 'ช่างเอ', lead: true, you: false }], unknown: {}, ...over,
});
const LINKED = Object.freeze({ id: 'REQ-O', docNo: ORIGINAL_DOC, missing: false, previousByZone: {} });
const MIXED = { mix: { onsite: 2, drawing: 1, mode: 'mixed' }, needsVisit: true };

test('⭐ หัวงานของใบยืนยันลงหน้างานล้วน — ข้อ "ยืนยันผลจากแบบของ" เป็นข้อแรก · เลขที่เป็นลิงก์ไปหน้าคำร้อง', () => {
  const today = surveyJobHeaderView(headerInput());
  const view = surveyJobHeaderView(headerInput({ confirmOf: LINKED }));
  assert.deepEqual(view.facts[0], { key: 'confirmOf', label: SURVEY_CONFIRM_OF_LABEL, value: ORIGINAL_DOC, href: '/requests/REQ-O' });
  assert.deepEqual(view.facts.slice(1), today.facts, 'ข้ออื่นไม่ขยับ');
  assert.deepEqual({ ...view, facts: null }, { ...today, facts: null }, 'คีย์อื่นของหัวงานไม่ขยับ');
  /* id ที่มีอักขระพิเศษถูก encode */
  const odd = surveyJobHeaderView(headerInput({ confirmOf: { ...LINKED, id: 'DR-a/b?c' } }));
  assert.equal(odd.facts[0].href, '/requests/DR-a%2Fb%3Fc');
});

test('หัวงานของใบผสม — ข้อของใบต้นทางต่อจาก "วิธีประเมิน" และ "ฝ่ายขายขอ" ก่อนข้ออื่นทุกข้อ', () => {
  const mixed = surveyJobHeaderView(headerInput({ method: MIXED, confirmOf: LINKED }));
  assert.deepEqual(mixed.facts.slice(0, 2).map((f) => f.key), ['method', 'confirmOf']);
  /* คำร้องที่ยื่นเป็นจากแบบมีข้อ "ฝ่ายขายขอ" — ใบยืนยันจริงเป็นลงหน้างานเสมอ แต่ลำดับต้องถูกแม้ข้อมูลแปลก */
  const asked = surveyJobHeaderView(headerInput({ request: { ...CONFIRM, variant: 'drawing' }, method: MIXED, confirmOf: LINKED }));
  assert.deepEqual(asked.facts.slice(0, 3).map((f) => f.key), ['method', 'asked', 'confirmOf']);
  const plain = surveyJobHeaderView(headerInput({ request: { ...CONFIRM, variant: 'drawing' }, method: MIXED }));
  assert.deepEqual(asked.facts.filter((f) => f.key !== 'confirmOf'), plain.facts);
});

test('ใบต้นทางถูกลบ — ค่าเป็นคำว่าใบต้นทางถูกลบไปแล้ว และไม่มีคีย์ href เลย', () => {
  const view = surveyJobHeaderView(headerInput({ confirmOf: { id: 'REQ-O', docNo: null, missing: true, previousByZone: {} } }));
  assert.deepEqual(view.facts[0], { key: 'confirmOf', label: SURVEY_CONFIRM_OF_LABEL, value: SURVEY_CONFIRM_ORIGINAL_MISSING });
  assert.equal('href' in view.facts[0], false);
});

test('อ่านใบต้นทางไม่สำเร็จ (`unknown.confirmOf`) — ข้อนี้เขียน "ไม่ทราบ" ไม่มีลิงก์ (ไม่หายเงียบเหมือนใบไม่ได้ผูก)', () => {
  const view = surveyJobHeaderView(headerInput({ unknown: { confirmOf: true } }));
  assert.deepEqual(view.facts[0], { key: 'confirmOf', label: SURVEY_CONFIRM_OF_LABEL, value: SURVEY_UNKNOWN_TEXT });
});

test('🔴 ไม่ส่ง `confirmOf` (ใบไม่ได้ผูก · ช่าง) = หัวงานเดิมทุกคีย์ ไม่มีข้อของใบต้นทาง', () => {
  for (const extra of [{}, { method: MIXED }, { visit: null }, { unknown: { site: true } }]) {
    const today = surveyJobHeaderView(headerInput(extra));
    for (const confirmOf of [null, undefined]) {
      assert.deepEqual(surveyJobHeaderView(headerInput({ ...extra, confirmOf })), today, JSON.stringify(extra));
    }
    assert.equal(today.facts.some((f) => f.key === 'confirmOf'), false);
    assert.equal(today.facts.some((f) => 'href' in f), false, 'ข้อเดิมไม่มี href');
  }
  assert.deepEqual(surveyJobHeaderView(headerInput()).facts.map((f) => f.key), ['visit', 'crew', 'access', 'note']);
});

test('surveyFieldView.js — ข้อของใบต้นทางแนบด้วย conditional spread · คำมาจาก surveyConfirmLink ไม่พิมพ์เอง', () => {
  const src = code(FIELD_VIEW);
  assert.match(src, /from '\.\/surveyConfirmLink'/);
  assert.match(src, /\.\.\.\(confirmFact \? \[confirmFact\] : \[\]\),/);
  assert.doesNotMatch(src, /ยืนยันผลจากแบบของ|ใบต้นทางถูกลบไปแล้ว/);
  assert.doesNotMatch(src, /\bsurveyConfirm(?:OfId)?\b/, 'ไม่เอ่ยชื่อคอลัมน์ (ลิสต์ปิดของงวด S5)');
});

/* ══ 3. FactValue ══════════════════════════════════════════════════════════════════════════════ */

test('FactValue — ข้อที่มี href วาดเป็น <Link> คลาสลิงก์กลาง · ข้อที่ไม่มียังเป็นค่าเดิม · บรรทัดรองและคำเตือนไม่ขยับ', () => {
  const header = code(HEADER);
  assert.match(header, /\{fact\.href \? <Link href=\{fact\.href\} className=\{`linklike \$\{styles\.factLink\}`\}>\{fact\.value\}<\/Link> : fact\.value\}/);
  assert.equal((header.match(/\{fact\.value\}/g) || []).length, 1, 'ค่าเปล่าเหลือทางเดียว (ใน Link) — อีกทางคือ fact.value ของ ternary');
  assert.match(header, /\{fact\.sub && fact\.key !== "method" \? <>\{"\\u00a0· "\}<span className=\{styles\.stamp\}>\{fact\.sub\}<\/span><\/> : null\}/);
  assert.match(header, /\{fact\.warn \? \(/);
  const css = read(HEADER_CSS);
  assert.match(css, /\n\.factLink \{[^}]*white-space: nowrap;[^}]*\}/, 'เลขที่ไม่หักกลางที่ขีด');
  assert.match(css, /\.fact\[data-key="confirmOf"\] > dt \{[^}]*white-space: nowrap;/, 'ป้ายยาวไม่หักในคอลัมน์ 3.75rem');
});

/* ══ 4. ตาราง + หน้า ═══════════════════════════════════════════════════════════════════════════ */

test('ตาราง — prop `previousRounds` ค่าตั้งต้น null · บรรทัดใต้ชื่อ/ป้าย ตาม zoneId · แถวที่ตัดออกไม่มี · ไม่ส่ง = ตารางเดิม', () => {
  const table = code(TABLE);
  assert.match(table, /\n {2}previousRounds = null,\n/);
  assert.match(table, /const previousRound = !cut && zone\.zoneId && previousRounds \? previousRounds\[zone\.zoneId\] \|\| null : null;/);
  /* ใต้บรรทัดป้าย ก่อนตัวเลขผลวัด — คลาสบรรทัดรองกลางของเซลล์ตาราง */
  /* (คอมเมนต์ JSX ถูกตัดเหลือ `{}` — ยอมให้มีคั่นได้) */
  assert.match(table, /\{tags \? <span className=\{styles\.sub\}>\{tags\}<\/span> : null\}\s*(?:\{\}\s*)?\{previousRound \? <span className="cell-sub">\{previousRound\}<\/span> : null\}\s*\{!cut && \(cell\.figures \|\| cell\.dims\) \? \(/);
  assert.doesNotMatch(table, /รอบจากแบบ/, 'ข้อความมาจาก surveyConfirmPreviousRoundText (server)');
});

test('หน้าใบประเมิน — ส่ง `confirmOf` ให้หัวงาน และ `previousRounds` ให้ตาราง · ไม่มีคีย์ = null', () => {
  const page = code(PAGE);
  assert.match(page, /const headerView = surveyJobHeaderView\(\{[\s\S]*?confirmOf: data\?\.confirmOf \|\| null,[\s\S]*?\}\);/);
  assert.match(page, /<SurveyResultTable[\s\S]*?previousRounds=\{data\?\.confirmOf\?\.previousByZone \|\| null\}[\s\S]*?\/>/);
  assert.equal((page.match(/data\?\.confirmOf/g) || []).length, 2);
  assert.doesNotMatch(page, /\bsurveyConfirmOfId\b/);
});

test('ข้อความรอบจากแบบ — มาจากตัวสร้างกลาง · ไม่มีตัวเลขเลย = ไม่มีบรรทัด', () => {
  const rows = originalZones();
  assert.equal(surveyConfirmPreviousRoundText(rows[3], ORIGINAL_DOC), null, 'แถวไม่มีตัวเลข');
  assert.equal(surveyConfirmPreviousRoundText(rows[1], ORIGINAL_DOC), 'รอบจากแบบ (RQ-AS-26100345): — · SM 1');
});
