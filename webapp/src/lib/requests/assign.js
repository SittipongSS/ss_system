// ── มอบหมายคำร้องให้คนในฝ่าย (mig 0230 · มติผู้ใช้ 2026-08-12) ────────────
//
// ⭐ **"ใครถือใบนี้" ≠ "ใครกดรับเรื่อง"** — รับเรื่องคือคำสัญญาของ *ฝ่าย* ต่อผู้ขอ
// ส่วนมอบหมายคือการจัดคน *ในฝ่าย* · ตาราง "งานค้างรายคน" (ม-107) เคยใช้คนที่กดรับ
// เป็นตัวชี้ ซึ่งพังทันทีที่หัวหน้ากดรับแทนทีมทั้งกอง (ทั้งฝ่ายขึ้นชื่อคนเดียว)
//
// ⚠️ **ที่เดียวที่ตัดสินว่า "ใบนี้อยู่ที่ใคร"** คือ `requestAssignee()` ข้างล่าง —
// ทั้งตารางงานค้างรายคน · ตัวกรอง "ผู้รับผิดชอบ" ในคิว · คอลัมน์ในตาราง ต้องเรียก
// ตัวนี้ · เขียนกฎถอยหลัง (`assignee ?? acknowledgedBy`) ซ้ำที่ไหนก็ตาม สามที่นั้น
// จะเริ่มตอบไม่ตรงกันภายในเดือนเดียว
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';

export const MAX_ASSIGNEE_NAME = 200;

/**
 * ใบนี้อยู่ที่ใคร — `{ id, name, source }` · `source` = 'assignee' | 'acknowledged' | null
 *
 * ⚠️ **ถอยไปใช้คนที่กดรับเรื่องเมื่อยังไม่มอบหมาย** — ใบเก่าทั้งหมด (และใบใหม่ที่
 * ฝ่ายยังไม่จัดคน) ต้องยังอ่านออกว่าอยู่ที่ใคร · `source` มีไว้ให้จอบอกความต่างได้
 * เมื่อจำเป็น ไม่ใช่ให้เดาเอง
 */
export function requestAssignee(request = {}) {
  const assigneeName = String(request?.assigneeName || '').trim();
  if (request?.assigneeId || assigneeName) {
    return { id: request?.assigneeId || null, name: assigneeName, source: 'assignee' };
  }
  const ackName = String(request?.acknowledgedByName || '').trim();
  if (request?.acknowledgedById || ackName) {
    return { id: request?.acknowledgedById || null, name: ackName, source: 'acknowledged' };
  }
  return { id: null, name: '', source: null };
}

/**
 * มอบหมายใบนี้ได้ไหม — คืนข้อความไทย หรือ null ถ้าผ่าน
 *
 * `assigneeId = null` แปลว่า **ถอนการมอบหมาย** (ใบกลับไปเป็นของฝ่ายรวม) ซึ่งต้อง
 * ทำได้เสมอที่ใบยังเดินอยู่ — ไม่งั้นคนที่ลาออก/ลาป่วยจะค้างเป็นเจ้าของงานถาวร
 *
 * ⚠️ **เฉพาะใบที่ยังเดินอยู่** — ใบที่ปิด/ยกเลิกไปแล้วมอบหมายไม่ได้ · ส่วนใบร่าง
 * ยังไม่ถึงฝ่ายเลย (ผู้ขอยังไม่กดส่ง) จึงยังไม่มีอะไรให้มอบ
 */
export function assignRequestError(request, { assigneeId = null, assigneeName = null } = {}) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status === 'draft') return 'คำร้องนี้ยังไม่ถูกส่ง — ยังไม่มีอะไรให้มอบหมาย';
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) {
    return request.status === 'cancelled' ? 'คำร้องนี้ถูกยกเลิกแล้ว' : 'คำร้องนี้ปิดไปแล้ว';
  }
  if (assigneeId != null && !String(assigneeId).trim()) return 'ต้องเลือกผู้รับผิดชอบ';
  if (assigneeName && String(assigneeName).length > MAX_ASSIGNEE_NAME) {
    return `ชื่อผู้รับผิดชอบยาวเกิน ${MAX_ASSIGNEE_NAME} ตัวอักษร`;
  }
  return null;
}

/**
 * ค่าที่จะเขียนลงแถว — คืนครบทุกช่องเสมอ (รวม null) เพื่อให้ "ถอนมอบหมาย" ล้างของเก่า
 *
 * 🐞 คืนเฉพาะช่องที่มีค่าเมื่อไร การถอนมอบหมายจะกลายเป็น no-op เงียบ ๆ — ชื่อเดิม
 * ค้างอยู่ในแถวทั้งที่ `assigneeId` ถูกล้างแล้ว (โรคเดียวกับ `pdrTargets` ที่เคยคืน
 * `id: null` แล้วไปทับ id จริง)
 */
export function assignPatch({ assigneeId = null, assigneeName = null, by = null, nowIso }) {
  const clear = !assigneeId && !String(assigneeName || '').trim();
  return {
    assigneeId: clear ? null : assigneeId || null,
    assigneeName: clear ? null : String(assigneeName || '').trim() || null,
    assignedAt: clear ? null : nowIso,
    assignedById: clear ? null : by?.id ?? null,
    assignedByName: clear ? null : by?.name ?? null,
  };
}
