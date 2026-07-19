import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { saveWorkflowTemplateDraft, WorkflowTemplateError } from '@/lib/admin/workflowTemplates';

export async function PATCH(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await saveWorkflowTemplateDraft(getSupabaseAdmin(), id, body, body.expectedUpdatedAt, user);
    await recordAudit({
      user, action: 'update', entityType: 'workflow_template_version', entityId: id,
      before: result.before, after: result.after,
      summary: `บันทึก ${result.after.templateKey} Workflow Template Version ${result.after.versionNumber}`, request,
    });
    return Response.json(result.after);
  } catch (error) {
    return Response.json({ error: error.message || 'บันทึกฉบับร่างไม่สำเร็จ', errors: error.errors }, {
      status: error instanceof WorkflowTemplateError ? error.status : 500,
    });
  }
}
