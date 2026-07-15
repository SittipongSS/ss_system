import { withUser, ok, fail, unauthorized, forbidden } from '@/lib/http';
import { can, canSeeTaskKpi } from '@/lib/permissions';
import { loadUserDirectory, teamUserIds } from '@/lib/usersRepo';
import {
  TASK_KPI_WEIGHTS, aggregateGroup, clampPeriod, emptyPerson, finalize,
  inPeriod, loadTasksForUsers, tallyTask, taskCreditId,
} from '@/lib/pm/taskKpi';

export const dynamic = 'force-dynamic';

// KPI งานของฝ่ายขาย — ตัวคิดคะแนนกลางอยู่ที่ lib/pm/taskKpi.js (แชร์กับ rd-kpi)
const SALES_ROLES = new Set(['ae', 'ac', 'senior_ae', 'ae_supervisor']);

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view') || !canSeeTaskKpi(user.role)) return forbidden();

  const url = new URL(req.url);
  const period = clampPeriod(url.searchParams.get('from'), url.searchParams.get('to'));
  const requestedTeam = (url.searchParams.get('team') || '').trim();
  const directory = await loadUserDirectory(supabase);
  const users = Array.from(directory.values()).filter((u) => SALES_ROLES.has(u.role));
  const availableTeams = Array.from(new Set(users.map((u) => u.team).filter(Boolean))).sort();

  let team = requestedTeam;
  let targetIds = null;
  if (user.role === 'senior_ae') {
    team = user.team || '';
    targetIds = await teamUserIds(supabase, team);
  } else if (team) {
    targetIds = await teamUserIds(supabase, team);
  }

  const targetUsers = users
    .filter((u) => (!targetIds || targetIds.includes(u.id)))
    .filter((u) => (!team || u.team === team));
  const targetSet = new Set(targetUsers.map((u) => u.id));
  const rowsByUser = new Map(targetUsers.map((u) => [u.id, emptyPerson(u)]));

  let tasks;
  try {
    tasks = await loadTasksForUsers(supabase, targetIds);
  } catch (error) {
    return fail(error.message, 500);
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const task of tasks.filter((t) => inPeriod(t, period.from, period.to))) {
    const rid = taskCreditId(task);
    if (!rid || !targetSet.has(rid)) continue;
    const row = rowsByUser.get(rid);
    if (!row) continue;
    tallyTask(row, task, today);
  }

  const rows = Array.from(rowsByUser.values()).map(finalize).sort((a, b) => b.score - a.score || b.completed - a.completed || a.name.localeCompare(b.name, 'th'));
  const teams = Array.from(new Set(rows.map((r) => r.team).filter(Boolean)))
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
