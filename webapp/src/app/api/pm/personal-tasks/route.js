import { withUser, ok, fail, unauthorized, badRequest } from '@/lib/http';

export const dynamic = 'force-dynamic';

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

// POST /api/pm/personal-tasks — สร้างงาน.
//  - ผูกโปรเจกต์ (projectId) → "งานเพิ่มเติม": มอบหมาย (assigneeId) ให้คนในทีมของ
//    โปรเจกต์ได้ เห็นร่วมกันทั้งโปรเจกต์.
//  - ไม่ผูกโปรเจกต์ → "งานส่วนตัว": เห็นเฉพาะเจ้าของ, ห้ามตั้ง assignee.
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();

  const body = await req.json();
  if (!body.title || !body.title.trim()) {
    return badRequest('ต้องระบุชื่องาน');
  }

  const projectId = body.projectId || null;
  // assignee มีความหมายเฉพาะงานที่ผูกโปรเจกต์ และต้องเป็นคนในทีมเดียวกับโปรเจกต์.
  // ผู้ใช้อยู่ใน Supabase Auth (team อยู่ใน app_metadata) ไม่ใช่ตาราง — อ่านผ่าน admin API.
  let assigneeId = null;
  if (projectId && body.assigneeId) {
    const { data: proj } = await supabase.from('projects').select('team').eq('id', projectId).maybeSingle();
    const { data: au } = await supabase.auth.admin.getUserById(body.assigneeId);
    const assigneeTeam = au?.user?.app_metadata?.team ?? null;
    if (!au?.user || (proj && assigneeTeam !== proj.team)) {
      return badRequest('ผู้รับมอบต้องอยู่ทีมเดียวกับโปรเจกต์');
    }
    assigneeId = body.assigneeId;
  }

  const row = {
    id: 'PST-' + Date.now().toString(36),
    ownerId: user.id,
    title: body.title.trim(),
    note: body.note || '',
    dueDate: body.dueDate || null,
    status: body.status || 'Pending',
    projectId,
  };
  // ใส่ assigneeId เฉพาะเมื่อมีค่า — กันพังถ้ายังไม่ได้รัน migration 0026 (คอลัมน์ยังไม่มี)
  // สำหรับงานทั่วไป/งานส่วนตัว; การมอบหมายจริงต้องรัน migration ก่อน
  if (assigneeId) row.assigneeId = assigneeId;
  const { data, error } = await supabase.from('personal_tasks').insert(row).select().single();
  if (error) return fail(error.message, 500);
  return ok(data, 201);
});
