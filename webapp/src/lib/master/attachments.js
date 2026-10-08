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
 *
 * 🔴 **สองด่านก่อนทิ้งไฟล์** (มติเจ้าของ 08/10/2569) — `driveFileId` ของแถวมาจาก client ตอนแนบ และแถวที่แนบไว้ก่อน
 *    มีทะเบียนใบรับการอัปโหลด (mig 0406) ไม่เคยถูกตรวจที่มา ⇒ ตัวทิ้งไฟล์ต้องกันเองทุกเส้น ไม่ใช่เฉพาะรูปของแถว checklist:
 *    (ก) **ยังมีที่ไหนในระบบอ้างไฟล์เดียวกัน** (`driveFileReferenced` — แถว attachments อื่นทั้งช่อง `driveFileId` และ
 *        `metadata.googleFileId` · ไฟล์ในเธรดอัปเดต · หลักฐาน Won รุ่นเก่า) = เก็บไฟล์ไว้ · ตรวจไม่ได้ = เก็บไฟล์ไว้ ·
 *        ไม่นับแถวนี้เองและแถวใน `deps.excludeIds` (แถวที่กำลังถูกลบพร้อมกัน)
 *        🐞 เดิมถามแค่แถว attachments ⇒ แนบไฟล์ที่โพสต์ไว้ในเธรดเป็นไฟล์แนบแล้วลบแถวทิ้ง = ไฟล์ของเธรดลงถังขยะ Drive
 *        ทั้งที่เส้นถอยการอัป (DELETE /api/upload) ปฏิเสธไฟล์ใบเดียวกันนั้น — สองเส้นต้องถามรายชื่อแหล่งเดียวกัน
 *        ⚠️ ราคา: ไฟล์หนึ่งใบ = สามคำถาม (attachments 1 + jsonb 2 พร้อมกัน · สองตัวหลังไม่มี index จึงกวาดทั้งตาราง)
 *        `purgeAttachments` จึงถาม 3 × จำนวนแถวที่มีไฟล์ เรียงทีละแถว — ยอมจ่ายเพราะเป็นเส้นลบ ไม่ใช่เส้นที่จอรอทุกครั้ง
 *    (ข) **ชนิดจริงบน Drive** (`driveFileTrashable`) — โฟลเดอร์และไฟล์ของ Google (`application/vnd.google-apps.*`)
 *        ไม่มีเส้นไหนของแอปทิ้งผ่านทางนี้โดยชอบ (แถวเอกสาร Google ไม่มี `driveFileId`) ⇒ ไม่ทิ้ง · ถามไม่ได้ = ไม่ทิ้ง
 *    ไฟล์ที่ถูกเก็บไว้ = ของที่รายงานไฟล์กำพร้า (cron drive-orphans) ตามเก็บได้ · ทิ้งผิดใบกู้ยากกว่าหลายเท่า
 * ⚠️ ผู้เรียกทุกจุดส่งแค่แถว (`releaseAttachmentFile(att)`) — **ไม่ส่ง client = ใช้ admin client** ไม่ใช่ "ตรวจไม่ได้"
 *    (ตีความกลับด้าน = ไม่มีไฟล์ไหนถูกทิ้งอีกเลยแบบเงียบ) · `deps` ไว้ให้ `purgeAttachments` กับเทสต์
 * @param deps `{ supabase, drive, excludeIds }` — drive = `{ getFileMeta, deleteFile }` ตัวปลอมของเทสต์
 */
export async function releaseAttachmentFile(att, deps = {}) {
  try {
    const { revokeAttachmentGrants } = await import('@/lib/master/googleDocAccess');
    await revokeAttachmentGrants(att);
  } catch (err) {
    console.error('[attachments] ถอนสิทธิ์ก่อนลบแถวไม่สำเร็จ', att?.id, err?.message);
  }

  if (!att?.driveFileId) return;
  // (ก) ยังมีที่ไหนอ้างไฟล์เดียวกัน (แถวอื่น · เธรด · หลักฐาน Won) — หรือถามไม่ได้ — = เก็บไฟล์ไว้
  try {
    const supabase = deps.supabase || getSupabaseAdmin();
    const shared = await driveFileReferenced(supabase, att.driveFileId, { excludeId: att.id, excludeIds: deps.excludeIds });
    if (shared.referenced) {
      console.error('[attachments] เก็บไฟล์บน Drive ไว้ — ยังมีที่อื่นในระบบอ้างไฟล์เดียวกัน (หรือตรวจไม่ได้)',
        att.id, shared.where || '', shared.error?.message || '');
      return;
    }
  } catch (err) {
    console.error('[attachments] เก็บไฟล์บน Drive ไว้ — ตรวจไม่ได้ว่ามีที่อื่นอ้างไฟล์เดียวกันไหม', att.id, err?.message);
    return;
  }
  // (ข) ชนิดจริงบน Drive — โฟลเดอร์/ไฟล์ของ Google/ถามไม่ได้ = ไม่ทิ้ง · อยู่ในถังขยะแล้ว = ไม่มีอะไรต้องทำ
  const trashable = await driveFileTrashable(att.driveFileId, deps);
  if (!trashable.ok) {
    if (trashable.reason !== 'trashed') {
      console.error('[attachments] เก็บไฟล์บน Drive ไว้ — ไม่ใช่ไฟล์ที่ทิ้งผ่านเส้นนี้ได้', att.id, trashable.reason, trashable.error?.message || '');
    }
    return;
  }
  try {
    const { deleteFile } = deps.drive || await import('@/lib/drive');
    await deleteFile(att.driveFileId);
  } catch (err) {
    // ไม่ throw แต่ต้องดัง — ลบแถวสำเร็จแต่ไฟล์ค้างคือของที่ต้องตามเก็บ
    console.error('[attachments] ทิ้งไฟล์บน Drive ไม่สำเร็จ', att.id, err?.message);
  }
}

/**
 * ไฟล์ Drive ใบนี้ **ทิ้งลงถังขยะผ่านแอปได้ไหม** — ถามชนิดจริงจาก Drive (`id, mimeType, trashed`) ก่อนทิ้งทุกครั้ง
 * ใช้ร่วมกันสองเส้น: ตัวปล่อยไฟล์ของแถวไฟล์แนบ (ข้างบน) และเส้นถอยการอัป (DELETE /api/upload)
 *
 * 🔴 ไม่ทิ้ง: โฟลเดอร์และไฟล์ของ Google (`application/vnd.google-apps.*` = โฟลเดอร์ลูกค้า/สินค้า · Docs · Sheets) ·
 *    **ถามไม่ได้** (Drive ล่ม · ไม่พบไฟล์ · ไม่มีสิทธิ์ · ไม่บอกชนิด) — id มาจาก client ⇒ ไม่รู้ว่าเป็นอะไร = ไม่แตะ
 * ⚠️ อยู่ในถังขยะแล้ว = `ok: false` เหตุ `trashed` (ไม่ต้องทิ้งซ้ำ · ไม่ใช่เรื่องต้อง log)
 * ⚠️ ไม่ throw · โหลด lib/drive (googleapis) เฉพาะเมื่อถึงเส้นนี้
 * @param deps `{ drive }` — ตัวปลอมของเทสต์ (`{ getFileMeta }`)
 * @returns {Promise<{ ok: boolean, reason: null|'unverifiable'|'native'|'trashed', error: object|null }>}
 */
export async function driveFileTrashable(driveFileId, deps = {}) {
  let meta = null;
  try {
    const { getFileMeta } = deps.drive || await import('@/lib/drive');
    meta = await getFileMeta(driveFileId, 'id, mimeType, trashed');
  } catch (err) {
    return { ok: false, reason: 'unverifiable', error: err };
  }
  const mime = String(meta?.mimeType || '').toLowerCase();
  if (!meta?.id || !mime) return { ok: false, reason: 'unverifiable', error: null };
  if (mime.startsWith('application/vnd.google-apps.')) return { ok: false, reason: 'native', error: null };
  if (meta.trashed) return { ok: false, reason: 'trashed', error: null };
  return { ok: true, reason: null, error: null };
}

// ตัวส่งออกในอีกชื่อหนึ่ง — ให้ `purgeAttachments` เรียกได้ทั้งที่ชื่อเดิมถูกบังในฟังก์ชันนั้น (ดูคอมเมนต์ที่นั่น)
const releaseOwnedFile = releaseAttachmentFile;

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
// 🔴 ตัวปล่อยไฟล์ถามก่อนทิ้งว่า "มีแถวอื่นถือไฟล์เดียวกันไหม" และเส้นนี้ปล่อยไฟล์ **ก่อน** ลบแถว ⇒ สองแถวของ entity เดียวกัน
//    ที่ชี้ไฟล์ใบเดียวจะเห็นกันเองเป็น "แถวอื่น" แล้วไฟล์ค้างตลอดไป — จึงบอกตัวปล่อยว่าแถวทั้งชุดนี้กำลังถูกลบ (`excludeIds`)
//    และให้ถามผ่าน client ตัวเดียวกับที่ผู้เรียกส่งมา · แถวที่ไม่มีไฟล์บน Drive ไม่ยิงอะไรออกนอกเครื่องตามเดิม
// ⚠️ ชื่อ `releaseAttachmentFile` ในฟังก์ชันนี้ **บังตัวส่งออกโดยเจตนา** — บรรทัดวน `await releaseAttachmentFile(att)` ถูกเทสต์
//    ตรึงทั้งประโยค (เส้นลบเป็นก้อนต้องปล่อยของผ่านตัวเดียวกับเส้นลบทีละแถว) จึงผูกบริบทไว้ที่ชื่อ ไม่แก้บรรทัดเรียก
// `deps.drive` = Drive ตัวปลอมของเทสต์ (ส่งต่อให้ตัวปล่อยไฟล์) — ผู้เรียกจริงไม่ส่ง
export async function purgeAttachments(entityType, entityId, client = null, deps = {}) {
  if (!entityType || !entityId) return { count: 0, error: null };
  const supabase = client || getSupabaseAdmin();
  const list = await listAttachments(entityType, entityId, supabase);
  if (!list.length) return { count: 0, error: null };
  const purging = { drive: deps.drive, supabase, excludeIds: list.map((row) => row.id) };
  const releaseAttachmentFile = (att) => releaseOwnedFile(att, purging);
  for (const att of list) await releaseAttachmentFile(att);
  const { error } = await supabase
    .from('attachments').delete().eq('entityType', entityType).eq('entityId', entityId);
  if (error) {
    console.error('[attachments] ลบแถวไฟล์แนบไม่สำเร็จ — แถวกำพร้าค้าง', entityType, entityId, error.message);
  }
  // แถวหายจากฐานแล้วเท่านั้นจึงถอนซ้ำ — ลบพัง = แถวยังอยู่ ยังเห็นกันเองเหมือนเดิม
  if (!error) await revokeTwinDocGrants(list, { supabase, drive: deps.drive });
  return { count: list.length, error: error || null };
}

/**
 * ถอนสิทธิ์เอกสาร Google ที่ **ชุดที่เพิ่งถูกลบผูกไฟล์ใบเดียวไว้มากกว่าหนึ่งแถว** — เรียกหลังลบแถวทั้งชุดสำเร็จแล้ว
 *
 * 🐞 ตัวถอนสิทธิ์ไม่ถอนอีเมลที่แถวอื่นของไฟล์เดียวกันยังจดอยู่ (lib/master/googleDocAccess) และ `purgeAttachments` ปล่อยของ
 *    **ก่อน** ลบแถว ⇒ สองแถวของ entity เดียวกันที่ผูกเอกสารใบเดียว เห็นกันเองเป็น "แถวอื่นที่ยังจดอยู่" ต่างคนต่างไม่ถอน
 *    แล้วสิทธิ์ค้างบน Drive หลังระเบียนถูกลบไปทั้งใบ ไม่มีแถวไหนเหลือให้ตัวถอนหาเจออีก
 * ⇒ ถอนอีกรอบ **หลังแถวหายจากฐานแล้ว** — แถวอื่นที่ยังเห็นตอนนั้นคือของระเบียนอื่นจริง ๆ ซึ่งยังต้องการสิทธิ์อยู่
 * ⚠️ เฉพาะไฟล์ที่ซ้ำในชุด — ไฟล์ที่ผูกแถวเดียวถูกถอนครบไปแล้วในรอบแรก ไม่ยิง Drive ซ้ำ (ของจริง 08/10/2569 ไม่มีไฟล์ไหนผูกซ้ำ)
 * ⚠️ best-effort เหมือนรอบแรก — ไม่ throw · พังให้ log ดัง (สิทธิ์ค้างต้องตามถอนด้วยมือ)
 * @param deps `{ supabase, drive }` — ส่งต่อให้ตัวถอนสิทธิ์ (drive = ตัวปลอมของเทสต์)
 *   ⚠️ `deps.supabase` ต้องเป็น client ของ service_role เท่านั้น — ตัวถอนอ่าน "แถวอื่นของไฟล์เดียวกัน" ผ่าน client ตัวนี้
 *   client ที่เห็นแถวไม่ครบ = ถอนอีเมลที่ระเบียนอื่นยังต้องใช้
 * @returns {Promise<number>} จำนวนแถวที่ถูกส่งไปถอนซ้ำ
 */
export async function revokeTwinDocGrants(list, deps = {}) {
  const byFile = new Map();
  for (const att of list || []) {
    const fileId = att?.metadata?.googleFileId;
    if (!fileId) continue;
    byFile.set(fileId, [...(byFile.get(fileId) || []), att]);
  }
  const twins = [...byFile.values()].filter((rows) => rows.length > 1).flat();
  if (!twins.length) return 0;
  try {
    const { revokeAttachmentGrants } = await import('@/lib/master/googleDocAccess');
    for (const att of twins) await revokeAttachmentGrants(att, { supabase: deps.supabase, drive: deps.drive });
  } catch (err) {
    console.error('[attachments] ถอนสิทธิ์เอกสารร่วมที่ผูกซ้ำในระเบียนเดียวกันไม่สำเร็จ — ต้องตามถอนด้วยมือ', twins.map((att) => att.id).join(','), err?.message);
  }
  return twins.length;
}

/* รูปร่างของ id ไฟล์บน Drive — ตัวอักษรอังกฤษ ตัวเลข `_` `-` เท่านั้น · ค่าที่หลุดรูปนี้ห้ามถึงตัวกรองของ PostgREST
   (`,` `)` `.` ในค่าคือการเขียนเงื่อนไขของ `.or()` ใหม่เอง) */
const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
/* เพดานอ่านของฐาน (PostgREST max rows) — `.limit()` ที่มากกว่านี้ไม่ใช่ขอบเขตจริง */
const HELD_SCAN_MAX = 1000;

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
 * @param excludeIds แถวที่กำลังถูกลบพร้อมกันทั้งชุด (`purgeAttachments`) — ไม่นับเช่นกัน · ⚠️ **คัดออกหลังอ่าน ไม่ต่อเข้าตัวกรอง**:
 *    ลิสต์นี้ยาวตามจำนวนไฟล์ของ entity (ตัวกรองยาวเกิน ~16 KB ตอบ error) และ id แถวไม่ได้ผ่านด่านรูปร่างแบบ id ไฟล์ ⇒
 *    อ่านไม่เกิน "จำนวนที่คัดออก + 1" แถว แล้วดูว่ามีแถวนอกลิสต์ไหม · เกินเพดานอ่านของฐาน (1,000) จนตัดสินไม่ได้ = ถือว่ามีคนถือ
 * @returns {Promise<{ held: boolean, error: object|null, invalid: boolean }>}
 */
export async function driveFileHeld(supabase, fileId, { excludeId, excludeIds } = {}) {
  if (typeof fileId !== 'string' || !DRIVE_FILE_ID_PATTERN.test(fileId)) {
    return { held: true, error: null, invalid: true };
  }
  const excluded = new Set((Array.isArray(excludeIds) ? excludeIds : []).filter(Boolean).map(String));
  if (excluded.size && excludeId) excluded.add(String(excludeId));
  const cap = excluded.size ? Math.min(excluded.size + 1, HELD_SCAN_MAX) : 1;
  let query = supabase.from('attachments').select('id')
    .or(`driveFileId.eq.${fileId},metadata->>googleFileId.eq.${fileId}`);
  if (excludeId && !excluded.size) query = query.neq('id', excludeId);
  const { data, error } = await query.limit(cap);
  if (error) return { held: true, error, invalid: false };
  if (!excluded.size) return { held: Boolean(data?.length), error: null, invalid: false };
  const rows = data || [];
  const others = rows.some((row) => !excluded.has(String(row?.id)));
  // อ่านเต็มเพดานของฐานแล้วยังเจอแต่แถวที่คัดออก = อาจมีแถวอื่นที่ยังอ่านไม่ถึง ⇒ ตัดสินไม่ได้ = เก็บไฟล์ไว้
  const truncated = cap < excluded.size + 1 && rows.length >= cap;
  return { held: others || truncated, error: null, invalid: false };
}

/**
 * ไฟล์ Drive นี้ **มีที่ไหนในระบบอ้างถึงอยู่ไหม** — ถามก่อนทิ้งไฟล์ทุกเส้น: เส้นถอยการอัป (DELETE /api/upload · id มาจาก
 * client) และตัวปล่อยไฟล์ของแถวไฟล์แนบ (`releaseAttachmentFile`) · POST /api/attachments ถามตัวเดียวกันก่อนรับไฟล์เข้าแถว
 *
 * สามแหล่ง: ① แถว attachments (`driveFileHeld` — สองช่อง) ② `quotations.wonAttachments` (หลักฐาน Won รุ่นเก่า)
 * ③ `entity_updates.attachments` (ไฟล์ในเธรดอัปเดต) · สองแหล่งหลังเป็น jsonb ⇒ ถามด้วย `.contains(…).limit(1)` ทีละใบ
 * 🔴 **ค่าที่ส่งให้ `.contains` ของช่อง jsonb ต้องเป็นสตริง JSON** (`JSON.stringify`) — 🐞 ส่ง array ของ JS ตรง ๆ แล้ว
 *    postgrest-js ประกอบเป็น array literal ของ Postgres (`cs.{[object Object]}`) ⇒ ฐานตอบ 22P02 "invalid input syntax for
 *    type json" ทุกครั้ง ⇒ ตกเป็น "ตรวจไม่ได้ = ถือว่ามีคนอ้าง" ⇒ เส้นถอยการอัปไม่ทิ้งไฟล์ไหนอีกเลย (ลองกับฐานจริง 08/10/2569:
 *    รูปสตริงตอบ 200 และหาไฟล์ในเธรดเจอ)
 * 🔴 **รายชื่อแหล่งต้องเดินตาม `collectReferencedIds` ใน src/lib/driveMaintenance.js** (ตัวกวาดทั้งระบบของรายงานไฟล์กำพร้า) —
 *    เพิ่มที่เก็บไฟล์ใหม่ที่นั่นเมื่อไร ต้องเพิ่มที่นี่ด้วย ไม่งั้นเส้นถอยการอัปทิ้งไฟล์ที่ที่เก็บใหม่ยังอ้างอยู่ได้
 *    (โฟลเดอร์ของลูกค้า/สินค้าในลิสต์นั้นไม่ต้องถามที่นี่ — ด่านชนิดไฟล์ `driveFileTrashable` ไม่ทิ้งโฟลเดอร์อยู่แล้ว)
 * ⚠️ **ตรวจไม่ได้ = ถือว่ามีคนอ้าง** (`referenced: true` พร้อม `error`) — supabase ไม่ throw อ่าน `{ error }` ทุกคำถาม ·
 *    id ผิดรูป = `referenced: true` โดยไม่ยิงคำถามเลย
 * @param excludeId / excludeIds แถว attachments ของผู้ถามเอง — ส่งต่อให้ `driveFileHeld` (ดูที่นั่น) · ไม่มีผลกับสองแหล่ง jsonb
 * ⚠️ `sales_orders.confirmAttachments` กับรูปของนัดช่างยังไม่อยู่ในนี้ (ของจริงวันนี้ไม่มีใบไหนเก็บเป็น id ไฟล์ Drive) — ที่กันไว้
 *    ก่อนคือใบรับการอัปโหลด: ถอยได้เฉพาะไฟล์ที่ตัวเองอัปใน 24 ชั่วโมงและยังไม่มีปลายทางรับไป
 * @returns {Promise<{ referenced: boolean, where: string|null, error: object|null }>}
 */
export async function driveFileReferenced(supabase, fileId, { excludeId, excludeIds } = {}) {
  try {
    const held = await driveFileHeld(supabase, fileId, { excludeId, excludeIds });
    if (held.invalid) return { referenced: true, where: 'invalid', error: null };
    if (held.error) return { referenced: true, where: 'attachments', error: held.error };
    if (held.held) return { referenced: true, where: 'attachments', error: null };
    // fileId ผ่านด่านรูปร่างของ driveFileHeld มาแล้ว (ตัวอักษรอังกฤษ ตัวเลข `_` `-`) ⇒ ไม่มีอะไรในสตริงนี้ต้อง escape
    const needle = JSON.stringify([{ driveFileId: fileId }]);
    const [won, updates] = await Promise.all([
      supabase.from('quotations').select('id').contains('wonAttachments', needle).limit(1),
      supabase.from('entity_updates').select('id').contains('attachments', needle).limit(1),
    ]);
    if (won.error) return { referenced: true, where: 'quotations.wonAttachments', error: won.error };
    if (won.data?.length) return { referenced: true, where: 'quotations.wonAttachments', error: null };
    if (updates.error) return { referenced: true, where: 'entity_updates.attachments', error: updates.error };
    if (updates.data?.length) return { referenced: true, where: 'entity_updates.attachments', error: null };
    return { referenced: false, where: null, error: null };
  } catch (err) {
    return { referenced: true, where: null, error: err };
  }
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
