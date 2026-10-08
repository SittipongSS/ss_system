// ── Master Data: attachments ──────────────────────────────────────────
// Shared-core access layer for the polymorphic attachments table (migration
// 0028). เอกสารแนบของ customer/product (เฟส A) อ่าน/เขียนผ่านโมดูลนี้.
//
// Server-only: ใช้ service-role admin client (bypass RLS). ห้าม import ใน client.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// เอกสารทั้งหมดของ entity หนึ่งๆ (ใหม่สุดก่อน).
export async function listAttachments(entityType, entityId, client = null) {
  if (!entityType || !entityId) return [];
  const supabase = client || getSupabaseAdmin();
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
  /* ผลวัดพื้นที่รายใบ × รายพื้นที่ (mig 0314) — ⚠️ บรรทัดนี้คือจุดที่ทำให้ "แนบได้แต่
     เปิดดูไม่ได้สักไฟล์" ถ้าลืม (หัวคำร้องกับดีลเคยโดนมาแล้วทั้งคู่)
     ⚠️ สิทธิ์ของไฟล์ไหลตาม **ใบคำร้องแม่** ไม่ใช่ตามแถวผลวัด — ดูสาขาใน route ของไฟล์ */
  service_survey_zone: 'service_survey_zones',
  contract_addendum: 'sales_contract_addenda',
  /* ใบสั่งขาย (แท็บ "เอกสาร" · มติ 25/09) — ⚠️ บรรทัดนี้คือจุดที่ทำให้ "แนบได้แต่เปิดดูไม่ได้สักไฟล์"
     ถ้าลืม · สิทธิ์ไหลตาม **ดีลของใบ** ไม่ใช่แถวใบ (ดู lib/sales/salesOrderAttachmentAccess.js) */
  sales_order: 'sales_orders',
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
// best-effort ต่อไฟล์; ลบแถวเป็นชุดเดียวท้ายสุด.
// `client` ไว้ให้ผู้เรียกที่ถือ supabase ของตัวเองอยู่แล้ว (และให้เทสต์ยัดตัวปลอมได้) —
// ไม่ส่งมาก็ใช้ admin client ตามเดิม
//
// คืน `{ count, error }` — `count` = เอกสารที่จัดการ · `error` = ลบ **แถว** attachments ไม่สำเร็จ (null = สำเร็จ)
// 🐞 เดิมทิ้ง `{ error }` ของคำสั่งลบแถว (supabase-js ไม่ throw) ⇒ ลบพัง = แถวกำพร้าค้าง ทั้งที่ผู้เรียกทุกคน
//    เข้าใจว่าเก็บกวาดสำเร็จ · ⚠️ **ไม่ throw โดยเจตนา** — ผู้เรียก ~20 จุด await ตรง ๆ ไม่มี try/catch และหลายจุด
//    เรียกหลังลบ entity แม่ไปแล้ว ⇒ throw = 500 ทั้งที่ของหลักลบสำเร็จ · ผู้เรียกที่บอกจอได้ให้อ่าน `error` เอง
//    · พังแล้วยัง log ดังให้ตามเก็บได้แม้ผู้เรียกไม่อ่าน
export async function purgeAttachments(entityType, entityId, client = null) {
  if (!entityType || !entityId) return { count: 0, error: null };
  const supabase = client || getSupabaseAdmin();
  const list = await listAttachments(entityType, entityId, supabase);
  if (!list.length) return { count: 0, error: null };
  for (const att of list) await releaseAttachmentFile(att);
  const { error } = await supabase
    .from('attachments').delete().eq('entityType', entityType).eq('entityId', entityId);
  if (error) {
    console.error('[attachments] ลบแถวไฟล์แนบไม่สำเร็จ — แถวกำพร้าค้าง', entityType, entityId, error.message);
  }
  return { count: list.length, error: error || null };
}

/* รูปร่างของ id ไฟล์บน Drive — ตัวอักษรอังกฤษ ตัวเลข `_` `-` เท่านั้น · ค่าที่หลุดรูปนี้ห้ามถึงตัวกรองของ PostgREST
   (`,` `)` `.` ในค่าคือการเขียนเงื่อนไขของ `.or()` ใหม่เอง) */
const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * มีแถว attachments ไหน **ถือไฟล์ Drive นี้อยู่** ไหม — ถามก่อนรับ `driveFileId` จาก client และก่อนทิ้งไฟล์ลงถังขยะ Drive
 *
 * 🔴 แถวถือไฟล์ได้ **สองช่อง**: `driveFileId` (ไฟล์ที่อัปขึ้นมา) และ `metadata.googleFileId` (เอกสาร Google ที่ยังใช้ร่วมกัน —
 *    แถวพวกนั้นเก็บ `driveFileId` เป็น null · lib/master/googleDocs.js) · 🐞 เดิมสามจุดถามแค่ช่องแรก ⇒ แนบ "รูปของแถว
 *    checklist" ที่ชี้ id ของ Google Sheet ของดีลคนอื่นได้ แล้วให้ระบบเก็บกวาดทิ้งเอกสารนั้นลงถังขยะ
 * ⚠️ **ตรวจไม่ได้ = ถือว่ามีคนถือ** (`held: true` พร้อม `error`) — supabase ไม่ throw · ผู้เรียกที่กำลังจะทิ้งไฟล์อ่านแค่
 *    `held` ก็ปลอดภัย · id ผิดรูป = `invalid` (และ `held: true`) โดยไม่ยิงคำถามเลย
 * ⚠️ เห็นแค่ไฟล์ที่มีแถว attachments — โฟลเดอร์/ไฟล์ Drive ที่ไม่มีแถวไหนชี้ ตัวนี้ตอบว่าไม่มีใครถือ (POST ของรูปประจำแถว
 *    ถาม Drive ซ้ำอีกชั้น)
 * ⚠️ อ่านแบบมีเพดาน (`.limit(1)`) — ถามแค่ "มีสักแถวไหม"
 * @param excludeId แถวของผู้ถามเอง (ไม่นับว่าเป็น "แถวอื่น")
 * @returns {Promise<{ held: boolean, error: object|null, invalid: boolean }>}
 */
export async function driveFileHeld(supabase, fileId, { excludeId } = {}) {
  if (typeof fileId !== 'string' || !DRIVE_FILE_ID_PATTERN.test(fileId)) {
    return { held: true, error: null, invalid: true };
  }
  let query = supabase.from('attachments').select('id')
    .or(`driveFileId.eq.${fileId},metadata->>googleFileId.eq.${fileId}`);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.limit(1);
  if (error) return { held: true, error, invalid: false };
  return { held: Boolean(data?.length), error: null, invalid: false };
}

/**
 * ลบแถวไฟล์แนบ **ตามรายการที่ส่งมา** (ไม่ใช่ทั้ง entity) แล้วปล่อยไฟล์บน Drive — ใช้กับไฟล์ที่ระบบเก็บกวาดเอง
 * (รูปของแถว checklist ใบสเปคที่ไม่มีแถวไหนชี้แล้ว · mig 0405)
 *
 * ⚠️ **ห้ามใช้ `purgeAttachments` กับงานนี้** — ตัวนั้นลบทุกไฟล์ของ entity (artwork · ภาพประกอบกระดาษ ไปด้วย)
 * ⚠️ ลำดับ: ลบแถวก่อน (คำสั่งเดียว `.in('id', …)`) แล้วค่อยปล่อยไฟล์ — ลบแถวไม่ผ่าน = ไม่แตะไฟล์เลย
 *    (ไฟล์หายแต่แถวยังอยู่ = รูปเปิดไม่ขึ้น · แถวหายแต่ไฟล์ค้าง = cron drive-orphans ตามเก็บได้)
 * 🔴 **ไฟล์ถูกปล่อยเฉพาะเมื่อไม่มีแถว attachments อื่นถือไฟล์เดียวกัน** (`driveFileHeld` — ทั้งช่อง `driveFileId` และ
 *    `metadata.googleFileId`) — `driveFileId` มาจาก client ตอนแนบ (POST ตรวจซ้ำให้เฉพาะ docType ใหม่ ๆ) ⇒ แถวที่ชี้ไฟล์
 *    ของคนอื่นแล้วปล่อยให้ระบบเก็บกวาด = ทิ้งสัญญา/บัตรประชาชน/เอกสาร Google ของคนอื่นลงถังขยะ Drive ·
 *    ตรวจไม่ได้ (query ล้ม · id ผิดรูป) = ถือว่ามีคนใช้ (เก็บไฟล์ไว้)
 * ⚠️ ไม่ throw — ผู้เรียกทำงานหลัก (บันทึก/ลบสเปค) เสร็จไปแล้ว · พังแล้ว log ดัง
 * @param release ตัวปล่อยไฟล์ (ให้เทสต์นับการเรียกได้ — ค่าตั้งต้นคือของจริง)
 * @returns {{ count: number, error: object|null }} count = แถวที่ลบ
 */
export async function deleteAttachmentRows(supabase, rows, { release = releaseAttachmentFile } = {}) {
  const list = (rows || []).filter((row) => row?.id);
  if (!list.length) return { count: 0, error: null };
  try {
    const ids = list.map((row) => row.id);
    const { error } = await supabase.from('attachments').delete().in('id', ids);
    if (error) {
      console.error('[attachments] ลบแถวไฟล์แนบตามรายการไม่สำเร็จ', ids.length, error.message);
      return { count: 0, error };
    }
    const releasable = [];
    for (const att of list) {
      if (att.driveFileId) {
        const shared = await driveFileHeld(supabase, att.driveFileId);
        if (shared.held) {
          console.error('[attachments] ลบแถวแล้ว แต่เก็บไฟล์บน Drive ไว้ — ยังมีแถวอื่นถือไฟล์เดียวกัน (หรือตรวจไม่ได้)',
            att.id, shared.error?.message || '');
          continue;
        }
      }
      releasable.push(att);
    }
    await Promise.allSettled(releasable.map((att) => release(att)));
    return { count: list.length, error: null };
  } catch (err) {
    console.error('[attachments] ลบไฟล์แนบตามรายการไม่สำเร็จ', err?.message);
    return { count: 0, error: err };
  }
}
