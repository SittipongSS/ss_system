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

const signingRoleMigration = readFileSync(
  new URL('../../../supabase/migrations/0151_evidence_signing_role.sql', import.meta.url),
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

test('signing-role migration adds the role additively and never backfills through UPDATE', () => {
  // guard ของตาราง evidence RAISE ทุก UPDATE → คอลัมน์ใหม่ต้องมาด้วย DEFAULT เท่านั้น
  assert.match(signingRoleMigration, /ADD COLUMN IF NOT EXISTS "signingRole" text NOT NULL DEFAULT 'approver'/);
  assert.doesNotMatch(signingRoleMigration, /UPDATE public\.document_signature_evidence\b(?!_overrides)/);
  assert.match(signingRoleMigration, /CHECK \("signingRole" IN \('approver', 'proposer'\)\)/);
});

test('capture RPC records the signing role and keeps every existing pin', () => {
  assert.match(signingRoleMigration, /p_signing_role text DEFAULT 'approver'/);
  assert.match(signingRoleMigration, /signature_evidence_signing_role_invalid/);
  assert.match(signingRoleMigration, /"approvalSequence", "signingRole", "signatureVersionId"/);
  // การตรึงเดิมต้องอยู่ครบ: ลายเซ็น active + มาตรฐานที่เผยแพร่ + fingerprint
  assert.match(signingRoleMigration, /v_signature\."activeVersionId"/);
  assert.match(signingRoleMigration, /v_standard\."publishedVersionId"/);
  assert.match(signingRoleMigration, /signature_evidence_signature_required/);
  assert.match(signingRoleMigration, /signature_evidence_standard_required/);
});

test('pointer cleanup keeps proposer evidence through submitted and approved states only', () => {
  assert.match(signingRoleMigration, /"proposerSignatureEvidenceId" text/);
  assert.match(signingRoleMigration, /NEW\."approvalStatus" NOT IN \('pending', 'approved'\)/);
  assert.match(signingRoleMigration, /NEW\.status NOT IN \('pending_approval', 'approved'\)/);
  // SO trigger ต้องลอกจาก 0127 (มี projection ของ admin override) ไม่ใช่ 0126
  assert.match(signingRoleMigration, /NEW\."approvalMode" := 'standard'/);
  assert.match(signingRoleMigration, /NEW\."approvalOverrideReason" := NULL/);
});
