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
