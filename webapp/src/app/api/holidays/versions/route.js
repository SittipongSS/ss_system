import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { loadHolidayCalendarAdmin, HolidayCalendarError } from '@/lib/admin/holidayCalendar';

export const dynamic = 'force-dynamic';

// GET /api/holidays/versions — lifecycle view (published/draft/history) for the
// settings page. Supervisor-only; everyone else reads the published calendar
// via GET /api/holidays.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    return Response.json(await loadHolidayCalendarAdmin(getSupabaseAdmin()));
  } catch (error) {
    const status = error instanceof HolidayCalendarError ? error.status : 500;
    return Response.json({ error: error.message || 'โหลดปฏิทินวันหยุดไม่สำเร็จ' }, { status });
  }
}
