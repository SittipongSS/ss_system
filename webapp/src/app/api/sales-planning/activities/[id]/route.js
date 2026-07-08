import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

const ACTIVITY_KINDS = new Set(['note', 'call', 'meeting', 'email', 'next_step']);

// โหลด activity + ดีลเจ้าของ เพื่อเช็ค edit-scope (activity ผูกกับดีลเสมอ)
async function loadActivityAndDeal(supabase, id) {
  const { data: activity } = await supabase.from('sales_deal_activities').select('*').eq('id', id).maybeSingle();
  if (!activity) return { activity: null, deal: null };
  const { data: deal } = await supabase.from('sales_deals').select('*').eq('id', activity.dealId).maybeSingle();
  return { activity, deal };
}

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const { activity, deal } = await loadActivityAndDeal(supabase, id);
  if (!activity) return notFound('ไม่พบรายการอัปเดต');
  if (!deal) return notFound('ไม่พบ deal');
  if (!inSalesEditScope(user, deal)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const patch = { updatedAt: new Date().toISOString() };
  if ('body' in body) {
    if (!body.body?.trim()) return badRequest('ต้องระบุรายละเอียด');
    patch.body = body.body.trim();
  }
  if ('kind' in body && ACTIVITY_KINDS.has(body.kind)) patch.kind = body.kind;
  if ('dueDate' in body) patch.dueDate = body.dueDate || null;

  const { data, error } = await supabase.from('sales_deal_activities').update(patch).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_deal_activity',
    entityId: id,
    before: activity,
    after: data,
    summary: `แก้ไขอัปเดตงานของดีล ${deal.title || deal.id}`,
    request: req,
  });
  return ok(data);
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const { activity, deal } = await loadActivityAndDeal(supabase, id);
  if (!activity) return notFound('ไม่พบรายการอัปเดต');
  if (!deal) return notFound('ไม่พบ deal');
  if (!inSalesEditScope(user, deal)) return forbidden();

  const { error } = await supabase.from('sales_deal_activities').delete().eq('id', id);
  if (error) return fail(error.message, 500);

  await recordAudit({
    user,
    action: 'delete',
    entityType: 'sales_deal_activity',
    entityId: id,
    before: activity,
    summary: `ลบอัปเดตงานของดีล ${deal.title || deal.id}`,
    request: req,
  });
  return ok({ ok: true });
});
