import test from 'node:test';
import assert from 'node:assert/strict';
import { signatureEvidenceRpcError } from './signatureEvidence.js';

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

test('unknown database details are not exposed', () => {
  const error = signatureEvidenceRpcError({ message: 'postgres internal relation detail' });
  assert.equal(error.status, 500);
  assert.equal(error.code, 'signature_evidence_failed');
  assert.equal(error.message.includes('postgres'), false);
});
