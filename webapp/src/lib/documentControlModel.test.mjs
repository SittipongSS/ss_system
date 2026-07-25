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
