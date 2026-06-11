// ── Master Data: holidays (working-calendar) ──────────────────────────
// Shared-core access layer for the holiday calendar. PM scheduling reads the
// non-working dates THROUGH this module so the timeline counts business days
// against the real, editable calendar instead of a hardcoded list.
//
// Server-only: uses the service-role admin client. Never import client-side.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { THAI_HOLIDAYS } from '@/lib/pm/dateHelpers';

// All holidays, soonest first.
export async function listHolidays() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('holidays')
    .select('*')
    .order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Set of 'YYYY-MM-DD' non-working dates for the scheduler. Falls back to the
// hardcoded THAI_HOLIDAYS when the table is empty or unreachable, so timeline
// generation never breaks (e.g. before migration 0018 is run).
export async function holidaySet() {
  try {
    const rows = await listHolidays();
    if (rows.length) return new Set(rows.map((r) => r.date));
  } catch {
    /* table missing / DB error → fall back below */
  }
  return new Set(THAI_HOLIDAYS);
}
