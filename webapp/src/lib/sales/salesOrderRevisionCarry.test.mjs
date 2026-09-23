import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { paidThrough } from './paymentCoverage.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const mig = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const MARKER = 'CREATE OR REPLACE FUNCTION public.revise_approved_sales_order_atomic';

/* นิยามล่าสุดของ RPC ทอด SO → SO Rev. — ไฟล์นี้เป็นตัวที่ฐานจริงใช้อยู่
   🐞 เดิมยามนี้ตั้ง LATEST = 0346 ทั้งที่ 0363 เขียนฟังก์ชันทับไปแล้ว ⇒ ยามตรวจไฟล์เก่าแล้วเขียวเสมอ
   ⇒ รอบนี้ **ตรึงด้วยการสแกน** ด้วย (เทสต์แรกข้างล่าง): ไฟล์ใหม่ที่เขียนฟังก์ชันทับโดยไม่ย้าย LATEST = แดงทันที
   ⚠️ ย้ายไป migration ใหม่เมื่อไร **ต้องมาแก้ที่นี่ด้วย** */
const LATEST = '0376_so_revision_moves_installments.sql';
/* ตัวก่อนหน้าที่ 0376 ต้องคัดมา "ทุกตัวอักษร" ยกเว้นก้อนงวดชำระกับ RETURN */
const PREVIOUS = '0363_sales_order_delivery_due_date.sql';

const fnText = (sql) => {
  const from = sql.lastIndexOf(MARKER);
  assert.ok(from >= 0, 'หานิยาม revise_approved_sales_order_atomic ไม่เจอ');
  const to = sql.indexOf('\n$$;', from);
  assert.ok(to > from, 'หาปลายนิยามไม่เจอ');
  return sql.slice(from, to);
};
const sql = mig(LATEST);
const rpc = fnText(sql);
const code = rpc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

/* ⭐ ก้อนที่ 0376 แทนที่ — ตั้งแต่หลังด่าน "ต้องมีบรรทัด" ถึงก่อนตีตรา revised บนใบเดิม */
const LINES_GUARD_END = "RAISE EXCEPTION 'sales_order_revision_lines_required';\n  END IF;\n";
const SOURCE_STAMP = '  UPDATE public.sales_orders\n  SET\n    status = \'revised\',';
const RETURN_AT = '  RETURN jsonb_build_object(';
const parts = (text) => {
  const a = text.indexOf(LINES_GUARD_END);
  const b = text.indexOf(SOURCE_STAMP);
  const c = text.indexOf(RETURN_AT);
  assert.ok(a > 0 && b > a && c > b, 'หาจุดแบ่งก้อนของฟังก์ชันไม่เจอ');
  return {
    head: text.slice(0, a + LINES_GUARD_END.length),
    block: text.slice(a + LINES_GUARD_END.length, b),
    stamp: text.slice(b, c),
    ret: text.slice(c),
  };
};

/* ⚠️ นับเฉพาะ **นิยาม** (CREATE [OR REPLACE] FUNCTION) หลังตัดคอมเมนต์ — review F3: สแกนแบบ includes('FUNCTION public.…')
   ติด REVOKE/GRANT/COMMENT ON FUNCTION ด้วย ⇒ migration ที่แค่ถอนสิทธิ์ anon (งานค้าง "anon เรียก RPC ได้") ทำยามนี้แดง
   แล้วถ้าย้าย LATEST ตามคำบอก fnText หานิยามไม่เจอ (ไฟล์นั้นไม่มีนิยาม) */
const definesFunction = (sqlText, fn) => new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fn}\\s*\\(`, 'i')
  .test(sqlText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, ''));

test('ตัวสแกนเจ้าของนิยามนับเฉพาะ CREATE FUNCTION — ไม่ติด COMMENT/REVOKE/GRANT ON FUNCTION หรือคอมเมนต์', () => {
  const fn = 'revise_approved_sales_order_atomic';
  assert.equal(definesFunction(`CREATE OR REPLACE FUNCTION public.${fn}(p text)`, fn), true);
  assert.equal(definesFunction(`create function public.${fn} (p text)`, fn), true);
  assert.equal(definesFunction(`COMMENT ON FUNCTION public.${fn}(text) IS 'x';`, fn), false);
  assert.equal(definesFunction(`REVOKE ALL ON FUNCTION public.${fn}(text) FROM anon;`, fn), false);
  assert.equal(definesFunction(`GRANT EXECUTE ON FUNCTION public.${fn}(text) TO service_role;`, fn), false);
  assert.equal(definesFunction(`-- CREATE OR REPLACE FUNCTION public.${fn}(`, fn), false);
});

test('LATEST คือไฟล์สุดท้ายที่เขียน revise_approved_sales_order_atomic ทับ (ยามไม่ตรวจไฟล์เก่า)', () => {
  const owners = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort()
    .filter((name) => definesFunction(mig(name), 'revise_approved_sales_order_atomic'));
  assert.equal(owners[owners.length - 1], LATEST);
});

/* 🔴 หลักการ "เงินหนึ่งก้อน = งวดหนึ่งแถว" (แผน so-payment-unlock-replan PR1 · มติเจ้าของ 23/09)
   🐞 0346–0363 **ก๊อป** งวดเป็นแถวใหม่สถานะ pending ⇒ งวดที่บัญชีรับรองแล้วบนใบเดิมกลายเป็นงวดค้างรับบนใบ Rev.
     ⇒ ต้องแจ้ง+รับรองสลิปเดิมซ้ำ = เงินก้อนเดียวสองแถว (เหตุที่ย้อนการอนุมัติเคยถูกล็อกไว้ทั้งหมด)
   ⇒ 0376 **ย้ายแถวเดิม** ไปใบ Rev. — id/สถานะ/เงิน/หลักฐาน/ใบกำกับ/คำร้อง/ช่วงครอบคงเดิม */
test('🔴 RPC ออก Rev. ย้ายแถวงวดเดิมไปใบ Rev. — ไม่มี INSERT แถวที่สอง', () => {
  assert.doesNotMatch(code, /INSERT INTO public\.sales_order_installments/,
    'ก๊อปงวดเป็นแถวใหม่ = เงินก้อนเดียวสองแถว');
  assert.match(code, /UPDATE public\.sales_order_installments\s+SET\s+"salesOrderId" = v_revision\.id,/);
});

test('🔴 ย้ายทุกสถานะ — WHERE มีแต่ใบต้นทาง ไม่กรองสถานะ', () => {
  const update = code.slice(code.indexOf('UPDATE public.sales_order_installments'));
  const where = update.slice(update.indexOf('WHERE'), update.indexOf(';'));
  assert.match(where, /^WHERE "salesOrderId" = v_source\.id\s*$/,
    'กรองสถานะเมื่อไร งวดที่รับเงินแล้ว/รอบัญชีตรวจจะค้างอยู่กับใบที่ตายแล้ว');
});

test('🔴 ช่องเงินของแถวห้ามถูกแตะ — SET ได้แค่ salesOrderId · movedFrom · updatedAt', () => {
  const update = code.slice(code.indexOf('UPDATE public.sales_order_installments'));
  const set = update.slice(update.indexOf('SET') + 3, update.indexOf('WHERE'));
  const assigned = [...set.matchAll(/(?:^|,)\s*("?[A-Za-z]+"?)\s*=(?!=)/g)].map((m) => m[1].replace(/"/g, ''));
  assert.deepEqual(assigned, ['salesOrderId', 'movedFrom', 'updatedAt']);
  for (const col of ['status', 'amount', 'percent', 'seq', 'frozenAt', 'evidence', 'paidOn', 'reportedAt', 'confirmedAt',
    'taxInvoiceNo', 'taxInvoiceFile', 'billingRequestId', 'coversFrom', 'coversTo', 'kind']) {
    assert.ok(!new RegExp(`"?${col}"?\\s*=`).test(set), `ห้าม SET ${col} — ยอด/หลักฐาน/ใบกำกับของแถวที่มีเงินต้องคงเดิม`);
  }
});

test('movedFrom ต่อท้ายร่องรอยว่าย้ายมาจากใบไหน ใครย้าย เมื่อไร (ไม่ทับของเดิม)', () => {
  assert.match(code, /"movedFrom" = "movedFrom" \|\| jsonb_build_array\(jsonb_build_object\(/);
  for (const [key, value] of [
    ['salesOrderId', 'v_source.id'], ['orderNumber', 'v_source."orderNumber"'], ['quotationId', 'v_source."quotationId"'],
    ['reason', "'revision'"], ['movedAt', 'v_now'], ['byId', 'p_actor_id'],
  ]) {
    assert.ok(code.includes(`'${key}', ${value}`), `movedFrom ต้องมี ${key}`);
  }
  assert.match(code, /'byName', NULLIF\(btrim\(COALESCE\(p_actor_name, ''\)\), ''\)/);
  assert.match(code, /"updatedAt" = v_now/);
});

/* หลักการ "Σ งวด = ยอดใบ" — ย้ายชุดที่ไม่เท่ายอดใบ = ใบ Rev. เกิดมาพร้อมแผนที่ผิด แล้ว freeze ไม่แก้ให้ (PR0) */
test('🔴 ด่าน Σ งวด ≠ ยอดใบ: ล็อกแถวก่อน แล้ว RAISE ก่อนย้าย', () => {
  const lock = code.search(/PERFORM 1 FROM public\.sales_order_installments inst\s+WHERE inst\."salesOrderId" = v_source\.id\s+FOR UPDATE;/);
  const raise = code.indexOf("RAISE EXCEPTION 'sales_order_revision_installments_mismatch'");
  const move = code.indexOf('UPDATE public.sales_order_installments');
  assert.ok(lock > 0, 'ต้องล็อกงวดของใบต้นทางก่อน (PATCH ที่มาแทรกกลางการย้ายต้องรอ)');
  assert.ok(raise > lock && raise < move, 'ด่านยอดรวมต้องอยู่ระหว่างล็อกกับการย้าย');
  assert.match(code, /IF FOUND AND abs\(/, 'ใบที่ไม่มีงวด (ใบก่อน 0245) ต้องผ่านได้');
  assert.match(code, />= 0\.005 THEN/);
  assert.match(code, /v_source\."totalAmount"/);
});

test('RETURN บอกผลการย้าย (moved) ให้ route ทำสรุป audit — นับจากแถวที่อยู่บนใบ Rev. จริง', () => {
  const { ret } = parts(rpc);
  assert.match(ret, /'moved', \(/);
  for (const key of ['count', 'confirmedCount', 'confirmedAmount', 'reportedCount', 'reportedAmount', 'openAmount']) {
    assert.ok(ret.includes(`'${key}',`), `moved ต้องมี ${key}`);
  }
  assert.match(ret, /WHERE inst\."salesOrderId" = v_revision\.id/);
});

/* 🪤 RPC ตัวนี้ถูกเขียนทับมาแล้วหกรอบ (0161 → 0166 → 0326 → 0340 → 0343 → 0346 → 0363) ทุกรอบคัดทั้งก้อน
   ⇒ รอบนี้ตรึงว่า **นอกจากก้อนงวดกับ RETURN แล้ว ทุกตัวอักษรเท่า 0363** — ก้อนที่รอบก่อน ๆ เติมไว้หลุดไม่ได้ */
test('🪤 นอกจากก้อนงวดชำระและ RETURN — ทุกตัวอักษรเท่านิยามใน 0363', () => {
  const now = parts(rpc);
  const before = parts(fnText(mig(PREVIOUS)));
  assert.equal(now.head, before.head, 'หัวฟังก์ชันถึงด่านบรรทัดขายต้องคัดมาทุกตัวอักษร');
  assert.equal(now.stamp, before.stamp, 'ตีตรา revised บนใบเดิมต้องคัดมาทุกตัวอักษร');
  assert.ok(now.ret.startsWith("  RETURN jsonb_build_object(\n    'source', to_jsonb(v_source),\n    'revision', to_jsonb(v_revision),"),
    'source/revision ของ RETURN เดิมต้องอยู่ครบ');
  assert.match(before.block, /INSERT INTO public\.sales_order_installments/, 'ก้อนเดิมของ 0363 คือก้อนที่ก๊อปงวด');
});

test('🪤 คอลัมน์ที่ migration รอบก่อน ๆ เติมไว้ ต้องยังถูกก๊อปอยู่', () => {
  for (const col of [
    '"deliveryDueDate"',     // 0363 — กำหนดส่งสินค้า
    '"serviceContractId"',   // 0340 — ใบบริการผูกสัญญาไว้แล้ว
    '"docLanguage"',         // 0340 — ภาษาเอกสาร
    '"confirmAttachments"',  // 0340 — หลักฐานยืนยันคำสั่งซื้อ
    '"customerNameEn"',      // 0343 — ชื่ออังกฤษ
    '"serviceRounds"',       // 0326 — จำนวนรอบขายรายบรรทัด
  ]) {
    assert.ok(rpc.includes(col), `${col} หลุดจาก RPC — Rev. จะทิ้งค่านั้นเงียบ ๆ`);
  }
});

test('คอลัมน์ movedFrom: jsonb NOT NULL ค่าตั้งต้นอาเรย์ว่าง + CHECK ว่าเป็นอาเรย์ (รันซ้ำได้)', () => {
  assert.match(sql, /ALTER TABLE public\.sales_order_installments\s+ADD COLUMN IF NOT EXISTS "movedFrom" jsonb NOT NULL DEFAULT '\[\]'::jsonb;/);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS sales_order_installments_moved_from_array;/);
  assert.match(sql, /ADD CONSTRAINT sales_order_installments_moved_from_array CHECK \(jsonb_typeof\("movedFrom"\) = 'array'\)/);
});

test('🔐 ลายเซ็นเดิม · REVOKE จาก PUBLIC/anon/authenticated · GRANT service_role เท่านั้น', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.revise_approved_sales_order_atomic\(\s*text, text, timestamptz, text, text, text, text\s*\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.revise_approved_sales_order_atomic\(\s*text, text, timestamptz, text, text, text, text\s*\) TO service_role;/);
  assert.doesNotMatch(sql, /GRANT EXECUTE[^;]*TO (anon|authenticated)/);
});

test('⛔ ไม่ backfill · ไม่แตะ trigger · ไม่นิยามฟังก์ชันอื่น (ยามตัวอื่นอ่านนิยามล่าสุดตามชื่อไฟล์)', () => {
  const body = sql.replace(/--[^\n]*/g, '');
  const outside = body.replace(/\$\$[\s\S]*?\$\$/g, '');
  assert.doesNotMatch(outside, /^\s*(UPDATE|INSERT|DELETE)\b/m, 'นอกตัวฟังก์ชันห้ามเขียนข้อมูล');
  assert.doesNotMatch(body, /TRIGGER/i);
  const fns = [...sql.matchAll(/FUNCTION public\.([a-z_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(fns)], ['revise_approved_sales_order_atomic']);
});

test('หัวไฟล์มีบล็อกลองจริงที่จบด้วย ROLLBACK', () => {
  const header = sql.slice(0, sql.indexOf('\nBEGIN;'));
  assert.match(header, /--\s+BEGIN;/);
  assert.match(header, /--\s+ROLLBACK;/);
});

/* 🔑 ช่วงครอบบริการคือหัวใจของด่านเงินนัดบริการ — ย้ายทั้งแถวแล้ว coversTo ของงวดที่รับรองแล้ว
   ไปอยู่กับใบ Rev. ครบ ⇒ `paidThrough` ของใบ Rev. เท่าของใบเดิมทันทีที่ Rev. อนุมัติ */
test('🔑 เหตุผลของการย้ายทั้งแถว: paidThrough นับเฉพาะงวดที่ confirmed และมี coversTo', () => {
  assert.equal(paidThrough([{ status: 'confirmed', coversTo: null }]), null);
  assert.equal(paidThrough([{ status: 'pending', coversTo: '2026-12-31' }]), null,
    'ก๊อปเป็น pending (0346–0363) = จ่ายถึงว่างจนกว่าบัญชีรับรองสลิปเดิมซ้ำ');
  assert.equal(paidThrough([{ status: 'confirmed', coversTo: '2026-12-31' }]), '2026-12-31');
});
