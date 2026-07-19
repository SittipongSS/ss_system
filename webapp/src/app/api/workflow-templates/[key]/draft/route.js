import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { createWorkflowTemplateDraft, WorkflowTemplateError } from '@/lib/admin/workflowTemplates';

export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const { key } = await context.params;
    const draft = await createWorkflowTemplateDraft(getSupabaseAdmin(), key, user);
    await recordAudit({
      user, action: 'create', entityType: 'workflow_template_version', entityId: draft.id, after: draft,
      summary: `สร้าง ${key} Workflow Template ฉบับร่าง Version ${draft.versionNumber}`, request,
    });
    return Response.json(draft, { status: 201 });
  } catch (error) {
    return Response.json({ error: error.message || 'สร้างฉบับร่างไม่สำเร็จ', errors: error.errors }, {
      status: error instanceof WorkflowTemplateError ? error.status : 500,
    });
  }
}
