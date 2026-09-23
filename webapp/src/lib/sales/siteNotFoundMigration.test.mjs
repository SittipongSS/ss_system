// ── ยามของ mig 0362 "จุดที่ TS หาไม่เจอหน้างาน" ───────────────────────────────
//
// ⭐ ธงนี้ตัดจุดออกจากคิว TS และป้ายเมนูทันที ⇒ CHECK ที่หลวมไปหนึ่งช่องแปลว่า **จุดที่ยังขายอยู่หายจากคิว
//    โดยไม่มีใครตัดสิน** · เทสต์นี้ตรึงรูป CHECK/trigger ของไฟล์ 0362 ไว้
//
// ⚠️ **ฝั่ง JS ของเส้นนี้ถูกถอดแล้ว** (มติ 22/09 · 0374) — บรรทัดของใบย้อนหลังผูกโซนตั้งแต่ตอนคีย์ใบ
//    ⇒ ไม่มีจุดข้อความอิสระให้ TS "หาไม่เจอ" อีก · `lib/sales/siteNotFound.js` และทางแจ้ง/ตัดสินหายไปทั้งเส้น
//    **แต่ของในฐานยังอยู่ครบ** (คอลัมน์ 9 ช่อง · CHECK · trigger · 0 แถว) และยังเป็นของจริงที่ใครก็ลบไม่ได้เงียบ ๆ
//    ⇒ ไฟล์นี้อยู่ต่อเป็นยามของ **ฐาน** ล้วน ๆ และถือค่าคงที่ของตัวเองแทนการ import จากโมดูลที่ตายแล้ว
//
// 🔑 มติที่ตรึงไว้ที่นี่ (16/09/2026 ข้อ 23 ส่วน ข1):
//    · เหตุผล 4 รหัส · หมายเหตุบังคับเฉพาะ 'other' · หมายเหตุตอนปิดจุดไม่บังคับ
//    · ปิดจุดได้เฉพาะจุดที่ติดธง · ติดธงได้เฉพาะบรรทัดของใบย้อนหลังที่ยังไม่ผูกโซนเลย
//    · บรรทัดที่ติดธงอยู่ ผูกโซนไม่ได้ (กันสองทางชนกัน)
//    · ทาง Rev./ใบร่าง **ไม่ก๊อป** ทั้ง 9 คอลัมน์
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* ค่าคงที่ของ 0362 — เคยอยู่ที่ `lib/sales/siteNotFound.js` ซึ่งถอดไปพร้อมเส้นนั้น (มติ 22/09)
   ⚠️ ตรงกับ CHECK ของไฟล์ 0362 เป๊ะ ๆ · เทสต์ข้างล่างเทียบกับ SQL ทุกตัว */
const SITE_FLAG_COLUMNS = Object.freeze([
  'siteNotFoundAt', 'siteNotFoundById', 'siteNotFoundByName', 'siteNotFoundReason', 'siteNotFoundNote',
  'siteClosedAt', 'siteClosedById', 'siteClosedByName', 'siteClosedNote',
]);
const SITE_NOT_FOUND_REASON_CODES = Object.freeze(['name_mismatch', 'branch_closed', 'customer_dropped', 'other']);
const SITE_NOTE_MAX = 500;
const SITE_NOTE_REQUIRED_REASON = 'other';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE_0362 = '0362_sales_order_line_site_not_found.sql';
const sqlFiles = () => readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const squeeze = (sql) => stripComments(sql).replace(/\s+/g, ' ').trim();

const RAW = read(FILE_0362);
const SQL = stripComments(RAW);

const constraintBody = (name) => {
  const from = SQL.indexOf(`ADD CONSTRAINT ${name}`);
  assert.ok(from >= 0, `ไม่มี ADD CONSTRAINT ${name}`);
  return squeeze(SQL.slice(from, SQL.indexOf(';', from)));
};

/* นิยามล่าสุดของฟังก์ชันในทั้งโฟลเดอร์ (ไฟล์หลังทับไฟล์ก่อน) — ท่าเดียวกับ
   historicalSalesOrderMigration.test.mjs / serviceRoundsCopyPaths.test.mjs */
function latestDefinitionOf(fnName) {
  const marker = `CREATE OR REPLACE FUNCTION public.${fnName}(`;
  const owning = sqlFiles().filter((name) => read(name).includes(marker));
  assert.ok(owning.length, `ต้องมี migration ที่นิยาม ${fnName}`);
  const file = owning[owning.length - 1];
  const sql = read(file);
  const from = sql.lastIndexOf(marker);
  const to = sql.indexOf('\n$$;', from);
  assert.ok(to > from, `หาปลายนิยาม ${fnName} ใน ${file} ไม่เจอ`);
  return { file, body: sql.slice(from, to) };
}
const rpc = (name) => stripComments(latestDefinitionOf(name).body);

test('0362: หัวไฟล์บอกลำดับรัน · วิธีลองแบบ ROLLBACK · คำสั่งตรวจหลังรัน', () => {
  const header = RAW.slice(0, RAW.indexOf('\nBEGIN;'));
  assert.match(header, /รันก่อน merge โค้ด JS/);
  assert.match(header, /ลองก่อนรันจริง/);
  assert.match(header, /--\s+ROLLBACK;/);
  assert.match(header, /ตรวจหลังรัน/);
  assert.match(header, /has_function_privilege/);
});

test('0362: รันซ้ำได้ · อยู่ในทรานแซกชันเดียว · ไม่ backfill', () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^COMMIT;/m);
  for (const m of SQL.matchAll(/ADD COLUMN(?! IF NOT EXISTS)/g)) {
    assert.fail(`ADD COLUMN ต้องมี IF NOT EXISTS (ตำแหน่ง ${m.index})`);
  }
  for (const m of SQL.matchAll(/ADD CONSTRAINT (\w+)/g)) {
    const drop = SQL.indexOf(`DROP CONSTRAINT IF EXISTS ${m[1]};`);
    assert.ok(drop >= 0 && drop < m.index, `${m[1]}: ต้อง DROP CONSTRAINT IF EXISTS ก่อน`);
  }
  for (const m of SQL.matchAll(/CREATE TRIGGER (\w+)/g)) {
    const drop = SQL.indexOf(`DROP TRIGGER IF EXISTS ${m[1]} `);
    assert.ok(drop >= 0 && drop < m.index, `${m[1]}: ต้อง DROP TRIGGER IF EXISTS ก่อน`);
  }
  assert.doesNotMatch(SQL, /CREATE FUNCTION/, 'ฟังก์ชันต้อง CREATE OR REPLACE');
  // ⛔ ไม่มี DML นอก body ของฟังก์ชัน — ไฟล์นี้ไม่ backfill อะไรเลย
  const outside = SQL.replace(/\$\$[\s\S]*?\$\$/g, '');
  assert.doesNotMatch(outside, /\b(INSERT INTO|UPDATE|DELETE FROM) public\./);
});

test('0362: คอลัมน์ทั้ง 9 อยู่ใน ALTER TABLE เดียว และตรงกับ SITE_FLAG_COLUMNS', () => {
  const from = SQL.indexOf('ALTER TABLE public.sales_order_lines ADD COLUMN');
  assert.ok(from >= 0, 'ต้องมี ALTER TABLE ... ADD COLUMN ก้อนเดียวนอก DO/EXECUTE');
  const stmt = SQL.slice(from, SQL.indexOf(';', from));
  const cols = [...stmt.matchAll(/ADD COLUMN IF NOT EXISTS "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(cols, [...SITE_FLAG_COLUMNS]);
  assert.doesNotMatch(stmt, /EXECUTE format/);
});

test('0362: ธงของ TS — ครบหรือว่างทั้งชุด · 4 รหัส · หมายเหตุบังคับเฉพาะ other', () => {
  const body = constraintBody('sales_order_lines_site_not_found_sane');
  const [empty, filled] = body.split(/\)\s*OR\s*\(/);
  for (const col of SITE_FLAG_COLUMNS.filter((c) => c.startsWith('siteNotFound'))) {
    assert.ok(empty.includes(`"${col}" IS NULL`), `สาขาว่างต้องบังคับ ${col} IS NULL`);
  }
  assert.ok(filled.includes('"siteNotFoundAt" IS NOT NULL'));
  assert.ok(filled.includes('"siteNotFoundById" IS NOT NULL'));
  const codes = SITE_NOT_FOUND_REASON_CODES.map((c) => `'${c}'`).join(', ');
  assert.ok(filled.includes(`"siteNotFoundReason" IN (${codes})`), 'รหัสเหตุผลต้องตรงกับฝั่ง JS ทั้งชุดและลำดับ');
  assert.ok(filled.includes(`length(btrim("siteNotFoundNote")) BETWEEN 1 AND ${SITE_NOTE_MAX}`));
  assert.ok(
    filled.includes(`"siteNotFoundReason" <> '${SITE_NOTE_REQUIRED_REASON}' OR length(btrim(coalesce("siteNotFoundNote", ''))) BETWEEN 1 AND ${SITE_NOTE_MAX}`),
    'หมายเหตุต้องบังคับเฉพาะ other',
  );
  // 🪤 เหตุผลอีกสามตัวห้ามถูกบังคับหมายเหตุ — ม็อกวาดบังคับทุกไทล์ ซึ่งมติทับแล้ว
  for (const code of SITE_NOT_FOUND_REASON_CODES.filter((c) => c !== SITE_NOTE_REQUIRED_REASON)) {
    assert.ok(!filled.includes(`"siteNotFoundReason" = '${code}' AND "siteNotFoundNote" IS NOT NULL`), code);
  }
});

test('0362: ตราปิดจุด — ต้องมีธงรองรับ · หมายเหตุไม่บังคับ', () => {
  const body = constraintBody('sales_order_lines_site_closed_sane');
  const [empty, filled] = body.split(/\)\s*OR\s*\(/);
  for (const col of SITE_FLAG_COLUMNS.filter((c) => c.startsWith('siteClosed'))) {
    assert.ok(empty.includes(`"${col}" IS NULL`), `สาขาว่างต้องบังคับ ${col} IS NULL`);
  }
  assert.ok(filled.includes('"siteClosedAt" IS NOT NULL'));
  assert.ok(filled.includes('"siteClosedById" IS NOT NULL'));
  assert.ok(filled.includes('"siteNotFoundAt" IS NOT NULL'), 'ปิดจุดที่ไม่มีใครแจ้งไม่ได้');
  assert.ok(
    filled.includes(`"siteClosedNote" IS NULL OR length(btrim("siteClosedNote")) BETWEEN 1 AND ${SITE_NOTE_MAX}`),
    'หมายเหตุตอนปิดจุดไม่บังคับ (เคาะ 16/09)',
  );
});

test('0362: ธงติดได้เฉพาะบรรทัดใบย้อนหลังที่ยังไม่ผูกโซน · บรรทัดที่ติดธงผูกโซนไม่ได้', () => {
  const guard = squeeze(rpc('guard_sales_order_line_site_flags'));
  // ตรวจเฉพาะตอนติดธงใหม่ — ล้างธงและแก้ช่องอื่นต้องไม่ถูกขวาง
  assert.ok(guard.includes(`IF NEW."siteNotFoundAt" IS NOT NULL AND (TG_OP = 'INSERT' OR OLD."siteNotFoundAt" IS NULL) THEN`));
  assert.ok(guard.includes(`so.id = NEW."salesOrderId" AND so.origin = 'historical'`));
  assert.ok(guard.includes(`RAISE EXCEPTION 'site_not_found_historical_only`));
  assert.ok(guard.includes(`FROM public.service_zone_terms t WHERE t."salesOrderLineId" = NEW.id`));
  assert.ok(guard.includes(`RAISE EXCEPTION 'site_not_found_line_allocated`));

  const term = squeeze(rpc('guard_zone_term_site_not_found'));
  assert.ok(term.includes(`l.id = NEW."salesOrderLineId" AND l."siteNotFoundAt" IS NOT NULL`));
  assert.ok(term.includes(`RAISE EXCEPTION 'zone_term_line_site_not_found`));

  assert.match(SQL, /BEFORE INSERT OR UPDATE OF "siteNotFoundAt" ON public\.sales_order_lines/);
  assert.match(SQL, /BEFORE INSERT OR UPDATE OF "salesOrderLineId" ON public\.service_zone_terms/);
  for (const fn of ['guard_sales_order_line_site_flags', 'guard_zone_term_site_not_found']) {
    assert.match(SQL, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated;`), fn);
  }
});

test('🪤 Rev./ใบร่างของใบสั่งขายห้ามก๊อปธงจุดติดตั้งติดไปด้วย', () => {
  // ใบย้อนหลังออก Rev./คืนเป็นร่างไม่ได้อยู่แล้ว (CHECK ของ 0360) — แต่ถ้าวันหนึ่งเปิด
  // การก๊อปธงจะพาสถานะ "TS ไม่พบจุด" ของใบเก่าไปโผล่บนใบใหม่ที่ยังไม่มีใครไปดูหน้างาน
  for (const fn of ['create_sales_order_draft', 'revise_approved_sales_order_atomic']) {
    const body = rpc(fn);
    for (const col of SITE_FLAG_COLUMNS) {
      assert.ok(!body.includes(`"${col}"`), `${fn} ต้องไม่แตะ ${col}`);
    }
  }
});
