// ── route ส่งผลประเมิน: ส่งผล = ออกเอกสารประเมินด้วย (สเปก PR-2 §2 S1–S9 · §15 "Send route") ─────────────
//
// ⭐ ล็อกหกเรื่อง:
//   ① สวิตช์ปิด = เส้นเดิมทุกก้าว — ไม่ตรวจรูป ไม่ตรวจเอกสาร ไม่อ่านแถวเอกสาร ไม่เรียก RPC ไม่โหลดของหนัก (`sharp`)
//   ② 🔴 สวิตช์เปิด: ทุกการตีกลับของเอกสารเกิด **ก่อนเขียนอะไร** (ฐานปลอมไม่เห็นคำสั่งเขียน · นัดยังเปิด)
//   ③ 🔴 ปัญหาของใบตีกลับ (รูปเปิดไม่ได้ · ไม่มีนัดที่ปิด) · ปัญหาของระบบไม่ตีกลับ (Drive ช้า/ล่ม · ตัวตรวจโยน · ข้อมูลบริษัท)
//   ④ ขั้นออกเลขอยู่หลังกระดิ่งและ audit · โยนก็ยังตอบ 200 · รูปที่ตรวจไว้ไม่ถูกดึงซ้ำ · `p_answered_at` เป็นสตริงเดิม
//   ⑤ ของที่มีผลแม้สวิตช์ปิด (§0): ฐานของส่วนต่างรอบก่อน + `meta.totals` บนแถวคำตอบ · `meta.closedBySend` บนเธรดของนัด
//   ⑥ ซอร์ส: `runtime` · `maxDuration = 300` · ของหนักเข้ามาทาง `await import()` เท่านั้น
//
// 🔴 เทสต์ชุดนี้ **เรียก handler POST ตัวจริง** กับของปลอมทั้งหมด — ฐาน · RPC · ที่เก็บ · Drive ไม่มีอะไรแตะของจริง
//    (dev DB = prod DB): ตัวอ่านผู้ใช้ · client · `lib/drive` ถูกแทนด้วย hook และ env ของ Supabase ถูกลบก่อน import
//    ⇒ ต่อให้ hook พลาด ก็สร้าง client จริงไม่ได้ · ตัวย่อรูป (`sharp`) เป็นของจริง เดินกับไบต์ที่เทสต์สร้างเอง
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire, register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { surveyTotals } from './survey.js';
import { surveyReportPrecheck } from './surveyReportInputs.js';
import {
  SURVEY_SEND_OLD_PAGE_ERROR, SURVEY_SEND_REPORT_FAILED, SURVEY_SEND_WARNINGS_CHANGED_ERROR, surveySendVisitStep,
} from './surveySendClose.js';
import { SURVEY_REPORT_NO_VISIT } from './surveyReportSnapshot.js';
import { TEST_COMPANY, surveyReportInputsFromFixture, syntheticSurveyFixture } from './surveyReportTestKit.mjs';
import { businessDate } from '../businessDate.js';

for (const key of [
  'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'VERCEL_ENV', 'SURVEY_REPORT_ISSUE_AT_SEND',
]) delete process.env[key];

const WEBAPP = process.cwd();
const ROUTE = 'src/app/api/service/surveys/[id]/send/route.js';
const fileUrl = (rel) => pathToFileURL(path.join(WEBAPP, rel)).href;
const dataUrl = (src) => `data:text/javascript,${encodeURIComponent(src)}`;

/* ── โมดูลปลอม/ตัวห่อ — อ่านของปลอมจาก `globalThis.__sendRouteTest` (hook ถูกเรียกก่อนตัวแปลง `@/` ของ test-loader) ──
   · authUser / supabaseAdmin / drive = ของปลอมล้วน (ไม่มีทางไปถึงของจริง)
   · ตัวเตรียมรูป · ตัวตรวจก่อนส่ง · ขั้นออกเลข = **ของจริง** ห่อไว้ให้เทสต์ (ก) รู้ว่า route โหลดโมดูลไหน (`__sendRouteLoaded`)
     (ข) จดลำดับการเรียกลง log เดียวกับฐานปลอม (ค) เสียบให้โยน/เปลี่ยนเพดานเวลาต่อไฟล์ได้
   ⚠️ ห่อเฉพาะชื่อที่ route import (`@/lib/service/…`) — ขั้นออกเลขเรียกเพื่อนด้วยทางสัมพัทธ์ ได้ของจริงตรง ๆ */
const wrap = (name, realUrl, body) => dataUrl(`
  import * as real from ${JSON.stringify(realUrl)};
  export * from ${JSON.stringify(realUrl)};
  (globalThis.__sendRouteLoaded ||= []).push(${JSON.stringify(name)});
  const T = () => (globalThis.__sendRouteTest ||= {});
  const mark = (extra) => { (T().events ||= []).push({ op: 'call', name: ${JSON.stringify(name)}, ...extra }); };
  ${body}
`);
const STUBS = {
  '@/lib/authUser': dataUrl('export async function getCurrentUser() { return globalThis.__sendRouteTest?.user ?? null; }'),
  '@/lib/supabaseAdmin': dataUrl(`export function getSupabaseAdmin() {
    const s = globalThis.__sendRouteTest?.supabase;
    if (!s) throw new Error('fake supabase missing');
    return s;
  }`),
  '@/lib/drive': dataUrl(`export async function getFileStream(id, opts) {
    const drive = globalThis.__sendRouteTest?.drive;
    if (!drive) throw new Error('fake drive missing');
    return drive(id, opts);
  }`),
  '@/lib/service/surveyReportImages': wrap('images', fileUrl('src/lib/service/surveyReportImages.js'), `
    export async function prepareSurveyReportImages(supabase, files, opts) {
      mark({ files: files.map((f) => f.attId), deadline: opts?.deadline });
      return real.prepareSurveyReportImages(supabase, files, { ...opts, ...(T().imageOptions || {}) });
    }`),
  '@/lib/service/surveyReportInputs': wrap('inputs', fileUrl('src/lib/service/surveyReportInputs.js'), `
    export async function surveyReportPrecheck(supabase, opts) {
      mark({});
      if (T().precheck) return T().precheck(supabase, opts, real.surveyReportPrecheck);
      return real.surveyReportPrecheck(supabase, opts);
    }`),
  '@/lib/service/surveyReportIssue': wrap('issue', fileUrl('src/lib/service/surveyReportIssue.js'), `
    export async function issueSurveyReport(supabase, opts) {
      mark({ opts });
      if (T().issue) return T().issue(supabase, opts, real.issueSurveyReport);
      return real.issueSurveyReport(supabase, opts);
    }`),
};
register(dataUrl(`
  const STUBS = ${JSON.stringify(STUBS)};
  export async function resolve(s, c, n) {
    if (Object.hasOwn(STUBS, s)) return { url: STUBS[s], shortCircuit: true };
    return n(s === 'next/headers' ? 'next/headers.js' : s, c);
  }
`));
const { POST } = await import('../../app/api/service/surveys/[id]/send/route.js');

const heavyLoaded = () => Object.keys(createRequire(import.meta.url).cache)
  .filter((file) => /node_modules\/(sharp|@img|googleapis|gaxios|puppeteer-core|@sparticuz)\//.test(file)).length;
const routeLoaded = () => [...(globalThis.__sendRouteLoaded || [])];

/* ── ฐานข้อมูลปลอม — กรอง/เรียง/ตัดจริง · เขียนจริงลงตารางในหน่วยความจำ · จดทุกคำสั่งตามลำดับที่ทำ (`events`) ──────
   + RPC `issue_survey_report` ที่ทำตาม 0401 ④ (ล็อกแถวคำร้อง → ตรวจคำตอบเดิม → ฉบับที่ใช้อยู่ → เลข → insert)
   + ที่เก็บ (`storage.from().upload` — "มีอยู่แล้ว" ตอบ error แบบของจริง) + `auth.admin.getUserById`
   `fail[ตาราง]` = `{ op, times, throws, when(q) }` — ล้มตามจำนวนครั้ง (ไม่ระบุ op = ทุกคำสั่งของตารางนั้น) */
const WRITE_OPS = ['insert', 'update', 'upsert', 'delete', 'rpc'];
function fakeDb(tables, { fail = {}, users = {} } = {}) {
  const events = [];
  const objects = new Set();
  const sameInstant = (a, b) => Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);
  const raise = (message, extra = {}) => ({ data: null, error: { code: 'P0001', message, details: null, ...extra } });
  const failing = (q) => {
    const rule = fail[q.table];
    if (!rule || !(rule.times > 0)) return null;
    if (rule.op && rule.op !== q.op) return null;
    if (rule.when && !rule.when(q)) return null;
    rule.times -= 1;
    return rule;
  };

  function issueInDb(a) {
    const snap = a.p_row?.snapshot;
    if (!a.p_report_id) return raise('survey_report_id_required');
    if (!/^[0-9]{2}(0[1-9]|1[0-2])$/.test(String(a.p_yymm ?? ''))) return raise(`survey_report_month_invalid: ${a.p_yymm}`);
    if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return raise('survey_report_snapshot_required');
    const req = (tables.dept_requests || []).find((r) => r.id === a.p_request_id);
    if (!req || req.kind !== 'site_survey' || req.cancelledAt) return raise(`survey_request_invalid: ${a.p_request_id}`);
    if (!req.answeredAt || !sameInstant(req.answeredAt, a.p_answered_at)) return raise(`survey_answer_changed: ${a.p_request_id}`);
    const rows = (tables.service_survey_reports ||= []);
    const mine = rows.filter((r) => r.requestId === a.p_request_id);
    if (mine.some((r) => r.status === 'current')) return raise(`survey_report_already_current: ${a.p_request_id}`);
    const latest = [...mine].sort((x, y) => y.rev - x.rev)[0];
    let base = latest?.baseNo ?? null;
    const rev = latest ? latest.rev + 1 : 0;
    if (!base) {
      const counters = (tables.entity_number_counters ||= []);
      const year = String(a.p_yymm).slice(0, 2);
      let counter = counters.find((c) => c.scope === 'SU' && c.month === year);
      if (!counter) { counter = { scope: 'SU', month: year, lastNo: 0 }; counters.push(counter); }
      counter.lastNo += 1;
      base = `SU-${a.p_yymm}${String(counter.lastNo).padStart(4, '0')}`;
    }
    rows.push({
      id: a.p_report_id, requestId: a.p_request_id, baseNo: base, rev, docNo: `${base}-${rev}`, status: 'current',
      supersededAt: null, supersededReason: null,
      snapshot: structuredClone(snap), images: structuredClone(a.p_row.images ?? []),
      customerHtml: null, internalHtml: null, rendererVersion: null, frozenAt: null,
      customerPdfPath: null, internalPdfPath: null,
      approvedById: req.answeredById ?? null, approvedByName: req.answeredByName ?? null, approvedAt: req.answeredAt,
      issuedById: a.p_row.issuedById ?? null, issuedByName: a.p_row.issuedByName ?? null,
      issuedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    return { data: `${base}-${rev}`, error: null };
  }

  const db = {
    events,
    tables,
    objects,
    async rpc(name, args) {
      events.push({ op: 'rpc', name, args });
      if (name !== 'issue_survey_report') return raise(`function ${name} does not exist`, { code: 'PGRST202' });
      return issueInDb(args);
    },
    storage: {
      from(bucket) {
        return {
          async upload(objectPath, data, options) {
            events.push({ op: 'upload', bucket, path: objectPath, bytes: data?.length ?? null, options });
            const key = `${bucket}/${objectPath}`;
            if (objects.has(key)) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
            objects.add(key);
            return { data: { path: objectPath }, error: null };
          },
        };
      },
    },
    auth: {
      admin: {
        async getUserById(id) {
          const user = users[id];
          if (!user) return { data: { user: null }, error: { status: 404, message: 'User not found' } };
          return { data: { user }, error: null };
        },
      },
    },
    from(table) {
      const q = { op: 'select', table, select: null, filters: [], orders: [], limit: null, values: null };
      const matches = (row) => q.filters.every(([op, col, val]) => {
        if (op === 'eq') return row[col] === val;
        if (op === 'neq') return row[col] !== val;
        if (op === 'in') return val.includes(row[col]);
        if (op === 'is') return (row[col] ?? null) === val;
        if (op === 'not-is') return (row[col] ?? null) !== val;
        if (op === 'not-in') return !String(val).replace(/[()]/g, '').split(',').includes(String(row[col]));
        return true;
      });
      let done = null;
      const run = () => {
        if (done) return done;
        events.push(q);
        const rule = failing(q);
        if (rule?.throws) throw new Error(`${table} ล่ม`);
        if (rule) { done = { data: null, error: { message: `${table} ล่ม` } }; return done; }
        if (q.op === 'insert' || q.op === 'upsert') {
          const rows = (Array.isArray(q.values) ? q.values : [q.values]).map((row) => structuredClone(row));
          tables[table] = [...(tables[table] || []), ...rows];
          done = { data: rows.map((row) => structuredClone(row)), error: null };
          return done;
        }
        let rows = (tables[table] || []).filter(matches);
        if (q.op === 'update') {
          rows.forEach((row) => Object.assign(row, structuredClone(q.values)));
          done = { data: rows.map((row) => structuredClone(row)), error: null };
          return done;
        }
        if (q.op === 'delete') {
          tables[table] = (tables[table] || []).filter((row) => !rows.includes(row));
          done = { data: rows, error: null };
          return done;
        }
        for (const [col, asc] of [...q.orders].reverse()) {
          rows = [...rows].sort((a, b) => {
            const x = a[col]; const y = b[col];
            if (x === y) return 0;
            return (x < y ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        if (q.limit != null) rows = rows.slice(0, q.limit);
        done = { data: rows.map((row) => structuredClone(row)), error: null };
        return done;
      };
      const one = (strict) => Promise.resolve().then(run).then(({ data, error }) => {
        if (error) return { data: null, error };
        if (strict && data.length !== 1) return { data: null, error: { message: 'no rows' } };
        return { data: data[0] || null, error: null };
      });
      const known = {
        select(cols) { if (q.op === 'select') q.select = cols; return chain; },
        insert(values) { q.op = 'insert'; q.values = values; return chain; },
        upsert(values) { q.op = 'upsert'; q.values = values; return chain; },
        update(values) { q.op = 'update'; q.values = values; return chain; },
        delete() { q.op = 'delete'; return chain; },
        eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
        neq(col, val) { q.filters.push(['neq', col, val]); return chain; },
        in(col, val) { q.filters.push(['in', col, val]); return chain; },
        is(col, val) { q.filters.push(['is', col, val]); return chain; },
        not(col, op, val) { q.filters.push([`not-${op}`, col, val]); return chain; },
        order(col, opts = {}) { q.orders.push([col, opts.ascending !== false]); return chain; },
        limit(n) { q.limit = n; return chain; },
        maybeSingle() { return one(false); },
        single() { return one(true); },
        then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
      };
      // ตัวกรองที่ของปลอมไม่รู้จัก = ปล่อยผ่าน (ไม่กรอง) — เส้นของกระดิ่งใช้ตัวกรองที่เทสต์ชุดนี้ไม่ได้ตัดสิน
      const chain = new Proxy(known, { get: (target, prop) => (prop in target ? target[prop] : () => chain) });
      return chain;
    },
  };
  return db;
}

/* ── โลกปลอมจากแฝดสังเคราะห์ของ PR-1 — คำร้อง **ยังไม่ส่งผล** · สองพื้นที่ · 8 รูปที่เอกสารพิมพ์ ───────────────── */
const HEAD = { id: 'U-head-now', name: 'Head Presser', role: 'ts_manager', department: 'TS', team: 'TS', teams: ['TS'] };
const REQUEST_ID = 'DR-synthetic-0001';
const VISIT_ID = 'SVV-1';
/* คำเตือนที่แฝดสังเคราะห์มีติดตัว — หมายเหตุพื้นที่ 1 เอ่ยถึง "เครื่อง" · พื้นที่ 2 เอ่ยถึง "จุดติดตั้ง" */
const TWIN_WARNINGS = 2;
/* รูปที่เอกสารพิมพ์: พื้นที่ 1 = กว้าง 2 + จุด 1 + ผัง 1 · พื้นที่ 2 = กว้าง 1 + จุด 2 + ผัง 1 */
const TWIN_FILES = 8;

function makeWorld({ visit = 'done', thread = [], form = true, options = {} } = {}) {
  const source = surveyReportInputsFromFixture(syntheticSurveyFixture());
  const request = {
    ...source.request,
    dept: 'TS', status: 'acknowledged', requestedById: 'U-sale',
    answeredAt: null, answeredById: null, answeredByName: null,
    siteId: 'SITE-1', customerId: 'CUS-1', dealId: 'DEAL-1',
  };
  const visitRow = {
    id: VISIT_ID, requestId: request.id, kind: 'survey', createdAt: '2026-09-24T02:00:00.000+00:00', unableReason: null,
    ...source.visit, assistantIds: [],
    ...(visit === 'in_progress' ? { status: 'in_progress', actualEndTime: null } : {}),
    ...(visit === 'draft' ? { status: 'draft', actualDate: null, actualStartTime: null, actualEndTime: null } : {}),
  };
  const tables = {
    dept_requests: [request],
    service_survey_reports: [],
    entity_number_counters: [],
    service_survey_zones: source.zones.map(({ zoneCode: _zoneCode, ...zone }) => ({ ...zone, requestId: request.id })),
    attachments: source.zones.flatMap((z) => (source.filesByZone[z.id] || [])
      .map((f) => ({ ...f, entityType: 'service_survey_zone', entityId: z.id, driveFileId: `drv-${f.id}` }))),
    service_zones: source.zoneRegistry.map((z) => ({ ...z })),
    service_sites: [{ id: 'SITE-1', ...source.site }],
    customers: [{ id: 'CUS-1', name: source.customer.name, nameEn: null, arCode: source.customer.arCode }],
    sales_deals: [{ id: 'DEAL-1', code: source.deal.code }],
    service_visits: visit === 'none' ? [] : [visitRow],
    entity_updates: thread.map((row, i) => ({ id: `EUP-old-${i}`, entityType: 'dept_request', entityId: request.id, ...row })),
    service_package_sizes: source.sizes.map((s) => ({ ...s })),
    organization_setting_versions: [{
      organizationId: 'primary', status: 'published', legalNameTh: TEST_COMPANY.name, legalNameEn: 'Scent and Sense',
      taxId: TEST_COMPANY.taxId, branchCode: '00000', registeredAddressTh: TEST_COMPANY.address, registeredAddressEn: null,
      phone: TEST_COMPANY.tel, email: null, lineId: TEST_COMPANY.line, website: TEST_COMPANY.website,
    }],
    // `form: false` = ยังไม่มีมาตรฐานเอกสารที่เผยแพร่ (เหตุของระบบ — แก้ได้โดยไม่ต้องดึงผลกลับ)
    document_standard_versions: form ? [{
      documentKey: 'siteSurvey', status: 'published', versionNumber: 1, formCode: 'FM-TS-01', revision: '00',
      effectiveDate: '2026-09-29', titleEn: 'SITE SURVEY REPORT',
    }] : [],
    audit_logs: [],
    notifications: [],
  };
  const users = {
    'U-lead': { id: 'U-lead', email: 'lead@example.test', app_metadata: { role: 'ts_senior' }, user_metadata: { name: 'Lead Assessor' } },
  };
  const db = fakeDb(tables, { users, ...options });

  /* Drive ปลอม — คืน JPEG จริง (สีต่างกันรายไฟล์ ⇒ sha ต่างกัน) · `rules[driveFileId]`:
     `{ bytes }` ไบต์ที่กำหนดเอง (ไฟล์เสีย) · `{ status }` Drive ตอบ error · `{ stall: n }` ค้าง n ครั้งแรก (ไม่ตอบจนหมดเวลาต่อไฟล์) */
  const fetched = [];
  const rules = {};
  const drive = async (driveFileId) => {
    fetched.push(driveFileId);
    const rule = rules[driveFileId] || rules['*'];
    if (rule?.stall > 0) { rule.stall -= 1; return new Promise(() => {}); }
    if (rule?.status) throw Object.assign(new Error(`Drive ${rule.status}`), { status: rule.status });
    if (rule?.bytes) return rule.bytes;
    return jpegFor(driveFileId);
  };
  return {
    db, tables, source, drive, fetched, rules,
    request: () => tables.dept_requests[0],
    visit: () => tables.service_visits[0] || null,
    reports: () => tables.service_survey_reports,
    thread: (kind) => tables.entity_updates.filter((r) => r.entityType === 'dept_request' && (!kind || r.kind === kind)),
    writes: () => db.events.filter((e) => WRITE_OPS.includes(e.op)),
    calls: (name) => db.events.filter((e) => e.op === 'call' && e.name === name),
  };
}

/* JPEG ของ Drive ปลอม — สร้างด้วย sharp ตัวจริง **เมื่อถูกขอเท่านั้น** (เทสต์สวิตช์ปิดต้องเห็นว่า sharp ยังไม่ถูกโหลด) */
const jpegs = new Map();
async function jpegFor(driveFileId) {
  if (!jpegs.has(driveFileId)) {
    const sharp = (await import('sharp')).default;
    const seed = [...driveFileId].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 0xffffff, 7);
    jpegs.set(driveFileId, await sharp({
      create: { width: 80, height: 60, channels: 3, background: { r: seed & 255, g: (seed >> 8) & 255, b: (seed >> 16) & 255 } },
    }).jpeg().toBuffer());
  }
  return jpegs.get(driveFileId);
}

const flagOn = () => { process.env.VERCEL_ENV = 'production'; process.env.SURVEY_REPORT_ISSUE_AT_SEND = 'on'; };
const flagOff = () => { delete process.env.VERCEL_ENV; delete process.env.SURVEY_REPORT_ISSUE_AT_SEND; };

/** คำเตือนที่จอจะได้จาก GET แล้วส่งกลับมาเป็น `seenWarnings` — คิดด้วยตัวตรวจตัวจริงบนโลกเดียวกัน (อ่านอย่างเดียว) */
async function seenWarningsOf(world) {
  const zones = structuredClone(world.tables.service_survey_zones);
  const filesByZone = Object.fromEntries(zones.map((z) => [
    z.id, structuredClone(world.tables.attachments.filter((f) => f.entityId === z.id)),
  ]));
  const nowIso = new Date().toISOString();
  const open = world.tables.service_visits.find((v) => ['draft', 'scheduled', 'in_progress'].includes(v.status)) || null;
  const check = await surveyReportPrecheck(world.db, {
    request: structuredClone(world.request()), user: HEAD, zones, filesByZone, open: open && structuredClone(open),
    today: businessDate(nowIso), nowIso,
  });
  world.db.events.length = 0;
  return check.warnings;
}

async function send(world, { user = HEAD, body = {}, seams = {} } = {}) {
  globalThis.__sendRouteTest = { user, supabase: world.db, drive: world.drive, events: world.db.events, ...seams };
  const req = new Request(`http://localhost/api/service/surveys/${REQUEST_ID}/send`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const res = await POST(req, { params: Promise.resolve({ id: REQUEST_ID }) });
  return { status: res.status, json: await res.json() };
}

/** ส่งผลแบบเปิดสวิตช์ด้วยจอรุ่นใหม่ (ส่งคำเตือนที่เห็นกลับมาครบ · ระบุนัดที่จะปิดเมื่อมี) */
async function sendOn(world, { body = {}, seams = {}, ...rest } = {}) {
  const seenWarnings = body.seenWarnings ?? await seenWarningsOf(world);
  flagOn();
  return send(world, {
    ...rest,
    body: { seenWarnings, ...body },
    seams: { imageOptions: { log() {} }, ...seams },
  });
}

/* จำลองสิ่งที่ route ดึงผลกลับ + ทริกเกอร์ 0401 ⑤ ทำ: ล้างคำตอบ · เอกสารที่ใช้อยู่ถูกแทนที่ · แถว `recall` พกยอด ณ ตอนนั้น */
function recall(world, at) {
  Object.assign(world.request(), { answeredAt: null, answeredById: null, answeredByName: null, closedAt: null, status: 'acknowledged' });
  world.reports().filter((r) => r.status === 'current').forEach((r) => Object.assign(r, { status: 'superseded', supersededAt: at }));
  world.tables.entity_updates.push({
    id: `EUP-recall-${at}`, entityType: 'dept_request', entityId: REQUEST_ID, kind: 'recall', body: 'TS ดึงผลประเมินกลับมาแก้',
    meta: { totals: surveyTotals(world.tables.service_survey_zones) }, createdAt: at,
  });
}
/* "ยังไม่จบ" ของ PATCH คำร้อง — ล้างคำตอบเหมือนกัน แต่แถว `reopen` **ไม่พกยอด** (`askActionUpdate`) */
function reopen(world, at) {
  Object.assign(world.request(), { answeredAt: null, answeredById: null, answeredByName: null, closedAt: null, status: 'acknowledged' });
  world.tables.entity_updates.push({
    id: `EUP-reopen-${at}`, entityType: 'dept_request', entityId: REQUEST_ID, kind: 'reopen', body: 'ยังไม่จบ — เปิดเรื่องกลับมา',
    meta: { dept: 'TS' }, createdAt: at,
  });
}
/* หัวหน้าเคาะแพ็คเกจใหม่ระหว่างรอบ (ต่างจากที่ระบบเสนอ ⇒ ด่านส่งผลบังคับเหตุผล) — ตัวเลขที่ฝ่ายขายจะได้เปลี่ยน */
const setPackageQty = (world, zoneIndex, qty) => {
  Object.assign(world.tables.service_survey_zones[zoneIndex], { packageQty: qty, packageNote: 'ลูกค้าขอเพิ่มหลังเดินดูพื้นที่' });
};
/* เลื่อนเวลาของแถวเธรดที่เพิ่งเขียน — สองการส่งในมิลลิวินาทีเดียวกันต้องเรียงได้เหมือนของจริงที่ห่างกันเป็นนาที */
const stamp = (world, kind, at) => { world.thread(kind).at(-1).createdAt = at; };

function keysDeep(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.add(k); keysDeep(v, out); }
  }
  return out;
}

const logged = { error: [], warn: [] };
test.beforeEach((t) => {
  logged.error.length = 0;
  logged.warn.length = 0;
  t.mock.method(console, 'error', (...args) => { logged.error.push(args.map(String).join(' ')); });
  t.mock.method(console, 'warn', (...args) => { logged.warn.push(args.map(String).join(' ')); });
  t.mock.method(console, 'info', () => {});
});
test.afterEach(() => { flagOff(); delete globalThis.__sendRouteTest; });

/* ══ 1. สวิตช์ปิด — เส้นเดิมทุกก้าว (ต้องเป็นเทสต์แรก: ยืนยันว่ายังไม่มีใครโหลด sharp) ═════════════════════════ */

test('🔴 สวิตช์ปิด: ไม่ตรวจรูป ไม่ตรวจเอกสาร ไม่อ่านแถวเอกสาร ไม่เรียก RPC · report = off · ยังไม่มีใครโหลด sharp', async () => {
  assert.equal(heavyLoaded(), 0, 'เงื่อนไขตั้งต้น: import route แล้วต้องยังไม่มีของหนักถูกโหลด');
  assert.deepEqual(routeLoaded(), [], 'import route เฉย ๆ ต้องไม่โหลดตัวเตรียมรูป/ตัวตรวจ/ขั้นออกเลข');

  // จอรุ่นเก่า — ไม่ส่ง seenWarnings · ไม่มีตัวแปรสภาพแวดล้อมสักตัว
  const plain = makeWorld();
  const first = await send(plain, { body: {} });
  assert.equal(first.status, 200, first.json.error);
  assert.deepEqual(first.json.report, { state: 'off' });
  assert.deepEqual(Object.keys(first.json).sort(), ['closedVisit', 'report', 'request', 'totals']);
  assert.equal(first.json.closedVisit, null);
  assert.ok(first.json.request.answeredAt, 'ใบถูกตอบตามปกติ');

  // สวิตช์เปิดแต่เครื่องไม่ใช่ production (preview/เครื่องนักพัฒนา) = ปิด · production แต่ไม่ได้เปิดสวิตช์ = ปิด
  process.env.SURVEY_REPORT_ISSUE_AT_SEND = 'on';
  process.env.VERCEL_ENV = 'preview';
  const preview = makeWorld();
  assert.deepEqual((await send(preview, { body: {} })).json.report, { state: 'off' });
  delete process.env.SURVEY_REPORT_ISSUE_AT_SEND;
  process.env.VERCEL_ENV = 'production';
  const unset = makeWorld();
  assert.deepEqual((await send(unset, { body: {} })).json.report, { state: 'off' });

  for (const world of [plain, preview, unset]) {
    assert.equal(world.db.events.filter((e) => e.table === 'service_survey_reports').length, 0, 'ไม่อ่านแถวเอกสาร');
    assert.equal(world.db.events.filter((e) => e.op === 'rpc').length, 0, 'ไม่เรียก RPC');
    assert.equal(world.db.events.filter((e) => e.op === 'upload').length, 0, 'ไม่อัปอะไร');
    assert.equal(world.db.events.filter((e) => e.op === 'call').length, 0, 'ไม่เรียกรอบตรวจรูป/ตัวตรวจ/ขั้นออกเลข');
    assert.deepEqual(world.fetched, [], 'ไม่ดึงรูปจาก Drive');
    assert.equal(world.thread('answer').length, 1);
    assert.equal(world.request().status, 'answered');
  }
  assert.deepEqual(routeLoaded(), [], 'กิ่งที่ปิดสวิตช์ต้องไม่ import โมดูลของเอกสารเลย');
  assert.equal(heavyLoaded(), 0, 'sharp · googleapis · chromium ต้องไม่ถูกโหลด');
});

/* ══ 2. ของที่มีผลแม้สวิตช์ปิด (§0) ═══════════════════════════════════════════════════ */

test('แถวคำตอบพก meta.totals = ยอดที่ส่งออกไป (สวิตช์ปิดก็เขียน) · ส่งรอบแรกไม่มีส่วนต่าง', async () => {
  const world = makeWorld();
  const { status, json } = await send(world);
  assert.equal(status, 200, json.error);
  const [answer] = world.thread('answer');
  const totals = surveyTotals(world.tables.service_survey_zones);
  assert.deepEqual(answer.meta, { dept: 'TS', totals });
  assert.deepEqual(json.totals, totals);
  assert.equal(totals.zones, 2);
  assert.doesNotMatch(answer.body, /แก้จากรอบก่อน/, 'ส่งรอบแรก = ไม่มีอะไรให้เทียบ');
  // ฐานของส่วนต่างอ่านสองชนิดในคำสั่งเดียว มีเพดาน
  const read = world.db.events.find((e) => e.table === 'entity_updates' && e.op === 'select'
    && e.filters.some(([op, col]) => op === 'in' && col === 'kind'));
  assert.deepEqual(read.filters.find(([op]) => op === 'in')[2], ['answer', 'recall']);
  assert.equal(read.limit, 20);
  assert.deepEqual(read.orders, [['createdAt', false]]);
});

test('🔴 ฐานของส่วนต่าง: ดึงกลับ → ส่ง (ไม่มีเอกสาร) → ดึงกลับ → ส่ง เทียบกับยอดของการส่งครั้งที่สอง', async () => {
  const world = makeWorld();
  assert.equal((await send(world)).status, 200); // ส่งครั้งที่ 1: 2 แพ็คเกจ
  stamp(world, 'answer', '2026-10-01T01:00:00.000Z');
  recall(world, '2026-10-01T02:00:00.000Z');

  setPackageQty(world, 0, 2); // 3 แพ็คเกจ
  assert.equal((await send(world)).status, 200); // ส่งครั้งที่ 2 (สวิตช์ปิด = ไม่มีเอกสาร)
  stamp(world, 'answer', '2026-10-01T03:00:00.000Z');
  assert.match(world.thread('answer').at(-1).body, /แก้จากรอบก่อน: แพ็คเกจ 2 → 3/);
  recall(world, '2026-10-01T04:00:00.000Z');

  setPackageQty(world, 0, 4); // 5 แพ็คเกจ
  assert.equal((await send(world)).status, 200); // ส่งครั้งที่ 3
  const last = world.thread('answer').at(-1);
  assert.match(last.body, /แก้จากรอบก่อน: แพ็คเกจ 3 → 5/, 'ต้องเทียบกับรอบที่สอง (3) ไม่ใช่รอบแรก (2)');
  assert.equal(last.meta.totals.packageQty, 5);
  assert.equal(world.reports().length, 0);
});

test('🔴 ฐานของส่วนต่าง: ส่ง → "ยังไม่จบ" (ไม่มีแถวดึงกลับ) → ส่ง เทียบกับยอดของการส่งครั้งแรก', async () => {
  const world = makeWorld();
  assert.equal((await send(world)).status, 200);
  stamp(world, 'answer', '2026-10-01T01:00:00.000Z');
  reopen(world, '2026-10-01T02:00:00.000Z');
  assert.equal(world.thread('recall').length, 0);

  setPackageQty(world, 1, 3); // 2 → 4 แพ็คเกจ
  const { status, json } = await send(world);
  assert.equal(status, 200, json.error);
  assert.match(world.thread('answer').at(-1).body, /แก้จากรอบก่อน: แพ็คเกจ 2 → 4/);
});

test('ฐานของส่วนต่าง: แถวคำตอบรุ่นก่อน (ไม่มียอด) ถูกข้ามไปหาแถวดึงกลับ · ไม่มีแถวไหนมียอด = ไม่มีส่วนต่าง', async () => {
  const old = { zones: 2, areaSqm: 173.31, packageQty: 7, cutZones: 0, addedZones: 1, volumeCbm: 0, spotsTotal: 3, spotsSelected: 3 };
  const withRecall = makeWorld({
    thread: [
      { kind: 'recall', body: 'ดึงกลับ', meta: { totals: old }, createdAt: '2026-09-28T02:00:00.000Z' },
      { kind: 'answer', body: 'TS ตอบเรื่องนี้แล้ว', meta: { dept: 'TS' }, createdAt: '2026-09-29T02:00:00.000Z' },
      { kind: 'reopen', body: 'ยังไม่จบ', meta: { dept: 'TS' }, createdAt: '2026-09-30T02:00:00.000Z' },
    ],
  });
  assert.equal((await send(withRecall)).status, 200);
  assert.match(withRecall.thread('answer').at(-1).body, /แก้จากรอบก่อน: แพ็คเกจ 7 → 2/);

  const none = makeWorld({
    thread: [{ kind: 'answer', body: 'TS ตอบเรื่องนี้แล้ว', meta: { dept: 'TS' }, createdAt: '2026-09-29T02:00:00.000Z' }],
  });
  assert.equal((await send(none)).status, 200);
  assert.doesNotMatch(none.thread('answer').at(-1).body, /แก้จากรอบก่อน/);
});

test('อ่านยอดของรอบก่อนไม่สำเร็จ ({ error } หรือโยน) = ส่งผลได้ ไม่มีส่วนต่าง และลง log (supabase ไม่ throw)', async () => {
  for (const throws of [false, true]) {
    const baseline = { kind: 'recall', body: 'ดึงกลับ', meta: { totals: { zones: 9, areaSqm: 1, packageQty: 9 } }, createdAt: '2026-09-28T02:00:00.000Z' };
    const world = makeWorld({
      thread: [baseline],
      options: { fail: { entity_updates: { op: 'select', times: 1, throws, when: (q) => q.filters.some(([op, col]) => op === 'in' && col === 'kind') } } },
    });
    const { status, json } = await send(world);
    assert.equal(status, 200, json.error);
    assert.doesNotMatch(world.thread('answer').at(-1).body, /แก้จากรอบก่อน/);
    assert.ok(logged.error.some((line) => /อ่านยอดของรอบก่อนไม่สำเร็จ/.test(line)), 'ต้องมีบรรทัด log');
    logged.error.length = 0;
  }
});

test('ส่งผลที่ปิดนัด: บรรทัดเธรดของนัดพก meta.closedBySend (สวิตช์ปิดก็เขียน) · ข้อความยังขึ้นต้นเหมือนเดิม', async () => {
  const world = makeWorld({ visit: 'in_progress' });
  const { status, json } = await send(world, { body: { closeVisitId: VISIT_ID } });
  assert.equal(status, 200, json.error);
  assert.equal(json.closedVisit.id, VISIT_ID);
  assert.equal(world.visit().status, 'done');
  const [line] = world.tables.entity_updates.filter((r) => r.entityType === 'service_visit');
  assert.equal(line.kind, 'done');
  assert.deepEqual(line.meta, { closedBySend: true });
  assert.match(line.body, /^ปิดพร้อมส่งผล โดย Head Presser/);
});

/* ══ 3. สวิตช์เปิด — เดินครบ ═════════════════════════════════════════════════════════ */

test('⭐ สวิตช์เปิด: ส่งผลแล้วออกเอกสาร — เลขใน report · หลังกระดิ่งและ audit · รูปไม่ถูกดึงซ้ำ · คำตอบเป็นสตริงเดิม', async () => {
  const world = makeWorld({ visit: 'in_progress' });
  const seenWarnings = await seenWarningsOf(world);
  assert.equal(seenWarnings.length, TWIN_WARNINGS);
  const { status, json } = await sendOn(world, { body: { seenWarnings, closeVisitId: VISIT_ID } });
  assert.equal(status, 200, json.error);

  // S9 — รูปร่างของ report (คีย์ครบ ไม่มีคีย์อื่น) และเลขตรงกับแถวในฐาน
  const [row] = world.reports();
  assert.equal(world.reports().length, 1);
  assert.deepEqual(json.report, { state: 'issued', docNo: row.docNo, rev: 0, reused: false, warnings: json.report.warnings });
  assert.match(row.docNo, /^SU-\d{4}0001-0$/);
  for (const line of seenWarnings) assert.ok(json.report.warnings.includes(line), 'คำเตือนที่หัวหน้าเห็นติดมากับผล');
  assert.equal(json.closedVisit.id, VISIT_ID);

  // RPC — `p_answered_at` = สตริงที่การเขียนคำตอบคืนมา ไม่ผ่าน Date · ภาพนิ่งเป็น object · ผู้ออก = คนกด
  const [rpc] = world.db.events.filter((e) => e.op === 'rpc');
  assert.equal(rpc.name, 'issue_survey_report');
  assert.equal(rpc.args.p_request_id, REQUEST_ID);
  assert.equal(rpc.args.p_answered_at, world.request().answeredAt);
  assert.equal(rpc.args.p_answered_at, json.request.answeredAt);
  assert.equal(typeof rpc.args.p_row.snapshot, 'object');
  assert.equal(Array.isArray(rpc.args.p_row.snapshot), false);
  assert.deepEqual(Object.keys(rpc.args.p_row).sort(), ['images', 'issuedById', 'issuedByName', 'snapshot']);
  assert.equal(rpc.args.p_row.issuedById, 'U-head-now');
  assert.equal(row.approvedByName, 'Head Presser');
  assert.equal(row.snapshot.visit.closedBySend, true, 'นัดที่การส่งผลนี้ปิด = เอกสารรู้ว่าปิดพร้อมส่งผล');

  // ลำดับ: รอบตรวจรูป → เขียน (ปิดนัด → ตอบใบ) → แถวคำตอบ (กระดิ่ง) → audit ของการส่งผล → ขั้นออกเลข → RPC
  const at = (find) => world.db.events.findIndex(find);
  const preflight = at((e) => e.op === 'call' && e.name === 'images');
  const precheck = at((e) => e.op === 'call' && e.name === 'inputs');
  const firstWrite = at((e) => WRITE_OPS.includes(e.op));
  const answered = at((e) => e.op === 'update' && e.table === 'dept_requests');
  const answerLine = at((e) => e.op === 'insert' && e.table === 'entity_updates' && e.values.kind === 'answer');
  const sendAudit = at((e) => e.op === 'insert' && e.table === 'audit_logs' && e.values.entityType === 'dept_request');
  const issueCall = at((e) => e.op === 'call' && e.name === 'issue');
  const rpcAt = at((e) => e.op === 'rpc');
  assert.ok(preflight >= 0 && preflight < precheck && precheck < firstWrite, 'รอบตรวจรูปและตัวตรวจมาก่อนคำสั่งเขียนแรก');
  assert.ok(firstWrite < answered && answered < answerLine && answerLine < sendAudit, 'ปิดนัด → ตอบใบ → กระดิ่ง → audit');
  assert.ok(sendAudit < issueCall && issueCall < rpcAt, 'ขั้นออกเลขอยู่หลังกระดิ่งและ audit');

  // สิ่งที่ route ส่งให้ขั้นออกเลข
  const [{ opts }] = world.calls('issue');
  assert.equal(opts.via, 'send');
  assert.equal(opts.request.answeredAt, world.request().answeredAt);
  assert.equal(opts.closedVisit.id, VISIT_ID);
  assert.equal(opts.user.id, 'U-head-now');
  assert.equal(opts.deadline, 20_000);
  assert.ok(opts.req instanceof Request);
  assert.equal(Object.keys(opts.prepared.imageByAttId).length, TWIN_FILES);
  assert.deepEqual(opts.prepared.failed, []);
  assert.equal(world.calls('images')[0].deadline, 60_000, 'งบของรอบตรวจรูป 60 วินาที');

  // 🔴 รูปที่ตรวจไว้ถูกใช้ซ้ำ — ทุกไฟล์ถูกดึงจาก Drive ครั้งเดียว และอัปขึ้น bucket ครั้งเดียว ที่ `img/<sha>.jpg`
  assert.equal(world.fetched.length, TWIN_FILES);
  assert.equal(new Set(world.fetched).size, TWIN_FILES, 'ไม่มีไฟล์ไหนถูกดึงสองครั้ง');
  const uploads = world.db.events.filter((e) => e.op === 'upload');
  assert.equal(uploads.length, TWIN_FILES);
  assert.ok(uploads.every((u) => u.bucket === 'survey-report' && /^img\/[0-9a-f]{64}\.jpg$/.test(u.path)));
  assert.ok(uploads.every((u) => world.db.events.indexOf(u) < firstWrite), 'รูปถูกเตรียมก่อนเขียนอะไร');

  // เธรดของคำร้อง: แถวคำตอบแถวเดียว (พกยอด) · ไม่มีบรรทัดของปุ่ม "ออกเอกสาร" (แถวคำตอบยิงกระดิ่งแล้ว)
  assert.deepEqual(world.thread().map((r) => r.kind), ['answer']);
  assert.deepEqual(world.thread('answer')[0].meta.totals, json.totals);
  assert.doesNotMatch(world.thread('answer')[0].body, /SU-/, 'กระดิ่งไม่พกเลขเอกสาร (ตอนเขียนยังไม่มีเลข)');

  // ไม่มี id ของแถวเอกสาร ภาพนิ่ง หรือ HTML ออกไปกับคำตอบ/ audit
  const keys = keysDeep(json);
  for (const banned of ['reportId', 'snapshot', 'customerHtml', 'internalHtml', 'customerPdfPath', 'internalPdfPath']) {
    assert.equal(keys.has(banned), false, banned);
  }
  assert.equal(JSON.stringify(json).includes(row.id), false);
  const created = world.tables.audit_logs.find((a) => a.action === 'create' && a.entityType === 'service_survey_report');
  assert.equal(created.after.via, 'send');
  assert.equal(keysDeep(world.tables.audit_logs.map((a) => a.after)).has('snapshot'), false);
  assert.deepEqual(logged.error, []);
});

test('สวิตช์เปิด + ใบที่ช่างปิดนัดเองแล้ว: ไม่มีนัดให้ปิด ออกเอกสารได้ · คำเตือนที่ส่งมาเกินไม่ใช่เหตุให้ตีกลับ', async () => {
  const world = makeWorld();
  const seenWarnings = [...await seenWarningsOf(world), 'คำเตือนที่หายไปแล้วเพราะหัวหน้าแก้หมายเหตุ'];
  const { status, json } = await sendOn(world, { body: { seenWarnings } });
  assert.equal(status, 200, json.error);
  assert.equal(json.report.state, 'issued');
  assert.equal(json.closedVisit, null);
  assert.equal(world.calls('issue')[0].opts.closedVisit, null);
});

test('🔴 หมายเหตุ/ชื่อพื้นที่ที่มีคำว่า "ฉบับภายใน": ส่งผลแล้วเอกสารออกในคำขอเดียวกัน — ไม่มีใบที่ถูกตอบโดยไม่มีเอกสาร', async () => {
  /* มติ 3: ข้อความของผู้สำรวจพิมพ์ตามที่พิมพ์มา (รอบตรวจก่อนส่งผลไม่ตีกลับคำนี้) · มติ 2: ที่รอบตรวจปล่อยผ่าน ขั้นออกเลขต้องไม่ติด
     🐞 เดิมยามกันรั่วค้นคำนี้ทั้ง HTML ฉบับลูกค้า ⇒ S5 ผ่าน → ปิดนัด ตอบใบ กระดิ่งถึงฝ่ายขาย → S8 ได้ `paper_blocked` ทุกครั้งที่กด */
  const world = makeWorld({ visit: 'in_progress' });
  world.tables.service_survey_zones[0].note = 'ดูรายละเอียดในฉบับภายใน';
  world.tables.service_survey_zones[1].zoneName = 'ห้องเก็บเอกสารฉบับภายใน';
  const { status, json } = await sendOn(world, { body: { closeVisitId: VISIT_ID } });
  assert.equal(status, 200, json.error);
  assert.equal(json.report.state, 'issued', json.report.reason);
  assert.equal(world.reports().length, 1);
  assert.equal(json.report.docNo, world.reports()[0].docNo);
  assert.ok(world.request().answeredAt, 'ใบถูกตอบ');
  // ข้อความลงภาพนิ่งที่ตรึงตามที่พิมพ์ — ไม่ได้ผ่านเพราะถูกตัดทิ้ง
  const zones = world.reports()[0].snapshot.zones;
  assert.equal(zones[0].note, 'ดูรายละเอียดในฉบับภายใน');
  assert.equal(zones[1].name, 'ห้องเก็บเอกสารฉบับภายใน');
  assert.deepEqual(logged.error, []);
});

/* ══ 4. สวิตช์เปิด — ตีกลับก่อนเขียน ════════════════════════════════════════════════════ */

/** ตีกลับ = 409 · ฐานปลอมไม่เห็นคำสั่งเขียนสักคำสั่ง · ใบยังไม่ตอบ · นัดอยู่ในสภาพเดิม */
function assertRefused(world, res, visitStatus) {
  assert.equal(res.status, 409, JSON.stringify(res.json));
  assert.deepEqual(world.writes(), [], 'ต้องไม่มีคำสั่งเขียนก่อนตีกลับ');
  assert.equal(world.request().answeredAt, null);
  assert.equal(world.request().status, 'acknowledged');
  if (visitStatus) assert.equal(world.visit().status, visitStatus, 'นัดต้องยังเปิดอยู่');
  assert.equal(world.calls('issue').length, 0);
  assert.equal(world.thread().length, 0);
  assert.equal(world.tables.audit_logs.length, 0);
}

test('🔴 จอรุ่นเก่า (ไม่ส่ง seenWarnings) ถูกตีกลับก่อนดึงรูปสักรูป', async () => {
  for (const body of [{}, { closeVisitId: VISIT_ID }, { seenWarnings: 'ทั้งหมด' }, { seenWarnings: null }]) {
    const world = makeWorld({ visit: 'in_progress' });
    flagOn();
    const res = await send(world, { body });
    assertRefused(world, res, 'in_progress');
    assert.equal(res.json.error, SURVEY_SEND_OLD_PAGE_ERROR);
    assert.deepEqual(world.fetched, [], 'ยังไม่ดึงรูป');
    assert.equal(world.calls('images').length, 0);
    assert.equal(world.db.events.filter((e) => e.op === 'upload').length, 0);
    // อ่านแค่ใบคำร้อง (S1) — ไม่อ่านผลวัด ไฟล์ หรือนัด
    assert.deepEqual([...new Set(world.db.events.map((e) => e.table))], ['dept_requests']);
  }
});

test('🔴 นัดที่ค้างยังเป็นร่าง: ตอบด้วยประโยคของ surveySendVisitStep เอง (ไม่ใช่ "ไม่พบนัดประเมิน") — ก่อนเขียนอะไร', async () => {
  const world = makeWorld({ visit: 'draft' });
  const expected = surveySendVisitStep(world.visit(), { today: businessDate() }).error;
  assert.match(expected, /ยังเป็นร่าง/);
  const res = await sendOn(world, { body: { closeVisitId: VISIT_ID } });
  assertRefused(world, res, 'draft');
  assert.equal(res.json.error, expected);
  assert.equal(world.calls('inputs').length, 0, 'ตีกลับก่อนถึงตัวตรวจเอกสาร');

  // สวิตช์ปิด = ประโยคเดียวกัน (จากลำดับการเขียนเดิม)
  flagOff();
  const off = makeWorld({ visit: 'draft' });
  const plain = await send(off, { body: { closeVisitId: VISIT_ID } });
  assert.equal(plain.status, 409);
  assert.equal(plain.json.error, expected);
});

test('🔴 รูปที่ถอดรหัสไม่ได้ / หายจาก Drive ในรอบตรวจ: ตีกลับพร้อมชื่อไฟล์ ก่อนเขียนอะไร นัดยังเปิด', async () => {
  // ไบต์ที่ไม่ใช่รูป ตั้งชื่อ .jpg (ของจริง: HEIC ที่ตั้งชื่อ .jpg · JPEG ขาดท้าย)
  const broken = makeWorld({ visit: 'in_progress' });
  broken.rules['drv-att-z2-w1'] = { bytes: Buffer.from('ไม่ใช่รูป — ไบต์สุ่มที่ sharp ถอดไม่ได้') };
  const res = await sendOn(broken, { body: { closeVisitId: VISIT_ID } });
  assertRefused(broken, res, 'in_progress');
  assert.equal(res.json.error, 'รูป 1 รูปเปิดไม่ได้ — อัปใหม่เป็น JPG แล้วส่งอีกครั้ง (ชื่อไฟล์ S__70180879.jpg) · ยังไม่ได้ส่งผล');
  assert.equal(broken.calls('inputs').length, 0, 'ตีกลับก่อนอ่านด่าน');
  // เขียนได้อย่างเดียวคือรูปที่อ้างด้วยเนื้อไฟล์
  assert.ok(broken.db.events.filter((e) => e.op === 'upload').every((u) => /^img\/[0-9a-f]{64}\.jpg$/.test(u.path)));

  const gone = makeWorld({ visit: 'in_progress' });
  gone.rules['drv-att-z1-p1'] = { status: 404 };
  gone.rules['drv-att-z2-p1'] = { status: 404 };
  const lost = await sendOn(gone, { body: { closeVisitId: VISIT_ID } });
  assertRefused(gone, lost, 'in_progress');
  assert.equal(lost.json.error, 'รูป 2 รูปเปิดไม่ได้ — อัปใหม่เป็น JPG แล้วส่งอีกครั้ง (ชื่อไฟล์ 9047.jpg · 9049.jpg) · ยังไม่ได้ส่งผล');
});

test('🔴 server เจอคำเตือนที่จอไม่ได้ส่งมา: ตีกลับให้โหลดหน้าใหม่ ก่อนเขียนอะไร', async () => {
  const world = makeWorld({ visit: 'in_progress' });
  const [first] = await seenWarningsOf(world);
  for (const seenWarnings of [[], [first], [`${first} `]]) {
    const res = await sendOn(world, { body: { seenWarnings, closeVisitId: VISIT_ID } });
    assertRefused(world, res, 'in_progress');
    assert.equal(res.json.error, SURVEY_SEND_WARNINGS_CHANGED_ERROR);
    world.db.events.length = 0;
  }
});

test('🔴 เหตุของใบที่เอกสารออกไม่ได้ (ไม่มีนัดที่ปิด): ตีกลับ "ออกเอกสารไม่ได้ — … · ยังไม่ได้ส่งผล" ก่อนเขียนอะไร', async () => {
  const world = makeWorld({ visit: 'none' });
  const res = await sendOn(world);
  assertRefused(world, res, null);
  assert.equal(res.json.error, `ออกเอกสารไม่ได้ — ${SURVEY_REPORT_NO_VISIT} · ยังไม่ได้ส่งผล`);

  // สวิตช์ปิด: ใบเดียวกันส่งได้ตามเดิม (ด่านหกข้อไม่รู้จักเรื่องนัด)
  flagOff();
  const off = makeWorld({ visit: 'none' });
  assert.equal((await send(off)).status, 200);
});

/* ══ 5. สวิตช์เปิด — ปัญหาของระบบไม่ตีกลับ ═════════════════════════════════════════════════ */

test('🔴 Drive ค้างในรอบตรวจ (หมดเวลาต่อไฟล์): ไม่ตีกลับ · ขั้นออกเลขเติมเฉพาะไฟล์ที่ขาด แล้วออกเอกสารได้', async () => {
  const world = makeWorld();
  world.rules['drv-att-z1-w2'] = { stall: 1 };
  const { status, json } = await sendOn(world, { seams: { imageOptions: { fileTimeoutMs: 40, log() {} } } });
  assert.equal(status, 200, json.error);
  assert.equal(json.report.state, 'issued');
  assert.equal(world.request().status, 'answered');
  // ไฟล์ที่ค้างถูกขอสองครั้ง (ค้าง → เติมหลังล็อก) · ไฟล์อื่นครั้งเดียว
  const count = (id) => world.fetched.filter((f) => f === id).length;
  assert.equal(count('drv-att-z1-w2'), 2);
  assert.equal(world.fetched.length, TWIN_FILES + 1);
  const { prepared } = world.calls('issue')[0].opts;
  assert.equal(Object.keys(prepared.imageByAttId).length, TWIN_FILES - 1);
  assert.deepEqual(prepared.failed.map((f) => [f.attId, f.reason, f.permanent]), [['att-z1-w2', 'drive_timeout', false]]);
  assert.ok(logged.warn.some((line) => /รอบตรวจรูปก่อนส่งผลเตรียมไม่ครบ/.test(line)));
});

test('🔴 Drive ล่มทั้งรอบ: ส่งผลสำเร็จ (200) · report = failed ที่กดออกเอกสารซ้ำได้ · audit ของการล้มเขียนครั้งเดียว', async () => {
  const world = makeWorld({ visit: 'in_progress' });
  world.rules['*'] = { status: 503 };
  const { status, json } = await sendOn(world, { body: { closeVisitId: VISIT_ID } });
  assert.equal(status, 200, json.error);
  assert.deepEqual(Object.keys(json.report).sort(), ['code', 'reason', 'retry', 'state']);
  assert.equal(json.report.state, 'failed');
  assert.equal(json.report.code, 'images_failed');
  assert.equal(json.report.retry, true);
  assert.match(json.report.reason, /ดึงรูปจาก Drive ไม่สำเร็จ 8 รูป/);
  // ผลประเมินถึงฝ่ายขายแล้ว: ใบตอบ · นัดปิด · กระดิ่งออก — ไม่มีเลขถูกกิน
  assert.equal(world.request().status, 'answered');
  assert.equal(world.visit().status, 'done');
  assert.equal(world.thread('answer').length, 1);
  assert.equal(world.reports().length, 0);
  assert.equal(world.db.events.filter((e) => e.op === 'rpc').length, 0);
  const failures = world.tables.audit_logs.filter((a) => /ออกเอกสารประเมินไม่สำเร็จหลังส่งผล/.test(a.summary));
  assert.equal(failures.length, 1);
  assert.match(failures[0].summary, /^ออกเอกสารประเมินไม่สำเร็จหลังส่งผล RQ-AS-26090186 — /);
});

test('🔴 ตัวตรวจเอกสารโยน / อ่านไม่ครบ: ไม่ตีกลับ ลง log แล้วส่งผลต่อ', async () => {
  const thrown = makeWorld();
  const a = await sendOn(thrown, { seams: { precheck: async () => { throw new Error('ตัวตรวจพัง'); } } });
  assert.equal(a.status, 200, a.json.error);
  assert.equal(a.json.report.state, 'issued');
  assert.ok(logged.error.some((line) => /ตรวจเอกสารก่อนส่งผลล้ม/.test(line) && /ตัวตรวจพัง/.test(line)));

  // อ่านไม่ครบ = ข้ามทั้งคำเตือนและเหตุของใบ แม้ตัวตรวจจะคืนมาทั้งสองอย่าง
  logged.error.length = 0;
  const partial = makeWorld();
  const b = await sendOn(partial, {
    body: { seenWarnings: [] },
    seams: {
      precheck: async () => ({
        blockers: [{ kind: 'content', text: 'เหตุที่เชื่อไม่ได้เพราะอ่านไม่ครบ' }], warnings: ['คำเตือนที่จอไม่เห็น'], unknown: ['visits'],
      }),
    },
  });
  assert.equal(b.status, 200, b.json.error);
  assert.ok(logged.error.some((line) => /ตรวจเอกสารก่อนส่งผลอ่านไม่ครบ/.test(line) && /visits/.test(line)));

  // ตัวตรวจคืนของที่อ่านไม่ออก = ถือว่าอ่านไม่ครบ
  const odd = makeWorld();
  const c = await sendOn(odd, { seams: { precheck: async () => null } });
  assert.equal(c.status, 200, c.json.error);
});

test('🔴 เหตุของระบบ (ยังไม่มีมาตรฐานเอกสารที่เผยแพร่): ไม่ตีกลับการส่งผล · ขั้นออกเลขรายงานว่ายังออกไม่ได้ กดซ้ำได้', async () => {
  const world = makeWorld({ visit: 'in_progress', form: false });
  const { status, json } = await sendOn(world, { body: { closeVisitId: VISIT_ID } });
  assert.equal(status, 200, json.error);
  assert.equal(world.calls('inputs').length, 1, 'ตัวตรวจตัวจริงเดิน และเห็นเหตุนี้เป็นของระบบ');
  assert.equal(world.request().status, 'answered');
  assert.equal(world.visit().status, 'done');
  assert.equal(json.report.state, 'failed');
  assert.equal(json.report.code, 'blocked');
  assert.equal(json.report.retry, true, 'เหตุของระบบ = แก้แล้วกดออกเอกสารซ้ำได้ ไม่ต้องดึงผลกลับ');
  assert.equal(world.reports().length, 0);
  assert.equal(world.db.events.filter((e) => e.op === 'rpc').length, 0);
});

/* ══ 6. ขั้นออกเลขล้มนอกสัญญา ═══════════════════════════════════════════════════════ */

test('🔴 ขั้นออกเลขโยน: ยังตอบ 200 · report = failed (internal · กดซ้ำได้) · route เขียน audit ของการล้มเอง', async () => {
  const world = makeWorld({ visit: 'in_progress' });
  const { status, json } = await sendOn(world, {
    body: { closeVisitId: VISIT_ID },
    seams: { issue: async () => { throw new Error('ขั้นออกเลขระเบิด'); } },
  });
  assert.equal(status, 200, json.error);
  assert.deepEqual(json.report, { state: 'failed', code: 'internal', reason: SURVEY_SEND_REPORT_FAILED, retry: true });
  assert.equal(json.request.status, 'answered');
  assert.equal(json.closedVisit.id, VISIT_ID);
  assert.equal(world.thread('answer').length, 1);

  const at = (find) => world.db.events.findIndex(find);
  const answerLine = at((e) => e.op === 'insert' && e.table === 'entity_updates' && e.values.kind === 'answer');
  const sendAudit = at((e) => e.op === 'insert' && e.table === 'audit_logs' && /^ส่งผลประเมิน/.test(e.values.summary));
  const issueCall = at((e) => e.op === 'call' && e.name === 'issue');
  assert.ok(answerLine >= 0 && answerLine < sendAudit && sendAudit < issueCall, 'ขั้นออกเลขถูกเรียกหลังกระดิ่งและ audit');

  const failure = world.tables.audit_logs.at(-1);
  assert.equal(failure.summary, `ออกเอกสารประเมินไม่สำเร็จหลังส่งผล RQ-AS-26090186 — ${SURVEY_SEND_REPORT_FAILED}`);
  assert.equal(failure.entityType, 'dept_request');
  assert.equal(failure.entityId, REQUEST_ID);
  assert.equal(failure.before, null);
  assert.equal(failure.after, null);
  assert.ok(logged.error.some((line) => /ขั้นออกเลขหลังส่งผลล้มนอกสัญญา/.test(line)));

  // ขั้นออกเลขคืนของที่อ่านไม่ออก (ไม่มีเลข) = failed เหมือนกัน ไม่ใช่ "ออกแล้ว"
  const odd = makeWorld();
  const res = await sendOn(odd, { seams: { issue: async () => ({ state: 'issued', docNo: null }) } });
  assert.equal(res.status, 200);
  assert.equal(res.json.report.state, 'failed');
});

/* ══ 7. ซอร์สของ route ═══════════════════════════════════════════════════════════ */

test('ซอร์ส: runtime nodejs · maxDuration 300 · ของหนักเข้ามาทาง await import() เท่านั้น · ขั้นออกเลขอยู่หลัง audit', () => {
  const raw = fs.readFileSync(path.join(WEBAPP, ROUTE), 'utf8');
  /* ตัดคอมเมนต์ก่อนตรวจ — คอมเมนต์ในไฟล์เอ่ยชื่อสิ่งต้องห้ามไว้สอนคน */
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.match(code, /export const runtime = 'nodejs';/);
  assert.match(code, /export const maxDuration = 300;/);
  assert.match(code, /export const dynamic = 'force-dynamic';/);

  // import หัวไฟล์ต้องไม่มีโมดูลของเอกสารที่หนัก — เข้ามาทาง await import() ในกิ่งที่เปิดสวิตช์
  const statics = [...code.matchAll(/^import[^;]*?from\s+'([^']+)';/gms)].map((m) => m[1]);
  for (const heavy of ['surveyReportImages', 'surveyReportIssue', 'surveyReportInputs', 'surveyReportSnapshot', 'surveyReportPaper', 'htmlPdf', 'sharp', 'drive']) {
    assert.equal(statics.some((spec) => spec.endsWith(`/${heavy}`) || spec === heavy), false, heavy);
  }
  assert.ok(statics.includes('@/lib/service/surveyReportRows'));
  for (const lazy of ['surveyReportImages', 'surveyReportIssue', 'surveyReportInputs', 'surveyReportSnapshot']) {
    assert.match(code, new RegExp(`import\\('@/lib/service/${lazy}'\\)`), lazy);
  }
  assert.doesNotMatch(code, /puppeteer|chromium|htmlPdf|surveyReportPaper/, 'เส้นส่งผลไม่เปิด chromium');

  // สวิตช์ถูกถามครั้งเดียว และทุกกิ่งของเอกสารอยู่ใต้สวิตช์
  assert.equal(code.split('surveyReportIssueAtSend()').length - 1, 1);
  const handler = code.slice(code.indexOf('export const POST'));
  const order = (text) => handler.indexOf(text);
  assert.ok(order('SURVEY_SEND_OLD_PAGE_ERROR') > 0);
  assert.ok(order('SURVEY_SEND_OLD_PAGE_ERROR') < order('surveySendPreflight('), 'จอรุ่นเก่าตีกลับก่อนรอบตรวจรูป');
  assert.ok(order('surveySendPreflight(') < order('surveySendError('), 'รอบตรวจรูปก่อนอ่านด่านหกข้อ');
  assert.ok(order('surveySpotSendError(') < order('surveySendDocumentError('), 'ตัวตรวจเอกสารต่อจากด่านเดิม');
  assert.ok(order('surveySendDocumentError(') < order('surveySendWrites('), 'ทุกการตีกลับอยู่ก่อนคำสั่งเขียน');
  assert.ok(order('surveySendWrites(') < order('appendRequestEvent('));
  assert.ok(order('appendRequestEvent(') < order('surveySendIssue('), 'ขั้นออกเลขอยู่หลังกระดิ่ง');
  assert.ok(handler.lastIndexOf('recordAudit(') < order('surveySendIssue('), 'ขั้นออกเลขอยู่หลัง audit');
  assert.match(handler, /if \(issueAtSend && !Array\.isArray\(body\?\.seenWarnings\)\) return conflict\(SURVEY_SEND_OLD_PAGE_ERROR\);/);
  assert.match(handler, /if \(issueAtSend\) \{\s*const preflight = await surveySendPreflight\(/);
  assert.match(handler, /if \(issueAtSend\) \{\s*const documentError = await surveySendDocumentError\(/);
  assert.match(handler, /const report = issueAtSend\s*\? await surveySendIssue\(/);
  for (const call of ['surveySendPreflight(', 'surveySendDocumentError(', 'surveySendIssue(']) {
    assert.equal(handler.split(call).length - 1, 1, `${call} ถูกเรียกที่เดียว`);
  }
  // หลังเขียนแล้วไม่มี 409 ของเอกสารอีก
  assert.doesNotMatch(handler.slice(order('surveySendWrites(')), /conflict\(/);

  // บรรทัดเธรดของปุ่ม "ออกเอกสาร" เป็นของ route เอกสารตัวเดียว — ไม่อยู่ในไฟล์ของเส้นส่งผล (ทั้งซอร์สดิบ)
  for (const file of [ROUTE, 'src/lib/service/surveySendClose.js', 'src/lib/costingUpdates.js', 'src/lib/sales/documentThread.js']) {
    assert.equal(fs.readFileSync(path.join(WEBAPP, file), 'utf8').includes('report_issued'), false, file);
  }
  // ฐานของส่วนต่าง: อ่าน `{ error }` · มีเพดาน
  assert.match(code, /\.in\('kind', \['answer', 'recall'\]\)\s*\.order\('createdAt', \{ ascending: false \}\)\.limit\(20\)/);
  assert.match(code, /if \(roundsError\)/);
  assert.match(code, /meta: \{ closedBySend: true \}/);
});
