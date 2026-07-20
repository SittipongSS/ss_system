import 'server-only';
import { randomUUID } from 'node:crypto';
import { resolveCommercialPreset } from '@/lib/commercialPresets';

export class CommercialPresetError extends Error {
  constructor(message, status = 500, code = 'commercial_preset_error') {
    super(message);
    this.name = 'CommercialPresetError';
    this.status = status;
    this.code = code;
  }
}
function mappedError(error) {
  const raw = String(error?.message || error || '');
  const mappings = [
    ['commercial_preset_draft_exists', 'Preset นี้มีฉบับร่างที่กำลังแก้ไขอยู่แล้ว', 409],
    ['commercial_preset_draft_stale', 'ฉบับร่างถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุด', 409],
    ['commercial_preset_version_not_found', 'ไม่พบเวอร์ชัน Commercial Preset', 404],
    ['commercial_preset_version_not_draft', 'เวอร์ชันนี้ไม่ใช่ฉบับร่างแล้ว', 409],
    ['commercial_preset_change_note_required', 'กรุณาระบุหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่', 400],
    ['commercial_preset_published_missing', 'ไม่พบ Commercial Preset เวอร์ชันที่เผยแพร่', 409],
    ['commercial_preset_base_missing', 'ไม่พบเวอร์ชันต้นทางสำหรับสร้างฉบับร่าง', 409],
    ['commercial_preset_not_found', 'ไม่พบ Commercial Preset', 404],
    ['commercial_presets_presetKey_key', 'Preset key ซ้ำ กรุณาลองใหม่', 409],
  ];
  const match = mappings.find(([code]) => raw.includes(code));
  if (match) return new CommercialPresetError(match[1], match[2], match[0]);
  return new CommercialPresetError('จัดการ Commercial Preset ไม่สำเร็จ');
}

function expectedTimestamp(value) {
  const text = String(value || '');
  if (!text || Number.isNaN(Date.parse(text))) {
    throw new CommercialPresetError('expectedUpdatedAt ไม่ถูกต้อง', 400, 'expected_updated_at_invalid');
  }
  return text;
}

function actorArgs(user) {
  return {
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  };
}

export async function loadCommercialPresetsAdmin(supabase) {
  const [rootsResult, versionsResult] = await Promise.all([
    supabase.from('commercial_presets').select('*').order('priority').order('presetKey'),
    supabase.from('commercial_preset_versions').select('*').order('versionNumber', { ascending: false }),
  ]);
  if (rootsResult.error) throw mappedError(rootsResult.error);
  if (versionsResult.error) throw mappedError(versionsResult.error);
  const versions = versionsResult.data || [];
  return (rootsResult.data || []).map((root) => {
    const history = versions.filter((row) => row.presetId === root.id);
    return {
      ...root,
      published: history.find((row) => row.id === root.publishedVersionId) || null,
      draft: history.find((row) => row.status === 'draft') || null,
      versions: history,
    };
  });
}

export async function resolvePublishedCommercialPreset(supabase, context) {
  const presets = await loadCommercialPresetsAdmin(supabase);
  return resolveCommercialPreset(presets, context);
}

export async function createCommercialPreset(supabase, input, user) {
  const token = randomUUID();
  const { data, error } = await supabase.rpc('create_commercial_preset_with_draft', {
    p_preset_id: `commercial-preset-${token}`,
    p_preset_key: `preset-${token}`,
    p_version_id: `commercial-preset-version-${randomUUID()}`,
    p_document_key: input.documentKey,
    p_team_key: input.teamKey,
    p_deal_type: input.dealType,
    p_service_type: input.serviceType,
    p_priority: input.priority,
    p_title: input.title,
    p_payment_method: input.paymentMethod,
    p_payment_terms: input.paymentTerms,
    p_remarks: input.remarks,
    p_installments: input.installments,
    p_change_note: input.changeNote,
    ...actorArgs(user),
  });
  if (error) throw mappedError(error);
  return data;
}

export async function createCommercialPresetDraft(supabase, presetId, user) {
  const { data, error } = await supabase.rpc('create_commercial_preset_draft', {
    p_preset_id: presetId,
    p_version_id: `commercial-preset-version-${randomUUID()}`,
    ...actorArgs(user),
  });
  if (error) throw mappedError(error);
  return data;
}

export async function updateCommercialPresetDraft(supabase, id, input, expectedUpdatedAt, user) {
  const expected = expectedTimestamp(expectedUpdatedAt);
  const { data: before, error: beforeError } = await supabase
    .from('commercial_preset_versions').select('*').eq('id', id).maybeSingle();
  if (beforeError) throw mappedError(beforeError);
  if (!before) throw new CommercialPresetError('ไม่พบเวอร์ชัน Commercial Preset', 404, 'version_not_found');
  if (before.status !== 'draft') throw new CommercialPresetError('เวอร์ชันนี้ไม่ใช่ฉบับร่างแล้ว', 409, 'version_not_draft');

  const now = new Date().toISOString();
  const { data: after, error } = await supabase
    .from('commercial_preset_versions')
    .update({
      ...input,
      updatedById: String(user.id),
      updatedByName: user.name || null,
      updatedByRole: user.role || null,
      updatedAt: now,
    })
    .eq('id', id).eq('status', 'draft').eq('updatedAt', expected).select('*').maybeSingle();
  if (error) throw mappedError(error);
  if (!after) throw new CommercialPresetError('ฉบับร่างถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุด', 409, 'draft_stale');
  return { before, after };
}

export async function publishCommercialPresetDraft(supabase, id, expectedUpdatedAt, user) {
  const { data, error } = await supabase.rpc('publish_commercial_preset_draft_atomic', {
    p_version_id: id,
    p_expected_updated_at: expectedTimestamp(expectedUpdatedAt),
    ...actorArgs(user),
  });
  if (error) throw mappedError(error);
  return data;
}

export async function archiveCommercialPresetDraft(supabase, id, expectedUpdatedAt, user) {
  const { data, error } = await supabase.rpc('archive_commercial_preset_draft_atomic', {
    p_version_id: id,
    p_expected_updated_at: expectedTimestamp(expectedUpdatedAt),
    ...actorArgs(user),
  });
  if (error) throw mappedError(error);
  return data;
}
