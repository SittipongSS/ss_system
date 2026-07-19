import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../../supabase/migrations/0125_signature_evidence.sql', import.meta.url),
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
