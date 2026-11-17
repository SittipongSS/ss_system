import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePersonalTaskLink } from './taskLink.js';

test('ผูกงานกับดีลอย่างเดียว — ไม่ mirror โครงการแล้ว (งวด P3b-3 ยุบโครงการ)', () => {
  assert.deepEqual(resolvePersonalTaskLink({ dealId: 'DL-1', projectId: 'PJ-1' }), { dealId: 'DL-1' });
  assert.deepEqual(resolvePersonalTaskLink({ projectId: 'PJ-1' }), { dealId: null });
  assert.deepEqual(resolvePersonalTaskLink({ dealId: '' }), { dealId: null });
  assert.deepEqual(resolvePersonalTaskLink({}), { dealId: null });
  assert.deepEqual(resolvePersonalTaskLink(null), { dealId: null });
});
