import { withUser, ok, fail, unauthorized, badRequest, forbidden } from '@/lib/http';
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { canAssignTask } from '@/lib/permissions';
import { normalizeDifficulty } from '@/lib/pm/tasks';
import { canAcknowledgeInquiryMessage, canViewInquiry } from '@/lib/inquiries';

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

  let projectId = body.projectId || null;
  const dealId = body.dealId || null;
  // ลิงก์ย้อนกลับไปเรื่องสอบถามต้นทาง (ปุ่ม "สร้างงานจากคำถาม" — mig 0104)
  let inquiryId = null;
  let inquiryMessageId = null;
  let inquiryRecord = null;
  let inquiryMessage = null;
  if (body.inquiryId) {
    const { data: inq } = await supabase.from('inquiries').select('*').eq('id', body.inquiryId).maybeSingle();
    if (!inq) return badRequest('ไม่พบเรื่องสอบถามต้นทาง');
    if (!canViewInquiry(user, inq)) return forbidden('ไม่มีสิทธิ์ใช้เรื่องสอบถามนี้สร้างงาน');
    inquiryRecord = inq;
    inquiryId = inq.id;
    if (body.inquiryMessageId) {
      const { data: message } = await supabase.from('inquiry_messages').select('*')
        .eq('id', body.inquiryMessageId).eq('inquiryId', inquiryId).is('deletedAt', null).maybeSingle();
      if (!message) return badRequest('ไม่พบข้อความต้นทาง');
      inquiryMessageId = message.id;
      inquiryMessage = message;
    }
  }

  // ── มอบหมาย: ตรวจสิทธิ์ตามลำดับชั้น (ไม่ผูกกับโครงการ) ──
  let assigneeId = null;
  let assignedBy = null;
  if (body.assigneeId && body.assigneeId !== user.id) {
    const { data: au } = await supabase.auth.admin.getUserById(body.assigneeId);
    if (!au?.user) return badRequest('ไม่พบผู้รับมอบหมาย');
    const assignee = {
      id: body.assigneeId,
      team: au.user.app_metadata?.team ?? null,
      department: au.user.app_metadata?.department ?? null, // rd มอบภายในฝ่ายเดียวกัน
    };
    if (!canAssignTask(user, assignee)) return forbidden('ไม่มีสิทธิ์มอบหมายงานให้ผู้ใช้นี้');
    assigneeId = body.assigneeId;
    assignedBy = user.id;
  }

  // อ้างอิงโครงการ/ดีลต้องมีจริง (logical link — เช็กกันข้อมูลเสีย).
  if (dealId) {
    const { data: deal } = await supabase.from('sales_deals').select('id, projectId').eq('id', dealId).maybeSingle();
    if (!deal) return badRequest('ไม่พบดีล');
    if (deal.projectId) {
      if (projectId && projectId !== deal.projectId) return badRequest('ดีลไม่ได้อยู่ในโครงการที่ระบุ');
      projectId = deal.projectId;
    } else if (projectId) {
      return badRequest('ดีลนี้ยังไม่ผูกโครงการ จึงระบุโครงการร่วมกันไม่ได้');
    }
  }
  if (projectId) {
    const { data: proj } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle();
    if (!proj) return badRequest('ไม่พบโครงการ');
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
    inquiryId,
    inquiryMessageId,
    completedAt: status === 'Completed' ? today() : null,
  };
  if (assigneeId) { row.assigneeId = assigneeId; row.assignedBy = assignedBy; }

  const { data, error } = await supabase.from('personal_tasks').insert(row).select().single();
  if (error) return fail(error.message, 500);
  if (inquiryMessageId && canAcknowledgeInquiryMessage(user, inquiryRecord, inquiryMessage)) {
    await supabase.from('inquiry_messages').update({ acknowledgedBy: user.id, acknowledgedAt: new Date().toISOString() }).eq('id', inquiryMessageId);
  }
  await recordAudit({ user, action: 'create', entityType: 'task', entityId: data.id, after: data, request: req });
  return ok(data, 201);
});
