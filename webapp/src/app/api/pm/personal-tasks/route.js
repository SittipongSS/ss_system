import { withUser, ok, fail, unauthorized, badRequest, forbidden } from '@/lib/http';
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { canAssignTask } from '@/lib/permissions';
import { normalizeDifficulty } from '@/lib/pm/tasks';

export const dynamic = 'force-dynamic';

// วันนี้แบบ 'YYYY-MM-DD' (โซนเวลาเซิร์ฟเวอร์) — ใช้เซ็ต completedAt.
const today = () => new Date().toISOString().slice(0, 10);

// GET /api/pm/personal-tasks — งานส่วนตัวของฉันเท่านั้น (เห็นเฉพาะของตัวเอง).
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();

  const { data, error } = await supabase
    .from('personal_tasks')
    .select('*')
    .eq('ownerId', user.id)
    .order('createdAt', { ascending: false });
  if (error) return fail(error.message, 500);
  return ok(data || []);
});

// POST /api/pm/personal-tasks — สร้าง/มอบหมายงาน (Sales Task Management).
//  - มอบหมาย (assigneeId) ตามลำดับชั้น: superuser→ใครก็ได้, sales role→คนในทีมตัวเอง,
//    อื่น ๆ→ตัวเองเท่านั้น (canAssignTask). ไม่ผูกกับการมีโครงการอีกต่อไป.
//  - ผูกได้ทั้งดีล (dealId) และ/หรือโครงการ (projectId) — nullable ทั้งคู่.
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();

  const body = await req.json();
  if (!body.title || !body.title.trim()) {
    return badRequest('ต้องระบุชื่องาน');
  }

  const projectId = body.projectId || null;
  const dealId = body.dealId || null;

  // ── มอบหมาย: ตรวจสิทธิ์ตามลำดับชั้น (ไม่ผูกกับโครงการ) ──
  let assigneeId = null;
  let assignedBy = null;
  if (body.assigneeId && body.assigneeId !== user.id) {
    const { data: au } = await supabase.auth.admin.getUserById(body.assigneeId);
    if (!au?.user) return badRequest('ไม่พบผู้รับมอบหมาย');
    const assignee = { id: body.assigneeId, team: au.user.app_metadata?.team ?? null };
    if (!canAssignTask(user, assignee)) return forbidden('ไม่มีสิทธิ์มอบหมายงานให้ผู้ใช้นี้');
    assigneeId = body.assigneeId;
    assignedBy = user.id;
  }

  // อ้างอิงโครงการ/ดีลต้องมีจริง (logical link — เช็กกันข้อมูลเสีย).
  if (projectId) {
    const { data: proj } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle();
    if (!proj) return badRequest('ไม่พบโครงการ');
  }
  if (dealId) {
    const { data: deal } = await supabase.from('sales_deals').select('id').eq('id', dealId).maybeSingle();
    if (!deal) return badRequest('ไม่พบดีล');
  }

  const status = body.status || 'Pending';
  const row = {
    id: genId('PST'),
    ownerId: user.id,
    title: body.title.trim(),
    note: body.note || '',
    startDate: body.startDate || null,
    dueDate: body.dueDate || null,
    status,
    category: body.category || null,
    important: !!body.important,
    urgent: !!body.urgent,
    difficulty: normalizeDifficulty(body.difficulty),
    projectId,
    dealId,
    completedAt: status === 'Completed' ? today() : null,
  };
  if (assigneeId) { row.assigneeId = assigneeId; row.assignedBy = assignedBy; }

  const { data, error } = await supabase.from('personal_tasks').insert(row).select().single();
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'create', entityType: 'task', entityId: data.id, after: data, request: req });
  return ok(data, 201);
});
