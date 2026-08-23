// ── รางขั้นบนตารางคำร้อง (มติผู้ใช้ 2026-08-17 · เพิ่มขั้นกำหนดส่ง 2026-08-19) ──
//
// ⭐ **คนเปิดคิวถามว่า "ใบไหนค้างที่ใคร"** ซึ่งเป็นคำถามเรื่อง **ลำดับขั้น** ไม่ใช่
// เรื่องคำเดียว · ป้ายสถานะบอกได้แค่จุดปัจจุบัน แต่ไม่บอกว่าผ่านอะไรมาแล้วและ
// เหลืออะไรอีก ⇒ รางตอบทั้งสามอย่างในสายตาเดียว (ทรงเดียวกับรางของใบสั่งขาย —
// `lib/sales/salesOrderListTrack.js` · มติ 2026-08-13)
//
// ⚠️ **ห้าขั้นนี้คือสายชีวิตของใบจริง ๆ** — ส่ง (ผู้ขอ) → รับเรื่อง (ฝ่ายผู้รับ) →
// กำหนดส่ง (ฝ่ายผู้รับ) → ตอบ/ส่งงาน (ฝ่ายผู้รับ) → ปิด (ผู้ขอ) · ขั้นแรกกับขั้นท้าย
// คนละคนลงมือกับสามขั้นกลาง จึงยุบรวมกันไม่ได้ · ใบตีกลับ = ธงแดงที่ขั้น "ส่ง"
// เพราะคนที่ต้องลงมือคือผู้ขอ
//
// ⭐ **ขั้น "กำหนดส่ง" เป็นของใหม่** (มติผู้ใช้ 2026-08-19) — รับเรื่อง = ตัดรอบเข้าฝ่าย ·
// การรับปากวันเป็นก้าวของตัวเองที่กดทีหลังได้ (รอวัตถุดิบ · รอฝ่ายอื่น) ⇒ ถ้าไม่มีขั้น
// ของมันบนราง ใบที่ยังไม่แจ้งวันจะดูเหมือนเดินไปขั้น "ตอบ" แล้วทั้งที่ยังไม่มีคำสัญญา
//
// ⚠️ **ตรรกะอยู่ที่นี่ ตัววาดอยู่ที่ `components/ui/StepTrack`** — แยกเพราะเทสต์
// node import JSX ไม่ได้ และป้ายสรุปบนจอแคบก็อ่านผลชุดเดียวกันโดยไม่วาดราง
import { requestProgress } from '@/lib/requests/stages';
import { fmtDate } from '@/lib/format';
import { requestSideText, requestWaitLabel } from '@/lib/requests/replyTurn';
import { requestClosure } from '@/lib/requests/closure';

const step = (key, label, state, note = null) => ({ key, label, state, note });

/**
 * รางห้าขั้นของคำร้องหนึ่งใบ
 *
 * @param request แถวจาก `/api/sa/requests` — ใช้ `status` · `submittedAt` ·
 *                `acknowledgedAt`/`acknowledgedByName` · `answeredAt` · `closedAt` ·
 *                `bouncedAt`/`bounceReason` · `committedDueDate` (ขั้น "กำหนดส่ง") ·
 *                `items` (นับคืบหน้าไว้ใต้ขั้น "ตอบ")
 * @returns {{cancelled: boolean, steps: Array<{key,label,state,note}>}}
 *          `cancelled: true` = ใบถูกยกเลิก **ไม่มีรางให้เดิน** — หน้าเว็บโชว์ป้ายแทน
 *          (ลากรางที่ตายแล้วมาแสดงทำให้อ่านเหมือนใบยังเดินอยู่ — กติกาเดียวกับ SO)
 */
export function requestQueueTrack(request = {}) {
  const status = request?.status || 'draft';
  if (status === 'cancelled') return { cancelled: true, steps: [] };

  /* ── ขั้น 1 · ผู้ขอส่งใบ ────────────────────────────────────────────────
     ⚠️ ใบตีกลับกลับไปเป็น `draft` พร้อม `bouncedAt` (ดู `requestNextStep`) ⇒ อ่าน
     `bouncedAt` ไม่ใช่ `status` เฉย ๆ ไม่งั้นใบตีกลับดูเหมือนใบที่ยังไม่เคยส่ง */
  const bounced = status === 'draft' && !!request?.bouncedAt;
  const sent = status !== 'draft';
  const sendStep = bounced
    ? step('send', 'ส่ง', 'bad', request?.bounceReason || 'ถูกตีกลับให้แก้')
    : sent
      ? step('send', 'ส่ง', 'done')
      // ร่างที่ยังไม่เคยส่ง — คนที่ต้องลงมือคือผู้ขอ ⇒ `now` ไม่ใช่ `todo`
      : step('send', 'ส่ง', 'now', 'ยังไม่ได้ส่ง');

  /* ── ขั้น 2 · ฝ่ายผู้รับรับเรื่อง ───────────────────────────────────────
     ⚠️ `acknowledgedAt` เป็นหลักฐานที่ไม่ถอยกลับ — ใบที่เดินไปไกลแล้วต้องขึ้น
     `done` ที่ขั้นนี้เสมอ แม้ `status` จะเลยไปเป็น `answered`/`closed` แล้ว */
  const acked = !!request?.acknowledgedAt || ['acknowledged', 'answered', 'closed'].includes(status);
  const ackStep = acked
    ? step('ack', 'รับเรื่อง', 'done', request?.acknowledgedByName || null)
    : sent
      ? step('ack', 'รับเรื่อง', 'now', 'ยังไม่มีใครรับ')
      : step('ack', 'รับเรื่อง', 'todo');

  /* ── ขั้น 3 · ฝ่ายผู้รับแจ้งกำหนดส่ง (มติผู้ใช้ 2026-08-19) ─────────────
     ⚠️ **`skip` ไม่ใช่ `now` สำหรับใบที่จบไปแล้วโดยไม่เคยแจ้งวัน** — ใบเก่าที่ปิดแล้ว
     ค้างเป็น "ตาฝ่าย" ตลอดกาลไม่ได้ · หมุดกลวงบอกตรง ๆ ว่าใบนี้ไม่ได้เดินผ่านขั้นนี้
     (กติกาเดียวกับขั้นเก็บเงินของใบยอด 0 บนรางใบสั่งขาย) */
  const committed = String(request?.committedDueDate || '').trim();
  const finished = ['answered', 'closed'].includes(status)
    || !!request?.answeredAt || !!request?.closedAt;
  const dueStep = committed
    ? step('due', 'กำหนดส่ง', 'done', fmtDate(committed))
    : acked
      ? (finished
        ? step('due', 'กำหนดส่ง', 'skip', 'ไม่เคยแจ้งกำหนดส่ง')
        : step('due', 'กำหนดส่ง', 'now', requestWaitLabel(request, 'dept', 'แจ้งวัน')))
      : step('due', 'กำหนดส่ง', 'todo');

  /* ── ขั้น 4 · ฝ่ายผู้รับตอบ/ส่งงาน ──────────────────────────────────────
     โน้ตใต้ขั้นบอก **คืบหน้ารายบรรทัด** ของใบที่มีบรรทัด — ตัวเลขเดียวกับที่
     คอลัมน์คืบหน้าโชว์ ไม่ได้คิดใหม่ (`requestProgress` ที่เดียวทั้งระบบ) */
  /* ⚠️ **ขั้น "ตอบ" = ตราปิดฝั่งฝ่าย** (มติผู้ใช้ 2026-08-20) — `answeredAt` ที่หลุดได้
     เมื่องานกลับมา (แถวใหม่ · ถูกถามกลับ) ⇒ ขั้นนี้ถอยกลับเองตามตรา ไม่ค้างเขียว
     ⚠️ ใบเก่าที่ปิดไปก่อนกฎนี้อาจไม่มี `answeredAt` — `status` ที่จบแล้วยังนับว่าผ่าน */
  const closure = requestClosure(request);
  const answered = closure.deptDone || ['answered', 'closed'].includes(status);
  const progress = requestProgress(request?.items || []);
  const progressNote = progress.total ? `${progress.done}/${progress.total} รายการ` : null;
  const answerStep = answered
    ? step('answer', 'ตอบ', 'done')
    : acked
      ? step('answer', 'ตอบ', 'now', progressNote)
      : step('answer', 'ตอบ', 'todo', progressNote);

  /* ── ขั้น 5 · ผู้ขอปิดเรื่อง ────────────────────────────────────────────
     ⚠️ ปิดเป็นคนละก้าวกับตอบ และเป็นคนละคนกด (มติ "วันที่ปิดเรื่องมีสองฝั่ง" ·
     2026-08-15) — ยุบสองขั้นนี้เมื่อไร ใบที่ฝ่ายตอบครบแล้วแต่ผู้ขอยังไม่ปิด
     จะหายไปจากสายตาทันที ทั้งที่นั่นคือกองงานค้างของฝั่งผู้ขอ */
  /* ⭐ **ขั้นปิดเขียวเมื่อครบสองฝั่งเท่านั้น** (มติผู้ใช้ 2026-08-20) — ตราเดียวยังไม่จบ
     · โน้ตบอกว่าเหลือฝั่งไหน ⇒ คนกวาดคิวรู้ว่าต้องไปตามใคร */
  /* ⭐ **วันที่ปิดอยู่ในโน้ตของขั้นนี้** (มติผู้ใช้ 2026-08-23) — เดิมเป็นคอลัมน์ของตัวเอง
     กว้าง 215px ทั้งที่แถวส่วนใหญ่เขียนแค่ "ยังไม่ปิด" · ย้ายมาแปะกับขั้นที่มันเป็น
     เจ้าของเวลานั้นจริง ๆ แล้วถอดคอลัมน์ออก (ดู REQUEST_COLUMN_PRESETS.queue)
     ⚠️ `closedAt` คือฝั่งผู้ขอ · ใบเก่าที่ปิดก่อนกฎสองฝั่งอาจมีแต่ `answeredAt` */
  const closedOn = fmtDate(request.closedAt || request.answeredAt);
  const closeStep = closure.complete
    ? step('close', 'ปิด', 'done', [
      closure.requesterDone && closure.deptDone
        ? `${requestSideText(request, 'dept', 'ตอบ')} · ${requestSideText(request, 'requester', 'ปิด')}`
        : null,
      closedOn ? `เมื่อ ${closedOn}` : null,
    ].filter(Boolean).join(' · ') || null)
    : closure.waitingSide
      ? step('close', 'ปิด', 'now', closure.waitingSide === 'requester'
        ? requestWaitLabel(request, 'requester', 'ปิดเรื่อง')
        : requestWaitLabel(request, 'dept', 'ตอบ'))
      : step('close', 'ปิด', 'todo');

  return { cancelled: false, steps: [sendStep, ackStep, dueStep, answerStep, closeStep] };
}
