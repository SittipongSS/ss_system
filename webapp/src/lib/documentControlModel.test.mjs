import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocumentControlActions, visibleDocumentActions, workflowStepsFromIndex } from './documentControlModel.js';

test('document actions keep one explicit primary and remove hidden alternatives', () => {
  const model = normalizeDocumentControlActions({
    primaryAction: { id: 'submit' },
    secondaryActions: [{ id: 'save' }, { id: 'hidden', visible: false }],
    dangerActions: [{ id: 'cancel' }],
  });

  assert.equal(model.primaryAction.id, 'submit');
  assert.deepEqual(model.secondaryActions.map((action) => action.id), ['save']);
  assert.deepEqual(model.dangerActions.map((action) => action.id), ['cancel']);
  assert.deepEqual(visibleDocumentActions([null, { id: 'shown' }, { id: 'hidden', visible: false }]).map((action) => action.id), ['shown']);
});

test('workflow states are derived without document-specific branching', () => {
  const steps = workflowStepsFromIndex([{ label: 'ร่าง' }, { label: 'ยื่น' }, { label: 'อนุมัติ' }], 1);
  assert.deepEqual(steps.map((step) => step.state), ['done', 'current', 'pending']);
  assert.deepEqual(workflowStepsFromIndex(steps, 0, true).map((step) => step.state), ['cancelled', 'cancelled', 'cancelled']);
});

/* ⭐ **ขั้นที่ค้างได้โดยไม่กั้นขั้นถัดไป** (มติผู้ใช้ 2026-09-01) — คำร้อง: แจ้งกำหนดส่ง
   กับลงมือทำงานเกิดพร้อมกันได้ ⇒ ขั้นแจ้งวันอยู่ก่อน index แต่ยังไม่ถูกทำ
   ⚠️ ปล่อยให้นับจาก index อย่างเดียวเมื่อไร รางจะติ๊กว่า "ผ่านแล้ว" ให้ขั้นที่ยังไม่เกิด */
test('ขั้นที่ประกาศ state มาเอง ชนะการนับจาก index — และ cancelled ยังทับทุกขั้น', () => {
  const steps = workflowStepsFromIndex(
    [{ label: 'ร่าง' }, { label: 'กำหนดส่ง', state: 'pending' }, { label: 'ทำงาน' }, { label: 'ปิด' }],
    2,
  );
  assert.deepEqual(steps.map((step) => step.state), ['done', 'pending', 'current', 'pending']);

  const dead = workflowStepsFromIndex([{ label: 'ก', state: 'pending' }, { label: 'ข' }], 1, true);
  assert.deepEqual(dead.map((step) => step.state), ['cancelled', 'cancelled']);
});
