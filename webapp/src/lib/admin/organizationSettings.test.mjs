import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discardOrganizationSettingsDraft,
  publishOrganizationSettingsDraft,
  OrganizationSettingsError,
} from './organizationSettings.js';

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

test('discard เรียก discard_organization_settings_draft พร้อม expectedUpdatedAt และ actor ครบ', async () => {
  const row = { id: 'v2', versionNumber: 2, status: 'draft' };
  const supabase = fakeSupabase({ data: row, error: null });
  const result = await discardOrganizationSettingsDraft(supabase, 'v2', NOW, USER);
  assert.deepEqual(result, row);
  assert.equal(supabase.calls.length, 1);
  assert.equal(supabase.calls[0].fn, 'discard_organization_settings_draft');
  assert.deepEqual(supabase.calls[0].args, {
    p_version_id: 'v2',
    p_expected_updated_at: NOW,
    p_actor_id: 'u1',
    p_actor_name: 'ผู้ทดสอบ',
    p_actor_role: 'admin',
  });
});

test('discard ปฏิเสธ expectedUpdatedAt ที่ไม่ใช่เวลา — ไม่ยิง RPC', async () => {
  const supabase = fakeSupabase({ data: null, error: null });
  await assert.rejects(
    () => discardOrganizationSettingsDraft(supabase, 'v2', 'ไม่ใช่เวลา', USER),
    (error) => error instanceof OrganizationSettingsError && error.status === 400
      && error.code === 'expected_updated_at_invalid',
  );
  assert.equal(supabase.calls.length, 0);
});

test('discard แปล error จาก RPC: ไม่ใช่ร่างแล้ว → 409, stale → 409', async () => {
  for (const [raw, code] of [
    ['organization_settings_version_not_draft', 'organization_settings_version_not_draft'],
    ['organization_settings_draft_stale', 'organization_settings_draft_stale'],
  ]) {
    const supabase = fakeSupabase({ data: null, error: { message: raw } });
    await assert.rejects(
      () => discardOrganizationSettingsDraft(supabase, 'v2', NOW, USER),
      (error) => error instanceof OrganizationSettingsError && error.status === 409 && error.code === code,
    );
  }
});

test('hide_active_forbidden ถูกแปลเป็นข้อความซ่อนเวอร์ชัน active ไม่ได้ (409)', async () => {
  const supabase = fakeSupabase({
    data: null,
    error: { message: 'organization_setting_version_hide_active_forbidden' },
  });
  await assert.rejects(
    () => publishOrganizationSettingsDraft(supabase, 'v2', NOW, USER),
    (error) => error instanceof OrganizationSettingsError && error.status === 409
      && error.message.includes('ซ่อนเวอร์ชันที่ใช้งานอยู่ไม่ได้'),
  );
});
