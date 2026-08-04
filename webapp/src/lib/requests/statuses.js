// ── สถานะของคำร้อง — ของกลาง ทุกฝ่ายใช้ร่วม ────────────────────────────────
// แยกออกจาก lib/deptRequests.js (P0a) เพื่อให้ชั้น CORE ไม่ผูกกับฝ่ายใดฝ่ายหนึ่ง
//
// ⚠️ สถานะ/ป้าย **คงเดิมทุกตัวอักษร** จากเคสขอราคา (0158) — ผู้ใช้ที่ใช้อยู่ต้อง
// ไม่รู้สึกว่าอะไรเปลี่ยนหลังรวมระบบ
export const REQUEST_STATUSES = ['draft', 'pending', 'acknowledged', 'answered', 'closed', 'cancelled'];

export const REQUEST_STATUS_LABELS = {
  draft: 'ร่าง',
  pending: 'ส่งแล้ว — รอรับเรื่อง',
  acknowledged: 'รับเรื่องแล้ว — กำลังดำเนินการ',
  answered: 'ตอบแล้ว',
  closed: 'ปิดเรื่อง',
  cancelled: 'ยกเลิก',
};

// โทนของ pill = **ชื่อโทนของ `<StatusBadge>`** ไม่ใช่ค่าสี — หน้าจอจึงไม่ต้องรู้จัก
// token สีเลย และเปลี่ยนดีไซน์ป้ายได้ที่ Badge.module.css ที่เดียวทั้งระบบ
// (มาตรฐานเดียวกับ SCENT_STATUS_TONES / SCENT_FEEDBACK_TONES)
export const REQUEST_STATUS_TONES = {
  draft: 'neutral',
  pending: 'warning',
  acknowledged: 'info',
  answered: 'success',
  closed: 'neutral',
  cancelled: 'neutral',
};

// คำร้องที่ "ยังเดินอยู่" — ใช้กรองคิวและนับงานค้างของฝ่าย
export const REQUEST_OPEN_STATUSES = ['pending', 'acknowledged'];

export const REQUEST_ITEM_STATUS_LABELS = {
  pending: 'รอราคา',
  quoted: 'ตอบราคาแล้ว',
  no_quote: 'ตอบไม่ได้',
};

export function normalizeRequestStatus(value) {
  return REQUEST_STATUSES.includes(value) ? value : 'draft';
}
