// ── ยามของตัวอ่านแถวเอกสารประเมิน (สเปก PR-2 §0 · §10 · §14 · §15 "Leak" ข้อ 6) ─────────────────────────
//
// ⭐ สี่ชั้นที่ต้องล็อก:
//   1. ยามเขียนของถาวร + ธงออกเอกสารตอนส่งผล — production เท่านั้น · ธงเปิดได้ด้วยคำเดียว
//   2. ตัวอ่าน (`loadSurveyReports` · `surveyReportVoided`) รันกับฐานปลอม — รูป query · อ่านพลาด = บอกว่าไม่รู้ ไม่โยน
//   3. **ของรั่ว** — สรุปของจอ (`surveyDocumentSummary`) ต่อ role: ช่างได้ `{ access: 'none' }` เป๊ะและไม่มี query ·
//      ผู้ขอไม่ได้ `history`/`send`/`issue` · Planner (มติเจ้าของ 19/10/2026) ได้ก้อนเต็มยกเว้น `send`/`signRule` ·
//      ไม่มีคีย์ไหนพกภาพนิ่ง/HTML/id ของแถว/ที่อยู่ไฟล์ แม้แถวที่ฐานคืนมาจะมีครบ
//   4. น้ำหนักของโมดูล — หัวไฟล์ไม่ import ของหนัก · ตัวตรวจโหลดด้วย `await import()` เฉพาะตอนต้องตรวจ
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROLES } from '../permissions.js';
import { surveyPackageSizeSendError } from './packageSizes.js';
import { surveySendError } from './survey.js';
import { SURVEY_SIGN_RULE, SURVEY_SIGN_SEATS, surveyReportSignatureIssues } from './surveyReportSigners.js';
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
  /* สวิตช์ลายเซ็นจริงอยู่ในชุดด้วย — ไม่ระบุ = ปิด (เทสต์เดิมทุกตัวรันแบบกติกาปิด ไม่ว่าเครื่องที่รันจะตั้ง env อะไรไว้) */
  const keys = ['VERCEL_ENV', 'SURVEY_REPORT_ISSUE_AT_SEND', 'SURVEY_REPORT_SIGNATURES'];
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
/* คนออกที่ไม่ใช่หัวหน้า (ผู้วางคิว · มติเจ้าของ 19/10/2026) — ไม่มีคีย์ `send` (ส่งผลไม่ได้) */
const ISSUER_KEYS = [...BASE_KEYS, 'history', 'nextDocNo', 'issue'];
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

/* ⭐ มติเจ้าของ 19/10/2026 "ให้ apisith planner ออกให้ด้วย" — Planner ได้ก้อนของคนออกเอกสาร (สองฉบับ · รายการ Rev · เลขถัดไป · `issue`)
   🔴 แต่ไม่มีคีย์ `send` / `signRule` — ส่งผล/ดึงผลกลับยังเป็นของหัวหน้า · ตัวตรวจก่อนส่งผลไม่ถูกเรียกให้เขาเลย */
test('⭐ Planner ทั้งสอง GET: ก้อนของคนออกเอกสาร + `voids` (GET คำร้อง) — ไม่มี `send` · ไม่มีตัวตรวจก่อนส่งผล', async () => {
  const db = reportsDb([reportRow({ rev: 1, docNo: 'SU-26100001-1' }), superseded(0)]);
  const onRequest = await surveyDocumentSummary(db, REQ, PLANNER, { withVoids: true, now: NOW });
  assert.deepEqual(Object.keys(onRequest), [...ISSUER_KEYS, 'voids']);
  assert.deepEqual(onRequest.access, ALL_ACCESS, 'ใบที่ส่งผลแล้ว = ร่างได้ด้วย');
  assert.equal(onRequest.voids, 'SU-26100001-1');
  assert.equal(onRequest.issue, null, 'GET คำร้องไม่ตรวจ');
  assert.deepEqual(onRequest.history.map((h) => h.docNo), ['SU-26100001-0']);
  assert.equal(db.queries('service_survey_reports').length, 1);
  assertNoLeak(onRequest, 'planner request');

  /* ไม่มีฉบับที่ใช้อยู่ (ดึงกลับแล้ว / ยังไม่เคยออก) = `voids: null` · ใบที่ยังไม่ตอบ = ไม่มีร่าง */
  const open = await surveyDocumentSummary(reportsDb([superseded(0)]), OPEN_REQ, PLANNER, { withVoids: true, now: NOW });
  assert.equal(open.voids, null);
  assert.deepEqual(open.access, { ...ALL_ACCESS, draft: false });
  assert.equal(open.nextDocNo, 'SU-26100001-1');
  assert.equal((await surveyDocumentSummary(reportsDb([]), REQ, PLANNER, { withVoids: true, now: NOW })).voids, null);

  /* แถวค้างสถานะ (`stale` — ของคำตอบรอบก่อน) ไม่ถูกเอ่ย: กติกาเดียวกับ `surveyReportVoided` ที่เธรดใช้หลังกด */
  const staleDb = reportsDb([reportRow({ approvedAt: '2026-09-30T05:00:00+00:00' })]);
  assert.equal((await surveyDocumentSummary(staleDb, REQ, PLANNER, { withVoids: true, now: NOW })).voids, null);

  /* GET ใบประเมิน: ใบที่ยังไม่ตอบ = ไม่มีตัวตรวจก่อนส่งผล ไม่มีคีย์ `send` แม้สวิตช์ออกตอนส่งเปิด */
  await withEnv(PROD_ON, async () => {
    const precheck = fakePrecheck(PRECHECK_RESULT);
    const onSurvey = await surveyDocumentSummary(reportsDb([]), OPEN_REQ, PLANNER, {
      withChecks: true, now: NOW, precheck, zones: [], filesByZone: {}, sizes: [], open: null,
    });
    assert.deepEqual(Object.keys(onSurvey), ISSUER_KEYS);
    assert.equal(onSurvey.state, 'not_sent');
    assert.equal(onSurvey.issue, null);
    assert.equal(precheck.calls.length, 0, 'ไม่จ่ายค่าตัวโหลด/ภาพนิ่ง/จัดหน้าให้ผลที่ไม่มีใครใช้');
  });

  /* อ่านพลาด = บอกว่าไม่รู้ ไม่ใช่บอกว่าไม่มีฉบับที่จะถูกแทนที่ */
  const failed = await quiet(() => surveyDocumentSummary(
    reportsDb([reportRow()], { errors: { service_survey_reports: { message: 'boom' } } }), REQ, PLANNER, { withVoids: true, now: NOW },
  ));
  assert.equal(failed.result.unknown, true);
  assert.equal(failed.result.voids, null);
  assert.equal(failed.result.state, null);
  assert.equal('send' in failed.result, false);
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
          /* ⭐ มติเจ้าของ 19/10/2026 — ก้อนของคนออกเอกสาร ไม่มี `send` · ร่างเฉพาะใบที่ส่งผลแล้ว */
          const access = request.answeredAt ? ALL_ACCESS : { ...ALL_ACCESS, draft: false };
          assert.deepEqual(Object.keys(onSurvey), ISSUER_KEYS, where);
          assert.deepEqual(onSurvey.access, access, where);
          assert.deepEqual(Object.keys(onRequest), [...ISSUER_KEYS, 'voids'], where);
          assert.equal(onRequest.issue, null, `${where}: GET คำร้องไม่ตรวจ`);
          /* ตัวตรวจวิ่งให้เขาเฉพาะ "ตอบแล้ว ไม่มีเอกสาร" (ปุ่มออกเอกสาร) — ใบที่ตอบแล้วเสมอ ⇒ ไม่มีทางที่ตัวตรวจจะถือเขาเป็นผู้อนุมัติที่รออยู่ */
          assert.equal(precheck.calls.length, label === 'ตอบแล้ว ไม่มีเอกสาร' ? 1 : 0, where);
          for (const args of precheck.calls) {
            assert.ok(args.request.answeredAt, where);
            assert.equal(args.request.answeredById, 'u-head', where);
          }
        } else {
          assert.deepEqual(onSurvey, { access: 'none' }, where);
          assert.deepEqual(onRequest, { access: 'none' }, where);
          assert.equal(surveyDb.log.length + requestDb.log.length, 0, `${where}: ไม่มี query`);
        }

        /* ตัวตรวจวิ่งให้เฉพาะคนที่ออกเอกสารได้ */
        if (!HEADS.includes(role) && role !== 'ts_planner') assert.equal(precheck.calls.length, 0, where);
        /* ทุก query ของตารางเอกสารใช้ค่าคงที่ ไม่ใช่ `*` */
        for (const q of [...surveyDb.queries('service_survey_reports'), ...requestDb.queries('service_survey_reports')]) {
          assert.equal(q.select, SURVEY_REPORT_COLUMNS, where);
        }
      }
    }
  });
});

/* ══ 3d. กติกาลายเซ็นจริง (PR-SIG §5 · มติเจ้าของ 09/10/2026) ═══════════════════════════════════ */

const SIGN_KEYS = ['signRule', 'selfSign', 'signers', 'sign', 'self'];
/* ของที่ตัวตรวจถืออยู่แต่ห้ามออก payload — รหัสผู้ใช้ของบรรทัด · รหัสฉบับ · sha ต้นทาง · ที่อยู่ไฟล์ในคลังลายเซ็น */
const SIGN_SECRET = {
  versionId: 'signature-version-SECRET-1', storagePath: 'users/u-lead/signature-version-SECRET-1.png',
  sha256: `sha256:${'c'.repeat(64)}`,
};
const SIGN_FORBIDDEN_KEYS = ['userId', 'version', 'versionId', 'versionNumber', 'storagePath', 'sha256', 'sourceSha256', 'width', 'height'];
function assertNoSignLeak(payload, label) {
  const keys = deepKeys(payload);
  for (const key of SIGN_FORBIDDEN_KEYS) assert.equal(keys.has(key), false, `${label}: payload ต้องไม่มีคีย์ ${key}`);
  const text = JSON.stringify(payload);
  for (const value of [...Object.values(SIGN_SECRET), 'signature-assets', 'users/', 'u-lead', 'u-head']) {
    assert.equal(text.includes(value), false, `${label}: payload ต้องไม่มีค่า ${value}`);
  }
}
const version = (userId) => ({ ...SIGN_SECRET, versionNumber: 1, width: 640, height: 240, userId });
const SIGNERS_BOTH = [
  { seats: ['assessor'], userId: 'u-lead', name: 'สมชาย ผู้ประเมิน', version: version('u-lead') },
  { seats: ['approver'], userId: 'u-head', name: 'อานนท์', version: version('u-head') },
];
const LINE_ASSESSOR = 'ผู้ประเมิน สมชาย ผู้ประเมิน ยังไม่มีลายเซ็นในระบบ — ให้เจ้าตัวเพิ่มที่ “บัญชีของฉัน” ก่อน';
const LINE_APPROVER = 'ผู้ตรวจสอบและอนุมัติ อานนท์ (ผู้ส่งผล) ยังไม่มีลายเซ็นในระบบ — เพิ่มที่ “บัญชีของฉัน” ก่อนส่งผล หรือให้หัวหน้าที่มีลายเซ็นแล้วเป็นผู้ส่งผล';
const signBlocker = (text, userId, seats) => ({ kind: 'content', sign: true, userId, seats, text });

test('🔴 กติกาลายเซ็นปิด (ค่าตั้งต้น): payload ไม่มีคีย์ใหม่สักคีย์ แม้ตัวตรวจจะแนบธง/ผู้ลงนามมา · ตัวตรวจได้ `signatureRule: off`', async () => {
  const result = {
    blockers: [signBlocker(LINE_ASSESSOR, 'u-lead', ['assessor']), { kind: 'system', text: 'อ่านข้อมูลบริษัทไม่สำเร็จ' }],
    warnings: [], unknown: [], signers: SIGNERS_BOTH,
  };
  for (const [env, request] of [[PROD_ON, OPEN_REQ], [PROD_OFF, REQ]]) {
    const precheck = fakePrecheck(result);
    const doc = await withEnv(env, () => surveyDocumentSummary(reportsDb([]), request, HEAD, {
      withChecks: true, now: NOW, precheck, zones: [], filesByZone: {}, sizes: [], open: null,
    }));
    assert.deepEqual(Object.keys(doc), HEAD_KEYS, 'ไม่มีคีย์ `signRule`');
    const keys = deepKeys(doc);
    for (const key of SIGN_KEYS) assert.equal(keys.has(key), false, `กติกาปิดต้องไม่มีคีย์ ${key}`);
    assertNoSignLeak(doc, 'กติกาปิด');
    assert.equal(precheck.calls[0].signatureRule, 'off', 'สรุปถามสวิตช์เองครั้งเดียว แล้วส่งคำตอบให้ตัวตรวจ');
  }
  // ค่าที่ไม่ใช่ `required` = ปิด (รวม `true` · `on`) — เปิดได้ด้วยค่าเดียว
  for (const signatureRule of ['off', 'on', true, 1, '']) {
    const doc = await withEnv(PROD_ON, () => surveyDocumentSummary(reportsDb([]), OPEN_REQ, HEAD, {
      withChecks: true, now: NOW, precheck: fakePrecheck(result), open: null, signatureRule,
    }));
    assert.equal('signRule' in doc, false, JSON.stringify(signatureRule));
  }
});

test('กติกาลายเซ็นเปิด: `signRule` · ตัวตรวจได้ `required` — เปิดด้วยสวิตช์ (คำว่า on คำเดียว) หรือค่าที่ส่งตรง ๆ · ค่าตรงกับโมดูลผู้ลงนาม', async () => {
  const run = (env, opts = {}) => {
    const precheck = fakePrecheck({ blockers: [], warnings: [], unknown: [], signers: [] });
    return withEnv(env, () => surveyDocumentSummary(reportsDb([]), OPEN_REQ, HEAD, { withChecks: true, now: NOW, precheck, open: null, ...opts }))
      .then((doc) => ({ doc, args: precheck.calls[0] }));
  };
  const byEnv = await run({ ...PROD_ON, SURVEY_REPORT_SIGNATURES: 'on' });
  assert.deepEqual(Object.keys(byEnv.doc), [...HEAD_KEYS, 'signRule']);
  assert.equal(byEnv.doc.signRule, true);
  assert.equal(byEnv.args.signatureRule, SURVEY_SIGN_RULE);
  // ไม่มีข้อไหนติดและตัวตรวจไม่คืนผู้ลงนาม = ก้อน `send` เท่าเดิมทุกคีย์
  assert.deepEqual(byEnv.doc.send, { blockers: [], warnings: [], unknown: false });

  for (const value of ['1', 'true', 'required', 'off']) {
    assert.equal('signRule' in (await run({ ...PROD_ON, SURVEY_REPORT_SIGNATURES: value })).doc, false, value);
  }
  const byOption = await run(PROD_ON, { signatureRule: SURVEY_SIGN_RULE });
  assert.equal(byOption.doc.signRule, true);
  // ค่าที่ส่งตรง ๆ ชนะสวิตช์ทั้งสองทาง
  assert.equal('signRule' in (await run({ ...PROD_ON, SURVEY_REPORT_SIGNATURES: 'on' }, { signatureRule: 'off' })).doc, false);

  // คีย์นี้ไม่ขึ้นกับการตรวจ: GET คำร้อง (ไม่ตรวจ) ของหัวหน้าก็ได้ · สวิตช์ออกเอกสารตอนส่งผลปิดก็ได้
  const onRequest = await withEnv(PROD_OFF, () => surveyDocumentSummary(reportsDb([reportRow()]), REQ, HEAD, {
    withVoids: true, now: NOW, signatureRule: SURVEY_SIGN_RULE,
  }));
  assert.equal(onRequest.signRule, true);
  assert.equal(onRequest.send, null);
});

test('🔴 กติกาลายเซ็นเปิด · ก่อนส่งผล: ข้อ "ยังไม่มีลายเซ็น" อยู่ในเหตุขวาง · `selfSign` เฉพาะเมื่อเป็นของคนดู · ไม่มีรหัสผู้ใช้ออก payload', async () => {
  const check = (blockers, user = HEAD, signers = []) => withEnv(PROD_ON, () => surveyDocumentSummary(reportsDb([]), OPEN_REQ, user, {
    withChecks: true, now: NOW, open: null, signatureRule: SURVEY_SIGN_RULE,
    precheck: fakePrecheck({ blockers, warnings: [], unknown: [], signers }),
  }));

  // ผู้ประเมิน (คนอื่น) ยังไม่มีลายเซ็น — ขวางการส่ง แต่ไม่ใช่ของคนดู
  const other = await check([signBlocker(LINE_ASSESSOR, 'u-lead', ['assessor'])]);
  assert.deepEqual(other.send, { blockers: [LINE_ASSESSOR], warnings: [], unknown: false });
  assertNoSignLeak(other, 'assessor missing');

  // ผู้ส่งผล = คนดูเอง ⇒ `selfSign` · ข้อของระบบไม่ขึ้นเป็นเหตุขวางเหมือนเดิม
  const mine = await check([
    signBlocker(LINE_ASSESSOR, 'u-lead', ['assessor']), signBlocker(LINE_APPROVER, 'u-head', ['approver']),
    { kind: 'system', text: 'อ่านข้อมูลบริษัทไม่สำเร็จ' },
  ]);
  assert.deepEqual(mine.send, { blockers: [LINE_ASSESSOR, LINE_APPROVER], warnings: [], unknown: false, selfSign: true });
  assertNoSignLeak(mine, 'approver missing');

  // หัวหน้าอีกคนเปิดใบเดียวกัน: บรรทัดเดียวกัน (ข้อความไม่ขึ้นกับคนดู) แต่ไม่ใช่ของเขา
  const colleague = await check([signBlocker(LINE_APPROVER, 'u-head', ['approver'])], { ...HEAD, id: 'u-head-2', name: 'วิชัย' });
  assert.deepEqual(colleague.send, { blockers: [LINE_APPROVER], warnings: [], unknown: false });

  // ธง `sign` ที่ไม่ใช่ `true` ตรงตัว หรืออยู่บนข้อของระบบ = ไม่นับ · ไม่มีรหัสผู้ใช้ = ไม่มีทางเป็นของคนดู
  const odd = await check([
    { kind: 'content', sign: 'yes', userId: 'u-head', text: 'ข้อแปลก 1' },
    { kind: 'system', sign: true, userId: 'u-head', text: 'ข้อแปลก 2' },
    { kind: 'content', sign: true, text: 'ข้อแปลก 3' },
  ]);
  assert.deepEqual(odd.send, { blockers: ['ข้อแปลก 1', 'ข้อแปลก 3'], warnings: [], unknown: false });
});

test('🔴 กติกาลายเซ็นเปิด: `signers` = ที่นั่งกับชื่อเท่านั้น — รหัสผู้ใช้ รหัสฉบับ sha และที่อยู่ไฟล์ในคลังไม่ออก payload', async () => {
  const run = (request, env, signers) => withEnv(env, () => surveyDocumentSummary(reportsDb([]), request, HEAD, {
    withChecks: true, now: NOW, zones: [], filesByZone: {}, sizes: [], open: null, signatureRule: SURVEY_SIGN_RULE,
    precheck: fakePrecheck({ blockers: [], warnings: [], unknown: [], signers }),
  }));
  const EXPECTED = [{ seats: ['assessor'], name: 'สมชาย ผู้ประเมิน' }, { seats: ['approver'], name: 'อานนท์' }];

  const send = await run(OPEN_REQ, PROD_ON, SIGNERS_BOTH);
  assert.deepEqual(send.send, { blockers: [], warnings: [], unknown: false, signers: EXPECTED });
  assertNoSignLeak(send, 'send.signers');
  assertNoLeak(send, 'send.signers');

  const issue = await run(REQ, PROD_OFF, SIGNERS_BOTH);
  assert.equal(issue.state, 'missing');
  assert.deepEqual(issue.issue.signers, EXPECTED);
  assert.deepEqual(Object.keys(issue.issue), ['blockers', 'warnings', 'unknown', 'signers']);
  assertNoSignLeak(issue, 'issue.signers');

  // คนเดียวสองที่นั่ง = แถวเดียว ที่นั่งเรียงตามกระดาษ · ที่นั่งที่ไม่รู้จัก/แถวไม่มีชื่อถูกทิ้ง · ว่าง = ไม่มีคีย์
  const same = await run(OPEN_REQ, PROD_ON, [
    { seats: ['approver', 'assessor', 'customer'], userId: 'u-head', name: ' อานนท์ ', version: version('u-head') },
    { seats: ['sales'], userId: 'u-x', name: 'ไม่ใช่ที่นั่งของเอกสาร', version: version('u-x') },
    { seats: ['assessor'], userId: 'u-y', name: '  ', version: version('u-y') },
    null,
  ]);
  assert.deepEqual(same.send.signers, [{ seats: [...SURVEY_SIGN_SEATS], name: 'อานนท์' }]);
  for (const empty of [[], null, undefined, 'x']) assert.equal('signers' in (await run(OPEN_REQ, PROD_ON, empty)).send, false);
});

test('กติกาลายเซ็นเปิด · ใบตอบแล้วไม่มีเอกสาร: ข้อ "ยังไม่มีลายเซ็น" พกธง `sign` (+ `self` เมื่อเป็นของคนดู) · ธงอ่านจากทุกแถวก่อนยุบข้อความซ้ำ', async () => {
  const sentApprover = 'ผู้ตรวจสอบและอนุมัติ อานนท์ (ผู้ส่งผล) ยังไม่มีลายเซ็นในระบบ — ให้เจ้าตัวเพิ่มที่ “บัญชีของฉัน” หรือดึงผลกลับแล้วให้หัวหน้าที่มีลายเซ็นส่งใหม่';
  const zones = [{ id: 'z1', requestId: 'REQ-1', name: 'ล็อบบี้', packageSize: 'ZZ' }];
  const doc = await withEnv(PROD_OFF, () => surveyDocumentSummary(reportsDb([]), REQ, HEAD, {
    withChecks: true, now: NOW, zones, filesByZone: { z1: [] }, sizes: [], signatureRule: SURVEY_SIGN_RULE,
    precheck: fakePrecheck({
      blockers: [
        { kind: 'content', text: LINE_ASSESSOR }, // แถวซ้ำที่ไม่มีธง มาก่อน
        signBlocker(LINE_ASSESSOR, 'u-lead', ['assessor']),
        signBlocker(sentApprover, 'u-head', ['approver']),
        { kind: 'content', text: 'ฉบับลูกค้า: หน้า 2 ล้น' },
        { kind: 'system', text: 'อ่านข้อมูลบริษัทไม่สำเร็จ' },
      ],
      warnings: [], unknown: [], signers: [],
    }),
  }));
  const tail = doc.issue.blockers.slice(-4);
  assert.deepEqual(tail, [
    { kind: 'content', text: LINE_ASSESSOR, sign: true },
    { kind: 'content', text: sentApprover, sign: true, self: true },
    { kind: 'content', text: 'ฉบับลูกค้า: หน้า 2 ล้น' },
    { kind: 'system', text: 'อ่านข้อมูลบริษัทไม่สำเร็จ' },
  ]);
  // ด่านส่งผลที่วิ่งซ้ำ (ไม่ใช่เรื่องลายเซ็น) ยังมีแค่สองคีย์
  assert.ok(doc.issue.blockers.slice(0, -4).every((b) => Object.keys(b).join() === 'kind,text'));
  assert.equal('signers' in doc.issue, false, 'ยังมีที่นั่งที่ไม่มีลายเซ็น = ไม่มีรายชื่อผู้ลงนาม');
  assertNoSignLeak(doc, 'issue.blockers');
});

test('🔴 กติกาลายเซ็นเปิด: ผู้ขอ (ฝ่ายขาย) · ผู้บริหาร · ช่าง ไม่ได้คีย์ `send` · `issue` · `signRule` — ทั้งสอง GET', async () => {
  await withEnv({ ...PROD_ON, SURVEY_REPORT_SIGNATURES: 'on' }, async () => {
    for (const request of [REQ, OPEN_REQ]) {
      for (const user of [REQUESTER, TEAMMATE, AE_SUP, EXEC, CREW, STRANGER]) {
        const precheck = fakePrecheck({ blockers: [signBlocker(LINE_ASSESSOR, user.id, ['assessor'])], warnings: [], unknown: [], signers: SIGNERS_BOTH });
        const onSurvey = await surveyDocumentSummary(reportsDb([]), request, user, { withChecks: true, now: NOW, precheck, zones: [], filesByZone: {}, sizes: [], open: null });
        const onRequest = await surveyDocumentSummary(reportsDb([]), request, user, { withVoids: true, now: NOW, precheck });
        for (const payload of [onSurvey, onRequest]) {
          // `issue` เป็นชื่อธงใน `access` ด้วย — สองก้อนของตัวตรวจจึงดูที่ชั้นบนสุด · คีย์ของลายเซ็นไล่ทุกชั้น
          for (const key of ['send', 'issue']) assert.equal(key in payload, false, `${user.role}: ${key}`);
          const keys = deepKeys(payload);
          for (const key of SIGN_KEYS) assert.equal(keys.has(key), false, `${user.role}: ${key}`);
          assertNoSignLeak(payload, user.role);
        }
        assert.equal(precheck.calls.length, 0, `${user.role}: ตัวตรวจไม่ถูกเรียก`);
      }
    }
  });
});

/* ⭐ มติเจ้าของ 19/10/2026 — Planner ออกเอกสารได้ แต่ **ไม่ได้ `signRule`** (คนอ่านคือกล่องยืนยันดึงผลกลับ ซึ่งเขาไม่มี) และไม่ได้ `send`
   · ตัวตรวจของปุ่มออกเอกสารยังได้กติกาลายเซ็นของจริง (`required`) ⇒ ข้อ "ยังไม่มีลายเซ็น" ของผู้ประเมิน/ผู้ส่งผลยังขึ้นก่อนเขากด */
test('🔴 กติกาลายเซ็นเปิด · Planner: ไม่มีคีย์ `send` · `signRule` ทั้งสอง GET — แต่ `issue` ของใบที่ตอบแล้วยังได้ข้อลายเซ็นจากตัวตรวจที่ได้ `required`', async () => {
  await withEnv({ ...PROD_ON, SURVEY_REPORT_SIGNATURES: 'on' }, async () => {
    for (const request of [REQ, OPEN_REQ]) {
      const precheck = fakePrecheck({ blockers: [signBlocker(LINE_ASSESSOR, 'u-lead', ['assessor'])], warnings: [], unknown: [] });
      const onSurvey = await surveyDocumentSummary(reportsDb([]), request, PLANNER, { withChecks: true, now: NOW, precheck, zones: [], filesByZone: {}, sizes: [], open: null });
      const onRequest = await surveyDocumentSummary(reportsDb([]), request, PLANNER, { withVoids: true, now: NOW, precheck });
      for (const payload of [onSurvey, onRequest]) {
        assert.equal('send' in payload, false, `${request.status}: send`);
        assert.equal('signRule' in payload, false, `${request.status}: signRule`);
        assert.equal(deepKeys(payload).has('selfSign'), false);
        assertNoSignLeak(payload, `planner ${request.status}`);
      }
      if (request.answeredAt) {
        assert.equal(precheck.calls.length, 1, 'ตัวตรวจของปุ่มออกเอกสาร (GET ใบประเมินเท่านั้น)');
        assert.equal(precheck.calls[0].signatureRule, 'required');
        assert.deepEqual(onSurvey.issue.blockers.filter((b) => b.sign), [{ kind: 'content', text: LINE_ASSESSOR, sign: true }]);
      } else {
        assert.equal(precheck.calls.length, 0, 'ใบที่ยังไม่ตอบ = ไม่มีตัวตรวจก่อนส่งผลให้เขา');
        assert.equal(onSurvey.issue, null);
      }
    }
  });
});

test('ต่อสายกับตัวตรวจจริง · กติกาลายเซ็นเปิด: ผู้ส่งผลที่ยังไม่มีลายเซ็นได้บรรทัดของ `surveyReportSignatureIssues` + `selfSign` · หัวหน้าอีกคนไม่ได้', async () => {
  /* ฐานปลอม "ทุกตารางว่าง" = ไม่มีใครมีลายเซ็น · ใบยังไม่ส่ง ⇒ ที่นั่งผู้ตรวจสอบและอนุมัติ = คนที่กำลังจะกดส่ง (คนดู) */
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
  const expected = surveyReportSignatureIssues({
    signatureRule: SURVEY_SIGN_RULE, answerPending: true, signatures: {},
    // ผู้ส่งที่กำลังจะกดส่ง = นั่งที่นั่งผู้ตรวจสอบและอนุมัติได้ (ธงที่ตัวโหลดตั้งให้ผู้ส่งที่กำลังจะเขียน)
    signerEligible: { assessor: null, approver: true },
    request: { answeredAt: NOW.toISOString(), answeredById: HEAD.id, answeredByName: HEAD.name },
  });
  assert.equal(expected.length, 1);
  assert.equal(expected[0].text, LINE_APPROVER);

  const on = emptyDb();
  const { result: head } = await quiet(() => withEnv({ ...PROD_ON, SURVEY_REPORT_SIGNATURES: 'on' },
    () => surveyDocumentSummary(on, OPEN_REQ, HEAD, { withChecks: true, now: NOW })));
  assert.equal(head.signRule, true);
  assert.ok(head.send.blockers.includes(LINE_APPROVER), head.send.blockers.join(' | '));
  assert.equal(head.send.selfSign, true);
  assert.equal('signers' in head.send, false);
  for (const table of ['user_signatures']) assert.ok(on.tables.includes(table), `ตัวโหลดต้องอ่าน ${table}`);
  assertNoSignLeak({ ...head, access: null }, 'real precheck/sign');

  // สวิตช์ปิด: ไม่มีบรรทัดลายเซ็น ไม่มีคีย์ และไม่อ่านตารางลายเซ็นสักคำสั่ง
  const off = emptyDb();
  const { result: plain } = await quiet(() => withEnv(PROD_ON, () => surveyDocumentSummary(off, OPEN_REQ, HEAD, { withChecks: true, now: NOW })));
  assert.equal(plain.send.blockers.some((line) => line.includes('ลายเซ็น')), false);
  assert.deepEqual(Object.keys(plain.send), ['blockers', 'warnings', 'unknown']);
  assert.equal(off.tables.some((table) => table.startsWith('user_signature')), false);
});

/* ══ 3ข. งวด S3 — ใบที่มีพื้นที่ประเมินจากแบบ (ถอดข้อกันเอกสาร · ค่าสวิตช์เป็นตัวเลือก) ═════════════════════════ */

test('🔴 งวด S3: `issue.blockers` / `send.blockers` ไม่มีคีย์ `hold` — ธงที่ตัวตรวจ (รุ่นใดก็ตาม) แนบมาถูกทิ้ง · ข้อมีแค่ `kind` กับ `text`', async () => {
  const blockers = [
    { kind: 'system', hold: true, text: 'ข้อที่เคยกันเอกสาร' },
    { kind: 'content', hold: true, text: 'ข้อของเนื้อใบที่พกธงมา' },
    { kind: 'system', text: 'เหตุของระบบ' },
  ];
  const run = (request, env) => withEnv(env, () => surveyDocumentSummary(reportsDb([]), request, HEAD, {
    withChecks: true, now: NOW, zones: [], filesByZone: {}, sizes: [], open: null,
    precheck: fakePrecheck({ blockers, warnings: [], unknown: [] }),
  }));
  const issue = await run(REQ, PROD_OFF);
  // ข้อแรกเป็นด่านส่งผลที่ขั้นออกเลขวิ่งซ้ำ (ใบเปล่าของเทสต์นี้) — ต่อด้วยข้อของตัวตรวจตามลำดับ
  assert.deepEqual(issue.issue.blockers.slice(-3), [
    { kind: 'system', text: 'ข้อที่เคยกันเอกสาร' },
    { kind: 'content', text: 'ข้อของเนื้อใบที่พกธงมา' },
    { kind: 'system', text: 'เหตุของระบบ' },
  ]);
  for (const b of issue.issue.blockers) assert.deepEqual(Object.keys(b), ['kind', 'text']);
  assert.equal(deepKeys(issue).has('hold'), false);
  const send = await run(OPEN_REQ, PROD_ON);
  assert.deepEqual(send.send.blockers, ['ข้อของเนื้อใบที่พกธงมา']);
  assert.equal(deepKeys(send).has('hold'), false);
  // ซอร์ส: ไม่มีธงนี้เหลือในโมดูล
  assert.doesNotMatch(code(ROWS), /\bhold\b/);
});

test('งวด S3: `drawingMethodEnabled` ส่งถึงตัวตรวจทั้ง `send` และ `issue` — `true` ตรงตัวเท่านั้น · ไม่ส่ง = `false` · ไฟล์นี้ไม่อ่านสวิตช์', async () => {
  for (const [request, env, key] of [[OPEN_REQ, PROD_ON, 'send'], [REQ, PROD_OFF, 'issue']]) {
    for (const [given, want] of [[true, true], [false, false], [undefined, false], ['on', false], [1, false]]) {
      const precheck = fakePrecheck({ blockers: [], warnings: [], unknown: [] });
      const doc = await withEnv(env, () => surveyDocumentSummary(reportsDb([]), request, HEAD, {
        withChecks: true, now: NOW, zones: [], filesByZone: {}, sizes: [], open: null, precheck,
        ...(given === undefined ? {} : { drawingMethodEnabled: given }),
      }));
      assert.ok(doc[key], key);
      assert.equal(precheck.calls.length, 1, `${key} · ${String(given)}`);
      assert.strictEqual(precheck.calls[0].drawingMethodEnabled, want, `${key} · ${String(given)}`);
    }
  }
  // payload ไม่มีคีย์ใหม่ (ค่าสวิตช์ไม่ออก payload ทางนี้ — GET ใบประเมินตอบเองที่คีย์ของมัน)
  const plain = await withEnv(PROD_ON, () => surveyDocumentSummary(reportsDb([]), OPEN_REQ, HEAD, {
    withChecks: true, now: NOW, zones: [], filesByZone: {}, sizes: [], open: null, drawingMethodEnabled: true,
    precheck: fakePrecheck({ blockers: [], warnings: [], unknown: [] }),
  }));
  assert.equal(deepKeys(plain).has('drawingMethodEnabled'), false);
  assert.doesNotMatch(read(ROWS), /surveyDrawingFlag|surveyDrawingMethodEnabled|SURVEY_DRAWING_METHOD/);
});

test('⭐ งวด S3 §2.6: ใบจากแบบล้วนที่ผู้ส่งผลเป็นผู้ประเมินจากแบบคนเดียว — ผู้ลงนามแถวเดียวสองที่นั่งออก payload เป็นที่นั่งตามกระดาษกับชื่อ', async () => {
  const both = [{ seats: ['assessor', 'approver'], userId: 'u-head', name: 'อานนท์', version: version('u-head') }];
  const run = (request, env, signers) => withEnv(env, () => surveyDocumentSummary(reportsDb([]), request, HEAD, {
    withChecks: true, now: NOW, zones: [], filesByZone: {}, sizes: [], open: null, signatureRule: SURVEY_SIGN_RULE,
    precheck: fakePrecheck({ blockers: [], warnings: [], unknown: [], signers }),
  }));
  const send = await run(OPEN_REQ, PROD_ON, both);
  assert.deepEqual(send.send.signers, [{ seats: ['assessor', 'approver'], name: 'อานนท์' }]);
  assertNoSignLeak(send, 'S3 send.signers');
  const issue = await run(REQ, PROD_OFF, both);
  assert.deepEqual(issue.issue.signers, [{ seats: ['assessor', 'approver'], name: 'อานนท์' }]);
  // ผู้ประเมินจากแบบเป็นคนอื่น = ที่นั่งผู้อนุมัติที่เดียว
  const approverOnly = await run(OPEN_REQ, PROD_ON, [{ ...both[0], seats: ['approver'] }]);
  assert.deepEqual(approverOnly.send.signers, [{ seats: ['approver'], name: 'อานนท์' }]);
});

/* ══ 4. น้ำหนักของโมดูล (§14 · มติ 24) ══════════════════════════════════════════════════════ */

test('🔴 หัวไฟล์ไม่ import ของหนัก — ตัวตรวจ/ตัวอ่านประกอบโหลดด้วย `await import()` · อ่านอย่างเดียว · ทุก query มี limit', () => {
  const src = code(ROWS);
  const staticImports = [...src.matchAll(STATIC_IMPORT)].map((m) => m[1]).sort();
  /* `./surveyReportSignFlag` = ตัวอ่านสวิตช์ลายเซ็นจริง (PR-SIG §1 — ไฟล์เล็ก ไม่มี import อื่นนอกจาก `server-only`)
     `@/lib/permissions` = `canSendSurveyResult` (คีย์ `send`/`signRule` เฉพาะคนที่ส่งผลได้ · มติเจ้าของ 19/10) — อยู่บนสายของ `./surveyAccess` อยู่แล้ว */
  assert.deepEqual(staticImports, [
    './surveyAccess', './surveyReportSignFlag', './surveyReportState', '@/lib/businessDate', '@/lib/permissions', '@/lib/requests/access',
  ].sort());

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
