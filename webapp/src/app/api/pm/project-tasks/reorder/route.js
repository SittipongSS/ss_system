import { pmEditScope, inScope } from '@/lib/permissions';
import { reindexByOrder } from '@/lib/pm/reorder';
import { withUser, ok, fail, forbidden, notFound, badRequest, conflict } from '@/lib/http';
import { projectWriteBlockedError } from '@/lib/pm/projectClose';

export const dynamic = 'force-dynamic';

// POST /api/pm/project-tasks/reorder  { projectId, orderedIds: string[] }
// จัดลำดับการแสดงผล (stepOrder) ของขั้นตอนใหม่ตาม orderedIds — cosmetic ล้วน:
// ไม่แตะ predecessors/วันที่ (timeline ขับด้วย dependency graph) จึงไม่กระทบ schedule.
export const POST = withUser(async ({ user, supabase, req }) => {
  const body = await req.json();
  if (!body.projectId || !Array.isArray(body.orderedIds)) {
    return badRequest('ต้องระบุ projectId และ orderedIds');
  }

  const { data: project } = await supabase.from('projects').select('*').eq('id', body.projectId).maybeSingle();
  if (!project) return notFound('ไม่พบโครงการ');
  // จัดลำดับ = แก้โครงแผน → ต้องมีสิทธิ์ full edit (team-scoped) เหมือนการเพิ่ม/ลบขั้น
  if (!inScope(pmEditScope(user?.role), user, project)) return forbidden();
  // ด่านหลังปิด (เฟส F): โครงการ closed จัดลำดับขั้นตอนไม่ได้ — ต้อง reopen ผ่าน /close ก่อน
  const closedErr = projectWriteBlockedError(project);
  if (closedErr) return conflict(closedErr);

  const { data: tasks } = await supabase
    .from('project_tasks').select('id, stepOrder').eq('projectId', body.projectId);
  if (!tasks || !tasks.length) return ok({ changed: 0 });

  const changes = reindexByOrder(tasks, body.orderedIds);
  if (changes.length) {
    await Promise.all(changes.map((c) =>
      supabase.from('project_tasks')
        .update({ stepOrder: c.stepOrder, updatedAt: new Date().toISOString() })
        .eq('id', c.id)
    ));
  }
  return ok({ changed: changes.length });
});
