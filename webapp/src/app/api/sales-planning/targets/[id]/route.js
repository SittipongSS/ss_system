import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { isSuperuser } from '@/lib/permissions';
import { canEditSalesTarget, inSalesEditScope, monthKey, toMoney } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

async function loadTarget(supabase, id) {
  const { data, error } = await supabase.from('sales_targets').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesTarget(user)) return forbidden();

  const { id } = await ctx.params;
  const before = await loadTarget(supabase, id);
  if (!before) return notFound('ไม่พบ target');
  if (!inSalesEditScope(user, before)) return forbidden();

  const body = await req.json();
  const patch = { updatedAt: new Date().toISOString() };
  if ('targetMonth' in body) {
    const targetMonth = monthKey(body.targetMonth);
    if (!targetMonth) return badRequest('ต้องระบุเดือนเป้าหมาย');
    patch.targetMonth = targetMonth;
  }
  for (const key of ['ownerId', 'notes']) {
    if (key in body) patch[key] = body[key] || null;
  }
  // ownerName only travels with a set ownerId; a team-level target clears it.
  if ('ownerId' in body || 'ownerName' in body) {
    patch.ownerName = body.ownerId ? (body.ownerName || null) : null;
  }
  // Non-superuser cannot move a target to another team.
  if ('team' in body) {
    patch.team = isSuperuser(user.role) ? (body.team || null) : (user.team || null);
  }
  if ('targetAmount' in body) patch.targetAmount = toMoney(body.targetAmount);

  const { data, error } = await supabase.from('sales_targets').update(patch).eq('id', id).select().single();
  if (error) return fail(error.code === '23505' ? 'มี target เดือน/ทีม/เจ้าของนี้แล้ว' : error.message, error.code === '23505' ? 409 : 500);

  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_target',
    entityId: data.id,
    before,
    after: data,
    summary: `แก้ไข sales target ${data.targetMonth} ${data.team || ''}`.trim(),
    request: req,
  });
  return ok(data);
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesTarget(user)) return forbidden();

  const { id } = await ctx.params;
  const before = await loadTarget(supabase, id);
  if (!before) return notFound('ไม่พบ target');
  if (!inSalesEditScope(user, before)) return forbidden();

  const { error } = await supabase.from('sales_targets').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  await recordAudit({
    user,
    action: 'delete',
    entityType: 'sales_target',
    entityId: id,
    before,
    summary: `ลบ sales target ${before.targetMonth} ${before.team || ''}`.trim(),
    request: req,
  });
  return ok({ ok: true });
});
