import 'server-only';
import { randomUUID } from 'node:crypto';

export class OrganizationSettingsError extends Error {
  constructor(message, status = 500, code = 'organization_settings_error') {
    super(message);
    this.name = 'OrganizationSettingsError';
    this.status = status;
    this.code = code;
  }
}

function mappedError(error) {
  const raw = String(error?.message || error || '');
  const mappings = [
    ['organization_settings_draft_exists', 'มีฉบับร่างที่กำลังแก้ไขอยู่แล้ว', 409],
    ['organization_settings_draft_stale', 'ฉบับร่างถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุด', 409],
    ['organization_settings_version_not_found', 'ไม่พบเวอร์ชันข้อมูลบริษัท', 404],
    ['organization_settings_version_not_draft', 'เวอร์ชันนี้ไม่ใช่ฉบับร่างแล้ว', 409],
    ['organization_settings_change_note_required', 'กรุณาระบุหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่', 400],
    ['organization_settings_published_missing', 'ไม่พบข้อมูลบริษัทเวอร์ชันที่เผยแพร่', 409],
    ['organization_setting_version_hide_active_forbidden', 'ซ่อนเวอร์ชันที่ใช้งานอยู่ไม่ได้ ต้องเผยแพร่เวอร์ชันใหม่แทนก่อน', 409],
  ];
  const match = mappings.find(([code]) => raw.includes(code));
  if (match) return new OrganizationSettingsError(match[1], match[2], match[0]);
  return new OrganizationSettingsError(raw || 'จัดการข้อมูลบริษัทไม่สำเร็จ');
}

function assertExpectedUpdatedAt(value) {
  const text = String(value || '');
  if (!text || Number.isNaN(Date.parse(text))) {
    throw new OrganizationSettingsError('expectedUpdatedAt ไม่ถูกต้อง', 400, 'expected_updated_at_invalid');
  }
  return text;
}

export async function loadOrganizationSettingsAdmin(supabase) {
  const [rootResult, versionsResult] = await Promise.all([
    supabase.from('organization_settings').select('id,publishedVersionId,updatedAt').eq('id', 'primary').maybeSingle(),
    supabase.from('organization_setting_versions').select('*').eq('organizationId', 'primary').order('versionNumber', { ascending: false }),
  ]);
  if (rootResult.error) throw mappedError(rootResult.error);
  if (versionsResult.error) throw mappedError(versionsResult.error);
  if (!rootResult.data) throw new OrganizationSettingsError('ไม่พบข้อมูลตั้งต้นของบริษัท', 500, 'root_missing');

  const versions = versionsResult.data || [];
  return {
    published: versions.find((row) => row.id === rootResult.data.publishedVersionId) || null,
    draft: versions.find((row) => row.status === 'draft') || null,
    versions,
  };
}

export async function createOrganizationSettingsDraft(supabase, user) {
  const { data, error } = await supabase.rpc('create_organization_settings_draft', {
    p_draft_id: `organization-${randomUUID()}`,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return data;
}

export async function updateOrganizationSettingsDraft(supabase, id, input, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const { data: before, error: beforeError } = await supabase
    .from('organization_setting_versions')
    .select('*')
    .eq('id', id)
    .eq('organizationId', 'primary')
    .maybeSingle();
  if (beforeError) throw mappedError(beforeError);
  if (!before) throw new OrganizationSettingsError('ไม่พบเวอร์ชันข้อมูลบริษัท', 404, 'version_not_found');
  if (before.status !== 'draft') throw new OrganizationSettingsError('เวอร์ชันนี้ไม่ใช่ฉบับร่างแล้ว', 409, 'version_not_draft');

  const now = new Date().toISOString();
  const { data: after, error } = await supabase
    .from('organization_setting_versions')
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
  if (!after) throw new OrganizationSettingsError('ฉบับร่างถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุด', 409, 'draft_stale');
  return { before, after };
}

export async function publishOrganizationSettingsDraft(supabase, id, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const { data, error } = await supabase.rpc('publish_organization_settings_draft_atomic', {
    p_version_id: id,
    p_expected_updated_at: expected,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return data;
}

// ยกเลิกร่าง = ลบแถวจริง (Decision 0012 rev 2) — ร่างที่ไม่เคยเผยแพร่ไม่ใช่หลักฐาน;
// คืนข้อมูลแถวที่ถูกลบเพื่อให้ caller บันทึก audit (หลักฐานเดียวที่เหลือ)
export async function discardOrganizationSettingsDraft(supabase, id, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const { data, error } = await supabase.rpc('discard_organization_settings_draft', {
    p_version_id: id,
    p_expected_updated_at: expected,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return data;
}
