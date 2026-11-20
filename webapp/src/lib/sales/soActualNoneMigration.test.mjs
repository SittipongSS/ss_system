// ── ยาม SQL ของ 0439 · ใบสั่งขาย "ไม่นับ Actual" (มติเจ้าของ 20/11/2026 · docs/so-installment-actual.md หัวข้อ "ไม่นับ Actual (0439)") ──
// ⭐ พฤติกรรมจริงพิสูจน์ด้วย PGlite นอก repo (โหลด schema + 0001–0438 จากไฟล์จริง → รัน 0439 สองรอบ · ดีลเดิมทุกดีลค่าเดิมทุกตัวอักษร ·
//    ตัวห่อ: แบบแปลก/ลืมส่ง/เหตุผลสั้น-ยาว = ไม่มีอะไรถูกเขียน · ไม่นับ = ดีล wonValue 0 · actualByMonth {} · ใบเต็ม+ใบไม่นับ = เฉพาะใบเต็ม ·
//    ใบยอด 0 · ล้างช่องรายงวดที่ยกมา · CHECK none⇔เหตุผล · ย้อนอนุมัติคงแบบ · กลับเป็นร่างล้าง · อนุมัติเต็มไม่เก็บเหตุผล ·
//    ฐานที่ guard ถูกปะทับ = mig_0439_live_drift — 24 ข้อ)
//    — ไฟล์นี้ตรึง "รูป" ที่ห้ามไหลกลับ เพราะ npm test ไม่มีฐาน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { WORKFLOW_ERROR_CODES, documentWorkflowError } from './documentWorkflowErrors.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE = '0439_so_actual_none.sql';
const sqlFiles = () => readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const squeeze = (text) => stripComments(text).replace(/\s+/g, ' ').trim();

const RAW = read(FILE);
const CODE = stripComments(RAW);

function fnBody(text, name) {
  const code = stripComments(text);
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const from = code.lastIndexOf(marker);
  assert.ok(from >= 0, `ไม่มีนิยาม ${name}`);
  const to = code.indexOf('\n$$;', from);
  return code.slice(from, to);
}

const DEAL_FNS = ['_deal_so_actual_extras', 'sync_sales_order_actual', 'enforce_sales_order_actual_on_deal'];

test('0439: สามตัวคิดยอดดีลคัดจาก 0412 ทุกตัวอักษร ยกเว้นตัวกรองแบบ `<> installment` → `= order`', () => {
  const OLD = read('0412_so_installment_actual.sql');
  for (const name of DEAL_FNS) {
    const before = squeeze(fnBody(OLD, name)).replaceAll(`"actualMode" <> 'installment'`, `"actualMode" = 'order'`);
    assert.equal(squeeze(fnBody(RAW, name)), before, name);
    assert.doesNotMatch(fnBody(RAW, name), /"actualMode" <> 'installment'/, `${name}: ใบ none ห้ามถูกบวกเป็นใบเต็ม`);
  }
});

test('0439: นิยามล่าสุดของตัวคิดยอดดีล + guard + ตัวห่ออนุมัติ อยู่ที่ไฟล์นี้ (ไฟล์ใหม่กว่าที่แตะต้องคัดจากที่นี่)', () => {
  for (const name of [...DEAL_FNS, 'sales_order_actual_mode_guard', 'approve_sales_order_with_actual_mode']) {
    const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
    assert.equal(sqlFiles().filter((n) => read(n).includes(marker)).at(-1), FILE, name);
  }
});

test('0439: คอลัมน์เหตุผล + CHECK สองตัว (none ได้เฉพาะใบ pipeline ที่ผ่านอนุมัติ · none ⇔ เหตุผล 10–500)', () => {
  const sq = squeeze(CODE);
  assert.match(sq, /ALTER TABLE public\.sales_orders ADD COLUMN IF NOT EXISTS "actualNoneReason" text;/);
  assert.ok(sq.includes(`ADD CONSTRAINT sales_orders_actual_mode_valid CHECK ( "actualMode" IN ('order', 'installment', 'none') AND ("actualMode" = 'order' OR (origin = 'pipeline' AND status NOT IN ('draft', 'pending_approval', 'rejected'))) );`));
  assert.ok(sq.includes(`ADD CONSTRAINT sales_orders_actual_none_reason CHECK ( CASE WHEN "actualMode" = 'none' THEN char_length(btrim(COALESCE("actualNoneReason", ''))) BETWEEN 10 AND 500 ELSE "actualNoneReason" IS NULL END );`));
});

test('0439: guard — ใบกลับไปก่อนอนุมัติ = แบบเต็ม + ล้างเหตุผล · cache ของ 0412 คงเดิม', () => {
  const guard = squeeze(fnBody(RAW, 'sales_order_actual_mode_guard'));
  assert.ok(guard.includes(`IF NEW.status IN ('draft', 'pending_approval', 'rejected') THEN IF NEW."actualMode" IS DISTINCT FROM 'order' THEN NEW."actualMode" := 'order'; END IF; NEW."actualNoneReason" := NULL; END IF;`));
  assert.ok(guard.includes('FROM public._so_installment_actual_cache(NEW.id, NEW."actualAmount", NEW."totalAmount") c;'));
});

test('0439: ตัวห่ออนุมัติ — 12 พารามิเตอร์ (ตัวเก่าถูก DROP) · ด่านเหตุผลก่อนแตะอะไร · ตั้งแบบ+เหตุผลใน UPDATE เดียว · ล้างงวดรายงวด', () => {
  assert.match(CODE, /DROP FUNCTION IF EXISTS public\.approve_sales_order_with_actual_mode\(text, text, timestamptz, text, text, text, text, text, text, text, text\);/);
  const rpc = squeeze(fnBody(RAW, 'approve_sales_order_with_actual_mode'));
  assert.match(rpc, /p_actual_mode text DEFAULT NULL, p_actual_reason text DEFAULT NULL \)/);
  const order = ['sales_order_actual_mode_invalid', 'sales_order_actual_none_reason_required', 'FOR UPDATE',
    'sales_order_actual_mode_ineligible', 'sales_order_actual_none_ineligible', 'approve_sales_order_with_signature_evidence_atomic('];
  const at = order.map((token) => rpc.indexOf(token));
  assert.ok(at.every((n) => n > 0), at.join(','));
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'ลำดับด่าน: แบบ → เหตุผล → ล็อกใบ → สิทธิ์เลือก → ตัวอนุมัติเดิม');
  assert.ok(rpc.includes(`IF v_mode = 'none' AND char_length(COALESCE(v_reason, '')) NOT BETWEEN 10 AND 500 THEN`));
  assert.ok(rpc.includes(`SET "actualMode" = v_mode, "actualNoneReason" = CASE WHEN v_mode = 'none' THEN v_reason ELSE NULL END`));
  assert.ok(rpc.includes(`IF v_mode IN ('order', 'none') THEN UPDATE public.sales_order_installments SET "actualStatus" = NULL`));
  assert.match(CODE, /REVOKE ALL ON FUNCTION public\.approve_sales_order_with_actual_mode\(text, text, timestamptz, text, text, text, text, text, text, text, text, text\) FROM PUBLIC, anon, authenticated;/);
  assert.match(CODE, /GRANT EXECUTE ON FUNCTION public\.approve_sales_order_with_actual_mode\(text, text, timestamptz, text, text, text, text, text, text, text, text, text\) TO service_role;/);
});

test('0439: ไม่มี DML นอกตัวฟังก์ชัน (ไม่ backfill) · ตรวจท้ายไฟล์สองข้อ · ทรานแซกชันเดียว', () => {
  const outside = CODE.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\$(pre|verify|re)\$[\s\S]*?\$\1\$/g, '');
  assert.doesNotMatch(outside, /^\s*(INSERT|UPDATE|DELETE)\b/im);
  assert.match(CODE, /mig_0439_order_filter_left/);
  // ลายนิ้วมือของตัวที่คัดมา (บทเรียน 0425) — ห้ามถอดด่านนี้ออกตอนแก้ไฟล์
  assert.match(CODE, /md5\(btrim\(regexp_replace\(p\.prosrc, '\\s\+', ' ', 'g'\)\)\) AS h/);
  assert.match(CODE, /mig_0439_live_drift/);
  assert.match(CODE, /mig_0439_rpc_overloads/);
  assert.equal(CODE.split('\nBEGIN;').length - 1, 1);
  assert.equal(CODE.split('\nCOMMIT;').length - 1, 1);
});

test('0439: รหัสใหม่มีข้อความไทย + สถานะ HTTP ในตัวแปลกลาง', () => {
  for (const [code, status] of [['sales_order_actual_none_reason_required', 400], ['sales_order_actual_none_ineligible', 409]]) {
    assert.match(RAW, new RegExp(code));
    assert.ok(WORKFLOW_ERROR_CODES.includes(code), code);
    assert.equal(documentWorkflowError(code).status, status, code);
  }
});
