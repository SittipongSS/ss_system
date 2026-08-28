import { createHash } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { departmentFor, normalizeRole, sanitizeExtraCaps, userTeams } from '@/lib/permissions';
import { devBypassUser } from '@/lib/devBypass';

// ลด round-trip ไป Supabase Auth (GoTrue): ก่อนหน้านี้ทุก API request จ่าย getUser()
// 2 รอบ (proxy + route handler). รอบของ route handler cache ได้ 60 วิ ต่อ access
// token เพราะ proxy ยัง validate สด + refresh cookie ทุก request อยู่แล้ว —
// ban/ออกจากระบบจึงมีผลทันทีที่ชั้น proxy เหมือนเดิม; ผลของการเปลี่ยน role/ทีม
// ที่ row-scope ช้าสุด 60 วิ (token เปลี่ยน = key เปลี่ยน = cache miss โดยธรรมชาติ).
const identityCache = new Map(); // sha256(auth cookies) -> { at, user }
const IDENTITY_TTL_MS = 60 * 1000;


// Server-side identity for API route handlers. Reads the signed-in user from
// the Supabase session cookie and returns the fields needed for access checks:
//   { id, role, team, teams, name }
// Role + team come from app_metadata (service-role-only, not self-editable).
// `teams` = ทุกทีมที่สังกัด (ใช้เป็นขอบเขต) · `team` = ทีมหลัก (ใช้ตอน stamp
// เจ้าของงานใหม่) — บัญชีเก่าที่ยังไม่มี teams จะถอยไปใช้ [team] เอง
//
// Dev fallback: if Supabase isn't configured (local dev), return a supervisor
// so the app keeps working without auth — mirrors AppLayout/proxy behavior.
//
// ⭐ `NEXT_PUBLIC_DEV_BYPASS_ROLE` / `_DEPARTMENT` / `_TEAM` — เปลี่ยน "คนที่
//   สวมบทอยู่" ตอน UAT ได้โดย**ไม่ต้องแตะรหัสผ่านของใคร** (คอมเมนต์ `NEXT_PUBLIC_SUPABASE_*`
//   สองตัวใน .env.local เพื่อเปิด bypass แล้วตั้งสามตัวนี้)
//   ⚠️ มีผล **เฉพาะตอน Supabase ไม่ได้ตั้งค่า** เท่านั้น — บน production ทั้งสอง
//      ตัวแปรมีค่าเสมอ โค้ดจึงไม่มีวันเดินมาถึงบรรทัดนี้ · ค่าตั้งต้นยังเป็น
//      ae_supervisor เหมือนเดิมทุกประการ (devBypass.test.mjs ตรึงไว้)
export async function getCurrentUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return devBypassUser();

  const cookieStore = await cookies();
  const authCookies = cookieStore.getAll().filter((c) => c.name.includes('-auth-token'));
  const cacheKey = authCookies.length
    ? createHash('sha256').update(authCookies.map((c) => `${c.name}=${c.value}`).join(';')).digest('hex')
    : null;
  if (cacheKey) {
    const hit = identityCache.get(cacheKey);
    // คืนสำเนา — กัน handler เผลอ mutate object ที่แชร์ใน cache
    if (hit && Date.now() - hit.at < IDENTITY_TTL_MS) {
      return { ...hit.user, extraCaps: [...(hit.user.extraCaps || [])], teams: [...(hit.user.teams || [])] };
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

  /* แปลง role เก่าตอนอ่าน — บัญชีที่ยังไม่ถูกย้ายต้องเข้าระบบได้ตามปกติ
     ⚠️ ส่ง `department` เข้าไปด้วยเสมอ — `staff` เก่า (ยกเลิก 2026-08-28) แปลงเป็น role
     ของฝ่ายเขา ซึ่งชื่อตารางอย่างเดียวบอกไม่ได้ */
  const role = normalizeRole(user.app_metadata?.role) || 'user';
  const identity = {
    id: user.id,
    role,
    team: user.app_metadata?.team || null,
    teams: userTeams({ team: user.app_metadata?.team, teams: user.app_metadata?.teams }),
    department: user.app_metadata?.department || departmentFor(role) || null,
    // Per-user capability grants (e.g. an SA granted the RA ra:approve). The
    // effective caps are role caps ∪ these — see capsForUser/canUser.
    extraCaps: sanitizeExtraCaps(user.app_metadata?.extraCaps),
    name: user.user_metadata?.name || user.email || 'user',
    // เบอร์โทรผู้ใช้ (user_metadata.phone) — ใช้ snapshot เป็น "เบอร์ผู้เสนอราคา" บนใบเสนอราคา
    phone: user.user_metadata?.phone || null,
  };
  if (cacheKey) {
    if (identityCache.size > 500) identityCache.clear(); // กัน Map โตไม่จำกัด (token rotation)
    identityCache.set(cacheKey, { at: Date.now(), user: identity });
  }
  return identity;
}
