import { can } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, notFound } from '@/lib/http';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function cleanGoals(goals) {
  if (!Array.isArray(goals)) return [];
  return goals.map((g) => (typeof g === 'string' ? g : (g?.text ?? ''))).map((s) => String(s).trim()).filter(Boolean);
}
async function paramId(ctx) { return (await ctx.params).id; }
async function load(supabase, id) {
  const { data } = await supabase.from('mgmt_rock_improve').select('*').eq('id', id).maybeSingle();
  return data;
}

// PATCH /api/mgmt/rocks/[id] — แก้ "สิ่งที่ดีขึ้น" + goals.
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!can(user?.role, 'mgmt:edit')) return forbidden();
  const id = await paramId(ctx);
  const before = await load(supabase, id);
  if (!before || before.deletedAt) return notFound('ไม่พบข้อมูล');

  const body = await req.json().catch(() => ({}));
  const patch = {};
  if (body.improved !== undefined) patch.improved = body.improved || null;
  if (body.goals !== undefined) patch.goals = cleanGoals(body.goals);
  if (!Object.keys(patch).length) return ok(before);

  patch.updatedAt = new Date().toISOString();
  const { data, error } = await supabase.from('mgmt_rock_improve').update(patch).eq('id', id).select().single();
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'update', entityType: 'mgmt_rock', entityId: id, before, after: data, request: req });
  return ok(data);
});

// DELETE /api/mgmt/rocks/[id] — soft-delete.
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!can(user?.role, 'mgmt:edit')) return forbidden();
  const id = await paramId(ctx);
  const before = await load(supabase, id);
  if (!before || before.deletedAt) return notFound('ไม่พบข้อมูล');
  const { data, error } = await supabase
    .from('mgmt_rock_improve').update({ deletedAt: new Date().toISOString() }).eq('id', id).select().single();
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'delete', entityType: 'mgmt_rock', entityId: id, before, request: req });
  return ok(data);
});
