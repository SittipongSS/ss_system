// Rollup มูลค่าระดับโครงการ/ลูกค้า จากดีลหลายใบ (Sales Revamp เฟส B) —
// single source ของนิยามตัวเลขทุกหน้า (หน้าโครงการ PM / หน้ารวมโครงการ / Customer 360):
//   FC Total    = Σ FC ของดีล won + เปิด (ไม่นับ lost)  — แผนทั้งโครงการ
//   Actual (AT) = Σ ยอดเก็บจริง (wonValue) ของดีล won    — ปิดได้จริง
//   FC คงเหลือ  = Σ FC ของดีลที่ยังเปิด                  — ที่ยังต้องตามปิด
//
// หมายเหตุ: FC Total − Actual ≠ FC คงเหลือ เมื่อยอดปิดจริงต่างจาก FC — ส่วนต่างคือ
// variance (วัดความแม่น FC). นิยามตรงกับ dashboard เดิม (fullForecast/remainingForecast).
// ห้ามกรอกมูลค่าที่ตัวโครงการ — rollup จากดีลเสมอ (กัน double-count).
import { DEAL_TYPES, dealTypeOf, isOpenStage, isWonStage } from '@/lib/salesPlanning';
import {
  dealActualFromSalesOrders,
  dealPendingApprovalAmount,
  dealPendingApprovalCount,
} from '@/lib/sales/salesOrderWorkflow';
import { dealClosedValueOf, installmentRemainingAmountOf } from '@/lib/sales/dashboardMetrics';

// Actual ของดีล — อ่าน cache ที่ DB คำนวณจาก Approved SO เท่านั้น.
export const wonAmt = dealActualFromSalesOrders;
/* "ยอดปิดเต็ม" ของดีล Won (mig 0412 · มติเจ้าของ 26/10/2026) = Actual + งวดที่ยื่นแล้ว + รอนับรายงวด
   ⭐ ใบ "Actual รายงวด" ที่นับไปบางงวดต้องไม่ทำให้ "มูลค่าโครงการ" หด หรือ variance ติดลบเท่างวดที่ยังไม่ถึงคิว
   ⭐ ใบทั้งใบ = wonAmt เท่าเดิมทุกดีล (สองคีย์ของงวดไม่มีค่า) · ⛔ ใบทั้งใบที่รออนุมัติ (soPending*) ไม่อยู่ในนี้ (กติกาเดิม) */
export const closedAmt = dealClosedValueOf;
// ยอด SO "รออนุมัติ" ของดีล (mig 0353) — แยกจาก Actual · นับเฉพาะดีล Won (อยู่ในกิ่ง Won ด้านล่าง)
export const pendingApprovalAmt = dealPendingApprovalAmount;
export const forecastAmt = (d) => Number(d?.projectValue ?? 0);
// 'in_project' = สถานะเก่าก่อน mig 0082 (ยุบเป็น won) — ข้อมูลเก่าอาจยังมี
// (นิยามอยู่ที่ isWonStage/isOpenStage ใน lib/salesPlanning — เดิมไฟล์นี้มีสำเนาของตัวเอง)
export const isWonDeal = (d) => isWonStage(d?.stage);
export const isOpenDeal = (d) => isOpenStage(d?.stage);

const emptyBucket = () => ({
  fcTotal: 0, actual: 0, closedValue: 0, pendingApproval: 0, pendingApprovalCount: 0, instRemaining: 0, instRemainingCount: 0,
  fcRemaining: 0, openCount: 0, wonCount: 0, lostCount: 0,
});

// rollupDeals(deals[]) → ตัวเลขรวม + แยกตามประเภทดีล 3 ค่า + เดือน FC ถัดไป
export function rollupDeals(deals = []) {
  const total = emptyBucket();
  const byType = Object.fromEntries(DEAL_TYPES.map((t) => [t, { type: t, ...emptyBucket() }]));
  let nextForecastMonth = null;

  for (const d of deals) {
    const buckets = [total, byType[dealTypeOf(d)]];
    if (isWonDeal(d)) {
      for (const b of buckets) {
        b.actual += wonAmt(d);
        b.closedValue += closedAmt(d);
        b.instRemaining += installmentRemainingAmountOf(d);
        if (installmentRemainingAmountOf(d) > 0) b.instRemainingCount += 1;
        b.pendingApproval += pendingApprovalAmt(d);
        b.pendingApprovalCount += dealPendingApprovalCount(d);
        b.fcTotal += forecastAmt(d);
        b.wonCount += 1;
      }
    } else if (d?.stage === 'lost') {
      for (const b of buckets) b.lostCount += 1;
    } else {
      for (const b of buckets) { b.fcRemaining += forecastAmt(d); b.fcTotal += forecastAmt(d); b.openCount += 1; }
      const m = String(d?.forecastMonth || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(m) && (!nextForecastMonth || m < nextForecastMonth)) nextForecastMonth = m;
    }
  }

  return {
    fcTotal: total.fcTotal,
    actual: total.actual,
    // ยอด SO ที่ยื่นแล้วรออนุมัติ — **ไม่อยู่ใน actual** · ใบทั้งใบที่รออนุมัติไม่อยู่ใน totalValue / variance (มติ 2026-09-11)
    // (งวดที่ยื่นแล้วของใบ "Actual รายงวด" อยู่ในก้อนนี้ด้วย และอยู่ใน closedValue — mig 0412)
    pendingApproval: total.pendingApproval,
    pendingApprovalCount: total.pendingApprovalCount,
    // "ยอดปิดเต็ม" ของดีล Won (Actual + งวดยื่นแล้ว + รอนับรายงวด · mig 0412) · ใบทั้งใบล้วน = actual
    closedValue: total.closedValue,
    // กอง "รอนับรายงวด" — งวดของใบรายงวดที่ยังไม่ยื่น (อยู่ใน closedValue แล้ว ไม่ใช่ Actual) · จำนวนดีลที่มีกองนี้
    // ⭐ review รอบสี่ 26/10: หน้ารวมโครงการ + ศูนย์รวมดีลวางเป็นบรรทัดรองใต้ Actual (InstRemainingAmount · มติข้อ 5) —
    //   เดิมคิดไว้แต่ไม่มีจอไหนอ่าน ⇒ ใบรายงวดที่นับไปงวดเดียวทำให้โครงการดูปิดได้น้อยกว่าจริงเท่ายอดที่ยังไม่ถึงคิว
    instRemaining: total.instRemaining,
    instRemainingCount: total.instRemainingCount,
    fcRemaining: total.fcRemaining,
    // "มูลค่าโครงการ" = ยอดปิดเต็มของดีล Won + ที่ยังต้องตามปิด (ใบทั้งใบล้วน = ยอดจริงที่เก็บแล้ว + ที่ยังต้องตามปิด เท่าเดิม)
    totalValue: total.closedValue + total.fcRemaining,
    // variance = ปิดได้มาก/น้อยกว่า FC ที่วางไว้ (เฉพาะดีล won; บวก = เกินแผน) — เทียบยอดปิดเต็ม ไม่ใช่ Actual ที่นับไปบางงวด
    variance: total.closedValue - (total.fcTotal - total.fcRemaining),
    openCount: total.openCount,
    wonCount: total.wonCount,
    lostCount: total.lostCount,
    dealCount: deals.length,
    byType: DEAL_TYPES.map((t) => byType[t]),
    nextForecastMonth,
  };
}
