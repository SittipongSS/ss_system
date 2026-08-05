// ── แถบตัวเลข + ก้าวถัดไป ของคิวคำร้อง (P6b) — logic ล้วน ────────────────
//
// ⭐ **ตัวเลขตัวที่ 4 "รอฝ่ายขายทำต่อ" คือของใหม่ทั้งหมดของหน้านี้** — วันนี้คิวนับ
// ทุกใบที่ยัง open เป็น "งานค้างของฝ่าย" ทั้งที่ครึ่งหนึ่งรอผู้ขอไปรับของ/ส่งลูกค้า
// อยู่ ⇒ ตัวเลขงานค้างของ RD สูงกว่าความจริงตลอดเวลา และไม่มีใครเชื่อมันอีกเลย
//
// ⚠️ อ่านขั้นของแถวจาก `rowStage.js` ที่เดียว — ตัวเดียวกับที่รางบนหน้ารายละเอียดใช้
// ⇒ คิวกับหน้ารายละเอียดขัดกันไม่ได้เชิงโครงสร้าง (ไม่ใช่เพราะมีคนคอยดูให้ตรงกัน)
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { requestRowSummary } from '@/lib/requests/rowStage';

// ── ก้าวถัดไปของ "ทั้งใบ" ────────────────────────────────────────────────
//
// ต่างจาก `nextStepForRow` ตรงที่คิวไม่ได้แสดงรายแถว — มันต้องตอบคำถามเดียวว่า
// "ใบนี้รอใครอยู่" · ใบที่มีทั้งแถวที่รอฝ่ายและแถวที่รอผู้ขอ ให้ **ฝ่ายมาก่อน**
// เพราะฝ่ายเป็นคนถือคอขวด (ผู้ขอทำต่อไม่ได้จนกว่าของจะมา)
//
// คืน { owner, label } หรือ null เมื่อใบนี้ไม่ต้องการอะไรอีกแล้ว
export function requestNextStep(request) {
  if (!request) return null;
  if (request.status === 'draft') return { owner: 'requester', label: 'ยังไม่ได้ส่ง' };
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) return null;

  const items = request.items || [];
  // ใบที่ยังไม่มีบรรทัด (สอบถาม/พัฒนากลิ่นก่อน RD ส่งของ) — คอขวดอยู่ที่ฝ่ายเสมอ
  if (!items.length) {
    return request.status === 'pending'
      ? { owner: 'dept', label: 'รอรับเรื่อง' }
      : { owner: 'dept', label: 'รอฝ่ายดำเนินการ' };
  }

  const summary = requestRowSummary(items);
  if (summary.waitingDept > 0) {
    return { owner: 'dept', label: `รอฝ่ายทำต่อ ${summary.waitingDept} รายการ` };
  }
  if (summary.waitingRequester > 0) {
    return { owner: 'requester', label: `รอผู้ขอทำต่อ ${summary.waitingRequester} รายการ` };
  }
  // ทุกแถวจบแล้วแต่ใบยังไม่ปิด — คนที่ต้องกดปิดคือผู้ขอ
  return { owner: 'requester', label: 'ครบแล้ว รอปิดเรื่อง' };
}

// ── แถบตัวเลข 4 ตัว ──────────────────────────────────────────────────────
//
// ⚠️ **นับใบ ไม่ใช่นับแถว** — คิวแสดงรายใบ ตัวเลขที่นับแถวจะไม่ตรงกับจำนวนบรรทัด
// ที่คนเห็นอยู่ตรงหน้า แล้วไม่มีใครรู้ว่าตัวไหนถูก
export function queueCounts(rows = [], { todayIso = null } = {}) {
  const out = { unacked: 0, overdue: 0, working: 0, waitingRequester: 0 };
  for (const request of rows) {
    if (!REQUEST_OPEN_STATUSES.includes(request?.status)) continue;
    const next = requestNextStep(request);

    if (request.status === 'pending') out.unacked += 1;
    // ⚠️ เลยกำหนดนับ **เฉพาะใบที่รับปากวันไว้แล้ว** — ใบที่ยังไม่รับเรื่องไม่มี
    // กำหนดให้เลย จึงไม่ใช่ "เลยกำหนด" แต่เป็น "ยังไม่รับเรื่อง" (คนละปัญหา
    // คนละทางแก้ · รวมกันเมื่อไรตัวเลขจะบอกไม่ได้ว่าต้องไปทำอะไร)
    if (todayIso && request.committedDueDate
      && String(request.committedDueDate) < String(todayIso)) out.overdue += 1;

    if (next?.owner === 'dept' && request.status !== 'pending') out.working += 1;
    // ⭐ ตัวที่ 4 — ใบที่ฝ่ายทำส่วนของตัวเองเสร็จแล้วแต่ยังปิดไม่ได้
    if (next?.owner === 'requester') out.waitingRequester += 1;
  }
  return out;
}

export const QUEUE_COUNT_META = [
  { key: 'unacked', label: 'ยังไม่รับเรื่อง', tone: 'warning' },
  { key: 'overdue', label: 'เลยกำหนด', tone: 'danger' },
  { key: 'working', label: 'กำลังดำเนินการ', tone: 'info' },
  // ⭐ ตัวนี้ไม่มีในระบบวันนี้ — มันคือตัวที่ทำให้ฝ่ายเลิกถูกนับงานที่ไม่ใช่ของตัวเอง
  { key: 'waitingRequester', label: 'รอฝ่ายขายทำต่อ', tone: 'neutral' },
];
