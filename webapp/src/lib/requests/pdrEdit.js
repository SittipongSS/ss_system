// ── ใครแก้ PDR ได้ ขึ้นกับว่าใบเดินไปถึงไหน (มติผู้ใช้ 2026-08-06) ───────
//
//   ร่าง · ส่งแล้วยังไม่รับเรื่อง   → ผู้ขอแก้ได้    · ฝ่ายปลายทางอ่านอย่างเดียว
//   ตีกลับ → กลับเป็นร่าง          → ผู้ขอแก้ได้อีก · ฝ่ายปลายทางอ่านอย่างเดียว
//   รับเรื่องแล้ว                  → ผู้ขออ่านอย่างเดียว · **ฝ่ายปลายทางแก้ได้**
//
// ⭐ **ผูกกับขั้นของใบตรง ๆ ไม่มีธงใหม่** — สลับเจ้าของสิทธิ์ที่จังหวะ "รับเรื่อง"
// เพราะนั่นคือจุดที่งานเปลี่ยนมือ · ตีกลับคืนใบเป็นร่าง สิทธิ์จึงกลับไปเองโดยไม่ต้อง
// มีกฎแยก
//
// ⚠️ ปิดเรื่อง/ยกเลิกแล้วแก้ไม่ได้ทั้งคู่ — ใบที่จบแล้วเป็นบันทึก ไม่ใช่ของที่ยังแก้ได้
import { canAnswerRequest, canManageRequest } from '@/lib/requests/access';
import { requestHasPdr } from '@/lib/master/requestTypes';

// ขั้นที่ผู้ขอยังถือสิทธิ์แก้อยู่
const REQUESTER_STAGES = ['draft', 'pending'];
// ขั้นที่สิทธิ์ย้ายไปฝ่ายปลายทางแล้ว
const DEPT_STAGES = ['acknowledged', 'answered'];

export function pdrEditor(request) {
  if (!request || !requestHasPdr(request.kind)) return null;
  if (REQUESTER_STAGES.includes(request.status)) return 'requester';
  if (DEPT_STAGES.includes(request.status)) return 'dept';
  return null;
}

export function canEditPdr(user, request) {
  const side = pdrEditor(request);
  if (!side) return false;
  return side === 'requester'
    ? canManageRequest(user, request)
    : canAnswerRequest(user, request);
}

/**
 * แก้ได้ไหม — คืนข้อความไทย หรือ null ถ้าผ่าน
 *
 * ⚠️ **บอกว่าตอนนี้เป็นของใคร ไม่ใช่แค่ "แก้ไม่ได้"** — คนที่กดแล้วโดนปฏิเสธต้องรู้ว่า
 * ต้องไปบอกใครให้แก้ให้ (บทเรียนเดียวกับ requestFormBlocker)
 */
export function editPdrError(request, user) {
  if (!request) return 'ไม่พบคำร้อง';
  if (!requestHasPdr(request.kind)) return 'คำร้องหัวข้อนี้ไม่มีแบบฟอร์ม PDR';
  const side = pdrEditor(request);
  if (!side) return 'คำร้องปิดแล้ว — แก้แบบฟอร์มไม่ได้';
  if (canEditPdr(user, request)) return null;
  return side === 'requester'
    ? 'ช่วงนี้แก้ได้เฉพาะผู้เปิดคำร้อง'
    : `รับเรื่องแล้ว — ช่วงนี้แก้ได้เฉพาะฝ่าย ${request.dept}`;
}
