import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRecord } from '@/lib/permissions';
import { registrationRequirements } from '@/lib/tax/requirements';

export const dynamic = 'force-dynamic';

// GET /api/excise-registrations/[id]/requirements
// Completeness checklist for a registration (same service the submit-gate uses).
// → { ready, missing[], warnings[] }  (see lib/tax/requirements.js)
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  // View-scope gate: don't leak requirements for out-of-team registrations.
  const { data: reg, error } = await supabase
    .from('excise_registrations').select('*').eq('id', id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!reg || !canViewRecord(user, 'registrations', reg)) {
    return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });
  }

  const result = await registrationRequirements(supabase, id);
  return Response.json(result);
}
