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
import { requestSideLabel, requestSideText, requestWaitLabel } from '@/lib/requests/replyTurn';
import { fmtDate } from '@/lib/format';

/** ตราปิดของแต่ละฝั่ง + เหลือใคร — ก้อนเดียวที่ทุกจอถาม */
export function requestClosure(request) {
  const deptDone = !!request?.answeredAt;
  const requesterDone = !!request?.closedAt;
  /* 🐞 **ใบยกเลิกไม่รอใครปิดอีก** (ม-145 · เจอ RQ-26080058 2026-09-11) — ผู้ขอกดปิดฝั่ง
     ตัวเองไว้ แล้วยกเลิกใบทีหลัง ⇒ `closedAt` ค้างอยู่บนใบที่จบไปแล้ว · ของเดิมตอบ
     `waitingSide: 'dept'` ⇒ ใบยกเลิกขึ้น "รอ RD ตอบ" ค้างในคิว RD และนับในป้ายเมนู
     ⚠️ `complete` ยังเป็นเท็จ — ยกเลิกไม่ใช่ปิดเรื่อง (คนละคำ คนละผล) */
  if (request?.status === 'cancelled') {
    return { deptDone, requesterDone, complete: false, cancelled: true, waitingSide: null };
  }
  const complete = request?.status === 'closed' || (deptDone && requesterDone);
  return {
    deptDone,
    requesterDone,
    complete,
    cancelled: false,
    /* เหลือฝั่งไหนที่ยังไม่กด — `null` เมื่อครบแล้ว หรือเมื่อยังไม่มีใครกดเลย
       (ยังไม่มีใครกด = ใบยังอยู่ในช่วงทำงานปกติ ป้ายเป็นเรื่องของงาน ไม่ใช่ของการปิด) */
    waitingSide: complete ? null : deptDone ? 'requester' : requesterDone ? 'dept' : null,
  };
}

/* ── บรรทัด "ปิดแล้วกี่ฝั่ง" (ม-145 · มติผู้ใช้ 2026-09-11) ────────────────
   *"มันน่าจะมีอะไรบอกว่า ปิดยัง ปิดฝ่ายไหนไปแล้ว ปิดครบยัง"*

   🐞 **ตารางไม่เคยบอกว่ามีฝั่งไหนปิดไปแล้ว** — วัด 2026-09-11: 18 ใบที่ผู้ขอกดปิดแล้ว
   ขึ้นป้าย "รอ RD ตอบ" คำเดียวกับใบที่ยังไม่มีใครแตะ (2 ใบถูก "รอกำหนดส่ง" ทับจนหาย
   หมด) · ร่องรอยเดียวบนแถวคือ tooltip ของหมุดสุดท้าย ⇒ เปิดใบแล้วเจอ "ปิดเคส" ในเธรด
   คนจึงอ่านว่าตารางกับหน้าใบขัดกัน

   ⭐ **ขึ้นเฉพาะใบที่มีตราอย่างน้อยหนึ่งฝั่ง** (ผู้ใช้เลือกแบบ "บรรทัดใต้ป้ายสถานะ") —
   ใบที่ยังไม่มีใครกดคือช่วงทำงานปกติ ป้ายสถานะเล่าอยู่แล้ว · เติมบรรทัด "ยังไม่ปิด"
   ทุกแถวคือเหตุผลเดียวกับที่คอลัมน์วันที่ปิดเรื่องถูกถอด (2026-08-23)
   ⚠️ **นับฝั่ง ไม่ใช่นับคลิก** — ตราของฝ่ายคือ `answeredAt` (ปุ่ม "ตอบแล้ว" หรือแถวจบครบ)
   ⇒ "ปิดแล้ว 1/2 · RD ✓" สำหรับใบที่ฝ่ายตอบครบ แม้ปุ่มที่ฝ่ายกดจะชื่อ "ตอบแล้ว" ก็ตาม
   ⚠️ ใบที่ปิดก่อนกฎสองฝั่ง/ปิดโดยไม่ได้ผล มีตราไม่ครบแต่ `status === 'closed'` ⇒ ไม่เขียน
   "2/2" ให้ (มันไม่ได้มีสองตราจริง) — บอกแค่ว่าปิดแล้วเมื่อไร

   คืน `null` หรือ `{ done, complete, text, full, waitText }`
     text = บรรทัดใต้ป้ายในตาราง (ป้ายบอก "รอใคร" อยู่แล้ว จึงไม่พูดซ้ำ)
     full = ประโยคเต็มสำหรับที่ที่ไม่มีป้าย "รอใคร" อยู่ข้าง ๆ (การ์ดบนหน้าใบ) */
const shortDate = (value) => (value ? fmtDate(value, { short: true }) : null);
const latest = (...values) => values.filter(Boolean).map(String).sort().at(-1) || null;

/**
 * มีฝั่งใดฝั่งหนึ่งกดปิดแล้วหรือยัง (ม-145) — **ตัวตัดสินเดียวของ "เลิกนับถอยหลังวันส่ง"**
 *
 * ฝั่งหนึ่งบอกแล้วว่างานจบ ⇒ ที่ค้างคือการกดปิดของอีกฝั่ง ไม่ใช่งานที่ช้า · ใบแบบนี้
 * ไม่ "เลยกำหนด" และไม่ "รอกำหนดส่ง" ในจอไหนเลย
 * 🐞 วัด 2026-09-11: 16 ใบที่ผู้ขอปิดแล้วขึ้น "เลย N วัน" สีแดง · รอบแรกแก้แค่คิว ⇒
 *   แดชบอร์ดขาย · กำหนดการของฉัน · หน้างาน RD ยังเตือนใบเดียวกันว่าเลยกำหนด (รีวิวจับได้)
 *   ⇒ ทุกไฟล์ใน `DECIDERS` ของ `dueReaders.test.mjs` ต้องถามตัวนี้
 */
export function requestClosureStarted(request) {
  return !!(request?.answeredAt || request?.closedAt);
}

/**
 * วันที่ใบ **จบจริง** — ตราหลังสุดของสองฝั่ง (ใบปิดครบตอนฝั่งที่สองกด) · ใบยกเลิกใช้วันยกเลิก
 *
 * ⚠️ ไม่ใช่ `closedAt` อย่างเดียว — ฝ่ายกดทีหลังผู้ขอได้ (9 จาก 36 ใบที่ปิดแล้ว วัด
 * 2026-09-11) · ตัวเรียงแท็บประวัติ · คอลัมน์วันที่ปิดเรื่อง · บรรทัดปิดครบ ใช้ตัวนี้ตัวเดียว
 * 🐞 รอบแรกเรียงด้วยตราหลังสุดแต่คอลัมน์พิมพ์ `closedAt` ⇒ วันที่บนจอไม่เรียงตามลำดับ
 */
export function requestClosedOn(request) {
  if (!request) return null;
  if (request.status === 'cancelled') return request.cancelledAt || null;
  return latest(request.closedAt, request.answeredAt);
}

export function requestClosureLine(request) {
  if (!request || ['draft', 'pending'].includes(request.status)) return null;
  const closure = requestClosure(request);
  if (closure.cancelled) return null;
  const { deptDone, requesterDone, complete } = closure;
  if (!deptDone && !requesterDone && !complete) return null;

  const stamp = (side, done, at) => (done
    ? `${requestSideLabel(request, side)} ✓ ${shortDate(at)}`
    : requestSideText(request, side, 'ยังไม่ปิด'));
  const deptPart = stamp('dept', deptDone, request.answeredAt);
  const requesterPart = stamp('requester', requesterDone, request.closedAt);

  if (complete) {
    if (deptDone && requesterDone) {
      return {
        done: 2,
        complete: true,
        text: `ปิดครบ 2/2 · ${shortDate(requestClosedOn(request))}`,
        full: `ปิดครบ 2/2 · ${deptPart} · ${requesterPart}`,
        waitText: null,
      };
    }
    const on = shortDate(requestClosedOn(request));
    return {
      done: deptDone || requesterDone ? 1 : 0,
      complete: true,
      text: on ? `ปิดเรื่องแล้ว · ${on}` : 'ปิดเรื่องแล้ว',
      full: on ? `ปิดเรื่องแล้ว · ${on}` : 'ปิดเรื่องแล้ว',
      waitText: null,
    };
  }
  // ตราเดียว — บรรทัดโชว์ฝั่งที่กดแล้ว · ประโยคเต็มบอกด้วยว่าเหลือใคร
  const doneSide = deptDone ? 'dept' : 'requester';
  const waitText = closureWaitLabel(request, deptDone ? 'requester' : 'dept');
  return {
    done: 1,
    complete: false,
    text: `ปิดแล้ว 1/2 · ${doneSide === 'dept' ? deptPart : requesterPart}`,
    full: `ปิดแล้ว 1/2 · ${deptPart} · ${requesterPart} — ${waitText}`,
    waitText,
  };
}

/**
 * "รอ <ฝั่ง> ปิด" — คำเดียวทั้งสองฝั่ง (ม-145)
 *
 * 🐞 ของเดิมฝั่งฝ่ายเขียน "รอ RD ตอบ" ⇒ ใบที่ผู้ขอปิดไปแล้วใช้คำเดียวกับตาตอบในเธรด
 * ("รอ RD ตอบ" ของ `replyTurn`) · อ่านไม่ออกเลยว่าผู้ขอปิดไปแล้ว
 * ⚠️ ปุ่มที่ฝ่ายเห็นตอนนั้นชื่อ "ปิดเรื่อง" อยู่แล้ว (มติ 2026-08-28) ⇒ ป้ายกับปุ่มพูดคำเดียวกัน
 */
export function closureWaitLabel(request, side) {
  return requestWaitLabel(request, side, 'ปิด');
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

/* ── ตราหลุดตามข้อความต้องมีบรรทัดในเธรด (ม-145 · มติผู้ใช้ 2026-09-11) ─────
   ผู้ใช้เลือก *"คงกติกาเดิม แต่บันทึกให้เห็น"* — ตรายังหลุดทั้งสองทางตามมติ 2026-08-20

   🐞 **ของเดิมหลุดเงียบ** — เขียนแค่แถวข้อความ ไม่มีเหตุการณ์ ไม่มี audit ของใบ ⇒ บรรทัด
   "ปิดเคส" / "ตอบเรื่องแล้ว" เดิมยังเป็นบรรทัดปิดล่าสุดในเธรด ขณะที่ตารางบอกว่ายังไม่ปิด
   (เจอจริง 4 ใบ: RQ-26080090 · RQ-IQ-26090025 · RQ-26080077 · RQ-26080093)
   ⭐ ชนิด `closure_cleared` ประกาศ `quiet` — มันมาคู่กับข้อความของคนที่เพิ่งพิมพ์เสมอ
   ซึ่งเด้งแจ้งเตือนไปแล้ว (กติกาของ `isQuietUpdateKind`) · เด้งซ้ำ = สองใบเรื่องเดียว
   ⚠️ ประโยคบอก **ว่าตราของใครหลุด และเพราะใครพิมพ์** — "ยังไม่จบ" เฉย ๆ อ่านเหมือนมีคน
   กดปุ่ม ซึ่งไม่มีใครกด */
// ไทยต่อรหัสฝ่าย (อักษรละติน) ต้องมีช่องไฟ · ต่อคำถอยภาษาไทย ("ผู้ขอ") ต้องไม่มี —
// กติกาเดียวกับ `requestWaitLabel` (ดูเหตุผลที่ replyTurn.js)
const after = (thai, text) => (/^[A-Za-z0-9]/.test(text) ? `${thai} ${text}` : `${thai}${text}`);

/* ⚠️ **ไม่ระบุว่าฝ่ายไหนพิมพ์** — ฝั่งของคนพิมพ์ตัดสินจาก "ฝ่ายของคนโพสต์ ≠ ฝ่ายปลายทาง"
   ⇒ แอดมิน/ฝ่ายอื่นพิมพ์ก็นับเป็นฝั่งผู้ขอ · เขียนชื่อฝ่ายผู้ขอลงไปคือกล่าวหาว่า SA พิมพ์
   ทั้งที่ไม่ได้พิมพ์ (รีวิวจับได้) · ชื่อคนพิมพ์อยู่บนแถวของเหตุการณ์อยู่แล้ว */
export function closureClearedUpdate(request, clears) {
  if (!request || !['dept', 'requester'].includes(clears)) return null;
  const clearedDid = requestSideText(request, clears, clears === 'dept' ? 'ตอบแล้ว' : 'ปิดแล้ว');
  return {
    kind: 'closure_cleared',
    body: `${after('ถอนการปิดฝั่ง', requestSideText(request, clears, 'อัตโนมัติ'))} — `
      + after('มีข้อความใหม่ในเธรดหลัง', clearedDid)
      + ' · ใบกลับมาเปิด รอปิดให้ครบสองฝั่ง',
    meta: { clears, dept: request.dept || null },
  };
}
