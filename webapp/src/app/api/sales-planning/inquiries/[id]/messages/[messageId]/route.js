import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import {
  canAcknowledgeInquiryMessage, canMutateInquiryMessage, canViewInquiry,
  isInquiryAdmin,
} from '@/lib/inquiries';

export const dynamic = 'force-dynamic';

async function loadContext(supabase, inquiryId, messageId) {
  const [{ data: inquiry }, { data: message }] = await Promise.all([
    supabase.from('inquiries').select('*').eq('id', inquiryId).maybeSingle(),
    supabase.from('inquiry_messages').select('*').eq('id', messageId).eq('inquiryId', inquiryId).maybeSingle(),
  ]);
  return { inquiry: inquiry || null, message: message || null };
}

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id, messageId } = await ctx.params;
  const { inquiry, message } = await loadContext(supabase, id, messageId);
  if (!inquiry || !message) return notFound('ไม่พบข้อความ');
  if (!canViewInquiry(user, inquiry)) return forbidden();
  const body = await req.json();
  const now = new Date().toISOString();
  let updates;

  if (body.action === 'acknowledge') {
    if (!canAcknowledgeInquiryMessage(user, inquiry, message)) return forbidden('รับทราบข้อความนี้ไม่ได้');
    updates = { acknowledgedBy: user.id, acknowledgedAt: now };
  } else if (body.action === 'edit') {
    if (!canMutateInquiryMessage(user, inquiry, message)) return forbidden('ข้อความถูกล็อกแล้ว');
    const text = String(body.body || '').trim();
    if (!text && !(message.attachments || []).length) return badRequest('ข้อความต้องไม่ว่าง');
    updates = { body: text, editedAt: now };
  } else {
    return badRequest('action ไม่ถูกต้อง');
  }

  const { data, error } = await supabase.from('inquiry_messages').update(updates).eq('id', messageId).select().single();
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'update', entityType: 'inquiry_message', entityId: messageId, before: message, after: data, request: req });
  return ok(data);
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id, messageId } = await ctx.params;
  const { inquiry, message } = await loadContext(supabase, id, messageId);
  if (!inquiry || !message) return notFound('ไม่พบข้อความ');
  if (!canMutateInquiryMessage(user, inquiry, message)) return forbidden('ข้อความถูกล็อกแล้ว');

  const { data: linkedTasks } = await supabase.from('personal_tasks').select('id').eq('inquiryMessageId', messageId).limit(1);
  if (linkedTasks?.length && !isInquiryAdmin(user)) return badRequest('ข้อความนี้ถูกนำไปสร้างงานแล้ว จึงลบไม่ได้');
  const updates = { body: null, attachments: [], deletedBy: user.id, deletedAt: new Date().toISOString() };
  const { data, error } = await supabase.from('inquiry_messages').update(updates).eq('id', messageId).select().single();
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'delete', entityType: 'inquiry_message', entityId: messageId, before: message, after: data, request: req });
  return ok(data);
});
