import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { createHolidayCalendarDraft, HolidayCalendarError } from '@/lib/admin/holidayCalendar';

// POST /api/holidays/draft — start a draft as a copy of the published calendar.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const draft = await createHolidayCalendarDraft(getSupabaseAdmin(), user);
    await recordAudit({
      user,
      action: 'create',
      entityType: 'holiday_calendar_version',
      entityId: draft.id,
      after: draft,
      summary: `สร้างปฏิทินวันหยุดฉบับร่าง Version ${draft.versionNumber}`,
      request,
    });
    return Response.json(draft, { status: 201 });
  } catch (error) {
    const status = error instanceof HolidayCalendarError ? error.status : 500;
    return Response.json({ error: error.message || 'สร้างฉบับร่างไม่สำเร็จ' }, { status });
  }
}
