import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { HOLIDAY_CALENDAR_LIMITS, normalizeHolidayEntries } from '@/lib/holidayCalendar';
import { updateHolidayCalendarDraft, HolidayCalendarError } from '@/lib/admin/holidayCalendar';

// PATCH /api/holidays/draft/[id] — save the whole draft calendar + change note.
export async function PATCH(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { value, errors } = normalizeHolidayEntries(body.holidays);
    const changeNote = String(body.changeNote ?? '').trim();
    if (changeNote.length > HOLIDAY_CALENDAR_LIMITS.changeNote) {
      errors.push(`หมายเหตุการเปลี่ยนแปลงต้องไม่เกิน ${HOLIDAY_CALENDAR_LIMITS.changeNote} ตัวอักษร`);
    }
    if (errors.length) return Response.json({ error: errors[0], errors }, { status: 400 });

    const result = await updateHolidayCalendarDraft(
      getSupabaseAdmin(),
      id,
      { holidays: value, changeNote: changeNote || null },
      body.expectedUpdatedAt,
      user,
    );
    await recordAudit({
      user,
      action: 'update',
      entityType: 'holiday_calendar_version',
      entityId: id,
      before: result.before,
      after: result.after,
      summary: `บันทึกปฏิทินวันหยุดฉบับร่าง Version ${result.after.versionNumber} (${value.length} วัน)`,
      request,
    });
    return Response.json(result.after);
  } catch (error) {
    const status = error instanceof HolidayCalendarError ? error.status : 500;
    return Response.json({ error: error.message || 'บันทึกฉบับร่างไม่สำเร็จ' }, { status });
  }
}
