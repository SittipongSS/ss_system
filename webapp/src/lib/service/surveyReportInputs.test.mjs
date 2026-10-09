// ── ตัวโหลดอินพุต + รอบตรวจก่อนส่งผลของรายงานการประเมินพื้นที่ (PR-2 §9) ─────────────────────
//
// ⭐ ล็อกห้าเรื่อง:
//   ① ตัวโหลดอ่านจากฐาน (ปลอม) แล้วได้ภาพนิ่ง **เท่ากับ** ที่ตัวสร้างได้จากอินพุตของชุดทดสอบ PR-1 ทุกไบต์
//   ② 🔴 อ่านไม่สำเร็จ ≠ ไม่มี — ทุกชิ้นที่อ่านพลาด (ทั้ง `{ error }` และ throw) ถูกเอ่ยชื่อใน `unknown` · รอบถัดไปอ่านได้ค่ากลับมา
//   ③ นัดที่เอกสารรับรอง = นัดที่การส่งผลนี้ปิด ไม่งั้นนัด `done` ล่าสุด — ไม่ใช่ "ใบล่าสุดสถานะใดก็ได้"
//   ④ รอบตรวจก่อนส่งผล: ของบนใบ = `content` (ตีกลับ) · ของระบบ = `system` (ไม่ตีกลับ) · ฐานสะดุดต้องไม่กลายเป็นเหตุชนิด `content`
//   ⑤ ไฟล์นี้อ่านอย่างเดียวและไม่ลากของหนัก (sharp · chromium) เข้าทางของ GET ใบประเมิน
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROLE_LABELS } from '../permissions.js';
import { IN_CHUNK_SIZE } from '../supabaseInChunks.js';
import { renderSurveyReportHTML } from './surveyReportDocument.js';
import { paginateSurveyReport, surveyReportOverflowErrors } from './surveyReportLayout.js';
import {
  SURVEY_REPORT_STANDARD_KEY, loadSurveyReportInputs, surveyReportPrecheck, surveyReportVisitOf,
} from './surveyReportInputs.js';
import {
  SURVEY_REPORT_INPUT_LABELS, SURVEY_REPORT_NO_VISIT, buildSurveyReportSnapshot, surveyReportFreezeIssues,
} from './surveyReportSnapshot.js';
import { surveyReportCustomerHtmlIssues } from './surveyReportState.js';
import { customerFreeTextWarnings, surveyReportView } from './surveyReportView.js';
import { surveySendCloseBody, surveySendVisitStep } from './surveySendClose.js';
import {
  TEST_COMPANY, TEST_FORM, stressSurveyInputs, surveyReportInputsFromFixture, syntheticSurveyFixture, thaiText,
} from './surveyReportTestKit.mjs';

const SOURCE = 'src/lib/service/surveyReportInputs.js';
/* ตัดคอมเมนต์ก่อนตรวจ — คอมเมนต์ในไฟล์เอ่ยชื่อสิ่งต้องห้ามไว้สอนคน */
const code = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ── ฐานข้อมูลปลอม — กรองจริงตาม eq/in · เรียงจริง · ตัดตาม limit · **คืนเฉพาะคอลัมน์ที่ select** ─────────────
   (คอลัมน์ที่ตัวโหลดลืมเอ่ยชื่อจะหายจากแถว ⇒ ภาพนิ่งเพี้ยนแล้วเทสต์ ① แดง — ฐานจริงก็ไม่ส่งคอลัมน์ที่ไม่ได้ขอ)
   `fail[ตาราง]` = `{ times, throws, when(q) }` — ล้ม `times` ครั้งแรกที่ `when` ตรง แล้วอ่านได้ตามปกติ */
function fakeDb(tables = {}, { fail = {}, users = {}, authFail = {} } = {}) {
  const log = [];
  const authLog = [];
  const columnsOf = (select) => {
    const raw = String(select ?? '*').trim();
    if (raw === '*') return null;
    return raw.split(',').map((c) => c.trim().replace(/"/g, '')).filter(Boolean);
  };
  const failing = (q) => {
    const rule = fail[q.table];
    if (!rule || !(rule.times > 0)) return null;
    if (rule.when && !rule.when(q)) return null;
    rule.times -= 1;
    return rule;
  };
  const db = {
    log,
    authLog,
    tables,
    rpc() { throw new Error('ตัวโหลดอินพุตห้ามเรียก rpc'); },
    get storage() { throw new Error('ตัวโหลดอินพุตห้ามแตะ storage'); },
    auth: {
      admin: {
        async getUserById(id) {
          authLog.push(id);
          const rule = authFail[id];
          if (rule && rule.times > 0) {
            rule.times -= 1;
            if (rule.throws) throw new Error('auth ล่ม');
            return { data: { user: null }, error: { status: 500, message: 'auth ล่ม' } };
          }
          const user = users[id];
          if (!user) return { data: { user: null }, error: { status: 404, message: 'User not found' } };
          return { data: { user }, error: null };
        },
      },
    },
    from(table) {
      const q = { table, op: 'select', select: '*', filters: [], orders: [], limit: null, single: false };
      log.push(q);
      const matches = (row) => q.filters.every(([op, col, val]) => {
        if (op === 'eq') return row[col] === val;
        if (op === 'in') return val.includes(row[col]);
        return true;
      });
      const run = () => {
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
        const cols = columnsOf(q.select);
        return {
          data: rows.map((row) => (cols ? Object.fromEntries(cols.map((c) => [c, row[c] ?? null])) : structuredClone(row))),
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
          q.single = true;
          return Promise.resolve().then(run).then(({ data, error }) => ({ data: error ? null : (data[0] || null), error }));
        },
        then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
      };
      return chain;
    },
  };
  return db;
}

const REQUEST_ID = 'DR-synthetic-0001';
const HEAD = { id: 'U-head-now', name: 'Head Sender', role: 'ts_manager', department: 'TS' };
const NOW = '2026-09-26T03:00:00.000+00:00';
const TODAY = '2026-09-26';

const twin = (opts) => surveyReportInputsFromFixture(syntheticSurveyFixture(), opts);

/**
 * โลกปลอมจากอินพุตของชุดทดสอบ PR-1 — แถวของแต่ละตารางตามรูปที่ฐานเก็บ
 * @returns `{ db, request, tables, users }` · `source` = อินพุตต้นทาง (ไว้เทียบภาพนิ่ง)
 */
function worldFrom(source, { visits = null, helperIds = [], users = {}, thread = [], options = {} } = {}) {
  const request = { ...source.request, siteId: 'SITE-1', customerId: 'CUS-1', dealId: 'DEAL-1' };
  const tables = {
    // ฐานไม่มีคอลัมน์ `zoneCode` บนแถวผลวัด — รหัสอ่านสดจากทะเบียน
    service_survey_zones: source.zones.map(({ zoneCode: _zoneCode, ...row }) => ({ ...row, requestId: request.id })),
    attachments: source.zones.flatMap((z) => (source.filesByZone[z.id] || [])
      .map((f) => ({ ...f, entityType: 'service_survey_zone', entityId: z.id }))),
    service_zones: source.zoneRegistry.map((z) => ({ ...z })),
    service_sites: [{ id: 'SITE-1', ...source.site }, { id: 'SITE-2', name: 'ไซต์ของลูกค้ารายอื่น' }],
    customers: [{ id: 'CUS-1', name: source.customer.name, nameEn: null, arCode: source.customer.arCode }],
    sales_deals: [{ id: 'DEAL-1', code: source.deal.code }, { id: 'DEAL-2', code: 'DL-อื่น' }],
    service_visits: visits || [{
      id: 'SVV-1', requestId: request.id, createdAt: '2026-09-24T02:00:00.000+00:00', unableReason: null,
      ...source.visit, assistantIds: helperIds,
    }],
    entity_updates: [
      ...source.history.map((row) => ({ ...row, entityType: 'dept_request', entityId: request.id })),
      // เธรดของใบอื่นและชนิดอื่น — ต้องไม่ปนเข้าประวัติ
      { id: 'EUP-x1', kind: 'recall', body: 'ของใบอื่น', meta: {}, entityType: 'dept_request', entityId: 'DR-other', createdAt: '2026-09-20T00:00:00.000+00:00' },
      { id: 'EUP-x2', kind: 'comment', body: 'คุยกัน', meta: {}, entityType: 'dept_request', entityId: request.id, createdAt: '2026-09-20T00:00:00.000+00:00' },
      ...thread,
    ],
    service_package_sizes: source.sizes.map((s) => ({ ...s })),
    organization_setting_versions: [{
      organizationId: 'primary', status: 'published', legalNameTh: TEST_COMPANY.name, legalNameEn: 'Scent and Sense',
      taxId: TEST_COMPANY.taxId, branchCode: '00000', registeredAddressTh: TEST_COMPANY.address, registeredAddressEn: null,
      phone: TEST_COMPANY.tel, email: null, lineId: TEST_COMPANY.line, website: TEST_COMPANY.website,
    }],
    document_standard_versions: [
      { documentKey: SURVEY_REPORT_STANDARD_KEY, status: 'published', versionNumber: 1, formCode: 'FM-TS-01', revision: '00', effectiveDate: '2026-09-29', titleEn: 'SITE SURVEY REPORT' },
      { documentKey: 'quotation', status: 'published', versionNumber: 9, formCode: 'FM-SA-01', revision: '05', effectiveDate: '2026-01-01', titleEn: 'QUOTATION' },
    ],
  };
  const people = {
    'U-lead': { id: 'U-lead', email: 'lead@example.test', app_metadata: { role: 'ts_senior' }, user_metadata: { name: 'Lead Assessor' } },
    ...users,
  };
  return { db: fakeDb(tables, { users: people, ...options }), request, tables, source };
}

const twinWorld = (extra) => worldFrom(twin(), extra);

/* ภาพนิ่งจากอินพุตของตัวโหลด — เติมรูปที่เตรียมแล้วของชุดทดสอบ (ขั้นออกเลขเป็นคนเติมของจริง) */
const snapshotOf = (inputs, source, mode = 'freeze') => (
  buildSurveyReportSnapshot({ ...inputs, imageByAttId: source.imageByAttId }, { mode })
);

/* ══ 1. ตัวโหลด: อ่านครบ ได้ภาพนิ่งเท่าของชุดทดสอบ ═════════════════════════════════════════ */

test('⭐ ตัวโหลดอ่านจากฐานแล้วได้ภาพนิ่งเท่ากับอินพุตของชุดทดสอบ PR-1 ทุกช่อง · ไม่มีชิ้นไหนเป็น unknown', async () => {
  const world = twinWorld();
  const { inputs, unknown } = await loadSurveyReportInputs(world.db, { request: world.request, takenAt: world.source.takenAt });
  assert.deepEqual(unknown, []);
  assert.deepEqual(inputs.unknown, []);

  const got = snapshotOf(inputs, world.source);
  assert.equal(got.errors, undefined);
  const want = buildSurveyReportSnapshot({
    ...world.source,
    customer: { ...world.source.customer, id: 'CUS-1' },
  }, { mode: 'freeze' });
  assert.deepEqual(got.snapshot, want.snapshot);
  assert.deepEqual(got.images, want.images);

  // ชิ้นที่ชุดทดสอบ PR-1 ส่งมือ ตัวโหลดต้องอ่านเองจากฐาน
  assert.deepEqual(inputs.deal, { code: 'DL-260900570' });
  assert.equal(inputs.assigneeRoleLabel, ROLE_LABELS.ts_senior);
  assert.deepEqual(inputs.helpers, []);
  assert.deepEqual(inputs.priorUnable, []);
  assert.equal(inputs.visitClosedBySend, false);
  assert.deepEqual(inputs.company, TEST_COMPANY);
  assert.deepEqual(inputs.form, TEST_FORM);
  assert.deepEqual(inputs.zoneRegistry.map((z) => Object.keys(z).sort()), [
    ['building', 'code', 'floor', 'id'], ['building', 'code', 'floor', 'id'],
  ]);
  assert.equal(inputs.history.length, 1, 'เฉพาะ recall/send_back/send_back_done ของใบนี้');
});

test('🔴 อ่านอย่างเดียว: ไม่มีคำสั่งเขียน ไม่มี rpc · ทุก query ที่คืนหลายแถวมีเพดาน (`check:rowcap`)', async () => {
  const world = twinWorld({ helperIds: ['U-h1'], users: { 'U-h1': { id: 'U-h1', user_metadata: { name: 'Helper One' } } } });
  await loadSurveyReportInputs(world.db, { request: world.request, takenAt: NOW });
  assert.ok(world.db.log.length > 8);
  for (const q of world.db.log) assert.equal(q.op, 'select', `${q.table} ต้องเป็น select`);

  const own = ['service_zones', 'service_visits', 'entity_updates', 'document_standard_versions'];
  for (const q of world.db.log.filter((x) => own.includes(x.table))) {
    assert.ok(q.limit > 0 && q.limit <= 1000, `${q.table} ต้องมี .limit()`);
    assert.ok(q.orders.length > 0, `${q.table} ต้องมี .order() (ตัดที่เพดานแล้วต้องได้ชุดเดิมทุกครั้ง)`);
  }
  for (const table of ['service_sites', 'customers', 'sales_deals']) {
    const hits = world.db.log.filter((x) => x.table === table);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].single, true, `${table} อ่านแถวเดียวด้วย id`);
  }
  // ทะเบียนพื้นที่ซอยก้อน — เพดานต่อก้อนเท่าขนาดก้อน
  assert.equal(world.db.log.find((x) => x.table === 'service_zones').limit, IN_CHUNK_SIZE);
  // นัดอ่านครั้งเดียว (นัดที่รับรอง + นัดที่ทำไม่ได้ มาจากการอ่านเดียวกัน)
  assert.equal(world.db.log.filter((x) => x.table === 'service_visits').length, 1);

  const src = code(SOURCE);
  for (const banned of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(', '.upload(', '.storage']) {
    assert.ok(!src.includes(banned), `ตัวโหลดต้องไม่มี ${banned}`);
  }
});

test('🔴 ไม่ลากของหนัก: ไม่ import sharp · chromium · ตัวเตรียมรูป · ตัวออกเลข (อยู่บนทางของ GET ใบประเมิน)', () => {
  const src = code(SOURCE);
  const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  assert.ok(imports.length >= 10);
  for (const spec of imports) {
    assert.doesNotMatch(spec, /sharp|puppeteer|chromium|htmlPdf|surveyReportImages|surveyReportPaper|surveyReportIssue|drive/i, spec);
  }
  assert.ok(!/import\(/.test(src), 'ไม่มี dynamic import — ไม่มีของหนักให้โหลดช้า');
});

test('ชื่อชิ้นใน unknown ทุกชื่อที่ตัวโหลดใช้ มีป้ายไทย (ชื่อดิบต้องไม่ขึ้นจอหัวหน้า)', () => {
  const src = code(SOURCE);
  const names = new Set([...src.matchAll(/(?:read|miss)\('([A-Za-z]+)'/g)].map((m) => m[1]));
  assert.deepEqual([...names].sort(), Object.keys(SURVEY_REPORT_INPUT_LABELS).sort());
});

/* ══ 2. อ่านไม่สำเร็จ ≠ ไม่มี ═══════════════════════════════════════════════════════ */

const isThread = (entityType) => (q) => q.filters.some(([, col, val]) => col === 'entityType' && val === entityType);
const HELPER_WORLD = {
  helperIds: ['U-h1'],
  users: { 'U-h1': { id: 'U-h1', user_metadata: { name: 'Helper One' } } },
  thread: [{
    id: 'EUP-v1', kind: 'done', body: 'ปิดงานโดยช่าง', meta: {}, entityType: 'service_visit', entityId: 'SVV-1',
    createdAt: '2026-09-25T11:00:00.000+00:00',
  }],
};

/* หนึ่งแถวต่ออินพุต: อะไรล้ม → ชื่อที่ต้องขึ้น → ช่องที่ต้องเป็น null → ค่าที่ต้องกลับมาเมื่ออ่านรอบสองได้ */
const FAILURES = [
  { name: 'zones', fail: { service_survey_zones: { times: 1 } }, nulls: ['zones', 'filesByZone', 'zoneRegistry'], back: (i) => i.zones.length === 2 },
  { name: 'files', fail: { attachments: { times: 1 } }, nulls: ['filesByZone'], back: (i) => Object.keys(i.filesByZone).length === 2 },
  { name: 'zoneRegistry', fail: { service_zones: { times: 1 } }, nulls: ['zoneRegistry'], back: (i) => i.zoneRegistry[0].code === 'ZN-1159-10253' },
  { name: 'site', fail: { service_sites: { times: 1 } }, nulls: ['site'], back: (i) => i.site.code === 'ST-9001-01-BKK-1159' },
  { name: 'customer', fail: { customers: { times: 1 } }, nulls: ['customer'], back: (i) => i.customer.arCode === 'AR-9001' },
  { name: 'deal', fail: { sales_deals: { times: 1 } }, nulls: ['deal'], back: (i) => i.deal.code === 'DL-260900570' },
  { name: 'visits', fail: { service_visits: { times: 1 } }, nulls: ['visit', 'priorUnable'], back: (i) => i.visit.code === 'SV-26090013' },
  { name: 'visitThread', fail: { entity_updates: { times: 1, when: isThread('service_visit') } }, nulls: [], back: (i) => i.visitClosedBySend === false },
  { name: 'helpers', authFail: { 'U-h1': { times: 1 } }, nulls: ['helpers'], back: (i) => i.helpers[0].name === 'Helper One' },
  { name: 'assigneeRole', authFail: { 'U-lead': { times: 1 } }, nulls: ['assigneeRoleLabel'], back: (i) => i.assigneeRoleLabel === ROLE_LABELS.ts_senior },
  { name: 'history', fail: { entity_updates: { times: 1, when: isThread('dept_request') } }, nulls: ['history'], back: (i) => i.history.length === 1 },
  { name: 'sizes', fail: { service_package_sizes: { times: 1 } }, nulls: ['sizes'], back: (i) => i.sizes.length === 4 },
  { name: 'company', fail: { organization_setting_versions: { times: 1 } }, nulls: ['company'], back: (i) => i.company.taxId === TEST_COMPANY.taxId },
  { name: 'form', fail: { document_standard_versions: { times: 1 } }, nulls: ['form'], back: (i) => i.form.code === 'FM-TS-01' },
];

test('ตารางความล้มเหลวครอบทุกชื่อที่มีป้าย — เพิ่มชิ้นใหม่ต้องเพิ่มแถวทดสอบ', () => {
  assert.deepEqual(FAILURES.map((f) => f.name).sort(), Object.keys(SURVEY_REPORT_INPUT_LABELS).sort());
});

for (const throws of [false, true]) {
  for (const row of FAILURES) {
    test(`🔴 อ่าน ${row.name} ไม่สำเร็จ (${throws ? 'throw' : '{ error }'}) = unknown เอ่ยชื่อ · ไม่ถูกมองเป็น "ไม่มี" · รอบถัดไปได้ค่ากลับมา`, async () => {
      const arm = (rules) => Object.fromEntries(Object.entries(rules || {}).map(([k, v]) => [k, { ...v, throws }]));
      const world = twinWorld({ ...HELPER_WORLD, options: { fail: arm(row.fail), authFail: arm(row.authFail) } });

      const first = await loadSurveyReportInputs(world.db, { request: world.request, takenAt: world.source.takenAt });
      assert.deepEqual(first.unknown, [row.name]);
      assert.deepEqual(first.inputs.unknown, [row.name]);
      for (const key of row.nulls) assert.equal(first.inputs[key], null, `${key} ต้องเป็น null`);

      // ด่าน: เหตุชนิด system ที่บอกว่า "อ่านไม่สำเร็จ" บรรทัดเดียว · ไม่มีเหตุชนิด content งอกจากช่องที่ว่างเพราะอ่านพลาด
      const issues = surveyReportFreezeIssues(first.inputs);
      const label = SURVEY_REPORT_INPUT_LABELS[row.name];
      assert.deepEqual(issues, [{ kind: 'system', text: `อ่าน${label}ไม่สำเร็จ` }]);
      // โหมดตรึงไม่ออกภาพนิ่งจากอินพุตที่มีชิ้นไม่ทราบ — กระดาษที่ตรึงแล้วเติมช่องที่หายทีหลังไม่ได้
      assert.deepEqual(snapshotOf(first.inputs, world.source).errors, [`อ่าน${label}ไม่สำเร็จ`]);

      const second = await loadSurveyReportInputs(world.db, { request: world.request, takenAt: world.source.takenAt });
      assert.deepEqual(second.unknown, []);
      assert.ok(row.back(second.inputs), 'รอบสองต้องได้ค่ากลับมา');
      assert.deepEqual(surveyReportFreezeIssues(second.inputs), []);
      const snap = snapshotOf(second.inputs, world.source);
      assert.equal(snap.errors, undefined);
      assert.deepEqual(snap.snapshot.visit.helpers, ['Helper One']);
      assert.equal(snap.snapshot.deal.code, 'DL-260900570');
      assert.equal(snap.snapshot.visit.assignee.roleLabel, ROLE_LABELS.ts_senior);
    });
  }
}

test('หลายชิ้นล้มพร้อมกัน = เอ่ยชื่อครบทุกชิ้น · ไม่ throw', async () => {
  const world = twinWorld({
    options: { fail: { sales_deals: { times: 1 }, customers: { times: 1, throws: true }, document_standard_versions: { times: 1 } } },
  });
  const { unknown } = await loadSurveyReportInputs(world.db, { request: world.request, takenAt: NOW });
  assert.deepEqual([...unknown].sort(), ['customer', 'deal', 'form']);
});

test('ไม่มีจริง ≠ อ่านไม่สำเร็จ: ใบไม่มีดีล · ไซต์ถูกลบ · ไม่มีผู้ช่วย · บัญชีผู้ประเมินถูกลบ — ช่องเป็น null โดย unknown ว่าง', async () => {
  const world = twinWorld();
  world.tables.service_sites = [];
  const db = fakeDb(world.tables, { users: {} }); // ฐานปลอมตัวใหม่ที่ไม่มีบัญชี U-lead
  const { inputs, unknown } = await loadSurveyReportInputs(db, { request: { ...world.request, dealId: null }, takenAt: NOW });
  assert.deepEqual(unknown, []);
  assert.equal(inputs.deal, null);
  assert.equal(inputs.site, null);
  assert.equal(inputs.assigneeRoleLabel, null, 'บัญชีถูกลบ = ไม่มีตำแหน่งให้พิมพ์ ไม่ใช่อ่านพลาด');
  assert.deepEqual(inputs.helpers, []);
  assert.equal(db.log.filter((q) => q.table === 'sales_deals').length, 0, 'ไม่มี dealId = ไม่ยิง');
  // ไซต์ที่ไม่มีจริงเป็นเหตุของระบบ (แก้ได้โดยไม่ต้องดึงผลกลับ) — คนละบรรทัดกับ "อ่านไม่สำเร็จ"
  assert.deepEqual(surveyReportFreezeIssues(inputs), [{ kind: 'system', text: 'ไม่พบข้อมูลสถานที่ของใบนี้' }]);
});

test('ไม่มีบริษัทที่เผยแพร่ = ค่าสำรองของ documentBrand (ไม่ใช่ unknown) · ไม่มีมาตรฐานที่เผยแพร่ = form null + เหตุชนิด system', async () => {
  const world = twinWorld();
  world.tables.organization_setting_versions = [];
  world.tables.document_standard_versions = world.tables.document_standard_versions.filter((r) => r.documentKey !== SURVEY_REPORT_STANDARD_KEY);
  const { inputs, unknown } = await loadSurveyReportInputs(world.db, { request: world.request, takenAt: NOW });
  assert.deepEqual(unknown, []);
  assert.ok(inputs.company.name, 'ค่าสำรองมีชื่อบริษัทเสมอ');
  assert.equal(inputs.form, null);
  assert.deepEqual(surveyReportFreezeIssues(inputs), [{ kind: 'system', text: 'ไม่พบมาตรฐานเอกสารของรายงานการประเมินพื้นที่' }]);
});

/* ══ 3. นัดที่เอกสารรับรอง ═══════════════════════════════════════════════════════ */

const visitRow = (id, status, extra = {}) => ({
  id, requestId: REQUEST_ID, code: `SV-${id}`, status, scheduledDate: '2026-09-20', startTime: null, endTime: null,
  actualDate: null, actualStartTime: null, actualEndTime: null, actualEndDate: null,
  assigneeId: 'U-lead', assigneeName: 'Lead Assessor', assistantIds: [], unableReason: null,
  createdAt: '2026-09-19T00:00:00.000+00:00', ...extra,
});

test('🔴 นัดที่รับรอง = นัด `done` ล่าสุดตามวันเข้าจริง แล้ว createdAt — ไม่ใช่ใบล่าสุดสถานะใดก็ได้', async () => {
  const visits = [
    visitRow('A', 'unable', { actualDate: '2026-09-21', unableReason: 'ไซต์ปิดปรับปรุง เข้าไม่ได้', createdAt: '2026-09-19T00:00:00.000+00:00' }),
    visitRow('B', 'done', { actualDate: '2026-09-25', createdAt: '2026-09-22T00:00:00.000+00:00' }),
    visitRow('C', 'done', { actualDate: '2026-09-23', createdAt: '2026-09-24T00:00:00.000+00:00' }),
    visitRow('D', 'cancelled', { createdAt: '2026-09-27T00:00:00.000+00:00' }),
    visitRow('E', 'unable', { scheduledDate: '2026-09-18', unableReason: 'ลูกค้าเลื่อนหน้างาน', createdAt: '2026-09-17T00:00:00.000+00:00' }),
  ];
  const world = twinWorld({ visits });
  const { inputs, unknown } = await loadSurveyReportInputs(world.db, { request: world.request, takenAt: NOW });
  assert.deepEqual(unknown, []);
  assert.equal(inputs.visit.id, 'B');
  // นัดที่ทำไม่ได้ทุกใบของคำร้อง เรียงเก่าก่อน · วันเข้าจริง ไม่มีค่อยใช้วันนัด
  assert.deepEqual(inputs.priorUnable, [
    { date: '2026-09-18', reason: 'ลูกค้าเลื่อนหน้างาน' },
    { date: '2026-09-21', reason: 'ไซต์ปิดปรับปรุง เข้าไม่ได้' },
  ]);
  assert.equal(surveyReportVisitOf(visits).id, 'B');
  assert.equal(surveyReportVisitOf([visits[0], visits[3]]), null, 'ไม่มีนัด done = ไม่มีนัดให้รับรอง');
  assert.equal(surveyReportVisitOf(null), null);
});

test('วันเข้าจริงเท่ากัน = นัดที่สร้างทีหลัง · ผลนิ่งไม่ขึ้นกับลำดับที่ฐานคืน', () => {
  const a = visitRow('A', 'done', { actualDate: '2026-09-25', createdAt: '2026-09-22T00:00:00.000+00:00' });
  const b = visitRow('B', 'done', { actualDate: '2026-09-25', createdAt: '2026-09-23T00:00:00.000+00:00' });
  assert.equal(surveyReportVisitOf([a, b]).id, 'B');
  assert.equal(surveyReportVisitOf([b, a]).id, 'B');
});

test('⭐ นัดที่การส่งผลนี้ปิด (`closedVisit`) มาก่อนนัด done ในฐาน · ปิดพร้อมส่งผล = จริงโดยไม่ต้องอ่านเธรด', async () => {
  const visits = [visitRow('B', 'done', { actualDate: '2026-09-20' }), visitRow('E', 'unable', { unableReason: 'เข้าไม่ได้เพราะฝนตกหนัก' })];
  const world = twinWorld({ visits });
  const closedVisit = visitRow('Z', 'done', { actualDate: '2026-09-26', assistantIds: ['U-h1'] });
  const db = fakeDb(world.tables, { users: { 'U-h1': { id: 'U-h1', email: 'h1@example.test', user_metadata: {} } } });
  const { inputs, unknown } = await loadSurveyReportInputs(db, { request: world.request, closedVisit, takenAt: NOW });
  assert.deepEqual(unknown, []);
  assert.equal(inputs.visit.id, 'Z');
  assert.equal(inputs.visitClosedBySend, true);
  assert.equal(db.log.filter(isThread('service_visit')).length, 0);
  assert.deepEqual(inputs.helpers, [{ id: 'U-h1', name: 'h1@example.test' }], 'ชื่อที่แสดง: ชื่อในบัญชี ไม่มีค่อยใช้อีเมล');
  assert.deepEqual(inputs.priorUnable, [{ date: '2026-09-20', reason: 'เข้าไม่ได้เพราะฝนตกหนัก' }]);
  assert.equal(inputs.assigneeRoleLabel, null, 'ฐานปลอมนี้ไม่มีบัญชี U-lead = บัญชีถูกลบ');
});

test('🔴 อ่านนัดไม่สำเร็จแต่มี `closedVisit`: รับรองนัดนั้นได้ แต่ยังเอ่ยชื่อ visits (ไม่รู้ว่ามีนัดที่ทำไม่ได้ไหม)', async () => {
  const world = twinWorld({ options: { fail: { service_visits: { times: 1 } } } });
  const closedVisit = visitRow('Z', 'done', { actualDate: '2026-09-26' });
  const { inputs, unknown } = await loadSurveyReportInputs(world.db, { request: world.request, closedVisit, takenAt: NOW });
  assert.deepEqual(unknown, ['visits']);
  assert.equal(inputs.visit.id, 'Z');
  assert.equal(inputs.priorUnable, null);
  assert.deepEqual(surveyReportFreezeIssues(inputs), [{ kind: 'system', text: 'อ่านนัดประเมินไม่สำเร็จ' }]);
});

test('ปิดพร้อมส่งผลไหม — อ่านจากแถว `done` ล่าสุดของเธรดนัด: meta.closedBySend · ข้อความขึ้นต้น "ปิดพร้อมส่งผล" (นัดก่อน PR-2)', async () => {
  const doneRow = (id, createdAt, extra) => ({
    id, kind: 'done', body: 'ปิดงาน', meta: {}, entityType: 'service_visit', entityId: 'SVV-1', createdAt, ...extra,
  });
  const read = async (thread) => {
    const world = twinWorld({ thread });
    const { inputs } = await loadSurveyReportInputs(world.db, { request: world.request, takenAt: NOW });
    return inputs.visitClosedBySend;
  };
  assert.equal(await read([]), false);
  assert.equal(await read([doneRow('T1', '2026-09-25T10:00:00.000+00:00', { meta: { closedBySend: true } })]), true);
  const legacy = surveySendCloseBody({ actualDate: '2026-09-25' }, { name: 'Head Sender' });
  assert.equal(await read([doneRow('T1', '2026-09-25T10:00:00.000+00:00', { body: legacy })]), true);
  // นัดถูกเปิดกลับแล้วช่างส่งงานเอง — แถวล่าสุดเป็นของช่าง
  assert.equal(await read([
    doneRow('T1', '2026-09-25T10:00:00.000+00:00', { meta: { closedBySend: true } }),
    doneRow('T2', '2026-09-25T12:00:00.000+00:00', { body: 'ช่างส่งงาน' }),
  ]), false);
  // เธรดของนัดอื่นไม่นับ
  assert.equal(await read([doneRow('T1', '2026-09-25T10:00:00.000+00:00', { entityId: 'SVV-other', meta: { closedBySend: true } })]), false);
});

test('ผู้ช่วย: Map ของ `loadCrewNames` → ลิสต์ตามลำดับบนนัด · ตัดคนไปที่ถูกใส่ซ้ำ · บัญชีที่ถูกลบไม่พิมพ์ · ลงภาพนิ่งเป็นชื่อ', async () => {
  const world = twinWorld({
    helperIds: ['U-h2', 'U-lead', 'U-gone', 'U-h1'],
    users: {
      'U-h1': { id: 'U-h1', user_metadata: { name: 'Helper One' } },
      'U-h2': { id: 'U-h2', user_metadata: { name: 'Helper Two' } },
    },
  });
  const { inputs, unknown } = await loadSurveyReportInputs(world.db, { request: world.request, takenAt: world.source.takenAt });
  assert.deepEqual(unknown, []);
  assert.ok(Array.isArray(inputs.helpers), 'ต้องเป็นลิสต์ — Map ส่งต่อทั้งก้อนกลายเป็น "ไม่มีผู้ช่วย" เงียบ ๆ');
  assert.deepEqual(inputs.helpers, [{ id: 'U-h2', name: 'Helper Two' }, { id: 'U-h1', name: 'Helper One' }]);
  assert.deepEqual(snapshotOf(inputs, world.source).snapshot.visit.helpers, ['Helper Two', 'Helper One']);
});

test('ตำแหน่งผู้ประเมิน: ป้ายของ ROLE_LABELS จาก app_metadata.role · role เก่าถูกแปลงก่อน · role ที่ไม่มีป้าย = null', async () => {
  const roleOf = async (role) => {
    const world = twinWorld({ users: { 'U-lead': { id: 'U-lead', app_metadata: { role } } } });
    const { inputs, unknown } = await loadSurveyReportInputs(world.db, { request: world.request, takenAt: NOW });
    assert.deepEqual(unknown, []);
    return inputs.assigneeRoleLabel;
  };
  assert.equal(await roleOf('ts'), ROLE_LABELS.ts);
  assert.equal(await roleOf('ts_manager'), ROLE_LABELS.ts_manager);
  assert.equal(await roleOf('ไม่มีตำแหน่งนี้'), null);
  assert.equal(await roleOf(undefined), null);
});

/* ══ 4. ของที่ผู้เรียกอ่านไว้แล้ว · ผู้ส่งที่กำลังจะเขียน ═════════════════════════════════════ */

test('ผู้เรียกส่ง zones/filesByZone/sizes ที่อ่านไว้แล้ว = ไม่อ่านซ้ำ · แถวของผู้เรียกไม่ถูกแก้', async () => {
  const world = twinWorld();
  const zones = world.tables.service_survey_zones.map((z) => ({ ...z }));
  const before = structuredClone(zones);
  const { inputs, unknown } = await loadSurveyReportInputs(world.db, {
    request: world.request, zones, filesByZone: world.source.filesByZone, sizes: world.source.sizes, takenAt: world.source.takenAt,
  });
  assert.deepEqual(unknown, []);
  for (const table of ['service_survey_zones', 'attachments', 'service_package_sizes']) {
    assert.equal(world.db.log.filter((q) => q.table === table).length, 0, `${table} ต้องไม่ถูกอ่านซ้ำ`);
  }
  assert.deepEqual(zones, before);
  assert.equal(inputs.zones, zones);
  assert.equal(snapshotOf(inputs, world.source).errors, undefined);
});

test('🔴 ผู้เรียกส่ง sizes = null (อ่านทะเบียนขนาดไม่สำเร็จ) = unknown เอ่ยชื่อ sizes ไม่ใช่ทะเบียนว่าง', async () => {
  const world = twinWorld();
  const { inputs, unknown } = await loadSurveyReportInputs(world.db, { request: world.request, sizes: null, takenAt: NOW });
  assert.deepEqual(unknown, ['sizes']);
  assert.equal(inputs.sizes, null);
  assert.equal(world.db.log.filter((q) => q.table === 'service_package_sizes').length, 0);
});

test('ผู้ส่งที่กำลังจะเขียน (`pendingAnswer`) ทับลงแถวใบในอินพุต — แถวของผู้เรียกไม่ถูกแก้ · takenAt ไม่ส่ง = null', async () => {
  const world = twinWorld();
  const request = { ...world.request, answeredAt: null, answeredById: null, answeredByName: null };
  const { inputs } = await loadSurveyReportInputs(world.db, {
    request, pendingAnswer: { answeredAt: NOW, answeredById: HEAD.id, answeredByName: HEAD.name },
  });
  assert.equal(request.answeredAt, null);
  assert.equal(inputs.request.answeredAt, NOW);
  assert.equal(inputs.request.answeredByName, 'Head Sender');
  assert.equal(inputs.takenAt, null);
  assert.deepEqual(surveyReportFreezeIssues(inputs), [{ kind: 'system', text: 'ไม่มีจุดเวลาของภาพนิ่ง' }]);
});

test('ประวัติ: ทุกรอบของ recall/send_back/send_back_done (ไม่ใช่แถวล่าสุดแถวเดียว) · มาตรฐาน: ฉบับเผยแพร่เลขสูงสุด', async () => {
  const source = stressSurveyInputs({ zones: [{}, {}], history: 30 });
  const world = worldFrom(source);
  world.tables.document_standard_versions.push({
    documentKey: SURVEY_REPORT_STANDARD_KEY, status: 'published', versionNumber: 2, formCode: 'FM-TS-01', revision: '01', effectiveDate: '2026-12-01', titleEn: 'SITE SURVEY REPORT',
  }, {
    documentKey: SURVEY_REPORT_STANDARD_KEY, status: 'draft', versionNumber: 3, formCode: 'FM-TS-01', revision: '02', effectiveDate: '2027-01-01', titleEn: 'SITE SURVEY REPORT',
  });
  const { inputs, unknown } = await loadSurveyReportInputs(world.db, { request: world.request, takenAt: source.takenAt });
  assert.deepEqual(unknown, []);
  assert.equal(inputs.history.length, 30);
  assert.deepEqual([...new Set(inputs.history.map((h) => h.kind))].sort(), ['recall', 'send_back', 'send_back_done']);
  assert.equal(snapshotOf(inputs, source).snapshot.history.length, 30);
  assert.deepEqual(inputs.form, { code: 'FM-TS-01', revision: '01', effectiveDate: '01/12/2569' });
});

/* ══ 5. รอบตรวจก่อนส่งผล ═════════════════════════════════════════════════════ */

const openVisit = (extra = {}) => visitRow('SVV-open', 'in_progress', {
  scheduledDate: '2026-09-25', startTime: '12:00', actualDate: '2026-09-25', actualStartTime: '13:10', ...extra,
});

/* ใบที่ยังไม่ส่งผล + นัดที่ค้างอยู่ (รูปเดียวกับที่ route ส่งผลถืออยู่ตอนถึง S5) */
function sendWorld({ source = twin(), open = openVisit(), extra = {} } = {}) {
  const world = worldFrom(source, { visits: open ? [open] : [], ...extra });
  const request = { ...world.request, status: 'in_progress', answeredAt: null, answeredById: null, answeredByName: null };
  return { ...world, request, open };
}

/* นัดที่ค้าง + แพตช์ปิดของ `surveySendVisitStep` — นัดที่การส่งผลนี้จะปิด (ตัวเดียวกับที่ route ใช้ปิดจริง) */
const closingOf = (open) => ({ ...open, ...surveySendVisitStep(open, { today: TODAY, needsVisit: true }).patch });

const precheck = (world, extra = {}) => surveyReportPrecheck(world.db, {
  request: world.request, user: HEAD, open: world.open, today: TODAY, nowIso: NOW, ...extra,
});

test('⭐ ใบที่พร้อมส่ง: ไม่มีเหตุขัดข้อง · คำเตือนคือชุดของฉบับลูกค้า · ไม่เขียนอะไร', async () => {
  const world = sendWorld();
  const result = await precheck(world);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.unknown, []);
  assert.ok(Array.isArray(result.warnings));

  // คำเตือน = ของฉบับลูกค้าจากภาพนิ่งโหมดร่าง — อย่างน้อยต้องมีคำเตือนข้อความอิสระของ PR-1 ครบทุกบรรทัด
  const { inputs } = await loadSurveyReportInputs(world.db, {
    request: world.request, closedVisit: closingOf(world.open), takenAt: NOW,
    pendingAnswer: { answeredAt: NOW, answeredById: HEAD.id, answeredByName: HEAD.name },
  });
  const view = surveyReportView(buildSurveyReportSnapshot(inputs, { mode: 'draft' }).snapshot, { version: 'customer' });
  const free = customerFreeTextWarnings(view);
  assert.ok(free.length > 0, 'ของจริงมีหมายเหตุที่เอ่ยถึงจุดติดตั้ง');
  for (const line of free) assert.ok(result.warnings.includes(line), line);

  for (const q of world.db.log) assert.equal(q.op, 'select');
});

test('ใส่ผู้ส่งที่กำลังจะเขียนให้เอง (answeredAt = nowIso · ชื่อ = คนกด) และรับรองนัดที่การส่งผลนี้จะปิด', async () => {
  const world = sendWorld();
  // ไม่มีนัด done ในฐานเลย — ถ้าไม่ใช้นัดที่ค้าง + แพตช์ปิด จะได้ "ไม่พบนัดประเมิน"
  assert.equal(world.tables.service_visits.filter((v) => v.status === 'done').length, 0);
  const result = await precheck(world);
  assert.deepEqual(result.blockers, [], JSON.stringify(result.blockers));
  // ไม่มีชื่อคนกด = เหตุชนิด content (ชื่อผู้ตรวจสอบและอนุมัติพิมพ์บนกระดาษ)
  const nameless = await surveyReportPrecheck(world.db, { request: world.request, user: { id: 'U-x' }, open: world.open, today: TODAY, nowIso: NOW });
  assert.deepEqual(nameless.blockers, [{ kind: 'content', text: 'ไม่มีชื่อผู้ตรวจสอบและอนุมัติ (ผู้ส่งผล)' }]);
});

test('ใบที่ส่งผลไปแล้ว (ปุ่มออกเอกสาร): ไม่ทับผู้ส่งบนแถว · รับรองนัด done ล่าสุด', async () => {
  const world = twinWorld();
  const result = await surveyReportPrecheck(world.db, { request: world.request, user: HEAD, open: null, today: TODAY, nowIso: NOW });
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.unknown, []);
  const nameless = await surveyReportPrecheck(world.db, {
    request: { ...world.request, answeredByName: null }, user: HEAD, open: null, today: TODAY, nowIso: NOW,
  });
  assert.deepEqual(nameless.blockers.map((b) => b.text), ['ไม่มีชื่อผู้ตรวจสอบและอนุมัติ (ผู้ส่งผล)'], 'ชื่อคนกดออกเอกสารไม่ใช่ผู้อนุมัติ');
});

test('🔴 ไม่มีนัดเลย = เหตุชนิด content · นัดที่ค้างยังเป็นร่าง = เหตุของ `surveySendVisitStep` เอง แทน "ไม่พบนัดประเมิน"', async () => {
  const none = await precheck(sendWorld({ open: null }));
  assert.deepEqual(none.blockers, [{ kind: 'content', text: SURVEY_REPORT_NO_VISIT }]);

  const draft = openVisit({ status: 'draft' });
  const world = sendWorld({ open: draft });
  const result = await precheck(world);
  assert.deepEqual(result.blockers, [{ kind: 'content', text: surveySendVisitStep(draft, { today: TODAY, needsVisit: true }).error }]);
  assert.match(result.blockers[0].text, /ยังเป็นร่าง/);
});

test('🔴 ของบนใบ = content: นัดไม่มีผู้ประเมิน · ผังเป็น PDF · รูป HEIC · รูปจุดยังไม่ผูก · พื้นที่ยังไม่มีขนาด', async () => {
  const source = twin({ spotLinks: null });
  const [z1, z2] = source.zones;
  source.filesByZone[z1.id] = source.filesByZone[z1.id].map((f) => (
    f.docType === 'survey_plan' ? { ...f, fileName: 'plan.pdf', mimeType: 'application/pdf' } : f
  ));
  source.filesByZone[z2.id] = source.filesByZone[z2.id].map((f) => (
    f.docType === 'survey_wide' ? { ...f, fileName: 'IMG_0001.HEIC', mimeType: 'image/heic' } : f
  ));
  z2.parts = [{ id: 'p', label: null, widthM: 3, lengthM: null, heightM: 3 }];
  const world = sendWorld({ source, open: openVisit({ assigneeName: null }) });
  const result = await precheck(world);
  const texts = result.blockers.map((b) => b.text);
  assert.deepEqual([...new Set(result.blockers.map((b) => b.kind))], ['content']);
  assert.ok(texts.includes('นัดประเมินไม่มีชื่อผู้ประเมิน'));
  assert.ok(texts.some((t) => /ยังไม่มีภาพผังที่ลงเอกสารได้/.test(t)));
  assert.ok(texts.some((t) => /เป็น HEIC\/BMP/.test(t) && t.includes('IMG_0001.HEIC')));
  assert.ok(texts.some((t) => /รูปยังไม่ได้ผูกจุด/.test(t)));
  assert.ok(texts.some((t) => /ยังไม่มีขนาด ก × ย × ส/.test(t)));
  assert.deepEqual(result.unknown, []);
});

test('🔴 ปัญหาของระบบ = system เท่านั้น: บริษัท/มาตรฐาน/ทะเบียนพื้นที่อ่านไม่ได้ ไม่มีเหตุชนิด content สักข้อ', async () => {
  const world = sendWorld({
    extra: { options: { fail: {
      organization_setting_versions: { times: 1 }, document_standard_versions: { times: 1, throws: true }, service_zones: { times: 1 },
    } } },
  });
  const result = await precheck(world);
  assert.deepEqual([...result.unknown].sort(), ['company', 'form', 'zoneRegistry']);
  assert.deepEqual(result.blockers.filter((b) => b.kind === 'content'), []);
  assert.deepEqual(result.blockers.map((b) => b.text).sort(), [
    'อ่านข้อมูลบริษัทไม่สำเร็จ', 'อ่านทะเบียนพื้นที่ไม่สำเร็จ', 'อ่านมาตรฐานเอกสารไม่สำเร็จ',
  ].sort());
  // คำเตือนยังคิดได้ (ภาพนิ่งโหมดร่างไม่ล้มเพราะของขาด)
  assert.ok(result.warnings.length > 0);
});

test('🔴 ฐานสะดุดตอนอ่านนัด/ไฟล์/ผลวัด ต้องไม่กลายเป็นเหตุชนิด content (การส่งผลตีกลับเฉพาะ content)', async () => {
  // ใบที่ส่งผลแล้ว: นัดมาจากฐาน — อ่านพลาด = ไม่รู้ ไม่ใช่ "ไม่พบนัดประเมิน"
  const answered = twinWorld({ options: { fail: { service_visits: { times: 1 } } } });
  const a = await surveyReportPrecheck(answered.db, { request: answered.request, user: HEAD, open: null, today: TODAY, nowIso: NOW });
  assert.deepEqual(a.blockers, [{ kind: 'system', text: 'อ่านนัดประเมินไม่สำเร็จ' }]);

  // ไฟล์อ่านพลาด: ไม่มีข้อ "ยังไม่มีภาพผัง" งอกรายพื้นที่
  const files = sendWorld({ extra: { options: { fail: { attachments: { times: 1 } } } } });
  const f = await precheck(files);
  assert.deepEqual(f.blockers, [{ kind: 'system', text: 'อ่านรูปของพื้นที่ไม่สำเร็จ' }]);

  // ผลวัดอ่านพลาด: ไม่มีข้อ "ไม่มีพื้นที่ที่ประเมิน"
  const zones = sendWorld({ extra: { options: { fail: { service_survey_zones: { times: 1, throws: true } } } } });
  const z = await precheck(zones);
  assert.deepEqual(z.blockers, [{ kind: 'system', text: 'อ่านผลวัดรายพื้นที่ไม่สำเร็จ' }]);
  assert.deepEqual(z.unknown, ['zones']);
});

test('ผู้เรียกส่งของที่อ่านไว้แล้วสำหรับด่านหกข้อ — รอบตรวจไม่อ่านซ้ำ', async () => {
  const world = sendWorld();
  const zones = world.tables.service_survey_zones.map((z) => ({ ...z }));
  const result = await precheck(world, { zones, filesByZone: world.source.filesByZone, sizes: world.source.sizes });
  assert.deepEqual(result.blockers, []);
  for (const table of ['service_survey_zones', 'attachments', 'service_package_sizes']) {
    assert.equal(world.db.log.filter((q) => q.table === table).length, 0, table);
  }
});

test('🔴 หน้าที่ล้น (แบ่งไม่ได้) = เหตุชนิด content บอกฉบับและหน้า — ของทั้งสองฉบับ ไม่ใช่เฉพาะฉบับลูกค้า', async () => {
  // หัวหน้า 1 ของฉบับภายในสูงเกินหน้า (ชุดเดียวกับเทสต์ของตัวจัดหน้า): ลูกค้า/ไซต์/ที่อยู่ยาว + ผู้ช่วย 4 คน + ชื่องาน 200 ตัว
  const source = stressSurveyInputs({ zones: [{}, {}, {}], helpers: 4, title: thaiText(200) });
  source.customer = { ...source.customer, name: thaiText(200) };
  source.site = { ...source.site, name: thaiText(150), address: thaiText(400) };
  const helperIds = source.helpers.map((h) => h.id);
  const users = Object.fromEntries(source.helpers.map((h) => [h.id, { id: h.id, user_metadata: { name: h.name } }]));
  const world = sendWorld({ source, open: openVisit({ assistantIds: helperIds }), extra: { users } });
  const result = await precheck(world);

  // ค่าที่คาดหวังคิดจากตัวจัดหน้าตรง ๆ ด้วยอินพุตเดียวกับที่รอบตรวจใช้
  const { inputs } = await loadSurveyReportInputs(world.db, {
    request: world.request, closedVisit: closingOf(world.open), takenAt: NOW,
    pendingAnswer: { answeredAt: NOW, answeredById: HEAD.id, answeredByName: HEAD.name },
  });
  const snapshot = buildSurveyReportSnapshot(inputs, { mode: 'check' }).snapshot;
  const want = [['customer', 'ฉบับลูกค้า'], ['internal', 'ฉบับภายใน']].flatMap(([version, label]) => (
    surveyReportOverflowErrors(paginateSurveyReport(surveyReportView(snapshot, { version })))
      .map((line) => ({ kind: 'content', text: `${label}: ${line}` }))
  ));
  assert.ok(want.some((b) => b.text.startsWith('ฉบับภายใน: หน้า 1 ')), 'ชุดนี้ต้องล้นที่หน้า 1 ของฉบับภายใน');
  assert.deepEqual(result.blockers, want);
});

test('🔴 คำว่า "ฉบับภายใน" ในข้อความที่คนพิมพ์: รอบตรวจไม่ตีกลับ ไม่เตือน — และกระดาษฉบับลูกค้าของใบเดียวกันผ่านยามกันรั่ว (สองด่านตัดสินตรงกัน)', async () => {
  /* มติ 3: ข้อความของผู้สำรวจพิมพ์ตามที่พิมพ์มา · มติ 2: อะไรที่ทำให้เอกสารออกไม่ได้ต้องตีกลับ **ก่อน** เขียนคำตอบ
     🐞 เดิมยามกันรั่วค้นคำนี้ทั้ง HTML: รอบตรวจปล่อยผ่าน → ใบถูกตอบ กระดิ่งถึงฝ่ายขาย → เอกสารออกไม่ได้ทุกครั้งที่กด
     ⇒ ล็อกสองฝั่งคู่กัน: ข้อความที่รอบตรวจไม่ตีกลับ ต้องลงกระดาษฉบับลูกค้าได้และไม่ติดยาม · ยามกลับไปค้นคำเมื่อไร เทสต์นี้ล้ม */
  const PHRASE = 'ฉบับภายใน';
  const typed = [
    ['หมายเหตุพื้นที่', (source) => { source.zones[0].note = 'ดูรายละเอียดในฉบับภายใน'; }],
    ['ชื่อพื้นที่', (source) => { source.zones[0].zoneName = 'ห้องเก็บเอกสารฉบับภายใน'; }],
    ['ชื่อสถานที่', (source) => { source.site = { ...source.site, name: 'อาคารฉบับภายใน' }; }],
    ['ที่อยู่', (source) => { source.site = { ...source.site, address: '99 ซอยฉบับภายใน กรุงเทพฯ' }; }],
    ['ผู้ติดต่อหน้างาน', (source) => { source.site = { ...source.site, contactName: 'คุณฉบับภายใน' }; }],
    ['ชื่อลูกค้า', (source) => { source.customer = { ...source.customer, name: 'บริษัท ฉบับภายใน จำกัด' }; }],
  ];
  for (const [what, edit] of typed) {
    const source = twin();
    edit(source);
    const world = sendWorld({ source });
    const result = await precheck(world);
    assert.deepEqual(result.blockers, [], `${what}: ${JSON.stringify(result.blockers)}`);
    assert.deepEqual(result.unknown, [], what);
    assert.deepEqual(result.warnings.filter((line) => line.includes(PHRASE)), [], what);

    // กระดาษฉบับลูกค้าจากอินพุตชุดเดียวกับที่รอบตรวจใช้ (ผู้ส่งที่กำลังจะเขียน + นัดที่การส่งผลนี้จะปิด) — ตัวที่ขั้นออกเลขจะเรนเดอร์
    const { inputs } = await loadSurveyReportInputs(world.db, {
      request: world.request, closedVisit: closingOf(world.open), takenAt: NOW,
      pendingAnswer: { answeredAt: NOW, answeredById: HEAD.id, answeredByName: HEAD.name },
    });
    const built = snapshotOf(inputs, source);
    assert.equal(built.errors, undefined, `${what}: ${(built.errors || []).join(' | ')}`);
    const view = surveyReportView(built.snapshot, { version: 'customer' });
    const layout = paginateSurveyReport(view);
    const html = renderSurveyReportHTML({ view, layout, docNo: null, issuedAt: null });
    assert.ok(html.includes(PHRASE), `${what}: ข้อความต้องลงกระดาษฉบับลูกค้าตามที่พิมพ์`);
    assert.deepEqual(surveyReportCustomerHtmlIssues({ html, snapshot: built.snapshot, layout }), [], what);
  }
});

test('ภาพนิ่งโหมดตรวจออกไม่ได้ (มีเหตุขัดข้อง) = ไม่จัดหน้า ไม่มีเหตุล้นปน · คำเตือนยังมาจากโหมดร่าง', async () => {
  const source = stressSurveyInputs({ zones: [{ plan: 0, note: 'ราคาเครื่องรุ่นนี้ 500 บาท' }, {}] });
  const world = sendWorld({ source });
  const result = await precheck(world);
  assert.equal(result.blockers.length, 1);
  assert.match(result.blockers[0].text, /ยังไม่มีภาพผังที่ลงเอกสารได้/);
  assert.equal(result.blockers[0].kind, 'content');
  assert.ok(result.warnings.some((w) => /"เครื่อง"/.test(w) && /"ราคา"/.test(w)), JSON.stringify(result.warnings));
});
