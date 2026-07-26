import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflowSql = readFileSync(
  new URL('../../../supabase/migrations/0161_qt_so_withdraw_revision_workflow.sql', import.meta.url),
  'utf8',
);
const taxNoticeSql = readFileSync(
  new URL('../../../supabase/migrations/0162_excise_tax_notice_document_standard.sql', import.meta.url),
  'utf8',
);

test('QT/SO withdrawal locks the row, requires a reason and preserves evidence history', () => {
  assert.match(workflowSql, /withdraw_quotation_submission_atomic[\s\S]+FOR UPDATE/);
  assert.match(workflowSql, /withdraw_sales_order_submission_atomic[\s\S]+FOR UPDATE/);
  assert.match(workflowSql, /length\(v_reason\) NOT BETWEEN 10 AND 500/g);
  assert.match(workflowSql, /approvalRequestedBy" IS DISTINCT FROM p_actor_id/);
  assert.match(workflowSql, /submittedBy" IS DISTINCT FROM p_actor_id/);
  assert.doesNotMatch(workflowSql, /DELETE FROM public\.document_signature_evidence/i);
});

test('approved SO revision is one atomic database operation and removes source Actual', () => {
  assert.match(workflowSql, /revise_approved_sales_order_atomic[\s\S]+status <> 'approved'/);
  assert.match(workflowSql, /COALESCE\(p_actor_role, ''\) NOT IN \('ae_supervisor', 'admin'\)/);
  assert.match(workflowSql, /INSERT INTO public\.sales_orders[\s\S]+'draft'/);
  assert.match(workflowSql, /UPDATE public\.sales_orders[\s\S]+status = 'revised'/);
  assert.match(workflowSql, /sales_order_revision_filing_exists/);
  assert.match(workflowSql, /RETURN jsonb_build_object\([\s\S]+'source'[\s\S]+'revision'/);
});

test('excise payment notice pins a published controlled standard and immutable number', () => {
  assert.match(taxNoticeSql, /'exciseTaxNotice'/);
  assert.match(taxNoticeSql, /'ใบแจ้งชำระค่าภาษีสรรพสามิต'/);
  assert.match(taxNoticeSql, /"taxNoticeNumber" text/);
  assert.match(taxNoticeSql, /"taxNoticeStandardSnapshot" jsonb/);
  assert.match(taxNoticeSql, /BEFORE INSERT ON public\.orders/);
  assert.match(taxNoticeSql, /ET-\{YY\}\{MM\}\{RUNNING:4\}-\{REVISION\}/);
});

const rejectSql = readFileSync(
  new URL('../../../supabase/migrations/0164_quotation_reject_submission.sql', import.meta.url),
  'utf8',
);

// มติ 2026-07-26: QT ต้องมี "ตีกลับ" ของตัวเอง — เดิมเจ้าของดีลที่เห็นใบผิดมีทางเดียวคือ
// ดึงกลับ ซึ่งเหตุผลถูกซ่อนใน metadata ไม่มีใครแสดง ผู้จัดทำจึงไม่รู้ว่าต้องแก้อะไร
test('QT rejection is approver-only, atomic, and leaves a reason the proposer can read', () => {
  assert.match(rejectSql, /reject_quotation_submission_atomic[\s\S]+FOR UPDATE/);
  assert.match(rejectSql, /length\(v_reason\) NOT BETWEEN 10 AND 500/);
  // ผู้อนุมัติเท่านั้น — ต่างจาก withdraw ที่ยอมรับผู้ยื่นด้วย
  assert.match(rejectSql, /v_deal\."ownerId" IS DISTINCT FROM p_actor_id/);
  assert.doesNotMatch(rejectSql, /approvalRequestedBy" IS DISTINCT FROM p_actor_id/);
  assert.match(rejectSql, /quotation_reject_forbidden/);
  assert.match(rejectSql, /"approvalStatus" <> 'pending'[\s\S]*?quotation_reject_state_invalid/);
  // ปลายทางต้องแก้ต่อได้ทันที — 'rejected' จะทำให้ทั้งแก้และยื่นซ้ำไม่ได้
  assert.match(rejectSql, /"approvalStatus" = 'not_submitted'/);
  assert.doesNotMatch(rejectSql, /"approvalStatus" = 'rejected'/);
  // เหตุผลลงคอลัมน์จริง ไม่ใช่ metadata แบบ withdraw
  assert.match(rejectSql, /"rejectionReason" = v_reason/);
  assert.match(rejectSql, /ADD COLUMN IF NOT EXISTS "rejectedAt"/);
});

test('QT rejection reason is cleared on resubmit so it cannot resurface later', () => {
  assert.match(rejectSql, /clear_quotation_rejection_on_resubmit/);
  assert.match(rejectSql, /IS DISTINCT FROM 'not_submitted'[\s\S]+"rejectionReason" := NULL/);
  assert.match(rejectSql, /BEFORE UPDATE ON public\.quotations/);
});

test('QT rejection RPC is service-role only', () => {
  assert.match(rejectSql, /REVOKE ALL ON FUNCTION public\.reject_quotation_submission_atomic[\s\S]+FROM PUBLIC, anon, authenticated/);
  assert.match(rejectSql, /GRANT EXECUTE ON FUNCTION public\.reject_quotation_submission_atomic[\s\S]+TO service_role/);
});

const approvedSentSql = readFileSync(
  new URL('../../../supabase/migrations/0165_quotation_approved_implies_sent.sql', import.meta.url),
  'utf8',
);
const signatureSql = readFileSync(
  new URL('../../../supabase/migrations/0125_signature_evidence.sql', import.meta.url),
  'utf8',
);

// มติ 2026-07-26: อนุมัติ = ถือว่าส่งลูกค้าแล้ว — ต้องเกิดในทรานแซกชันเดียวกับการอนุมัติ
// ไม่ใช่ UPDATE ตามหลังจาก route (พลาดแล้วจะเหลือใบ approved ที่ยังเป็นร่างค้างอยู่)
test('approving a QT marks it sent inside the same atomic RPC', () => {
  assert.match(approvedSentSql, /CREATE OR REPLACE FUNCTION public\.approve_quotation_with_signature_evidence_atomic/);
  assert.match(approvedSentSql, /UPDATE public\.quotations SET[\s\S]+status = 'sent'/);
  // ด่านเดิมต้องอยู่ครบ — replace ทั้งฟังก์ชันแล้วตกด่านไหนไปคือช่องโหว่เงียบ
  for (const guard of [
    'signature_evidence_document_not_found',
    'signature_evidence_approval_state_invalid',
    'signature_evidence_document_state_invalid',
    'signature_evidence_approval_stale',
    'signature_evidence_lines_required',
    'signature_evidence_deal_invalid',
    'signature_evidence_forbidden',
  ]) {
    assert.match(approvedSentSql, new RegExp(guard), `0165 ตกด่าน ${guard} ที่ 0125 มี`);
  }
  // ไม่แตะ SO — ใบสั่งขายไม่มีแนวคิด "ส่งลูกค้า"
  assert.doesNotMatch(approvedSentSql, /approve_sales_order_with_signature_evidence_atomic/);
});

test('0165 stays a faithful copy of the 0125 definition apart from the sent line', () => {
  // จำนวนด่านใน 0165 ต้องไม่น้อยกว่าที่ 0125 มี (กันลอกมาไม่ครบ)
  const guardsIn = (sql) => (sql.match(/RAISE EXCEPTION 'signature_evidence_[a-z_]+'/g) || []);
  const original = guardsIn(signatureSql.slice(
    signatureSql.indexOf('CREATE OR REPLACE FUNCTION public.approve_quotation_with_signature_evidence_atomic'),
    signatureSql.indexOf('CREATE OR REPLACE FUNCTION public.approve_sales_order_with_signature_evidence_atomic'),
  ));
  assert.deepEqual(guardsIn(approvedSentSql).sort(), original.sort());
});
