// ── ขั้นออกเลขของรายงานการประเมินพื้นที่ (PR-2 §3 · §11 · §12 · §15) ───────────────────────────
//
// ⭐ ล็อกหกเรื่อง:
//   ① เดินครบ I0–I8 กับฐานปลอม: เลขออกครั้งเดียว · `p_answered_at` เป็นสตริงเดิม · ภาพนิ่งเป็น object · ผู้อนุมัติ ≠ ผู้ออก
//   ② 🔴 เดินต่อได้ (ตาราง §11): หยุดที่ขั้นไหนก็ไม่มีเลขถูกกิน · กดใหม่แล้วออก · กดซ้ำได้เลขเดิม ตัวนับเดินครั้งเดียว
//   ③ 🔴 ออกซ้อน/ชนกัน: สองคำขอพร้อมกันได้ฉบับเดียว · สี่ทางออกของ `23505` · คำตอบหายหลัง commit
//   ④ ยามเขียนถาวร: เครื่องที่ไม่ใช่ production ไม่อ่าน ไม่เตรียมรูป ไม่เรียก RPC ไม่เขียน audit
//   ⑤ ไม่โยนไม่ว่าอะไรพัง · audit ไม่พกภาพนิ่ง/HTML · id ของแถวไม่ไหลออก JSON
//   ⑥ ไฟล์นี้ไม่ลากของหนักเข้ามาตอนโหลด และไม่เขียนตารางไหนเอง (มีแต่ RPC)
//
// 🔴 ทุกอย่างที่นี่เป็นของปลอม — ฐาน · RPC · ตัวเตรียมรูป · audit · ตัววัดกระดาษ ไม่มีอะไรแตะฐานจริง ที่เก็บ หรือ Drive
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROLE_LABELS } from '../permissions.js';
import { renderSurveyReportHTML } from './surveyReportDocument.js';
import { SURVEY_IMAGE_FAILURE } from './surveyReportImages.js';
import { SURVEY_REPORT_STANDARD_KEY } from './surveyReportInputs.js';
import {
  SURVEY_REPORT_IMAGE_BUDGET_MS, SURVEY_REPORT_ISSUE_CODES, issueSurveyReport, surveyReportPaperLineForReader,
} from './surveyReportIssue.js';
import { SURVEY_REPORT_COLUMNS, SURVEY_REPORT_NOT_PRODUCTION } from './surveyReportRows.js';
import { buildSurveyReportSnapshot, surveyReportImageFiles } from './surveyReportSnapshot.js';
import { SURVEY_REPORT_REASONS, surveyReportPaperIssues, surveyReportState } from './surveyReportState.js';
import { surveyReportSendWarnings, surveyReportView } from './surveyReportView.js';
import {
  TEST_COMPANY, fakeSha, stressSurveyInputs, surveyReportInputsFromFixture, syntheticSurveyFixture, thaiText,
} from './surveyReportTestKit.mjs';

const SOURCE = 'src/lib/service/surveyReportIssue.js';
const raw = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
/* ตัดคอมเมนต์ก่อนตรวจ — คอมเมนต์ในไฟล์เอ่ยชื่อสิ่งต้องห้ามไว้สอนคน */
const code = (p) => raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ── ฐานข้อมูลปลอม — กรองจริงตาม eq/in · เรียงจริง · ตัดตาม limit · คืนเฉพาะคอลัมน์ที่ select ─────────────────
   (ทรงเดียวกับของเทสต์ตัวโหลดอินพุต) + **RPC `issue_survey_report` ที่ทำตาม 0401 ④ ทีละบรรทัด**:
   ล็อกแถวคำร้อง → ตรวจหัวข้อ/ยกเลิก → ตรวจคำตอบเดิม → ตรวจฉบับที่ใช้อยู่ → เลขฐานเดิม R ถัดไป หรือกินเลขรันของปี → insert
   `fail[ตาราง]` = `{ times, throws, when(q) }` · `rpc` = คิวของกฎต่อการเรียก RPC หนึ่งครั้ง:
     `{ error }` / `{ throws }`             ล้มก่อนทำอะไร (ไม่กินเลข)
     `{ commit: true, error | throws }`     ทำสำเร็จในฐานแล้วคำตอบหาย
     `{ before(db) }`                       ทำอะไรบางอย่างกับฐานก่อน RPC เดิน (ดึงผลกลับคั่นกลาง ฯลฯ) */
function fakeDb(tables = {}, { fail = {}, users = {}, authFail = {}, rpc = [], nowIso = '2026-10-01T04:00:00.000+00:00' } = {}) {
  const log = [];
  const rpcLog = [];
  const rpcRules = [...rpc];
  const projector = (select) => {
    const text = String(select ?? '*').trim();
    if (text === '*') return null;
    return text.split(',').map((c) => c.trim()).filter(Boolean).map((c) => {
      const [alias, expr] = c.includes(':') ? c.split(':') : [null, c];
      const parts = expr.replace(/"/g, '').split(/->>?/);
      return [(alias || parts[0]).replace(/"/g, ''), (row) => parts.reduce((v, p) => (v == null ? null : v[p]), row) ?? null];
    });
  };
  const failing = (q) => {
    const rule = fail[q.table];
    if (!rule || !(rule.times > 0)) return null;
    if (rule.when && !rule.when(q)) return null;
    rule.times -= 1;
    return rule;
  };
  const sameInstant = (a, b) => Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);
  const raise = (message, extra = {}) => ({ data: null, error: { code: 'P0001', message, details: null, ...extra } });

  /* 0401 ④ — ทั้งก้อนเป็น synchronous = ทรานแซกชันเดียวใต้ล็อกแถวคำร้อง */
  function issueInDb(a) {
    if (!a.p_report_id) return raise('survey_report_id_required');
    if (!/^[0-9]{2}(0[1-9]|1[0-2])$/.test(String(a.p_yymm ?? ''))) return raise(`survey_report_month_invalid: ${a.p_yymm}`);
    const snap = a.p_row?.snapshot;
    if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return raise('survey_report_snapshot_required');
    const req = (tables.dept_requests || []).find((r) => r.id === a.p_request_id);
    if (!req || req.kind !== 'site_survey' || req.cancelledAt) return raise(`survey_request_invalid: ${a.p_request_id}`);
    if (!req.answeredAt || !sameInstant(req.answeredAt, a.p_answered_at)) return raise(`survey_answer_changed: ${a.p_request_id}`);
    const rows = (tables.service_survey_reports ||= []);
    const mine = rows.filter((r) => r.requestId === a.p_request_id);
    if (mine.some((r) => r.status === 'current')) return raise(`survey_report_already_current: ${a.p_request_id}`);
    const year = String(a.p_yymm).slice(0, 2);
    const latest = [...mine].sort((x, y) => y.rev - x.rev)[0];
    let base = latest?.baseNo ?? null;
    let rev = latest ? latest.rev + 1 : 0;
    if (!base) {
      const counters = (tables.entity_number_counters ||= []);
      let counter = counters.find((c) => c.scope === 'SU' && c.month === year);
      if (!counter) {
        const seed = Math.max(0, ...rows.filter((r) => r.baseNo.startsWith(`SU-${year}`)).map((r) => Number(r.baseNo.slice(-4))));
        counter = { scope: 'SU', month: year, lastNo: seed };
        counters.push(counter);
      }
      counter.lastNo += 1;
      if (counter.lastNo > 9999) return raise(`survey_report_sequence_exhausted: ${year}`);
      base = `SU-${a.p_yymm}${String(counter.lastNo).padStart(4, '0')}`;
      rev = 0;
    }
    if (rows.some((r) => r.id === a.p_report_id)) {
      return raise('duplicate key value violates unique constraint "service_survey_reports_pkey"', { code: '23505' });
    }
    rows.push({
      id: a.p_report_id, requestId: a.p_request_id, baseNo: base, rev, docNo: `${base}-${rev}`, status: 'current',
      supersededAt: null, supersededReason: null,
      snapshot: structuredClone(snap), images: structuredClone(a.p_row.images ?? []),
      customerHtml: null, internalHtml: null, rendererVersion: null, frozenAt: null,
      customerPdfPath: null, internalPdfPath: null,
      approvedById: req.answeredById ?? null, approvedByName: req.answeredByName ?? null, approvedAt: req.answeredAt,
      issuedById: a.p_row.issuedById ?? null, issuedByName: a.p_row.issuedByName ?? null,
      issuedAt: nowIso, updatedAt: nowIso,
    });
    return { data: `${base}-${rev}`, error: null };
  }

  const db = {
    log,
    rpcLog,
    tables,
    get storage() { throw new Error('ขั้นออกเลขห้ามแตะ storage เอง (เป็นงานของตัวเตรียมรูป)'); },
    async rpc(name, args) {
      rpcLog.push({ name, args });
      const rule = rpcRules.shift() || null;
      if (rule?.before) rule.before(db);
      if (rule && !rule.commit) {
        if (rule.throws) throw new Error(rule.throws);
        if (rule.error) return { data: null, error: rule.error };
      }
      if (name !== 'issue_survey_report') return raise(`function ${name} does not exist`, { code: 'PGRST202' });
      const out = issueInDb(args);
      if (rule?.commit && !out.error) {
        if (rule.throws) throw new Error(rule.throws);
        return { data: rule.data ?? null, error: rule.error ?? null };
      }
      return out;
    },
    auth: {
      admin: {
        async getUserById(id) {
          const rule = authFail[id];
          if (rule && rule.times > 0) {
            rule.times -= 1;
            return { data: { user: null }, error: { status: 500, message: 'auth ล่ม' } };
          }
          const user = users[id];
          if (!user) return { data: { user: null }, error: { status: 404, message: 'User not found' } };
          return { data: { user }, error: null };
        },
      },
    },
    from(table) {
      const q = { table, op: 'select', select: '*', filters: [], orders: [], limit: null };
      log.push(q);
      const matches = (row) => q.filters.every(([op, col, val]) => {
        if (op === 'eq') return row[col] === val;
        if (op === 'in') return val.includes(row[col]);
        return true;
      });
      const run = () => {
        if (q.op !== 'select') throw new Error(`ขั้นออกเลขห้ามเขียนตาราง ${table} เอง (${q.op})`);
        const rule = failing(q);
        if (rule?.throws) throw new Error(`${table} ล่ม`);
        if (rule) return { data: null, error: { message: `${table} ล่ม` } };
        let rows = (tables[table] || []).filter(matches);
        for (const [col, asc] of [...q.orders].reverse()) {
          rows = [...rows].sort((a, b) => {
            const x = a[col]; const y = b[col];
            if (x === y) return 0;
            return (x < y ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        if (q.limit != null) rows = rows.slice(0, q.limit);
        const cols = projector(q.select);
        return {
          data: rows.map((row) => (cols ? Object.fromEntries(cols.map(([key, get]) => [key, get(row)])) : structuredClone(row))),
          error: null,
        };
      };
      const chain = {
        select(cols) { q.select = cols; return chain; },
        insert() { q.op = 'insert'; return chain; },
        update() { q.op = 'update'; return chain; },
        upsert() { q.op = 'upsert'; return chain; },
        delete() { q.op = 'delete'; return chain; },
        eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
        in(col, val) { q.filters.push(['in', col, val]); return chain; },
        order(col, opts = {}) { q.orders.push([col, opts.ascending !== false]); return chain; },
        limit(n) { q.limit = n; return chain; },
        maybeSingle() {
          return Promise.resolve().then(run).then(({ data, error }) => ({ data: error ? null : (data[0] || null), error }));
        },
        then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
      };
      return chain;
    },
  };
  return db;
}

const HEAD = { id: 'U-head-now', name: 'Head Presser', role: 'ts_manager', team: 'TS' };
/* นาฬิกาของเทสต์ — 1 ต.ค. 2026 11:00 เวลาไทย ⇒ เดือนที่ออก `2610` */
const NOW = '2026-10-01T04:00:00.000Z';
const now = () => new Date(NOW);
const FIRST_NO = 'SU-26100001-0';
/* คำเตือนของเส้นส่งผลที่แฝดสังเคราะห์มีติดตัว — หมายเหตุพื้นที่ 1 เอ่ยถึง "เครื่อง" · พื้นที่ 2 เอ่ยถึง "จุดติดตั้ง" */
const TWIN_WARNINGS = 2;

const twin = (opts) => surveyReportInputsFromFixture(syntheticSurveyFixture(), opts);

/** โลกปลอมจากอินพุตของชุดทดสอบ PR-1 — แถวของแต่ละตารางตามรูปที่ฐานเก็บ · คำร้อง "ตอบแล้ว" ยังไม่มีเอกสาร */
function worldFrom(source, { helperIds = [], users = {}, options = {}, request = {} } = {}) {
  const row = { ...source.request, siteId: 'SITE-1', customerId: 'CUS-1', dealId: 'DEAL-1', ...request };
  const tables = {
    dept_requests: [row],
    service_survey_reports: [],
    entity_number_counters: [],
    // ฐานไม่มีคอลัมน์ `zoneCode` บนแถวผลวัด — รหัสอ่านสดจากทะเบียน
    service_survey_zones: source.zones.map(({ zoneCode: _zoneCode, ...zone }) => ({ ...zone, requestId: row.id })),
    attachments: source.zones.flatMap((z) => (source.filesByZone[z.id] || [])
      .map((f) => ({ ...f, entityType: 'service_survey_zone', entityId: z.id, driveFileId: `drv-${f.id}` }))),
    service_zones: source.zoneRegistry.map((z) => ({ ...z })),
    service_sites: [{ id: 'SITE-1', ...source.site }],
    customers: [{ id: 'CUS-1', name: source.customer.name, nameEn: null, arCode: source.customer.arCode }],
    sales_deals: [{ id: 'DEAL-1', code: source.deal.code }],
    service_visits: [{
      id: 'SVV-1', requestId: row.id, createdAt: '2026-09-24T02:00:00.000+00:00', unableReason: null,
      ...source.visit, assistantIds: helperIds,
    }],
    entity_updates: source.history.map((h) => ({ ...h, entityType: 'dept_request', entityId: row.id })),
    service_package_sizes: source.sizes.map((s) => ({ ...s })),
    organization_setting_versions: [{
      organizationId: 'primary', status: 'published', legalNameTh: TEST_COMPANY.name, legalNameEn: 'Scent and Sense',
      taxId: TEST_COMPANY.taxId, branchCode: '00000', registeredAddressTh: TEST_COMPANY.address, registeredAddressEn: null,
      phone: TEST_COMPANY.tel, email: null, lineId: TEST_COMPANY.line, website: TEST_COMPANY.website,
    }],
    document_standard_versions: [
      { documentKey: SURVEY_REPORT_STANDARD_KEY, status: 'published', versionNumber: 1, formCode: 'FM-TS-01', revision: '00', effectiveDate: '2026-09-29', titleEn: 'SITE SURVEY REPORT' },
    ],
  };
  const people = {
    'U-lead': { id: 'U-lead', email: 'lead@example.test', app_metadata: { role: 'ts_senior' }, user_metadata: { name: 'Lead Assessor' } },
    ...users,
  };
  const db = fakeDb(tables, { users: people, ...options });
  return { db, tables, source, request: () => tables.dept_requests[0], reports: () => tables.service_survey_reports };
}

const twinWorld = (extra) => worldFrom(twin(), extra);

/** ตัวเตรียมรูปปลอม — ใช้ของใน `have` ก่อน · ที่เหลือ "ดึง" (จดไว้) · `fail[attId] = { times, reason, permanent }` */
function fakePrepare(fail = {}) {
  const calls = [];
  const prepare = async (supabase, files, opts = {}) => {
    const imageByAttId = {};
    const failed = [];
    const fetched = [];
    for (const f of files) {
      const hit = opts.have instanceof Map ? opts.have.get(f.attId) : opts.have?.[f.attId];
      if (hit?.sha) { imageByAttId[f.attId] = hit; continue; }
      const rule = fail[f.attId] || fail['*'];
      if (rule && rule.times > 0) {
        rule.times -= 1;
        failed.push({ attId: f.attId, fileName: f.file.fileName, reason: rule.reason, permanent: rule.permanent === true });
        continue;
      }
      fetched.push(f.attId);
      imageByAttId[f.attId] = { sha: fakeSha(f.attId), w: f.kind === 'plan' ? 1199 : 1400, h: f.kind === 'plan' ? 919 : 1051, bytes: 1000 };
    }
    calls.push({ files: files.map((f) => f.attId), fetched, opts });
    return { imageByAttId, failed };
  };
  prepare.calls = calls;
  return prepare;
}

function fakeAudit() {
  const rows = [];
  const audit = async (row) => { rows.push(row); };
  audit.rows = rows;
  return audit;
}

/* 🔴 ทุกการเรียกในไฟล์นี้ผ่านตัวห่อนี้ — audit กับตัวเตรียมรูปเป็นของปลอมเสมอ (ของจริงเขียนฐาน / ดึง Drive) */
async function issue(world, opts = {}) {
  const audit = opts.audit || fakeAudit();
  const prepareImages = opts.prepareImages || fakePrepare();
  const result = await issueSurveyReport(world.db, {
    request: world.request(), user: HEAD, via: 'send', now, ...opts, audit, prepareImages,
  });
  return { result, audit, prepareImages };
}

const stateOf = (world, at = NOW) => surveyReportState(world.request(), world.reports(), { now: at, issueAtSend: true });
const lastNo = (world) => world.tables.entity_number_counters.find((c) => c.scope === 'SU')?.lastNo ?? 0;
const queried = (world, table) => world.db.log.filter((q) => q.table === table).length;

function keysDeep(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.add(k); keysDeep(v, out); }
  }
  return out;
}

/* ทุกเทสต์รันเหมือนอยู่บน production (ยามเขียนถาวรเปิด) — เทสต์ของยามสลับค่าเองแล้วคืน · log ของความล้มเหลวเก็บไว้ไม่พิมพ์ */
const errors = [];
test.before(() => {
  process.env.VERCEL_ENV = 'production';
});
test.beforeEach((t) => {
  errors.length = 0;
  t.mock.method(console, 'error', (...args) => { errors.push(args.map(String).join(' ')); });
  t.mock.method(console, 'warn', () => {});
});

/* ══ 1. เดินครบ ═══════════════════════════════════════════════════════════════════ */

test('⭐ เส้นส่งผล: เดินครบ I0–I8 — เลขแรกของปี · แถวเดียว · คีย์ของผลครบ · สถานะจากแถว = issued', async () => {
  const world = twinWorld();
  assert.equal(stateOf(world), 'missing');
  const { result, audit, prepareImages } = await issue(world);

  assert.equal(world.reports().length, 1);
  // ชุดทดสอบนี้มีหมายเหตุพื้นที่ที่เอ่ยถึง "เครื่อง" กับ "จุดติดตั้ง" (เหมือนของจริง) ⇒ คำเตือนของเส้นส่งผลติดมากับผล
  const warnings = surveyReportSendWarnings(surveyReportView(world.reports()[0].snapshot, { version: 'customer' }));
  assert.equal(warnings.length, TWIN_WARNINGS);
  assert.deepEqual(result, {
    state: 'issued', code: null, docNo: FIRST_NO, rev: 0, reused: false, reasons: [], reason: null, retry: false, warnings,
  });
  assert.equal(lastNo(world), 1);
  assert.equal(stateOf(world), 'issued');

  const row = world.reports()[0];
  assert.equal(row.docNo, FIRST_NO);
  assert.equal(row.status, 'current');
  assert.equal(result.reportId, row.id, 'id ของแถวติดมากับผลให้ขั้นกระดาษใช้');
  assert.match(row.id, /^SVR-/);

  // ไม่มีตัววัดกระดาษในเส้นส่งผล (มติ 3) · รูปเตรียมรอบเดียว
  assert.equal(prepareImages.calls.length, 1);
  assert.equal(world.db.rpcLog.length, 1);
  assert.equal(audit.rows.length, 1);
  assert.deepEqual(errors, []);
});

test('🔴 RPC: `p_answered_at` คือสตริงเดิมของคำร้อง · `p_row.snapshot` เป็น object · `p_row` มีสี่คีย์ · เดือนตามนาฬิกาไทย', async () => {
  // สตริงที่มีไมโครวินาที — ผ่าน `Date` แล้วเขียนกลับจะเหลือมิลลิวินาที ⇒ RPC เทียบ `IS DISTINCT FROM` ไม่ผ่าน
  const answeredAt = '2026-09-26T03:01:26.314159+00:00';
  const world = twinWorld({ request: { answeredAt } });
  // 30 ก.ย. 17:30 UTC = 1 ต.ค. 00:30 เวลาไทย ⇒ เลขของเดือน 10
  const { result } = await issue(world, { now: () => new Date('2026-09-30T17:30:00.000Z') });
  assert.equal(result.docNo, FIRST_NO);

  const { name, args } = world.db.rpcLog[0];
  assert.equal(name, 'issue_survey_report');
  assert.deepEqual(Object.keys(args).sort(), ['p_answered_at', 'p_report_id', 'p_request_id', 'p_row', 'p_yymm']);
  assert.strictEqual(args.p_answered_at, answeredAt);
  assert.equal(args.p_request_id, world.request().id);
  assert.equal(args.p_yymm, '2610');
  assert.deepEqual(Object.keys(args.p_row).sort(), ['images', 'issuedById', 'issuedByName', 'snapshot']);
  assert.equal(typeof args.p_row.snapshot, 'object');
  assert.ok(!Array.isArray(args.p_row.snapshot));
  assert.equal(args.p_row.snapshot.v, 1);
  assert.ok(Array.isArray(args.p_row.images));
});

test('ภาพนิ่งที่เก็บ = ภาพนิ่งของชุดทดสอบ PR-1 (อ่านจากฐานหลังล็อก) · `takenAt` คือนาฬิกาของขั้นนี้ · รูปครบทุกไฟล์ที่กระดาษพิมพ์', async () => {
  const world = twinWorld();
  await issue(world);
  const row = world.reports()[0];
  const want = buildSurveyReportSnapshot({
    ...world.source,
    takenAt: new Date(NOW).toISOString(),
    customer: { ...world.source.customer, id: 'CUS-1' },
    assigneeRoleLabel: ROLE_LABELS.ts_senior,
    imageByAttId: Object.fromEntries(surveyReportImageFiles(world.source)
      .map((f) => [f.attId, { sha: fakeSha(f.attId), w: f.kind === 'plan' ? 1199 : 1400, h: f.kind === 'plan' ? 919 : 1051, bytes: 1000 }])),
  }, { mode: 'freeze' });
  assert.deepEqual(row.snapshot, want.snapshot);
  assert.deepEqual(row.images, want.images);
  assert.equal(row.images.length, surveyReportImageFiles(world.source).length);
});

test('ปุ่ม "ออกเอกสาร": อ่านคำร้องใหม่เสมอ (แถวที่ถือมาเก่าได้) · ผู้อนุมัติ = คนส่งผล · ผู้ออก = คนกด', async () => {
  const world = twinWorld();
  const presser = { id: 42, name: 'Later Head', role: 'ts_audit' };
  const stale = { ...world.request(), answeredAt: '2026-09-20T00:00:00.000+00:00', answeredByName: 'คนเก่า' };
  const { result, audit } = await issue(world, {
    via: 'issue_only', request: stale, requestId: world.request().id, user: presser,
  });
  assert.equal(result.state, 'issued');
  assert.equal(queried(world, 'dept_requests'), 1, 'ต้องอ่านคำร้องจากฐาน ไม่ใช้แถวที่ route ถือมา');
  assert.strictEqual(world.db.rpcLog[0].args.p_answered_at, world.request().answeredAt);

  const row = world.reports()[0];
  assert.equal(row.approvedById, 'U-head');
  assert.equal(row.approvedByName, 'Head Approver');
  assert.equal(row.approvedAt, world.request().answeredAt);
  assert.strictEqual(row.issuedById, '42', 'id ของผู้ออกส่งเป็นสตริง (คอลัมน์ text)');
  assert.equal(row.issuedByName, 'Later Head');
  assert.equal(row.snapshot.request.answeredByName, 'Head Approver');
  assert.equal(audit.rows[0].after.via, 'issue_only');
  assert.match(audit.rows[0].summary, /กดออกเอกสารภายหลัง/);
});

test('ปุ่ม "ออกเอกสาร" ส่งแค่ `requestId` ก็พอ · ส่งแค่ `request` (ไม่มี requestId) ก็ยังอ่านใหม่', async () => {
  const a = twinWorld();
  const first = await issueSurveyReport(a.db, {
    requestId: a.request().id, user: HEAD, via: 'issue_only', now, audit: fakeAudit(), prepareImages: fakePrepare(),
  });
  assert.equal(first.docNo, FIRST_NO);

  const b = twinWorld();
  const second = await issueSurveyReport(b.db, {
    request: { id: b.request().id }, user: HEAD, now, audit: fakeAudit(), prepareImages: fakePrepare(),
  });
  assert.equal(second.docNo, FIRST_NO, '`via` ที่ไม่ใช่ send = ปุ่มออกเอกสาร');
  assert.equal(queried(b, 'dept_requests'), 1);
});

test('audit ของการออก: `create` · `service_survey_report` · id ของแถว · `after` มีเจ็ดคีย์ตามสเปก ไม่มีอย่างอื่น', async () => {
  const world = twinWorld();
  const req = { headers: new Map([['x-forwarded-for', '10.0.0.1']]) };
  const { result, audit } = await issue(world, { req });
  const [row] = audit.rows;
  assert.equal(row.action, 'create');
  assert.equal(row.entityType, 'service_survey_report');
  assert.equal(row.entityId, result.reportId);
  assert.equal(row.user, HEAD);
  assert.equal(row.request, req);
  assert.deepEqual(row.after, {
    id: result.reportId, docNo: FIRST_NO, rev: 0, requestId: world.request().id, via: 'send',
    imageCount: world.reports()[0].images.length, warningCount: TWIN_WARNINGS,
  });
  assert.equal(result.warnings.length, TWIN_WARNINGS);
  assert.equal(row.before, undefined);
  assert.equal(row.summary, `ออกเอกสารประเมิน SU-26100001-0 ของ RQ-AS-26090186 (พร้อมส่งผล) · คำเตือน ${TWIN_WARNINGS} ข้อ`);

  // ไม่มีคำเตือน = สรุปไม่มีท่อนคำเตือน
  const source = twin();
  source.zones.forEach((zone) => { zone.note = null; });
  const quiet = await issue(worldFrom(source));
  assert.deepEqual(quiet.result.warnings, []);
  assert.equal(quiet.audit.rows[0].after.warningCount, 0);
  assert.equal(quiet.audit.rows[0].summary, 'ออกเอกสารประเมิน SU-26100001-0 ของ RQ-AS-26090186 (พร้อมส่งผล)');
});

test('คำเตือนของผล = คำเตือนของเส้นส่งผล (§8) + ของตัวสร้างภาพนิ่ง · จำนวนลง audit ทั้ง `after` และสรุป', async () => {
  const source = twin();
  source.zones[0].note = 'ติดตั้งเครื่องรุ่น A-200 จำนวน 2 เครื่อง 😀';
  // ผังรูปที่สองของพื้นที่แรก — กระดาษพิมพ์รูปล่าสุดรูปเดียว ⇒ ตัวสร้างเตือน
  source.filesByZone[source.zones[0].id].push({
    id: 'att-z1-p2', docType: 'survey_plan', fileName: 'plan-new.jpg', mimeType: 'image/jpeg', sizeBytes: 10,
    createdAt: '2026-09-26T02:30:00.000+00:00', metadata: {},
  });
  const world = worldFrom(source);
  const { result, audit } = await issue(world);
  assert.equal(result.state, 'issued');

  const snapshot = world.reports()[0].snapshot;
  const send = surveyReportSendWarnings(surveyReportView(snapshot, { version: 'customer' }));
  assert.ok(send.some((w) => w.includes('อักขระที่เอกสารพิมพ์ไม่ได้')), 'ชุดนี้ต้องมีคำเตือนอักขระที่พิมพ์ไม่ได้');
  assert.ok(send.length > TWIN_WARNINGS, 'และคำเตือนเรื่องเครื่อง/รุ่นของหมายเหตุ');
  assert.deepEqual(result.warnings.slice(0, send.length), send);
  assert.ok(result.warnings.some((w) => w.includes('มีภาพผัง 2 รูป')));
  assert.equal(result.warnings.length, send.length + 1);
  assert.equal(new Set(result.warnings).size, result.warnings.length);

  assert.equal(audit.rows[0].after.warningCount, result.warnings.length);
  assert.ok(audit.rows[0].summary.endsWith(` · คำเตือน ${result.warnings.length} ข้อ`));
});

/* ══ 2. ยามเขียนถาวร (§0) ═════════════════════════════════════════════════════════ */

for (const env of [undefined, 'preview', 'development', 'Production']) {
  test(`🔴 ยามเขียนถาวร: VERCEL_ENV=${env ?? '(ไม่ตั้ง)'} = not_production — ไม่อ่าน ไม่เตรียมรูป ไม่เรียก RPC ไม่เขียน audit แม้เส้นส่งผล`, async () => {
    const world = twinWorld();
    const before = process.env.VERCEL_ENV;
    if (env === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = env;
    try {
      const { result, audit, prepareImages } = await issue(world, { via: 'send' });
      assert.equal(result.state, 'failed');
      assert.equal(result.code, 'not_production');
      assert.equal(result.reason, SURVEY_REPORT_NOT_PRODUCTION);
      assert.equal(result.retry, false);
      assert.equal(world.db.log.length, 0);
      assert.equal(world.db.rpcLog.length, 0);
      assert.equal(prepareImages.calls.length, 0);
      assert.equal(audit.rows.length, 0, 'เครื่องทดสอบต้องไม่เขียนแม้แต่แถว audit ลงฐานของจริง');
      assert.equal(world.reports().length, 0);
    } finally {
      process.env.VERCEL_ENV = before;
    }
  });
}

test('ยามเขียนถาวรที่เสียบเข้ามา: `true` ตรงตัวเท่านั้นจึงเขียน (harness) · ค่าอื่น = not_production แม้อยู่บน production', async () => {
  for (const value of [false, null, 'true', 1]) {
    const world = twinWorld();
    const { result } = await issue(world, { storeAllowed: value });
    assert.equal(result.code, 'not_production', `storeAllowed=${String(value)}`);
    assert.equal(world.db.rpcLog.length, 0);
  }
  const before = process.env.VERCEL_ENV;
  delete process.env.VERCEL_ENV;
  try {
    const world = twinWorld();
    const { result, prepareImages } = await issue(world, { storeAllowed: true });
    assert.equal(result.docNo, FIRST_NO);
    assert.strictEqual(prepareImages.calls[0].opts.storeAllowed, true, 'คำตัดสินเดียวกันส่งต่อให้ตัวเตรียมรูป');
  } finally {
    process.env.VERCEL_ENV = before;
  }
});

/* ══ 3. I0 คำร้อง · I1 ฉบับที่มีอยู่ ══════════════════════════════════════════════════ */

test('I0: ไม่ใช่ใบประเมิน · ถูกยกเลิก · ยังไม่ตอบ · หาไม่เจอ = not_answered — ไม่อ่านแถวเอกสาร ไม่เรียก RPC', async () => {
  const cases = [
    { name: 'หัวข้ออื่น', request: { kind: 'costing' } },
    { name: 'ถูกยกเลิก', request: { cancelledAt: '2026-09-27T00:00:00.000+00:00' } },
    { name: 'ยังไม่ตอบ', request: { answeredAt: null } },
  ];
  for (const c of cases) {
    const world = twinWorld({ request: c.request });
    const { result, prepareImages } = await issue(world);
    assert.equal(result.code, 'not_answered', c.name);
    assert.equal(result.reason, SURVEY_REPORT_REASONS.not_answered);
    assert.equal(queried(world, 'service_survey_reports'), 0, c.name);
    assert.equal(world.db.rpcLog.length, 0);
    assert.equal(prepareImages.calls.length, 0);
  }

  const gone = twinWorld();
  const { result } = await issue(gone, { via: 'issue_only', request: null, requestId: 'DR-ไม่มี' });
  assert.equal(result.code, 'not_answered');
  const none = await issueSurveyReport(gone.db, { via: 'issue_only', audit: fakeAudit(), prepareImages: fakePrepare() });
  assert.equal(none.code, 'not_answered', 'ไม่ส่งทั้ง request และ requestId');
});

test('I0: อ่านคำร้องไม่สำเร็จ (ปุ่มออกเอกสาร) = read_failed กดซ้ำได้ — ทั้ง `{ error }` และ throw', async () => {
  for (const throws of [false, true]) {
    const world = twinWorld({ options: { fail: { dept_requests: { times: 1, throws } } } });
    const { result } = await issue(world, { via: 'issue_only', requestId: world.request().id });
    assert.equal(result.code, 'read_failed');
    assert.equal(result.retry, true);
    assert.equal(world.db.rpcLog.length, 0);
    const again = await issue(world, { via: 'issue_only', requestId: world.request().id });
    assert.equal(again.result.docNo, FIRST_NO);
  }
});

test('I1: มีฉบับที่ใช้อยู่ของคำตอบรอบนี้ = ใช้ซ้ำ — ไม่อ่านอินพุต ไม่เตรียมรูป ไม่เรียก RPC ไม่เขียน audit', async () => {
  const world = twinWorld();
  const first = await issue(world);
  const marks = { log: world.db.log.length, rpc: world.db.rpcLog.length };

  const { result, audit, prepareImages } = await issue(world, { via: 'issue_only', requestId: world.request().id });
  assert.deepEqual(result, {
    state: 'issued', code: null, docNo: FIRST_NO, rev: 0, reused: true, reasons: [], reason: null, retry: false, warnings: [],
  });
  assert.equal(result.reportId, first.result.reportId);
  assert.equal(world.db.rpcLog.length, marks.rpc);
  assert.equal(prepareImages.calls.length, 0);
  assert.equal(audit.rows.length, 0);
  const after = world.db.log.slice(marks.log).map((q) => q.table);
  assert.deepEqual(after, ['dept_requests', 'service_survey_reports']);
  // แถวเอกสารอ่านด้วยรายชื่อคอลัมน์กลางเท่านั้น — ไม่มี `*` ไม่มีภาพนิ่ง/HTML
  assert.equal(world.db.log[world.db.log.length - 1].select, SURVEY_REPORT_COLUMNS);
});

test('🔴 I1: ฉบับที่ใช้อยู่ไม่ตรงกับคำตอบรอบล่าสุด (ทริกเกอร์ไม่ยิง) = stale_current — ไม่ใช้ซ้ำ ไม่ออกทับ · ลง log', async () => {
  const world = twinWorld();
  await issue(world);
  // ส่งผลรอบใหม่โดยที่ฉบับเก่ายังเป็น current (ทริกเกอร์ 0401 ⑤ ไม่ทำงาน)
  world.request().answeredAt = '2026-09-28T01:00:00.000+00:00';
  assert.equal(stateOf(world), 'stale');
  const rpcBefore = world.db.rpcLog.length;

  const { result, prepareImages } = await issue(world);
  assert.equal(result.state, 'failed');
  assert.equal(result.code, 'stale_current');
  assert.equal(result.reason, SURVEY_REPORT_REASONS.stale_current);
  assert.equal(result.retry, false);
  assert.equal(result.docNo, null);
  assert.equal(world.db.rpcLog.length, rpcBefore);
  assert.equal(prepareImages.calls.length, 0);
  assert.equal(world.reports().length, 1);
  assert.ok(errors.some((line) => line.includes(FIRST_NO) && line.includes('ทริกเกอร์')));
});

test('I1: อ่านแถวเอกสารไม่สำเร็จ ≠ ไม่มีเอกสาร = read_failed — ไม่เดินไปชน RPC', async () => {
  const world = twinWorld({ options: { fail: { service_survey_reports: { times: 1 } } } });
  const { result, prepareImages } = await issue(world);
  assert.equal(result.code, 'read_failed');
  assert.equal(result.retry, true);
  assert.equal(world.db.rpcLog.length, 0);
  assert.equal(prepareImages.calls.length, 0);
});

/* ══ 4. เดินต่อได้ — หยุดที่แต่ละขั้น แล้วกดใหม่ (§11 · §15) ═══════════════════════════════ */

const withProduction = async (value, fn) => {
  const before = process.env.VERCEL_ENV;
  if (value === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = value;
  try { return await fn(); } finally { process.env.VERCEL_ENV = before; }
};

/* แต่ละแถว: `world()` สร้างโลกที่รอบแรกจะหยุด · `first`/`retry` = ตัวเลือกของรอบแรก/รอบถัดไป · `code` = รหัสที่รอบแรกตอบ
   · `fix(world)` = สิ่งที่คนแก้ก่อนกดใหม่ · `rpcCalls` = RPC ถูกเรียกในรอบแรกไหม */
const RESUME = [
  {
    name: 'I0 เครื่องไม่ใช่ production', code: 'not_production', rpcCalls: 0,
    world: () => twinWorld(), env: 'preview',
  },
  {
    name: 'I1 อ่านแถวเอกสารพลาด', code: 'read_failed', rpcCalls: 0,
    world: () => twinWorld({ options: { fail: { service_survey_reports: { times: 1 } } } }),
  },
  {
    name: 'I3 ด่านส่งผลไม่ผ่าน (แพ็คเกจหาย)', code: 'blocked', rpcCalls: 0,
    world: () => {
      const w = twinWorld();
      w.keep = w.tables.service_survey_zones[0].packageQty;
      w.tables.service_survey_zones[0].packageQty = null;
      return w;
    },
    fix: (w) => { w.tables.service_survey_zones[0].packageQty = w.keep; },
  },
  {
    name: 'I4 Drive ล่มชั่วคราว', code: 'images_failed', rpcCalls: 0,
    world: () => twinWorld(),
    prepare: () => fakePrepare({ 'att-z1-w2': { times: 1, reason: SURVEY_IMAGE_FAILURE.DRIVE_ERROR } }),
  },
  {
    name: 'I4 หมดงบเวลาเตรียมรูป', code: 'timeout', rpcCalls: 0,
    world: () => twinWorld(),
    prepare: () => fakePrepare({ 'att-z2-p1': { times: 1, reason: SURVEY_IMAGE_FAILURE.TIMEOUT } }),
  },
  {
    name: 'I5b chromium เปิดไม่ได้', code: 'paper_blocked', rpcCalls: 0,
    world: () => twinWorld(),
    first: { measure: async () => { throw new Error('launch failed'); } },
    retry: { measure: async () => ({ issues: [], error: null }) },
  },
  {
    name: 'I6 RPC ล้มก่อนทำอะไร', code: 'rpc_failed', rpcCalls: 1,
    world: () => twinWorld({ options: { rpc: [{ error: { code: '57014', message: 'canceling statement due to statement timeout' } }] } }),
  },
];

for (const row of RESUME) {
  test(`🔴 เดินต่อ: หยุดที่ ${row.name} — ไม่มีเลขถูกกิน · กดใหม่แล้วออก · กดซ้ำได้เลขเดิม ตัวนับเดินครั้งเดียว`, async () => {
    const world = row.world();
    const prepareImages = row.prepare ? row.prepare() : fakePrepare();

    const first = await withProduction(row.env ?? 'production', () => issue(world, { prepareImages, ...(row.first || {}) }));
    assert.equal(first.result.state, 'failed');
    assert.equal(first.result.code, row.code);
    assert.equal(first.result.docNo, null);
    assert.ok(first.result.reason, 'ต้องมีข้อความไทยบอกเหตุ');
    assert.equal(world.db.rpcLog.length, row.rpcCalls);
    assert.equal(world.reports().length, 0, 'ยังไม่มีแถวเอกสาร');
    assert.equal(lastNo(world), 0, 'ยังไม่มีเลขถูกกิน');
    // สถานะจากแถวล้วน: เพิ่งส่ง = กำลังออก · เลย 180 วิ = ตอบแล้วไม่มีเอกสาร (ปุ่มออกเอกสารกลับมา)
    assert.equal(stateOf(world), 'missing');
    assert.equal(stateOf(world, world.request().answeredAt), 'issuing');

    row.fix?.(world);
    const second = await issue(world, { prepareImages, via: 'issue_only', requestId: world.request().id, ...(row.retry || {}) });
    assert.equal(second.result.state, 'issued', second.result.reason);
    assert.equal(second.result.docNo, FIRST_NO);
    assert.equal(second.result.reused, false);
    assert.equal(stateOf(world), 'issued');

    const third = await issue(world, { prepareImages, via: 'issue_only', requestId: world.request().id });
    assert.equal(third.result.docNo, FIRST_NO);
    assert.equal(third.result.reused, true);
    assert.equal(world.reports().length, 1);
    assert.equal(lastNo(world), 1);
  });
}

/* หนึ่งแถวต่ออินพุตของตัวโหลด — อ่านพลาดครั้งเดียว = ไม่ออกเลข · รอบถัดไปค่ากลับมาอยู่ในภาพนิ่งที่เก็บ */
const isThread = (entityType) => (q) => q.filters.some(([, col, val]) => col === 'entityType' && val === entityType);
const HELPER_WORLD = {
  helperIds: ['U-h1'],
  users: { 'U-h1': { id: 'U-h1', user_metadata: { name: 'Helper One' } } },
};
const LOADER_ROWS = [
  { name: 'zones', label: 'ผลวัดรายพื้นที่', fail: { service_survey_zones: { times: 1 } }, back: (s) => s.zones.length === 2 },
  { name: 'files', label: 'รูปของพื้นที่', fail: { attachments: { times: 1 } }, back: (s) => s.zones[0].wide.length === 2 },
  { name: 'zoneRegistry', label: 'ทะเบียนพื้นที่', fail: { service_zones: { times: 1 } }, back: (s) => s.zones[0].zoneCode === 'ZN-1159-10253' },
  { name: 'site', label: 'ข้อมูลสถานที่', fail: { service_sites: { times: 1 } }, back: (s) => s.site.code === 'ST-9001-01-BKK-1159' },
  { name: 'customer', label: 'ข้อมูลลูกค้า', fail: { customers: { times: 1 } }, back: (s) => s.customer.arCode === 'AR-9001' },
  { name: 'deal', label: 'เลขที่ดีล', fail: { sales_deals: { times: 1 } }, back: (s) => s.deal.code === 'DL-260900570' },
  { name: 'visits', label: 'นัดประเมิน', fail: { service_visits: { times: 1 } }, back: (s) => s.visit.code === 'SV-26090013' },
  { name: 'visitThread', label: 'เธรดของนัดประเมิน', fail: { entity_updates: { times: 1, when: isThread('service_visit') } }, back: (s) => s.visit.closedBySend === false },
  { name: 'helpers', label: 'ชื่อผู้ช่วยบนนัด', authFail: { 'U-h1': { times: 1 } }, back: (s) => s.visit.helpers[0] === 'Helper One' },
  { name: 'assigneeRole', label: 'ตำแหน่งของผู้ประเมิน', authFail: { 'U-lead': { times: 1 } }, back: (s) => s.visit.assignee.roleLabel === ROLE_LABELS.ts_senior },
  { name: 'history', label: 'ประวัติตีกลับและดึงกลับ', fail: { entity_updates: { times: 1, when: isThread('dept_request') } }, back: (s) => s.history.length === 1 },
  { name: 'sizes', label: 'ทะเบียนขนาดแพ็คเกจ', fail: { service_package_sizes: { times: 1 } }, back: (s) => s.sizes.length === 4 },
  { name: 'company', label: 'ข้อมูลบริษัท', fail: { organization_setting_versions: { times: 1 } }, back: (s) => s.company.taxId === TEST_COMPANY.taxId },
  { name: 'form', label: 'มาตรฐานเอกสาร', fail: { document_standard_versions: { times: 1 } }, back: (s) => s.form.code === 'FM-TS-01' },
];

for (const row of LOADER_ROWS) {
  test(`🔴 I2 อ่าน ${row.name} พลาดครั้งเดียว = ไม่ออกเลข (เหตุของระบบ กดซ้ำได้) · รอบถัดไปค่าอยู่ในภาพนิ่งที่เก็บ`, async () => {
    const world = twinWorld({ ...HELPER_WORLD, options: { fail: structuredCloneRules(row.fail), authFail: structuredCloneRules(row.authFail) } });
    const first = await issue(world);
    assert.equal(first.result.state, 'failed');
    assert.equal(first.result.code, 'blocked');
    assert.equal(first.result.retry, true, 'เหตุของระบบ — ไม่ต้องดึงผลกลับ');
    assert.deepEqual(first.result.reasons, [`อ่าน${row.label}ไม่สำเร็จ`]);
    assert.equal(first.result.reason, `ออกเอกสารไม่ได้ — อ่าน${row.label}ไม่สำเร็จ · กดออกเอกสารอีกครั้ง`);
    assert.equal(world.db.rpcLog.length, 0);
    assert.equal(first.prepareImages.calls.length, 0, 'ยังไม่ดึงรูปเมื่อข้อมูลยังไม่ครบ');
    assert.equal(world.reports().length, 0);
    assert.equal(lastNo(world), 0);
    assert.equal(stateOf(world), 'missing');

    const second = await issue(world, { via: 'issue_only', requestId: world.request().id });
    assert.equal(second.result.docNo, FIRST_NO, second.result.reason);
    assert.ok(row.back(world.reports()[0].snapshot), `ค่าของ ${row.name} ต้องอยู่ในภาพนิ่งที่เก็บ`);
    assert.equal(lastNo(world), 1);
  });
}

/* กฎความล้มเหลวถูกนับถอยหลังในที่ — แต่ละเทสต์ต้องได้สำเนาของตัวเอง (ฟังก์ชัน `when` คัดลอกด้วยมือ) */
function structuredCloneRules(rules) {
  if (!rules) return {};
  return Object.fromEntries(Object.entries(rules).map(([key, rule]) => [key, { ...rule }]));
}

/* ══ 5. I3 ด่าน ══════════════════════════════════════════════════════════════════ */

test('I3: ด่านส่งผลวิ่งซ้ำหลังล็อก — เหตุชนิด content = blocked · กดซ้ำไม่ช่วย (ต้องดึงผลกลับ) · ไม่ดึงรูป', async () => {
  const world = twinWorld();
  world.tables.service_survey_zones[1].parts = [];
  const { result, prepareImages, audit } = await issue(world);
  assert.equal(result.code, 'blocked');
  assert.equal(result.retry, false);
  assert.ok(result.reasons.length >= 1);
  assert.ok(result.reason.startsWith('ออกเอกสารไม่ได้ — '));
  assert.ok(result.reason.endsWith(' · ถ้าต้องแก้ ให้ดึงผลกลับมาแก้แล้วส่งใหม่'));
  assert.equal(new Set(result.reasons).size, result.reasons.length, 'เหตุเดียวกันจากสองด่านไม่ซ้ำสองบรรทัด');
  assert.equal(prepareImages.calls.length, 0);
  assert.equal(world.db.rpcLog.length, 0);
  // เส้นส่งผล: ใบตอบแล้วแต่ไม่มีเอกสาร ต้องมีรอยใน audit ของคำร้อง
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].entityType, 'dept_request');
});

test('I3: มีแต่เหตุของระบบ (ไม่มีมาตรฐานเอกสาร) = blocked ที่กดซ้ำได้ ไม่ชวนดึงผลกลับ', async () => {
  const world = twinWorld();
  world.tables.document_standard_versions.length = 0;
  const { result } = await issue(world);
  assert.equal(result.code, 'blocked');
  assert.equal(result.retry, true);
  assert.deepEqual(result.reasons, ['ไม่พบมาตรฐานเอกสารของรายงานการประเมินพื้นที่']);
  assert.ok(result.reason.endsWith(' · แก้แล้วกดออกเอกสารอีกครั้ง'));
});

test('I3: รูปจุดที่ยังไม่ผูก (ด่านรูปจุด `closesVisit: false`) และหน้าที่ล้นของทั้งสองฉบับ ตีกลับก่อนดึงรูป', async () => {
  const unlinked = worldFrom(twin({ spotLinks: null }));
  const a = await issue(unlinked);
  assert.equal(a.result.code, 'blocked');
  assert.ok(a.result.reasons.some((line) => line.includes('ยังไม่ได้ผูกจุด')));
  assert.equal(a.prepareImages.calls.length, 0);

  const source = stressSurveyInputs({ zones: [{}, {}, {}], helpers: 4, title: thaiText(200) });
  source.customer = { ...source.customer, name: thaiText(200) };
  source.site = { ...source.site, name: thaiText(150), address: thaiText(400) };
  const overflow = worldFrom(source);
  const b = await issue(overflow);
  assert.equal(b.result.code, 'blocked');
  assert.equal(b.result.retry, false);
  assert.ok(b.result.reasons.some((line) => line.startsWith('ฉบับภายใน: หน้า 1 ')), b.result.reason);
  assert.equal(b.prepareImages.calls.length, 0);
  assert.equal(overflow.db.rpcLog.length, 0);
});

/* ══ 6. I4 รูป ═══════════════════════════════════════════════════════════════════ */

test('⭐ I4: แผนที่ของรอบตรวจก่อนส่งผลถูกใช้ซ้ำ — ไม่มีไฟล์ไหนถูกดึงสองครั้ง · รับได้ทั้งผลทั้งก้อน ตัวแผนที่ และ Map', async () => {
  const all = surveyReportImageFiles(twin()).map((f) => f.attId);
  const map = Object.fromEntries(all.map((attId) => [attId, { sha: fakeSha(`pre-${attId}`), w: 1400, h: 1051, bytes: 9 }]));
  const shapes = [
    ['ผลทั้งก้อน', { imageByAttId: map, failed: [] }],
    ['ตัวแผนที่', map],
    ['Map', new Map(Object.entries(map))],
  ];
  for (const [name, prepared] of shapes) {
    const world = twinWorld();
    const { result, prepareImages } = await issue(world, { prepared });
    assert.equal(result.state, 'issued', name);
    assert.deepEqual(prepareImages.calls[0].fetched, [], `${name}: ไม่ดึงไฟล์ไหนซ้ำ`);
    assert.deepEqual(world.reports()[0].images.map((i) => i.sha), [...new Set(all.map((attId) => fakeSha(`pre-${attId}`)))]);
  }

  // รอบตรวจได้มาบางส่วน (Drive ช้า) — เติมเฉพาะที่ขาด
  const world = twinWorld();
  const partial = { imageByAttId: Object.fromEntries(Object.entries(map).slice(0, 5)), failed: [{ attId: all[5], reason: 'drive_timeout', permanent: false }] };
  const { result, prepareImages } = await issue(world, { prepared: partial });
  assert.equal(result.state, 'issued');
  assert.deepEqual(prepareImages.calls[0].fetched, all.slice(5));
  assert.deepEqual(prepareImages.calls[0].files, all, 'ลิสต์ไฟล์คือชุดที่กระดาษพิมพ์ ตามลำดับของภาพนิ่ง');

  // ผลของรอบตรวจที่ล้มทั้งรอบ (ไม่มีแผนที่) = เตรียมใหม่ทั้งหมด ไม่ใช่เอา `{ failed }` ไปเป็นแผนที่
  const none = twinWorld();
  const third = await issue(none, { prepared: { failed: [] } });
  assert.equal(third.prepareImages.calls[0].opts.have, null);
  assert.deepEqual(third.prepareImages.calls[0].fetched, all);
});

test('I4: งบเวลา — เส้นส่งผล 20 วิ · ปุ่มออกเอกสาร 180 วิ · ผู้เรียกส่ง `deadline` มา = ใช้ค่านั้น · ตัวเลือกเสริมทับสามค่าหลักไม่ได้', async () => {
  assert.deepEqual(SURVEY_REPORT_IMAGE_BUDGET_MS, { send: 20_000, issue_only: 180_000 });
  const send = await issue(twinWorld(), { via: 'send' });
  assert.equal(send.prepareImages.calls[0].opts.deadline, 20_000);

  const world = twinWorld();
  const only = await issue(world, { via: 'issue_only', requestId: world.request().id });
  assert.equal(only.prepareImages.calls[0].opts.deadline, 180_000);

  const at = Date.parse(NOW) + 5_000;
  const getFileStream = () => null;
  const given = await issue(twinWorld(), {
    deadline: at,
    imageOptions: { getFileStream, concurrency: 2, deadline: 1, have: { x: 1 }, storeAllowed: false },
  });
  const { opts } = given.prepareImages.calls[0];
  assert.equal(opts.deadline, at);
  assert.equal(opts.have, null);
  assert.strictEqual(opts.storeAllowed, true);
  assert.equal(opts.getFileStream, getFileStream);
  assert.equal(opts.concurrency, 2);
});

test('🔴 I4: ไฟล์ที่เปิดไม่ได้ (ถาวร) = undecodable พร้อมชื่อไฟล์ — กดซ้ำไม่ช่วย ทางออกคือดึงผลกลับ · ทุกเหตุถาวรมีคำอ่านของตัวเอง', async () => {
  const permanent = [
    SURVEY_IMAGE_FAILURE.NO_DRIVE_FILE, SURVEY_IMAGE_FAILURE.DRIVE_NOT_FOUND, SURVEY_IMAGE_FAILURE.DRIVE_FORBIDDEN,
    SURVEY_IMAGE_FAILURE.TOO_LARGE, SURVEY_IMAGE_FAILURE.UNDECODABLE,
  ];
  for (const reason of permanent) {
    const world = twinWorld();
    const { result } = await issue(world, {
      prepareImages: fakePrepare({ 'att-z1-p1': { times: 9, reason, permanent: true } }),
    });
    assert.equal(result.code, 'undecodable', reason);
    assert.equal(result.retry, false);
    assert.equal(result.reasons.length, 1);
    assert.ok(result.reasons[0].startsWith('9047.jpg — '), result.reasons[0]);
    assert.ok(!result.reasons[0].endsWith('เปิดไฟล์ไม่ได้'), `เหตุ ${reason} ต้องมีคำอ่านของตัวเอง ไม่ตกไปคำสำรอง`);
    assert.ok(result.reason.includes('(ชื่อไฟล์ 9047.jpg)'));
    assert.ok(result.reason.includes('ดึงผลกลับ'));
    assert.equal(world.db.rpcLog.length, 0);
  }

  // ถาวรปนชั่วคราว = ถาวรชนะ (กดซ้ำจะล้มที่เดิม) และเอ่ยชื่อเฉพาะไฟล์ที่เป็นปัญหาจริง
  const world = twinWorld();
  const { result } = await issue(world, {
    prepareImages: fakePrepare({
      'att-z1-p1': { times: 1, reason: SURVEY_IMAGE_FAILURE.UNDECODABLE, permanent: true },
      'att-z2-w1': { times: 1, reason: SURVEY_IMAGE_FAILURE.TIMEOUT },
    }),
  });
  assert.equal(result.code, 'undecodable');
  assert.ok(result.reason.startsWith('รูป 1 รูปเปิดไม่ได้ (ชื่อไฟล์ 9047.jpg)'));
});

test('I4: ชั่วคราว — งบหมด = timeout · อย่างอื่น = images_failed (นับรูป) · ตัวเตรียมรูปโยนหรือคืนของผิดรูปก็ไม่โยนต่อ', async () => {
  assert.equal(SURVEY_IMAGE_FAILURE.TIMEOUT, 'timeout', 'ขั้นออกเลขแยก "หมดงบเวลา" ด้วยคำนี้');

  const slow = await issue(twinWorld(), {
    prepareImages: fakePrepare({ '*': { times: 3, reason: SURVEY_IMAGE_FAILURE.TIMEOUT } }),
  });
  assert.equal(slow.result.code, 'timeout');
  assert.equal(slow.result.retry, true);
  assert.ok(slow.result.reason.includes('เหลือ 3 รูป'));

  const down = await issue(twinWorld(), {
    prepareImages: fakePrepare({ '*': { times: 2, reason: SURVEY_IMAGE_FAILURE.SHARP_UNAVAILABLE } }),
  });
  assert.equal(down.result.code, 'images_failed');
  assert.equal(down.result.retry, true);
  assert.equal(down.result.reason, 'ดึงรูปจาก Drive ไม่สำเร็จ 2 รูป — ยังไม่ได้ออกเอกสาร กดอีกครั้ง');

  for (const prepareImages of [async () => { throw new Error('โหลดโมดูลรูปไม่ได้'); }, async () => null, async () => 'x']) {
    const world = twinWorld();
    const { result } = await issue(world, { prepareImages });
    assert.equal(result.code, 'images_failed');
    assert.equal(result.retry, true);
    assert.equal(world.db.rpcLog.length, 0);
  }

  // ตัวเตรียมรูปบอกว่าสำเร็จแต่แผนที่ขาดไฟล์ — ภาพนิ่งโหมด freeze ไม่ออก ⇒ ไม่มีเลข
  const world = twinWorld();
  const { result } = await issue(world, { prepareImages: async () => ({ imageByAttId: {}, failed: [] }) });
  assert.equal(result.code, 'images_failed');
  assert.ok(result.reasons[0].includes('ยังเตรียมไม่เสร็จ'));
  assert.equal(world.db.rpcLog.length, 0);
});

test('I4: ไม่เสียบตัวเตรียมรูป = โหลด `surveyReportImages` เองแบบ lazy — รูปครบจากรอบตรวจแล้วไม่แตะ Drive/ที่เก็บเลย', async () => {
  const world = twinWorld();
  const map = Object.fromEntries(surveyReportImageFiles(world.source)
    .map((f) => [f.attId, { sha: fakeSha(f.attId), w: 1400, h: 1051, bytes: 9 }]));
  // ไม่ผ่านตัวห่อ `issue` — ต้องการตัวเตรียมรูปของจริง · ฐานปลอมโยนถ้ามีใครแตะ `storage`
  const result = await issueSurveyReport(world.db, {
    request: world.request(), user: HEAD, via: 'send', now, audit: fakeAudit(), prepared: { imageByAttId: map, failed: [] },
    imageOptions: {
      getFileStream: () => { throw new Error('ห้ามดึง Drive'); },
      loadSharp: () => { throw new Error('ห้ามโหลด sharp'); },
      log: () => {},
    },
  });
  assert.equal(result.state, 'issued', result.reason);
  assert.equal(result.docNo, FIRST_NO);
});

/* ══ 7. I5 เรนเดอร์แห้ง + ยามกันรั่ว · I5b วัดกระดาษ ═══════════════════════════════════ */

test('🔴 I5: ยามกันรั่วของฉบับลูกค้าหยุดก่อนออกเลข — ตัวเรนเดอร์ที่พิมพ์ของฉบับภายในลงฉบับลูกค้า = paper_blocked', async () => {
  const world = twinWorld();
  // ตัวเรนเดอร์ของ deploy ที่พัง: ฉบับลูกค้าได้แถบของฉบับภายในทุกแผ่น
  const BAND = '<div class="band"><span class="band-t">ฉบับภายใน — ห้ามส่งลูกค้า</span></div>';
  const seen = [];
  const render = (args) => {
    seen.push(args.view.version);
    const html = renderSurveyReportHTML(args);
    return args.view.version === 'customer' ? html.replaceAll('<main class="content', `${BAND}<main class="content`) : html;
  };
  const { result } = await issue(world, { render });
  assert.deepEqual(seen, ['customer', 'internal'], 'เรนเดอร์แห้งทั้งสองฉบับผ่านจุดเสียบ');
  assert.equal(result.state, 'failed');
  assert.equal(result.code, 'paper_blocked');
  assert.equal(result.retry, false);
  assert.deepEqual(result.reasons, ['ฉบับลูกค้ามีชิ้นของฉบับภายใน (แถบฉบับภายใน)']);
  assert.match(result.reason, /ยังไม่ได้ออกเลขเอกสาร แจ้งผู้ดูแลระบบ$/);
  assert.equal(world.db.rpcLog.length, 0, 'ยังไม่มีเลขถูกออก');
  assert.equal(world.reports().length, 0);
  assert.ok(errors.some((line) => line.includes('ยามกันรั่ว')));
});

test('🔴 I5: คำว่า "ฉบับภายใน" ในข้อความที่คนพิมพ์ไม่กันการออกเลข — รอบตรวจก่อนส่งผลปล่อยผ่านแล้ว ขั้นออกเลขต้องไม่มาติดหลังคำร้องถูกตอบ', async () => {
  // มติ 2: ปัญหาของกระดาษตีกลับก่อนเขียน · มติ 3: ข้อความของผู้สำรวจพิมพ์ตามที่พิมพ์มา
  const typed = [
    ['หมายเหตุพื้นที่', (source) => { source.zones[0].note = 'รายละเอียดจุดวางเครื่องดูฉบับภายใน'; }],
    ['ชื่อพื้นที่', (source) => { source.zones[0].zoneName = 'ห้องเก็บเอกสารฉบับภายใน'; }],
    ['ชื่อไซต์', (source) => { source.site.name = 'อาคารฉบับภายใน'; }],
    ['ชื่อลูกค้า', (source) => { source.customer.name = 'บริษัท ฉบับภายใน จำกัด'; }],
  ];
  for (const [what, edit] of typed) {
    const source = twin();
    edit(source);
    const world = worldFrom(source);
    const { result } = await issue(world);
    assert.equal(result.state, 'issued', `${what}: ${result.reason}`);
    assert.equal(result.docNo, FIRST_NO, what);
    assert.equal(world.reports().length, 1, what);
    // ข้อความลงภาพนิ่งของฉบับลูกค้าจริง — ไม่ได้ผ่านเพราะถูกตัดทิ้ง
    const view = surveyReportView(world.reports()[0].snapshot, { version: 'customer' });
    assert.ok(JSON.stringify(view).includes('ฉบับภายใน'), what);
    assert.equal(errors.some((line) => line.includes('ยามกันรั่ว')), false, what);
  }
});

test('I5b: ตัววัดได้ HTML แห้งของทั้งสองฉบับ (ยังเป็น token ยังไม่มีเลข) · ผ่าน = ออกเลข · เส้นส่งผลที่ไม่ส่งตัววัด = ไม่วัด', async () => {
  const world = twinWorld();
  const seen = [];
  const measure = async (payload) => { seen.push(payload); return { issues: [], error: null }; };
  const deadline = Date.parse(NOW) + 60_000;
  const { result } = await issue(world, { via: 'issue_only', requestId: world.request().id, measure, deadline });
  assert.equal(result.docNo, FIRST_NO);

  assert.equal(seen.length, 1);
  assert.deepEqual(Object.keys(seen[0]).sort(), ['customerHtml', 'deadline', 'internalHtml']);
  assert.equal(seen[0].deadline, deadline);
  const { customerHtml, internalHtml } = seen[0];
  assert.ok(customerHtml.includes('su-img:') && internalHtml.includes('su-img:'), 'token ของรูปยังไม่ถูกแปลง — ตัววัดแปลงจาก bucket เอง');
  assert.ok(!customerHtml.includes('SU-2610') && !internalHtml.includes('SU-2610'), 'เรนเดอร์แห้งยังไม่มีเลขที่เอกสาร');
  assert.ok(!customerHtml.includes('ฉบับภายใน'));
  assert.ok(internalHtml.includes('ฉบับภายใน'));
  assert.ok(internalHtml.length > customerHtml.length);
  // ตัววัดถูกเรียกก่อน RPC
  assert.equal(world.db.rpcLog.length, 1);
});

test('🔴 I5b: แผ่นที่ถูกตัด = paper_blocked — **ไม่มีเลขถูกออก** · บอกฉบับและหน้า · ข้อที่แค่ลง log ไม่กันการออก', async () => {
  const world = twinWorld();
  const clip = async () => ({
    issues: [
      { version: 'internal', kind: 'block', text: 'หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ 12px', page: 3 },
      { version: 'customer', kind: 'log', text: 'หน้า 1 เหลือที่ใต้เนื้อหา 4px (น้อยกว่า 8px)', page: 1 },
      'รูปถอดรหัสไม่ได้ 1 รูป',
    ],
    error: null,
  });
  const { result } = await issue(world, { via: 'issue_only', requestId: world.request().id, measure: clip });
  assert.equal(result.code, 'paper_blocked');
  assert.equal(result.retry, false);
  assert.deepEqual(result.reasons, ['ฉบับภายใน: หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ 12px', 'รูปถอดรหัสไม่ได้ 1 รูป']);
  assert.ok(result.reason.endsWith(' · ยังไม่ได้ออกเลขเอกสาร'));
  assert.equal(world.db.rpcLog.length, 0);
  assert.equal(lastNo(world), 0);

  // มีแต่ข้อ log = ออกได้
  const tight = async () => ({ issues: [{ version: 'customer', kind: 'log', text: 'หน้า 1 เหลือที่ใต้เนื้อหา 4px', page: 1 }], error: null });
  const ok = await issue(world, { via: 'issue_only', requestId: world.request().id, measure: tight });
  assert.equal(ok.result.docNo, FIRST_NO);
});

test('I5b: chromium ล้ม (โยน · คืน error · ไม่คืนอะไร) = paper_blocked ที่กดซ้ำได้ — ไม่มีเลขถูกออก', async () => {
  const broken = [
    async () => { throw new Error('Failed to launch the browser process'); },
    async () => ({ issues: [], error: 'chromium_failed' }),
    async () => undefined,
  ];
  for (const measure of broken) {
    const world = twinWorld();
    const { result } = await issue(world, { via: 'issue_only', requestId: world.request().id, measure });
    assert.equal(result.code, 'paper_blocked');
    assert.equal(result.retry, true);
    assert.ok(result.reason.includes('ยังไม่ได้ออกเลขเอกสาร'));
    assert.equal(world.db.rpcLog.length, 0);
  }
});

/* 🐞 UAT เอกสารประเมินพื้นที่ 2026-10-08 (S37): กล่องยืนยันและการ์ดพิมพ์ "ฉบับลูกค้า: หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ 6.4px ใต้ td.zn" —
   ค่าวัดเป็น px กับชื่อชิ้นของหน้าไปถึงหัวหน้า · ของคนแก้ระบบต้องอยู่ใน `reasons` กับ log ไม่ใช่ในประโยคที่คนอ่าน */
const TECHNICAL = /\dpx|td\.|HTML|su-img/;

test('🐞 I5b: ประโยคที่หัวหน้าอ่าน (`reason`) ไม่มีค่าวัดเป็น px · ชื่อชิ้นของหน้า · จำนวนแผ่นของ HTML/PDF — บรรทัดเต็มยังอยู่ใน `reasons`', async () => {
  const world = twinWorld();
  const technical = [
    'หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ 6.4px ใต้ td.zn',
    'รูป 2 รูปยังไม่ถูกฝังลงกระดาษ (เหลือ su-img: ใน HTML)',
    'จำนวนแผ่นไม่ตรงกัน — HTML 4 แผ่น · วัดได้ 4 แผ่น · PDF 5 หน้า',
    'นับหน้าของ PDF ไม่ได้ (HTML 4 แผ่น · วัดได้ 4 แผ่น)',
  ];
  const clip = async () => ({
    issues: technical.map((text, i) => ({ version: 'customer', kind: 'block', text, page: i + 1 })),
    error: null,
  });
  const { result } = await issue(world, { via: 'issue_only', requestId: world.request().id, measure: clip });
  assert.equal(result.code, 'paper_blocked');
  assert.equal(result.retry, false);
  assert.equal(result.reason, 'กระดาษของเอกสารยังพิมพ์ไม่ได้ — ฉบับลูกค้า: หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ | ฉบับลูกค้า: รูป 2 รูปยังไม่ถูกฝังลงกระดาษ'
    + ' | ฉบับลูกค้า: จำนวนแผ่นไม่ตรงกัน | ฉบับลูกค้า: นับหน้าของ PDF ไม่ได้ · ยังไม่ได้ออกเลขเอกสาร');
  assert.doesNotMatch(result.reason, TECHNICAL);
  assert.deepEqual(result.reasons, technical.map((text) => `ฉบับลูกค้า: ${text}`), 'บรรทัดเต็มของตัววัดยังอยู่ครบสำหรับคนแก้ระบบ');
  assert.equal(world.db.rpcLog.length, 0);
});

test('บรรทัดจริงของตัววัดกระดาษ (`surveyReportPaperIssues`) ผ่านตัวตัดแล้วไม่เหลือของคนแก้ระบบ · บรรทัดที่ไม่มีของแบบนั้นผ่านไปตามเดิม', () => {
  const html = `<article class="sheet"></article><img src="su-img:${'a'.repeat(64)}">`;
  const fit = [{ page: 1, rule: 1054, last: 1060.4, lastBlock: 'td.zn' }];
  const lines = [
    ...surveyReportPaperIssues({ html, fit, brokenImages: 1, buffer: Buffer.from('not a pdf') }),
    ...surveyReportPaperIssues({ html, fit: [...fit, { page: 2, rule: null, last: 10 }], brokenImages: 0, buffer: Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n') }),
    ...surveyReportPaperIssues({}),
  ].filter((i) => i.kind === 'block').map((i) => i.text);
  /* ตัววัดยังพิมพ์ของพวกนี้จริง — ถ้าวันหนึ่งมันเลิกพิมพ์ เทสต์นี้ไม่มีอะไรให้เฝ้าแล้ว (ถอดตัวตัดได้) */
  assert.ok(lines.some((t) => /px ใต้ td\.zn$/.test(t)), lines.join(' | '));
  assert.ok(lines.some((t) => t.includes('su-img:')), lines.join(' | '));
  assert.ok(lines.some((t) => t.includes('HTML ')), lines.join(' | '));
  for (const line of lines) {
    const say = surveyReportPaperLineForReader(line);
    assert.ok(say.length > 0, line);
    assert.doesNotMatch(say, TECHNICAL, line);
    assert.ok(line.startsWith(say), `ตัดได้เฉพาะท่อนท้าย: ${line}`);
  }
  assert.equal(surveyReportPaperLineForReader('ฉบับลูกค้า: หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ 6.4px ใต้ td.zn'), 'ฉบับลูกค้า: หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ');
  assert.equal(surveyReportPaperLineForReader('หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ 12px'), 'หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ');
  for (const plain of ['รูปถอดรหัสไม่ได้ 1 รูป', 'หน้า 2 ไม่มีเส้นท้ายกระดาษ', 'ไม่มีไฟล์ PDF ให้ตรวจ', 'ฉบับลูกค้า: ไม่มีกระดาษให้วัด']) {
    assert.equal(surveyReportPaperLineForReader(plain), plain);
  }
  assert.equal(surveyReportPaperLineForReader(null), '');
});

/* ══ 8. I6 ผลของ RPC — ออกซ้อน · ชนกัน · คำตอบหาย (§3 ตาราง error · §15 idempotency) ═══════════ */

test('🔴 สองคำขอพร้อมกัน = แถวเดียว เลขเดียว — ผู้แพ้ได้ `reused: true` · audit ของการออกมีแถวเดียว', async () => {
  const world = twinWorld();
  const audit = fakeAudit();
  const [a, b] = await Promise.all([
    issue(world, { audit }),
    issue(world, { audit, via: 'issue_only', requestId: world.request().id, user: { id: 'U-other', name: 'Other Head' } }),
  ]);
  assert.equal(world.db.rpcLog.length, 2, 'ทั้งสองคำขอผ่าน I1 มาถึง RPC');
  assert.equal(world.reports().length, 1);
  assert.equal(lastNo(world), 1);
  const results = [a.result, b.result];
  assert.deepEqual(results.map((r) => r.state), ['issued', 'issued']);
  assert.deepEqual(results.map((r) => r.docNo), [FIRST_NO, FIRST_NO]);
  assert.deepEqual(results.map((r) => r.reused).sort(), [false, true]);
  assert.equal(a.result.reportId, b.result.reportId);
  assert.equal(audit.rows.filter((r) => r.action === 'create').length, 1);
  assert.equal(audit.rows.length, 1, 'ผู้แพ้ไม่เขียน audit ล้มเหลว');
});

/** ดึงผลกลับ = ล้างคำตอบ + ทริกเกอร์ 0401 ⑤ แทนที่ฉบับที่ใช้อยู่ */
function recall(db) {
  const request = db.tables.dept_requests[0];
  request.answeredAt = null;
  for (const row of db.tables.service_survey_reports) {
    if (row.requestId === request.id && row.status === 'current') {
      row.status = 'superseded';
      row.supersededAt = '2026-10-01T04:00:01.000+00:00';
      row.supersededReason = 'recall';
    }
  }
}

test('🔴 ผลถูกดึงกลับคั่นกลาง (`survey_answer_changed`) = answer_changed — ไม่มีแถว ไม่มีเลข และ **ไม่เขียน audit ล้มเหลว** แม้เส้นส่งผล', async () => {
  const world = twinWorld({ options: { rpc: [{ before: recall }] } });
  const { result, audit } = await issue(world, { via: 'send' });
  assert.equal(result.state, 'failed');
  assert.equal(result.code, 'answer_changed');
  assert.equal(result.reason, SURVEY_REPORT_REASONS.answer_changed);
  assert.equal(result.retry, false);
  assert.equal(world.reports().length, 0);
  assert.equal(lastNo(world), 0);
  assert.equal(audit.rows.length, 0);
  assert.deepEqual(errors, [], 'เรื่องปกติของจังหวะ ไม่ลง log');
  assert.equal(stateOf(world), 'not_sent');
});

test('ดึงผลกลับแล้วส่งใหม่ = ฉบับถัดไปของเลขฐานเดิม (R+1) — ตัวนับไม่เดิน · ฉบับเก่าถูกแทนที่', async () => {
  const world = twinWorld();
  await issue(world);
  recall(world.db);
  assert.equal(stateOf(world), 'recalled');
  world.request().answeredAt = '2026-10-01T03:59:00.123456+00:00';

  const { result } = await issue(world);
  assert.equal(result.docNo, 'SU-26100001-1');
  assert.equal(result.rev, 1);
  assert.equal(result.reused, false);
  assert.equal(lastNo(world), 1);
  assert.deepEqual(world.reports().map((r) => [r.docNo, r.status]), [['SU-26100001-0', 'superseded'], ['SU-26100001-1', 'current']]);
  assert.notEqual(world.reports()[0].id, world.reports()[1].id);
});

const UNIQUE = { code: '23505', message: 'duplicate key value violates unique constraint "service_survey_reports_docNo_key"', details: 'Key ("docNo")=(SU-26100001-0) already exists.' };

test('🔴 `23505` ①: อ่านซ้ำแล้วมีฉบับที่ใช้อยู่ของคำตอบรอบนี้ = reused (อีกคำขอออกไปก่อน)', async () => {
  const other = twinWorld();
  await issue(other, { user: { id: 'U-other', name: 'Other Head' } });
  const theirs = other.reports()[0];

  const world = twinWorld({
    options: { rpc: [{ before: (db) => { db.tables.service_survey_reports.push({ ...theirs }); }, error: UNIQUE }] },
  });
  const { result, audit } = await issue(world);
  assert.equal(result.state, 'issued');
  assert.equal(result.reused, true);
  assert.equal(result.docNo, theirs.docNo);
  assert.equal(result.reportId, theirs.id);
  assert.equal(audit.rows.length, 0);
});

test('🔴 `23505` ②: ไม่มีฉบับที่ใช้อยู่ คำตอบเดิม = rpc_failed "เลขชนกัน" — กดซ้ำไม่ช่วย · ชื่อ constraint ลง log', async () => {
  const world = twinWorld({ options: { rpc: [{ error: UNIQUE }] } });
  const { result, audit } = await issue(world);
  assert.equal(result.code, 'rpc_failed');
  assert.equal(result.reason, SURVEY_REPORT_REASONS.conflict);
  assert.equal(result.retry, false);
  assert.equal(world.reports().length, 0);
  assert.ok(errors.some((line) => line.includes('service_survey_reports_docNo_key')));
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].summary, `ออกเอกสารประเมินไม่สำเร็จหลังส่งผล RQ-AS-26090186 — ${SURVEY_REPORT_REASONS.conflict}`);
});

test('🔴 `23505` ③: ไม่มีฉบับที่ใช้อยู่ และคำตอบเปลี่ยนไปแล้ว = answer_changed', async () => {
  const resent = (db) => { db.tables.dept_requests[0].answeredAt = '2026-10-01T03:59:59.000+00:00'; };
  const world = twinWorld({ options: { rpc: [{ before: resent, error: UNIQUE }] } });
  const { result, audit } = await issue(world);
  assert.equal(result.code, 'answer_changed');
  assert.equal(audit.rows.length, 0);
});

test('`survey_report_already_current` ④: อ่านซ้ำเจอฉบับที่ใช้อยู่ของคำตอบรอบอื่น = stale_current — ไม่ใช้ซ้ำ', async () => {
  const stale = (db) => {
    db.tables.service_survey_reports.push({
      id: 'SVR-old', requestId: db.tables.dept_requests[0].id, baseNo: 'SU-26090007', rev: 0, docNo: 'SU-26090007-0',
      status: 'current', supersededAt: null, supersededReason: null, snapshot: { v: 1 }, images: [],
      approvedAt: '2026-09-01T00:00:00.000+00:00', frozenAt: null, customerPdfPath: null, internalPdfPath: null,
    });
  };
  const world = twinWorld({ options: { rpc: [{ before: stale }] } });
  const { result } = await issue(world);
  assert.equal(result.code, 'stale_current');
  assert.equal(result.docNo, null);
  assert.equal(world.reports().length, 1);
});

test('RPC ชนกันแล้วอ่านซ้ำไม่สำเร็จ = read_failed ที่กดซ้ำได้ — ไม่เดาว่า "เลขชนกัน"', async () => {
  const world = twinWorld({
    options: {
      rpc: [{ error: UNIQUE }],
      // รอบ I1 อ่านผ่าน (ครั้งแรก) · การอ่านซ้ำหลัง RPC ล้ม
      fail: { service_survey_reports: { times: 1, when: (q) => world.db.rpcLog.length > 0 } },
    },
  });
  const { result } = await issue(world);
  assert.equal(result.code, 'read_failed');
  assert.equal(result.retry, true);
});

test('ตาราง error ของ RPC: หัวข้อ/ยกเลิก · เลขครบ 9999 · ฟังก์ชันยังไม่มี · เหตุที่ไม่รู้จัก — รหัส ข้อความ และ `retry` ตามสเปก', async () => {
  const R = SURVEY_REPORT_REASONS;
  const cases = [
    { error: { message: 'survey_request_invalid: DR-1' }, code: 'not_answered', reason: R.not_answered, retry: false },
    { error: { message: 'survey_report_sequence_exhausted: 26' }, code: 'rpc_failed', reason: R.sequence_exhausted, retry: false },
    { error: { code: 'PGRST202', message: 'Could not find the function public.issue_survey_report' }, code: 'rpc_failed', reason: R.db_not_ready, retry: false },
    { error: { code: 'XX000', message: 'boom' }, code: 'rpc_failed', reason: R.rpc_failed, retry: true },
    { throws: 'fetch failed', code: 'rpc_failed', reason: R.rpc_failed, retry: true },
  ];
  for (const c of cases) {
    const world = twinWorld({ options: { rpc: [c.throws ? { throws: c.throws } : { error: c.error }] } });
    const { result } = await issue(world);
    const name = c.throws || c.error.message;
    assert.equal(result.state, 'failed', name);
    assert.equal(result.code, c.code, name);
    assert.equal(result.reason, c.reason, name);
    assert.equal(result.retry, c.retry, name);
    assert.ok(SURVEY_REPORT_ISSUE_CODES.includes(result.code));
    assert.equal(world.reports().length, 0);
    assert.equal(lastNo(world), 0);
  }
});

test('🔴 RPC commit แล้วคำตอบหาย (§11 แถว 7): ถามหาแถวด้วย id ของรอบนี้ — เจอ = ออกแล้ว เลขใหม่ (`reused: false`) · audit ไม่ขาด', async () => {
  for (const rule of [{ commit: true, throws: 'fetch failed' }, { commit: true, error: { message: 'upstream timeout' } }, { commit: true, data: null }]) {
    const world = twinWorld({ options: { rpc: [rule] } });
    const { result, audit } = await issue(world);
    assert.equal(result.state, 'issued', JSON.stringify(rule));
    assert.equal(result.docNo, FIRST_NO);
    assert.equal(result.rev, 0);
    assert.equal(result.reused, false);
    assert.equal(result.reportId, world.reports()[0].id);
    assert.deepEqual(audit.rows.map((r) => r.action), ['create']);
    assert.equal(lastNo(world), 1);
  }
});

test('🔴 RPC commit แล้วคำตอบหาย และถามหาแถวไม่ได้ด้วย = rpc_failed — รอบหน้า I1 เจอแถวแล้วใช้ซ้ำ **ไม่มีเลขที่สอง**', async () => {
  const world = twinWorld({
    options: {
      rpc: [{ commit: true, throws: 'fetch failed' }],
      fail: { service_survey_reports: { times: 1, when: () => world.db.rpcLog.length > 0 } },
    },
  });
  const first = await issue(world);
  assert.equal(first.result.code, 'rpc_failed');
  assert.equal(first.result.retry, true);
  assert.equal(world.reports().length, 1, 'แถวอยู่ในฐานแล้ว');
  assert.equal(stateOf(world), 'issued');

  const second = await issue(world, { via: 'issue_only', requestId: world.request().id });
  assert.equal(second.result.state, 'issued');
  assert.equal(second.result.reused, true);
  assert.equal(second.result.docNo, FIRST_NO);
  assert.equal(world.db.rpcLog.length, 1, 'ไม่เรียก RPC ซ้ำ');
  assert.equal(lastNo(world), 1);
});

test('คำตอบหาย แล้วแถวของรอบนี้ถูกแทนที่ไปแล้ว (ดึงผลกลับทันที) = answer_changed ไม่อ้างว่าออกแล้ว', async () => {
  const world = twinWorld({ options: { rpc: [{ commit: true, throws: 'fetch failed' }] } });
  const real = world.db.from.bind(world.db);
  // ดึงผลกลับเกิดระหว่าง RPC commit กับการถามหาแถว
  world.db.from = (table) => {
    if (table === 'service_survey_reports' && world.db.rpcLog.length > 0 && world.request().answeredAt) recall(world.db);
    return real(table);
  };
  const { result, audit } = await issue(world);
  assert.equal(result.code, 'answer_changed');
  assert.equal(audit.rows.length, 0);
});

test('I7: อ่านแถวกลับไม่สำเร็จ ก็ยัง "ออกแล้ว" ด้วยเลขที่ RPC คืน — ฉบับ (rev) แกะจากเลข', async () => {
  const world = twinWorld({
    options: { fail: { service_survey_reports: { times: 1, throws: true, when: () => world.db.rpcLog.length > 0 } } },
  });
  const { result, audit } = await issue(world);
  assert.equal(result.state, 'issued');
  assert.equal(result.docNo, FIRST_NO);
  assert.strictEqual(result.rev, 0);
  assert.equal(result.reused, false);
  assert.equal(audit.rows[0].after.rev, 0);
  assert.ok(errors.some((line) => line.includes('อ่านแถวของ SU-26100001-0 กลับไม่สำเร็จ')));
});

test('I8: audit โยน = ยังตอบ "ออกแล้ว" — เลขออกไปแล้ว ประวัติที่เขียนไม่ลงต้องไม่ทำให้ผลกลายเป็นล้ม', async () => {
  const world = twinWorld();
  const { result } = await issue(world, { audit: async () => { throw new Error('audit ล่ม'); } });
  assert.equal(result.state, 'issued');
  assert.equal(result.docNo, FIRST_NO);
});

/* ══ 9. ไม่โยน · audit ของการล้ม · ไม่รั่ว ════════════════════════════════════════════ */

test('🔴 ไม่โยนไม่ว่าอะไรพัง — ไม่มี client · client ที่โยนทุกคำสั่ง · ไม่ส่งตัวเลือก · ตัวเรนเดอร์ได้ของผิดรูป', async () => {
  const boom = new Proxy({}, { get() { throw new Error('พังทุกทาง'); } });
  const audit = fakeAudit();
  const cases = [
    () => issueSurveyReport(null, { requestId: 'DR-1', audit }),
    () => issueSurveyReport(undefined),
    () => issueSurveyReport(boom, { requestId: 'DR-1', via: 'issue_only', audit }),
    () => issueSurveyReport(boom, { request: twin().request, via: 'send', audit }),
    () => issueSurveyReport(twinWorld().db, null),
    () => issueSurveyReport(twinWorld().db, { request: twin().request, via: 'send', audit, now: () => { throw new Error('นาฬิกาพัง'); }, prepareImages: fakePrepare() }),
    () => issueSurveyReport(boom, { request: twin().request, via: 'send', audit: async () => { throw new Error('audit ล่ม'); } }),
  ];
  for (const run of cases) {
    const result = await run();
    assert.equal(result.state, 'failed');
    assert.ok(SURVEY_REPORT_ISSUE_CODES.includes(result.code), result.code);
    assert.ok(result.reason && typeof result.reason === 'string');
    assert.deepEqual(Object.keys(result).sort(), ['code', 'docNo', 'reason', 'reasons', 'retry', 'reused', 'rev', 'state', 'warnings']);
  }
});

test('ล้มกลางทางโดยไม่มีใครจับ = internal ที่กดซ้ำได้ · เส้นส่งผลยังเขียน audit ของคำร้อง', async () => {
  const world = twinWorld();
  const { result, audit } = await issue(world, { now: () => { throw new Error('นาฬิกาพัง'); } });
  assert.equal(result.code, 'internal');
  assert.equal(result.retry, true);
  assert.equal(world.db.rpcLog.length, 0);
  assert.equal(audit.rows.length, 1);
  assert.ok(errors.some((line) => line.includes('นาฬิกาพัง')));
});

test('audit ของการล้มหลังส่งผล (§12): `update` · `dept_request` · ไม่มี before/after · สรุปขึ้นต้นตามสเปก · ปุ่มออกเอกสารไม่เขียน', async () => {
  const fail = () => fakePrepare({ '*': { times: 9, reason: SURVEY_IMAGE_FAILURE.DRIVE_ERROR } });

  const sent = twinWorld();
  const a = await issue(sent, { via: 'send', prepareImages: fail() });
  assert.equal(a.audit.rows.length, 1);
  const [row] = a.audit.rows;
  assert.equal(row.action, 'update');
  assert.equal(row.entityType, 'dept_request');
  assert.equal(row.entityId, sent.request().id);
  assert.equal(row.user, HEAD);
  assert.ok(!('before' in row) && !('after' in row));
  assert.equal(row.summary, `ออกเอกสารประเมินไม่สำเร็จหลังส่งผล RQ-AS-26090186 — ${a.result.reason}`);
  assert.ok(errors.some((line) => line.includes('RQ-AS-26090186') && line.includes('images_failed')));

  const pressed = twinWorld();
  const b = await issue(pressed, { via: 'issue_only', requestId: pressed.request().id, prepareImages: fail() });
  assert.equal(b.result.code, 'images_failed');
  assert.equal(b.audit.rows.length, 0);
});

test('🔴 ไม่รั่ว: ผลที่แปลงเป็น JSON · spread · ไล่คีย์ ไม่มี id ของแถว (ที่อยู่ไฟล์ PDF) · audit ทุกแถวไม่มีภาพนิ่ง/HTML', async () => {
  const world = twinWorld();
  const audit = fakeAudit();
  const { result } = await issue(world, { audit });
  await issue(world, { audit, via: 'issue_only', requestId: world.request().id });
  const failing = twinWorld();
  failing.tables.service_survey_zones[0].packageQty = null;
  await issue(failing, { audit });
  assert.equal(audit.rows.length, 2);

  const id = world.reports()[0].id;
  assert.ok(result.reportId === id);
  assert.ok(!JSON.stringify(result).includes(id));
  assert.ok(!('reportId' in { ...result }));
  assert.ok(!Object.keys(result).includes('reportId'));

  for (const row of audit.rows) {
    const keys = keysDeep({ before: row.before, after: row.after });
    for (const banned of ['snapshot', 'customerHtml', 'internalHtml', 'images', 'zones']) {
      assert.ok(!keys.has(banned), `audit พกคีย์ ${banned}`);
    }
    assert.ok(JSON.stringify(row).length < 2000, 'audit ต้องเป็นสรุป ไม่ใช่ก้อนข้อมูล');
  }
});

/* ══ 10. ซอร์ส ═══════════════════════════════════════════════════════════════════ */

test('ซอร์ส: ของหนักโหลดแบบ lazy ที่เดียว · ไม่มี chromium · ไม่เขียนตารางเอง (มีแต่ RPC) · ไม่มีชื่อชนิดเธรดของปุ่มออกเอกสาร', () => {
  const src = code(SOURCE);
  const imports = [...src.matchAll(/^import\s+(?:[^;]*?\sfrom\s+)?'([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), [
    '@/lib/audit', '@/lib/id', './packageSizes', './survey', './surveyReportDocument', './surveyReportInputs',
    './surveyReportLayout', './surveyReportNumber', './surveyReportRows', './surveyReportSnapshot', './surveyReportState',
    './surveyReportView', './surveySpotPhotos', 'server-only',
  ].sort());
  assert.deepEqual([...src.matchAll(/import\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]), ['./surveyReportImages']);
  for (const banned of ['sharp', 'htmlPdf', 'puppeteer', 'chromium', '@/lib/drive', 'surveyReportPaper']) {
    assert.ok(!imports.some((spec) => spec.includes(banned)), banned);
  }

  // ทั้งไฟล์ (รวมคอมเมนต์) ไม่เอ่ยชื่อชนิดเธรดของ route เอกสาร — เทสต์อ่านซอร์สของมติ 34 ค้นทั้งไฟล์
  assert.ok(!raw(SOURCE).includes('report_issued'));
  assert.ok(!src.includes('appendUpdate') && !src.includes('appendRequestEvent'));

  // เขียนผ่าน RPC ตัวเดียว — ไม่มี insert/update/upsert/delete · ไม่แตะที่เก็บไฟล์เอง
  assert.equal([...src.matchAll(/\.rpc\(\s*'([^']+)'/g)].map((m) => m[1]).join(','), 'issue_survey_report');
  for (const write of ['.insert(', '.update(', '.upsert(', '.delete(', '.storage']) assert.ok(!src.includes(write), write);

  // ทุก select เอ่ยชื่อตารางเป็นสตริง (ด่าน check:columns) และเป็นแถวเดียว (`maybeSingle`) — ไม่มีลิสต์ที่ต้องมี limit
  assert.deepEqual([...src.matchAll(/\.from\('([^']+)'\)/g)].map((m) => m[1]).sort(), ['dept_requests', 'dept_requests', 'service_survey_reports']);
  assert.equal([...src.matchAll(/\.maybeSingle\(\)/g)].length, 3);
  // รายชื่อคอลัมน์เป็นสตริงตรง ๆ ทุกคำสั่ง — ด่าน `check:columns` แกะ `.select(<ตัวแปร>)` ไม่ได้ · ไม่อ่านภาพนิ่ง/HTML กลับมา
  const selects = [...src.matchAll(/\.select\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(selects.sort(), ["'*'", "'id, \"answeredAt\"'", "'id, \"docNo\", rev, status, \"issuedAt\"'"].sort());
  // `p_answered_at` ต้องไม่ผ่าน Date
  assert.ok(/p_answered_at:\s*answeredAt,/.test(src));
  assert.ok(/const answeredAt = request\.answeredAt;/.test(src));
});
