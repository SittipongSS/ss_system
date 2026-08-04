// ── สิทธิ์ต่อคำร้องหนึ่งใบ ─────────────────────────────────────────────────
// ⚠️ ด่าน "เห็นเมนูคำร้องไหม" ยังผูกกับ canViewCosting อยู่ที่ route (R-1 ของ
// docs/request-hub-rebuild-plan.md จะแยกออก) — ไฟล์นี้คุมแค่ "ใบนี้ใครแตะได้"
import { isSuperuser } from '@/lib/permissions';
import { canQuoteMaterial } from '@/lib/materialPrices';

// ตอบ/รับเรื่อง = ฝ่ายเจ้าของคำร้อง (RD หรือ PC) + admin break-glass
export function canAnswerRequest(user, request) {
  if (!request) return false;
  return canQuoteMaterial(user, request.dept);
}

// จัดการคำร้อง (ส่ง/แก้ร่าง/ยกเลิก/ปิด) = ผู้ขอเอง + admin
// (หัวหน้าทีมไม่ได้ถูกดึงเข้ามาโดยตั้งใจ — คำร้องเป็นงานปฏิบัติของคนเปิดเอง)
export function canManageRequest(user, request) {
  if (!request) return false;
  if (isSuperuser(user?.role)) return true;
  return !!user?.id && request.requestedById === user.id;
}

// เห็นคำร้องนี้ไหม = ผู้ขอ หรือ ฝ่ายที่ต้องตอบ (ตรงกับ scope ของ GET /api/sa/requests)
// ใช้ตอนอ้างคำร้องจากที่อื่น เช่นปุ่ม "สร้างงานจากคำร้อง" ในระบบงานของฉัน
export function canViewRequest(user, request) {
  return canManageRequest(user, request) || canAnswerRequest(user, request);
}
