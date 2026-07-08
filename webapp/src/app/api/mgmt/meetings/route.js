import { can } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, badRequest } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { listMeetings, newMeetingId, appendUpdate } from '@/lib/mgmt/repo';
import { MEETING_FOLLOWUPS } from '@/lib/mgmt/constants';

export const dynamic = 'force-dynamic';

function buildMeeting(body, { forCreate }) {
  const out = {};
  if (forCreate || body.title !== undefined) {
    const title = (body.title || '').trim();
    if (forCreate && !title) return { error: 'กรุณาระบุหัวข้อการประชุม' };
    if (title) out.title = title;
  }
  if (forCreate || body.meetingDate !== undefined) {
    if (forCreate && !body.meetingDate) return { error: 'กรุณาระบุวันที่ประชุม' };
    if (body.meetingDate !== undefined) out.meetingDate = body.meetingDate || null;
  }
  if (body.timeText !== undefined) out.timeText = (body.timeText || '').trim() || null;
  if (body.deptCode !== undefined) out.deptCode = body.deptCode || null;
  if (body.assigneeId !== undefined) out.assigneeId = body.assigneeId || null;
  if (body.assigneeName !== undefined) out.assigneeName = (body.assigneeName || '').trim() || null;
  if (body.summary !== undefined) out.summary = body.summary || null;
  if (body.followUp !== undefined) {
    if (!MEETING_FOLLOWUPS.includes(body.followUp)) return { error: 'ค่าติดตามผลไม่ถูกต้อง' };
    out.followUp = body.followUp;
  }
  return { row: out };
}

// GET /api/mgmt/meetings?year=&deptCode=&followUp=
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!can(user?.role, 'mgmt:view')) return forbidden();
  const sp = new URL(req.url).searchParams;
  try {
    return ok(await listMeetings(supabase, {
      year: sp.get('year') || undefined,
      deptCode: sp.get('deptCode') || undefined,
      followUp: sp.get('followUp') || undefined,
    }));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST /api/mgmt/meetings
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!can(user?.role, 'mgmt:edit')) return forbidden();
  const body = await req.json().catch(() => ({}));
  const built = buildMeeting(body, { forCreate: true });
  if (built.error) return badRequest(built.error);

  const now = new Date().toISOString();
  const row = {
    id: newMeetingId(),
    followUp: 'none',
    ...built.row,
    createdBy: user?.id ?? null,
    createdByName: user?.name ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const { data, error } = await supabase.from('mgmt_meetings').insert(row).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({ user, action: 'create', entityType: 'mgmt_meeting', entityId: data.id, after: data, request: req });
  await appendUpdate(supabase, { entityType: 'meeting', entityId: data.id, kind: 'edit', body: 'สร้างบันทึกการประชุม', user });
  return ok(data, 201);
});
