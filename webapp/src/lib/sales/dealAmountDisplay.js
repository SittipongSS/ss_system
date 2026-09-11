// มูลค่าที่ขึ้นจอของดีลหนึ่งใบ + ยอด SO "รออนุมัติ" ที่วางข้าง ๆ (มติผู้ใช้ 2026-09-11 · mig 0353)
//
// ใช้ร่วมกันที่หน้ารายการดีล (คอลัมน์มูลค่า · เรียงตามมูลค่า · ยอดหัวกลุ่ม · KPI) และการ์ด
// "ดีลจากลีดนี้" — จอไหนคิดเองจะหลุดจากกติกาเดียวกันทันที
//
// ⭐ Won = Actual (SO อนุมัติแล้ว ผ่าน wonAmountOf ซึ่งเช็ค actualSource) · ดีลเปิด = FC (projectValue)
// ⭐ ยอดรออนุมัติเป็น **ช่องแยก** เสมอ นับเฉพาะดีล Won (pendingApprovalAmountOf กรองให้แล้ว)
// ⛔ ห้ามบวกยอดรออนุมัติเข้า dealDisplayValue — ตัวเลขหลักของแถวคือ Actual/FC ตามเดิม
// 🪤 `wonValue ?? projectValue` ที่หน้าจอเคยเขียนเป็นโค้ดตาย: trigger 0110 เขียน wonValue = 0
//    (ไม่ใช่ null) ให้ทุกดีลตั้งแต่ INSERT ⇒ `??` ไม่เคยถอยไป FC และดีลเปิดที่ไม่กรองด้วยขั้น
//    Won จะขึ้น ฿0.00 (การ์ดดีลบนหน้าลีดเป็นแบบนั้นมาตลอด)
import {
  isWonDeal,
  pendingApprovalAmountOf,
  pendingApprovalCountOf,
  wonAmountOf,
} from '@/lib/sales/dashboardMetrics';

export function dealDisplayValue(deal) {
  if (isWonDeal(deal)) return wonAmountOf(deal);
  return Number(deal?.projectValue) || 0;
}

// เรียงตามมูลค่า: ตัวเลขหลัก (Actual/FC) ก่อน — ยอดรออนุมัติเป็นแค่ตัวตัดสินตอนเสมอกัน
// ⇒ ดีล Won ที่ SO ยังรออนุมัติ (Actual 0) ขึ้นก่อนดีลที่ยอด 0 จริง แต่ไม่แซงดีลที่มี Actual
export function compareDealDisplayValue(a, b) {
  return (dealDisplayValue(a) - dealDisplayValue(b))
    || (pendingApprovalAmountOf(a) - pendingApprovalAmountOf(b));
}

// รวมยอดของชุดดีล (หัวกลุ่ม · KPI) — สองกองแยกกันเหมือนในแถว
//   value                 Σ dealDisplayValue (Actual ของ Won + FC ของดีลเปิด)
//   pendingApproval       Σ ยอด SO รออนุมัติของดีล Won
//   pendingApprovalCount  Σ จำนวนใบ SO รออนุมัติ (ไม่ใช่จำนวนดีล)
export function sumDealDisplay(deals = []) {
  const out = { value: 0, pendingApproval: 0, pendingApprovalCount: 0 };
  for (const deal of deals || []) {
    out.value += dealDisplayValue(deal);
    out.pendingApproval += pendingApprovalAmountOf(deal);
    out.pendingApprovalCount += pendingApprovalCountOf(deal);
  }
  return out;
}
