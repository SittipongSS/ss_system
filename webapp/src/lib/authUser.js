import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { departmentFor, sanitizeExtraCaps } from '@/lib/permissions';

// Server-side identity for API route handlers. Reads the signed-in user from
// the Supabase session cookie and returns the fields needed for access checks:
//   { id, role, team, name }
// Role + team come from app_metadata (service-role-only, not self-editable).
//
// Dev fallback: if Supabase isn't configured (local dev), return a supervisor
// so the app keeps working without auth — mirrors AppLayout/proxy behavior.
export async function getCurrentUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { id: 'local-dev', role: 'ae_supervisor', team: null, department: 'SALES', name: 'Local Dev', devBypass: true };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      // Route handlers don't refresh the session — the proxy already did that
      // on the incoming request. A no-op setAll keeps createServerClient happy.
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const role = user.app_metadata?.role || 'user';
  return {
    id: user.id,
    role,
    team: user.app_metadata?.team || null,
    department: user.app_metadata?.department || departmentFor(role) || null,
    // Per-user capability grants (e.g. an SA granted the LG legal:approve). The
    // effective caps are role caps ∪ these — see capsForUser/canUser.
    extraCaps: sanitizeExtraCaps(user.app_metadata?.extraCaps),
    name: user.user_metadata?.name || user.email || 'user',
  };
}
