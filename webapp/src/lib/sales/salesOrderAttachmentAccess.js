// ── สิทธิ์ไฟล์แนบของใบสั่งขาย (แท็บ "เอกสาร" · มติเจ้าของ 25/09/2569) ──────────
//
// ⭐ ทำไมมีไฟล์นี้: เอกสารที่ลูกค้าส่งมา **หลังออกใบ** (PO ฉบับแก้ · หนังสือยืนยัน ฯลฯ)
//   ไม่มีที่อยู่ — ไฟล์ยืนยันคำสั่งซื้อ (`confirmAttachments`) เป็นด่านยื่นอนุมัติ แก้ได้เฉพาะ
//   ตอนร่าง และตรึงตอนอนุมัติ (มติ: คงไว้แบบนั้น) ⇒ ของที่มาทีหลังเข้าแถว `attachments`
//   entity `sales_order` แทน
//
// ⚠️ **ไม่ลงทะเบียนใน `SALES_ATTACHMENT_TABLE`** ทั้งที่เป็นสายงานขายเหมือนกัน —
//   ตารางนั้นตัดสินด้วย `team` + `ownerId` **ของแถวแม่เอง** แต่ `sales_orders` ไม่มี `team`
//   และ `ownerId` เป็นสำเนาเจ้าของดีล *ตอนอนุมัติ* (mig 0294 · ใบร่าง = null) ⇒ ลงตรงนั้น
//   = ด่านทีมตกเงียบทุกคน ด่านเจ้าของเทียบกับคนที่อาจไม่ใช่เจ้าของดีลแล้ว
//   ⇒ ตัดสินผ่าน **ดีลของใบ** เหมือนทุกด่านของใบสั่งขาย (`scopedRow` · SO route GET/PATCH)
//
// กติกา (มติ 25/09):
//   อ่าน  = เห็นใบได้ (`canViewSalesPlanning` + ขอบเขตอ่านของดีล)
//   แนบ  = แก้ใบได้ (`canEditSalesPlanning` + ขอบเขตแก้ของดีล — ชุดเดียวกับ `canEdit` ของ SO GET)
//          ทุกสถานะ **ยกเว้นใบที่ยกเลิก** (และฉบับที่ถูก Rev. แทนแล้ว — ไฟล์ย้ายไปฉบับใหม่)
//   ลบ   = **คนแนบเอง** (ที่ยังแก้ใบได้) หรือแอดมิน — กันไฟล์ของคนอื่นหายเงียบ
//   แอดมินข้ามด่านสถานะได้ (เก็บกวาดไฟล์ที่แนบผิดใบ · กติกาเดียวกับไฟล์ผลวัดพื้นที่)
//
// ⚠️ **เพิ่ม entity แนบไฟล์ใหม่ ต้องต่อครบ 5 จุด** — ดูหัวไฟล์ salesAttachmentAccess.js
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import { purgeAttachments } from '@/lib/master/attachments';
import { fetchAllResult } from '@/lib/supabaseFetchAll';

export const SALES_ORDER_ATTACHMENT = 'sales_order';
export const SALES_ORDER_ATTACHMENT_TABLE = { [SALES_ORDER_ATTACHMENT]: 'sales_orders' };
export const isSalesOrderAttachment = (entityType) => entityType === SALES_ORDER_ATTACHMENT;

/**
 * เหตุที่ใบนี้รับไฟล์แนบเพิ่ม/ลบไม่ได้ (null = ได้) — ด่านสถานะล้วน ใช้ทั้งจอและ API
 * ⚠️ ข้อความต้องบอกทางไปต่อ ไม่ใช่แค่ "ทำไม่ได้" (กฎ "ปุ่มกดไม่ได้ = บอกเหตุตอนกด")
 */
export function salesOrderAttachBlock(order) {
  if (!order) return 'ไม่พบใบสั่งขาย';
  if (order.status === 'cancelled') return 'ใบสั่งขายนี้ยกเลิกแล้ว — แนบหรือลบเอกสารไม่ได้';
  if (order.status === 'revised') {
    return 'ใบนี้มีฉบับ Rev. ใหม่แทนแล้ว — เอกสารแนบย้ายไปฉบับล่าสุด แนบเพิ่มที่ฉบับนั้น';
  }
  return null;
}

/**
 * ลบ/แก้ไฟล์ใบนี้ได้ไหม — **คนแนบเองหรือแอดมิน** (มติ 25/09)
 * ⚠️ นี่คือด่านชั้นที่สอง ต่อจาก "แก้ใบได้" — คนแนบที่หลุดขอบเขตแก้ของดีลไปแล้วก็ลบไม่ได้
 */
export function canRemoveSalesOrderFile(attachment, user) {
  if (!user || !attachment) return false;
  if (user.role === 'admin') return true;
  return !!attachment.uploadedBy && attachment.uploadedBy === user.id;
}

/* ดีลของใบ — คืน `{ deal, error }` ไม่ throw (supabase ไม่ throw อยู่แล้ว · ดูกฎ supabaseNeverThrows) */
export async function loadSalesOrderDeal(supabase, order) {
  if (!order?.dealId) return { deal: null, error: null };
  const { data, error } = await supabase
    .from('sales_deals').select('id, team, ownerId').eq('id', order.dealId).maybeSingle();
  return { deal: data || null, error: error || null };
}

/* ใบที่หาดีลไม่เจอ (ดีลถูกลบแล้ว) — แอดมินอย่างเดียว เหมือน `loadScoped` ของใบสั่งขาย
   ⚠️ อ่านดีลพัง = ไม่ผ่าน (fail closed) ไม่ใช่ถือว่าไม่มีดีลแล้วตกไปทางแอดมิน/ทางกว้าง */
function scopeByDeal({ deal, error }, user, inScope) {
  if (error) return false;
  if (!deal) return user?.role === 'admin';
  return inScope(user, deal);
}

export async function canViewSalesOrderAttachment(supabase, order, user) {
  if (!order || !canViewSalesPlanning(user)) return false;
  return scopeByDeal(await loadSalesOrderDeal(supabase, order), user, inSalesViewScope);
}

// แนบ = แก้ใบได้ · ⚠️ ด่านสถานะ (`salesOrderAttachBlock`) แยกไปอยู่ที่ route เพราะต้องตอบ 409 พร้อมเหตุ ไม่ใช่ 403 เปล่า
export async function canAttachToSalesOrder(supabase, order, user) {
  if (!order || !canEditSalesPlanning(user)) return false;
  return scopeByDeal(await loadSalesOrderDeal(supabase, order), user, inSalesEditScope);
}

/**
 * ย้ายไฟล์แนบของใบเดิมไปฉบับ Rev. ใหม่ — ฉบับ Rev. เป็นแถวใหม่ (id ใหม่) ⇒ ไม่ย้าย = ไฟล์ค้าง
 * อยู่บนใบที่ถูกแทนแล้ว ซึ่งแนบเพิ่มไม่ได้และไม่มีใครเปิดดู (แพตเทิร์นเดียวกับงวด mig 0376 ·
 * FM-SA-04 `moveDocumentsToRevisedOrder`)
 * ⚠️ ไฟล์บน Drive ไม่ต้องย้าย — proxy เปิดด้วย `driveFileId` ไม่ใช่ path โฟลเดอร์
 * คืน `{ moved, error }` · ล้ม = ผู้เรียกบอก warning (Rev. สำเร็จไปแล้ว ห้ามล้มทั้งคำขอ)
 */
export async function moveSalesOrderAttachments(supabase, fromOrderId, toOrderId) {
  if (!fromOrderId || !toOrderId || fromOrderId === toOrderId) return { moved: 0, error: null };
  const { data, error } = await supabase
    .from('attachments')
    .update({ entityId: toOrderId })
    .eq('entityType', SALES_ORDER_ATTACHMENT)
    .eq('entityId', fromOrderId)
    .select('id');
  if (error) return { moved: 0, error: error.message || String(error) };
  return { moved: (data || []).length, error: null };
}

/**
 * กวาดไฟล์แนบของใบสั่งขายที่ **ถูกลบไปแล้ว** — polymorphic ไม่มี FK ให้ cascade
 * ⭐ ใบหายได้สามทาง: ลบใบเอง · ลบใบเสนอราคาต้นทาง (cascade) · ลบดีลแบบบังคับ (cascade) ⇒ ทั้งสามทางเรียกตัวนี้
 * ⚠️ **ไม่ throw เด็ดขาด** — ผู้เรียกลบใบสำเร็จไปแล้ว ถ้าโยนตรงนี้ คำตอบกลายเป็น 500 และงานหลังจากนี้
 *   (กวาดหลักฐาน · ปลดรอบบริการ · **audit ที่เป็นทางกู้ทางเดียว**) ถูกข้ามทั้งหมด ⇒ พลาด = log + นับไว้ในผล
 * คืน `{ count, errors }` (errors = ข้อความรายใบ)
 */
export async function purgeSalesOrderFiles(supabase, orderIds) {
  let count = 0;
  const errors = [];
  for (const id of new Set((orderIds || []).filter(Boolean))) {
    try {
      const res = await purgeAttachments(SALES_ORDER_ATTACHMENT, id, supabase);
      count += res.count || 0;
      if (res.error) errors.push(`${id}: ${res.error.message || res.error}`);
    } catch (error) {
      errors.push(`${id}: ${error?.message || error}`);
    }
  }
  if (errors.length) console.error('[sales order files] กวาดไฟล์แนบของใบที่ลบแล้วไม่ครบ — แถวกำพร้าค้าง', errors);
  return { count, errors };
}

/* ใบสั่งขายทุกใบของดีล — อ่าน **ก่อน** ลบดีล (หลังลบ cascade ไปแล้วไม่มีอะไรให้ถาม) · คืน `{ ids, error }` */
export async function salesOrderIdsOfDeal(supabase, dealId) {
  if (!dealId) return { ids: [], error: null };
  const { data, error } = await fetchAllResult(() => supabase
    .from('sales_orders').select('id').eq('dealId', dealId).order('id', { ascending: true }));
  if (error) return { ids: [], error: error.message || String(error) };
  return { ids: (data || []).map((row) => row.id), error: null };
}
