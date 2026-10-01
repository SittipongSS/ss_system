// ── รูปหน้างานทีละรูป (แผน operation-crew C5 · S3) — logic ล้วน (ไม่แตะ DB) ─────────────────
//
// 🐞 ที่มา: ทางเดียวที่เขียนรูปคือ PATCH ของนัดที่ส่ง `attachments` **ทั้งชุด** — ช่างกับผู้ช่วยถ่ายรูปงานเดียวกัน
//    จากสองเครื่อง ⇒ คนที่บันทึกทีหลังเขียนชุดของตัวเองทับ รูปของอีกคนหายเงียบ · และ PATCH ลากทั้งท่อ
//    (เลื่อนนัด · ถอนเครื่อง · audit) ไปกับการแนบรูปหนึ่งรูป
// ⭐ เส้นใหม่ `POST|DELETE visits/[id]/photos` แก้ **ทีละรูป** บนชุดที่อ่านล่าสุด + ด่าน `updatedAt` (ลองใหม่ 1 รอบ)
//    ไฟล์นี้ตัดสินแค่ว่า "ชุดใหม่เป็นอะไร" และ "นัดนี้ยังแนบรูปได้ไหม" — route เป็นคนคุยกับฐาน
import { visitFileKey } from '../visitFiles';
import { isClosedVisit } from '../visitStatus';

/* ⚠️ ส่งงานแล้ว = ห้ามทุกตำแหน่ง ไม่ใช่เฉพาะช่าง — รูปของงานที่ส่งแล้วแก้ที่ "แก้ผลที่ส่ง" (แผ่นปิดงานเดิม
   ส่ง `attachments` ทั้งชุดผ่าน PATCH ของนัด) · สองทางแก้รูปของใบที่ปิดแล้ว = สองชุดกติกาที่เพี้ยนหากัน */
export const PHOTO_CLOSED_ERROR = 'ใบนี้ส่งงานแล้ว — แก้รูปของงานที่ส่งแล้วที่ "แก้ผลที่ส่ง"';
export const PHOTO_NOT_OPEN_ERROR = 'นัดนี้ไม่ได้อยู่บนตารางงาน (ร่าง · ยกเลิก · เลื่อนแล้ว) — แนบรูปไม่ได้';
export const PHOTO_RACE_ERROR = 'มีคนแก้รูปของงานนี้พร้อมกัน — โหลดหน้าใหม่แล้วลองอีกครั้ง';
export const PHOTO_MISSING_ERROR = 'ต้องแนบรูปก่อน';
export const PHOTO_KEY_ERROR = 'ไม่รู้ว่าจะลบรูปไหน — โหลดหน้าใหม่แล้วลองอีกครั้ง';

/** นัดนี้ยังแนบ/ลบรูปทีละรูปได้ไหม — คืนข้อความ (409) หรือ `null` · ได้เฉพาะงานที่ยังเปิด (นัดแล้ว · กำลังทำ) */
export function photoEditError(visit) {
  if (isClosedVisit(visit)) return PHOTO_CLOSED_ERROR;
  if (visit?.status !== 'scheduled' && visit?.status !== 'in_progress') return PHOTO_NOT_OPEN_ERROR;
  return null;
}

const listOf = (attachments) => (Array.isArray(attachments) ? attachments : []);

/**
 * ชุดรูปหลังเพิ่มรูปหนึ่งรูป — คืน `{ list, changed }`
 * ⭐ URL ที่มีอยู่แล้ว = ไม่เพิ่มซ้ำ (`changed: false`) — จอที่กดส่งซ้ำหลังคำตอบหาย ส่งรูปที่อัปขึ้น Drive แล้วมา
 *    ใหม่ด้วยค่าเดิม (ไม่อัปไบต์ซ้ำ) ⇒ ต้องได้ผลเดียวกับครั้งแรก ไม่ใช่รูปซ้อนสองรูป
 */
export function addVisitPhoto(attachments, photo) {
  const list = listOf(attachments);
  const key = visitFileKey(photo?.url);
  if (!key) return { list, changed: false };
  if (list.some((att) => visitFileKey(att?.url) === key)) return { list, changed: false };
  return { list: [...list, photo], changed: true };
}

/**
 * ชุดรูปหลังถอดรูปตามกุญแจ (`?h=` ตัวเดียวกับลิงก์เปิดรูป) — คืน `{ list, changed, removed }`
 * ⭐ ไม่มีรูปนั้นแล้ว = `changed: false` ไม่ใช่ error — ลบซ้ำ (คำตอบรอบแรกหาย) หรืออีกเครื่องลบไปก่อน
 *    ผลลัพธ์ที่ผู้ใช้ต้องการเกิดแล้ว · ⚠️ ถอดออกจากนัดเท่านั้น ไฟล์บน Drive ยังอยู่ (ล้าง Drive อยู่นอกงวดนี้)
 */
export function removeVisitPhoto(attachments, key) {
  const list = listOf(attachments);
  const removed = list.filter((att) => visitFileKey(att?.url) === key);
  if (!key || !removed.length) return { list, changed: false, removed: [] };
  return { list: list.filter((att) => visitFileKey(att?.url) !== key), changed: true, removed };
}
