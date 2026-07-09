import { normalizeDepartment, pmTaskScopes, can } from '@/lib/permissions';
import { withUser, ok, unauthorized, forbidden } from '@/lib/http';
import { teamProjectIds } from '@/lib/pm/projectsRepo';
import { teamUserIds } from '@/lib/usersRepo';

export const dynamic = 'force-dynamic';

// GET /api/pm/my-work?scope=mine|team|all
// คืน { scope, projectTasks, personalTasks, projects } — scope ถูกบังคับตาม role
// ฝั่ง server. งานส่วนตัว = ของฉันเสมอ (ไม่ปนของคนอื่นแม้ scope ทีม/ทั้งหมด).
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view')) return forbidden(); // PM เป็นเครื่องมือฝ่ายขาย — legal ไม่มีสิทธิ์

  const allowed = pmTaskScopes(user.role);
  let scope = new URL(req.url).searchParams.get('scope') || 'mine';
  if (!allowed.includes(scope)) scope = 'mine';

  // ── project tasks ตาม scope ──
  let projectTasks = [];
  if (scope === 'mine') {
    // งานของฉัน = แมตช์ทั้ง assigneeId (มอบหมายผ่าน dropdown) และ assignee (ชื่อ —
    // ที่ template gen ให้ AE owner โดยไม่ตั้ง assigneeId). ใช้ 2 query แล้ว merge
    // กันชื่อที่มี comma/วงเล็บทำ .or() พัง + กันแมตช์ทั้งหมดเมื่อชื่อว่าง.
    const byId = supabase
      .from('project_tasks').select('*').eq('assigneeId', user.id)
      .order('stepOrder', { ascending: true });
    const byName = user.name
      ? supabase.from('project_tasks').select('*').eq('assignee', user.name).order('stepOrder', { ascending: true })
      : Promise.resolve({ data: [] });
    // staff (ฝ่ายจัดซื้อ/ผลิต/คลัง/วิจัย/QC) ไม่ได้ถูก assign รายคนเสมอ — รวมงานที่
    // "assign ให้ฝ่าย" คือขั้นตอนที่ role === ฝ่ายของเขา เข้ามาในงานของฉันด้วย.
    const dept = normalizeDepartment(user.department);
    const byDept = (user.role === 'staff' && dept)
      ? supabase.from('project_tasks').select('*').eq('role', dept).order('stepOrder', { ascending: true })
      : Promise.resolve({ data: [] });
    const [{ data: a }, { data: b }, { data: c }] = await Promise.all([byId, byName, byDept]);
    const seen = new Set();
    projectTasks = [...(a || []), ...(b || []), ...(c || [])].filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));
  } else if (scope === 'team') {
    const ids = await teamProjectIds(supabase, user.team);
    if (ids.length) {
      const { data } = await supabase
        .from('project_tasks').select('*').in('projectId', ids)
        .order('stepOrder', { ascending: true });
      projectTasks = data || [];
    }
  } else { // all
    const { data } = await supabase
      .from('project_tasks').select('*').order('stepOrder', { ascending: true });
    projectTasks = data || [];
  }

  // ── งาน personal_tasks ──
  //   • งานส่วนตัว (ไม่ผูกโปรเจกต์) + งานเพิ่มเติมที่ฉันสร้าง/ถูกมอบ → เห็นเสมอ
  //   • งานเพิ่มเติม (ผูกโปรเจกต์) ของคนอื่น → เห็นตาม scope (team = โปรเจกต์ทีมฉัน, all = ทุกอัน)
  //   • งานส่วนตัวของคนอื่น (ไม่ผูก) → ไม่หลุดเข้า team/all
  // 2 query แยก (ไม่ใช้ .or กับ assigneeId) — เผื่อยังไม่รัน migration 0026 คอลัมน์
  // assigneeId ยังไม่มี: query นั้นจะ error เฉยๆ (data=null) ไม่ทำให้งานส่วนตัวหาย
  const [{ data: byOwner }, { data: byAssignee }] = await Promise.all([
    supabase.from('personal_tasks').select('*').eq('ownerId', user.id).order('createdAt', { ascending: false }),
    supabase.from('personal_tasks').select('*').eq('assigneeId', user.id).order('createdAt', { ascending: false }),
  ]);
  const minePersonal = [...(byOwner || []), ...(byAssignee || [])];

  // team/all: งานที่ "ถูกมอบหมาย" (assigneeId ≠ null) ให้คนในขอบเขต + งานที่ผูก
  // โปรเจกต์ในขอบเขต. งานส่วนตัวที่ไม่ได้มอบหมาย (assigneeId ว่าง) ไม่หลุดออกไป.
  let extraPersonal = [];
  if (scope === 'team' || scope === 'all') {
    const queries = [];
    if (scope === 'team') {
      const [teamProjIds, teamIds] = await Promise.all([
        teamProjectIds(supabase, user.team),
        teamUserIds(supabase, user.team),
      ]);
      if (teamProjIds.length) queries.push(supabase.from('personal_tasks').select('*').in('projectId', teamProjIds));
      if (teamIds.length) queries.push(supabase.from('personal_tasks').select('*').in('assigneeId', teamIds));
    } else { // all
      queries.push(supabase.from('personal_tasks').select('*').not('projectId', 'is', null));
      queries.push(supabase.from('personal_tasks').select('*').not('assigneeId', 'is', null));
    }
    const results = await Promise.all(queries.map((q) => q.order('createdAt', { ascending: false })));
    extraPersonal = results.flatMap((r) => r.data || []);
  }
  const seenP = new Set();
  const personalTasks = [...(minePersonal || []), ...extraPersonal]
    .filter((t) => (seenP.has(t.id) ? false : seenP.add(t.id)));

  // ── projects map สำหรับแสดงรหัส/ชื่อ (รวมโปรเจกต์ที่งานเพิ่มเติมผูกไว้ด้วย) ──
  const projIds = [...new Set([
    ...projectTasks.map((t) => t.projectId),
    ...personalTasks.map((t) => t.projectId),
  ].filter(Boolean))];
  let projects = {};
  if (projIds.length) {
    const { data: ps } = await supabase
      .from('projects').select('id, code, name, aeOwner, team, customerName').in('id', projIds);
    projects = Object.fromEntries((ps || []).map((p) => [p.id, p]));
  }

  // ── deals map สำหรับงานที่ผูกดีล ──
  const dealIds = [...new Set([
    ...projectTasks.map((t) => t.dealId),
    ...personalTasks.map((t) => t.dealId),
  ].filter(Boolean))];
  let deals = {};
  if (dealIds.length) {
    const { data: ds } = await supabase
      .from('sales_deals').select('id, title, customerName, team, stage').in('id', dealIds);
    deals = Object.fromEntries((ds || []).map((d) => [d.id, d]));
  }

  return ok({
    scope,
    allowedScopes: allowed,
    me: { id: user.id, name: user.name, role: user.role, team: user.team ?? null, department: normalizeDepartment(user.department) },
    projectTasks,
    personalTasks: personalTasks || [],
    projects,
    deals,
  });
});
