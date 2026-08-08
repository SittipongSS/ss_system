// ── สถานะของคำร้อง — ของกลาง ทุกฝ่ายใช้ร่วม ────────────────────────────────
// แยกออกจาก lib/deptRequests.js (P0a) เพื่อให้ชั้น CORE ไม่ผูกกับฝ่ายใดฝ่ายหนึ่ง
//
// ⚠️ ~~สถานะ/ป้าย คงเดิมทุกตัวอักษร จากเคสขอราคา (0158)~~ — **ยกเลิกโดยมติผู้ใช้
// 2026-08-08** ตอนไล่ความยาวป้ายทั้งระบบ · ของเดิมล็อกไว้เพื่อไม่ให้ผู้ใช้ที่ใช้อยู่
// รู้สึกว่าอะไรเปลี่ยนหลังรวมระบบ ซึ่งหมดความจำเป็นไปแล้ว
//
// ⭐ **ป้ายบอก "ตอนนี้เป็นยังไง" ไม่ใช่ "ผ่านอะไรมาแล้ว"** — "ส่งแล้ว —" กับ
// "รับเรื่องแล้ว —" คือขั้นก่อนหน้า ซึ่งรางก้าวบนหัวใบเล่าอยู่แล้ว · ตัดออกแล้ว
// ป้ายที่ยาวสุดหดจาก 170px เหลือ 99px = คอลัมน์สถานะคืนที่ให้เนื้อหา 70px
// (วัดจริงบน dev server · ดู UI_DESIGN_SYSTEM.md §ป้ายในตาราง)
import { lineShapeLabels } from '@/lib/requests/kinds/lineShapes';

export const REQUEST_STATUSES = ['draft', 'pending', 'acknowledged', 'answered', 'closed', 'cancelled'];

export const REQUEST_STATUS_LABELS = {
  draft: 'ร่าง',
  pending: 'รอรับเรื่อง',
  acknowledged: 'กำลังดำเนินการ',
  answered: 'ตอบแล้ว',
  closed: 'ปิดเรื่อง',
  cancelled: 'ยกเลิก',
};

// โทนของ pill = **ชื่อโทนของ `<StatusBadge>`** ไม่ใช่ค่าสี — หน้าจอจึงไม่ต้องรู้จัก
// token สีเลย และเปลี่ยนดีไซน์ป้ายได้ที่ Badge.module.css ที่เดียวทั้งระบบ
// (มาตรฐานเดียวกับ SCENT_STATUS_TONES / FORMULA_STATUS_TONES)
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

// ── สถานะของ "บรรทัด" — ชุดเดียวใช้ได้ทุกรูปร่าง (mig 0204) ───────────────
//
// ⭐ เดิมเป็น pending/quoted/no_quote ซึ่งพูดภาษาราคาล้วน · พอบรรทัดรับได้ 4 รูปร่าง
// (วัสดุ · พัฒนากลิ่น · พัฒนาผลิตภัณฑ์ · เอกสาร) ชื่อที่ผูกกับราคาทำให้บรรทัดขอเอกสาร
// ต้องแกล้งทำเป็น "ตอบราคาแล้ว" ⇒ เปลี่ยนเป็น pending/done/declined ที่เป็นกลาง
//
// ⚠️ **ป้ายต่างกันตามรูปร่างบรรทัด** และ **ตัวป้ายไม่ได้อยู่ที่นี่แล้ว** — อยู่กับรูปร่าง
// บรรทัดในบ้านของฝ่ายที่เป็นเจ้าของ (`lib/requests/kinds/*/lineShapes.js`) พร้อมตัวตรวจ
// ของรูปร่างนั้น ⇒ เพิ่มรูปร่างใหม่แล้วลืมป้ายไม่ได้ ทะเบียนบังคับให้ครบทั้งสามสถานะ

export const REQUEST_ITEM_STATUSES = ['pending', 'done', 'declined'];

// คงชื่อเดิมไว้ให้ผู้เรียกที่ไม่รู้ lineKind — ได้ป้ายกลางจากทะเบียน
export const REQUEST_ITEM_STATUS_LABELS = lineShapeLabels(null);

export function requestItemStatusLabel(status, lineKind = null) {
  return lineShapeLabels(lineKind)[status] || status || '—';
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
