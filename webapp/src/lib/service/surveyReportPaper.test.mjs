// ── ขั้นกระดาษของรายงานการประเมินพื้นที่ (สเปก PR-2 §4 · §11 · §12 · §15) ───────────────────────────────
//
// ⭐ ทุกอย่างเป็นของปลอม: ฐาน (แถวเดียวของ `service_survey_reports` + ยามเขียนครั้งเดียวของ mig 0401) ·
//   ถัง (`img/` · `pdf/`) · ตัวพิมพ์ (ไม่มี chromium) — **ไม่แตะฐานจริง ไม่อัปอะไร ไม่เปิดเบราว์เซอร์**
//   HTML มาจากตัวเรนเดอร์จริงของ PR-1 · PDF ปลอมพก "ป้าย" = sha256 ของ HTML ที่ถูกส่งมาพิมพ์
//
// ล็อกหกเรื่อง:
//   ① เส้นปกติ: วัดสองฉบับ → ตรึง → เก็บ `pdf/<reportId>/<ฉบับ>.pdf` → audit · หลังตรึง คำขอฉบับลูกค้าพิมพ์แค่ฉบับลูกค้า
//   ② เดินต่อได้จากทุกขั้นที่ตาย (§11) — ตายตรงไหน รอบถัดไปจบที่ `ready` ด้วยเลขเดิม กระดาษเดิม
//   ③ แพ้การตรึง = ใช้กระดาษของผู้ชนะ · "มีอยู่แล้ว" = สำเร็จ · ไม่มีวันเขียน '' · สองคำขอพร้อมกันได้ไฟล์ชุดเดียว
//   ④ 🔴 เขียนของถาวรได้บน production เท่านั้น
//   ⑤ 🔴 รั่ว (§15 ข้อ 1, 2, 4, 5): HTML ที่ตรึง · HTML ที่ส่งให้ตัวพิมพ์ · ไฟล์ผูกกับฉบับ · ยามก่อนตรึง
//   ⑥ ขั้นวัดของ I5b ไม่เขียนอะไร และใช้เบราว์เซอร์เดียวกับขั้นกระดาษ
//   ⑦ 🔴 ไม่มีการรอที่ไม่มีเพดาน: ถัง · ฐาน · chromium · audit ที่ไม่ตอบ จบที่เพดาน · งบของรอบถูกเช็กซ้ำก่อนพิมพ์และก่อนเก็บ
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  SURVEY_REPORT_RENDERER_VERSION, renderSurveyReportHTML, resolveImageTokens, surveyReportImageShas,
} from './surveyReportDocument.js';
import {
  SURVEY_REPORT_AUDIT_TIMEOUT_MS, SURVEY_REPORT_CALL_TIMEOUT_MS, SURVEY_REPORT_PAPER_MIN_MS, SURVEY_REPORT_PAPER_REASONS,
  SURVEY_REPORT_PRINT_MIN_MS, SURVEY_REPORT_SESSION_CLOSE_MS, SURVEY_REPORT_STORE_MIN_MS, SURVEY_REPORT_VERSIONS,
  ensureSurveyReportPaper, measureSurveyReportPaper, surveyReportBounded, surveyReportPdfPath, surveyReportPrintSession,
} from './surveyReportPaper.js';
import { paginateSurveyReport } from './surveyReportLayout.js';
import { SURVEY_REPORT_BUCKET, SURVEY_REPORT_NOT_PRODUCTION } from './surveyReportRows.js';
import { buildSurveyReportSnapshot } from './surveyReportSnapshot.js';
import { surveyReportState } from './surveyReportState.js';
import { markedSurveyInputs, surveyReportInputsFromFixture, syntheticSurveyFixture } from './surveyReportTestKit.mjs';
import { surveyReportView } from './surveyReportView.js';

/* ── ของปลอม ──────────────────────────────────────────────────────────── */

const REPORT_ID = 'SVR-paper0001';
const DOC_NO = 'SU-26100001-0';
const ANSWERED = '2026-09-30T18:29:00.000+00:00';
// ออกตอน 01:30 ของวันที่ 1 ต.ค. เวลาไทย (ยังเป็น 30 ก.ย. ตาม UTC) — กระดาษต้องพิมพ์ 01/10/2026
const ISSUED = '2026-09-30T18:30:00.000+00:00';
const NOW = Date.parse('2026-09-30T18:31:00.000Z');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const imageBytes = (sha) => Buffer.from(`JPEG:${sha}`);
const dataUri = (sha) => `data:image/jpeg;base64,${imageBytes(sha).toString('base64')}`;
const SHEET_OPEN = '<article class="sheet';
const sheetsOf = (html) => html.split(SHEET_OPEN).length - 1;
/** ป้ายของ PDF ปลอม = sha256 ของ HTML ที่ตัวพิมพ์ได้รับ (token ถูกแปลงเป็น data URI แล้ว) */
const tagOf = (printedHtml) => sha256(printedHtml);
/** ป้ายที่ไฟล์ของ HTML (token) ตัวนี้ต้องพก */
const tagOfStored = (tokenHtml) => tagOf(resolveImageTokens(tokenHtml, dataUri));
const tagIn = (buffer) => /%tag:([0-9a-f]{64})/.exec(Buffer.from(buffer).toString('latin1'))?.[1] || null;

/** PDF ปลอมรูปเดียวกับที่ Chrome เขียน — `pdfInspect` นับหน้าและอ่านฟอนต์ได้ */
function fakePdf(pages, tag, fonts = ['AAAAAA+Sarabun-Regular', 'BBBBBB+Sarabun-Bold']) {
  const parts = ['%PDF-1.4', `%tag:${tag}`, '1 0 obj\n<< /Type /Pages /Count 0 >>\nendobj'];
  for (let i = 0; i < pages; i += 1) parts.push(`${i + 2} 0 obj\n<< /Type /Page /Parent 1 0 R >>\nendobj`);
  for (const name of fonts) parts.push(`<< /Type /Font /Subtype /Type0 /BaseFont /${name} >>`);
  return Buffer.from(`${parts.join('\n')}\n%%EOF`, 'latin1');
}

/**
 * ตัวพิมพ์ปลอม — จำ HTML ทุกตัวที่ถูกส่งมาพิมพ์ · ฉบับดูจากคำว่า "ฉบับภายใน" (แถบ/ท้ายกระดาษของฉบับภายใน)
 * @param opts.fit      `(version, sheets) => { [page]: { rule, last, … } }` ทับผลวัดรายหน้า
 * @param opts.fail     `(version, nth) => true` = โยนตอนพิมพ์
 * @param opts.broken   จำนวนรูปที่ถอดรหัสไม่ได้
 * @param opts.loadFail · opts.launchFail  โยนตอนโหลด / ตอนเปิดเบราว์เซอร์
 */
function fakeRenderer({ fit = null, fail = null, broken = 0, loadFail = false, launchFail = false, fonts } = {}) {
  const state = { prints: [], loads: 0, launches: 0, opened: 0, closes: 0 };
  state.load = async () => {
    state.loads += 1;
    if (loadFail) throw new Error('Cannot find module puppeteer-core');
    return {
      HTML_PDF_GENERATOR_VERSION: 'pdf-fake-v1',
      launchBrowser: async () => {
        state.launches += 1;
        if (launchFail) throw new Error('Failed to launch the browser process');
        state.opened += 1;
        return { close: async () => { state.closes += 1; } };
      },
      renderHtmlPdf: async (html, { measure, browser } = {}) => {
        assert.equal(measure, true, 'ต้องขอผลวัดทุกครั้ง');
        assert.ok(browser, 'ต้องพิมพ์ในเบราว์เซอร์ของรอบ ไม่เปิดใหม่ต่อฉบับ');
        const version = html.includes('ฉบับภายใน') ? 'internal' : 'customer';
        state.prints.push({ html, version });
        if (fail?.(version, state.prints.length)) throw new Error('Navigation timeout of 30000 ms exceeded');
        const sheets = sheetsOf(html);
        const over = fit?.(version, sheets) || {};
        return {
          buffer: fakePdf(sheets, tagOf(html), fonts),
          fit: Array.from({ length: sheets }, (_, i) => ({
            page: i + 1, height: 1123, rule: 1054, last: 900, lastBlock: 'p.note', body: 900, marks: {}, ...(over[i + 1] || {}),
          })),
          brokenImages: broken,
        };
      },
    };
  };
  return state;
}

const V_ONCE = new Set(['customerHtml', 'internalHtml', 'rendererVersion', 'frozenAt', 'customerPdfPath', 'internalPdfPath', 'supersededAt', 'supersededReason']);
const columnsOf = (text) => String(text).split(',').map((c) => c.trim().replace(/"/g, '')).filter(Boolean);
const pick = (row, columns) => Object.fromEntries(columnsOf(columns).map((c) => [c, row[c] === undefined ? null : row[c]]));

/**
 * ฐาน + ถังปลอม — ตาราง `service_survey_reports` พร้อมยามของ mig 0401 ② (คอลัมน์เติมได้ครั้งเดียว · ที่เหลือแก้ไม่ได้)
 * `intercept(call)` คืน `{ data, error }` = ตอบแทนของจริง · คืนค่าว่าง = ทำตามปกติ · โยนได้
 * `call` = `{ op: 'select' | 'update' | 'download' | 'upload', … }` — เก็บทุกตัวไว้ใน `calls`
 */
function fakeBackend(row, { images = [] } = {}) {
  const rows = new Map([[row.id, structuredClone(row)]]);
  const objects = new Map();
  for (const sha of images) objects.set(`img/${sha}.jpg`, { body: imageBytes(sha), contentType: 'image/jpeg' });
  const backend = { rows, objects, calls: [], intercept: null, emptyWrites: [] };
  const hooked = async (call) => {
    backend.calls.push(call);
    return backend.intercept ? backend.intercept(call) : null;
  };

  const query = (table, op, payload) => {
    const filters = [];
    let returning = op === 'select' ? payload : null;
    const q = {
      eq(column, value) { filters.push(['eq', column, value]); return q; },
      is(column, value) { filters.push(['is', column, value]); return q; },
      select(columns) { returning = columns; return q; },
      async maybeSingle() {
        const call = { op, table, columns: returning, filters, patch: op === 'update' ? payload : null };
        const override = await hooked(call);
        if (override) return override;
        if (table !== 'service_survey_reports') return { data: null, error: { message: `relation "${table}" does not exist` } };
        const match = [...rows.values()].filter((r) => filters.every(([kind, column, value]) => (
          kind === 'eq' ? r[column] === value : (r[column] ?? null) === value
        )));
        if (op === 'select') return { data: match[0] ? pick(match[0], returning) : null, error: null };
        for (const target of match) {
          for (const [key, value] of Object.entries(payload)) {
            if (value === '') backend.emptyWrites.push(key);
            if (key === 'status' || key === 'updatedAt') continue;
            const old = target[key] ?? null;
            if (old === value) continue;
            if (!V_ONCE.has(key) || old !== null) return { data: null, error: { message: `survey_report_immutable: ${target.docNo} ${key}` } };
          }
          Object.assign(target, payload);
        }
        return { data: match[0] ? pick(match[0], returning || 'id') : null, error: null };
      },
    };
    return q;
  };

  backend.supabase = {
    from: (table) => ({
      select: (columns) => query(table, 'select', columns),
      update: (patch) => query(table, 'update', patch),
      insert: () => { throw new Error('ขั้นกระดาษไม่มีสิทธิ์ insert'); },
      delete: () => { throw new Error('ขั้นกระดาษไม่มีสิทธิ์ delete'); },
    }),
    rpc: () => { throw new Error('ขั้นกระดาษไม่เรียก RPC'); },
    storage: {
      from: (bucket) => ({
        async download(path) {
          const override = await hooked({ op: 'download', bucket, path });
          if (override) return override;
          const hit = bucket === SURVEY_REPORT_BUCKET ? objects.get(path) : null;
          if (!hit) return { data: null, error: { message: 'Object not found', status: 400, statusCode: '404' } };
          return { data: new Blob([hit.body]), error: null };
        },
        async upload(path, body, options) {
          const override = await hooked({ op: 'upload', bucket, path, options });
          if (override) return override;
          if (objects.has(path)) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
          objects.set(path, { body: Buffer.from(body), contentType: options?.contentType });
          return { data: { path }, error: null };
        },
      }),
    },
  };
  backend.row = () => rows.get(row.id);
  backend.ops = (op) => backend.calls.filter((call) => call.op === op);
  backend.writes = () => backend.calls.filter((call) => call.op === 'update' || call.op === 'upload');
  return backend;
}

const twin = () => surveyReportInputsFromFixture(syntheticSurveyFixture());

/** แถวที่ออกเลขแล้ว (ยังไม่มีกระดาษ) + ถังที่มีรูปของภาพนิ่งครบ */
function setup({ inputs = twin(), row: over = {} } = {}) {
  const built = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  assert.equal(built.errors, undefined, (built.errors || []).join(' | '));
  const row = {
    id: REPORT_ID, requestId: 'DR-paper-1', baseNo: 'SU-26100001', rev: 0, docNo: DOC_NO, status: 'current',
    supersededAt: null, supersededReason: null, snapshot: built.snapshot, images: built.images,
    customerHtml: null, internalHtml: null, rendererVersion: null, frozenAt: null,
    customerPdfPath: null, internalPdfPath: null,
    approvedById: 'U-head', approvedByName: 'Head Approver', approvedAt: ANSWERED,
    issuedById: 'U-head', issuedByName: 'Head Approver', issuedAt: ISSUED, updatedAt: ISSUED,
    ...over,
  };
  const backend = fakeBackend(row, { images: built.images.map((image) => image.sha) });
  backend.snapshot = built.snapshot;
  backend.audits = [];
  return backend;
}

const USER = Object.freeze({ id: 'U-opener', name: 'Opener', role: 'ts_manager', team: 'SV' });

/** เรียกขั้นกระดาษด้วยของปลอมครบชุด — ด่านเขียนเปิด (เหมือน production) เว้นแต่เทสต์จะปิดเอง */
const run = (backend, renderer, opts = {}) => ensureSurveyReportPaper(backend.supabase, {
  reportId: REPORT_ID, user: USER, storeAllowed: true, loadRenderer: renderer.load,
  audit: async (entry) => { backend.audits.push(entry); }, now: () => NOW, log: () => {}, ...opts,
});

const stateOf = (backend) => surveyReportState({ answeredAt: ANSWERED }, [backend.row()]);
const pdfOf = (backend, version) => backend.objects.get(surveyReportPdfPath(REPORT_ID, version));

/** ปิดเสียง console ของกรณีที่ตั้งใจให้ล้ม — คืนข้อความที่ถูกเขียนไว้ให้ตรวจ */
function quiet(t) {
  const lines = [];
  for (const level of ['error', 'warn']) t.mock.method(console, level, (...args) => { lines.push(args.map(String).join(' ')); });
  return lines;
}

/** ของนอกที่ไม่ตอบเลย (ถัง · ฐาน · chromium · audit) — promise ที่ไม่มีวันจบ */
const HANG = new Promise(() => {});
/** เพดานต่อครั้งของเทสต์ที่จำลอง "ไม่ตอบ" — ของจริง 30 วิ */
const STALL_MS = 25;

/** ขั้นที่รอแบบไม่มีเพดานต้องตกเป็นเทสต์ที่ **ล้ม** พร้อมเหตุ ไม่ใช่เทสต์ที่ไม่จบ */
async function settled(promise, ms = 5_000) {
  let timer;
  const hung = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`ค้างเกิน ${ms} ms — มีการรอที่ไม่มีเพดาน`)), ms);
  });
  try { return await Promise.race([promise, hung]); } finally { clearTimeout(timer); }
}

/** นาฬิกาปลอมที่เทสต์เลื่อนเอง — งบของรอบ 60 วิ นับจาก NOW · `spend(ms)` = เวลาผ่านไป */
function budget(ms = 60_000) {
  const clock = { at: NOW, spend: (n) => { clock.at += n; } };
  clock.opts = { now: () => clock.at, deadline: NOW + ms };
  return clock;
}

/** ไล่ทุกคีย์ทุกชั้นของค่า — ใช้ตรวจว่า audit ไม่พกของต้องห้าม */
function deepKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => deepKeys(item, out));
  else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) { out.add(key); deepKeys(inner, out); }
  }
  return out;
}

/* ══ ① เส้นปกติ ══════════════════════════════════════════════════════════ */

test('แถวที่ยังไม่ตรึง: ขอแค่ฉบับลูกค้าก็พิมพ์ทั้งสองฉบับ → ตรึง → เก็บ PDF สองไฟล์ → ready', async () => {
  const backend = setup();
  const renderer = fakeRenderer();
  assert.equal(stateOf(backend), 'issued');

  const got = await run(backend, renderer, { want: 'customer' });
  assert.deepEqual(got, {
    state: 'ready', code: null, reasons: [], captured: ['customer', 'internal'], ready: { customer: true, internal: true },
  });
  assert.equal(stateOf(backend), 'ready');
  assert.deepEqual(renderer.prints.map((p) => p.version), ['customer', 'internal'], 'ฉบับลูกค้าก่อน แล้วฉบับภายใน');
  assert.deepEqual([renderer.loads, renderer.launches, renderer.closes], [1, 1, 1], 'เบราว์เซอร์เดียว เปิดเองปิดเอง');

  const row = backend.row();
  assert.equal(row.rendererVersion, SURVEY_REPORT_RENDERER_VERSION);
  assert.equal(row.frozenAt, new Date(NOW).toISOString());
  assert.equal(row.customerPdfPath, `pdf/${REPORT_ID}/customer.pdf`);
  assert.equal(row.internalPdfPath, `pdf/${REPORT_ID}/internal.pdf`);
  assert.equal(row.docNo, DOC_NO);
  assert.deepEqual(row.snapshot, backend.snapshot, 'ภาพนิ่งไม่ถูกแตะ');

  // HTML ที่ตรึงพก token — data URI อยู่แค่ในตัวที่ส่งให้ตัวพิมพ์
  for (const column of ['customerHtml', 'internalHtml']) {
    assert.ok(surveyReportImageShas(row[column]).length > 0, column);
    assert.equal(row[column].includes('data:image/jpeg;base64,'), false, `${column} ต้องไม่ฝังรูป`);
    assert.ok(row[column].includes(DOC_NO), `${column} ต้องพิมพ์เลขที่เอกสารของแถว`);
    // วันที่ออก = `issuedAt` ของแถว ตามเวลาไทย (01:30 ของวันที่ 1 ต.ค.) ไม่ใช่วันของ UTC
    assert.ok(row[column].includes('01/10/2026'), `${column} ต้องพิมพ์วันที่ออกตามเวลาไทย`);
  }
  for (const print of renderer.prints) assert.equal(print.html.includes('su-img:'), false, 'ตัวพิมพ์ต้องไม่ได้ token');
  assert.equal(sheetsOf(row.customerHtml), 4);
  assert.equal(sheetsOf(row.internalHtml), 6);

  // ตรึงครั้งเดียว ด้วยคำสั่งเดียว เมื่อ frozenAt ยังว่าง
  const updates = backend.ops('update');
  assert.equal(updates.length, 3);
  assert.deepEqual(Object.keys(updates[0].patch).sort(), ['customerHtml', 'frozenAt', 'internalHtml', 'rendererVersion', 'updatedAt']);
  assert.deepEqual(updates[0].filters, [['eq', 'id', REPORT_ID], ['is', 'frozenAt', null]]);
  assert.deepEqual(updates[1].filters, [['eq', 'id', REPORT_ID], ['is', 'customerPdfPath', null]]);
  assert.deepEqual(updates[2].filters, [['eq', 'id', REPORT_ID], ['is', 'internalPdfPath', null]]);
  for (const upload of backend.ops('upload')) {
    assert.equal(upload.bucket, SURVEY_REPORT_BUCKET);
    assert.deepEqual(upload.options, { contentType: 'application/pdf', upsert: false });
  }
  assert.deepEqual(backend.ops('upload').map((u) => u.path), [`pdf/${REPORT_ID}/customer.pdf`, `pdf/${REPORT_ID}/internal.pdf`]);
  assert.deepEqual(backend.emptyWrites, []);
});

test('audit ของกระดาษที่เก็บ: ขนาด · sha256 · จำนวนหน้า · ฟอนต์ ต่อฉบับ — ไม่พกแถว ภาพนิ่ง หรือ HTML', async () => {
  const backend = setup();
  const renderer = fakeRenderer();
  await run(backend, renderer);
  assert.equal(backend.audits.length, 1);
  const [entry] = backend.audits;
  assert.equal(entry.action, 'update');
  assert.equal(entry.entityType, 'service_survey_report');
  assert.equal(entry.entityId, REPORT_ID);
  assert.equal(entry.user, USER);
  assert.equal(entry.before, undefined);
  assert.match(entry.summary, new RegExp(`${DOC_NO} — ฉบับลูกค้า · ฉบับภายใน$`));
  assert.deepEqual(Object.keys(entry.after), ['id', 'docNo', 'rendererVersion', 'generator', 'customer', 'internal']);
  assert.equal(entry.after.rendererVersion, SURVEY_REPORT_RENDERER_VERSION);
  assert.equal(entry.after.generator, 'pdf-fake-v1');
  for (const [version, pages] of [['customer', 4], ['internal', 6]]) {
    const stored = pdfOf(backend, version).body;
    assert.deepEqual(entry.after[version], {
      bytes: stored.length, sha256: sha256(stored), pages, fonts: { names: ['Sarabun-Bold', 'Sarabun-Regular'], type3: 0 },
    });
  }
  const keys = deepKeys(entry);
  for (const banned of ['snapshot', 'customerHtml', 'internalHtml', 'images', 'html', 'buffer']) {
    assert.equal(keys.has(banned), false, `audit พก ${banned}`);
  }
  assert.ok(JSON.stringify(entry).length < 2000, 'audit ต้องเล็ก — ไม่มีก้อน HTML/ภาพนิ่งหลุดเข้าไป');
});

test('แถวที่กระดาษครบแล้ว: ไม่อ่านอะไรเพิ่ม ไม่เปิดเบราว์เซอร์ ไม่เขียน ไม่ลง audit', async () => {
  const backend = setup();
  await run(backend, fakeRenderer());
  backend.calls.length = 0;
  backend.audits.length = 0;
  const renderer = fakeRenderer();
  for (const want of ['customer', 'internal', 'both', undefined]) {
    assert.deepEqual(await run(backend, renderer, { want }), {
      state: 'ready', code: null, reasons: [], captured: [], ready: { customer: true, internal: true },
    });
  }
  assert.deepEqual([renderer.loads, renderer.launches, renderer.prints.length], [0, 0, 0]);
  assert.deepEqual(backend.calls.map((c) => c.op), ['select', 'select', 'select', 'select']);
  assert.deepEqual(backend.audits, []);
});

/** แถวที่ตรึงแล้วแต่ยังไม่มี PDF สักไฟล์ — รอบแรกอัปไม่ขึ้นทั้งสองฉบับ (§11 ข้อ 11) */
async function frozenWithoutPdf(t, inputs) {
  quiet(t);
  const backend = setup({ inputs });
  backend.intercept = (call) => (call.op === 'upload' ? { data: null, error: { message: 'fetch failed' } } : null);
  const first = await run(backend, fakeRenderer());
  assert.equal(first.state, 'frozen');
  assert.equal(first.code, 'store_failed');
  assert.deepEqual(first.captured, []);
  assert.equal(stateOf(backend), 'frozen');
  backend.intercept = null;
  backend.calls.length = 0;
  backend.audits.length = 0;
  return backend;
}

test('🔴 หลังตรึงแล้ว คำขอฉบับลูกค้าพิมพ์และเก็บเฉพาะฉบับลูกค้า — ไม่อ่าน internalHtml ไม่ดึงรูปจุด ไม่พิมพ์ฉบับภายใน', async (t) => {
  const { inputs, leak } = markedSurveyInputs();
  const backend = await frozenWithoutPdf(t, inputs);
  const frozen = structuredClone(backend.row());

  const renderer = fakeRenderer();
  const got = await run(backend, renderer, { want: 'customer' });
  assert.deepEqual(got, {
    state: 'frozen', code: null, reasons: [], captured: ['customer'], ready: { customer: true, internal: false },
  });
  assert.deepEqual(renderer.prints.map((p) => p.version), ['customer']);
  assert.equal(pdfOf(backend, 'internal'), undefined);
  assert.equal(backend.row().internalPdfPath, null);

  const selects = backend.ops('select').map((c) => c.columns);
  assert.equal(selects.length, 2);
  assert.equal(selects[1], '"customerHtml"', 'อ่านเฉพาะคอลัมน์ของฉบับที่ขอ');
  assert.equal(selects.some((columns) => columns.includes('internalHtml')), false);
  const downloaded = backend.ops('download').map((c) => c.path);
  for (const sha of [leak.spotPhotoSelectedSha, leak.spotPhotoThreeSha]) {
    assert.equal(downloaded.includes(`img/${sha}.jpg`), false, 'คำขอฉบับลูกค้าต้องไม่ดึงรูปจุด');
  }
  assert.deepEqual(Object.keys(backend.audits[0].after), ['id', 'docNo', 'rendererVersion', 'generator', 'customer']);

  // กระดาษที่ตรึงไม่ถูกแตะ — ไฟล์พิมพ์จากตัวที่ตรึง
  assert.equal(backend.row().customerHtml, frozen.customerHtml);
  assert.equal(backend.row().frozenAt, frozen.frozenAt);
  assert.equal(tagIn(pdfOf(backend, 'customer').body), tagOfStored(frozen.customerHtml));

  // รอบถัดไปขอฉบับภายใน — พิมพ์แค่ฉบับภายใน ฉบับลูกค้าที่เก็บแล้วไม่ถูกพิมพ์ซ้ำ
  const customerPdf = Buffer.from(pdfOf(backend, 'customer').body);
  const later = fakeRenderer();
  const second = await run(backend, later, { want: 'internal' });
  assert.deepEqual(second, {
    state: 'ready', code: null, reasons: [], captured: ['internal'], ready: { customer: true, internal: true },
  });
  assert.deepEqual(later.prints.map((p) => p.version), ['internal']);
  assert.deepEqual(pdfOf(backend, 'customer').body, customerPdf);
  assert.equal(tagIn(pdfOf(backend, 'internal').body), tagOfStored(frozen.internalHtml));
});

test('want: `internal` ตรงตัวเท่านั้นจึงได้ฉบับภายใน — พิมพ์ผิด/ค่าแปลกตกไปฉบับลูกค้า', async (t) => {
  for (const want of ['Internal', 'INTERNAL', 'internal ', '', null, 7, 'all']) {
    const backend = await frozenWithoutPdf(t);
    const renderer = fakeRenderer();
    const got = await run(backend, renderer, { want });
    assert.deepEqual(got.captured, ['customer'], String(want));
    assert.deepEqual(renderer.prints.map((p) => p.version), ['customer'], String(want));
  }
});

test('ฉบับที่ถูกแทนที่ระหว่างทางยังทำกระดาษให้จบได้ (§11 ข้อ 14) — ขั้นนี้ไม่ดูสถานะของแถว', async () => {
  const backend = setup({ row: { status: 'superseded', supersededAt: '2026-10-01T02:00:00+00:00', supersededReason: 'recall' } });
  const got = await run(backend, fakeRenderer());
  assert.equal(got.state, 'ready');
  assert.equal(backend.row().status, 'superseded');
});

/* ══ ② เดินต่อได้จากทุกขั้นที่ตาย ════════════════════════════════════════ */

const RESUME = [
  {
    name: 'P1 อ่านแถวไม่สำเร็จ',
    arm: (backend) => { backend.intercept = (call) => (call.op === 'select' ? { data: null, error: { message: 'fetch failed' } } : null); },
    want: { state: null, code: 'read_failed', left: 'issued' },
  },
  {
    name: 'P3 รูปหายจากถัง',
    arm: (backend) => {
      const key = [...backend.objects.keys()].find((k) => k.startsWith('img/'));
      const kept = backend.objects.get(key);
      backend.objects.delete(key);
      return () => backend.objects.set(key, kept);
    },
    want: { state: 'issued', code: 'image_missing', reason: SURVEY_REPORT_PAPER_REASONS.image_missing, left: 'issued', launches: 0 },
  },
  {
    name: 'P3 อ่านถังไม่สำเร็จ (ระบบ ไม่ใช่ไฟล์หาย)',
    arm: (backend) => { backend.intercept = (call) => (call.op === 'download' ? { data: null, error: { message: 'fetch failed', status: 503 } } : null); },
    want: { state: 'issued', code: 'storage_failed', left: 'issued', launches: 0 },
  },
  {
    name: 'P3 ถังโยน',
    arm: (backend) => { backend.intercept = (call) => { if (call.op === 'download') throw new Error('socket hang up'); return null; }; },
    want: { state: 'issued', code: 'storage_failed', left: 'issued', launches: 0 },
  },
  {
    name: 'P4 โหลดตัวพิมพ์ไม่ได้',
    renderer: () => fakeRenderer({ loadFail: true }),
    want: { state: 'issued', code: 'chromium_failed', left: 'issued' },
  },
  {
    name: 'P4 เปิดเบราว์เซอร์ไม่ขึ้น',
    renderer: () => fakeRenderer({ launchFail: true }),
    want: { state: 'issued', code: 'chromium_failed', left: 'issued' },
  },
  {
    name: 'P4 ฉบับภายในพิมพ์ไม่จบ (ฉบับลูกค้าพิมพ์ได้แล้ว)',
    renderer: () => fakeRenderer({ fail: (version) => version === 'internal' }),
    want: { state: 'issued', code: 'chromium_failed', left: 'issued' },
  },
  {
    name: 'P4 ฉบับภายในล้นเส้นท้ายกระดาษ',
    renderer: () => fakeRenderer({ fit: (version) => (version === 'internal' ? { 5: { last: 1066.5 } } : null) }),
    want: { state: 'issued', code: 'paper_failed', reason: /^ฉบับภายใน: หน้า 5 เนื้อหาเลยเส้นท้ายกระดาษ 12\.5px/, left: 'issued' },
  },
  {
    name: 'P4 ฉบับลูกค้ามีรูปที่ถอดรหัสไม่ได้',
    renderer: () => fakeRenderer({ broken: 1 }),
    want: { state: 'issued', code: 'paper_failed', reason: /^ฉบับลูกค้า: รูปถอดรหัสไม่ได้ 1 รูป/, left: 'issued' },
  },
  {
    name: 'P5 เขียนการตรึงไม่สำเร็จ',
    arm: (backend) => { backend.intercept = (call) => (call.op === 'update' && 'frozenAt' in call.patch ? { data: null, error: { message: 'canceling statement due to statement timeout' } } : null); },
    want: { state: 'issued', code: 'freeze_failed', left: 'issued' },
  },
  {
    name: 'P6 อัป PDF ฉบับลูกค้าไม่ขึ้น — ฉบับภายในยังเก็บได้',
    arm: (backend) => { backend.intercept = (call) => (call.op === 'upload' && call.path.endsWith('customer.pdf') ? { data: null, error: { message: 'Bad Gateway' } } : null); },
    want: { state: 'frozen', code: 'store_failed', reason: /^ฉบับลูกค้า: /, left: 'frozen', captured: ['internal'], reprint: ['customer'] },
  },
  {
    name: 'P6 ถังโยนตอนอัปฉบับภายใน — ฉบับลูกค้าเก็บได้แล้ว',
    arm: (backend) => { backend.intercept = (call) => { if (call.op === 'upload' && call.path.endsWith('internal.pdf')) throw new Error('socket hang up'); return null; }; },
    want: { state: 'frozen', code: 'store_failed', reason: /^ฉบับภายใน: /, left: 'frozen', captured: ['customer'], reprint: ['internal'] },
  },
  {
    name: 'P6 อัปขึ้นแล้วแต่เขียนที่อยู่ไฟล์ไม่สำเร็จ (§11 ข้อ 12)',
    arm: (backend) => { backend.intercept = (call) => (call.op === 'update' && 'customerPdfPath' in call.patch ? { data: null, error: { message: 'fetch failed' } } : null); },
    want: { state: 'frozen', code: 'store_failed', left: 'frozen', captured: ['internal'], reprint: ['customer'], keptObject: 'customer' },
  },
  {
    name: 'งบเวลาเหลือไม่ถึง 40 วิ — ไม่เปิด chromium',
    opts: { deadline: NOW + SURVEY_REPORT_PAPER_MIN_MS - 1 },
    want: { state: 'issued', code: 'timeout', left: 'issued', launches: 0 },
  },
  {
    name: 'งบเวลาเป็นจำนวน ms จากนี้ และไม่พอ',
    opts: { deadline: 39_999 },
    want: { state: 'issued', code: 'timeout', left: 'issued', launches: 0 },
  },

  /* ── 🔴 ของนอกที่ไม่ตอบ: จบที่เพดานต่อครั้ง ด้วยเหตุของขั้นนั้น (ลองใหม่ได้) — ไม่ค้างจนฟังก์ชันถูกตัด ── */
  {
    name: 'P1 ฐานไม่ตอบตอนอ่านแถว',
    arm: (backend) => { backend.intercept = (call) => (call.op === 'select' ? HANG : null); },
    opts: { callTimeoutMs: STALL_MS },
    want: { state: null, code: 'read_failed', left: 'issued', launches: 0 },
  },
  {
    name: 'P3 ถังไม่ตอบตอนอ่านรูป',
    arm: (backend) => { backend.intercept = (call) => (call.op === 'download' ? HANG : null); },
    opts: { callTimeoutMs: STALL_MS },
    want: { state: 'issued', code: 'storage_failed', left: 'issued', launches: 0 },
  },
  {
    name: 'P5 ฐานไม่ตอบตอนตรึง',
    arm: (backend) => { backend.intercept = (call) => (call.op === 'update' && 'frozenAt' in call.patch ? HANG : null); },
    opts: { callTimeoutMs: STALL_MS },
    want: { state: 'issued', code: 'freeze_failed', left: 'issued' },
  },
  {
    name: 'P6 ถังไม่ตอบตอนอัป PDF ฉบับลูกค้า — ฉบับภายในยังเก็บได้',
    arm: (backend) => { backend.intercept = (call) => (call.op === 'upload' && call.path.endsWith('customer.pdf') ? HANG : null); },
    opts: { callTimeoutMs: STALL_MS },
    want: { state: 'frozen', code: 'store_failed', reason: /^ฉบับลูกค้า: /, left: 'frozen', captured: ['internal'], reprint: ['customer'] },
  },
  {
    name: 'P6 ฐานไม่ตอบตอนเขียนที่อยู่ไฟล์ฉบับภายใน (ไฟล์อัปขึ้นแล้ว)',
    arm: (backend) => { backend.intercept = (call) => (call.op === 'update' && 'internalPdfPath' in call.patch ? HANG : null); },
    opts: { callTimeoutMs: STALL_MS },
    want: { state: 'frozen', code: 'store_failed', reason: /^ฉบับภายใน: /, left: 'frozen', captured: ['customer'], reprint: ['internal'], keptObject: 'internal' },
  },

  /* ── 🔴 งบของรอบ: เช็กซ้ำก่อนพิมพ์ฉบับถัดไปและก่อนเก็บ PDF แต่ละฉบับ — `timeout` พร้อมของที่เก็บไปแล้ว ── */
  {
    name: 'ถังไม่ตอบจนงบของรอบหมด (อ่านรูป) — timeout ไม่ใช่ storage_failed',
    arm: (backend) => { backend.intercept = (call) => (call.op === 'download' ? HANG : null); },
    opts: { deadline: NOW + STALL_MS },
    want: { state: 'issued', code: 'timeout', reason: SURVEY_REPORT_PAPER_REASONS.timeout, left: 'issued', launches: 0 },
  },
  {
    name: 'ฉบับลูกค้าพิมพ์กินงบจนเหลือไม่ถึง 15 วิ — ไม่พิมพ์ฉบับภายใน ไม่ตรึง',
    make: () => {
      const clock = budget();
      return {
        opts: clock.opts,
        renderer: () => fakeRenderer({ fail: (version) => { if (version === 'customer') clock.spend(60_000 - SURVEY_REPORT_PRINT_MIN_MS + 1); return false; } }),
      };
    },
    want: { state: 'issued', code: 'timeout', reason: /^ฉบับภายใน: เวลาไม่พอ/, left: 'issued', prints: ['customer'] },
  },
  {
    name: 'พิมพ์ครบสองฉบับแต่งบเหลือไม่ถึง 5 วิ — ตรึงแล้ว PDF ค้างไว้ทั้งสองฉบับ',
    make: () => {
      const clock = budget();
      return {
        opts: clock.opts,
        renderer: () => fakeRenderer({ fail: (version) => { if (version === 'internal') clock.spend(60_000 - SURVEY_REPORT_STORE_MIN_MS + 1); return false; } }),
      };
    },
    want: { state: 'frozen', code: 'timeout', reason: /^ฉบับลูกค้า: เวลาไม่พอ/, left: 'frozen', uploads: 0, reprint: ['customer', 'internal'] },
  },
  {
    name: 'งบหมดหลังเก็บ PDF ฉบับลูกค้า — ฉบับภายในค้างไว้',
    make: () => {
      const clock = budget();
      return {
        opts: clock.opts,
        arm: (backend) => {
          backend.intercept = (call) => { if (call.op === 'update' && 'customerPdfPath' in call.patch) clock.spend(60_000 - SURVEY_REPORT_STORE_MIN_MS + 1); return null; };
        },
      };
    },
    want: { state: 'frozen', code: 'timeout', reason: /^ฉบับภายใน: เวลาไม่พอ/, left: 'frozen', captured: ['customer'], uploads: 1, reprint: ['internal'] },
  },
];

for (const step of RESUME) {
  test(`เดินต่อได้: ${step.name} → รอบถัดไปจบที่ ready ด้วยเลขเดิม`, async (t) => {
    quiet(t);
    const backend = setup();
    const made = step.make ? step.make() : step; // `make` = ขั้นที่ arm · ตัวพิมพ์ · ตัวเลือก ต้องใช้นาฬิกาเรือนเดียวกัน
    const restore = made.arm?.(backend);
    const renderer = made.renderer ? made.renderer() : fakeRenderer();

    const first = await settled(run(backend, renderer, made.opts || {}));
    assert.equal(first.state, step.want.state);
    assert.equal(first.code, step.want.code);
    assert.ok(first.reasons.length > 0 && first.reasons.every((r) => typeof r === 'string' && r.trim()), 'ต้องมีเหตุเป็นข้อความไทย');
    if (typeof step.want.reason === 'string') assert.deepEqual(first.reasons, [step.want.reason]);
    else if (step.want.reason) assert.match(first.reasons[0], step.want.reason);
    assert.deepEqual(first.captured, step.want.captured || []);
    assert.equal(stateOf(backend), step.want.left, 'สถานะที่เหลือบนแถว');
    if (step.want.launches !== undefined) assert.equal(renderer.launches, step.want.launches);
    if (step.want.prints) assert.deepEqual(renderer.prints.map((p) => p.version), step.want.prints);
    if (step.want.uploads !== undefined) assert.equal(backend.ops('upload').length, step.want.uploads, 'งบไม่พอ = ไม่เริ่มอัป');
    assert.equal(renderer.closes, renderer.opened, 'เบราว์เซอร์ที่เปิดต้องถูกปิดแม้ล้ม');

    if (step.want.left === 'issued') {
      // ฉบับใดฉบับหนึ่งไม่ผ่าน = ไม่ตรึง ไม่เก็บอะไรทั้งสิ้น
      const row = backend.row();
      for (const column of ['customerHtml', 'internalHtml', 'rendererVersion', 'frozenAt', 'customerPdfPath', 'internalPdfPath']) {
        assert.equal(row[column], null, column);
      }
      assert.equal([...backend.objects.keys()].some((key) => key.startsWith('pdf/')), false);
      assert.deepEqual(backend.audits, []);
    }
    const frozen = structuredClone(backend.row());
    const kept = step.want.keptObject ? Buffer.from(pdfOf(backend, step.want.keptObject).body) : null;

    // ── รอบถัดไป: ไม่มีอะไรขวางแล้ว ──
    backend.intercept = null;
    restore?.();
    backend.calls.length = 0;
    const again = fakeRenderer();
    const second = await run(backend, again);
    assert.deepEqual(second.ready, { customer: true, internal: true });
    assert.equal(second.state, 'ready');
    assert.equal(second.code, null);
    assert.equal(stateOf(backend), 'ready');

    const row = backend.row();
    assert.equal(row.docNo, DOC_NO, 'เลขเดิม');
    assert.deepEqual(backend.emptyWrites, [], 'ไม่มีวันเขียน \'\' ลงคอลัมน์ที่เขียนได้ครั้งเดียว');
    if (step.want.left === 'frozen') {
      // กระดาษที่ตรึงไปแล้วไม่ถูกเขียนซ้ำ · ฉบับที่เก็บแล้วไม่ถูกพิมพ์ซ้ำ
      for (const column of ['customerHtml', 'internalHtml', 'rendererVersion', 'frozenAt']) assert.equal(row[column], frozen[column], column);
      assert.deepEqual(again.prints.map((p) => p.version), step.want.reprint);
      assert.equal(backend.ops('update').some((call) => 'frozenAt' in call.patch), false);
    }
    if (kept) {
      // ไฟล์ที่อัปขึ้นไปแล้วคือของจริง — รอบสองเจอ "มีอยู่แล้ว" แล้วเขียนที่อยู่ ไม่เขียนทับ
      assert.deepEqual(pdfOf(backend, step.want.keptObject).body, kept);
      assert.deepEqual(second.captured, [step.want.keptObject]);
      assert.deepEqual(backend.audits.at(-1).after[step.want.keptObject], { existed: true });
    }
    for (const version of SURVEY_REPORT_VERSIONS) {
      assert.equal(tagIn(pdfOf(backend, version).body), tagOfStored(row[`${version}Html`]), `${version}: ไฟล์ต้องพิมพ์จากกระดาษที่ตรึง`);
    }
  });
}

test('ไม่พบแถว · ไม่ส่ง reportId = read_failed ไม่เขียนอะไร', async () => {
  const backend = setup();
  const renderer = fakeRenderer();
  const gone = await run(backend, renderer, { reportId: 'SVR-ไม่มี' });
  assert.deepEqual(gone, {
    state: null, code: 'read_failed', reasons: [SURVEY_REPORT_PAPER_REASONS.not_found], captured: [], ready: { customer: false, internal: false },
  });
  const none = await run(backend, renderer, { reportId: null });
  assert.equal(none.code, 'read_failed');
  assert.equal(backend.writes().length, 0);
  assert.equal(renderer.launches, 0);
});

test('แผนหน้าที่ล้น (ของชิ้นเดียวสูงกว่าหน้า) = paper_failed ก่อนถึงถังและ chromium', async (t) => {
  quiet(t);
  const backend = setup();
  const row = backend.row();
  // ชื่อพื้นที่ยาวผิดปกติจนแถวตารางสูงกว่าหน้า — แก้ที่ภาพนิ่งของแถวปลอมตรง ๆ
  const zone = row.snapshot.zones.find((z) => z.status !== 'cut');
  zone.name = 'พื้นที่ชื่อยาว '.repeat(1200);
  const overflow = SURVEY_REPORT_VERSIONS.flatMap((version) => paginateSurveyReport(surveyReportView(row.snapshot, { version })).overflow);
  assert.ok(overflow.length > 0, 'ชุดทดสอบต้องล้นจริง');

  const renderer = fakeRenderer();
  const got = await run(backend, renderer);
  assert.equal(got.code, 'paper_failed');
  assert.match(got.reasons[0], /^ฉบับ(ลูกค้า|ภายใน): หน้า \d+ .*สูงเกินหน้ากระดาษ/);
  assert.equal(backend.ops('download').length, 0);
  assert.equal(renderer.launches, 0);
  assert.equal(backend.writes().length, 0);
});

test('ภาพนิ่งที่อ่านไม่ได้ · ตัวเรนเดอร์โยน · ตัวเรนเดอร์คืนค่าว่าง = paper_failed ไม่ตรึงกระดาษเปล่า', async (t) => {
  quiet(t);
  for (const snapshot of [null, 'x', {}, { zones: null }]) {
    const backend = setup();
    backend.row().snapshot = snapshot;
    const got = await run(backend, fakeRenderer());
    assert.equal(got.code, 'paper_failed', JSON.stringify(snapshot));
    assert.equal(backend.writes().length, 0);
  }
  // แถวที่ไม่มีเลขที่หรือวันที่ออก (ฐานไม่ยอมให้เกิด) — ไม่ตรึงกระดาษที่พิมพ์ขีดแทนเลข
  for (const over of [{ docNo: null }, { docNo: '' }, { issuedAt: null }]) {
    const backend = setup();
    Object.assign(backend.row(), over);
    const renderer = fakeRenderer();
    const got = await run(backend, renderer);
    assert.equal(got.code, 'paper_failed', JSON.stringify(over));
    assert.equal(renderer.launches, 0);
    assert.equal(backend.writes().length, 0);
  }
  for (const renderHtml of [() => { throw new Error('boom'); }, () => '', () => '   ', () => null]) {
    const backend = setup();
    const renderer = fakeRenderer();
    const got = await run(backend, renderer, { renderHtml });
    assert.equal(got.code, 'paper_failed');
    assert.equal(got.reasons.length, 2, 'บอกทั้งสองฉบับ');
    assert.equal(renderer.launches, 0);
    assert.equal(backend.writes().length, 0);
  }
});

test('ไม่โยน: supabase ที่โยนทุกคำสั่ง · ไม่มี supabase · ไม่ส่งอะไรเลย', async (t) => {
  quiet(t);
  const boom = { from: () => { throw new Error('boom'); }, storage: { from: () => { throw new Error('boom'); } } };
  const expected = { state: null, code: 'paper_failed', reasons: [SURVEY_REPORT_PAPER_REASONS.paper_failed], captured: [], ready: { customer: false, internal: false } };
  assert.deepEqual(await ensureSurveyReportPaper(boom, { reportId: REPORT_ID, storeAllowed: true, loadRenderer: fakeRenderer().load }), expected);
  assert.deepEqual(await ensureSurveyReportPaper(null, { reportId: REPORT_ID }), expected);
  assert.equal((await ensureSurveyReportPaper(null)).code, 'read_failed');
  assert.equal((await ensureSurveyReportPaper(null, null)).code, 'read_failed');
});

test('audit ที่โยนไม่ทำให้ขั้นกระดาษล้ม · รอบที่ไม่ได้เขียนอะไรไม่ลง audit', async (t) => {
  quiet(t);
  const backend = setup();
  const got = await run(backend, fakeRenderer(), { audit: async () => { throw new Error('audit down'); } });
  assert.equal(got.state, 'ready');
  assert.equal(got.code, null);

  const failing = setup();
  await run(failing, fakeRenderer({ broken: 2 }));
  assert.deepEqual(failing.audits, []);
});

test('ตรึงได้แต่ยังไม่มี PDF สักไฟล์: audit บอกว่าตรึงแล้ว (ใครตรึง เมื่อไร ด้วยตัวเรนเดอร์รุ่นไหน)', async (t) => {
  quiet(t);
  const backend = setup();
  backend.intercept = (call) => (call.op === 'upload' ? { data: null, error: { message: 'fetch failed' } } : null);
  await run(backend, fakeRenderer());
  assert.equal(backend.audits.length, 1);
  assert.match(backend.audits[0].summary, /ตรึงแล้ว ยังไม่มี PDF$/);
  assert.deepEqual(Object.keys(backend.audits[0].after), ['id', 'docNo', 'rendererVersion', 'generator']);
});

test('ข้อที่ลง log อย่างเดียวไม่กันการตรึง: เหลือที่ใต้เนื้อหาน้อยกว่า 8px · ฟอนต์นอกจาก Sarabun (มติ 4)', async (t) => {
  const lines = quiet(t);
  const backend = setup();
  const renderer = fakeRenderer({
    fit: (version) => (version === 'customer' ? { 2: { last: 1050 } } : null),
    fonts: ['AAAAAA+Sarabun-Regular', 'CCCCCC+OpenSans-Regular'],
  });
  const got = await run(backend, renderer);
  assert.equal(got.state, 'ready');
  assert.ok(lines.some((line) => /ฉบับลูกค้า — หน้า 2 เหลือที่ใต้เนื้อหา 4px/.test(line)));
  assert.ok(lines.some((line) => /ฟอนต์นอกจาก Sarabun — OpenSans-Regular/.test(line)));
});

test('แถวที่ตรึงแล้วแต่พิมพ์ออกมามีข้อกัน: ไม่เก็บ PDF ฉบับนั้น — อีกฉบับยังเก็บได้', async (t) => {
  const backend = await frozenWithoutPdf(t);
  const renderer = fakeRenderer({ fit: (version) => (version === 'customer' ? { 1: { rule: null } } : null) });
  const got = await run(backend, renderer, { want: 'both' });
  assert.equal(got.state, 'frozen');
  assert.equal(got.code, 'paper_failed');
  assert.deepEqual(got.reasons, ['ฉบับลูกค้า: หน้า 1 ไม่มีเส้นท้ายกระดาษ']);
  assert.deepEqual(got.captured, ['internal']);
  assert.deepEqual(got.ready, { customer: false, internal: true });
  assert.equal(pdfOf(backend, 'customer'), undefined);
});

test('แถวที่ตรึงแล้วแต่คอลัมน์ HTML ว่าง (แก้มือ): ไม่พิมพ์กระดาษเปล่า', async (t) => {
  const backend = await frozenWithoutPdf(t);
  backend.row().customerHtml = null;
  const renderer = fakeRenderer();
  const got = await run(backend, renderer, { want: 'customer' });
  assert.equal(got.code, 'paper_failed');
  assert.match(got.reasons[0], /^ฉบับลูกค้า: กระดาษที่ตรึงไว้ว่าง/);
  assert.equal(renderer.launches, 0);
  assert.equal(backend.writes().length, 0);
});

/* ══ ③ แข่งกัน · "มีอยู่แล้ว" ════════════════════════════════════════════ */

/** อีกคำขอตรึงไปก่อน ระหว่างที่รอบนี้กำลังจะเขียนการตรึง — `mutate(html)` แปลงกระดาษของผู้ชนะ */
function loseFreezeRace(backend, mutate = (html) => html) {
  let done = false;
  backend.intercept = (call) => {
    if (done || call.op !== 'update' || !('frozenAt' in call.patch)) return null;
    done = true;
    Object.assign(backend.row(), {
      customerHtml: mutate(call.patch.customerHtml, 'customer'),
      internalHtml: mutate(call.patch.internalHtml, 'internal'),
      rendererVersion: 'fm-ts-01@winner',
      frozenAt: '2026-09-30T18:30:59.000+00:00',
    });
    return null; // ปล่อยให้คำสั่งของรอบนี้วิ่งต่อ — `frozenAt` ไม่ว่างแล้ว ⇒ ไม่มีแถวถูกเขียน
  };
}

test('แพ้การตรึง แต่กระดาษตรงกันทุกตัวอักษร: ใช้ PDF ที่พิมพ์ไว้ ไม่พิมพ์ซ้ำ ไม่เขียนทับกระดาษของผู้ชนะ', async () => {
  const backend = setup();
  loseFreezeRace(backend);
  const renderer = fakeRenderer();
  const got = await run(backend, renderer);
  assert.deepEqual(got, {
    state: 'ready', code: null, reasons: [], captured: ['customer', 'internal'], ready: { customer: true, internal: true },
  });
  assert.equal(renderer.prints.length, 2);
  const row = backend.row();
  assert.equal(row.rendererVersion, 'fm-ts-01@winner');
  assert.equal(row.frozenAt, '2026-09-30T18:30:59.000+00:00');
  assert.equal(backend.audits[0].after.rendererVersion, 'fm-ts-01@winner', 'audit บอกรุ่นของกระดาษที่ตรึงจริง');
  for (const version of SURVEY_REPORT_VERSIONS) assert.equal(tagIn(pdfOf(backend, version).body), tagOfStored(row[`${version}Html`]));
});

test('🔴 แพ้การตรึง และกระดาษของผู้ชนะต่างจากของเรา: ทิ้ง PDF ของเรา พิมพ์ใหม่จากกระดาษของผู้ชนะ', async () => {
  const backend = setup();
  // deploy อีกรุ่นเรนเดอร์ต่างไปนิดเดียว (จำนวนแผ่นเท่าเดิม) — ทั้งสองฉบับ
  loseFreezeRace(backend, (html) => html.replace('</body>', '<!-- winner --></body>'));
  const renderer = fakeRenderer();
  const got = await run(backend, renderer);
  assert.equal(got.state, 'ready');
  assert.equal(got.code, null);
  assert.deepEqual(renderer.prints.map((p) => p.version), ['customer', 'internal', 'customer', 'internal']);
  const row = backend.row();
  assert.ok(row.customerHtml.includes('<!-- winner -->') && row.internalHtml.includes('<!-- winner -->'));
  for (const version of SURVEY_REPORT_VERSIONS) {
    const stored = tagIn(pdfOf(backend, version).body);
    assert.equal(stored, tagOfStored(row[`${version}Html`]), `${version}: ไฟล์ต้องเป็นของกระดาษที่ตรึงจริง`);
    assert.equal(stored, tagOf(renderer.prints.filter((p) => p.version === version)[1].html));
    assert.notEqual(stored, tagOf(renderer.prints.filter((p) => p.version === version)[0].html), `${version}: PDF ของกระดาษที่แพ้ต้องไม่ถูกเก็บ`);
  }
  assert.deepEqual(backend.emptyWrites, []);
});

test('แพ้การตรึง กระดาษของผู้ชนะต่าง และขอแค่ฉบับลูกค้า: พิมพ์ใหม่เฉพาะฉบับลูกค้า — ฉบับภายในรอคนที่ขอ', async () => {
  const backend = setup();
  loseFreezeRace(backend, (html) => html.replace('</body>', '<!-- winner --></body>'));
  const renderer = fakeRenderer();
  const got = await run(backend, renderer, { want: 'customer' });
  assert.deepEqual(got, {
    state: 'frozen', code: null, reasons: [], captured: ['customer'], ready: { customer: true, internal: false },
  });
  assert.deepEqual(renderer.prints.map((p) => p.version), ['customer', 'internal', 'customer']);
  assert.equal(pdfOf(backend, 'internal'), undefined);
});

test('ตรึงไม่ลงแถว ทั้งที่ยังไม่มีใครตรึง (แถวหายกลางทาง) = freeze_failed ไม่เก็บ PDF', async (t) => {
  quiet(t);
  const backend = setup();
  backend.intercept = (call) => (call.op === 'update' && 'frozenAt' in call.patch ? { data: null, error: null } : null);
  const got = await run(backend, fakeRenderer());
  assert.equal(got.code, 'freeze_failed');
  assert.equal(got.state, 'issued');
  assert.equal(backend.ops('upload').length, 0);
});

test('สองคำขอพร้อมกัน: ตรึงครั้งเดียว ไฟล์ชุดเดียว ทั้งคู่จบที่ ready', async () => {
  const backend = setup();
  const a = fakeRenderer();
  const b = fakeRenderer();
  const [first, second] = await Promise.all([run(backend, a), run(backend, b)]);
  assert.equal(first.state, 'ready');
  assert.equal(second.state, 'ready');
  assert.equal(first.code, null);
  assert.equal(second.code, null);
  assert.equal(stateOf(backend), 'ready');

  const freezes = backend.calls.filter((call) => call.op === 'update' && 'frozenAt' in call.patch);
  assert.equal(freezes.length, 2, 'ทั้งสองลองตรึง');
  const row = backend.row();
  assert.equal([...backend.objects.keys()].filter((key) => key.startsWith('pdf/')).length, 2);
  // แต่ละฉบับถูกนับว่า "รอบนี้เก็บ" โดยคำขอเดียวเท่านั้น
  for (const version of SURVEY_REPORT_VERSIONS) {
    assert.equal([first, second].filter((r) => r.captured.includes(version)).length, 1, version);
    assert.equal(tagIn(pdfOf(backend, version).body), tagOfStored(row[`${version}Html`]));
  }
  assert.deepEqual(backend.emptyWrites, []);
});

test('"มีอยู่แล้ว" ตอนอัป PDF = สำเร็จ: เขียนที่อยู่ไฟล์ ไม่เขียนทับไฟล์ · audit ไม่อ้าง sha ของไฟล์ที่ตัวเองไม่ได้เก็บ', async (t) => {
  const backend = await frozenWithoutPdf(t);
  const earlier = Buffer.from('%PDF-1.4 ไฟล์ของรอบก่อน');
  backend.objects.set(surveyReportPdfPath(REPORT_ID, 'customer'), { body: earlier, contentType: 'application/pdf' });

  const got = await run(backend, fakeRenderer(), { want: 'customer' });
  assert.deepEqual(got, {
    state: 'frozen', code: null, reasons: [], captured: ['customer'], ready: { customer: true, internal: false },
  });
  assert.deepEqual(pdfOf(backend, 'customer').body, earlier);
  assert.equal(backend.row().customerPdfPath, `pdf/${REPORT_ID}/customer.pdf`);
  assert.deepEqual(backend.audits[0].after.customer, { existed: true });
});

test('อีกคำขอเขียนที่อยู่ไฟล์ไปก่อน (ไม่มีแถวถูกเขียน): ฉบับนั้นพร้อมแล้ว แต่ไม่นับว่ารอบนี้เก็บ', async (t) => {
  const backend = await frozenWithoutPdf(t);
  backend.intercept = (call) => {
    if (call.op !== 'update' || !('customerPdfPath' in call.patch)) return null;
    backend.row().customerPdfPath = call.patch.customerPdfPath; // ผู้ชนะเขียนที่อยู่เดียวกัน
    return null;
  };
  const got = await run(backend, fakeRenderer(), { want: 'customer' });
  assert.deepEqual(got, {
    state: 'frozen', code: null, reasons: [], captured: [], ready: { customer: true, internal: false },
  });
  assert.deepEqual(backend.audits, []);
});

/* ══ ④ เขียนของถาวรได้บน production เท่านั้น ═════════════════════════════ */

test('🔴 ด่านเขียนปิด: not_production ก่อนเขียนอะไร — ไม่ดึงรูป ไม่เปิด chromium ไม่ตรึง ไม่อัป', async () => {
  const saved = process.env.VERCEL_ENV;
  try {
    for (const env of [undefined, 'preview', 'development', 'Production']) {
      if (env === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = env;
      const backend = setup();
      const renderer = fakeRenderer();
      // ไม่ส่ง `storeAllowed` = อ่านจาก env จริง
      const got = await run(backend, renderer, { storeAllowed: undefined });
      assert.deepEqual(got, {
        state: 'issued', code: 'not_production', reasons: [SURVEY_REPORT_NOT_PRODUCTION], captured: [], ready: { customer: false, internal: false },
      }, String(env));
      assert.deepEqual(backend.calls.map((c) => c.op), ['select'], String(env));
      assert.deepEqual([renderer.loads, renderer.launches], [0, 0]);
      assert.deepEqual(backend.audits, []);
    }
    // production เท่านั้นที่เขียน
    process.env.VERCEL_ENV = 'production';
    const live = setup();
    assert.equal((await run(live, fakeRenderer(), { storeAllowed: undefined })).state, 'ready');
  } finally {
    if (saved === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = saved;
  }
});

test('ด่านเขียนต้องเป็น true ตรงตัว · แถวที่ตรึงแล้วก็ไม่พิมพ์ไม่อัปนอก production · แถวที่ครบแล้วยังตอบได้', async (t) => {
  for (const storeAllowed of [false, null, 1, 'true', 'production']) {
    const backend = setup();
    const got = await run(backend, fakeRenderer(), { storeAllowed });
    assert.equal(got.code, 'not_production', String(storeAllowed));
    assert.equal(backend.writes().length, 0);
  }
  const frozen = await frozenWithoutPdf(t);
  const renderer = fakeRenderer();
  const blocked = await run(frozen, renderer, { storeAllowed: false, want: 'customer' });
  assert.equal(blocked.code, 'not_production');
  assert.equal(blocked.state, 'frozen');
  assert.equal(renderer.launches, 0);
  assert.equal(frozen.writes().length, 0);

  const ready = setup();
  await run(ready, fakeRenderer());
  const served = await run(ready, fakeRenderer(), { storeAllowed: false });
  assert.equal(served.code, null);
  assert.equal(served.state, 'ready');
});

/* ══ ⑤ รั่ว ══════════════════════════════════════════════════════════════ */

/** sha ที่ฉบับลูกค้าพิมพ์ได้ (ภาพกว้าง/ภาพผังของพื้นที่ที่ไม่ถูกตัด) และ sha ที่เป็นรูปจุดอย่างเดียว */
function shaSets(snapshot) {
  const allowed = new Set();
  const spots = new Set();
  for (const zone of snapshot.zones) {
    if ((zone.status || 'ok') !== 'cut') {
      for (const img of [...(zone.wide || []), ...(zone.plan || [])]) if (img?.sha) allowed.add(img.sha);
    }
    for (const spot of zone.spots || []) for (const img of spot.photos || []) if (img?.sha) spots.add(img.sha);
  }
  return { allowed, spotOnly: [...spots].filter((sha) => !allowed.has(sha)) };
}

test('🔴 รั่ว ①: customerHtml ที่เก็บลงแถวไม่มีเครื่องหมายของช่องภายในสักตัว และ sha ทุกตัวอยู่ในชุดที่ฉบับลูกค้าพิมพ์ได้', async () => {
  const { inputs, leak, allowed } = markedSurveyInputs();
  const backend = setup({ inputs });
  const got = await run(backend, fakeRenderer());
  assert.equal(got.state, 'ready');

  const { customerHtml, internalHtml } = backend.row();
  for (const [key, marker] of Object.entries(leak)) {
    assert.equal(customerHtml.includes(marker), false, `customerHtml รั่ว ${key} (${marker})`);
  }
  for (const word of ['ฉบับภายใน', 'ห้ามส่งลูกค้า', 'ภาคผนวก', 'จุดที่ติดตั้งได้', 'class="band"', 'ipanel']) {
    assert.equal(customerHtml.includes(word), false, `customerHtml มีชิ้นของฉบับภายใน: ${word}`);
  }
  // กันผ่านเพราะกระดาษว่าง — ของที่ลูกค้าต้องเห็นอยู่ครบ และฉบับภายในมีของภายในจริง
  for (const [key, marker] of Object.entries(allowed)) assert.equal(customerHtml.includes(marker), true, `customerHtml ขาด ${key}`);
  assert.ok(internalHtml.includes(leak.spotSelected) && internalHtml.includes('ฉบับภายใน'));

  const sets = shaSets(backend.snapshot);
  const shas = surveyReportImageShas(customerHtml);
  assert.ok(shas.length > 0);
  for (const sha of shas) assert.ok(sets.allowed.has(sha), `sha นอกชุดที่อนุญาต ${sha.slice(0, 12)}`);
  assert.ok(sets.spotOnly.length > 0, 'ชุดทดสอบต้องมีรูปจุดจริง');
  assert.ok(surveyReportImageShas(internalHtml).includes(leak.spotPhotoSelectedSha));
});

test('🔴 รั่ว ②: HTML ที่ส่งให้ตัวพิมพ์ของฉบับลูกค้าไม่มีรูปที่เป็นรูปจุดอย่างเดียว', async () => {
  const { inputs } = markedSurveyInputs();
  const backend = setup({ inputs });
  const renderer = fakeRenderer();
  await run(backend, renderer);
  const { allowed, spotOnly } = shaSets(backend.snapshot);
  const customer = renderer.prints.find((p) => p.version === 'customer').html;
  const internal = renderer.prints.find((p) => p.version === 'internal').html;
  assert.ok(spotOnly.length > 0);
  for (const sha of spotOnly) assert.equal(customer.includes(dataUri(sha)), false, `ฉบับลูกค้าได้รูปจุด ${sha.slice(0, 12)}`);
  // กันผ่านเพราะไม่มีรูปเลย: ฉบับลูกค้ามีรูปที่อนุญาต และฉบับภายในมีรูปจุดจริง
  assert.ok([...allowed].some((sha) => customer.includes(dataUri(sha))));
  assert.ok(spotOnly.some((sha) => internal.includes(dataUri(sha))));
});

test('🔴 รั่ว ②: ไฟล์เดียวที่เป็นทั้งรูปจุดของพื้นที่หนึ่งและภาพกว้างของอีกพื้นที่ ยังตรึงและเก็บได้', async () => {
  const { inputs } = markedSurveyInputs();
  const shared = inputs.imageByAttId['mk-z3-w1'];
  inputs.imageByAttId = { ...inputs.imageByAttId, 'mk-z1-s-sel': { ...shared } };
  const backend = setup({ inputs });
  assert.ok(backend.snapshot.zones.some((z) => z.spots.some((s) => s.photos.some((img) => img.sha === shared.sha))), 'sha นี้เป็นรูปจุดด้วยจริง');

  const renderer = fakeRenderer();
  const got = await run(backend, renderer);
  assert.equal(got.state, 'ready');
  assert.equal(got.code, null);
  const customer = renderer.prints.find((p) => p.version === 'customer').html;
  assert.ok(customer.includes(dataUri(shared.sha)), 'ฉบับลูกค้าพิมพ์ไฟล์นี้ในฐานะภาพกว้างได้โดยชอบ');
  for (const sha of shaSets(backend.snapshot).spotOnly) assert.equal(customer.includes(dataUri(sha)), false);
});

test('🔴 รั่ว ④ (ผูกฝั่งเขียน): ไฟล์ที่ customer.pdf พกป้ายของ customerHtml ที่เก็บ · internal.pdf ของ internalHtml · คอลัมน์ชี้ไฟล์ของตัวเอง', async () => {
  const { inputs } = markedSurveyInputs();
  const backend = setup({ inputs });
  await run(backend, fakeRenderer());
  const row = backend.row();

  const customerTag = tagIn(pdfOf(backend, 'customer').body);
  const internalTag = tagIn(pdfOf(backend, 'internal').body);
  assert.equal(customerTag, tagOfStored(row.customerHtml));
  assert.equal(internalTag, tagOfStored(row.internalHtml));
  assert.notEqual(customerTag, internalTag);
  assert.notEqual(customerTag, tagOfStored(row.internalHtml), 'customer.pdf ต้องไม่ใช่ไฟล์ของฉบับภายใน');

  assert.equal(row.customerPdfPath, surveyReportPdfPath(REPORT_ID, 'customer'));
  assert.equal(row.internalPdfPath, surveyReportPdfPath(REPORT_ID, 'internal'));
  assert.equal(row.customerPdfPath, `pdf/${REPORT_ID}/customer.pdf`);
  assert.equal(row.internalPdfPath, `pdf/${REPORT_ID}/internal.pdf`);
  assert.equal(row.customerHtml.includes('ฉบับภายใน'), false);
  assert.equal(row.internalHtml.includes('ฉบับภายใน'), true);

  // จำนวนหน้าใน audit ตรงกับไฟล์ของฉบับนั้น (ฉบับภายในยาวกว่าเสมอ — มีภาคผนวก)
  const { after } = backend.audits[0];
  assert.equal(after.customer.pages, sheetsOf(row.customerHtml));
  assert.equal(after.internal.pages, sheetsOf(row.internalHtml));
  assert.ok(after.internal.pages > after.customer.pages);
  assert.equal(after.customer.sha256, sha256(pdfOf(backend, 'customer').body));
  assert.equal(after.internal.sha256, sha256(pdfOf(backend, 'internal').body));
});

test('🔴 รั่ว ④: ผูกฝั่งเขียนยังถูกเมื่อเก็บทีละฉบับคนละรอบ และเมื่อขอฉบับภายในก่อน', async (t) => {
  const backend = await frozenWithoutPdf(t, markedSurveyInputs().inputs);
  await run(backend, fakeRenderer(), { want: 'internal' });
  assert.equal(backend.row().customerPdfPath, null);
  assert.equal(pdfOf(backend, 'customer'), undefined, 'คำขอฉบับภายในต้องไม่เขียน customer.pdf');
  await run(backend, fakeRenderer(), { want: 'customer' });
  const row = backend.row();
  assert.equal(tagIn(pdfOf(backend, 'customer').body), tagOfStored(row.customerHtml));
  assert.equal(tagIn(pdfOf(backend, 'internal').body), tagOfStored(row.internalHtml));
  assert.equal(row.customerPdfPath, `pdf/${REPORT_ID}/customer.pdf`);
  assert.equal(row.internalPdfPath, `pdf/${REPORT_ID}/internal.pdf`);
});

/** ตัวเรนเดอร์ HTML ที่ถูกแก้เฉพาะฉบับลูกค้า — จำลอง deploy ที่ตัวเรนเดอร์เพี้ยนหลังออกเลขไปแล้ว */
const tamperCustomer = (change) => (args) => {
  const html = renderSurveyReportHTML(args);
  return args.view.version === 'internal' ? html : change(html, args);
};

async function assertFreezeBlocked(t, { renderHtml, inputs, mutateRow, expect }) {
  const lines = quiet(t);
  const backend = setup({ inputs: inputs || markedSurveyInputs().inputs });
  mutateRow?.(backend.row());
  const renderer = fakeRenderer();
  const got = await run(backend, renderer, renderHtml ? { renderHtml } : {});
  assert.equal(got.state, 'issued');
  assert.equal(got.code, 'paper_failed');
  assert.ok(got.reasons.every((reason) => reason.startsWith('ฉบับลูกค้า: ')), got.reasons.join(' | '));
  for (const pattern of expect) assert.ok(got.reasons.some((reason) => pattern.test(reason)), `${pattern} ∉ ${got.reasons.join(' | ')}`);
  // วัดผ่านแล้วทั้งสองฉบับ — สิ่งที่กันคือยามก่อนตรึง ไม่ใช่ด่านวัด
  assert.equal(renderer.prints.length, 2);
  assert.equal(backend.writes().length, 0, 'ไม่ตรึง ไม่อัป');
  assert.equal(stateOf(backend), 'issued');
  assert.deepEqual(backend.audits, []);
  assert.ok(lines.some((line) => line.includes('ยามกันรั่ว')), 'ต้องลง log ว่าเป็นยามกันรั่ว');
  return got;
}

test('🔴 รั่ว ⑤: ยามก่อนตรึงกันเมื่อ HTML ฉบับลูกค้ามีรูปจุด', async (t) => {
  const { leak } = markedSurveyInputs();
  await assertFreezeBlocked(t, {
    renderHtml: tamperCustomer((html) => html.replace('</main>', `<img src="su-img:${leak.spotPhotoSelectedSha}"></main>`)),
    expect: [new RegExp(`รูปที่ไม่ใช่ภาพกว้าง/ภาพผัง.*${leak.spotPhotoSelectedSha.slice(0, 12)}`)],
  });
});

test('🔴 รั่ว ⑤: ยามก่อนตรึงกันเมื่อ HTML ฉบับลูกค้ามีชิ้นของฉบับภายใน (markup ของตัวเรนเดอร์) — ข้อความที่คนพิมพ์ในภาพนิ่งไม่ติด', async (t) => {
  await assertFreezeBlocked(t, {
    // แถบของฉบับภายในโผล่ในฉบับลูกค้า — ยามจับจากโครงของแถบ ไม่ใช่จากคำในแถบ (ตัวพิมพ์ปลอมไม่ได้แยกฉบับจากโครงนี้)
    renderHtml: tamperCustomer((html) => html.replace('</main>', '<div class="band"><span class="band-t">INTERNAL</span></div></main>')),
    expect: [/มีชิ้นของฉบับภายใน \(แถบฉบับภายใน\)/],
  });
  /* 🔴 หมายเหตุพื้นที่ที่เขียนว่า "ดูรายละเอียดในฉบับภายใน" ต้องตรึงได้ — เลขออกไปแล้ว ถ้ายามติดคำนี้เอกสารจะตรึงไม่ได้ตลอดไป
     และรอบตรวจก่อนส่งผลไม่เคยตีกลับข้อความนี้ (มติ 2 · มติ 3: ข้อความของผู้สำรวจพิมพ์ตามที่พิมพ์มา) */
  const backend = setup({ inputs: markedSurveyInputs().inputs });
  backend.row().snapshot.zones.find((z) => z.status !== 'cut').note = 'ดูรายละเอียดในฉบับภายใน';
  const got = await run(backend, fakeRenderer());
  assert.equal(got.state, 'ready', (got.reasons || []).join(' | '));
  assert.ok(backend.row().customerHtml.includes('ดูรายละเอียดในฉบับภายใน'), 'ข้อความต้องลงฉบับลูกค้าที่ตรึงจริง');
});

test('🔴 รั่ว ⑤: ยามก่อนตรึงกันเมื่อจำนวนแผ่นของฉบับลูกค้าไม่เท่าแผนหน้า', async (t) => {
  await assertFreezeBlocked(t, {
    renderHtml: tamperCustomer((html) => html.replace('</body>', '<article class="sheet su-page" data-page="99"></article></body>')),
    expect: [/มี \d+ แผ่น แต่แผนหน้าของฉบับลูกค้ามี \d+ หน้า/],
  });
});

test('🔴 รั่ว ⑤: ตัวเรนเดอร์คืนกระดาษฉบับภายในมาเป็นฉบับลูกค้า — ติดทั้งสามข้อ ไม่มีอะไรถูกตรึง', async (t) => {
  const got = await assertFreezeBlocked(t, {
    renderHtml: (args) => {
      if (args.view.version === 'internal') return renderSurveyReportHTML(args);
      // ฉบับลูกค้าถูกเรนเดอร์ด้วย view/แผนหน้าของฉบับภายใน
      const snapshot = buildSurveyReportSnapshot(markedSurveyInputs().inputs, { mode: 'freeze' }).snapshot;
      const view = surveyReportView(snapshot, { version: 'internal' });
      return renderSurveyReportHTML({ ...args, view, layout: paginateSurveyReport(view) });
    },
    expect: [/รูปที่ไม่ใช่ภาพกว้าง\/ภาพผัง/, /มีชิ้นของฉบับภายใน \(แถบฉบับภายใน · /, /แผ่น แต่แผนหน้าของฉบับลูกค้า/],
  });
  assert.equal(got.reasons.length, 3);
});

/* ══ ⑥ ขั้นวัดของ I5b ════════════════════════════════════════════════════ */

/** กระดาษลองของขั้นออกเลข — ยังไม่มีเลข (docNo null) */
function dryPapers(backend) {
  const html = {};
  for (const version of SURVEY_REPORT_VERSIONS) {
    const view = surveyReportView(backend.snapshot, { version });
    html[version] = renderSurveyReportHTML({ view, layout: paginateSurveyReport(view), docNo: null, issuedAt: null });
  }
  // รูปเดียวกับที่ขั้นออกเลขส่งให้พารามิเตอร์ `measure` (surveyReportIssue.js I5b)
  return { customerHtml: html.customer, internalHtml: html.internal };
}
const measure = (backend, renderer, opts = {}) => measureSurveyReportPaper(backend.supabase, {
  ...dryPapers(backend), loadRenderer: renderer.load, now: () => NOW, log: () => {}, ...opts,
});

test('ขั้นวัด: ทั้งสองฉบับผ่าน = ok — และไม่เขียนอะไรเลย (ไม่ตรึง ไม่อัป ไม่อ่านตาราง ไม่ลง audit)', async () => {
  const backend = setup();
  const renderer = fakeRenderer();
  assert.deepEqual(await measure(backend, renderer), { ok: true, code: null, error: null, issues: [], reasons: [] });
  assert.deepEqual(renderer.prints.map((p) => p.version), ['customer', 'internal']);
  assert.deepEqual([renderer.launches, renderer.closes], [1, 1]);
  assert.deepEqual([...new Set(backend.calls.map((c) => c.op))], ['download']);
  assert.equal(stateOf(backend), 'issued');
  // ไม่ต้องมีด่านเขียน — ขั้นนี้อ่านอย่างเดียว (นอก production ขั้นออกเลขหยุดไปก่อนถึงตรงนี้อยู่แล้ว)
  for (const print of renderer.prints) assert.equal(print.html.includes('su-img:'), false);
});

test('ขั้นวัด: แผ่นล้น = ไม่ผ่าน บอกฉบับและหน้า', async () => {
  const backend = setup();
  const renderer = fakeRenderer({ fit: (version) => (version === 'customer' ? { 3: { last: 1060 } } : { 6: { rule: null } }) });
  const got = await measure(backend, renderer);
  assert.equal(got.ok, false);
  assert.equal(got.code, 'paper_failed');
  assert.equal(got.error, null, 'วัดครบแล้ว — เหตุอยู่ใน issues ไม่ใช่ error');
  assert.match(got.reasons[0], /^ฉบับลูกค้า: หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ 6px/);
  assert.equal(got.reasons[1], 'ฉบับภายใน: หน้า 6 ไม่มีเส้นท้ายกระดาษ');
  assert.deepEqual(got.issues.map((i) => [i.version, i.kind, i.page]), [['customer', 'block', 3], ['internal', 'block', 6]]);
  // `text` ไม่มีชื่อฉบับนำหน้า — ขั้นออกเลขเติมเองจาก `version`
  assert.match(got.issues[0].text, /^หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ/);
  assert.equal(got.issues[1].text, 'หน้า 6 ไม่มีเส้นท้ายกระดาษ');
  assert.equal(backend.writes().length, 0);
});

test('ขั้นวัด: chromium ล้ม · รูปหาย · อ่านถังไม่ได้ · เวลาไม่พอ · ไม่มีกระดาษ — ไม่ผ่านทุกกรณี ไม่โยน', async (t) => {
  quiet(t);
  const cases = [
    ['chromium_failed', () => ({ renderer: fakeRenderer({ launchFail: true }) })],
    ['chromium_failed', () => ({ renderer: fakeRenderer({ loadFail: true }) })],
    ['chromium_failed', () => ({ renderer: fakeRenderer({ fail: (version) => version === 'customer' }) })],
    ['image_missing', (backend) => { backend.objects.delete([...backend.objects.keys()][0]); return {}; }],
    ['storage_failed', (backend) => { backend.intercept = () => ({ data: null, error: { message: 'fetch failed' } }); return {}; }],
    ['timeout', () => ({ opts: { deadline: 1_000 } })],
    // ถังไม่ตอบ: จบที่เพดานต่อครั้ง (ลองใหม่ได้) · ไม่ตอบจนงบของรอบหมด = timeout — ไม่ค้าง และยังไม่มีเลขถูกใช้
    ['storage_failed', (backend) => { backend.intercept = () => HANG; return { opts: { callTimeoutMs: STALL_MS } }; }],
    ['timeout', (backend) => { backend.intercept = () => HANG; return { opts: { deadline: NOW + STALL_MS } }; }],
    ['paper_failed', () => ({ opts: { internalHtml: '  ' } })],
    ['paper_failed', () => ({ opts: { customerHtml: null, internalHtml: undefined } })],
  ];
  for (const [code, arm] of cases) {
    const backend = setup();
    const { renderer = fakeRenderer(), opts = {} } = arm(backend);
    const got = await settled(measure(backend, renderer, opts));
    assert.equal(got.ok, false, code);
    assert.equal(got.code, code);
    assert.ok(typeof got.error === 'string' && got.error.trim(), `${code}: วัดไม่ได้ต้องมี error เป็นข้อความ`);
    assert.deepEqual(got.issues, []);
    assert.ok(got.reasons.length > 0);
    assert.equal(backend.writes().length, 0);
    assert.equal(renderer.closes, renderer.opened, code);
  }
  const boom = { storage: { from: () => { throw new Error('boom'); } } };
  const thrown = await measureSurveyReportPaper(boom, { ...dryPapers(setup()), loadRenderer: fakeRenderer().load, log: () => {} });
  assert.equal(thrown.ok, false);
  assert.ok(thrown.error);
  assert.equal((await measureSurveyReportPaper(null)).ok, false);
  assert.ok((await measureSurveyReportPaper(null, null)).error);
});

test('ขั้นวัด: ฉบับหนึ่งมีข้อกัน อีกฉบับพิมพ์ไม่จบ = วัดไม่ครบ ⇒ error (ลองใหม่ได้) และยังคืนข้อกันที่เจอแล้ว', async (t) => {
  quiet(t);
  const backend = setup();
  const renderer = fakeRenderer({
    fit: (version) => (version === 'customer' ? { 2: { last: 1100 } } : null),
    fail: (version) => version === 'internal',
  });
  const got = await measure(backend, renderer);
  assert.equal(got.ok, false);
  assert.equal(got.code, 'chromium_failed');
  assert.equal(got.error, 'ตัวพิมพ์ PDF ของระบบทำงานไม่สำเร็จ');
  assert.deepEqual(got.issues.map((i) => [i.version, i.page]), [['customer', 2]]);
  assert.equal(got.reasons.length, 2);
});

test('ขั้นวัด: ผลอ่านได้ด้วยสัญญาของพารามิเตอร์ `measure` ของขั้นออกเลข — { issues: [{ version, kind, text, page }], error }', async () => {
  // route เอกสารเสียบ: measure: (payload) => measureSurveyReportPaper(supabase, { ...payload, session })
  const backend = setup();
  const renderer = fakeRenderer({ fit: (version) => (version === 'internal' ? { 4: { last: 1055 } } : null) });
  const session = surveyReportPrintSession({ loadRenderer: renderer.load });
  const wired = (payload) => measureSurveyReportPaper(backend.supabase, { ...payload, session, now: () => NOW, log: () => {} });
  const got = await wired({ ...dryPapers(backend), deadline: NOW + 120_000 });
  await session.close();
  assert.equal(got.error, null);
  assert.equal(got.issues.length, 1);
  assert.deepEqual(Object.keys(got.issues[0]).sort(), ['kind', 'page', 'text', 'version']);
  assert.deepEqual([got.issues[0].version, got.issues[0].kind, got.issues[0].page], ['internal', 'block', 4]);
  assert.equal(typeof got.issues[0].text, 'string');
});

test('เบราว์เซอร์เดียวของ POST: ขั้นวัดกับขั้นกระดาษใช้ session เดียวกัน — เปิดครั้งเดียว ผู้สร้างเป็นคนปิด', async () => {
  const backend = setup();
  const renderer = fakeRenderer();
  const session = surveyReportPrintSession({ loadRenderer: renderer.load });
  assert.deepEqual([renderer.loads, renderer.launches], [0, 0], 'สร้าง session เฉย ๆ ไม่โหลด chromium');
  assert.equal(session.generator(), null);

  const measured = await measure(backend, renderer, { session });
  assert.equal(measured.ok, true);
  const paper = await run(backend, renderer, { session });
  assert.equal(paper.state, 'ready');
  assert.deepEqual([renderer.loads, renderer.launches, renderer.closes], [1, 1, 0], 'สองขั้น เบราว์เซอร์เดียว ยังไม่ถูกปิด');
  assert.equal(renderer.prints.length, 4, 'กระดาษลองสองฉบับ + กระดาษจริงสองฉบับ');
  assert.equal(session.generator(), 'pdf-fake-v1');

  // กระดาษลองไม่มีเลข — ไฟล์ที่เก็บต้องเป็นของกระดาษจริง
  const row = backend.row();
  for (const version of SURVEY_REPORT_VERSIONS) assert.equal(tagIn(pdfOf(backend, version).body), tagOfStored(row[`${version}Html`]));

  await session.close();
  await session.close();
  assert.equal(renderer.closes, 1);
});

test('session ที่เปิดไม่ขึ้น: ทุกการพิมพ์ของรอบล้มด้วยเหตุเดิม ไม่เปิดซ้ำต่อฉบับ · close ไม่โยน', async (t) => {
  quiet(t);
  const renderer = fakeRenderer({ launchFail: true });
  const session = surveyReportPrintSession({ loadRenderer: renderer.load });
  await assert.rejects(session.print('<html></html>'));
  await assert.rejects(session.print('<html></html>'));
  assert.equal(renderer.launches, 1);
  await session.close();
  const partial = surveyReportPrintSession({ loadRenderer: async () => ({ launchBrowser: async () => ({}) }) });
  await assert.rejects(partial.print('<html></html>'), /โหลดมาไม่ครบ/);
  await partial.close();
});

/* ══ ⑦ เพดานเวลา ════════════════════════════════════════════════════════ */

test('surveyReportBounded: ผลของ run ผ่านมาตรง ๆ · ส่ง signal ให้ run · ค้างเกินเพดาน = โยน · ที่ run โยนเองโยนต่อตามเดิม', async () => {
  assert.equal(await surveyReportBounded(() => 7), 7);
  assert.deepEqual(await surveyReportBounded(async () => ({ data: 1, error: null }), 50), { data: 1, error: null });
  let seen = null;
  await surveyReportBounded((signal) => { seen = signal; }, 50);
  assert.ok(seen instanceof AbortSignal, 'run ต้องได้ signal ไปส่งต่อให้ fetch ของถัง');

  await assert.rejects(settled(surveyReportBounded(() => HANG, STALL_MS)), /ไม่ตอบภายใน 25 ms/);
  let aborted = false;
  await assert.rejects(settled(surveyReportBounded((signal) => { signal.addEventListener('abort', () => { aborted = true; }); return HANG; }, STALL_MS)));
  assert.equal(aborted, true, 'หมดเวลาแล้ว signal ต้อง abort — สายของถังถูกตัดจริง');

  await assert.rejects(surveyReportBounded(() => { throw new Error('boom'); }, 50), /boom/);
  await assert.rejects(surveyReportBounded(async () => { throw new Error('later'); }), /later/);
  // `Infinity` = ไม่มีเพดาน (การพิมพ์ที่ไม่มี deadline) · ค่าที่อ่านไม่ได้ = เพดานตั้งต้น ไม่ใช่ "ไม่มีเพดาน"
  assert.equal(await surveyReportBounded(() => 'free', Infinity), 'free');
  assert.equal(await surveyReportBounded(() => 'default', Number.NaN), 'default');
  assert.deepEqual(
    [SURVEY_REPORT_CALL_TIMEOUT_MS, SURVEY_REPORT_AUDIT_TIMEOUT_MS, SURVEY_REPORT_SESSION_CLOSE_MS, SURVEY_REPORT_PRINT_MIN_MS, SURVEY_REPORT_STORE_MIN_MS],
    [30_000, 10_000, 5_000, 15_000, 5_000],
  );
});

test('🔴 การพิมพ์ที่ค้างถูกตัดที่งบของรอบ = timeout — ไม่ตรึง ไม่เก็บ เบราว์เซอร์ถูกปิด (ไม่ค้างจนฟังก์ชันถูกตัด)', async (t) => {
  quiet(t);
  const backend = setup();
  const base = fakeRenderer();
  let hanging = 0;
  const load = async () => {
    const mod = await base.load();
    return {
      ...mod,
      renderHtmlPdf: (html, opts) => {
        if (!html.includes('ฉบับภายใน')) return mod.renderHtmlPdf(html, opts);
        hanging += 1;
        return HANG;
      },
    };
  };
  /* นาฬิกา: หลังฉบับลูกค้าพิมพ์จบ การอ่านครั้งแรก (ด่านก่อนพิมพ์ฉบับถัดไป) ยังเห็นงบเหลือเฟือ ·
     ครั้งถัดไป (ตอนตั้งเพดานของการพิมพ์) เหลือ 25 ms ⇒ การพิมพ์ฉบับภายในเริ่มจริงแล้วถูกตัด */
  let reads = null;
  const now = () => {
    if (reads === null) return NOW;
    reads += 1;
    return reads === 1 ? NOW : NOW + 60_000 - STALL_MS;
  };
  const log = (line) => { if (line.step === 'print' && line.version === 'customer') reads = 0; };

  const got = await settled(run(backend, { load }, { now, deadline: NOW + 60_000, log }));
  assert.equal(hanging, 1, 'การพิมพ์ฉบับภายในต้องเริ่มแล้วจริง ๆ');
  assert.equal(got.code, 'timeout');
  assert.equal(got.state, 'issued');
  assert.match(got.reasons[0], /^ฉบับภายใน: เวลาไม่พอ/);
  assert.equal(backend.writes().length, 0, 'ฉบับใดฉบับหนึ่งพิมพ์ไม่จบ = ไม่ตรึง ไม่เก็บอะไรทั้งสิ้น');
  assert.deepEqual(backend.audits, []);
  assert.equal(base.closes, 1);
});

test('audit ที่ไม่ตอบไม่ลากขั้นกระดาษค้าง — กระดาษครบแล้วตอบ ready', async (t) => {
  quiet(t);
  const backend = setup();
  const got = await settled(run(backend, fakeRenderer(), { audit: () => HANG, callTimeoutMs: STALL_MS }));
  assert.equal(got.state, 'ready');
  assert.equal(got.code, null);
  assert.deepEqual(got.captured, ['customer', 'internal']);
});

test('งบของรอบหมดไปแล้วตั้งแต่ก่อนอ่านแถว = timeout ไม่เรียกอะไรเลย', async () => {
  const backend = setup();
  const renderer = fakeRenderer();
  const got = await run(backend, renderer, { deadline: NOW - 1 });
  assert.equal(got.code, 'timeout');
  assert.equal(got.state, null);
  assert.deepEqual(got.reasons, [SURVEY_REPORT_PAPER_REASONS.timeout]);
  assert.deepEqual(backend.calls, []);
  assert.equal(renderer.loads, 0);
});

test('session.close ไม่รอเบราว์เซอร์ที่ยังเปิดไม่จบหรือปิดไม่ตอบ — เปิดเสร็จทีหลังก็ยังถูกปิดตาม', async () => {
  // ① เปิดไม่จบ (การพิมพ์ถูกตัดเพราะหมดงบระหว่าง launch)
  let opened = null;
  let closes = 0;
  const slow = surveyReportPrintSession({
    closeTimeoutMs: STALL_MS,
    loadRenderer: async () => ({
      renderHtmlPdf: async () => ({}),
      launchBrowser: () => new Promise((resolve) => { opened = () => resolve({ close: async () => { closes += 1; } }); }),
    }),
  });
  const printing = slow.print('<html></html>');
  printing.catch(() => {});
  await settled(slow.close());
  assert.equal(closes, 0);
  opened();
  await printing;
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(closes, 1, 'เบราว์เซอร์ที่เปิดเสร็จหลัง close ต้องไม่ถูกทิ้งค้าง');

  // ② ปิดไม่ตอบ
  const stuck = surveyReportPrintSession({
    closeTimeoutMs: STALL_MS,
    loadRenderer: async () => ({ renderHtmlPdf: async () => ({ buffer: null }), launchBrowser: async () => ({ close: () => HANG }) }),
  });
  await stuck.print('<html></html>');
  await settled(stuck.close());
});

/* ══ ซอร์ส ═══════════════════════════════════════════════════════════════ */

const SOURCE = readFileSync(new URL('./surveyReportPaper.js', import.meta.url), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('🔴 chromium โหลดด้วย await import() ข้างในเท่านั้น — หัวไฟล์ไม่มี htmlPdf · puppeteer · sharp', () => {
  const statics = [...CODE.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]).sort();
  assert.deepEqual(statics, [
    './surveyReportDocument', './surveyReportImages', './surveyReportLayout', './surveyReportRows',
    './surveyReportState', './surveyReportView', '@/lib/audit', '@/lib/documents/pdfInspect',
    '@/lib/timeoutSignal', // ตัวจับเวลาเปล่า ๆ ไม่มี import (เทสต์ของมันเองยืนยัน)
  ]);
  assert.deepEqual([...CODE.matchAll(/import\('([^']+)'\)/g)].map((m) => m[1]), ['@/lib/documents/htmlPdf']);
  for (const heavy of ['puppeteer', '@sparticuz/chromium', "'sharp'", '@/lib/drive']) assert.equal(CODE.includes(heavy), false, heavy);
});

test('🔴 ขั้นกระดาษเขียนได้แค่ update ของแถวเดิมกับอัป PDF — ไม่มี insert · delete · upsert · rpc · select *', () => {
  for (const banned of ['.insert(', '.delete(', '.upsert(', '.rpc(', '.remove(', "select('*')", 'upsert: true']) {
    assert.equal(CODE.includes(banned), false, banned);
  }
  assert.equal((CODE.match(/upsert: false/g) || []).length, 1);
  assert.equal((CODE.match(/\.upload\(/g) || []).length, 1);
  // ชื่อตารางเขียนเป็นสตริงตรง ๆ ทุกจุด (ด่าน check:columns มองไม่เห็น `.from(<ตัวแปร>)`)
  const tables = [...CODE.matchAll(/supabase\s*\.from\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(tables.length >= 5);
  assert.deepEqual([...new Set(tables)], ["'service_survey_reports'"]);
  // ถังเดียว — ชื่อถังมาจากตัวเลือก (ค่าตั้งต้น SURVEY_REPORT_BUCKET) ไม่มีชื่อถังอื่นเขียนตายไว้
  const buckets = [...CODE.matchAll(/storage\.from\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(buckets.sort(), ['bucket', 'o.bucket']);
  // ทุกการเขียนมีเงื่อนไข "ยังว่าง" — ไม่มีการเขียนทับ
  assert.equal((CODE.match(/\.update\(/g) || []).length, 2);
  assert.equal((CODE.match(/\.is\(/g) || []).length, 2);
});

test('🔴 ไม่มีการรอที่ไม่มีเพดาน (ซอร์ส): ทุกคำสั่งถัง · ฐาน · การพิมพ์ · audit ของขั้นกระดาษวิ่งใต้ ctx.call / ctx.ask / surveyReportBounded', () => {
  const outside = CODE.split('\n')
    .filter((line) => /supabase\s*\.(from|storage)\b|session\.print\(|o\.audit\(/.test(line))
    .filter((line) => !/ctx\.(ask|call)\(|surveyReportBounded\(/.test(line))
    .map((line) => line.trim());
  // ที่เหลือได้แค่ตัวสร้างคำสั่งของ `readFrozenHtml` — คืน builder ให้ `ctx.ask` เป็นคนรอ
  assert.equal(outside.length, 3, outside.join('\n'));
  for (const line of outside) assert.match(line, /return supabase\.from\('service_survey_reports'\)\.select\(/);
  assert.match(CODE, /ctx\.ask\(\(\) => readFrozenHtml\(/);
  assert.equal(/await\s+supabase\b/.test(CODE), false);
  // งบถูกเช็กซ้ำก่อนพิมพ์ฉบับถัดไปและก่อนเก็บ PDF
  assert.match(CODE, /ctx\.left\(\) < SURVEY_REPORT_PRINT_MIN_MS/);
  assert.match(CODE, /ctx\.left\(\) < SURVEY_REPORT_STORE_MIN_MS/);
});

test('🔴 route เอกสาร (ซอร์ส): ทุกการอ่านถังตอนเสิร์ฟวิ่งใต้ surveyReportBounded และส่ง signal ต่อ', () => {
  const route = new URL('../../app/api/service/surveys/[id]/document/route.js', import.meta.url);
  if (!existsSync(route)) return; // ชิ้นนั้นยังไม่ลง — เทสต์นี้เริ่มคุมเมื่อไฟล์มา
  const code = readFileSync(route, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const downloads = [...code.matchAll(/\.download\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(downloads.length >= 2);
  for (const args of downloads) assert.match(args, /\{ signal \}$/, `download(${args})`);
  assert.equal((code.match(/surveyReportBounded\(/g) || []).length, downloads.length);
  assert.equal(/await\s+supabase\.storage/.test(code), false);
});

test('🔴 ขั้นออกเลขต้องไม่ import ขั้นกระดาษ — ไม่งั้นเส้นส่งผลลาก chromium ตาม (route ส่งตัววัดเข้าทางพารามิเตอร์)', () => {
  const issue = new URL('./surveyReportIssue.js', import.meta.url);
  if (!existsSync(issue)) return; // ชิ้นนั้นยังไม่ลง — เทสต์นี้เริ่มคุมเมื่อไฟล์มา
  const code = readFileSync(issue, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const banned of ['surveyReportPaper', 'documents/htmlPdf', 'puppeteer']) {
    assert.equal(new RegExp(`(from|import\\()\\s*['"][^'"]*${banned}`).test(code), false, `surveyReportIssue.js import ${banned}`);
  }
});

test('ที่อยู่ของ PDF มาจาก id ของแถว ไม่ใช่เลขที่เอกสาร (มติ 16) — ฉบับอื่นนอกจาก internal ตรงตัว = customer', () => {
  assert.equal(surveyReportPdfPath('SVR-abc', 'customer'), 'pdf/SVR-abc/customer.pdf');
  assert.equal(surveyReportPdfPath('SVR-abc', 'internal'), 'pdf/SVR-abc/internal.pdf');
  assert.equal(surveyReportPdfPath('SVR-abc', 'Internal'), 'pdf/SVR-abc/customer.pdf');
  assert.equal(surveyReportPdfPath('SVR-abc'), 'pdf/SVR-abc/customer.pdf');
  assert.deepEqual([...SURVEY_REPORT_VERSIONS], ['customer', 'internal']);
  assert.equal(SURVEY_REPORT_PAPER_MIN_MS, 40_000);
  assert.equal(SURVEY_REPORT_PAPER_REASONS.image_missing, 'รูปของเอกสารหายจากที่เก็บ — แจ้งผู้ดูแลระบบ');
});
