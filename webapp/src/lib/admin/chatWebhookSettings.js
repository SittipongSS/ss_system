// Server-only access layer for versioned Google Chat webhook settings
// (mig 0133). Mirrors lib/admin/organizationSettings.js — one root per space.
import 'server-only';
import { randomUUID } from 'node:crypto';

export class ChatWebhookSettingsError extends Error {
  constructor(message, status = 500, code = 'chat_webhook_settings_error') {
    super(message);
    this.name = 'ChatWebhookSettingsError';
    this.status = status;
    this.code = code;
  }
}

function mappedError(error) {
  const raw = String(error?.message || error || '');
  const mappings = [
    ['chat_webhook_settings_draft_exists', 'space นี้มีฉบับร่างที่กำลังแก้ไขอยู่แล้ว', 409],
    ['chat_webhook_settings_draft_stale', 'ฉบับร่างถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุด', 409],
    ['chat_webhook_settings_version_not_found', 'ไม่พบเวอร์ชันการตั้งค่า webhook', 404],
    ['chat_webhook_settings_version_not_draft', 'เวอร์ชันนี้ไม่ใช่ฉบับร่างแล้ว', 409],
    ['chat_webhook_settings_change_note_required', 'กรุณาระบุหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่', 400],
    ['chat_webhook_settings_root_missing', 'ไม่พบ space นี้ในระบบ (รัน migration 0133 หรือยัง?)', 404],
  ];
  const match = mappings.find(([code]) => raw.includes(code));
  if (match) return new ChatWebhookSettingsError(match[1], match[2], match[0]);
  return new ChatWebhookSettingsError(raw || 'จัดการการตั้งค่า webhook ไม่สำเร็จ');
}

function assertExpectedUpdatedAt(value) {
  const text = String(value || '');
  if (!text || Number.isNaN(Date.parse(text))) {
    throw new ChatWebhookSettingsError('expectedUpdatedAt ไม่ถูกต้อง', 400, 'expected_updated_at_invalid');
  }
  return text;
}

// All roots + versions, keyed by space. Space order/labels are the caller's
// concern (CHAT_SPACES in lib/chat.js) — this layer returns raw lifecycle data.
export async function loadChatWebhookSettingsAdmin(supabase) {
  const [rootsResult, versionsResult] = await Promise.all([
    supabase.from('chat_webhook_settings').select('key,publishedVersionId,updatedAt'),
    supabase.from('chat_webhook_setting_versions').select('*').order('versionNumber', { ascending: false }),
  ]);
  if (rootsResult.error) throw mappedError(rootsResult.error);
  if (versionsResult.error) throw mappedError(versionsResult.error);

  const versions = versionsResult.data || [];
  const byKey = new Map();
  for (const root of rootsResult.data || []) {
    const own = versions.filter((row) => row.settingKey === root.key);
    byKey.set(root.key, {
      published: own.find((row) => row.id === root.publishedVersionId) || null,
      draft: own.find((row) => row.status === 'draft') || null,
      versions: own,
    });
  }
  return byKey;
}

export async function createChatWebhookDraft(supabase, key, user) {
  const { data, error } = await supabase.rpc('create_chat_webhook_settings_draft', {
    p_key: String(key),
    p_draft_id: `chat-webhook-${randomUUID()}`,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return data;
}

export async function updateChatWebhookDraft(supabase, id, input, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const { data: before, error: beforeError } = await supabase
    .from('chat_webhook_setting_versions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (beforeError) throw mappedError(beforeError);
  if (!before) throw new ChatWebhookSettingsError('ไม่พบเวอร์ชันการตั้งค่า webhook', 404, 'version_not_found');
  if (before.status !== 'draft') throw new ChatWebhookSettingsError('เวอร์ชันนี้ไม่ใช่ฉบับร่างแล้ว', 409, 'version_not_draft');

  const now = new Date().toISOString();
  const { data: after, error } = await supabase
    .from('chat_webhook_setting_versions')
    .update({
      ...input,
      updatedById: String(user.id),
      updatedByName: user.name || null,
      updatedByRole: user.role || null,
      updatedAt: now,
    })
    .eq('id', id)
    .eq('status', 'draft')
    .eq('updatedAt', expected)
    .select('*')
    .maybeSingle();
  if (error) throw mappedError(error);
  if (!after) throw new ChatWebhookSettingsError('ฉบับร่างถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุด', 409, 'draft_stale');
  return { before, after };
}

export async function publishChatWebhookDraft(supabase, id, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const { data, error } = await supabase.rpc('publish_chat_webhook_settings_draft_atomic', {
    p_version_id: id,
    p_expected_updated_at: expected,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return data;
}

export async function archiveChatWebhookDraft(supabase, id, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const { data, error } = await supabase.rpc('archive_chat_webhook_settings_draft_atomic', {
    p_version_id: id,
    p_expected_updated_at: expected,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return data;
}
