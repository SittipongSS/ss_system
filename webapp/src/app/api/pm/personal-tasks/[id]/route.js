import { can, canAssignTask, canPullTask, canReleaseTask, canChangeTaskStatus, canChangeTaskAssignee, normalizeRole, userTeams } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, notFound, badRequest } from '@/lib/http';
import { pickFields } from '@/lib/validate';
import { recordAudit } from '@/lib/audit';
import { PERSONAL_TASK_STATUSES, TASK_STATUS_BLOCKED, TASK_STATUS_COMPLETED, normalizeDifficulty } from '@/lib/pm/tasks';
import { UNLOCK_PATCH, chainBlockReason, chainStatusOnLink, followersToUnlock } from '@/lib/pm/taskChain';
import { canManagePersonalTask, canViewPersonalTask, personalTaskResponsibleIdentity } from '@/lib/pm/personalTaskAccess';
import { purgeAttachments } from '@/lib/master/attachments';
import { canLinkTaskToDeal, requiresDealLink } from '@/lib/pm/taskDealScope';
import { autoTaskUpdates } from '@/lib/pm/taskUpdates';
import { dealTaskUpdate } from '@/lib/sales/dealUpdates';
import { appendUpdate, listUpdates, purgeUpdates } from '@/lib/master/updates';
import { notifyTaskAssigned } from '@/lib/pm/taskAssignNotify';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

const EDITABLE = [
  'title', 'note', 'startDate', 'dueDate', 'status', 'category',
  'important', 'urgent', 'difficulty', 'projectId', 'dealId', 'assigneeId',
  'predecessorId', 'blockedReason',
];

// ฟิลด์ที่ "ผู้รับผิดชอบแต่ไม่ใช่ผู้ดูแลงาน" แก้ได้ — blockedReason ต้องมาคู่กับ status
// เสมอ (เข้าสถานะรอคนอื่นต้องบอกว่ารออะไร) ถ้าไม่นับรวม คนที่แก้ได้แค่สถานะจะเลือก
// "รอคนอื่น" ไม่ได้เลยทั้งที่เป็นคนที่รู้ว่าติดอะไรอยู่
const STATUS_FIELDS = ['status', 'blockedReason'];

const today = () => businessDate();

async function loadTask(supabase, id) {
  const { data } = await supabase.from('personal_tasks').select('*').eq('id', id).maybeSingle();
  return data || null;
}

// GET /api/pm/personal-tasks/[id] — แหล่งข้อมูลกลางของหน้า Detail งาน
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user || !can(user.role, 'pm:view')) return forbidden();
  const { id } = await ctx.params;
  const task = await loadTask(supabase, id);
  if (!task) return notFound('ไม่พบงาน');

  const manage = await canManagePersonalTask(supabase, task, user);
  if (!(await canViewPersonalTask(supabase, task, user))) return forbidden();
  let linkedProject = null;
  let linkedDeal = null;
  let linkedInquiry = null;
  if (task.projectId) {
    const { data } = await supabase.from('projects').select('id, code, name, customerName, team, aeOwner').eq('id', task.projectId).maybeSingle();
    linkedProject = data || null;
  }
  if (task.dealId) {
    // ownerId มาด้วยเสมอ — หน้ารายละเอียดงานใช้แปลงเป็นชื่อ *ปัจจุบัน* ของเจ้าของดีล
    const { data } = await supabase.from('sales_deals').select('id, title, customerName, team, ownerId, ownerName, projectId').eq('id', task.dealId).maybeSingle();
    linkedDeal = data || null;
  }
  if (task.inquiryId) {
    const { data } = await supabase.from('dept_requests')
      .select('id, docNo, kind, title, status').eq('id', task.inquiryId).maybeSingle();
    linkedInquiry = data || null;
  }
  // สายงาน (mig 0266) — ใบก่อนหน้า 1 ใบ + ใบที่ต่อจากงานนี้กี่ใบก็ได้
  // เอาแค่ 4 ฟิลด์: การ์ดสายงานโชว์แค่ชื่อ/สถานะ/กำหนด ไม่ต้องดึงทั้งแถว
  let predecessor = null;
  if (task.predecessorId) {
    const { data } = await supabase.from('personal_tasks')
      .select('id, title, status, dueDate').eq('id', task.predecessorId).maybeSingle();
    predecessor = data || null;
  }
  const { data: followerRows } = await supabase.from('personal_tasks')
    .select('id, title, status, dueDate').eq('predecessorId', id).order('createdAt', { ascending: true });

  const userIds = [...new Set([task.ownerId, task.assigneeId, task.proxyBy, task.assignedBy].filter(Boolean))];
  const people = {};
  await Promise.all(userIds.map(async (userId) => {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const meta = data?.user?.user_metadata || {};
    people[userId] = meta.name || data?.user?.email || userId;
  }));

  return ok({
    ...task,
    project: linkedProject,
    deal: linkedDeal,
    inquiry: linkedInquiry,
    predecessor,
    followers: followerRows || [],
    people,
    canManage: !!manage,
    canChangeStatus: canChangeTaskStatus(user, task, manage),
    // เธรดอัปเดต (mig 0163 — ตารางกลาง) ส่งมากับงานเลยเพื่อให้หน้ารายละเอียดมีตัวนับ
    // ตั้งแต่เฟรมแรก; ตัว UpdateThread โหลดของมันเองผ่าน /api/updates อีกที
    updates: await listUpdates(supabase, 'personal_task', id),
    // โพสต์อัปเดตได้ = คนที่เกี่ยวข้องกับงานจริง (ผู้ดูแล/ผู้รับผิดชอบ/ผู้ทำแทน)
    canPostUpdate: !!manage || canChangeTaskStatus(user, task, manage),
    // ตัวตนผู้เรียก — โมดัลแก้งานใช้ (กันเลือกมอบหมายให้ตัวเอง/ป้ายทีม) หน้า detail
    // จะได้ไม่ต้องยิง /api/pm/my-work ทั้งก้อนมาเอาแค่ 3 ฟิลด์
    // department ต้องติดมาด้วย — หน้ารายละเอียดกรองรายชื่อมอบหมายด้วย canAssignTask
    // ซึ่งเทียบฝ่ายเป็นด่านแรก
    me: { id: user.id, role: user.role, team: user.team ?? null, teams: user.teams ?? [], department: user.department ?? null },
  });
});

// PATCH /api/pm/personal-tasks/[id]
//   • responsibilityAction 'take' — ยืนยันรับช่วงและย้ายผู้รับผิดชอบเป็นผู้กด
//   • proxyAction 'release' — รองรับคืนงานทำแทนของข้อมูลเก่า
//   • เปลี่ยน "สถานะ" อย่างเดียว — เจ้าของ/ผู้รับมอบ/ผู้ทำแทน (proxyBy)/หัวหน้า
//   • แก้ฟิลด์อื่น (ชื่อ/กำหนด/มอบหมาย/ลบ) — full authority (canManage) เท่านั้น
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return forbidden();
  const { id } = await ctx.params;
  const task = await loadTask(supabase, id);
  if (!task) return notFound('ไม่พบงาน');

  const body = await req.json();

  // ── รับช่วงงาน: ย้าย assignee จริงทันที (ไม่สร้าง proxyBy ใหม่) ──
  // รองรับ proxyAction=pull จาก client รุ่นเก่า แต่ให้ผลแบบใหม่เหมือน take.
  if (body.responsibilityAction === 'take' || body.proxyAction === 'pull') {
    const resp = await personalTaskResponsibleIdentity(supabase, task);
    if (!canPullTask(user, task, resp.team, resp.department)) return forbidden('ดึงงานนี้มาเป็นผู้รับผิดชอบไม่ได้');
    const takeoverUpdate = {
      assigneeId: user.id,
      assignedBy: user.id,
      proxyBy: null,
      updatedBy: user.id,
      updatedAt: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('personal_tasks').update(takeoverUpdate).eq('id', id).select().single();
    if (error) return fail(error.message, 500);
    await recordAudit({ user, action: 'update', entityType: 'task', entityId: id, before: task, after: data, request: req });
    /* ดึงงานมาเองก็คืองานเปลี่ยนมือ — คนที่ถืออยู่เดิมกับเจ้าของงานต้องรู้ ไม่งั้น
       สองคนทำงานใบเดียวกันพร้อมกัน · ตัวคนดึงไม่ได้แจ้งตัวเอง (ดู taskAssignNotices) */
    if ((data.assigneeId || null) !== (task.assigneeId || null)) {
      await appendUpdate(supabase, {
        entityType: 'personal_task',
        entityId: id,
        kind: 'assign',
        body: `${user.name || 'ผู้ใช้'} รับช่วงงานนี้`,
        meta: { field: 'assigneeId', from: task.assigneeId || null, to: data.assigneeId || null, takeover: true },
        user,
      });
      notifyTaskAssigned(supabase, {
        task: data,
        actorId: user.id,
        actorName: user.name,
        previousAssigneeId: task.assigneeId || null,
        assigneeName: user.name || null,
      });
    }
    return ok(data);
  }

  // ข้อมูลเก่าที่มี proxyBy ยังคืนงานได้จนกว่าจะถูกย้าย/ล้างหมด
  if (body.proxyAction === 'release') {
    const manage = await canManagePersonalTask(supabase, task, user);
    if (!canReleaseTask(user, task, manage)) return forbidden('คืนงานนี้ไม่ได้');
    const proxyUpdate = { proxyBy: null };
    proxyUpdate.updatedBy = user.id;
    proxyUpdate.updatedAt = new Date().toISOString();
    const { data, error } = await supabase.from('personal_tasks').update(proxyUpdate).eq('id', id).select().single();
    if (error) return fail(error.message, 500);
    await recordAudit({ user, action: 'update', entityType: 'task', entityId: id, before: task, after: data, request: req });
    return ok(data);
  }

  const manage = await canManagePersonalTask(supabase, task, user);
  const updates = pickFields(body, EDITABLE, {
    nullable: ['startDate', 'dueDate', 'projectId', 'dealId', 'assigneeId', 'category', 'predecessorId', 'blockedReason'],
  });

  // สิทธิ์แบบ 2 ระดับ: เปลี่ยน "สถานะ" อย่างเดียว → ผู้ทำแทน/ผู้รับผิดชอบ/หัวหน้าก็ได้;
  // แก้ฟิลด์อื่นใด ๆ → ต้องมี full authority.
  const keys = Object.keys(updates);
  const statusOnly = keys.length > 0 && keys.every((k) => STATUS_FIELDS.includes(k)) && keys.includes('status');
  if (statusOnly) {
    if (!canChangeTaskStatus(user, task, manage)) return forbidden('ต้องดึงงานมาทำแทนก่อนจึงปรับสถานะได้');
  } else if (!manage) {
    return forbidden();
  }

  if ('difficulty' in updates) updates.difficulty = normalizeDifficulty(updates.difficulty);
  if ('important' in updates) updates.important = !!updates.important;
  if ('urgent' in updates) updates.urgent = !!updates.urgent;
  if ('status' in updates && !PERSONAL_TASK_STATUSES.includes(updates.status)) {
    return badRequest('สถานะงานไม่ถูกต้อง');
  }

  // ── งานก่อนหน้าในสาย (mig 0266) ────────────────────────────────────────
  // ต้องเห็นงานนั้นจริง + ห้ามผูกวน (งานรอตัวเอง = ไม่มีทางปลดล็อกได้เลย)
  /* ⚠️ ต้องเทียบว่า **ลิงก์เปลี่ยนจริงไหม** ไม่ใช่แค่ "มีคีย์นี้ในคำขอ" — client ที่
     ส่งทั้งแถวกลับมา (ค่าเดิมเป๊ะ) จะทำให้กติกา "ผูกกับใบที่ยังไม่ปิด = ล็อก" ทำงานซ้ำ
     แล้วดึงงานที่คนปลดไปทำแล้วกลับเข้าสถานะ "รอคนอื่น" เงียบ ๆ พร้อมรีเซ็ตวันเริ่มรอ */
  const predecessorChanged = 'predecessorId' in updates
    && (updates.predecessorId || null) !== (task.predecessorId || null);
  let predecessor = null;
  if (predecessorChanged && updates.predecessorId) {
    if (updates.predecessorId === id) return badRequest('ผูกงานให้ต่อจากตัวเองไม่ได้');
    const { data: prev, error: prevError } = await supabase
      .from('personal_tasks').select('*').eq('id', updates.predecessorId).maybeSingle();
    if (prevError) return fail(prevError.message, 500);
    if (!prev) return badRequest('ไม่พบงานก่อนหน้า');
    if (!(await canViewPersonalTask(supabase, prev, user))) return forbidden('ไม่มีสิทธิ์ผูกกับงานก่อนหน้านี้');
    // ไล่สายขึ้นไปกันวงรอบ — สายงานจริงสั้น เพดาน 20 ชั้นเหลือเฟือและกัน loop ไม่รู้จบ
    let cursor = prev;
    for (let hop = 0; cursor?.predecessorId && hop < 20; hop += 1) {
      if (cursor.predecessorId === id) return badRequest('ผูกแล้วสายงานจะวนกลับมาที่งานนี้');
      const { data: up } = await supabase
        .from('personal_tasks').select('id, predecessorId').eq('id', cursor.predecessorId).maybeSingle();
      cursor = up || null;
    }
    predecessor = prev;
  }

  // ── สถานะ "รอคนอื่น": ต้องรู้ว่ารออะไร และรู้ว่าเริ่มรอเมื่อไร ──────────
  const nextStatus = 'status' in updates ? updates.status : task.status;
  const statusChanged = nextStatus !== task.status;
  // ผูกงานก่อนหน้าที่ยังไม่เสร็จ = ล็อกให้เองทันที (ผู้ใช้ไม่ต้องกดสถานะเอง)
  const chain = predecessor ? chainStatusOnLink(nextStatus, predecessor, today()) : null;
  if (chain) {
    updates.status = chain.status;
    updates.blockedReason = updates.blockedReason || chain.blockedReason;
    updates.blockedSince = chain.blockedSince;
  } else if (nextStatus === TASK_STATUS_BLOCKED) {
    // ครอบทั้ง "เพิ่งเข้าสถานะนี้" และ "อยู่ในสถานะนี้แล้วแก้เหตุผล" — สายหลังเคยหลุด
    // ทุกด่าน (ไม่ตัดช่องว่าง ไม่ตัดความยาว และลบเหตุผลทิ้งด้วยสตริงว่างได้)
    const reason = (('blockedReason' in updates ? updates.blockedReason : task.blockedReason) || '').trim();
    if (!reason) return badRequest('งานที่รอคนอื่น ต้องระบุว่ารออะไร/รอใคร');
    updates.blockedReason = reason.slice(0, 1000);
    updates.blockedSince = task.blockedSince || today();
  } else if (statusChanged && task.status === TASK_STATUS_BLOCKED) {
    // ออกจากสถานะรอ = ล้างของที่ค้าง ไม่งั้นงานที่เดินต่อแล้วยังโชว์ว่ารออะไรอยู่
    updates.blockedReason = null;
    updates.blockedSince = null;
  } else if (predecessorChanged && !updates.predecessorId && task.status === TASK_STATUS_BLOCKED) {
    /* ปลดสายงานทิ้งทั้งที่งานยังติดล็อกอยู่ — ถ้าเหตุผลที่ค้างคือเหตุผลของสายงาน
       (ระบบเขียนเอง) ต้องปลดตามไปด้วย ไม่งั้นงานค้างรอ "งานที่ไม่ได้ผูกแล้ว" ตลอดไป
       เทียบข้อความตรง ๆ เพื่อไม่ไปแตะงานที่คนพิมพ์เหตุผลของตัวเองไว้ (เช่น รอลูกค้า) */
    const { data: oldPrev } = await supabase
      .from('personal_tasks').select('id, title').eq('id', task.predecessorId).maybeSingle();
    if ((task.blockedReason || '') === chainBlockReason(oldPrev?.title)) Object.assign(updates, UNLOCK_PATCH);
  }

  // เปลี่ยนผู้รับมอบ → ตรวจสิทธิ์มอบหมายตามลำดับชั้น (canAssignTask) + เซ็ต assignedBy.
  let assigneeName = null;   // ชื่อผู้รับคนใหม่ — ใช้เล่าให้คนที่งานหลุดมือฟัง
  if ('assigneeId' in updates) {
    const next = updates.assigneeId || null;
    if (!canChangeTaskAssignee(task, next)) {
      return badRequest('งานที่เสร็จแล้วไม่สามารถเปลี่ยนผู้รับผิดชอบได้ กรุณาเปิดงานอีกครั้งก่อน');
    }
    if (next && next !== user.id) {
      const { data: au, error: auError } = await supabase.auth.admin.getUserById(next);
      if (auError) return fail(auError.message, 500);
      if (!au?.user) return badRequest('ไม่พบผู้รับมอบหมาย');
      const assignee = {
        id: next,
        team: au.user.app_metadata?.team ?? null,
        // ต้องมี teams — canAssignTask ตัดชุดทีมสองฝั่ง (ดู personal-tasks/route.js)
        teams: userTeams(au.user.app_metadata),
        // role ต้องส่งไปด้วย — ฝ่ายส่วนใหญ่ไม่ได้ตั้งไว้ตรง ๆ canAssignTask อนุมานจาก role ให้
        role: normalizeRole(au.user.app_metadata?.role) ?? null,
        department: au.user.app_metadata?.department ?? null,
      };
      if (!canAssignTask(user, assignee)) return forbidden('ไม่มีสิทธิ์มอบหมายงานให้ผู้ใช้นี้');
      updates.assignedBy = user.id;
      assigneeName = au.user.user_metadata?.name || au.user.email || null;
    } else {
      updates.assignedBy = null; // ถอนการมอบหมาย / มอบให้ตัวเอง
      // มอบให้ตัวเอง = ชื่อผู้รับคือคนที่กดอยู่นี่เอง — ไม่ได้ไปดึงจาก auth เพราะ
      // ด่านข้างบนข้ามมา ⇒ ถ้าไม่เซ็ตตรงนี้ คนที่งานหลุดมือจะอ่านว่า "ให้คนอื่น"
      if (next) assigneeName = user.name || null;
    }
    // A real reassignment supersedes the old temporary-proxy workflow. Without
    // clearing this, UI/KPI would still treat the legacy proxy as responsible.
    if (next !== (task.assigneeId || null)) updates.proxyBy = null;
  }

  // อ้างอิงโครงการ/ดีลต้องมีจริงและต้องเป็นคู่เดียวกัน. ถ้าเลือกดีลที่อยู่ใน
  // โครงการ ระบบ mirror projectId ให้เอง เพื่อให้งานขึ้นทั้งหน้าดีลและหน้าโครงการ.
  if ('projectId' in updates || 'dealId' in updates) {
    let nextProjectId = 'projectId' in updates ? updates.projectId : task.projectId;
    const nextDealId = 'dealId' in updates ? updates.dealId : task.dealId;
    // ทุกงานต้องผูกดีล (มติผู้ใช้ 2026-08-06) — ปลดดีลออกไม่ได้ และงานเก่าที่ยังไม่ผูก
    // ต้องเลือกดีลตอนแก้ครั้งถัดไป. เกณฑ์คือ**คนที่กดแก้** (แบบเดียวกับตอนสร้าง):
    // ไม่มีข้อยกเว้นตาม role. งานที่มาจากคำร้องยกเว้นเหมือนตอนสร้าง
    // ⚠️ ด่านนี้ทำงานเฉพาะเมื่อคำขอแตะ projectId/dealId — การอัปเดตสถานะอย่างเดียว
    // (statusOnly) ต้องผ่านได้เสมอ ไม่งั้นคนที่แก้ได้แค่สถานะจะติดกับงานเก่าที่ไม่มีดีล
    // ผ่อนเป็น "ทางออกที่ต้องกดเอง" 2026-08-08 — เหมือนตอนสร้าง (ดู POST route)
    if (!nextDealId && !task.inquiryId && !body.noDealLink && requiresDealLink(user)) {
      return badRequest('ทุกงานต้องผูกดีล — เลือกดีล หรือปิดสวิตช์ "ผูกดีล" ถ้างานนี้ไม่ได้เกิดจากดีล');
    }
    if (nextDealId) {
      const { data: deal, error: dealError } = await supabase.from('sales_deals').select('id, projectId, team').eq('id', nextDealId).maybeSingle();
      if (dealError) return fail(dealError.message, 500);
      if (!deal) return badRequest('ไม่พบดีล');
      if (nextDealId !== task.dealId && !canLinkTaskToDeal(user, deal)) return forbidden('ผูกงานได้เฉพาะดีลของทีมตัวเอง');
      if (deal.projectId) {
        if (nextProjectId && nextProjectId !== deal.projectId) return badRequest('ดีลไม่ได้อยู่ในโครงการที่ระบุ');
        nextProjectId = deal.projectId;
        updates.projectId = deal.projectId;
      } else if (nextProjectId) {
        return badRequest('ดีลนี้ยังไม่ผูกโครงการ จึงระบุโครงการร่วมกันไม่ได้');
      }
    }
    if (nextProjectId) {
      const { data: proj, error: projError } = await supabase.from('projects').select('id').eq('id', nextProjectId).maybeSingle();
      if (projError) return fail(projError.message, 500);
      if (!proj) return badRequest('ไม่พบโครงการ');
    }
  }

  // จำ "เดดไลน์แรก" ตอนถูกเลื่อนครั้งแรก — เก็บ dueDate เดิมก่อนเปลี่ยน (null = ไม่เคยเลื่อน,
  // หรือเพิ่งตั้งเดดไลน์ครั้งแรกจากว่าง). ครั้งถัดไปไม่ทับ (คงเดดไลน์แรกไว้).
  if ('dueDate' in updates && task.dueDate && updates.dueDate !== task.dueDate && !task.originalDueDate) {
    updates.originalDueDate = task.dueDate;
  }

  // completedAt อัตโนมัติตามการเปลี่ยนสถานะ (เข้า Completed = วันนี้, ออก = ล้าง).
  if ('status' in updates && updates.status !== task.status) {
    updates.completedAt = updates.status === 'Completed' ? today() : null;
    if (updates.status === 'Completed') {
      // ปิดงานที่ "เลยกำหนด" (เทียบเดดไลน์ปัจจุบันกับวันนี้ตามเวลาไทย) ต้องระบุสาเหตุ.
      const effectiveDue = 'dueDate' in updates ? updates.dueDate : task.dueDate;
      const overdue = effectiveDue && String(effectiveDue) < businessDate();
      if (overdue) {
        const reason = (body.lateReason || '').trim();
        if (!reason) return badRequest('งานนี้เลยกำหนดแล้ว — ต้องระบุสาเหตุที่ทำเสร็จช้าก่อนปิดงาน');
        updates.lateReason = reason.slice(0, 1000);
      } else {
        updates.lateReason = null; // เสร็จตรงเวลา = ไม่มีสาเหตุล่าช้า
      }
    } else {
      updates.lateReason = null; // เปิดงานใหม่ = ล้างสาเหตุเดิม
    }
  }

  updates.updatedBy = user.id;
  updates.updatedAt = new Date().toISOString();

  const { data, error } = await supabase.from('personal_tasks').update(updates).eq('id', id).select().single();
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'update', entityType: 'task', entityId: id, before: task, after: data, request: req });

  // ── ปิดงานใบนี้ = ปลดล็อกงานที่ต่อจากมัน (mig 0266) ────────────────────
  // ปลดเฉพาะใบที่ยังติดล็อกอยู่ และคืนเป็น "รอดำเนินการ" ไม่ใช่ "กำลังทำ" — คนต้อง
  // กดเริ่มเอง (กติกาเดียวกับ lib/pm/status.js ของขั้นตอนไทม์ไลน์)
  // ไม่เช็ค error โดยตั้งใจ: ปลดล็อกพลาดต้องไม่ทำให้การปิดงานที่สำเร็จแล้วตีกลับ
  if (task.status !== TASK_STATUS_COMPLETED && data.status === TASK_STATUS_COMPLETED) {
    const { data: followers } = await supabase
      .from('personal_tasks').select('id, title, status').eq('predecessorId', id);
    for (const next of followersToUnlock(followers)) {
      const { data: unlocked, error: unlockError } = await supabase.from('personal_tasks')
        .update({ ...UNLOCK_PATCH, updatedBy: user.id, updatedAt: new Date().toISOString() })
        .eq('id', next.id).select().single();
      if (unlockError || !unlocked) {
        // ตั้งใจไม่ตีกลับ: การปิดงานสำเร็จไปแล้ว ปลดล็อกใบถัดไปเป็นของเสริม
        console.error('[personal-tasks] ปลดล็อกงานต่อเนื่องไม่สำเร็จ', next.id, unlockError?.message);
        continue;
      }
      await appendUpdate(supabase, {
        entityType: 'personal_task', entityId: next.id, kind: 'status',
        body: `ปลดล็อกอัตโนมัติ — งานก่อนหน้า “${data.title}” เสร็จแล้ว เริ่มงานนี้ได้`,
        meta: { field: 'status', from: TASK_STATUS_BLOCKED, to: unlocked.status, predecessorId: id },
        user,
      });
    }
  }

  // เล่าให้ทีมฟังในเธรดงาน: เปลี่ยนสถานะ / เลื่อนกำหนด / สาเหตุที่เสร็จช้า / รออะไรอยู่
  // (คนละหน้าที่กับ audit — audit คือใครแก้อะไร supervisor อ่าน)
  for (const u of autoTaskUpdates(task, data, { lateReason: updates.lateReason, blockedReason: statusChanged && data.status === TASK_STATUS_BLOCKED ? data.blockedReason : null })) {
    // ไม่เช็ค error โดยตั้งใจ — ฟีดพลาดต้องไม่ทำให้การบันทึกงานพังตาม
    await appendUpdate(supabase, { entityType: 'personal_task', entityId: id, ...u, user });
  }

  /* ── งานเปลี่ยนมือ (มติผู้ใช้ 2026-08-20) ──────────────────────────────
     เดิมเงียบสนิท: `autoTaskUpdates` ดูแค่ status/dueDate/lateReason/blockedReason
     ⇒ ไม่มีทั้งแถวในเธรดและแจ้งเตือน · คนที่ถูกมอบงานรู้ตัวเองไม่ได้เลย
     แถวในเธรดเป็นชนิด quiet — การเด้งอยู่ที่ notifyTaskAssigned (คนละข้อความสำหรับ
     คนที่งานเข้ามือกับคนที่งานหลุดมือ) ไม่งั้นหนึ่งการกระทำเด้งสองใบ */
  if ((data.assigneeId || null) !== (task.assigneeId || null)) {
    // ไม่เช็ค error โดยตั้งใจ — ฟีดพลาดต้องไม่ทำให้การบันทึกงานพังตาม
    await appendUpdate(supabase, {
      entityType: 'personal_task',
      entityId: id,
      kind: 'assign',
      body: data.assigneeId ? `มอบหมายให้ ${assigneeName || 'ผู้ใช้'}` : 'ถอนการมอบหมาย',
      meta: { field: 'assigneeId', from: task.assigneeId || null, to: data.assigneeId || null },
      user,
    });
    notifyTaskAssigned(supabase, {
      task: data,
      actorId: user.id,
      actorName: user.name,
      previousAssigneeId: task.assigneeId || null,
      assigneeName,
    });
  }

  // ── เงาบนเธรดของดีลที่ผูกอยู่ ────────────────────────────────────────
  // ⚠️ **เอาเฉพาะ "งานเสร็จ" กับ "เหตุผลที่เสร็จช้า"** — ไม่ใช่ทุกการเปลี่ยนสถานะ
  // เธรดงานคือเธรดที่เสียงดังที่สุดในระบบ (92% ของแถวเป็นเหตุการณ์ระบบ) ยกมาหมด
  // เมื่อไรเธรดดีลจมทันที · และ **ไม่ยกเนื้อข้อความในเธรดงาน** เพราะด่านของงาน
  // แคบกว่าด่านของดีล — ที่ยกมาได้คือระดับหัวข้อเท่านั้น
  if (data.dealId) {
    const done = task.status !== 'Completed' && data.status === 'Completed';
    const event = updates.lateReason
      ? dealTaskUpdate('late', data, { lateReason: updates.lateReason })
      : (done ? dealTaskUpdate('done', data) : null);
    if (event) await appendUpdate(supabase, { entityType: 'deal', entityId: data.dealId, ...event, user });
  }
  return ok(data);
});

// DELETE /api/pm/personal-tasks/[id] — เจ้าของ/ผู้รับมอบ/หัวหน้าทีม/แอดมิน.
export const DELETE = withUser(async ({ user, supabase, ctx, req }) => {
  const { id } = await ctx.params;
  const task = await loadTask(supabase, id);
  if (!task) return notFound('ไม่พบงาน');
  if (!(await canManagePersonalTask(supabase, task, user))) return forbidden();

  /* งานที่ต่อจากใบนี้ต้องไม่ค้างรอ "งานที่ไม่มีอยู่แล้ว" (ลิงก์เป็น logical ไม่มี FK)
     — ปลดล็อกใบที่ยังติดอยู่ แล้วตัดสายให้ทุกใบ ก่อนลบตัวมันเอง */
  const { data: followers } = await supabase
    .from('personal_tasks').select('id, title, status').eq('predecessorId', id);
  for (const next of followersToUnlock(followers)) {
    await supabase.from('personal_tasks')
      .update({ ...UNLOCK_PATCH, updatedBy: user.id, updatedAt: new Date().toISOString() })
      .eq('id', next.id);
  }
  if (followers?.length) {
    await supabase.from('personal_tasks').update({ predecessorId: null }).eq('predecessorId', id);
  }

  await purgeAttachments('personal_task', id);
  // entity_updates ไม่มี FK (polymorphic) — ต้องเก็บกวาดเอง ไม่งั้นเธรดค้างเป็นขยะ
  await purgeUpdates(supabase, 'personal_task', id);

  const { error } = await supabase.from('personal_tasks').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'delete', entityType: 'task', entityId: id, before: task, request: req });
  return ok({ success: true });
});
