// ── ยาม SQL ของ 0378 · ยกเลิกใบที่มีเงินรับแล้ว + เงินค้าง (PR3 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09 D4) ──────
// ⭐ พฤติกรรมจริงพิสูจน์ด้วย PGlite ใน scratch (โหลด schema + 0001–0378 · ยกเงินสำเร็จ/ปฏิเสธ · CHECK คืนเงิน)
//    ไฟล์นี้ตรึง "รูป" ที่ห้ามไหลกลับ เพราะ npm test ไม่มีฐาน:
//    · ยกเงินได้เฉพาะ "ดีลเดียวกัน" (D4) จากใบ pipeline ที่ยกเลิก เข้าใบ pipeline ที่อนุมัติ ยังไม่ถูกแทน บัญชียังไม่ปิด
//    · แถวที่ยกคงช่องเงินทุกช่อง (ย้ายด้วย UPDATE — ห้าม INSERT แถวที่สอง) · ต่อท้าย movedFrom ด้วย reason 'carry'
//    · แผนของใบปลายทางเขียนผ่านแกนของ 0377 ตัวเดียว (แถวล็อกห้ามเปลี่ยน · Σ = ยอดใบ)
//    · งานงวดไม่เขียน sales_orders/quotations/sales_order_lines (Actual/เดือน Actual ไม่ขยับ)
//    · คืนเงิน = แถว confirmed เท่านั้น · มีใบกำกับต้องมีเลขใบลดหนี้ · ล้างการคืน = ล้างทุกช่อง
// ⚠️ อ่าน source เป็นสตริง (ตัดคอมเมนต์ก่อน) ⇒ พิสูจน์แค่ "รูปนี้ยังอยู่" — ของจริงอยู่ที่ PGlite
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { WORKFLOW_ERROR_CODES } from './documentWorkflowErrors.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const mig = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const FILE = '0378_so_cancelled_money.sql';
const sql = mig(FILE);
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const code = stripComments(sql);

const fnBody = (name) => {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const from = code.indexOf(marker);
  assert.ok(from >= 0, `หานิยาม ${name} ไม่เจอ`);
  const to = code.indexOf('\n$$;', from);
  assert.ok(to > from, `หาปลายนิยาม ${name} ไม่เจอ`);
  return code.slice(from, to);
};
const RPC = fnBody('carry_sales_order_installments');

test('0378 เป็นไฟล์สุดท้ายที่นิยาม carry_sales_order_installments · ลายเซ็นตามแผน', () => {
  /* ⚠️ นับเฉพาะนิยาม (CREATE [OR REPLACE] FUNCTION) หลังตัดคอมเมนต์ — review F3: REVOKE/GRANT/COMMENT ON FUNCTION ไม่ใช่นิยาม */
  const owners = readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()
    .filter((n) => /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.carry_sales_order_installments\s*\(/i.test(stripComments(mig(n))));
  assert.equal(owners[owners.length - 1], FILE, 'ถูกเขียนทับในไฟล์ใหม่ — ย้ายยามนี้ตามไป');
  assert.match(code, /CREATE OR REPLACE FUNCTION public\.carry_sales_order_installments\(\s*p_source_order_id text,\s*p_target_order_id text,\s*p_installment_ids text\[\],\s*p_target_rows jsonb,\s*p_expected jsonb,\s*p_reason text,\s*p_actor_id text,\s*p_actor_name text,\s*p_actor_role text\s*\)\s*RETURNS jsonb/);
  // 0378 ไม่เขียนทับแกนของ 0377 — ใช้ตัวเดียวกับปรับแผน
  assert.doesNotMatch(code, /FUNCTION public\._so_installments_write_plan\(/);
  assert.doesNotMatch(code, /FUNCTION public\.revise_approved_sales_order_atomic\(/);
});

test('ด่านลำดับรัน: ต้องมี movedFrom (0376) และแกนเขียนแผน (0377) ก่อน — ไม่งั้นหยุดทั้งไฟล์', () => {
  const guard = code.slice(0, code.indexOf('ALTER TABLE'));
  assert.match(guard, /information_schema\.columns[\s\S]*'movedFrom'/);
  assert.match(guard, /to_regprocedure\('public\._so_installments_write_plan\(text, jsonb, timestamptz, text, text\)'\)/);
  assert.match(guard, /RAISE EXCEPTION 'mig_0378_requires_0376_0377'/);
});

/* 🔴 หลักการของแผน: งานงวดไม่มีขั้นใดเขียน sales_orders / quotations / sales_order_lines */
test('🔴 RPC ไม่เขียน sales_orders · quotations · sales_order_lines และไม่เอ่ยถึงยอด/เดือน Actual/แผนของ QT', () => {
  assert.doesNotMatch(RPC, /(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(public\.)?(sales_orders|quotations|sales_order_lines)\b/i);
  assert.doesNotMatch(RPC, /actualAmount|approvedAt|paymentPlan/);
  assert.match(RPC, /FROM public\.sales_orders o\s+WHERE o\.id IN \(p_source_order_id, p_target_order_id\)\s+ORDER BY o\.id\s+FOR UPDATE;/,
    'ล็อกสองใบตามลำดับ id (กัน deadlock) — อ่านอย่างเดียว');
});

test('ต้นทาง = ใบ pipeline ที่ยกเลิก · ปลายทาง = ใบ pipeline อนุมัติ ยังไม่ถูกแทน ยอด > 0 · บัญชียังไม่ปิด · ดีลเดียวกัน (D4)', () => {
  const role = RPC.indexOf("COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin', 'finance')");
  assert.ok(role > 0 && role < RPC.indexOf('FOR UPDATE'), 'ด่านสิทธิ์มาก่อนล็อก');
  assert.match(RPC, /RAISE EXCEPTION 'installment_carry_forbidden'/);
  // `origin = 'pipeline'` ตรงตัว — ยาม historicalSalesOrderMigration ไล่หาตัวกรองนี้ในทุกฟังก์ชันที่อ่านใบ approved
  assert.match(RPC, /NOT COALESCE\(v_target\.origin = 'pipeline', false\)\s+OR v_target\.status IS DISTINCT FROM 'approved'\s+OR v_target\."supersededById" IS NOT NULL\s+OR COALESCE\(v_target\."totalAmount", 0\) <= 0 THEN\s+RAISE EXCEPTION 'installment_carry_target_invalid'/);
  assert.match(RPC, /v_target\."financeStatus" IS NOT DISTINCT FROM 'approved' THEN\s+RAISE EXCEPTION 'installment_carry_finance_closed'/);
  assert.match(RPC, /NOT COALESCE\(v_source\.origin = 'pipeline', false\)\s+OR v_source\.status IS DISTINCT FROM 'cancelled' THEN\s+RAISE EXCEPTION 'installment_carry_source_invalid'/);
  assert.match(RPC, /v_source\."dealId" IS NULL OR v_source\."dealId" IS DISTINCT FROM v_target\."dealId" THEN\s+RAISE EXCEPTION 'installment_carry_cross_deal'/,
    'D4: ยกได้เฉพาะดีลเดียวกัน — ข้ามดีล (แม้นิติบุคคลเดียวกัน) ไม่ได้');
  assert.match(RPC, /length\(v_reason\) NOT BETWEEN 10 AND 500 THEN\s+RAISE EXCEPTION 'workflow_reason_invalid'/);
});

test('แถวที่ยก: ของใบต้นทาง · confirmed/reported · ยังไม่คืนเงิน · ไม่ซ้ำ — ไม่งั้น installment_carry_row_invalid', () => {
  assert.match(RPC, /i\.id = ANY \(v_ids\) AND i\."salesOrderId" = v_source\.id\s+AND i\.status IN \('confirmed', 'reported'\) AND i\."refundedAt" IS NULL\) <> cardinality\(v_ids\)/);
  assert.match(RPC, /RAISE EXCEPTION 'installment_carry_row_invalid'/);
  assert.match(RPC, /cardinality\(v_ids\) <> cardinality\(p_installment_ids\)/, 'id ซ้ำ/ว่างในคำขอ = ปฏิเสธ');
});

test('p_expected ครบทุกแถวของใบปลายทาง + แถวที่ยก และ updatedAt ตรงทุกแถว (ล็อกแถวก่อนตรวจ) ไม่งั้น workflow_stale', () => {
  const lockRows = RPC.indexOf('PERFORM 1 FROM public.sales_order_installments i');
  const expected = RPC.indexOf('jsonb_array_length(p_expected)');
  const move = RPC.indexOf('SET "salesOrderId" = v_target.id');
  assert.ok(lockRows > 0 && expected > lockRows && move > expected, 'ล็อกแถว → ตรวจ p_expected → ย้าย');
  assert.match(RPC, /WHERE i\."salesOrderId" IN \(v_source\.id, v_target\.id\)/);
  assert.match(RPC, /\(i\."salesOrderId" = v_target\.id OR i\.id = ANY \(v_ids\)\)/);
  assert.match(RPC, /\(x\.e->>'updatedAt'\)::timestamptz = i\."updatedAt"/);
  assert.match(RPC, /RAISE EXCEPTION 'workflow_stale'/);
});

test('ยกเกินยอดใบ (แถวล็อกของปลายทาง + แถวที่ยก > ยอดใบ) = installment_carry_overpaid ก่อนแตะแถวใด', () => {
  const over = RPC.indexOf("RAISE EXCEPTION 'installment_carry_overpaid'");
  assert.ok(over > 0 && over < RPC.indexOf('SET "salesOrderId" = v_target.id'), 'ตรวจก่อนย้าย');
  assert.match(RPC, /v_locked \+ v_carried - v_target\."totalAmount" >= 0\.005/);
  assert.match(RPC, /public\._so_installment_replan_locked\(i\.status, i\."taxInvoiceNo", i\."billingRequestId",\s+i\.kind, i\.evidence, i\."paidOn"\)/,
    'แถวล็อกของปลายทางตัดสินด้วยตัวเดียวกับปรับแผน (0377)');
});

/* 🔴 review MONEY-1: เงินก้อนเดียวนับสองครั้ง — ใบปลายทางมีงวดแจ้ง/รับรองแล้ว (ยังไม่คืน) ที่เป็นเงินก้อนเดียวกับแถวที่ยก
   (วันจ่าย + ยอดตรงกัน · หรือสลิปไฟล์เดียวกัน) ⇒ RAISE installment_carry_duplicate ก่อนแตะแถวใด (เกณฑ์เดียวกับ applyCarryIn) */
test('🔴 ยกซ้ำกับงวดที่แจ้ง/รับรองแล้วของใบปลายทาง (วันจ่าย+ยอด · สลิปไฟล์เดียวกัน) = installment_carry_duplicate ก่อนย้าย', () => {
  const dup = RPC.indexOf("RAISE EXCEPTION 'installment_carry_duplicate'");
  assert.ok(dup > 0 && dup < RPC.indexOf('SET seq = i.seq + 1000') && dup < RPC.indexOf('SET "salesOrderId" = v_target.id'),
    'ตรวจก่อนหลบเลข/ย้าย');
  assert.ok(dup > RPC.indexOf('FOR UPDATE;', RPC.indexOf('PERFORM 1 FROM public.sales_order_installments i')), 'ตรวจใต้ล็อกแถว');
  const block = RPC.slice(RPC.lastIndexOf('v_dup :=', dup), dup);
  assert.match(block, /t\."salesOrderId" = v_target\.id/);
  assert.match(block, /t\.status IN \('confirmed', 'reported'\)/);
  assert.match(block, /t\."refundedAt" IS NULL/);
  assert.match(block, /c\.id = ANY \(v_ids\)/);
  assert.match(block, /c\."paidOn" IS NOT NULL AND c\."paidOn" = t\."paidOn" AND c\.amount = t\.amount/, 'วันจ่าย + ยอดตรงกัน');
  assert.match(block, /->>'storagePath'/, 'สลิปไฟล์เดียวกัน');
  assert.ok(WORKFLOW_ERROR_CODES.includes('installment_carry_duplicate'));
});

test('🔴 ย้ายแถวเงินด้วย UPDATE (id เดิม · ช่องเงินคงเดิม) + ต่อท้าย movedFrom reason carry · ห้าม INSERT/DELETE งวดใน RPC', () => {
  assert.doesNotMatch(RPC, /INSERT\s+INTO\s+public\.sales_order_installments/i, 'เงินหนึ่งก้อน = งวดหนึ่งแถว (ห้ามก๊อป)');
  assert.doesNotMatch(RPC, /DELETE\s+FROM\s+public\.sales_order_installments/i, 'ลบแถวเปิดเป็นงานของแกน 0377 เท่านั้น');
  const move = RPC.slice(RPC.indexOf('SET "salesOrderId" = v_target.id'), RPC.indexOf('GET DIAGNOSTICS v_moved'));
  // SET แตะเฉพาะ ใบ · เลขงวด · ป้าย · สัดส่วน · movedFrom · frozenAt · updatedAt (สถานะ/ยอด/หลักฐาน/ใบกำกับ/คำร้องไม่อยู่ใน SET)
  const set = move.slice('SET '.length, move.indexOf('FROM jsonb_array_elements(p_target_rows)'));
  const assigned = [...set.matchAll(/(^|,)\s*("?[A-Za-z]+"?)\s*=/g)].map((m) => m[2].replaceAll('"', ''));
  assert.deepEqual(assigned, ['salesOrderId', 'seq', 'label', 'percent', 'movedFrom', 'frozenAt', 'updatedAt']);
  assert.match(move, /"movedFrom" = i\."movedFrom" \|\| jsonb_build_array\(jsonb_build_object\(/, 'ต่อท้ายเสมอ (ประวัติ Rev./ยกเงินรอบก่อนไม่หาย)');
  for (const key of ['salesOrderId', 'orderNumber', 'quotationId', 'reason', 'movedAt', 'byId', 'byName', 'toSalesOrderId', 'toOrderNumber']) {
    assert.match(move, new RegExp(`'${key}', `), `movedFrom ต้องมี ${key}`);
  }
  assert.match(move, /'reason', 'carry'/);
  assert.match(move, /WHERE i\.id = ANY \(v_ids\) AND i\."salesOrderId" = v_source\.id AND e\.r->>'id' = i\.id;/);
  assert.match(RPC, /IF v_moved <> cardinality\(v_ids\) THEN\s+RAISE EXCEPTION 'installment_carry_row_invalid'/);
});

test('แผนของใบปลายทาง: แถวเปิดหลบเลข +1000 ก่อนย้าย แล้วเขียนผ่านแกน _so_installments_write_plan (0377) ตัวเดียว', () => {
  const shift = RPC.indexOf('SET seq = i.seq + 1000');
  const move = RPC.indexOf('SET "salesOrderId" = v_target.id');
  const core = RPC.indexOf('PERFORM public._so_installments_write_plan(v_target.id, p_target_rows, v_now, p_actor_id, p_actor_name);');
  assert.ok(shift > 0 && move > shift && core > move, 'หลบเลข (seq_uk ไม่ deferrable) → ย้ายแถวเงินด้วยเลขจริง → แกนตรวจ/เขียนแผนทั้งใบ');
  const shiftStmt = RPC.slice(shift, RPC.indexOf(';', shift));
  assert.match(shiftStmt, /"frozenAt" = COALESCE\(i\."frozenAt", v_now\)/, 'ทุกคำสั่งเขียนงวดตั้ง frozenAt');
  assert.match(RPC.slice(RPC.lastIndexOf('WHERE', shift + 400), shift + 400), /NOT public\._so_installment_replan_locked\(/);
  // เลขงวดของแถวที่ยกห้ามชนแถวล็อกของปลายทาง — ตรวจก่อน (ไม่ปล่อยเป็น 23505 ดิบ)
  assert.match(RPC, /RAISE EXCEPTION 'installment_replan_row_invalid'/);
  assert.match(RPC, /RETURN jsonb_build_object\('before', v_before, 'after', v_after, 'carried', v_summary, 'reason', v_reason\);/);
});

test('คอลัมน์คืนเงิน + CHECK: คืนได้เฉพาะ confirmed · มีวันคืน · เหตุผล ≥ 10 · มีใบกำกับต้องมีเลขใบลดหนี้ · ล้าง = ว่างทุกช่อง', () => {
  for (const [col, type] of [['refundedAt', 'timestamptz'], ['refundedOn', 'date'], ['refundedById', 'text'],
    ['refundedByName', 'text'], ['refundReason', 'text'], ['refundCreditNoteNo', 'text']]) {
    assert.match(code, new RegExp(`ADD COLUMN IF NOT EXISTS "${col}" ${type}`), col);
  }
  assert.match(code, /DROP CONSTRAINT IF EXISTS sales_order_installments_refund_shape;/);
  const check = code.slice(code.indexOf('ADD CONSTRAINT sales_order_installments_refund_shape'), code.indexOf(';', code.indexOf('ADD CONSTRAINT sales_order_installments_refund_shape')));
  assert.match(check, /"refundedAt" IS NULL AND "refundedOn" IS NULL AND "refundedById" IS NULL AND "refundedByName" IS NULL\s+AND "refundReason" IS NULL AND "refundCreditNoteNo" IS NULL/);
  assert.match(check, /"refundedAt" IS NOT NULL AND status = 'confirmed' AND "refundedOn" IS NOT NULL/);
  assert.match(check, /length\(btrim\(COALESCE\("refundReason", ''\)\)\) >= 10/);
  assert.match(check, /btrim\(COALESCE\("taxInvoiceNo", ''\)\) = '' OR btrim\(COALESCE\("refundCreditNoteNo", ''\)\) <> ''/);
  assert.match(check, /"refundedOn" BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'/);
  assert.ok(WORKFLOW_ERROR_CODES.includes('sales_order_installments_refund_shape'), 'ชน CHECK ต้องได้ข้อความไทย ไม่ใช่ 500 ดิบ');
});

test('ดัชนี GIN ของ movedFrom (ด่านกู้คืน/ลบถาวร/ลิงก์ "ยกไป" ถามด้วย @>) · ไม่มี trigger · ไม่ backfill', () => {
  assert.match(code, /CREATE INDEX IF NOT EXISTS sales_order_installments_moved_from_gin\s+ON public\.sales_order_installments USING gin \("movedFrom" jsonb_path_ops\);/);
  assert.doesNotMatch(code, /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/i);
  // นอกตัวฟังก์ชันไม่มี DML (ALTER/CREATE INDEX/DO guard เท่านั้น)
  const outside = code.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\n\$\$;/g, '');
  assert.doesNotMatch(outside, /\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+public\./i);
});

test('สิทธิ์: REVOKE จาก PUBLIC/anon/authenticated · GRANT EXECUTE ให้ service_role · ไม่ใช่ SECURITY DEFINER', () => {
  const sig = 'public.carry_sales_order_installments(text, text, text[], jsonb, jsonb, text, text, text, text)';
  const esc = sig.replace(/[().[\]]/g, '\\$&');
  assert.match(code, new RegExp(`REVOKE ALL ON FUNCTION ${esc} FROM PUBLIC, anon, authenticated;`));
  assert.match(code, new RegExp(`GRANT EXECUTE ON FUNCTION ${esc} TO service_role;`));
  assert.doesNotMatch(code, /SECURITY DEFINER/);
});

test('รหัส RAISE ทุกตัวของ 0378 มีข้อความไทยในตารางกลาง · หัวไฟล์มีบล็อกลองก่อนรัน (ROLLBACK) + ตรวจหลังรัน', () => {
  const raised = [...new Set([...code.matchAll(/RAISE EXCEPTION '([a-z0-9_]+)'/g)].map((m) => m[1]))];
  assert.ok(raised.length >= 8, raised.join(','));
  for (const key of raised) assert.ok(WORKFLOW_ERROR_CODES.includes(key), `ไม่มีข้อความไทยของ ${key}`);
  const header = sql.slice(0, sql.indexOf('\nBEGIN;'));
  assert.match(header, /--\s+BEGIN;[\s\S]*carry_sales_order_installments[\s\S]*--\s+ROLLBACK;/);
  assert.match(header, /ตรวจหลังรัน/);
  assert.match(header, /has_function_privilege/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema';\s*$/);
});
