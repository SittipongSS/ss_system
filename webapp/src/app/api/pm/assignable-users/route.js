import { can, canUser, departmentFor, normalizeDepartment } from '@/lib/permissions';
import { withUser, ok, fail, forbidden } from '@/lib/http';
import { cachedJson } from '@/lib/serverCache';

export const dynamic = 'force-dynamic';

// รายชื่อเหมือนกันทุกผู้ใช้และเปลี่ยนแทบไม่เคยเปลี่ยน แต่ถูกเรียกจาก ~10 หน้า
// ทุกครั้งที่เปิด — cache 5 นาที ลดการวนเพจ GoTrue admin.listUsers ต่อ request
// (หน้า /users แก้ผู้ใช้แล้วเรียก invalidateCache('assignable-users') ให้ของสดทันที)
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadAssignableUsers(supabase) {
  const rows = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
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
        // ระงับอยู่ = banned_until เป็นวันอนาคต (เกณฑ์เดียวกับ /api/users) —
        // เก็บลง cache ครบทุกคนแล้วค่อยกรองตอนตอบ (cache เดียวใช้ได้ทั้งสองแบบ)
        disabled: !!u.banned_until && new Date(u.banned_until) > new Date(),
      });
    }
    page++;
  }
  rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));
  return rows;
}

// GET /api/pm/assignable-users — รายชื่อผู้ใช้ที่ "มอบหมายงานได้" (ย่อ: id/name/role/team).
// ต่างจาก /api/users (admin-only, ข้อมูลเต็ม) — อันนี้ผู้ใช้ PM ทุกคนเรียกได้ เพื่อ
// เติม dropdown ผู้รับผิดชอบ. คืนเฉพาะ user ที่มี role (กรอง account ที่ยังไม่ตั้ง role).
//
// พนักงานที่ถูกระงับ (ลาออก — ปุ่มปิดใน /users) ถูกตัดออกโดย default: ไม่งั้นโผล่ใน
// dropdown มอบหมายงาน/วางเป้าตลอดไป รายชื่อรกขึ้นทุกปีที่มีคนออก. ประวัติย้อนหลัง
// ไม่หาย — หน้าวางเป้ามีแถว ghost ("ออกจากระบบแล้ว") สำหรับเป้าค้างของคนออกอยู่แล้ว
// และแดชบอร์ดรายบุคคลสร้างจากดีลจริงต่อปี. ?includeDisabled=1 = ขอรวมคนถูกระงับ
// (พร้อม flag disabled) สำหรับหน้าที่ต้องอ้างอิงข้อมูลย้อนหลัง.
export const GET = withUser(async ({ user, supabase, req }) => {
  // PM ใช้เติม dropdown ผู้รับผิดชอบ; โมดูล "งานบริหาร" (mgmt) ก็ reuse รายชื่อนี้.
  if (!can(user?.role, 'pm:view') && !canUser(user, 'mgmt:view')) return forbidden();
  const includeDisabled = new URL(req.url).searchParams.get('includeDisabled') === '1';
  try {
    const rows = await cachedJson('assignable-users', CACHE_TTL_MS, () => loadAssignableUsers(supabase));
    return ok(includeDisabled ? rows : rows.filter((r) => !r.disabled));
  } catch (e) {
    return fail(e.message, 500);
  }
});
