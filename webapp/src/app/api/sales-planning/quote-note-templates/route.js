import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { can } from '@/lib/permissions';
import { canViewSalesPlanning, canReviewSalesForecast } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

// template หมายเหตุใบเสนอราคา ต่อประเภทบริการ (เฟส D) — supervisor จัดการ,
// ทุก sales role เลือกใช้ตอนออกใบ. serviceType อิสระ (general/SCENT/NPD/RE-ORDER/…)
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { data, error } = await supabase
    .from('quote_note_templates')
    .select('*')
    .order('sortOrder', { ascending: true })
    .order('createdAt', { ascending: true });
  if (error) return fail(error.message, 500);
  return ok(data || []);
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  // จัดการ template = ระดับหัวหน้า (salesplan:review — supervisor/admin)
  if (!canReviewSalesForecast(user) && !can(user.role, 'master:manage')) return forbidden();
  const body = await req.json();
  if (!body.title?.trim() || !body.body?.trim()) return badRequest('ต้องระบุชื่อและเนื้อหา template');
  const row = {
    id: genId('QNT'),
    serviceType: (body.serviceType || 'general').trim(),
    title: body.title.trim(),
    body: body.body.trim(),
    active: body.active !== false,
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
    createdBy: user.id || null,
  };
  const { data, error } = await supabase.from('quote_note_templates').insert(row).select().single();
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'create', entityType: 'quote_note_template', entityId: data.id, after: data, summary: `เพิ่ม template หมายเหตุ "${data.title}"`, request: req });
  return ok(data, 201);
});
