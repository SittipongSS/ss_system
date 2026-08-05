// ── สิทธิ์ไฟล์แนบของดีล (P5c) ─────────────────────────────────────────────
//
// ไฟล์แนบเป็นตาราง polymorphic ตัวเดียว (mig 0028) และปกติสิทธิ์ "อิงของแม่" ผ่าน
// canViewRecord/canEditRecord ที่คิดจากทีมเจ้าของ customer/product — แต่ดีลคุมด้วย
// **ขอบเขตของสายงานขาย** (ทีม/เจ้าของดีล) ซึ่งเป็นคนละกฎ จึงต้องมีเส้นทางของตัวเอง
// เหมือนที่ระบบขอราคาและ mgmt มี
//
// ⚠️ **เพิ่ม entity แนบไฟล์ใหม่ ต้องต่อครบ 5 จุด** (เช็กลิสต์เดียวกับที่
// lib/master/costingAttachmentAccess.js เขียนไว้) — ขาดจุดไหนก็หลุดเงียบจุดนั้น:
//   1 GET  /api/attachments        → loadParent คืน null → ตอบ [] เสมอ (ไฟล์ไม่ขึ้น)
//   2 POST /api/attachments        → 404 "ไม่พบระเบียนที่จะแนบเอกสาร"
//   3 DELETE /api/attachments/[id] → บล็อกสิทธิ์อยู่ใน `if (table)` → ข้ามทั้งก้อน
//                                    = **ใครก็ลบไฟล์แนบได้**
//   4 lib/drive resolveFolderForEntity → อัปโหลดพัง 500 ทั้งปุ่ม (โหมด Drive)
//   5 attachments PARENT_TABLE + สาขาใน .../attachments/[id]/file → proxy ตอบ 403
//     = รูปพรีวิวไม่ขึ้น ทั้งที่ไฟล์อัปขึ้นไปแล้วจริง
import { canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';

export const DEAL_ATTACHMENT_TABLE = { deal: 'sales_deals' };

export const isDealAttachment = (entityType) => !!DEAL_ATTACHMENT_TABLE[entityType];

// อ่านไฟล์แนบของดีล = เห็นดีลใบนั้นได้
export function canViewDealAttachment(deal, user) {
  if (!canViewSalesPlanning(user)) return false;
  return !!deal && inSalesViewScope(user, deal);
}

// แนบ/ลบ = แก้ดีลใบนั้นได้ — **ไม่ใช่แค่เห็น** · คนที่เห็นดีลของทีมอื่นได้ (หัวหน้า
// สาย/ผู้บริหาร) ต้องอ่านได้แต่ไม่ควรไปเพิ่มหรือลบเอกสารในดีลที่ไม่ใช่ของตัวเอง
export function canAttachToDeal(deal, user) {
  if (!canViewSalesPlanning(user)) return false;
  return !!deal && inSalesEditScope(user, deal);
}
