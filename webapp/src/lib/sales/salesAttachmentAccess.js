// ── สิทธิ์ไฟล์แนบของสายงานขาย (ดีล · โครงการ) ────────────────────────────
//
// ไฟล์แนบเป็นตาราง polymorphic ตัวเดียว (mig 0028) และปกติสิทธิ์ "อิงของแม่" ผ่าน
// canViewRecord/canEditRecord ที่คิดจากทีมเจ้าของ customer/product — แต่ดีลกับ
// โครงการคุมด้วย **ขอบเขตของสายงานขาย** (ทีม/เจ้าของ) ซึ่งเป็นคนละกฎ จึงต้องมี
// เส้นทางของตัวเอง เหมือนที่ระบบขอราคาและ mgmt มี
//
// ⭐ ดีลกับโครงการใช้กฎเดียวกันได้จริง — ทั้งสองตารางมี `team` กับ `ownerId` ที่
// `inScope()` ต้องการ (ตรวจกับ prod 2026-08-14) จึงเป็นโมดูลเดียว ไม่ใช่สองชุด
// ที่จะเพี้ยนหากันภายหลัง (เดิมไฟล์นี้ชื่อ dealAttachmentAccess — เปลี่ยนชื่อตอน
// เปิดให้โครงการแนบเอกสารร่วมได้ เพราะชื่อเดิมจะโกหกทันที)
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

// ⚠️ ทุกตารางที่ลงทะเบียนที่นี่ต้องมี `team` + `ownerId` (สิ่งที่ `inScope()` อ่าน) —
// สัญญา (mig 0278) จึงคัด `team` มาจากดีลตอนสร้าง ไม่ได้ join สดตอนตรวจสิทธิ์
export const SALES_ATTACHMENT_TABLE = { deal: 'sales_deals', project: 'projects', contract: 'sales_contracts' };

export const isSalesAttachment = (entityType) => !!SALES_ATTACHMENT_TABLE[entityType];

// อ่านไฟล์แนบ = เห็นดีล/โครงการใบนั้นได้
export function canViewSalesAttachment(record, user) {
  if (!canViewSalesPlanning(user)) return false;
  return !!record && inSalesViewScope(user, record);
}

// แนบ/ลบ = แก้ใบนั้นได้ — **ไม่ใช่แค่เห็น** · คนที่เห็นดีลของทีมอื่นได้ (หัวหน้า
// สาย/ผู้บริหาร) ต้องอ่านได้แต่ไม่ควรไปเพิ่มหรือลบเอกสารในใบที่ไม่ใช่ของตัวเอง
export function canAttachToSalesEntity(record, user) {
  if (!canViewSalesPlanning(user)) return false;
  return !!record && inSalesEditScope(user, record);
}
