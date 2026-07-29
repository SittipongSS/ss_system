// ── สิทธิ์ไฟล์แนบของระบบขอราคา (ใบขอราคาผลิต / เคสขอราคาวัสดุ) ──────────
//
// ไฟล์แนบเป็นตาราง polymorphic ตัวเดียว (mig 0028) และปกติสิทธิ์จะ "อิงของแม่"
// ผ่าน canViewRecord/canEditRecord ที่คิดจากทีมเจ้าของ customer/product — แต่
// ระบบขอราคาไม่ได้คุมด้วยทีม มันคุมด้วย cap ของระบบ (canViewCosting) + ฝ่ายเจ้าของ
// จึงต้องมีเส้นทางของตัวเอง เหมือนที่โมดูล mgmt/personal_task มี
//
// ⚠️ **เพิ่ม entity แนบไฟล์ใหม่ ต้องต่อครบ 5 จุด** — ขาดจุดไหนก็หลุดเงียบจุดนั้น:
//   1 GET  /api/attachments             → loadParent คืน null → ตอบ [] เสมอ (ไฟล์ไม่ขึ้น)
//   2 POST /api/attachments             → 404 "ไม่พบระเบียนที่จะแนบเอกสาร"
//   3 DELETE /api/attachments/[id]      → บล็อกสิทธิ์อยู่ใน `if (table)` → ข้ามทั้งก้อน
//                                         = ใครก็ลบไฟล์แนบได้
//   4 lib/drive resolveFolderForEntity  → อัปโหลดพัง 500 ทั้งปุ่ม (โหมด Drive)
//   5 attachments PARENT_TABLE + สาขา   → proxy /file ตอบ 403 = รูปพรีวิวไม่ขึ้น
//     ใน .../attachments/[id]/file         ทั้งที่ไฟล์อัปขึ้นไปแล้วจริง
// costing_item (PR5) โดนข้อ 1–3 มาตั้งแต่ต้น · ทั้งคู่โดนข้อ 4–5 จนถึง 2026-07-26
import { canUser, canViewCosting } from '@/lib/permissions';
import { canAnswerRequest, canManageRequest } from '@/lib/deptRequests';

export const COSTING_ATTACHMENT_TABLE = {
  costing_item: 'costing_request_items',
  dept_request_item: 'dept_request_items',
};

export const isCostingAttachment = (entityType) => !!COSTING_ATTACHMENT_TABLE[entityType];

// ดูไฟล์แนบ = เห็นระบบขอราคา (ต้นทุนเป็นข้อมูลลับ แต่ในระบบเห็นกันทั้งวง)
export function canViewCostingAttachment(user) {
  return canViewCosting(user);
}

// แนบ/ลบไฟล์:
//   ใบขอราคาผลิต — คนที่แก้ใบได้ (costing:edit); ด่านรายใบอยู่ใน route ของใบเอง
//   เคสขอราคาวัสดุ — ผู้เปิดเคส หรือฝ่ายที่ต้องตอบ และเฉพาะตอนเคสยังเดินอยู่
//                    (ปิด/ยกเลิกแล้วถือเป็นหลักฐาน ไม่ให้แก้ของแนบย้อนหลัง)
export async function canAttachToCosting(supabase, entityType, parent, user) {
  if (!canViewCosting(user)) return false;
  if (entityType === 'costing_item') return canUser(user, 'costing:edit');
  if (entityType !== 'dept_request_item' || !parent?.askId) return false;
  const { data: ask, error: askError } = await supabase
    .from('dept_requests').select('*').eq('id', parent.askId).maybeSingle();
  if (askError) throw askError;
  if (!ask) return false;
  if (['closed', 'cancelled'].includes(ask.status)) return false;
  return canManageRequest(user, ask) || canAnswerRequest(user, ask);
}
