import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyUserSignatureState,
  signatureRpcError,
  UserSignatureError,
} from './userSignatures.js';

test('empty signature state exposes no active version and safe upload limits', () => {
  const state = emptyUserSignatureState();
  assert.equal(state.active, null);
  assert.deepEqual(state.versions, []);
  assert.deepEqual(state.events, []);
  assert.equal(state.limits.bucket, 'signature-assets');
  assert.equal(state.limits.maxBytes, 1024 * 1024);
  assert.equal(state.limits.acceptedMime, 'image/png');
});

test('signature RPC errors map stale and owner failures to safe HTTP statuses', () => {
  const stale = signatureRpcError({ message: 'user_signature_active_stale' });
  assert.ok(stale instanceof UserSignatureError);
  assert.equal(stale.status, 409);
  assert.match(stale.message, /ข้อมูลล่าสุด/);

  const owner = signatureRpcError({ message: 'user_signature_owner_mismatch' });
  assert.equal(owner.status, 403);
  assert.equal(owner.message, 'forbidden');
});

test('signature RPC validation errors do not leak database details', () => {
  const invalid = signatureRpcError({ message: 'user_signature_asset_invalid: internal detail' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.message, 'ข้อมูลไฟล์ลายเซ็นไม่ถูกต้อง');

  const unknown = signatureRpcError({ message: 'postgres internal detail' });
  assert.equal(unknown.status, 500);
  assert.equal(unknown.message, 'จัดการลายเซ็นไม่สำเร็จ');
});
