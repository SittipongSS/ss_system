// ── เครื่องสถานะของคำร้อง — ด่านของแต่ละ action ───────────────────────────
// คืนข้อความไทย หรือ null ถ้าผ่าน · **API และหน้าจอเรียกตัวเดียวกัน** ปุ่มกับ server
// จึงขัดกันไม่ได้ (กฎที่ request-hub-rebuild-plan บันทึกไว้ว่าเคยพลาด: เงื่อนไขที่
// ปุ่มรู้แต่ฟอร์มไม่รู้ = ปุ่มจางเงียบโดยไม่บอกเหตุผล)
import { requestHasItems, requestRequiresCommittedDue } from '@/lib/master/requestTypes';
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { isRowSettled } from '@/lib/requests/rowStage';

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

// ── ด่านของแต่ละ action ──────────────────────────────────────────────────
export function submitRequestError(request, items = []) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status !== 'draft') return 'คำร้องนี้ส่งไปแล้ว';
  if (requestHasItems(request.kind) && !items.length) {
    return 'ต้องมีรายการอย่างน้อย 1 รายการก่อนส่ง';
  }
  return null;
}

export function acknowledgeRequestError(request, { committedDueDate = null } = {}) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status === 'draft') return 'คำร้องนี้ยังไม่ถูกส่ง';
  if (request.status !== 'pending') return 'คำร้องนี้รับเรื่องไปแล้ว';
  // ⭐ **บังคับวันกำหนดส่งเฉพาะหัวข้อที่ประกาศธง** (มติผู้ใช้ 2026-08-06) — รับเรื่อง
  // โดยไม่ผูกวันคือการรับปากว่า "จะทำ" โดยไม่บอกว่าเมื่อไร และเป็นวันที่ใช้นับว่า
  // เลยกำหนดหรือยัง ⇒ ไม่มีวัน = ไม่มีทางรู้ว่าใบไหนช้า
  // ⚠️ รายชนิด ไม่ใช่ทั้งระบบ — เคสขอราคาที่มีผู้ใช้จริงอยู่แล้วไม่เคยมีช่องนี้
  if (requestRequiresCommittedDue(request.kind) && !String(committedDueDate ?? '').trim()) {
    return 'ต้องระบุวันกำหนดส่งตอนรับเรื่อง';
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
// ⚠️ **ไม่ใช่ทางลัดของการรับเรื่อง** — ต้องมี `acknowledgedAt` ก่อน ไม่งั้นจะเป็น
// ทางอ้อมที่ผูกวันได้โดยไม่ผ่านด่านของ `acknowledgeRequestError`
export function rescheduleRequestError(request, { committedDueDate = null } = {}) {
  if (!request) return 'ไม่พบคำร้อง';
  if (!request.acknowledgedAt) return 'ยังไม่ได้รับเรื่อง — ยังไม่มีวันให้เลื่อน';
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) {
    return request.status === 'cancelled' ? 'คำร้องนี้ถูกยกเลิกไปแล้ว' : 'คำร้องนี้ปิดไปแล้ว';
  }
  const next = String(committedDueDate ?? '').trim();
  // ⚠️ ว่างไม่ได้ — "เลื่อน" ที่แปลว่าลบวันทิ้งคือการถอนคำสัญญาโดยไม่มีใครเห็น
  // อยากถอนจริงต้องยกเลิกใบ ไม่ใช่ล้างช่องวัน
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return 'ต้องระบุวันกำหนดส่งใหม่';
  if (next === request.committedDueDate) return 'วันเดิมกับที่รับปากไว้แล้ว';
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
