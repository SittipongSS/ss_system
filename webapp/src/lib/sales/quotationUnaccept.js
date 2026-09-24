import { isSalesOrderReviewer } from '@/lib/sales/salesOrderWorkflow';

// ย้อนการรับใบเสนอราคา (un-accept — มติผู้ใช้ 2026-07-21): เครื่องมือเฉพาะกิจกรณี
// รับใบผิดก่อนมี Sale Order (มี SO อนุมัติแล้วต้องไปทางย้อน Won ของ mig 0116).
// เหตุผลบังคับ 10–500 ตัวอักษร — เกณฑ์เดียวกับ admin override (mig 0127);
// RPC (mig 0138) ตรวจซ้ำชั้น DB.
export const UNACCEPT_REASON_MIN = 10;
export const UNACCEPT_REASON_MAX = 500;

export function normalizeUnacceptReason(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function unacceptReasonError(value) {
  const reason = normalizeUnacceptReason(value);
  if (reason.length < UNACCEPT_REASON_MIN) {
    return `กรุณาระบุเหตุผลอย่างน้อย ${UNACCEPT_REASON_MIN} ตัวอักษร`;
  }
  if (reason.length > UNACCEPT_REASON_MAX) {
    return `เหตุผลต้องไม่เกิน ${UNACCEPT_REASON_MAX} ตัวอักษร`;
  }
  return '';
}

// ผู้สั่งย้อน = **เจ้าของดีลปัจจุบัน** + ผู้มีอำนาจตัดสิน (admin · CD · CM · AE Sup) — มติผู้ใช้ 2026-09-24
// ⭐ ขาเข้า Won เจ้าของดีลกดเองอยู่แล้ว (อนุมัติใบเอง 07-18 · รับใบเอง 08-24) ⇒ ขาออกไม่ต้องรอหัวหน้า
//    prod: ย้อนการรับ 16 ครั้งเป็นการแก้ใบแล้วกดรับใหม่ทุกครั้ง (ค่ากลาง 27 นาที) · ไม่มีครั้งไหนเป็นเสียลูกค้า
// ⭐ ไม่แตะ Actual — RPC ปฏิเสธเมื่อมี SO ที่ยังใช้อยู่ (0380) · SO อนุมัติแล้วยังต้องให้ผู้มีอำนาจตัดสินย้อน/ยกเลิก
//    ก่อนเสมอ (มติ 16/07 แบ่งแยกหน้าที่ถอนยอด — ไม่เปลี่ยน)
// ⚠️ ยึด deal.ownerId ไม่ใช่ขอบเขตทีม (inSalesEditScope) — senior_ae/ac/senior_ac แก้ดีลของเพื่อนร่วมทีมได้
//    แต่ย้อน Won แทนเจ้าของไม่ได้ · กติกาเดียวกับ canApproveQuotation / canIssueSalesOrderRevision
// 🐞 ข้อความเดิม "การถอยดีลออกจาก Won ต้องไม่อยู่ในมือ AE ฝ่ายเดียว" เป็นคำอธิบายของคนเขียน ไม่ใช่มติ (21/07 สั่งแค่
//    "เครื่องมือฉุกเฉิน + เหตุผลบังคับ")
export function canUnacceptQuotation(user, deal) {
  if (isSalesOrderReviewer(user?.role)) return true;
  return Boolean(user?.id) && user.id === deal?.ownerId;
}
