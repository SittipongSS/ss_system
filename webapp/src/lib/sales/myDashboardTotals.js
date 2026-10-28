// ── ตัวเลขยอดของแดชบอร์ดของฉัน (`/api/sales-planning/my-dashboard`) ─────────────
// แยกออกจาก route เพื่อให้เทสต์กติกาได้โดยไม่ต้องมี supabase (route.js export ได้แค่
// HTTP handler) · ที่นี่รับ "ดีลของฉัน" ที่โหลดมาแล้ว ไม่แตะฐานข้อมูล ไม่อ่านนาฬิกาเอง
// (ผู้เรียกส่ง `now` มา — เทสต์ตรึงเวลาได้)
//
// ⭐ ทุกกติกามาจากตัวช่วยกลางใน `dashboardMetrics` — เดิม route ก๊อปลำดับเดือน Won
//    (`wonMonth → confirmedAt → poReceivedDate → forecastMonth`) ไว้เอง แก้ที่กลางแล้ว
//    ไม่ถึงที่นี่ (มีสามสำเนา: ที่นี่ · history · dashboardMetrics)
import { forecastAmount } from '@/lib/salesPlanning';
import { FORECAST_VALUES, snapForecastLevel } from '@/lib/sales/forecastLevels';
import {
  isKpiDeal,
  isOpenDeal,
  pendingApprovalAmountOf,
  pendingApprovalCountOf,
  pendingApprovalMonthOf,
} from '@/lib/sales/dashboardMetrics';
import { actualInPeriodOf, instRemainingInPeriodOf } from '@/lib/sales/actualMonthRollup';
import { currentMonth } from '@/lib/datePeriods';

/** เดือน 'YYYY-MM' อยู่ในงวดที่เลือกไหม — เดือนเดียว หรือทั้งปีเมื่อติ๊ก "ทุกเดือน" (`year` = 'YYYY') */
export function monthInPeriod(monthValue, { month, year = null } = {}) {
  if (!monthValue) return false;
  return year ? String(monthValue).slice(0, 4) === year : monthValue === month;
}

/**
 * สรุปยอดของงวดจากดีลของฉัน
 *
 * - `wonValue`   ยอดปิดได้ (Actual) = Σ ส่วนของ Actual ที่ตกเดือนในงวด ของดีล Won (actualByMonth · mig 0412)
 *     ใบทั้งใบ = ยอดเต็มที่เดือนอนุมัติใบ (เท่าเดิม) · ใบ "Actual รายงวด" = งวดที่อนุมัติในเดือนนั้น ๆ เท่านั้น
 * - `instRemaining` / `instRemainingCount`  กอง "รอนับรายงวด" (mig 0412 · มติข้อ 5) — งวดของใบรายงวดที่ยังไม่ยื่น
 *     ลงเดือนครบกำหนด (เลยกำหนด/ไม่มีวัน = เดือนปัจจุบันเวลาไทย) · **ช่องแยก ไม่เคยบวกเข้า wonValue / targetGap**
 * - `pendingApproval` / `pendingApprovalCount`  ยอด SO "รออนุมัติ" (มติผู้ใช้ 2026-09-11 · mig 0353)
 *     **ช่องแยก ไม่เคยบวกเข้า wonValue** · นับเฉพาะดีล Won · เดือนของมัน = เดือนปัจจุบัน
 *     (เวลาไทย) เสมอ ⇒ งวดที่เลือกเป็นเดือนที่ผ่านไปแล้ว/ปีก่อน = 0 เสมอ
 * - `targetGap`  เป้า − Actual **เท่านั้น** — ขับทั้งข้อความ "ขาดอีก/เกินเป้า" และสีเขียว
 *     "เกินเป้า" ของการ์ด ⇒ บวกยอดรออนุมัติเข้ามาเมื่อไร การ์ดขึ้นเขียวทั้งที่ยังไม่มีใครอนุมัติ
 * - `pipelineValue` / `openDealsCount` / `weightedForecast` / `byForecast`  ดีลที่ยังเปิด
 *     ทุกงวด (ไม่กรองเดือน) · ดีล Won ที่ SO รออนุมัติ **ไม่อยู่ที่นี่** — มันปิดแล้ว
 */
export function summarizeMyDeals(deals = [], { month, year = null, target = 0, now = new Date() } = {}) {
  const period = { month, year };
  // ⛔ ดีลของใบสั่งขายย้อนหลัง (mig 0360) ไม่ใช่ยอดขาย/ท่อ — ตัดตั้งแต่ต้นทาง ตัวเลขข้างล่างทุกตัวจึงไม่เห็นมัน
  const list = (deals || []).filter(isKpiDeal);

  /* ยอดปิดได้ของงวดที่เลือก — Actual รายเดือนของดีล (actualByMonth · mig 0412) ตัวรวมเดียวกับหน้าผลงานขาย
     ⭐ ดีลที่แตกหลายเดือนได้เฉพาะส่วนของเดือนในงวด · ใบทั้งใบล้วน = wonValue ที่เดือน Won เท่าเดิมทุกดีล
     🪤 ห้ามกลับไปคัด wonMonthOf แล้วบวก wonValue ทั้งก้อน — งวดที่อนุมัติเดือนหลังจะลากงวดเก่าตามไปด้วย */
  const inPeriod = (mk) => monthInPeriod(mk, period);
  const wonValue = list.reduce((sum, d) => sum + actualInPeriodOf(d, inPeriod), 0);
  // กอง "รอนับรายงวด" — พับเดือนด้วยนาฬิกาของคำขอ (ตัวเดียวกับยอดรออนุมัติ) · ⛔ ไม่เข้า wonValue / targetGap
  const thisMonth = currentMonth(now);
  let instRemaining = 0;
  let instRemainingCount = 0;
  for (const d of list) {
    const amount = instRemainingInPeriodOf(d, inPeriod, thisMonth);
    if (!(amount > 0)) continue;
    instRemaining += amount;
    instRemainingCount += 1;
  }

  /* ⚠️ ยอดรออนุมัติคัดด้วยเดือนของมันเอง (`pendingApprovalMonthOf` = เดือนปัจจุบันเวลาไทย)
     **ไม่ใช่** wonMonthOf — ดีลที่ SO ยังไม่อนุมัติไม่มี wonMonth จึงตกไปเดือน confirmedAt
     แบบ UTC ซึ่งอาจเป็นเดือนก่อน ทั้งที่อนุมัติวันนี้ Actual ต้องลงเดือนนี้ */
  let pendingApproval = 0;
  let pendingApprovalCount = 0;
  for (const d of list) {
    if (!monthInPeriod(pendingApprovalMonthOf(d, now), period)) continue;
    pendingApproval += pendingApprovalAmountOf(d);
    pendingApprovalCount += pendingApprovalCountOf(d);
  }

  const openDeals = list.filter(isOpenDeal);
  const pipelineValue = openDeals.reduce((sum, d) => sum + Number(d.projectValue || 0), 0);
  const weightedForecast = openDeals.reduce((sum, d) => sum + forecastAmount(d), 0);
  // ระดับ FC มาจาก lib/sales/forecastLevels (แหล่งเดียว)
  const byForecast = FORECAST_VALUES.map((level) => {
    const dealsInLevel = openDeals.filter((d) => snapForecastLevel(d.probability) === level);
    return {
      level,
      count: dealsInLevel.length,
      value: dealsInLevel.reduce((sum, d) => sum + Number(d.projectValue || 0), 0),
    };
  });

  return {
    wonValue,
    pendingApproval,
    pendingApprovalCount,
    instRemaining: Math.round(instRemaining * 100) / 100,
    instRemainingCount,
    targetGap: Number(target || 0) - wonValue,
    pipelineValue,
    weightedForecast,
    openDealsCount: openDeals.length,
    byForecast,
  };
}
