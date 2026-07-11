import { genId } from '@/lib/id';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

const ACTIVITY_KINDS = new Set(['note', 'call', 'meeting', 'email', 'next_step']);
const MAX_ATTACHMENTS = 8;

// รับเฉพาะ ref ไฟล์ที่อัปผ่าน /api/upload แล้ว — เก็บฟิลด์ที่จำเป็นเท่านั้น กัน
// payload แปลกปลอม (ไฟล์จริงอยู่บน Drive/Supabase; แถวนี้เก็บแค่ตัวชี้).
export function sanitizeAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((a) => a && typeof a === 'object' && typeof a.fileUrl === 'string' && a.fileUrl)
    .slice(0, MAX_ATTACHMENTS)
    .map((a) => ({
      fileUrl: String(a.fileUrl),
      driveFileId: a.driveFileId ? String(a.driveFileId) : null,
      fileName: a.fileName ? String(a.fileName).slice(0, 200) : null,
      mimeType: a.mimeType ? String(a.mimeType).slice(0, 100) : null,
      sizeBytes: Number.isFinite(a.sizeBytes) ? Number(a.sizeBytes) : null,
    }));
}

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const dealId = new URL(req.url).searchParams.get('dealId');
  if (!dealId) return badRequest('ต้องระบุ dealId');

  const { data: deal } = await supabase.from('sales_deals').select('*').eq('id', dealId).maybeSingle();
  if (!deal) return notFound('ไม่พบดีล');
  if (!inSalesViewScope(user, deal)) return forbidden();

  const { data, error } = await supabase
    .from('sales_deal_activities')
    .select('*')
    .eq('dealId', dealId)
    .order('createdAt', { ascending: false });
  if (error) return fail(error.message, 500);
  return ok(data || []);
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const body = await req.json();
  if (!body.dealId) return badRequest('ต้องระบุ dealId');
  const attachments = sanitizeAttachments(body.attachments);
  // ต้องมีข้อความ หรือมีไฟล์แนบอย่างน้อยหนึ่ง (โพสต์รูปล้วนได้)
  if (!body.body?.trim() && !attachments.length) return badRequest('ต้องระบุรายละเอียดหรือแนบไฟล์');

  const { data: deal } = await supabase.from('sales_deals').select('*').eq('id', body.dealId).maybeSingle();
  if (!deal) return notFound('ไม่พบดีล');
  if (!inSalesEditScope(user, deal)) return forbidden();

  const kind = ACTIVITY_KINDS.has(body.kind) ? body.kind : 'note';
  const MEETING_MODES = new Set(['onsite_customer_visit', 'onsite_at_office', 'online']);
  const row = {
    id: genId('ACT'),
    dealId: body.dealId,
    kind,
    body: (body.body || '').trim(),
    dueDate: body.dueDate || null,
    // เฟส C (mig 0091): เวลานัด/เวลาเกิดเหตุการณ์จริง + รูปแบบนัด (เฉพาะ meeting) —
    // ฐานข้อมูลปฏิทินนัดในอนาคต (view จาก activityAt) + KPI นัด onsite/online
    activityAt: body.activityAt || null,
    meetingMode: kind === 'meeting' && MEETING_MODES.has(body.meetingMode) ? body.meetingMode : null,
    attachments,
    createdBy: user.id || null,
    createdByName: user.name || null,
  };

  const { data, error } = await supabase.from('sales_deal_activities').insert(row).select().single();
  if (error) return fail(error.message, 500);
  return ok(data, 201);
});
