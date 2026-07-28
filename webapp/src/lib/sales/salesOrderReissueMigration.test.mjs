import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../../../supabase/migrations/0169_sales_order_reissue_after_cancel.sql', import.meta.url),
  'utf8',
);
const previous = readFileSync(
  new URL('../../../supabase/migrations/0155_sales_order_number_pattern.sql', import.meta.url),
  'utf8',
);

test('ด่าน "1 QT = 1 SO" นับเฉพาะใบที่ยังมีชีวิต — ยกเลิกแล้วต้องออกใหม่ได้', () => {
  assert.match(sql, /FROM public\.sales_orders[\s\S]{0,200}status <> 'cancelled'/);
  // ฉบับที่ถูกแทนที่ด้วย Rev. ไม่นับ ไม่งั้น chain ที่ปลายทางถูกยกเลิกจะตันซ้ำแบบเดิม
  assert.match(sql, /"supersededById" IS NULL/);
  assert.match(sql, /RAISE EXCEPTION 'sales_order_already_exists'/);
});

test('id บรรทัด SO ผูกกับใบ ไม่ใช่กับบรรทัดของใบเสนอราคา (ไม่งั้นออกใบที่สองชน primary key)', () => {
  assert.match(sql, /'SOL-' \|\| md5\(p_order_id \|\| ':' \|\| ql\.id\)/);
  assert.doesNotMatch(sql, /'SOL-' \|\| ql\.id,/);
  // นิยามเดิมคือแบบที่ชน — ยืนยันว่าเทสต์นี้จับของจริง ไม่ใช่ตรวจสิ่งที่ไม่เคยมีปัญหา
  assert.match(previous, /'SOL-' \|\| ql\.id,/);
});

test('คัดจากนิยามล่าสุด (0155) ไม่ใช่ของเก่า — ท่อออกเลขตามรูปแบบเอกสารต้องยังอยู่', () => {
  assert.match(sql, /document_standard_versions/);
  assert.match(sql, /\{RUNNING:4\}/);
  assert.match(sql, /sales_order_monthly_sequence_exhausted/);
  // ฟิลด์ที่ 0146 เพิ่ม (unit ของบรรทัด) ต้องไม่หายไปกับการคัดนิยาม
  assert.match(sql, /COALESCE\(ql\."unit", 'ชิ้น'\)/);
});

test('เป็น migration ที่ไม่แตะข้อมูลเดิม (replace ฟังก์ชันอย่างเดียว)', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_sales_order_draft/);
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE FROM|ALTER TABLE)\b/);
  assert.match(sql, /GRANT EXECUTE[\s\S]+TO service_role/);
});
