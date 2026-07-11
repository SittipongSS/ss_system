import { viewScope, can } from '@/lib/permissions';
import { withUser, ok, fail, unauthorized, forbidden } from '@/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/pm/projects — team-scoped list (supervisor sees all).
export const GET = withUser(async ({ user, supabase }) => {
  // PM is a sales-only tool: gate on the pm:view capability (not just scope).
  // legal has viewScope 'all' but no pm:view — without this it would read every
  // team's projects. viewer/staff hold pm:view and pass.
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view')) return forbidden();

  let query = supabase.from('projects').select('*').order('createdAt', { ascending: false });
  if (viewScope(user?.role) === 'team') {
    const team = user?.team ?? '';
    const own = user?.id ?? '';
    query = query.or(`team.eq.${team},ownerId.eq.${own}`);
  }

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  // Attach a lightweight task summary so the list UI can render progress bars,
  // overdue counts and the current step (ss-cj Board/Portfolio look) without a
  // round-trip per project. We only pull the columns those views need.
  const ids = (data || []).map((p) => p.id);
  if (ids.length) {
    const { data: tasks } = await supabase
      .from('project_tasks')
      .select('id, projectId, name, status, finishDate, stepOrder')
      .in('projectId', ids)
      .order('stepOrder', { ascending: true });
    const byProject = {};
    for (const t of tasks || []) (byProject[t.projectId] ??= []).push(t);
    for (const p of data) p.tasks = byProject[p.id] || [];
  }

  return ok(data);
});

// POST /api/pm/projects — ปิดแล้ว (แผน merge เฟส 2): โครงการทุกงานเกิดจาก
// "บริหารงานขาย" (สร้างโครงการ → create-project) หรือ PO สหมิตรเท่านั้น เพื่อให้
// Sales เป็นแม่ และไม่มีโครงการลอยที่ไม่ผูกงานขาย. การแก้ไข (PATCH [id]) ยังทำได้ปกติ.
export const POST = withUser(async ({ user }) => {
  if (!user) return unauthorized();
  return forbidden('สร้างโครงการที่หน้า "บริหารงานขาย" (สร้างโครงการ แล้วกดสร้างงานผลิต) — การสร้างโครงการเดี่ยวในระบบจัดการโครงการถูกปิดแล้ว');
});
