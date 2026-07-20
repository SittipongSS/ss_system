// กติกากลางของภาพรวมงานขาย — ตัวรวมยอดฝั่ง server (api/sales-planning/dashboard)
// และ drill-down modal ฝั่ง client ต้องใช้ชุดเดียวกัน ไม่งั้นตัวเลขบนการ์ด KPI
// กับรายการดีลที่กดเข้าไปดูไม่ตรงกัน (ผลตรวจระบบขาย 2026-07-16)
import { monthKey } from '@/lib/salesPlanning';
import { dealActualFromSalesOrders } from '@/lib/sales/salesOrderWorkflow';

// Won นับรวม in_project (ดีลเก่าที่ปิดแล้วแปลงเป็นโครงการ)
export const isWonDeal = (d) => ['won', 'in_project'].includes(d?.stage);
export const isOpenDeal = (d) => !['won', 'in_project', 'lost'].includes(d?.stage);

// ดีล lost "เชิงธุรการ" ของสายสหมิตร — ไม่ใช่แพ้จริง ห้ามปนสถิติแพ้/FC:
// - sahamitMergedIntoDealId: ดีล FC ถูกยุบเข้าดีลรวมของ PO (ขายได้จริง! demand ไป
//   โผล่บนดีลรวมแทน — นับด้วยจะทั้งเพี้ยน lost และนับ FC ซ้ำ)
// - sahamitSupersededByRoundId: ดีลรอบ FC เก่าถูกแทนที่เพราะสหมิตรอัพเดท FC
// ทุกจุดที่นับดีลแพ้ (dashboard + drill-down) ต้องกรองผ่าน isRealLostDeal ตัวเดียวนี้
export const isAdministrativeLoss = (d) => Boolean(
  d?.metadata?.sahamitMergedIntoDealId || d?.metadata?.sahamitSupersededByRoundId,
);
export const isRealLostDeal = (d) => d?.stage === 'lost' && !isAdministrativeLoss(d);

// ยอด Actual ของดีล Won — อ่านผ่าน cache wonValue เฉพาะเมื่อยืนยันว่ามาจาก Approved SO
export const wonAmountOf = (d) => dealActualFromSalesOrders(d);

// FC Total preserves every forecast made in the period (Open + Won + Lost)
// so forecast misses remain auditable. FC remaining is the Open portion only.
export function forecastAccuracyRollup(openDeals = [], wonDeals = [], lostDeals = []) {
  const fc = (d) => Number(d?.projectValue ?? 0);
  const remainingForecast = openDeals.reduce((sum, d) => sum + fc(d), 0);
  const wonForecastValue = wonDeals.reduce((sum, d) => sum + fc(d), 0);
  const lostForecast = lostDeals.reduce((sum, d) => sum + fc(d), 0);
  const wonValue = wonDeals.reduce((sum, d) => sum + wonAmountOf(d), 0);
  return {
    fullForecast: remainingForecast + wonForecastValue + lostForecast,
    remainingForecast,
    wonForecastValue,
    lostForecast,
    wonValue,
    // Positive means Actual beat the resolved FC; Lost contributes zero Actual.
    forecastVariance: wonValue - wonForecastValue - lostForecast,
  };
}

// เดือนที่นับยอด Won: เดือนที่ผู้ใช้เลือกตอนกด Won ก่อน แล้วค่อย fallback ตามลำดับ
export const wonMonthOf = (d) => monthKey(d?.metadata?.wonMonth)
  || monthKey(d?.confirmedAt)
  || monthKey(d?.metadata?.poReceivedDate)
  || monthKey(d?.forecastMonth);

export const normalizedOwnerName = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

// จับคู่ดีลกับแถว "รายบุคคล" บนภาพรวม — byOwner รวมคนด้วยบัญชีผู้ใช้ปัจจุบัน
// (lib/sales/ownerIdentity) ชื่อบนแถวจึงเป็นชื่อ "ปัจจุบัน" ขณะที่ดีลเก่าเก็บชื่อ
// snapshot เดิมไว้ → ต้องเทียบ id ก่อน (ครอบดีลก่อน/หลังเปลี่ยนชื่อ-ย้ายทีม)
// แล้วค่อยถอยไปชื่อ+ทีม สำหรับแถว legacy ที่ id เก่า stale จับบัญชีไม่ได้
export const dealMatchesOwner = (deal, { ownerId, ownerName, team } = {}) => {
  if (ownerId && deal?.ownerId === ownerId) return true;
  if (ownerName) {
    return normalizedOwnerName(deal?.ownerName) === normalizedOwnerName(ownerName)
      && (deal?.team || null) === (team || null);
  }
  if (ownerId) return deal?.ownerId === ownerId;
  return true;
};
