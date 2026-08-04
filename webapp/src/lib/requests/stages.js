// ── เครื่องสถานะของคำร้อง — ด่านของแต่ละ action ───────────────────────────
// คืนข้อความไทย หรือ null ถ้าผ่าน · **API และหน้าจอเรียกตัวเดียวกัน** ปุ่มกับ server
// จึงขัดกันไม่ได้ (กฎที่ request-hub-rebuild-plan บันทึกไว้ว่าเคยพลาด: เงื่อนไขที่
// ปุ่มรู้แต่ฟอร์มไม่รู้ = ปุ่มจางเงียบโดยไม่บอกเหตุผล)
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { requestHasItems } from '@/lib/master/requestTypes';

// ── ความคืบหน้า + สถานะที่ derive ────────────────────────────────────────
// ตัวนับคำนวณตอนอ่านเสมอ ห้ามเก็บคอลัมน์ (กัน drift — แพตเทิร์นเดียวกับใบขอราคาผลิต)
export function requestProgress(items = []) {
  const total = items.length;
  const done = items.filter((i) => i.priceStatus === 'quoted' || i.priceStatus === 'no_quote').length;
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
