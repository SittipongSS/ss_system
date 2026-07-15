// กติกากลางของภาพรวมงานขาย — ตัวรวมยอดฝั่ง server (api/sales-planning/dashboard)
// และ drill-down modal ฝั่ง client ต้องใช้ชุดเดียวกัน ไม่งั้นตัวเลขบนการ์ด KPI
// กับรายการดีลที่กดเข้าไปดูไม่ตรงกัน (ผลตรวจระบบขาย 2026-07-16)
import { monthKey } from '@/lib/salesPlanning';
import { dealActualFromSalesOrders } from '@/lib/sales/salesOrderWorkflow';

// Won นับรวม in_project (ดีลเก่าที่ปิดแล้วแปลงเป็นโครงการ)
export const isWonDeal = (d) => ['won', 'in_project'].includes(d?.stage);
export const isOpenDeal = (d) => !['won', 'in_project', 'lost'].includes(d?.stage);

// ยอด Actual ของดีล Won — อ่านผ่าน cache wonValue เฉพาะเมื่อยืนยันว่ามาจาก Approved SO
export const wonAmountOf = (d) => dealActualFromSalesOrders(d);

// เดือนที่นับยอด Won: เดือนที่ผู้ใช้เลือกตอนกด Won ก่อน แล้วค่อย fallback ตามลำดับ
export const wonMonthOf = (d) => monthKey(d?.metadata?.wonMonth)
  || monthKey(d?.confirmedAt)
  || monthKey(d?.metadata?.poReceivedDate)
  || monthKey(d?.forecastMonth);

export const normalizedOwnerName = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

// จับคู่ดีลกับแถว "รายบุคคล" บนภาพรวม — byOwner รวมคนด้วย name+team (id เก่า/ใหม่
// ของคนเดียวกันปนกันได้) จึงต้องเทียบด้วยชื่อ+ทีมก่อน id
export const dealMatchesOwner = (deal, { ownerId, ownerName, team } = {}) => {
  if (ownerName) {
    return normalizedOwnerName(deal?.ownerName) === normalizedOwnerName(ownerName)
      && (deal?.team || null) === (team || null);
  }
  if (ownerId) return deal?.ownerId === ownerId;
  return true;
};
