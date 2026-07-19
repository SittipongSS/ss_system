import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { publishWorkflowTemplateDraft, WorkflowTemplateError } from '@/lib/admin/workflowTemplates';

export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await publishWorkflowTemplateDraft(getSupabaseAdmin(), id, body.expectedUpdatedAt, user);
    await recordAudit({
      user, action: 'publish', entityType: 'workflow_template_version', entityId: id,
      before: result.archived, after: result.published,
      summary: `เผยแพร่ ${result.published.templateKey} Workflow Template Version ${result.published.versionNumber}`, request,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message || 'เผยแพร่ Workflow Template ไม่สำเร็จ', errors: error.errors }, {
      status: error instanceof WorkflowTemplateError ? error.status : 500,
    });
  }
}
