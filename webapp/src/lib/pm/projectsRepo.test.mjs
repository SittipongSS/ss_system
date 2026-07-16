// Tests for the project cascade-delete helpers. The point of deleteProjectDeep
// is that personal_tasks, project_doc_revisions AND inquiries (logical projectId
// links, no FK — migrations 0019/0040/0104) get cleared BEFORE the project row is
// deleted — otherwise they dangle. We drive it with a fake supabase that records
// the order of table operations.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deleteProjectDeep, projectHasExciseRegistrations } from './projectsRepo.js';

// Minimal chainable fake:
//   .from(t).select(..).eq(..)        → { count } (head-count query)
//   .from(t).select('id').eq(..)      → { data } (list query — inquiries lookup)
//   .from(t).delete().eq(..)/.in(..)  → records op
// deleteProjectDeep นับด้วย select(...{head:true}) และดึงรายการ inquiry ด้วย
// select('id') — fake นี้ตอบทั้ง count และ data พร้อมกันเลยใช้ได้ทั้งสองทาง.
function fakeSupabase({ counts = {}, rows = {}, ops = [] } = {}) {
  return {
    from(table) {
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({
                count: counts[table] ?? 0,
                data: rows[table] ?? [],
                error: null,
              });
            },
          };
        },
        delete() {
          const done = () => { ops.push(table); return Promise.resolve({ error: null }); };
          return { eq: done, in: done };
        },
      };
    },
  };
}

test('deleteProjectDeep clears logical-link children before deleting the project', async () => {
  const ops = [];
  const supabase = fakeSupabase({
    counts: { personal_tasks: 3, project_doc_revisions: 2 },
    rows: { inquiries: [{ id: 'IQ1' }, { id: 'IQ2' }] },
    ops,
  });
  const removed = await deleteProjectDeep(supabase, 'PRJ-1');

  // projects must be deleted LAST (after the FK-less children are cleared).
  assert.equal(ops[ops.length - 1], 'projects');
  assert.ok(ops.indexOf('personal_tasks') < ops.indexOf('projects'));
  assert.ok(ops.indexOf('project_doc_revisions') < ops.indexOf('projects'));
  // inquiries + their messages must go before the project row too (mig 0104, no FK).
  assert.ok(ops.indexOf('inquiry_messages') < ops.indexOf('projects'));
  assert.ok(ops.indexOf('inquiries') < ops.indexOf('projects'));
  assert.deepEqual(removed, { personalTasks: 3, docRevisions: 2, inquiries: 2 });
});

test('deleteProjectDeep: ไม่มี inquiry ผูก → ข้ามการลบเธรด (ไม่ยิง delete เปล่า)', async () => {
  const ops = [];
  const supabase = fakeSupabase({ ops });
  const removed = await deleteProjectDeep(supabase, 'PRJ-2');
  assert.equal(ops.includes('inquiry_messages'), false);
  assert.equal(ops.includes('inquiries'), false);
  assert.equal(ops[ops.length - 1], 'projects');
  assert.deepEqual(removed, { personalTasks: 0, docRevisions: 0, inquiries: 0 });
});

test('projectHasExciseRegistrations reflects the count', async () => {
  assert.equal(await projectHasExciseRegistrations(fakeSupabase({ counts: { excise_registrations: 0 } }), 'PRJ-1'), false);
  assert.equal(await projectHasExciseRegistrations(fakeSupabase({ counts: { excise_registrations: 2 } }), 'PRJ-1'), true);
});
