// 0395 (รันบน prod 26/09 ภายใต้ชื่อไฟล์ 0390) — ตรวจ "ใบที่อาจซ้ำ" ใต้ล็อกรายลูกค้าในทรานแซกชันของการบันทึก (มติเจ้าของ 26/09 "ปิดขาดใบซ้ำเลย")
// ⭐ migration ปะฟังก์ชันจากนิยามที่รันอยู่จริง (pg_get_functiondef) ด้วยการแทนข้อความ — เทสต์นี้จำลองการปะกับข้อความของ 0374
//   (+ การแทนเงื่อนไขตำแหน่งของ 0382) ⇒ รู้ก่อนรันจริงว่าจุดที่คาดไว้เจอครั้งเดียวพอดี และผลที่ได้อยู่ถูกที่
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORKFLOW_ERROR_CODES, documentWorkflowError } from './documentWorkflowErrors.js';
import { historicalDuplicateMatches } from './historicalDuplicates.js';

const mig = (name) => readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const SQL = mig('0395_historical_so_duplicate_lock.sql');
const M0374 = mig('0374_historical_so_approval_flow.sql');
const M0382 = mig('0382_sales_role_hierarchy.sql');
const count = (text, part) => (part ? text.split(part).length - 1 : 0);

/** เนื้อฟังก์ชัน (ระหว่าง AS $$ … $$;) ของ 0374 — ตัวเดียวกับ prosrc ก่อน 0382 */
function body0374(fn) {
  const start = M0374.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  assert.ok(start >= 0, `หา ${fn} ใน 0374 ไม่เจอ`);
  const open = M0374.indexOf('AS $$', start) + 'AS $$'.length;
  const close = M0374.indexOf('$$;', open);
  return M0374.slice(open, close);
}

/** prosrc ที่รันอยู่จริงหลัง 0382 = 0374 + แทนเงื่อนไขตำแหน่ง (อ่านคู่เก่า/ใหม่จากไฟล์ 0382 เอง) */
function liveBody(fn) {
  let body = body0374(fn);
  const row = new RegExp(`\\('${fn}',\\s*\\$o\\$([\\s\\S]*?)\\$o\\$,\\s*\\$n\\$([\\s\\S]*?)\\$n\\$\\)`);
  const hit = M0382.match(row);
  if (hit) body = body.replace(hit[1], hit[2]);
  return body;
}

/** แถวปะของ 0395 — `('fn', 'part', $o$old$o$, $n$new$n$)` */
const PATCHES = [...SQL.matchAll(/\('([a-z_]+)', '([a-z]+)',\s*\$o\$([\s\S]*?)\$o\$,\s*\$n\$([\s\S]*?)\$n\$\)/g)]
  .map((m) => ({ fn: m[1], part: m[2], old: m[3], neu: m[4] }));

test('0395: รูปไฟล์ — ทรานแซกชันเดียว · ตัวตรวจกลาง · ล็อกรายลูกค้า · ปิดสิทธิ์เรียกตรง · ตรวจท้าย', () => {
  assert.match(SQL, /^BEGIN;$/m);
  assert.match(SQL, /^COMMIT;$/m);
  assert.match(SQL, /CREATE OR REPLACE FUNCTION public\.historical_so_check_duplicates\(\s*p_order_id\s+text,\s*p_customer_id text,\s*p_start\s+date,\s*p_refs\s+text\[\],\s*p_review\s+jsonb\s*\)/);
  assert.match(SQL, /PERFORM pg_advisory_xact_lock\(hashtext\('historical_so_dup:' \|\| p_customer_id\)\);/);
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.historical_so_check_duplicates\(text, text, date, text\[\], jsonb\)\s*FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(SQL, /RAISE EXCEPTION 'historical_so_duplicate_unacknowledged' USING DETAIL = v_missing;/);
  assert.match(SQL, /IF v_create IS DISTINCT FROM 2 OR v_update IS DISTINCT FROM 1 THEN/);
  assert.doesNotMatch(SQL.replace(/--[^\n]*/g, ''), /DROP |ALTER TABLE|DELETE FROM|INSERT INTO/, 'ไม่แตะตาราง/ข้อมูล');
  assert.deepEqual(PATCHES.map((p) => `${p.fn}:${p.part}`), [
    'create_historical_sales_order:check', 'create_historical_sales_order:replay', 'update_historical_sales_order:check',
  ]);
});

test('0395: ข้อความที่ปะลงเนื้อฟังก์ชันคงป้าย `-- 0390:` ตามที่รันบน prod — ตัวตรวจ "ปะไว้แล้ว" เทียบทั้งก้อน', () => {
  // รันจริง 26/09 ในชื่อ 0390 แล้วเปลี่ยนเลขไฟล์ตอน merge · แก้ป้ายในเนื้อที่ปะ = รันซ้ำไม่รู้ว่าปะแล้ว ⇒ ปะทับรอบสอง ⇒ ตรวจท้ายถอยทั้งไฟล์
  assert.equal(PATCHES.length, 3);
  for (const patch of PATCHES) assert.match(patch.neu, /-- 0390: /, `${patch.fn} (${patch.part}) ต้องคงป้าย -- 0390:`);
  assert.match(SQL, /IF strpos\(v_proc\.prosrc, btrim\(r\.new_expr\)\) > 0 THEN v_already/);
});

test('⭐ 0395: จุดที่คาดไว้เจอครั้งเดียวพอดีในนิยามที่รันอยู่ (0374 + 0382) · ปะแล้วได้ตัวตรวจ 2 จุด (สร้าง) · 1 จุด (แก้)', () => {
  const bodies = { create_historical_sales_order: liveBody('create_historical_sales_order'), update_historical_sales_order: liveBody('update_historical_sales_order') };
  assert.match(bodies.create_historical_sales_order, /public\.is_sales_keyer_role\(p_actor_role\)/, 'จำลองการปะของ 0382 ได้จริง');
  for (const patch of PATCHES) {
    assert.equal(count(bodies[patch.fn], patch.old), 1, `${patch.fn} (${patch.part}) ต้องเจอจุดที่คาดไว้ 1 จุด`);
    bodies[patch.fn] = bodies[patch.fn].replace(patch.old, patch.neu);
  }
  const marker = 'public.historical_so_check_duplicates(';
  assert.equal(count(bodies.create_historical_sales_order, marker), 2);
  assert.equal(count(bodies.update_historical_sales_order, marker), 1);
  /* รันซ้ำ: ส่วนที่ปะแล้วมีข้อความใหม่ทั้งก้อน ⇒ migration ข้าม (ไม่ปะซ้อน) */
  for (const patch of PATCHES) assert.ok(bodies[patch.fn].includes(patch.neu.trim()), `${patch.part} ตรวจรันซ้ำได้`);

  const create = bodies.create_historical_sales_order;
  /* ตัวตรวจของการสร้างอยู่ **ก่อนลงฐาน** (ก่อน INSERT ใบ) และหลังรู้วันเริ่มสัญญา + id ของใบนี้ */
  const check = create.indexOf('PERFORM public.historical_so_check_duplicates(v_order_id, v_customer_id, v_start,');
  assert.ok(check > create.indexOf("v_order_id := 'SOR-H'"), 'ต้องรู้ id ของใบนี้ก่อน (ไม่นับใบตัวเอง)');
  assert.ok(check > create.indexOf("v_start := (v_c->>'startDate')::date;"));
  assert.ok(check < create.indexOf('INSERT INTO public.sales_orders'), 'ตรวจก่อนลงฐาน');
  /* ทางส่งซ้ำ: อยู่ใน IF FOUND หลังด่านรหัสการคีย์ชน · ก่อน RETURN ของใบเดิม */
  const replay = create.indexOf("IF jsonb_typeof(p_header->'intake'->'duplicateReview') = 'object' THEN");
  assert.ok(replay > create.indexOf("RAISE EXCEPTION 'historical_so_intake_key_conflict';"));
  assert.ok(replay < create.indexOf("'replayed', true"));
  assert.ok(replay < create.indexOf('-- ④ ล็อกคู่'), 'ทางส่งซ้ำจบใน IF FOUND ก่อนถึงทางสร้างใหม่');
  /* 🐞 รีวิว 26/09: ล็อกแถวใบ (เฉพาะใบร่าง) **ก่อน** ล็อกรายลูกค้าในตัวตรวจ — ลำดับเดียวกับการแก้ใบ ⇒ ไม่มี deadlock ·
     อ่านใบใหม่หลังล็อก · เขียนทับเฉพาะเมื่อวันเริ่ม/เลขเดิมยังเท่าคำขอ (ใบถูกแก้จากที่อื่น = ไม่ทับ) */
  const replayBlock = create.slice(replay, create.indexOf("'replayed', true"));
  const rowLock = replayBlock.indexOf("PERFORM 1 FROM public.sales_orders WHERE id = v_order_id AND status = 'draft' FOR UPDATE;");
  const helperCall = replayBlock.indexOf('PERFORM public.historical_so_check_duplicates(');
  assert.ok(rowLock >= 0 && rowLock < helperCall, 'ล็อกแถวใบก่อนตัวตรวจ (ล็อกรายลูกค้า)');
  assert.ok(replayBlock.indexOf('SELECT * INTO v_existing FROM public.sales_orders WHERE id = v_order_id;') > rowLock, 'อ่านใบใหม่หลังล็อก');
  assert.match(replayBlock, /v_existing\."updatedAt" = v_existing\."createdAt"/, 'ใบที่ถูกแก้หลังสร้างแล้ว = ไม่เขียนทับบันทึกที่ใหม่กว่า');
  assert.match(replayBlock, /to_char\(v_existing\."orderDate", 'YYYY-MM-DD'\) IS NOT DISTINCT FROM NULLIF\(btrim\(COALESCE\(p_contract->>'startDate', ''\)\), ''\)/,
    'เทียบวันที่ไม่ขึ้นกับ DateStyle');
  for (const col of ['historicalQuoteRef', 'historicalExpressRef', 'historicalInvoiceRef']) {
    assert.ok(replayBlock.includes(`v_existing."${col}" IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(p_header->>'${col}', '')), '')`), col);
  }
  assert.match(replayBlock, /WHERE id = v_order_id AND status = 'draft'\s*RETURNING \* INTO v_existing;/);
  /* ทางสร้างใหม่: ตัวตรวจอยู่หลังล็อกคู่ลูกค้า×AE (ใบยังไม่มีแถว) — แถวใบของคำขออื่นไม่ถูกแตะหลังถือล็อกรายลูกค้า */
  assert.ok(check > create.indexOf('-- ④ ล็อกคู่'));
  const update = bodies.update_historical_sales_order;
  const upCheck = update.indexOf('PERFORM public.historical_so_check_duplicates(v_order.id, v_order."customerId", v_start,');
  assert.ok(upCheck > update.indexOf('FOR UPDATE'), 'ล็อกแถวของใบตัวเองก่อน แล้วค่อยล็อกรายลูกค้า (ลำดับล็อกเดียวทุกเส้น)');
  assert.ok(upCheck < update.indexOf('UPDATE public.sales_orders SET'), 'ตรวจก่อนเขียนทับ');
});

test('0395: กติกาจับคู่ของ SQL = ของ JS (historicalDuplicateMatches) — ใบย้อนหลัง · ลูกค้าเดียวกัน · ไม่ใช่ใบนี้ · ไม่ยกเลิก · วันเริ่ม/เลขเดิม', () => {
  const helper = SQL.slice(SQL.indexOf('CREATE OR REPLACE FUNCTION public.historical_so_check_duplicates'), SQL.indexOf('REVOKE ALL ON FUNCTION'));
  for (const piece of [
    "o.origin = 'historical'", 'o."customerId" = p_customer_id', 'o.id IS DISTINCT FROM p_order_id',
    "o.status IS DISTINCT FROM 'cancelled'", 'o."orderDate" = p_start',
    'lower(btrim(COALESCE(o."historicalQuoteRef", \'\'))) = ANY (v_refs)',
    'lower(btrim(COALESCE(o."historicalExpressRef", \'\'))) = ANY (v_refs)',
    'lower(btrim(COALESCE(o."historicalInvoiceRef", \'\'))) = ANY (v_refs)',
    'AND NOT (o.id = ANY (v_acked))', "COALESCE(array_agg(DISTINCT lower(btrim(r))), '{}'::text[])",
  ]) assert.ok(helper.includes(piece), `SQL ต้องมี ${piece}`);
  /* เลขเดิมว่างไม่นับ (JS: historicalRefsOf ตัดค่าว่าง) */
  assert.ok(helper.includes("WHERE NULLIF(btrim(r), '') IS NOT NULL"));
  /* JS ฝั่งเดียวกัน: ตัดช่องว่าง + ไม่สนตัวพิมพ์ · ยกเลิกแล้วไม่นับ · ใบนี้ไม่นับ */
  const rows = [
    { id: 'A', orderDate: '2026-01-01', status: 'draft' },
    { id: 'B', orderDate: '2025-01-01', status: 'approved', historicalExpressRef: ' EX-9 ' },
    { id: 'C', orderDate: '2026-01-01', status: 'cancelled' },
    { id: 'SELF', orderDate: '2026-01-01', status: 'draft' },
  ];
  assert.deepEqual(historicalDuplicateMatches({ rows, selfOrderId: 'SELF', startDate: '2026-01-01', refs: ['ex-9'] }).map((r) => r.id), ['A', 'B']);
});

test('0395: รหัสที่ RPC โยนได้ข้อความไทย + 409 (route แปลเป็น 409 พร้อมรายการใหม่เอง — ตารางนี้คือสำรอง)', () => {
  const runtime = SQL.slice(SQL.indexOf('CREATE OR REPLACE FUNCTION'), SQL.indexOf('DO $patch$'));
  const raised = new Set([...runtime.matchAll(/RAISE EXCEPTION '([a-z0-9_]+)/g)].map((m) => m[1]));
  assert.deepEqual([...raised], ['historical_so_duplicate_unacknowledged']);
  assert.ok(WORKFLOW_ERROR_CODES.includes('historical_so_duplicate_unacknowledged'));
  assert.equal(documentWorkflowError({ message: 'historical_so_duplicate_unacknowledged' }).status, 409);
});
