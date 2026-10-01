// ── route เอกสารประเมินพื้นที่ `/api/service/surveys/[id]/document` (PR-2 §6 · §7 · §12 · §15) ─────────────────
//
// ⭐ เรียก handler **ตัวจริง** (GET · POST) ผ่านของปลอมครบชุด — ขั้นออกเลข · ขั้นกระดาษ · ตัวเตรียมรูป (sharp จริง) ·
//   เธรด + กระดิ่ง + audit เดินด้วยโค้ดจริงทั้งหมด:
//     ฐาน      ตารางในหน่วยความจำ + RPC `issue_survey_report` ที่ทำตาม 0401 ④ + ยามเขียนครั้งเดียวของ 0401 ②
//     ถัง      `img/` · `pdf/` ในหน่วยความจำ
//     chromium โมดูลปลอมแทน `@/lib/documents/htmlPdf` — PDF ปลอมพก "ป้าย" = sha256 ของ HTML ที่ถูกส่งมาพิมพ์
//     Drive    โมดูลปลอมแทน `@/lib/drive` — คืน JPEG ที่ sharp สร้างในเทสต์ (สีต่างกันรายไฟล์ ⇒ sha ต่างกัน)
//
// 🔴 **ไม่มีอะไรแตะของจริง** — ตัวอ่านผู้ใช้ (`@/lib/authUser`) กับ client จริง (`@/lib/supabaseAdmin`) ถูกถอดด้วย hook
//   และ env ของ Supabase ถูกลบก่อน import ⇒ ต่อให้ hook พลาดก็สร้าง client จริงไม่ได้ (dev DB = prod DB)
//   ท่าเดียวกับ `crew/routeTestKit.mjs` · `VERCEL_ENV=production` ที่ตั้งในไฟล์นี้เปิดยามเขียนถาวรให้ **ของปลอม** เท่านั้น
//
// ล็อกเจ็ดเรื่อง:
//   ① GET: ลำดับด่าน · แผนที่ฉบับตายตัว · `version=Internal` = ฉบับลูกค้า · ผู้ขอได้ 403 ที่ฉบับภายใน · ช่างได้ 403 ไม่มี query
//   ② GET: ไม่มี / กำลังออก / ถูกแทนที่ / ค้างผิดรอบ · ชื่อไฟล์ไทยไม่ทำให้ล้ม · หลังตรึง คำขอฉบับลูกค้าพิมพ์แค่ฉบับลูกค้า
//   ③ ฉบับร่าง: หัวหน้าเท่านั้น · ลายน้ำ · ไม่มีเลข · ไม่เขียนอะไร · ไม่เปิด chromium ไม่แตะถัง ไม่ดึง Drive
//   ④ POST: ด่านของ handler · วัดกระดาษก่อนออกเลข · กระดาษล้มหลังได้เลข = ยัง 200 · ฉบับเดิม = `reused` แล้วขั้นกระดาษยังเดิน
//   ⑤ 🔴 บรรทัดแจ้งผู้ขอ (`report_issued` · มติ 34) — เก้ากรณีของ §15
//   ⑥ 🔴 ยามเขียนถาวร: เครื่องที่ไม่ใช่ production ไม่ออกเลข ไม่ตรึง ไม่อัป — ฉบับที่ครบแล้วกับฉบับร่างยังเปิดได้
//   ⑦ 🔴 รั่ว: คำขอฉบับลูกค้าไม่อ่าน `internalHtml` ไม่ดาวน์โหลด `internal.pdf` · payload/audit ไม่พกภาพนิ่ง/HTML/id ของแถว
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import sharp from 'sharp';

/* ── ถอดของจริงออกก่อนโหลด route ───────────────────────────────────────── */

for (const key of [
  'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SURVEY_REPORT_ISSUE_AT_SEND', 'PUPPETEER_EXECUTABLE_PATH',
]) delete process.env[key];

register('data:text/javascript,' + encodeURIComponent(`
  const mod = (src) => 'data:text/javascript,' + encodeURIComponent(src);
  const T = 'globalThis.__surveyDocRouteTest';
  const STUBS = {
    '@/lib/authUser': mod('export async function getCurrentUser() { return ' + T + '?.user ?? null; }'),
    '@/lib/supabaseAdmin': mod('export function getSupabaseAdmin() { const s = ' + T + '?.supabase; if (!s) throw new Error("fake supabase missing"); return s; }'),
    '@/lib/documents/htmlPdf': mod('export const HTML_PDF_GENERATOR_VERSION = "pdf-fake-v1";'
      + 'export async function launchBrowser() { return ' + T + '.renderer.launch(); }'
      + 'export async function renderHtmlPdf(html, opts) { return ' + T + '.renderer.print(html, opts); }'),
    '@/lib/drive': mod('export async function getFileStream(id, opts) { return ' + T + '.drive(id, opts); }'),
  };
  export async function resolve(s, c, n) {
    if (STUBS[s]) return { url: STUBS[s], shortCircuit: true };
    return n(s === 'next/headers' ? 'next/headers.js' : s, c);
  }
`));

/* 🔴 **ทุกโมดูลของแอปโหลดด้วย `await import()` หลัง hook ลงทะเบียนแล้วเท่านั้น** — import แบบ static ถูกยกขึ้นไป resolve
   ก่อนบรรทัด `register()` ⇒ โมดูลที่ลาก `@/lib/audit` (→ `@/lib/supabaseAdmin`) จะได้ตัวจริงไปก่อน แล้ว audit ของเทสต์
   หายเงียบ (ตัวจริงโยน "Supabase env missing" ซึ่ง `recordAudit` กลืน) · ไฟล์นี้จึงมี static import แค่ของ node กับ sharp */
const ROUTE = 'src/app/api/service/surveys/[id]/document/route.js';
const { GET, POST, dynamic, runtime, maxDuration } = await import('../../app/api/service/surveys/[id]/document/route.js');
// ขั้นออกเลขตัวเดียวกับที่ route ใช้ — เทสต์เรียกตรง ๆ ด้วย `via: 'send'` เพื่อจำลอง "เอกสารที่การส่งผลออกให้"
const { issueSurveyReport } = await import('./surveyReportIssue.js');
const { ROLES } = await import('../permissions.js');
const {
  UPDATE_KINDS, isAuthorableKind, isKnownUpdateKind, isNarrativeUpdateItem, isQuietUpdateKind,
} = await import('../master/updateTypes.js');
const { SURVEY_REPORT_STANDARD_KEY } = await import('./surveyReportInputs.js');
const { surveyDocAccess } = await import('./surveyAccess.js');
const { resolveImageTokens, surveyReportImageShas } = await import('./surveyReportDocument.js');
const { surveyReportPdfPath } = await import('./surveyReportPaper.js');
const { SURVEY_REPORT_BUCKET, SURVEY_REPORT_NOT_PRODUCTION } = await import('./surveyReportRows.js');
const { SURVEY_REPORT_REASONS, surveyReportState } = await import('./surveyReportState.js');
const { TEST_COMPANY, surveyReportInputsFromFixture, syntheticSurveyFixture } = await import('./surveyReportTestKit.mjs');

const raw = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
/* ตัดคอมเมนต์ก่อนตรวจ — คอมเมนต์ในไฟล์เอ่ยชื่อสิ่งต้องห้ามไว้สอนคน */
const code = (p) => raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ── นาฬิกา: 1 ต.ค. 2026 11:00 เวลาไทย ⇒ เดือนที่ออก `2610` · เลขแรกของปี ─────────────────── */
const NOW = Date.parse('2026-10-01T04:00:00.000Z');
const FIRST_NO = 'SU-26100001-0';
const THREAD_BODY = `ออกเอกสารประเมิน ${FIRST_NO} แล้ว — ดาวน์โหลดได้ที่หน้าคำร้อง`;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const SHEET_OPEN = '<article class="sheet';
const sheetsOf = (html) => html.split(SHEET_OPEN).length - 1;
const tagIn = (buffer) => /%tag:([0-9a-f]{64})/.exec(Buffer.from(buffer).toString('latin1'))?.[1] || null;

/** PDF ปลอมรูปเดียวกับที่ Chrome เขียน — `pdfInspect` นับหน้าและอ่านฟอนต์ได้ (ทรงเดียวกับเทสต์ของขั้นกระดาษ) */
function fakePdf(pages, tag) {
  const parts = ['%PDF-1.4', `%tag:${tag}`, '1 0 obj\n<< /Type /Pages /Count 0 >>\nendobj'];
  for (let i = 0; i < pages; i += 1) parts.push(`${i + 2} 0 obj\n<< /Type /Page /Parent 1 0 R >>\nendobj`);
  for (const name of ['AAAAAA+Sarabun-Regular', 'BBBBBB+Sarabun-Bold']) parts.push(`<< /Type /Font /Subtype /Type0 /BaseFont /${name} >>`);
  return Buffer.from(`${parts.join('\n')}\n%%EOF`, 'latin1');
}

/**
 * ตัวพิมพ์ปลอม — จำ HTML ทุกตัวที่ถูกส่งมาพิมพ์ · ฉบับดูจากคำว่า "ฉบับภายใน" (แถบ/ท้ายกระดาษของฉบับภายใน)
 * @param opts.fail `(version, nth) => true` = โยนตอนพิมพ์ครั้งที่ nth · @param opts.fit `(version, sheets) => { [page]: {…} }`
 */
function fakeRenderer({ fail = null, fit = null, launchFail = false } = {}) {
  const state = { prints: [], launches: 0, closes: 0 };
  state.launch = async () => {
    state.launches += 1;
    if (launchFail) throw new Error('Failed to launch the browser process');
    return { close: async () => { state.closes += 1; } };
  };
  state.print = async (html) => {
    const version = html.includes('ฉบับภายใน') ? 'internal' : 'customer';
    state.prints.push({ html, version });
    if (fail?.(version, state.prints.length)) throw new Error('Navigation timeout of 30000 ms exceeded');
    const sheets = sheetsOf(html);
    const over = fit?.(version, sheets) || {};
    return {
      buffer: fakePdf(sheets, sha256(html)),
      fit: Array.from({ length: sheets }, (_, i) => ({
        page: i + 1, height: 1123, rule: 1054, last: 900, lastBlock: 'p.note', body: 900, marks: {}, ...(over[i + 1] || {}),
      })),
      brokenImages: 0,
    };
  };
  return state;
}

/* JPEG จริงหนึ่งรูปต่อ id ไฟล์ — สีจาก id ⇒ เนื้อไฟล์ (และ sha หลังย่อ) ต่างกันรายไฟล์ */
const jpegCache = new Map();
async function jpegFor(id) {
  if (!jpegCache.has(id)) {
    const [r, g, b] = createHash('sha256').update(String(id)).digest();
    jpegCache.set(id, await sharp({ create: { width: 64, height: 48, channels: 3, background: { r, g, b } } }).jpeg().toBuffer());
  }
  return jpegCache.get(id);
}

/* ── ฐาน + ถังปลอม ─────────────────────────────────────────────────────────────
   กรองจริงตาม eq/neq/in/is/not · เรียงจริง · ตัดตาม limit · คืนเฉพาะคอลัมน์ที่ select (รวม `alias:json->path`)
   `backend.hook(call)` เรียกก่อนทุกคำสั่ง — คืน `{ data, error }` = ตอบแทนของจริง · โยนได้ · คืนค่าว่าง = ทำตามปกติ
     call = `{ type: 'table', table, op, select, returning, filters, payload }` | `{ type: 'storage', op, bucket, path }`
          | `{ type: 'rpc', name, args }`
   ทุกคำสั่งที่ **ถูกรันจริง** ถูกจดใน `backend.calls` */
const V_ONCE = new Set(['customerHtml', 'internalHtml', 'rendererVersion', 'frozenAt', 'customerPdfPath', 'internalPdfPath', 'supersededAt', 'supersededReason']);

function fakeBackend(tables, { users = {} } = {}) {
  const calls = [];
  const objects = new Map();
  const backend = { tables, calls, objects, hook: null, emptyWrites: [] };
  const hooked = (call) => {
    calls.push(call);
    return backend.hook ? backend.hook(call, backend) : undefined;
  };
  const projector = (select) => {
    const text = String(select ?? '*').trim();
    if (text === '*') return null;
    return text.split(',').map((c) => c.trim()).filter(Boolean).map((c) => {
      const [alias, expr] = c.includes(':') ? c.split(':') : [null, c];
      const parts = expr.replace(/"/g, '').split(/->>?/);
      return [(alias || parts[0]).replace(/"/g, ''), (row) => parts.reduce((v, p) => (v == null ? null : v[p]), row) ?? null];
    });
  };
  const shape = (rows, select) => {
    const cols = projector(select);
    return rows.map((row) => (cols ? Object.fromEntries(cols.map(([key, get]) => [key, get(row)])) : structuredClone(row)));
  };
  const sameInstant = (a, b) => Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);
  const raise = (message, extra = {}) => ({ data: null, error: { code: 'P0001', message, details: null, ...extra } });

  /* 0401 ④ — ทั้งก้อนเป็น synchronous = ทรานแซกชันเดียวใต้ล็อกแถวคำร้อง (ทรงเดียวกับเทสต์ของขั้นออกเลข) */
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
        counter = { scope: 'SU', month: year, lastNo: 0 };
        counters.push(counter);
      }
      counter.lastNo += 1;
      base = `SU-${a.p_yymm}${String(counter.lastNo).padStart(4, '0')}`;
      rev = 0;
    }
    const nowIso = new Date().toISOString();
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

  function run(q, mode) {
    const list = (tables[q.table] ||= []);
    const matches = (row) => q.filters.every(([op, col, a, b]) => {
      const v = row[col] ?? null;
      if (op === 'eq') return v === (a ?? null);
      if (op === 'neq') return v !== (a ?? null);
      if (op === 'in') return a.includes(v);
      if (op === 'is') return v === a;
      if (op === 'not') return a === 'is' ? v !== b : true;
      return true;
    });
    const finish = (rows) => {
      if (mode === 'maybe') return { data: rows[0] ?? null, error: null };
      if (mode === 'one') {
        return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } };
      }
      return { data: rows, error: null };
    };
    if (q.op === 'select') {
      let rows = list.filter(matches);
      for (const [col, asc] of [...q.orders].reverse()) {
        rows = [...rows].sort((x, y) => {
          if (x[col] === y[col]) return 0;
          return (x[col] < y[col] ? -1 : 1) * (asc ? 1 : -1);
        });
      }
      if (q.limit != null) rows = rows.slice(0, q.limit);
      return finish(shape(rows, q.select));
    }
    if (q.op === 'insert') {
      const rows = [].concat(q.payload).map((row) => structuredClone(row));
      list.push(...rows);
      return q.returning ? finish(shape(rows, q.returning)) : { data: null, error: null };
    }
    if (q.op === 'upsert') {
      const keys = String(q.options?.onConflict || 'id').split(',').map((k) => k.trim());
      for (const row of [].concat(q.payload)) {
        const hit = list.find((old) => keys.every((k) => (old[k] ?? null) === (row[k] ?? null)));
        if (!hit) list.push(structuredClone(row));
        else if (!q.options?.ignoreDuplicates) Object.assign(hit, row);
      }
      return { data: null, error: null };
    }
    if (q.op === 'update') {
      const targets = list.filter(matches);
      for (const target of targets) {
        if (q.table === 'service_survey_reports') {
          // ยามของ 0401 ②: คอลัมน์เติมได้ครั้งเดียว · ที่เหลือแก้ไม่ได้ · ห้ามเขียน ''
          for (const [key, value] of Object.entries(q.payload)) {
            if (value === '') backend.emptyWrites.push(key);
            if (key === 'status' || key === 'updatedAt') continue;
            const old = target[key] ?? null;
            if (old === value) continue;
            if (!V_ONCE.has(key) || old !== null) return { data: null, error: { message: `survey_report_immutable: ${target.docNo} ${key}` } };
          }
        }
        Object.assign(target, structuredClone(q.payload));
      }
      return q.returning ? finish(shape(targets, q.returning)) : { data: null, error: null };
    }
    throw new Error(`ของปลอมไม่รู้จักคำสั่ง ${q.op} ของ ${q.table}`);
  }

  backend.supabase = {
    from(table) {
      const q = { type: 'table', table, op: 'select', select: '*', returning: null, filters: [], orders: [], limit: null, payload: null, options: null };
      const exec = (mode) => Promise.resolve().then(() => hooked(q) || run(q, mode));
      const chain = {
        select(cols = '*') { if (q.op === 'select') q.select = cols; else q.returning = cols; return chain; },
        insert(payload) { q.op = 'insert'; q.payload = payload; return chain; },
        update(payload) { q.op = 'update'; q.payload = payload; return chain; },
        upsert(payload, options) { q.op = 'upsert'; q.payload = payload; q.options = options || null; return chain; },
        delete() { q.op = 'delete'; return chain; },
        eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
        neq(col, val) { q.filters.push(['neq', col, val]); return chain; },
        in(col, val) { q.filters.push(['in', col, val]); return chain; },
        is(col, val) { q.filters.push(['is', col, val]); return chain; },
        not(col, op, val) { q.filters.push(['not', col, op, val]); return chain; },
        order(col, opts = {}) { q.orders.push([col, opts.ascending !== false]); return chain; },
        limit(n) { q.limit = n; return chain; },
        maybeSingle() { return exec('maybe'); },
        single() { return exec('one'); },
        then(resolve, reject) { return exec('many').then(resolve, reject); },
      };
      return chain;
    },
    async rpc(name, args) {
      const override = hooked({ type: 'rpc', name, args });
      if (override) return override;
      if (name !== 'issue_survey_report') return raise(`function ${name} does not exist`, { code: 'PGRST202' });
      return issueInDb(args);
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
    storage: {
      from: (bucket) => ({
        async download(objectPath) {
          const override = hooked({ type: 'storage', op: 'download', bucket, path: objectPath });
          if (override) return override;
          const hit = bucket === SURVEY_REPORT_BUCKET ? objects.get(objectPath) : null;
          if (!hit) return { data: null, error: { message: 'Object not found', status: 400, statusCode: '404' } };
          return { data: new Blob([hit.body]), error: null };
        },
        async upload(objectPath, body, options) {
          const override = hooked({ type: 'storage', op: 'upload', bucket, path: objectPath, options });
          if (override) return override;
          if (objects.has(objectPath)) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
          objects.set(objectPath, { body: Buffer.from(body), contentType: options?.contentType });
          return { data: { path: objectPath }, error: null };
        },
      }),
    },
  };
  return backend;
}

/* ── คน ───────────────────────────────────────────────────────────────── */
const HEAD = Object.freeze({ id: 'U-head-now', name: 'Head Presser', role: 'ts_manager', department: 'TS', team: 'TS', teams: ['TS'] });
const REQUESTER = Object.freeze({ id: 'U-ae', name: 'Sale Requester', role: 'ae', department: 'SALES', team: 'KA', teams: ['KA'] });
const TEAMMATE = Object.freeze({ id: 'U-mate', name: 'Team Mate', role: 'ae', department: 'SALES', team: 'SV', teams: ['SV'] });
const CREW = Object.freeze({ id: 'U-crew', name: 'Crew', role: 'ts', department: 'TS', team: 'TS', teams: ['TS'] });
const PLANNER = Object.freeze({ id: 'U-plan', name: 'Planner', role: 'ts_planner', department: 'TS', team: 'TS', teams: ['TS'] });
const EXEC = Object.freeze({ id: 'U-exec', name: 'Executive', role: 'executive', department: 'MGMT', team: null, teams: [] });

const REQUEST_ID = 'DR-synthetic-0001';

/**
 * โลกปลอมจากแฝดสังเคราะห์ของ PR-1 — คำร้อง "ตอบแล้ว ยังไม่มีเอกสาร" (สถานะ `missing`) เป็นค่าตั้งต้น
 * @param opts.request  ทับช่องของแถวคำร้อง · @param opts.renderer ตัวเลือกของตัวพิมพ์ปลอม
 * @param opts.drive    `(driveFileId) => Buffer | undefined` — คืนค่า = ใช้แทนรูปจริง · โยนได้ · ค่าว่าง = JPEG ปกติ
 */
function makeWorld({ request = {}, renderer = {}, drive = null, tables: extra = {} } = {}) {
  const source = surveyReportInputsFromFixture(syntheticSurveyFixture());
  const row = {
    ...source.request, dept: 'TS', requestedById: REQUESTER.id, siteId: 'SITE-1', customerId: 'CUS-1', dealId: 'DEAL-1', ...request,
  };
  const tables = {
    dept_requests: [row],
    service_survey_reports: [],
    entity_number_counters: [],
    service_survey_zones: source.zones.map(({ zoneCode: _zoneCode, ...zone }) => ({ ...zone, requestId: row.id })),
    attachments: source.zones.flatMap((z) => (source.filesByZone[z.id] || [])
      .map((f) => ({ ...f, entityType: 'service_survey_zone', entityId: z.id, driveFileId: `drv-${f.id}` }))),
    service_zones: source.zoneRegistry.map((z) => ({ ...z })),
    service_sites: [{ id: 'SITE-1', ...source.site }],
    customers: [{ id: 'CUS-1', name: source.customer.name, nameEn: null, arCode: source.customer.arCode }],
    sales_deals: [{ id: 'DEAL-1', code: source.deal.code }],
    service_visits: [{
      id: 'SVV-1', requestId: row.id, createdAt: '2026-09-24T02:00:00.000+00:00', unableReason: null,
      ...source.visit, assistantIds: [],
    }],
    entity_updates: source.history.map((h, i) => ({ id: `EUP-old-${i}`, ...h, entityType: 'dept_request', entityId: row.id })),
    service_package_sizes: source.sizes.map((s) => ({ ...s })),
    organization_setting_versions: [{
      organizationId: 'primary', status: 'published', legalNameTh: TEST_COMPANY.name, legalNameEn: 'Scent and Sense',
      taxId: TEST_COMPANY.taxId, branchCode: '00000', registeredAddressTh: TEST_COMPANY.address, registeredAddressEn: null,
      phone: TEST_COMPANY.tel, email: null, lineId: TEST_COMPANY.line, website: TEST_COMPANY.website,
    }],
    document_standard_versions: [
      { documentKey: SURVEY_REPORT_STANDARD_KEY, status: 'published', versionNumber: 1, formCode: 'FM-TS-01', revision: '00', effectiveDate: '2026-09-29', titleEn: 'SITE SURVEY REPORT' },
    ],
    notifications: [],
    audit_logs: [],
    ...extra,
  };
  const backend = fakeBackend(tables, {
    users: { 'U-lead': { id: 'U-lead', email: 'lead@example.test', app_metadata: { role: 'ts_senior' }, user_metadata: { name: 'Lead Assessor' } } },
  });
  const world = {
    backend,
    tables,
    source,
    db: backend.supabase,
    renderer: fakeRenderer(renderer),
    driveCalls: [],
    request: () => tables.dept_requests[0],
    reports: () => tables.service_survey_reports,
    report: () => tables.service_survey_reports.find((r) => r.status === 'current') || null,
    threadRows: () => tables.entity_updates.filter((r) => r.kind === 'report_issued'),
    audits: (action) => tables.audit_logs.filter((r) => !action || r.action === action),
    tableCalls: (table) => backend.calls.filter((c) => c.type === 'table' && c.table === table),
    writes: () => backend.calls.filter((c) => (c.type === 'table' && c.op !== 'select') || c.type === 'rpc'
      || (c.type === 'storage' && c.op === 'upload')),
    storageCalls: (op) => backend.calls.filter((c) => c.type === 'storage' && (!op || c.op === op)),
    rpcCalls: () => backend.calls.filter((c) => c.type === 'rpc'),
  };
  world.drive = async (driveFileId) => {
    world.driveCalls.push(driveFileId);
    const custom = drive ? await drive(driveFileId, world) : undefined;
    return custom === undefined ? jpegFor(driveFileId) : custom;
  };
  return world;
}

/** เรียก handler ของ route เป็นผู้ใช้คนนี้ — คืน `{ status, headers, json | text, bytes }` */
async function call(handler, world, user, { method = 'GET', query = '', accept = null, id = REQUEST_ID } = {}) {
  globalThis.__surveyDocRouteTest = { user, supabase: world.db, renderer: world.renderer, drive: world.drive };
  const headers = { ...(accept ? { accept } : {}), ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) };
  const init = { method, headers, ...(method === 'POST' ? { body: '{}' } : {}) };
  const res = await handler(
    new Request(`http://localhost/api/service/surveys/${id}/document${query}`, init),
    { params: Promise.resolve({ id }) },
  );
  const type = res.headers.get('content-type') || '';
  const out = { status: res.status, headers: res.headers, type };
  if (/json/.test(type)) out.json = await res.json();
  else {
    out.bytes = Buffer.from(await res.arrayBuffer());
    out.text = out.bytes.toString('utf8');
  }
  return out;
}
const get = (world, user, query = '', extra = {}) => call(GET, world, user, { query, ...extra });
const post = (world, user, extra = {}) => call(POST, world, user, { method: 'POST', ...extra });

/** "เอกสารที่การส่งผลออกให้" — ขั้นออกเลขตัวจริงด้วย `via: 'send'` (ไม่มีตัววัด ไม่มีขั้นกระดาษ) ⇒ แถวสถานะ `issued` */
async function issueBySend(world) {
  globalThis.__surveyDocRouteTest = { user: HEAD, supabase: world.db, renderer: world.renderer, drive: world.drive };
  const result = await issueSurveyReport(world.db, { request: world.request(), user: HEAD, via: 'send' });
  assert.equal(result.state, 'issued', result.reason || '');
  return result;
}

function keysDeep(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.add(k); keysDeep(v, out); }
  }
  return out;
}

/* ทุกเทสต์รันเหมือนอยู่บน production (ยามเขียนถาวรเปิด — กับของปลอมเท่านั้น) · เทสต์ของยามสลับค่าเองแล้วคืน
   นาฬิกาถูกตรึง (เฉพาะ `Date`) ⇒ เลขที่เอกสารของทุกเทสต์คือ SU-26100001-0 · log ของความล้มเหลวเก็บไว้ไม่พิมพ์ */
const errors = [];
test.before(() => {
  process.env.VERCEL_ENV = 'production';
});
test.beforeEach((t) => {
  errors.length = 0;
  process.env.VERCEL_ENV = 'production';
  delete process.env.SURVEY_REPORT_ISSUE_AT_SEND;
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  t.mock.method(console, 'error', (...args) => {
    errors.push(args.map(String).join(' '));
    if (process.env.SURVEY_DOC_TEST_LOG) process.stderr.write(`[console.error] ${args.map(String).join(' ')}\n`);
  });
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'info', () => {});
});

/* ══ 0. ซอร์สของ route ═══════════════════════════════════════════════════════════ */

test('route: runtime nodejs · maxDuration 300 · force-dynamic · มีเส้นนี้ในลิสต์ไบนารี chromium ของ next.config', async () => {
  assert.equal(dynamic, 'force-dynamic');
  assert.equal(runtime, 'nodejs');
  assert.equal(maxDuration, 300);
  const config = (await import('../../../next.config.mjs')).default;
  assert.deepEqual(config.outputFileTracingIncludes['/api/service/surveys/\\[id\\]/document'], ['node_modules/@sparticuz/chromium/bin/**/*']);
  // เส้นส่งผลต้องไม่อยู่ในลิสต์ — มันไม่เปิด chromium (มติ 3)
  assert.equal(Object.keys(config.outputFileTracingIncludes).some((key) => key.includes('/send')), false);
});

test('route (ซอร์ส): แผนที่ฉบับตายตัว · ไม่มี `select(*)` กับแถวเอกสาร · ของหนักไม่ถูก import ที่หัวไฟล์ · บรรทัดเธรดเรียกด้วยค่าคงที่', () => {
  const src = code(ROUTE);
  assert.match(src, /customer:\s*'customerHtml',\s*internal:\s*'internalHtml'/);
  assert.match(src, /customer:\s*'customerPdfPath',\s*internal:\s*'internalPdfPath'/);
  // คำสั่งอ่าน HTML เขียนชื่อคอลัมน์ตรง ๆ ทีละฉบับ — ไม่มี select ที่ประกอบจากตัวแปร
  assert.match(src, /select\('id, "customerHtml"'\)/);
  assert.match(src, /select\('id, "internalHtml"'\)/);
  assert.equal(/from\('service_survey_reports'\)\s*\.select\('\*'\)/.test(src), false);
  // route ไม่อ่านคอลัมน์ภาพนิ่ง/รูปของแถวเอกสารเอง — ทุก select ของมันเอ่ยชื่อคอลัมน์ตรง ๆ และไม่มีสองช่องนี้
  const selects = [...src.matchAll(/\.select\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(selects.sort(), ["'*'", "'id, \"customerHtml\"'", "'id, \"internalHtml\"'"]);
  // chromium · sharp · Drive โหลดในขั้นของมันเอง (lazy) — ไม่อยู่ที่หัวไฟล์ของ route
  for (const heavy of ['@/lib/documents/htmlPdf', "'sharp'", '@/lib/drive', 'puppeteer', '@sparticuz/chromium']) {
    assert.equal(src.includes(heavy), false, heavy);
  }
  assert.match(src, /import\s*{\s*appendUpdate\s*}\s*from\s*'@\/lib\/master\/updates'/);
  assert.match(src, /entityType:\s*'dept_request',\s*entityId:\s*request\.id,\s*kind:\s*'report_issued'/);
  assert.match(src, /meta:\s*{\s*docNo,\s*rev\s*}/);
  // ไม่มีลิงก์ที่เซ็น ไม่มี after() (§0)
  assert.equal(/createSignedUrl|\bafter\(/.test(src), false);
});

/* ══ 1. GET — ลำดับด่าน ═══════════════════════════════════════════════════════════ */

test('🔴 GET: ช่าง (`ts`) และคนที่ยังไม่เข้าระบบ ตกก่อนอ่านฐาน — ไม่มี query สักตัว', async () => {
  const world = makeWorld();
  const crew = await get(world, CREW);
  assert.equal(crew.status, 403);
  assert.equal(world.backend.calls.length, 0, 'ช่างต้องไม่ทำให้เกิดการอ่านใด ๆ');

  const anon = await get(world, null);
  assert.equal(anon.status, 401);
  assert.equal(world.backend.calls.length, 0);

  const draft = await get(world, CREW, '?draft=1&format=html');
  assert.equal(draft.status, 403);
  assert.equal(world.backend.calls.length, 0);
});

test('GET: คำร้องไม่มีแล้ว = 404 ก่อนอ่านแถวเอกสาร (แถวเอกสารไม่มี FK) · หัวข้ออื่น = 404', async () => {
  const world = makeWorld();
  const gone = await get(world, HEAD, '', { id: 'DR-gone' });
  assert.equal(gone.status, 404);
  assert.equal(gone.json.error, 'ไม่พบใบคำร้อง');
  assert.equal(world.tableCalls('service_survey_reports').length, 0);

  const other = makeWorld({ request: { kind: 'inquiry' } });
  const res = await get(other, HEAD);
  assert.equal(res.status, 404);
  assert.equal(other.tableCalls('service_survey_reports').length, 0);
});

test('🔴 GET: ผู้ขอได้ 403 ที่ฉบับภายใน **ก่อน** อ่านแถวเอกสาร — ทั้ง PDF และ HTML · Planner ไม่ได้อะไรเลย', async () => {
  const world = makeWorld();
  await issueBySend(world);
  world.backend.calls.length = 0;
  for (const query of ['?version=internal', '?version=internal&format=html', '?version=internal&download=1']) {
    const res = await get(world, REQUESTER, query);
    assert.equal(res.status, 403, query);
    assert.equal(res.json.error, 'คุณไม่มีสิทธิ์เปิดเอกสารนี้');
  }
  for (const who of [TEAMMATE]) assert.equal((await get(world, who, '?version=internal')).status, 403);
  for (const query of ['', '?version=internal', '?format=html']) {
    assert.equal((await get(world, PLANNER, query)).status, 403, `planner ${query}`);
  }
  assert.equal(world.tableCalls('service_survey_reports').length, 0, 'ถูกตัดก่อนถึงแถวเอกสารทุกครั้ง');
  assert.equal(world.storageCalls().length, 0);
  assert.equal(world.renderer.prints.length, 0);
});

test('GET: ด่านของ handler ตรงกับตาราง §7 ทุก role — ฉบับที่ไม่มีสิทธิ์ = 403 · ที่มีสิทธิ์ = ไปถึงแถวเอกสาร (404 ยังไม่มี)', async () => {
  const world = makeWorld();
  for (const role of ROLES) {
    const user = { id: `U-${role}`, name: role, role, department: 'TS', team: 'ZZ', teams: ['ZZ'] };
    const access = surveyDocAccess(user, world.request());
    for (const version of ['customer', 'internal']) {
      const res = await get(world, user, `?version=${version}`);
      assert.equal(res.status, access[version] ? 404 : 403, `${role} ${version}`);
    }
    const draft = await get(world, user, '?draft=1&format=pdf');
    assert.equal(draft.status, access.draft ? 400 : 403, `${role} draft`);
  }
});

/* ══ 2. GET — ไม่มี / กำลังออก / ถูกแทนที่ / ค้างผิดรอบ ═══════════════════════════════════ */

test('GET: ยังไม่มีเอกสาร = 404 พร้อมทางออก · คำขอที่รับ text/html ได้หน้าแจ้งเหตุภาษาไทย ไม่ใช่ JSON ดิบ', async () => {
  const world = makeWorld();
  assert.equal(surveyReportState(world.request(), world.reports()), 'missing');
  const res = await get(world, REQUESTER);
  assert.equal(res.status, 404);
  assert.equal(res.json.error, 'ยังไม่มีเอกสารของใบนี้ — แจ้งหัวหน้าฝ่ายบริการให้กดออกเอกสาร');

  const page = await get(world, REQUESTER, '', { accept: 'text/html,application/xhtml+xml' });
  assert.equal(page.status, 404);
  assert.match(page.type, /text\/html/);
  assert.match(page.text, /ยังไม่มีเอกสารของใบนี้/);
  assert.match(page.text, /<html lang="th">/);

  const unsent = makeWorld({ request: { answeredAt: null, answeredById: null, answeredByName: null, status: 'acknowledged' } });
  assert.equal((await get(unsent, HEAD)).status, 404);
  assert.equal(unsent.writes().length, 0);
  assert.equal(unsent.renderer.prints.length, 0);
});

test('GET: เพิ่งส่งผลและสวิตช์ออกตอนส่งเปิด = 409 "กำลังออกเอกสาร" · เกิน 180 วิ = 404', async () => {
  process.env.SURVEY_REPORT_ISSUE_AT_SEND = 'on';
  const fresh = makeWorld({ request: { answeredAt: '2026-10-01T03:59:00.000+00:00' } });
  const res = await get(fresh, REQUESTER);
  assert.equal(res.status, 409);
  assert.equal(res.json.error, 'กำลังออกเอกสารของใบนี้ — ลองใหม่อีกครู่');

  const old = makeWorld({ request: { answeredAt: '2026-10-01T03:50:00.000+00:00' } });
  assert.equal((await get(old, REQUESTER)).status, 404);

  // สวิตช์ปิด = ไม่มีสถานะ "กำลังออก"
  delete process.env.SURVEY_REPORT_ISSUE_AT_SEND;
  assert.equal((await get(fresh, REQUESTER)).status, 404);
});

test('GET: มีแต่ฉบับที่ถูกแทนที่ = 409 บอกเลขที่ — ไฟล์เก่าไม่เปิด ไม่ว่าจะเป็นหัวหน้า (มติ 11)', async () => {
  const world = makeWorld({ request: { answeredAt: null, answeredById: null, answeredByName: null, status: 'acknowledged' } });
  world.tables.service_survey_reports.push({
    id: 'SVR-old', requestId: REQUEST_ID, baseNo: 'SU-26090007', rev: 0, docNo: 'SU-26090007-0', status: 'superseded',
    supersededAt: '2026-09-28T02:00:00.000+00:00', supersededReason: 'recall', snapshot: { customer: { name: 'ลูกค้าเก่า' } },
    frozenAt: '2026-09-27T02:00:00.000+00:00', customerPdfPath: 'pdf/SVR-old/customer.pdf', internalPdfPath: 'pdf/SVR-old/internal.pdf',
    approvedAt: '2026-09-27T01:00:00.000+00:00',
  });
  world.backend.objects.set('pdf/SVR-old/customer.pdf', { body: fakePdf(1, 'x'.repeat(64)) });
  for (const user of [HEAD, REQUESTER]) {
    const res = await get(world, user);
    assert.equal(res.status, 409);
    assert.equal(res.json.error, 'เอกสาร SU-26090007-0 ถูกแทนที่แล้ว — รอฉบับใหม่');
  }
  assert.equal(world.storageCalls().length, 0, 'ไม่มีการเปิดไฟล์ของฉบับเก่า');

  // ส่งผลรอบใหม่แล้วแต่ยังไม่มีฉบับใหม่ — ยังตอบว่าถูกแทนที่ (ไม่ใช่ "ยังไม่มีเอกสาร")
  world.request().answeredAt = '2026-09-30T02:00:00.000+00:00';
  assert.equal((await get(world, REQUESTER)).status, 409);
});

test('🔴 GET: ฉบับที่ใช้อยู่ไม่ตรงกับผลรอบล่าสุด (ทริกเกอร์ไม่ยิง) = 409 ลง log — ไม่เสิร์ฟ ไม่ทำกระดาษ', async () => {
  const world = makeWorld();
  await issueBySend(world);
  world.report().approvedAt = '2026-09-20T00:00:00.000+00:00';
  world.backend.calls.length = 0;
  const res = await get(world, HEAD);
  assert.equal(res.status, 409);
  assert.equal(res.json.error, SURVEY_REPORT_REASONS.stale_current);
  assert.equal(world.writes().length, 0);
  assert.equal(world.storageCalls().length, 0);
  assert.equal(world.renderer.prints.length, 0);
  assert.ok(errors.some((line) => line.includes(FIRST_NO) && line.includes('ไม่เสิร์ฟ')));
});

/* ══ 3. GET — เสิร์ฟ ═════════════════════════════════════════════════════════════ */

test('⭐ GET แรกของเอกสารที่การส่งผลออกให้: ผู้ขอเปิดฉบับลูกค้า → ตรึง → เก็บ PDF → สตรีมไฟล์ของฉบับลูกค้า · ชื่อไฟล์ไทยไม่ล้ม', async () => {
  const world = makeWorld();
  await issueBySend(world);
  assert.equal(surveyReportState(world.request(), world.reports()), 'issued');
  world.backend.calls.length = 0;

  const res = await get(world, REQUESTER);
  assert.equal(res.status, 200, res.json?.error);
  assert.equal(res.type, 'application/pdf');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-pdf-fallback'), 'on-demand', 'ไฟล์เพิ่งถูกพิมพ์ในคำขอนี้');

  const row = world.report();
  assert.equal(surveyReportState(world.request(), world.reports()), 'ready');
  // ไฟล์ที่ได้ = ของ `customer.pdf` ซึ่งพิมพ์จาก `customerHtml` ที่ตรึง
  const stored = world.backend.objects.get(surveyReportPdfPath(row.id, 'customer')).body;
  assert.deepEqual(res.bytes, stored);
  const dataUri = (sha) => `data:image/jpeg;base64,${world.backend.objects.get(`img/${sha}.jpg`).body.toString('base64')}`;
  assert.equal(tagIn(res.bytes), sha256(resolveImageTokens(row.customerHtml, dataUri)));
  assert.equal(row.customerHtml.includes('ฉบับภายใน'), false);

  // ชื่อไฟล์: ASCII ใน filename= · ชื่อเต็ม (มีชื่อลูกค้าไทย) ใน filename*
  const disposition = res.headers.get('content-disposition');
  assert.match(disposition, /^inline; filename="SU-26100001-0-customer\.pdf"; filename\*=UTF-8''/);
  assert.equal(/[^\x20-\x7E]/.test(disposition), false, 'หัวต้องเป็น ASCII ล้วน');
  const full = decodeURIComponent(disposition.split("filename*=UTF-8''")[1]);
  assert.ok(full.startsWith(FIRST_NO) && full.endsWith('.pdf'));
  assert.ok(full.includes('ตัวอย่าง'), `ชื่อลูกค้าจากภาพนิ่งต้องอยู่ในชื่อไฟล์: ${full}`);

  // 🔴 Leak 3: คำขอฉบับลูกค้าไม่ดาวน์โหลด internal.pdf
  const downloads = world.storageCalls('download').map((c) => c.path);
  assert.ok(downloads.includes(surveyReportPdfPath(row.id, 'customer')));
  assert.equal(downloads.some((p) => p.endsWith('internal.pdf')), false);

  // audit `view` — คีย์ที่นับไว้เท่านั้น
  const views = world.audits('view');
  assert.equal(views.length, 1);
  assert.equal(views[0].entityType, 'service_survey_report');
  assert.equal(views[0].actorId, REQUESTER.id);
  assert.deepEqual(views[0].after, { docNo: FIRST_NO, version: 'customer', format: 'pdf', captured: true });

  // เปิดซ้ำ: ไม่พิมพ์ใหม่ ไม่เขียนอะไรนอกจาก audit · `download=1` = attachment
  const prints = world.renderer.prints.length;
  world.backend.calls.length = 0;
  const again = await get(world, REQUESTER, '?download=1');
  assert.equal(again.status, 200);
  assert.deepEqual(again.bytes, stored);
  assert.equal(again.headers.get('x-pdf-fallback'), null);
  assert.match(again.headers.get('content-disposition'), /^attachment; filename="SU-26100001-0-customer\.pdf"/);
  assert.equal(world.renderer.prints.length, prints);
  assert.deepEqual(world.writes().map((c) => `${c.table}:${c.op}`), ['audit_logs:insert']);
  assert.equal(world.tableCalls('service_survey_reports').some((c) => /Html/.test(String(c.select))), false, 'PDF ที่เก็บแล้วไม่ต้องอ่าน HTML');
  assert.deepEqual(world.audits('view')[1].after, { docNo: FIRST_NO, version: 'customer', format: 'pdf', captured: false });
});

test('GET: ชื่อลูกค้าที่มีอัญประกาศ วงเล็บ ขึ้นบรรทัด หรือไม่มีชื่อเลย ไม่ทำให้หัว Content-Disposition พัง', async () => {
  const world = makeWorld();
  await issueBySend(world);
  assert.equal((await get(world, HEAD)).status, 200);
  for (const name of ['บริษัท โอ\'ไบรอัน (ไทย) "จำกัด" *', 'ชื่อ\r\nสองบรรทัด; filename="x.exe"', 'ก'.repeat(400), null]) {
    world.report().snapshot.customer.name = name;
    for (const query of ['', '?version=internal&download=1', '?format=html']) {
      const res = await get(world, HEAD, query);
      assert.equal(res.status, 200, `${name} ${query}: ${res.json?.error}`);
      const disposition = res.headers.get('content-disposition');
      assert.equal(/[^\x20-\x7E]/.test(disposition), false, 'หัวต้องเป็น ASCII ล้วน');
      const [plain, star] = disposition.split("; filename*=UTF-8''");
      assert.match(plain, /^(inline|attachment); filename="SU-26100001-0-(customer|internal)\.(pdf|html)"$/);
      assert.equal(/['()*";\s]/.test(star), false, `filename* ต้องเข้ารหัสครบ: ${star}`);
      assert.ok(decodeURIComponent(star).startsWith(FIRST_NO));
    }
  }
});

test('🔴 GET: `version=Internal` (หรือค่าอื่นใด) = ฉบับลูกค้า — สตริง `internal` ตรงตัวเท่านั้นที่เป็นฉบับภายใน', async () => {
  const world = makeWorld();
  await issueBySend(world);
  assert.equal((await get(world, HEAD)).status, 200);
  const row = world.report();
  const customer = world.backend.objects.get(surveyReportPdfPath(row.id, 'customer')).body;
  const internal = world.backend.objects.get(surveyReportPdfPath(row.id, 'internal')).body;
  assert.notDeepEqual(customer, internal);

  for (const query of ['?version=Internal', '?version=INTERNAL', '?version=internal%20', '?version=both', '?version=x&version=internal', '?version=']) {
    world.backend.calls.length = 0;
    const res = await get(world, HEAD, query);
    assert.equal(res.status, 200, query);
    assert.deepEqual(res.bytes, customer, query);
    assert.match(res.headers.get('content-disposition'), /-customer\.pdf"/, query);
    assert.equal(world.storageCalls('download').some((c) => c.path.endsWith('internal.pdf')), false, query);
  }
  // ผู้ขอส่งค่าเพี้ยน ๆ ก็ได้แค่ฉบับลูกค้า (ไม่ใช่ 403 และไม่ใช่ฉบับภายใน)
  assert.deepEqual((await get(world, REQUESTER, '?version=Internal')).bytes, customer);

  const real = await get(world, HEAD, '?version=internal');
  assert.equal(real.status, 200);
  assert.deepEqual(real.bytes, internal);
  assert.match(real.headers.get('content-disposition'), /^inline; filename="SU-26100001-0-internal\.pdf"/);
  assert.equal(tagIn(real.bytes) === tagIn(customer), false);

  // ผู้บริหารได้ทั้งสองฉบับ (อ่านอย่างเดียว)
  assert.deepEqual((await get(world, EXEC, '?version=internal')).bytes, internal);
});

test('🔴 หลังตรึง: คำขอฉบับลูกค้าพิมพ์และเก็บเฉพาะฉบับลูกค้า — ไม่อ่าน `internalHtml` ไม่แตะรูปจุด ไม่มี internal.pdf', async () => {
  const world = makeWorld();
  await issueBySend(world);
  // รอบแรก: ตรึงสำเร็จ แต่อัป PDF ล้มทั้งสองไฟล์ ⇒ สถานะ `frozen`
  world.backend.hook = (c) => (c.type === 'storage' && c.op === 'upload' && c.path.startsWith('pdf/')
    ? { data: null, error: { message: 'storage ล่ม' } } : undefined);
  const first = await get(world, REQUESTER);
  assert.equal(first.status, 500);
  assert.equal(surveyReportState(world.request(), world.reports()), 'frozen');
  assert.equal(world.audits('view').length, 0, 'เปิดไม่ได้ = ไม่ลงว่าเปิด');

  world.backend.hook = null;
  world.backend.calls.length = 0;
  world.renderer.prints.length = 0;
  const res = await get(world, REQUESTER);
  assert.equal(res.status, 200, res.json?.error);
  assert.deepEqual(world.renderer.prints.map((p) => p.version), ['customer'], 'พิมพ์ฉบับเดียว');
  const row = world.report();
  assert.equal(row.customerPdfPath, surveyReportPdfPath(row.id, 'customer'));
  assert.equal(row.internalPdfPath, null);
  assert.equal(world.backend.objects.has(surveyReportPdfPath(row.id, 'internal')), false);
  assert.equal(world.tableCalls('service_survey_reports').some((c) => /internalHtml/.test(`${c.select} ${c.returning}`)), false);

  // รูปที่ถูกดึงจากถัง = รูปที่ HTML ฉบับลูกค้าอ้างเท่านั้น
  const allowed = new Set(surveyReportImageShas(row.customerHtml).map((sha) => `img/${sha}.jpg`));
  const fetched = world.storageCalls('download').map((c) => c.path).filter((p) => p.startsWith('img/'));
  assert.ok(fetched.length > 0);
  for (const p of fetched) assert.ok(allowed.has(p), `ดึงรูปนอกฉบับลูกค้า: ${p}`);
  const spotOnly = surveyReportImageShas(row.internalHtml).filter((sha) => !allowed.has(`img/${sha}.jpg`));
  assert.ok(spotOnly.length > 0, 'ชุดทดสอบต้องมีรูปที่อยู่เฉพาะฉบับภายใน');

  // หัวหน้าขอฉบับภายในทีหลัง = พิมพ์และเก็บฉบับภายในต่อจากแถว
  const head = await get(world, HEAD, '?version=internal');
  assert.equal(head.status, 200);
  assert.equal(surveyReportState(world.request(), world.reports()), 'ready');
});

test('GET `format=html`: HTML ที่ตรึงของฉบับที่ขอ รูปถูกแปลงจากถัง (ไม่เหลือ token) · คำขอฉบับลูกค้าไม่เอ่ยถึง `internalHtml`', async () => {
  const world = makeWorld();
  await issueBySend(world);
  world.backend.calls.length = 0;

  // เปิด HTML เป็นคนแรก = ตรึงก่อนเสิร์ฟ (ไม่เสิร์ฟกระดาษที่ยังไม่ตรึง)
  const res = await get(world, REQUESTER, '?format=html');
  assert.equal(res.status, 200, res.json?.error);
  assert.match(res.type, /^text\/html; charset=utf-8/);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const row = world.report();
  assert.ok(row.frozenAt);
  const dataUri = (sha) => `data:image/jpeg;base64,${world.backend.objects.get(`img/${sha}.jpg`).body.toString('base64')}`;
  assert.equal(res.text, resolveImageTokens(row.customerHtml, dataUri));
  assert.equal(res.text.includes('su-img:'), false);
  assert.ok(res.text.includes(FIRST_NO));
  assert.equal(res.text.includes('ฉบับภายใน'), false);
  assert.match(res.headers.get('content-disposition'), /^inline; filename="SU-26100001-0-customer\.html"/);
  assert.deepEqual(world.audits('view').at(-1).after, { docNo: FIRST_NO, version: 'customer', format: 'html', captured: true });

  world.backend.calls.length = 0;
  const again = await get(world, REQUESTER, '?format=html');
  assert.equal(again.text, res.text);
  const selects = world.tableCalls('service_survey_reports').map((c) => String(c.select));
  assert.ok(selects.includes('id, "customerHtml"'));
  assert.equal(selects.some((s) => s.includes('internalHtml')), false);
  assert.equal(world.storageCalls('download').some((c) => c.path.startsWith('pdf/')), false);

  const internal = await get(world, HEAD, '?format=html&version=internal');
  assert.equal(internal.status, 200);
  assert.equal(internal.text, resolveImageTokens(row.internalHtml, dataUri));
  assert.ok(internal.text.includes('ฉบับภายใน'));

  assert.equal((await get(world, HEAD, '?format=docx')).status, 400);
});

test('GET: อ่านไฟล์ที่เก็บไม่สำเร็จ = 502 · รูปของ HTML อ่านไม่ได้ = 502 · อ่านแถวเอกสารไม่สำเร็จ = 500 (ไม่ใช่ 404)', async () => {
  const world = makeWorld();
  await issueBySend(world);
  assert.equal((await get(world, HEAD)).status, 200);

  world.backend.hook = (c) => (c.type === 'storage' && c.op === 'download' && c.path.startsWith('pdf/')
    ? { data: null, error: { message: 'storage ล่ม' } } : undefined);
  const pdf = await get(world, HEAD);
  assert.equal(pdf.status, 502);
  assert.equal(pdf.json.error, 'อ่านไฟล์ PDF ที่เก็บไว้ไม่สำเร็จ — ลองใหม่อีกครั้ง');

  world.backend.hook = (c) => (c.type === 'storage' && c.op === 'download' && c.path.startsWith('img/')
    ? { data: null, error: { message: 'storage ล่ม' } } : undefined);
  assert.equal((await get(world, HEAD, '?format=html')).status, 502);

  world.backend.hook = (c) => (c.type === 'table' && c.table === 'service_survey_reports'
    ? { data: null, error: { message: 'ฐานล่ม' } } : undefined);
  const read = await get(world, HEAD);
  assert.equal(read.status, 500, 'อ่านไม่สำเร็จ ≠ ไม่มีเอกสาร');

  world.backend.hook = (c) => (c.type === 'table' && c.table === 'dept_requests' ? { data: null, error: { message: 'ฐานล่ม' } } : undefined);
  assert.equal((await get(world, HEAD)).status, 500);
});

test('GET: กระดาษล้ม = 500 พร้อมเหตุ · เหตุของฉบับภายในไม่ถูกส่งให้คนที่ไม่มีสิทธิ์ฉบับภายใน · ไม่มีอะไรถูกตรึง', async () => {
  // ฉบับภายในล้นหน้า 1 (เนื้อหาเลยเส้นท้ายกระดาษ) — แถวที่ยังไม่ตรึงวัดทั้งสองฉบับเสมอ
  const world = makeWorld({ renderer: { fit: (version) => (version === 'internal' ? { 1: { last: 1100 } } : {}) } });
  await issueBySend(world);

  const sales = await get(world, REQUESTER);
  assert.equal(sales.status, 500);
  assert.equal(sales.json.code, 'paper_failed');
  assert.equal(sales.json.error.includes('ฉบับภายใน'), false, sales.json.error);

  const head = await get(world, HEAD);
  assert.equal(head.status, 500);
  assert.match(head.json.error, /^ฉบับภายใน: /);

  const row = world.report();
  assert.equal(row.frozenAt, null);
  assert.equal(row.customerHtml, null);
  assert.equal(world.storageCalls('upload').some((c) => c.path.startsWith('pdf/')), false);
  assert.equal(world.audits('view').length, 0);
  assert.deepEqual(world.backend.emptyWrites, []);
});

/* ══ 4. ยามเขียนถาวร ═════════════════════════════════════════════════════════════ */

test('🔴 เครื่องที่ไม่ใช่ production: GET ของเอกสารที่ยังไม่มีกระดาษ = 409 ไม่ตรึง ไม่อัป · ฉบับที่ครบแล้วยังเปิดได้', async () => {
  const world = makeWorld();
  await issueBySend(world);
  for (const env of [undefined, 'preview', 'development', 'Production']) {
    if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;
    world.backend.calls.length = 0;
    for (const query of ['', '?format=html', '?version=internal']) {
      const res = await get(world, HEAD, query);
      assert.equal(res.status, 409, `${env} ${query}`);
      assert.equal(res.json.error, SURVEY_REPORT_NOT_PRODUCTION);
    }
    assert.equal(world.writes().length, 0, `${env}: ไม่มีการเขียนใด ๆ`);
    assert.equal(world.renderer.prints.length, 0);
    assert.equal(world.report().frozenAt, null);
  }

  process.env.VERCEL_ENV = 'production';
  assert.equal((await get(world, HEAD)).status, 200);
  assert.equal(surveyReportState(world.request(), world.reports()), 'ready');

  delete process.env.VERCEL_ENV;
  world.backend.calls.length = 0;
  const pdf = await get(world, REQUESTER);
  assert.equal(pdf.status, 200, 'ฉบับที่กระดาษครบแล้วเสิร์ฟได้แบบอ่านอย่างเดียว');
  const html = await get(world, HEAD, '?format=html&version=internal');
  assert.equal(html.status, 200);
  assert.deepEqual(world.writes().map((c) => `${c.table}:${c.op}`), ['audit_logs:insert', 'audit_logs:insert']);
});

test('🔴 เครื่องที่ไม่ใช่ production: POST = 409 ไม่มี RPC ไม่ดึงรูป ไม่อัป ไม่ลงเธรด', async () => {
  for (const env of [undefined, 'preview']) {
    if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;
    const world = makeWorld();
    const res = await post(world, HEAD);
    assert.equal(res.status, 409);
    assert.equal(res.json.error, SURVEY_REPORT_NOT_PRODUCTION);
    assert.equal(res.json.code, 'not_production');
    assert.equal(world.writes().length, 0);
    assert.equal(world.driveCalls.length, 0);
    assert.equal(world.renderer.launches, 0);
    assert.equal(world.threadRows().length, 0);
    assert.equal(world.reports().length, 0);
  }
});

/* ══ 5. ฉบับร่าง ════════════════════════════════════════════════════════════════ */

test('⭐ ฉบับร่าง: หัวหน้าได้ทั้งสองฉบับ มีลายน้ำ ไม่มีเลข รูปชี้ไป proxy ไฟล์แนบ — ไม่เขียนอะไร ไม่แตะถัง ไม่เปิด chromium ไม่ดึง Drive', async () => {
  const world = makeWorld();
  const customer = await get(world, HEAD, '?draft=1&format=html');
  assert.equal(customer.status, 200, customer.json?.error);
  assert.match(customer.type, /^text\/html; charset=utf-8/);
  assert.equal(customer.headers.get('cache-control'), 'private, no-store');
  assert.ok(customer.text.includes('ฉบับร่าง'), 'ต้องมีลายน้ำ');
  assert.equal(/SU-\d{8}-\d/.test(customer.text), false, 'ฉบับร่างไม่มีเลขที่เอกสาร');
  assert.equal(customer.text.includes('su-img:'), false);
  assert.ok(customer.text.includes('/api/master/attachments/att-z1-w1/file'));
  assert.equal(customer.text.includes('ฉบับภายใน'), false);
  // รูปจุดติดตั้งไม่อยู่ในฉบับลูกค้าแม้เป็นร่าง
  assert.equal(customer.text.includes('/api/master/attachments/att-z2-s1/file'), false);

  const internal = await get(world, HEAD, '?draft=1&format=html&version=internal');
  assert.equal(internal.status, 200);
  assert.ok(internal.text.includes('ฉบับร่าง'));
  assert.ok(internal.text.includes('ฉบับภายใน'));
  assert.ok(internal.text.includes('/api/master/attachments/att-z2-s1/file'));

  // ไม่ส่ง format = HTML (ฉบับร่างมีรูปแบบเดียว)
  assert.equal((await get(world, HEAD, '?draft=1')).status, 200);

  assert.equal(world.writes().length, 0, 'ไม่มีการเขียนใด ๆ — ไม่มี audit ด้วย');
  assert.equal(world.storageCalls().length, 0);
  assert.equal(world.renderer.launches, 0);
  assert.equal(world.driveCalls.length, 0);
  assert.equal(world.reports().length, 0);
});

test('ฉบับร่างของใบที่ยังไม่ส่งผล: ผู้อนุมัติ = หัวหน้าที่กำลังดู · ผู้ประเมิน = นัดที่การส่งผลจะปิด · เปิดได้นอก production', async () => {
  delete process.env.VERCEL_ENV;
  const world = makeWorld({ request: { answeredAt: null, answeredById: null, answeredByName: null, status: 'acknowledged' } });
  Object.assign(world.tables.service_visits[0], { status: 'in_progress', actualDate: null });
  const res = await get(world, HEAD, '?draft=1&format=html');
  assert.equal(res.status, 200, res.json?.error);
  assert.ok(res.text.includes('Head Presser'), 'ผู้ตรวจสอบและอนุมัติ = คนที่กำลังจะกดส่ง');
  assert.ok(res.text.includes('Lead Assessor'), 'ผู้ประเมิน = คนบนนัดที่ยังเปิด');
  assert.equal(world.writes().length, 0);
  assert.equal(world.tables.service_visits[0].status, 'in_progress', 'ดูร่างไม่ปิดนัด');
  assert.equal(world.request().answeredAt, null);
});

test('ฉบับร่าง: ผู้ขอ · เพื่อนร่วมทีม · ผู้บริหาร · Planner · ช่าง = 403 · `format=pdf` = 400 · มีฉบับที่ใช้อยู่ = 409 · วัดไม่ครบ = 409 (n/m)', async () => {
  const world = makeWorld();
  for (const user of [REQUESTER, TEAMMATE, EXEC, PLANNER, CREW]) {
    for (const query of ['?draft=1&format=html', '?draft=1&format=html&version=internal']) {
      assert.equal((await get(world, user, query)).status, 403, `${user.role} ${query}`);
    }
  }
  assert.equal(world.tableCalls('service_survey_reports').length, 0);
  assert.equal(world.tableCalls('service_survey_zones').length, 0);

  const pdf = await get(world, HEAD, '?draft=1&format=pdf');
  assert.equal(pdf.status, 400);

  // วัดไม่ครบ: พื้นที่ 2 ขาดความสูง
  const partial = makeWorld();
  partial.tables.service_survey_zones[1].parts[0].heightM = null;
  const gap = await get(partial, HEAD, '?draft=1&format=html');
  assert.equal(gap.status, 409);
  assert.equal(gap.json.error, 'ดูตัวอย่างได้เมื่อวัดครบทุกพื้นที่ (1/2)');
  // พื้นที่ที่ถูกตัดไม่นับ
  partial.tables.service_survey_zones[1].status = 'cut';
  assert.equal((await get(partial, HEAD, '?draft=1&format=html')).status, 200);

  // มีฉบับที่ใช้อยู่แล้ว
  await issueBySend(world);
  world.backend.calls.length = 0;
  const issued = await get(world, HEAD, '?draft=1&format=html');
  assert.equal(issued.status, 409);
  assert.equal(issued.json.error, 'ออกเอกสารแล้ว — เปิดฉบับที่ตรึงไว้');
  assert.equal(world.writes().length, 0);
});

test('ฉบับร่าง: ชิ้นข้อมูลที่อ่านไม่สำเร็จ = 500 บอกชื่อชิ้น — ไม่ออกร่างที่ข้อมูลหายเงียบ ๆ', async () => {
  const world = makeWorld();
  world.backend.hook = (c) => (c.type === 'table' && c.table === 'service_sites' ? { data: null, error: { message: 'ฐานล่ม' } } : undefined);
  const res = await get(world, HEAD, '?draft=1&format=html');
  assert.equal(res.status, 500);
  assert.match(res.json.error, /^อ่านข้อมูลของเอกสารไม่สำเร็จ \(.+\) — ลองใหม่อีกครั้ง$/);
});

/* ══ 6. POST ═════════════════════════════════════════════════════════════════ */

test('🔴 POST: ช่างและ Planner ผ่าน proxy มาได้ แต่ handler ตอบ 403 — ผู้ขอ · ผู้บริหาร · AE Sup ก็เช่นกัน · ไม่มีการเขียน', async () => {
  const world = makeWorld();
  const crew = await post(world, CREW);
  assert.equal(crew.status, 403);
  assert.equal(world.backend.calls.length, 0, 'ช่าง: ไม่มี query สักตัว');

  for (const user of [PLANNER, REQUESTER, TEAMMATE, EXEC, { id: 'U-sup', name: 'Sup', role: 'ae_supervisor', department: 'SALES', team: 'SV', teams: ['SV'] }]) {
    const res = await post(world, user);
    assert.equal(res.status, 403, user.role);
    assert.equal(res.json.error, 'ออกเอกสารประเมินได้เฉพาะหัวหน้าฝ่ายบริการที่ตอบใบนี้ได้');
  }
  assert.equal((await post(world, null)).status, 401);
  assert.equal(world.writes().length, 0);
  assert.equal(world.rpcCalls().length, 0);
  assert.equal(world.driveCalls.length, 0);
  assert.equal(world.renderer.launches, 0);
  assert.equal(world.tableCalls('service_survey_reports').length, 0);

  assert.equal((await post(world, HEAD, { id: 'DR-gone' })).status, 404);
});

test('⭐ POST ออกเลขใหม่: วัดกระดาษสองฉบับก่อน RPC → ออกเลข → กระดาษครบ · ผู้อนุมัติ = ผู้ตอบ · ผู้ออก = คนกด · payload ไม่พก id', async () => {
  const world = makeWorld();
  let printsBeforeRpc = null;
  world.backend.hook = (c) => {
    if (c.type === 'rpc') printsBeforeRpc = world.renderer.prints.map((p) => p.version);
    return undefined;
  };
  const res = await post(world, HEAD);
  assert.equal(res.status, 200, res.json?.error);
  const { report } = res.json;
  assert.deepEqual(Object.keys(report).sort(), ['docNo', 'reused', 'rev', 'state', 'warnings']);
  assert.equal(report.state, 'ready');
  assert.equal(report.docNo, FIRST_NO);
  assert.equal(report.rev, 0);
  assert.equal(report.reused, false);
  assert.ok(Array.isArray(report.warnings) && report.warnings.length > 0, 'คำเตือนของหมายเหตุพื้นที่ติดมากับผล');

  assert.deepEqual(printsBeforeRpc, ['customer', 'internal'], 'I5b: วัดทั้งสองฉบับก่อนเลขถูกออก');
  assert.equal(world.renderer.prints.slice(0, 2).some((p) => p.html.includes(FIRST_NO)), false, 'กระดาษลองยังไม่มีเลข');
  assert.equal(world.renderer.launches, 1, 'เบราว์เซอร์เดียวของทั้งคำขอ');
  assert.equal(world.renderer.closes, 1);
  assert.equal(world.rpcCalls().length, 1);

  const row = world.report();
  assert.equal(row.docNo, FIRST_NO);
  assert.equal(row.approvedById, 'U-head');
  assert.equal(row.approvedByName, 'Head Approver');
  assert.equal(row.issuedById, HEAD.id);
  assert.equal(row.issuedByName, HEAD.name);
  assert.ok(row.frozenAt && row.customerPdfPath && row.internalPdfPath);
  assert.equal(surveyReportState(world.request(), world.reports()), 'ready');
  assert.ok(row.customerHtml.includes(FIRST_NO));

  // 🔴 payload กับ audit ไม่พกภาพนิ่ง/HTML · id ของแถว (= ที่อยู่ไฟล์) ไม่ออก payload
  const text = JSON.stringify(res.json);
  assert.equal(text.includes(row.id), false);
  for (const key of ['snapshot', 'customerHtml', 'internalHtml', 'reportId', 'id', 'images']) {
    assert.equal(keysDeep(res.json).has(key), false, key);
  }
  for (const audit of world.audits()) {
    for (const key of ['snapshot', 'customerHtml', 'internalHtml', 'images']) assert.equal(keysDeep(audit.after).has(key), false, `${audit.action} ${key}`);
  }
  assert.deepEqual(world.audits().map((a) => `${a.action}:${a.entityType}`), ['create:service_survey_report', 'update:service_survey_report']);
  assert.equal(world.audits('create')[0].after.via, 'issue_only');
  assert.deepEqual(world.backend.emptyWrites, []);
});

test('POST กับใบที่มีฉบับที่ใช้อยู่แล้ว (จอเรียกต่อจากการส่งผล): `reused` · ขั้นกระดาษยังเดิน · ไม่มี RPC ไม่ดึงรูปซ้ำ', async () => {
  const world = makeWorld();
  await issueBySend(world);
  const drives = world.driveCalls.length;
  world.backend.calls.length = 0;

  const res = await post(world, HEAD);
  assert.equal(res.status, 200, res.json?.error);
  assert.deepEqual(res.json.report, { state: 'ready', docNo: FIRST_NO, rev: 0, reused: true, warnings: [] });
  assert.equal(world.rpcCalls().length, 0);
  assert.equal(world.driveCalls.length, drives);
  assert.deepEqual(world.renderer.prints.map((p) => p.version), ['customer', 'internal'], 'ขั้นกระดาษพิมพ์ ไม่มีรอบวัดก่อนออกเลข');
  assert.equal(surveyReportState(world.request(), world.reports()), 'ready');
  assert.equal(world.reports().length, 1);

  // กดซ้ำเมื่อครบแล้ว = ไม่พิมพ์อีก
  const again = await post(world, HEAD);
  assert.deepEqual(again.json.report, { state: 'ready', docNo: FIRST_NO, rev: 0, reused: true, warnings: [] });
  assert.equal(world.renderer.prints.length, 2);
});

test('POST: กระดาษล้มหลังได้เลข = ยัง 200 พร้อมเหตุ (สถานะ `issued`) · กดอีกครั้งทำต่อจากแถวด้วยเลขเดิม', async () => {
  // พิมพ์ครั้งที่ 1–2 = รอบวัดก่อนออกเลข (ผ่าน) · ครั้งที่ 3–4 = ขั้นกระดาษ (chromium ล้ม)
  const world = makeWorld({ renderer: { fail: (_version, nth) => nth === 3 || nth === 4 } });
  const res = await post(world, HEAD);
  assert.equal(res.status, 200);
  assert.equal(res.json.report.state, 'issued');
  assert.equal(res.json.report.docNo, FIRST_NO);
  assert.equal(res.json.report.reused, false);
  assert.match(res.json.report.reason, /ตัวพิมพ์ PDF ของระบบทำงานไม่สำเร็จ/);
  assert.equal(world.report().frozenAt, null);
  assert.equal(world.renderer.closes, 1, 'เบราว์เซอร์ถูกปิดแม้ขั้นกระดาษล้ม');

  const again = await post(world, HEAD);
  assert.equal(again.status, 200);
  assert.deepEqual(again.json.report, { state: 'ready', docNo: FIRST_NO, rev: 0, reused: true, warnings: [] });
  assert.equal(world.reports().length, 1);
  assert.equal(world.tables.entity_number_counters[0].lastNo, 1, 'เลขรันถูกกินครั้งเดียว');
});

test('🔴 POST: หน้าที่ถูกตัดซึ่งรอบวัด (I5b) เจอ = 409 `paper_blocked` — ไม่มีเลขถูกออก', async () => {
  const world = makeWorld({ renderer: { fit: (version) => (version === 'customer' ? { 2: { last: 1100 } } : {}) } });
  const res = await post(world, HEAD);
  assert.equal(res.status, 409);
  assert.equal(res.json.code, 'paper_blocked');
  assert.equal(res.json.retry, false);
  assert.match(res.json.error, /หน้า 2/);
  assert.equal(world.rpcCalls().length, 0);
  assert.equal(world.reports().length, 0);
  assert.equal(world.tables.entity_number_counters.length, 0);
  assert.equal(world.renderer.closes, 1);

  // chromium เปิดไม่ขึ้น = ลองใหม่ได้ · ยังไม่มีเลข
  const broken = makeWorld({ renderer: { launchFail: true } });
  const fail = await post(broken, HEAD);
  assert.equal(fail.status, 409);
  assert.equal(fail.json.code, 'paper_blocked');
  assert.equal(fail.json.retry, true);
  assert.equal(broken.reports().length, 0);
});

test('POST: ใบเก่าที่มีพื้นที่ไม่ครบด่านส่งผล ถูก `surveySendError` ตีกลับ (409 `blocked` + ทางออกดึงผลกลับ) — ไม่มีเลข', async () => {
  const world = makeWorld();
  // ใบที่ตอบผ่านปุ่มทั่วไปก่อน 24/09: พื้นที่ 2 ไม่มีรูปเลย
  world.tables.attachments = world.tables.attachments.filter((f) => f.entityId !== 'SVZ-syn-2');
  const res = await post(world, HEAD);
  assert.equal(res.status, 409);
  assert.equal(res.json.code, 'blocked');
  assert.equal(res.json.retry, false);
  assert.match(res.json.error, /^ออกเอกสารไม่ได้ — /);
  assert.match(res.json.error, /ถ้าต้องแก้ ให้ดึงผลกลับมาแก้แล้วส่งใหม่$/);
  assert.ok(res.json.reasons.length > 0);
  assert.equal(world.rpcCalls().length, 0);
  assert.equal(world.driveCalls.length, 0, 'ตีกลับก่อนดึงรูป');
  assert.equal(world.renderer.launches, 0);
});

/* ══ 7. บรรทัดแจ้งผู้ขอ (`report_issued` · มติ 34) ═══════════════════════════════════════ */

test('⭐ เธรด ①: POST ที่ได้เลขใหม่เขียนบรรทัดเดียว — ชนิด · เนื้อ · meta `{ docNo, rev }` ตรงตัว · ผู้เขียน = หัวหน้าที่กด', async () => {
  const world = makeWorld();
  const before = world.tables.entity_updates.length;
  const res = await post(world, HEAD);
  assert.equal(res.status, 200);

  assert.equal(world.tables.entity_updates.length, before + 1, 'เพิ่มแถวเดียวทั้งเธรด');
  const rows = world.threadRows();
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.entityType, 'dept_request');
  assert.equal(row.entityId, REQUEST_ID);
  assert.equal(row.kind, 'report_issued');
  assert.equal(row.body, THREAD_BODY);
  assert.equal(row.body, 'ออกเอกสารประเมิน SU-26100001-0 แล้ว — ดาวน์โหลดได้ที่หน้าคำร้อง');
  assert.deepEqual(row.meta, { docNo: FIRST_NO, rev: 0 });
  assert.equal(row.authorId, HEAD.id);
  assert.equal(row.authorName, HEAD.name);
  // 🔴 id ของแถวเอกสาร (= ที่อยู่ไฟล์ PDF) ไม่อยู่ที่ไหนในแถวเธรด
  assert.equal(JSON.stringify(row).includes(world.report().id), false);
  assert.deepEqual(row.attachments, []);
});

test('เธรด ②: บรรทัดนั้นยิงกระดิ่งให้ผู้ขอหนึ่งครั้ง + คนที่เคยเขียนในเธรด — ไม่ยิงหาคนกด', async () => {
  const world = makeWorld();
  world.tables.entity_updates.push(
    { id: 'EUP-chat-1', entityType: 'dept_request', entityId: REQUEST_ID, kind: 'comment', body: 'ขอทราบกำหนด', authorId: 'U-other', authorName: 'Other', createdAt: '2026-09-25T01:00:00.000+00:00' },
    { id: 'EUP-chat-2', entityType: 'dept_request', entityId: REQUEST_ID, kind: 'comment', body: 'กำลังดูให้', authorId: HEAD.id, authorName: HEAD.name, createdAt: '2026-09-25T02:00:00.000+00:00' },
  );
  await post(world, HEAD);

  const notes = world.tables.notifications;
  assert.deepEqual(notes.map((n) => n.userId).sort(), ['U-ae', 'U-other']);
  const row = world.threadRows()[0];
  for (const note of notes) {
    assert.equal(note.kind, 'thread_update');
    assert.equal(note.entityType, 'dept_request');
    assert.equal(note.updateId, row.id);
    assert.equal(note.href, `/requests/${REQUEST_ID}`);
    // หัวกระดิ่งตรงตัว: ใบที่มีชื่อเรื่อง = ชื่อเรื่อง ไม่ใช่ `RQ-…` (ดูเทสต์ ②ข)
    assert.equal(note.title, `ออกเอกสารประเมินแล้ว · คำร้อง ${world.request().title}`);
    assert.equal(note.body, THREAD_BODY);
    assert.equal(note.actorName, HEAD.name);
  }
  assert.equal(notes.some((n) => n.userId === HEAD.id), false, 'คนกดไม่ได้กระดิ่งของตัวเอง');
});

/* ⭐ หัวกระดิ่งของบรรทัดนี้มาจากทางปกติของเธรด (`entityTitle` ใน lib/notifications.js) ซึ่งหยิบ **ชื่อเรื่องก่อนเลขที่** —
   เหมือนบรรทัด `answer` ของการส่งผลและทุกบรรทัดของคำร้อง · PR-2 ไม่แตะ lib/notifications.js (สเปก §14)
   ⇒ ตรึงของจริงทั้งสองทรงไว้ที่นี่: ใครสลับลำดับใน `entityTitle` เทสต์นี้ต้องแดง แล้วไปแก้สเปก/เอกสารคู่กัน
   ⚠️ เลข `RQ-…` ไม่อยู่ในเนื้อกระดิ่งด้วย (เนื้อ = เลข SU อย่างเดียว) — ผู้ขอรู้ว่าใบไหนจากชื่อเรื่อง + ลิงก์ */
test('เธรด ②ข: หัวกระดิ่งตรงตัว — ใบที่มีชื่อเรื่อง = "… · คำร้อง <ชื่อเรื่อง>" · ใบไม่มีชื่อเรื่อง = "… · คำร้อง RQ-…"', async () => {
  const titled = makeWorld();
  const title = titled.request().title;
  const docNo = titled.request().docNo;
  assert.ok(title && docNo && title !== docNo, 'fixture ต้องมีทั้งชื่อเรื่องและเลขที่ ไม่งั้นเทสต์นี้แยกสองทรงไม่ออก');
  assert.match(docNo, /^RQ-/);
  await post(titled, HEAD);
  assert.deepEqual(
    titled.tables.notifications.map((n) => [n.userId, n.title, n.body]),
    [[REQUESTER.id, `ออกเอกสารประเมินแล้ว · คำร้อง ${title}`, THREAD_BODY]],
  );
  assert.equal(titled.tables.notifications[0].title.includes(docNo), false, 'ใบมีชื่อเรื่อง: เลข RQ ไม่อยู่บนหัวกระดิ่ง');

  for (const blank of [null, '']) {
    const bare = makeWorld({ request: { title: blank } });
    const res = await post(bare, HEAD);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.report.reused, false);
    assert.deepEqual(
      bare.tables.notifications.map((n) => [n.userId, n.title, n.body]),
      [[REQUESTER.id, `ออกเอกสารประเมินแล้ว · คำร้อง ${docNo}`, THREAD_BODY]],
      `title = ${JSON.stringify(blank)}`,
    );
  }
});

test('เธรด ③: POST รอบสอง (`reused`) ไม่เขียนเธรด ไม่ยิงกระดิ่ง · POST บนเอกสารที่การส่งผลออกให้ก็เช่นกัน', async () => {
  const world = makeWorld();
  await post(world, HEAD);
  const threads = world.tables.entity_updates.length;
  const notes = world.tables.notifications.length;
  const again = await post(world, HEAD);
  assert.equal(again.json.report.reused, true);
  assert.equal(world.tables.entity_updates.length, threads);
  assert.equal(world.tables.notifications.length, notes);

  const sent = makeWorld();
  await issueBySend(sent);
  const res = await post(sent, HEAD);
  assert.equal(res.status, 200);
  assert.equal(res.json.report.reused, true);
  assert.equal(sent.threadRows().length, 0);
  assert.equal(sent.tables.notifications.length, 0);
});

test('🔴 เธรด ④: ขั้นออกเลขปฏิเสธหรือล้มแบบไหนก็ไม่มีบรรทัดเธรด ไม่มีกระดิ่ง — ไล่ทุกรหัส', async (t) => {
  const cases = [
    ['not_production', 409, () => { delete process.env.VERCEL_ENV; return makeWorld(); }],
    ['not_answered', 409, () => makeWorld({ request: { answeredAt: null, answeredById: null, answeredByName: null, status: 'acknowledged' } })],
    ['blocked', 409, () => {
      const world = makeWorld();
      world.tables.attachments = world.tables.attachments.filter((f) => f.entityId !== 'SVZ-syn-2');
      return world;
    }],
    // ไฟล์ที่เปิดไม่ได้ (ไบต์ไม่ใช่รูป) = เหตุถาวร ชื่อไฟล์อยู่ในเหตุ
    ['undecodable', 409, () => makeWorld({ drive: (id) => (id === 'drv-att-z1-w1' ? Buffer.from('ไม่ใช่รูป') : undefined) })],
    ['paper_blocked', 409, () => makeWorld({ renderer: { fit: () => ({ 1: { last: 1100 } }) } })],
    // Drive ล่ม (5xx) = เหตุชั่วคราว
    ['images_failed', 502, () => makeWorld({
      drive: (id) => { if (id === 'drv-att-z1-w1') throw Object.assign(new Error('Backend Error'), { code: 503 }); return undefined; },
    })],
    // งบเตรียมรูป (180 วิ) หมดหลังชุดแรก — ชุดที่เหลือเป็น `timeout`
    ['timeout', 503, () => makeWorld({ drive: () => { t.mock.timers.setTime(NOW + 200_000); return undefined; } })],
    // ดึงผลกลับคั่นกลาง: คำตอบของคำร้องหายก่อน RPC เดิน
    ['answer_changed', 409, () => {
      const world = makeWorld();
      world.backend.hook = (c) => { if (c.type === 'rpc') world.request().answeredAt = null; return undefined; };
      return world;
    }],
    ['stale_current', 409, () => makeWorld({
      tables: {
        service_survey_reports: [{
          id: 'SVR-stale', requestId: REQUEST_ID, baseNo: 'SU-26090009', rev: 0, docNo: 'SU-26090009-0', status: 'current',
          approvedAt: '2026-09-20T00:00:00.000+00:00', frozenAt: null, customerPdfPath: null, internalPdfPath: null, snapshot: {},
        }],
      },
    })],
    ['rpc_failed', 500, () => {
      const world = makeWorld();
      world.backend.hook = (c) => (c.type === 'rpc' ? { data: null, error: { message: 'connection reset' } } : undefined);
      return world;
    }],
  ];
  for (const [codeName, status, build] of cases) {
    t.mock.timers.setTime(NOW);
    process.env.VERCEL_ENV = 'production';
    const world = build();
    const res = await post(world, HEAD);
    assert.equal(res.status, status, `${codeName}: ${res.json?.error}`);
    assert.equal(res.json.code, codeName);
    assert.equal(typeof res.json.error, 'string');
    assert.equal(typeof res.json.retry, 'boolean', codeName);
    assert.equal(world.threadRows().length, 0, `${codeName}: ห้ามมีบรรทัดเธรด`);
    assert.equal(world.tables.notifications.length, 0, `${codeName}: ห้ามมีกระดิ่ง`);
    assert.equal(world.tableCalls('entity_updates').filter((c) => c.op !== 'select').length, 0, codeName);
    if (codeName !== 'stale_current') assert.equal(world.reports().filter((r) => r.docNo?.startsWith('SU-2610')).length, 0, `${codeName}: ไม่มีเลขถูกออก`);
    assert.equal(world.renderer.launches, world.renderer.closes, `${codeName}: เบราว์เซอร์ที่เปิดต้องถูกปิด`);
    if (codeName === 'undecodable') assert.match(res.json.error, /S__70180869\.jpg/);
    if (codeName === 'images_failed') assert.match(res.json.error, /^ดึงรูปจาก Drive ไม่สำเร็จ 1 รูป — ยังไม่ได้ออกเอกสาร กดอีกครั้ง$/);
    if (codeName === 'answer_changed') assert.equal(res.json.error, SURVEY_REPORT_REASONS.answer_changed);
  }
});

test('🔴 เธรด ⑤: บรรทัดถูกเขียน **ก่อน** ขั้นกระดาษ — ตัวพิมพ์ล้มในขั้นกระดาษ POST ยัง 200 และบรรทัดอยู่ครบ', async () => {
  const world = makeWorld({ renderer: { fail: (_version, nth) => nth > 2 } });
  let atInsert = null;
  world.backend.hook = (c) => {
    if (c.type === 'table' && c.table === 'entity_updates' && c.op === 'insert') {
      const row = world.report();
      atInsert = { prints: world.renderer.prints.length, frozenAt: row?.frozenAt ?? null, docNo: row?.docNo ?? null };
    }
    return undefined;
  };
  const res = await post(world, HEAD);
  assert.equal(res.status, 200);
  assert.equal(res.json.report.state, 'issued');
  assert.ok(res.json.report.reason);
  assert.deepEqual(atInsert, { prints: 2, frozenAt: null, docNo: FIRST_NO }, 'ตอนเขียนบรรทัด: เลขออกแล้ว · พิมพ์ไปแค่รอบวัด · ยังไม่ตรึง');
  assert.equal(world.threadRows().length, 1);
  assert.equal(world.tables.notifications.length, 1);

  // กดซ้ำหลังขั้นกระดาษตาย = `reused` — บรรทัดไม่ถูกเขียนซ้ำ
  world.backend.hook = null;
  world.renderer.prints.length = 0;
  const again = await post(world, HEAD);
  assert.equal(again.json.report.reused, true);
  assert.equal(world.threadRows().length, 1);
  assert.equal(world.tables.notifications.length, 1);
});

test('🔴 เธรด ⑥: เขียนบรรทัดไม่สำเร็จ (error หรือ throw) = ยัง 200 พร้อมเลข · ลง audit ของคำร้อง · ไม่โยน', async () => {
  for (const mode of ['error', 'throw']) {
    const world = makeWorld();
    world.backend.hook = (c) => {
      if (c.type !== 'table' || c.table !== 'entity_updates' || c.op !== 'insert') return undefined;
      if (mode === 'throw') throw new Error('socket hang up');
      return { data: null, error: { message: 'insert ล้ม' } };
    };
    const res = await post(world, HEAD);
    assert.equal(res.status, 200, mode);
    assert.equal(res.json.report.docNo, FIRST_NO);
    assert.equal(res.json.report.state, 'ready', 'ขั้นกระดาษยังเดินต่อ');
    assert.equal(res.json.report.reused, false);
    assert.equal(world.threadRows().length, 0);
    assert.equal(world.tables.notifications.length, 0);

    const failures = world.audits('update').filter((a) => a.entityType === 'dept_request');
    assert.equal(failures.length, 1, mode);
    assert.equal(failures[0].entityId, REQUEST_ID);
    assert.equal(failures[0].actorId, HEAD.id);
    assert.equal(failures[0].before, null);
    assert.equal(failures[0].after, null);
    assert.match(failures[0].summary, /^ออกเอกสารประเมิน SU-26100001-0 แล้ว แต่ลงเธรดแจ้งผู้ขอไม่สำเร็จ — .+/);
    assert.ok(errors.some((line) => line.includes('ลงเธรดแจ้งผู้ขอ')), 'ต้องลง console.error');
  }
});

test('เธรด ⑦: เอกสารที่ออกในเส้นส่งผล (`via: send`) ไม่มีบรรทัด `report_issued` — ขั้นออกเลขไม่เขียนเธรดเอง', async () => {
  const world = makeWorld();
  const before = world.tables.entity_updates.length;
  const result = await issueBySend(world);
  assert.equal(result.reused, false);
  assert.equal(result.docNo, FIRST_NO);
  assert.equal(world.tables.entity_updates.length, before, 'ขั้นออกเลขไม่แตะเธรด');
  assert.equal(world.threadRows().length, 0);
  assert.equal(world.tables.notifications.length, 0);
  assert.equal(world.tableCalls('entity_updates').some((c) => c.op !== 'select'), false);
});

test('เธรด ⑧: ทะเบียนชนิด — ป้าย "ออกเอกสารประเมินแล้ว" · ไม่ quiet · ไม่ authorable · narrative', () => {
  const entry = UPDATE_KINDS.dept_request.report_issued;
  assert.deepEqual(entry, { label: 'ออกเอกสารประเมินแล้ว', color: 'var(--green)', narrative: true });
  assert.equal(isKnownUpdateKind('dept_request', 'report_issued'), true);
  assert.equal(isQuietUpdateKind('dept_request', 'report_issued'), false);
  assert.equal(isAuthorableKind('dept_request', 'report_issued'), false);
  assert.equal(isNarrativeUpdateItem('dept_request', { kind: 'own', row: { kind: 'report_issued' } }), true);
});

test('เธรด ⑨ (ซอร์ส): นอกไฟล์เทสต์ สตริง `report_issued` อยู่แค่ทะเบียนชนิดกับ route เอกสาร', () => {
  const root = path.join(process.cwd(), 'src');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(js|mjs|jsx)$/.test(entry.name) && !/\.test\.mjs$/.test(entry.name) ? [full] : [];
  });
  const hits = walk(root)
    .filter((file) => fs.readFileSync(file, 'utf8').includes('report_issued'))
    .map((file) => path.relative(process.cwd(), file))
    .sort();
  assert.deepEqual(hits, [ROUTE, 'src/lib/master/updateTypes.js'].sort());
  for (const file of [
    'src/app/api/service/surveys/[id]/send/route.js', 'src/lib/service/surveyReportIssue.js', 'src/lib/costingUpdates.js',
    'src/lib/notifications.js', 'src/lib/master/updateAccess.js',
  ]) {
    assert.equal(raw(file).includes('report_issued'), false, file);
  }
});
