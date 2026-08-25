// ── เครื่องสถานะของคำร้อง — ด่านของแต่ละ action ───────────────────────────
// คืนข้อความไทย หรือ null ถ้าผ่าน · **API และหน้าจอเรียกตัวเดียวกัน** ปุ่มกับ server
// จึงขัดกันไม่ได้ (กฎที่ request-hub-rebuild-plan บันทึกไว้ว่าเคยพลาด: เงื่อนไขที่
// ปุ่มรู้แต่ฟอร์มไม่รู้ = ปุ่มจางเงียบโดยไม่บอกเหตุผล)
import { requestDeliversRows, requestHasItems } from '@/lib/master/requestTypes';
import { dueIsStale } from '@/lib/requests/dueRound';
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { isRowSettled } from '@/lib/requests/rowStage';
import { soReconcile } from '@/lib/requests/soReconcile';
import { closureStatus } from '@/lib/requests/closure';
import { requestSideText } from '@/lib/requests/replyTurn';

// ── ความคืบหน้า + สถานะที่ derive ────────────────────────────────────────
// ตัวนับคำนวณตอนอ่านเสมอ ห้ามเก็บคอลัมน์ (กัน drift — แพตเทิร์นเดียวกับใบขอราคาผลิต)
//
// ⭐ **"จบ" ถามจาก `isRowSettled` ที่เดียว** ไม่ใช่อ่าน `answerStatus` เอง
//
// 🐞 ของจริงที่เดินวงแล้วเจอ: แถวที่ลูกค้า "ขอให้แก้" มี `rowStage = 'revised'` ซึ่ง
// `isRowSettled` นับว่าจบแล้ว (งานย้ายไปแถวใหม่) แต่ `answerStatus` ของมันค้างที่
// `pending` ตลอดไป — `hopPatch` จงใจไม่ปิดให้ ⇒ ตัวนับเก่าได้ `complete: false`
// **ถาวร** ⇒ ใบไม่มีวันเป็น `answered` ⇒ **ปิดใบไม่ได้ตลอดชีวิต** ทั้งที่งานจบหมดแล้ว
// ลูกค้าขอแก้แค่ครั้งเดียวก็ล็อกใบทิ้งได้ทันที
export function requestProgress(items = []) {
  const total = items.length;
  const done = items.filter(isRowSettled).length;
  return { done, total, complete: total > 0 && done === total };
}

// ตอบครบทุกรายการ → คำร้องเป็น answered เอง (ไม่ต้องให้ใครกด)
// ⚠️ ใช้ได้เฉพาะชนิดที่มีบรรทัด — ชนิดที่ไม่มีบรรทัด (สอบถาม/บรีฟ/mockup) ผู้ตอบ
// กดปุ่ม "ตอบแล้ว" เอง เพราะระบบไม่มีทางรู้ว่าคำตอบครบหรือยัง
export function deriveRequestStatusAfterAnswer(items = [], currentStatus = 'acknowledged') {
  if (currentStatus === 'cancelled' || currentStatus === 'closed') return currentStatus;
  return requestProgress(items).complete ? 'answered' : 'acknowledged';
}

/**
 * patch ของ **หัวใบ** หลังแถวขยับ — ตราปิดฝั่งฝ่าย + สถานะ ในก้อนเดียว
 *
 * ⭐ **ตราฝั่งฝ่ายคือ `answeredAt`** (มติผู้ใช้ 2026-08-20 · ปิดสองฝั่ง) — ใบที่มีแถว
 * ได้ตรานี้เองเมื่อทุกแถวจบ ไม่ต้องมีปุ่มให้ฝ่ายกดอีกอัน
 * 🐞 ของเดิมขยับแค่ `status` ⇒ `answeredAt` ของหัวใบไม่เคยถูกประทับเลยสำหรับใบที่มีแถว
 * (คอลัมน์ว่างมาตั้งแต่ mig 0158) · พอกฎใหม่อ่านตราจากคอลัมน์นี้ มันต้องถูกเขียนจริง
 *
 * ⚠️ **แถวกลับมาไม่ครบ = ถอนตราทั้งสองฝั่ง** — มีแถวใหม่/ลูกค้าขอแก้ = งานยังไม่จบ
 * ⇒ ตราของผู้ขอที่กดไว้ก่อนหน้าก็ต้องหลุดด้วย ไม่งั้นพอฝ่ายปิดรอบสองใบจะจบทันที
 * ทั้งที่ผู้ขอยังไม่ได้ดูของรอบใหม่เลย
 * ⚠️ ใบที่ยังไม่มีแถวสักแถว (ก่อนฝ่ายส่งงาน) ไม่แตะอะไรเลย — `requestProgress` ของ
 * ใบเปล่าคือ "ยังไม่ครบ" ซึ่งไม่ได้แปลว่าต้องถอนตรา
 */
export function requestRowsClosurePatch(request, items = [], nowIso) {
  const patch = {};
  if (!request || ['cancelled', 'closed'].includes(request.status)) return patch;
  if (!items.length) return patch;

  const complete = requestProgress(items).complete;
  const answeredAt = complete ? (request.answeredAt || nowIso) : null;
  const closedAt = complete ? (request.closedAt || null) : null;
  if ((request.answeredAt || null) !== answeredAt) patch.answeredAt = answeredAt;
  if (!complete && request.closedAt) {
    patch.closedAt = null;
    patch.closedById = null;
    patch.closedByName = null;
  }
  const status = closureStatus({ status: request.status, answeredAt, closedAt });
  if (status !== request.status) patch.status = status;
  return patch;
}

// ── ด่านของแต่ละ action ──────────────────────────────────────────────────
export function submitRequestError(request, items = []) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status !== 'draft') return 'คำร้องนี้ส่งไปแล้ว';
  if (requestHasItems(request.kind) && !items.length) {
    return 'ต้องมีรายการอย่างน้อย 1 รายการก่อนส่ง';
  }
  // ⭐ วันที่ต้องการรับงานบังคับทุกคำร้อง (มติผู้ใช้ 2026-08-08) — ร่างใหม่ถูกด่าน
  // `requestShapeError` กันตั้งแต่ POST แล้ว · ด่านนี้กัน **ร่างเก่า** ที่เกิดก่อนมติ
  // ไม่ให้หลุดตอนกดส่ง — ร่างพวกนั้นไม่มีช่องแก้วัน ทางออกคือลบแล้วเปิดใหม่
  // ซึ่งข้อความต้องบอกตรง ๆ ไม่ใช่ให้ไปหาช่องที่ไม่มีอยู่
  if (!String(request.requestedDueDate ?? '').trim()) {
    return 'ใบนี้ไม่มีวันที่ต้องการรับงาน (ร่างเก่าก่อนกติกาบังคับวัน) — ลบร่างแล้วเปิดใหม่';
  }
  return null;
}

// ⭐ **รับเรื่อง = ตัดรอบ ไม่ใช่การรับปากวัน** (มติผู้ใช้ 2026-08-19) — ทับมติ
// 2026-08-08 ที่บังคับวันกำหนดส่งตอนกดรับเรื่องทุกหัวข้อ
//
// 🐞 เหตุผลที่มติเดิมพัง: ฝ่ายรับเรื่องบ่อยครั้ง **ยังตอบวันไม่ได้จริง ๆ** ตอนกดรับ
// (รอวัตถุดิบ · รอฝ่ายอื่นตอบก่อน) ⇒ ทางเลือกเหลือสองทางที่แย่ทั้งคู่: เดาวันไปก่อน
// แล้วเลื่อนทีหลัง (วันที่รับปากเลิกมีความหมาย) หรือไม่กดรับเลย (ใบค้างที่
// "รอรับเรื่อง" ทั้งที่ฝ่ายดูอยู่แล้ว และนาฬิกาของผู้ขอไม่เดิน)
//
// ⇒ แยกเป็นสองก้าว: กดรับ = ตัดรอบเข้าฝ่าย · แจ้งกำหนดส่ง = รับปากวัน
// (`commitDueRequestError`) · ระหว่างสองก้าวใบอยู่สถานะที่จอเรียกว่า **รอกำหนดส่ง**
// (`acknowledged` + ยังไม่มี `committedDueDate`) ซึ่งคิวนับเป็นงานค้างของฝ่าย
export function acknowledgeRequestError(request) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status === 'draft') return 'คำร้องนี้ยังไม่ถูกส่ง';
  if (request.status !== 'pending') return 'คำร้องนี้รับเรื่องไปแล้ว';
  return null;
}

// ── แจ้งกำหนดส่ง: ก้าวที่สองของฝ่ายผู้รับ (มติผู้ใช้ 2026-08-19) ──────────
//
// ⚠️ **หนึ่งครั้งต่อรอบ** — เปลี่ยนวันของ *รอบเดิม* ต้องไปทาง `rescheduleRequestError`
// ซึ่งบังคับให้เธรดเห็นว่าเลื่อนจากวันไหนเป็นวันไหน · ปล่อยให้ก้าวนี้เขียนทับได้เมื่อไร
// การเลื่อนวันก็มีทางลัดที่ไม่ทิ้งร่องรอยทันที
//
// ⭐ **รอบแก้เปิดก้าวนี้ใหม่** (มติผู้ใช้ 2026-08-25) — ลูกค้าขอให้แก้ ⇒ เกิดแถวรอบใหม่
// ที่ยังไม่มีใครรับปากวัน · วันที่ใบถืออยู่เป็นของงานที่ส่งไปแล้ว ⇒ ไม่ใช่การ "เลื่อน"
// คำสัญญาเดิม แต่เป็นการ **แจ้งวันของงานชิ้นใหม่** ⇒ คำบนปุ่มและในเธรดต้องเป็น
// "แจ้งวันส่ง" ไม่ใช่ "เลื่อนวัน" (`dueIsStale` ตัดสินให้ — ดู lib/requests/dueRound.js)
export function commitDueRequestError(request, { committedDueDate = null } = {}) {
  if (!request) return 'ไม่พบคำร้อง';
  if (!request.acknowledgedAt) return 'ยังไม่ได้รับเรื่อง — รับเรื่องก่อนแจ้งกำหนดส่ง';
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) {
    return request.status === 'cancelled' ? 'คำร้องนี้ถูกยกเลิกไปแล้ว' : 'คำร้องนี้ปิดไปแล้ว';
  }
  // ⚠️ อ่านแถวจากตัวใบ (`request.items`) ไม่ใช่พารามิเตอร์เพิ่ม — เหตุผลเดียวกับ
  // `requestAwaitingDue`: ผู้เรียกที่ลืมส่งจะทำให้ด่านกับปุ่มเห็นไม่ตรงกันเงียบ ๆ
  if (String(request.committedDueDate ?? '').trim() && !dueIsStale(request, request.items)) {
    return 'ใบนี้แจ้งกำหนดส่งไปแล้ว — ใช้ปุ่มเลื่อนวันกำหนดส่งแทน';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(committedDueDate ?? '').trim())) {
    return 'ต้องระบุวันกำหนดส่ง';
  }
  return null;
}

// ── เลื่อนวันกำหนดส่ง: แก้วันที่รับปากไว้แล้ว ────────────────────────────
//
// ⭐ **แก้ได้ แต่แก้เงียบ ๆ ไม่ได้** (มติผู้ใช้ 2026-08-06) — RD ขอให้เปลี่ยนวันได้
// เผื่อตอนรับเรื่องเลือกไปก่อนแล้วมาเจอของจริง · แต่วันนี้คือคำสัญญาที่ให้ฝ่ายขาย
// ไปแล้ว และเป็นตัวที่ใช้นับว่าเลยกำหนดหรือยัง ⇒ ผู้เรียกต้องลงเธรดว่าเลื่อนจาก
// วันไหนเป็นวันไหน ไม่งั้น "ไม่เคยเลยกำหนดสักใบ" จะกลายเป็นเรื่องจริงที่ไร้ความหมาย
//
// ⚠️ **ไม่ใช่ทางลัดของการรับเรื่อง** — ต้องมี `acknowledgedAt` ก่อน · และไม่ใช่
// ทางลัดของการ **แจ้ง** วันครั้งแรกด้วย: ใบที่ยังไม่มี `committedDueDate` ต้องผ่าน
// `commitDueRequestError` ซึ่งพูดคำว่า "แจ้งกำหนดส่ง" ตรงกับปุ่มและเธรด
export function rescheduleRequestError(request, { committedDueDate = null } = {}) {
  if (!request) return 'ไม่พบคำร้อง';
  if (!request.acknowledgedAt) return 'ยังไม่ได้รับเรื่อง — ยังไม่มีวันให้เลื่อน';
  if (!String(request.committedDueDate ?? '').trim()) {
    return 'ใบนี้ยังไม่ได้แจ้งกำหนดส่ง — ใช้ปุ่มแจ้งกำหนดส่งแทน';
  }
  /* ⚠️ **รอบแก้ไม่ใช่การเลื่อน** (มติผู้ใช้ 2026-08-25) — วันที่ถืออยู่เป็นของงานที่ส่ง
     ไปแล้ว ⇒ ปล่อยให้ทางนี้ผ่านเมื่อไร เธรดจะขึ้น "เลื่อนวันกำหนดส่ง 14/08 → 05/09"
     ทั้งที่ไม่มีใครเลื่อนอะไร — งานคนละชิ้นกัน · หนึ่งสถานะต้องมีปุ่มที่ถูกปุ่มเดียว */
  if (dueIsStale(request, request.items)) {
    return 'รอบแก้นี้ยังไม่ได้แจ้งวันส่ง — ใช้ปุ่มแจ้งกำหนดส่งแทน';
  }
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) {
    return request.status === 'cancelled' ? 'คำร้องนี้ถูกยกเลิกไปแล้ว' : 'คำร้องนี้ปิดไปแล้ว';
  }
  const next = String(committedDueDate ?? '').trim();
  // ⚠️ ว่างไม่ได้ — "เลื่อน" ที่แปลว่าลบวันทิ้งคือการถอนคำสัญญาโดยไม่มีใครเห็น
  // อยากถอนจริงต้องยกเลิกใบ ไม่ใช่ล้างช่องวัน
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return 'ต้องระบุวันกำหนดส่งใหม่';
  if (next === request.committedDueDate) return 'วันเดิมกับที่แจ้งไว้แล้ว';
  return null;
}

// ── ตีกลับ: ผู้รับเรื่องส่งคืนผู้ยื่นเพราะข้อมูลไม่ครบ (mig 0209) ─────────
//
// ⭐ **`pending → draft` ไม่ใช่สถานะใหม่** — ร่างคือสถานะที่ผู้ขอแก้แล้วส่งซ้ำได้
// อยู่แล้ว · trigger ทำให้ `docNo` แก้ไม่ได้ ⇒ **เลขที่ไม่เปลี่ยน** ซึ่งตรงกับที่
// ต้องการพอดี (คำร้องใบเดิม ไม่ใช่ใบใหม่) · และไม่ชนข้อห้ามของใบ cancelled
//
// ⚠️ **เฉพาะใบที่ยังไม่รับเรื่อง** — รับเรื่องแล้วแปลว่าฝ่ายรับงานไปแล้ว ของที่ขาด
// ตอนนั้นถามในเธรดได้ ไม่ต้องผลักใบกลับไปทั้งใบ (ผู้ขอจะเสียบริบทที่คุยกันไปแล้ว)
//
// คำศัพท์ที่ล็อกไว้: **ตีกลับ** = ผู้รับเรื่องส่งคืน · **ดึงกลับ** = ผู้ยื่นเอาคืนเอง
export function bounceRequestError(request, { reason } = {}) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status === 'draft') return 'คำร้องนี้ยังไม่ถูกส่ง — ไม่มีอะไรให้ตีกลับ';
  if (request.status !== 'pending') {
    return 'ตีกลับได้เฉพาะคำร้องที่ยังไม่รับเรื่อง — รับแล้วให้ถามในเธรดแทน';
  }
  const text = String(reason ?? '').trim();
  // ⚠️ บังคับเหตุผลเสมอ — ตีกลับโดยไม่บอกว่าขาดอะไร ผู้ขอจะส่งใบเดิมกลับมาอีกรอบ
  if (!text) return 'ต้องบอกว่าต้องแก้อะไร';
  if (text.length > 2000) return 'เหตุผลยาวเกิน 2000 ตัวอักษร';
  return null;
}

export function answerRequestError(request) {
  if (!request) return 'ไม่พบคำร้อง';
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) {
    return request.status === 'draft' ? 'คำร้องนี้ยังไม่ถูกส่ง' : 'คำร้องนี้ปิดไปแล้ว';
  }
  return null;
}

export function closeRequestError(request, items = []) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status === 'closed') return 'คำร้องนี้ปิดแล้ว';
  if (request.status === 'cancelled') return 'คำร้องนี้ถูกยกเลิกไปแล้ว';

  // 🐞 **ร่างที่ยังไม่ส่ง ปิดไม่ได้ — ทางเดียวไม่มีทางกลับ** (ผลตรวจรอบ 12 · ค-1)
  //
  // เดิมด่านนี้ไม่ได้กัน `draft` ⇒ ร่างที่ไม่มีแถวผ่านทั้งชุด กลายเป็น `closed` แล้ว
  // `deleteRequestError` ที่บังคับ `status === 'draft'` ปฏิเสธตลอดกาล ⇒ ร่างที่ไม่เคย
  // ส่งค้างในระบบถาวร ทางออกเหลือแค่ RPC `force_delete_dept_request` ของ service role
  //
  // ⚠️ ยิงได้ทาง API เท่านั้น ปุ่มบนจอไล่ ternary เจอ "ส่งคำร้อง" ก่อน — แต่ API คือ
  // ขอบเขต ไม่ใช่ปุ่ม · `cancel` บนร่างเปิดอยู่แล้วและเป็นทางที่ถูก (trigger ที่ DB
  // ทำให้ใบ cancelled เปลี่ยนสถานะไม่ได้อีก ⇒ จบจริงโดยไม่ต้องลบ)
  if (request.status === 'draft') {
    return 'ร่างที่ยังไม่ส่ง ปิดไม่ได้ — ลบร่างทิ้ง หรือยกเลิกใบแทน';
  }

  // ⭐ ถาม **ใบนี้มีแถวอยู่จริงไหม** ไม่ใช่ `requestHasItems(kind)`
  //
  // 🐞 ของจริงที่เดินวงแล้วเจอ: `requestHasItems` ตอบว่า "ชนิดนี้ให้ SA สร้างแถว
  // ตั้งแต่ตอนเปิดใบไหม" ซึ่งพัฒนากลิ่นตอบ **ไม่** (แถวเกิดตอน RD ส่งของ) ⇒ ด่านนี้
  // ถูกข้ามทั้งก้อน ⇒ ปิดใบพัฒนากลิ่นได้ตั้งแต่ RD ยังส่งกลิ่นไม่ครบ · กลิ่นที่ค้าง
  // ระหว่างทางหายไปเงียบ ๆ ไม่มีใครเห็นว่ายังมีของที่ลูกค้ายังไม่ตอบ
  //
  // ⚠️ ชนิดที่ไม่มีแถวเลยจริง ๆ (สอบถาม/ขอเอกสาร) ยังเหมือนเดิม — ผู้ขอเป็นคน
  // ตัดสินว่าพอแล้ว (แนวคิดเดิม: คนถามคือคนตัดสินว่าคำตอบใช้ได้จริง)
  const rows = items || [];
  if (rows.length && !requestProgress(rows).complete) {
    return 'ยังมีรายการที่ยังเดินไม่จบ — ตอบให้ครบหรือกด "ตอบไม่ได้" ก่อน';
  }
  if (!rows.length && request.status === 'pending') {
    return 'ยังไม่มีใครรับเรื่องเลย — ยกเลิกแทนการปิด';
  }

  /* 🐞 **ใบที่ฝ่ายยังไม่ส่งอะไรเลย ปิดได้** (ผลตรวจ 2026-08-17 — เดินฟังก์ชันจริง:
     `scent_dev` · `acknowledged` · 0 แถว ⇒ คืน null)
     ด่านข้างบนกันเฉพาะกรณี **มีแถวแล้วเดินไม่จบ** · หัวข้อที่ฝ่ายปลายทางเป็นคน
     สร้างแถวตอนกด "ส่งงาน" (`deliversRows`) จะมี 0 แถวตลอดช่วงที่ RD ยังไม่ส่ง
     ⇒ ผ่านทุกด่าน · ผู้ขอกดปิดได้ตั้งแต่วันที่ RD เพิ่งรับเรื่อง แล้วงานที่ค้างอยู่
     หายไปเงียบ ๆ — ซึ่งเป็นอาการเดียวกับที่คอมเมนต์ข้างบนบอกว่าแก้ไปแล้ว
     (รอบนั้นแก้ครึ่งเดียว: เปลี่ยนจากถามทะเบียนมาถามแถวจริง แต่ไม่ได้กันกรณี 0 แถว)

     ⚠️ **ยกเว้นใบที่ฝ่ายกด "ตอบแล้ว" เอง** — นั่นคือฝ่ายประกาศว่าจบงานของตัวแล้ว
     (เช่น ตอบในเธรดจนพอ ไม่มีของต้องส่ง) · ไม่ยกเว้นไว้ ใบพวกนั้นจะปิดไม่ลงตลอดกาล
     ซึ่งเป็นกับดักเดียวกับที่ทำให้ต้องมีด่าน `draft` ข้างบน
     ⚠️ ทางออกของใบที่ฝ่ายส่งอะไรไม่ได้จริง ๆ คือ **ยกเลิก** ไม่ใช่ปิด — คำเดียวกับ
     ด่าน `pending` ข้างบน */
  if (!rows.length && requestDeliversRows(request.kind) && request.status !== 'answered') {
    return `${requestSideText(request, 'dept', 'ยังไม่ได้ส่งงานสักรายการ')} — ยกเลิกแทนการปิด`;
  }

  /* ⭐ **ปิดได้เมื่อลูกค้าคอนเฟิร์มครบตามจำนวนที่สั่ง** (มติผู้ใช้ 2026-08-18)
     "เงื่อนไขพัฒนากลิ่นคือ ส่ง direction และลูกค้าคอนเฟิร์ม ครบ ตามจำนวน"

     ⚠️ **ทับมติเดิม "เตือน ไม่บล็อก" เฉพาะที่ปุ่มปิด** — การกระทบยอด SO ยังไม่บล็อก
     การส่งงานหรือการตอบ (เหตุผลเดิมยังจริง: บล็อกตอนส่ง คนจะเลี่ยงด้วยการไม่บันทึก
     จำนวน ซึ่งแย่กว่าตัวเลขไม่ตรง) · ที่บล็อกคือ **การประกาศว่าจบ** ซึ่งเป็นคนละเรื่อง
     🐞 ก่อนหน้านี้: SO สั่ง 3 กลิ่น · RD ส่ง 1 · ลูกค้าคอนเฟิร์ม 1 ⇒ ทุกแถว settled
     ⇒ ปิดใบได้ ทั้งที่อีก 2 กลิ่นไม่มีใครทำ และไม่มีอะไรบนระบบบอกว่าค้าง

     ⚠️ นับ **เฉพาะแถวที่ลูกค้าคอนเฟิร์ม** (`soReconcile` ที่เดียวของระบบ — ตัวเลข
     เดียวกับที่การ์ดสรุปด้านขวาโชว์) ⇒ จอกับด่านพูดตรงกันเสมอ
     ⚠️ ใบที่ลูกค้าไม่เอาสักตัว **ปิดไม่ได้โดยตั้งใจ** — ทางออกคือยกเลิก (คำเดียวกับ
     ด่าน `pending`/0 แถว ข้างบน) ไม่งั้นใบที่ล้มทั้งใบจะถูกปิดแล้วนับเป็นงานที่สำเร็จ */
  const reconcile = soReconcile({ lines: request.salesOrderLines, items: rows });
  if (reconcile && (reconcile.state === 'pending' || reconcile.state === 'short')) {
    return `ลูกค้าคอนเฟิร์ม ${reconcile.confirmed} จาก ${reconcile.ordered} ในใบสั่งขาย`
      + ' — ส่งให้ครบก่อน หรือยกเลิกใบถ้าลูกค้าไม่เอาแล้ว';
  }
  return null;
}

export function cancelRequestError(request) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status === 'cancelled') return 'คำร้องนี้ถูกยกเลิกไปแล้ว';
  if (request.status === 'closed') return 'คำร้องที่ปิดแล้วยกเลิกไม่ได้';
  if (request.status === 'answered') return 'คำร้องนี้ตอบแล้ว — ปิดเรื่องแทนการยกเลิก';
  return null;
}

export function deleteRequestError(request) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status !== 'draft' || request.submittedAt) {
    return 'ลบได้เฉพาะร่างที่ยังไม่ส่ง — คำร้องที่ส่งแล้วเป็นหลักฐาน';
  }
  return null;
}
