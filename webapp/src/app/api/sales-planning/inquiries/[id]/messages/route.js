import { genId } from '@/lib/id';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { normalizeDepartment } from '@/lib/permissions';
import {
  canRespondInquiry, inInquiryRequesterScope, sanitizeInquiryAttachments,
} from '@/lib/inquiries';
import { sendChat, chatCard } from '@/lib/chat';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/inquiries/[id]/messages — ตอบกลับในเธรด (สองฝั่ง)
// ฝั่งผู้ตอบ (RD): ข้อความแรก → สถานะ open→answered + ประทับ answeredAt (เส้นวัด SLA)
//   ตอบโดยยังไม่มีใครรับเรื่อง = รับเรื่องไปในตัว (assignee ← ผู้ตอบ)
// ฝั่งผู้ถาม (ฝ่ายขาย): ถามต่อระหว่างสถานะ answered → กลับเป็น open (รอ RD อีกรอบ)
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const { data: inquiry } = await supabase.from('inquiries').select('*').eq('id', id).maybeSingle();
  if (!inquiry) return notFound('ไม่พบเรื่องสอบถาม');
  if (inquiry.status === 'closed') return badRequest('เรื่องถูกปิดแล้ว — เปิดเรื่องอีกครั้งก่อนจึงคุยต่อได้');

  // แยกฝั่งจาก "ฝ่าย" ของผู้เขียน: ฝ่ายเป้าหมาย = ผู้ตอบ, นอกนั้น = ฝั่งผู้ถาม
  const authorDept = normalizeDepartment(user.department) || null;
  const isResponder = canRespondInquiry(user, inquiry) && authorDept === inquiry.targetDept;
  if (!isResponder && !inInquiryRequesterScope(user, inquiry) && !canRespondInquiry(user, inquiry)) {
    return forbidden('เฉพาะผู้ถาม/ทีมผู้ถาม หรือฝ่ายผู้ตอบ ที่คุยในเธรดนี้ได้');
  }
  if (isResponder && !inquiry.acceptedAt) return badRequest('กรุณากดรับเรื่องก่อนตอบ');
  if (isResponder && inquiry.assigneeId && inquiry.assigneeId !== user.id) {
    return forbidden('เฉพาะ RD ผู้รับเรื่องที่ตอบได้');
  }

  const body = await req.json();
  const text = (body.body || '').trim();
  const attachments = sanitizeInquiryAttachments(body.attachments);
  if (!text && !attachments.length) return badRequest('ต้องระบุข้อความหรือแนบไฟล์');

  const { data: message, error } = await supabase.from('inquiry_messages').insert({
    id: genId('INQM'),
    inquiryId: id,
    kind: 'comment',
    body: text,
    attachments,
    authorId: user.id,
    authorName: user.name || null,
    authorDept,
  }).select().single();
  if (error) return fail(error.message, 500);

  // ผลข้างเคียงต่อสถานะเรื่อง (สลับฝั่ง "รอใครตอบ")
  const updates = { updatedAt: new Date().toISOString() };
  if (inquiry.requesterCloseConfirmedAt || inquiry.responderCloseConfirmedAt) {
    Object.assign(updates, {
      requesterCloseConfirmedBy: null, requesterCloseConfirmedAt: null,
      responderCloseConfirmedBy: null, responderCloseConfirmedAt: null,
    });
  }
  if (isResponder) {
    if (inquiry.status === 'open') updates.status = 'answered';
    if (!inquiry.answeredAt) {
      updates.answeredAt = new Date().toISOString();
      updates.answeredById = user.id;
      updates.answeredByName = user.name || null;
    }
  } else if (inquiry.status === 'answered') {
    updates.status = 'open'; // ผู้ถามถามต่อ → กลับไปรอฝ่ายผู้ตอบ
  }
  const { data: updated, error: upError } = await supabase.from('inquiries').update(updates).eq('id', id).select().single();
  if (upError) return fail(upError.message, 500);
  if (updates.status || updates.answeredAt) {
    await recordAudit({ user, action: 'update', entityType: 'inquiry', entityId: id, before: inquiry, after: updated, request: req });
  }

  // แจ้งเตือนฝั่งตรงข้าม (fire-and-forget)
  const excerpt = text.length > 160 ? `${text.slice(0, 160)}…` : text;
  if (isResponder) {
    sendChat('sales', chatCard({
      title: 'RD ตอบข้อสอบถามแล้ว',
      subtitle: `${inquiry.code || ''} · ${inquiry.title}`,
      rows: [
        { label: 'คำตอบ', value: excerpt },
        { label: 'ผู้ตอบ', value: user.name || '' },
        { label: 'ผู้ถาม', value: inquiry.requesterName || '' },
      ],
      linkPath: `/sa/inquiries/${id}`,
      linkLabel: 'เปิดดูคำตอบ',
    }));
  } else {
    sendChat('rd', chatCard({
      title: 'ฝ่ายขายถามต่อในเรื่องสอบถาม',
      subtitle: `${inquiry.code || ''} · ${inquiry.title}`,
      rows: [
        { label: 'ข้อความ', value: excerpt },
        { label: 'จาก', value: user.name || '' },
        { label: 'ผู้รับเรื่อง', value: inquiry.assigneeName || 'ยังไม่มีผู้รับเรื่อง' },
      ],
      linkPath: `/sa/inquiries/${id}`,
      linkLabel: 'เปิดดูคำถาม',
    }));
  }

  return ok({ message, inquiry: updated }, 201);
});
