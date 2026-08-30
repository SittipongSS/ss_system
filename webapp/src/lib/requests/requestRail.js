// ── รางของใบ — ประกอบขั้นตอนที่คนดูเห็นบนหน้ารายละเอียด ─────────────────
//
// ⭐ **แยกออกมาจากหน้าเพราะมันเทสต์ไม่ได้ตอนอยู่ในนั้น** — บั๊กสองตัวที่ผู้ใช้เจอเอง
// (ป้ายซ้ำสองบรรทัด · จุดไฮไลต์ชี้ผิดขั้น) เป็นตรรกะการประกอบรางล้วน ๆ ที่ CI มองไม่เห็น
// เพราะมันฝังอยู่ใน JSX · ย้ายมาเป็นฟังก์ชันบริสุทธิ์แล้วเทสต์ครอบได้ทั้งตระกูล
//
// ⚠️ **ใบบอกว่า "รอใคร" · แถวบอกว่า "แต่ละ direction ไปถึงไหน"** — ขั้น แก้ไข/คอนเฟิร์ม/
// ราคา อยู่ที่ก้าวถัดไปท้ายเธรด (NextStepBar) เพราะ direction A คอนเฟิร์ม B ขอแก้ C ไม่เอา
// ได้พร้อมกัน ⇒ ใบทั้งใบบอกไม่ได้ (กติกา "สถานะอยู่ที่แถว ไม่ใช่ที่ใบ")
import { requestDeliversRows, requestKindMeta } from '@/lib/master/requestTypes';
import { requestAwaitingDue } from '@/lib/requests/statuses';
import { dueIsStale } from '@/lib/requests/dueRound';
import { requestReplyTurn, requestSideText, requestWaitLabel } from '@/lib/requests/replyTurn';
import { requestClosure } from '@/lib/requests/closure';
import { requestRowSummary, rowStage } from '@/lib/requests/rowStage';
import { fmtDate } from '@/lib/format';

/**
 * บรรทัดใต้ชื่อขั้น = **หลักฐานว่าเกิดอะไรขึ้นแล้ว** ถ้ามี · ไม่มีค่อยบอกว่ารออะไร
 *
 * 🐞 เดิมทุกขั้นเขียนคำอธิบายตายตัวว่า "ขั้นนี้แปลว่าอะไร" ("ระบุเรื่องที่ต้องการ" ·
 * "ส่งถึงฝ่าย RD" · "ผู้ตอบยืนยันว่าตอบครบ") ⇒ รางบอกนิยามของกระบวนการ ไม่ได้บอก
 * อะไรเกี่ยวกับ *ใบนี้* เลย · ของจริงมีอยู่บนแถวแล้วทั้งชื่อคนและวันที่ แต่ถูกโยนไป
 * เป็นบรรทัดจิ๋วใต้หัวใบ ("รับเรื่องโดย … · 14/08/2026") ซึ่งไม่มีใครมองหา
 * ⇒ ยกมาไว้บนราง ทรงเดียวกับรางของใบสั่งขาย (`sales-orders/[id]` — `workflow`)
 *
 * ⚠️ **ย้าย ไม่ก๊อป** — บรรทัดใต้หัวใบถูกถอดพร้อมกัน ไม่งั้นข้อเท็จจริงเดียวกัน
 * อยู่สองที่แล้วต้องคอยดูแลให้ตรงกัน
 */
const evidence = (...parts) => parts.filter(Boolean).join(' · ') || null;

// บรรทัดใต้ขั้น "ปิดเรื่อง" — ครบสองฝั่ง = โชว์ทั้งคู่ · ยังไม่ครบ = บอกว่าเหลือใคร
function closureHint(request) {
  const closure = requestClosure(request);
  if (closure.complete) {
    return evidence(
      request.closedByName && `ปิดโดย ${request.closedByName}`,
      request.closedAt && fmtDate(request.closedAt),
    ) || 'ปิดครบสองฝั่งแล้ว';
  }
  if (closure.waitingSide === 'requester') {
    return `${requestSideText(request, 'dept', 'ตอบแล้ว')} — ${requestWaitLabel(request, 'requester', 'ปิดเรื่อง')}`;
  }
  if (closure.waitingSide === 'dept') {
    return `${requestSideText(request, 'requester', 'ปิดแล้ว')} — ${requestWaitLabel(request, 'dept', 'ตอบ')}`;
  }
  return 'ต้องปิดทั้งสองฝั่งถึงจะจบ';
}

// ขั้นกลาง — สรุปจากแถวข้างใน ไม่ใช่คำตายตัว
function middleStep(request) {
  const items = request.items || [];
  const summary = requestRowSummary(items);
  const awaitingPrice = items.filter((i) => rowStage(i) === 'awaiting_price').length;

  if (!summary.total) {
    // ⭐ ไม่มีแถวแปลว่าอะไร ขึ้นกับหัวข้อ (มติผู้ใช้ 2026-08-09): หัวข้อที่ฝ่ายสร้าง
    // แถวเองตอนส่ง (พัฒนากลิ่น) คือรอ **ของ** จริง ๆ · หัวข้อไม่มีแถวเลย
    // (สอบถามข้อมูล) ของไม่มีอยู่ในสาย — คำที่ถูกคือรอ **คำตอบ**
    if (requestDeliversRows(request.kind)) {
      // "ส่งงาน" คำเดียวกับปุ่ม (ม-120) — รางเล่าก้าวเดียวกับที่ปุ่มกด
      return {
        label: requestWaitLabel(request, 'dept', 'ส่งงาน'),
        hint: 'รับเรื่องแล้ว ยังไม่มีของส่งมา',
      };
    }
    /* ⭐ **หัวข้อเธรดล้วน — ตาใครตอบพลิกตามข้อความล่าสุด** (มติผู้ใช้ 2026-08-20)
       ⚠️ อ่าน `requestReplyTurn` ตัวเดียวกับคิว ⇒ สองที่พูดคำเดียวกันเสมอ (ของเดิม
       คิวเขียน "รอฝ่ายเริ่ม" แต่รางเขียน "รอฝ่าย RD ตอบ" — คนละคำสำหรับใบเดียวกัน) */
    const turn = requestReplyTurn(request);
    return {
      label: turn ? turn.label : requestWaitLabel(request, 'dept', 'ตอบ'),
      hint: turn?.side === 'requester'
        ? `${request.dept} ตอบในเธรดแล้ว — รอคนเปิดเรื่องตอบกลับ`
        : 'รับเรื่องแล้ว — ตอบกันในเธรด',
    };
  }
  // ⭐ **"รอใส่ราคา" ต้องเห็นเป็นพิเศษ** — แถวที่คอนเฟิร์มแล้วแต่ยังไม่มีราคาคือใบค้าง
  // ถาวรถ้าไม่มีใครเห็น (กับดักข้อ 11 ของแผน)
  if (awaitingPrice) {
    return { label: 'รอใส่ราคา', hint: `${awaitingPrice} รายการที่คอนเฟิร์มแล้ว` };
  }
  if (summary.waitingDept) {
    return {
      label: `${request.dept} กำลังทำ`,
      hint: `เสร็จแล้ว ${summary.settled}/${summary.total}`,
    };
  }
  if (summary.waitingRequester) {
    return {
      label: requestWaitLabel(request, 'requester', 'ทำต่อ'),
      hint: `${summary.waitingRequester} รายการ`,
    };
  }
  // ⚠️ **ห้ามกลับไปใช้คำว่า "กำลังหาราคา"** (มติผู้ใช้ 2026-08-19) — คำนั้นเหลือมาจาก
  // ตอนที่คำร้องมีแต่สายขอราคาวัสดุ · วันนี้ใบส่วนใหญ่เป็นกลิ่น/สูตร/เอกสารที่ไม่มี
  // ราคาให้หาสักบาท ⇒ รางเล่าเรื่องที่ไม่ได้เกิดขึ้น
  return { label: 'กำลังดำเนินการ', hint: requestSideText(request, 'dept', 'รับเรื่องแล้ว') };
}

/**
 * ขั้นตอนบนรางของใบ + ขั้นที่กำลังอยู่ — คืน { steps, index }
 *
 * ⚠️ **รางเป็นชุดเดียวทุกหัวข้อแล้ว** — ขั้น "รอหัวหน้ายืนยัน" ที่เคยแทรกเฉพาะ
 * พัฒนากลิ่นถูกถอดออกทั้งขั้น (มติผู้ใช้ 2026-08-16) ⇒ `index` เท่ากับลำดับของ
 * สถานะตรง ๆ ไม่มี offset ให้พลาดอีก (บั๊ก "จุดไฮไลต์ชี้ผิดขั้น" เกิดจากตรงนั้น)
 */
export function requestRailSteps(request, { hasItems = false } = {}) {
  // ชื่อขั้น "กำหนดส่ง" ต่างตามหัวข้อ (ประเมินพื้นที่ = "ลงคิว") — อ่านจากทะเบียน
  const commitStepLabel = requestKindMeta(request.kind)?.form?.commitStepLabel || 'กำหนดส่ง';
  const steps = [
    {
      id: 'draft',
      label: 'จัดทำคำร้อง',
      // ใครเป็นคนเปิดใบ — รู้ตั้งแต่ร่างแล้ว จึงมีหลักฐานเสมอ
      hint: evidence(request.requestedByName)
        || (hasItems ? 'ระบุวัสดุและชั้นจำนวน' : 'ระบุเรื่องที่ต้องการ'),
    },
    {
      id: 'pending',
      label: 'รอรับเรื่อง',
      /* ⭐ ขั้นนี้ **จบลงตอนมีคนรับเรื่อง** ⇒ หลักฐานของมันคือ "ใครรับ เมื่อไร"
         (ทรงเดียวกับขั้น "AE Supervisor ตรวจ" ของใบสั่งขายที่โชว์ชื่อผู้อนุมัติ)
         · ยังไม่มีใครรับ = โชว์วันที่ยื่นแทน · ยังไม่ยื่น = บอกว่าจะส่งไปไหน */
      hint: evidence(
        request.acknowledgedByName && `รับโดย ${request.acknowledgedByName}`,
        request.acknowledgedAt && fmtDate(request.acknowledgedAt),
      )
        || (request.submittedAt ? `ยื่นเมื่อ ${fmtDate(request.submittedAt)}` : `ส่งถึง ${request.dept}`),
    },
    /* ⭐ **ขั้น "กำหนดส่ง" เป็นขั้นของตัวเอง** (มติผู้ใช้ 2026-08-19) — รับเรื่อง =
       ตัดรอบเข้าฝ่าย · การรับปากวันกดทีหลังได้เมื่อฝ่ายรู้จริง (รอวัตถุดิบ · รอฝ่ายอื่น)
       ⚠️ ต้องเป็นขั้นแยก **ไม่ใช่คำในขั้นกลาง** — รางบนตารางรายการก็มีขั้นนี้
       (`queueTrack`) · สองที่เล่าจำนวนขั้นไม่ตรงกันเมื่อไร คนอ่านจะนับขั้นไม่ตรงกัน */
    {
      id: 'commitDue',
      /* ชื่อขั้นมาจาก **ทะเบียนหัวข้อ** — ฝ่ายที่ต้องจัดคนไปหน้างานไม่ได้ "ส่งของ"
         (ประเมินพื้นที่ = "ลงคิว") · ค่ากลางยังเป็น "กำหนดส่ง" เหมือนเดิมทุกหัวข้อ */
      label: commitStepLabel,
      /* ⭐ **รอบแก้ดึงขั้นนี้กลับมา** (มติผู้ใช้ 2026-08-25) — วันที่ใบถืออยู่เป็นของ
         งานที่ส่งไปแล้ว ⇒ โชว์เป็นหลักฐานเฉย ๆ ไม่ได้ ต้องบอกว่ารออะไรอยู่ตอนนี้
         ⚠️ ยังโชว์วันเดิมต่อท้าย — คนอ่านต้องรู้ว่ารอบก่อนตกลงวันไหนไว้ ไม่ใช่ให้
         ตัวเลขหายไปเฉย ๆ ราวกับไม่เคยมีใครรับปากอะไร */
      hint: (dueIsStale(request, request.items) && request.committedDueDate)
        ? `${requestWaitLabel(request, 'dept', 'แจ้งวันของรอบแก้')} · รอบก่อน ${fmtDate(request.committedDueDate)}`
        : evidence(request.committedDueDate && fmtDate(request.committedDueDate))
        || (request.acknowledgedAt
          ? requestWaitLabel(request, 'dept', commitStepLabel === 'ลงคิว' ? 'ลงคิว' : 'แจ้งวัน')
          : `${request.dept} ${commitStepLabel === 'ลงคิว' ? 'ลงคิวหลังรับเรื่อง' : 'แจ้งวันส่งหลังรับเรื่อง'}`),
    },
    // ⚠️ ขั้นกลางเป็น **สถานะงานที่กำลังเดินอยู่** ไม่ใช่หลักฐานของอดีต ("เสร็จแล้ว 2/5"
    // · "รอใส่ราคา 3 รายการ") ⇒ ปล่อยให้ `middleStep` เล่าตามเดิม
    { id: 'acknowledged', ...middleStep(request) },
    {
      id: 'answered',
      label: 'ตอบแล้ว',
      /* ⭐ **ขั้นนี้คือตราปิดฝั่งฝ่าย** (มติผู้ใช้ 2026-08-20 · ปิดสองฝั่ง) — มาเองเมื่อ
         ทุกแถวจบ หรือฝ่ายกดปุ่ม "ตอบแล้ว" ในใบที่ไม่มีแถว · หลุดได้เมื่องานกลับมา */
      hint: evidence(
        request.answeredByName && `${requestSideText(request, 'dept', 'ตอบ')} · ${request.answeredByName}`,
        request.answeredAt && fmtDate(request.answeredAt),
      ) || requestSideText(request, 'dept', 'ยืนยันว่าตอบครบ'),
    },
    {
      id: 'closed',
      label: 'ปิดเรื่อง',
      /* ⭐ **ต้องครบสองฝั่งถึงจะจบ** — ตราเดียวยังไม่จบ ⇒ บรรทัดใต้ขั้นบอกว่าเหลือใคร
         ไม่ใช่โชว์ชื่อคนที่กดไปแล้วเฉย ๆ (ซึ่งอ่านเหมือนใบจบแล้ว) */
      hint: closureHint(request),
    },
  ];

  /* ⚠️ **index ต้องนับขั้นที่เรนเดอร์จริง ไม่ใช่ลำดับของสถานะ** — บั๊ก "จุดไฮไลต์ชี้ผิด
     ขั้น" ที่ผู้ใช้เคยเจอเกิดจากตรงนี้พอดี ตอนที่รางมีขั้นแทรกแต่ map ยังนับจากสถานะดิบ
     ⇒ ขั้น "กำหนดส่ง" (2026-08-19) แทรกที่ตำแหน่ง 2 ⇒ ใบที่รับเรื่องแล้วแต่ยังไม่แจ้งวัน
     หยุดที่ 2 · แจ้งแล้วถึงเดินต่อไปขั้นกลางที่ 3 */
  const index = request.status === 'draft'
    ? 0
    : request.status === 'pending'
      ? 1
      : request.status === 'acknowledged'
        ? (requestAwaitingDue(request) ? 2 : 3)
        : request.status === 'answered'
          ? 4
          : 5;

  return { steps, index };
}
