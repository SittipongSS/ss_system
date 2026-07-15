// Rollup มูลค่าระดับโครงการ/ลูกค้า จากดีลหลายใบ (Sales Revamp เฟส B) —
// single source ของนิยามตัวเลขทุกหน้า (หน้าโครงการ PM / หน้ารวมโครงการ / Customer 360):
//   FC Total    = Σ FC ของดีล won + เปิด (ไม่นับ lost)  — แผนทั้งโครงการ
//   Actual (AT) = Σ ยอดเก็บจริง (wonValue) ของดีล won    — ปิดได้จริง
//   FC คงเหลือ  = Σ FC ของดีลที่ยังเปิด                  — ที่ยังต้องตามปิด
//
// หมายเหตุ: FC Total − Actual ≠ FC คงเหลือ เมื่อยอดปิดจริงต่างจาก FC — ส่วนต่างคือ
// variance (วัดความแม่น FC). นิยามตรงกับ dashboard เดิม (fullForecast/remainingForecast).
// ห้ามกรอกมูลค่าที่ตัวโครงการ — rollup จากดีลเสมอ (กัน double-count).
import { DEAL_TYPES, dealTypeOf } from '@/lib/salesPlanning';
import { dealActualFromSalesOrders } from '@/lib/sales/salesOrderWorkflow';

// Actual ของดีล — อ่าน cache ที่ DB คำนวณจาก Approved SO เท่านั้น.
export const wonAmt = dealActualFromSalesOrders;
export const forecastAmt = (d) => Number(d?.projectValue ?? 0);
// 'in_project' = สถานะเก่าก่อน mig 0082 (ยุบเป็น won) — ข้อมูลเก่าอาจยังมี
export const isWonDeal = (d) => ['won', 'in_project'].includes(d?.stage);
export const isOpenDeal = (d) => !['won', 'in_project', 'lost'].includes(d?.stage);

const emptyBucket = () => ({ fcTotal: 0, actual: 0, fcRemaining: 0, openCount: 0, wonCount: 0, lostCount: 0 });

// rollupDeals(deals[]) → ตัวเลขรวม + แยกตามประเภทดีล 3 ค่า + เดือน FC ถัดไป
export function rollupDeals(deals = []) {
  const total = emptyBucket();
  const byType = Object.fromEntries(DEAL_TYPES.map((t) => [t, { type: t, ...emptyBucket() }]));
  let nextForecastMonth = null;

  for (const d of deals) {
    const buckets = [total, byType[dealTypeOf(d)]];
    if (isWonDeal(d)) {
      for (const b of buckets) { b.actual += wonAmt(d); b.fcTotal += forecastAmt(d); b.wonCount += 1; }
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
    fcRemaining: total.fcRemaining,
    // "มูลค่าโครงการ" = ยอดจริงที่เก็บแล้ว + ที่ยังต้องตามปิด
    totalValue: total.actual + total.fcRemaining,
    // variance = ปิดได้มาก/น้อยกว่า FC ที่วางไว้ (เฉพาะดีล won; บวก = เกินแผน)
    variance: total.actual - (total.fcTotal - total.fcRemaining),
    openCount: total.openCount,
    wonCount: total.wonCount,
    lostCount: total.lostCount,
    dealCount: deals.length,
    byType: DEAL_TYPES.map((t) => byType[t]),
    nextForecastMonth,
  };
}
