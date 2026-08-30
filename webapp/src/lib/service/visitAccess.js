// ── ใครเขียนนัดใบไหนได้ — ตรรกะล้วน ไม่แตะ DB/HTTP (มติผู้ใช้ 2026-08-30) ──
//
// ⭐ **ฝ่าย TS มีห้าตำแหน่ง** ตั้งแต่ 2026-08-30 — คนจัดตาราง (Planner/หัวหน้า) ถือ
//    `service:edit` เหมือนเดิม · **เจ้าหน้าที่หน้างาน (Operation) ถือ `service:work`** ซึ่งเปิด
//    เฉพาะ *งานที่ตัวเองถูกมอบหมาย* ⇒ ด่านของนัดจึงเป็นด่าน **รายใบ** ไม่ใช่ด่าน cap ล้วน
//
// ⚠️ **แยกออกมาเป็นไฟล์ตรรกะล้วนโดยตั้งใจ** — `visitsRepo.js` ลาก `@/lib/http` ซึ่งลาก
//    `next/headers` ต่อ ⇒ unit test นำเข้าไม่ได้ · กฎที่ทดสอบไม่ได้คือกฎที่จะเพี้ยนเงียบ
import { canDoFieldWork, canWorkOwnVisit } from '@/lib/permissions';

/**
 * ตัดสินว่าเขียนนัดใบนี้ได้ไหม — คืน
 *   `{ ok: true, ownWorkOnly }` · `ownWorkOnly` = ต้องจำกัดช่องที่แก้ได้
 *   `{ ok: false, error }`      · ข้อความไทยที่บอกว่าทำไมถึงไม่ได้
 *
 * @param canEditAll ผลของด่านชั้นนอก (`requireService`) — ผ่านแล้ว = แก้ได้ทั้งตาราง
 */
export function visitWriteAccess({ user, visit, canEditAll }) {
  if (canEditAll) return { ok: true, ownWorkOnly: false };
  if (!canDoFieldWork(user)) return { ok: false, error: null };  // ให้ด่านชั้นนอกตอบเอง
  if (!canWorkOwnVisit(user, visit)) {
    return { ok: false, error: 'นัดนี้ไม่ใช่งานของคุณ — แก้ได้เฉพาะงานที่ถูกมอบหมายให้คุณ' };
  }
  return { ok: true, ownWorkOnly: true };
}

/* ── ช่องที่เป็น "แผน" ไม่ใช่ "ผลของการไป" ────────────────────────────────
   🔴 เจ้าหน้าที่หน้างานแก้ช่องพวกนี้ไม่ได้ — วันนัด/เวลา/คนไป เป็นคำสัญญาที่แจ้งลูกค้าไปแล้ว
      และเป็นงานของผู้จัดคิว · ไม่กัน = เจ้าหน้าที่เลื่อนนัดหนีงานเองได้ และโยนงานให้คนอื่นเงียบ ๆ
   ⚠️ เพิ่มช่องของ "แผน" ใหม่วันหน้า **ต้องมาเติมที่นี่ด้วย** (เทสต์ปักไว้) */
export const VISIT_PLANNING_FIELDS = [
  'scheduledDate', 'startTime', 'endTime',
  'assigneeId', 'assigneeName', 'assistantIds',
  'siteId', 'kind', 'planId',
];

/** ช่องของ "แผน" ที่ payload นี้พยายามแก้ — ว่าง = แตะแต่ผลงานหน้างาน */
export function planningFieldsIn(body = {}) {
  return VISIT_PLANNING_FIELDS.filter((key) => key in (body || {}));
}

export const PLANNING_FIELD_ERROR =
  'เจ้าหน้าที่แก้ได้เฉพาะผลงานหน้างาน — วันนัด เวลา และผู้รับผิดชอบ ต้องให้ผู้จัดคิวเป็นคนแก้';
