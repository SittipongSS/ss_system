import test from 'node:test';
import assert from 'node:assert/strict';

import { REQUEST_EDITABLE_FIELDS, requestEditError, requestEditPatch } from './requestEdit.js';

const owner = { id: 'U1', role: 'ae' };
const other = { id: 'U2', role: 'ae' };
const draft = { id: 'DR-1', status: 'draft', requestedById: 'U1' };

test('เจ้าของแก้ร่างและใบที่ส่งแล้วแต่ยังไม่รับเรื่องได้', () => {
  assert.equal(requestEditError(draft, owner), null);
  assert.equal(requestEditError({ ...draft, status: 'pending' }, owner), null);
});

test('รับเรื่องแล้ว/ปิด/ยกเลิก แก้ไม่ได้ — และบอกเหตุผลคนละแบบ', () => {
  assert.match(requestEditError({ ...draft, status: 'acknowledged' }, owner), /รับเรื่อง/);
  assert.match(requestEditError({ ...draft, status: 'closed' }, owner), /รับเรื่อง/);
  assert.match(requestEditError({ ...draft, status: 'cancelled' }, owner), /ยกเลิก/);
});

test('คนอื่นแก้ไม่ได้ · superuser แก้ได้ (ท่าเดียวกับ canManageRequest)', () => {
  assert.match(requestEditError(draft, other), /เฉพาะผู้เปิดคำร้อง/);
  assert.equal(requestEditError(draft, { id: 'U9', role: 'admin' }), null);
});

test('รับเฉพาะช่องที่แก้ได้ — ของอื่นที่ยิงมาต้องไม่หลุดเข้า patch', () => {
  const patch = requestEditPatch({
    title: '  ขอ COA ล็อต B  ', body: 'รายละเอียด', requestedDueDate: '2026-09-01',
    urgent: true, urgentReason: 'ลูกค้าออกบูธ',
    // ของที่ห้ามแก้ทางนี้ — เปลี่ยนแล้วกระทบว่าใบผูกกับอะไร
    kind: 'formula_dev', dealId: 'DEAL-9', salesOrderId: 'SO-9', items: [{}], status: 'closed',
  });
  assert.deepEqual(Object.keys(patch).sort(), [...REQUEST_EDITABLE_FIELDS].sort());
  assert.equal(patch.title, 'ขอ COA ล็อต B');
});

test('ถอดธงด่วนแล้วเหตุผลต้องถูกล้าง ไม่ใช่ค้างไว้', () => {
  const patch = requestEditPatch({ title: 'x', urgent: false, urgentReason: 'เหตุผลเก่า' });
  assert.equal(patch.urgentReason, null);
});

test('ตัดความยาวด้วยเลขชุดเดียวกับตอนเปิดใบ', () => {
  const patch = requestEditPatch({ title: 'ก'.repeat(300), body: 'ข'.repeat(5000), urgent: true, urgentReason: 'ค'.repeat(900) });
  assert.equal(patch.title.length, 200);
  assert.equal(patch.body.length, 4000);
  assert.equal(patch.urgentReason.length, 500);
});
