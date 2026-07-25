import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_OVERRIDE_REASON_MAX,
  adminOverrideReasonError,
  isSalesOrderSelfApproval,
  normalizeAdminOverrideReason,
} from './salesOrderApprovalOverride.js';

test('admin override reason is optional, trimmed and capped at the max length', () => {
  assert.equal(normalizeAdminOverrideReason('  ไม่มีผู้ตรวจสอบ   คนที่สอง  '), 'ไม่มีผู้ตรวจสอบ คนที่สอง');
  // มติ 2026-07-25: เหตุผลไม่บังคับแล้ว — ว่างหรือสั้นก็อนุมัติผ่าน (กล่องยืนยันแทน)
  assert.equal(adminOverrideReasonError(''), '');
  assert.equal(adminOverrideReasonError('สั้น'), '');
  assert.equal(adminOverrideReasonError('ยังไม่มีผู้ตรวจสอบคนที่สอง'), '');
  // ยังตัดความยาวสูงสุด ให้ตรงกับ CHECK ระดับ DB (mig 0150)
  assert.match(adminOverrideReasonError('ก'.repeat(ADMIN_OVERRIDE_REASON_MAX + 1)), /ไม่เกิน 500/);
});

test('self approval covers both the creator and submitter without guessing missing ids', () => {
  assert.equal(isSalesOrderSelfApproval({ createdBy: 'USR-1', submittedBy: 'USR-2' }, 'USR-1'), true);
  assert.equal(isSalesOrderSelfApproval({ createdBy: 'USR-1', submittedBy: 'USR-2' }, 'USR-2'), true);
  assert.equal(isSalesOrderSelfApproval({ createdBy: 'USR-1', submittedBy: 'USR-2' }, 'USR-3'), false);
  assert.equal(isSalesOrderSelfApproval({ createdBy: 'USR-1' }, ''), false);
});
