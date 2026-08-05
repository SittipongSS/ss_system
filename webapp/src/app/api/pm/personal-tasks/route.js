import { withUser, ok, fail, unauthorized, badRequest, forbidden } from '@/lib/http';
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { can, canAssignTask, isReadOnlyObserver } from '@/lib/permissions';
import { normalizeDifficulty } from '@/lib/pm/tasks';
import { canViewRequest } from '@/lib/deptRequests';
import { canLinkTaskToDeal, requiresDealLink } from '@/lib/pm/taskDealScope';
import { appendUpdate } from '@/lib/master/updates';
import { dealTaskUpdate } from '@/lib/sales/dealUpdates';

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
  if (!can(user.role, 'pm:view') || isReadOnlyObserver(user.role)) return forbidden();

  const body = await req.json();
  if (!body.title || !body.title.trim()) {
    return badRequest('ต้องระบุชื่องาน');
  }

  let projectId = body.projectId || null;
  let dealId = body.dealId || null;
  // ลิงก์ย้อนกลับไปคำร้องต้นทาง (ปุ่ม "สร้างงานจากคำถาม")
  // ⚠️ คอลัมน์ยังชื่อ inquiryId ตามชื่อระบบเดิม — เป็น logical link ไม่มี FK
  // เปลี่ยนชื่อคอลัมน์ต้องออก migration + ไล่แก้ทั้งสาย ยกไว้เป็นหนี้ที่รู้ตัว
  let inquiryId = null;
  let inquiryMessageId = null;
  let inquiryRecord = null;
  let inquiryMessage = null;
  if (body.inquiryId) {
    const { data: inq, error: inqError } = await supabase.from('dept_requests').select('*').eq('id', body.inquiryId).maybeSingle();
    if (inqError) return fail(inqError.message, 500);
    if (!inq) return badRequest('ไม่พบคำร้องต้นทาง');
    if (!canViewRequest(user, inq)) return forbidden('ไม่มีสิทธิ์ใช้คำร้องนี้สร้างงาน');
    inquiryRecord = inq;
    dealId = inq.dealId || null;
    projectId = inq.projectId || null;
    inquiryId = inq.id;
    if (body.inquiryMessageId) {
      // 🐞 เคยอ่าน `inquiry_messages` ซึ่งถูก DROP ไปใน mig 0174 — เธรดของคำร้อง
      // อยู่ในตารางกลาง `entity_updates` แล้ว (entityType='dept_request') · เส้นนี้
      // จึงตอบ "ไม่พบข้อความต้นทาง" เสมอ ทั้งที่ฝั่งเขียนด้านล่างชี้ตารางกลางถูกอยู่แล้ว
      const { data: message, error: msgError } = await supabase.from('entity_updates').select('*')
        .eq('id', body.inquiryMessageId)
        .eq('entityType', 'dept_request').eq('entityId', inquiryId)
        .is('deletedAt', null).maybeSingle();
      if (msgError) return fail(msgError.message, 500);
      if (!message) return badRequest('ไม่พบข้อความต้นทาง');
      inquiryMessageId = message.id;
      inquiryMessage = message;
    }
  }

  // ── มอบหมาย: ตรวจสิทธิ์ตามลำดับชั้น (ไม่ผูกกับโครงการ) ──
  let assigneeId = null;
  let assignedBy = null;
  if (body.assigneeId && body.assigneeId !== user.id) {
    const { data: au, error: auError } = await supabase.auth.admin.getUserById(body.assigneeId);
    if (auError) return fail(auError.message, 500);
    if (!au?.user) return badRequest('ไม่พบผู้รับมอบหมาย');
    const assignee = {
      id: body.assigneeId,
      team: au.user.app_metadata?.team ?? null,
      // role ต้องส่งไปด้วย — ฝ่ายส่วนใหญ่ไม่ได้ตั้งไว้ตรง ๆ canAssignTask อนุมานจาก role ให้
      role: au.user.app_metadata?.role ?? null,
      department: au.user.app_metadata?.department ?? null,
    };
    if (!canAssignTask(user, assignee)) return forbidden('ไม่มีสิทธิ์มอบหมายงานให้ผู้ใช้นี้');
    assigneeId = body.assigneeId;
    assignedBy = user.id;
  }

  // อ้างอิงโครงการ/ดีลต้องมีจริง (logical link — เช็กกันข้อมูลเสีย).
  if (dealId) {
    const { data: deal, error: dealError } = await supabase.from('sales_deals').select('id, projectId, team').eq('id', dealId).maybeSingle();
    if (dealError) return fail(dealError.message, 500);
    if (!deal) return badRequest('ไม่พบดีล');
    // งานจาก Inquiry ใช้ดีลต้นทางตามสิทธิ์ของเรื่องนั้น ส่วนการเลือกดีลเองต้องอยู่ทีมเดียวกัน.
    if (!inquiryRecord && !canLinkTaskToDeal(user, deal)) return forbidden('ผูกงานได้เฉพาะดีลของทีมตัวเอง');
    if (deal.projectId) {
      if (projectId && projectId !== deal.projectId) return badRequest('ดีลไม่ได้อยู่ในโครงการที่ระบุ');
      projectId = deal.projectId;
    } else if (projectId) {
      return badRequest('ดีลนี้ยังไม่ผูกโครงการ จึงระบุโครงการร่วมกันไม่ได้');
    }
  }
  if (projectId) {
    const { data: proj, error: projError } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle();
    if (projError) return fail(projError.message, 500);
    if (!proj) return badRequest('ไม่พบโครงการ');
  }

  // ฝ่ายขาย (SA) ต้องผูกดีลทุกงาน — ตัวเลือก "ไม่ผูก" ถูกถอดออกจากฟอร์มแล้ว
  // ยกเว้นงานที่สร้างจากคำร้อง: ดีลมาจากคำร้องต้นทาง ซึ่งบางหัวข้อไม่ผูกดีล
  // โดยเจตนา (เช่น ขอราคา F/FB) — คนสร้างงานเลือกเองไม่ได้ จึงบังคับไม่ได้
  if (!dealId && !inquiryRecord && requiresDealLink(user)) {
    return badRequest('งานของฝ่ายขายต้องผูกดีล — เลือกดีลก่อนบันทึก');
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
  // สร้างงานจากข้อความ = ถือว่า "เห็นแล้ว" — ติดธงรับทราบให้ในจังหวะเดียวกัน
  // (กติกาเดียวกับ /api/updates/[id] action=acknowledge: ใครอ่านเธรดได้ก็รับทราบได้
  //  ซึ่งคนที่มาถึงตรงนี้ผ่าน canViewRequest มาแล้ว)
  if (inquiryMessageId) {
    await supabase.from('entity_updates')
      .update({ acknowledgedBy: user.id, acknowledgedAt: new Date().toISOString() })
      .eq('id', inquiryMessageId);
  }
  // งานที่ผูกดีล = ความเคลื่อนไหวของดีลด้วย — ดีลต้องรู้ว่ามีงานอะไรเปิดค้างอยู่
  // (ยกเฉพาะระดับหัวข้อ ไม่ยกเนื้อในเธรดงาน เพราะด่านของงานแคบกว่าด่านของดีล)
  if (data.dealId) {
    const event = dealTaskUpdate('created', data);
    if (event) await appendUpdate(supabase, { entityType: 'deal', entityId: data.dealId, ...event, user });
  }

  await recordAudit({ user, action: 'create', entityType: 'task', entityId: data.id, after: data, request: req });
  return ok(data, 201);
});
