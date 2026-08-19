// ── ปิดเรื่องต้องครบสองฝั่ง (มติผู้ใช้ 2026-08-20) ─────────────────────────
//
// ⭐ **กฎ**: *"การปิดเรื่องต้องปิดสองฝ่าย หากฝ่ายนึงปิดแต่อีกฝ่ายยังไม่จบ ต้องคืนสถานะ
// กลับมาก่อน จนกว่าจะปิดทั้งสองฝ่ายถึงจะนับเสร็จสิ้น"*
//
// ของเดิม: ผู้ขอกด "ปิดเรื่อง" ฝ่ายเดียวแล้วใบจบทันที แม้ฝ่ายปลายทางยังไม่ได้ประกาศว่า
// จบ (ใบสอบถามที่ไม่มีแถวไม่มีด่านไหนกันเลย) ⇒ งานที่ยังค้างอยู่จริงหายจากคิวเงียบ ๆ
//
// ⭐ **ไม่มีคอลัมน์ใหม่** — ตราของสองฝั่งมีอยู่แล้วตั้งแต่ mig 0158:
//   · ฝั่งฝ่ายผู้รับ = `answeredAt` (มาเองเมื่อทุกแถวจบ · หรือปุ่ม "ตอบแล้ว" ของใบที่
//     ไม่มีแถว) ⇒ ไม่ต้องเพิ่มปุ่ม "ปิด" ของฝ่ายอีกอันให้คนต้องจำสองปุ่ม
//   · ฝั่งผู้ขอ    = `closedAt` / `closedById` / `closedByName` (ปุ่ม "ปิดเรื่อง")
// ⇒ "จบจริง" = มีครบทั้งสองตรา · มีตราเดียว = ใบยังเปิด และยังนับเป็นงานค้างในคิว
//
// ⚠️ **`closed` เป็นปลายทางถาวร** (มติผู้ใช้ 2026-08-20) — ครบสองฝั่งแล้วเปิดกลับไม่ได้
// อยากคุยต่อคือเปิดใบใหม่ · การ "คืนสถานะ" ทำได้เฉพาะตอนที่ยังมีตราไม่ครบ
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';

/** ตราปิดของแต่ละฝั่ง + เหลือใคร — ก้อนเดียวที่ทุกจอถาม */
export function requestClosure(request) {
  const deptDone = !!request?.answeredAt;
  const requesterDone = !!request?.closedAt;
  const complete = request?.status === 'closed' || (deptDone && requesterDone);
  return {
    deptDone,
    requesterDone,
    complete,
    /* เหลือฝั่งไหนที่ยังไม่กด — `null` เมื่อครบแล้ว หรือเมื่อยังไม่มีใครกดเลย
       (ยังไม่มีใครกด = ใบยังอยู่ในช่วงทำงานปกติ ป้ายเป็นเรื่องของงาน ไม่ใช่ของการปิด) */
    waitingSide: complete ? null : deptDone ? 'requester' : requesterDone ? 'dept' : null,
  };
}

/**
 * สถานะของใบหลังแตะตราปิด — **ที่เดียวที่ตัดสินว่าใบจบหรือยัง**
 *
 * ⚠️ ใบที่ถูกยกเลิกไม่ขยับ · ใบที่ปิดครบแล้วไม่ถอยกลับ (ปลายทางถาวร)
 */
export function closureStatus({ status, answeredAt, closedAt }) {
  if (status === 'cancelled' || status === 'closed') return status;
  if (answeredAt && closedAt) return 'closed';
  return answeredAt ? 'answered' : 'acknowledged';
}

/**
 * ด่านของปุ่ม "ยังไม่จบ" — ถอนตราที่กดไปแล้วทั้งหมด แล้วใบกลับมาเปิด
 *
 * ⭐ **ถอนทุกตรา ไม่ใช่เฉพาะของฝั่งตัวเอง** — กดได้ทั้งสองฝั่งโดยตั้งใจ: ฝั่งที่กดไป
 * แล้วเปลี่ยนใจ กับอีกฝั่งที่รู้ว่างานยังไม่จบจริง · ในทางปฏิบัติมีตราได้ทีละฝั่งอยู่แล้ว
 * (ครบสองฝั่งเมื่อไรใบปิดถาวรทันที) ⇒ "ถอนทั้งหมด" กับ "ถอนของอีกฝั่ง" ให้ผลเดียวกัน
 * แต่เขียนแบบนี้ไม่มีทางหลงเหลือตราค้างไว้ครึ่งใบ
 *
 * ⚠️ บังคับเหตุผล — ใบเด้งกลับมาโดยไม่มีใครรู้ว่าติดอะไร คือใบที่จะวนอีกรอบ
 */
export function reopenRequestError(request, { reason } = {}) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status === 'cancelled') return 'คำร้องนี้ถูกยกเลิกไปแล้ว';
  if (request.status === 'closed') return 'คำร้องนี้ปิดครบสองฝั่งแล้ว — เปิดกลับไม่ได้ ให้เปิดใบใหม่';
  if (!REQUEST_OPEN_STATUSES.concat('answered').includes(request.status)) {
    return 'คำร้องนี้ยังไม่ถูกส่ง';
  }
  const { deptDone, requesterDone } = requestClosure(request);
  if (!deptDone && !requesterDone) return 'ยังไม่มีใครกดปิดฝั่งไหนเลย — ไม่มีอะไรให้ถอน';
  const text = String(reason ?? '').trim();
  if (!text) return 'ต้องบอกว่ายังเหลืออะไร';
  if (text.length > 500) return 'เหตุผลยาวเกิน 500 ตัวอักษร';
  return null;
}

/* ── ตราหลุดเองเมื่อถูกถามกลับ (มติผู้ใช้ 2026-08-20) ─────────────────────
   *"แล้วถ้าตอบ แต่ต้องถามกลับล่ะ แบบโต้ตอบไปมา"*

   ⭐ **เฉพาะหัวข้อที่ทั้งใบคือเธรด** — สอบถามข้อมูลไม่มีแถว ⇒ **เธรดคือตัวงาน** ·
   ข้อความจากอีกฝั่งหลังมีตราปิด = หลักฐานว่ายังไม่จบ ⇒ ตราหลุดเอง ไม่ต้องกด "ยังไม่จบ"
   ⚠️ ใบที่มีแถว (พัฒนากลิ่น · พัฒนาสูตร · ขอเอกสาร) **ไม่หลุดตามข้อความ** — ตัวงานคือ
   แถว ไม่ใช่บทสนทนา · ถามกันระหว่างทางเป็นเรื่องปกติและไม่ได้แปลว่างานถอยกลับ
   ⚠️ ฝั่งเดียวกันพิมพ์เพิ่มไม่หลุด — พูดเสริมของตัวเอง ไม่ใช่การทวงงาน */
export function replyClearsClosure(request, { side, threadOnly }) {
  if (!request || !threadOnly) return null;
  if (request.status === 'closed' || request.status === 'cancelled') return null;
  const { deptDone, requesterDone } = requestClosure(request);
  if (side === 'requester' && deptDone) return 'dept';
  if (side === 'dept' && requesterDone) return 'requester';
  return null;
}
