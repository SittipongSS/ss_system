import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../../supabase/migrations/0125_signature_evidence.sql', import.meta.url),
  'utf8',
);

const triggerFixMigration = readFileSync(
  new URL('../../../supabase/migrations/0126_signature_evidence_trigger_fix.sql', import.meta.url),
  'utf8',
);

const adminOverrideMigration = readFileSync(
  new URL('../../../supabase/migrations/0127_sales_order_admin_approval_override.sql', import.meta.url),
  'utf8',
);

test('signature evidence migration keeps evidence append-only and does not backfill approvals', () => {
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.document_signature_evidence/);
  assert.doesNotMatch(migration, /INSERT INTO public\.document_signature_evidence\s+SELECT/i);
});

test('approval RPCs pin the signature, published standard and document fingerprint atomically', () => {
  assert.match(migration, /approve_quotation_with_signature_evidence_atomic/);
  assert.match(migration, /approve_sales_order_with_signature_evidence_atomic/);
  assert.match(migration, /v_signature\."activeVersionId"/);
  assert.match(migration, /v_standard\."publishedVersionId"/);
  assert.match(migration, /"signatureVersionId"/);
  assert.match(migration, /"documentStandardVersionId"/);
  assert.match(migration, /"documentFingerprint"/);
});

test('sales order approval repeats commercial completeness and separation checks inside SQL', () => {
  assert.match(migration, /signature_evidence_separation_required/);
  assert.match(migration, /q\.status = 'accepted'/);
  assert.match(migration, /v_order\."projectId" IS NULL/);
  assert.match(migration, /v_order\."customerName"/);
  assert.match(migration, /public\.sales_order_lines/);
});

test('signature pointer cleanup uses a table-specific trigger function for each row type', () => {
  assert.match(triggerFixMigration, /clear_inactive_quotation_signature_evidence_pointer/);
  assert.match(triggerFixMigration, /clear_inactive_sales_order_signature_evidence_pointer/);
  assert.match(
    triggerFixMigration,
    /quotations_clear_signature_evidence_trg[\s\S]*EXECUTE FUNCTION public\.clear_inactive_quotation_signature_evidence_pointer\(\)/,
  );
  assert.match(
    triggerFixMigration,
    /sales_orders_clear_signature_evidence_trg[\s\S]*EXECUTE FUNCTION public\.clear_inactive_sales_order_signature_evidence_pointer\(\)/,
  );
  assert.doesNotMatch(triggerFixMigration, /TG_TABLE_NAME/);
  assert.match(triggerFixMigration, /DROP FUNCTION IF EXISTS public\.clear_inactive_signature_evidence_pointer\(\)/);
});

test('admin self-approval is a reasoned, immutable exception without weakening normal reviewers', () => {
  assert.match(adminOverrideMigration, /"approvalMode" text NOT NULL DEFAULT 'standard'/);
  assert.match(adminOverrideMigration, /document_signature_evidence_overrides/);
  assert.match(adminOverrideMigration, /BEFORE UPDATE OR DELETE ON public\.document_signature_evidence_overrides/);
  assert.match(adminOverrideMigration, /v_self_approval AND p_actor_role <> 'admin'/);
  assert.match(adminOverrideMigration, /length\(v_override_reason\) NOT BETWEEN 10 AND 500/);
  assert.match(adminOverrideMigration, /signature_evidence_override_reason_required/);
  assert.match(adminOverrideMigration, /public\.capture_document_signature_evidence/);
  assert.match(adminOverrideMigration, /'approvalMode', 'admin_override'/);
  assert.doesNotMatch(adminOverrideMigration, /UPDATE public\.document_signature_evidence_overrides/);
});
