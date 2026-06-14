import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { isSuperuser, normalizeDepartment } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Which scopes a role may request for PROJECT tasks:
//   mine = งานที่ assign ให้ฉัน (ทุก role)
//   team = งานของทีมตัวเอง (senior_ae, ac, superuser)
//   all  = ทุกทีม (superuser: admin / ae_supervisor)
function allowedScopes(role) {
  if (isSuperuser(role)) return ['mine', 'team', 'all'];
  if (role === 'senior_ae' || role === 'ac') return ['mine', 'team'];
  return ['mine'];
}

// GET /api/pm/my-work?scope=mine|team|all
// คืน { scope, projectTasks, personalTasks, projects } — scope ถูกบังคับตาม role
// ฝั่ง server. งานส่วนตัว = ของฉันเสมอ (ไม่ปนของคนอื่นแม้ scope ทีม/ทั้งหมด).
export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const allowed = allowedScopes(user.role);
  let scope = new URL(request.url).searchParams.get('scope') || 'mine';
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
    const { data: projs } = await supabase.from('projects').select('id').eq('team', user.team ?? null);
    const ids = (projs || []).map((p) => p.id);
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

  let extraPersonal = [];
  if (scope === 'team' || scope === 'all') {
    let q = supabase.from('personal_tasks').select('*').not('projectId', 'is', null);
    if (scope === 'team') {
      const { data: teamProjs } = await supabase.from('projects').select('id').eq('team', user.team ?? null);
      const teamProjIds = (teamProjs || []).map((p) => p.id);
      q = teamProjIds.length ? q.in('projectId', teamProjIds) : null;
    }
    if (q) { const { data } = await q.order('createdAt', { ascending: false }); extraPersonal = data || []; }
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

  return Response.json({
    scope,
    allowedScopes: allowed,
    me: { id: user.id, name: user.name, role: user.role, team: user.team ?? null, department: normalizeDepartment(user.department) },
    projectTasks,
    personalTasks: personalTasks || [],
    projects,
  });
}
