import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { loadWorkflowTemplatesAdmin, WorkflowTemplateError } from '@/lib/admin/workflowTemplates';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    return Response.json({ templates: await loadWorkflowTemplatesAdmin(getSupabaseAdmin()) });
  } catch (error) {
    return Response.json({ error: error.message || 'โหลด Workflow Template ไม่สำเร็จ' }, {
      status: error instanceof WorkflowTemplateError ? error.status : 500,
    });
  }
}
