import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIGNATURE_MAX_BYTES,
  inspectSignaturePng,
  isSignatureStoragePathForUser,
  normalizeSignatureRevokeReason,
  signatureStoragePrefix,
  signatureVersionState,
} from './signatures.js';

function u32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function chunk(type, data = []) {
  return [...u32(data.length), ...Buffer.from(type), ...data, 0, 0, 0, 0];
}

function png(width = 600, height = 200, options = {}) {
  const ihdr = [
    ...u32(width), ...u32(height),
    options.bitDepth ?? 8,
    options.colorType ?? 6,
    0, 0, 0,
  ];
  const bytes = [
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', [0]),
    ...chunk('IEND'),
  ];
  return Uint8Array.from(bytes);
}

test('accepts a structurally valid PNG inside signature boundaries', () => {
  const result = inspectSignaturePng(png());
  assert.equal(result.error, null);
  assert.deepEqual(result.value, {
    mimeType: 'image/png',
    sizeBytes: 58,
    width: 600,
    height: 200,
  });
});

test('rejects a renamed file without PNG signature bytes', () => {
  const result = inspectSignaturePng(Buffer.from('<svg onload="alert(1)"></svg>'));
  assert.match(result.error, /PNG จริง/);
});

test('rejects incomplete PNG structure and missing image data', () => {
  const incomplete = png().slice(0, 33);
  assert.match(inspectSignaturePng(incomplete).error, /ไม่สมบูรณ์/);

  const noImageData = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', [...u32(600), ...u32(200), 8, 6, 0, 0, 0]),
    ...chunk('IEND'),
  ]);
  assert.match(inspectSignaturePng(noImageData).error, /ปิดท้ายไม่ถูกต้อง/);
});

test('enforces dimension boundaries', () => {
  assert.match(inspectSignaturePng(png(119, 200)).error, /ความกว้าง/);
  assert.match(inspectSignaturePng(png(2401, 200)).error, /ความกว้าง/);
  assert.match(inspectSignaturePng(png(600, 39)).error, /ความสูง/);
  assert.match(inspectSignaturePng(png(600, 1201)).error, /ความสูง/);
  assert.equal(inspectSignaturePng(png(120, 40)).error, null);
  assert.equal(inspectSignaturePng(png(2400, 1200)).error, null);
});

test('rejects unsupported color type / bit-depth combinations', () => {
  assert.match(inspectSignaturePng(png(600, 200, { bitDepth: 4, colorType: 6 })).error, /ไม่รองรับ/);
});

test('rejects files larger than one megabyte before parsing', () => {
  const tooLarge = new Uint8Array(SIGNATURE_MAX_BYTES + 1);
  tooLarge.set([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.match(inspectSignaturePng(tooLarge).error, /1 MB/);
});

test('normalizes revoke reason and enforces required/max length', () => {
  assert.equal(normalizeSignatureRevokeReason('  เปลี่ยนลายเซ็น  ').value, 'เปลี่ยนลายเซ็น');
  assert.match(normalizeSignatureRevokeReason(' ').error, /ระบุเหตุผล/);
  assert.match(normalizeSignatureRevokeReason('x'.repeat(501)).error, /500/);
});

test('derives active, revoked and superseded states without mutating versions', () => {
  const events = [{ action: 'revoke', versionId: 'v1' }];
  assert.equal(signatureVersionState('v3', 'v3', events), 'active');
  assert.equal(signatureVersionState('v1', 'v3', events), 'revoked');
  assert.equal(signatureVersionState('v2', 'v3', events), 'superseded');
});

test('builds an owner-scoped storage prefix and rejects cross-owner paths', () => {
  assert.equal(signatureStoragePrefix('user/with space'), 'users/user_with_space/');
  assert.equal(isSignatureStoragePathForUser('user-1', 'users/user-1/version.png'), true);
  assert.equal(isSignatureStoragePathForUser('user-1', 'users/user-10/version.png'), false);
  assert.equal(isSignatureStoragePathForUser('user-1', 'users/user-2/version.png'), false);
});
