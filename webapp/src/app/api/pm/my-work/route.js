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
  // Fall back to the role's first (default) allowed scope, not a hardcoded 'mine':
  // a viewer's only scope is 'all', so requesting 'mine' must resolve to 'all'.
  if (!allowed.includes(scope)) scope = allowed[0];

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

  // ── งาน personal_tasks (ระบบติดตามงาน — ผู้มีสิทธิ์ต้องเห็น "งาน" ทั้งหมดในขอบเขต) ──
  //   • mine = งานที่ฉันเป็นเจ้าของ หรือถูกมอบหมายให้ฉัน
  //   • team = งานทุกงานที่คนในทีมฉันเป็นเจ้าของ/ผู้รับมอบ + งานที่ผูกโครงการของทีม
  //   • all  = ทุกงานในระบบ (admin / sales head ติดตามได้ทุกทีม — วัดผลได้)
  // เดิม team/all ดึงเฉพาะงานที่ "มอบหมาย/ผูกโครงการ" ทำให้งานที่ผู้ใช้สร้างให้ตัวเอง
  // (ไม่มอบหมาย + ไม่ผูกโครงการ เช่นผูกแค่ดีลหรือไม่ผูกเลย) หลุดจากสายตา admin — แก้แล้ว.
  // งานของฉัน = เป็นเจ้าของ, ถูกมอบหมายให้, หรือ "ดึงมาทำแทน" (proxyBy) — งานที่ดึง
  // มาทำต้องอยู่ในรายการของฉันด้วย เพราะฉันเป็นคนทำจริง (และได้เครดิต KPI).
  const [{ data: byOwner }, { data: byAssignee }, { data: byProxy }, { data: byAssigner }] = await Promise.all([
    supabase.from('personal_tasks').select('*').eq('ownerId', user.id).order('createdAt', { ascending: false }),
    supabase.from('personal_tasks').select('*').eq('assigneeId', user.id).order('createdAt', { ascending: false }),
    supabase.from('personal_tasks').select('*').eq('proxyBy', user.id).order('createdAt', { ascending: false }),
    supabase.from('personal_tasks').select('*').eq('assignedBy', user.id).order('createdAt', { ascending: false }),
  ]);
  const minePersonal = [...(byOwner || []), ...(byAssignee || []), ...(byProxy || []), ...(byAssigner || [])];

  let extraPersonal = [];
  if (scope === 'all') {
    const { data } = await supabase.from('personal_tasks').select('*').order('createdAt', { ascending: false });
    extraPersonal = data || [];
  } else if (scope === 'team') {
    const [teamProjIds, teamIds, { data: teamDeals }] = await Promise.all([
      teamProjectIds(supabase, user.team),
      teamUserIds(supabase, user.team),
      supabase.from('sales_deals').select('id').eq('team', user.team ?? null),
    ]);
    const teamDealIds = (teamDeals || []).map((d) => d.id);
    const queries = [];
    if (teamProjIds.length) queries.push(supabase.from('personal_tasks').select('*').in('projectId', teamProjIds));
    if (teamDealIds.length) queries.push(supabase.from('personal_tasks').select('*').in('dealId', teamDealIds));
    if (teamIds.length) {
      queries.push(supabase.from('personal_tasks').select('*').in('assigneeId', teamIds));
      queries.push(supabase.from('personal_tasks').select('*').in('ownerId', teamIds));
      queries.push(supabase.from('personal_tasks').select('*').in('proxyBy', teamIds));
    }
    const results = await Promise.all(queries.map((q) => q.order('createdAt', { ascending: false })));
    extraPersonal = results.flatMap((r) => r.data || []);
  }
  const seenP = new Set();
  const scopedPersonal = scope === 'mine' ? minePersonal : extraPersonal;
  const personalTasks = (scopedPersonal || [])
    .filter((t) => (seenP.has(t.id) ? false : seenP.add(t.id)));

  // ── projects map สำหรับแสดงรหัส/ชื่อ (รวมโครงการที่งานเพิ่มเติมผูกไว้ด้วย) ──
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
