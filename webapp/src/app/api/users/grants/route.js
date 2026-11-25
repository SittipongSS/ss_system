// GET /api/users/grants — ทะเบียนสิทธิ์เสริมของทุกคน (ที่ถืออยู่ + ประวัติที่ถอนแล้ว)
//
// ⭐ รื้อระบบสิทธิ์งวด 3 — แหล่งข้อมูลของแท็บ "สิทธิ์เสริมรายคน" และ "ประวัติการให้สิทธิ์" ในหน้า /users
//    (รายคนยังอยู่ที่ /api/users/[id]/grants — GrantDialog ใช้ตัวนั้น)
// สิทธิ์: users:manage หรือ users:view (มติข้อ 5 — users:view อ่านได้ทุกแท็บ) · `canUser` ไม่ใช่ `can(role)`
//   ⚠️ proxy ปล่อย GET ใต้ `/api/users` ทั้ง prefix (OPEN_READ_APIS) ⇒ ด่านอยู่ที่นี่ที่เดียว
// ⚠️ ชื่อโฟลเดอร์ `grants` แบบคงที่ชนะ `[id]` ของ Next — ไม่มี user id ไหนชื่อ "grants" (id เป็น uuid)
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canUser } from '@/lib/permissions';
import { GRANT_TABLE } from '@/lib/capabilityGrants';
import { fetchAllResult } from '@/lib/supabaseFetchAll';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  if (!canUser(user, 'users:manage') && !canUser(user, 'users:view')) return forbidden();
  const { data, error } = await fetchAllResult(() => supabase.from(GRANT_TABLE).select('*')
    .order('grantedAt', { ascending: false }).order('id', { ascending: true }));
  if (error) {
    console.error('[api/users/grants] list failed', error.message);
    return fail('โหลดทะเบียนสิทธิ์เสริมไม่สำเร็จ ลองใหม่อีกครั้ง', 500);
  }
  return ok({ grants: data || [] });
});
