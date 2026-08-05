// "ยังมีอะไรค้างก่อนปิดโครงการไหม" — เตือนเฉย ๆ ไม่บล็อก (มติผู้ใช้ B3 2026-07-27)
//
// เจตนา: คนขอปิดกับคนอนุมัติปิดต้องเห็นด้วยตาว่าเอกสารสายขายยังเดินไม่จบกี่ใบ ก่อนกด
// ไม่ใช่ไปรู้ทีหลังตอนออกใบใหม่ไม่ได้แล้ว. ตัวเลขนี้ **ห้ามบล็อก** — บางโครงการปิดทั้งที่
// ยังมีใบค้างโดยเจตนา (ยกเลิกโครงการกลางคัน เอกสารที่เหลือไปตัดจบทางอื่น)
//
// ตรรกะบริสุทธิ์ล้วน — ตัวโหลดอยู่ใน route GET /api/pm/projects/[id]/close
import { isLiveSalesOrder } from '@/lib/sales/handoffQueue';

// SO ที่ยังเดินอยู่ในสายอนุมัติ = ยังไม่จบ. approval_revoked ก็นับ เพราะปลายทางคือ
// ต้องออก Rev. ต่อ (ดู 0166) ไม่ใช่จบในตัวเอง
export const SALES_ORDER_IN_FLIGHT_STATUSES = ['draft', 'pending_approval', 'rejected', 'approval_revoked'];

export function isInFlightSalesOrder(order) {
  return isLiveSalesOrder(order) && SALES_ORDER_IN_FLIGHT_STATUSES.includes(order?.status);
}

// ใบยื่นชำระภาษีจบที่ 'delivered' (ส่งเอกสารให้ลูกค้าแล้ว — ปลายทางของ TRACKS.payment
// ใน lib/excise/workflow.js) ก่อนหน้านั้นถือว่ายังค้างทั้งหมด รวม 'complete' ที่ชำระแล้ว
// แต่ยังไม่ได้ส่งเอกสารคืนลูกค้า
export const isOpenFiling = (filing) => !!filing && filing.status !== 'delivered';

// รวมยอดงานค้างของโครงการ — ผู้เรียกส่งของที่กรอง scope โครงการมาแล้วทั้งหมด
//   awaitingSalesOrder / awaitingFiling = ผลจาก loadHandoffQueue (มีตัวกรอง
//   "มีสินค้าสรรพสามิตจริง" อยู่แล้ว — ห้ามนับ SO นอกพิกัดเป็นงานค้าง ไม่งั้นคำเตือน
//   จะขึ้นตลอดกาลและคนจะเลิกอ่าน)
export function summarizeProjectCloseReadiness({
  awaitingSalesOrder = [],
  awaitingFiling = [],
  salesOrders = [],
  filings = [],
} = {}) {
  const items = [
    {
      key: 'quotesAwaitingSalesOrder',
      label: 'ใบเสนอราคา Won ที่ยังไม่ออก ใบสั่งขาย',
      count: awaitingSalesOrder.length,
      refs: awaitingSalesOrder.map((row) => row.quoteNumber).filter(Boolean),
    },
    {
      key: 'salesOrdersInFlight',
      label: 'ใบสั่งขายที่ยังไม่ผ่านอนุมัติ',
      count: salesOrders.filter(isInFlightSalesOrder).length,
      refs: salesOrders.filter(isInFlightSalesOrder).map((row) => row.orderNumber).filter(Boolean),
    },
    {
      key: 'salesOrdersAwaitingFiling',
      label: 'ใบสั่งขายที่ยังไม่ออกใบยื่นชำระภาษี',
      count: awaitingFiling.length,
      refs: awaitingFiling.map((row) => row.orderNumber).filter(Boolean),
    },
    {
      key: 'filingsOpen',
      label: 'ใบยื่นชำระภาษีที่ยังไม่ปิด',
      count: filings.filter(isOpenFiling).length,
      refs: filings.filter(isOpenFiling).map((row) => row.id).filter(Boolean),
    },
  ].filter((item) => item.count > 0);

  return {
    items,
    total: items.reduce((sum, item) => sum + item.count, 0),
    // ย้ำในโครงสร้างข้อมูลเลยว่านี่คือคำเตือน ไม่ใช่ด่าน — เผื่อมีคนมาต่อยอดแล้วเผลอ
    // เอาไปใช้บล็อก ต้องกลับมาอ่านมติ B3 ก่อน
    blocking: false,
  };
}
