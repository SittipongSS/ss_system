// ── ตัวคิดคะแนน KPI งาน (personal_tasks) — แชร์ระหว่าง KPI งานฝ่ายขาย
// (/api/sales-planning/task-kpi) · ฝั่ง RD เคยเรียกตัวนี้ด้วย แต่แดชบอร์ด RD ถูกลบแล้ว
// เพื่อให้สูตรคะแนนไม่ drift: เสร็จ 40 + ตรงเวลา 40 + ความยาก 20 ──
import { taskCreditId } from '@/lib/permissions';
import { isWaitingStatus } from '@/lib/pm/tasks';
import { fetchAll } from '@/lib/supabaseFetchAll';

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

/* คืน **ค่าดิบ ไม่ปัด** — จอเป็นคนจัดรูปแบบ (fmtPercent = 2 ตำแหน่ง)
   ⚠️ ปัดที่นี่แล้วจอเติม ".00" กลับเข้าไป จะได้ "67.00%" จาก 8/12 ซึ่งอ้างความ
   ละเอียดที่ไม่มีอยู่จริง — ของจริงคือ 66.67% · `score` ด้านล่างยังเป็นจำนวนเต็ม
   เพราะ Math.round ครอบผลรวมอยู่แล้ว */
export function pct(n, d) {
  return d > 0 ? (n / d) * 100 : 0;
}

export function emptyPerson(user) {
  return {
    userId: user.id,
    name: user.name || user.email || user.id,
    role: user.role || '',
    // ทีมหลัก (คอลัมน์เดี่ยวบนตาราง KPI) — คนอยู่หลายทีมยังนับยอดเข้าทีมหลักทีมเดียว
    team: user.team || '',
    total: 0,
    completed: 0,
    active: 0,
    waiting: 0,
    overdue: 0,
    overdueWaiting: 0,
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
    waiting: 0,
    overdue: 0,
    overdueWaiting: 0,
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
    seed.waiting += row.waiting;
    seed.overdue += row.overdue;
    seed.overdueWaiting += row.overdueWaiting;
    seed.completedOnTime += row.completedOnTime;
    seed.completedWithDue += row.completedWithDue;
    seed.completedDifficulty += row.completedDifficulty;
  }
  return finalize(seed);
}

// รวมงานที่ผูกกับ ids ทั้ง 3 ทาง: เจ้าของ, ผู้รับมอบ, ผู้ดึงไปทำแทน (proxyBy)
// — งานที่ถูกดึงไปทำแทนต้องนับให้ผู้ทำแทน (taskCreditId) แม้เจ้าของเดิมอยู่คนละทีม.
/* 🐞 เพดาน Max rows = 1000 ของ PostgREST ตัดผลลัพธ์เงียบ ๆ และ `personal_tasks`
   เกินเพดานไปแล้ว (1,045 แถว เมื่อ 2026-08-16) ⇒ KPI **ที่ใช้วัดผลคน** เคยคิดจาก
   งานไม่ครบโดยไม่มีใครดูออก เพราะผลลัพธ์เป็นตัวเลขสรุป ไม่ใช่รายการที่ตาเห็นว่าสั้นไป
   ⚠️ พ่วง `id` ท้าย `createdAt` ให้ลำดับนิ่ง — เวลาสร้างซ้ำกันได้ (นำเข้าทีเดียวหลายงาน)
   และลำดับที่ไม่นิ่งทำให้ไล่ทีละหน้าแล้วได้แถวซ้ำ+แถวหายพร้อมกัน */
const allPersonalTasks = (supabase, where = (q) => q) => fetchAll(() => where(
  supabase.from('personal_tasks').select('*'),
).order('createdAt', { ascending: false }).order('id', { ascending: true }));

export async function loadTasksForUsers(supabase, ids) {
  if (!ids?.length) return allPersonalTasks(supabase);

  const [byOwner, byAssignee, byProxy] = await Promise.all([
    allPersonalTasks(supabase, (q) => q.in('ownerId', ids)),
    allPersonalTasks(supabase, (q) => q.in('assigneeId', ids)),
    allPersonalTasks(supabase, (q) => q.in('proxyBy', ids)),
  ]);

  const seen = new Set();
  return [...byOwner, ...byAssignee, ...byProxy]
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
    // งานที่รอคนอื่น (mig 0266) ยังนับเป็น active และยัง **นับเกินกำหนดตามปกติ**
    // (มติผู้ใช้: เดดไลน์ไม่หยุดเดินไม่ว่ารออะไร) — แต่แยกยอดออกมาให้เห็นด้วยว่า
    // ในจำนวนที่เกินกำหนด มีกี่ใบที่เจ้าตัวเร่งเองไม่ได้ ไม่งั้นคะแนนอ่านผิดคน
    if (isWaitingStatus(task.status)) row.waiting += 1;
    if (ymd(task.dueDate) && ymd(task.dueDate) < today) {
      row.overdue += 1;
      if (isWaitingStatus(task.status)) row.overdueWaiting += 1;
    }
  }
}

export { taskCreditId };
