import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { can } from '@/lib/permissions';
import { taskDealScope } from '@/lib/pm/taskDealScope';

export const dynamic = 'force-dynamic';

// ตัวเลือกดีลสำหรับฟอร์มเพิ่ม/แก้ไขงาน — ทีมเป็น boundary ของการผูกงาน
// (admin เห็นทั้งหมดเพื่อแก้ข้อมูลในฐานะผู้ดูแลระบบ).
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view')) return forbidden();

  const scope = taskDealScope(user);
  if (scope.kind === 'none') return ok([]);

  let query = supabase
    .from('sales_deals')
    .select('id, code, title, customerName, team, stage, projectId')
    .order('updatedAt', { ascending: false });
  if (scope.kind === 'team') query = query.eq('team', scope.team);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok(data || []);
});
