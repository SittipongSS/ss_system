import { withUser, ok, fail, unauthorized, forbidden } from '@/lib/http';
import { can, canSeeTaskKpi, hasTeam, primaryTeam, userTeams } from '@/lib/permissions';
import { loadUserDirectory, teamUserIds } from '@/lib/usersRepo';
import { businessDate } from '@/lib/businessDate';
import {
  TASK_KPI_WEIGHTS, aggregateGroup, clampPeriod, emptyPerson, finalize,
  inPeriod, loadTasksForUsers, tallyTask, taskCreditId,
} from '@/lib/pm/taskKpi';

export const dynamic = 'force-dynamic';

// KPI งานของฝ่ายขาย — ตัวคิดคะแนนกลางอยู่ที่ lib/pm/taskKpi.js
// (เคยแชร์กับ /api/sales-planning/rd-kpi ซึ่งถูกลบพร้อมแท็บแดชบอร์ด RD 2026-08-11)
const SALES_ROLES = new Set(['ae', 'ac', 'senior_ae', 'ae_supervisor']);

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view') || !canSeeTaskKpi(user.role)) return forbidden();

  const url = new URL(req.url);
  const period = clampPeriod(url.searchParams.get('from'), url.searchParams.get('to'));
  const requestedTeam = (url.searchParams.get('team') || '').trim();
  const directory = await loadUserDirectory(supabase);
  const users = Array.from(directory.values()).filter((u) => SALES_ROLES.has(u.role));
  // คนหนึ่งคนอยู่ได้หลายทีม ⇒ โผล่ในตัวเลือกทีมทุกทีมที่สังกัด
  const availableTeams = Array.from(new Set(users.flatMap((u) => userTeams(u)))).sort();

  // หัวหน้าทีมที่อยู่หลายทีม เลือกได้ว่าจะดู KPI ทีมไหน ตราบใดที่เป็นทีมของตัวเอง
  // ไม่เลือก (หรือเลือกทีมที่ไม่ได้สังกัด) = ทีมหลัก
  let team = requestedTeam;
  let targetIds = null;
  if (user.role === 'senior_ae') {
    team = hasTeam(user, requestedTeam) ? requestedTeam : (primaryTeam(user) || '');
    targetIds = await teamUserIds(supabase, team);
  } else if (team) {
    targetIds = await teamUserIds(supabase, team);
  }

  const targetUsers = users
    .filter((u) => (!targetIds || targetIds.includes(u.id)))
    .filter((u) => (!team || hasTeam(u, team)));
  const targetSet = new Set(targetUsers.map((u) => u.id));
  const rowsByUser = new Map(targetUsers.map((u) => [u.id, emptyPerson(u)]));

  let tasks;
  try {
    tasks = await loadTasksForUsers(supabase, targetIds);
  } catch (error) {
    return fail(error.message, 500);
  }

  const today = businessDate();
  for (const task of tasks.filter((t) => inPeriod(t, period.from, period.to))) {
    const rid = taskCreditId(task);
    if (!rid || !targetSet.has(rid)) continue;
    const row = rowsByUser.get(rid);
    if (!row) continue;
    tallyTask(row, task, today);
  }

  const rows = Array.from(rowsByUser.values()).map(finalize).sort((a, b) => b.score - a.score || b.completed - a.completed || a.name.localeCompare(b.name, 'th'));
  // แยกตามทีม — ใช้ **ทีมหลัก** ของแต่ละคน คนหนึ่งคนจึงอยู่กลุ่มเดียว ไม่ถูกนับซ้ำ
  // ⚠️ แต่ตอนกรองทีมอยู่ ต้องเป็นกลุ่มเดียวชื่อทีมที่กรอง — ไม่งั้นคนที่อยู่ทีมนี้เป็น
  // ทีมรองจะพาป้ายทีมหลักของตัวเองขึ้นมา แล้วหน้าจอขึ้นว่า "ทีม ODM" ทั้งที่กรอง SV อยู่
  const teams = team
    ? [aggregateGroup(team, rows)]
    : Array.from(new Set(rows.map((r) => r.team).filter(Boolean)))
      .map((t) => aggregateGroup(t, rows.filter((r) => r.team === t)))
      .sort((a, b) => b.score - a.score || a.team.localeCompare(b.team, 'th'));
  const summary = aggregateGroup(team || 'รวม', rows);

  return ok({
    from: period.from,
    to: period.to,
    team: team || '',
    scope: user.role === 'senior_ae' ? 'team' : 'all',
    weights: TASK_KPI_WEIGHTS,
    availableTeams,
    summary,
    rows,
    teams,
  });
});
