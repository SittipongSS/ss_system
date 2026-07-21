import 'server-only';
import { randomUUID } from 'node:crypto';
import { WORKFLOW_TEMPLATE_KEYS, normalizeWorkflowTemplateDraft } from '@/lib/workflowTemplates';

export class WorkflowTemplateError extends Error {
  constructor(message, status = 500, code = 'workflow_template_error') {
    super(message);
    this.name = 'WorkflowTemplateError';
    this.status = status;
    this.code = code;
  }
}

function mappedError(error) {
  const raw = String(error?.message || error || '');
  const mappings = [
    ['workflow_template_not_found', 'ไม่พบ Workflow Template', 404],
    ['workflow_template_draft_exists', 'Template นี้มีฉบับร่างอยู่แล้ว', 409],
    ['workflow_template_draft_stale', 'ฉบับร่างถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุด', 409],
    ['workflow_template_version_not_found', 'ไม่พบเวอร์ชันของ Template', 404],
    ['workflow_template_version_not_draft', 'เวอร์ชันนี้ไม่ใช่ฉบับร่างแล้ว', 409],
    ['workflow_template_change_note_required', 'กรุณาระบุหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่', 400],
    ['workflow_template_published_missing', 'ไม่พบ Template เวอร์ชันที่เผยแพร่', 409],
    ['workflow_template_step_key_duplicate', 'Step key ต้องไม่ซ้ำกัน', 400],
    ['workflow_template_dependency_invalid', 'Dependency ของ Template ไม่ถูกต้อง', 400],
    ['workflow_template_steps_invalid', 'รายการขั้นตอนของ Template ไม่ถูกต้อง', 400],
    ['workflow_template_version_hide_active_forbidden', 'ซ่อนเวอร์ชันที่ใช้งานอยู่ไม่ได้ ต้องเผยแพร่เวอร์ชันใหม่แทนก่อน', 409],
  ];
  const match = mappings.find(([code]) => raw.includes(code));
  if (match) return new WorkflowTemplateError(match[1], match[2], match[0]);
  return new WorkflowTemplateError(raw || 'จัดการ Workflow Template ไม่สำเร็จ');
}

function assertTemplateKey(key) {
  if (!WORKFLOW_TEMPLATE_KEYS.includes(key)) {
    throw new WorkflowTemplateError('ประเภท Workflow Template ไม่ถูกต้อง', 400, 'template_key_invalid');
  }
  return key;
}

function assertExpectedUpdatedAt(value) {
  const expected = String(value || '');
  if (!expected || Number.isNaN(Date.parse(expected))) {
    throw new WorkflowTemplateError('expectedUpdatedAt ไม่ถูกต้อง', 400, 'expected_updated_at_invalid');
  }
  return expected;
}

const attachSteps = (versions, steps) => {
  const byVersion = new Map();
  for (const step of steps || []) {
    if (!byVersion.has(step.versionId)) byVersion.set(step.versionId, []);
    byVersion.get(step.versionId).push(step);
  }
  return (versions || []).map((version) => ({ ...version, steps: byVersion.get(version.id) || [] }));
};

export async function loadWorkflowTemplatesAdmin(supabase) {
  const [rootsResult, versionsResult, stepsResult] = await Promise.all([
    supabase.from('workflow_templates').select('*').order('templateKey'),
    supabase.from('workflow_template_versions').select('*').order('versionNumber', { ascending: false }),
    supabase.from('workflow_template_steps').select('*').order('stepOrder', { ascending: true }),
  ]);
  for (const result of [rootsResult, versionsResult, stepsResult]) {
    if (result.error) throw mappedError(result.error);
  }
  const versions = attachSteps(versionsResult.data, stepsResult.data);
  return WORKFLOW_TEMPLATE_KEYS.map((templateKey) => {
    const root = (rootsResult.data || []).find((row) => row.templateKey === templateKey);
    if (!root) throw new WorkflowTemplateError(`ไม่พบข้อมูลตั้งต้นของ ${templateKey}`, 500, 'root_missing');
    const history = versions.filter((version) => version.templateKey === templateKey);
    return {
      ...root,
      published: history.find((version) => version.id === root.publishedVersionId) || null,
      draft: history.find((version) => version.status === 'draft') || null,
      versions: history,
    };
  });
}

export async function loadWorkflowTemplateVersion(supabase, versionId) {
  const [versionResult, stepsResult] = await Promise.all([
    supabase.from('workflow_template_versions').select('*').eq('id', versionId).maybeSingle(),
    supabase.from('workflow_template_steps').select('*').eq('versionId', versionId).order('stepOrder', { ascending: true }),
  ]);
  if (versionResult.error) throw mappedError(versionResult.error);
  if (stepsResult.error) throw mappedError(stepsResult.error);
  if (!versionResult.data) throw new WorkflowTemplateError('ไม่พบเวอร์ชันของ Template', 404, 'version_not_found');
  return { ...versionResult.data, steps: stepsResult.data || [] };
}

export async function loadPublishedWorkflowTemplate(supabase, templateKey) {
  assertTemplateKey(templateKey);
  const { data: root, error } = await supabase
    .from('workflow_templates')
    .select('templateKey,publishedVersionId')
    .eq('templateKey', templateKey)
    .maybeSingle();
  if (error) throw mappedError(error);
  if (!root?.publishedVersionId) throw new WorkflowTemplateError('ไม่พบ Template เวอร์ชันที่เผยแพร่', 409, 'published_missing');
  const version = await loadWorkflowTemplateVersion(supabase, root.publishedVersionId);
  if (version.status !== 'published') throw new WorkflowTemplateError('สถานะ Published Template ไม่ถูกต้อง', 409, 'published_invalid');
  return version;
}

export async function loadWorkflowTemplateForGeneration(supabase, templateKey, versionId = null) {
  const version = versionId
    ? await loadWorkflowTemplateVersion(supabase, versionId)
    : await loadPublishedWorkflowTemplate(supabase, templateKey);
  if (version.templateKey !== assertTemplateKey(templateKey)) {
    throw new WorkflowTemplateError('Template version ไม่ตรงกับประเภทดีล', 409, 'template_version_mismatch');
  }
  if (!['published', 'archived'].includes(version.status)) {
    throw new WorkflowTemplateError('Template version นี้ยังไม่พร้อมใช้สร้างงาน', 409, 'template_version_unavailable');
  }
  const normalized = normalizeWorkflowTemplateDraft(version);
  if (normalized.errors.length) {
    throw new WorkflowTemplateError(normalized.errors[0], 409, 'published_template_invalid');
  }
  return { templateVersionId: version.id, template: normalized.value.steps, version };
}

export async function createWorkflowTemplateDraft(supabase, templateKey, user) {
  assertTemplateKey(templateKey);
  const { data, error } = await supabase.rpc('create_workflow_template_draft', {
    p_template_key: templateKey,
    p_draft_id: `workflow-${templateKey.toLowerCase()}-${randomUUID()}`,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return loadWorkflowTemplateVersion(supabase, data.id);
}

export async function saveWorkflowTemplateDraft(supabase, id, input, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const normalized = normalizeWorkflowTemplateDraft(input);
  if (normalized.errors.length) {
    const error = new WorkflowTemplateError(normalized.errors[0], 400, 'template_invalid');
    error.errors = normalized.errors;
    throw error;
  }
  const before = await loadWorkflowTemplateVersion(supabase, id);
  if (before.status !== 'draft') throw new WorkflowTemplateError('เวอร์ชันนี้ไม่ใช่ฉบับร่างแล้ว', 409, 'version_not_draft');
  const { value } = normalized;
  const { data, error } = await supabase.rpc('save_workflow_template_draft', {
    p_version_id: id,
    p_expected_updated_at: expected,
    p_name_th: value.nameTh,
    p_description: value.description,
    p_change_note: value.changeNote,
    p_steps: value.steps,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  const after = await loadWorkflowTemplateVersion(supabase, data.id);
  return { before, after };
}

export async function publishWorkflowTemplateDraft(supabase, id, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const before = await loadWorkflowTemplateVersion(supabase, id);
  const normalized = normalizeWorkflowTemplateDraft(before);
  if (normalized.errors.length) throw new WorkflowTemplateError(normalized.errors[0], 400, 'template_invalid');
  if (!normalized.value.changeNote) {
    throw new WorkflowTemplateError('กรุณาระบุหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่', 400, 'change_note_required');
  }
  const { data, error } = await supabase.rpc('publish_workflow_template_draft_atomic', {
    p_version_id: id,
    p_expected_updated_at: expected,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return data;
}

// ยกเลิกร่าง = ลบแถวจริง (Decision 0012 rev 2); RPC ลบ steps ของร่างก่อนแล้วลบเวอร์ชัน
export async function discardWorkflowTemplateDraft(supabase, id, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const { data, error } = await supabase.rpc('discard_workflow_template_draft', {
    p_version_id: id,
    p_expected_updated_at: expected,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return data;
}
