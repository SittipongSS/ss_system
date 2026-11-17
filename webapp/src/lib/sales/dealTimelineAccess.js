// ── ด่านของไทม์ไลน์ดีล (สร้าง/ลบชุด · ออก/ย้อน Rev.) — ตัวกลางตัวเดียว (งวด P2b ยุบดีล/โครงการ) ────────
// ตัดสินด้วยดีลอย่างเดียว: แก้ระบบขายได้ + มีสิทธิ์แก้งาน PM + อยู่ในขอบเขตแก้ของดีลนั้น
// (ตัวเดิมของ POST/DELETE /deals/[id]/timeline ยกมาไว้ที่นี่ให้ route Rev. ใช้ตัวเดียวกัน)
// ⚠️ route เรียกชื่อ can* ตรง ๆ เสมอ — ด่าน systemRules กฎ 1 มองหา can*/require* ในไฟล์ route
import { can } from '@/lib/permissions';
import { canEditSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';

export function canEditDealTimeline(user, deal) {
  return !!user && !!deal && canEditSalesPlanning(user) && can(user.role, 'pm:edit') && inSalesEditScope(user, deal);
}
