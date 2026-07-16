import { genId } from '@/lib/id';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { canUser, normalizeDepartment } from '@/lib/permissions';
import {
  canEditSalesPlanning, canViewSalesPlanning, salesPlanningViewScope,
} from '@/lib/salesPlanning';
import {
  INQUIRY_SLA_BUSINESS_DAYS, INQUIRY_TARGET_DEPTS,
  generateInquiryCode, resolveInquiryContext, sanitizeInquiryAttachments,
} from '@/lib/inquiries';
import { setHolidays, addBusinessDays, toLocalISODate } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { sendChat, chatCard } from '@/lib/chat';

export const dynamic = 'force-dynamic';

// scope การมองเห็นรายการ: ใช้ view scope ของงานขายเดิม (rd/viewer/superuser = all,
// senior/ac = team, ae = own — เทียบกับผู้ถาม) เหมือน applyDealScope ของดีล
function applyInquiryScope(query, user) {
  const scope = salesPlanningViewScope(user?.role);
  if (scope === 'team') return query.eq('team', user?.team ?? null);
  if (scope === 'own') return query.eq('requesterId', user?.id ?? '');
  if (scope === 'none') return query.eq('id', '__no_inquiry_scope__');
  return query;
}

// GET /api/sales-planning/inquiries?dealId=&projectId=&status=active|open|answered|closed&mine=1
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user) && !canUser(user, 'inquiries:respond')) return forbidden();

  const sp = new URL(req.url).searchParams;
  let query = supabase.from('inquiries').select('*');
  if (sp.get('dealId')) query = query.eq('dealId', sp.get('dealId'));
  if (sp.get('projectId')) query = query.eq('projectId', sp.get('projectId'));
  if (sp.get('mine') === '1') query = query.eq('requesterId', user.id);
  const status = sp.get('status');
  if (status === 'active') query = query.neq('status', 'closed');
  else if (status) query = query.eq('status', status);

  query = applyInquiryScope(query, user);
  const { data, error } = await query.order('createdAt', { ascending: false });
  if (error) return fail(error.message, 500);
  return ok(data || []);
});

// POST /api/sales-planning/inquiries — ฝ่ายขายสร้างข้อสอบถามถึงฝ่ายเป้าหมาย (RD).
// body: { title, body, targetDept?, urgent?, dealId, projectId, customerId, attachments? }
// บริบท ลูกค้า › โครงการ › ดีล บังคับครบ — resolveInquiryContext sync จากดีลจริง
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const body = await req.json();
  const title = (body.title || '').trim();
  if (!title) return badRequest('ต้องระบุหัวเรื่อง');
  const firstMessage = (body.body || '').trim();
  const attachments = sanitizeInquiryAttachments(body.attachments);
  if (!firstMessage && !attachments.length) return badRequest('ต้องระบุรายละเอียดคำถามหรือแนบไฟล์');
  const targetDept = INQUIRY_TARGET_DEPTS.includes(body.targetDept) ? body.targetDept : 'RD';
  const requestedDueDate = body.requestedDueDate || null;
  if (requestedDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDueDate)) {
    return badRequest('วันที่คาดหวังคำตอบไม่ถูกต้อง');
  }

  const { error: ctxError, status: ctxStatus, deal, context } = await resolveInquiryContext(supabase, user, body);
  if (ctxError) return ctxStatus === 403 ? forbidden(ctxError) : badRequest(ctxError);

  // SLA ตอบกลับ: +N วันทำการจากวันนี้ (ข้ามเสาร์-อาทิตย์ + วันหยุดบริษัทจริง)
  setHolidays([...(await holidaySet())]);
  const dueDate = toLocalISODate(addBusinessDays(new Date(), INQUIRY_SLA_BUSINESS_DAYS));

  let code = null;
  try {
    code = await generateInquiryCode(supabase);
  } catch (e) {
    return fail(e.message, 500);
  }

  const row = {
    id: genId('INQ'),
    code,
    title,
    targetDept,
    status: 'open',
    urgent: !!body.urgent,
    ...context,
    requesterId: user.id,
    requesterName: user.name || null,
    dueDate,
    requestedDueDate,
  };
  const { data, error } = await supabase.from('inquiries').insert(row).select().single();
  if (error) return fail(error.message, 500);

  // ข้อความแรกของเธรด = ตัวคำถาม
  const { error: msgError } = await supabase.from('inquiry_messages').insert({
    id: genId('INQM'),
    inquiryId: data.id,
    kind: 'comment',
    body: firstMessage,
    attachments,
    authorId: user.id,
    authorName: user.name || null,
    authorDept: normalizeDepartment(user.department) || 'SA',
  });
  if (msgError) return fail(msgError.message, 500);

  await recordAudit({ user, action: 'create', entityType: 'inquiry', entityId: data.id, after: data, request: req });

  // แจ้งเตือน space ฝ่ายผู้ตอบ (fire-and-forget — ไม่มี webhook = ข้ามเงียบ ๆ)
  sendChat('rd', chatCard({
    title: `ข้อสอบถามใหม่ถึงฝ่าย ${targetDept}`,
    subtitle: `${code} · กำหนดตอบภายใน ${dueDate}`,
    rows: [
      { label: 'เรื่อง', value: title },
      { label: 'ดีล', value: `${deal.code || ''} ${deal.title || ''}`.trim() },
      { label: 'ลูกค้า', value: deal.customerName || '' },
      { label: 'ผู้ถาม', value: user.name || '' },
      { label: 'ความเร่งด่วน', value: row.urgent ? 'ด่วน' : '' },
    ],
    linkPath: `/sa/inquiries/${data.id}`,
    linkLabel: 'เปิดดูคำถาม',
  }));

  return ok(data, 201);
});
