/* ยามกัน "คอลัมน์มี แต่ RPC ไม่รู้จัก" (0363)
 *
 * 🪤 ค่าที่ส่งผ่าน `p_overrides` jsonb กับ patch object **ไม่มีด่านไหนตรวจเลย**:
 *   · `check:columns` อ่านเฉพาะ `.select()`/`.update()` ที่เขียนชื่อคอลัมน์ตรง ๆ
 *     ⇒ คีย์ใน jsonb ที่ RPC ไม่ได้อ่าน ถูกทิ้งเงียบ แล้วจอตอบ "บันทึกแล้ว"
 *     (โรคเดียวกับ `save_quotation_content` whitelist และคอลัมน์ที่ตกหล่นใน 0341/0343)
 *   · เทสต์นี้จึงเทียบ "คีย์ที่เราส่ง" กับ "ชื่อคอลัมน์ที่ migration ประกาศ" ตรง ๆ
 *
 * ⚠️ ไม่ได้ยืนยันว่า migration ถูกรันบนฐานจริงแล้ว — อันนั้นยามคือขั้นตอน deploy
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../../../supabase/migrations/0363_sales_order_delivery_due_date.sql', import.meta.url),
  'utf8',
);

const fnBody = (name) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.notEqual(start, -1, `หา ${name} ใน migration 0363 ไม่เจอ`);
  const end = sql.indexOf('$$;', start);
  assert.notEqual(end, -1, `${name} ไม่มีจุดจบ $$;`);
  return sql.slice(start, end);
};

test('คอลัมน์ถูกเพิ่มจริงและว่างได้ (ไม่ใช่ NOT NULL)', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "deliveryDueDate" date/);
  assert.doesNotMatch(sql, /"deliveryDueDate" date NOT NULL/);
});

test('create_sales_order_draft อ่านคีย์ deliveryDueDate จาก p_overrides และเขียนลงคอลัมน์', () => {
  const body = fnBody('create_sales_order_draft');
  // คีย์ต้องสะกดตรงกับที่ route ส่ง (src/app/api/sales-planning/sales-orders/route.js)
  assert.match(body, /v_overrides->>'deliveryDueDate'/);
  assert.match(body, /"deliveryDueDate"/);
});

test('revise_approved_sales_order_atomic ก๊อปค่าเดิมไป Rev. ใหม่ — ไม่ใช่ปล่อยว่าง', () => {
  const body = fnBody('revise_approved_sales_order_atomic');
  assert.match(body, /"deliveryDueDate"/);
  assert.match(body, /v_source\."deliveryDueDate"/);
});
