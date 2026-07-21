import test from 'node:test';
import assert from 'node:assert/strict';
import { discardCommercialPresetDraft, CommercialPresetError } from './commercialPresets.js';

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

test('discard เรียก discard_commercial_preset_draft และคืน { discarded, presetDeleted }', async () => {
  const row = { id: 'cp-draft', title: 'มัดจำ 50%', versionNumber: 1, status: 'draft' };
  const supabase = fakeSupabase({ data: { discarded: row, presetDeleted: true }, error: null });
  const result = await discardCommercialPresetDraft(supabase, 'cp-draft', NOW, USER);
  assert.deepEqual(result, { discarded: row, presetDeleted: true });
  assert.equal(supabase.calls[0].fn, 'discard_commercial_preset_draft');
  assert.deepEqual(supabase.calls[0].args, {
    p_version_id: 'cp-draft',
    p_expected_updated_at: NOW,
    p_actor_id: 'u1',
    p_actor_name: 'ผู้ทดสอบ',
    p_actor_role: 'admin',
  });
});

test('presetDeleted เป็น false เมื่อ preset เคยเผยแพร่แล้ว (RPC ไม่ลบ root)', async () => {
  const row = { id: 'cp-draft', title: 'มัดจำ 50%', versionNumber: 4, status: 'draft' };
  const supabase = fakeSupabase({ data: { discarded: row, presetDeleted: false }, error: null });
  const result = await discardCommercialPresetDraft(supabase, 'cp-draft', NOW, USER);
  assert.equal(result.presetDeleted, false);
  assert.deepEqual(result.discarded, row);
});

test('discard ปฏิเสธ expectedUpdatedAt ที่ไม่ใช่เวลา — ไม่ยิง RPC', async () => {
  const supabase = fakeSupabase({ data: null, error: null });
  await assert.rejects(
    () => discardCommercialPresetDraft(supabase, 'cp-draft', null, USER),
    (error) => error instanceof CommercialPresetError && error.status === 400,
  );
  assert.equal(supabase.calls.length, 0);
});

test('discard แปล error: ไม่ใช่ร่าง/stale → 409, hide active → 409 ข้อความซ่อน', async () => {
  for (const [raw, check] of [
    ['commercial_preset_version_not_draft', (e) => e.status === 409],
    ['commercial_preset_draft_stale', (e) => e.status === 409],
    ['commercial_preset_version_hide_active_forbidden',
      (e) => e.status === 409 && e.message.includes('ซ่อนเวอร์ชันที่ใช้งานอยู่ไม่ได้')],
  ]) {
    const supabase = fakeSupabase({ data: null, error: { message: raw } });
    await assert.rejects(
      () => discardCommercialPresetDraft(supabase, 'cp-draft', NOW, USER),
      (error) => error instanceof CommercialPresetError && check(error),
    );
  }
});
