/* ยามกัน "โค้ดกับ migration หลุดจากกัน" ของใบสเปคสินค้า (mig 0364)
 *
 * 🪤 `check:columns` เทียบกับ **schema จริงบนฐาน** ⇒ บอกได้แค่ว่ารัน migration แล้ว
 *    หรือยัง ไม่ได้บอกว่าไฟล์ migration ในรีโปประกาศของที่โค้ดต้องใช้ครบไหม
 * 🪤 ส่วนค่าที่เดินผ่าน `p_payload` jsonb ของ RPC **ไม่มีด่านไหนมองเห็นเลย** —
 *    คีย์ที่ RPC ไม่ได้อ่านถูกทิ้งเงียบ แล้ว API ตอบว่าออกเอกสารสำเร็จ
 *    (โรคเดียวกับ `save_quotation_content` whitelist และคอลัมน์ที่ตกใน 0341/0343)
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { SPEC_CONTENT_FIELDS } from './productSpecStore.js';
import { PRODUCT_SPEC_DOC_RUNNING_WIDTH } from './productSpecDocNo.js';
import { SPEC_REVISION_STATUSES, SPEC_REVISION_STEPS } from './productSpecWorkflow.js';

const sql = readFileSync(
  new URL('../../../supabase/migrations/0364_product_spec_sheet.sql', import.meta.url),
  'utf8',
);

// 0369 ยุบขั้น "AE ตรวจ" ออก — สถานะที่ฐานยอมต้องเท่ากับที่โค้ดประกาศ
const sql0369 = readFileSync(
  new URL('../../../supabase/migrations/0369_product_spec_single_approval.sql', import.meta.url),
  'utf8',
);

test('สามชั้นถูกสร้างครบ + ตารางลูกของ checklist', () => {
  for (const table of [
    'product_specs', 'product_spec_revisions', 'product_spec_revision_items', 'product_spec_issues',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`), table);
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`), `${table} RLS`);
    assert.match(sql, new RegExp(`GRANT ALL ON TABLE public\\.${table}\\s+TO service_role`), `${table} grant`);
  }
});

test('🔴 หนึ่งสินค้าหนึ่งใบ — ผูกด้วย UNIQUE ที่ฐาน ไม่ใช่แค่ด่านใน API', () => {
  assert.match(sql, /"productId"\s+text NOT NULL UNIQUE REFERENCES public\.products\(id\)/);
});

test('ฉบับที่ยังไม่จบมีได้ทีละหนึ่งต่อสินค้า — index ตามชื่อสถานะของ 0369', () => {
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS product_spec_revisions_open_uidx/);
  // 🪤 0369 เปลี่ยนชื่อสถานะ ⇒ ต้องสร้าง index ใหม่ ไม่ใช่ปล่อยของเดิมที่ WHERE
  //    อ้างชื่อเก่า (ปล่อยไว้ = ด่าน "ฉบับค้างได้ทีละหนึ่ง" หายไปเงียบ ๆ)
  assert.match(sql0369, /DROP INDEX IF EXISTS product_spec_revisions_open_uidx/);
  assert.match(sql0369, /CREATE UNIQUE INDEX product_spec_revisions_open_uidx[\s\S]*?WHERE status IN \('draft', 'pending'\)/);
});

test('0369: สถานะที่ฐานยอม = ที่โค้ดประกาศ และรางเดินตามลำดับนั้น', () => {
  const inCheck = sql0369.match(/CHECK \(status IN \(([^)]+)\)\)/);
  assert.ok(inCheck, 'ต้องมี CHECK ชุดใหม่ในไฟล์');
  const allowed = inCheck[1].split(',').map((part) => part.trim().replace(/'/g, ''));
  assert.deepEqual([...allowed].sort(), [...SPEC_REVISION_STATUSES].sort());
  for (const step of SPEC_REVISION_STEPS) assert.ok(allowed.includes(step), step);
});

test('🪤 0369 ย้ายแถวเดิมก่อนเปลี่ยน CHECK — ไม่ใช่หลัง (ไม่งั้น ALTER ล้มทั้งใบ)', () => {
  const update = sql0369.indexOf("SET status = 'pending'");
  const addCheck = sql0369.indexOf('ADD CONSTRAINT product_spec_revisions_status_check');
  assert.ok(update > -1 && addCheck > -1);
  assert.ok(update < addCheck, 'UPDATE ต้องมาก่อน ADD CONSTRAINT');
  assert.match(sql0369, /WHERE status IN \('pending_ae', 'pending_ae_supervisor'\)/);
});

test('0369 ไม่ลบคอลัมน์ผู้ตรวจของเส้นเดิม — ชื่อคนที่ตรวจจริงคือประวัติ', () => {
  assert.ok(!/DROP COLUMN[\s\S]*?reviewed/i.test(sql0369), 'ห้าม DROP COLUMN reviewed*');
  assert.match(sql0369, /COMMENT ON COLUMN public\.product_spec_revisions\."reviewedAt"/);
});

test('ออกเอกสารซ้ำบนบรรทัด SO เดิมไม่ได้ แต่ใบที่ยกเลิกแล้วออกใหม่ได้', () => {
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS product_spec_issues_line_uidx/);
  assert.match(sql, /status <> 'void'/);
});

test('ทุกช่องสเปกที่โค้ดเขียนมีคอลัมน์รองรับใน migration', () => {
  for (const field of SPEC_CONTENT_FIELDS) {
    assert.match(sql, new RegExp(`"?${field}"?\\s`), `ขาดคอลัมน์ ${field}`);
  }
});

test('ฉบับที่ปิดแล้วถูกตรึงด้วย trigger ที่ฐาน ไม่ใช่แค่ด่านใน API', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.guard_product_spec_revision/);
  assert.match(sql, /CREATE TRIGGER product_spec_revisions_guard/);
  assert.match(sql, /product_spec_revision_content_frozen/);
});

test('🪤 ฉบับที่ถูกตีกลับต้องไม่ถูกตรึง — ไม่งั้นใบที่หัวหน้าตีกลับเป็นทางตัน', () => {
  const guard = sql.slice(
    sql.indexOf('FUNCTION public.guard_product_spec_revision'),
    sql.indexOf('DROP TRIGGER IF EXISTS product_spec_revisions_guard'),
  );
  assert.match(guard, /IF OLD\.status IN \('approved', 'superseded'\) THEN/);
  assert.doesNotMatch(guard, /IF OLD\.status IN \([^)]*'rejected'[^)]*\) THEN/);
});

test('RPC ออกเลขอ่านคีย์ snapshot ทุกตัวที่ store ส่งไป', () => {
  const fn = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.create_product_spec_issue'),
    sql.indexOf('REVOKE ALL ON FUNCTION public.create_product_spec_issue'),
  );
  assert.ok(fn.length > 0, 'หา RPC ออกเลขไม่เจอ');
  for (const key of [
    'salesOrderId', 'salesOrderLineId', 'orderNumber', 'quotationNumber',
    'qty', 'unit', 'deliveryDueDate', 'customerName', 'brandName', 'productName', 'fgCode',
    'createdBy', 'createdByName',
  ]) {
    assert.match(fn, new RegExp(`p_payload->>'${key}'`), `RPC ไม่อ่านคีย์ ${key} ⇒ ถูกทิ้งเงียบ`);
  }
});

test('RPC ออกเลขพร้อม INSERT ในคำสั่งเดียว และล็อกใบก่อนอ่าน', () => {
  const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.create_product_spec_issue'));
  assert.match(fn, /FROM public\.product_specs WHERE id = p_spec_id FOR UPDATE/);
  assert.match(fn, /INSERT INTO public\.entity_number_counters/);
  assert.match(fn, /INSERT INTO public\.product_spec_issues/);
  // เพดานเลขรันต้องเทียบกับความกว้างจริง ไม่ใช่เลขตายตัว
  assert.match(fn, /power\(10, p_width\)/);
});

test('ตัวนับใช้ scope ของตัวเอง — ไม่ไปกินเลขของใบอื่น', () => {
  assert.match(sql, /'FMSA04'/);
  assert.equal(PRODUCT_SPEC_DOC_RUNNING_WIDTH, 3);
});

test('RPC ปิดจาก anon/authenticated — เข้าได้เฉพาะ service_role', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.create_product_spec_issue[\s\S]*?FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.create_product_spec_issue[\s\S]*?TO service_role/);
});

test('สองช่องกระจกบนทะเบียนสินค้าถูกเพิ่ม และเขียนคอมเมนต์บอกว่าของจริงอยู่ที่ไหน', () => {
  assert.match(sql, /ALTER TABLE public\.products[\s\S]*?ADD COLUMN IF NOT EXISTS texture/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "standardPackaging"/);
  assert.match(sql, /COMMENT ON COLUMN public\.products\.texture/);
});
