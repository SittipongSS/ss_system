// ── ปิดประตูสายธุรกิจ (mig 0194) ────────────────────────────────────────
//
// ⭐ เหตุผลที่ต้องมีเทสต์เฝ้าไฟล์ migration ตัวนี้ ไม่ใช่แค่ปล่อยให้รันแล้วจบ:
//    `projects.type` ตายเพราะมี **default** — ทุกใบเป็น 'NPD' หมดเพราะไม่มีใคร
//    ต้อง*เลือก* · ถ้าวันหนึ่งมีคนแก้ 0194 ให้ backfill หรือใส่ default เพื่อให้
//    migration "รันผ่าน" สายธุรกิจจะตายด้วยโรคเดียวกันแบบเงียบ ๆ
//
// ⚠️ NOT NULL ที่ DB คือชั้น**สุดท้าย** ไม่ใช่ชั้นเดียว — ฟอร์มกับ API บังคับมาก่อน
//    แล้วตั้งแต่ #900 · ชั้นนี้มีไว้กันทางที่ยังไม่มีใครคิดถึง (script, SQL ตรง)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SQL = readFileSync(
  new URL('../../../supabase/migrations/0194_project_business_line_not_null.sql', import.meta.url),
  'utf8',
);

const squeeze = (s) => s.replace(/\s+/g, ' ');

test('บังคับ NOT NULL ที่คอลัมน์ line', () => {
  assert.ok(squeeze(SQL).includes('ALTER COLUMN line SET NOT NULL'));
});

// 🔴 ข้อห้ามหลักของทั้งใบ — ห้ามเดาค่าแทนคน
test('ห้าม backfill และห้ามใส่ default', () => {
  const sql = squeeze(SQL);
  assert.ok(!/UPDATE\s+public\.projects/i.test(sql), 'ห้าม UPDATE เติมค่า line ให้แถวเก่า');
  assert.ok(!/SET\s+DEFAULT/i.test(sql), 'ห้ามใส่ default ให้ line (นี่คือสิ่งที่ฆ่า projects.type)');
});

// ถ้ายังมีแถวว่าง ต้องหยุดพร้อม**บอกว่าใบไหน** ไม่ใช่ปล่อยให้ Postgres โยน
// 23502 ลอย ๆ ที่อ่านไม่ออกว่าต้องไปทำอะไรต่อ
test('หยุดพร้อมบอกรหัสโครงการที่ยังไม่ได้เลือกสาย', () => {
  const sql = squeeze(SQL);
  assert.ok(/WHERE line IS NULL/i.test(sql), 'ต้องตรวจแถวที่ยังว่างก่อน');
  assert.ok(/RAISE EXCEPTION/i.test(sql), 'ต้องหยุดด้วย EXCEPTION');
  assert.ok(sql.includes('string_agg(code'), 'ต้องรวมรหัสโครงการที่ค้างมาบอก');
  assert.ok(sql.includes('/sa/projects'), 'ต้องบอกว่าไปเลือกที่หน้าไหน');
});

// 🪤 ดัชนีของ 0191 คือ partial index `WHERE line IS NULL` ซึ่งหลัง NOT NULL แล้ว
//    จะว่างถาวร — ทิ้งได้ แต่ **ต้องทิ้งด้วยชื่อเดิม** ไม่ใช่ปล่อยค้างไว้
test('ทิ้งดัชนี "ยังไม่ระบุสาย" ที่หมดหน้าที่แล้ว', () => {
  assert.ok(squeeze(SQL).includes('DROP INDEX IF EXISTS projects_line_unset_idx'));
});

test('ทั้งใบอยู่ในทรานแซกชันเดียว', () => {
  assert.ok(/^\s*BEGIN;/m.test(SQL));
  assert.ok(/^\s*COMMIT;/m.test(SQL));
});
