// ── ยาม SQL ของ 0377 · ปรับแผนงวดหลังอนุมัติ (PR2 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09) ──────────
// ⭐ พฤติกรรมจริงพิสูจน์ด้วย PGlite ใน scratch (โหลด schema + 0001–0377 · เคสปฏิเสธ · sales_orders ไม่ขยับ ·
//    ปรับแผน → ย้อนการอนุมัติ → ออก Rev. → อนุมัติ) — ไฟล์นี้ตรึง "รูป" ที่ห้ามไหลกลับ เพราะ npm test ไม่มีฐาน:
//    · งานงวดห้ามเขียน sales_orders/quotations/sales_order_lines (Actual/เดือน Actual ขยับไม่ได้ · trigger 0360 ไม่ตื่น)
//    · ทุกคำสั่งเขียนงวดตั้ง frozenAt (แผนที่ปรับแล้ว = แผนจริง — freezeInstallments ไม่ทับจาก QT อีก)
//    · p_expected ตรวจครบทุกแถว · ขยับเลขงวดสองจังหวะ (seq_uk ไม่ deferrable) · EXECUTE ให้ service_role เท่านั้น
// ⚠️ อ่าน source เป็นสตริง (ตัดคอมเมนต์ก่อน) ⇒ พิสูจน์แค่ "รูปนี้ยังอยู่" — ของจริงอยู่ที่ PGlite
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { WORKFLOW_ERROR_CODES } from './documentWorkflowErrors.js';
import { installmentReplanLock } from './installmentReplan.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const mig = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const FILE = '0377_so_installment_replan.sql';
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
const LOCKED = fnBody('_so_installment_replan_locked');
const CORE = fnBody('_so_installments_write_plan');
const RPC = fnBody('replan_sales_order_installments');
const BODIES = [LOCKED, CORE, RPC];

test('0377 เป็นไฟล์สุดท้ายที่นิยาม replan_sales_order_installments / แกนเขียนแผน (ยามไม่ตรวจไฟล์เก่า)', () => {
  const owners = (fn) => readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()
    .filter((n) => mig(n).includes(`FUNCTION public.${fn}(`));
  for (const fn of ['replan_sales_order_installments', '_so_installments_write_plan', '_so_installment_replan_locked']) {
    const files = owners(fn);
    assert.equal(files[files.length - 1], FILE, `${fn} ถูกเขียนทับในไฟล์ใหม่ — ย้ายยามนี้ตามไป`);
  }
  assert.match(code, /CREATE OR REPLACE FUNCTION public\.replan_sales_order_installments\(\s*p_order_id text,\s*p_rows jsonb,\s*p_expected jsonb,\s*p_reason text,\s*p_actor_id text,\s*p_actor_name text,\s*p_actor_role text\s*\)\s*RETURNS jsonb/);
  assert.match(code, /CREATE OR REPLACE FUNCTION public\._so_installments_write_plan\(\s*p_order_id text,\s*p_rows jsonb,\s*p_now timestamptz,\s*p_actor_id text,\s*p_actor_name text\s*\)/);
});

/* 🔴 หลักการของแผน: งานงวดไม่มีขั้นใดเขียน sales_orders / quotations / sales_order_lines
   ⇒ sync_sales_order_actual (0360) ไม่ทำงาน · ยอด Actual และเดือน Actual (approvedAt เวลาไทย) ไม่ขยับ */
test('🔴 ในตัวฟังก์ชันไม่มีคำสั่งเขียน sales_orders · quotations · sales_order_lines และไม่เอ่ยถึงยอด/เดือน Actual/แผนของ QT', () => {
  for (const body of BODIES) {
    assert.doesNotMatch(body, /(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(public\.)?(sales_orders|quotations|sales_order_lines)\b/i);
    assert.doesNotMatch(body, /actualAmount|approvedAt|paymentPlan/);
  }
  assert.match(RPC, /FROM public\.sales_orders\s+WHERE id = p_order_id\s+FOR UPDATE;/, 'ล็อกแถวใบ (อ่านอย่างเดียว) กันแข่งกับย้อนการอนุมัติ/ยกเลิก');
});

test('🔴 ทุกคำสั่งเขียนงวดตั้ง frozenAt · ขยับเลขงวด +1000 ก่อนตั้งเลขจริง (seq_uk ไม่ deferrable)', () => {
  const writes = [...CORE.matchAll(/(UPDATE public\.sales_order_installments[\s\S]*?;|INSERT INTO public\.sales_order_installments[\s\S]*?;)/g)]
    .map((m) => m[1]);
  assert.equal(writes.filter((w) => w.startsWith('UPDATE')).length, 2, 'ขยับเลข + ตั้งค่าจริง');
  assert.equal(writes.filter((w) => w.startsWith('INSERT')).length, 1);
  for (const w of writes) assert.match(w, /"frozenAt"/, `คำสั่งเขียนต้องตั้ง frozenAt:\n${w.slice(0, 120)}`);
  const shift = CORE.indexOf('seq = i.seq + 1000');
  const settle = CORE.indexOf("seq = (e.r->>'seq')::integer");
  assert.ok(shift > 0 && settle > shift, 'ต้องขยับเลขงวดไป +1000 ก่อน UPDATE เลขจริง');
  assert.match(CORE, /COALESCE\(i\."frozenAt", p_now\)/, 'แถวที่ตรึงแล้วคงวันตรึงเดิม');
  assert.match(CORE, /'SOI-' \|\| md5\(p_order_id \|\| ':' \|\| p_now::text \|\| ':' \|\| x\.ord::text\)/);
  assert.match(CORE, /'pending', p_now/, 'งวดใหม่เกิดเป็น pending และตรึงยอดทันที');
  assert.doesNotMatch(CORE, /DELETE FROM public\.sales_order_installments[\s\S]{0,200}?WHERE[\s\S]{0,200}?(status|evidence)\s*(=|IN)/,
    'ลบได้เฉพาะแถวเปิด — ตัดสินด้วยตัวล็อกตัวเดียว ไม่ใช่เงื่อนไขเขียนเอง');
  assert.match(CORE, /DELETE FROM public\.sales_order_installments i[\s\S]*?NOT public\._so_installment_replan_locked\(/);
});

test('แถวล็อก: นิยามเดียวกับ installmentReplanLock ของ lib (ห้าข้อ)', () => {
  assert.match(LOCKED, /p_status IN \('confirmed', 'reported'\)/);
  assert.match(LOCKED, /btrim\(COALESCE\(p_tax_invoice_no, ''\)\) <> ''/);
  assert.match(LOCKED, /btrim\(COALESCE\(p_billing_request_id, ''\)\) <> ''/);
  assert.match(LOCKED, /p_kind = 'opening'/);
  assert.match(LOCKED, /p_status = 'pending' AND \(jsonb_array_length\(COALESCE\(p_evidence, '\[\]'::jsonb\)\) > 0 OR p_paid_on IS NOT NULL\)/);
  // ห้าข้อเดียวกันฝั่ง lib (ตัวแทนของแต่ละข้อ) — ขยายข้อหนึ่งฝั่งเดียวเมื่อไร ปุ่มกับ RPC ตอบคนละคำ
  const base = { status: 'pending', evidence: [], kind: 'regular' };
  assert.ok(installmentReplanLock({ ...base, status: 'reported' }));
  assert.ok(installmentReplanLock({ ...base, taxInvoiceNo: 'IV' }));
  assert.ok(installmentReplanLock({ ...base, billingRequestId: 'RQ' }));
  assert.ok(installmentReplanLock({ ...base, kind: 'opening' }));
  assert.ok(installmentReplanLock({ ...base, paidOn: '2026-09-01' }));
  assert.equal(installmentReplanLock({ ...base, status: 'rejected', paidOn: '2026-09-01', evidence: [{}] }), null);
  assert.match(CORE, /installment_replan_locked_changed/);
  assert.match(CORE, /IS NOT DISTINCT FROM i\.label/, 'แถวล็อกเทียบทีละช่อง');
});

test('RPC: role AE Sup/admin → ใบ pipeline ที่อนุมัติและยังไม่ถูกแทน · บัญชียังไม่ปิด · เหตุผล 10–500', () => {
  const role = RPC.indexOf("COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin')");
  const lockOrder = RPC.indexOf('FOR UPDATE');
  assert.ok(role > 0 && role < lockOrder, 'ด่านสิทธิ์มาก่อนล็อกใบ');
  assert.match(RPC, /RAISE EXCEPTION 'installment_replan_forbidden'/);
  // `origin = 'pipeline'` ตรงตัว — ยาม historicalSalesOrderMigration ไล่หาตัวกรองนี้ในทุกฟังก์ชันที่อ่านใบ approved
  assert.match(RPC, /NOT COALESCE\(v_order\.origin = 'pipeline', false\)\s+OR v_order\.status IS DISTINCT FROM 'approved'\s+OR v_order\."supersededById" IS NOT NULL\s+OR COALESCE\(v_order\."totalAmount", 0\) <= 0 THEN\s+RAISE EXCEPTION 'installment_replan_state_invalid'/);
  assert.match(RPC, /v_order\."financeStatus" IS NOT DISTINCT FROM 'approved' THEN\s+RAISE EXCEPTION 'installment_replan_finance_closed'/);
  assert.match(RPC, /length\(v_reason\) NOT BETWEEN 10 AND 500 THEN\s+RAISE EXCEPTION 'workflow_reason_invalid'/);
});

test('RPC: p_expected ต้องครบทุกแถวและ updatedAt ตรงทุกแถว (ล็อกแถวก่อนตรวจ) ไม่งั้น workflow_stale', () => {
  const lockRows = RPC.indexOf('PERFORM 1 FROM public.sales_order_installments');
  const expected = RPC.indexOf('jsonb_array_length(p_expected)');
  const write = RPC.indexOf('PERFORM public._so_installments_write_plan(');
  assert.ok(lockRows > 0 && expected > lockRows && write > expected, 'ล็อกแถว → ตรวจ p_expected → เขียน');
  assert.match(RPC, /NOT EXISTS \(\s*SELECT 1 FROM jsonb_array_elements\(p_expected\) x\(e\)\s+WHERE x\.e->>'id' = i\.id\s+AND \(x\.e->>'updatedAt'\)::timestamptz = i\."updatedAt"/);
  assert.match(RPC, /RAISE EXCEPTION 'workflow_stale'/);
  assert.match(CORE, /installment_replan_row_unknown/, 'id ที่ไม่ใช่งวดของใบนี้ต้องถูกปฏิเสธ');
});

test('แกน: Σ ยอด = ยอดใบ ±0.005 · Σ สัดส่วน = 100 ±0.01 · 1–12 งวด · แถวที่เขียนต้องถูกรูป', () => {
  assert.match(CORE, /abs\(v_sum - v_total\) >= 0\.005 OR abs\(v_pct - 100\) > 0\.01 THEN\s+RAISE EXCEPTION 'installment_replan_sum_mismatch'/);
  assert.match(CORE, /v_count NOT BETWEEN 1 AND 12 THEN\s+RAISE EXCEPTION 'installment_replan_count_invalid'/);
  assert.match(CORE, /v_amount <= 0 OR v_amount <> round\(v_amount, 2\)/);
  assert.match(CORE, /length\(v_label\) NOT BETWEEN 1 AND 120/);
  assert.match(CORE, /length\(v_note\) > 1000/);
  assert.match(CORE, /v_from > v_to/);
  assert.match(CORE, /RAISE EXCEPTION 'installment_replan_row_invalid'/);
});

test('สิทธิ์: REVOKE จาก PUBLIC/anon/authenticated · GRANT EXECUTE ให้ service_role · ไม่ใช่ SECURITY DEFINER', () => {
  for (const sig of [
    'public._so_installment_replan_locked(text, text, text, text, jsonb, date)',
    'public._so_installments_write_plan(text, jsonb, timestamptz, text, text)',
    'public.replan_sales_order_installments(text, jsonb, jsonb, text, text, text, text)',
  ]) {
    const esc = sig.replace(/[().]/g, '\\$&');
    assert.match(code, new RegExp(`REVOKE ALL ON FUNCTION ${esc} FROM PUBLIC, anon, authenticated;`), sig);
    assert.match(code, new RegExp(`GRANT EXECUTE ON FUNCTION ${esc} TO service_role;`), sig);
  }
  assert.doesNotMatch(code, /SECURITY DEFINER/);
});

/* ⭐ ด่านของงวดอยู่ใน RPC ที่ผู้เรียกเรียกเอง — trigger บนตารางงวดจะไปเขียนทับ/ปฏิเสธทุกทางเขียน (PATCH รายงวด · ย้าย Rev. ·
   freeze ตอนอนุมัติ) โดยไม่มีใครเห็นจากโค้ด JS ⇒ ห้ามมีทั้งระบบ ไม่ใช่แค่ในไฟล์นี้ */
test('ทุก migration: ไม่มี CREATE TRIGGER บน sales_order_installments', () => {
  const offenders = readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql'))
    .filter((n) => /CREATE\s+(OR\s+REPLACE\s+)?(CONSTRAINT\s+)?TRIGGER[\s\S]{0,300}?\bON\s+(public\.)?sales_order_installments\b/i
      .test(stripComments(mig(n))));
  assert.deepEqual(offenders, []);
  assert.doesNotMatch(code, /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/i);
});

test('รหัส RAISE ทุกตัวของ 0377 มีข้อความไทยในตารางกลาง · หัวไฟล์มีบล็อกลองก่อนรันที่จบด้วย ROLLBACK', () => {
  const raised = [...new Set([...code.matchAll(/RAISE EXCEPTION '([a-z_]+)'/g)].map((m) => m[1]))];
  assert.ok(raised.length >= 8, raised.join(','));
  for (const key of raised) assert.ok(WORKFLOW_ERROR_CODES.includes(key), `ไม่มีข้อความไทยของ ${key}`);
  const header = sql.slice(0, sql.indexOf('\nBEGIN;'));
  assert.match(header, /--\s+BEGIN;[\s\S]*replan_sales_order_installments[\s\S]*--\s+ROLLBACK;/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema';\s*$/);
});
