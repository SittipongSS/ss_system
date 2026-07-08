// Tests for the project cascade-delete helpers. The point of deleteProjectDeep
// is that personal_tasks & project_doc_revisions (logical projectId links, no FK)
// get cleared BEFORE the project row is deleted — otherwise they dangle. We drive
// it with a fake supabase that records the order of table operations.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deleteProjectDeep, projectHasExciseRegistrations } from './projectsRepo.js';

// Minimal chainable fake: .from(t).select(..).eq(..) → count; .from(t).delete().eq(..) → records op.
function fakeSupabase({ counts = {}, ops = [] } = {}) {
  return {
    from(table) {
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({ count: counts[table] ?? 0, error: null });
            },
          };
        },
        delete() {
          return {
            eq() {
              ops.push(table);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

test('deleteProjectDeep clears logical-link children before deleting the project', async () => {
  const ops = [];
  const supabase = fakeSupabase({ counts: { personal_tasks: 3, project_doc_revisions: 2 }, ops });
  const removed = await deleteProjectDeep(supabase, 'PRJ-1');

  // projects must be deleted LAST (after the FK-less children are cleared).
  assert.equal(ops[ops.length - 1], 'projects');
  assert.ok(ops.indexOf('personal_tasks') < ops.indexOf('projects'));
  assert.ok(ops.indexOf('project_doc_revisions') < ops.indexOf('projects'));
  assert.deepEqual(removed, { personalTasks: 3, docRevisions: 2 });
});

test('projectHasExciseRegistrations reflects the count', async () => {
  assert.equal(await projectHasExciseRegistrations(fakeSupabase({ counts: { excise_registrations: 0 } }), 'PRJ-1'), false);
  assert.equal(await projectHasExciseRegistrations(fakeSupabase({ counts: { excise_registrations: 2 } }), 'PRJ-1'), true);
});
