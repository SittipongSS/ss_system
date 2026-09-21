/* ยามกัน "โค้ดกับ migration หลุดจากกัน" ของใบสเปคสินค้า (mig 0370 · มติ 21/09/2569)
 *
 * 🪤 `check:columns` เทียบกับ **schema จริงบนฐาน** ⇒ บอกได้แค่ว่ารัน migration แล้วหรือยัง
 *    ไม่ได้บอกว่าไฟล์ในรีโปประกาศของที่โค้ดต้องใช้ครบไหม · และ 0370 ต้องรันมือก่อน deploy
 *    ⇒ ไฟล์นี้คือด่านเดียวที่เห็นกติกาสำคัญของไฟล์ก่อนมีคนวางลง SQL Editor
 * 🪤 ค่าที่เดินผ่าน `p_payload` jsonb ของ RPC **ไม่มีด่านไหนมองเห็นเลย** — คีย์ที่ RPC ไม่อ่าน
 *    ถูกทิ้งเงียบ แล้ว API ตอบว่าออกเอกสารสำเร็จ (โรคเดียวกับ save_quotation_content whitelist)
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PRODUCT_SPEC_CERTIFICATIONS } from './productSpecChecklist.js';
import { PRODUCT_SPEC_DOC_RUNNING_WIDTH, productSpecDocNoParts } from './productSpecDocNo.js';
import { SPEC_CONTENT_FIELDS, SPEC_CONTENT_LIMITS } from './productSpecWorkflow.js';
import { DOC_REVISION_STATUSES, OPEN_REVISION_STATUSES, revisionPatch } from './productSpecDocWorkflow.js';
import { DOCUMENT_STANDARD_KEYS, validateNumberingPattern } from '../documentStandards.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const sql = read('../../../supabase/migrations/0370_product_spec_document_model.sql');
const store = read('./productSpecStore.js');

// ตัดคอมเมนต์บรรทัดออก — ส่วนย้อนกลับท้ายไฟล์เป็นคอมเมนต์ที่มีคำสั่ง DROP อยู่ ห้ามนับ
const code = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const between = (from, to) => {
  const start = code.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอ`);
  const end = to ? code.indexOf(to, start + from.length) : code.length;
  assert.ok(end > start, `หา "${to}" ต่อจาก "${from}" ไม่เจอ`);
  return code.slice(start, end);
};

/* ── โครงไฟล์ ─────────────────────────────────────────────────────── */

test('ทั้งไฟล์อยู่ในทรานแซกชันเดียว · NOTIFY หลัง COMMIT', () => {
  const begin = code.indexOf('BEGIN;');
  const commit = code.lastIndexOf('COMMIT;');
  assert.ok(begin >= 0 && commit > begin);
  assert.ok(code.indexOf("NOTIFY pgrst, 'reload schema';") > commit);
});

test('หัวไฟล์บอกมติ 21/09/2569 และว่าต้องรันมือก่อน deploy', () => {
  const header = sql.slice(0, sql.indexOf('BEGIN;'));
  assert.match(header, /21\/09\/2569/);
  assert.match(header, /SQL Editor/);
  assert.match(header, /ก่อน deploy/);
  assert.match(header, /รันซ้ำได้/);
});

/* ── ① ด่านศูนย์แถว ───────────────────────────────────────────────── */

test('🔴 ด่านแรกของไฟล์: product_spec_issues มีแถว = RAISE (เฉพาะตอนตารางยังอยู่)', () => {
  const guard = between('DO $$', 'END $$;');
  assert.match(guard, /to_regclass\('public\.product_spec_issues'\) IS NOT NULL/);
  assert.match(guard, /count\(\*\) FROM public\.product_spec_issues/);
  assert.match(guard, /RAISE EXCEPTION 'product_spec_issues_not_empty/);
  // ต้องมาก่อนทุกคำสั่งที่ทำลายของ
  const guardAt = code.indexOf('product_spec_issues_not_empty');
  for (const destructive of ['DROP TABLE', 'DROP COLUMN', 'DROP FUNCTION', 'ALTER TABLE']) {
    assert.ok(guardAt < code.indexOf(destructive), `ด่านต้องมาก่อน ${destructive}`);
  }
});

/* ── ② ③ สเปค ────────────────────────────────────────────────────── */

test('ทุกช่องเนื้อสเปคที่โค้ดเขียนมีคอลัมน์บน product_specs + เพดานความยาวเท่าโค้ด', () => {
  const alter = between('ALTER TABLE public.product_specs\n  ADD COLUMN', ';');
  const check = between('ADD CONSTRAINT product_specs_text_check', ';');
  for (const field of SPEC_CONTENT_FIELDS) {
    const col = /^[a-z]+$/.test(field) ? field : `"${field}"`;
    assert.match(alter, new RegExp(`ADD COLUMN IF NOT EXISTS ${col.replace(/"/g, '"')}\\s+text`), `ขาดคอลัมน์ ${field}`);
    const limit = check.match(new RegExp(`length\\(${col.replace(/"/g, '"')}\\)\\s*<=\\s*(\\d+)`));
    assert.ok(limit, `ขาด CHECK ความยาวของ ${field}`);
    assert.equal(Number(limit[1]), SPEC_CONTENT_LIMITS[field], `เพดานของ ${field} ไม่เท่ากับโค้ด`);
  }
  assert.match(alter, /certifications\s+jsonb NOT NULL DEFAULT '\[\]'::jsonb/);
  assert.match(alter, /"updatedBy"\s+text/);
  assert.match(alter, /"updatedByName"\s+text/);
});

test('สเปคไม่มีเลขฉบับอีกต่อไป — currentRevNo ถูกถอด', () => {
  assert.match(code, /ALTER TABLE public\.product_specs DROP COLUMN IF EXISTS "currentRevNo";/);
});

test('checklist ย้ายไป product_spec_items (คีย์ specId · CASCADE) ผ่าน Rev ล่าสุดของแต่ละใบ', () => {
  const table = between('CREATE TABLE IF NOT EXISTS public.product_spec_items', ');\n');
  assert.match(table, /"specId"\s+text NOT NULL REFERENCES public\.product_specs\(id\) ON DELETE CASCADE/);
  assert.match(table, /length\("itemLabel"\) BETWEEN 1 AND 200/);
  const move = between('$items$', '$items$;');
  assert.match(move, /INSERT INTO public\.product_spec_items/);
  assert.match(move, /DISTINCT ON \("specId"\)[\s\S]*ORDER BY "specId", "revNo" DESC/);
  assert.match(move, /ON CONFLICT \(id\) DO NOTHING/);
  // ย้ายเนื้อสเปคจาก Rev ล่าสุดเหมือนกัน
  const content = between('$move$', '$move$;');
  assert.match(content, /DISTINCT ON \("specId"\)[\s\S]*ORDER BY "specId", "revNo" DESC/);
  for (const field of SPEC_CONTENT_FIELDS) assert.match(content, new RegExp(`${field}`), field);
});

test('ขั้นย้ายข้อมูลทำเฉพาะรอบแรก (ตารางเดิมยังอยู่) — รันซ้ำไม่งอกซ้ำ', () => {
  const block = between('IF to_regclass(\'public.product_spec_revisions\') IS NULL THEN', 'END $$;');
  assert.match(block, /RETURN;/);
  assert.ok(block.includes('$move$') && block.includes('$items$') && block.includes('$certs$'));
});

test('🐞 สเปคที่ยังไม่มีเอกสารที่ขอได้ ได้สี่แถวตั้งต้น — คีย์/คำตรงกับทะเบียนในโค้ด', () => {
  const seed = between('$certs$', '$certs$;');
  const rows = [...seed.matchAll(/jsonb_build_object\('key', '([a-z]+)',\s*'label', '([^']+)'/g)]
    .map((m) => ({ key: m[1], label: m[2] }));
  assert.deepEqual(rows, PRODUCT_SPEC_CERTIFICATIONS.map(({ key, label }) => ({ key, label })));
  assert.match(seed, /WHERE certifications = '\[\]'::jsonb/);
});

/* ── ⑤ ถอดของเดิมตามลำดับที่ของพึ่งกัน ─────────────────────────────── */

test('ถอดของเดิมครบ และเรียงลำดับ trigger → ฟังก์ชัน → ตารางลูก → ตารางแม่', () => {
  const order = [
    'DROP TRIGGER IF EXISTS product_spec_revisions_guard',
    'DROP FUNCTION IF EXISTS public.guard_product_spec_revision()',
    'DROP FUNCTION IF EXISTS public.create_product_spec_issue(text, text, text, text, text, integer, jsonb)',
    'DROP TABLE IF EXISTS public.product_spec_issues;',
    'DROP TABLE IF EXISTS public.product_spec_revision_items;',
    'DROP TABLE IF EXISTS public.product_spec_revisions;',
  ].map((text) => {
    const at = code.indexOf(text);
    assert.ok(at >= 0, `ไม่มี ${text}`);
    return at;
  });
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  // ย้ายข้อมูลต้องเสร็จก่อนถอดตาราง
  assert.ok(code.indexOf('$items$') < order[3]);
});

/* ── ⑥ ⑦ เอกสาร + Rev ─────────────────────────────────────────────── */

test('🔴 เอกสาร: สเปค/สินค้าเป็น RESTRICT · SO/บรรทัดเป็น SET NULL · docNo UNIQUE', () => {
  const table = between('CREATE TABLE IF NOT EXISTS public.product_spec_documents', '\n);');
  assert.match(table, /"docNo"\s+text NOT NULL UNIQUE/);
  assert.match(table, /"specId"\s+text NOT NULL REFERENCES public\.product_specs\(id\) ON DELETE RESTRICT/);
  assert.match(table, /"productId"\s+text NOT NULL REFERENCES public\.products\(id\) ON DELETE RESTRICT/);
  assert.match(table, /"salesOrderId"\s+text REFERENCES public\.sales_orders\(id\) ON DELETE SET NULL/);
  assert.match(table, /"salesOrderLineId"\s+text REFERENCES public\.sales_order_lines\(id\) ON DELETE SET NULL/);
  assert.match(table, /status\s+text NOT NULL DEFAULT 'active' CHECK \(status IN \('active', 'void'\)\)/);
  assert.match(table, /"currentRevNo"\s+integer CHECK \("currentRevNo" IS NULL OR "currentRevNo" >= 0\)/);
  assert.doesNotMatch(table, /CASCADE/, 'ลบของแม่แล้วเอกสารหายตาม = เลขที่ที่ออกไปแล้วไม่มีต้นทาง');
});

test('🔴 Rev: documentId RESTRICT · (documentId, revNo) UNIQUE · สถานะตรงกับโค้ด', () => {
  const table = between('CREATE TABLE IF NOT EXISTS public.product_spec_document_revisions', '\n);');
  assert.match(table, /"documentId"\s+text NOT NULL REFERENCES public\.product_spec_documents\(id\) ON DELETE RESTRICT/);
  assert.match(table, /UNIQUE \("documentId", "revNo"\)/);
  assert.match(table, /"revNo"\s+integer NOT NULL CHECK \("revNo" >= 0\)/);
  const inCheck = table.match(/status\s+text NOT NULL DEFAULT 'draft' CHECK \(status IN \(([\s\S]*?)\)\)/);
  assert.ok(inCheck, 'ต้องมี CHECK สถานะ');
  const allowed = inCheck[1].split(',').map((part) => part.trim().replace(/'/g, ''));
  assert.deepEqual([...allowed].sort(), [...DOC_REVISION_STATUSES].sort());
  assert.match(table, /"rejectedStage"\s+text CHECK \("rejectedStage" IS NULL OR "rejectedStage" IN \('ae', 'ae_supervisor'\)\)/);
  // เหตุผลบังคับเมื่อ revNo > 0
  assert.match(table, /"revNo" = 0 OR \(reason IS NOT NULL/);
  // ยื่นแล้วต้องมีภาพนิ่ง
  assert.match(table, /status IN \('draft', 'rejected'\)\s*OR \(snapshot IS NOT NULL AND "submittedAt" IS NOT NULL\)/);
  for (const column of [
    'snapshot', '"illustrationIds"', '"submittedAt"', '"aeApprovedAt"', '"supApprovedAt"', '"rejectedAt"',
    '"rejectionReason"', '"supersededAt"', '"frozenHtml"', '"frozenAt"', '"rendererVersion"',
  ]) {
    assert.match(table, new RegExp(`\\n\\s+${column.replace(/"/g, '"')}\\s`), `ขาดคอลัมน์ ${column}`);
  }
});

test('ก้อนที่โค้ดเขียนลง Rev ใช้แต่สถานะที่ฐานยอม', () => {
  for (const action of ['submit', 'withdraw', 'reset_to_draft', 'ae_approve', 'sup_approve', 'reject']) {
    const built = revisionPatch(action, { snapshot: {}, reason: 'เหตุผลยาวพอสมควร', stage: 'ae' });
    assert.ok(DOC_REVISION_STATUSES.includes(built.patch.status), action);
    for (const from of built.from) assert.ok(DOC_REVISION_STATUSES.includes(from), `${action} from ${from}`);
  }
});

test('🔴 partial unique: บรรทัด SO มีเอกสารที่ยังไม่ void ได้ใบเดียว', () => {
  const idx = between('CREATE UNIQUE INDEX IF NOT EXISTS product_spec_documents_line_uidx', ';');
  assert.match(idx, /ON public\.product_spec_documents \("salesOrderLineId"\)/);
  assert.match(idx, /WHERE "salesOrderLineId" IS NOT NULL AND status <> 'void'/);
});

test('🔴 partial unique: เอกสารหนึ่งใบมี Rev ที่ยังไม่จบได้ทีละหนึ่ง (ชุดสถานะเดียวกับโค้ด)', () => {
  const idx = between('CREATE UNIQUE INDEX IF NOT EXISTS product_spec_document_revisions_open_uidx', ';');
  assert.match(idx, /ON public\.product_spec_document_revisions \("documentId"\)/);
  const inList = idx.match(/WHERE status IN \(([^)]*)\)/);
  assert.ok(inList);
  const statuses = inList[1].split(',').map((part) => part.trim().replace(/'/g, ''));
  assert.deepEqual([...statuses].sort(), [...OPEN_REVISION_STATUSES].sort());
});

test('ดัชนีของคอลัมน์ที่ถูกค้น: salesOrderId · specId · productId · documentId', () => {
  assert.match(code, /product_spec_documents_order_idx\s+ON public\.product_spec_documents \("salesOrderId"\)/);
  assert.match(code, /product_spec_documents_spec_idx\s+ON public\.product_spec_documents \("specId"\)/);
  assert.match(code, /product_spec_documents_product_idx\s+ON public\.product_spec_documents \("productId"/);
  assert.match(code, /product_spec_document_revisions_doc_idx\s+ON public\.product_spec_document_revisions \("documentId"/);
});

/* ── ⑧ ยามที่ฐานถือ ──────────────────────────────────────────────── */

test('🔴 เอกสาร: docNo/specId/productId/createdAt แก้ไม่ได้ · ลบแถวไม่ได้ · void ไม่ฟื้น', () => {
  const fn = between('CREATE OR REPLACE FUNCTION public.guard_product_spec_document()', 'CREATE TRIGGER product_spec_documents_guard');
  assert.match(fn, /TG_OP = 'DELETE'[\s\S]*?RAISE EXCEPTION 'product_spec_document_delete_forbidden/);
  for (const col of ['"docNo"', '"specId"', '"productId"', '"createdAt"']) {
    assert.match(fn, new RegExp(`NEW\\.${col} IS DISTINCT FROM OLD\\.${col}`), col);
  }
  assert.match(fn, /OLD\.status = 'void' AND NEW\.status IS DISTINCT FROM 'void'/);
  assert.match(code, /CREATE TRIGGER product_spec_documents_guard\s+BEFORE UPDATE OR DELETE ON public\.product_spec_documents/);
});

test('🔴 Rev ที่อนุมัติ/ถูกแทนแล้วถูกตรึง · เปลี่ยนสถานะได้ทางเดียว approved → superseded', () => {
  const fn = between('CREATE OR REPLACE FUNCTION public.guard_product_spec_document_revision()', 'CREATE TRIGGER product_spec_document_revisions_guard');
  assert.match(fn, /IF OLD\.status IN \('approved', 'superseded'\) THEN/);
  assert.match(fn, /NOT \(OLD\.status = 'approved' AND NEW\.status = 'superseded'\)/);
  assert.match(fn, /product_spec_document_revision_content_frozen/);
  for (const col of ['snapshot', '"illustrationIds"', '"aeApprovedAt"', '"supApprovedAt"', '"submittedAt"']) {
    assert.match(fn, new RegExp(`NEW\\.${col.replace(/"/g, '"')}`), `ตรึง ${col}`);
  }
  assert.match(fn, /NEW\.status = 'superseded' AND OLD\.status NOT IN \('approved', 'superseded'\)/);
  assert.match(fn, /TG_OP = 'DELETE'[\s\S]*?product_spec_document_revision_delete_forbidden/);
  assert.match(code, /CREATE TRIGGER product_spec_document_revisions_guard\s+BEFORE UPDATE OR DELETE ON public\.product_spec_document_revisions/);
});

test('🔴 frozenHtml เขียนได้ครั้งเดียว', () => {
  const fn = between('CREATE OR REPLACE FUNCTION public.guard_product_spec_document_revision()', 'CREATE TRIGGER product_spec_document_revisions_guard');
  assert.match(fn, /OLD\."frozenHtml" IS NOT NULL[\s\S]*?IS DISTINCT FROM[\s\S]*?frozen_html_write_once/);
});

test('🪤 Rev ที่ถูกตีกลับต้องไม่ถูกตรึง — ไม่งั้นเอกสารที่หัวหน้าตีกลับเป็นทางตัน', () => {
  const fn = between('CREATE OR REPLACE FUNCTION public.guard_product_spec_document_revision()', 'CREATE TRIGGER product_spec_document_revisions_guard');
  assert.doesNotMatch(fn, /IF OLD\.status IN \([^)]*'rejected'[^)]*\) THEN/);
});

/* ── ⑨ RPC ออกเอกสาร ──────────────────────────────────────────────── */

const rpc = () => between(
  'CREATE OR REPLACE FUNCTION public.create_product_spec_document(',
  'REVOKE ALL ON FUNCTION public.create_product_spec_document',
);

test('RPC: SECURITY DEFINER · search_path public · ปิดจาก PUBLIC/anon/authenticated · ให้ service_role', () => {
  const fn = rpc();
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path = public/);
  const sig = '(text, text, text, text, text, text, text, integer, jsonb)';
  assert.ok(code.includes(`REVOKE ALL ON FUNCTION public.create_product_spec_document${sig}\n  FROM PUBLIC, anon, authenticated;`));
  assert.ok(code.includes(`GRANT EXECUTE ON FUNCTION public.create_product_spec_document${sig}\n  TO service_role;`));
});

test('RPC อ่านคีย์ payload ทุกตัวที่ store ส่งไป (คีย์ที่ไม่อ่าน = ถูกทิ้งเงียบ)', () => {
  const call = store.slice(store.indexOf("rpc('create_product_spec_document'"));
  const payload = call.slice(call.indexOf('p_payload: {'), call.indexOf('},', call.indexOf('p_payload: {')));
  const keys = [...payload.matchAll(/^\s+([A-Za-z]+):/gm)].map((m) => m[1]);
  assert.deepEqual(keys.sort(), ['createdBy', 'createdByName', 'salesOrderId', 'salesOrderLineId']);
  const fn = rpc();
  for (const key of keys) assert.match(fn, new RegExp(`p_payload->>'${key}'`), key);
  // พารามิเตอร์ชื่อเดียวกับที่ store ส่ง
  for (const param of ['p_document_id', 'p_revision_id', 'p_spec_id', 'p_product_id', 'p_month', 'p_prefix', 'p_like', 'p_width', 'p_payload']) {
    assert.ok(call.includes(`${param}:`), `store ไม่ส่ง ${param}`);
    assert.match(fn, new RegExp(`\\b${param}\\b`), `RPC ไม่รับ ${param}`);
  }
});

test('RPC ออกเลขด้วยตัวนับ FMSA04 + seed ด้วย LIKE ที่ปิดตาช่องวัน + เพดานตามความกว้าง', () => {
  const fn = rpc();
  assert.match(fn, /scope = 'FMSA04' AND month = p_month/);
  assert.match(fn, /INSERT INTO public\.entity_number_counters AS c \(scope, month, "lastNo"\)/);
  assert.match(fn, /ON CONFLICT \(scope, month\) DO UPDATE SET "lastNo" = c\."lastNo" \+ 1/);
  assert.match(fn, /"docNo" LIKE p_like/);
  assert.match(fn, /power\(10, p_width\)/);
  assert.match(fn, /product_spec_document_monthly_sequence_exhausted/);
  assert.match(fn, /p_prefix !~ '\^FM-SA-04-\[0-9\]\{6\}-\$'/);
  assert.equal(PRODUCT_SPEC_DOC_RUNNING_WIDTH, 3);
  // ชิ้นส่วนที่โค้ดส่งผ่านด่านรูปแบบของ RPC
  const parts = productSpecDocNoParts(new Date('2026-09-22T04:00:00Z'));
  assert.match(parts.prefix, /^FM-SA-04-[0-9]{6}-$/);
  assert.match(parts.month, /^[0-9]{4}$/);
});

test('RPC สร้างเอกสาร active + Rev.00 draft ในการเรียกเดียว และคืน {document, revision}', () => {
  const fn = rpc();
  assert.match(fn, /INSERT INTO public\.product_spec_documents[\s\S]*?'active'/);
  assert.match(fn, /INSERT INTO public\.product_spec_document_revisions[\s\S]*?p_revision_id, p_document_id, 0, 'draft'/);
  assert.match(fn, /jsonb_build_object\('document', to_jsonb\(v_doc\), 'revision', to_jsonb\(v_rev\)\)/);
  assert.ok(fn.indexOf('entity_number_counters AS c') < fn.indexOf('INSERT INTO public.product_spec_documents'),
    'ออกเลขก่อนเขียนแถวในทรานแซกชันเดียวกัน');
});

test('RPC กันซ้ำที่ฐาน: SO ต้องอนุมัติ · บรรทัดอยู่ในใบ · สินค้าตรงสเปค · บรรทัดยังไม่มีเอกสาร', () => {
  const fn = rpc();
  assert.match(fn, /FROM public\.product_specs WHERE id = p_spec_id FOR UPDATE/);
  assert.match(fn, /v_order\.status IS DISTINCT FROM 'approved'[\s\S]*?sales_order_not_approved/);
  assert.match(fn, /"salesOrderId" = v_order_id/);
  assert.match(fn, /sales_order_line_product_mismatch/);
  assert.match(fn, /product_spec_product_mismatch/);
  assert.match(fn, /product_spec_document_exists/);
  // 🛑 ใบย้อนหลังเกิดเป็น approved — ต้องไม่ได้เลขที่ (ยาม historicalSalesOrderMigration อ่านแพตเทิร์นนี้ด้วย)
  assert.match(fn, /IF NOT \(v_order\.origin = 'pipeline'\) THEN[\s\S]*?sales_order_historical/);
  // ข้อความ error ที่ store แปลเป็นภาษาไทย ต้องมีต้นทางจริงใน RPC
  for (const code0 of [
    'product_spec_document_exists', 'sales_order_not_approved', 'sales_order_historical', 'sales_order_not_found',
    'sales_order_line_not_found', 'sales_order_line_product_mismatch', 'product_spec_product_mismatch',
    'product_spec_not_found', 'monthly_sequence_exhausted',
  ]) {
    assert.ok(store.includes(code0), `store ไม่แปล ${code0}`);
    assert.ok(fn.includes(code0), `RPC ไม่มี ${code0}`);
  }
});

/* ── ยามทางเดินหน้า: เอกสาร void / SO หลุดอนุมัติระหว่างคำขอ ───────────────── */

test('🔴 เดินหน้า (ยื่น · อนุมัติสองขั้น) ได้เฉพาะเอกสาร active และ SO ที่ยังอนุมัติ — ล็อกแล้วตรวจในทรานแซกชันเดียวกัน', () => {
  const fn = between('CREATE OR REPLACE FUNCTION public.guard_product_spec_document_revision()', 'CREATE TRIGGER product_spec_document_revisions_guard');
  const forward = fn.match(/IF NEW\.status IN \(([^)]*)\)\s+AND NEW\.status IS DISTINCT FROM OLD\.status THEN/);
  assert.ok(forward, 'หาเงื่อนไขทางเดินหน้าไม่เจอ');
  const statuses = [...forward[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  // สถานะปลายทางของทุกการกระทำที่ "เดินหน้า" ต้องอยู่ในลิสต์ — เพิ่มขั้นใหม่แล้วลืมยาม = ช่องโหว่เดิม
  const targets = ['submit', 'ae_approve', 'sup_approve']
    .map((action) => revisionPatch(action, { now: '2026-09-22T00:00:00Z', snapshot: {} }).patch.status).sort();
  assert.deepEqual(statuses, targets);
  // ถอยเป็นร่าง/ตีกลับต้องทำได้เสมอ (ดึงกลับ · SO ออก Rev · ตีกลับตอน SO ถูกย้อนอนุมัติ)
  for (const back of ['draft', 'rejected', 'superseded']) assert.ok(!statuses.includes(back), back);
  assert.match(fn, /FROM public\.product_spec_documents d\s+WHERE d\.id = NEW\."documentId"\s+FOR SHARE/);
  assert.match(fn, /v_doc_status IS DISTINCT FROM 'active'[\s\S]*?product_spec_document_not_active/);
  assert.match(fn, /FROM public\.sales_orders o\s+WHERE o\.id = v_order_id\s+FOR SHARE/);
  assert.match(fn, /v_order_status IS DISTINCT FROM 'approved'[\s\S]*?sales_order_not_approved/);
  // store แปลสองข้อความนี้เป็น 409 ภาษาคน (ไม่ใช่ 500 ภาษาอังกฤษ)
  const transition = store.slice(store.indexOf('export async function transitionRevision'), store.indexOf('export async function applyFinalApproval'));
  for (const code0 of ['product_spec_document_not_active', 'sales_order_not_approved']) {
    assert.ok(transition.includes(code0), `transitionRevision ไม่แปล ${code0}`);
  }
});

/* ── ⑨ข checklist ทับทั้งชุดในคำสั่งเดียว ─────────────────────────────── */

test('🔴 checklist ทับทั้งชุดผ่าน RPC เดียว: ล็อกสเปค → ลบ → เขียน · ปิดจาก PUBLIC · ให้ service_role', () => {
  const fn = between(
    'CREATE OR REPLACE FUNCTION public.replace_product_spec_items(',
    'REVOKE ALL ON FUNCTION public.replace_product_spec_items',
  );
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path = public/);
  const lock = fn.indexOf('FROM public.product_specs WHERE id = p_spec_id FOR UPDATE');
  const wipe = fn.indexOf('DELETE FROM public.product_spec_items WHERE "specId" = p_spec_id');
  const write = fn.indexOf('INSERT INTO public.product_spec_items');
  assert.ok(lock > 0 && wipe > lock && write > wipe, 'ต้องล็อกสเปคก่อน แล้วลบ แล้วค่อยเขียน');
  assert.match(fn, /product_spec_not_found/);
  assert.ok(store.includes('product_spec_not_found'), 'store ต้องแปล product_spec_not_found ของ RPC นี้');
  const sig = '(text, jsonb)';
  assert.ok(code.includes(`REVOKE ALL ON FUNCTION public.replace_product_spec_items${sig}\n  FROM PUBLIC, anon, authenticated;`));
  assert.ok(code.includes(`GRANT EXECUTE ON FUNCTION public.replace_product_spec_items${sig}\n  TO service_role;`));
});

test('🪤 คีย์ของแถว checklist ที่ store ส่ง = คอลัมน์ที่ RPC อ่าน (คีย์เกิน = ถูกทิ้งเงียบ · คีย์ขาด = NULL)', () => {
  const body = store.slice(store.indexOf('async function replaceSpecItems'), store.indexOf("rpc('replace_product_spec_items'"));
  const sent = [...body.slice(body.indexOf('items.map(')).matchAll(/^\s+([A-Za-z]+):/gm)].map((m) => m[1]).sort();
  const fn = between('CREATE OR REPLACE FUNCTION public.replace_product_spec_items(', 'REVOKE ALL ON FUNCTION public.replace_product_spec_items');
  const recordset = fn.slice(fn.indexOf('AS r('), fn.indexOf(');', fn.indexOf('AS r(')));
  const read = [...recordset.matchAll(/^\s+"?([A-Za-z]+)"?\s+(?:text|integer|boolean)/gm)].map((m) => m[1]).sort();
  assert.deepEqual(sent, read);
  assert.deepEqual(sent, ['detail', 'id', 'itemKey', 'itemLabel', 'note', 'preparedByCustomer', 'preparedByS', 'sortOrder']);
});

/* ── ⑩ มาตรฐานเอกสาร ──────────────────────────────────────────────── */

test('seed มาตรฐานเอกสาร productSpec แบบเดียวกับ 0226 (WHERE NOT EXISTS · publishedVersionId)', () => {
  assert.ok(DOCUMENT_STANDARD_KEYS.includes('productSpec'));
  assert.match(code, /INSERT INTO public\.document_standards \("documentKey"\)\s+VALUES \('productSpec'\)\s+ON CONFLICT \("documentKey"\) DO NOTHING;/);
  const version = between('INSERT INTO public.document_standard_versions (', ';');
  assert.match(version, /'productSpec', 1, 'published'/);
  assert.match(version, /'FM-SA-04', '00', DATE '2025-05-08', 'teal'/);
  assert.match(version, /WHERE NOT EXISTS \(\s*SELECT 1 FROM public\.document_standard_versions WHERE "documentKey" = 'productSpec'\s*\)/);
  const publish = between('UPDATE public.document_standards', ';');
  assert.match(publish, /"documentKey" = 'productSpec' AND status = 'published'/);
  assert.match(publish, /"publishedVersionId" IS NULL/);
});

test('รูปแบบเลขที่ของ seed ผ่าน validator ของหน้ามาตรฐานเอกสาร (ไม่งั้นแก้ร่างมาตรฐานไม่ได้)', () => {
  const version = between('INSERT INTO public.document_standard_versions (', ';');
  const pattern = version.match(/'(FM-SA-04-\{[^']+)'/)?.[1];
  assert.ok(pattern, 'หา numberingPattern ไม่เจอ');
  const result = validateNumberingPattern(pattern, 'productSpec');
  assert.equal(result.ok, true, result.error);
});

/* ── ⑪ สิทธิ์ ─────────────────────────────────────────────────────── */

test('ตารางใหม่ทุกตัว: RLS · ปิด anon/authenticated · ให้ service_role', () => {
  for (const table of ['product_spec_items', 'product_spec_documents', 'product_spec_document_revisions']) {
    assert.match(code, new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`), `${table} RLS`);
    assert.match(code, new RegExp(`REVOKE ALL ON TABLE public\\.${table}\\s+FROM anon, authenticated`), `${table} revoke`);
    assert.match(code, new RegExp(`GRANT ALL ON TABLE public\\.${table}\\s+TO service_role`), `${table} grant`);
  }
});

test('ทุกตารางใหม่มี COMMENT บอกว่าเป็นของอะไร', () => {
  for (const table of ['product_spec_items', 'product_spec_documents', 'product_spec_document_revisions']) {
    assert.match(code, new RegExp(`COMMENT ON TABLE public\\.${table} IS`), table);
  }
  assert.match(code, /COMMENT ON COLUMN public\.products\.texture IS/);
});

test('มีวิธีย้อนกลับเป็นคอมเมนต์ท้ายไฟล์', () => {
  const tail = sql.slice(sql.lastIndexOf('COMMIT;'));
  assert.match(tail, /ย้อนกลับ/);
  assert.match(tail, /-- DROP TABLE IF EXISTS public\.product_spec_documents;/);
});

test('🪤 ส่วนย้อนกลับต้องรันได้จริง — ไม่มีคำสั่งที่ยามของฐานห้ามอยู่แล้ว', () => {
  const tail = sql.slice(sql.lastIndexOf('COMMIT;'));
  // guard_document_standard_version (0123/0136) ห้ามลบแถวที่เผยแพร่แล้ว — วางลง SQL Editor แล้วล้มกลางบล็อก
  assert.doesNotMatch(tail, /^-- DELETE FROM public\.document_standard_versions/m);
  // entity_number_counter_guard (0241) ห้ามลบถ้าไม่ปลดล็อก · ลบตัวนับที่มีเลขออกไปแล้ว = ออกเลขซ้ำ
  assert.doesNotMatch(tail, /^-- DELETE FROM public\.entity_number_counters/m);
  // ฟังก์ชันทุกตัวที่ไฟล์นี้สร้าง ต้องมีคำสั่งถอดคู่กัน
  for (const fn of [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1])) {
    assert.match(tail, new RegExp(`-- DROP FUNCTION IF EXISTS public\\.${fn}\\(`), fn);
  }
});
