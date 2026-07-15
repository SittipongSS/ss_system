import { genId } from '@/lib/id';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { normalizeDepartment } from '@/lib/permissions';
import {
  canCloseInquiry, canRespondInquiry, canViewInquiry,
} from '@/lib/inquiries';

export const dynamic = 'force-dynamic';

async function loadInquiry(supabase, id) {
  const { data } = await supabase.from('inquiries').select('*').eq('id', id).maybeSingle();
  return data || null;
}

// บันทึกเหตุการณ์ระบบลงเธรด (รับเรื่อง/ปิด/เปิดใหม่) — โชว์ inline ในไทม์ไลน์เธรด
async function addStatusMessage(supabase, inquiryId, user, text) {
  await supabase.from('inquiry_messages').insert({
    id: genId('INQM'),
    inquiryId,
    kind: 'status',
    body: text,
    attachments: [],
    authorId: user.id,
    authorName: user.name || null,
    authorDept: normalizeDepartment(user.department) || null,
  });
}

// GET /api/sales-planning/inquiries/[id] — เธรดเต็ม + บริบท (ดีล/โครงการ/งานที่แตกจากคำถาม)
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const inquiry = await loadInquiry(supabase, id);
  if (!inquiry) return notFound('ไม่พบเรื่องสอบถาม');
  if (!canViewInquiry(user, inquiry)) return forbidden();

  const [{ data: messages }, { data: tasks }] = await Promise.all([
    supabase.from('inquiry_messages').select('*').eq('inquiryId', id).order('createdAt', { ascending: true }),
    supabase.from('personal_tasks').select('id, title, status, assigneeId, dueDate').eq('inquiryId', id).order('createdAt', { ascending: true }),
  ]);

  let deal = null;
  let project = null;
  if (inquiry.dealId) {
    const { data } = await supabase.from('sales_deals').select('id, code, title, customerName, team, stage').eq('id', inquiry.dealId).maybeSingle();
    deal = data || null;
  }
  if (inquiry.projectId) {
    const { data } = await supabase.from('projects').select('id, code, name, customerName').eq('id', inquiry.projectId).maybeSingle();
    project = data || null;
  }

  return ok({
    ...inquiry,
    messages: messages || [],
    tasks: tasks || [],
    deal,
    project,
    // hint ให้ UI แสดง/ซ่อนปุ่ม — สิทธิ์จริงบังคับซ้ำตอน PATCH/POST เสมอ
    canRespond: canRespondInquiry(user, inquiry),
    canClose: canCloseInquiry(user, inquiry),
    meId: user.id,
  });
});

// PATCH /api/sales-planning/inquiries/[id]
//   • action 'take'   — คนฝ่ายผู้ตอบกดรับเรื่อง (ย้าย assignee มาที่ตัวเอง)
//   • action 'close'  — ผู้ถาม/ทีมผู้ถามปิดเรื่อง (คนถามคือคนตัดสินว่าคำตอบพอ)
//   • action 'reopen' — เปิดเรื่องที่ปิดแล้วกลับมาถามต่อ
//   • แก้ field (title/urgent/dueDate) — ฝั่งผู้ถาม ระหว่างเรื่องยังไม่ปิด
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const inquiry = await loadInquiry(supabase, id);
  if (!inquiry) return notFound('ไม่พบเรื่องสอบถาม');

  const body = await req.json();
  const now = new Date().toISOString();
  let updates = null;

  if (body.action === 'take') {
    if (!canRespondInquiry(user, inquiry)) return forbidden();
    if (inquiry.status === 'closed') return badRequest('เรื่องถูกปิดแล้ว');
    if (inquiry.assigneeId === user.id) return badRequest('คุณเป็นผู้รับเรื่องอยู่แล้ว');
    updates = { assigneeId: user.id, assigneeName: user.name || null };
    await addStatusMessage(supabase, id, user, `${user.name || 'ผู้ใช้'} รับเรื่องนี้`);
  } else if (body.action === 'close') {
    if (!canCloseInquiry(user, inquiry)) return forbidden('เฉพาะผู้ถาม/ทีมผู้ถามที่ปิดเรื่องได้');
    if (inquiry.status === 'closed') return badRequest('เรื่องถูกปิดแล้ว');
    updates = { status: 'closed', closedAt: now, closedBy: user.id };
    await addStatusMessage(supabase, id, user, `${user.name || 'ผู้ใช้'} ปิดเรื่อง`);
  } else if (body.action === 'reopen') {
    if (!canCloseInquiry(user, inquiry)) return forbidden();
    if (inquiry.status !== 'closed') return badRequest('เรื่องยังไม่ถูกปิด');
    // เปิดใหม่ = กลับไปรอฝ่ายผู้ตอบ (สถานะ open); เวลาตอบครั้งแรก (answeredAt) คงเดิม
    updates = { status: 'open', closedAt: null, closedBy: null };
    await addStatusMessage(supabase, id, user, `${user.name || 'ผู้ใช้'} เปิดเรื่องอีกครั้ง`);
  } else {
    if (!canCloseInquiry(user, inquiry)) return forbidden();
    if (inquiry.status === 'closed') return badRequest('เรื่องถูกปิดแล้ว — เปิดใหม่ก่อนจึงแก้ไขได้');
    updates = {};
    if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim();
    if ('urgent' in body) updates.urgent = !!body.urgent;
    if ('dueDate' in body) updates.dueDate = body.dueDate || null;
    if (!Object.keys(updates).length) return badRequest('ไม่มีข้อมูลให้แก้ไข');
  }

  updates.updatedAt = now;
  const { data, error } = await supabase.from('inquiries').update(updates).eq('id', id).select().single();
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'update', entityType: 'inquiry', entityId: id, before: inquiry, after: data, request: req });
  return ok(data);
});
