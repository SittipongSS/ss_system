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
