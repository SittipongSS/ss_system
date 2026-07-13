import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePersonalTaskLink, taskLinkType } from './taskLink.js';

const deals = [
  { id: 'DL-1', projectId: 'PJ-1' },
  { id: 'DL-2', projectId: null },
];

test('direct project link is no longer supported', () => {
  assert.deepEqual(resolvePersonalTaskLink({ linkType: 'project', projectId: 'PJ-1' }, deals), { projectId: null, dealId: null });
});

test('deal link automatically mirrors its linked project', () => {
  assert.deepEqual(resolvePersonalTaskLink({ linkType: 'deal', dealId: 'DL-1' }, deals), { projectId: 'PJ-1', dealId: 'DL-1' });
});

test('unlinked deal remains deal-only and none clears both links', () => {
  assert.deepEqual(resolvePersonalTaskLink({ linkType: 'deal', dealId: 'DL-2' }, deals), { projectId: null, dealId: 'DL-2' });
  assert.deepEqual(resolvePersonalTaskLink({ linkType: 'none' }, deals), { projectId: null, dealId: null });
});

test('edit mode prefers the more specific deal link', () => {
  assert.equal(taskLinkType({ projectId: 'PJ-1', dealId: 'DL-1' }), 'deal');
  assert.equal(taskLinkType({ projectId: 'PJ-1', dealId: null }), 'none');
  assert.equal(taskLinkType({ projectId: null, dealId: null }), 'none');
});
