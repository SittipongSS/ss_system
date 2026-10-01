// ── ยามตัวหนังสือของ mig 0396 (SO บริการ: "แก้งานบริการ" หลังอนุมัติ · แผน IMPL_PLAN_REOPEN §9.2) ─────────────────
//
// ⭐ 0396 ไม่แตะฟังก์ชันที่รันอยู่ — เพิ่ม 4 ช่อง + CHECK + ฟังก์ชันใหม่สองตัว (ตัวตรวจ `sales_order_service_reopen_blockers`
//    กับ RPC `reopen_sales_order_service_setup`) ⇒ เทสต์นี้ล็อกรูปของไฟล์ที่ฮาร์เนสพิสูจน์ไว้ ไม่ให้ไหลเงียบใน CI
// ⚠️ อ่าน **ตัวหนังสือ SQL** · พฤติกรรมจริงลองบนฮาร์เนส PGlite นอก repo แล้ว
//    (mockups/so-service-lines/pglite-harness/harness-0396.mjs — 53 เคส · รันไฟล์สามรอบ · ถอยกลับตามหัวไฟล์ · ล็อกในโปรเซสลูก)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE = '0396_so_service_reopen.sql';
const RAW = readFileSync(new URL(FILE, MIGRATIONS), 'utf8');
const CODE = RAW.replace(/--[^\n]*/g, '');
const HEADER = RAW.slice(0, RAW.indexOf('\nBEGIN;'));

/* 11 ฟังก์ชันที่รันอยู่ที่ไฟล์นี้ต้องไม่แตะ (ตรวจท้ายเทียบ md5) */
const ELEVEN = [
  'approve_sales_order_with_signature_evidence_atomic', 'revise_approved_sales_order_atomic',
  'sales_order_open_service_terms', 'approve_sales_order_service_setup', 'submit_sales_order_service_setup',
  'reject_sales_order_service_setup', 'save_sales_order_service_setup', 'sales_order_service_setup_editable',
  'sales_order_service_setup_errors', 'sales_order_service_setup_guard', 'sales_order_copy_service_setup',
];
const CYCLE_11 = [
  'serviceSetupState', 'serviceSetupSubmittedAt', 'serviceSetupSubmittedById', 'serviceSetupSubmittedByName',
  'serviceSetupRejectedAt', 'serviceSetupRejectedById', 'serviceSetupRejectedByName', 'serviceSetupRejectedReason',
  'serviceSetupApprovedAt', 'serviceSetupApprovedById', 'serviceSetupApprovedByName',
];
const REOPEN_4 = ['serviceSetupReopenedAt', 'serviceSetupReopenedById', 'serviceSetupReopenedByName', 'serviceSetupReopenedReason'];

function fnBody(name) {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  assert.equal(CODE.split(marker).length, 2, `${name} ต้องนิยามครั้งเดียวพอดี`);
  const from = CODE.indexOf(marker);
  const bodyFrom = CODE.indexOf('AS $$', from);
  const bodyTo = CODE.indexOf('\n$$;', bodyFrom);
  return { header: CODE.slice(from, bodyFrom), body: CODE.slice(bodyFrom + 5, bodyTo) };
}
const BLOCKERS = fnBody('sales_order_service_reopen_blockers');
const REOPEN = fnBody('reopen_sales_order_service_setup');

test('ทรานแซกชันเดียว · NOTIFY หลัง COMMIT · ด่านก่อนรัน · สำเนา md5 ของ 11 ฟังก์ชัน · รหัสตรวจท้ายครบ', () => {
  assert.match(CODE, /\nBEGIN;\n/);
  const commitAt = CODE.lastIndexOf('\nCOMMIT;');
  assert.ok(commitAt > 0 && CODE.indexOf("NOTIFY pgrst, 'reload schema';", commitAt) > commitAt, 'NOTIFY หลัง COMMIT');
  assert.match(CODE, /RAISE EXCEPTION 'mig_0396_needs_0392/);
  const snap = CODE.slice(CODE.indexOf('CREATE TEMP TABLE _mig_0396_bodies ON COMMIT DROP'), CODE.indexOf('ALTER TABLE public.sales_orders'));
  assert.deepEqual([...snap.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((n) => n !== 'public').sort(), [...ELEVEN].sort());
  for (const code of ['mig_0396_verify bodies=', 'mig_0396_verify touched=', 'mig_0396_verify grant', 'mig_0396_verify lock_timeout',
    'mig_0396_verify columns=', 'mig_0396_verify check']) {
    assert.ok(CODE.includes(`'${code}`), code);
  }
});

test('4 ช่องใหม่ในคำสั่ง ALTER เดียวชั้นนอก (ADD COLUMN IF NOT EXISTS) · CHECK สร้างซ้ำได้ · ไม่ใช่ DO/EXECUTE', () => {
  const alter = CODE.slice(CODE.indexOf('ALTER TABLE public.sales_orders\n  ADD COLUMN'), CODE.indexOf(';', CODE.indexOf('ALTER TABLE public.sales_orders\n  ADD COLUMN')));
  assert.deepEqual([...alter.matchAll(/ADD COLUMN IF NOT EXISTS "([A-Za-z]+)"/g)].map((m) => m[1]), REOPEN_4);
  const dropAt = CODE.indexOf('DROP CONSTRAINT IF EXISTS sales_orders_service_setup_reopen_shape');
  const addAt = CODE.indexOf('ADD CONSTRAINT sales_orders_service_setup_reopen_shape');
  assert.ok(dropAt > 0 && addAt > dropAt);
  assert.match(CODE.slice(addAt, CODE.indexOf(';', addAt)), /origin = 'pipeline'[\s\S]*BETWEEN 10 AND 500/);
  assert.doesNotMatch(CODE, /EXECUTE\s+format\(|EXECUTE\s+'ALTER/);
});

test('สิทธิ์: REVOKE PUBLIC/anon/authenticated + GRANT service_role ด้วยลายเซ็นเต็ม · RPC ตั้ง lock_timeout · ไม่ใช่ SECURITY DEFINER', () => {
  for (const sig of ['public.sales_order_service_reopen_blockers(text)',
    'public.reopen_sales_order_service_setup(text, timestamptz, text, text, text, text)']) {
    assert.ok(CODE.includes(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated;`), sig);
    assert.ok(CODE.includes(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role;`), sig);
  }
  assert.match(REOPEN.header, /SET lock_timeout = '5s'/);
  assert.match(BLOCKERS.header, /\bSTABLE\b/);
  assert.doesNotMatch(CODE, /SECURITY DEFINER/);
});

test("ตัวตรวจ + RPC รับเฉพาะใบ pipeline (literal บวก origin = 'pipeline' ในทั้งสองตัว)", () => {
  assert.match(BLOCKERS.body, /v_order\.origin = 'pipeline'/);
  assert.match(REOPEN.body, /v_order\.origin = 'pipeline'/);
  assert.match(REOPEN.body, /v_order\.status = 'approved'[\s\S]*"supersededById" IS NULL[\s\S]*"serviceTermsOpenedAt" IS NOT NULL[\s\S]*sales_order_business_line/);
});

test('ตัวตรวจ: ลำดับรหัสตายตัว · rescheduled ไม่นับ · (c) อ่าน queuedAt และไม่กรองนัดไม่มีรอบ · (c) เทียบตราแรกสุดของสาย Rev. · (d) ไม่ยกเว้น ml ที่ยกมา', () => {
  const order = ['plans_active:', 'visits_live:', 'site_visits_open:', 'ml_set:', 'legacy_terms:', "'nothing_to_edit'"]
    .map((code) => BLOCKERS.body.indexOf(code));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `ลำดับรหัส ${order}`);
  assert.equal((BLOCKERS.body.match(/NOT IN \('cancelled', 'rescheduled'\)/g) || []).length, 2, '(b) และ (c)');
  assert.match(BLOCKERS.body, /v\.kind NOT IN \('survey', 'remove'\)/);
  assert.match(BLOCKERS.body, /v\."queuedAt" >= v_since/);
  assert.doesNotMatch(BLOCKERS.body, /"planId" IS NULL/, '(c) ต้องนับนัดของรอบที่ไม่ผูกใบ/รอบของใบอื่นด้วย (critique M2)');
  /* ตรวจทาน sql-2: นัดสมัยใบเดิมที่ไซต์เดียวกันพึ่ง term ของใบ Rev. ⇒ เทียบตราแรกสุดตาม revisedFromId ทุกรุ่น */
  assert.match(BLOCKERS.body, /WITH RECURSIVE rev_chain AS \([\s\S]*JOIN rev_chain c ON p\.id = c\."revisedFromId"[\s\S]*SELECT min\(c\."serviceTermsOpenedAt"\) INTO v_since FROM rev_chain c;/);
  assert.doesNotMatch(BLOCKERS.body, /"createdAt" >= v_order\."serviceTermsOpenedAt"/, '(c) ห้ามเทียบตราของใบนี้ใบเดียว');
  /* ตรวจทาน sql-1: ตัวยก ml ของ 0392 มองย้อนรุ่นเดียว ⇒ ml ที่ยกมาก็ต้องบล็อก (ไม่มีนิพจน์ยกเว้นจาก revisedFromId) */
  const ml = BLOCKERS.body.slice(BLOCKERS.body.indexOf("'site_visits_open:'"), BLOCKERS.body.indexOf("'ml_set:'"));
  assert.match(ml, /t\.id LIKE 'SZT-S%'\s+AND t\."standardMlPerMonth" IS NOT NULL;/);
  assert.doesNotMatch(ml, /IS DISTINCT FROM|revisedFromId/);
});

test('RPC: ด่านถูก → ล็อกตาราง/แถว term ในบล็อก busy → ตัวตรวจ → audit → DELETE เฉพาะ SZT-S → UPDATE ล้าง 11 ช่อง', () => {
  const b = REOPEN.body;
  const at = (s) => { const i = b.indexOf(s); assert.ok(i >= 0, s); return i; };
  const forbidden = at("RAISE EXCEPTION 'service_setup_forbidden'");
  const state = at("RAISE EXCEPTION 'service_setup_reopen_state_invalid'");
  const stale = at("RAISE EXCEPTION 'workflow_stale'");
  const reason = at("RAISE EXCEPTION 'workflow_reason_invalid'");
  const lock = at('LOCK TABLE public.service_plans, public.service_visits IN SHARE MODE;');
  const terms = at('PERFORM 1 FROM public.service_zone_terms WHERE "salesOrderId" = v_order.id FOR UPDATE;');
  const busy = at("EXCEPTION WHEN lock_not_available THEN\n    RAISE EXCEPTION 'service_setup_reopen_busy';");
  const blockers = at('public.sales_order_service_reopen_blockers(v_order.id)');
  const audit = at('INSERT INTO public.audit_logs');
  const del = at('DELETE FROM public.service_zone_terms t');
  const update = at('UPDATE public.sales_orders SET');
  assert.ok(forbidden < state && state < stale && stale < reason && reason < lock && lock < terms && terms < busy
    && busy < blockers && blockers < audit && audit < del && del < update, 'ลำดับในตัว RPC');
  assert.match(b.slice(del, b.indexOf(';', del)), /t\."salesOrderId" = v_order\.id AND t\.id LIKE 'SZT-S%'/);
  assert.match(b, /RAISE EXCEPTION 'service_setup_reopen_blocked' USING DETAIL = array_to_string\(v_blockers, ','\)/);
  /* audit ทุกแถวบอกบทบาทผู้กด */
  const inserts = [...b.matchAll(/INSERT INTO public\.audit_logs \(([^)]*)\)/g)].map((m) => m[1]);
  assert.equal(inserts.length, 2);
  assert.ok(inserts.every((cols) => cols.includes('"actorRole"')));
  /* UPDATE ล้างตรา + 11 ช่องของรอบตั้งย้อนหลังพอดี · ตั้ง 4 ช่องใหม่ · ไม่แตะเงิน/สถานะ */
  const set = b.slice(update, b.indexOf('WHERE id = v_order.id', update));
  const cleared = [...set.matchAll(/"([A-Za-z]+)" = NULL/g)].map((m) => m[1]);
  assert.deepEqual(cleared, ['serviceTermsOpenedAt', ...CYCLE_11]);
  assert.match(set, /"serviceSetupReopenedAt" = v_now,\s+"serviceSetupReopenedById" = p_actor_id,\s+"serviceSetupReopenedByName" = v_actor_name,\s+"serviceSetupReopenedReason" = v_reason,\s+"updatedAt" = v_now/);
  assert.doesNotMatch(set, /\bstatus\b|"approvedAt"|"actualAmount"|"totalAmount"|"approvalFingerprint"/);
});

test('ไม่เขียนตารางบรรทัด/โซนของบรรทัด/งวด · ไม่มีข้อความ "FUNCTION public.<ฟังก์ชันที่รันอยู่>" (แม้ในคอมเมนต์)', () => {
  assert.doesNotMatch(CODE, /(UPDATE|INSERT INTO|DELETE FROM)\s+public\.(sales_order_lines|sales_order_line_zones|sales_order_installments)\b/);
  const forbidden = [...ELEVEN, 'approve_historical_sales_order'].filter((fn) => RAW.includes(`FUNCTION public.${fn}`));
  assert.deepEqual(forbidden, []);
});

test('หัวไฟล์มี SELECT ตรวจหลังรัน + บล็อกถอยกลับ (ฮาร์เนสรันสองก้อนนี้ตามตัวอักษร)', () => {
  assert.match(HEADER, /--\s+SELECT\s*\n[\s\S]*so247_blockers;/);
  assert.match(HEADER, /DROP FUNCTION public\.reopen_sales_order_service_setup\(text, timestamptz, text, text, text, text\);/);
  assert.match(HEADER, /DROP FUNCTION public\.sales_order_service_reopen_blockers\(text\);/);
  for (const col of REOPEN_4) assert.ok(HEADER.includes(`DROP COLUMN "${col}"`), col);
});
