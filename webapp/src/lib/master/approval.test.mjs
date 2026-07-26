import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOMER_CONTACT_FIELDS,
  changedFieldsAgainst,
  resetApprovalOnEdit,
} from './approval.js';

const approvedCustomer = {
  id: 'CUS-1',
  approvalStatus: 'approved',
  name: 'ลูกค้า ก',
  address: '111 ถนนเก่า',
  contacts: [{ name: 'สมชาย', phone: '0800000000' }],
  contactPerson: 'สมชาย',
  contactPhone: '0800000000',
  email: 'a@x.co.th',
};

const user = { id: 'U-1', name: 'ผู้แก้' };

test('changedFieldsAgainst: เทียบค่าจริง ไม่ใช่ key ที่ส่งมา (ฟอร์มส่งทั้งก้อน)', () => {
  const updates = {
    name: 'ลูกค้า ก',              // เท่าเดิม
    address: '111 ถนนเก่า',        // เท่าเดิม
    contacts: [{ name: 'สมหญิง', phone: '0811111111' }], // เปลี่ยน
    updatedAt: 'now',
  };
  assert.deepEqual(
    changedFieldsAgainst(approvedCustomer, updates, { ignore: ['updatedAt'] }),
    ['contacts'],
  );
});

test('changedFieldsAgainst: null กับ undefined กับ "" ไม่นับว่าเปลี่ยน', () => {
  const record = { a: null, b: '', c: undefined };
  assert.deepEqual(changedFieldsAgainst(record, { a: undefined, b: null, c: '' }), []);
});

test('แก้เฉพาะผู้ติดต่อ = ไม่ตกกลับรออนุมัติ (มติ 2026-07-27)', () => {
  const changed = ['contacts', 'contactPerson', 'contactPhone', 'email'];
  assert.equal(
    resetApprovalOnEdit(approvedCustomer, user, {
      changedFields: changed,
      exemptFields: CUSTOMER_CONTACT_FIELDS,
    }),
    null,
  );
});

test('แก้ที่อยู่ = ยังต้องอนุมัติใหม่ แม้จะแก้ผู้ติดต่อมาพร้อมกัน', () => {
  const patch = resetApprovalOnEdit(approvedCustomer, user, {
    changedFields: ['contacts', 'address'],
    exemptFields: CUSTOMER_CONTACT_FIELDS,
  });
  assert.equal(patch?.approvalStatus, 'pending');
  assert.equal(patch.submittedBy, 'U-1');
  assert.equal(patch.approvedAt, null);
});

test('กดบันทึกโดยไม่แก้อะไร = ไม่ทำให้ของหลุดจากลิสต์', () => {
  assert.equal(
    resetApprovalOnEdit(approvedCustomer, user, { changedFields: [], exemptFields: [] }),
    null,
  );
});

test('ไม่ส่ง changedFields = พฤติกรรมเดิม (reset ทุกการแก้) — caller เก่าต้องไม่เปลี่ยนผล', () => {
  assert.equal(resetApprovalOnEdit(approvedCustomer, user)?.approvalStatus, 'pending');
});

test('แถวที่ยังไม่อนุมัติไม่ต้อง reset', () => {
  assert.equal(resetApprovalOnEdit({ approvalStatus: 'pending' }, user), null);
  assert.equal(resetApprovalOnEdit({ approvalStatus: 'rejected' }, user), null);
});
