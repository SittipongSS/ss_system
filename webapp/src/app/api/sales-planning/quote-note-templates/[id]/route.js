import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { can } from '@/lib/permissions';
import { canReviewSalesForecast } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

function canManage(user) {
  return canReviewSalesForecast(user) || can(user?.role, 'master:manage');
}

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canManage(user)) return forbidden();
  const { id } = await ctx.params;
  const { data: before } = await supabase.from('quote_note_templates').select('*').eq('id', id).maybeSingle();
  if (!before) return notFound('ไม่พบ template');
  const body = await req.json();
  const patch = { updatedAt: new Date().toISOString() };
  if ('title' in body) {
    if (!body.title?.trim()) return badRequest('ต้องระบุชื่อ template');
    patch.title = body.title.trim();
  }
  if ('body' in body) {
    if (!body.body?.trim()) return badRequest('ต้องระบุเนื้อหา template');
    patch.body = body.body.trim();
  }
  if ('serviceType' in body) patch.serviceType = (body.serviceType || 'general').trim();
  if ('active' in body) patch.active = !!body.active;
  if ('sortOrder' in body && Number.isFinite(Number(body.sortOrder))) patch.sortOrder = Number(body.sortOrder);
  const { data, error } = await supabase.from('quote_note_templates').update(patch).eq('id', id).select().single();
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'update', entityType: 'quote_note_template', entityId: id, before, after: data, request: req });
  return ok(data);
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canManage(user)) return forbidden();
  const { id } = await ctx.params;
  const { data: before } = await supabase.from('quote_note_templates').select('*').eq('id', id).maybeSingle();
  if (!before) return notFound('ไม่พบ template');
  const { error } = await supabase.from('quote_note_templates').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'delete', entityType: 'quote_note_template', entityId: id, before, summary: `ลบ template หมายเหตุ "${before.title}"`, request: req });
  return ok({ ok: true });
});
