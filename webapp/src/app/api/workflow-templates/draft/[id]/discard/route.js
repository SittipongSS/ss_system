import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { discardWorkflowTemplateDraft, WorkflowTemplateError } from '@/lib/admin/workflowTemplates';

export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const { id } = await context.params;
    const body = await request.json();
    const discarded = await discardWorkflowTemplateDraft(getSupabaseAdmin(), id, body.expectedUpdatedAt, user);
    // แถวร่างถูกลบถาวรแล้ว — audit log นี้คือหลักฐานเดียวที่เหลือของการยกเลิก
    await recordAudit({
      user, action: 'delete', entityType: 'workflow_template_version', entityId: id,
      before: discarded, after: null,
      summary: `ยกเลิก ${discarded.templateKey} Workflow Template ฉบับร่าง Version ${discarded.versionNumber} (ลบถาวร)`, request,
    });
    return Response.json(discarded);
  } catch (error) {
    return Response.json({ error: error.message || 'ยกเลิกฉบับร่างไม่สำเร็จ' }, {
      status: error instanceof WorkflowTemplateError ? error.status : 500,
    });
  }
}
