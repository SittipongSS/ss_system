import test from 'node:test';
import assert from 'node:assert/strict';
import { discardWorkflowTemplateDraft, WorkflowTemplateError } from './workflowTemplates.js';

const USER = { id: 'u1', name: 'ผู้ทดสอบ', role: 'admin' };
const NOW = '2026-07-21T10:00:00.000Z';

const fakeSupabase = (result) => {
  const calls = [];
  return {
    calls,
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve(result);
    },
  };
};

test('discard เรียก discard_workflow_template_draft พร้อม args ครบ และคืนแถวที่ถูกลบ', async () => {
  const row = { id: 'wf-draft', templateKey: 'SCENT', versionNumber: 3, status: 'draft' };
  const supabase = fakeSupabase({ data: row, error: null });
  const result = await discardWorkflowTemplateDraft(supabase, 'wf-draft', NOW, USER);
  assert.deepEqual(result, row);
  assert.equal(supabase.calls[0].fn, 'discard_workflow_template_draft');
  assert.deepEqual(supabase.calls[0].args, {
    p_version_id: 'wf-draft',
    p_expected_updated_at: NOW,
    p_actor_id: 'u1',
    p_actor_name: 'ผู้ทดสอบ',
    p_actor_role: 'admin',
  });
});

test('discard ปฏิเสธ expectedUpdatedAt ว่าง — ไม่ยิง RPC', async () => {
  const supabase = fakeSupabase({ data: null, error: null });
  await assert.rejects(
    () => discardWorkflowTemplateDraft(supabase, 'wf-draft', '', USER),
    (error) => error instanceof WorkflowTemplateError && error.status === 400,
  );
  assert.equal(supabase.calls.length, 0);
});

test('discard แปล error: ไม่ใช่ร่าง/stale → 409, hide active → 409 ข้อความซ่อน', async () => {
  for (const [raw, check] of [
    ['workflow_template_version_not_draft', (e) => e.status === 409],
    ['workflow_template_draft_stale', (e) => e.status === 409],
    ['workflow_template_version_hide_active_forbidden',
      (e) => e.status === 409 && e.message.includes('ซ่อนเวอร์ชันที่ใช้งานอยู่ไม่ได้')],
  ]) {
    const supabase = fakeSupabase({ data: null, error: { message: raw } });
    await assert.rejects(
      () => discardWorkflowTemplateDraft(supabase, 'wf-draft', NOW, USER),
      (error) => error instanceof WorkflowTemplateError && check(error),
    );
  }
});
