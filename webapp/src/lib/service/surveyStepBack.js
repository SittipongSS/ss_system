// ── ใบประเมินถอยกลับขั้น "ลงคิว" เมื่อช่างเข้าพื้นที่ไม่ได้ (§5E ②) ────────
//
// ⭐ **ทำไมถอยขั้น ไม่ใช่แค่เลื่อนนัด** (แผน §5E ② · มติข้อ 23)
//   ใบที่ค้างอยู่ที่ "นัดแล้ว" โดยไม่มีวันจริง = ใบที่ SA อ่านแล้วเข้าใจว่ากำลังจะได้คำตอบ
//   และตัวนับ "เลยกำหนด" ก็นับจากวันที่ไม่มีใครจะไปแล้ว
//
// 🔑 **ถอยขั้น = ล้าง `committedDueDate`/`committedDueTime` เท่านั้น** — ไม่ต้องมีสถานะใหม่
//   ทั้งรางบนหน้ารายละเอียด (`requestRail`) รางบนตาราง (`queueTrack`) ตัวนับ "ยังไม่ลงวัน"
//   ป้าย "รอกำหนดส่ง" และด่านของปุ่มลงคิว (`commitDueRequestError`) **อ่านคอลัมน์เดียวนี้ทั้งหมด**
//   ⇒ ล้างแล้วใบไหลกลับเข้าคิว "รับแล้ว ยังไม่ลงวัน" เอง ไม่ต้องเขียนคิวใหม่
//
// 🔴 **ห้ามแตะ `status` และ `acknowledgedAt`** — ใบยังเป็น `acknowledged` เหมือนเดิม
//   (TS รับเรื่องไปแล้วจริง ๆ · ถอยถึงขั้นรับเรื่องคือลบประวัติที่เกิดขึ้นแล้ว)
//   และ `statuses.js` ห้ามเพิ่มค่าใหม่ลง `REQUEST_STATUSES` ไว้ชัดเจน
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';

/* นัดที่ "ไปแล้วเข้าไม่ได้" — ตัวเดียวที่นิยามคำนี้
   ⚠️ ไม่ใช่ `isClosedVisit` — `done`/`partial` แปลว่าเข้าได้แล้ว ใบต้องเดินหน้าต่อ
      ไม่ใช่ถอยกลับไปลงคิวใหม่ */
export const isUnableVisit = (visit) => visit?.status === 'unable';

/**
 * 🔑 **ตัวตัดสินเดียวว่าใบนี้ต้องถอยขั้นไหม** — ทั้ง route และเทสต์ถามตัวนี้
 * คืน `{ ok, reason }` — `reason` เป็นข้อความไทยไว้เขียนเธรด (ว่าง = ไม่ต้องถอย)
 *
 * @param visit    แถวนัด **หลังอัปเดต**
 * @param before   แถวนัดก่อนอัปเดต — กันเขียนซ้ำเมื่อ PATCH นัดที่ปิดไปแล้วอีกรอบ
 * @param request  แถว `dept_requests` ของใบต้นเรื่อง
 */
export function surveyStepBackPlan({ visit, before, request } = {}) {
  if (!visit || visit.kind !== 'survey' || !visit.requestId) return null;
  // เพิ่งเปลี่ยนเป็น "เข้าไม่ได้" รอบนี้เท่านั้น — PATCH ซ้ำต้องไม่ล้างวันที่ TS เพิ่งลงใหม่
  if (!isUnableVisit(visit) || isUnableVisit(before)) return null;
  if (!request) return null;

  /* ⚠️ ใบที่จบไปแล้วไม่ถอย — ผลถูกส่งให้ฝ่ายขายไปแล้ว (`answeredAt`) หรือใบถูกยกเลิก
     ⇒ นัดที่ปิดทีหลังเป็นการเก็บประวัติ ไม่ใช่การเปลี่ยนก้าวของใบ */
  if (request.answeredAt || request.cancelledAt) return null;
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) return null;
  // ไม่เคยลงวันอยู่แล้ว = ไม่มีอะไรให้ถอย (นัดที่สร้างมือโดยยังไม่แจ้งวันบนใบ)
  if (!request.committedDueDate) return null;

  return {
    patch: { committedDueDate: null, committedDueTime: null },
    /* ⚠️ **เหตุผลต้องอยู่ในข้อความ** — SA ต้องรู้ว่าทำไมถึงไม่ได้คำตอบ ไม่ใช่แค่รู้ว่าวันหาย
       (ด่านของนัดบังคับเหตุผล ≥10 ตัวอักษรอยู่แล้วที่ mig 0300) */
    reason: String(visit.unableReason || '').trim(),
    previousDueDate: request.committedDueDate,
  };
}

/** ข้อความบรรทัดเธรดของใบ — เขียนที่เดียว ใช้ทั้ง route และเทสต์ */
export function surveyStepBackBody({ reason, previousDueDate } = {}) {
  const was = String(previousDueDate || '').trim();
  return 'เข้าพื้นที่ไม่ได้ — ใบกลับไปขั้นลงคิว รอ TS ลงวันใหม่'
    + (was ? ` · วันเดิม ${was}` : '')
    + (reason ? ` — ${reason.slice(0, 300)}` : '');
}
