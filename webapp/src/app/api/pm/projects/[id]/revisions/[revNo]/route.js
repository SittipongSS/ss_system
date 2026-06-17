import { viewScope, inScope } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, notFound } from '@/lib/http';
import { loadProject } from '@/lib/pm/projectsRepo';

export const dynamic = 'force-dynamic';

// GET /api/pm/projects/[id]/revisions/[revNo] — snapshot เต็มของเวอร์ชัน (ไว้ดู/พิมพ์ย้อนหลัง)
export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id, revNo } = await ctx.params;

  const project = await loadProject(supabase, id);
  if (!project) return notFound('ไม่พบโปรเจกต์');
  if (viewScope(user?.role) === 'team' && !inScope('team', user, project)) {
    return forbidden();
  }

  const { data, error } = await supabase
    .from('project_doc_revisions')
    .select('*')
    .eq('projectId', project.id)
    .eq('revNo', Number(revNo))
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return notFound('ไม่พบเวอร์ชันเอกสาร');

  return ok(data);
});
