// ── ขอบเขตของคิวงาน (`personal_tasks`) ฝั่ง server — นิยามเดียวของ /api/pm/my-work และป้าย "ค้าง n" บนหน้าดีล ──────
//
// ⭐ คืน "clause" ไม่ใช่ query — `[คอลัมน์, ids]` ที่ผ่านข้อใดข้อหนึ่ง (OR) · `null` = ทุกงาน
//   · my-work แปลงแต่ละ clause เป็น query (`whereForTaskClause`) แล้วไล่หน้า — พฤติกรรมเดิมทุกสาขา
//   · route หน้าดีลตีความ clause ชุดเดียวกันกับงานของดีลที่โหลดมาแล้ว (`taskInScope` · lib/pm/taskListFilter.js)
//   ⇒ ป้าย "ค้าง n" นับแถวชุดเดียวกับที่คิวโหลดเมื่อเปิดมาจากหน้าดีล (มติเจ้าของ 20/10/2026 · M8b)
//     โดยไม่ต้องคัดลอกกติกาขอบเขตไปเขียนซ้ำอีกที่ (สองสำเนา = เพี้ยนหากันวันหนึ่ง)
//
// ขอบเขต (ย้ายมาจาก my-work ตรง ๆ — ดูเหตุผลเต็มที่หัวไฟล์ route นั้น)
//   • mine = ฉันเป็นเจ้าของ · ผู้รับมอบ · คนดึงมาทำแทน (proxyBy) · คนที่มอบหมาย (assignedBy)
//   • team = ฝ่าย RD: งานของคนในฝ่าย · ฝ่ายขาย: งานผูกโครงการของทีม ∪ งานผูกดีลของทีม (รวมงานลอยของดีลที่ยังไม่ผูก
//            โครงการ — 81 แถวเคยหายจากสายตาหัวหน้าทีม 2026-08-22) ∪ งานที่คนในทีมเป็นเจ้าของ/ผู้รับมอบ/ทำแทน
//   • all  = ทุกงานในระบบ
import { normalizeDepartment, isRdRole } from '@/lib/permissions';
import { teamProjectIds } from '@/lib/pm/projectsRepo';
import { departmentUserIds, teamUserIds } from '@/lib/usersRepo';
import { whereTeamIn } from '@/lib/teamScope';
import { mineTaskClauses } from '@/lib/pm/taskListFilter';

/**
 * @returns {Promise<Array<[string, string[]]> | null>} `null` = ทุกงาน · `[]` = ไม่มีงานในขอบเขตเลย
 */
export async function loadTaskScopeClauses(supabase, user, scope) {
  if (scope === 'all') return null;
  if (scope !== 'team') return mineTaskClauses(user.id);

  const dept = normalizeDepartment(user.department);
  if (isRdRole(user.role) && dept) {
    const deptIds = await departmentUserIds(supabase, dept);
    return deptIds.length
      ? [['ownerId', deptIds], ['assigneeId', deptIds], ['proxyBy', deptIds]]
      : [];
  }
  const [teamProjIds, teamIds, { data: teamDeals }] = await Promise.all([
    teamProjectIds(supabase, user.teams),
    teamUserIds(supabase, user.teams),
    whereTeamIn(supabase.from('sales_deals').select('id'), user),
  ]);
  const teamDealIds = (teamDeals || []).map((d) => d.id);
  const clauses = [];
  if (teamProjIds.length) clauses.push(['projectId', teamProjIds]);
  if (teamDealIds.length) clauses.push(['dealId', teamDealIds]);
  if (teamIds.length) {
    clauses.push(['assigneeId', teamIds]);
    clauses.push(['ownerId', teamIds]);
    clauses.push(['proxyBy', teamIds]);
  }
  return clauses;
}

/** clause → ตัวเติมเงื่อนไขของ query (`.eq` เมื่อค่าเดียว — รูป query เดิมของขอบเขต "ของฉัน") */
export function whereForTaskClause([column, ids]) {
  return (q) => (ids.length === 1 ? q.eq(column, ids[0]) : q.in(column, ids));
}
