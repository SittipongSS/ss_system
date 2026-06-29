import { can, departmentFor, normalizeDepartment } from '@/lib/permissions';
import { withUser, ok, fail, forbidden } from '@/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/pm/assignable-users — รายชื่อผู้ใช้ที่ "มอบหมายงานได้" (ย่อ: id/name/role/team).
// ต่างจาก /api/users (admin-only, ข้อมูลเต็ม) — อันนี้ผู้ใช้ PM ทุกคนเรียกได้ เพื่อ
// เติม dropdown ผู้รับผิดชอบ. คืนเฉพาะ user ที่มี role (กรอง account ที่ยังไม่ตั้ง role).
export const GET = withUser(async ({ user, supabase }) => {
  if (!can(user?.role, 'pm:view')) return forbidden();

  const rows = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return fail(error.message, 500);
    const users = data?.users || [];
    if (!users.length) break;
    for (const u of users) {
      const role = u.app_metadata?.role || null;
      if (!role || role === 'user') continue; // ข้าม account ที่ยังไม่กำหนดบทบาท
      rows.push({
        id: u.id,
        name: u.user_metadata?.name || u.email,
        // ใช้เติมเอกสาร ISO: เบอร์มือถือ + อีเมลของ AE ผู้ดูแล (ดึงจากข้อมูลผู้ใช้).
        email: u.email || '',
        phone: u.user_metadata?.phone || '',
        role,
        team: u.app_metadata?.team || null,
        department: normalizeDepartment(u.app_metadata?.department) || departmentFor(role) || null,
      });
    }
    page++;
  }
  rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));
  return ok(rows);
});
