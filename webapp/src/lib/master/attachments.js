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
const PARENT_TABLE = { customer: 'customers', product: 'products', order: 'orders', registration: 'excise_registrations' };
export const ATTACHMENT_RESOURCE = { customer: 'customers', product: 'products', order: 'orders', registration: 'registrations' };

// โหลด record แม่ของไฟล์แนบ (หรือ null) — ใช้คู่กับ canViewRecord/canEditRecord.
export async function loadAttachmentParent(attachment) {
  const table = PARENT_TABLE[attachment?.entityType];
  if (!table) return null;
  const { data } = await getSupabaseAdmin()
    .from(table).select('*').eq('id', attachment.entityId).maybeSingle();
  return data || null;
}

// ── File deletion (storage / Drive) ───────────────────────────────────
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

// แกะ object path ออกจาก public URL ของ Supabase Storage เพื่อลบไฟล์จริง.
// รูปแบบ: .../storage/v1/object/public/<bucket>/<objectPath>
function objectPathFromUrl(url) {
  if (!url) return null;
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length));
}

// ลบไฟล์จริงของ attachment หนึ่งตัว (Drive หรือ Supabase Storage) — best-effort:
// ไม่ throw เพื่อไม่ให้ block การลบ row ถ้าไฟล์หายไปแล้ว/แกะ path ไม่ได้.
export async function deleteAttachmentFile(att) {
  if (att?.driveFileId) {
    // Drive backend — dynamic import กัน googleapis โหลดในโหมด supabase.
    try {
      const { deleteFile } = await import('@/lib/drive');
      await deleteFile(att.driveFileId);
    } catch {
      /* best-effort */
    }
    return;
  }
  const path = objectPathFromUrl(att?.fileUrl);
  if (path) {
    try {
      await getSupabaseAdmin().storage.from(BUCKET).remove([path]);
    } catch {
      /* ไฟล์อาจถูกลบไปแล้ว หรือ path แกะไม่ได้ — ข้ามได้ */
    }
  }
}

// ลบไฟล์แนบทั้งหมดของ entity แม่ (row + ไฟล์จริง) — ใช้ตอนลบ entity (cascade).
// live DB ไม่มี FK cascade จาก attachments → ต้องเก็บกวาดเอง กันไฟล์/แถวกำพร้า.
// best-effort ต่อไฟล์; ลบแถวเป็นชุดเดียวท้ายสุด. คืนจำนวนเอกสารที่จัดการ.
export async function purgeAttachments(entityType, entityId) {
  if (!entityType || !entityId) return 0;
  const list = await listAttachments(entityType, entityId);
  if (!list.length) return 0;
  for (const att of list) await deleteAttachmentFile(att);
  await getSupabaseAdmin()
    .from('attachments').delete().eq('entityType', entityType).eq('entityId', entityId);
  return list.length;
}
