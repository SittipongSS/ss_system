import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePersonalTaskLink } from './taskLink.js';

const deals = [
  { id: 'DL-1', projectId: 'PJ-1' },
  { id: 'DL-2', projectId: null },
];

test('direct project link is no longer supported', () => {
  assert.deepEqual(resolvePersonalTaskLink({ projectId: 'PJ-1' }, deals), { projectId: null, dealId: null });
});

test('deal link automatically mirrors its linked project', () => {
  assert.deepEqual(resolvePersonalTaskLink({ dealId: 'DL-1' }, deals), { projectId: 'PJ-1', dealId: 'DL-1' });
});

test('unlinked deal remains deal-only and an empty deal clears both links', () => {
  assert.deepEqual(resolvePersonalTaskLink({ dealId: 'DL-2' }, deals), { projectId: null, dealId: 'DL-2' });
  assert.deepEqual(resolvePersonalTaskLink({ dealId: '' }, deals), { projectId: null, dealId: null });
  assert.deepEqual(resolvePersonalTaskLink({}, deals), { projectId: null, dealId: null });
});
