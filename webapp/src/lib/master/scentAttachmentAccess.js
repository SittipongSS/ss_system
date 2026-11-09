// ── ไฟล์แนบของกลิ่น (IFRA) — ศูนย์กลางเอกสารของสินค้า P3 · มติเจ้าของ 09/11/2026 ──────────────────────────────────
//
// ⭐ มติ: IFRA = ระดับ **กลิ่น** · RD ออก · เก็บที่กลิ่น — หน้า FG แสดงผ่านกลิ่นของมัน (ชุดของขวัญเห็นครบทุกกลิ่น)
//    (docs/product-doc-hub.md)
// ⚠️ **เพิ่ม entity แนบไฟล์ใหม่ ต้องต่อครบ 5 จุด** (เช็กลิสต์ของ lib/sales/salesAttachmentAccess.js):
//   1 GET  /api/attachments        → `loadParent` อ่านตาราง `SCENT_ATTACHMENT_TABLE` + `canViewAttachmentParent` สาขากลิ่น
//   2 POST /api/attachments        → `canEditAttachmentParent` สาขากลิ่น
//   3 DELETE/PATCH /api/attachments/[id] → `guardAttachmentWrite` สาขากลิ่น (แม่หาย = ด่านเก็บกวาด)
//   4 lib/drive `resolveFolderSegments` สาขา 'scent' (ลูกค้า / กลิ่น / <ชื่อกลิ่น (รหัส)>) + `FOLDER_ENTITY_TYPES`
//   5 lib/master/attachments `PARENT_TABLE.scent` (proxy เปิดไฟล์ /file) — ขาดแล้ว "แนบได้แต่เปิดดูไม่ได้สักไฟล์"
//   + ลบกลิ่น = กวาดไฟล์แนบตาม (DELETE /api/master/scents/[id] · `purgeAttachments`)
import { isRdRole } from '@/lib/permissions';
import { canViewScents } from '@/lib/master/scents';

export const SCENT_ATTACHMENT_TABLE = Object.freeze({ scent: 'scents' });
export const isScentAttachment = (entityType) => !!SCENT_ATTACHMENT_TABLE[entityType];

/** อ่านไฟล์ของกลิ่น = เห็นทะเบียนกลิ่นได้ (ด่านเดียวกับหน้ากลิ่น/GET /api/master/scents) */
export function canViewScentAttachment(user) {
  return canViewScents(user);
}

/**
 * แนบ/ลบ/แก้ไฟล์ของกลิ่น = **RD ทุกตำแหน่ง + role admin** (IFRA "RD ออก")
 * ⚠️ ไม่ใช่ `isScentRegistrar` — ตัวนั้นรวม `isSuperuser` (หัวหน้าฝ่ายขาย) · ไม่ใช่ `canEditScent` (ฝ่ายขายแก้ร่างที่ตัวเองเปิดได้)
 *    ⇒ ฝ่ายขายเปิดดู/ส่งลูกค้าได้ แต่แนบ IFRA ไม่ได้ — กติกาเดียวกับ MSDS/Spec Sheet ของ RD บนสินค้า (`canAttachRdProductDoc`)
 */
export function canAttachToScent(user) {
  return isRdRole(user?.role) || user?.role === 'admin';
}
