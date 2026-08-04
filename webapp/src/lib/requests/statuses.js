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

// ── สถานะของ "บรรทัด" — ชุดเดียวใช้ได้ทุกรูปร่าง (mig 0202) ───────────────
//
// ⭐ เดิมเป็น pending/quoted/no_quote ซึ่งพูดภาษาราคาล้วน · พอบรรทัดรับได้ 4 รูปร่าง
// (วัสดุ · พัฒนากลิ่น · พัฒนาผลิตภัณฑ์ · เอกสาร) ชื่อที่ผูกกับราคาทำให้บรรทัดขอเอกสาร
// ต้องแกล้งทำเป็น "ตอบราคาแล้ว" ⇒ เปลี่ยนเป็น pending/done/declined ที่เป็นกลาง
//
// ⚠️ **ป้ายต่างกันตามรูปร่างบรรทัด** — บรรทัดวัสดุยังอ่านว่า "ตอบราคาแล้ว" เหมือนเดิม
// ทุกตัวอักษร (ผู้ใช้ที่ใช้อยู่ต้องไม่รู้สึกว่าอะไรเปลี่ยน) ส่วนรูปร่างอื่นพูดภาษาของ
// งานตัวเอง — ใช้ requestItemStatusLabel() เมื่อรู้ lineKind
const ITEM_STATUS_LABELS_BY_LINE_KIND = {
  material:    { pending: 'รอราคา',   done: 'ตอบราคาแล้ว', declined: 'ตอบไม่ได้' },
  scent_dev:   { pending: 'รอส่ง',    done: 'เสร็จแล้ว',   declined: 'ไม่ได้ใช้' },
  product_dev: { pending: 'รอส่ง',    done: 'เสร็จแล้ว',   declined: 'ไม่ได้ใช้' },
  document:    { pending: 'รอเอกสาร', done: 'ได้รับแล้ว',  declined: 'ให้ไม่ได้' },
};

export const REQUEST_ITEM_STATUSES = ['pending', 'done', 'declined'];

// คงชื่อเดิมไว้ให้ผู้เรียกที่ไม่รู้ lineKind — ค่าตั้งต้นคือภาษาของบรรทัดวัสดุ
export const REQUEST_ITEM_STATUS_LABELS = ITEM_STATUS_LABELS_BY_LINE_KIND.material;

export function requestItemStatusLabel(status, lineKind = 'material') {
  const table = ITEM_STATUS_LABELS_BY_LINE_KIND[lineKind]
    || ITEM_STATUS_LABELS_BY_LINE_KIND.material;
  return table[status] || status || '—';
}

// โทนของป้ายบรรทัด — ชื่อโทนของ <StatusBadge> ไม่ใช่ค่าสี (มาตรฐานเดียวกับสถานะใบ)
export const REQUEST_ITEM_STATUS_TONES = {
  pending: 'neutral',
  done: 'success',
  declined: 'danger',
};

export function normalizeRequestStatus(value) {
  return REQUEST_STATUSES.includes(value) ? value : 'draft';
}
