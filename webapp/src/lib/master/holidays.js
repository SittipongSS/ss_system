// ── Master Data: holidays (working-calendar) ──────────────────────────
// Shared-core access layer for the holiday calendar. PM scheduling reads the
// non-working dates THROUGH this module so the timeline counts business days
// against the real, editable calendar instead of a hardcoded list.
//
// Decision 0012 (mig 0132): the calendar is a versioned setting — this module
// reads the PUBLISHED version only. Draft edits have no effect on scheduling
// until they are published. The legacy `holidays` table (mig 0018) remains as
// a fallback so a deploy that lands before the migration behaves exactly as
// before.
//
// Server-only: uses the service-role admin client. Never import client-side.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { THAI_HOLIDAYS } from '@/lib/pm/dateHelpers';

// All holidays from the published calendar version, soonest first.
export async function listHolidays() {
  const supabase = getSupabaseAdmin();
  try {
    const { data: root, error: rootError } = await supabase
      .from('holiday_calendars')
      .select('publishedVersionId')
      .eq('id', 'primary')
      .maybeSingle();
    if (rootError) throw rootError;
    if (root?.publishedVersionId) {
      const { data: version, error } = await supabase
        .from('holiday_calendar_versions')
        .select('holidays')
        .eq('id', root.publishedVersionId)
        .maybeSingle();
      if (error) throw error;
      const rows = Array.isArray(version?.holidays) ? version.holidays : [];
      return rows
        .map((row) => ({ date: row.date, name: row.name || '' }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  } catch {
    /* mig 0132 not run yet / DB error → legacy table below */
  }

  const { data, error } = await supabase
    .from('holidays')
    .select('*')
    .order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Set of 'YYYY-MM-DD' non-working dates for the scheduler. Falls back to the
// hardcoded THAI_HOLIDAYS when the calendar is empty or unreachable, so
// timeline generation never breaks (same behavior as before mig 0132).
export async function holidaySet() {
  try {
    const rows = await listHolidays();
    if (rows.length) return new Set(rows.map((r) => r.date));
  } catch {
    /* table missing / DB error → fall back below */
  }
  return new Set(THAI_HOLIDAYS);
}
