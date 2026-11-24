// ตัวเขียน audit ของใบเสนอราคา/ใบสั่งขายที่หายพ่วงการลบดีลหรือใบเสนอราคา — ป้อนด้วย snapshot จาก
// `snapshotDealDocumentsForAudit` / `snapshotSalesOrdersForAudit` (lib/forceDelete.js)
// แยกไฟล์เพราะ `recordAudit` ดึง client ฝั่งเซิร์ฟเวอร์ (แพตเทิร์นเดียวกับ lib/requests/cascadeAudit.js)
// ⭐ `write` ฉีดได้ — เทสต์ส่งตัวจดปลอม ห้ามแตะ audit_logs จริง (AGENTS.md: เทสต์ห้ามต่อฐานข้อมูลจริง)
import { recordAudit } from '@/lib/audit';
import { documentCascadeSummary } from '@/lib/forceDelete';

/** `cause` เช่น "การลบดีล DL-261000645 (บังคับลบ — สิทธิ์ผู้ดูแลระบบ)" — ขึ้นท้าย summary ของทุกใบ */
export function documentCascadeAuditor({ user, request, cause, write = recordAudit }) {
  return async ({ quotations = [], salesOrders = [] } = {}) => {
    // ใบสั่งขายก่อน — ลำดับเดียวกับที่ RPC ลบ (ลูกก่อนแม่) อ่าน audit ย้อนหลังแล้วเรียงตามจริง
    for (const order of salesOrders) {
      await write({
        user, action: 'delete', entityType: 'sales_order', entityId: order.id,
        before: order, summary: documentCascadeSummary('sales_order', order, cause), request,
      });
    }
    for (const quote of quotations) {
      await write({
        user, action: 'delete', entityType: 'quotation', entityId: quote.id,
        before: quote, summary: documentCascadeSummary('quotation', quote, cause), request,
      });
    }
  };
}
