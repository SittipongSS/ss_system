import { canUser } from '@/lib/permissions';
import { withUser, ok, fail, forbidden } from '@/lib/http';
import { listTasks, listDepartments } from '@/lib/mgmt/repo';
import { statusCounts, completionPercent, isUrgentOpenTask } from '@/lib/mgmt/constants';
import { naText } from "@/lib/format";

export const dynamic = 'force-dynamic';

// GET /api/mgmt/overview?year= — KPI + ความคืบหน้ารายแผนก + สัดส่วนสถานะ + งานด่วน.
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!canUser(user, 'mgmt:view')) return forbidden();
  const year = new URL(req.url).searchParams.get('year') || undefined;
  try {
    const [tasks, departments] = await Promise.all([
      listTasks(supabase, { year }),
      listDepartments(supabase),
    ]);

    const counts = statusCounts(tasks);
    const percent = completionPercent(tasks);

    // ความคืบหน้ารายแผนก: done / (ไม่นับ cancelled) ต่อ deptCode.
    const byDept = {};
    for (const t of tasks) {
      const code = naText(t.deptCode);
      (byDept[code] ||= { code, total: 0, done: 0 });
      if (t.status === 'cancelled') continue;
      byDept[code].total += 1;
      if (t.status === 'done') byDept[code].done += 1;
    }
    const deptOrder = new Map(departments.map((d, i) => [d.code, i]));
    const progressByDept = Object.values(byDept)
      .filter((d) => d.total > 0)
      .sort((a, b) => (deptOrder.get(a.code) ?? 999) - (deptOrder.get(b.code) ?? 999));

    // งานด่วน — ยังไม่เสร็จ (priority urgent + สถานะเปิด), เรียงตามกำหนดส่ง.
    // ⚠️ ตัวตัดสินเดียวกับมุมมอง `?view=urgentOpen` ของ /mgmt/tasks (การ์ด KPI "งานด่วนที่ยังไม่เสร็จ" พาไปที่นั่น · L4)
    const urgent = tasks
      .filter(isUrgentOpenTask)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

    return ok({
      total: tasks.length,
      counts,
      percent,
      progressByDept,
      urgent,
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});
