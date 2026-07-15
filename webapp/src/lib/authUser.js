import { createHash } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { departmentFor, sanitizeExtraCaps } from '@/lib/permissions';

// ลด round-trip ไป Supabase Auth (GoTrue): ก่อนหน้านี้ทุก API request จ่าย getUser()
// 2 รอบ (proxy + route handler). รอบของ route handler cache ได้ 60 วิ ต่อ access
// token เพราะ proxy ยัง validate สด + refresh cookie ทุก request อยู่แล้ว —
// ban/ออกจากระบบจึงมีผลทันทีที่ชั้น proxy เหมือนเดิม; ผลของการเปลี่ยน role/ทีม
// ที่ row-scope ช้าสุด 60 วิ (token เปลี่ยน = key เปลี่ยน = cache miss โดยธรรมชาติ).
const identityCache = new Map(); // sha256(auth cookies) -> { at, user }
const IDENTITY_TTL_MS = 60 * 1000;

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
  const authCookies = cookieStore.getAll().filter((c) => c.name.includes('-auth-token'));
  const cacheKey = authCookies.length
    ? createHash('sha256').update(authCookies.map((c) => `${c.name}=${c.value}`).join(';')).digest('hex')
    : null;
  if (cacheKey) {
    const hit = identityCache.get(cacheKey);
    // คืนสำเนา — กัน handler เผลอ mutate object ที่แชร์ใน cache
    if (hit && Date.now() - hit.at < IDENTITY_TTL_MS) {
      return { ...hit.user, extraCaps: [...(hit.user.extraCaps || [])] };
    }
  }
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
  const identity = {
    id: user.id,
    role,
    team: user.app_metadata?.team || null,
    department: user.app_metadata?.department || departmentFor(role) || null,
    // Per-user capability grants (e.g. an SA granted the LG legal:approve). The
    // effective caps are role caps ∪ these — see capsForUser/canUser.
    extraCaps: sanitizeExtraCaps(user.app_metadata?.extraCaps),
    name: user.user_metadata?.name || user.email || 'user',
  };
  if (cacheKey) {
    if (identityCache.size > 500) identityCache.clear(); // กัน Map โตไม่จำกัด (token rotation)
    identityCache.set(cacheKey, { at: Date.now(), user: identity });
  }
  return identity;
}
