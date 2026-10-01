// ── ยามของ API ทะเบียนขนาดแพ็คเกจ + ด่านเคาะ/ส่งผล (mig 0398 · มติเจ้าของ 01/10) ─────────────
//
// ⭐ สามชั้นที่ต้องล็อก:
//   1. สิทธิ์ — แก้ทะเบียน = แอดมิน + หัวหน้าฝ่ายบริการ (ตัวเดียวกับ "ส่งผลประเมิน") · อ่าน = ทุกคนที่เข้าฐานข้อมูลได้
//      · ช่างผ่าน proxy (ถือ service:work) แล้วต้องโดน 403 ที่ handler
//   2. ตัวเขียน (`packageSizesRepo.js`) รันกับฐานปลอม — 403/404/409 · รหัสแก้ไม่ได้ · ขนาดสุดท้ายลบไม่ได้ ·
//      audit ครบ · "กี่ใบใช้ขนาดนี้" นับเฉพาะใบที่ยังไม่ส่งผล และ query พัง = โยน ไม่ใช่ศูนย์
//   3. route ต่อสายถูก — ทุก route ถามตัวตัดสินกลาง · เคาะ (PUT) · อ่านใบ (GET) · ส่งผล (POST)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { canManagePackageSizes, canSendSurveyResult, canViewServiceRegistry, ROLES } from '../permissions.js';
import { IN_CHUNK_SIZE } from '../supabaseInChunks.js';
import { PACKAGE_SIZE_EDIT_DENIED } from './packageSizes.js';
import {
  PACKAGE_SIZE_COLUMNS,
  createPackageSize,
  deletePackageSize,
  findPackageSize,
  loadPackageSizes,
  loadPackageSizesOrNull,
  packageSizeUsage,
  updatePackageSize,
} from './packageSizesRepo.js';

const WEBAPP = process.cwd();
/* ตัดคอมเมนต์ก่อนตรวจ — คอมเมนต์ในไฟล์เอ่ยชื่อสิ่งต้องห้ามไว้สอนคน */
const code = (p) => fs.readFileSync(path.join(WEBAPP, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const LIST_ROUTE = 'src/app/api/service/package-sizes/route.js';
const ITEM_ROUTE = 'src/app/api/service/package-sizes/[code]/route.js';
const ZONE_ROUTE = 'src/app/api/service/surveys/[id]/zones/[zoneId]/route.js';
const SURVEY_ROUTE = 'src/app/api/service/surveys/[id]/route.js';
const SEND_ROUTE = 'src/app/api/service/surveys/[id]/send/route.js';
const RECALL_ROUTE = 'src/app/api/service/surveys/[id]/recall/route.js';

/* ── ฐานข้อมูลปลอม — กรองจริงตาม eq/in/is/not · ตัดที่ 1,000 แถวเหมือน max_rows ของโปรเจกต์ ─────────── */
const MAX_ROWS = 1000;
function fakeDb(tables = {}, { errors = {}, writeErrors = {} } = {}) {
  const log = [];
  const db = {
    log,
    tables,
    from(table) {
      const q = { table, op: 'select', select: null, filters: [], orders: [], ranged: false, values: null };
      log.push(q);
      const matches = (row) => q.filters.every(([op, col, val]) => {
        if (op === 'eq') return row[col] === val;
        if (op === 'in') return val.includes(row[col]);
        if (op === 'is') return (row[col] ?? null) === val;
        if (op === 'not-is') return (row[col] ?? null) !== val;
        return true;
      });
      const rows = () => (tables[table] || []).filter(matches);
      const run = (from = 0, to = MAX_ROWS - 1) => {
        if (q.op === 'select') {
          if (errors[table]) return { data: null, error: errors[table] };
          /* คืนสำเนา — แถวที่อ่านไปแล้ว (`before` ของ audit) ต้องไม่เปลี่ยนตามการเขียนทีหลัง เหมือนฐานจริง */
          return { data: rows().slice(from, Math.min(to + 1, from + MAX_ROWS)).map((row) => ({ ...row })), error: null };
        }
        if (writeErrors[table]) return { data: null, error: writeErrors[table] };
        if (q.op === 'insert') {
          const row = { createdAt: 'now', updatedAt: 'now', ...q.values };
          tables[table] = [...(tables[table] || []), row];
          return { data: [row], error: null };
        }
        if (q.op === 'update') {
          const hit = rows();
          hit.forEach((row) => Object.assign(row, q.values));
          return { data: hit.map((row) => ({ ...row })), error: null };
        }
        const gone = rows();
        tables[table] = (tables[table] || []).filter((row) => !gone.includes(row));
        return { data: gone, error: null };
      };
      const one = (strict) => {
        const { data, error } = run();
        if (error) return Promise.resolve({ data: null, error });
        if (strict && data.length !== 1) return Promise.resolve({ data: null, error: { message: 'no rows' } });
        return Promise.resolve({ data: data[0] || null, error: null });
      };
      const chain = {
        select(cols) { if (q.op === 'select') q.select = cols; return chain; },
        insert(values) { q.op = 'insert'; q.values = values; return chain; },
        update(values) { q.op = 'update'; q.values = values; return chain; },
        delete() { q.op = 'delete'; return chain; },
        eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
        in(col, val) { q.filters.push(['in', col, val]); return chain; },
        is(col, val) { q.filters.push(['is', col, val]); return chain; },
        not(col, op, val) { q.filters.push([`not-${op}`, col, val]); return chain; },
        order(col, opts = {}) { q.orders.push([col, opts.ascending !== false]); return chain; },
        range(from, to) { q.ranged = true; return Promise.resolve(run(from, to)); },
        maybeSingle() { return one(false); },
        single() { return one(true); },
        then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
      };
      return chain;
    },
  };
  return db;
}

const seed = () => [
  { code: 'XS', nameEn: 'Extra Small', maxCbm: null, autoSuggest: false, note: 'ห้องน้ำ' },
  { code: 'SM', nameEn: 'Small', maxCbm: 300, autoSuggest: true, note: null },
  { code: 'ST', nameEn: 'Standard', maxCbm: 2400, autoSuggest: true, note: null },
  { code: 'XL', nameEn: 'Extra Large', maxCbm: null, autoSuggest: true, note: null },
];
const HEAD = { id: 7, name: 'Arnon', role: 'ts_manager', department: 'TS' };
/* error ของ supabase เป็นออบเจ็กต์ธรรมดา `{ message }` (ไม่ใช่ Error) — route อ่าน `e.message` */
const failsWith = (pattern) => (e) => pattern.test(String(e?.message));
const asHead = { user: HEAD, canEdit: true };

/* ══ 1. สิทธิ์ ════════════════════════════════════════════════════════════ */

test('⭐ แก้ทะเบียนขนาดแพ็คเกจ = แอดมิน + หัวหน้าฝ่ายบริการ + CD/CM — ชุดเดียวกับคนส่งผลประเมิน', () => {
  const editors = ROLES.filter((role) => canManagePackageSizes({ role, department: 'TS' })).sort();
  assert.deepEqual(editors, ['admin', 'commercial_director', 'commercial_manager', 'ts_audit', 'ts_manager', 'ts_senior']);
  for (const role of ROLES) {
    const me = { role, department: 'TS' };
    assert.equal(canManagePackageSizes(me), canSendSurveyResult(me), role);
  }
  // ช่าง Operation และ Planner แก้ทะเบียนไม่ได้ — คนเคาะขนาดคือหัวหน้า คนตั้งขนาดก็ต้องเป็นหัวหน้า
  assert.equal(canManagePackageSizes({ role: 'ts', department: 'TS' }), false);
  assert.equal(canManagePackageSizes(null), false);
});

test('อ่านทะเบียน = ทุกคนที่เข้าฐานข้อมูลได้ (ด่านเดียวกับทะเบียนไซต์/เครื่อง) — ฝ่ายขายและช่างอ่านได้', () => {
  for (const role of ['ae', 'ac', 'ts', 'ts_manager', 'admin']) {
    assert.equal(canViewServiceRegistry({ role }), true, role);
  }
});

/* ══ 2. ตัวอ่าน/เขียน กับฐานปลอม ══════════════════════════════════════════ */

test('อ่านทะเบียน: เรียงตามกติกา (เลือกเอง → ช่วงน้อยไปมาก → ไม่มีเพดาน) · เลือกคอลัมน์ตามค่าคงที่ · พัง = โยน', async () => {
  const db = fakeDb({ service_package_sizes: seed().reverse() });
  assert.deepEqual((await loadPackageSizes(db)).map((s) => s.code), ['XS', 'SM', 'ST', 'XL']);
  assert.equal(db.log[0].select, PACKAGE_SIZE_COLUMNS);
  assert.equal((await findPackageSize(db, 'st')).nameEn, 'Standard', 'รหัสเทียบแบบตัวใหญ่');
  assert.equal(await findPackageSize(db, 'ZZ'), null);
  assert.equal(await findPackageSize(db, ''), null);

  const down = fakeDb({}, { errors: { service_package_sizes: { message: 'relation does not exist' } } });
  await assert.rejects(() => loadPackageSizes(down), failsWith(/relation does not exist/));
  // ⚠️ ทางของ GET ใบประเมิน/ส่งผล: อ่านไม่สำเร็จ = null (ด่านปลายทาง fail-closed) ไม่ใช่ [] ที่อ่านว่า "ทะเบียนว่าง"
  assert.equal(await loadPackageSizesOrNull(down), null);
  assert.equal((await loadPackageSizesOrNull(db)).length, 4);
});

test('เพิ่มขนาด: ลงแถว + ประทับคนแก้ + คืน audit `create` · ช่วงของขนาดเลือกเองถูกทิ้ง', async () => {
  const db = fakeDb({ service_package_sizes: seed() });
  const out = await createPackageSize(db, { ...asHead, body: { code: ' md ', nameEn: 'Medium', maxCbm: '1,000' } });
  assert.equal(out.status, 201);
  assert.deepEqual(
    { ...out.data, createdAt: undefined, updatedAt: undefined },
    { code: 'MD', nameEn: 'Medium', maxCbm: 1000, autoSuggest: true, note: null, updatedById: '7', updatedByName: 'Arnon', createdAt: undefined, updatedAt: undefined },
  );
  assert.equal(out.audit.action, 'create');
  assert.equal(out.audit.entityType, 'service_package_size');
  assert.equal(out.audit.entityId, 'MD');
  assert.match(out.audit.summary, /เพิ่มขนาดแพ็คเกจ MD \(Medium\) · ≤ 1,000 ลบ\.ม\./);
  assert.equal(db.tables.service_package_sizes.length, 5);

  const manual = await createPackageSize(db, { ...asHead, body: { code: 'RS', nameEn: 'Restroom', maxCbm: 80, autoSuggest: false } });
  assert.equal(manual.data.maxCbm, null);
  assert.match(manual.audit.summary, /เลือกเอง/);
});

test('🔴 ช่าง/ฝ่ายขาย (canEdit=false) เขียนไม่ได้ทั้งสามทาง = 403 และไม่แตะฐาน', async () => {
  const db = fakeDb({ service_package_sizes: seed() });
  const crew = { user: { id: 9, role: 'ts' }, canEdit: false };
  for (const out of [
    await createPackageSize(db, { ...crew, body: { code: 'MD', nameEn: 'Medium', maxCbm: 1000 } }),
    await updatePackageSize(db, { ...crew, code: 'ST', body: { nameEn: 'x' } }),
    await deletePackageSize(db, { ...crew, code: 'ST' }),
  ]) {
    assert.equal(out.status, 403);
    assert.equal(out.error, PACKAGE_SIZE_EDIT_DENIED);
    assert.equal(out.audit, undefined);
  }
  assert.equal(db.log.length, 0, 'ไม่มีสิทธิ์ = ไม่อ่านไม่เขียนอะไรเลย');
  assert.equal(db.tables.service_package_sizes.length, 4);
});

test('เพิ่มซ้ำ/ช่วงชน = 400 จากด่านกลาง · ชนกันที่ฐาน (23505 — สองคนกดพร้อมกัน) = 409 ภาษาไทย', async () => {
  const db = fakeDb({ service_package_sizes: seed() });
  const dup = await createPackageSize(db, { ...asHead, body: { code: 'ST', nameEn: 'Standard 2', maxCbm: 900 } });
  assert.equal(dup.status, 400);
  assert.match(dup.error, /ST มีอยู่แล้ว/);
  const band = await createPackageSize(db, { ...asHead, body: { code: 'MD', nameEn: 'Medium', maxCbm: 300 } });
  assert.match(band.error, /มีอยู่แล้ว: SM/);

  const race = fakeDb({ service_package_sizes: seed() }, { writeErrors: { service_package_sizes: { code: '23505', message: 'duplicate key' } } });
  const out = await createPackageSize(race, { ...asHead, body: { code: 'MD', nameEn: 'Medium', maxCbm: 1000 } });
  assert.equal(out.status, 409);
  assert.match(out.error, /MD.*มีอยู่แล้วในทะเบียน/);
  assert.doesNotMatch(out.error, /duplicate key/);
});

test('แก้ขนาด: รวมแถวเดิมก่อนตรวจ (ส่งมาเฉพาะช่องที่แตะ) · ประทับคนแก้/เวลา · audit มี before/after', async () => {
  const db = fakeDb({ service_package_sizes: seed() });
  const out = await updatePackageSize(db, { ...asHead, code: 'sm', body: { maxCbm: 350 } });
  assert.equal(out.status, 200);
  assert.equal(out.data.maxCbm, 350);
  assert.equal(out.data.nameEn, 'Small', 'ช่องที่ไม่ได้ส่งมาไม่หาย');
  assert.equal(out.data.updatedById, '7');
  assert.equal(out.data.updatedByName, 'Arnon');
  assert.match(String(out.data.updatedAt), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(out.audit.action, 'update');
  assert.equal(out.audit.before.maxCbm, 300);
  assert.equal(out.audit.after.maxCbm, 350);
  const write = db.log.find((q) => q.op === 'update');
  assert.deepEqual(Object.keys(write.values).sort(),
    ['autoSuggest', 'maxCbm', 'nameEn', 'note', 'updatedAt', 'updatedById', 'updatedByName']);
  assert.equal('code' in write.values, false, 'ไม่เขียนคอลัมน์รหัสทับ');
});

test('🔴 รหัสแก้ไม่ได้ · ไม่พบ = 404 · สลับเป็น "เลือกเอง" ทิ้งช่วงเดิมให้เอง', async () => {
  const db = fakeDb({ service_package_sizes: seed() });
  const rename = await updatePackageSize(db, { ...asHead, code: 'ST', body: { code: 'SD' } });
  assert.equal(rename.status, 400);
  assert.match(rename.error, /รหัส ST แก้ไม่ได้/);
  assert.equal((await updatePackageSize(db, { ...asHead, code: 'ZZ', body: { nameEn: 'x' } })).status, 404);
  const manual = await updatePackageSize(db, { ...asHead, code: 'SM', body: { autoSuggest: false } });
  assert.equal(manual.status, 200);
  assert.equal(manual.data.maxCbm, null);
});

/* ── "กี่ใบใช้ขนาดนี้" — เฉพาะใบประเมินที่ยังไม่ส่งผล ───────────────────────── */
const surveyReq = (o) => ({
  kind: 'site_survey', dept: 'TS', status: 'acknowledged', answeredAt: null, cancelledAt: null, closedAt: null, ...o,
});
const usageTables = () => ({
  service_package_sizes: seed(),
  dept_requests: [
    surveyReq({ id: 'R1', docNo: 'RQ-AS-0001' }),
    surveyReq({ id: 'R2', docNo: 'RQ-AS-0002', status: 'pending' }),
    surveyReq({ id: 'R-sent', docNo: 'RQ-AS-0003', status: 'answered', answeredAt: '2026-09-30T02:00:00Z' }),
    surveyReq({ id: 'R-cancel', docNo: 'RQ-AS-0004', cancelledAt: '2026-09-30T02:00:00Z' }),
    surveyReq({ id: 'R-closed', docNo: 'RQ-AS-0005', closedAt: '2026-09-30T02:00:00Z' }),
    surveyReq({ id: 'R-other', docNo: 'RQ-RD-0001', dept: 'RD', kind: 'scent' }),
  ],
  service_survey_zones: [
    { id: 'Z1', requestId: 'R1', packageSize: 'ST', status: 'ok' },
    { id: 'Z2', requestId: 'R1', packageSize: 'ST', status: 'added' },
    { id: 'Z3', requestId: 'R1', packageSize: 'SM', status: 'ok' },
    { id: 'Z4', requestId: 'R1', packageSize: 'ST', status: 'cut' },      // ตัดออกแล้ว ไม่ต้องเลือกใหม่
    { id: 'Z5', requestId: 'R1', packageSize: null, status: 'ok' },       // ยังไม่เคาะ
    { id: 'Z6', requestId: 'R2', packageSize: 'ST', status: 'ok' },
    { id: 'Z7', requestId: 'R-sent', packageSize: 'ST', status: 'ok' },   // ส่งผลแล้ว = ภาพนิ่ง ไม่กระทบ
    { id: 'Z8', requestId: 'R-cancel', packageSize: 'ST', status: 'ok' },
    { id: 'Z9', requestId: 'R-closed', packageSize: 'ST', status: 'ok' },
  ],
});

test('⭐ นับการใช้: เฉพาะใบที่ยังไม่ส่งผล (ไม่ยกเลิก · ไม่ปิด) · พื้นที่ที่ตัดออก/ยังไม่เคาะไม่นับ', async () => {
  const db = fakeDb(usageTables());
  const usage = await packageSizeUsage(db);
  assert.deepEqual(usage, {
    ST: { surveys: 2, zones: 3, docNos: ['RQ-AS-0001', 'RQ-AS-0002'] },
    SM: { surveys: 1, zones: 1, docNos: ['RQ-AS-0001'] },
  });
  const [reqQuery, zoneQuery] = db.log;
  assert.equal(reqQuery.table, 'dept_requests');
  assert.equal(reqQuery.ranged, true, 'คำร้องโตตามธุรกรรม — ต้องไล่หน้า (check:rowcap)');
  assert.deepEqual(reqQuery.filters.filter(([op]) => op === 'is').map(([, col]) => col).sort(),
    ['answeredAt', 'cancelledAt', 'closedAt']);
  assert.equal(zoneQuery.table, 'service_survey_zones');
  assert.equal(zoneQuery.ranged, true);
});

test('🔴 ลิสต์ใบยาว = ซอยก้อน (URL 16 KB) และไล่หน้า · query พัง = โยน — "นับไม่ได้" ต้องไม่อ่านเป็นศูนย์', async () => {
  const many = Array.from({ length: IN_CHUNK_SIZE + 5 }, (_, i) => surveyReq({ id: `R${i}`, docNo: `RQ-${i}` }));
  const db = fakeDb({
    dept_requests: many,
    service_survey_zones: many.map((r, i) => ({ id: `Z${i}`, requestId: r.id, packageSize: 'ST', status: 'ok' })),
  });
  const usage = await packageSizeUsage(db);
  assert.equal(usage.ST.surveys, IN_CHUNK_SIZE + 5);
  assert.equal(db.log.filter((q) => q.table === 'service_survey_zones').length, 2, 'สองก้อน');

  await assert.rejects(() => packageSizeUsage(fakeDb(usageTables(), { errors: { dept_requests: { message: 'boom' } } })), failsWith(/boom/));
  await assert.rejects(() => packageSizeUsage(fakeDb(usageTables(), { errors: { service_survey_zones: { message: 'zap' } } })), failsWith(/zap/));
});

test('ลบขนาด: ลบได้แม้มีใบใช้อยู่ · คืนจำนวนใบที่กระทบ · audit บอกใบที่ต้องเลือกใหม่ · ใบที่ส่งแล้วไม่ถูกแตะ', async () => {
  const db = fakeDb(usageTables());
  const out = await deletePackageSize(db, { ...asHead, code: 'st' });
  assert.equal(out.status, 200);
  assert.deepEqual(out.data, { code: 'ST', usage: { surveys: 2, zones: 3, docNos: ['RQ-AS-0001', 'RQ-AS-0002'] } });
  assert.deepEqual(db.tables.service_package_sizes.map((s) => s.code), ['XS', 'SM', 'XL']);
  assert.equal(out.audit.action, 'delete');
  assert.equal(out.audit.before.nameEn, 'Standard', 'กู้กลับได้จาก audit.before (ระบบไม่มีถังขยะ)');
  assert.equal(out.audit.summary,
    'ลบขนาดแพ็คเกจ ST (Standard) · ใบประเมินที่ยังไม่ส่งผล 2 ใบ (3 พื้นที่) ใช้ขนาดนี้ — ต้องเลือกขนาดใหม่ก่อนส่งผล: RQ-AS-0001, RQ-AS-0002');
  // 🔴 ไม่มีการเขียนลงแถวผลวัด — พื้นที่เก็บรหัสเป็นภาพนิ่ง (ไม่มี FK ไม่มี cascade)
  assert.equal(db.log.some((q) => q.table === 'service_survey_zones' && q.op !== 'select'), false);
  assert.equal(db.tables.service_survey_zones.filter((z) => z.packageSize === 'ST').length, 7);

  const unused = await deletePackageSize(db, { ...asHead, code: 'XL' });
  assert.equal(unused.audit.summary, 'ลบขนาดแพ็คเกจ XL (Extra Large) · ไม่มีใบประเมินที่ยังไม่ส่งผลใช้ขนาดนี้');
  assert.deepEqual(unused.data.usage, { surveys: 0, zones: 0, docNos: [] });
});

test('🔴 ขนาดสุดท้ายลบไม่ได้ · ไม่พบ = 404 · นับการใช้ไม่ได้ = ไม่ลบ (โยน)', async () => {
  const one = fakeDb({ service_package_sizes: [seed()[2]], dept_requests: [], service_survey_zones: [] });
  const last = await deletePackageSize(one, { ...asHead, code: 'ST' });
  assert.equal(last.status, 400);
  assert.match(last.error, /อย่างน้อยหนึ่งขนาด/);
  assert.equal(one.tables.service_package_sizes.length, 1);

  const db = fakeDb(usageTables());
  assert.equal((await deletePackageSize(db, { ...asHead, code: 'ZZ' })).status, 404);

  const blind = fakeDb(usageTables(), { errors: { dept_requests: { message: 'boom' } } });
  await assert.rejects(() => deletePackageSize(blind, { ...asHead, code: 'ST' }), failsWith(/boom/));
  assert.equal(blind.tables.service_package_sizes.length, 4, 'ไม่รู้ว่ากระทบกี่ใบ = ยังไม่ลบ');
});

/* ══ 3. route ต่อสายถูก ══════════════════════════════════════════════════ */

test('GET/POST /api/service/package-sizes — อ่าน = ด่านทะเบียน · เขียน = canManagePackageSizes ก่อนอ่าน body', () => {
  const src = code(LIST_ROUTE);
  assert.match(src, /export const dynamic = 'force-dynamic';/);
  assert.match(src, /export const GET = withUser\(/);
  assert.match(src, /export const POST = withUser\(/);
  assert.doesNotMatch(src, /export const (PUT|PATCH|DELETE)\b/);
  const get = src.slice(src.indexOf('export const GET'), src.indexOf('export const POST'));
  const post = src.slice(src.indexOf('export const POST'));
  assert.match(get, /requireService\(\{ user, registry: true \}\)/, 'อ่านกว้างเท่าทะเบียนไซต์/เครื่อง — ฝ่ายขายอ่านได้');
  assert.match(get, /canEdit/);
  // "กี่ใบใช้ขนาดนี้" ใช้กับกล่องยืนยันลบ ⇒ นับให้เฉพาะคนที่ลบได้ (คนอ่านอย่างเดียวไม่จ่ายสอง query)
  assert.match(get, /canEdit \? await packageSizeUsage\(supabase\) : null/);
  const gate = post.indexOf('canManagePackageSizes(user)');
  assert.ok(gate > 0, 'ช่างผ่าน proxy มาถึงที่นี่ได้ (ถือ service:work) — ต้องตัดที่ handler');
  assert.ok(gate < post.indexOf('req.json('), 'ตรวจสิทธิ์ก่อนอ่าน body');
  assert.match(post, /forbidden\(PACKAGE_SIZE_EDIT_DENIED\)/);
  assert.match(post, /createPackageSize\(supabase, \{/);
  assert.match(post, /recordAudit\(\{ user, \.\.\.out\.audit, request: req \}\)/);
  assert.doesNotMatch(src, /\.from\(/, 'route ไม่แตะฐานเอง — ตัวอ่าน/เขียนอยู่ใน packageSizesRepo (มีเทสต์กับฐานปลอม)');
});

test('PATCH/DELETE /api/service/package-sizes/[code] — ด่านสิทธิ์ก่อนทุกอย่าง · audit ทุกการเขียน', () => {
  const src = code(ITEM_ROUTE);
  assert.match(src, /export const dynamic = 'force-dynamic';/);
  assert.doesNotMatch(src, /export const (GET|POST|PUT)\b/);
  for (const [method, fn] of [['PATCH', 'updatePackageSize'], ['DELETE', 'deletePackageSize']]) {
    const start = src.indexOf(`export const ${method}`);
    const next = src.indexOf('export const', start + 10);
    const body = src.slice(start, next < 0 ? undefined : next);
    const gate = body.indexOf('canManagePackageSizes(user)');
    assert.ok(gate > 0, method);
    assert.ok(gate < body.indexOf('ctx.params'), `${method}: ตรวจสิทธิ์ก่อนอ่านพารามิเตอร์/ฐาน`);
    assert.match(body, new RegExp(`${fn}\\(supabase, \\{`), method);
    assert.match(body, /recordAudit\(\{ user, \.\.\.out\.audit, request: req \}\)/, method);
    assert.match(body, /if \(out\.error\) return fail\(out\.error, out\.status\);/, method);
  }
  assert.doesNotMatch(src, /\.from\(/);
});

test('⭐ PUT เคาะของหัวหน้า — ช่องแพ็คเกจผ่านตัวตัดสินกลางตัวเดียวกับจอ · ทะเบียนอ่านเฉพาะเมื่อต้องใช้', () => {
  const src = code(ZONE_ROUTE);
  const put = src.slice(src.indexOf('export const PUT'), src.indexOf('export const DELETE'));
  assert.match(put, /surveyPackageDecision\(row, body, sizes\)/);
  assert.match(put, /loadPackageSizesOrNull\(supabase\)/);
  assert.match(put, /decision\.registryDown \? fail\(decision\.error, 500\) : badRequest\(decision\.error\)/,
    'อ่านทะเบียนไม่สำเร็จ = 500 ไม่ใช่ 400 (ไม่ใช่ความผิดของคำขอ)');
  assert.match(put, /Object\.assign\(patch, decision\.patch\)/);
  // กติกาแพ็คเกจต้องไม่ถูกเขียนซ้ำใน route — ที่เดียวคือ surveyPackageDecision
  assert.doesNotMatch(put, /packageNeedsNote|พิมพ์ผิดหลัก|ต้องบอกเหตุผล/);
  assert.doesNotMatch(put, /body\.packageQty\s*[!=]==?\s*null/);
  // audit อ่านออกว่าเคาะอะไร: "SM · 1 แพ็คเกจ"
  assert.match(put, /\$\{data\.packageSize\} · \$\{data\.packageQty\} แพ็คเกจ/);
  const patch = src.slice(src.indexOf('export const PATCH'), src.indexOf('export const PUT'));
  assert.doesNotMatch(patch, /packageSize/, 'ช่างเคาะขนาดแพ็คเกจไม่ได้');
});

/* 🐞 review PR-P — ภาพนิ่ง "ที่ระบบเสนอ" ประทับเฉพาะตอนเคาะ ⇒ ช่างวัดใหม่หลังหัวหน้าเคาะ ด่านเหตุผล (mig 0345) หลับ
   กติกาอยู่ที่ `surveyRemeasureStamp` (`packageSizes.test.mjs` ③ข) — ยามนี้ล็อกว่า route ต่อสายถึงมันจริง และก่อนเขียน */
test('🔴 PATCH ของช่าง — วัดใหม่หลังเคาะประทับ "ที่ระบบเสนอ" ใหม่ผ่านตัวตัดสินกลาง · ทะเบียนอ่านเฉพาะเมื่อต้องใช้ · อ่านไม่ได้ = ไม่บันทึก', () => {
  const src = code(ZONE_ROUTE);
  const patch = src.slice(src.indexOf('export const PATCH'), src.indexOf('export const PUT'));
  const ask = patch.indexOf('if (surveyRemeasureTouchesSuggestion(row, patch.parts)) {');
  const stamp = patch.indexOf('restamp = surveyRemeasureStamp(row, patch.parts, await loadPackageSizesOrNull(supabase));');
  const write = patch.indexOf(".from('service_survey_zones').update(patch)");
  assert.ok(ask > patch.indexOf('patch.parts = parts.value'), 'ถามหลังรู้ส่วนที่จะเขียน');
  assert.ok(stamp > ask && write > stamp, 'ประทับก่อนเขียนแถว — ในคำสั่ง update เดียวกับขนาดใหม่');
  assert.match(patch, /if \(restamp\.error\) return fail\(restamp\.error, 500\);\s*Object\.assign\(patch, restamp\.patch\);/);
  assert.equal(patch.match(/loadPackageSizesOrNull\(/g).length, 1, 'ทะเบียนอ่านที่เดียว และอยู่หลังเงื่อนไข (ช่างบันทึกทั่วไปไม่เสีย query)');
  assert.match(patch, /\$\{restamp\?\.summary \|\| ''\}/, 'audit บอกว่าข้อเสนอเปลี่ยน');
  // ตัวตัดสินคืนช่องเดียว — ขนาด/จำนวน/เลือกเอง ของหัวหน้าไม่มีทางถูกเขียนจากเส้นนี้
  const lib = code('src/lib/service/packageSizes.js');
  const fn = lib.slice(lib.indexOf('export function surveyRemeasureStamp'), lib.indexOf('export function surveyPackageSizeGates'));
  assert.deepEqual(fn.match(/patch: (\{[^}]*\}|null)/g), ['patch: {}', 'patch: null', 'patch: { packageSizeSuggested: after }']);
});

test('GET ใบประเมินส่งทะเบียนขนาด (null = อ่านไม่สำเร็จ) · ส่งผลถามด่าน "ขนาดถูกลบ" ต่อจากหกข้อ ก่อนเขียนอะไร', () => {
  const get = code(SURVEY_ROUTE);
  assert.match(get, /loadPackageSizesOrNull\(supabase\)/);
  assert.match(get, /packageSizes,/);

  const send = code(SEND_ROUTE);
  const six = send.indexOf('surveySendError(zones, filesByZone, { canSend: true })');
  const size = send.indexOf('surveyPackageSizeSendError(zones, await loadPackageSizesOrNull(supabase))');
  assert.ok(six > 0 && size > six, 'ด่านหกข้อก่อน แล้วด่านขนาดถูกลบ');
  assert.ok(size < send.indexOf('surveySendWrites('), 'ก่อนปิดนัด/ตอบใบ');
  assert.match(send, /if \(sizeGate\) return conflict\(sizeGate\);/);
  // ตัวเลขที่ออกไปหาฝ่ายขาย (กระดิ่ง · เธรด · audit · แถวดึงกลับ) บอกขนาดด้วย — ตัวสร้างข้อความเดียวกัน
  assert.equal(send.split('surveyPackagesText(totals)').length - 1, 2);
  assert.match(code(RECALL_ROUTE), /surveyPackagesText\(totals\)/);
  assert.doesNotMatch(send, /\$\{totals\.packageQty\} แพ็คเกจ/);
});
