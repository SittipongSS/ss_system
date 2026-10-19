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

/* วันบนใบถูกตั้ง (แจ้งวัน/เลื่อนวัน · `dueCommittedAt`) **หลัง** นัดนี้ถูกแก้ครั้งล่าสุด = วันบนใบเป็นของการนัดรอบใหม่
   ⚠️ ไม่รู้ (ไม่มีค่า/อ่านเวลาไม่ออก) = false ⇒ ถอยตามเดิม */
function requestDateNewer(request, before) {
  const committed = Date.parse(request?.dueCommittedAt ?? '');
  const touched = Date.parse(before?.updatedAt ?? '');
  return Number.isFinite(committed) && Number.isFinite(touched) && committed > touched;
}

/**
 * 🔑 **ตัวตัดสินเดียวว่านัดที่เพิ่ง "เข้าไม่ได้" ทำอะไรกับใบ** — ทั้ง route และเทสต์ถามตัวนี้ · คืน
 *   `null`                                            · ไม่มีอะไรต้องทำ
 *   `{ kind: 'stepBack', patch, reason, previousDueDate }` · ล้างวันบนใบ (ถอยกลับขั้นลงคิว) + บรรทัดเธรด
 *   `{ kind: 'notice', reason, heldDate }`            · **ไม่ถอย** แต่ฝ่ายขายต้องรู้ว่าเข้าไม่ได้และเพราะอะไร
 *
 * 🔴 **วันบนใบเป็นของการนัดรอบใหม่ = ไม่ถอย** (รีวิว S2b ข้อ V17 ต่อ · 19/10) — ฝ่ายขายเลื่อนวันบนใบ (ใบได้วันใหม่ก่อน
 *    นัดตาม/นัดใหม่เกิดทีหลัง) พอดีกับที่ช่างแจ้งเข้าไม่ได้ ⇒ เดิมล้างวันใหม่ทิ้ง: นัดใหม่ขึ้นตารางแต่ใบขึ้น "รอกำหนดส่ง"
 *    ตัดสินจากสองข้อพร้อมกัน: วันบนใบไม่ใช่วันของนัดนี้ (ทั้งก่อนและหลังแก้ — ผู้จัดคิวแก้วันพร้อมตั้งเข้าไม่ได้ในกดเดียวได้)
 *    **และ** วันบนใบถูกตั้งหลังนัดนี้ถูกแก้ครั้งล่าสุด (`requestDateNewer`)
 *    ⚠️ วันไม่ตรงเพราะซิงก์ค้าง (นัดถูกย้ายทีหลัง ใบไม่ตาม) = ถอยตามเดิม — วันบนใบเก่ากว่านัด ไม่ใช่ของรอบใหม่
 *
 * @param visit    แถวนัด **หลังอัปเดต**
 * @param before   แถวนัดก่อนอัปเดต — กันเขียนซ้ำเมื่อ PATCH นัดที่ปิดไปแล้วอีกรอบ · วัน/เวลาแก้ล่าสุดของนัด
 * @param request  แถว `dept_requests` ของใบต้นเรื่อง (ต้องมี `dueCommittedAt` เพื่อแยกวันของรอบใหม่)
 * @param needsVisit  ใบนี้ยังต้องมีนัดลงหน้างานไหม (`surveyNeedsVisit` จากแถวพื้นที่ · mig 0408)
 *                    ไม่ส่ง = `true` = พฤติกรรมเดิม
 */
export function surveyUnableOutcome({ visit, before, request, needsVisit = true } = {}) {
  if (!visit || visit.kind !== 'survey' || !visit.requestId) return null;
  /* 🔴 **ใบที่ประเมินจากแบบทั้งใบไม่ถอยขั้น** (แผน survey-desk-assessment §2 แถว 36 ③) — วันบนใบแบบนี้คือ
     **วันส่งผลที่หัวหน้ารับปาก** ไม่ใช่วันนัด · นัดเก่าที่ค้าง "กำลังทำ" ตอนใบพลิกเป็นงานโต๊ะ ปิดเป็น
     "เข้าไม่ได้" ทีหลังได้ ⇒ ล้างวันตรงนี้ = ลบคำสัญญาต่อฝ่ายขาย แล้วใบไหลเข้าคิว "รอลงคิว" ของผู้จัดคิว
     ทั้งที่ไม่มีใครต้องไป
     ⚠️ เฉพาะ `false` ตรงตัว — ผู้เรียกที่อ่านแถวพื้นที่ไม่ได้ต้องได้พฤติกรรมเดิม ไม่ใช่เลิกถอยขั้นเงียบ ๆ */
  if (needsVisit === false) return null;
  // เพิ่งเปลี่ยนเป็น "เข้าไม่ได้" รอบนี้เท่านั้น — PATCH ซ้ำต้องไม่ล้างวันที่ TS เพิ่งลงใหม่
  if (!isUnableVisit(visit) || isUnableVisit(before)) return null;
  if (!request) return null;

  /* ⚠️ ใบที่จบไปแล้วไม่ถอย — ผลถูกส่งให้ฝ่ายขายไปแล้ว (`answeredAt`) หรือใบถูกยกเลิก
     ⇒ นัดที่ปิดทีหลังเป็นการเก็บประวัติ ไม่ใช่การเปลี่ยนก้าวของใบ */
  if (request.answeredAt || request.cancelledAt) return null;
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) return null;
  // ไม่เคยลงวันอยู่แล้ว = ไม่มีอะไรให้ถอย (นัดที่สร้างมือโดยยังไม่แจ้งวันบนใบ)
  if (!request.committedDueDate) return null;

  /* ⚠️ **เหตุผลต้องอยู่ในข้อความ** — SA ต้องรู้ว่าทำไมถึงไม่ได้คำตอบ ไม่ใช่แค่รู้ว่าวันหาย
     (ด่านของนัดบังคับเหตุผล ≥10 ตัวอักษรอยู่แล้วที่ mig 0300) */
  const reason = String(visit.unableReason || '').trim();
  const held = String(request.committedDueDate).slice(0, 10);
  const days = [before?.scheduledDate, visit.scheduledDate].map((d) => String(d ?? '').slice(0, 10)).filter(Boolean);
  if (days.length && !days.includes(held) && requestDateNewer(request, before)) {
    return { kind: 'notice', reason, heldDate: held };
  }
  return {
    kind: 'stepBack',
    patch: { committedDueDate: null, committedDueTime: null },
    reason,
    previousDueDate: request.committedDueDate,
  };
}

/** ตัวเดิมสำหรับผู้เรียกที่ถามแค่ "ต้องถอยขั้นไหม" — แผนถอยขั้น หรือ `null` (รวมกรณีที่แค่แจ้งเตือน) */
export function surveyStepBackPlan(args = {}) {
  const outcome = surveyUnableOutcome(args);
  if (outcome?.kind !== 'stepBack') return null;
  const { kind, ...plan } = outcome;
  return plan;
}

/** ข้อความบรรทัดเธรดของใบ — เขียนที่เดียว ใช้ทั้ง route และเทสต์ */
export function surveyStepBackBody({ reason, previousDueDate } = {}) {
  const was = String(previousDueDate || '').trim();
  return 'เข้าพื้นที่ไม่ได้ — ใบกลับไปขั้นลงคิว รอ TS ลงวันใหม่'
    + (was ? ` · วันเดิม ${was}` : '')
    + (reason ? ` — ${reason.slice(0, 300)}` : '');
}

/** บรรทัดเธรดของใบเมื่อนัดเข้าไม่ได้แต่ใบ **ไม่ถอยขั้น** — ฝ่ายขายยังต้องได้เหตุผล (ไม่งั้นช่างกลับไปไซต์ที่บอกว่าปิดซ้ำ)
 *  `heldDate` = ใบถือวันที่ตั้งหลังนัดนี้ (ผู้เรียกเช็กแล้วว่า **ยังไม่มีนัดเปิด** ถือวันนั้น ⇒ บอกตรง ๆ ว่ารอลงคิวใหม่)
 *  ไม่มี = วันบนใบเพิ่งถูกเปลี่ยนระหว่างคำขอ · `failed` = เขียนถอยขั้นไม่สำเร็จ (วันบนใบยังค้าง) */
export function surveyUnableNoticeBody({ code, reason, heldDate, failed = false } = {}) {
  const which = String(code || '').trim();
  let state = 'ใบไม่ได้ถอยขั้น เพราะวันบนใบเพิ่งถูกเปลี่ยน';
  if (heldDate) state = `ใบยังถือวัน ${heldDate} ที่ยังไม่มีนัดเข้าพื้นที่ · รอ TS ลงคิวใหม่`;
  else if (failed) state = 'ถอยใบกลับขั้นลงคิวไม่สำเร็จ วันบนใบยังค้าง · รอ TS ลงคิวใหม่';
  return `เข้าพื้นที่ไม่ได้${which ? ` (นัด ${which})` : ''} — ${state}`
    + (reason ? ` — ${String(reason).slice(0, 300)}` : '');
}
