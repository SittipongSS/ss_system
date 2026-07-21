import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { invalidateCache } from '@/lib/serverCache';
import { publishHolidayCalendarDraft, HolidayCalendarError } from '@/lib/admin/holidayCalendar';

// POST /api/holidays/draft/[id]/publish — the draft becomes the calendar the
// scheduler uses; the previous published version is archived (never deleted).
export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await publishHolidayCalendarDraft(
      getSupabaseAdmin(), id, body.expectedUpdatedAt, user,
    );
    invalidateCache('holidays'); // GET /api/holidays ต้องเห็นชุดใหม่ทันที
    await recordAudit({
      user,
      action: 'publish',
      entityType: 'holiday_calendar_version',
      entityId: id,
      before: result.archived,
      after: result.published,
      summary: `เผยแพร่ปฏิทินวันหยุด Version ${result.published.versionNumber}`,
      request,
    });
    return Response.json(result);
  } catch (error) {
    const status = error instanceof HolidayCalendarError ? error.status : 500;
    return Response.json({ error: error.message || 'เผยแพร่ปฏิทินวันหยุดไม่สำเร็จ' }, { status });
  }
}
