// ── เทสต์ยามโครงตารางฝั่งบริการ — อ่านไฟล์ migration ตรง ๆ ─────────────────
//
// สองกฎที่ตัดสินแล้วและ "พังเงียบ" ได้ง่ายเมื่อเวลาผ่านไป:
//
// 1. **ตารางที่เกิดซ้ำตลอดกาลห้ามมี projectId** (docs/business-line-vs-project-seam.md)
//    service_visits / service_plans / service_visit_items เป็นรอบที่ไม่มีวันจบ —
//    ใส่ projectId เมื่อไหร่ก็เป็น NULL 95% ทันที · ลิงก์โครงการมีได้ที่
//    service_sites ที่เดียว (mig 0299)
//
// 2. **service_visit_items ห้ามมี zoneId** (แผนระบบธุรกิจบริการ 2026-08-27)
//    consumption ราย โซน เดินเส้นทางเดียว: item → asset → zone · เพิ่ม zoneId
//    ตรงบน item = สองเส้นทางที่เพี้ยนหากันได้ (โรคเดียวกับที่ billing plan §3.1
//    ห้ามตารางงวดใบที่สอง)
//
// เทสต์อ่าน migration เป็นข้อความเพราะไม่มี DB ใน CI — แพตเทิร์นเดียวกับ
// navMenuNames.test.mjs ที่อ่านซอร์ส AppLayout ตรง ๆ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'supabase', 'migrations');

/* 🐞 **ต้องตัดคอมเมนต์ทิ้งก่อนตรวจ** — ยามนี้อ่าน DDL เป็นข้อความ ⇒ migration ที่
   *เอ่ยชื่อ* ตารางต้องห้ามในคอมเมนต์เพื่ออธิบายว่า "ทำไมถึงต่างจากตารางนั้น"
   จะถูกนับเป็นการละเมิดทันที (เจอจริงตอน mig 0335: คอมเมนต์อธิบายว่าทำไม CASCADE
   ต่างจาก service_visit_assets อยู่ในตารางที่มี zoneId ⇒ ยามฟ้องผิดตัว)
   ⚠️ ตัดทั้งคอมเมนต์บรรทัดเดียวและคอมเมนต์เป็นก้อน — ไม่งั้นยามวัดสิ่งที่ไม่ได้อ้างว่าวัด */
const stripSqlComments = (sql) => sql
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/--[^\n]*/g, ' ');

// คำสั่ง SQL ทั้งหมดที่แตะตารางหนึ่ง — ตัดเป็น statement ด้วย ';' แบบหยาบ
// (พอสำหรับไฟล์ migration ของ repo นี้ที่ไม่มี ';' ในสตริง DDL ของตารางบริการ)
function statementsTouching(table) {
  const out = [];
  for (const file of readdirSync(MIGRATIONS_DIR)) {
    if (!file.endsWith('.sql')) continue;
    const text = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    if (!text.includes(table)) continue;
    for (const statement of text.split(';')) {
      if (new RegExp(`(CREATE\\s+TABLE|ALTER\\s+TABLE)[^;]*\\b${table}\\b`, 'i').test(statement)) {
        out.push({ file, statement });
      }
    }
  }
  return out;
}

test('⭐ ตารางรอบบริการที่เกิดซ้ำตลอดกาล ห้ามมีคอลัมน์ projectId', () => {
  for (const table of ['service_visits', 'service_plans', 'service_visit_items', 'service_visit_assets']) {
    const hits = statementsTouching(table);
    assert.ok(hits.length > 0, `ไม่พบ DDL ของ ${table} เลย — โครงเทสต์นี้อ่านผิดที่`);
    for (const { file, statement } of hits) {
      assert.ok(
        !/projectId/i.test(statement),
        `${file}: ${table} ห้ามมี projectId — ลิงก์โครงการมีได้ที่ service_sites ที่เดียว (seam doc)`,
      );
    }
  }
});

test('⭐ ตารางลูกของนัดห้ามมี zoneId — consumption เดินทาง item → asset → zone เส้นเดียว', () => {
  for (const table of ['service_visit_items', 'service_visit_assets']) {
    for (const { file, statement } of statementsTouching(table)) {
      assert.ok(
        !/zoneId/i.test(statement),
        `${file}: ${table} ห้ามมี zoneId — เพิ่มเมื่อไหร่จะมีสองเส้นทาง rollup ที่เพี้ยนหากัน`,
      );
    }
  }
});

/* ⭐ ปริมาณที่ใช้อยู่ที่ `service_visit_items` ที่เดียว — ถ้า `service_visit_assets`
   มี qty/productId ด้วยเมื่อไร จะมีสองแหล่งที่ตอบ "ใช้ไปเท่าไร" แล้วยอด ml ที่เอาไป
   เทียบกับ standardMlPerMonth ของโซนจะเพี้ยนทันทีที่มีคนแก้ฝั่งเดียว */
test('⭐ service_visit_assets ห้ามมี qty / productId — ปริมาณอยู่ที่ items ที่เดียว', () => {
  const hits = statementsTouching('service_visit_assets');
  assert.ok(hits.length > 0, 'ไม่พบ DDL ของ service_visit_assets เลย — โครงเทสต์นี้อ่านผิดที่');
  for (const { file, statement } of hits) {
    assert.ok(!/\bqty\b/i.test(statement), `${file}: service_visit_assets ห้ามมี qty`);
    assert.ok(!/productId/i.test(statement), `${file}: service_visit_assets ห้ามมี productId`);
  }
});

/* 🐞 **ส่งงาน/ปิดงานข้ามวัน** (มติเจ้าของ 24/09 ข้อ 4 · mig 0386) — CHECK ของ 0300 เทียบเวลาอย่างเดียว
   ⇒ เริ่ม 14:00 จบวันถัดไป 09:00 ถูกตีกลับ · 0386 เพิ่มวันที่เสร็จจริง และให้ CHECK เวลาเทียบเฉพาะงานที่จบวันเดียวกัน
   ⚠️ ตรวจ **นิยามล่าสุด** ของ CHECK เวลา (ไฟล์เลขมากสุดที่ ADD มัน) — migration ใหม่ที่สร้างมันซ้ำแบบเดิม
      จะพาบั๊กกลับมาเงียบ ๆ ทั้งที่ 0386 ยังอยู่ในโฟลเดอร์ */
test('🔴 CHECK เวลาเข้าจริงตัวล่าสุดต้องยกเว้นงานที่จบวันหลัง (actualEndDate) · วันเสร็จต้องหลังวันเข้า', () => {
  const adds = statementsTouching('service_visits')
    .filter(({ statement }) => /CONSTRAINT\s+service_visits_actual_time_window\s+CHECK/i.test(statement));
  assert.ok(adds.length >= 3, 'ต้องเห็นนิยามของ 0188 · 0300 · 0386');
  const latest = adds.sort((a, b) => a.file.localeCompare(b.file)).at(-1);
  assert.match(latest.file, /^0386_/);
  assert.match(latest.statement, /"actualEndDate"\s+IS\s+NOT\s+NULL/i);
  assert.match(latest.statement, /"actualStartTime"\s*<=\s*"actualEndTime"/, 'วันเดียวกันยังเทียบเวลาเหมือนเดิม');

  const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, '0386_service_visit_actual_end_date.sql'), 'utf8'));
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "actualEndDate" date/);
  assert.match(sql, /service_visits_actual_end_date_after/);
  assert.match(sql, /"actualEndDate" IS NULL\s+OR \("actualDate" IS NOT NULL\s+AND "actualEndDate" > "actualDate"/);
  // รันซ้ำได้ — CHECK ใหม่ถูกข้ามเมื่อมีแล้ว · CHECK เวลาถอดก่อนสร้างใหม่
  assert.match(sql, /IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint/);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS service_visits_actual_time_window/);
});

/* ⭐ **ทะเบียนขนาดแพ็คเกจ** (mig 0398 · มติเจ้าของ 01/10 "เพิ่ม ลบ ได้") — สี่ข้อที่พังเงียบได้เมื่อมีคนแก้ไฟล์ทีหลัง:
   ① ทะเบียนใหม่ต้องปิด anon/authenticated (API-gated เหมือนทะเบียนรุ่นเครื่อง 0344 — 🔴 ตารางใหม่ใน public เปิด anon ตั้งต้น)
   ② seed เฉพาะทะเบียนว่าง — รันซ้ำแล้วขนาดที่เจ้าของลบไปต้องไม่กลับมา
   ③ พื้นที่เก็บรหัสเป็น **ภาพนิ่ง ไม่มี FK** — FK = ลบขนาดไม่ได้ (หรือ cascade ทับผลที่ส่งไปแล้ว)
   ④ แถวที่เคาะก่อนมีขนาด = ST คงจำนวนเดิม และรันก่อน deploy ได้ (เพิ่มอย่างเดียว · รันซ้ำได้) */
test('🔴 mig 0398 ทะเบียนขนาดแพ็คเกจ: RLS สามบรรทัด · seed เฉพาะทะเบียนว่าง · ภาพนิ่งไม่มี FK · back-fill ST', () => {
  const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, '0398_service_package_sizes.sql'), 'utf8'));

  // ① ทะเบียน + RLS
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.service_package_sizes \(/);
  assert.match(sql, /code\s+text PRIMARY KEY CHECK \(code ~ '\^\[A-Z0-9\]\{2,4\}\$'\)/);
  assert.match(sql, /ALTER TABLE public\.service_package_sizes ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /REVOKE ALL ON public\.service_package_sizes FROM anon, authenticated;/);
  assert.match(sql, /GRANT ALL ON public\.service_package_sizes TO service_role;/);
  assert.doesNotMatch(sql, /CREATE POLICY/i, 'service_role เท่านั้น — ไม่มี policy ให้ anon/authenticated');
  // ระบบต้องเสนอได้คำตอบเดียว: ช่วงไม่ซ้ำ · ไม่มีเพดานได้ตัวเดียว · ขนาดเลือกเองไม่มีช่วง
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS service_package_sizes_band_uk\s+ON public\.service_package_sizes \("maxCbm"\) WHERE "autoSuggest" AND "maxCbm" IS NOT NULL;/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS service_package_sizes_open_uk\s+ON public\.service_package_sizes \("autoSuggest"\) WHERE "autoSuggest" AND "maxCbm" IS NULL;/);
  assert.match(sql, /CONSTRAINT service_package_sizes_manual_no_band CHECK \("autoSuggest" OR "maxCbm" IS NULL\)/);
  assert.doesNotMatch(sql, /"sortOrder"/, 'ลำดับมาจากข้อมูล (sortPackageSizes) ไม่มีคอลัมน์เรียง');

  // ② seed สี่ขนาดของมติ — เฉพาะทะเบียนว่าง
  assert.match(sql, /\('XS', 'Extra Small', NULL::numeric, false, 'ห้องน้ำ'\)/);
  assert.match(sql, /\('SM', 'Small',\s+300,\s+true,\s+NULL\)/);
  assert.match(sql, /\('ST', 'Standard',\s+2400,\s+true,\s+NULL\)/);
  assert.match(sql, /\('XL', 'Extra Large', NULL,\s+true,\s+NULL\)/);
  assert.match(sql, /WHERE NOT EXISTS \(SELECT 1 FROM public\.service_package_sizes\);/);
  assert.doesNotMatch(sql, /ON CONFLICT/i, 'ON CONFLICT DO NOTHING จะปลุกขนาดที่ถูกลบกลับมาตอนรันซ้ำ');

  // ③ ภาพนิ่งบนแถวผลวัด — ไม่มี FK
  const zoneDdl = sql.slice(sql.indexOf('ALTER TABLE public.service_survey_zones'));
  assert.match(zoneDdl, /ADD COLUMN IF NOT EXISTS "packageSize" text,/);
  assert.match(zoneDdl, /ADD COLUMN IF NOT EXISTS "packageSizeSuggested" text,/);
  assert.match(zoneDdl, /ADD COLUMN IF NOT EXISTS "packageSizeManual" boolean NOT NULL DEFAULT false;/);
  assert.doesNotMatch(sql, /REFERENCES/i, 'ห้ามมี FK ไปทะเบียน — ลบขนาดต้องไม่พังใบที่เคาะ/ส่งผลไปแล้ว');
  assert.match(zoneDdl, /DROP CONSTRAINT IF EXISTS service_survey_zones_package_size_fmt;/);
  assert.match(zoneDdl, /ADD CONSTRAINT service_survey_zones_package_size_fmt CHECK \(/);

  // ④ back-fill — ST คงจำนวนเดิม · ไม่แตะแถวที่มีขนาดแล้ว (รันซ้ำหลัง deploy ได้) · ไม่แตะ updatedAt (ด่านแถวค้างของช่าง)
  const backfill = sql.match(/UPDATE public\.service_survey_zones SET ([\s\S]*?);/);
  assert.ok(backfill, 'ต้องมี back-fill');
  assert.match(backfill[0], /SET "packageSize" = 'ST'\s+WHERE "packageQty" IS NOT NULL AND "packageSize" IS NULL;/);
  assert.doesNotMatch(backfill[0], /packageQty"\s*=|updatedAt|packageSizeSuggested/);

  // เพิ่มอย่างเดียว — ไม่มีอะไรที่โค้ดเก่าพังเมื่อรันก่อน deploy
  assert.doesNotMatch(sql, /DROP (TABLE|COLUMN)|ALTER COLUMN|RENAME/i);
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;\s*NOTIFY pgrst, 'reload schema';/);
});
