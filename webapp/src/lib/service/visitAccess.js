// ── ใครเขียนนัดใบไหนได้ — ตรรกะล้วน ไม่แตะ DB/HTTP (มติผู้ใช้ 2026-08-30) ──
//
// ⭐ **ฝ่าย TS มีห้าตำแหน่ง** ตั้งแต่ 2026-08-30 — คนจัดตาราง (Planner/หัวหน้า) ถือ
//    `service:edit` เหมือนเดิม · **เจ้าหน้าที่หน้างาน (Operation) ถือ `service:work`** ซึ่งเปิด
//    เฉพาะ *งานที่ตัวเองถูกมอบหมาย* ⇒ ด่านของนัดจึงเป็นด่าน **รายใบ** ไม่ใช่ด่าน cap ล้วน
//
// ⚠️ **แยกออกมาเป็นไฟล์ตรรกะล้วนโดยตั้งใจ** — `visitsRepo.js` ลาก `@/lib/http` ซึ่งลาก
//    `next/headers` ต่อ ⇒ unit test นำเข้าไม่ได้ · กฎที่ทดสอบไม่ได้คือกฎที่จะเพี้ยนเงียบ
import { canDoFieldWork, canWorkOwnVisit } from '@/lib/permissions';
import { isClosedVisit } from './visitStatus';
import { SURVEY_VISIT_KIND } from './surveyVisit';

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

/* ── ส่งงานแล้ว = ช่างแก้ไม่ได้ (มติเจ้าของ 28/09 Q3 · แผน operation-crew S1) ──────────────────
   ⭐ นัดงานเครื่องที่ปิดแล้ว (เข้าแล้ว · ทำไม่ครบ · ทำไม่ได้) เป็นของที่ส่งให้หัวหน้าแล้ว ⇒ ช่างอ่านอย่างเดียว
      แก้ผลที่ส่งเป็นของหัวหน้า/ผู้จัดคิว (คนที่ถือ `service:edit`) · ❌ เดิมเป็นแค่กติกาบนจอ
      ⇒ ยิง API ตรง/แท็บเก่าที่ยังมีปุ่ม "แก้ผลการเข้า" แก้ได้ทุกเส้น
   ⚠️ **ถามจากธง `ownWorkOnly`** ของ `visitWriteAccess` — ธงนี้ติดเฉพาะคนหน้างานที่ไม่ถือ `service:edit`
      ซึ่งคือชุดเดียวกับ `usesCrewShell` · ไม่ต้องถามตำแหน่งซ้ำ
   ⚠️ **นัดประเมินพื้นที่ยกเว้น** — จอประเมิน PATCH นัดตอนเริ่ม/ส่งงานเหมือนกัน และการแก้ผลวัดหลังปิด
      เดินเส้นของใบประเมินซึ่งมีด่านของตัวเอง (`surveyEditLockError`) · ขวางที่นี่ = ช่างแก้ผลวัดที่ยังไม่ส่งผลไม่ได้
   ⭐ เรียกที่ `requireVisit({ edit: true })` ที่เดียว ⇒ ครอบทุกเส้นเขียนของนัด (นัด · ของที่ใช้ · ผลรายเครื่อง) */
export const CREW_CLOSED_EDIT_ERROR = 'ส่งงานแล้ว — แก้ผลที่ส่งได้เฉพาะหัวหน้าหรือผู้จัดคิว';

/** ช่างกำลังแก้นัดที่ส่งงานไปแล้วไหม — คืนข้อความ (409) หรือ `null` */
export function crewClosedEditError(visit, { ownWorkOnly = false } = {}) {
  if (!ownWorkOnly || !isClosedVisit(visit)) return null;
  if (visit?.kind === SURVEY_VISIT_KIND) return null;
  return CREW_CLOSED_EDIT_ERROR;
}

/* ── ผลของการไป (ผลรายเครื่อง · ของที่ใช้ · รูป) = ช่างเขียนได้เฉพาะงานที่กำลังทำ (แผน operation-crew S3) ──────
   🐞 ด่านส่งงานแล้ว (ข้างบน) กันแค่ใบที่ปิด · ด่านจับเวลา (C7) กันแค่ปุ่มรับงาน/ส่งงาน ⇒ ช่างยิง PUT ผลรายเครื่อง
      ทั้งชุดบนนัดของอีกสามวัน / นัดที่ยกเลิกแล้วได้ 200 — **ทะเบียนเครื่องเปลี่ยนจริง** (เปลี่ยนเครื่อง = ตัวเก่าถูกถอด
      ลงวันที่ในอนาคต · แจ้งชำรุด = สภาพเครื่องเปลี่ยน) ทั้งที่ส่งงานไม่ได้ · ทางจริงที่ไม่ต้องแต่งคำขอ = แท็บเก่าที่แผ่น
      ปิดงานยังเปิดค้าง ตอนผู้จัดคิวยกเลิก/เลื่อนนัดไปแล้ว
   ⭐ **ถามเฉพาะทางที่ขอ** (`requireVisit({ edit: true, running: true })`) — PATCH ของนัดห้ามใช้ เพราะรับงาน
      (scheduled → กำลังทำ) เดินทางนั้น · หัวหน้า/ผู้จัดคิว (`ownWorkOnly: false`) ไม่เปลี่ยน
   ⚠️ **นัดประเมินพื้นที่ยกเว้น** — เหตุผลเดียวกับ `crewClosedEditError` (ใบประเมินมีด่านของตัวเอง)
   ⚠️ ใบที่ปิดแล้วตอบข้อความส่งงานแล้วของข้างบน — `requireVisit` ถามด่านนั้นก่อนเสมอ */
export const CREW_NOT_STARTED_ERROR = 'กดรับงานก่อน — ลงผล รูป และของที่ใช้ บันทึกได้เฉพาะงานที่กำลังทำ';
export const CREW_NOT_ON_SCHEDULE_ERROR = 'นัดนี้ไม่ได้อยู่บนตารางงานแล้ว (ร่าง · ยกเลิก · เลื่อนแล้ว) — บันทึกผลไม่ได้ โหลดหน้าใหม่';

/** ช่างกำลังเขียนผลของการไปบนนัดที่ยังไม่ได้ทำ (ยังไม่รับงาน · ร่าง · ยกเลิก · เลื่อน) ไหม — คืนข้อความ (409) หรือ `null` */
export function crewNotRunningError(visit, { ownWorkOnly = false } = {}) {
  if (!ownWorkOnly || visit?.status === 'in_progress') return null;
  if (visit?.kind === SURVEY_VISIT_KIND) return null;
  if (isClosedVisit(visit)) return CREW_CLOSED_EDIT_ERROR;
  return visit?.status === 'scheduled' ? CREW_NOT_STARTED_ERROR : CREW_NOT_ON_SCHEDULE_ERROR;
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
