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

// คำสั่ง SQL ทั้งหมดที่แตะตารางหนึ่ง — ตัดเป็น statement ด้วย ';' แบบหยาบ
// (พอสำหรับไฟล์ migration ของ repo นี้ที่ไม่มี ';' ในสตริง DDL ของตารางบริการ)
function statementsTouching(table) {
  const out = [];
  for (const file of readdirSync(MIGRATIONS_DIR)) {
    if (!file.endsWith('.sql')) continue;
    const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
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
  for (const table of ['service_visits', 'service_plans', 'service_visit_items']) {
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

test('⭐ service_visit_items ห้ามมีคอลัมน์ zoneId — consumption เดินทาง item → asset → zone เส้นเดียว', () => {
  for (const { file, statement } of statementsTouching('service_visit_items')) {
    assert.ok(
      !/zoneId/i.test(statement),
      `${file}: service_visit_items ห้ามมี zoneId — เพิ่มเมื่อไหร่จะมีสองเส้นทาง rollup ที่เพี้ยนหากัน`,
    );
  }
});
