import { viewScope, inScope, can } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, notFound, unauthorized } from '@/lib/http';
import { loadProject } from '@/lib/pm/projectsRepo';

export const dynamic = 'force-dynamic';

// GET /api/pm/projects/[id]/revisions/[revNo] — snapshot เต็มของเวอร์ชัน (ไว้ดู/พิมพ์ย้อนหลัง)
export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id, revNo } = await ctx.params;

  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view')) return forbidden(); // legal/unknown ไม่มีสิทธิ์ดู snapshot PM

  const project = await loadProject(supabase, id);
  if (!project) return notFound('ไม่พบโปรเจกต์');
  if (viewScope(user?.role) === 'team' && !inScope('team', user, project)) {
    return forbidden();
  }

  const n = Number(revNo);
  if (!Number.isInteger(n)) return notFound('เลขเวอร์ชันไม่ถูกต้อง'); // กัน Number(null/NaN)→0/NaN

  // เดิมใช้ .maybeSingle() — ถ้า revNo ซ้ำ (ไม่มี unique constraint + race ตอนออก Rev)
  // จะ throw "multiple rows". ใช้ order+limit เลือกตัวล่าสุดแทน + กรอง kind='rev'
  // (save row มี revNo=null อยู่แล้ว — กันพลาดหยิบมา).
  const { data, error } = await supabase
    .from('project_doc_revisions')
    .select('*')
    .eq('projectId', project.id)
    .eq('revNo', n)
    .eq('kind', 'rev')
    .order('createdAt', { ascending: false })
    .limit(1);
  if (error) return fail(error.message, 500);
  const row = (data || [])[0];
  if (!row) return notFound('ไม่พบเวอร์ชันเอกสาร');

  return ok(row);
});
