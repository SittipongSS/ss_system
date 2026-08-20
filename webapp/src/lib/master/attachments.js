// ── Master Data: attachments ──────────────────────────────────────────
// Shared-core access layer for the polymorphic attachments table (migration
// 0028). เอกสารแนบของ customer/product (เฟส A) อ่าน/เขียนผ่านโมดูลนี้.
//
// Server-only: ใช้ service-role admin client (bypass RLS). ห้าม import ใน client.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// เอกสารทั้งหมดของ entity หนึ่งๆ (ใหม่สุดก่อน).
export async function listAttachments(entityType, entityId) {
  if (!entityType || !entityId) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('entityType', entityType)
    .eq('entityId', entityId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return data || [];
}

// เอกสารแนบรายตัว (หรือ null).
export async function getAttachment(id) {
  if (!id) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// entity แม่ของไฟล์แนบ ↔ ตาราง + resource key (สำหรับ permission helpers).
// ใช้ร่วมกันทุก route ที่ต้องเช็กสิทธิ์ผ่าน entity แม่ — กัน map กระจาย/ไม่ตรงกัน.
//
// ⚠️ entity ที่ไม่มีในแมปนี้ = loadAttachmentParent คืน null = proxy ดาวน์โหลดไฟล์
// ตอบ 403 เสมอ (รูปพรีวิวไม่ขึ้น ดาวน์โหลดไม่ได้ ทั้งที่ไฟล์อยู่ครบ) — โมดูลที่ไม่ได้
// คุมสิทธิ์ด้วยทีมของ customer/product ต้องมีสาขาของตัวเองใน route ด้วย ไม่ใช่ใส่
// แค่ตารางแล้วปล่อยให้ตกไป canViewRecord
export const PARENT_TABLE = {
  customer: 'customers',
  product: 'products',
  order: 'orders',
  registration: 'excise_registrations',
  personal_task: 'personal_tasks',
  mgmt_task: 'mgmt_tasks',
  mgmt_meeting: 'mgmt_meetings',
  costing_item: 'costing_request_items',
  dept_request_item: 'dept_request_items',
  // 🐞 หัวคำร้อง (2026-08-03) เพิ่มที่แนบไฟล์ครบทุกจุดยกเว้นบรรทัดนี้ → อัปโหลดขึ้น
  // จริง รายการโชว์จริง แต่ proxy /file ตอบ 403 ทุกใบ (parent = null) = **แนบได้แต่
  // เปิดดูไม่ได้สักไฟล์** ซึ่งอ่านจากหน้าจอแล้วเหมือนไฟล์เสีย ไม่ใช่เหมือนสิทธิ์
  dept_request: 'dept_requests',
  // ดีล (P5c) — ⚠️ บรรทัดนี้คือจุดที่ 5 ของเช็กลิสต์ ขาดไปแล้วจะ "แนบได้แต่เปิดดู
  // ไม่ได้สักไฟล์" เหมือนที่หัวคำร้องเคยโดนมาแล้ว
  deal: 'sales_deals',
  // โครงการ — วันนี้มีได้แค่เอกสารร่วม (Google Doc/Sheet) ซึ่งเปิดผ่าน fileUrl ตรง
  // ไม่ผ่าน proxy · ใส่ไว้ให้ครบเพราะถ้าวันหน้าเปิดให้อัปไฟล์นิ่ง บรรทัดที่หายไป
  // จะทำให้ "แนบได้แต่เปิดดูไม่ได้" แบบเดิมอีก และไม่มีใครนึกถึงไฟล์นี้
  project: 'projects',
  // สัญญา (mig 0278) — ไฟล์ที่ลูกค้าเซ็นแล้วเปิดผ่าน proxy /file เหมือนไฟล์ดีล
  contract: 'sales_contracts',
};
export const ATTACHMENT_RESOURCE = { customer: 'customers', product: 'products', order: 'orders', registration: 'registrations' };

// โหลด record แม่ของไฟล์แนบ (หรือ null) — ใช้คู่กับ canViewRecord/canEditRecord.
export async function loadAttachmentParent(attachment) {
  const table = PARENT_TABLE[attachment?.entityType];
  if (!table) return null;
  const { data } = await getSupabaseAdmin()
    .from(table).select('*').eq('id', attachment.entityId).maybeSingle();
  return data || null;
}

// ── File deletion (Drive) ─────────────────────────────────────────────

/**
 * ปล่อยทุกอย่างที่แถวไฟล์แนบนี้ถืออยู่บน Drive ก่อนแถวจะหาย — best-effort ทั้งคู่
 * (ไม่ throw เพื่อไม่ให้ block การลบ row)
 *
 * สองอย่างคนละเรื่องกัน และ **ต้องทำทั้งคู่**:
 *
 * 1. **สิทธิ์ที่ระบบเคยให้** (`metadata.accessGranted`) — ถอนก่อนเสมอ ไม่ว่าแถวนั้นจะ
 *    เป็นไฟล์นิ่งหรือเอกสารมีชีวิต
 * 2. **ตัวไฟล์** — ทิ้งลงถังขยะเฉพาะแถวที่มี `driveFileId` · แถวที่ไม่มี = เอกสาร
 *    Google native ที่คนยังใช้ร่วมกันอยู่ ⇒ ลบแถวคือเลิกผูกกับระเบียน ไม่ใช่ลบเอกสาร
 *
 * 🐞 **ชื่อเดิม `deleteAttachmentFile` และทำแค่ข้อ 2** (ผลตรวจรอบ 13 · ค-2) —
 * `if (!att?.driveFileId) return;` อยู่บรรทัดแรก ⇒ เอกสารมีชีวิตออกตั้งแต่ยังไม่ทำอะไร
 * ซึ่งถูกสำหรับ *ไฟล์* แต่แถวพวกนั้นคือแถวเดียวกับที่ถือ `accessGranted` ⇒ สิทธิ์ค้าง
 * และบันทึกว่าเคยให้ใครหายไปพร้อมแถว = ถอนไม่ได้อีกเลย
 *
 * ⚠️ **ลำดับสำคัญ: ถอนสิทธิ์ก่อนทิ้งไฟล์** — ทิ้งไฟล์ก่อนแล้ว `permissions.list`
 * ของ Drive อาจตอบ 404 ⇒ ถอนไม่ได้ทั้งที่ยังมี permission ค้างบนไฟล์ในถังขยะ
 */
export async function releaseAttachmentFile(att) {
  try {
    const { revokeAttachmentGrants } = await import('@/lib/master/googleDocAccess');
    await revokeAttachmentGrants(att);
  } catch (err) {
    console.error('[attachments] ถอนสิทธิ์ก่อนลบแถวไม่สำเร็จ', att?.id, err?.message);
  }

  if (!att?.driveFileId) return;
  try {
    const { deleteFile } = await import('@/lib/drive');
    await deleteFile(att.driveFileId);
  } catch (err) {
    // ไม่ throw แต่ต้องดัง — ลบแถวสำเร็จแต่ไฟล์ค้างคือของที่ต้องตามเก็บ
    console.error('[attachments] ทิ้งไฟล์บน Drive ไม่สำเร็จ', att.id, err?.message);
  }
}

// ลบไฟล์แนบทั้งหมดของ entity แม่ (row + ไฟล์จริง) — ใช้ตอนลบ entity (cascade).
// live DB ไม่มี FK cascade จาก attachments → ต้องเก็บกวาดเอง กันไฟล์/แถวกำพร้า.
// best-effort ต่อไฟล์; ลบแถวเป็นชุดเดียวท้ายสุด. คืนจำนวนเอกสารที่จัดการ.
export async function purgeAttachments(entityType, entityId) {
  if (!entityType || !entityId) return 0;
  const list = await listAttachments(entityType, entityId);
  if (!list.length) return 0;
  for (const att of list) await releaseAttachmentFile(att);
  await getSupabaseAdmin()
    .from('attachments').delete().eq('entityType', entityType).eq('entityId', entityId);
  return list.length;
}
