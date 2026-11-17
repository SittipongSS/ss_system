// ── รูปข้อมูล SO ที่ส่งให้ระบบปลายทาง (`/api/ext/v1` · มติ 3 · 7 · 8) — **whitelist ช่องที่ส่งอยู่ที่นี่ที่เดียว** ──────
//
// ⛔ ไม่ส่งเด็ดขาด: `actualAmount` · `notes` · `metadata` · id/ชื่อคนสร้าง-ยื่น-อนุมัติ-ตีกลับ · `approvalNote` · `rejectionReason`
//    · `cancelReason` · งวดเงิน/สลิป/ใบกำกับ · ราคาทุน · `id` ภายใน · `projectId` (ยุบโครงการ P3)
//    ⇒ ประกอบออบเจ็กต์ใหม่ทีละช่อง ห้าม spread แถวจากฐาน (เพิ่มคอลัมน์ในฐานเมื่อไร = หลุดออกไปเงียบ ๆ)
// ⭐ บรรทัด "แพ็ค/เดือน" (หมวด 02-001 · mig 0407): `lineTotal = qty × packQty × unitPrice − discountAmount`
//    บรรทัดอื่น `packQty` = null ⇒ ปลายทางใช้ 1 · ตรวจ prod 17/11: 459 บรรทัดของ 240 ใบลงตัวทุกบรรทัด
//    และผลรวม `lineTotal` = `subtotal` ทุกใบ (ไม่ส่ง `packQty` = 10 บรรทัดกระทบยอดไม่ได้ — มติ 8 ใช้ไม่ได้)
import { lineCategoryCode } from '@/lib/sales/linePacks';

export const EXPORT_STATUSES = Object.freeze(['approved', 'approval_revoked', 'revised', 'cancelled']);
export const DELETED_STATUS = 'deleted';

export const ORDER_KEYS = Object.freeze([
  'orderNumber', 'baseNumber', 'revisionNo', 'status', 'supersededBy', 'origin', 'orderDate', 'deliveryDueDate',
  'paymentDueDate', 'approvedAt', 'cancelledAt', 'customer', 'subtotal', 'discountAmount', 'vatAmount', 'totalAmount',
  'lines', 'changeSeq', 'changedAt',
]);
export const CUSTOMER_KEYS = Object.freeze(['arCode', 'name']);
export const LINE_KEYS = Object.freeze([
  'fgCode', 'categoryCode', 'description', 'qty', 'packQty', 'unit', 'unitPrice', 'discountAmount', 'lineTotal',
]);
export const DELETED_KEYS = Object.freeze(['orderNumber', 'baseNumber', 'revisionNo', 'status', 'changeSeq', 'changedAt']);

const num = (value) => (value === null || value === undefined || value === '' ? null : Number(value));
const str = (value) => (value === null || value === undefined || value === '' ? null : String(value));
const seq = (value) => (value === null || value === undefined ? null : Number(value));

/** หมวดของบรรทัด — FG: จากรหัส FG · พิมพ์เอง: `metadata.categoryCode` · ไม่รู้ = null (ปลายทางต้องถือว่า "ไม่รู้หมวด") */
export function extLineCategory(line) {
  const metadata = line?.metadata || (line?.metadataCategory ? { categoryCode: line.metadataCategory } : null);
  return lineCategoryCode({ productId: line?.productId, fgCode: line?.fgCode, metadata }) || null;
}

export function salesOrderLineDto(line) {
  const pack = num(line?.packQty);
  return {
    fgCode: str(line?.fgCode),
    categoryCode: extLineCategory(line),
    description: str(line?.description),
    qty: num(line?.qty),
    packQty: Number.isFinite(pack) && pack > 0 ? pack : null,
    unit: str(line?.unit),
    unitPrice: num(line?.unitPrice),
    discountAmount: num(line?.discountAmount) ?? 0,
    lineTotal: num(line?.lineTotal),
  };
}

/**
 * @param order แถว `sales_orders` (คอลัมน์ตาม FEED_ORDER_COLUMNS)
 * @param ctx { lines, arCode, supersededBy }
 */
export function salesOrderDto(order, { lines = [], arCode = null, supersededBy = null } = {}) {
  const sorted = [...(lines || [])].sort((a, b) => (Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0)));
  return {
    orderNumber: str(order?.orderNumber),
    baseNumber: str(order?.baseNumber),
    revisionNo: num(order?.revisionNo) ?? 0,
    status: str(order?.status),
    supersededBy: str(supersededBy),
    origin: str(order?.origin),
    orderDate: str(order?.orderDate),
    deliveryDueDate: str(order?.deliveryDueDate),
    paymentDueDate: str(order?.paymentDueDate),
    approvedAt: str(order?.approvedAt),
    cancelledAt: str(order?.cancelledAt),
    customer: { arCode: str(arCode), name: str(order?.customerName) },
    subtotal: num(order?.subtotal),
    discountAmount: num(order?.discountAmount) ?? 0,
    vatAmount: num(order?.vatAmount),
    totalAmount: num(order?.totalAmount),
    lines: sorted.map(salesOrderLineDto),
    changeSeq: seq(order?.changeSeq),
    changedAt: str(order?.changedAt),
  };
}

/** แถวร่องรอยใบที่ถูกลบ — มีแค่เลขที่ใบ · ปลายทางอาจไม่เคยได้รับใบนั้น (ใบที่ไม่เข้าเกณฑ์ผลิต) ให้ข้ามได้ */
export function deletedOrderDto(row) {
  return {
    orderNumber: str(row?.orderNumber),
    baseNumber: str(row?.baseNumber),
    revisionNo: num(row?.revisionNo),
    status: DELETED_STATUS,
    changeSeq: seq(row?.changeSeq),
    changedAt: str(row?.deletedAt),
  };
}
