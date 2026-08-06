// ── ประตูหัวหน้าฝ่ายขาย (AE Sup) — ด่านล้วน ไม่แตะ DB (mig 0216) ────────
//
// ⭐ สายพัฒนากลิ่นตามที่ผู้ใช้ระบุ (2026-08-06):
//     AE/AC เปิด → ส่ง → RD รับเรื่อง → **AE Sup ยืนยัน** → RD ลงมือ
//
// ⚠️ ประตูอยู่ **หลัง** RD รับเรื่อง ไม่ใช่ก่อนส่ง — หัวหน้าต้องเห็นวันกำหนดส่งจริงของ
// RD ก่อนตัดสิน · ยืนยันก่อนรับเรื่องคือยืนยันบนข้อมูลที่ยังไม่มี
//
// ⚠️ **ไม่มีค่าสถานะใหม่** — ขั้นนี้ derive จาก `acknowledgedAt` มีแล้วแต่ `approvedAt`
// ยังว่าง ⇒ ไม่มีสถานะที่ต้องดูแลเพิ่ม และไม่ชน trigger `guard_dept_request`
import { isSuperuser } from '@/lib/permissions';
import { requestNeedsApprovalKind } from '@/lib/master/requestTypes';

// ใบนี้ต้องผ่านหัวหน้าไหม — ธงอยู่บนหัวข้อ ไม่ใช่กฎที่ยัดลงทุกใบ
// (สอบถามข้อมูล/ขอเอกสารไม่ต้องผ่านหัวหน้า)
export function requestNeedsApproval(request) {
  return !!request && requestNeedsApprovalKind(request.kind);
}

// กำลังรอหัวหน้ายืนยันอยู่ไหม
export function isAwaitingApproval(request) {
  if (!requestNeedsApproval(request)) return false;
  return !!request.acknowledgedAt && !request.approvedAt;
}

// ใครยืนยันได้ — หัวหน้าสายงานขาย + admin break-glass
//
// ⚠️ **ไม่ใช่ผู้เปิดใบเอง** แม้เขาจะเป็นหัวหน้า — ประตูนี้มีไว้ให้คนที่สองมองก่อน RD
// ลงแรง · เซ็นรับรองงานตัวเองแล้วประตูไม่ได้กันอะไรเลย
export function canApproveRequest(user, request) {
  if (!request || !user?.id) return false;
  // ⚠️ **ด่านห้ามเซ็นรับรองงานตัวเองต้องมาก่อนเช็ค role** — `isSuperuser` รวม
  // `ae_supervisor` ไว้ด้วย ⇒ วางทีหลังแล้วกฎนี้ถูกกลืนสำหรับตำแหน่งที่ประตูนี้มีไว้
  // เพื่อพอดี (เทสต์จับได้ตอนเขียน)
  //
  // ⭐ ยกเว้น `admin` แบบเจาะจง ไม่ใช่ `isSuperuser` — บริษัทเล็กมีเคสที่หัวหน้าเป็น
  // คนเปิดใบเอง แล้วไม่มีใครยืนยันให้ ⇒ ต้องมีทางออก แต่ทางออกนั้นควรเป็น admin
  // ที่รู้ตัวว่ากำลัง break glass ไม่ใช่หัวหน้ากดผ่านใบตัวเองได้เป็นปกติ
  if (user.id === request.requestedById) return user.role === 'admin';
  return isSuperuser(user.role);
}

// ยืนยันได้ไหม — คืนข้อความไทย หรือ null ถ้าผ่าน
export function approveRequestError(request, user) {
  if (!request) return 'ไม่พบคำร้อง';
  if (!requestNeedsApproval(request)) return 'คำร้องหัวข้อนี้ไม่ต้องผ่านการยืนยัน';
  if (!request.acknowledgedAt) return 'ฝ่ายปลายทางยังไม่รับเรื่อง — ยืนยันก่อนไม่ได้';
  if (request.approvedAt) return 'ยืนยันไปแล้ว';
  if (!canApproveRequest(user, request)) {
    return user?.id === request.requestedById
      ? 'ผู้เปิดคำร้องยืนยันใบของตัวเองไม่ได้ — ต้องให้หัวหน้าอีกคนหรือผู้ดูแลระบบยืนยัน'
      : 'ต้องเป็นหัวหน้าสายงานขายจึงจะยืนยันได้';
  }
  return null;
}

/**
 * RD ส่งของได้หรือยัง — คืนข้อความไทย หรือ null ถ้าผ่าน
 *
 * ⚠️ **บอกว่ารอใคร ไม่ใช่แค่ "ยังทำไม่ได้"** — ปุ่มจางที่ไม่บอกเหตุผลคือสิ่งที่ทำให้
 * คนคิดว่าระบบพัง (บทเรียนเดียวกับ requestFormBlocker)
 */
export function deliveryApprovalError(request) {
  if (!isAwaitingApproval(request)) return null;
  return 'รอหัวหน้าสายงานขายยืนยันก่อน จึงจะส่งของได้';
}
