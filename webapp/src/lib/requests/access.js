// ── สิทธิ์ต่อคำร้องหนึ่งใบ ─────────────────────────────────────────────────
// ⭐ **R-1 ปิดแล้ว** — ด่าน "เห็นเมนูคำร้องไหม" คือ `canViewRequests` ไม่ใช่
// `canViewCosting` อีกต่อไป (ดู lib/permissions.js) · ไฟล์นี้คุม "ใบนี้ใครแตะได้"
import { canAnswerRequestsFor, isReadOnlyObserver, isSuperuser, userTeams } from '@/lib/permissions';

// ตอบ/รับเรื่อง = ฝ่ายเจ้าของคำร้อง + admin break-glass
//
// ⚠️ เดิมวิ่งผ่าน `canQuoteMaterial` ซึ่งบังคับว่าผู้ตอบต้องอยู่ฝ่าย **แหล่งราคา**
// (RD/PC) ⇒ ฝ่ายที่รับคำร้องแต่ไม่ได้ตอบราคา (บัญชี) เข้าไม่ได้เลยโดยโครงสร้าง
export function canAnswerRequest(user, request) {
  if (!request) return false;
  return canAnswerRequestsFor(user, request.dept);
}

// ── ทีมเดียวกัน = ใบเดียวกัน (มติผู้ใช้ 2026-08-11) ───────────────────────
//
// ⭐ **เพื่อนร่วมทีมทำแทนกันได้ทุกอย่าง** ไม่ใช่แค่มองเห็น — ส่ง แก้ร่าง ยกเลิก ปิด
// เหตุผลของผู้ใช้: *"มีชื่อคนหรืออัปเดตเธรดอยู่แล้ว"* ⇒ ใครทำอะไรตามกลับได้จาก
// เธรดและ audit log อยู่แล้ว การล็อกไว้ที่คนเปิดจึงได้แต่ทำให้คนลาแล้วงานค้าง
//
// 🐞 อาการที่ผู้ใช้แจ้ง: คิวรายการมีขอบเขต "ทีม" ให้เลือกอยู่แล้ว (scope.js) ⇒ เห็น
// แถวของเพื่อนร่วมทีม แต่กดเปิดใบไม่ได้ เพราะด่านรายแถวเป็นคนละชุด ⇒ 403 กลางทาง
//
// ⚠️ **เทียบทีมสองฝั่งต้องไม่ว่างทั้งคู่** — ใบที่ไม่มีทีม (แอดมิน/ฝ่ายอื่นเปิด) กับ
// ผู้ใช้ที่ไม่มีทีม (RD/PC) จะ "ตรงกัน" ทันทีถ้าปล่อยให้ null เทียบ null ผ่าน
// ⚠️ ใช้ `userTeams` ไม่ใช่ `user.team` — คนอยู่หลายทีมได้ (#1122) และคิวทีมก็กรอง
// ด้วยชุดเดียวกันนี้ (`scopeFilter`) ⇒ เห็นในคิวแล้วต้องเปิดได้เสมอ
function sharesRequestTeam(user, request) {
  const rowTeam = String(request?.team || '').trim();
  if (!rowTeam) return false;
  return userTeams(user).includes(rowTeam);
}

// จัดการคำร้อง (ส่ง/แก้ร่าง/ยกเลิก/ปิด) = ผู้ขอเอง + เพื่อนร่วมทีม + admin
export function canManageRequest(user, request) {
  if (!request) return false;
  if (isSuperuser(user?.role)) return true;
  if (!user?.id) return false;
  return request.requestedById === user.id || sharesRequestTeam(user, request);
}

// เห็นคำร้องนี้ไหม = ผู้ขอ หรือ ฝ่ายที่ต้องตอบ (ตรงกับ scope ของ GET /api/sa/requests)
// ใช้ตอนอ้างคำร้องจากที่อื่น เช่นปุ่ม "สร้างงานจากคำร้อง" ในระบบงานของฉัน
export function canViewRequest(user, request) {
  return canManageRequest(user, request) || canAnswerRequest(user, request);
}

// อ่านคำร้อง "ใบนี้" ได้ไหม — ผูกกับแถว ไม่ใช่แค่ถือ cap
//
// 🐞 รูที่เปิดอยู่ก่อนหน้านี้: `GET /api/sa/requests` (รายการ) กรองแถวให้เห็นเฉพาะ
// ของตัวเอง + คิวของฝ่ายตน แต่ `GET /api/sa/requests/[id]` กั้นด้วย `canViewCosting`
// ล้วน ซึ่ง **ไม่ดูแถวเลย** ⇒ รายการซ่อนใบของคนอื่น แต่เปิดตรงด้วย id อ่านได้หมด
// พร้อมบรรทัดและสเปกข้างใน · id ไม่ใช่ของเดายาก — มันหลุดออกไปทางลิงก์ในแจ้งเตือน
// การ์ดแชท และ /go/DR-… เป็นปกติอยู่แล้ว
//
// ⚠️ เป็นด่าน **เพิ่ม** ไม่ใช่ด่านแทน — ยังต้องผ่าน canViewCosting ชั้นนอกก่อนเสมอ
export function canReadRequestRow(user, request) {
  if (canViewRequest(user, request)) return true;
  // ผู้สังเกตการณ์ทั้งระบบอ่านได้ทุกใบตามเจตนาของ role — ข้อยกเว้นนี้มีไว้ไม่ให้ใคร
  // เสียสิทธิ์ที่เคยมี ไม่ได้เปิดให้ใครใหม่ (viewer ไม่มี costing:view จึงไม่เคยผ่าน
  // ด่านชั้นนอกอยู่แล้ว · ที่ได้ประโยชน์จริงคือ executive)
  return isReadOnlyObserver(user?.role);
}
