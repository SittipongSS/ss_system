import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesTarget } from '@/lib/salesPlanning';
import { businessDayKey } from '@/lib/datePeriods';
import { parseReportPeriod } from '@/lib/sales/reportPeriod';
import { loadSalesReportData } from '@/lib/sales/salesReportData';
import { summarizeSalesReport } from '@/lib/sales/reportSummary';

export const dynamic = 'force-dynamic';

/* รายงานยอดขาย — ยอดรวมเทียบเป้าตามงวด + รายการใบสั่งขายในงวดนั้น
 *
 * 🔒 เปิดให้ `salesplan:target` เท่านั้น (หัวหน้าฝ่ายขาย + admin — มติผู้ใช้)
 * เพราะรายงานนี้กางยอดรายคนทั้งฝ่ายไว้ในหน้าเดียว ต่างจากแท็บผลงานขายที่เปิดกว้างกว่า
 *
 * ⭐ งวด = `?mode=month&month=YYYY-MM` | `?mode=year&year=YYYY` | `?mode=range&from=YYYY-MM-DD&to=YYYY-MM-DD`
 *    (มติผู้ใช้ 2026-09-22 "รายเดือน | ช่วงวัน" แบบหน้าลีด · กติกาที่ lib/sales/reportPeriod)
 * ⭐ ข้อมูลมาจาก lib/sales/salesReportData และตัวเลขสรุปจาก lib/sales/reportSummary —
 *    ตัวเดียวกับไฟล์ Excel (./export/route.js) ⇒ จอกับไฟล์บอกเลขเดียวกันเสมอ
 *    `summary` คิดที่นี่ ไม่ใช่ที่จอ — นาฬิกาเดียวกับไฟล์ ไม่ใช่นาฬิกาเครื่องคนเปิด
 */

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesTarget(user)) return forbidden();

  const now = new Date();
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const period = parseReportPeriod(params, { today: businessDayKey(now.toISOString()) });
  if (period.error) return badRequest(period.error);

  const data = await loadSalesReportData(supabase, period, { now });
  if (data.error) return fail(data.error, data.status || 500);

  return ok({ ...data, summary: summarizeSalesReport(data, { now }) });
});
