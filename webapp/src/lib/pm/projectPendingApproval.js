/* ยอด SO "รออนุมัติ" บนหน้าโครงการ — หน้ารวม /sa/projects + ศูนย์รวมดีล (ProjectDealsHub)
   (มติผู้ใช้ 2026-09-11 · mig 0353)

   ผู้ใช้แจ้ง: "SO ที่รออนุมัติ มันกลายเป็น 0 อยากให้โชว์ยอดด้วย แต่แยกให้รู้ว่า
   รออนุมัติ กับ Actual" ⇒ ไฟล์นี้ตอบแค่ "ตัวเลขไหนวางตรงไหน" ของสองจอนั้น
   ส่วนนิยามยอดอยู่ที่ตัวกลางเดิมทั้งหมด (salesOrderWorkflow · projectRollup)

   ⭐ ยอดรออนุมัติเป็น **ตัวเลขแยก** วางข้าง Actual เสมอ — ห้ามบวกเข้า actual /
      มูลค่าโครงการ / variance (ตัวรวมต้นทาง rollupDeals ก็แยกช่องไว้แล้ว)
   ⭐ ระดับดีล: นับเฉพาะดีล Won — ดีลเปิดมี FC อยู่ใน FC คงเหลือแล้ว โชว์คู่ = นับซ้ำ
   ⭐ ระดับแถว SO: สามสถานะจาก salesOrderAmountKind ตัวเดียวกับทุกตาราง SO ในระบบ
   ⚠️ pure ล้วน (ไม่แตะ DB/React) — จอเรียกได้ เทสต์เรียกได้ */
import {
  SALES_ORDER_STATUS_LABELS,
  dealPendingApprovalAmount,
  dealPendingApprovalCount,
  salesOrderActual,
  salesOrderAmountKind,
  salesOrderPendingApprovalAmount,
} from '@/lib/sales/salesOrderWorkflow';
import { forecastAmt, isWonDeal, wonAmt } from '@/lib/sales/projectRollup';

const num = (value) => Number(value) || 0;

// มีใบรออนุมัติไหม — กติกาเดียวกับ PendingApprovalAmount (ยอด > 0 หรือมีใบ)
// ใบยอด 0 บาทที่รออนุมัติจริง (ถูกกฎตั้งแต่ mig 0197) ก็นับว่ามี เพราะ count > 0
// ใช้ตัดสินว่าจะวางกรอบบรรทัดรองไหม — ไม่ใช่ตัวเลือกยอด
export function hasPendingApproval(bucket) {
  return num(bucket?.pendingApproval) > 0 || num(bucket?.pendingApprovalCount) > 0;
}

// KPI รวมของโครงการที่กรองอยู่บนหน้า /sa/projects — บวกจาก dealsRollup ต่อโครงการ
// (นิยามเดียวกับต่อแถว) · รออนุมัติเป็นกองที่สาม ไม่ปนกับ actual
// ⭐ คีย์ที่ไม่มี = 0 — payload จาก server รุ่นก่อนไม่มีสองคีย์นี้
export function sumProjectRollups(projects = []) {
  const totals = { fcTotal: 0, actual: 0, pendingApproval: 0, pendingApprovalCount: 0, fcRemaining: 0, deals: 0 };
  for (const project of projects || []) {
    const r = project?.dealsRollup || {};
    totals.fcTotal += num(r.fcTotal);
    totals.actual += num(r.actual);
    totals.pendingApproval += num(r.pendingApproval);
    totals.pendingApprovalCount += num(r.pendingApprovalCount);
    totals.fcRemaining += num(r.fcRemaining);
    totals.deals += num(r.dealCount);
  }
  return totals;
}

/* มูลค่าบนแถวดีลของตาราง "ดีลในโครงการ"
   🐞 เดิมอ่าน `deal.wonValue ?? deal.projectValue` ดิบ ๆ — ข้ามด่าน actualSource ของ
      wonAmt จนแถวกับ KPI ข้างบนพูดคนละเลข และ `??` ไม่เคยถอยจริงเพราะ trigger เขียน
      wonValue เป็น 0 ไม่ใช่ null ⇒ ดีล Won ที่ SO รออนุมัติขึ้น ฿0.00 "ปิดจริง"
   ⭐ Won = Actual (wonAmt ตัวเดียวกับ rollup) + ยอดรออนุมัติแยกอีกช่อง
   ⭐ เปิด/แพ้ = FC ของดีลตามเดิม · ไม่มียอดรออนุมัติ (ดีลเปิดมีอยู่ใน FC คงเหลือแล้ว) */
export function projectDealValue(deal) {
  if (isWonDeal(deal)) {
    return {
      closed: true,
      value: wonAmt(deal),
      pendingApproval: dealPendingApprovalAmount(deal),
      pendingApprovalCount: dealPendingApprovalCount(deal),
    };
  }
  return { closed: false, value: forecastAmt(deal), pendingApproval: 0, pendingApprovalCount: 0 };
}

/* เซลล์ยอดของแถวในการ์ด "ใบสั่งขาย" ของโครงการ — สามทาง
     actual           อนุมัติแล้ว → ยอด Actual
     pending_approval รออนุมัติ   → ยอดใบ (ก่อน VAT) ติดคำ "รออนุมัติ"
     excluded         ที่เหลือ    → ยอดในใบแบบจาง + "ไม่นับ" (amount = 0 · ยอดในใบอยู่ที่
                                   documentAmount ไว้โชว์เท่านั้น ห้ามเอาไปรวม)
   ป้ายสถานะมาจากทะเบียนกลาง SALES_ORDER_STATUS_LABELS — เดิมจอนี้มีแผนที่ของตัวเอง
   ที่ขาด revised/approval_revoked (ขึ้นอังกฤษดิบ) และเรียกร่างว่า "ร่าง" */
export function projectSalesOrderAmount(order) {
  const kind = salesOrderAmountKind(order);
  let amount = 0;
  if (kind === 'actual') amount = salesOrderActual(order);
  else if (kind === 'pending_approval') amount = salesOrderPendingApprovalAmount(order);
  return {
    kind,
    amount,
    documentAmount: Math.max(0, num(order?.actualAmount)),
    statusLabel: SALES_ORDER_STATUS_LABELS[order?.status] || order?.status || '',
  };
}
