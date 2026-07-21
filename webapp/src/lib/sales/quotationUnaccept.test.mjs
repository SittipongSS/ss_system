import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UNACCEPT_REASON_MAX,
  canUnacceptQuotation,
  normalizeUnacceptReason,
  unacceptReasonError,
} from './quotationUnaccept.js';

test('unaccept reason is trimmed, whitespace-normalized and bounded 10-500', () => {
  assert.equal(normalizeUnacceptReason('  รับใบผิด   ฉบับ  '), 'รับใบผิด ฉบับ');
  assert.match(unacceptReasonError('สั้น'), /อย่างน้อย 10/);
  assert.match(unacceptReasonError('         '), /อย่างน้อย 10/);
  assert.equal(unacceptReasonError('กดรับใบผิดฉบับ — ดีลนี้ปิดด้วยใบอื่น'), '');
  assert.match(unacceptReasonError('ก'.repeat(UNACCEPT_REASON_MAX + 1)), /ไม่เกิน 500/);
});

test('unaccept is gated to the SO reviewer set (admin + ae_supervisor) only', () => {
  assert.equal(canUnacceptQuotation('admin'), true);
  assert.equal(canUnacceptQuotation('ae_supervisor'), true);
  assert.equal(canUnacceptQuotation('senior_ae'), false);
  assert.equal(canUnacceptQuotation('ae'), false);
  assert.equal(canUnacceptQuotation('ac'), false);
  assert.equal(canUnacceptQuotation(''), false);
});
