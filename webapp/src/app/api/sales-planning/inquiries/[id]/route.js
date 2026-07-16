import { genId } from '@/lib/id';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { normalizeDepartment } from '@/lib/permissions';
import {
  canAcknowledgeInquiryMessage, canDeleteInquiry, canEditInquiryRequest,
  canEditInquiryResponse, canMutateInquiryMessage, canRespondInquiry,
  canTakeInquiry, canViewInquiry, inquirySide,
  isInquiryAdmin, resolveInquiryContext,
} from '@/lib/inquiries';

export const dynamic = 'force-dynamic';

const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

async function loadInquiry(supabase, id) {
  const { data } = await supabase.from('inquiries').select('*').eq('id', id).maybeSingle();
  return data || null;
}

async function addStatusMessage(supabase, inquiryId, user, text) {
  await supabase.from('inquiry_messages').insert({
    id: genId('INQM'), inquiryId, kind: 'status', body: text, attachments: [],
    authorId: user.id, authorName: user.name || null,
    authorDept: normalizeDepartment(user.department) || null,
  });
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const inquiry = await loadInquiry(supabase, id);
  if (!inquiry) return notFound('ไม่พบเรื่องสอบถาม');
  if (!canViewInquiry(user, inquiry)) return forbidden();

  const [{ data: rawMessages }, { data: tasks }] = await Promise.all([
    supabase.from('inquiry_messages').select('*').eq('inquiryId', id).order('createdAt', { ascending: true }),
    supabase.from('personal_tasks').select('id, title, status, assigneeId, dueDate, inquiryMessageId').eq('inquiryId', id).order('createdAt', { ascending: true }),
  ]);
  const messages = (rawMessages || []).map((message) => ({
    ...message,
    canEdit: canMutateInquiryMessage(user, inquiry, message),
    canDelete: canMutateInquiryMessage(user, inquiry, message),
    canAcknowledge: canAcknowledgeInquiryMessage(user, inquiry, message),
  }));

  let deal = null;
  let project = null;
  if (inquiry.dealId) {
    const { data } = await supabase.from('sales_deals').select('id, code, title, customerName, customerId, projectId, team, stage, dealType, projectValue, wonValue, probability, expectedCloseDate, forecastMonth, ownerName, formulaName, createdAt').eq('id', inquiry.dealId).maybeSingle();
    deal = data || null;
  }
  const projectId = inquiry.projectId || deal?.projectId;
  if (projectId) {
    const { data } = await supabase.from('projects').select('id, code, name, customerName, customerId, status, startDate, dueDate, aeOwner, team, type, urgency, productName, productMainCategory, productSubCategory, createdAt').eq('id', projectId).maybeSingle();
    project = data || null;
  }
  const side = inquirySide(user, inquiry);
  return ok({
    ...inquiry, messages, tasks: tasks || [], deal, project, meId: user.id, side,
    canRespond: canRespondInquiry(user, inquiry),
    canTake: canTakeInquiry(user, inquiry) && !inquiry.assigneeId,
    canEditRequest: canEditInquiryRequest(user, inquiry),
    canDelete: canDeleteInquiry(user, inquiry),
    canEditCommitment: canEditInquiryResponse(user, inquiry),
    isAdmin: isInquiryAdmin(user),
  });
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const inquiry = await loadInquiry(supabase, id);
  if (!inquiry) return notFound('ไม่พบเรื่องสอบถาม');
  const body = await req.json();
  const now = new Date().toISOString();
  const side = inquirySide(user, inquiry);
  let updates = {};
  let eventText = '';

  if (body.action === 'take') {
    if (!canTakeInquiry(user, inquiry)) return forbidden();
    if (inquiry.assigneeId) return badRequest('เรื่องนี้มีผู้รับแล้ว');
    // รับเรื่อง = รับปากวันที่จะตอบไปพร้อมกัน (มติผู้ใช้ 2026-07-16) — ไม่มี SLA
    // อัตโนมัติแล้ว วันที่นี้จึงเป็นเส้นวัด KPI เส้นเดียว ต้องมีตั้งแต่ต้น
    if (!isDate(body.committedDueDate)) return badRequest('ต้องระบุวันที่จะตอบกลับตอนรับเรื่อง');
    updates = {
      assigneeId: user.id, assigneeName: user.name || null, acceptedBy: user.id, acceptedAt: now,
      committedDueDate: body.committedDueDate, committedDueBy: user.id, committedDueAt: now,
    };
    eventText = `${user.name || 'RD'} รับเรื่องนี้ · จะตอบภายใน ${body.committedDueDate}`;
  } else if (body.action === 'edit-request') {
    if (!canEditInquiryRequest(user, inquiry)) return forbidden('แก้ไขคำถามไม่ได้หลัง RD รับเรื่องแล้ว');
    if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim().slice(0, 200);
    if ('urgent' in body) updates.urgent = !!body.urgent;
    if ('requestedDueDate' in body) {
      if (body.requestedDueDate && !isDate(body.requestedDueDate)) return badRequest('วันที่คาดหวังไม่ถูกต้อง');
      updates.requestedDueDate = body.requestedDueDate || null;
    }
    // ย้ายบริบท ลูกค้า › โครงการ › ดีล ได้ก่อน RD รับเรื่อง (กติกาเดียวกับตอนสร้าง:
    // ดีลเป็นตัวตั้ง และผู้ย้ายต้องมีสิทธิ์กับดีลปลายทางด้วย)
    if (body.dealId && body.dealId !== inquiry.dealId) {
      const { error: ctxError, status: ctxStatus, context } = await resolveInquiryContext(supabase, user, body);
      if (ctxError) return ctxStatus === 403 ? forbidden(ctxError) : badRequest(ctxError);
      Object.assign(updates, context);
      eventText = `${user.name || 'ฝ่ายขาย'} ย้ายเรื่องไปดีลอื่น`;
    }
    if (!Object.keys(updates).length) return badRequest('ไม่มีข้อมูลให้แก้ไข');
    if (!eventText) eventText = `${user.name || 'ฝ่ายขาย'} แก้ไขรายละเอียดคำถาม`;
  } else if (body.action === 'set-commitment') {
    // เลื่อนวันที่รับปากไว้ — ทำได้ แต่ลงเธรดทุกครั้งพร้อมวันเดิม (มติผู้ใช้ 2026-07-16)
    if (!canEditInquiryResponse(user, inquiry)) return forbidden();
    if (!isDate(body.committedDueDate)) return badRequest('ต้องระบุวันที่ RD จะตอบกลับ');
    if (body.committedDueDate === inquiry.committedDueDate) return badRequest('วันที่เดิม ไม่มีอะไรเปลี่ยน');
    updates = {
      committedDueDate: body.committedDueDate,
      committedDueBy: user.id,
      committedDueAt: now,
    };
    eventText = `${user.name || 'RD'} เลื่อนวันที่จะตอบกลับ ${inquiry.committedDueDate || '-'} → ${body.committedDueDate}`;
  } else if (body.action === 'confirm-close') {
    if (!side && !isInquiryAdmin(user)) return forbidden();
    if (inquiry.status === 'closed') return badRequest('เรื่องถูกปิดแล้ว');
    const closeSide = side || body.side;
    if (closeSide === 'requester') {
      updates.requesterCloseConfirmedBy = user.id;
      updates.requesterCloseConfirmedAt = now;
      eventText = `${user.name || 'ฝ่ายขาย'} ยืนยันปิดเรื่อง`;
    } else if (closeSide === 'responder') {
      updates.responderCloseConfirmedBy = user.id;
      updates.responderCloseConfirmedAt = now;
      eventText = `${user.name || 'RD'} ยืนยันปิดเรื่อง`;
    } else return badRequest('ไม่พบฝ่ายที่ยืนยันปิด');
    const requesterClosed = updates.requesterCloseConfirmedAt || inquiry.requesterCloseConfirmedAt;
    const responderClosed = updates.responderCloseConfirmedAt || inquiry.responderCloseConfirmedAt;
    if (requesterClosed && responderClosed) Object.assign(updates, { status: 'closed', closedAt: now, closedBy: user.id });
  } else if (body.action === 'reopen') {
    if (inquiry.status !== 'closed') return badRequest('เรื่องยังไม่ถูกปิด');
    if (!side && !isInquiryAdmin(user)) return forbidden();
    updates = {
      status: inquiry.answeredAt ? 'answered' : 'open', closedAt: null, closedBy: null,
      requesterCloseConfirmedBy: null, requesterCloseConfirmedAt: null,
      responderCloseConfirmedBy: null, responderCloseConfirmedAt: null,
    };
    eventText = `${user.name || 'ผู้ใช้'} เปิดเรื่องอีกครั้ง`;
  } else {
    return badRequest('action ไม่ถูกต้อง');
  }

  updates.updatedAt = now;
  const { data, error } = await supabase.from('inquiries').update(updates).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  if (body.action === 'take') {
    await supabase.from('inquiry_messages').update({ acknowledgedBy: user.id, acknowledgedAt: now })
      .eq('inquiryId', id).eq('kind', 'comment').is('acknowledgedAt', null).neq('authorDept', inquiry.targetDept);
  }
  if (eventText) await addStatusMessage(supabase, id, user, eventText);
  await recordAudit({ user, action: 'update', entityType: 'inquiry', entityId: id, before: inquiry, after: data, request: req });
  return ok(data);
});

export const DELETE = withUser(async ({ user, supabase, ctx, req }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const inquiry = await loadInquiry(supabase, id);
  if (!inquiry) return notFound('ไม่พบเรื่องสอบถาม');
  if (!canDeleteInquiry(user, inquiry)) return forbidden('ลบไม่ได้หลัง RD รับเรื่องแล้ว');

  const { data: tasks } = await supabase.from('personal_tasks').select('id').eq('inquiryId', id).limit(1);
  if (tasks?.length && !isInquiryAdmin(user)) return badRequest('มีงานที่สร้างจากเรื่องนี้แล้ว จึงลบไม่ได้');
  if (tasks?.length) await supabase.from('personal_tasks').update({ inquiryId: null, inquiryMessageId: null }).eq('inquiryId', id);
  await supabase.from('inquiry_messages').delete().eq('inquiryId', id);
  const { error } = await supabase.from('inquiries').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'delete', entityType: 'inquiry', entityId: id, before: inquiry, request: req });
  return ok({ success: true });
});
