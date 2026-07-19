import 'server-only';
import { randomUUID } from 'node:crypto';
import { DOCUMENT_STANDARD_KEYS } from '@/lib/documentStandards';

export class DocumentStandardError extends Error {
  constructor(message, status = 500, code = 'document_standard_error') {
    super(message);
    this.name = 'DocumentStandardError';
    this.status = status;
    this.code = code;
  }
}

function mappedError(error) {
  const raw = String(error?.message || error || '');
  const mappings = [
    ['document_standard_draft_exists', 'เอกสารชนิดนี้มีฉบับร่างที่กำลังแก้ไขอยู่แล้ว', 409],
    ['document_standard_draft_stale', 'ฉบับร่างถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุด', 409],
    ['document_standard_version_not_found', 'ไม่พบเวอร์ชันมาตรฐานเอกสาร', 404],
    ['document_standard_version_not_draft', 'เวอร์ชันนี้ไม่ใช่ฉบับร่างแล้ว', 409],
    ['document_standard_change_note_required', 'กรุณาระบุหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่', 400],
    ['document_standard_published_missing', 'ไม่พบมาตรฐานเอกสารเวอร์ชันที่เผยแพร่', 409],
    ['document_standard_not_found', 'ไม่พบชนิดเอกสาร', 404],
  ];
  const match = mappings.find(([code]) => raw.includes(code));
  if (match) return new DocumentStandardError(match[1], match[2], match[0]);
  return new DocumentStandardError('จัดการมาตรฐานเอกสารไม่สำเร็จ');
}

function assertExpectedUpdatedAt(value) {
  const text = String(value || '');
  if (!text || Number.isNaN(Date.parse(text))) {
    throw new DocumentStandardError('expectedUpdatedAt ไม่ถูกต้อง', 400, 'expected_updated_at_invalid');
  }
  return text;
}

export async function loadDocumentStandardsAdmin(supabase) {
  const [rootsResult, versionsResult] = await Promise.all([
    supabase.from('document_standards').select('documentKey,publishedVersionId,updatedAt'),
    supabase.from('document_standard_versions').select('*').order('versionNumber', { ascending: false }),
  ]);
  if (rootsResult.error) throw mappedError(rootsResult.error);
  if (versionsResult.error) throw mappedError(versionsResult.error);

  const roots = rootsResult.data || [];
  const versions = versionsResult.data || [];
  return DOCUMENT_STANDARD_KEYS.map((documentKey) => {
    const root = roots.find((row) => row.documentKey === documentKey);
    if (!root) throw new DocumentStandardError(`ไม่พบข้อมูลตั้งต้นของ ${documentKey}`, 500, 'root_missing');
    const history = versions.filter((row) => row.documentKey === documentKey);
    return {
      documentKey,
      published: history.find((row) => row.id === root.publishedVersionId) || null,
      draft: history.find((row) => row.status === 'draft') || null,
      versions: history,
    };
  });
}

export async function createDocumentStandardDraft(supabase, documentKey, user) {
  const { data, error } = await supabase.rpc('create_document_standard_draft', {
    p_document_key: documentKey,
    p_draft_id: `document-standard-${documentKey}-${randomUUID()}`,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return data;
}

export async function updateDocumentStandardDraft(supabase, id, input, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const { data: before, error: beforeError } = await supabase
    .from('document_standard_versions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (beforeError) throw mappedError(beforeError);
  if (!before) throw new DocumentStandardError('ไม่พบเวอร์ชันมาตรฐานเอกสาร', 404, 'version_not_found');
  if (before.status !== 'draft') throw new DocumentStandardError('เวอร์ชันนี้ไม่ใช่ฉบับร่างแล้ว', 409, 'version_not_draft');

  const now = new Date().toISOString();
  const { data: after, error } = await supabase
    .from('document_standard_versions')
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
  if (!after) throw new DocumentStandardError('ฉบับร่างถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุด', 409, 'draft_stale');
  return { before, after };
}

export async function publishDocumentStandardDraft(supabase, id, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const { data, error } = await supabase.rpc('publish_document_standard_draft_atomic', {
    p_version_id: id,
    p_expected_updated_at: expected,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return data;
}

export async function archiveDocumentStandardDraft(supabase, id, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const { data, error } = await supabase.rpc('archive_document_standard_draft_atomic', {
    p_version_id: id,
    p_expected_updated_at: expected,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return data;
}
