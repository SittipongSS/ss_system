import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveSalesOrderWithSignatureEvidence,
  signatureEvidenceRpcError,
} from './signatureEvidence.js';

test('missing active signature maps to an actionable account link', () => {
  const error = signatureEvidenceRpcError({ message: 'signature_evidence_signature_required' });
  assert.equal(error.status, 409);
  assert.equal(error.code, 'signature_required');
  assert.equal(error.extra.accountUrl, '/account');
});

test('stale and separation errors use safe status codes', () => {
  const stale = signatureEvidenceRpcError({ message: 'signature_evidence_approval_stale' });
  assert.equal(stale.status, 409);
  assert.equal(stale.code, 'approval_stale');

  const separation = signatureEvidenceRpcError({ message: 'signature_evidence_separation_required' });
  assert.equal(separation.status, 403);
  assert.equal(separation.code, 'separation_of_duty');
});

test('admin override validation errors are safe and actionable', () => {
  const required = signatureEvidenceRpcError({ message: 'signature_evidence_override_reason_required' });
  assert.equal(required.status, 400);
  assert.equal(required.code, 'override_reason_required');
  assert.match(required.message, /10–500/);

  const notApplicable = signatureEvidenceRpcError({ message: 'signature_evidence_override_not_applicable' });
  assert.equal(notApplicable.status, 400);
  assert.equal(notApplicable.code, 'override_not_applicable');
});

test('sales order evidence RPC receives the explicit separation override reason', async () => {
  let called;
  const supabase = {
    rpc: async (name, params) => {
      called = { name, params };
      return { data: { document: { id: 'SO-1' }, evidence: { id: 'DSE-1' } }, error: null };
    },
  };

  await approveSalesOrderWithSignatureEvidence(supabase, {
    documentId: 'SO-1',
    evidenceId: 'DSE-1',
    expectedUpdatedAt: '2026-07-20T00:00:00.000Z',
    documentFingerprint: `sha256:${'a'.repeat(64)}`,
    overrideReason: 'ยังไม่มีผู้ตรวจสอบคนที่สอง',
    user: { id: 'USR-1', name: 'Admin Info', role: 'admin', team: 'Admin' },
  });

  assert.equal(called.name, 'approve_sales_order_with_signature_evidence_atomic');
  assert.equal(called.params.p_separation_override_reason, 'ยังไม่มีผู้ตรวจสอบคนที่สอง');
});

test('unknown database details are not exposed', () => {
  const error = signatureEvidenceRpcError({ message: 'postgres internal relation detail' });
  assert.equal(error.status, 500);
  assert.equal(error.code, 'signature_evidence_failed');
  assert.equal(error.message.includes('postgres'), false);
});
