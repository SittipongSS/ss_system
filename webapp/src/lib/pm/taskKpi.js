// ── ตัวคิดคะแนน KPI งาน (personal_tasks) — แชร์ระหว่าง KPI งานฝ่ายขาย
// (/api/sales-planning/task-kpi) กับ KPI ฝ่าย RD (/api/sales-planning/rd-kpi)
// เพื่อให้สูตรคะแนนไม่ drift: เสร็จ 40 + ตรงเวลา 40 + ความยาก 20 ──
import { taskCreditId } from '@/lib/permissions';

export const TASK_KPI_WEIGHTS = { completion: 40, onTime: 40, difficulty: 20 };

export function ymd(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// ช่วงเวลาที่วัด: default เดือนปัจจุบัน (client ส่ง from/to มา override ได้)
export function clampPeriod(from, to) {
  const now = new Date();
  const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const last = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}-${String(lastDate.getDate()).padStart(2, '0')}`;
  const start = ymd(from) || first;
  const end = ymd(to) || last;
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

export function inPeriod(task, from, to) {
  const dates = [task.dueDate, task.completedAt, task.startDate, task.createdAt].map(ymd).filter(Boolean);
  if (!dates.length) return false;
  return dates.some((d) => d >= from && d <= to);
}

export function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export function emptyPerson(user) {
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

export function finalize(row) {
  row.completionPct = pct(row.completed, row.total);
  row.onTimePct = row.completedWithDue > 0 ? pct(row.completedOnTime, row.completedWithDue) : (row.completed > 0 ? 100 : 0);
  row.difficultyPct = row.completed > 0 ? pct(row.completedDifficulty, row.completed * 3) : 0;
  row.score = Math.round(
    (row.completionPct * TASK_KPI_WEIGHTS.completion / 100) +
    (row.onTimePct * TASK_KPI_WEIGHTS.onTime / 100) +
    (row.difficultyPct * TASK_KPI_WEIGHTS.difficulty / 100)
  );
  return row;
}

export function aggregateGroup(label, rows) {
  const seed = {
    team: label || '-',
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

// รวมงานที่ผูกกับ ids ทั้ง 3 ทาง: เจ้าของ, ผู้รับมอบ, ผู้ดึงไปทำแทน (proxyBy)
// — งานที่ถูกดึงไปทำแทนต้องนับให้ผู้ทำแทน (taskCreditId) แม้เจ้าของเดิมอยู่คนละทีม.
export async function loadTasksForUsers(supabase, ids) {
  if (!ids?.length) {
    const { data, error } = await supabase.from('personal_tasks').select('*').order('createdAt', { ascending: false });
    if (error) throw error;
    return data || [];
  }
  const [byOwner, byAssignee, byProxy] = await Promise.all([
    supabase.from('personal_tasks').select('*').in('ownerId', ids).order('createdAt', { ascending: false }),
    supabase.from('personal_tasks').select('*').in('assigneeId', ids).order('createdAt', { ascending: false }),
    supabase.from('personal_tasks').select('*').in('proxyBy', ids).order('createdAt', { ascending: false }),
  ]);
  if (byOwner.error) throw byOwner.error;
  if (byAssignee.error) throw byAssignee.error;
  if (byProxy.error) throw byProxy.error;

  const seen = new Set();
  return [...(byOwner.data || []), ...(byAssignee.data || []), ...(byProxy.data || [])]
    .filter((task) => (seen.has(task.id) ? false : seen.add(task.id)));
}

// นับงานหนึ่งชิ้นเข้าแถวของผู้รับเครดิต (mutate row) — ใช้ลูปเดียวกันทั้งสอง KPI
export function tallyTask(row, task, today) {
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

export { taskCreditId };
