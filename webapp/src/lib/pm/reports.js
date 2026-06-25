// ── PM (project management): operational + management reports ─────────────
// PM owns its workflow reports (งานค้าง / เกินกำหนด / workload / by-team) — the
// counterpart of /tax/reports for the sales-PM side. Three reports:
//   project  — ภาพรวมโครงการ (operational): สถานะ/ความคืบหน้า/งานเกินกำหนดต่อโครงการ
//   overdue  — งานเกินกำหนด (operational): หนึ่งแถวต่อ task ที่เลยกำหนดและยังไม่เสร็จ
//   team     — สรุปตามทีม (management): จำนวนโครงการ/อัตราเกินกำหนด/ความคืบหน้าเฉลี่ย
//
// Uniform report shape (shared with tax/master). Server-only: service-role
// client. The API route decides team scope (passes `team`) — supervisor/all-team
// roles may filter by ?team; team-scoped roles are pinned to their own team.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { TEAM_LABELS, TEAMS, DEPARTMENT_LABELS } from '@/lib/permissions';

const teamLabel = (t) => (t ? (TEAM_LABELS[t] || t) : '-');
const two = (a, b) => `${a}\n${b}`;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const inRange = (value, from, to) => {
  if (!from && !to) return true;
  if (!value) return false;
  const t = new Date(value).getTime();
  if (isNaN(t)) return false;
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + 86399999) return false;
  return true;
};

// ── computed metrics (mirror src/app/pm/projects/page.js so reports agree with
// the board) ──────────────────────────────────────────────────────────────
const computedStatus = (p, today) => {
  if (p.status === 'Dropped') return 'Dropped';
  if (p.status === 'On Hold') return 'On Hold';
  const total = p.tasks?.length || 0;
  const done = (p.tasks || []).filter((t) => t.status === 'Completed').length;
  if (total > 0 && done === total) return 'Completed';
  const overdue = (p.tasks || []).filter((t) => t.status !== 'Completed' && t.finishDate && new Date(t.finishDate) < today).length;
  if (overdue > 0) return 'Delayed';
  if (total === 0 || (p.tasks || []).every((t) => t.status === 'Pending')) return 'New';
  return 'On Track';
};
const progressPct = (p) => {
  const total = p.tasks?.length || 0;
  const done = (p.tasks || []).filter((t) => t.status === 'Completed').length;
  return total ? Math.round((done / total) * 100) : 0;
};
const overdueCount = (p, today) =>
  (p.tasks || []).filter((t) => t.status !== 'Completed' && t.finishDate && new Date(t.finishDate) < today).length;
const currentStep = (p, today) => {
  if (computedStatus(p, today) === 'Completed') return 'เสร็จทุกขั้นตอน';
  const active = (p.tasks || []).find((t) => t.status === 'In Progress');
  return active ? active.name : ((p.tasks || []).find((t) => t.status === 'Pending')?.name || '-');
};
const STATUS_LABEL = {
  New: 'ใหม่', 'On Track': 'ตามแผน', Delayed: 'ล่าช้า',
  'On Hold': 'พักไว้', Dropped: 'ยกเลิก', Completed: 'เสร็จสิ้น',
};
const statusLabel = (s) => STATUS_LABEL[s] || s;

// Load scoped projects + attach their tasks (same shape the board/list uses).
async function fetchProjectsWithTasks({ team } = {}) {
  const supabase = getSupabaseAdmin();
  let q = supabase.from('projects').select('*').order('createdAt', { ascending: false });
  if (team) q = q.eq('team', team);
  const { data: projects, error } = await q;
  if (error) throw error;

  const ids = (projects || []).map((p) => p.id);
  if (ids.length) {
    const { data: tasks, error: tErr } = await supabase
      .from('project_tasks')
      .select('id, projectId, name, role, assignee, status, finishDate, stepOrder')
      .in('projectId', ids)
      .order('stepOrder', { ascending: true });
    if (tErr) throw tErr;
    const byProject = {};
    for (const t of tasks || []) (byProject[t.projectId] ??= []).push(t);
    for (const p of projects) p.tasks = byProject[p.id] || [];
  }
  return projects || [];
}

// 1) ภาพรวมโครงการ (operational) — one row per project.
export async function projectOverviewReport(filter = {}) {
  const { from, to, status } = filter;
  const today = startOfToday();
  const projects = (await fetchProjectsWithTasks(filter)).filter((p) => inRange(p.createdAt, from, to));

  const rows = [];
  const tallyStatus = {};
  for (const p of projects) {
    const cs = computedStatus(p, today);
    tallyStatus[cs] = (tallyStatus[cs] || 0) + 1;
    if (status && status !== 'all' && cs !== status) continue;
    rows.push({
      id: p.id,
      project: two(p.code || '-', p.name || '-'),
      customer: p.customerName || '-',
      team: teamLabel(p.team),
      owner: p.aeOwner || '-',
      status: statusLabel(cs),
      progress: progressPct(p),
      overdue: overdueCount(p, today),
      step: currentStep(p, today),
      due: p.dueDate && /^\d{4}-\d{2}-\d{2}/.test(p.dueDate) ? p.dueDate : null,
    });
  }

  return {
    type: 'project',
    title: 'รายงานภาพรวมโครงการ',
    columns: [
      { key: 'project', label: 'รหัส / ชื่อโครงการ', multiline: true },
      { key: 'customer', label: 'ลูกค้า' },
      { key: 'team', label: 'ทีม' },
      { key: 'owner', label: 'ผู้รับผิดชอบ (AE)' },
      { key: 'status', label: 'สถานะ' },
      { key: 'progress', label: 'ความคืบหน้า (%)', num: true },
      { key: 'overdue', label: 'งานเกินกำหนด', num: true },
      { key: 'step', label: 'ขั้นปัจจุบัน' },
      { key: 'due', label: 'กำหนดส่ง', date: true },
    ],
    rows,
    summary: {
      _label: `รวม ${rows.length} โครงการ`,
      overdue: rows.reduce((s, r) => s + r.overdue, 0),
      step: `ตามแผน ${tallyStatus['On Track'] || 0} · ล่าช้า ${tallyStatus['Delayed'] || 0} · เสร็จ ${tallyStatus['Completed'] || 0} · ใหม่ ${tallyStatus['New'] || 0}`,
    },
  };
}

// 2) งานเกินกำหนด (operational) — one row per overdue, not-completed task.
export async function overdueTasksReport(filter = {}) {
  const today = startOfToday();
  const projects = await fetchProjectsWithTasks(filter);

  const rows = [];
  for (const p of projects) {
    // Dropped projects are out of play — their tasks aren't "overdue work".
    if (p.status === 'Dropped') continue;
    for (const t of p.tasks || []) {
      if (t.status === 'Completed' || !t.finishDate) continue;
      const fin = new Date(t.finishDate);
      if (isNaN(fin.getTime()) || fin >= today) continue;
      const days = Math.floor((today.getTime() - fin.getTime()) / 86400000);
      rows.push({
        id: t.id,
        project: two(p.code || '-', p.name || '-'),
        task: t.name || '-',
        dept: DEPARTMENT_LABELS[t.role] || t.role || '-',
        assignee: t.assignee || '— ยังไม่มอบหมาย —',
        team: teamLabel(p.team),
        finish: t.finishDate,
        overdueDays: days,
      });
    }
  }
  rows.sort((a, b) => b.overdueDays - a.overdueDays);

  return {
    type: 'overdue',
    title: 'รายงานงานที่เกินกำหนด',
    columns: [
      { key: 'project', label: 'รหัส / ชื่อโครงการ', multiline: true },
      { key: 'task', label: 'งาน' },
      { key: 'dept', label: 'ฝ่าย' },
      { key: 'assignee', label: 'ผู้รับผิดชอบ' },
      { key: 'team', label: 'ทีม' },
      { key: 'finish', label: 'กำหนดเสร็จ', date: true },
      { key: 'overdueDays', label: 'เกินกำหนด (วัน)', num: true },
    ],
    rows,
    summary: {
      _label: `รวม ${rows.length} งานที่เกินกำหนด`,
      overdueDays: rows.length ? Math.max(...rows.map((r) => r.overdueDays)) : 0,
    },
  };
}

// 3) สรุปตามทีม (management) — one row per team in scope.
export async function teamSummaryReport(filter = {}) {
  const { team } = filter;
  const today = startOfToday();
  const projects = await fetchProjectsWithTasks(filter);

  // When pinned to one team, report only that team; else every team that has data.
  const teamsToShow = team ? [team] : TEAMS;
  const byTeam = new Map(teamsToShow.map((t) => [t, []]));
  for (const p of projects) {
    if (!byTeam.has(p.team)) {
      if (team) continue; // out of the pinned team
      byTeam.set(p.team, []); // unknown/null team bucket (only in all-team view)
    }
    byTeam.get(p.team).push(p);
  }

  const rows = [];
  let totProjects = 0, totOverdueTasks = 0;
  for (const [t, ps] of byTeam) {
    if (!ps.length && team == null && !TEAMS.includes(t)) continue;
    const statuses = ps.map((p) => computedStatus(p, today));
    const completed = statuses.filter((s) => s === 'Completed').length;
    const delayed = statuses.filter((s) => s === 'Delayed').length;
    const active = statuses.filter((s) => s === 'On Track' || s === 'Delayed').length;
    const overdueTasks = ps.reduce((s, p) => s + overdueCount(p, today), 0);
    const avgProgress = ps.length ? Math.round(ps.reduce((s, p) => s + progressPct(p), 0) / ps.length) : 0;
    const overdueRate = ps.length ? Math.round((delayed / ps.length) * 100) : 0;
    totProjects += ps.length;
    totOverdueTasks += overdueTasks;
    rows.push({
      id: t || '_none',
      team: teamLabel(t),
      projects: ps.length,
      active,
      completed,
      delayed,
      overdueTasks,
      avgProgress,
      overdueRate: `${overdueRate}%`,
    });
  }

  return {
    type: 'team',
    title: 'รายงานสรุปโครงการตามทีม',
    columns: [
      { key: 'team', label: 'ทีม' },
      { key: 'projects', label: 'โครงการทั้งหมด', num: true },
      { key: 'active', label: 'กำลังดำเนินการ', num: true },
      { key: 'completed', label: 'เสร็จสิ้น', num: true },
      { key: 'delayed', label: 'ล่าช้า', num: true },
      { key: 'overdueTasks', label: 'งานเกินกำหนด', num: true },
      { key: 'avgProgress', label: 'ความคืบหน้าเฉลี่ย (%)', num: true },
      { key: 'overdueRate', label: 'อัตราล่าช้า' },
    ],
    rows,
    summary: {
      _label: `รวม ${rows.length} ทีม`,
      projects: totProjects,
      overdueTasks: totOverdueTasks,
    },
  };
}

export const PM_REPORTS = {
  project: projectOverviewReport,
  overdue: overdueTasksReport,
  team: teamSummaryReport,
};

export async function buildPmReport(type, filter = {}) {
  const fn = PM_REPORTS[type];
  if (!fn) throw new Error(`unknown pm report type: ${type}`);
  return fn(filter);
}
