import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOMER_CONTACT_FIELDS,
  changedFieldsAgainst,
  normalizeRejectionReason,
  rejectionReasonError,
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

// ── เหตุผลตอนตีกลับข้อมูลหลัก (2026-07-27) ───────────────────────────────────
// เดิมลูกค้า/สินค้าตีกลับได้โดยไม่ต้องบอกเหตุ ต่างจากทุกโมดูลอื่นที่บังคับ
test('ตีกลับต้องมีเหตุผล — ว่าง/ช่องว่างล้วนไม่ผ่าน', () => {
  assert.match(rejectionReasonError(''), /กรุณาระบุเหตุผล/);
  assert.match(rejectionReasonError('   '), /กรุณาระบุเหตุผล/);
  assert.match(rejectionReasonError(null), /กรุณาระบุเหตุผล/);
});

test('เหตุผลสั้นผ่านได้ (ไม่ใช้ขั้นต่ำ 10 ตัวอักษรแบบเอกสารที่มีลายเซ็น)', () => {
  assert.equal(rejectionReasonError('ชื่อซ้ำ'), '');
});

test('เหตุผลยาวเกิน 500 ไม่ผ่าน', () => {
  assert.match(rejectionReasonError('ก'.repeat(501)), /ไม่เกิน 500/);
  assert.equal(rejectionReasonError('ก'.repeat(500)), '');
});

test('ป้ายในข้อความเปลี่ยนตามงานได้ (ตีกลับ vs ปลดอนุมัติ)', () => {
  assert.match(rejectionReasonError('', { label: 'ที่ปลดอนุมัติ' }), /เหตุผลที่ปลดอนุมัติ/);
});

test('normalizeRejectionReason: ตัดหัวท้าย + ยุบช่องว่างซ้อน', () => {
  assert.equal(normalizeRejectionReason('  เลขภาษี   ผิด  '), 'เลขภาษี ผิด');
});

// 🐞 jsonb คืนคีย์คนละลำดับกับที่โค้ดสร้าง (2026-08-27) — เทียบด้วย JSON.stringify
// ตรง ๆ ทำให้ "ไม่ได้แก้อะไร" ถูกนับเป็นแก้ แล้วลูกค้าที่อนุมัติแล้วเด้งเป็นรออนุมัติ
test('changedFieldsAgainst: คีย์สลับลำดับใน jsonb ต้องไม่นับว่าแก้', () => {
  const record = { brands: [{ en: 'RAM', th: 'ร่ำ' }] };
  const updates = { brands: [{ th: 'ร่ำ', en: 'RAM' }] };
  assert.deepEqual(changedFieldsAgainst(record, updates), []);
});

test('changedFieldsAgainst: ลำดับในอาร์เรย์ยังมีความหมาย — สลับแถว = แก้', () => {
  const record = { brands: [{ th: 'ก' }, { th: 'ข' }] };
  const updates = { brands: [{ th: 'ข' }, { th: 'ก' }] };
  assert.deepEqual(changedFieldsAgainst(record, updates), ['brands']);
});

test('changedFieldsAgainst: คีย์สลับลำดับใน object ซ้อน (addresses) ก็ต้องไม่นับว่าแก้', () => {
  const record = { addresses: [{ id: 'ADR-1', line1: 'ก', branchCode: '00000' }] };
  const updates = { addresses: [{ branchCode: '00000', line1: 'ก', id: 'ADR-1' }] };
  assert.deepEqual(changedFieldsAgainst(record, updates), []);
});
