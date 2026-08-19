// ── แถบตัวเลข + ก้าวถัดไป ของคิวคำร้อง (P6b) — logic ล้วน ────────────────
//
// ⭐ **ตัวเลขตัวที่ 4 "รอฝ่ายขายทำต่อ" คือของใหม่ทั้งหมดของหน้านี้** — วันนี้คิวนับ
// ทุกใบที่ยัง open เป็น "งานค้างของฝ่าย" ทั้งที่ครึ่งหนึ่งรอผู้ขอไปรับของ/ส่งลูกค้า
// อยู่ ⇒ ตัวเลขงานค้างของ RD สูงกว่าความจริงตลอดเวลา และไม่มีใครเชื่อมันอีกเลย
//
// ⚠️ อ่านขั้นของแถวจาก `rowStage.js` ที่เดียว — ตัวเดียวกับที่รางบนหน้ารายละเอียดใช้
// ⇒ คิวกับหน้ารายละเอียดขัดกันไม่ได้เชิงโครงสร้าง (ไม่ใช่เพราะมีคนคอยดูให้ตรงกัน)
import {
  REQUEST_OPEN_STATUSES, REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES, requestAwaitingDue,
} from '@/lib/requests/statuses';
import { requestRowSummary } from '@/lib/requests/rowStage';
// ⚠️ ดึงตัวเรียงจาก `queue.js` ตรง ๆ ไม่ผ่าน façade `deptRequests.js` — façade
// re-export ไฟล์นี้ด้วย การ import กลับไปหามันคือวงกลม
import { compareRequestUrgency } from '@/lib/requests/queue';

// ── ก้าวถัดไปของ "ทั้งใบ" ────────────────────────────────────────────────
//
// ต่างจาก `nextStepForRow` ตรงที่คิวไม่ได้แสดงรายแถว — มันต้องตอบคำถามเดียวว่า
// "ใบนี้รอใครอยู่" · ใบที่มีทั้งแถวที่รอฝ่ายและแถวที่รอผู้ขอ ให้ **ฝ่ายมาก่อน**
// เพราะฝ่ายเป็นคนถือคอขวด (ผู้ขอทำต่อไม่ได้จนกว่าของจะมา)
//
// คืน { owner, label } หรือ null เมื่อใบนี้ไม่ต้องการอะไรอีกแล้ว
//
/* ⭐ **"รอกำหนดส่ง" ทับป้ายได้เฉพาะก้าวที่เป็นของฝ่าย** (มติผู้ใช้ 2026-08-19) —
   รับเรื่องแล้วแต่ยังไม่แจ้งวัน คือของค้างที่ฝ่ายต้องลงมือ ⇒ ต้องเห็นแทนป้ายงาน
   🐞 เวอร์ชันแรกทับ **ทุกป้าย** ⇒ ใบที่ฝ่ายส่งครบแล้วรอผู้ขอปิด ("รอปิดเรื่อง") กลาย
   เป็น "รอกำหนดส่ง" ที่ฝั่ง dept ⇒ คิวชี้ผิดตัวว่าใครค้าง และตัวเลข "รอฝ่ายขายทำต่อ"
   ที่มีไว้ไม่ให้ฝ่ายถูกนับงานของคนอื่น ก็พังไปด้วย */
export function requestNextStep(request) {
  const next = baseNextStep(request);
  if (next && next.owner === 'dept' && requestAwaitingDue(request)) {
    return { ...next, label: 'รอกำหนดส่ง' };
  }
  return next;
}

function baseNextStep(request) {
  if (!request) return null;
  /* 🐞 **ใบที่ถูกตีกลับเคยเป็นใบเงียบ** (ผู้ใช้ถามเอง 2026-08-11: "ตีกลับอยู่ไหน")
     ตีกลับ = ฝ่ายผู้รับส่งคืน ⇒ `status` กลับเป็น `draft` พร้อม `bounceReason`/`bouncedAt`
     (เลขที่เดิม) · แต่คิวอ่านแค่ `status` ⇒ ป้ายขึ้น "ยังไม่ได้ส่ง" เหมือนร่างที่ไม่เคย
     ส่งเลย · ไม่มีตัวเลขไหนนับ ไม่มีอะไรทวง ⇒ **นาฬิกาหยุดเดินแต่ใบยังไม่จบ**
     ⚠️ ดู `bouncedAt` ไม่ใช่ `bounceReason` — เหตุผลเป็นข้อความที่วันหน้าอาจว่างได้
     แต่ตราประทับเวลาคือหลักฐานว่า "เคยถูกส่งคืน" ซึ่งลบไม่ได้ */
  if (request.status === 'draft') {
    return request.bouncedAt
      ? { owner: 'requester', label: 'ตีกลับ — ต้องแก้', bounced: true }
      : { owner: 'requester', label: 'ยังไม่ได้ส่ง' };
  }
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) return null;

  const items = request.items || [];
  // ใบที่ยังไม่มีบรรทัด (สอบถาม/พัฒนากลิ่นก่อน RD ส่งของ) — คอขวดอยู่ที่ฝ่ายเสมอ
  //
  // ⭐ "รอฝ่ายเริ่ม" ≠ "รอฝ่ายทำต่อ" — ตัวแรกคือรับเรื่องแล้วแต่ยังไม่มีของสักชิ้น
  // ตัวหลังคือส่งมาบ้างแล้วแต่ยังไม่ครบ · สองอย่างนี้ผู้ขอทำอะไรต่างกัน (ตัวแรกรอเฉย ๆ
  // ตัวหลังมีของให้ไปรับ) จึงยุบเป็นคำเดียวไม่ได้
  if (!items.length) {
    return request.status === 'pending'
      ? { owner: 'dept', label: 'รอรับเรื่อง' }
      : { owner: 'dept', label: 'รอฝ่ายเริ่ม' };
  }

  // ⚠️ **ไม่ต่อจำนวนท้ายป้าย** (มติผู้ใช้ 2026-08-08) — คิวมีคอลัมน์ "คืบหน้า" ที่บอก
  // `2 / 3` อยู่แล้ว ⇒ ป้ายพูดซ้ำและกินไป 50px (135px → 84px) · ป้ายตอบว่า "ใครค้าง"
  // คอลัมน์ตัวเลขตอบว่า "ค้างเท่าไร" — คนละคำถาม อย่ายัดไว้ที่เดียวกัน
  const summary = requestRowSummary(items);
  if (summary.waitingDept > 0) {
    return { owner: 'dept', label: 'รอฝ่ายทำต่อ' };
  }
  if (summary.waitingRequester > 0) {
    return { owner: 'requester', label: 'รอผู้ขอทำต่อ' };
  }
  // ทุกแถวจบแล้วแต่ใบยังไม่ปิด — คนที่ต้องกดปิดคือผู้ขอ
  return { owner: 'requester', label: 'รอปิดเรื่อง' };
}

/* ── สถานะของใบในคิว = ป้ายเดียวที่มีทั้งคำและสี (มติผู้ใช้ 2026-08-15) ──────
 *
 * ⭐ **คิวมีคอลัมน์สถานะช่องเดียว** — ของเดิมมีสองภาษาปนกัน: คอลัมน์ "ต้องทำอะไร"
 * (`requestNextStep`) กับคอลัมน์ "สถานะ" (`request.status` ดิบ) ซึ่งพูดเรื่องเดียวกัน
 * คนละคำและคนละสี · ผู้ใช้อ่านแล้วไม่รู้ว่าต้องเชื่อช่องไหน
 *
 * ⚠️ **ข้อความยังมาจาก `requestNextStep` ไม่ใช่ `status` ดิบ** — status ดิบทำข้อมูล
 * หายสองอย่างที่เคยเป็นบั๊กมาแล้ว:
 *   · ใบตีกลับมี `status === 'draft'` ⇒ อ่านเป็น "ร่าง" เหมือนใบที่ไม่เคยส่ง
 *     (🐞 "ตีกลับอยู่ไหน" ผู้ใช้ถามเอง 2026-08-11 — ดูคำเตือนใน `requestNextStep`)
 *   · รอรับเรื่อง / รอฝ่ายเริ่ม / รอฝ่ายทำต่อ / รอผู้ขอทำต่อ ยุบเหลือ "กำลังดำเนินการ"
 *     คำเดียว ทั้งที่สี่อย่างนี้คนละคนต้องลงมือ
 *
 * ⚠️ **โทนต้องบอก "ใครค้าง" ไม่ใช่ระดับความรุนแรง** — ฟ้า = ตาฝ่ายเรา · เทา = รอฝั่งอื่น
 * · เหลือง = ยังไม่มีใครรับ (นาฬิกาเริ่มเดินแล้วแต่ยังไม่มีเจ้าของ) · แดง = ตีกลับ
 * ⇒ กวาดตาลงคอลัมน์แล้วเห็นทันทีว่าใบไหนเป็นงานเรา
 */
export function requestQueueStatus(request) {
  const next = requestNextStep(request);
  if (next) {
    // ⚠️ "รอกำหนดส่ง" เหลืองเท่ากับ "รอรับเรื่อง" — ทั้งคู่คือนาฬิกาเดินแล้วแต่ยังไม่มี
    // คำสัญญา · ทาสีฟ้าเหมือนงานที่กำลังเดินอยู่เมื่อไร มันจะจมหายในคอลัมน์ทันที
    const tone = next.bounced ? 'danger'
      : next.label === 'รอรับเรื่อง' || next.label === 'รอกำหนดส่ง' ? 'warning'
        : next.owner === 'dept' ? 'info'
          : 'neutral';
    return { label: next.label, tone, owner: next.owner, bounced: Boolean(next.bounced) };
  }
  /* ใบที่ไม่มีก้าวถัดไปแล้ว (ปิด/ยกเลิก/ตอบแล้ว) — ใช้คำและโทนของสถานะจริง
     ⚠️ ต้องมีคำเสมอ ห้ามคืนช่องว่าง · แท็บ "ประวัติ" มีแต่ใบพวกนี้ทั้งแท็บ */
  const status = request?.status;
  return {
    label: REQUEST_STATUS_LABELS[status] || 'จบแล้ว',
    tone: REQUEST_STATUS_TONES[status] || 'neutral',
    owner: null,
    bounced: false,
  };
}

// ── แถบตัวเลข 4 ตัว ──────────────────────────────────────────────────────
//
// ⚠️ **นับใบ ไม่ใช่นับแถว** — คิวแสดงรายใบ ตัวเลขที่นับแถวจะไม่ตรงกับจำนวนบรรทัด
// ที่คนเห็นอยู่ตรงหน้า แล้วไม่มีใครรู้ว่าตัวไหนถูก
/**
 * ใบนี้เข้าเงื่อนไขของตัวเลขตัวไหน — **กติกาเดียวที่ทั้งตัวนับและตัวกรองใช้**
 *
 * ⭐ แยกออกมาเพราะตัวเลขบนแถบ **กดกรองได้แล้ว** — ถ้าปล่อยให้ตัวนับกับตัวกรองเขียน
 * เงื่อนไขคนละชุด จะได้อาการ "กด «เลยกำหนด 2» แล้วขึ้นสามใบ" ซึ่งเป็นบั๊กที่หาไม่เจอ
 * เพราะทั้งสองฝั่งดู "ถูก" ในตัวเอง · ตอนนี้ขัดกันไม่ได้เชิงโครงสร้าง
 */
export function matchesQueueCount(request, key, { todayIso = null } = {}) {
  /* ⭐ **ใบที่ถูกตีกลับต้องนับได้** — มันเป็น `draft` จึงตกด่านบรรทัดล่างทั้งหมด
     (`REQUEST_OPEN_STATUSES` ไม่รวม draft) ⇒ เดิมไม่ถูกนับสักช่องเดียว
     ⚠️ นับเฉพาะตัวเองเท่านั้น ไม่ให้ไหลไปช่องอื่น — ใบตีกลับไม่ใช่ "กำลังดำเนินการ"
     และไม่ใช่ "เลยกำหนด" (ไม่มีวันกำหนดแล้ว เพราะยังไม่ถูกรับเรื่อง) */
  if (key === 'bounced') return !!request?.bouncedAt && request?.status === 'draft';
  if (!REQUEST_OPEN_STATUSES.includes(request?.status)) return false;
  // ยังไม่ได้ให้วัน — ใบที่ยังเดินอยู่แต่ไม่มีใครรับปากวันไหนไว้เลย
  if (key === 'undated') return !request?.committedDueDate;
  const next = requestNextStep(request);

  if (key === 'unacked') return request.status === 'pending';
  // ⚠️ เลยกำหนดนับ **เฉพาะใบที่รับปากวันไว้แล้ว** — ใบที่ยังไม่รับเรื่องไม่มี
  // กำหนดให้เลย จึงไม่ใช่ "เลยกำหนด" แต่เป็น "ยังไม่รับเรื่อง" (คนละปัญหา
  // คนละทางแก้ · รวมกันเมื่อไรตัวเลขจะบอกไม่ได้ว่าต้องไปทำอะไร)
  if (key === 'overdue') {
    return !!todayIso && !!request.committedDueDate
      && String(request.committedDueDate) < String(todayIso);
  }
  if (key === 'working') return next?.owner === 'dept' && request.status !== 'pending';
  // ⭐ ตัวที่ 4 — ใบที่ฝ่ายทำส่วนของตัวเองเสร็จแล้วแต่ยังปิดไม่ได้
  if (key === 'waitingRequester') return next?.owner === 'requester';
  return false;
}

export function queueCounts(rows = [], { todayIso = null } = {}) {
  // ⚠️ ตั้งต้นจาก **ทะเบียน** ไม่ใช่พิมพ์คีย์ซ้ำ — เพิ่มตัวเลขใหม่ (เช่น `bounced`
  // 2026-08-11) แล้วลืมมาเติมที่นี่ = ตัวนับคืน `undefined` ให้จอเงียบ ๆ (เจอจริง
  // ตอนเพิ่มตัวที่ 5) · `QUEUE_COUNT_META` ประกาศใต้ฟังก์ชันนี้ แต่อ่านตอนเรียก
  // ไม่ใช่ตอนโหลดโมดูล จึงไม่ติด TDZ
  const out = Object.fromEntries(QUEUE_COUNT_META.map((m) => [m.key, 0]));
  for (const request of rows) {
    for (const key of Object.keys(out)) {
      if (matchesQueueCount(request, key, { todayIso })) out[key] += 1;
    }
  }
  return out;
}

export const QUEUE_COUNT_META = [
  { key: 'unacked', label: 'ยังไม่รับเรื่อง', tone: 'warning' },
  { key: 'overdue', label: 'เลยกำหนด', tone: 'danger' },
  { key: 'working', label: 'กำลังดำเนินการ', tone: 'info' },
  // ⭐ ตัวนี้ไม่มีในระบบวันนี้ — มันคือตัวที่ทำให้ฝ่ายเลิกถูกนับงานที่ไม่ใช่ของตัวเอง
  { key: 'waitingRequester', label: 'รอฝ่ายขายทำต่อ', tone: 'neutral' },
  /* ⭐ ตัวที่ 5 (2026-08-11) — **งานของผู้ขอ ไม่ใช่ของฝ่าย** · ใบที่ฝ่ายส่งคืนแล้วรอ
     คนเปิดใบมาแก้ · ก่อนหน้านี้ไม่มีตัวเลขไหนนับเลย ใบจึงค้างได้ไม่จำกัดโดยเงียบ
     ⚠️ หน้าคิวของ *ฝ่าย* (`/rd/requests`) จะได้ 0 เสมอ เพราะฝ่ายไม่ใช่คนแก้ —
     ตัวเลขนี้มีความหมายบนหน้า `/requests` ของผู้ขอ */
  { key: 'bounced', label: 'ตีกลับ รอคุณแก้', tone: 'danger', requesterOnly: true },
  /* ⭐ ตัวที่ 6 (2026-08-12 · แบบ ข) — **ใบที่ยังไม่มีใครให้วัน** · เป็นงานของ *ฝ่าย*
     (ต้องไปกดรับเรื่องแล้วให้วัน) ไม่ใช่ของผู้ขอ ⇒ ไม่โผล่บนหน้า `/requests`
     ⚠️ ตัวเลขนี้คู่กับปฏิทินคำสัญญาเสมอ — ปฏิทินโชว์เฉพาะใบที่มีวันแล้ว ถ้าไม่มีตัวนี้
     คนจะอ่านปฏิทินโล่ง ๆ แล้วสรุปว่าสัปดาห์นี้ว่าง (ของจริงตอนทำ: 8 จาก 15 ใบ) */
  { key: 'undated', label: 'ยังไม่ได้ให้วัน', tone: 'warning', deptOnly: true },
];

/**
 * ตัวเลขที่ควรโชว์บนหน้านั้น — `scope: 'dept'` ตัดตัวที่ฝ่ายได้ 0 เสมอทิ้ง
 *
 * ⚠️ กล่องที่เป็น 0 ตลอดกาลไม่ใช่ "ข้อมูลที่ยังไม่มี" แต่เป็น **สัญญาณรบกวน** —
 * คนอ่านต้องเรียนรู้ทุกครั้งว่ากล่องนี้ไม่เกี่ยวกับตัวเอง · ตัดที่ทะเบียนที่เดียว
 * ไม่ใช่ให้แต่ละหน้าพิมพ์รายการคีย์ของตัวเอง (แล้วลืมอัปเดตตอนเพิ่มตัวที่ 6)
 */
export function queueCountMeta({ scope = 'requester' } = {}) {
  return QUEUE_COUNT_META.filter((m) => (scope === 'dept' ? !m.requesterOnly : !m.deptOnly));
}

// ── แท็บ 3 ตัวคงที่ (P6c) ─────────────────────────────────────────────────
//
// ⭐ **ไม่โตตามจำนวนฝ่าย** (R-4 ของแผน) — ของเดิมเป็น "คิวฝ่าย RD · คิวฝ่าย PC ·
// ที่ฉันเปิด" ซึ่งจะกลายเป็นสี่แท็บทันทีที่ฝ่ายบัญชี (FN) เข้ามาใน P7 และห้าแท็บ
// เมื่อมีฝ่ายถัดไป · คนที่อยู่หลายฝ่ายจะต้องไล่กดทีละแท็บเพื่อดูว่ามีงานอะไรบ้าง
//
// ⇒ ถามคำถามเดียวแทน: **"ตอนนี้เป็นตาใคร"** ซึ่งไม่ขึ้นกับจำนวนฝ่ายเลย
export const QUEUE_TABS = [
  { key: 'todo', label: 'รอฉันตอบ' },
  { key: 'mine', label: 'ที่ฉันเปิด' },
  { key: 'history', label: 'ประวัติ' },
];

// แถวของแต่ละแท็บ
//
// ⚠️ `myDepts` มาจากผู้เรียก (หน้าจอคำนวณจาก canAnswerRequestsFor) — ฟังก์ชันนี้ไม่
// ตัดสินสิทธิ์เอง มันแค่จัดกลุ่มสิ่งที่ server ส่งมาแล้ว · ด่านจริงอยู่ที่ API
/**
 * แถวที่หน้าคิวควรแสดง — **ขอบเขตเป็นตัวตัดสิน แท็บบทบาทเป็นตัวรอง**
 *
 * 🐞 บั๊กที่ผู้ใช้แจ้ง (2026-08-11): API ส่งใบมา 15 ใบ แต่หน้าโชว์ 0 ทุกแท็บ
 * เพราะแท็บทั้งสามผูกกับ "ฉัน" ทั้งหมด (`_mine` หรือฝ่ายที่ฉันตอบได้) ⇒ ใบที่โหลดมา
 * ด้วยขอบเขต **ทีม/ทั้งหมด** ไม่มีแท็บไหนรับเลย · ตัวสลับขอบเขตจึงไม่มีผลอะไรบนจอ
 * และแอดมิน (ไม่ได้อยู่ฝ่ายที่ตอบ ไม่ได้เปิดใบเอง) เห็นหน้าว่างทั้งที่มีงาน 15 ใบ
 *
 * ⭐ **โครงเดียวกับหน้า "งานของฉัน"** (มติผู้ใช้ 2026-08-11) — ที่นั่นขอบเขต
 * (ของฉัน/ทีม/ทั้งหมด) เป็นตัวเลือกชุดข้อมูล ส่วนตัวสลับ "บทบาทของฉันในงาน"
 * โผล่เฉพาะตอนเลือก "ของฉัน" · คิวคำร้องใช้กติกาเดียวกัน:
 *   scope 'mine'        → กรองด้วยแท็บบทบาท (รอฉันตอบ / ที่ฉันเปิด / ประวัติ)
 *   scope 'team'/'all'  → แสดงทุกใบที่ขอบเขตโหลดมา ไม่กรองด้วย "ฉัน" อีกชั้น
 */
export function visibleQueueRows(rows = [], { scope = 'mine', tab, myDepts = [] } = {}) {
  if (scope !== 'mine') return [...rows];
  return queueTabRows(rows, { tab, myDepts });
}

export function queueTabRows(rows = [], { tab, myDepts = [] } = {}) {
  if (tab === 'mine') return rows.filter((r) => r._mine);
  if (tab === 'history') {
    // ⚠️ ประวัติ = **ใบที่จบแล้ว** ไม่ใช่ "ทุกใบ" — ถ้ารวมใบที่ยังเปิดอยู่ด้วย
    // มันจะซ้ำกับสองแท็บแรกและไม่มีใครรู้ว่าต้องดูแท็บไหน
    return rows.filter((r) => !requestNextStep(r));
  }
  // todo — ตาของฝ่ายที่ฉันอยู่ · ใบร่างของตัวเองไม่นับ (ยังไม่ได้ส่ง = ตาฉันเอง
  // แต่มันอยู่แท็บ "ที่ฉันเปิด" แล้ว · โผล่สองที่จะทำให้ตัวเลขบนแท็บบวกกันเกินจริง)
  return rows.filter((r) => {
    if (r.status === 'draft') return false;
    const next = requestNextStep(r);
    if (!next) return false;
    return next.owner === 'dept' ? myDepts.includes(r.dept) : !!r._mine;
  });
}

/**
 * ของที่ **รอคนเปิดหน้าอยู่ลงมือ** — แท็บ "รอฉันตอบ" + ใบตีกลับของตัวเอง
 *
 * ⭐ ม-102 ข้อ 4 ตัดสินไว้แล้วว่าใบตีกลับ **ห้ามไหลเข้า `queueTabRows`** — มันต้องอยู่
 * แท็บ "ที่ฉันเปิด" ที่เดียว ไม่งั้นเลขบนแท็บบวกกันเกินจริง · แต่มันคือของค้างที่
 * **ขวางงานตัวเองอยู่จริง** ⇒ ทุกที่ที่ตอบคำถาม "ตอนนี้มีอะไรรอฉัน" ต้องบวกมันเอง
 *
 * ⚠️ เดิมมีที่เดียวที่บวก คือการ์ด "เริ่มที่นี่" ซึ่งบวกอยู่ในหน้า `/requests` เอง ⇒
 * ป้ายตัวเลขบนเมนูไม่รู้เรื่องด้วย · อาการจริง: เมนูคำร้องไม่ขึ้นป้ายเลย ทั้งที่กดเข้าไป
 * แล้วการ์ดชี้ใบตีกลับให้ทำอยู่ตรงหน้า — ป้ายที่เงียบตอนมีงานคือป้ายที่คนเลิกเชื่อ
 * ⇒ ยกมาไว้ที่นี่ที่เดียว ให้การ์ดกับป้ายเมนูอ่านชุดเดียวกันเชิงโครงสร้าง
 *
 * ⚠️ ซ้ำกันไม่ได้โดยโครงสร้าง ไม่ใช่เพราะโชคดี — `queueTabRows` ตัด `draft` ทิ้ง
 * ทั้งหมด ส่วนก้อนหลังรับเฉพาะ `draft` ที่มี `bouncedAt`
 */
export function waitingOnMeRows(rows = [], { myDepts = [] } = {}) {
  return [
    ...queueTabRows(rows, { tab: 'todo', myDepts }),
    // ใบตีกลับของ **ตัวเอง** เท่านั้น — ของเพื่อนร่วมทีมไม่ใช่ของค้างของเรา
    // (กติกาเดียวกับแถบเตือนใบตีกลับที่ `/requests`)
    ...rows.filter((r) => r._mine && r.status === 'draft' && r.bouncedAt),
  ];
}

// ── แถวคั่นกลุ่ม ─────────────────────────────────────────────────────────
//
// ⭐ ทำให้ลำดับที่ `compareRequestUrgency` จัดไว้ **มองเห็นได้** — ของเดิมเรียงถูก
// แล้วแต่คนอ่านไม่รู้ว่าทำไมใบนี้อยู่บน เพราะไม่มีอะไรบอกว่าเส้นแบ่งอยู่ตรงไหน
export const QUEUE_GROUPS = [
  /* ⭐ **บนสุด** (2026-08-11) — ใบตีกลับคือใบเดียวในคิวที่ *คนเปิดหน้าอยู่* ต้องลงมือ
     เอง ไม่ใช่รอใคร ⇒ ขวางงานตัวเองอยู่ · เดิม `status` กลับเป็น `draft` ซึ่งไม่อยู่
     ใน `REQUEST_OPEN_STATUSES` ⇒ ตกกลุ่ม **"จบแล้ว"** พร้อมใบที่ปิดไปแล้วจริง ๆ
     และหลุดจากการ์ด "เริ่มที่นี่" ทั้งที่เป็นของค้างที่เร่งที่สุด */
  { key: 'bounced', label: 'ตีกลับ — รอคุณแก้แล้วส่งใหม่' },
  { key: 'unacked', label: 'ยังไม่มีใครรับเรื่อง' },
  { key: 'overdue', label: 'เลยกำหนดที่รับปากไว้' },
  { key: 'open', label: 'กำลังดำเนินการ' },
  { key: 'settled', label: 'จบแล้ว' },
];

export function requestGroupKey(request, { todayIso = null } = {}) {
  if (!request) return 'settled';
  // ⚠️ ก่อนด่าน `REQUEST_OPEN_STATUSES` — ใบตีกลับเป็น `draft` จึงไม่ผ่านด่านนั้น
  if (request.status === 'draft' && request.bouncedAt) return 'bounced';
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) return 'settled';
  if (request.status === 'pending') return 'unacked';
  if (todayIso && request.committedDueDate
    && String(request.committedDueDate) < String(todayIso)) return 'overdue';
  return 'open';
}

// ── จัดแถวเป็นกลุ่มพร้อมแถวคั่น (P6d) ────────────────────────────────────
//
// ⚠️ **จัดกลุ่มจริง ไม่ใช่แค่ดูว่าคีย์เปลี่ยนแล้วแทรกเส้น** — `compareRequestUrgency`
// ไม่ได้เรียงตามลำดับกลุ่มนี้เป๊ะ ๆ (มันเรียงตามความเร่งซึ่งคิดจากหลายอย่าง)
// ⇒ วิธี "เห็นคีย์เปลี่ยนแล้วแทรก" จะได้หัวข้อเดิมโผล่ซ้ำหลายรอบกลางตาราง
//
// คืน [{ group, label, rows }] — กลุ่มที่ว่างถูกตัดทิ้ง (หัวข้อลอยที่ไม่มีของ
// ข้างใต้อ่านเหมือนข้อมูลหาย)
export function groupQueueRows(rows = [], { todayIso = null } = {}) {
  const byKey = new Map(QUEUE_GROUPS.map((g) => [g.key, []]));
  for (const row of rows) {
    const key = requestGroupKey(row, { todayIso });
    (byKey.get(key) || byKey.get('open')).push(row);
  }
  return QUEUE_GROUPS
    .map((g) => ({ group: g.key, label: g.label, rows: byKey.get(g.key) || [] }))
    .filter((g) => g.rows.length);
}

// ── "เริ่มที่นี่" — ใบเดียวที่ควรทำก่อน ──────────────────────────────────
//
// ⭐ อาการ *"ไม่รู้ว่าต้องทำอะไรต่อ"* (มติผู้ใช้ 2026-08-08) — จอภาพรวมกับคิวตอบ
// ได้ว่า **มีอะไรค้างบ้าง** แต่ไม่มีที่ไหนตอบว่า **เริ่มที่ใบไหน** · คนเปิดมาเจอ
// ตัวเลข 4 ตัวกับตารางแล้วต้องตัดสินใจเองทุกเช้าว่าอันไหนก่อน
//
// ⚠️ **ไม่มีกติกาความเร่งชุดใหม่** — เรียงด้วย `compareRequestUrgency` แล้วหยิบ
// กลุ่มแรกจาก `groupQueueRows` ตัวเดียวกับที่คิวใช้ ⇒ ใบที่การ์ดชี้ต้องเป็นใบบนสุด
// ของคิวเสมอ · ประกาศเกณฑ์ของตัวเองเมื่อไรจะได้อาการ "การ์ดบอกใบ A แต่คิวเรียงใบ B
// ไว้บนสุด" ซึ่งอ่านแล้วไม่รู้จะเชื่ออันไหน
//
// ⚠️ ผู้เรียกต้องกรองมาแล้วว่าเป็น **งานของคนนี้/ฝ่ายนี้** — ฟังก์ชันนี้ไม่ตัดสินสิทธิ์
// และไม่รู้ว่าใครเปิดหน้าอยู่ (กติกาเดียวกับ `queueTabRows`)
//
// คืน { request, group, groupLabel, next, due, remaining } หรือ null เมื่อไม่มีอะไรค้าง
export function startHereRequest(rows = [], { todayIso = null } = {}) {
  const open = rows.filter((r) => requestNextStep(r));
  if (!open.length) return null;
  const groups = groupQueueRows(
    open.slice().sort(compareRequestUrgency),
    { todayIso },
  ).filter((g) => g.group !== 'settled');
  const top = groups[0];
  if (!top) return null;
  const request = top.rows[0];
  return {
    request,
    group: top.group,
    groupLabel: top.label,
    next: requestNextStep(request),
    due: requestDueText(request, { todayIso }),
    // ⚠️ **นับที่เหลือ ไม่ใช่นับทั้งหมด** — การ์ดชี้ใบหนึ่งไปแล้ว เลขที่ต่อท้ายจึงต้อง
    // ตอบว่า "หลังใบนี้ยังเหลืออีกเท่าไร" ไม่ใช่พูดซ้ำจำนวนที่แถบตัวเลขบอกอยู่แล้ว
    remaining: open.length - 1,
  };
}

/**
 * คิวถัดไปหลังใบที่การ์ด "เริ่มที่นี่" ชี้ไว้ — เรียงด้วยเกณฑ์เดียวกันเป๊ะ
 *
 * ⭐ **หน้าภาพรวมต้องตอบว่า "แล้วต่อจากนี้ทำอะไร"** (มติผู้ใช้ 2026-08-11 · แบบ ก) —
 * เดิมก้อนที่สองของหน้าคือ "ใกล้ถึงกำหนด 7 วัน" ซึ่งกรองด้วย `committedDueDate`
 * ⇒ **ใบที่ยังไม่มีใครรับหายไปทั้งหมด** เพราะยังไม่มีใครให้วัน · ของด่วนที่สุดของฝ่าย
 * (ใบที่ยังไม่มีใครแตะ) จึงไม่เคยโผล่บนหน้าภาพรวมเลย
 *
 * ⚠️ ใช้ `startHereRequest` เป็นตัวตัดหัว ไม่ใช่ตัดด้วย id ที่ผู้เรียกส่งมา — สองที่
 * ต้องเรียงชุดเดียวกันเสมอ ไม่งั้นการ์ดชี้ใบหนึ่ง แต่ตารางข้างล่างขึ้นใบนั้นเป็นอันดับ 2
 */
export function nextUpRows(rows = [], { todayIso = null, limit = 5 } = {}) {
  const open = rows.filter((r) => requestNextStep(r));
  if (!open.length) return [];
  const ordered = groupQueueRows(open.slice().sort(compareRequestUrgency), { todayIso })
    .filter((g) => g.group !== 'settled')
    .flatMap((g) => g.rows);
  // ตัวแรกคือใบที่การ์ด "เริ่มที่นี่" ชี้อยู่แล้ว — พูดซ้ำสองที่ในจอเดียวคือเสียที่เปล่า
  return ordered.slice(1, 1 + Math.max(0, limit));
}

// ── คิวของ "ฝ่าย" (P2) — มุมมองในโมดูลของฝ่ายเอง ─────────────────────────
//
// ⭐ ต่างจาก `queueTabRows` ตรงที่ตัวนั้นตอบคำถามของ **คน** ("ตอนนี้เป็นตาใคร"
// รวมทั้งใบที่ฉันเปิดถึงฝ่ายอื่น) ส่วนตัวนี้ตอบคำถามของ **ฝ่าย** ("งานของฝ่ายเรา
// ค้างอยู่ตรงไหน") ⇒ กรองด้วย `dept` ก่อนเสมอ ไม่ดู `_mine` เลย
//
// ⚠️ ใบร่างไม่เข้าคิวฝ่ายไม่ว่ากรณีใด — ยังไม่ถูกส่ง = ยังไม่ใช่งานของใครนอกจากคนร่าง
export const DEPT_QUEUE_TABS = [
  { key: 'todo', label: 'รอฝ่ายตอบ' },
  // ⭐ ตัวนี้คือ "รอฝ่ายขายทำต่อ" ของแถบตัวเลข — ยกขึ้นมาเป็นแท็บด้วยเพราะ RD ต้อง
  // เปิดดูได้ว่าอะไรค้างอยู่ที่อีกฝั่ง (ของที่ส่งไปแล้วแต่ยังไม่มีใครมารับ)
  { key: 'waiting', label: 'รอฝ่ายขายทำต่อ' },
  { key: 'history', label: 'ประวัติ' },
];

export function deptQueueRows(rows = [], { dept, tab = 'todo' } = {}) {
  const mine = rows.filter((r) => r?.dept === dept && r?.status !== 'draft');
  if (tab === 'history') return mine.filter((r) => !requestNextStep(r));
  const owner = tab === 'waiting' ? 'requester' : 'dept';
  return mine.filter((r) => requestNextStep(r)?.owner === owner);
}

// ── ใกล้ถึงกำหนด ─────────────────────────────────────────────────────────
//
// ⏸️ **ยังไม่มีใครเรียกตั้งแต่ 2026-08-11** — หน้าภาพรวม RD เปลี่ยนไปใช้ `nextUpRows`
// (คิวถัดไป) เพราะตัวนี้กรองด้วย `committedDueDate` ⇒ ใบที่ยังไม่มีใครรับหายหมด
// เก็บไว้เพราะโมดูลฝ่ายที่ยังไม่เปิด (PC/FN) จะถามคำถาม "อะไรจะเลยกำหนด" อีกแน่ ๆ
// และกติกา "นับจากวันที่รับปาก ไม่ใช่วันที่ผู้ขออยากได้" ข้างล่างคือของที่ต้องไม่หาย
//
// ⚠️ **นับจากวันที่ฝ่าย "รับปาก" ไม่ใช่วันที่ผู้ขอ "อยากได้"** — `committedDueDate`
// คือเส้นที่ใช้วัดว่าช้าหรือยัง (`requestedDueDate` เป็นความหวังของอีกฝั่ง)
// ⇒ ใบที่ยังไม่รับเรื่องจะไม่มีวันนี้เลย และไม่ควรโผล่ที่นี่ — มันอยู่ในตัวเลข
// "ยังไม่รับเรื่อง" ซึ่งเป็นคนละปัญหาคนละทางแก้
export function dueSoonRows(rows = [], { dept, todayIso, days = 7 } = {}) {
  if (!todayIso) return [];
  const limit = new Date(`${todayIso}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + days);
  const limitIso = limit.toISOString().slice(0, 10);
  return rows
    .filter((r) => r?.dept === dept && r?.status !== 'draft')
    .filter((r) => requestNextStep(r)?.owner === 'dept')
    .filter((r) => r.committedDueDate && String(r.committedDueDate) <= limitIso)
    .sort((a, b) => String(a.committedDueDate).localeCompare(String(b.committedDueDate)));
}

// ── กำหนดส่งที่ฝ่ายรับปากไว้ — ข้อความพร้อมแสดง ────────────────────────────
//
// ⭐ **คอลัมน์ใหม่ในคิว** (มติผู้ใช้ 2026-08-08) — เดิมต้องเข้าใบถึงจะเห็น ทั้งที่
// "เลยกำหนดไหม" คือคำถามที่สองของหัวหน้าถัดจาก "ต้องทำอะไร"
//
// ⚠️ **นับเฉพาะใบที่รับปากวันไว้แล้ว** — ใบที่ยังไม่รับเรื่องไม่มีกำหนดให้เลย
// (กติกาเดียวกับตัวนับ `overdue` ที่ `matchesQueueCount` ใช้ ⇒ คอลัมน์กับตัวเลข
// บนแถบพูดตรงกันเสมอ)
//
// คืน { date, note, overdue } หรือ null เมื่อยังไม่มีกำหนด
/**
 * ใบนี้ถูกตีกลับมากี่วันแล้ว — คืน null เมื่อไม่ใช่ใบที่ถูกตีกลับ
 *
 * ⚠️ ใบตีกลับไม่มี "กำหนดส่ง" ให้นับถอยหลัง (ยังไม่ถูกรับเรื่อง) ⇒ สิ่งที่ต้องทวงคือ
 * **ค้างมากี่วันแล้ว** ไม่ใช่ "เหลืออีกกี่วัน" · คนละคำถาม คนละตัวเลข
 */
export function bouncedDaysText(request, { todayIso = null } = {}) {
  if (!request?.bouncedAt || request.status !== 'draft') return null;
  const at = String(request.bouncedAt).slice(0, 10);
  if (!todayIso) return { date: at, note: 'ตีกลับแล้ว', days: null };
  const ms = Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${at}T00:00:00Z`);
  if (!Number.isFinite(ms)) return { date: at, note: 'ตีกลับแล้ว', days: null };
  const days = Math.max(0, Math.round(ms / 86400000));
  return { date: at, days, note: days === 0 ? 'ตีกลับวันนี้' : `ค้าง ${days} วัน` };
}

export function requestDueText(request, { todayIso = null } = {}) {
  const due = request?.committedDueDate ? String(request.committedDueDate) : null;
  if (!due) return null;
  if (!todayIso) return { date: due, note: null, overdue: false };

  // ⚠️ ต่างกันเป็น "วัน" ไม่ใช่ชั่วโมง — ทั้งสองค่าเป็น YYYY-MM-DD ของวันไทย
  // (businessDate) · ใช้ Date.parse กับ T00:00:00Z ทั้งคู่จึงไม่มีปัญหาเขตเวลา
  const ms = Date.parse(`${due}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`);
  if (!Number.isFinite(ms)) return { date: due, note: null, overdue: false };
  const days = Math.round(ms / 86400000);
  if (days < 0) return { date: due, note: `เลย ${-days} วัน`, overdue: true };
  if (days === 0) return { date: due, note: 'วันนี้', overdue: false };
  return { date: due, note: `อีก ${days} วัน`, overdue: false };
}
