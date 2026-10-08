/* ยามกัน "โค้ดกับ migration หลุดจากกัน" ของ **ราคาทุน + รูปประจำแถว checklist** (mig 0405 · มติเจ้าของ 08/10/2569)
 *
 * 🪤 `check:columns` มองไม่เห็นสองคอลัมน์นี้เลย — แถว checklist อ่านด้วย `select('*')` และเขียนผ่าน `.rpc()` ·
 *    ค่าที่เดินผ่าน `p_rows` jsonb ถูก RPC ทิ้งเงียบถ้าไม่ได้ประกาศ ⇒ ไฟล์นี้คือด่านเดียวที่เห็นเนื้อไฟล์ก่อนมีคนวางลง SQL Editor
 * 🔴 ของที่แพงที่สุดในไฟล์นี้คือ **การยกค่าเดิมข้ามการทับ** — RPC ลบทั้งชุดแล้วเขียนใหม่ ⇒ ผู้เรียกที่ไม่ส่งสองคีย์ใหม่
 *    (โค้ดรุ่นก่อน · แท็บค้าง) จะล้างราคาทุนกับรูปของทุกแถวทุกครั้งที่บันทึก ถ้าเงื่อนไขนั้นหายไปจากไฟล์
 * ⚠️ ไฟล์นี้อ่านตัวหนังสือ — ว่า SQL **รันได้จริง** และทำตามที่เขียน พิสูจน์แยกด้วย PGlite ตอนเขียน (นอกรีโป · ไม่อยู่ใน CI)
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { SPEC_ITEM_COST_MAX } from './productSpecWorkflow.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const stripComments = (text) => text.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const sql = readFileSync(new URL('0405_product_spec_item_cost_image.sql', MIGRATIONS), 'utf8');
const store = read('./productSpecStore.js');

// ตัดคอมเมนต์บรรทัดออก — ส่วนย้อนกลับท้ายไฟล์เป็นคอมเมนต์ที่มีคำสั่ง DROP อยู่ ห้ามนับเป็นโค้ด
const code = stripComments(sql);
const header = sql.slice(0, sql.indexOf('BEGIN;'));
const tail = sql.slice(sql.lastIndexOf('COMMIT;'));
const RPC_MARK = 'CREATE OR REPLACE FUNCTION public.replace_product_spec_items(';
const fnOf = (text) => {
  const start = text.indexOf(RPC_MARK);
  assert.ok(start >= 0, 'หาตัวฟังก์ชัน replace_product_spec_items ไม่เจอ');
  const end = text.indexOf('REVOKE ALL ON FUNCTION public.replace_product_spec_items', start);
  assert.ok(end > start, 'หา REVOKE ต่อจากตัวฟังก์ชันไม่เจอ');
  return text.slice(start, end);
};
const fn = fnOf(code);

/* ── โครงไฟล์ + หัวไฟล์ ─────────────────────────────────────────────── */

test('ทั้งไฟล์อยู่ในทรานแซกชันเดียว · NOTIFY หลัง COMMIT', () => {
  assert.equal((code.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((code.match(/^COMMIT;$/gm) || []).length, 1);
  const begin = code.indexOf('BEGIN;');
  const commit = code.lastIndexOf('COMMIT;');
  assert.ok(begin >= 0 && commit > begin);
  assert.ok(code.indexOf("NOTIFY pgrst, 'reload schema';") > commit);
});

test('หัวไฟล์บอกมติ 08/10/2569 · รันมือ · **รันก่อน merge/deploy** · รันซ้ำได้ · ใช้ในระบบเท่านั้น', () => {
  assert.match(header, /Migration 0405/);
  assert.match(header, /08\/10\/2569/);
  assert.match(header, /SQL Editor/);
  // 🔴 โค้ดใหม่บน RPC เก่า = สองคีย์ถูกทิ้งเงียบ ⇒ ลำดับคือ SQL ก่อนโค้ดเสมอ (ไฟล์นี้เข้ากันได้กับโค้ดที่ deploy อยู่)
  assert.match(header, /รันก่อน merge/);
  assert.match(header, /ก่อน deploy/);
  assert.match(header, /รันซ้ำได้/);
  assert.match(header, /ภายในจอเท่านั้น/);
  assert.match(header, /ไม่ลงกระดาษ/);
  // หัวไฟล์ต้องเล่าการจับคู่สามขั้นตามจริง (รวมขั้นชื่อรายการ และกรณีที่ยังหลุดได้) — คนรันอ่านหัวไฟล์ ไม่ได้อ่านตัวฟังก์ชัน
  assert.match(header, /① id เดิม → ② itemKey ที่ไม่ว่าง[^\n]*→ ③ แถวที่เพิ่มเอง/);
  assert.match(header, /itemLabel\) ตรงกันเป๊ะ/);
  assert.match(header, /แก้ชื่อ\*\* แถวที่เพิ่มเอง/);
});

/* ── ① คอลัมน์ · CHECK · FK · index ────────────────────────────────── */

test('สองคอลัมน์เพิ่มแบบรันซ้ำได้ · ชนิด numeric กับ uuid · ไม่มี backfill', () => {
  assert.match(code, /ALTER TABLE public\.product_spec_items\s+ADD COLUMN IF NOT EXISTS "costPrice" numeric,\s+ADD COLUMN IF NOT EXISTS "imageAttachmentId" uuid;/);
  assert.doesNotMatch(code, /UPDATE public\.product_spec_items/, 'คอลัมน์ใหม่เริ่มว่าง ไม่มี backfill');
});

test('🪤 เพดานราคาทุนใน CHECK = SPEC_ITEM_COST_MAX ของฝั่งโค้ด · NULL ผ่าน · ห้ามติดลบ', () => {
  assert.match(code, /DROP CONSTRAINT IF EXISTS product_spec_items_cost_check;/);
  const check = code.match(/ADD CONSTRAINT product_spec_items_cost_check\s+CHECK \("costPrice" IS NULL OR \("costPrice" >= 0 AND "costPrice" <= ([0-9.]+)\)\);/);
  assert.ok(check, 'หา CHECK ของราคาทุนไม่เจอ');
  // ด่านที่หลวมกว่าฐาน = ผู้ใช้เห็น error ของ Postgres · แน่นกว่าฐาน = ค่าที่เก็บได้บันทึกซ้ำไม่ได้
  assert.equal(check[1], String(SPEC_ITEM_COST_MAX));
});

test('FK ของรูปมีชื่อของตัวเอง (DROP IF EXISTS + ADD) · ชี้ attachments(id) · ON DELETE SET NULL · มี index บางส่วน', () => {
  assert.match(code, /DROP CONSTRAINT IF EXISTS product_spec_items_image_fk;/);
  assert.match(code, /ADD CONSTRAINT product_spec_items_image_fk\s+FOREIGN KEY \("imageAttachmentId"\) REFERENCES public\.attachments\(id\) ON DELETE SET NULL;/);
  // 🪤 ประกาศ REFERENCES ในบรรทัด ADD COLUMN IF NOT EXISTS = ไม่ซ่อมคอลัมน์ที่มีอยู่แล้วแต่ไม่มี FK และได้ชื่อที่ต้องเดา
  assert.doesNotMatch(code, /ADD COLUMN IF NOT EXISTS "imageAttachmentId" uuid\s+REFERENCES/);
  assert.match(code, /CREATE INDEX IF NOT EXISTS product_spec_items_image_idx\s+ON public\.product_spec_items \("imageAttachmentId"\) WHERE "imageAttachmentId" IS NOT NULL;/);
  // ชื่อ constraint คือสิ่งที่ store ใช้แปล error ของฐานเป็นภาษาคน
  assert.ok(store.includes('product_spec_items_image_fk'));
});

test('สองคอลัมน์มี COMMENT บอกว่าใช้ในระบบเท่านั้น', () => {
  for (const column of ['costPrice', 'imageAttachmentId']) {
    const comment = code.match(new RegExp(`COMMENT ON COLUMN public\\.product_spec_items\\."${column}" IS\\s+'([^']+)';`));
    assert.ok(comment, column);
    assert.match(comment[1], /ใช้ในระบบเท่านั้น/, column);
    assert.match(comment[1], /ไม่ลงภาพนิ่ง\/กระดาษ/, column);
  }
});

/* ── ② RPC ─────────────────────────────────────────────────────────── */

test('🔴 RPC: ลายเซ็นเดิม · SECURITY DEFINER · ล็อกสเปค → เก็บแถวเดิม → ลบ → เขียน', () => {
  assert.match(fn, /replace_product_spec_items\(\s*p_spec_id text,\s*p_rows\s+jsonb/);
  assert.match(fn, /RETURNS integer/);
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path = public/);
  const lock = fn.indexOf('FROM public.product_specs WHERE id = p_spec_id FOR UPDATE');
  const keep = fn.indexOf('INTO v_old');
  const wipe = fn.indexOf('DELETE FROM public.product_spec_items WHERE "specId" = p_spec_id');
  const write = fn.indexOf('INSERT INTO public.product_spec_items');
  assert.ok(lock > 0 && wipe > lock && write > wipe, 'ต้องล็อกสเปคก่อน แล้วลบ แล้วค่อยเขียน');
  assert.ok(keep > lock && keep < wipe, '🔴 ต้องเก็บแถวเดิมหลังล็อกและ **ก่อน** ลบ — ลบแล้วไม่มีอะไรให้ยก');
  assert.match(fn, /product_spec_not_found/);
  assert.match(fn, /product_spec_items_rows_invalid/);
});

test('🔴 RPC ยกราคาทุน/รูปของแถวเดิมเมื่อผู้เรียก **ไม่ได้ส่งคีย์** — ถามจากก้อน jsonb ของแถว ไม่ใช่จากค่าที่แกะแล้ว', () => {
  // แกะแล้วคีย์ที่ไม่ส่งกับคีย์ที่ส่ง null เป็น NULL เหมือนกัน ⇒ ต้องถาม `elem ? 'คีย์'`
  assert.match(fn, /CASE WHEN e\.elem \? 'costPrice' THEN r\."costPrice" ELSE o\."costPrice" END/);
  assert.match(fn, /CASE WHEN e\.elem \? 'imageAttachmentId' THEN r\."imageAttachmentId" ELSE o\."imageAttachmentId" END/);
  assert.match(fn, /FROM jsonb_array_elements\(p_rows\) AS e\(elem\)\s+CROSS JOIN LATERAL jsonb_to_record\(e\.elem\) AS r\(/);
  // แถวเดิมที่ถูกเก็บ: id · itemKey · itemLabel (กฎชื่อรายการ) · sortOrder (ตัวเรียง) · สองคอลัมน์ใหม่ — ของสเปคนี้เท่านั้น
  const kept = fn.slice(fn.indexOf('SELECT COALESCE(jsonb_agg('), fn.indexOf('DELETE FROM public.product_spec_items'));
  for (const key of [
    "'id', i.id", "'itemKey', i.\"itemKey\"", "'itemLabel', i.\"itemLabel\"", "'sortOrder', i.\"sortOrder\"",
    "'costPrice', i.\"costPrice\"", "'imageAttachmentId', i.\"imageAttachmentId\"",
  ]) {
    assert.ok(kept.includes(key), key);
  }
  assert.match(kept, /WHERE i\."specId" = p_spec_id/);
});

test('🔴 RPC จับคู่แถวเดิมสามขั้น: id → itemKey ที่ไม่ว่าง → แถวที่เพิ่มเอง (itemKey ว่างทั้งคู่) ที่ itemLabel ตรงกัน · เรียงตามลำดับนั้น · แถวเดียว', () => {
  const pick = fn.slice(fn.indexOf('LEFT JOIN LATERAL ('), fn.indexOf(') o ON true'));
  // ชุดคอลัมน์ที่แกะจากแถวเดิมต้องมีของที่เงื่อนไขใช้ครบ — คีย์ที่ไม่ได้ประกาศ = NULL เงียบ แล้วกฎชื่อไม่เคยติด
  const columns = pick.slice(pick.indexOf('AS s('), pick.indexOf('WHERE'));
  for (const column of ['id text', '"itemKey" text', '"itemLabel" text', '"sortOrder" integer', '"costPrice" numeric', '"imageAttachmentId" uuid']) {
    assert.ok(columns.includes(column), column);
  }
  const where = pick.slice(pick.indexOf('WHERE'), pick.indexOf('ORDER BY'));
  assert.match(where, /^WHERE s\.id = r\.id\s+OR \(r\."itemKey" IS NOT NULL AND s\."itemKey" = r\."itemKey"\)\s+OR \(r\."itemKey" IS NULL AND s\."itemKey" IS NULL AND s\."itemLabel" = r\."itemLabel"\)\s*$/);
  /* 🔴 กฎชื่อรายการ — ผู้เรียกที่ไม่รู้จักสองคีย์ใหม่ไม่ส่ง id มาด้วย ⇒ แถวที่เพิ่มเองไม่มีอะไรให้จับนอกจากชื่อ ·
     ต้องจำกัดที่ itemKey ว่าง **ทั้งสองฝั่ง** (ไม่งั้นแถวที่เพิ่มเองชื่อ "ฝา" ไปเอาราคาทุนของแถว "ฝา" ของแบบฟอร์ม) */
  assert.equal((where.match(/\bOR\b/g) || []).length, 2, 'สามขั้นพอดี — ขั้นที่หลวมกว่านี้ (เช่นจับด้วยชื่ออย่างเดียว) ห้ามมี');
  // ลำดับความสำคัญ: id > itemKey > ชื่อ · ตัวเรียงท้ายให้ผลนิ่งเมื่อแถวเดิมชื่อซ้ำ
  assert.match(pick, /ORDER BY \(s\.id IS NOT DISTINCT FROM r\.id\) DESC,\s+\(s\."itemKey" IS NOT DISTINCT FROM r\."itemKey"\) DESC,\s+s\."sortOrder", s\.id\s+LIMIT 1/);
  assert.match(pick, /SELECT s\."costPrice", s\."imageAttachmentId"/);
});

test('RPC: INSERT · SELECT · ชุดคอลัมน์ที่แกะ ต่างมีสองคอลัมน์ใหม่ครบ', () => {
  const insertList = fn.slice(fn.indexOf('INSERT INTO public.product_spec_items ('), fn.indexOf('SELECT r.id'));
  const selectList = fn.slice(fn.indexOf('SELECT r.id'), fn.indexOf('FROM jsonb_array_elements'));
  const record = fn.slice(fn.indexOf('AS r('), fn.indexOf('LEFT JOIN LATERAL'));
  for (const column of ['"costPrice"', '"imageAttachmentId"']) {
    assert.ok(insertList.includes(column), `INSERT ไม่มี ${column}`);
    assert.ok(selectList.includes(column), `SELECT ไม่มี ${column}`);
    assert.ok(record.includes(column), `ชุดคอลัมน์ที่แกะไม่มี ${column}`);
  }
  assert.match(record, /"costPrice"\s+numeric/);
  assert.match(record, /"imageAttachmentId"\s+uuid/);
});

test('RPC ปิดจาก PUBLIC/anon/authenticated · ให้ service_role **เท่านั้น** (ประกาศซ้ำหลัง CREATE OR REPLACE · ทั้งไฟล์มี GRANT คำสั่งเดียว)', () => {
  const sig = '(text, jsonb)';
  assert.ok(code.includes(`REVOKE ALL ON FUNCTION public.replace_product_spec_items${sig}\n  FROM PUBLIC, anon, authenticated;`));
  assert.ok(code.includes(`GRANT EXECUTE ON FUNCTION public.replace_product_spec_items${sig}\n  TO service_role;`));
  assert.ok(code.indexOf('REVOKE ALL ON FUNCTION') > code.indexOf(RPC_MARK));
  /* 🔴 "มีบรรทัดที่ถูก" ไม่พอ — GRANT ให้ anon/authenticated ที่ก๊อปติดมาจาก migration อื่นทำให้ RPC SECURITY DEFINER ตัวนี้
     (เขียน checklist · ราคาทุน · ตัวชี้รูป ของสเปคใบไหนก็ได้) เรียกได้ด้วยคีย์ anon สาธารณะ ทั้งที่สองบรรทัดข้างบนยังอยู่ครบ */
  const grants = [...code.matchAll(/GRANT\s+[^;]*?ON\s+FUNCTION\s+public\.replace_product_spec_items\s*\([^)]*\)\s*TO\s+([^;]+);/gi)];
  assert.equal(grants.length, 1, 'ต้องมี GRANT ของ RPC นี้คำสั่งเดียว');
  assert.equal(grants[0][1].trim().toLowerCase(), 'service_role', 'ผู้รับสิทธิ์ต้องเป็น service_role ตัวเดียว');
  assert.equal((code.match(/\bGRANT\b/gi) || []).length, 1, 'ไฟล์นี้ต้องไม่มี GRANT อื่น (รวม GRANT ALL · ON ALL FUNCTIONS IN SCHEMA)');
  const revokeAt = code.indexOf('REVOKE ALL ON FUNCTION public.replace_product_spec_items');
  assert.ok(revokeAt > code.indexOf(RPC_MARK) && revokeAt < grants[0].index, 'REVOKE ต้องอยู่หลัง CREATE และก่อน GRANT');
  assert.equal((code.match(/\bREVOKE\b/gi) || []).length, 1);
});

/* ── คีย์ที่ store ส่ง = คอลัมน์ที่ RPC ตัวปัจจุบันอ่าน ───────────────── */

/* 🪤 หา migration **ตัวล่าสุดที่นิยามฟังก์ชันนี้จริง** — ตัดคอมเมนต์ก่อนค้น: 0403 เอ่ยชื่อฟังก์ชันในคอมเมนต์ และส่วน rollback
   ของไฟล์ไหนก็อาจมีตัวฟังก์ชันอยู่ในคอมเมนต์ได้ · ค้นด้วยชื่อเฉย ๆ = เทียบกับไฟล์ที่ไม่ได้นิยามมัน */
const newestRpcFile = () => readdirSync(MIGRATIONS)
  .filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort()
  .filter((name) => stripComments(readFileSync(new URL(name, MIGRATIONS), 'utf8')).includes(RPC_MARK))
  .at(-1);

test('🪤 คีย์ของแถว checklist ที่ store ส่ง = คอลัมน์ที่ RPC ตัวล่าสุดอ่าน (คีย์เกิน = ถูกทิ้งเงียบ · คีย์ขาด = NULL/ค่าเดิม)', () => {
  const file = newestRpcFile();
  assert.equal(file, '0405_product_spec_item_cost_image.sql', 'มี migration ใหม่กว่าที่นิยาม RPC นี้ — ย้ายยามชุดนี้ตามไปด้วย');
  const latest = fnOf(stripComments(readFileSync(new URL(file, MIGRATIONS), 'utf8')));
  const record = latest.slice(latest.indexOf('AS r('), latest.indexOf(')', latest.indexOf('AS r(')));
  const readKeys = [...record.matchAll(/^\s+"?([A-Za-z]+)"?\s+(?:text|integer|boolean|numeric|uuid)\b/gm)].map((m) => m[1]).sort();

  const body = store.slice(store.indexOf('async function replaceSpecItems'), store.indexOf("rpc('replace_product_spec_items'"));
  const map = body.slice(body.indexOf('items.map('));
  // คีย์ที่ใส่เสมอ (ในก้อน `const out = {…}`) + คีย์ที่ใส่เฉพาะเมื่อแถวมี (`out.<คีย์> = …`)
  const always = [...map.matchAll(/^\s+([A-Za-z]+):/gm)].map((m) => m[1]);
  const conditional = [...map.matchAll(/^\s+if \('([A-Za-z]+)' in row\) out\.([A-Za-z]+) = /gm)].map((m) => {
    assert.equal(m[1], m[2], 'คีย์ที่ถามกับคีย์ที่ใส่ต้องเป็นตัวเดียวกัน');
    return m[2];
  });
  assert.deepEqual(conditional.sort(), ['costPrice', 'imageAttachmentId'],
    '🔴 สองคีย์นี้ต้องใส่เฉพาะเมื่อแถวมีคีย์ — ใส่เสมอ = ทุกการบันทึกล้างค่าเดิม');
  assert.deepEqual([...always, ...conditional].sort(), readKeys);
  assert.deepEqual(readKeys, [
    'costPrice', 'detail', 'id', 'imageAttachmentId', 'itemKey', 'itemLabel', 'note',
    'preparedByCustomer', 'preparedByS', 'sortOrder',
  ]);
});

/* ── ย้อนกลับ ──────────────────────────────────────────────────────── */

test('ส่วนย้อนกลับ: ถอยโค้ดก่อน · วางตัวฟังก์ชัน 8 คอลัมน์ของ 0370 ⑨ข กลับ · ถอด index/constraint/คอลัมน์ · เตือนว่าข้อมูลหาย', () => {
  assert.match(tail, /Rollback/);
  assert.match(tail, /ถอยโค้ดก่อน/);
  assert.match(tail, /0370 หัวข้อ ⑨ข/);
  assert.match(tail, /หายถาวร/);
  for (const line of [
    '-- DROP INDEX IF EXISTS public.product_spec_items_image_idx;',
    '-- ALTER TABLE public.product_spec_items DROP CONSTRAINT IF EXISTS product_spec_items_image_fk;',
    '-- ALTER TABLE public.product_spec_items DROP CONSTRAINT IF EXISTS product_spec_items_cost_check;',
    '-- ALTER TABLE public.product_spec_items DROP COLUMN IF EXISTS "imageAttachmentId";',
    '-- ALTER TABLE public.product_spec_items DROP COLUMN IF EXISTS "costPrice";',
  ]) assert.ok(tail.includes(line), line);
});

test('🔴 ส่วนย้อนกลับห้ามถอด RPC ทิ้ง — โค้ดทุกรุ่นตั้งแต่ 0370 เรียกมันทุกครั้งที่บันทึก checklist', () => {
  assert.doesNotMatch(sql, /DROP FUNCTION IF EXISTS public\.replace_product_spec_items/);
});

test('ตัว RPC ของ 0370 ที่ส่วนย้อนกลับอ้างถึงยังอยู่ในไฟล์เดิม (8 คอลัมน์ · ไม่มีสองคอลัมน์ใหม่)', () => {
  const old = fnOf(stripComments(readFileSync(new URL('0370_product_spec_document_model.sql', MIGRATIONS), 'utf8')));
  assert.match(old, /jsonb_to_recordset\(p_rows\) AS r\(/);
  assert.doesNotMatch(old, /costPrice|imageAttachmentId/);
});
