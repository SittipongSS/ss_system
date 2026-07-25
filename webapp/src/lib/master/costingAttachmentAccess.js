// ── สิทธิ์ไฟล์แนบของระบบขอราคา (ใบขอราคาผลิต / เคสขอราคาวัสดุ) ──────────
//
// ไฟล์แนบเป็นตาราง polymorphic ตัวเดียว (mig 0028) และปกติสิทธิ์จะ "อิงของแม่"
// ผ่าน canViewRecord/canEditRecord ที่คิดจากทีมเจ้าของ customer/product — แต่
// ระบบขอราคาไม่ได้คุมด้วยทีม มันคุมด้วย cap ของระบบ (canViewCosting) + ฝ่ายเจ้าของ
// จึงต้องมีเส้นทางของตัวเอง เหมือนที่โมดูล mgmt/personal_task มี
//
// ⚠️ ที่ต้องมีไฟล์นี้: entity ที่ไม่อยู่ใน PARENT_TABLE จะ "หลุดทั้งก้อน" ในสอง route
//   · GET  /api/attachments        → loadParent คืน null → ตอบ [] เสมอ (ไฟล์ไม่ขึ้น)
//   · POST /api/attachments        → 404 "ไม่พบระเบียนที่จะแนบเอกสาร"
//   · DELETE /api/attachments/[id] → บล็อกสิทธิ์อยู่ใน `if (table)` → ข้ามทั้งก้อน
//                                    = ใครก็ลบไฟล์แนบได้
// costing_item (PR5) โดนข้อ 1–3 มาตั้งแต่ต้น จึงต่อท่อพร้อมกันที่นี่
import { canUser, canViewCosting } from '@/lib/permissions';
import { canAnswerAsk, canManageAsk } from '@/lib/materialAsks';

export const COSTING_ATTACHMENT_TABLE = {
  costing_item: 'costing_request_items',
  material_ask_item: 'material_price_ask_items',
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
  if (entityType !== 'material_ask_item' || !parent?.askId) return false;
  const { data: ask } = await supabase
    .from('material_price_asks').select('*').eq('id', parent.askId).maybeSingle();
  if (!ask) return false;
  if (['closed', 'cancelled'].includes(ask.status)) return false;
  return canManageAsk(user, ask) || canAnswerAsk(user, ask);
}
