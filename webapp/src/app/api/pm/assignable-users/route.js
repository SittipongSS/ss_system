import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, departmentFor } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET /api/pm/assignable-users — รายชื่อผู้ใช้ที่ "มอบหมายงานได้" (ย่อ: id/name/role/team).
// ต่างจาก /api/users (admin-only, ข้อมูลเต็ม) — อันนี้ผู้ใช้ PM ทุกคนเรียกได้ เพื่อ
// เติม dropdown ผู้รับผิดชอบ. คืนเฉพาะ user ที่มี role (กรอง account ที่ยังไม่ตั้ง role).
export async function GET() {
  const user = await getCurrentUser();
  if (!can(user?.role, 'pm:view')) return Response.json({ error: 'forbidden' }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const rows = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const users = data?.users || [];
    if (!users.length) break;
    for (const u of users) {
      const role = u.app_metadata?.role || null;
      if (!role || role === 'user') continue; // ข้าม account ที่ยังไม่กำหนดบทบาท
      rows.push({
        id: u.id,
        name: u.user_metadata?.name || u.email,
        role,
        team: u.app_metadata?.team || null,
        department: u.app_metadata?.department || departmentFor(role) || null,
      });
    }
    page++;
  }
  rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));
  return Response.json(rows);
}
