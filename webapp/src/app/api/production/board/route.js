// ── API บอร์ดตารางผลิต (P-3) ──────────────────────────────────────────────
// GET ?from=&to= : ไลน์ + งานที่กินกำลังในช่วง + override กำลังรายวัน + ของเข้า
//
// ⭐ คืนทุกอย่างที่บอร์ดต้องใช้ในคำขอเดียว — บอร์ด 4 สัปดาห์ × 6 ไลน์ ถ้ายิงแยก
// จะกลายเป็น 20+ คำขอต่อการเปิดหน้าหนึ่งครั้ง
import { withUser, ok, fail, badRequest } from '@/lib/http';
import { toLocalISODate } from '@/lib/pm/dateHelpers';
import { deliveriesForSalesOrder, productionReadiness } from '@/lib/pm/deliveries';
import { LIVE_JOB_STATUSES } from '@/lib/pm/productionPlan';
import { deliveriesForJobs, loadJobs } from '@/lib/pm/productionJobsRepo';
import { loadCapacityDays, loadLines, requireProduction } from '@/lib/pm/productionLinesRepo';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withUser(async ({ user, supabase, req }) => {
  // ⭐ อ่านอย่างเดียว — ฝ่ายขาย/คลัง/QC เปิดดูได้ตามมติแยกทีม (canViewProduction
  // แคบ staff เหลือ PC/PD/WH/QC · TS ไม่เห็น)
  const access = requireProduction({ user });
  if (access.response) return access.response;

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!ISO_DATE.test(String(from)) || !ISO_DATE.test(String(to))) {
    return badRequest('ต้องระบุช่วงวันที่ให้ถูกต้อง (from/to)');
  }
  if (to < from) return badRequest('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');

  try {
    const [lines, jobs, capacityDays] = await Promise.all([
      loadLines(supabase),
      // ⚠️ ไม่กรอง from ที่ query — งานที่เริ่มก่อนช่วงแต่ยัง "เดินคร่อม" เข้ามาในช่วง
      // ต้องติดมาด้วย ไม่งั้นบอร์ดจะบอกว่าไลน์ว่างทั้งที่มีงานค้างอยู่จริง
      loadJobs(supabase, { status: LIVE_JOB_STATUSES, to }),
      loadCapacityDays(supabase, { from, to }),
    ]);

    // ของเข้าของ SO ที่งานบนบอร์ดอ้างถึง → ป้าย "วางก่อนของมา" บนชิป
    const deliveries = await deliveriesForJobs(supabase, jobs);
    const todayIso = businessDate();
    const withReadiness = jobs.map((job) => ({
      ...job,
      readiness: job.salesOrderId
        ? productionReadiness(deliveriesForSalesOrder(deliveries.get(job.salesOrderId) || [], job.salesOrderId), todayIso)
        : null,
    }));

    return ok({ lines, jobs: withReadiness, capacityDays });
  } catch (e) {
    return fail(e.message, 500);
  }
});
