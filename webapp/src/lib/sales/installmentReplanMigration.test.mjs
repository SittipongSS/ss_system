// ── ยาม SQL ของ 0377 · ปรับแผนงวดหลังอนุมัติ (PR2 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09) ──────────
// ⭐ พฤติกรรมจริงพิสูจน์ด้วย PGlite ใน scratch (โหลด schema + 0001–0377 · เคสปฏิเสธ · sales_orders ไม่ขยับ ·
//    ปรับแผน → ย้อนการอนุมัติ → ออก Rev. → อนุมัติ) — ไฟล์นี้ตรึง "รูป" ที่ห้ามไหลกลับ เพราะ npm test ไม่มีฐาน:
//    · งานงวดห้ามเขียน sales_orders/quotations/sales_order_lines (Actual/เดือน Actual ขยับไม่ได้ · trigger 0360 ไม่ตื่น)
//    · ทุกคำสั่งเขียนงวดตั้ง frozenAt (แผนที่ปรับแล้ว = แผนจริง — freezeInstallments ไม่ทับจาก QT อีก)
//    · p_expected ตรวจครบทุกแถว · ขยับเลขงวดสองจังหวะ (seq_uk ไม่ deferrable) · EXECUTE ให้ service_role เท่านั้น
// ⚠️ อ่าน source เป็นสตริง (ตัดคอมเมนต์ก่อน) ⇒ พิสูจน์แค่ "รูปนี้ยังอยู่" — ของจริงอยู่ที่ PGlite
// ⭐ 0412 (Actual รายงวด): ตัวล็อกได้ข้อหก (ยื่นขอนับอยู่) + ข้อเจ็ด (นับแล้วยอด 0) เป็นตัวใหม่ 8 พารามิเตอร์ ("actualStatus", amount)
//    — มติเจ้าของข้อ 9 (26/10): งวดที่นับแล้วยอด > 0 ไม่ล็อก (ปรับยอด/วันได้ · ลบไม่ได้ = trigger ลบของ 0412) — และปะผู้เรียกบนฐาน
//    (แกนเขียนแผนของไฟล์นี้ 5 จุด · ตัวยกเงินของ 0378 3 จุด) ด้วย pg_get_functiondef — ตัวไฟล์ 0377 จึงยังเป็นรูปเดิม
//    · ยามตัวล็อกอ่าน **นิยามล่าสุด** (ข้อหกต้องตรงกับ installmentReplanLock) · ยามของแพตช์อยู่ที่ soInstallmentActualMigration.test.mjs
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

/* นิยามล่าสุดของตัวล็อก (ไฟล์ใหม่สุดที่ CREATE มัน · ในไฟล์เดียวกันตัวหลังทับตัวหน้า) */
function latestLockBody() {
  const marker = 'CREATE OR REPLACE FUNCTION public._so_installment_replan_locked(';
  const owner = readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()
    .filter((n) => stripComments(mig(n)).includes(marker)).at(-1);
  const text = stripComments(mig(owner));
  const from = text.lastIndexOf(marker);
  return { owner, body: text.slice(from, text.indexOf('\n$$;', from)) };
}
const RPC = fnBody('replan_sales_order_installments');
const BODIES = [LOCKED, CORE, RPC];

test('0377 เป็นไฟล์สุดท้ายที่นิยาม replan_sales_order_installments / แกนเขียนแผน (ยามไม่ตรวจไฟล์เก่า)', () => {
  /* ⚠️ นับเฉพาะนิยาม (CREATE [OR REPLACE] FUNCTION) หลังตัดคอมเมนต์ — review F3: REVOKE/GRANT/COMMENT ON FUNCTION ไม่ใช่นิยาม */
  const owners = (fn) => readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()
    .filter((n) => new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fn}\\s*\\(`, 'i').test(stripComments(mig(n))));
  for (const fn of ['replan_sales_order_installments', '_so_installments_write_plan']) {
    const files = owners(fn);
    assert.equal(files[files.length - 1], FILE, `${fn} ถูกเขียนทับในไฟล์ใหม่ — ย้ายยามนี้ตามไป`);
  }
  // ตัวล็อก: 0377 นิยามตัว 6 พารามิเตอร์ · 0412 เพิ่มตัว 8 พารามิเตอร์ (ข้อหก/เจ็ด) — ไฟล์อื่นเขียนทับ = ย้ายยามนี้ตามไป
  assert.deepEqual(owners('_so_installment_replan_locked'), [FILE, '0412_so_installment_actual.sql']);
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

test('แถวล็อก: นิยามเดียวกับ installmentReplanLock ของ lib (ห้าข้อของ 0377 + ข้อหก/เจ็ดของ 0412 · มติข้อ 9)', () => {
  const latest = latestLockBody();
  assert.equal(latest.owner, '0412_so_installment_actual.sql');
  for (const body of [LOCKED, latest.body]) {
    assert.match(body, /p_status IN \('confirmed', 'reported'\)/);
    assert.match(body, /btrim\(COALESCE\(p_tax_invoice_no, ''\)\) <> ''/);
    assert.match(body, /btrim\(COALESCE\(p_billing_request_id, ''\)\) <> ''/);
    assert.match(body, /p_kind = 'opening'/);
    assert.match(body, /p_status = 'pending' AND \(jsonb_array_length\(COALESCE\(p_evidence, '\[\]'::jsonb\)\) > 0 OR p_paid_on IS NOT NULL\)/);
  }
  assert.match(latest.body, /p_paid_on date,\s*p_actual_status text,\s*p_amount numeric\s*\)/);
  assert.match(latest.body, /OR p_actual_status = 'submitted'\s+OR \(p_actual_status = 'approved' AND COALESCE\(p_amount, 0\) <= 0\)/);
  assert.doesNotMatch(latest.body, /p_actual_status IN \(/, 'มติข้อ 9: นับแล้วยอด > 0 ไม่ล็อกด้วย actualStatus อีก');
  assert.doesNotMatch(latest.body, /'rejected'/, 'งวดที่ถูกตีกลับ = เปิด (แก้/ลบได้)');
  // ห้าข้อเดียวกันฝั่ง lib (ตัวแทนของแต่ละข้อ) — ขยายข้อหนึ่งฝั่งเดียวเมื่อไร ปุ่มกับ RPC ตอบคนละคำ
  const base = { status: 'pending', evidence: [], kind: 'regular' };
  assert.ok(installmentReplanLock({ ...base, status: 'reported' }));
  assert.ok(installmentReplanLock({ ...base, taxInvoiceNo: 'IV' }));
  assert.ok(installmentReplanLock({ ...base, billingRequestId: 'RQ' }));
  assert.ok(installmentReplanLock({ ...base, kind: 'opening' }));
  assert.ok(installmentReplanLock({ ...base, paidOn: '2026-09-01' }));
  assert.equal(installmentReplanLock({ ...base, status: 'rejected', paidOn: '2026-09-01', evidence: [{}] }), null);
  // ข้อหก (0412) — ยื่นขอนับอยู่ = ล็อก · ตีกลับ = เปิด · ข้อเจ็ด นับแล้วยอด 0 = ล็อก · นับแล้วยอด > 0 = เปิด (มติข้อ 9)
  assert.ok(installmentReplanLock({ ...base, actualStatus: 'submitted', amount: 100 }));
  assert.ok(installmentReplanLock({ ...base, actualStatus: 'approved', amount: 0 }));
  assert.equal(installmentReplanLock({ ...base, actualStatus: 'approved', amount: 100 }), null);
  assert.equal(installmentReplanLock({ ...base, actualStatus: 'rejected' }), null);
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
   freeze ตอนอนุมัติ) โดยไม่มีใครเห็นจากโค้ด JS ⇒ ห้ามมีทั้งระบบ ไม่ใช่แค่ในไฟล์นี้
   ⚠️ แก้ยามโดยตั้งใจ 24/09 — **ข้อยกเว้นเดียว** ตามมติเจ้าของ ("เพิ่มด่านฝั่งงวดกัน race ของการยกเลิกใบย้อนหลังในไฟล์เดียวกัน" · mig 0387):
     `sales_order_installments_historical_cancelled_guard` **ปฏิเสธอย่างเดียว ไม่เขียนทับแถว** และยิงเฉพาะแถวที่กำลังกลายเป็น
     reported/confirmed บนใบย้อนหลังที่ยกเลิกแล้ว — ทาง JS ทุกทางปฏิเสธกรณีนั้นอยู่แล้ว (historicalInstallmentLock) ⇒ ยิงได้แค่ตอน
     แข่งกับการยกเลิก (route งวดอ่านใบก่อนยกเลิก แล้วเขียนหลัง) · ยามรูปทรงของมันอยู่ที่ historicalCancelSettleMigration.test.mjs
     · trigger ตัวอื่น/ไฟล์อื่นบนตารางงวดยังห้ามทั้งหมด (ชื่อ + ไฟล์ต้องตรงรายการนี้เป๊ะ) */
/* ⚠️ แก้ยามโดยตั้งใจ 26/10 — **ข้อยกเว้นที่สอง** ตามสัญญาเทคนิคของมติเจ้าของ (docs/so-installment-actual.md · mig 0412):
     · `sales_order_installments_actual_guard` — ปฏิเสธอย่างเดียว ไม่เขียนทับแถว · ยิงเฉพาะแถวที่กำลังเข้า confirmed บนใบ
       "นับ Actual รายงวด" ที่งวดยังไม่อนุมัติ (บัญชีรับรองงวดที่ AE Sup ยังไม่อนุมัติไม่ได้ — ด่านชั้นแรกอยู่ที่ installmentActionError)
     · `sales_order_installments_actual_sync` — AFTER · **ไม่แตะแถวงวด** เขียนแค่ cache สองช่องของใบ (เมื่อค่าเปลี่ยน) และ sync ดีล
       เฉพาะใบรายงวดที่อนุมัติแล้ว (ใบทั้งใบไม่แตะดีล = พฤติกรรมเดิม) — ถ้าไม่มีตัวนี้ อนุมัติงวด/ย้ายงวด/ปรับแผนไม่ขยับ Actual ของดีลเลย
     ⇒ ยังห้าม trigger ที่เขียนทับแถวงวด (ทุกชื่อ + ไฟล์ต้องตรงรายการนี้เป๊ะ) */
/* ⚠️ แก้ยามโดยตั้งใจ 26/10 — **ข้อยกเว้นที่สาม** ตามมติเจ้าของข้อ 9 ("งวดที่นับ Actual แล้วแต่เงินยังไม่เข้า ปรับยอด/วันได้ ลบไม่ได้"):
     · `sales_order_installments_actual_delete_guard` — BEFORE DELETE · ปฏิเสธอย่างเดียว ไม่เขียนทับแถว · ยิงเฉพาะงวดที่นับแล้วของใบรายงวด
       pipeline ที่อนุมัติอยู่ (ลบทั้งใบ = cascade ผ่าน — ใบหายก่อน) · ตัวล็อกปรับแผนปล่อยงวดนั้นเป็นแถวเปิดแล้ว ⇒ ด่าน "ต้องยังอยู่"
       ต้องครอบทุกทางลบ (แกนเขียนแผนของปรับแผน/ยกเงิน · เขียนตรง) ตัวเดียว */
/* ⚠️ แก้ยามโดยตั้งใจ 26/10 — **ข้อยกเว้นที่สี่ (ตัวเดียวที่เขียนแถวงวด)** ตามมติเจ้าของข้อ 10 ("นับให้เอง ไม่ต้องยื่น"):
     · `sales_order_installments_actual_autocount` — CONSTRAINT TRIGGER · DEFERRABLE INITIALLY DEFERRED · AFTER INSERT / UPDATE OF
       "salesOrderId", "actualStatus" · WHEN แถวยังไม่นับ — ใบรายงวด pipeline ที่อนุมัติอยู่และเคยกด "นับที่เหลือทั้งหมด" (มีงวด via count_rest)
       = งวดที่โผล่ทีหลัง (ปรับแผน ⑤ INSERT · ยกเงินย้ายใบ) นับให้ตอน COMMIT · เขียนเฉพาะช่อง Actual รายงวดของแถวนั้น (+ updatedAt)
     · ทำไมไม่อยู่ใน RPC: ตัวปรับแผน (replan RPC) อยู่ในลายนิ้วมือที่ห้ามแตะ · แกนเขียนแผนถูกเรียกกลางทางของตัวยกเงิน (ก่อน C2b — ส่วนแบ่ง
       ของงวดที่ C2a ถอดชั่วคราวจะถูกแจกซ้ำ) ⇒ ต้องรอให้ RPC จบทั้งก้อนก่อน (ฮาร์เนส PGlite: ตัวเดียวกันแบบ NOT DEFERRABLE ทำให้ยกเงินล้มด้วย
       installment_actual_counted_row_delete) · ยามรูปทรงอยู่ที่ soInstallmentActualMigration.test.mjs
     ⇒ trigger อื่นที่เขียนทับแถวงวดยังห้ามทั้งหมด */
const INSTALLMENT_TRIGGER_EXCEPTIONS = Object.freeze({
  '0387_historical_so_cancel_settles_opening.sql': ['sales_order_installments_historical_cancelled_guard'],
  '0412_so_installment_actual.sql': [
    'sales_order_installments_actual_guard', 'sales_order_installments_actual_sync', 'sales_order_installments_actual_delete_guard',
    'sales_order_installments_actual_autocount',
  ],
});
test('ทุก migration: ไม่มี CREATE TRIGGER บน sales_order_installments (ยกเว้นด่านปฏิเสธของ 0387 และสี่ตัว Actual รายงวดของ 0412)', () => {
  const found = {};
  for (const n of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const names = [...stripComments(mig(n))
      .matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+(\w+)[\s\S]{0,300}?\bON\s+(?:public\.)?sales_order_installments\b/gi)]
      .map((m) => m[1]);
    if (names.length) found[n] = names;
  }
  assert.deepEqual(found, INSTALLMENT_TRIGGER_EXCEPTIONS);
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
