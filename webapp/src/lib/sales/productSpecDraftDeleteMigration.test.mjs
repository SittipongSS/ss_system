/* ยามกัน "โค้ดกับ migration หลุดจากกัน" ของ **ลบร่าง FM-SA-04** (mig 0375 · มติเจ้าของ 23/09/2569)
 *
 * 🪤 `check:columns` เทียบกับ schema จริงบนฐาน ⇒ บอกได้แค่ว่ารันแล้วหรือยัง ไม่ได้บอกว่าไฟล์
 *    ในรีโปประกาศกติกาครบไหม · 0375 ต้องรันมือก่อน deploy เหมือน 0370 ⇒ ไฟล์นี้คือด่านเดียว
 *    ที่เห็นเนื้อไฟล์ก่อนมีคนวางลง SQL Editor (ด่านคู่ของ productSpecMigration.test.mjs ที่คุม 0370)
 * 🔴 ของที่แพงที่สุดในไฟล์นี้คือ **backfill ที่รันซ้ำแล้วเปลี่ยนความหมายของข้อมูล** — ดูเทสต์
 *    "backfill ผูกกับการสร้างคอลัมน์" ข้างล่าง ซึ่งเป็นด่านของบั๊กที่เคยเขียนพลาดมาแล้วจริง
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { draftDeleteBlock } from './productSpecDocWorkflow.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const sql = read('../../../supabase/migrations/0375_product_spec_document_draft_delete.sql');
const store = read('./productSpecStore.js');

// ตัดคอมเมนต์บรรทัดออก — ส่วนย้อนกลับท้ายไฟล์เป็นคอมเมนต์ที่มีคำสั่ง DROP อยู่ ห้ามนับเป็นโค้ด
const code = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const header = sql.slice(0, sql.indexOf('BEGIN;'));
const body = (from, to) => {
  const start = code.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอ`);
  const end = to ? code.indexOf(to, start + from.length) : code.length;
  assert.ok(end > start, `หา "${to}" ต่อจาก "${from}" ไม่เจอ`);
  return code.slice(start, end);
};
const fn = (name) => body(`CREATE OR REPLACE FUNCTION public.${name}(`, '$$;');

/* ── โครงไฟล์ + หัวไฟล์ ─────────────────────────────────────────────── */

test('ทั้งไฟล์อยู่ในทรานแซกชันเดียว · NOTIFY หลัง COMMIT', () => {
  const begin = code.indexOf('BEGIN;');
  const commit = code.lastIndexOf('COMMIT;');
  assert.ok(begin >= 0 && commit > begin);
  assert.ok(code.indexOf("NOTIFY pgrst, 'reload schema';") > commit);
});

test('หัวไฟล์บอกมติ 23/09/2569 · ต้องรันมือก่อน deploy · เลขที่ไม่นำกลับมาใช้', () => {
  assert.match(header, /23\/09\/2569/);
  assert.match(header, /SQL Editor/);
  assert.match(header, /ก่อน deploy/);
  assert.match(header, /รันซ้ำได้/);
  assert.match(header, /เลขที่ไม่นำกลับมาใช้/);
  // กติกาทั้งข้อในประโยคเดียว — คนอ่านต้องรู้ขอบเขตโดยไม่ต้องไล่โค้ด
  assert.match(header, /ยังไม่เคยยื่น/);
  assert.match(header, /Rev\.00/);
});

/* ── ① คอลัมน์ + backfill ─────────────────────────────────────────── */

test('🔴 backfill ผูกกับ "เพิ่งสร้างคอลัมน์" — ไม่ใช่ WHERE firstSubmittedAt IS NULL', () => {
  /* 🪤 บั๊กที่เคยเขียนพลาดจริง: `ADD COLUMN IF NOT EXISTS` แล้ว `UPDATE … WHERE "firstSubmittedAt"
     IS NULL` เป็นคนละคำสั่ง ⇒ รันไฟล์ซ้ำหลังเปิดใช้จริง = ประทับรอย "เคยยื่น" ให้ร่างที่ยังไม่
     เคยยื่นทุกใบ (หลังรอบแรก แถวที่ยังว่างคือร่างที่ลบได้พอดี) ⇒ ลบไม่ได้ทั้งกอง และซ่อมจาก
     ฝั่งแอปไม่ได้เลยเพราะยามข้อ ③ ห้ามล้างรอยนี้ทุกกรณี */
  const block = body('DO $$', 'END $$;');
  assert.match(block, /IF NOT EXISTS \(\s*SELECT 1 FROM information_schema\.columns/);
  assert.match(block, /column_name = 'firstSubmittedAt'/);
  const addAt = block.indexOf('ADD COLUMN "firstSubmittedAt" timestamptz');
  const fillAt = block.indexOf('SET "firstSubmittedAt" = COALESCE(');
  assert.ok(addAt > 0, 'ต้องสร้างคอลัมน์ในบล็อกเดียวกัน');
  assert.ok(fillAt > addAt, 'backfill ต้องอยู่หลังการสร้างคอลัมน์ ในบล็อกเดียวกัน');
  // นอกบล็อกนี้ต้องไม่มี UPDATE ของคอลัมน์นี้หลงเหลืออยู่เลย
  const outside = code.replace(block, '');
  assert.doesNotMatch(outside, /UPDATE public\.product_spec_document_revisions/);
  // และห้ามกลับไปใช้ตัวกรอง IS NULL เป็นเงื่อนไขของ backfill อีก
  assert.doesNotMatch(code, /SET "firstSubmittedAt" = COALESCE\([\s\S]*?WHERE "firstSubmittedAt" IS NULL/);
});

test('backfill เลือกข้างปลอดภัย: แถวเก่าทุกแถวถือว่าเคยยื่น (ถอยไป createdAt/now)', () => {
  const block = body('DO $$', 'END $$;');
  assert.match(block, /COALESCE\(\s*"submittedAt", "aeApprovedAt", "supApprovedAt", "rejectedAt", "createdAt", now\(\)\s*\)/);
});

test('คอลัมน์มี COMMENT บอกว่าเป็นรอยที่ล้างไม่ได้', () => {
  assert.match(code, /COMMENT ON COLUMN public\.product_spec_document_revisions\."firstSubmittedAt" IS/);
});

/* ── ③ trigger ประทับรอย ───────────────────────────────────────────── */

test('🔴 รอยการยื่นประทับแล้วล้างไม่ได้ แก้ไม่ได้ (ดึงกลับต้องไม่ลบรอย)', () => {
  const stamp = fn('stamp_product_spec_document_revision_submitted');
  // แก้ค่าที่ประทับแล้ว = RAISE · เช็ค TG_OP ก่อนแตะ OLD (INSERT ไม่มี OLD)
  assert.match(stamp, /IF TG_OP = 'UPDATE'\s*\n\s*AND OLD\."firstSubmittedAt" IS NOT NULL/);
  assert.match(stamp, /product_spec_document_revision_submit_mark_immutable/);
  // ประทับทุกสถานะที่ "ยื่นไปแล้วแน่ ๆ" ไม่ใช่แค่ pending_ae
  for (const status of ['pending_ae', 'pending_ae_supervisor', 'approved', 'superseded', 'rejected']) {
    assert.ok(stamp.includes(`'${status}'`), `ขาดสถานะ ${status}`);
  }
  assert.match(stamp, /NEW\."firstSubmittedAt" := COALESCE\(NEW\."submittedAt", now\(\)\)/);
  // ชื่อ trigger ต้องเรียงหลัง `_guard` ตามตัวอักษร ⇒ ยามตรวจก่อน ค่อยประทับ
  assert.ok('product_spec_document_revisions_guard' < 'product_spec_document_revisions_submit_mark');
  assert.match(code, /CREATE TRIGGER product_spec_document_revisions_submit_mark\nBEFORE INSERT OR UPDATE ON public\.product_spec_document_revisions/);
});

/* ── ④ ยาม: เปิดประตูแคบ ๆ เท่านั้น ────────────────────────────────── */

test('🔴 ยามของเอกสาร: ลบได้เมื่อ flag = id ใบนี้ · active · ยังไม่อนุมัติ · ไม่เหลือ Rev', () => {
  const guard = fn('guard_product_spec_document');
  const branch = guard.slice(guard.indexOf("IF TG_OP = 'DELETE'"), guard.indexOf('product_spec_document_delete_forbidden'));
  assert.match(branch, /current_setting\('app\.spec_doc_draft_delete', true\) = OLD\.id/);
  assert.match(branch, /OLD\.status = 'active'/);
  assert.match(branch, /OLD\."currentRevNo" IS NULL/);
  assert.match(branch, /NOT EXISTS \(\s*SELECT 1 FROM public\.product_spec_document_revisions r WHERE r\."documentId" = OLD\.id\s*\)/);
  // กติกาที่เหลือของ 0370 ต้องอยู่ครบ (ไฟล์นี้แก้เฉพาะสาขา DELETE)
  assert.match(guard, /product_spec_document_immutable/);
  assert.match(guard, /product_spec_document_void_final/);
  assert.match(guard, /product_spec_document_rev_backwards/);
});

test('🔴 ยามของ Rev: Rev หายเดี่ยว ๆ ไม่ได้ · ตรวจรอยการยื่นครบทุกช่อง', () => {
  const guard = fn('guard_product_spec_document_revision');
  const branch = guard.slice(guard.indexOf("IF TG_OP = 'DELETE'"), guard.indexOf('product_spec_document_revision_delete_forbidden'));
  assert.match(branch, /current_setting\('app\.spec_doc_draft_delete', true\) = OLD\."documentId"/);
  assert.match(branch, /OLD\."revNo" = 0/);
  assert.match(branch, /OLD\.status = 'draft'/);
  for (const field of ['firstSubmittedAt', 'submittedAt', 'aeApprovedAt', 'supApprovedAt', 'rejectedAt', 'frozenHtml']) {
    assert.match(branch, new RegExp(`OLD\\."${field}"\\s+IS NULL`), `ยามไม่ได้ตรวจ ${field}`);
  }
  // ต้องเป็น Rev เดียวของใบ และเอกสารแม่ต้อง active + ยังไม่อนุมัติ
  assert.match(branch, /r\."documentId" = OLD\."documentId" AND r\.id <> OLD\.id/);
  assert.match(branch, /d\.id = OLD\."documentId" AND d\.status = 'active' AND d\."currentRevNo" IS NULL/);
  // กติกาที่เหลือของ 0370 ยังอยู่
  assert.match(guard, /product_spec_document_revision_frozen_html_write_once/);
  assert.match(guard, /product_spec_document_revision_content_frozen/);
  assert.match(guard, /sales_order_not_approved/);
});

test('🔴 ปิดรูสุดท้าย: constraint trigger แบบ DEFERRED ล้มทั้งก้อนถ้าเอกสารแม่ยังอยู่ตอน COMMIT', () => {
  const orphan = fn('check_product_spec_document_revision_orphan_delete');
  assert.match(orphan, /IF EXISTS \(SELECT 1 FROM public\.product_spec_documents d WHERE d\.id = OLD\."documentId"\)/);
  assert.match(orphan, /product_spec_document_revision_orphan_delete/);
  assert.match(code, /CREATE CONSTRAINT TRIGGER product_spec_document_revisions_orphan_check\nAFTER DELETE ON public\.product_spec_document_revisions\nDEFERRABLE INITIALLY DEFERRED/);
});

/* ── ⑥ RPC ────────────────────────────────────────────────────────── */

test('RPC: SECURITY DEFINER · ปิดจาก PUBLIC/anon/authenticated · ให้ service_role · รับ text', () => {
  const rpc = fn('delete_product_spec_document_draft');
  assert.match(rpc, /SECURITY DEFINER/);
  assert.match(rpc, /SET search_path = public/);
  assert.match(code, /REVOKE ALL ON FUNCTION public\.delete_product_spec_document_draft\(text\)\n  FROM PUBLIC, anon, authenticated;/);
  assert.match(code, /GRANT EXECUTE ON FUNCTION public\.delete_product_spec_document_draft\(text\)\n  TO service_role;/);
  // คีย์ของตารางชุดนี้เป็น text ทั้งระบบ — รับ uuid = เรียกไม่ได้เลย
  assert.match(code, /delete_product_spec_document_draft\(p_document_id text\)/);
});

test('🔴 RPC ล็อก Rev ก่อน แล้วค่อยล็อกเอกสาร (ลำดับเดียวกับทางยื่น = ไม่มีวง deadlock)', () => {
  const rpc = fn('delete_product_spec_document_draft');
  const revLock = rpc.indexOf('FROM public.product_spec_document_revisions\n   WHERE "documentId" = p_document_id\n     FOR UPDATE');
  const docLock = rpc.indexOf('FROM public.product_spec_documents\n   WHERE id = p_document_id\n     FOR UPDATE');
  assert.ok(revLock > 0, 'ต้องล็อกแถว Rev');
  assert.ok(docLock > revLock, 'ต้องล็อกเอกสารหลังล็อก Rev');
  // ตรวจกติกา *หลัง* ได้ล็อกครบ ⇒ คนกดยื่นแทรกกลางถูกเห็นเสมอ
  assert.ok(rpc.indexOf('v_rev."firstSubmittedAt" IS NOT NULL') > docLock);
});

test('🔴 RPC ตรวจซ้ำทุกข้อเอง ไม่เชื่อฝั่งแอป · ปฏิเสธด้วยคำนำหน้าเดียว', () => {
  const rpc = fn('delete_product_spec_document_draft');
  assert.match(rpc, /v_doc\.status <> 'active'/);
  assert.match(rpc, /v_doc\."currentRevNo" IS NOT NULL/);
  assert.match(rpc, /IF v_count <> 1 THEN/);
  assert.match(rpc, /v_rev\."revNo" <> 0 OR v_rev\.status <> 'draft'/);
  for (const field of ['firstSubmittedAt', 'submittedAt', 'aeApprovedAt', 'supApprovedAt', 'rejectedAt', 'frozenHtml']) {
    assert.match(rpc, new RegExp(`v_rev\\."${field}"\\s+IS NOT NULL`), `RPC ไม่ได้ตรวจ ${field}`);
  }
  // ทุกเหตุใช้คำนำหน้าเดียว ⇒ เราต์จับ prefix เดียวแล้วตอบ 409 (ไม่ต้องไล่รหัสรายเหตุ)
  const raises = [...rpc.matchAll(/RAISE EXCEPTION '([a-z_]+):/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(raises)].sort(), [
    'product_spec_document_draft_delete_forbidden', 'product_spec_document_not_found',
  ]);
});

test('🔴 เลขที่ไม่นำกลับมาใช้ — ทั้งไฟล์ต้องไม่แตะตัวนับ', () => {
  assert.doesNotMatch(code, /entity_number_counters/);
});

test('ประตูเปิดเฉพาะในทรานแซกชันนี้ (SET LOCAL) แล้วปิดทันทีหลังใช้', () => {
  const rpc = fn('delete_product_spec_document_draft');
  const open = rpc.indexOf("set_config('app.spec_doc_draft_delete', p_document_id, true)");
  const close = rpc.indexOf("set_config('app.spec_doc_draft_delete', '', true)");
  assert.ok(open > 0 && close > open, 'ต้องเปิดก่อนลบ และปิดหลังลบ');
  const between = rpc.slice(open, close);
  assert.match(between, /DELETE FROM public\.product_spec_document_revisions WHERE id = v_rev\.id/);
  assert.match(between, /DELETE FROM public\.product_spec_documents WHERE id = p_document_id/);
  assert.ok(between.indexOf('product_spec_document_revisions') < between.indexOf('DELETE FROM public.product_spec_documents'),
    'ต้องลบลูกก่อนแม่ (FK เป็น RESTRICT)');
});

test('RPC คืนแถวที่ลบจริง — store ใช้เป็นหลักฐานก่อนตอบว่าสำเร็จ', () => {
  const rpc = fn('delete_product_spec_document_draft');
  assert.match(rpc, /RETURN jsonb_build_object\(\s*'docNo',\s*v_doc\."docNo",\s*'document', to_jsonb\(v_doc\),\s*'revision', to_jsonb\(v_rev\)\s*\)/);
  // ฝั่ง store ต้องไม่ยอมบอกว่า "ลบแล้ว" ถ้าไม่ได้ก้อนนี้
  const call = store.slice(store.indexOf("rpc('delete_product_spec_document_draft'"));
  assert.match(call, /if \(!data\?\.document \|\| !data\?\.revision\)/);
});

/* ── ฝั่งโค้ดกับฝั่งฐานต้องตัดสินด้วยกติกาชุดเดียวกัน ──────────────────── */

test('🔴 ตัวตัดสินฝั่งจอ (draftDeleteBlock) ตรงกับข้อที่ RPC ตรวจ — ร่างเปล่าเท่านั้นที่ลบได้', () => {
  const doc = { status: 'active', currentRevNo: null, docNo: 'FM-SA-04-230969-001' };
  const fresh = {
    revNo: 0, status: 'draft', firstSubmittedAt: null, submittedAt: null,
    aeApprovedAt: null, supApprovedAt: null, rejectedAt: null, frozenAt: null,
  };
  assert.equal(draftDeleteBlock(doc, fresh), null, 'ร่างที่ไม่เคยยื่นต้องลบได้');
  // ทุกช่องรอยการยื่นที่ RPC ตรวจ ฝั่งจอต้องบล็อกเหมือนกัน (frozenAt = ตัวแทนที่อ่านได้ของ frozenHtml)
  for (const field of ['firstSubmittedAt', 'submittedAt', 'aeApprovedAt', 'supApprovedAt', 'rejectedAt', 'frozenAt']) {
    assert.ok(draftDeleteBlock(doc, { ...fresh, [field]: '2026-09-23T02:00:00.000Z' }), `ฝั่งจอไม่บล็อก ${field}`);
  }
  assert.ok(draftDeleteBlock({ ...doc, status: 'void' }, fresh));
  assert.ok(draftDeleteBlock({ ...doc, currentRevNo: 0 }, fresh));
  assert.ok(draftDeleteBlock(doc, { ...fresh, revNo: 1 }));
  assert.ok(draftDeleteBlock(doc, { ...fresh, status: 'rejected' }));
});

/* ── ย้อนกลับ ─────────────────────────────────────────────────────── */

test('มีวิธีย้อนกลับเป็นคอมเมนต์ที่หัวไฟล์ และถอดครบทุกฟังก์ชันที่ไฟล์นี้สร้าง', () => {
  assert.match(header, /Rollback/);
  for (const name of [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1])) {
    // ยามสองตัวของ 0370 ถูก CREATE OR REPLACE ทับ — ย้อนกลับด้วยการรันข้อ ⑧ ของ 0370 ซ้ำ
    if (name.startsWith('guard_product_spec_document')) continue;
    assert.match(header, new RegExp(`-- DROP FUNCTION IF EXISTS public\\.${name}\\(`), name);
  }
  assert.match(header, /รันข้อ ⑧ ของ 0370 ซ้ำ/);
  assert.match(header, /ALTER TABLE public\.product_spec_document_revisions DROP COLUMN IF EXISTS "firstSubmittedAt"/);
});
