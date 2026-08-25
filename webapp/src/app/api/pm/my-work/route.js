import { normalizeDepartment, pmTaskScopes, can } from '@/lib/permissions';
import { canQuoteMaterial } from '@/lib/materialPrices';
import { REQUEST_OPEN_STATUSES } from '@/lib/deptRequests';
import { withUser, ok, unauthorized, forbidden } from '@/lib/http';
import { teamProjectIds } from '@/lib/pm/projectsRepo';
import { departmentUserIds, teamUserIds } from '@/lib/usersRepo';
import { whereTeamIn } from '@/lib/teamScope';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { attachReworkRows } from '@/lib/requests/reworkRows';

export const dynamic = 'force-dynamic';

/* ── ตัวช่วยของไฟล์นี้: อ่านงานให้ครบทุกแถว ─────────────────────────────────
   🐞 เพดาน Max rows = 1000 ของ PostgREST ตัดผลลัพธ์เงียบ ๆ และ `project_tasks`
   เกินเพดานไปแล้ว (2,820 แถว เมื่อ 2026-08-16) ⇒ scope ทีม/ทั้งหมด และงานที่
   assign ทั้งฝ่าย เคยได้คืนมาแค่ 1,000 งานแรกตาม `stepOrder` โดยไม่มี error
   ⚠️ `stepOrder` ซ้ำกันได้ทั้งตาราง — ต้องพ่วง `id` ให้ลำดับนิ่ง ไม่งั้นการไล่ทีละหน้า
   จะได้แถวซ้ำและแถวหายพร้อมกัน (ดู lib/supabaseFetchAll)
   ⚠️ คืน `{ data, error }` เหมือน query เดิม — ผู้เรียกในไฟล์นี้ยอมให้ error เงียบแล้ว
   ปล่อยลิสต์ว่าง ซึ่งเป็นพฤติกรรมเดิมที่ไม่ได้ตั้งใจเปลี่ยนในงานนี้ */
const allTasks = (supabase, where = (q) => q) => fetchAllResult(() => where(
  supabase.from('project_tasks').select('*'),
).order('stepOrder', { ascending: true }).order('id', { ascending: true }));

/* งานส่วนตัวเรียงตาม `createdAt` (ไม่มี `stepOrder`) — พ่วง `id` ด้วยเหตุผลเดียวกัน
   `personal_tasks` = 1,045 แถวตอนพบบั๊ก จึงเกินเพดานแล้วเช่นกัน */
const allPersonal = (supabase, where = (q) => q) => fetchAllResult(() => where(
  supabase.from('personal_tasks').select('*'),
).order('createdAt', { ascending: false }).order('id', { ascending: true }));

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
    const byId = allTasks(supabase, (q) => q.eq('assigneeId', user.id));
    const byName = user.name
      ? allTasks(supabase, (q) => q.eq('assignee', user.name))
      : Promise.resolve({ data: [] });
    // staff/rd (ฝ่ายจัดซื้อ/ผลิต/คลัง/วิจัย/QC) ไม่ได้ถูก assign รายคนเสมอ — รวมงานที่
    // "assign ให้ฝ่าย" คือขั้นตอนที่ role === ฝ่ายของเขา เข้ามาในงานของฉันด้วย.
    const dept = normalizeDepartment(user.department);
    const byDept = ((user.role === 'staff' || user.role === 'rd') && dept)
      ? allTasks(supabase, (q) => q.eq('role', dept))
      : Promise.resolve({ data: [] });
    const [{ data: a }, { data: b }, { data: c }] = await Promise.all([byId, byName, byDept]);
    const seen = new Set();
    projectTasks = [...(a || []), ...(b || []), ...(c || [])].filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));
  } else if (scope === 'team') {
    const dept = normalizeDepartment(user.department);
    if (user.role === 'rd' && dept) {
      const { data } = await allTasks(supabase, (q) => q.eq('role', dept));
      projectTasks = data || [];
    } else {
      /* 🐞 ดึงด้วย `projectId` ล้วนไม่พอ — ไทม์ไลน์ "ลอย" ของดีลที่ยังไม่ผูกโครงการ
         (`project_tasks.projectId = null` + `dealId` — ดู lib/pm/status.js DL1) ไม่โผล่ใน
         "งานของทีม" เลย ทั้งที่เป็นงานจริงที่มีคนทำอยู่ · งานส่วนตัวข้างล่างมีสาขา
         `dealId` คู่กับ `projectId` มาตั้งแต่แรก ตรงนี้ขาดไปข้างเดียว
         ⚠️ ดีลของทีมที่ไปผูกโครงการของทีมอื่น จะติดมาด้วยทางสาขา `dealId` —
         ตั้งใจ (งานของดีลทีมเรา = งานของเรา) และเป็นพฤติกรรมเดียวกับงานส่วนตัว */
      const [projIds, { data: teamDeals }] = await Promise.all([
        teamProjectIds(supabase, user.teams),
        whereTeamIn(supabase.from('sales_deals').select('id'), user),
      ]);
      const dealIds = (teamDeals || []).map((deal) => deal.id);
      const wheres = [];
      if (projIds.length) wheres.push((q) => q.in('projectId', projIds));
      if (dealIds.length) wheres.push((q) => q.in('dealId', dealIds));
      const results = await Promise.all(wheres.map((where) => allTasks(supabase, where)));
      const seenTask = new Set();
      projectTasks = results
        .flatMap((r) => r.data || [])
        .filter((t) => (seenTask.has(t.id) ? false : seenTask.add(t.id)));
    }
  } else { // all
    const { data } = await allTasks(supabase);
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
    allPersonal(supabase, (q) => q.eq('ownerId', user.id)),
    allPersonal(supabase, (q) => q.eq('assigneeId', user.id)),
    allPersonal(supabase, (q) => q.eq('proxyBy', user.id)),
    allPersonal(supabase, (q) => q.eq('assignedBy', user.id)),
  ]);
  const minePersonal = [...(byOwner || []), ...(byAssignee || []), ...(byProxy || []), ...(byAssigner || [])];

  let extraPersonal = [];
  if (scope === 'all') {
    const { data } = await allPersonal(supabase);
    extraPersonal = data || [];
  } else if (scope === 'team') {
    const dept = normalizeDepartment(user.department);
    if (user.role === 'rd' && dept) {
      const deptIds = await departmentUserIds(supabase, dept);
      const queries = deptIds.length ? [
        (q) => q.in('ownerId', deptIds),
        (q) => q.in('assigneeId', deptIds),
        (q) => q.in('proxyBy', deptIds),
      ] : [];
      const results = await Promise.all(queries.map((where) => allPersonal(supabase, where)));
      extraPersonal = results.flatMap((r) => r.data || []);
    } else {
    const [teamProjIds, teamIds, { data: teamDeals }] = await Promise.all([
      teamProjectIds(supabase, user.teams),
      teamUserIds(supabase, user.teams),
      whereTeamIn(supabase.from('sales_deals').select('id'), user),
    ]);
    const teamDealIds = (teamDeals || []).map((d) => d.id);
    const queries = [];
    if (teamProjIds.length) queries.push((q) => q.in('projectId', teamProjIds));
    if (teamDealIds.length) queries.push((q) => q.in('dealId', teamDealIds));
    if (teamIds.length) {
      queries.push((q) => q.in('assigneeId', teamIds));
      queries.push((q) => q.in('ownerId', teamIds));
      queries.push((q) => q.in('proxyBy', teamIds));
    }
    const results = await Promise.all(queries.map((where) => allPersonal(supabase, where)));
    extraPersonal = results.flatMap((r) => r.data || []);
    }
  }
  const seenP = new Set();
  const scopedPersonal = scope === 'mine' ? minePersonal : extraPersonal;
  const personalTasks = (scopedPersonal || [])
    .filter((t) => (seenP.has(t.id) ? false : seenP.add(t.id)));

  // ── คำร้องข้ามฝ่ายที่ค้างอยู่ของฝ่ายฉัน (mig 0173): คิวเดียวกับงาน ──
  // "เก็บแยก โชว์รวม": เรื่องที่ยังไม่ปิดของฝ่ายฉันขึ้นในงานของฉัน จะได้เปิดหน้าเดียว
  // เห็นทุกอย่างที่ต้องทำ (ตอบที่ /sa/requests/[id])
  //
  // ⚠️ เดิมดึงจากตาราง inquiries และกั้นด้วย cap inquiries:respond ซึ่งมีแต่ role rd
  // → ฝ่ายจัดซื้อ (PC) ไม่เคยเห็นคิวของตัวเองในหน้านี้เลยทั้งที่มีงานรออยู่จริง
  // ตอนนี้ทั้งสองฝ่ายใช้ตารางเดียวกัน จึงกั้นด้วย "ตอบคำร้องของฝ่ายนี้ได้ไหม" แทน
  let inquiries = [];
  {
    const myDept = normalizeDepartment(user.department);
    if (myDept && canQuoteMaterial(user, myDept)) {
      let requestQuery = supabase
        .from('dept_requests').select('*')
        .eq('dept', myDept).in('status', REQUEST_OPEN_STATUSES);
      // "ของฉัน" = ที่ฉันรับเรื่องไว้ + ที่ยังไม่มีใครรับ (ยังเป็นงานของทุกคนในฝ่าย)
      if (scope === 'mine') {
        requestQuery = requestQuery.or(`acknowledgedById.eq.${user.id},acknowledgedById.is.null`);
      }
      const { data, error } = await requestQuery.order('committedDueDate', { ascending: true });
      if (error) throw error;
      // ⚠️ เหตุผลเดียวกับ `/api/sales-planning/my-schedule` — ป้าย "เลยกำหนด" ของจอนี้
      // ต้องไม่นับวันของรอบที่ส่งไปแล้ว (ดู lib/requests/reworkRows.js)
      inquiries = await attachReworkRows(supabase, data || []);
    }
  }

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
    me: { id: user.id, name: user.name, role: user.role, team: user.team ?? null, teams: user.teams ?? [], department: normalizeDepartment(user.department) },
    projectTasks,
    personalTasks: personalTasks || [],
    inquiries,
    projects,
    deals,
  });
});
