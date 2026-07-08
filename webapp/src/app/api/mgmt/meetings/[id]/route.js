import { canUser } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, notFound, badRequest } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { loadMeeting, appendUpdate } from '@/lib/mgmt/repo';
import { MEETING_FOLLOWUPS, MEETING_FOLLOWUP_LABELS } from '@/lib/mgmt/constants';

export const dynamic = 'force-dynamic';

const EDITABLE = ['title', 'meetingDate', 'timeText', 'deptCode', 'assigneeId', 'assigneeName', 'summary', 'followUp'];

async function paramId(ctx) { return (await ctx.params).id; }

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!canUser(user, 'mgmt:view')) return forbidden();
  const m = await loadMeeting(supabase, await paramId(ctx));
  if (!m || m.deletedAt) return notFound('ไม่พบการประชุม');
  return ok(m);
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!canUser(user, 'mgmt:edit')) return forbidden();
  const id = await paramId(ctx);
  const before = await loadMeeting(supabase, id);
  if (!before || before.deletedAt) return notFound('ไม่พบการประชุม');

  const body = await req.json().catch(() => ({}));
  const patch = {};
  for (const k of EDITABLE) if (body[k] !== undefined) patch[k] = body[k];
  if (patch.title !== undefined) {
    patch.title = (patch.title || '').trim();
    if (!patch.title) return badRequest('หัวข้อการประชุมห้ามว่าง');
  }
  if (patch.followUp !== undefined && !MEETING_FOLLOWUPS.includes(patch.followUp)) return badRequest('ค่าติดตามผลไม่ถูกต้อง');
  if (patch.assigneeName !== undefined) patch.assigneeName = (patch.assigneeName || '').trim() || null;
  if (!Object.keys(patch).length) return ok(before);

  patch.updatedAt = new Date().toISOString();
  const { data, error } = await supabase.from('mgmt_meetings').update(patch).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({ user, action: 'update', entityType: 'mgmt_meeting', entityId: id, before, after: data, request: req });
  if (patch.followUp && patch.followUp !== before.followUp) {
    await appendUpdate(supabase, {
      entityType: 'meeting', entityId: id, kind: 'status',
      body: `ติดตามผล: ${MEETING_FOLLOWUP_LABELS[before.followUp] || before.followUp} → ${MEETING_FOLLOWUP_LABELS[patch.followUp] || patch.followUp}`,
      meta: { field: 'followUp', from: before.followUp, to: patch.followUp }, user,
    });
  }
  return ok(data);
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!canUser(user, 'mgmt:edit')) return forbidden();
  const id = await paramId(ctx);
  const before = await loadMeeting(supabase, id);
  if (!before || before.deletedAt) return notFound('ไม่พบการประชุม');

  const { data, error } = await supabase
    .from('mgmt_meetings').update({ deletedAt: new Date().toISOString() }).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({ user, action: 'delete', entityType: 'mgmt_meeting', entityId: id, before, request: req });
  return ok(data);
});
