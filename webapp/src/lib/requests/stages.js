// ── เครื่องสถานะของคำร้อง — ด่านของแต่ละ action ───────────────────────────
// คืนข้อความไทย หรือ null ถ้าผ่าน · **API และหน้าจอเรียกตัวเดียวกัน** ปุ่มกับ server
// จึงขัดกันไม่ได้ (กฎที่ request-hub-rebuild-plan บันทึกไว้ว่าเคยพลาด: เงื่อนไขที่
// ปุ่มรู้แต่ฟอร์มไม่รู้ = ปุ่มจางเงียบโดยไม่บอกเหตุผล)
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { requestHasItems } from '@/lib/master/requestTypes';

// ── ความคืบหน้า + สถานะที่ derive ────────────────────────────────────────
// ตัวนับคำนวณตอนอ่านเสมอ ห้ามเก็บคอลัมน์ (กัน drift — แพตเทิร์นเดียวกับใบขอราคาผลิต)
// "settled" = บรรทัดนั้นจบแล้ว ไม่ว่าจะจบแบบได้ของ (done) หรือจบแบบไม่ได้ (declined)
// ⚠️ อ่าน `answerStatus` (mig 0204) ไม่ใช่ `priceStatus` — ชื่อเดิมพูดภาษาราคาล้วน
//    ซึ่งใช้กับบรรทัดขอเอกสาร/พัฒนากลิ่นไม่ได้
export function requestProgress(items = []) {
  const total = items.length;
  const done = items.filter((i) => i.answerStatus === 'done' || i.answerStatus === 'declined').length;
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

export function acknowledgeRequestError(request) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status === 'draft') return 'คำร้องนี้ยังไม่ถูกส่ง';
  if (request.status !== 'pending') return 'คำร้องนี้รับเรื่องไปแล้ว';
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
  // ชนิดที่มีบรรทัดต้องตอบครบก่อน — ชนิดที่ไม่มีบรรทัด ผู้ขอเป็นคนตัดสินว่าพอแล้ว
  // (แนวคิดเดียวกับระบบสอบถามเดิม: คนถามคือคนตัดสินว่าคำตอบใช้ได้จริง)
  if (requestHasItems(request.kind) && !requestProgress(items).complete) {
    return 'ยังมีรายการที่ยังไม่ได้ตอบ — ตอบให้ครบหรือกด "ตอบไม่ได้" ก่อน';
  }
  if (!requestHasItems(request.kind) && request.status === 'pending') {
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
