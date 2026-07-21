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

// ผู้สั่งย้อน = ชุดผู้ตรวจสอบเดียวกับการอนุมัติ/ย้อน SO (admin + ae_supervisor) —
// การถอยดีลออกจาก Won ต้องไม่อยู่ในมือ AE ฝ่ายเดียว
export function canUnacceptQuotation(role) {
  return isSalesOrderReviewer(role);
}
