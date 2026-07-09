import { withUser, ok, fail, unauthorized, forbidden } from '@/lib/http';
import { can, isSuperuser } from '@/lib/permissions';
import { loadUserDirectory, teamUserIds } from '@/lib/usersRepo';

export const dynamic = 'force-dynamic';

const SALES_ROLES = new Set(['ae', 'ac', 'senior_ae', 'ae_supervisor']);
const WEIGHTS = { completion: 40, onTime: 40, difficulty: 20 };

function ymd(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function clampPeriod(from, to) {
  const now = new Date();
  const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const last = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}-${String(lastDate.getDate()).padStart(2, '0')}`;
  const start = ymd(from) || first;
  const end = ymd(to) || last;
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

function inPeriod(task, from, to) {
  const dates = [task.dueDate, task.completedAt, task.startDate, task.createdAt].map(ymd).filter(Boolean);
  if (!dates.length) return false;
  return dates.some((d) => d >= from && d <= to);
}

function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function responsibleId(task) {
  return task.assigneeId || task.ownerId || null;
}

function emptyPerson(user) {
  return {
    userId: user.id,
    name: user.name || user.email || user.id,
    role: user.role || '',
    team: user.team || '',
    total: 0,
    completed: 0,
    active: 0,
    overdue: 0,
    completedOnTime: 0,
    completedWithDue: 0,
    completedDifficulty: 0,
    completionPct: 0,
    onTimePct: 0,
    difficultyPct: 0,
    score: 0,
  };
}

function finalize(row) {
  row.completionPct = pct(row.completed, row.total);
  row.onTimePct = row.completedWithDue > 0 ? pct(row.completedOnTime, row.completedWithDue) : (row.completed > 0 ? 100 : 0);
  row.difficultyPct = row.completed > 0 ? pct(row.completedDifficulty, row.completed * 3) : 0;
  row.score = Math.round(
    (row.completionPct * WEIGHTS.completion / 100) +
    (row.onTimePct * WEIGHTS.onTime / 100) +
    (row.difficultyPct * WEIGHTS.difficulty / 100)
  );
  return row;
}

function aggregateTeam(team, rows) {
  const seed = {
    team: team || '-',
    people: rows.length,
    total: 0,
    completed: 0,
    active: 0,
    overdue: 0,
    completedOnTime: 0,
    completedWithDue: 0,
    completedDifficulty: 0,
    completionPct: 0,
    onTimePct: 0,
    difficultyPct: 0,
    score: 0,
  };
  for (const row of rows) {
    seed.total += row.total;
    seed.completed += row.completed;
    seed.active += row.active;
    seed.overdue += row.overdue;
    seed.completedOnTime += row.completedOnTime;
    seed.completedWithDue += row.completedWithDue;
    seed.completedDifficulty += row.completedDifficulty;
  }
  return finalize(seed);
}

async function loadTasksForUsers(supabase, ids) {
  if (!ids?.length) {
    const { data, error } = await supabase.from('personal_tasks').select('*').order('createdAt', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  const [byOwner, byAssignee] = await Promise.all([
    supabase.from('personal_tasks').select('*').in('ownerId', ids).order('createdAt', { ascending: false }),
    supabase.from('personal_tasks').select('*').in('assigneeId', ids).order('createdAt', { ascending: false }),
  ]);
  if (byOwner.error) throw byOwner.error;
  if (byAssignee.error) throw byAssignee.error;

  const seen = new Set();
  return [...(byOwner.data || []), ...(byAssignee.data || [])]
    .filter((task) => (seen.has(task.id) ? false : seen.add(task.id)));
}

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  const canSeeKpi = isSuperuser(user.role) || user.role === 'senior_ae';
  if (!can(user.role, 'pm:view') || !canSeeKpi) return forbidden();

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
    const rid = responsibleId(task);
    if (!rid || !targetSet.has(rid)) continue;
    const row = rowsByUser.get(rid);
    if (!row) continue;
    row.total += 1;
    if (task.status === 'Completed') {
      row.completed += 1;
      const diff = Number(task.difficulty);
      row.completedDifficulty += Number.isFinite(diff) ? Math.max(1, Math.min(3, diff)) : 2;
      if (task.dueDate) {
        row.completedWithDue += 1;
        if (ymd(task.completedAt) && ymd(task.completedAt) <= ymd(task.dueDate)) row.completedOnTime += 1;
      }
    } else {
      row.active += 1;
      if (ymd(task.dueDate) && ymd(task.dueDate) < today) row.overdue += 1;
    }
  }

  const rows = Array.from(rowsByUser.values()).map(finalize).sort((a, b) => b.score - a.score || b.completed - a.completed || a.name.localeCompare(b.name, 'th'));
  const teams = Array.from(new Set(rows.map((r) => r.team).filter(Boolean)))
    .map((t) => aggregateTeam(t, rows.filter((r) => r.team === t)))
    .sort((a, b) => b.score - a.score || a.team.localeCompare(b.team, 'th'));
  const summary = aggregateTeam(team || 'รวม', rows);

  return ok({
    from: period.from,
    to: period.to,
    team: team || '',
    scope: user.role === 'senior_ae' ? 'team' : 'all',
    weights: WEIGHTS,
    availableTeams,
    summary,
    rows,
    teams,
  });
});
