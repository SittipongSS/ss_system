import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_OVERRIDE_REASON_MAX,
  adminOverrideReasonError,
  isSalesOrderSelfApproval,
  normalizeAdminOverrideReason,
} from './salesOrderApprovalOverride.js';

test('admin override reason is trimmed, whitespace-normalized and bounded', () => {
  assert.equal(normalizeAdminOverrideReason('  ไม่มีผู้ตรวจสอบ   คนที่สอง  '), 'ไม่มีผู้ตรวจสอบ คนที่สอง');
  assert.match(adminOverrideReasonError('สั้น'), /อย่างน้อย 10/);
  assert.equal(adminOverrideReasonError('ยังไม่มีผู้ตรวจสอบคนที่สอง'), '');
  assert.match(adminOverrideReasonError('ก'.repeat(ADMIN_OVERRIDE_REASON_MAX + 1)), /ไม่เกิน 500/);
});

test('self approval covers both the creator and submitter without guessing missing ids', () => {
  assert.equal(isSalesOrderSelfApproval({ createdBy: 'USR-1', submittedBy: 'USR-2' }, 'USR-1'), true);
  assert.equal(isSalesOrderSelfApproval({ createdBy: 'USR-1', submittedBy: 'USR-2' }, 'USR-2'), true);
  assert.equal(isSalesOrderSelfApproval({ createdBy: 'USR-1', submittedBy: 'USR-2' }, 'USR-3'), false);
  assert.equal(isSalesOrderSelfApproval({ createdBy: 'USR-1' }, ''), false);
});
