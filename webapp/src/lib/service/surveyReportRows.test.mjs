// ── ยามของตัวอ่านแถวเอกสารประเมิน (สเปก PR-2 §0 · §10 · §14 · §15 "Leak" ข้อ 6) ─────────────────────────
//
// ⭐ สี่ชั้นที่ต้องล็อก:
//   1. ยามเขียนของถาวร + ธงออกเอกสารตอนส่งผล — production เท่านั้น · ธงเปิดได้ด้วยคำเดียว
//   2. ตัวอ่าน (`loadSurveyReports` · `surveyReportVoided`) รันกับฐานปลอม — รูป query · อ่านพลาด = บอกว่าไม่รู้ ไม่โยน
//   3. **ของรั่ว** — สรุปของจอ (`surveyDocumentSummary`) ต่อ role: ช่างได้ `{ access: 'none' }` เป๊ะและไม่มี query ·
//      ผู้ขอไม่ได้ `history`/`send`/`issue` · Planner บน GET คำร้องได้แค่ `access` กับ `voids` ·
//      ไม่มีคีย์ไหนพกภาพนิ่ง/HTML/id ของแถว/ที่อยู่ไฟล์ แม้แถวที่ฐานคืนมาจะมีครบ
//   4. น้ำหนักของโมดูล — หัวไฟล์ไม่ import ของหนัก · ตัวตรวจโหลดด้วย `await import()` เฉพาะตอนต้องตรวจ
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROLES } from '../permissions.js';
import { surveyPackageSizeSendError } from './packageSizes.js';
import { surveySendError } from './survey.js';
import {
  SURVEY_REPORT_BUCKET,
  SURVEY_REPORT_COLUMNS,
  SURVEY_REPORT_NOT_PRODUCTION,
  loadSurveyReports,
  surveyDocumentSummary,
  surveyReportIssueAtSend,
  surveyReportStoreAllowed,
  surveyReportVoided,
} from './surveyReportRows.js';

const WEBAPP = process.cwd();
const read = (p) => fs.readFileSync(path.join(WEBAPP, p), 'utf8');
/* ตัดคอมเมนต์ก่อนตรวจ — คอมเมนต์ในไฟล์เอ่ยชื่อสิ่งต้องห้ามไว้สอนคน */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const ROWS = 'src/lib/service/surveyReportRows.js';
const MIGRATION = 'supabase/migrations/0401_survey_report_documents.sql';
/* `import … from 'x'` · `export … from 'x'` · `import 'x'` — ทั้งบรรทัดเดียวและหลายบรรทัด */
const STATIC_IMPORT = /^(?:import|export)\s(?:[^;'"]*?from\s+)?'([^']+)';/gm;

/* ── env ของยาม — ตั้งแล้วคืนค่าเดิมเสมอ (เทสต์อื่นในไฟล์อ่าน env ตัวเดียวกัน) ─────────────────────────── */
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
const PROD_OFF = { VERCEL_ENV: 'production' };

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

/* ── ฐานข้อมูลปลอม — กรองจริงตาม eq/in · เรียงตาม order · ตัดตาม limit · **ไม่ตัดคอลัมน์ตาม select** ───────────
   ⭐ ไม่ตัดคอลัมน์โดยตั้งใจ: แถวเอกสารในฐานปลอมพกภาพนิ่ง/HTML ครบ ⇒ เทสต์ของรั่วพิสูจน์ว่าสรุปของจอ "คัดคีย์เอง"
      ไม่ได้พึ่งว่า select จะไม่ขอของพวกนั้นมา */
function fakeDb(tables = {}, { errors = {}, throws = {} } = {}) {
  const log = [];
  return {
    log,
    queries: (table) => log.filter((q) => q.table === table),
    from(table) {
      const q = { table, select: null, filters: [], orders: [], limit: null };
      log.push(q);
      const run = () => {
        if (throws[table]) throw new Error(throws[table]);
        if (errors[table]) return { data: null, error: errors[table] };
        let rows = (tables[table] || []).filter((row) => q.filters.every(([op, col, val]) => (
          op === 'eq' ? row[col] === val : val.includes(row[col])
        )));
        for (const [col, asc] of [...q.orders].reverse()) {
          rows = [...rows].sort((a, b) => {
            if (a[col] === b[col]) return 0;
            return (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1);
          });
        }
        if (q.limit != null) rows = rows.slice(0, q.limit);
        return { data: rows.map((row) => ({ ...row })), error: null };
      };
      const chain = {
        select(cols) { q.select = cols; return chain; },
        eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
        in(col, val) { q.filters.push(['in', col, val]); return chain; },
        order(col, opts = {}) { q.orders.push([col, opts.ascending !== false]); return chain; },
        limit(n) { q.limit = n; return chain; },
        then(resolve, reject) {
          try {
            return Promise.resolve(run()).then(resolve, reject);
          } catch (e) {
            return Promise.reject(e).then(resolve, reject);
          }
        },
      };
      return chain;
    },
  };
}

/* ── ของตั้งต้น ─────────────────────────────────────────────────────────────────────────────── */
const ANSWERED_AT = '2026-10-01T05:00:00.000Z';
const NOW = new Date('2026-10-01T09:00:00.000Z'); // 4 ชม. หลังส่งผล — พ้นหน้าต่าง "กำลังออกเอกสาร" (180 วิ)
const REQ = Object.freeze({
  id: 'REQ-1', docNo: 'RQ-TS-26100001', kind: 'site_survey', dept: 'TS', status: 'answered',
  requestedById: 'sa-1', team: 'KA', answeredAt: ANSWERED_AT, answeredById: 'u-head', answeredByName: 'อานนท์',
  cancelledAt: null,
});
const OPEN_REQ = Object.freeze({ ...REQ, status: 'acknowledged', answeredAt: null, answeredById: null, answeredByName: null });

const HEAD = { id: 'u-head', name: 'อานนท์', role: 'ts_manager', department: 'TS' };
const CREW = { id: 'u-tech', role: 'ts', department: 'TS' };
const PLANNER = { id: 'u-plan', role: 'ts_planner', department: 'TS' };
const REQUESTER = { id: 'sa-1', role: 'ae', team: 'ODM' };
const TEAMMATE = { id: 'sa-2', role: 'ac', team: 'KA' };
const STRANGER = { id: 'sa-9', role: 'ae', team: 'ODM' };
const AE_SUP = { id: 'u-sup', role: 'ae_supervisor' };
const EXEC = { id: 'u-exec', role: 'executive' };

/* ของที่ห้ามออกจาก payload ไม่ว่าทางไหน — ใส่เครื่องหมายไว้ในค่าด้วย เผื่อคีย์ถูกเปลี่ยนชื่อระหว่างทาง */
const SECRET = { snapshot: 'SECRET-SNAPSHOT', customerHtml: 'SECRET-CUSTOMER-HTML', internalHtml: 'SECRET-INTERNAL-HTML' };
const reportRow = (extra = {}) => ({
  id: 'SVR-SECRET-1', requestId: 'REQ-1', baseNo: 'SU-26100001', rev: 0, docNo: 'SU-26100001-0',
  status: 'current', supersededAt: null, supersededReason: null,
  snapshot: { marker: SECRET.snapshot, customer: { name: 'บริษัท เอสล่า จำกัด' }, zones: [{ spots: [{ id: 'spot-1' }] }] },
  images: [{ sha: 'a'.repeat(64), attId: 'ATT-SECRET-1', kind: 'spot' }],
  customerHtml: `<html>${SECRET.customerHtml}</html>`,
  internalHtml: `<html>${SECRET.internalHtml} ฉบับภายใน</html>`,
  rendererVersion: 'r1', frozenAt: '2026-10-01T05:01:00+00:00',
  customerPdfPath: 'pdf/SVR-SECRET-1/customer.pdf', internalPdfPath: 'pdf/SVR-SECRET-1/internal.pdf',
  approvedById: 'u-head', approvedByName: 'อานนท์', approvedAt: '2026-10-01T05:00:00+00:00',
  issuedById: 'u-head', issuedByName: 'อานนท์', issuedAt: '2026-10-01T05:00:30+00:00',
  updatedAt: '2026-10-01T05:01:30+00:00', customerName: 'บริษัท เอสล่า จำกัด',
  ...extra,
});
const superseded = (rev, reason = 'recall', extra = {}) => reportRow({
  id: `SVR-SECRET-OLD-${rev}`, rev, docNo: `SU-26100001-${rev}`, status: 'superseded',
  supersededAt: `2026-09-2${rev}T03:00:00+00:00`, supersededReason: reason,
  approvedAt: `2026-09-2${rev}T01:00:00+00:00`, issuedAt: `2026-09-2${rev}T01:00:30+00:00`,
  customerPdfPath: `pdf/SVR-SECRET-OLD-${rev}/customer.pdf`, internalPdfPath: `pdf/SVR-SECRET-OLD-${rev}/internal.pdf`,
  ...extra,
});
const reportsDb = (rows, opts) => fakeDb({ service_survey_reports: rows }, opts);

const FORBIDDEN_KEYS = [
  'snapshot', 'customerHtml', 'internalHtml', // สเปก §15 Leak ข้อ 6
  'images', 'id', 'requestId', 'customerPdfPath', 'internalPdfPath', 'customerName', 'approvedById', 'issuedById',
];
const FORBIDDEN_VALUES = [...Object.values(SECRET), 'SVR-SECRET', 'ATT-SECRET', 'pdf/', 'spot-1'];

function deepKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => deepKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      deepKeys(v, out);
    }
  }
  return out;
}
function assertNoLeak(payload, label) {
  const keys = deepKeys(payload);
  for (const key of FORBIDDEN_KEYS) assert.equal(keys.has(key), false, `${label}: payload ต้องไม่มีคีย์ ${key}`);
  const text = JSON.stringify(payload);
  for (const value of FORBIDDEN_VALUES) assert.equal(text.includes(value), false, `${label}: payload ต้องไม่มีค่า ${value}`);
}

const BASE_KEYS = ['access', 'issueAtSend', 'storeAllowed', 'state', 'current'];
const HEAD_KEYS = [...BASE_KEYS, 'history', 'nextDocNo', 'send', 'issue'];
const ALL_ACCESS = { customer: true, internal: true, issue: true, draft: true, history: true };

/* ตัวตรวจปลอม — จำสิ่งที่ถูกส่งเข้ามา · ผลมีคีย์เกิน (จำลองตัวตรวจวันหน้าที่แนบของภายในมาด้วย) */
function fakePrecheck(result) {
  const calls = [];
  const run = async (supabase, args) => {
    calls.push(args);
    if (result instanceof Error) throw result;
    return result;
  };
  run.calls = calls;
  return run;
}
const PRECHECK_RESULT = {
  blockers: [
    { kind: 'content', text: 'ผังของพื้นที่ ล็อบบี้ เป็น PDF — อัปเป็นรูป', snapshot: SECRET.snapshot },
    { kind: 'system', text: 'อ่านข้อมูลบริษัทไม่สำเร็จ', inputs: { internalHtml: SECRET.internalHtml } },
    { kind: 'content', text: 'ฉบับลูกค้า: หน้า 2 ล้น' },
  ],
  warnings: ['หมายเหตุของพื้นที่ ล็อบบี้ พูดถึงเครื่อง — จะพิมพ์ลงฉบับลูกค้าตามที่พิมพ์'],
  unknown: [],
  inputs: { snapshot: SECRET.snapshot },
};

/* ══ 1. ค่าคงที่ · ยามเขียนของถาวร · ธง ═══════════════════════════════════════════════════════ */

test('bucket กับคอลัมน์ตรงกับ 0401 — ทุกคอลัมน์มีจริงในตาราง และไม่มีภาพนิ่ง/HTML/รูป หรือ `*`', () => {
  const sql = read(MIGRATION);
  assert.equal(SURVEY_REPORT_BUCKET, 'survey-report');
  assert.match(sql, new RegExp(`VALUES \\('${SURVEY_REPORT_BUCKET}', '${SURVEY_REPORT_BUCKET}', false`));

  const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.service_survey_reports'));
  const body = table.slice(0, table.indexOf('\n);'));
  const tableColumns = [...body.matchAll(/^\s{2}"?([A-Za-z]+)"?\s+(?:text|integer|jsonb|timestamptz)\b/gm)].map((m) => m[1]);
  assert.equal(tableColumns.length, 23, 'อ่านคอลัมน์ของ CREATE TABLE ได้ครบ');

  const pieces = SURVEY_REPORT_COLUMNS.split(',').map((s) => s.trim());
  const plain = pieces.filter((p) => !p.includes('->')).map((p) => p.replaceAll('"', ''));
  for (const column of plain) assert.ok(tableColumns.includes(column), `คอลัมน์ ${column} ต้องมีใน 0401`);
  assert.equal(new Set(plain).size, plain.length, 'ไม่มีคอลัมน์ซ้ำ');
  /* camelCase ต้องอยู่ในเครื่องหมายคำพูดเสมอ — ไม่งั้น PostgREST พับเป็นตัวเล็กแล้วตอบ 42703 ทั้ง query */
  for (const piece of pieces.filter((p) => !p.includes('->'))) {
    if (/[A-Z]/.test(piece)) assert.match(piece, /^"[A-Za-z]+"$/, piece);
  }

  for (const heavy of ['snapshot', 'customerHtml', 'internalHtml', 'images']) {
    assert.equal(plain.includes(heavy), false, `${heavy} ต้องไม่อยู่ในคอลัมน์ที่ทุกทางอ่าน`);
  }
  assert.equal(SURVEY_REPORT_COLUMNS.includes('*'), false);
  /* ภาพนิ่งถูกเอ่ยที่เดียว = ชื่อลูกค้าคีย์เดียวสำหรับชื่อไฟล์ (§6) — ไม่ใช่ทั้งก้อน */
  assert.deepEqual(pieces.filter((p) => p.includes('->')), ['customerName:snapshot->customer->>name']);
  /* ช่องที่สถานะ §1 กับตัวอ่านที่นี่ใช้ ต้องอยู่ครบ */
  for (const need of ['id', 'requestId', 'baseNo', 'rev', 'docNo', 'status', 'supersededAt', 'supersededReason',
    'frozenAt', 'customerPdfPath', 'internalPdfPath', 'approvedAt', 'approvedByName', 'issuedAt', 'issuedByName']) {
    assert.ok(plain.includes(need), `ต้องอ่าน ${need}`);
  }
});

test('🔴 ยามเขียนของถาวร = production deployment เท่านั้น — ไม่ตั้ง · preview · development = ปิด', async () => {
  for (const [value, expected] of [[undefined, false], ['preview', false], ['development', false], ['Production', false], ['production', true]]) {
    await withEnv({ VERCEL_ENV: value }, () => {
      assert.equal(surveyReportStoreAllowed(), expected, `VERCEL_ENV=${value}`);
    });
  }
  assert.match(SURVEY_REPORT_NOT_PRODUCTION, /^เครื่องนี้ไม่ใช่ระบบจริง \(production\) — ออกหรือตรึงเอกสารจากเครื่องทดสอบไม่ได้$/);
});

test('ธงออกเอกสารตอนส่งผล = `on` **และ** ยาม production — ค่าอื่นทุกค่าคือปิด', async () => {
  const cases = [
    [{ VERCEL_ENV: 'production', SURVEY_REPORT_ISSUE_AT_SEND: 'on' }, true],
    [{ VERCEL_ENV: 'production', SURVEY_REPORT_ISSUE_AT_SEND: ' ON ' }, true],
    [{ VERCEL_ENV: 'production' }, false],
    [{ VERCEL_ENV: 'production', SURVEY_REPORT_ISSUE_AT_SEND: 'off' }, false],
    [{ VERCEL_ENV: 'production', SURVEY_REPORT_ISSUE_AT_SEND: '1' }, false],
    [{ VERCEL_ENV: 'production', SURVEY_REPORT_ISSUE_AT_SEND: 'true' }, false],
    [{ VERCEL_ENV: 'preview', SURVEY_REPORT_ISSUE_AT_SEND: 'on' }, false],
    [{ SURVEY_REPORT_ISSUE_AT_SEND: 'on' }, false],
  ];
  for (const [env, expected] of cases) {
    await withEnv(env, () => assert.equal(surveyReportIssueAtSend(), expected, JSON.stringify(env)));
  }
});

/* ══ 2. ตัวอ่าน กับฐานปลอม ════════════════════════════════════════════════════════════════ */

test('loadSurveyReports: ของคำร้องเดียว · ฉบับล่าสุดก่อน · มี limit · เลือกคอลัมน์ตามค่าคงที่', async () => {
  const db = reportsDb([
    superseded(0), reportRow({ rev: 2, docNo: 'SU-26100001-2' }), superseded(1, 'reopen'),
    reportRow({ id: 'SVR-OTHER', requestId: 'REQ-2', docNo: 'SU-26100002-0', baseNo: 'SU-26100002' }),
  ]);
  const { reports, error } = await loadSurveyReports(db, 'REQ-1');
  assert.equal(error, null);
  assert.deepEqual(reports.map((r) => r.docNo), ['SU-26100001-2', 'SU-26100001-1', 'SU-26100001-0']);

  const [q] = db.queries('service_survey_reports');
  assert.equal(q.select, SURVEY_REPORT_COLUMNS);
  assert.deepEqual(q.filters, [['eq', 'requestId', 'REQ-1']]);
  assert.deepEqual(q.orders, [['rev', false]]);
  assert.equal(q.limit, 50);
});

test('loadSurveyReports: อ่านพลาด = `error` ไม่ว่าง (ไม่ใช่ "ไม่มีเอกสาร") · supabase โยนก็ไม่โยนต่อ · ไม่มี id = ไม่ยิง', async () => {
  const failed = await quiet(() => loadSurveyReports(reportsDb([reportRow()], { errors: { service_survey_reports: { message: 'boom', code: '57014' } } }), 'REQ-1'));
  assert.deepEqual(failed.result.reports, []);
  assert.equal(failed.result.error.message, 'boom');
  assert.equal(failed.lines.length, 1, 'ลง log หนึ่งบรรทัด');

  const thrown = await quiet(() => loadSurveyReports(reportsDb([], { throws: { service_survey_reports: 'fetch failed' } }), 'REQ-1'));
  assert.deepEqual(thrown.result.reports, []);
  assert.match(thrown.result.error.message, /fetch failed/);

  const db = reportsDb([reportRow()]);
  assert.deepEqual(await loadSurveyReports(db, null), { reports: [], error: null });
  assert.equal(db.log.length, 0);
});

test('surveyReportVoided: ฉบับล่าสุดถูกแทนที่และเป็นของคำตอบที่เพิ่งล้าง = คืนเลขที่ (เทียบเวลาเป็นจุดเวลา ไม่ใช่สตริง)', async () => {
  const db = reportsDb([
    superseded(0),
    reportRow({ rev: 1, docNo: 'SU-26100001-1', status: 'superseded', supersededAt: '2026-10-01T08:00:00+00:00', supersededReason: 'recall' }),
  ]);
  // แถวเก็บ `+00:00` · route ถือ `…Z` — จุดเวลาเดียวกัน
  assert.equal(await surveyReportVoided(db, { requestId: 'REQ-1', answeredAt: ANSWERED_AT }), 'SU-26100001-1');
  const [q] = db.queries('service_survey_reports');
  assert.equal(q.select, SURVEY_REPORT_COLUMNS);
  assert.deepEqual(q.filters, [['eq', 'requestId', 'REQ-1']]);
  assert.deepEqual(q.orders, [['rev', false]]);
  assert.equal(q.limit, 1, 'อ่านฉบับล่าสุดฉบับเดียว');
});

test('surveyReportVoided: ไม่อ้างสิ่งที่ฐานไม่ได้ทำ — ยัง current = log + null · ฉบับของรอบก่อน = null · อ่านพลาด = null', async () => {
  const stillCurrent = await quiet(() => surveyReportVoided(reportsDb([reportRow()]), { requestId: 'REQ-1', answeredAt: ANSWERED_AT }));
  assert.equal(stillCurrent.result, null);
  assert.equal(stillCurrent.lines.length, 1);
  assert.match(stillCurrent.lines[0], /SU-26100001-0 ยังเป็นฉบับที่ใช้อยู่/);

  /* รอบนี้ส่งผลโดยไม่มีเอกสาร (ธงปิด) แล้วดึงกลับ — ฉบับล่าสุดคือของรอบก่อนซึ่งถูกแทนที่ไปนานแล้ว */
  const older = reportsDb([superseded(0)]);
  assert.equal(await surveyReportVoided(older, { requestId: 'REQ-1', answeredAt: ANSWERED_AT }), null);

  assert.equal(await surveyReportVoided(reportsDb([]), { requestId: 'REQ-1', answeredAt: ANSWERED_AT }), null);

  const failed = await quiet(() => surveyReportVoided(
    reportsDb([], { errors: { service_survey_reports: { message: 'boom' } } }), { requestId: 'REQ-1', answeredAt: ANSWERED_AT },
  ));
  assert.equal(failed.result, null);
  const thrown = await quiet(() => surveyReportVoided(
    reportsDb([], { throws: { service_survey_reports: 'fetch failed' } }), { requestId: 'REQ-1', answeredAt: ANSWERED_AT },
  ));
  assert.equal(thrown.result, null);

  /* ไม่มีคำตอบให้เทียบ (ใบที่ไม่เคยส่งผล) = ไม่ยิง query เลย */
  const db = reportsDb([superseded(0)]);
  assert.equal(await surveyReportVoided(db, { requestId: 'REQ-1', answeredAt: null }), null);
  assert.equal(await surveyReportVoided(db, { requestId: null, answeredAt: ANSWERED_AT }), null);
  assert.equal(await surveyReportVoided(db), null);
  assert.equal(db.log.length, 0);
});

/* ══ 3. สรุปของจอ — ของรั่ว ต่อ role (§15 Leak ข้อ 6) ══════════════════════════════════════════ */

test('🔴 ช่าง (`ts`) ได้ `{ access: "none" }` เป๊ะ — ไม่มี query ของตารางเอกสารสักตัว ทั้งสอง GET', async () => {
  await withEnv(PROD_ON, async () => {
    const precheck = fakePrecheck(PRECHECK_RESULT);
    const db = reportsDb([reportRow(), superseded(0)]);
    assert.deepEqual(await surveyDocumentSummary(db, REQ, CREW, { withChecks: true, now: NOW, precheck }), { access: 'none' });
    assert.deepEqual(await surveyDocumentSummary(db, REQ, CREW, { withVoids: true, now: NOW }), { access: 'none' });
    assert.deepEqual(await surveyDocumentSummary(db, OPEN_REQ, CREW, { withChecks: true, now: NOW, precheck }), { access: 'none' });
    assert.equal(db.log.length, 0, 'ไม่แตะฐานเลย');
    assert.equal(precheck.calls.length, 0);
  });
});

test('🔴 ไม่รู้ว่าใคร · ไม่มีใบ · คนนอกใบ = `{ access: "none" }` ไม่มี query', async () => {
  const db = reportsDb([reportRow()]);
  for (const [request, user] of [[REQ, null], [REQ, {}], [null, HEAD], [{}, HEAD], [REQ, STRANGER], [REQ, { id: 'u-v', role: 'viewer' }]]) {
    assert.deepEqual(await surveyDocumentSummary(db, request, user, { withChecks: true, withVoids: true, now: NOW }), { access: 'none' });
  }
  assert.equal(db.log.length, 0);
});

test('🔴 ผู้ขอ (ฝ่ายขาย) ได้ฉบับลูกค้า — ไม่มีคีย์ history · nextDocNo · send · issue และไม่มีของภายในสักคีย์', async () => {
  await withEnv(PROD_ON, async () => {
    const precheck = fakePrecheck(PRECHECK_RESULT);
    const db = reportsDb([reportRow({ rev: 1, docNo: 'SU-26100001-1' }), superseded(0)]);
    for (const user of [REQUESTER, TEAMMATE, AE_SUP]) {
      const doc = await surveyDocumentSummary(db, REQ, user, { withChecks: true, now: NOW, precheck });
      assert.deepEqual(Object.keys(doc), BASE_KEYS, user.role);
      assert.deepEqual(doc.access, { customer: true, internal: false, issue: false, draft: false, history: false });
      assert.equal(doc.state, 'ready');
      assert.deepEqual(doc.current, {
        docNo: 'SU-26100001-1', rev: 1, issuedAt: '2026-10-01T05:00:30+00:00', issuedByName: 'อานนท์',
        approvedByName: 'อานนท์', approvedAt: '2026-10-01T05:00:00+00:00', frozenAt: '2026-10-01T05:01:00+00:00',
        ready: { customer: true, internal: true },
      });
      assertNoLeak(doc, user.role);
    }
    assert.equal(precheck.calls.length, 0, 'ตัวตรวจไม่วิ่งให้คนที่ออกเอกสารไม่ได้');

    /* ใบยังไม่ส่งผลและธงเปิด — ผู้ขอก็ยังไม่ได้ `send` */
    const open = await surveyDocumentSummary(reportsDb([]), OPEN_REQ, REQUESTER, { withChecks: true, now: NOW, precheck });
    assert.deepEqual(Object.keys(open), BASE_KEYS);
    assert.equal(open.state, 'not_sent');
    assert.equal(precheck.calls.length, 0);

    /* GET คำร้อง — ผู้ขอจัดการใบได้ จึงรู้ว่ากด "ยังไม่จบ" แล้วฉบับไหนใช้ไม่ได้ */
    const onRequest = await surveyDocumentSummary(db, REQ, REQUESTER, { withVoids: true, now: NOW });
    assert.deepEqual(Object.keys(onRequest), [...BASE_KEYS, 'voids']);
    assert.equal(onRequest.voids, 'SU-26100001-1');
    assertNoLeak(onRequest, 'requester/request GET');
  });
});

test('🔴 Planner บน GET คำร้องได้แค่ `access` กับ `voids` · บน GET ใบประเมินได้ `{ access: "none" }` ไม่มี query', async () => {
  const db = reportsDb([reportRow({ rev: 1, docNo: 'SU-26100001-1' }), superseded(0)]);
  assert.deepEqual(await surveyDocumentSummary(db, REQ, PLANNER, { withVoids: true, now: NOW }), { access: 'none', voids: 'SU-26100001-1' });
  assert.equal(db.queries('service_survey_reports').length, 1);

  /* ไม่มีฉบับที่ใช้อยู่ (ดึงกลับแล้ว / ยังไม่เคยออก) = `voids: null` */
  assert.deepEqual(await surveyDocumentSummary(reportsDb([superseded(0)]), OPEN_REQ, PLANNER, { withVoids: true, now: NOW }), { access: 'none', voids: null });
  assert.deepEqual(await surveyDocumentSummary(reportsDb([]), REQ, PLANNER, { withVoids: true, now: NOW }), { access: 'none', voids: null });

  /* แถวค้างสถานะ (`stale` — ของคำตอบรอบก่อน) ไม่ถูกเอ่ย: กติกาเดียวกับ `surveyReportVoided` ที่เธรดใช้หลังกด */
  const staleDb = reportsDb([reportRow({ approvedAt: '2026-09-30T05:00:00+00:00' })]);
  assert.deepEqual(await surveyDocumentSummary(staleDb, REQ, PLANNER, { withVoids: true, now: NOW }), { access: 'none', voids: null });

  const surveyDb = reportsDb([reportRow()]);
  assert.deepEqual(await surveyDocumentSummary(surveyDb, REQ, PLANNER, { withChecks: true, now: NOW }), { access: 'none' });
  assert.equal(surveyDb.log.length, 0);

  /* อ่านพลาด = บอกว่าไม่รู้ ไม่ใช่บอกว่าไม่มีฉบับที่จะถูกแทนที่ */
  const failed = await quiet(() => surveyDocumentSummary(
    reportsDb([reportRow()], { errors: { service_survey_reports: { message: 'boom' } } }), REQ, PLANNER, { withVoids: true, now: NOW },
  ));
  assert.deepEqual(failed.result, { access: 'none', voids: null, unknown: true });
});

test('ผู้บริหาร (executive) ได้ทั้งสองฉบับ แต่ไม่มีรายการฉบับเก่า ไม่มีปุ่มออกเอกสาร และไม่มี `voids`', async () => {
  await withEnv(PROD_ON, async () => {
    const precheck = fakePrecheck(PRECHECK_RESULT);
    const db = reportsDb([reportRow({ rev: 1, docNo: 'SU-26100001-1' }), superseded(0)]);
    const doc = await surveyDocumentSummary(db, REQ, EXEC, { withChecks: true, withVoids: true, now: NOW, precheck });
    assert.deepEqual(Object.keys(doc), BASE_KEYS);
    assert.deepEqual(doc.access, { customer: true, internal: true, issue: false, draft: false, history: false });
    assert.equal(precheck.calls.length, 0);
    assertNoLeak(doc, 'executive');
  });
});

test('หัวหน้าฝ่าย: ฉบับที่ใช้อยู่ + รายการฉบับที่ถูกแทนที่ (เลขที่ · วันที่ · เหตุ) — ไม่มีไฟล์ ไม่มี id', async () => {
  await withEnv(PROD_OFF, async () => {
    const db = reportsDb([superseded(0), reportRow({ rev: 2, docNo: 'SU-26100001-2' }), superseded(1, 'reopen')]);
    const doc = await surveyDocumentSummary(db, REQ, HEAD, { withChecks: true, now: NOW });
    assert.deepEqual(Object.keys(doc), HEAD_KEYS);
    assert.deepEqual(doc.access, ALL_ACCESS);
    assert.equal(doc.issueAtSend, false);
    assert.equal(doc.storeAllowed, true);
    assert.equal(doc.state, 'ready');
    assert.equal(doc.current.docNo, 'SU-26100001-2');
    assert.deepEqual(doc.history, [
      { docNo: 'SU-26100001-1', rev: 1, issuedAt: '2026-09-21T01:00:30+00:00', supersededAt: '2026-09-21T03:00:00+00:00', supersededReason: 'reopen' },
      { docNo: 'SU-26100001-0', rev: 0, issuedAt: '2026-09-20T01:00:30+00:00', supersededAt: '2026-09-20T03:00:00+00:00', supersededReason: 'recall' },
    ]);
    assert.equal(doc.nextDocNo, null, 'มีฉบับที่ใช้อยู่ = ไม่มีฉบับถัดไปให้บอก');
    assert.equal(doc.send, null);
    assert.equal(doc.issue, null);
    assertNoLeak(doc, 'head');
  });
});

test('สถานะกับ `ready` ตามแถว: issued → frozen → ready · `stale` ไม่บอกว่าพร้อมเสิร์ฟ', async () => {
  const summary = (rows, request = REQ) => withEnv(PROD_OFF, () => surveyDocumentSummary(reportsDb(rows), request, HEAD, { now: NOW }));

  const issued = await summary([reportRow({ frozenAt: null, customerPdfPath: null, internalPdfPath: null })]);
  assert.equal(issued.state, 'issued');
  assert.deepEqual(issued.current.ready, { customer: false, internal: false });
  assert.equal(issued.current.frozenAt, null);

  const frozen = await summary([reportRow({ internalPdfPath: null })]);
  assert.equal(frozen.state, 'frozen');
  assert.deepEqual(frozen.current.ready, { customer: true, internal: false });

  /* ทริกเกอร์ไม่ยิง: แถว current ของคำตอบรอบก่อน — เลขที่ยังบอก (ผู้ดูแลต้องรู้ว่าฉบับไหนค้าง) แต่ไม่มีอะไรพร้อมเสิร์ฟ */
  const stale = await summary([reportRow({ approvedAt: '2026-09-30T05:00:00+00:00' })]);
  assert.equal(stale.state, 'stale');
  assert.equal(stale.current.docNo, 'SU-26100001-0');
  assert.deepEqual(stale.current.ready, { customer: false, internal: false });
  assert.equal(stale.nextDocNo, null);
});

test('ดึงผลกลับแล้ว: ไม่มีฉบับที่ใช้อยู่ · หัวหน้ารู้เลขของฉบับถัดไป (เลขฐานเดิม R+1) · ใบที่ไม่เคยมีเอกสาร = null', async () => {
  await withEnv(PROD_OFF, async () => {
    const recalled = await surveyDocumentSummary(reportsDb([superseded(0), superseded(1)]), OPEN_REQ, HEAD, { now: NOW });
    assert.equal(recalled.state, 'recalled');
    assert.equal(recalled.current, null);
    assert.equal(recalled.nextDocNo, 'SU-26100001-2');
    assert.equal(recalled.history.length, 2);

    /* ส่งรอบใหม่แล้วแต่เอกสารยังไม่ออก — เลขถัดไปยังเป็นเลขเดิม R+1 */
    const missing = await surveyDocumentSummary(reportsDb([superseded(0)]), REQ, HEAD, { now: NOW });
    assert.equal(missing.state, 'missing');
    assert.equal(missing.nextDocNo, 'SU-26100001-1');

    const fresh = await surveyDocumentSummary(reportsDb([]), OPEN_REQ, HEAD, { now: NOW });
    assert.equal(fresh.state, 'not_sent');
    assert.equal(fresh.nextDocNo, null, 'เลขรันออกที่ฐาน — ห้ามเดา');
    assert.deepEqual(fresh.history, []);
  });
});

test('`issuing` มาจากนาฬิกา + ธง: เพิ่งส่งไม่เกิน 180 วิและธงเปิด = กำลังออก · ธงปิดหรือพ้นเวลา = missing', async () => {
  const justNow = new Date('2026-10-01T05:01:00.000Z'); // 60 วิหลังส่งผล
  const at = (env, now) => withEnv(env, () => surveyDocumentSummary(reportsDb([]), REQ, HEAD, { now }));
  assert.equal((await at(PROD_ON, justNow)).state, 'issuing');
  assert.equal((await at(PROD_ON, NOW)).state, 'missing');
  assert.equal((await at(PROD_OFF, justNow)).state, 'missing');
  /* เครื่องทดสอบ: ธงตั้งไว้ก็ไม่นับว่าเปิด (ยาม production) */
  const preview = await at({ VERCEL_ENV: 'preview', SURVEY_REPORT_ISSUE_AT_SEND: 'on' }, justNow);
  assert.equal(preview.state, 'missing');
  assert.equal(preview.issueAtSend, false);
  assert.equal(preview.storeAllowed, false);
});

test('อ่านแถวเอกสารไม่สำเร็จ = `unknown: true` · สถานะ `null` — ไม่โยน และไม่ตอบว่า "ยังไม่มีเอกสาร"', async () => {
  await withEnv(PROD_OFF, async () => {
    const { result: doc } = await quiet(() => surveyDocumentSummary(
      reportsDb([reportRow()], { errors: { service_survey_reports: { message: 'boom' } } }), REQ, HEAD, { withChecks: true, withVoids: true, now: NOW },
    ));
    assert.deepEqual(Object.keys(doc), [...HEAD_KEYS, 'voids', 'unknown']);
    assert.equal(doc.unknown, true);
    assert.equal(doc.state, null);
    assert.equal(doc.current, null);
    assert.deepEqual(doc.history, []);
    assert.equal(doc.nextDocNo, null);
    assert.equal(doc.issue, null, 'ไม่รู้สถานะ = ไม่ชวนกดออกเอกสาร');
    assert.equal(doc.voids, null);

    const { result: sales } = await quiet(() => surveyDocumentSummary(
      reportsDb([], { throws: { service_survey_reports: 'fetch failed' } }), REQ, REQUESTER, { now: NOW },
    ));
    assert.deepEqual(Object.keys(sales), [...BASE_KEYS, 'unknown']);
  });
});

/* ══ 3b. `send` / `issue` — ผลของตัวตรวจ ══════════════════════════════════════════════════════ */

test('`send`: ธงเปิด + ใบยังไม่ตอบ — เหตุขวางเฉพาะเรื่องเนื้อหา (ข้อความล้วน) + คำเตือน · ไม่มีคีย์เกินจากตัวตรวจ', async () => {
  await withEnv(PROD_ON, async () => {
    const precheck = fakePrecheck(PRECHECK_RESULT);
    const zones = [{ id: 'z1', requestId: 'REQ-1' }];
    const filesByZone = { z1: [] };
    const sizes = [{ code: 'ST' }];
    const open = { id: 'SV-1', status: 'scheduled' };
    const db = reportsDb([]);
    const doc = await surveyDocumentSummary(db, OPEN_REQ, HEAD, { withChecks: true, now: NOW, precheck, zones, filesByZone, sizes, open });

    assert.deepEqual(Object.keys(doc), HEAD_KEYS);
    assert.equal(doc.issueAtSend, true);
    assert.deepEqual(doc.send, {
      blockers: ['ผังของพื้นที่ ล็อบบี้ เป็น PDF — อัปเป็นรูป', 'ฉบับลูกค้า: หน้า 2 ล้น'],
      warnings: PRECHECK_RESULT.warnings,
      unknown: false,
    });
    assert.equal(doc.issue, null);
    assertNoLeak(doc, 'head/send');

    /* ตัวตรวจได้ของที่ route อ่านไว้ + ผู้ส่ง + วันไทย — ไม่อ่านซ้ำ (ฐานปลอมเห็นแค่ query ของแถวเอกสาร) */
    assert.equal(precheck.calls.length, 1);
    const [args] = precheck.calls;
    assert.equal(args.request, OPEN_REQ);
    assert.equal(args.user, HEAD);
    assert.equal(args.zones, zones);
    assert.equal(args.filesByZone, filesByZone);
    assert.equal(args.sizes, sizes);
    assert.equal(args.open, open);
    assert.equal(args.nowIso, NOW.toISOString());
    assert.equal(args.today, '2026-10-01');
    assert.deepEqual(db.log.map((q) => q.table), ['service_survey_reports']);
  });
});

test('`send`: วันไทยของตัวตรวจข้ามเที่ยงคืนตามนาฬิกาไทย ไม่ใช่ UTC', async () => {
  await withEnv(PROD_ON, async () => {
    const precheck = fakePrecheck({ blockers: [], warnings: [], unknown: [] });
    await surveyDocumentSummary(reportsDb([]), OPEN_REQ, HEAD, {
      withChecks: true, now: new Date('2026-10-01T18:30:00.000Z'), precheck, open: null,
    });
    assert.equal(precheck.calls[0].today, '2026-10-02');
  });
});

test('`send`: ของที่ route ไม่ได้ส่งมา — อ่านนัดที่ค้างเอง · ผลวัด/ไฟล์/ทะเบียนปล่อยให้ตัวโหลดของตัวตรวจอ่าน', async () => {
  await withEnv(PROD_ON, async () => {
    const precheck = fakePrecheck({ blockers: [], warnings: [], unknown: ['company'] });
    const db = fakeDb({
      service_survey_reports: [],
      service_visits: [
        { id: 'SV-OLD', requestId: 'REQ-1', status: 'done', createdAt: '2026-09-20T00:00:00Z' },
        { id: 'SV-OPEN', requestId: 'REQ-1', status: 'scheduled', createdAt: '2026-09-28T00:00:00Z' },
      ],
    });
    const doc = await surveyDocumentSummary(db, OPEN_REQ, HEAD, { withChecks: true, now: NOW, precheck });
    assert.deepEqual(doc.send, { blockers: [], warnings: [], unknown: true }, 'ชิ้นที่ตัวตรวจอ่านไม่สำเร็จ = unknown');

    const [args] = precheck.calls;
    assert.equal(args.open.id, 'SV-OPEN');
    assert.equal(args.zones, null);
    assert.equal(args.filesByZone, null);
    assert.equal(args.sizes, undefined, '`undefined` = ตัวโหลดอ่านทะเบียนเอง (`null` แปลว่าอ่านไม่สำเร็จ)');
    assert.deepEqual(db.log.map((q) => q.table), ['service_survey_reports', 'service_visits']);

    /* `sizes: null` ที่ route ส่งมา (อ่านทะเบียนไม่สำเร็จ) ต้องไปถึงตัวตรวจเป็น `null` ไม่ถูกอ่านซ้ำให้กลายเป็นของดี */
    await surveyDocumentSummary(db, OPEN_REQ, HEAD, { withChecks: true, now: NOW, precheck, sizes: null, open: null });
    assert.equal(precheck.calls[1].sizes, null);
    assert.equal(precheck.calls[1].open, null);
  });
});

test('`send` ไม่ถูกคิดเมื่อ: ธงปิด · เครื่องทดสอบ · ใบตอบแล้ว · ใบถูกยกเลิก · ไม่ได้ขอ `withChecks`', async () => {
  const precheck = fakePrecheck(PRECHECK_RESULT);
  const run = (env, request, opts) => withEnv(env, () => surveyDocumentSummary(reportsDb([]), request, HEAD, { now: NOW, precheck, open: null, ...opts }));

  assert.equal((await run(PROD_OFF, OPEN_REQ, { withChecks: true })).send, null);
  assert.equal((await run({ VERCEL_ENV: 'preview', SURVEY_REPORT_ISSUE_AT_SEND: 'on' }, OPEN_REQ, { withChecks: true })).send, null);
  assert.equal((await run(PROD_ON, { ...OPEN_REQ, cancelledAt: '2026-09-30T00:00:00Z' }, { withChecks: true })).send, null);
  assert.equal((await run(PROD_ON, OPEN_REQ, { withChecks: false })).send, null);
  assert.equal((await run(PROD_ON, OPEN_REQ, {})).send, null);
  assert.equal(precheck.calls.length, 0, 'ตัวตรวจไม่ถูกเรียกเลย');

  /* ใบตอบแล้วและมีเอกสารครบ — ไม่มีอะไรให้ตรวจ */
  const ready = await withEnv(PROD_ON, () => surveyDocumentSummary(reportsDb([reportRow()]), REQ, HEAD, { withChecks: true, now: NOW, precheck }));
  assert.equal(ready.send, null);
  assert.equal(ready.issue, null);
  assert.equal(precheck.calls.length, 0);
});

test('`issue`: ตอบแล้วไม่มีเอกสาร — ทุกชนิดของเหตุขวาง + ด่านส่งผลที่ขั้นออกเลขวิ่งซ้ำ · ไม่มีนัดให้ปิด', async () => {
  await withEnv(PROD_OFF, async () => {
    const precheck = fakePrecheck(PRECHECK_RESULT);
    const zones = [{ id: 'z1', requestId: 'REQ-1', name: 'ล็อบบี้', packageSize: 'ZZ' }];
    const filesByZone = { z1: [] };
    const sizes = [];
    const db = reportsDb([]);
    const doc = await surveyDocumentSummary(db, REQ, HEAD, {
      withChecks: true, now: NOW, precheck, zones, filesByZone, sizes, open: { id: 'SV-IGNORED', status: 'scheduled' },
    });

    assert.equal(doc.state, 'missing');
    assert.equal(doc.send, null);
    const gateSend = surveySendError(zones, filesByZone, { canSend: true });
    const gateSize = surveyPackageSizeSendError(zones, sizes);
    assert.ok(gateSend && gateSize, 'ของตั้งต้นต้องชนด่านจริง');
    assert.deepEqual(doc.issue, {
      blockers: [
        { kind: 'content', text: gateSend },
        { kind: 'content', text: gateSize },
        { kind: 'content', text: 'ผังของพื้นที่ ล็อบบี้ เป็น PDF — อัปเป็นรูป' },
        { kind: 'system', text: 'อ่านข้อมูลบริษัทไม่สำเร็จ' },
        { kind: 'content', text: 'ฉบับลูกค้า: หน้า 2 ล้น' },
      ],
      warnings: PRECHECK_RESULT.warnings,
      unknown: false,
    });
    assertNoLeak(doc, 'head/issue');

    const [args] = precheck.calls;
    assert.equal(args.open, null, 'ใบตอบแล้ว — ตรวจแบบที่ปุ่มออกเอกสารตรวจ ไม่มีนัดที่การส่งจะปิด');
    assert.equal(args.zones, zones);
    assert.equal(args.sizes, sizes);
    assert.deepEqual(db.log.map((q) => q.table), ['service_survey_reports']);
  });
});

test('`issue`: ทะเบียนขนาดอ่านไม่สำเร็จ = เรื่องของระบบ (ไม่ต้องดึงผลกลับ) · เหตุซ้ำถูกยุบ · ชนิดแปลก = system', async () => {
  await withEnv(PROD_OFF, async () => {
    const zones = [{ id: 'z1', requestId: 'REQ-1', name: 'ล็อบบี้', packageSize: 'ST' }];
    const sizeGate = surveyPackageSizeSendError(zones, null);
    assert.ok(sizeGate);
    const precheck = fakePrecheck({
      blockers: [{ kind: 'system', text: sizeGate }, { kind: 'weird', text: 'เหตุชนิดใหม่' }, { kind: 'content', text: '  ' }, null],
      warnings: ['  เตือน  ', { snapshot: SECRET.snapshot }, null],
      unknown: ['sizes'],
    });
    const doc = await surveyDocumentSummary(reportsDb([]), REQ, HEAD, {
      withChecks: true, now: NOW, precheck, zones, filesByZone: { z1: [] }, sizes: null,
    });
    const kinds = Object.fromEntries(doc.issue.blockers.map((b) => [b.text, b.kind]));
    assert.equal(kinds[sizeGate], 'system');
    assert.equal(doc.issue.blockers.filter((b) => b.text === sizeGate).length, 1);
    assert.equal(kinds['เหตุชนิดใหม่'], 'system');
    assert.equal(doc.issue.blockers.every((b) => b.text && Object.keys(b).join() === 'kind,text'), true);
    /* 🔴 คำเตือนต้องออกตามตัวอักษร — จอส่งกลับเป็น `seenWarnings` แล้ว route เทียบกับผลตัวตรวจแบบตรงตัว */
    assert.deepEqual(doc.issue.warnings, ['  เตือน  ']);
    assertNoLeak(doc, 'head/issue ผลตัวตรวจผิดรูป');
    assert.equal(doc.issue.unknown, true);
  });
});

test('`issue`: ของที่ route ไม่ได้ส่งมา — อ่านผลวัด · ไฟล์รายพื้นที่ · ทะเบียนขนาดเอง แล้วส่งต่อให้ตัวตรวจ (ไม่อ่านนัด)', async () => {
  await withEnv(PROD_OFF, async () => {
    const precheck = fakePrecheck({ blockers: [], warnings: [], unknown: [] });
    const db = fakeDb({
      service_survey_reports: [],
      service_survey_zones: [
        { id: 'z2', requestId: 'REQ-1', name: 'ห้องประชุม', sortOrder: 2 },
        { id: 'z1', requestId: 'REQ-1', name: 'ล็อบบี้', sortOrder: 1 },
        { id: 'zx', requestId: 'REQ-9', name: 'ใบอื่น', sortOrder: 1 },
      ],
      attachments: [
        { id: 'a1', entityType: 'service_survey_zone', entityId: 'z1', createdAt: '2026-09-30T00:00:00Z' },
        { id: 'a2', entityType: 'service_survey_zone', entityId: 'zx', createdAt: '2026-09-30T00:00:00Z' },
      ],
      service_package_sizes: [{ code: 'ST', nameEn: 'Standard', maxCbm: 2400, autoSuggest: true }],
    });
    const doc = await surveyDocumentSummary(db, REQ, HEAD, { withChecks: true, now: NOW, precheck });
    assert.equal(doc.issue.unknown, false);
    assert.ok(doc.issue.blockers.length > 0, 'ด่านส่งผลวิ่งกับแถวที่อ่านเอง');

    const [args] = precheck.calls;
    assert.deepEqual(args.zones.map((z) => z.id), ['z1', 'z2']);
    assert.deepEqual(Object.keys(args.filesByZone), ['z1', 'z2']);
    assert.deepEqual(args.filesByZone.z1.map((f) => f.id), ['a1']);
    assert.deepEqual(args.filesByZone.z2, []);
    assert.deepEqual(args.sizes.map((s) => s.code), ['ST']);
    assert.equal(args.open, null);
    assert.equal(db.queries('service_visits').length, 0);
  });
});

test('ตรวจล้ม = `unknown: true` ในก้อนนั้น — GET ไม่ล้ม (ตัวตรวจโยน · คืนของผิดรูป · อ่านประกอบพลาด)', async () => {
  const head = (env, request, opts, db = reportsDb([])) => quiet(() => withEnv(env, () => surveyDocumentSummary(db, request, HEAD, { withChecks: true, now: NOW, ...opts })));
  const UNKNOWN = { blockers: [], warnings: [], unknown: true };

  const thrown = await head(PROD_ON, OPEN_REQ, { precheck: fakePrecheck(new Error('ข้อมูลผิดรูป')), open: null });
  assert.deepEqual(thrown.result.send, UNKNOWN);
  assert.equal(thrown.result.state, 'not_sent', 'ส่วนที่เหลือของสรุปยังอยู่ครบ');
  assert.equal(thrown.lines.length, 1);

  const garbage = await head(PROD_ON, OPEN_REQ, { precheck: fakePrecheck(null), open: null });
  assert.deepEqual(garbage.result.send, UNKNOWN);

  /* ใบที่ตอบแล้ว: ตัวตรวจล้ม ≠ ไม่มีอะไรขวาง — ด่านส่งผลที่คิดได้แล้วยังออก คู่กับ `unknown: true` */
  const issueThrown = await head(PROD_OFF, REQ, { precheck: fakePrecheck(new Error('boom')), zones: [], filesByZone: {}, sizes: [] });
  assert.deepEqual(issueThrown.result.issue, {
    blockers: [{ kind: 'content', text: surveySendError([], {}, { canSend: true }) }], warnings: [], unknown: true,
  });

  /* อ่านนัดที่ค้างไม่สำเร็จ (`findSurveyVisit` โยน) — ตัวตรวจไม่ถูกเรียกด้วยนัดที่เดาเอา */
  const precheck = fakePrecheck(PRECHECK_RESULT);
  const visitDown = await head(PROD_ON, OPEN_REQ, { precheck }, fakeDb({ service_survey_reports: [] }, { errors: { service_visits: { message: 'boom' } } }));
  assert.deepEqual(visitDown.result.send, UNKNOWN);
  assert.equal(precheck.calls.length, 0);

  /* อ่านผลวัดไม่สำเร็จตอนตรวจใบที่ตอบแล้ว */
  const zonesDown = await head(PROD_OFF, REQ, { precheck }, fakeDb({ service_survey_reports: [] }, { errors: { service_survey_zones: { message: 'boom' } } }));
  assert.deepEqual(zonesDown.result.issue, UNKNOWN);
  assert.equal(precheck.calls.length, 0);
});

test('ต่อสายกับตัวตรวจจริง (ไม่ฉีดตัวแทน): โหลด `surveyReportPrecheck` แบบ lazy ได้ · ผลเป็นรูปของ §10 · ไม่มีของรั่ว', async () => {
  /* ⭐ ล็อกสัญญาระหว่างสองไฟล์ — ชื่อ export กับรูปผล `{ blockers: [{ kind, text }], warnings, unknown: [] }`
     ฐานปลอมแบบ "ทุกตารางว่าง" (ไม่มีเครือข่าย ไม่มี env): ใบที่ไม่มีอะไรเลยต้องได้เหตุขวาง ไม่ใช่ GET ล้ม */
  const mod = await import('./surveyReportInputs.js');
  assert.equal(typeof mod.surveyReportPrecheck, 'function');

  const emptyDb = () => {
    const tables = [];
    const chain = new Proxy({}, {
      get(_, key) {
        if (key === 'then') return (resolve) => resolve({ data: [], error: null });
        if (key === 'maybeSingle' || key === 'single') return () => Promise.resolve({ data: null, error: null });
        return () => chain;
      },
    });
    return { tables, from(table) { tables.push(table); return chain; } };
  };

  const { result: open } = await quiet(() => withEnv(PROD_ON, () => surveyDocumentSummary(emptyDb(), OPEN_REQ, HEAD, { withChecks: true, now: NOW })));
  assert.deepEqual(Object.keys(open.send), ['blockers', 'warnings', 'unknown']);
  assert.ok(open.send.blockers.length > 0, 'ใบที่ไม่มีพื้นที่/ไม่มีนัด ต้องมีเหตุขวางเรื่องเนื้อหา');
  assert.equal(open.send.blockers.every((text) => typeof text === 'string' && text), true);
  assert.equal(typeof open.send.unknown, 'boolean');
  assertNoLeak(open, 'real precheck/send');

  const db = emptyDb();
  const { result: answered } = await quiet(() => withEnv(PROD_OFF, () => surveyDocumentSummary(db, REQ, HEAD, { withChecks: true, now: NOW })));
  assert.equal(answered.state, 'missing');
  assert.deepEqual(answered.issue.blockers[0], { kind: 'content', text: surveySendError([], {}, { canSend: true }) });
  assert.equal(answered.issue.blockers.every((b) => ['content', 'system'].includes(b.kind) && b.text && Object.keys(b).join() === 'kind,text'), true);
  assert.equal(answered.issue.blockers.length > 1, true, 'เหตุขวางของตัวตรวจจริงต่อท้ายด่านส่งผล');
  assert.equal(db.tables[0], 'service_survey_reports');
  assertNoLeak(answered, 'real precheck/issue');
});

/* ══ 3c. ทุก role — คีย์ของ payload ตามสิทธิ์ และไม่มีของรั่วที่ตำแหน่งไหน ═══════════════════════════ */

test('🔴 ทุก role ในระบบ ทั้งสอง GET: คีย์ตามสิทธิ์เป๊ะ · ไม่มีภาพนิ่ง/HTML/id/ที่อยู่ไฟล์ · คนไม่มีสิทธิ์ไม่มี query', async () => {
  const HEADS = ['admin', 'commercial_director', 'commercial_manager', 'ts_audit', 'ts_manager', 'ts_senior'];
  const SALES_HEADS = ['ae_supervisor', 'ac_supervisor'];
  const rows = [reportRow({ rev: 1, docNo: 'SU-26100001-1' }), superseded(0)];
  const requests = [
    ['ตอบแล้ว มีเอกสาร', REQ, rows],
    ['ตอบแล้ว ไม่มีเอกสาร', REQ, [superseded(0)]],
    ['ยังไม่ตอบ', OPEN_REQ, [superseded(0)]],
  ];

  await withEnv(PROD_ON, async () => {
    for (const role of ROLES) {
      const user = { id: `u-${role}`, name: role, role };
      for (const [label, request, reportRows] of requests) {
        const precheck = fakePrecheck(PRECHECK_RESULT);
        const surveyDb = reportsDb(reportRows);
        const onSurvey = await surveyDocumentSummary(surveyDb, request, user, {
          withChecks: true, now: NOW, precheck, zones: [], filesByZone: {}, sizes: [], open: null,
        });
        const requestDb = reportsDb(reportRows);
        const onRequest = await surveyDocumentSummary(requestDb, request, user, { withVoids: true, now: NOW });
        const where = `${role} · ${label}`;
        assertNoLeak(onSurvey, where);
        assertNoLeak(onRequest, where);

        if (HEADS.includes(role)) {
          assert.deepEqual(Object.keys(onSurvey), HEAD_KEYS, where);
          assert.deepEqual(onSurvey.access, ALL_ACCESS, where);
          assert.deepEqual(Object.keys(onRequest), [...HEAD_KEYS, 'voids'], where);
          assert.equal(onRequest.send, null, `${where}: GET คำร้องไม่ตรวจ`);
          assert.equal(onRequest.issue, null, `${where}: GET คำร้องไม่ตรวจ`);
        } else if (role === 'executive') {
          assert.deepEqual(Object.keys(onSurvey), BASE_KEYS, where);
          assert.deepEqual(Object.keys(onRequest), BASE_KEYS, where);
          assert.equal(onSurvey.access.internal, true, where);
        } else if (SALES_HEADS.includes(role)) {
          assert.deepEqual(Object.keys(onSurvey), BASE_KEYS, where);
          assert.deepEqual(Object.keys(onRequest), [...BASE_KEYS, 'voids'], where);
          assert.deepEqual(onSurvey.access, { customer: true, internal: false, issue: false, draft: false, history: false }, where);
        } else if (role === 'ts_planner') {
          assert.deepEqual(onSurvey, { access: 'none' }, where);
          assert.deepEqual(Object.keys(onRequest), ['access', 'voids'], where);
          assert.equal(onRequest.access, 'none', where);
          assert.equal(surveyDb.log.length, 0, where);
        } else {
          assert.deepEqual(onSurvey, { access: 'none' }, where);
          assert.deepEqual(onRequest, { access: 'none' }, where);
          assert.equal(surveyDb.log.length + requestDb.log.length, 0, `${where}: ไม่มี query`);
        }

        /* ตัวตรวจวิ่งให้เฉพาะคนที่ออกเอกสารได้ */
        if (!HEADS.includes(role)) assert.equal(precheck.calls.length, 0, where);
        /* ทุก query ของตารางเอกสารใช้ค่าคงที่ ไม่ใช่ `*` */
        for (const q of [...surveyDb.queries('service_survey_reports'), ...requestDb.queries('service_survey_reports')]) {
          assert.equal(q.select, SURVEY_REPORT_COLUMNS, where);
        }
      }
    }
  });
});

/* ══ 4. น้ำหนักของโมดูล (§14 · มติ 24) ══════════════════════════════════════════════════════ */

test('🔴 หัวไฟล์ไม่ import ของหนัก — ตัวตรวจ/ตัวอ่านประกอบโหลดด้วย `await import()` · อ่านอย่างเดียว · ทุก query มี limit', () => {
  const src = code(ROWS);
  const staticImports = [...src.matchAll(STATIC_IMPORT)].map((m) => m[1]).sort();
  assert.deepEqual(staticImports, ['./surveyAccess', './surveyReportState', '@/lib/businessDate', '@/lib/requests/access'].sort());

  /* ของที่โหลดตอนต้องตรวจจริงเท่านั้น — รายชื่อเป๊ะ: เพิ่มตัวใหม่ต้องตั้งใจ (และต้องไม่ใช่ sharp/chromium/ขั้นออกเลข) */
  const lazyImports = [...new Set([...src.matchAll(/\bimport\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(lazyImports, [
    './packageSizes', './packageSizesRepo', './survey', './surveyReportInputs', './surveyRepo', './surveySpotPhotos', './surveyVisit',
    '@/lib/master/attachments',
  ].sort());
  assert.match(src, /await import\('\.\/surveyReportInputs'\)/, 'ตัวตรวจต้องโหลดแบบ lazy');

  /* ไม่มี `select('*')` / `.select()` เปล่า และไม่เขียนอะไรลงฐาน/ที่เก็บไฟล์ — ไฟล์นี้อ่านอย่างเดียว */
  assert.equal(/\.select\(\s*\)|\.select\(\s*['"`]\*/.test(src), false);
  for (const write of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(', '.upload(', '.storage']) {
    assert.equal(src.includes(write), false, `โมดูลแถวต้องไม่มี ${write}`);
  }
  /* ทุก query ของตารางเอกสารมี limit (ด่าน check:rowcap) และเลือกคอลัมน์ตามค่าคงที่ */
  const queries = src.split(".from('service_survey_reports')").slice(1);
  assert.equal(queries.length, 2);
  for (const q of queries) {
    assert.match(q.slice(0, 260), /^\.select\(SURVEY_REPORT_COLUMNS\)/);
    assert.match(q.slice(0, 260), /\.limit\(/);
  }
});

test('🔴 เส้น import แบบ static ทั้งสาย (ไล่ทุกชั้น) ไม่ถึง sharp · chromium · ตัวประกอบภาพนิ่ง/ตัวจัดหน้า/ขั้นออกเลข', () => {
  /* ไฟล์นี้อยู่บนเส้นของ GET ใบประเมิน · GET/PATCH คำร้อง · ดึงผลกลับ — ของหนักตัวเดียวที่ปลายสาย = ทุกเส้นแบกมัน */
  const seen = new Set();
  const packages = new Set();
  const resolve = (from, spec) => {
    const base = spec.startsWith('@/') ? path.join('src', spec.slice(2)) : path.join(path.dirname(from), spec);
    return [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')]
      .find((p) => fs.existsSync(path.join(WEBAPP, p)) && fs.statSync(path.join(WEBAPP, p)).isFile()) || null;
  };
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
  walk(ROWS);

  assert.ok(seen.size >= 5, 'ไล่ได้จริง (ไฟล์นี้ + ด่านสิทธิ์ + สถานะ + วันไทย + สิทธิ์คำร้อง เป็นอย่างน้อย)');
  for (const heavy of ['sharp', 'puppeteer-core', '@sparticuz/chromium', 'googleapis']) {
    assert.equal([...packages].some((p) => p === heavy || p.startsWith(`${heavy}/`)), false, `import แบบ static ไปถึงแพ็กเกจ ${heavy}`);
  }
  const reached = [...seen].map((f) => path.basename(f));
  for (const heavy of ['htmlPdf.js', 'drive.js', 'surveyReportInputs.js', 'surveyReportSnapshot.js', 'surveyReportLayout.js',
    'surveyReportDocument.js', 'surveyReportView.js', 'surveyReportIssue.js', 'surveyReportImages.js', 'surveyReportPaper.js']) {
    assert.equal(reached.includes(heavy), false, `import แบบ static ไปถึง ${heavy}`);
  }
});
