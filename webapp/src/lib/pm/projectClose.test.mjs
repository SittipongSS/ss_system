import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canApproveProjectClose, canProjectCloseTransition, isValidCloseType,
  PROJECT_CLOSE_TYPES,
} from './projectClose.js';

test('canApproveProjectClose: only superuser (admin + ae_supervisor)', () => {
  assert.equal(canApproveProjectClose({ role: 'admin' }), true);
  assert.equal(canApproveProjectClose({ role: 'ae_supervisor' }), true);
  assert.equal(canApproveProjectClose({ role: 'senior_ae' }), false);
  assert.equal(canApproveProjectClose({ role: 'ae' }), false);
  assert.equal(canApproveProjectClose({ role: 'ac' }), false);
  assert.equal(canApproveProjectClose(null), false);
});

test('close type validation', () => {
  assert.equal(isValidCloseType('completed'), true);
  assert.equal(isValidCloseType('cancelled'), true);
  assert.equal(isValidCloseType('dropped'), false);
  assert.equal(isValidCloseType(''), false);
  assert.deepEqual(PROJECT_CLOSE_TYPES, ['completed', 'cancelled']);
});

test('close transitions: request/approve/reject/reopen gated by status + approver', () => {
  // request: เฉพาะ open
  assert.equal(canProjectCloseTransition('open', 'request'), true);
  assert.equal(canProjectCloseTransition('pending_close', 'request'), false);
  assert.equal(canProjectCloseTransition('closed', 'request'), false);

  // approve/reject: เฉพาะ pending_close + ต้องเป็น approver
  assert.equal(canProjectCloseTransition('pending_close', 'approve', { approver: true }), true);
  assert.equal(canProjectCloseTransition('pending_close', 'approve', { approver: false }), false);
  assert.equal(canProjectCloseTransition('open', 'approve', { approver: true }), false);
  assert.equal(canProjectCloseTransition('pending_close', 'reject', { approver: true }), true);

  // cancel_request: จาก pending_close (ผู้ขอถอนเอง — role check ใน handler)
  assert.equal(canProjectCloseTransition('pending_close', 'cancel_request'), true);
  assert.equal(canProjectCloseTransition('open', 'cancel_request'), false);

  // reopen: เฉพาะ closed + approver (RE-ORDER)
  assert.equal(canProjectCloseTransition('closed', 'reopen', { approver: true }), true);
  assert.equal(canProjectCloseTransition('closed', 'reopen', { approver: false }), false);
  assert.equal(canProjectCloseTransition('open', 'reopen', { approver: true }), false);

  // action มั่ว
  assert.equal(canProjectCloseTransition('open', 'bogus'), false);
});
