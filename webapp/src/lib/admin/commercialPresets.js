import 'server-only';
import { randomUUID } from 'node:crypto';

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
    ['commercial_preset_version_not_found', 'ไม่พบเวอร์ชันชุดเงื่อนไขการค้า', 404],
    ['commercial_preset_version_not_draft', 'เวอร์ชันนี้ไม่ใช่ฉบับร่างแล้ว', 409],
    ['commercial_preset_change_note_required', 'กรุณาระบุหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่', 400],
    ['commercial_preset_published_missing', 'ไม่พบชุดเงื่อนไขการค้าเวอร์ชันที่เผยแพร่', 409],
    ['commercial_preset_base_missing', 'ไม่พบเวอร์ชันต้นทางสำหรับสร้างฉบับร่าง', 409],
    ['commercial_preset_not_found', 'ไม่พบชุดเงื่อนไขการค้า', 404],
    ['commercial_presets_presetKey_key', 'Preset key ซ้ำ กรุณาลองใหม่', 409],
    ['commercial_preset_version_hide_active_forbidden', 'ซ่อนเวอร์ชันที่ใช้งานอยู่ไม่ได้ ต้องเผยแพร่เวอร์ชันใหม่แทนก่อน', 409],
  ];
  const match = mappings.find(([code]) => raw.includes(code));
  if (match) return new CommercialPresetError(match[1], match[2], match[0]);
  return new CommercialPresetError('จัดการชุดเงื่อนไขการค้าไม่สำเร็จ');
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

// โหลดคลังทีละชนิด (payment / remarks) — ทั้งสองคลังอยู่ตารางเดียวกัน แยกด้วย kind
export async function loadCommercialPresetsAdmin(supabase, kind) {
  const rootsQuery = supabase.from('commercial_presets').select('*').order('presetKey');
  const [rootsResult, versionsResult] = await Promise.all([
    kind ? rootsQuery.eq('kind', kind) : rootsQuery,
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

// kind เป็น identity ของ preset (แก้ไม่ได้) — เนื้อหาที่ยอมรับตอนบันทึกร่างจึงต้อง
// ตัดสินจากค่าใน DB ไม่ใช่จาก body ที่ client ส่งมา
export async function loadCommercialPresetKindByVersion(supabase, versionId) {
  const { data: version, error: versionError } = await supabase
    .from('commercial_preset_versions').select('presetId').eq('id', versionId).maybeSingle();
  if (versionError) throw mappedError(versionError);
  if (!version) throw new CommercialPresetError('ไม่พบเวอร์ชันชุดเงื่อนไขการค้า', 404, 'version_not_found');

  const { data: root, error: rootError } = await supabase
    .from('commercial_presets').select('kind').eq('id', version.presetId).maybeSingle();
  if (rootError) throw mappedError(rootError);
  if (!root) throw new CommercialPresetError('ไม่พบชุดเงื่อนไขการค้า', 404, 'preset_not_found');
  return root.kind || null;
}

// ตรวจว่า versionId ที่ client อ้างว่าใช้ "มีจริง + เผยแพร่อยู่ + เป็นคลังชนิดที่ถูกต้อง"
// ก่อนยอมตรึงเป็นหลักฐานในใบ — ไม่เชื่อค่าจาก body ตรง ๆ เพราะ metadata ของใบเขียนได้จาก
// client. คืน null เมื่อไม่ผ่าน (ให้ผู้เรียกเก็บ null ไม่ใช่ทำให้บันทึกใบล้ม)
export async function resolvePinnedPresetVersionId(supabase, versionId, kind) {
  const id = String(versionId || '').trim();
  if (!id) return null;
  const { data: version, error } = await supabase
    .from('commercial_preset_versions').select('id, presetId, status').eq('id', id).maybeSingle();
  if (error || !version || version.status !== 'published') return null;
  const { data: root, error: rootError } = await supabase
    .from('commercial_presets').select('kind').eq('id', version.presetId).maybeSingle();
  if (rootError || root?.kind !== kind) return null;
  return version.id;
}

// ตรวจทั้งสองคีย์ในคราวเดียวจาก metadata ที่ client ส่งมา → { payment, remarks } (null ได้)
export async function resolvePinnedPresetVersionIds(supabase, metadata = {}) {
  const [payment, remarks] = await Promise.all([
    resolvePinnedPresetVersionId(supabase, metadata.paymentPresetVersionId, 'payment'),
    resolvePinnedPresetVersionId(supabase, metadata.remarksPresetVersionId, 'remarks'),
  ]);
  return { payment, remarks };
}

export async function createCommercialPreset(supabase, input, user) {
  const token = randomUUID();
  const { data, error } = await supabase.rpc('create_commercial_preset_with_draft', {
    p_preset_id: `commercial-preset-${token}`,
    p_preset_key: `preset-${token}`,
    p_version_id: `commercial-preset-version-${randomUUID()}`,
    p_document_key: input.documentKey,
    p_kind: input.kind,
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
  if (!before) throw new CommercialPresetError('ไม่พบเวอร์ชันชุดเงื่อนไขการค้า', 404, 'version_not_found');
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

// ยกเลิกร่าง = ลบแถวจริง (Decision 0012 rev 2); ถ้าเป็นร่างแรกของ preset ใหม่ที่ยัง
// ไม่เคยเผยแพร่ RPC จะลบ root preset ตามด้วย (presetDeleted) ไม่ทิ้ง preset เปล่า
export async function discardCommercialPresetDraft(supabase, id, expectedUpdatedAt, user) {
  const { data, error } = await supabase.rpc('discard_commercial_preset_draft', {
    p_version_id: id,
    p_expected_updated_at: expectedTimestamp(expectedUpdatedAt),
    ...actorArgs(user),
  });
  if (error) throw mappedError(error);
  return { discarded: data?.discarded || null, presetDeleted: Boolean(data?.presetDeleted) };
}
