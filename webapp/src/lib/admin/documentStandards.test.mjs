import test from 'node:test';
import assert from 'node:assert/strict';
import { discardDocumentStandardDraft, DocumentStandardError } from './documentStandards.js';

const USER = { id: 'u1', name: 'ผู้ทดสอบ', role: 'ae_supervisor' };
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

test('discard เรียก discard_document_standard_draft พร้อม args ครบ และคืนแถวที่ถูกลบ', async () => {
  const row = { id: 'ds-draft', documentKey: 'quotation', formCode: 'FM-SA-01', versionNumber: 2, status: 'draft' };
  const supabase = fakeSupabase({ data: row, error: null });
  const result = await discardDocumentStandardDraft(supabase, 'ds-draft', NOW, USER);
  assert.deepEqual(result, row);
  assert.equal(supabase.calls[0].fn, 'discard_document_standard_draft');
  assert.deepEqual(supabase.calls[0].args, {
    p_version_id: 'ds-draft',
    p_expected_updated_at: NOW,
    p_actor_id: 'u1',
    p_actor_name: 'ผู้ทดสอบ',
    p_actor_role: 'ae_supervisor',
  });
});

test('discard ปฏิเสธ expectedUpdatedAt ที่ไม่ใช่เวลา — ไม่ยิง RPC', async () => {
  const supabase = fakeSupabase({ data: null, error: null });
  await assert.rejects(
    () => discardDocumentStandardDraft(supabase, 'ds-draft', 'x', USER),
    (error) => error instanceof DocumentStandardError && error.status === 400,
  );
  assert.equal(supabase.calls.length, 0);
});

test('discard แปล error: ไม่ใช่ร่าง/stale → 409, hide active → 409 ข้อความซ่อน', async () => {
  for (const [raw, check] of [
    ['document_standard_version_not_draft', (e) => e.status === 409],
    ['document_standard_draft_stale', (e) => e.status === 409],
    ['document_standard_version_hide_active_forbidden',
      (e) => e.status === 409 && e.message.includes('ซ่อนเวอร์ชันที่ใช้งานอยู่ไม่ได้')],
  ]) {
    const supabase = fakeSupabase({ data: null, error: { message: raw } });
    await assert.rejects(
      () => discardDocumentStandardDraft(supabase, 'ds-draft', NOW, USER),
      (error) => error instanceof DocumentStandardError && check(error),
    );
  }
});
