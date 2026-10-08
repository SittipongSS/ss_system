// ── สเปคสินค้า + เอกสาร FM-SA-04 — ชั้นอ่าน/เขียนฐาน (mig 0370) ─────────────────
//
// ⭐ มติเจ้าของ 21/09/2569 (docs/fm-sa-04-document-model.md): สเปคเป็นข้อมูลของสินค้า
//   (ไม่มีเลข ไม่มี Rev) · เลขที่ Rev และด่านอนุมัติอยู่ที่เอกสารที่ออกจากบรรทัด SO
//
// ⚠️ **ด่านทั้งหมดอยู่ที่ `productSpecWorkflow.js` / `productSpecDocWorkflow.js`** —
//    ที่นี่หยิบของกับเขียนของเท่านั้น ไม่ตัดสินว่าใครทำอะไรได้
// ⚠️ **supabase ไม่ throw** — ทุก query เช็ค `error` เอง ไม่งั้นด่านที่นับจากผลลัพธ์จะ
//    "เปิดเอง" เมื่อ query พัง (memory: supabase-never-throws)
// ⚠️ ไฟล์นี้เป็นของฝั่ง server เท่านั้น (`server-only` + `node:crypto`) — จอที่ต้องใช้
//    `SPEC_CONTENT_FIELDS` ให้ import จาก `productSpecWorkflow.js`
//
// ── รูปของผลลัพธ์ที่ล้ม (ทุกฟังก์ชันใช้ชุดเดียวกัน) ─────────────────────────
//   `{ error: ข้อความไทย, status }` — status: 400 ข้อมูล/กติกา · 404 ไม่พบ · 409 ชนกัน ·
//   ไม่มี status = ระบบ/ฐานล้ม (ตอบ 500) · ชนกันมี `conflict: true` ติดมาด้วย
//   ⇒ เราต์ตอบ `fail(res.error, res.status || 500)` ได้ตรง ๆ ข้อความไม่หาย
import 'server-only';
import { createHash } from 'node:crypto';
import { genId } from '@/lib/id';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks, fetchInChunks } from '@/lib/supabaseInChunks';
import { accountProfileFromAuthUser } from '@/lib/accountProfile';
import { categoryOf } from '@/lib/master/categoryOf';
import { isGiftSetCategory } from '@/lib/master/giftSetFormulas';
import { loadProductFormulas } from '@/lib/master/giftSetFormulasStore';
import { SPEC_ILLUSTRATION_DOC_TYPE, SPEC_ITEM_IMAGE_DOC_TYPE } from '@/lib/master/attachmentTypes';
import { deleteAttachmentRows } from '@/lib/master/attachments';
import { productSpecCertSeed, productSpecChecklistSeed } from '@/lib/sales/productSpecChecklist';
import { productSpecDocNoParts } from '@/lib/sales/productSpecDocNo';
import {
  illustrationCaption, sortIllustrations, specIllustrationsOf,
} from '@/lib/sales/productSpecIllustrations';
import { SPEC_CONTENT_FIELDS, normalizeProductSpecInput, prepareSpecItemRows } from '@/lib/sales/productSpecWorkflow';
import { docReasonError, revisionPatch } from '@/lib/sales/productSpecDocWorkflow';

// เราต์/สคริปต์ฝั่ง server ที่เคย import จากที่นี่ยังใช้ได้ — ต้นทางจริงอยู่ที่ workflow
export { SPEC_CONTENT_FIELDS };

const CONFLICT_MESSAGE = 'สถานะเปลี่ยนแล้ว กรุณาโหลดใหม่';

const messageOf = (error) => error?.message || String(error || 'ไม่ทราบสาเหตุ');
const isUniqueViolation = (error) => error?.code === '23505' || /duplicate key|unique/i.test(error?.message || '');
const isFkViolation = (error) => error?.code === '23503' || /foreign key|violates.*constraint.*restrict/i.test(error?.message || '');

/* คอลัมน์ของ Rev ที่จออ่าน — ทุกคอลัมน์ยกเว้น `frozenHtml` (กระดาษทั้งแผ่น หลายสิบ KB ต่อ Rev)
   ⚠️ เพิ่มคอลัมน์ใน product_spec_document_revisions เมื่อไร ต้องเติมที่นี่ด้วย
      ไม่งั้นจอไม่เห็นค่านั้นเงียบ ๆ */
const REVISION_COLUMNS = [
  'id', 'documentId', 'revNo', 'status', 'reason', 'snapshot', 'illustrationIds',
  // 🔴 รอยการยื่นที่ลบไม่ได้ (mig 0375) — ด่าน "ลบร่างที่ยังไม่เคยยื่น" อ่านช่องนี้
  //    ตกหล่นเมื่อไร = undefined = "ไม่เคยยื่น" ⇒ ปุ่มลบโผล่บนใบที่ยื่นแล้วดึงกลับ
  'firstSubmittedAt',
  'submittedAt', 'submittedBy', 'submittedByName',
  'aeApprovedAt', 'aeApprovedBy', 'aeApprovedByName',
  'supApprovedAt', 'supApprovedBy', 'supApprovedByName',
  'rejectedAt', 'rejectedBy', 'rejectedByName', 'rejectionReason', 'rejectedStage',
  'supersededAt', 'frozenAt', 'rendererVersion',
  'createdBy', 'createdByName', 'createdAt', 'updatedAt',
].join(', ');

/* Rev แบบย่อสำหรับรายการเอกสาร (หน้าสเปค · การ์ดบนหน้า SO) — ไม่ลากภาพนิ่งมาด้วย
   🔴 **รอยการยื่นครบทุกช่อง** (`SUBMIT_TRACE_FIELDS` ของ productSpecDocWorkflow: `firstSubmittedAt`
      `submittedAt` `aeApprovedAt` `supApprovedAt` `rejectedAt` `frozenAt`) อยู่ในชุดนี้ด้วย ทั้งที่ยังไม่มีจอไหน
      *แสดง* มัน เพราะแถวชุดนี้ **ถูกส่งเข้า `documentActions` จริง** — api/sales-planning/sales-orders/[id]/spec-documents
      ส่ง `doc.latest` ของใบที่บรรทัดถูกถอดเข้าไปเอาทั้ง `.void` และ `.remove` · สองปุ่มนี้เป็นคู่สลับกัน
      (มติ 23/09/2569 "ซ่อนปุ่มยกเลิกช่วงร่าง" — ร่างที่ไม่เคยยื่น = ลบ · นอกนั้น = ยกเลิก)
      ⇒ ช่องไหนตกหล่น ค่าจะเป็น undefined = "ไม่เคยยื่น" (fail-open) ⇒ การ์ดเสนอ "ลบร่าง" บนใบที่ยื่นแล้วดึงกลับ
      และ **ซ่อน "ยกเลิก" ที่เป็นทางออกจริงของมัน** (RPC ปฏิเสธการลบ = ทางตัน) · ยามอยู่ใน
      productSpecDocWorkflow.test.mjs ("ชุดคอลัมน์ Rev ทั้งสองชุดมีรอยการยื่นครบ") */
const REVISION_SUMMARY_COLUMNS = [
  'id', 'documentId', 'revNo', 'status', 'submittedBy', 'submittedAt', 'firstSubmittedAt',
  'aeApprovedAt', 'supApprovedAt', 'rejectedAt', 'frozenAt', 'rejectedStage', 'updatedAt',
].join(', ');

/* SO ต้นเรื่องของเอกสาร — เฉพาะช่องที่ด่าน (สถานะ · origin · ดีล) กับภาพนิ่ง (เลขที่ · ใบเสนอราคา ·
   ใบยืนยัน · กำหนดส่ง · ลูกค้า · ภาษาเอกสาร) ใช้ · 🪤 ไม่ `select('*')` — ทั้งแถวลากยอดเงินมาด้วย ซึ่งด่าน
   historicalMoneyGuards นับเป็นตัวอ่านยอดที่ต้องกรองใบย้อนหลัง ทั้งที่ที่นี่ไม่ได้รวมยอดอะไร
   ⭐ `docLanguage` + คู่อังกฤษของชื่อ/ที่อยู่ (มติผู้ใช้ 2026-09-22) — กระดาษ FM-SA-04 พิมพ์ภาษาเดียวตาม
   ภาษาของ SO แบบใบเสนอราคา/ใบสั่งขาย · คู่อังกฤษเอาของ SO ก่อน ถอยไปใบเสนอราคา (กติกาของ salesOrderPrint) */
const ORDER_COLUMNS = [
  'id', 'orderNumber', 'status', 'origin', 'dealId', 'quotationId', 'customerId', 'customerName',
  'customerNameEn', 'billingAddressEn', 'shippingAddressEn', 'docLanguage',
  'metadata', 'confirmDocType', 'confirmDocNo', 'confirmDocDate', 'deliveryDueDate',
  'ownerId', 'ownerName', 'createdBy', 'revisedFromId', 'supersededById',
].join(', ');

/* ใบเสนอราคาที่ SO ผูก — กล่อง "ผู้ซื้อ / CUSTOMER" ของกระดาษเอาเลขผู้เสียภาษี · สาขา · ที่อยู่ ·
   ผู้ติดต่อจากที่นี่ (sales_orders ไม่เก็บชุดนี้ · salesOrderPrint อ่านจากที่เดียวกัน) · ไม่มียอดเงิน */
const QUOTATION_PARTY_COLUMNS = [
  'id', 'quoteNumber', 'customerNameEn', 'customerTaxId', 'branchCode',
  'billingAddress', 'billingAddressEn', 'shippingAddress', 'shippingAddressEn',
  'contactName', 'contactPhone',
].join(', ');

/* สินค้าที่กระดาษพิมพ์ · `formulaId` = ตัวชี้สูตรที่ FG ผูก (แถว "สูตร / รหัสสูตร / วันที่" · มติ 01/10/2569) ·
   `formulaName/Code/Date` = สำเนาของสูตรบนแถวสินค้า (ใช้เป็นทางถอยเท่านั้น — ดู `loadProductPrintFields`) */
const PRODUCT_PRINT_COLUMNS = [
  'id', 'fgCode', 'productDescription', 'productDescriptionEn', 'brandName', 'brandNameEn',
  'customerName', 'categoryCode', 'volume', 'volumeUnit', 'scentId',
  'formulaId', 'formulaCode', 'formulaName', 'formulaDate',
].join(', ');

/**
 * id ของบรรทัดใบใหม่ตอน SO ออก Rev — **สูตรเดียวกับ RPC ของ SO** (mig 0346/0363)
 * `'SOL-' || md5(<newSoId> || ':' || <oldLineId>)` · md5 ของ Postgres คืน hex ตัวเล็ก
 */
export function revisedOrderLineId(newOrderId, oldLineId) {
  return `SOL-${createHash('md5').update(`${newOrderId}:${oldLineId}`, 'utf8').digest('hex')}`;
}

/* ── สเปคของสินค้า ─────────────────────────────────────────────────────── */

async function loadSpecItems(supabase, specId) {
  const res = await fetchAllResult(() => supabase
    .from('product_spec_items').select('*').eq('specId', specId)
    .order('sortOrder', { ascending: true })
    .order('id', { ascending: true }));
  if (res.error) return { error: messageOf(res.error) };
  return { items: res.data || [] };
}

/** สเปคของสินค้า (พร้อม items) หรือ `null` — ไม่รวมรายการเอกสาร */
export async function loadSpecRecord(supabase, productId) {
  const { data, error } = await supabase
    .from('product_specs').select('*').eq('productId', productId).maybeSingle();
  if (error) return { error: messageOf(error) };
  if (!data) return { spec: null };
  const items = await loadSpecItems(supabase, data.id);
  if (items.error) return { error: items.error };
  return { spec: { ...data, items: items.items } };
}

/* เอกสารตามตัวกรองหนึ่งคอลัมน์ + Rev ล่าสุดของแต่ละใบ + เลขที่ SO ปัจจุบัน */
async function loadDocumentsWhere(supabase, column, value) {
  const res = await fetchAllResult(() => supabase
    .from('product_spec_documents').select('*').eq(column, value)
    .order('createdAt', { ascending: false })
    .order('id', { ascending: true }));
  if (res.error) return { error: messageOf(res.error) };
  const documents = res.data || [];
  if (!documents.length) return { documents: [] };

  let revisions;
  let orders;
  try {
    // ⚠️ ซอยลิสต์ + ไล่หน้า — สินค้าขายดีมีเอกสารโตตามจำนวนบรรทัด SO ไปเรื่อย ๆ
    revisions = await fetchAllInChunks(documents.map((doc) => doc.id), (chunk) => supabase
      .from('product_spec_document_revisions').select(REVISION_SUMMARY_COLUMNS)
      .in('documentId', chunk)
      .order('documentId', { ascending: true })
      .order('revNo', { ascending: false }));
    const orderIds = [...new Set(documents.map((doc) => doc.salesOrderId).filter(Boolean))];
    orders = await fetchAllInChunks(orderIds, (chunk) => supabase
      .from('sales_orders').select('id, orderNumber, status')
      .in('id', chunk)
      .order('id', { ascending: true }));
  } catch (error) {
    return { error: messageOf(error) };
  }

  const latestByDoc = new Map();
  for (const rev of revisions) {
    const seen = latestByDoc.get(rev.documentId);
    if (!seen || rev.revNo > seen.revNo) latestByDoc.set(rev.documentId, rev);
  }
  const orderById = new Map(orders.map((row) => [row.id, row]));
  return {
    documents: documents.map((doc) => ({
      ...doc,
      latest: latestByDoc.get(doc.id) || null,
      orderNumber: orderById.get(doc.salesOrderId)?.orderNumber || null,
      orderStatus: orderById.get(doc.salesOrderId)?.status || null,
    })),
  };
}

/**
 * สเปคของสินค้า (พร้อม items) + เอกสารทุกใบที่ออกจากสินค้านี้ (ใหม่ก่อน · รวมใบที่ void)
 * @returns {{ spec: object|null, documents: object[] } | { error: string }}
 */
export async function loadProductSpec(supabase, productId) {
  const spec = await loadSpecRecord(supabase, productId);
  if (spec.error) return { error: spec.error };
  const docs = await loadDocumentsWhere(supabase, 'productId', productId);
  if (docs.error) return { error: docs.error };
  return { spec: spec.spec, documents: docs.documents };
}

/**
 * ซิงก์สองช่องกระจกลงทะเบียนสินค้า — เรียกทุกครั้งที่บันทึกสเปค (0370 ไม่มีขั้นอนุมัติให้รอแล้ว)
 * และตอนลบสเปค (`spec: null` = ล้างทั้งสองช่อง — กระจกของสเปคที่ไม่มีแล้วคือค่าที่ไม่มีเจ้าของ)
 *
 * ⚠️ ล้มที่นี่ **ไม่ล้มการบันทึก/ลบสเปค** — สเปคคือของจริง กระจกซ่อมได้ด้วยการบันทึกครั้งถัดไป
 *    (ซิงก์ทั้งสองช่องทุกครั้ง ไม่ใช่เฉพาะตอนค่าเปลี่ยน) · แต่ต้องคืนคำเตือนให้จอบอก ไม่ใช่เงียบ
 * ⚠️ ไม่แตะ `products.updatedAt` — นี่คือกระจกของข้อมูลอื่น ไม่ใช่การแก้ทะเบียนสินค้า
 * @param done ข้อความนำของคำเตือน ("บันทึกสเปคแล้ว" · "ลบสเปคแล้ว")
 */
export async function syncProductSpecMirror(supabase, { productId, spec, done = 'บันทึกสเปคแล้ว' }) {
  const { data, error } = await supabase.from('products').update({
    texture: spec?.texture ?? null,
    standardPackaging: spec?.standardPackaging ?? null,
  }).eq('id', productId).select('id').maybeSingle();
  if (error) return { warning: `${done} แต่ซิงก์ลงทะเบียนสินค้าไม่สำเร็จ: ${messageOf(error)}` };
  if (!data) return { warning: `${done} แต่ไม่พบสินค้าในทะเบียนให้ซิงก์` };
  return {};
}

/* checklist ทับทั้งชุด — **ลบของเก่า + เขียนของใหม่ในทรานแซกชันเดียว** (RPC ของ 0370 · ตัวปัจจุบันคือของ 0405)
   🐞 เดิมเขียนใหม่แล้วค่อยลบเก่าเป็นสองคำขอ ⇒ AC กดยื่นแทรกกลางได้ภาพนิ่งที่มี checklist
      สองชุดซ้อนกัน (ตรึงลงกระดาษที่อนุมัติแล้ว) และถ้าขั้นลบล้ม แถวซ้อนค้างจนทุกการบันทึก
      ถัดไปชนด่าน "แถวซ้ำกับแถวก่อนหน้า" · RPC ล็อกแถวสเปคแล้วทำทั้งสองขั้นในคำสั่งเดียว
      คนอ่านเห็นชุดเก่าหรือชุดใหม่ชุดใดชุดหนึ่งเท่านั้น
   ⚠️ คีย์ของแต่ละแถวต้องตรงกับคอลัมน์ที่ RPC อ่านจาก `jsonb_to_record` — คีย์เกิน = ถูกทิ้งเงียบ
      (productSpecItemCostImageMigration.test.mjs เทียบให้)
   ⭐ `costPrice` / `imageAttachmentId` (mig 0405) ใส่ **เฉพาะเมื่อแถวมีคีย์** — คีย์ที่ไม่ใส่ = RPC ยกค่าของแถวเดิมมาให้
      (ห้ามใส่ `undefined` แล้วหวังให้หาย: ที่นี่ JSON ทิ้งให้ก็จริง แต่ `?? null` ตัวเดียวก็กลายเป็น "ล้าง")
   ⭐ `id` ของแถวที่ผ่าน `prepareSpecItemRows` มาแล้วคงเดิมข้ามการบันทึก (ทั้ง id ที่ client ส่งมา และ id ที่จับให้จาก
      itemKey/ชื่อรายการของแถวเดิม) — ที่เหลือออกใหม่ที่นี่ */
async function replaceSpecItems(supabase, specId, items) {
  const rows = items.map((row, index) => {
    const out = {
      id: row.id || genId('PSI'),
      sortOrder: index,
      itemKey: row.itemKey ?? null,
      itemLabel: row.itemLabel,
      detail: row.detail ?? null,
      preparedByS: Boolean(row.preparedByS),
      preparedByCustomer: Boolean(row.preparedByCustomer),
      note: row.note ?? null,
    };
    if ('costPrice' in row) out.costPrice = row.costPrice ?? null;
    if ('imageAttachmentId' in row) out.imageAttachmentId = row.imageAttachmentId ?? null;
    return out;
  });
  const { error } = await supabase.rpc('replace_product_spec_items', { p_spec_id: specId, p_rows: rows });
  if (error) return specItemsRpcFailure(error);
  return { items: rows.map((row) => ({ ...row, specId })) };
}

/* error ของ RPC checklist → ข้อความไทย + status
   ⚠️ ดู `error.code` ก่อนข้อความ — ข้อความของ Postgres เปลี่ยนตามรุ่น/ภาษา แต่ SQLSTATE ไม่เปลี่ยน
   ⚠️ **ห้ามแปะข้อความดิบของ Postgres ลงในคำตอบที่แปลแล้ว** — เราต์อ่านคำว่า "foreign key" ในข้อความที่ไม่มี status
      แล้วตอบ 409 "ไม่พบสเปคนี้" (storeFailure) · และผู้ใช้ไม่ควรเห็นชื่อ constraint
   ⚠️ ข้อมูลผิดทั้งหมด = 400 (ด่านของ `normalizeSpecItems` ควรกันไว้ก่อนแล้ว — ที่นี่คือตาข่ายของฐาน) ·
      error ที่ไม่รู้จัก = ไม่มี status (ระบบล้ม · ตอบ 500 พร้อมข้อความเดิม) */
function specItemsRpcFailure(error) {
  const message = messageOf(error);
  const code = error?.code || '';
  const fail = (text, status) => ({ error: `บันทึก checklist ไม่สำเร็จ: ${text}`, status });
  if (/product_spec_not_found/.test(message)) return fail('ไม่พบสเปคนี้ — อาจถูกลบไปแล้ว', 404);
  if (code === '22P02' || code === '22003' || /invalid input syntax|out of range/i.test(message)) {
    return fail('ราคาทุนหรือรูปของบางแถวมีรูปแบบไม่ถูกต้อง — โหลดหน้าใหม่แล้วลองอีกครั้ง', 400);
  }
  if (code === '23503' || /product_spec_items_image_fk/.test(message)) {
    return fail('รูปของบางแถวถูกลบไปแล้ว — เอารูปออกจากแถวนั้นหรือแนบใหม่ แล้วบันทึกอีกครั้ง', 400);
  }
  if (code === '23514' || /product_spec_items_(cost|text)_check/.test(message)) {
    return fail('ราคาทุนหรือข้อความของบางแถวเกินที่ระบบรับได้', 400);
  }
  if (code === '23505' || /duplicate key/i.test(message)) {
    return fail('รหัสของบางแถวซ้ำกัน — โหลดหน้าใหม่แล้วบันทึกอีกครั้ง', 400);
  }
  return { error: `บันทึก checklist ไม่สำเร็จ: ${message}` };
}

/* ── ราคาทุน + รูปของแถว checklist (mig 0405 · มติเจ้าของ 08/10/2569 — ใช้ในระบบเท่านั้น) ──────────── */

const SPEC_ITEM_MIGRATION_MISSING = 'ฐานข้อมูลยังไม่รองรับราคาทุน/รูปของ checklist — ต้องรัน migration 0405 ก่อน';
/** รูปที่เพิ่งอัปแต่ยังไม่มีแถวชี้ — อาจเป็นของแท็บอื่นที่ยังไม่กดบันทึก ⇒ รอให้พ้นช่วงนี้ก่อนเก็บกวาด */
export const SPEC_ITEM_IMAGE_GRACE_MS = 60 * 60 * 1000;
/** เก็บกวาดต่อการบันทึกหนึ่งครั้งไม่เกินเท่านี้ (คุยกับ Drive ไฟล์ละครั้งในคำขอเดียว) — ที่เหลือรอบถัดไป */
export const SPEC_ITEM_IMAGE_CLEANUP_MAX = 25;

/**
 * รูปของแถว checklist ทุกรูปของสินค้า (แถว attachments · docType `spec_item_image`)
 * @returns {{ images: object[] } | { error: string }}
 */
export async function listSpecItemImages(supabase, productId) {
  const res = await fetchAllResult(() => supabase
    .from('attachments').select('*')
    .eq('entityType', 'product').eq('entityId', productId)
    .eq('docType', SPEC_ITEM_IMAGE_DOC_TYPE)
    .order('id', { ascending: true }));
  if (res.error) return { error: messageOf(res.error) };
  return { images: res.data || [] };
}

const sendsNewColumns = (rows) => rows.some((row) => row.costPrice != null || row.imageAttachmentId != null);

/**
 * ด่านก่อนเขียน checklist — **ต้องผ่านก่อนคำสั่งเขียนตัวแรก** (ไม่มีอะไรให้ถอย)
 *
 * 🔴 ฐานที่ยังไม่รัน 0405: RPC ตัวเก่าทิ้งสองคีย์ใหม่เงียบ แล้ว API จะตอบว่าบันทึกสำเร็จ ⇒ แถวที่เก็บอยู่ไม่มีคีย์
 *    `imageAttachmentId` (อ่านด้วย `select('*')`) + คำขอนี้ส่งราคาทุน/รูปมา = หยุดที่ 503 พร้อมบอกว่าต้องรันอะไร
 *    (สเปคที่ยังไม่มีแถวเลยตรวจทางนี้ไม่ได้ — ตาข่ายคือการอ่านกลับหลังเขียน)
 * 🔴 ตัวชี้รูปทุกตัวต้องเป็นรูปของแถว checklist **ของสินค้านี้** — ไม่งั้นแถวชี้ไฟล์ของสินค้าอื่น/เอกสารชนิดอื่นได้
 *    แล้วตัวเก็บกวาดจะลบไฟล์นั้นทิ้งเมื่อแถวเลิกชี้
 * @returns {{ images: object[]|null } | { error: string, status?: number }}
 */
async function specItemWriteGate(supabase, { productId, rows, storedRows }) {
  if (storedRows.length && !('imageAttachmentId' in storedRows[0]) && sendsNewColumns(rows)) {
    return { error: SPEC_ITEM_MIGRATION_MISSING, status: 503 };
  }
  if (!rows.some((row) => row.imageAttachmentId)) return { images: null };
  const listed = await listSpecItemImages(supabase, productId);
  if (listed.error) return { error: `ตรวจรูปของ checklist ไม่สำเร็จ จึงยังไม่บันทึก: ${listed.error}` };
  const known = new Set(listed.images.map((att) => String(att.id).toLowerCase()));
  for (const [index, row] of rows.entries()) {
    if (row.imageAttachmentId && !known.has(row.imageAttachmentId)) {
      return {
        error: `ไม่พบรูปของ checklist แถวที่ ${index + 1} — อาจถูกลบไปแล้ว แนบรูปใหม่แล้วบันทึกอีกครั้ง`,
        status: 400,
      };
    }
  }
  return { images: listed.images };
}

/* อ่านกลับหลังเขียนแล้วเทียบ: ราคาทุน/รูปที่ส่งไป "ถึงฐานจริง" ไหม — แถวที่อ่านกลับไม่มีคีย์ = RPC ตัวเก่าทิ้งไป */
function sentColumnsLost(sentRows, storedRows) {
  const byId = new Map(storedRows.map((row) => [row.id, row]));
  return sentRows.some((row) => {
    const stored = byId.get(row.id);
    if (row.costPrice != null && !(stored && 'costPrice' in stored)) return true;
    if (row.imageAttachmentId != null && !(stored && 'imageAttachmentId' in stored)) return true;
    return false;
  });
}

const olderThanGrace = (createdAt, now) => {
  const age = Date.parse(now) - Date.parse(createdAt);
  // ⚠️ ไม่รู้อายุ (createdAt ว่าง/อ่านไม่ออก) = เก็บไว้ — ลบไฟล์ที่ไม่แน่ใจคือความเสียหายที่กู้ไม่ได้
  return Number.isFinite(age) && age > SPEC_ITEM_IMAGE_GRACE_MS;
};

/**
 * เก็บกวาดรูปของแถวที่ไม่มีแถวไหนชี้แล้ว — **หลังบันทึกสำเร็จเท่านั้น และไม่มีวันทำให้การบันทึกล้ม**
 *
 * ลบเมื่อ (ก) แถวที่เก็บอยู่ก่อนการบันทึกนี้ชี้อยู่ แล้วชุดใหม่ไม่ชี้ (ผู้ใช้เอารูปออก/เปลี่ยนรูป/ลบแถว) หรือ
 * (ข) ไม่มีใครชี้และอัปมาเกินหนึ่งชั่วโมง (แนบแล้วปิดหน้าไปโดยไม่บันทึก)
 * 🔴 **ทำเฉพาะเมื่อคำขอมีแถว และส่งคีย์ `imageAttachmentId` มาครบทุกแถว** (`explicitImages`) — จอรุ่นก่อน/แท็บที่เปิดค้าง
 *    ข้าม deploy ไม่รู้จักรูปของแถว และไม่ส่ง id ของแถวมาด้วย: แถวของมันถูกจับคู่กับของเดิมด้วย itemKey หรือ (แถวที่
 *    เพิ่มเอง) ชื่อรายการที่ตรงกันเป๊ะ (`prepareSpecItemRows` + RPC ของ 0405) ⇒ ตัวชี้หลุดได้ทางเดียวคือผู้เรียกแบบนั้น
 *    **แก้ชื่อแถวที่เพิ่มเอง** (หรือลบแถว) — ถ้าเก็บกวาดตอนนั้น = ลบไฟล์โดยคนที่ไม่เคยเห็นว่ามีรูปอยู่
 *    · ลิสต์ว่าง (ลบทุกแถว) ก็ไม่เก็บกวาด — ไม่มีแถวให้รู้ว่าผู้เรียกรู้จักรูปไหม (รูปที่ค้างไปกับกฎอายุรอบถัดไป/ตอนลบสเปค)
 * 🔴 และเฉพาะเมื่อแถวที่อ่านกลับ **มีคีย์** `imageAttachmentId` — ฐานที่ยังไม่รัน 0405 ไม่มีแถวไหนชี้อะไรได้เลย
 *    ⇒ ทุกรูปดู "ไม่มีใครชี้" ทั้งหมด
 */
async function cleanupSpecItemImages(supabase, {
  productId, readBack, storedRows, explicitImages, images, now, releaseFile,
}) {
  try {
    if (!explicitImages || !productId) return;
    const sample = readBack[0] || storedRows[0];
    if (sample && !('imageAttachmentId' in sample)) return;
    let list = images;
    if (!list) {
      const listed = await listSpecItemImages(supabase, productId);
      if (listed.error) {
        console.error('[productSpec] อ่านรูปของแถว checklist เพื่อเก็บกวาดไม่สำเร็จ', productId, listed.error);
        return;
      }
      list = listed.images;
    }
    const pointed = new Set(readBack.map((row) => row.imageAttachmentId).filter(Boolean));
    const pointedBefore = new Set(storedRows.map((row) => row.imageAttachmentId).filter(Boolean));
    const doomed = list
      .filter((att) => !pointed.has(att.id))
      .filter((att) => pointedBefore.has(att.id) || olderThanGrace(att.createdAt, now))
      .slice(0, SPEC_ITEM_IMAGE_CLEANUP_MAX);
    if (!doomed.length) return;
    await deleteAttachmentRows(supabase, doomed, releaseFile ? { release: releaseFile } : undefined);
  } catch (err) {
    console.error('[productSpec] เก็บกวาดรูปของแถว checklist ไม่สำเร็จ', productId, err?.message);
  }
}

/**
 * สร้างสเปคของสินค้า — ครั้งเดียวต่อสินค้า (`productId` UNIQUE)
 *
 * ⭐ ไม่ส่ง checklist/เอกสารที่ขอได้มา = ได้แถวตั้งต้นของกระดาษ (17 + 4 แถว)
 *    🐞 `productSpecCertSeed` เคยไม่มีใครเรียก ⇒ สเปคที่สร้างได้ตารางเอกสารว่าง ทั้งที่กระดาษมีสี่แถวเสมอ
 * ⭐ `id` ของแถวที่ client ส่งมา **ไม่ถึง RPC เลย** (ยังไม่มีแถวที่เก็บอยู่ให้เป็นเจ้าของ id — `prepareSpecItemRows`)
 * @param input `{ content, certifications?, items? }` — ผ่าน `normalizeProductSpecInput` ที่นี่อีกรอบ
 * @param canEditItemCost แก้ราคาทุนรายแถวได้ไหม (เราต์ตัดสิน) — ไม่ได้ = ราคาทุนที่ส่งมาถูกข้าม ไม่ใช่ error
 * @returns {{ spec: object, warning?: string } | { error: string, status?: number, conflict?: true }}
 */
export async function createProductSpec(supabase, {
  productId, input = {}, user, now = new Date().toISOString(), canEditItemCost = false, releaseFile,
}) {
  const normalized = normalizeProductSpecInput(input);
  if (normalized.error) return { error: normalized.error, status: 400 };
  const { content, certifications, items } = normalized.value;

  const prepared = prepareSpecItemRows(
    items?.length ? items : productSpecChecklistSeed(), [], { canEditCost: canEditItemCost },
  );
  const gate = await specItemWriteGate(supabase, { productId, rows: prepared.rows, storedRows: [] });
  if (gate.error) return gate;

  const specId = genId('PSP');
  const { data, error } = await supabase.from('product_specs').insert({
    id: specId,
    productId,
    ...content,
    certifications: certifications?.length ? certifications : productSpecCertSeed(),
    createdBy: user?.id || null,
    createdByName: user?.name || null,
    updatedBy: user?.id || null,
    updatedByName: user?.name || null,
    createdAt: now,
    updatedAt: now,
  }).select('*').maybeSingle();
  if (error) {
    // 🔴 หนึ่งสินค้าหนึ่งสเปค — สองแท็บกดสร้างพร้อมกัน ใบที่สองชน UNIQUE
    if (isUniqueViolation(error)) return { error: 'สินค้าชิ้นนี้มีสเปคอยู่แล้ว — โหลดหน้าใหม่', status: 409, conflict: true };
    return { error: `สร้างสเปคไม่สำเร็จ: ${messageOf(error)}` };
  }

  /* ⚠️ สเปคที่ไม่มี checklist คือใบครึ่งเดียว — ถอยแถวสเปคที่เพิ่งสร้างทิ้ง (ยังไม่มีเอกสาร
     อ้างถึงแน่นอน) ให้กดสร้างใหม่ได้สะอาด ๆ แทนที่จะค้างใบเปล่าไว้ */
  const rollBack = async (failure) => {
    const rollback = await supabase.from('product_specs').delete().eq('id', specId);
    const tail = rollback.error ? ` (ถอยสเปคที่สร้างค้างไว้ไม่สำเร็จ: ${messageOf(rollback.error)})` : '';
    return { error: `${failure.error}${tail}`, ...(failure.status ? { status: failure.status } : {}) };
  };

  const saved = await replaceSpecItems(supabase, specId, prepared.rows);
  if (saved.error) return rollBack(saved);

  // อ่านกลับ — ราคาทุน/รูปที่ส่งไปไม่ถึงฐาน (ยังไม่รัน 0405) = ถอยทั้งใบ ไม่ทิ้งสเปคที่เสียค่าที่เพิ่งกรอกไว้เงียบ ๆ
  const readBack = await loadSpecItems(supabase, specId);
  if (!readBack.error && sentColumnsLost(saved.items, readBack.items)) {
    return rollBack({ error: SPEC_ITEM_MIGRATION_MISSING, status: 503 });
  }
  const savedItems = readBack.error ? saved.items : readBack.items;
  if (!readBack.error) {
    await cleanupSpecItemImages(supabase, {
      productId, readBack: readBack.items, storedRows: [], explicitImages: prepared.explicitImages,
      images: gate.images, now, releaseFile,
    });
  }

  const mirror = await syncProductSpecMirror(supabase, { productId, spec: data });
  return { spec: { ...data, items: savedItems }, ...(mirror.warning ? { warning: mirror.warning } : {}) };
}

/**
 * บันทึกสเปค — ช่องเนื้อหาที่ส่งมา · `certifications`/`items` ที่ส่งมา = ทับทั้งชุด
 *
 * ⚠️ ไม่แตะเอกสารที่ยื่น/อนุมัติแล้ว (เอกสารถือภาพนิ่งของตัวเอง) — ร่างที่ยังไม่ยื่นเห็นค่าใหม่ทันที
 * ⭐ checklist (mig 0405): `spec.items` = แถวที่เก็บอยู่ก่อนบันทึก (เราต์โหลดมาเป็น `before`) ใช้ตัดสิน id ·
 *    ด่านตัวชี้รูป · และการเก็บกวาดรูป · `items` ของผลลัพธ์ = แถวที่ **อ่านกลับจากฐาน** หลังเขียน (ราคาทุน/รูปที่ RPC
 *    ยกมาจากแถวเดิมจึงอยู่ครบทั้งใน audit และคำตอบ)
 * @param expectedUpdatedAt ส่งมา = กันเขียนทับคนอื่น (ไม่ตรง ⇒ 409)
 * @param canEditItemCost แก้ราคาทุนรายแถวได้ไหม (เราต์ตัดสิน) — ไม่ได้ = ราคาทุนเดิมคงอยู่ทุกแถว
 * @returns {{ spec: object, warning?: string } | { error: string, status?: number, conflict?: true }}
 */
export async function saveProductSpec(supabase, {
  spec, input = {}, user, now = new Date().toISOString(), expectedUpdatedAt = null,
  canEditItemCost = false, releaseFile,
}) {
  if (!spec?.id) return { error: 'สินค้านี้ยังไม่มีสเปค', status: 404 };
  const normalized = normalizeProductSpecInput(input);
  if (normalized.error) return { error: normalized.error, status: 400 };
  const { content, certifications, items } = normalized.value;

  // ⚠️ ด่านของ checklist ทั้งหมดอยู่ **ก่อนคำสั่งเขียนตัวแรก** — เนื้อสเปคเข้าไปแล้วค่อยรู้ว่ารูปไม่ผ่าน = บันทึกครึ่งเดียว
  const storedRows = Array.isArray(spec.items) ? spec.items : [];
  let prepared = null;
  let gate = null;
  if (items !== undefined) {
    prepared = prepareSpecItemRows(items, storedRows, { canEditCost: canEditItemCost });
    gate = await specItemWriteGate(supabase, { productId: spec.productId, rows: prepared.rows, storedRows });
    if (gate.error) return gate;
  }

  /* 🪤 ชื่อ `specPatch` ไม่ใช่ `patch` โดยตั้งใจ — `check:columns` หาคีย์ของตัวแปรที่เขียนลงตาราง
     จาก `const <ชื่อ> =` ตัวล่าสุดก่อนจุดเขียน · `transitionRevision` ข้างล่างรับ `patch` เป็นพารามิเตอร์
     (ไม่มี `const patch`) ⇒ ถ้าที่นี่ชื่อ `patch` สคริปต์จะเอาคีย์ของสเปคไปเทียบกับตาราง Rev แล้วแดงผิด */
  const specPatch = {
    ...content,
    updatedBy: user?.id || null,
    updatedByName: user?.name || null,
    updatedAt: now,
  };
  if (certifications !== undefined) specPatch.certifications = certifications;

  let query = supabase.from('product_specs').update(specPatch).eq('id', spec.id);
  if (expectedUpdatedAt) query = query.eq('updatedAt', expectedUpdatedAt);
  const { data, error } = await query.select('*').maybeSingle();
  if (error) return { error: `บันทึกสเปคไม่สำเร็จ: ${messageOf(error)}` };
  if (!data) {
    return expectedUpdatedAt
      ? { error: 'สเปคถูกแก้โดยคนอื่นระหว่างนี้ — โหลดหน้าใหม่ก่อนบันทึก', status: 409, conflict: true }
      : { error: 'ไม่พบสเปคนี้ — อาจถูกลบไปแล้ว', status: 404 };
  }

  let savedItems;
  if (prepared) {
    const saved = await replaceSpecItems(supabase, spec.id, prepared.rows);
    if (saved.error) {
      return { error: `บันทึกเนื้อสเปคแล้ว แต่ ${saved.error}`, ...(saved.status ? { status: saved.status } : {}) };
    }
    const readBack = await loadSpecItems(supabase, spec.id);
    if (readBack.error) {
      // เขียนสำเร็จแล้ว — อ่านกลับไม่ขึ้นไม่ใช่เหตุให้ตอบว่าบันทึกล้ม · คืนแถวที่ส่งไป และ **ไม่เก็บกวาดรูป** (ไม่รู้ว่าฐานเก็บอะไรจริง)
      savedItems = saved.items;
    } else {
      // 🔴 ราคาทุน/รูปที่ส่งไปไม่ถึงฐาน = RPC ตัวเก่า (ยังไม่รัน 0405) — บอกดัง ๆ และห้ามเก็บกวาดรูป
      if (sentColumnsLost(saved.items, readBack.items)) return { error: SPEC_ITEM_MIGRATION_MISSING, status: 503 };
      savedItems = readBack.items;
      await cleanupSpecItemImages(supabase, {
        productId: data.productId || spec.productId, readBack: readBack.items, storedRows,
        explicitImages: prepared.explicitImages, images: gate.images, now, releaseFile,
      });
    }
  } else {
    const loaded = await loadSpecItems(supabase, spec.id);
    if (loaded.error) return { error: loaded.error };
    savedItems = loaded.items;
  }

  const mirror = await syncProductSpecMirror(supabase, { productId: data.productId, spec: data });
  return { spec: { ...data, items: savedItems }, ...(mirror.warning ? { warning: mirror.warning } : {}) };
}

/**
 * ลบสเปค (checklist หายตาม CASCADE) — ด่านอยู่ที่ `productSpecDeleteBlock`
 *
 * 🔴 ฐานกันซ้ำด้วย FK `ON DELETE RESTRICT` ของ product_spec_documents — ด่านข้างนอกพลาด
 *    (สองแท็บ: อีกแท็บเพิ่งออกเอกสาร) ก็ลบไม่ได้ ตอบเป็นภาษาคน
 * ⚠️ ลบแล้วต้องล้างกระจกบนทะเบียนสินค้าด้วย — ไม่งั้นหน้าสินค้ายังโชว์ "ลักษณะเนื้อสาร/
 *    บรรจุภัณฑ์มาตรฐาน" ของสเปคที่ไม่มีแล้ว · ล้างไม่ผ่าน = ลบสำเร็จพร้อม `warning`
 * @returns {{ deleted: true, spec: object, warning?: string } | { error: string, status?: number }}
 */
export async function deleteProductSpec(supabase, { spec, releaseFile }) {
  if (!spec?.id) return { error: 'สินค้านี้ยังไม่มีสเปค', status: 404 };
  const { data, error } = await supabase.from('product_specs').delete().eq('id', spec.id).select('*').maybeSingle();
  if (error) {
    if (isFkViolation(error)) return { error: 'ลบสเปคไม่ได้ เพราะมีเอกสารที่ออกจากสเปคนี้แล้ว', status: 400 };
    return { error: `ลบสเปคไม่สำเร็จ: ${messageOf(error)}` };
  }
  if (!data) return { error: 'ไม่พบสเปคนี้ — อาจถูกลบไปแล้ว', status: 404 };
  const productId = data.productId || spec.productId;
  /* รูปของแถว checklist ตายตามสเปค (mig 0405) — แถวหายตาม CASCADE แล้ว ไม่มีอะไรชี้รูปพวกนี้อีก
     ⚠️ เฉพาะ docType `spec_item_image` — **ภาพประกอบของกระดาษยังอยู่กับสินค้าตามเดิม** (Rev ที่ยื่นแล้วอ้างอยู่)
     ⚠️ ล้มที่นี่ไม่ล้มการลบสเปค — ไฟล์ค้างเก็บได้ทีหลัง สเปคที่ลบไปแล้วเอากลับไม่ได้ */
  if (productId) {
    const images = await listSpecItemImages(supabase, productId);
    if (images.error) {
      console.error('[productSpec] ลบสเปคแล้ว แต่อ่านรูปของแถว checklist เพื่อลบตามไม่สำเร็จ', productId, images.error);
    } else {
      await deleteAttachmentRows(supabase, images.images, releaseFile ? { release: releaseFile } : undefined);
    }
  }
  const mirror = await syncProductSpecMirror(supabase, {
    productId, spec: null, done: 'ลบสเปคแล้ว',
  });
  return { deleted: true, spec: data, ...(mirror.warning ? { warning: mirror.warning } : {}) };
}

/* ── ภาพนิ่งของเอกสาร ──────────────────────────────────────────────────── */

/**
 * ช่องสินค้าที่กระดาษพิมพ์ — ประกอบเสร็จแล้ว (หมวด · กลิ่น · ขนาด เป็นข้อความพร้อมพิมพ์) + ชิ้นดิบของสูตรที่ FG ผูก
 *
 * ⚠️ ที่เดียวที่รู้ว่ากระดาษพิมพ์อะไรของสินค้า — ภาพนิ่งตอนยื่น กับร่างที่พิมพ์สด ต้องได้
 *    ก้อนเดียวกัน ไม่งั้นร่างกับฉบับที่อนุมัติแล้วพิมพ์คนละหน้าตา
 * ⚠️ query ย่อย (หมวด/กลิ่น/สูตร) ล้ม = คืน error ไม่ใช่ข้ามไป — ภาพนิ่งที่ตกช่องไปเงียบ ๆ
 *    คือกระดาษที่ลูกค้าเซ็นแล้วมีช่องว่างที่ไม่ควรว่าง
 *
 * ⭐ **สูตร: แหล่งจริง = แถวสดในทะเบียนสูตร (`formulas`) ไม่ใช่สำเนาบนแถวสินค้า** (มติเจ้าของ 01/10/2569 —
 *    แถว "สูตร / รหัสสูตร / วันที่" ของกระดาษ · ตัวประกอบแถวอยู่ที่ `productSpecFormulaRow.js`)
 *    · `products.formulaName/Code/Date` เป็นสำเนาที่ `productFormulaSnapshot` เขียน **เฉพาะตอนมีคนบันทึก FG** —
 *      RD แก้ชื่อ/ออกรหัส/แก้วันที่ที่ทะเบียนสูตรทีหลัง สำเนาไม่ตาม (`updateFormula` ไม่แตะ products) ⇒ อ่านสำเนา =
 *      กระดาษพิมพ์ของเก่าเงียบ ๆ จนกว่าจะมีใครเปิด FG มากดบันทึก · ของจริงบน prod วันนี้: "Secret Valley #1" ยังไม่มีรหัส
 *      (สูตรสถานะร่าง) — วันที่ RD ออกรหัส กระดาษร่าง/ใบที่ยื่นถัดไปต้องได้รหัสนั้นเอง
 *    · กลิ่นในแถวเดียวกันก็อ่านสดจากทะเบียนกลิ่นอยู่แล้ว — แถวเดียวกันต้องไม่มาจากแหล่งสองแบบ
 *    · ความนิ่งของกระดาษ **ไม่ได้** มาจากสำเนาบนสินค้า แต่มาจากภาพนิ่งของ Rev ที่ถ่ายตอนยื่น (สูตรถูกแก้ทีหลัง
 *      ใบที่ยื่นไปแล้วไม่เปลี่ยน) ⇒ อ่านสดที่นี่ไม่ทำให้เอกสารที่ยื่นแล้วขยับ
 *    · ทางถอย: `formulaId` ชี้อยู่แต่หาแถวสูตรไม่เจอ (ไม่ควรเกิด — FK ลบสูตรแล้ว formulaId เป็น NULL เอง) ⇒ ใช้สำเนา
 *      บนแถวสินค้า ดีกว่าทิ้งแถวไปกลิ่นทั้งที่ FG บอกว่าผูกสูตร · อ่านทะเบียนสูตร **ล้ม** = error (ไม่ถอยเงียบ)
 *    · FG ไม่ผูกสูตร (`formulaId` ว่าง) ⇒ ช่องสูตรทั้งสี่เป็น `null` — กระดาษถอยไปแถวกลิ่นเดิมเมื่อมีกลิ่น ·
 *      ไม่มีกลิ่นด้วย = ป้ายใหม่ + N/A · **ไม่** ยก `products.formulaName` ลอย ๆ มาเป็นสูตร (สินค้ารุ่นก่อนทะเบียนสูตร
 *      พิมพ์ชื่อกลิ่นไว้ในช่องนั้น)
 *    · ⚠️ **คีย์ช่องสูตรทั้งสี่ต้องอยู่ในก้อนเสมอ แม้เป็น `null`** — `productSpecFormulaRow` ใช้ "มีคีย์ `formulaId`" แยกของใหม่
 *      ออกจากภาพนิ่งที่ยื่นก่อน 01/10/2569 (ซึ่งต้องคงป้ายกลิ่นเดิม) · ตัดคีย์ทิ้งตอนว่าง = ใบใหม่ถูกอ่านเป็นใบเก่า
 * ⚠️ ช่องกลิ่น (`scentName` · `scentCode` · `scentText`) คงไว้ทุกตัว ความหมายเดิม — แถวกลิ่นของ FG ที่ไม่ผูกสูตร
 *    และภาพนิ่ง/ผู้อ่านเดิมยังใช้
 */
export async function loadProductPrintFields(supabase, productId) {
  const { data: product, error } = await supabase
    .from('products').select(PRODUCT_PRINT_COLUMNS).eq('id', productId).maybeSingle();
  if (error) return { error: messageOf(error) };
  if (!product) return { error: 'ไม่พบสินค้าชิ้นนี้', status: 404 };

  const category = categoryOf(product.fgCode) || product.categoryCode || '';
  const [main, type] = String(category).split('-');
  let typeRow = null;
  if (main && type) {
    const res = await supabase.from('product_types')
      .select('mainCategoryCode, typeCode, nameTh, nameEn')
      .eq('mainCategoryCode', main).eq('typeCode', type)
      .limit(1);
    if (res.error) return { error: messageOf(res.error) };
    typeRow = res.data?.[0] || null;
  }
  let scent = null;
  if (product.scentId) {
    const res = await supabase.from('scents').select('code, name').eq('id', product.scentId).maybeSingle();
    if (res.error) return { error: messageOf(res.error) };
    scent = res.data || null;
  }
  // สูตรที่ FG ผูก — แถวสดจากทะเบียนสูตร (เหตุผลที่หัวฟังก์ชัน) · หาไม่เจอ = สำเนาบนแถวสินค้า
  let formula = null;
  if (product.formulaId) {
    const res = await supabase.from('formulas').select('id, code, name, formulaDate').eq('id', product.formulaId).maybeSingle();
    if (res.error) return { error: `อ่านสูตรของสินค้าไม่สำเร็จ: ${messageOf(res.error)}` };
    formula = res.data
      || { id: product.formulaId, code: product.formulaCode, name: product.formulaName, formulaDate: product.formulaDate };
  }
  /* ⭐ ชุดของขวัญ (01-037 · mig 0403 · มติ 2026-10-05) — ไม่มีสูตรหลัก สูตรเป็นรายการ (หมวด, สูตร) ⇒ กระดาษพิมพ์
     ทุกสูตร แถวละสูตร บอกหมวด (`productSpecFormulaRows`) · อ่านสดจากทะเบียนเหมือนสูตรเดี่ยวด้านบน
     ⚠️ คีย์ `formulaComponents` มีเฉพาะชุดของขวัญ — สินค้าหมวดอื่นได้ก้อนเดิมทุกตัวอักษร (ภาพนิ่งเดิมไม่ขยับ) */
  let formulaComponents = null;
  if (isGiftSetCategory(category)) {
    try {
      // ชื่อหมวดของแถว = ไทยก่อน (ป้ายแถวในตารางไม่แปล — กติกาเดียวกับป้าย "สูตร / รหัสสูตร / วันที่")
      formulaComponents = (await loadProductFormulas(supabase, product.id)).map((row) => ({
        categoryCode: row.categoryCode,
        categoryName: row.categoryName,
        formulaId: row.formulaId,
        formulaName: row.formulaName,
        formulaCode: row.formulaCode,
        formulaDate: row.formulaDate,
      }));
    } catch (e) {
      return { error: `อ่านสูตรในชุดของขวัญไม่สำเร็จ: ${messageOf(e)}` };
    }
  }

  return {
    product: {
      id: product.id,
      fgCode: product.fgCode || null,
      productDescription: product.productDescription || null,
      productDescriptionEn: product.productDescriptionEn || null,
      brandName: product.brandName || null,
      brandNameEn: product.brandNameEn || null,
      customerName: product.customerName || null,
      categoryCode: category || null,
      categoryName: typeRow
        ? [typeRow.nameEn, typeRow.nameTh].filter(Boolean).join(' · ')
        : (category || null),
      scentName: scent?.name || product.formulaName || null,
      scentCode: scent?.code || product.formulaCode || null,
      scentText: [scent?.name || product.formulaName, scent?.code || product.formulaCode]
        .filter(Boolean).join(' | ') || null,
      // ⭐ ชิ้นดิบของสูตรที่ผูก (ไม่ผูก = null ทั้งสี่) — ไม่ประกอบเป็นข้อความที่นี่ เพราะวันที่พิมพ์ตามภาษาของใบ
      formulaId: formula?.id || null,
      formulaName: formula?.name || null,
      formulaCode: formula?.code || null,
      formulaDate: formula?.formulaDate || null,
      ...(formulaComponents ? { formulaComponents } : {}),
      volume: product.volume ?? null,
      volumeUnit: product.volumeUnit || null,
      volumeText: [product.volume, product.volumeUnit].filter((part) => part !== null && part !== undefined && part !== '')
        .join(' ') || null,
    },
  };
}

/**
 * ภาพประกอบของสินค้าที่ยังใช้อยู่ — เรียงแบบเดียวกับจอ (`sortIllustrations`)
 *
 * ⚠️ รูปที่ปลดระวางแล้ว (`metadata.retiredAt`) ไม่เข้าภาพนิ่งใหม่ — มันอยู่ต่อเพื่อให้
 *    กระดาษ Rev เก่าที่อ้างอยู่ยังเปิดรูปได้เท่านั้น
 * @returns {{ illustrations: {attachmentId, caption, sortOrder, fileName}[] } | { error: string }}
 */
export async function loadSpecIllustrations(supabase, productId) {
  const res = await fetchAllResult(() => supabase
    .from('attachments').select('*')
    .eq('entityType', 'product').eq('entityId', productId)
    .eq('docType', SPEC_ILLUSTRATION_DOC_TYPE)
    .order('createdAt', { ascending: true })
    .order('id', { ascending: true }));
  if (res.error) return { error: messageOf(res.error) };
  const live = specIllustrationsOf(res.data || []).filter((row) => !row?.metadata?.retiredAt);
  return {
    illustrations: sortIllustrations(live).map((row, index) => ({
      attachmentId: row.id,
      caption: illustrationCaption(row),
      sortOrder: index,
      fileName: row.fileName || null,
    })),
  };
}

/**
 * AE เจ้าของดีลของ SO — `sales_deals.ownerId` (ไม่ใช่ `sales_orders.ownerId` ที่แช่ไว้ตอนอนุมัติ
 * เพื่อรายงานยอด · มติ 21/09 ให้ขั้น AE เป็นของเจ้าของดีล)
 *
 * ⚠️ deal query ล้ม = คืน error ไม่ใช่ `null` — `null` แปลว่า "ไม่มีเจ้าของ" ซึ่งซ่อนปุ่มอนุมัติ
 *    ของเจ้าของดีลตัวจริงเงียบ ๆ · ส่วนอีเมล/เบอร์จากบัญชีอ่านแบบ best effort (ใช้พิมพ์เท่านั้น)
 * @returns {{ dealOwner: {id, name, email, phone} | null } | { error: string }}
 */
export async function loadDealOwner(supabase, salesOrder) {
  if (!salesOrder?.dealId) return { dealOwner: null };
  const { data: deal, error } = await supabase
    .from('sales_deals').select('id, ownerId, ownerName').eq('id', salesOrder.dealId).maybeSingle();
  if (error) return { error: messageOf(error) };
  if (!deal?.ownerId) return { dealOwner: null };
  let profile = null;
  try {
    const res = await supabase.auth?.admin?.getUserById?.(deal.ownerId);
    if (res && !res.error && res.data?.user) profile = accountProfileFromAuthUser(res.data.user);
  } catch {
    profile = null; // บัญชีอ่านไม่ได้ = ใช้ชื่อที่ดีลแช่ไว้ (อีเมล/เบอร์เป็นขีดบนกระดาษ)
  }
  return {
    dealOwner: {
      id: deal.ownerId,
      name: profile?.name || deal.ownerName || null,
      email: profile?.email || null,
      phone: profile?.phone || null,
    },
  };
}

/* ใบเสนอราคาที่ SO ผูก — ⚠️ อ่านล้ม = error ไม่ใช่ `null` · `null` แปลว่า "ไม่มีใบเสนอราคา" ซึ่งทำให้
   กล่องผู้ซื้อบนกระดาษที่ลูกค้าเซ็นว่างทั้งกล่อง (เลขผู้เสียภาษี/ที่อยู่เป็นขีด) โดยไม่มีใครรู้
   ⭐ ส่งออกให้หน้า "ออกเอกสาร" (`spec-documents/new`) อ่านเลขที่ใบเสนอราคาด้วยกติกาเดียวกับกระดาษ
      (`specDocQuotationNumber`) — จอกับกระดาษร่างต้องพิมพ์เลขเดียวกัน */
export async function loadOrderQuotation(supabase, order) {
  if (!order?.quotationId) return { quotation: null };
  const { data, error } = await supabase
    .from('quotations').select(QUOTATION_PARTY_COLUMNS).eq('id', order.quotationId).maybeSingle();
  if (error) return { error: `อ่านใบเสนอราคาของใบสั่งขายไม่สำเร็จ: ${messageOf(error)}` };
  return { quotation: data || null };
}

/**
 * ลูกค้าบนกระดาษ (กล่อง "ผู้ซื้อ / CUSTOMER") — เก็บ **ทั้งสองภาษาดิบ** ให้ตัวพิมพ์เลือกตามภาษาของใบเอง
 *
 * ⭐ ที่มาชุดเดียวกับ `salesOrderPrint` (ใบสั่งขายที่ลูกค้าถือคู่กัน): ชื่อไทย = SO · คู่อังกฤษ = SO ก่อน
 *    ถอยไปใบเสนอราคา · เลขผู้เสียภาษี/สาขา/ที่อยู่ไทย/ผู้ติดต่อ = ใบเสนอราคาที่ผูก
 * ⚠️ `branchCode` เป็น `null` เมื่อไม่มีใบเสนอราคาให้อ่าน (ตัวอย่างจากหน้าสินค้า) — คนละความหมายกับ `''`
 *    ของใบเสนอราคาที่ไม่ได้กรอกสาขา (= สำนักงานใหญ่ '00000') · ตัวพิมพ์พิมพ์ขีดเฉพาะ `null`
 */
function snapshotCustomer({ order, quotation, product }) {
  return {
    name: order?.customerName || product?.customerName || null,
    nameEn: order?.customerNameEn || quotation?.customerNameEn || null,
    taxId: quotation?.customerTaxId || null,
    branchCode: quotation ? (quotation.branchCode ?? '') : null,
    billingAddress: quotation?.billingAddress || null,
    billingAddressEn: order?.billingAddressEn || quotation?.billingAddressEn || null,
    shippingAddress: quotation?.shippingAddress || null,
    shippingAddressEn: order?.shippingAddressEn || quotation?.shippingAddressEn || null,
    contactName: quotation?.contactName || null,
    contactPhone: quotation?.contactPhone || null,
  };
}

/**
 * เลขที่ใบเสนอราคาบนเอกสาร — เลขที่ SO แช่ไว้ตอนออกใบก่อน (ใบเสนอราคาออก Rev ทีหลังได้) · ไม่มีค่อยอ่านจากใบที่ผูก
 * ⚠️ ตัวเดียวที่ภาพนิ่ง (กระดาษ) และหน้า "ออกเอกสาร" ใช้ — ต่อเองที่ปลายทางเมื่อไร จอกับกระดาษพิมพ์คนละเลข
 */
export const specDocQuotationNumber = (order, quotation) => order?.metadata?.quoteNumber || quotation?.quoteNumber || null;

const ITEM_SNAPSHOT_FIELDS = ['sortOrder', 'itemKey', 'itemLabel', 'detail', 'preparedByS', 'preparedByCustomer', 'note'];

const hasQty = (value) => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));

/**
 * "จำนวนผลิต" ของเอกสาร — จำนวน + หน่วยของบรรทัด SO · บรรทัดไม่มีจำนวน (หรือบรรทัดถูกถอด) ⇒ บรรทัดใบเสนอราคา
 * ที่ SO ผูก (มติผู้ใช้ 2026-09-22 "จำนวนผลิต ดึงมาจาก QT SO")
 *
 * ⭐ บรรทัดใบเสนอราคา: ตัวที่บรรทัด SO ชี้ (`quotationLineId`) ก่อน **ถ้าเป็นสินค้าเดียวกัน** · ไม่มี/หาไม่เจอ/คนละสินค้า
 *    = บรรทัดแรกของสินค้าเดียวกัน
 *    ในใบเสนอราคาที่ SO ผูก · ไม่มีทั้งคู่ = null (กระดาษพิมพ์ N/A)
 * ⚠️ อ่านใบเสนอราคาล้ม = error ไม่ใช่ null — null บนกระดาษคือ "ไม่มีจำนวน" ซึ่งไม่จริง
 * @returns {{ qty, unit, source: 'sales_order_line'|'quotation_line'|null } | { error: string }}
 */
export async function loadDocumentQuantity(supabase, { order = null, line = null, productId = null } = {}) {
  if (line && hasQty(line.qty)) return { qty: line.qty, unit: line.unit || null, source: 'sales_order_line' };
  if (!order?.quotationId) return { qty: null, unit: null, source: null };
  const pick = async (column, value) => {
    const { data, error } = await supabase.from('quotation_lines')
      .select('id, quotationId, productId, qty, unit, sortOrder')
      .eq('quotationId', order.quotationId)
      .eq(column, value)
      .order('sortOrder', { ascending: true })
      .order('id', { ascending: true })
      .limit(1);
    if (error) return { error: `อ่านบรรทัดใบเสนอราคาไม่สำเร็จ: ${messageOf(error)}` };
    return { row: data?.[0] || null };
  };
  let found = line?.quotationLineId ? await pick('id', line.quotationLineId) : { row: null };
  if (found.error) return { error: found.error };
  /* 🐞 (ตรวจรอบสาม) บรรทัดที่ SO ชี้ต้องเป็น **สินค้าเดียวกัน** — ลิงก์ที่เพี้ยน (ชี้บรรทัดของสินค้าอื่น) เคยได้จำนวนของ
     สินค้าอื่นมาพิมพ์เป็น "จำนวนผลิต" บนกระดาษที่ลูกค้าเซ็น ⇒ ไม่ตรงถือว่าไม่เจอ แล้วถอยไปค้นสินค้าเดียวกันตามปกติ
     ⚠️ บรรทัดใบเสนอราคาที่ไม่มี productId (บรรทัดพิมพ์เอง) ยังเชื่อลิงก์ — ลิงก์ตรงเป็นหลักฐานเดียวที่มี */
  if (found.row && productId && found.row.productId && found.row.productId !== productId) found = { row: null };
  if (!found.row && productId) found = await pick('productId', productId);
  if (found.error) return { error: found.error };
  if (!found.row || !hasQty(found.row.qty)) return { qty: null, unit: null, source: null };
  return { qty: found.row.qty, unit: found.row.unit || null, source: 'quotation_line' };
}

/**
 * ภาพนิ่งของเอกสาร — ถ่ายตอนยื่นทุกครั้ง และใช้พิมพ์ร่าง/ตัวอย่างสดด้วยก้อนเดียวกัน
 *
 * `{ schemaVersion, capturedAt, spec: {ช่องเนื้อหา..., certifications}, items: [...],
 *    product: {ช่องที่กระดาษพิมพ์ — รวม formulaId/formulaName/formulaCode/formulaDate ของสูตรที่ FG ผูก (01/10/2569)},
 *    order: {orderNumber, quotationNumber, confirmDocType, confirmDocNo,
 *    confirmDocDate, qty, unit, qtySource, deliveryDueDate, customerName, docLanguage, dealOwner*...},
 *    customer: {name, nameEn, taxId, branchCode, billingAddress(En), shippingAddress(En), contactName,
 *    contactPhone}, illustrations: [{attachmentId, caption, sortOrder, fileName}] }`
 *
 * ⭐ schemaVersion 2 (2026-09-22) = เพิ่ม `order.docLanguage` · `order.confirmDocType` · ก้อน `customer`
 *    (กระดาษตามภาษาของ SO + กล่องผู้ซื้อแบบใบเสนอราคา) · ภาพนิ่ง v1 ไม่มีคีย์เหล่านี้ ⇒ ตัวพิมพ์ต้อง
 *    ถอยเป็นไทย/ขีดเอง (ไม่มีใบจริงบนฐานตอนเปลี่ยน แต่กติกาภาพนิ่งคือห้ามเขียนทับ ⇒ ต้องอ่านของเก่าได้เสมอ)
 * ⭐ 01/10/2569 เพิ่มช่องสูตรในก้อน `product` (คีย์เพิ่มแบบไม่บังคับ ⇒ schemaVersion ยัง 2 — กติกาเดียวกับ `order.qty`) ·
 *    ภาพนิ่งที่ยื่นก่อนวันนั้นไม่มีคีย์เหล่านี้ ⇒ ตัวพิมพ์ถอยไปแถวกลิ่นจาก `scentText` ของภาพนิ่งเอง
 * ⚠️ `order`/`line` ว่างได้ (ตัวอย่างจากหน้าสเปคที่ยังไม่มี SO) — ก้อน `order`/`customer` ยังมีทุกคีย์
 *    เป็น null ให้ตัวพิมพ์อ่านรูปเดียวกันเสมอ · ภาษาเป็น null = ไทย
 * @returns {{ snapshot: object, illustrationIds: string[] } | { error: string, status?: number }}
 */
export async function buildDocumentSnapshot(supabase, {
  productId, order = null, line = null, dealOwner = null, now = new Date().toISOString(),
}) {
  const specRes = await loadSpecRecord(supabase, productId);
  if (specRes.error) return { error: specRes.error };
  if (!specRes.spec) return { error: 'สินค้านี้ยังไม่มีสเปค — สร้างสเปคที่หน้าสินค้าก่อน', status: 400 };
  const spec = specRes.spec;

  const productRes = await loadProductPrintFields(supabase, productId);
  if (productRes.error) return { error: productRes.error, status: productRes.status };
  const quote = order ? await loadOrderQuotation(supabase, order) : { quotation: null };
  if (quote.error) return { error: quote.error };
  const quotation = quote.quotation;
  const ill = await loadSpecIllustrations(supabase, productId);
  if (ill.error) return { error: ill.error };
  const quantity = order ? await loadDocumentQuantity(supabase, { order, line, productId }) : { qty: null, unit: null, source: null };
  if (quantity.error) return { error: quantity.error };

  const snapshot = {
    schemaVersion: 2,
    capturedAt: now,
    spec: {
      ...Object.fromEntries(SPEC_CONTENT_FIELDS.map((field) => [field, spec[field] ?? null])),
      certifications: Array.isArray(spec.certifications) ? spec.certifications : [],
    },
    items: (spec.items || []).map((row) => Object.fromEntries(
      ITEM_SNAPSHOT_FIELDS.map((field) => [field, row[field] ?? null]),
    )),
    product: productRes.product,
    order: {
      salesOrderId: order?.id || null,
      salesOrderLineId: line?.id || null,
      orderNumber: order?.orderNumber || null,
      // เลขที่ที่ SO แช่ไว้ตอนออกใบก่อน (ใบเสนอราคาออก Rev ทีหลังได้) · ไม่มีค่อยอ่านจากใบที่ผูก
      quotationNumber: specDocQuotationNumber(order, quotation),
      confirmDocType: order?.confirmDocType || null,
      confirmDocNo: order?.confirmDocNo || null,
      confirmDocDate: order?.confirmDocDate || null,
      // จำนวนผลิต (Product Overview) — บรรทัด SO ก่อน ถอยไปบรรทัดใบเสนอราคา · `qtySource` บอกว่ามาจากไหน
      qty: quantity.qty ?? null,
      unit: quantity.unit || null,
      qtySource: quantity.source,
      lineDescription: line?.description || null,
      deliveryDueDate: order?.deliveryDueDate || null,
      customerName: order?.customerName || productRes.product.customerName || null,
      // ภาษาของกระดาษ = ภาษาของ SO (ไม่มี SO = ตัวอย่างจากหน้าสินค้า = null = ไทย)
      docLanguage: order ? (order.docLanguage === 'en' ? 'en' : 'th') : null,
      // ผู้ติดต่อฝ่ายขาย (กล่องอ้างอิง) = AE เจ้าของดีล (ไม่ใช่คนที่เปิดดู)
      dealOwnerId: dealOwner?.id || null,
      dealOwnerName: dealOwner?.name || null,
      dealOwnerEmail: dealOwner?.email || null,
      dealOwnerPhone: dealOwner?.phone || null,
    },
    customer: snapshotCustomer({ order, quotation, product: productRes.product }),
    illustrations: ill.illustrations,
  };
  return { snapshot, illustrationIds: ill.illustrations.map((row) => row.attachmentId) };
}

/* ── เอกสาร ────────────────────────────────────────────────────────────── */

/**
 * เอกสารหนึ่งใบพร้อมทุกอย่างที่หน้าเอกสาร/ด่านต้องใช้
 *
 * @param opts.includeFrozenHtml `true` = ดึง `frozenHtml` มาด้วย (เฉพาะเราต์พิมพ์)
 * @returns {{ document, revisions (revNo มากไปน้อย), latest, approved, salesOrder, dealOwner, product }
 *   | { error: string, status?: number }}
 */
export async function loadSpecDocument(supabase, documentId, { includeFrozenHtml = false } = {}) {
  const { data: document, error } = await supabase
    .from('product_spec_documents').select('*').eq('id', documentId).maybeSingle();
  if (error) return { error: messageOf(error) };
  if (!document) return { error: 'ไม่พบเอกสารนี้', status: 404 };

  const revs = await fetchAllResult(() => supabase
    .from('product_spec_document_revisions')
    .select(includeFrozenHtml ? `${REVISION_COLUMNS}, frozenHtml` : REVISION_COLUMNS)
    .eq('documentId', documentId)
    .order('revNo', { ascending: false }));
  if (revs.error) return { error: messageOf(revs.error) };
  const revisions = revs.data || [];

  let salesOrder = null;
  if (document.salesOrderId) {
    const res = await supabase.from('sales_orders').select(ORDER_COLUMNS).eq('id', document.salesOrderId).maybeSingle();
    if (res.error) return { error: messageOf(res.error) };
    salesOrder = res.data || null;
  }
  const owner = await loadDealOwner(supabase, salesOrder);
  if (owner.error) return { error: owner.error };

  const productRes = await supabase.from('products')
    .select('id, fgCode, productDescription, productDescriptionEn, brandName, brandNameEn, customerName, categoryCode, team, ownerId')
    .eq('id', document.productId).maybeSingle();
  if (productRes.error) return { error: messageOf(productRes.error) };

  return {
    document,
    revisions,
    latest: revisions[0] || null,
    approved: revisions.find((row) => row.status === 'approved') || null,
    salesOrder,
    dealOwner: owner.dealOwner,
    product: productRes.data || null,
  };
}

/**
 * เอกสารทุกใบของ SO หนึ่งใบ (รวมใบที่ void และใบที่บรรทัดถูกถอด) พร้อม Rev ล่าสุด
 * @returns {{ documents: object[] } | { error: string }}
 */
export async function loadDocumentsForOrder(supabase, salesOrderId) {
  return loadDocumentsWhere(supabase, 'salesOrderId', salesOrderId);
}

/**
 * เอกสารที่ยังไม่ void ของบรรทัด SO หนึ่งบรรทัด (`id` · `docNo` · `status`) หรือ `null`
 *
 * ⭐ ตัวเดียวที่ทั้งการออกเลขจริง (`POST .../spec-documents`) และหน้า "ออกเอกสาร" (`GET .../spec-documents/new`)
 *    ถาม — ต่างกันเมื่อไร หน้าจะบอกว่าออกได้ แล้วปุ่มบันทึกโดนตีกลับว่า "ออกไปแล้ว"
 * ⚠️ unique index ของ 0370 การันตีไม่เกินหนึ่งใบต่อบรรทัด · อ่านไม่ขึ้น = error ไม่ใช่ `null` — ด่านที่อ่าน
 *    ไม่ขึ้นต้องไม่ "เปิดเอง" (ถือว่ายังไม่มีเอกสาร = เสนอให้ออกซ้ำ)
 * @returns {{ document: {id, docNo, status} | null } | { error: string }}
 */
export async function loadLiveDocumentForLine(supabase, salesOrderLineId) {
  if (!salesOrderLineId) return { document: null };
  const { data, error } = await supabase.from('product_spec_documents')
    .select('id, docNo, status')
    .eq('salesOrderLineId', salesOrderLineId)
    .neq('status', 'void')
    .limit(1);
  if (error) return { error: messageOf(error) };
  return { document: data?.[0] || null };
}

function mapCreateDocumentError(error) {
  const text = messageOf(error);
  const exists = text.match(/product_spec_document_exists:\s*(\S+)/);
  if (exists) return { error: `บรรทัดนี้ออกเอกสารไปแล้ว (${exists[1]})`, status: 409, conflict: true };
  if (isUniqueViolation(error)) return { error: 'บรรทัดนี้ออกเอกสารไปแล้ว — โหลดหน้าใหม่', status: 409, conflict: true };
  if (/sales_order_not_approved/.test(text)) {
    return { error: 'ใบสั่งขายยังไม่อยู่สถานะอนุมัติ — ออกเอกสารได้หลังใบสั่งขายอนุมัติแล้ว', status: 400 };
  }
  if (/sales_order_historical/.test(text)) {
    return { error: 'ใบสั่งขายย้อนหลังไม่ออกใบสเปคสินค้า — ใบนี้คีย์จากเอกสารเดิมที่ส่งของไปแล้ว', status: 400 };
  }
  if (/sales_order_not_found/.test(text)) return { error: 'ไม่พบใบสั่งขายนี้', status: 404 };
  if (/sales_order_line_not_found|sales_order_line_required/.test(text)) {
    return { error: 'ไม่พบบรรทัดนี้ในใบสั่งขาย — โหลดหน้าใหม่', status: 400 };
  }
  if (/sales_order_line_product_mismatch|product_spec_product_mismatch/.test(text)) {
    return { error: 'สินค้าของบรรทัดไม่ตรงกับสเปค — โหลดหน้าใหม่แล้วลองอีกครั้ง', status: 400 };
  }
  if (/product_spec_not_found/.test(text)) return { error: 'ไม่พบสเปคของสินค้านี้ — อาจถูกลบไปแล้ว', status: 400 };
  if (/monthly_sequence_exhausted/.test(text)) {
    return { error: 'เลขที่เอกสาร FM-SA-04 ของเดือนนี้เต็มแล้ว — แจ้งผู้ดูแลระบบ', status: 409 };
  }
  return { error: `ออกเอกสารไม่สำเร็จ: ${text}` };
}

/**
 * ออกเอกสาร — RPC ออกเลข + เอกสาร + Rev.00 draft ในทรานแซกชันเดียว (0370 ⑨)
 *
 * ⚠️ ด่าน (`documentCreateGate`) ต้องผ่านมาก่อนแล้ว — RPC กันซ้ำอีกชั้น (SO อนุมัติ ·
 *    บรรทัดอยู่ในใบ · สินค้าตรงสเปค · บรรทัดยังไม่มีเอกสาร) แล้วตอบเป็นภาษาคนที่นี่
 * @returns {{ document: object, revision: object } | { error: string, status?: number, conflict?: true }}
 */
export async function createSpecDocument(supabase, {
  spec, product, order, line, user, now = new Date(),
}) {
  const { month, prefix, like, width } = productSpecDocNoParts(now instanceof Date ? now : new Date(now));
  const { data, error } = await supabase.rpc('create_product_spec_document', {
    p_document_id: genId('PSD'),
    p_revision_id: genId('PSDR'),
    p_spec_id: spec?.id || null,
    p_product_id: product?.id || spec?.productId || null,
    p_month: month,
    p_prefix: prefix,
    p_like: like,
    p_width: width,
    p_payload: {
      salesOrderId: order?.id || null,
      salesOrderLineId: line?.id || null,
      createdBy: user?.id || null,
      createdByName: user?.name || null,
    },
  });
  if (error) return mapCreateDocumentError(error);
  if (!data?.document || !data?.revision) return { error: 'ออกเอกสารไม่สำเร็จ: ฐานข้อมูลไม่คืนเอกสารที่สร้าง' };
  return { document: data.document, revision: data.revision };
}

/**
 * เปลี่ยนสถานะ Rev — `.eq('status', เดิม)` และต้อง **โดนแถวจริง**
 *
 * 🔴 UPDATE ที่ไม่โดนแถวไม่ใช่ error ของ supabase — ไม่เช็คเอง = ตอบ "สำเร็จ" ทั้งที่อีกคน
 *    ดึงกลับ/ตีกลับไปก่อนแล้ว ⇒ `null` = 409 "สถานะเปลี่ยนแล้ว กรุณาโหลดใหม่"
 * 🔴 ยามของ 0370 (`guard_product_spec_document_revision`) ล็อกเอกสารกับ SO แล้วตรวจซ้ำตอนเดินหน้า
 *    (ยื่น · อนุมัติสองขั้น) — เอกสารถูก void หรือ SO หลุดสถานะอนุมัติระหว่างที่คำขอนี้วิ่งอยู่
 *    = ฐานปฏิเสธ ⇒ แปลเป็น 409 ภาษาคน ไม่ใช่ 500 ภาษาอังกฤษ
 * @param patch ใช้ก้อนจาก `revisionPatch(action, ...)` ของ productSpecDocWorkflow
 * @returns {{ row: object } | { conflict: true, error: string, status: 409 } | { error: string }}
 */
export async function transitionRevision(supabase, { revision, patch }) {
  if (!revision?.id || !revision?.status) return { error: 'ไม่พบ Rev. ของเอกสาร', status: 404 };
  const { data, error } = await supabase.from('product_spec_document_revisions')
    .update(patch)
    .eq('id', revision.id)
    .eq('status', revision.status)
    .select(REVISION_COLUMNS)
    .maybeSingle();
  if (error) {
    const text = messageOf(error);
    if (/product_spec_document_not_active/.test(text)) {
      return { conflict: true, error: 'เอกสารนี้ถูกยกเลิกไปแล้วระหว่างนี้ — ทำรายการต่อไม่ได้ กรุณาโหลดใหม่', status: 409 };
    }
    if (/sales_order_not_approved/.test(text)) {
      return { conflict: true, error: 'ใบสั่งขายของเอกสารนี้ไม่อยู่สถานะอนุมัติแล้ว — ทำรายการต่อไม่ได้ กรุณาโหลดใหม่', status: 409 };
    }
    return { error: text };
  }
  if (!data) return { conflict: true, error: CONFLICT_MESSAGE, status: 409 };
  return { row: data };
}

/**
 * หลัง AE Sup อนุมัติ Rev สำเร็จ: Rev ที่อนุมัติก่อนหน้าเป็น `superseded` + `currentRevNo` = Rev นี้
 *
 * ⚠️ เรียก **หลัง** `transitionRevision(sup_approve)` สำเร็จเท่านั้น — กลับลำดับแล้ว approve
 *    ชนสถานะ = เอกสารไม่มี Rev ที่อนุมัติเหลือสักใบ (ฉบับเดิมถูกแทนไปแล้วแต่ฉบับใหม่ไม่ผ่าน)
 * @returns {{ superseded: number } | { error: string }}
 */
export async function applyFinalApproval(supabase, {
  document, revision, now = new Date().toISOString(),
}) {
  if (!document?.id || !revision?.id) return { error: 'ไม่พบเอกสารหรือ Rev. ที่อนุมัติ', status: 404 };
  const sup = await supabase.from('product_spec_document_revisions')
    .update({ status: 'superseded', supersededAt: now, updatedAt: now })
    .eq('documentId', document.id)
    .eq('status', 'approved')
    .neq('id', revision.id)
    .select('id, revNo');
  if (sup.error) return { error: `ปิด Rev. ก่อนหน้าไม่สำเร็จ: ${messageOf(sup.error)}` };
  const bump = await supabase.from('product_spec_documents')
    .update({ currentRevNo: revision.revNo, updatedAt: now })
    .eq('id', document.id)
    .select('id')
    .maybeSingle();
  if (bump.error) return { error: `อัปเดต Rev. ปัจจุบันของเอกสารไม่สำเร็จ: ${messageOf(bump.error)}` };
  if (!bump.data) return { error: 'ไม่พบเอกสารให้อัปเดต Rev. ปัจจุบัน', status: 404 };
  return { superseded: (sup.data || []).length };
}

/**
 * เปิด Rev ถัดไป (draft) ต่อจาก Rev ที่อนุมัติแล้ว — เลขที่เดิม
 *
 * ⚠️ unique index "Rev ที่ยังไม่จบมีได้ทีละหนึ่ง" กันกดซ้ำ/สองแท็บ ⇒ ชน = 409 ไม่ใช่ 500
 * @returns {{ revision: object } | { error: string, status?: number, conflict?: true }}
 */
export async function openNextRevision(supabase, {
  document, fromRevision, reason, user, now = new Date().toISOString(),
}) {
  const reasonError = docReasonError(reason, { label: 'เหตุผลที่แก้ไขเอกสาร' });
  if (reasonError) return { error: reasonError, status: 400 };
  if (!document?.id || !fromRevision) return { error: 'ไม่พบ Rev. ต้นทางของเอกสาร', status: 404 };
  const { data, error } = await supabase.from('product_spec_document_revisions').insert({
    id: genId('PSDR'),
    documentId: document.id,
    revNo: Number(fromRevision.revNo) + 1,
    status: 'draft',
    reason: String(reason).trim(),
    createdBy: user?.id || null,
    createdByName: user?.name || null,
    createdAt: now,
    updatedAt: now,
  }).select(REVISION_COLUMNS).maybeSingle();
  if (error) {
    if (isUniqueViolation(error)) {
      return { error: 'เอกสารนี้มี Rev. ที่ยังไม่จบอยู่แล้ว — โหลดหน้าใหม่', status: 409, conflict: true };
    }
    return { error: `เปิด Rev. ใหม่ไม่สำเร็จ: ${messageOf(error)}` };
  }
  return { revision: data };
}

const voidPatch = ({ reason, user, now }) => ({
  status: 'void',
  voidedAt: now,
  voidedBy: user?.id || null,
  voidedByName: user?.name || null,
  voidReason: String(reason || '').trim(),
  updatedAt: now,
});

/**
 * ยกเลิกเอกสารหนึ่งใบ (ปุ่ม "ยกเลิกเอกสาร") — void คือปลายทาง เลขที่ไม่นำกลับมาใช้
 * @returns {{ document: object } | { conflict: true, error: string, status: 409 } | { error: string, status?: number }}
 */
export async function voidDocument(supabase, {
  document, reason, user, now = new Date().toISOString(),
}) {
  if (!document?.id) return { error: 'ไม่พบเอกสารนี้', status: 404 };
  const reasonError = docReasonError(reason, { label: 'เหตุผลที่ยกเลิกเอกสาร' });
  if (reasonError) return { error: reasonError, status: 400 };
  const { data, error } = await supabase.from('product_spec_documents')
    .update(voidPatch({ reason, user, now }))
    .eq('id', document.id)
    .eq('status', 'active')
    .select('*')
    .maybeSingle();
  if (error) return { error: `ยกเลิกเอกสารไม่สำเร็จ: ${messageOf(error)}` };
  if (!data) return { conflict: true, error: CONFLICT_MESSAGE, status: 409 };
  return { document: data };
}

/* ── ลบร่างที่ยังไม่เคยยื่น (มติ 23/09/2569 · mig 0375) ────────────────────── */

/**
 * ข้อความของฐานตอนปฏิเสธการลบ → ภาษาคน
 *
 * ⚠️ ยามของ 0370/0375 อยู่บน trigger + ใน RPC ⇒ error ที่ขึ้นมาเป็นสตริงดิบภาษาอังกฤษ
 *    ปล่อยผ่านเมื่อไร คนกดจะเห็น `product_spec_document_draft_delete_forbidden: …` บน toast
 * 🔴 ทุกเหตุที่ลบไม่ได้ใช้คำนำหน้าเดียว (`..._draft_delete_forbidden`) แล้วต่อเหตุไทยหลัง `—`
 *    ⇒ ที่นี่ตัดเอาเฉพาะเหตุไทยมาเป็นข้อความบนจอ · **409 ทุกกรณี** เพราะมันคือ "ของจริง
 *    เปลี่ยนไปแล้ว/ไม่ใช่ของที่ลบได้" ไม่ใช่คำขอที่ประกอบผิด
 */
function mapDeleteDraftError(error) {
  const text = messageOf(error);
  if (/product_spec_document_not_found/.test(text)) {
    return { error: 'ไม่พบเอกสารนี้ — อาจถูกลบไปแล้ว โหลดหน้าใหม่', status: 404 };
  }
  const forbidden = text.match(/product_spec_document_draft_delete_forbidden:\s*\S+\s*—\s*([\s\S]+)/);
  if (forbidden) {
    return { conflict: true, status: 409, error: `ลบร่างไม่ได้ — ${forbidden[1].trim()}` };
  }
  /* ยามของ 0375 ข้อ ⑤ (Rev หายเดี่ยว ๆ) กับยาม DELETE ของ 0370 — ถึงที่นี่ได้แปลว่ามีคนลบนอกทาง RPC
     ⇒ ไม่ใช่เรื่องของคนกด แต่ต้องไม่เงียบ */
  if (/product_spec_document(_revision)?(_orphan)?_delete/.test(text)) {
    return { conflict: true, status: 409, error: `ลบร่างไม่ได้ — ฐานข้อมูลปฏิเสธการลบ: ${text}` };
  }
  return { error: `ลบร่างไม่สำเร็จ: ${text}` };
}

/**
 * ลบร่างที่ยังไม่เคยยื่น — เอกสาร + Rev.00 ในทรานแซกชันเดียวผ่าน RPC ของ 0375
 *
 * ⚠️ **ด่านของคน (`documentActions().remove`) ต้องผ่านมาก่อนแล้ว** — RPC ตรวจซ้ำทุกข้อที่ฐาน
 *    โดยล็อกแถว Rev ก่อนแล้วค่อยล็อกเอกสาร (ลำดับเดียวกับทางยื่น) ⇒ คนที่กด "ยื่น" แทรก
 *    ระหว่างทางจะถูกเห็นเสมอ และ RPC ปฏิเสธแทนที่จะลบทับ
 * ⚠️ **ไม่แตะ `entity_number_counters`** — เลขที่ที่ลบไปแล้วเป็นรูถาวรตามมติ (เหมือนใบเสนอราคา)
 * ⚠️ คืนแถวที่ลบจริงกลับมาให้เราต์เขียน `audit_logs.before` — ระบบไม่มีถังขยะ นี่คือทางกู้ทางเดียว
 * @returns {{ docNo: string, document: object, revision: object }
 *   | { conflict?: true, error: string, status?: number }}
 */
export async function deleteDraftDocument(supabase, { document }) {
  if (!document?.id) return { error: 'ไม่พบเอกสารนี้', status: 404 };
  const { data, error } = await supabase.rpc('delete_product_spec_document_draft', {
    p_document_id: document.id,
  });
  if (error) return mapDeleteDraftError(error);
  /* RPC คืนก้อนเสมอเมื่อสำเร็จ — ไม่มีก้อน = ผิดสัญญา ห้ามตอบว่า "ลบแล้ว" เพราะ audit จะไม่มีของกู้ */
  if (!data?.document || !data?.revision) {
    return { error: 'ลบร่างไม่สำเร็จ: ฐานข้อมูลไม่คืนแถวที่ลบ — แจ้งผู้ดูแลระบบ' };
  }
  return { docNo: data.docNo || document.docNo || null, document: data.document, revision: data.revision };
}

/**
 * SO ถูกยกเลิก ⇒ เอกสารทุกใบที่ยัง active ของ SO นั้นเป็น void (เหตุผล `ใบสั่งขาย <เลข> ถูกยกเลิก`)
 *
 * ⚠️ hook เรียกหลัง RPC ของ SO สำเร็จ · ล้ม = SO ยังสำเร็จ แต่เราต์ต้องตอบ warning + audit
 * @returns {{ voided: number, documents: {id, docNo}[] } | { error: string }}
 */
export async function voidDocumentsForOrder(supabase, {
  salesOrderId, reason, user, now = new Date().toISOString(),
}) {
  if (!salesOrderId) return { error: 'ไม่ระบุใบสั่งขาย', status: 400 };
  const text = String(reason || '').trim();
  if (!text) return { error: 'ต้องระบุเหตุผลที่ยกเลิกเอกสาร', status: 400 };
  const { data, error } = await supabase.from('product_spec_documents')
    .update(voidPatch({ reason: text.slice(0, 500), user, now }))
    .eq('salesOrderId', salesOrderId)
    .eq('status', 'active')
    .select('id, docNo');
  if (error) return { error: `ยกเลิกเอกสารใบสเปคของใบสั่งขายไม่สำเร็จ: ${messageOf(error)}` };
  return { voided: (data || []).length, documents: data || [] };
}

/**
 * เอกสารที่ยัง active ของ SO หนึ่งใบ (`id` + `docNo`) — ผู้ดูแลระบบจดไว้ก่อนบังคับลบ SO
 *
 * ⚠️ อ่านไม่ขึ้น = error ไม่ใช่ "ไม่มีเอกสาร" — ถือว่าไม่มีแล้วลบ SO ต่อ = เอกสารที่ออกเลขไปแล้ว
 *    หลุดจาก SO (FK SET NULL) ทั้งที่ยัง active และไม่มีใครรู้ว่าต้องไปยกเลิก
 * @returns {{ documents: {id, docNo}[] } | { error: string }}
 */
export async function activeDocumentsForOrder(supabase, salesOrderId) {
  if (!salesOrderId) return { documents: [] };
  const res = await fetchAllResult(() => supabase
    .from('product_spec_documents').select('id, docNo')
    .eq('salesOrderId', salesOrderId).eq('status', 'active')
    .order('id', { ascending: true }));
  if (res.error) return { error: messageOf(res.error) };
  return { documents: res.data || [] };
}

/**
 * void เอกสารตามรายการ id — ทางของ SO ที่ถูกบังคับลบ (ลบแล้ว FK SET NULL ล้าง `salesOrderId`
 * ไปแล้ว หาตาม SO ไม่ได้อีก ⇒ ผู้เรียกจด id ไว้ก่อนด้วย `activeDocumentsForOrder`)
 *
 * ⚠️ `.eq('status', 'active')` — ใบที่ถูก void ไปแล้วระหว่างนั้นไม่ถูกเขียนทับเหตุผล
 * @returns {{ voided: number, documents: {id, docNo}[] } | { error: string }}
 */
export async function voidDocumentsByIds(supabase, {
  documentIds, reason, user, now = new Date().toISOString(),
}) {
  const ids = [...new Set((documentIds || []).filter(Boolean))];
  if (!ids.length) return { voided: 0, documents: [] };
  const text = String(reason || '').trim();
  if (!text) return { error: 'ต้องระบุเหตุผลที่ยกเลิกเอกสาร', status: 400 };
  const res = await fetchInChunks(ids, (chunk) => supabase.from('product_spec_documents')
    .update(voidPatch({ reason: text.slice(0, 500), user, now }))
    .in('id', chunk)
    .eq('status', 'active')
    .select('id, docNo'));
  if (res.error) return { error: `ยกเลิกเอกสารใบสเปคไม่สำเร็จ: ${messageOf(res.error)}` };
  return { voided: (res.data || []).length, documents: res.data || [] };
}

/**
 * รูปในภาพนิ่งยังอยู่ครบไหม — ตรวจ **หลัง** เขียนภาพนิ่งลง Rev ตอนยื่น
 *
 * 🔴 ทำไมต้องตรวจซ้ำ: ยื่นอ่านรายการรูปก่อน แล้วค่อยเขียน `illustrationIds` ทีหลัง ⇒ มีคนลบรูป
 *    แทรกกลางได้ (ด่านของหน้าลบรูปยังไม่เห็น Rev ที่ยื่น เพราะยังไม่ commit) ⇒ กระดาษที่อนุมัติ
 *    ทีหลังชี้รูปที่ไม่มีแล้วตลอดกาล · ฝั่งลบรูปประทับปลดระวางก่อนแล้วตรวจซ้ำอีกรอบ (attachments
 *    route) ⇒ รูปที่ **หายไป หรือถูกปลดระวางระหว่างนั้น** นับว่าไม่ครบ ให้ผู้ยื่นถอยแล้วยื่นใหม่
 * ⚠️ อ่านไม่ขึ้น = error ไม่ใช่ "ครบ" — ถือว่าครบแล้วปล่อยผ่าน คือทางที่รูปบนกระดาษหายจริง
 * @returns {{ missing: string[] } | { error: string }}
 */
export async function missingSnapshotIllustrations(supabase, illustrationIds) {
  const ids = [...new Set((illustrationIds || []).filter(Boolean))];
  if (!ids.length) return { missing: [] };
  let rows;
  try {
    rows = await fetchAllInChunks(ids, (chunk) => supabase
      .from('attachments').select('id, metadata')
      .in('id', chunk)
      .order('id', { ascending: true }));
  } catch (error) {
    return { error: messageOf(error) };
  }
  const live = new Set(rows.filter((row) => !row?.metadata?.retiredAt).map((row) => row.id));
  return { missing: ids.filter((id) => !live.has(id)) };
}

/**
 * SO ออก Rev (ได้ SO เลขใหม่) ⇒ เอกสารย้ายไปผูกใบใหม่ เลขที่เดิม
 *
 * กติกาต่อใบ (มติ 21/09):
 *   · Rev ล่าสุด `approved` ⇒ เปิด Rev+1 draft เหตุผล `ออก Rev. ใบสั่งขาย <เก่า> → <ใหม่>`
 *   · Rev ล่าสุด `pending_*` ⇒ ถอยเป็น draft (Rev เดิม · ล้างตราประทับยื่น/AE)
 *   · `draft` / `rejected` ⇒ คงไว้
 *   · หาบรรทัดคู่ในใบใหม่ไม่เจอ ⇒ ย้ายไปแบบไม่มีบรรทัด (โผล่เป็นแถว "บรรทัดถูกถอด" บนหน้า SO
 *     ให้ยกเลิกได้) + คำเตือน · Rev ที่รออนุมัติยัง **ถอยเป็นร่างเหมือนใบอื่น** (ไม่งั้นคิวอนุมัติ
 *     ค้างใบที่ไม่มีวันอนุมัติได้ และผู้อนุมัติถือแจ้งเตือนเก่าไว้) · แต่ Rev ที่อนุมัติแล้ว
 *     **ไม่เปิด Rev+1** — ทางออกเดียวของใบที่บรรทัดหายคือยกเลิก (ด่านเดินหน้าปิดเพราะไม่มีบรรทัด)
 *     และ Rev ลบไม่ได้ ⇒ Rev+1 ที่ยื่นไม่ได้ตลอดกาลจะค้างอยู่ในประวัติเปล่า ๆ
 *     (มติบันทึกไว้ใน docs/fm-sa-04-document-model.md หัวข้อ "จังหวะจาก SO")
 *
 * ⚠️ ทำทีละใบ และ **ใบที่ล้มไม่หยุดใบอื่น** — ข้อผิดพลาดรายใบเข้า `warnings` (+ นับ `failed`)
 *    ให้เราต์เขียน audit/คำเตือน · error ระดับบน (อ่านรายการไม่ได้) เท่านั้นที่คืน `{ error }`
 * ⚠️ รันซ้ำได้ — ใบที่ย้ายไปแล้วไม่ผูก SO เดิม จึงไม่ถูกหยิบซ้ำ
 * @returns {{ moved: number, failed: number, warnings: string[], documents: {id, docNo, outcome}[] }
 *   | { error: string, status?: number }}
 *   outcome: revised · reset · kept · orphaned (บรรทัดหาย ไม่แตะ Rev) · orphaned_reset (บรรทัดหาย +
 *   ถอย Rev ที่รออนุมัติเป็นร่าง) · failed · skipped
 */
export async function moveDocumentsToRevisedOrder(supabase, {
  oldOrderId, newOrder, user, now = new Date().toISOString(),
}) {
  if (!oldOrderId || !newOrder?.id) return { error: 'ต้องระบุใบสั่งขายเดิมและใบใหม่', status: 400 };

  const docsRes = await fetchAllResult(() => supabase
    .from('product_spec_documents').select('*')
    .eq('salesOrderId', oldOrderId).eq('status', 'active')
    .order('createdAt', { ascending: true })
    .order('id', { ascending: true }));
  if (docsRes.error) return { error: messageOf(docsRes.error) };
  const docs = docsRes.data || [];
  if (!docs.length) return { moved: 0, failed: 0, warnings: [], documents: [] };

  const linesRes = await fetchAllResult(() => supabase
    .from('sales_order_lines').select('id')
    .eq('salesOrderId', newOrder.id)
    .order('id', { ascending: true }));
  if (linesRes.error) return { error: messageOf(linesRes.error) };
  const newLineIds = new Set((linesRes.data || []).map((row) => row.id));

  const oldRes = await supabase.from('sales_orders').select('orderNumber').eq('id', oldOrderId).maybeSingle();
  if (oldRes.error) return { error: messageOf(oldRes.error) };
  const oldNumber = oldRes.data?.orderNumber || newOrder.metadata?.revisedFrom || oldOrderId;
  const newNumber = newOrder.orderNumber || newOrder.id;
  const reason = `ออก Rev. ใบสั่งขาย ${oldNumber} → ${newNumber}`;

  const warnings = [];
  const documents = [];
  let moved = 0;
  let failed = 0;
  const warn = (doc, text, { failure = false } = {}) => {
    warnings.push(`${doc.docNo}: ${text}`);
    if (failure) failed += 1;
  };

  for (const doc of docs) {
    const newLineId = doc.salesOrderLineId ? revisedOrderLineId(newOrder.id, doc.salesOrderLineId) : null;
    const lineFound = Boolean(newLineId) && newLineIds.has(newLineId);

    const upd = await supabase.from('product_spec_documents')
      .update({ salesOrderId: newOrder.id, salesOrderLineId: lineFound ? newLineId : null, updatedAt: now })
      .eq('id', doc.id)
      .eq('salesOrderId', oldOrderId)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();
    if (upd.error) {
      warn(doc, `ย้ายไปใบสั่งขาย ${newNumber} ไม่สำเร็จ — ${messageOf(upd.error)}`, { failure: true });
      documents.push({ id: doc.id, docNo: doc.docNo, outcome: 'failed' });
      continue;
    }
    if (!upd.data) {
      warn(doc, 'เอกสารเปลี่ยนสถานะระหว่างย้าย — ข้ามใบนี้');
      documents.push({ id: doc.id, docNo: doc.docNo, outcome: 'skipped' });
      continue;
    }
    moved += 1;

    /* ⚠️ ไม่ชี้ปุ่มใดปุ่มหนึ่ง — ใบกำพร้ามีปุ่มปลายทางตามสภาพของมัน (มติ 23/09/2569 "ซ่อนปุ่มยกเลิกช่วงร่าง":
       ร่างที่ไม่เคยยื่น = ลบร่าง · นอกนั้น = ยกเลิก · `documentExitKey`) และคำเตือนนี้ออกก่อนอ่าน Rev ล่าสุด
       ⇒ บอกที่ที่ปุ่มอยู่ (แถว "บรรทัดถูกถอด" บนการ์ดเอกสารต่อเนื่อง) ไม่ใช่ชื่อปุ่ม */
    if (!lineFound) {
      warn(doc, `ไม่พบบรรทัดเดียวกันในใบสั่งขาย ${newNumber} — ย้ายเอกสารไปแบบไม่มีบรรทัด จัดการต่อ (ลบร่าง/ยกเลิก) ได้ที่การ์ดเอกสารต่อเนื่องบนหน้าใบสั่งขาย`);
    }

    const latestRes = await supabase.from('product_spec_document_revisions')
      .select(REVISION_COLUMNS)
      .eq('documentId', doc.id)
      .order('revNo', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestRes.error || !latestRes.data) {
      warn(doc, `อ่าน Rev. ล่าสุดไม่สำเร็จ — ${latestRes.error ? messageOf(latestRes.error) : 'ไม่พบ Rev.'}`, { failure: true });
      documents.push({ id: doc.id, docNo: doc.docNo, outcome: 'failed' });
      continue;
    }
    const latest = latestRes.data;

    if (latest.status === 'approved') {
      // บรรทัดหาย = ไม่เปิด Rev+1 (ยื่นไม่ได้ตลอดกาล · Rev ลบไม่ได้) — ทางออกคือยกเลิกเอกสาร
      if (!lineFound) {
        documents.push({ id: doc.id, docNo: doc.docNo, outcome: 'orphaned' });
        continue;
      }
      const opened = await openNextRevision(supabase, {
        document: doc, fromRevision: latest, reason, user, now,
      });
      if (opened.error) {
        warn(doc, `เปิด Rev. ใหม่ไม่สำเร็จ — ${opened.error}`, { failure: true });
        documents.push({ id: doc.id, docNo: doc.docNo, outcome: 'failed' });
        continue;
      }
      documents.push({ id: doc.id, docNo: doc.docNo, outcome: 'revised' });
      continue;
    }

    if (latest.status === 'pending_ae' || latest.status === 'pending_ae_supervisor') {
      const reset = await transitionRevision(supabase, {
        revision: latest,
        patch: revisionPatch('reset_to_draft', { now }).patch,
      });
      if (reset.error) {
        warn(doc, `ถอย Rev. ที่รออนุมัติกลับเป็นร่างไม่สำเร็จ — ${reset.error}`, { failure: !reset.conflict });
        documents.push({ id: doc.id, docNo: doc.docNo, outcome: reset.conflict ? 'skipped' : 'failed' });
        continue;
      }
      documents.push({ id: doc.id, docNo: doc.docNo, outcome: lineFound ? 'reset' : 'orphaned_reset' });
      continue;
    }

    documents.push({ id: doc.id, docNo: doc.docNo, outcome: lineFound ? 'kept' : 'orphaned' });
  }

  return { moved, failed, warnings, documents };
}

/**
 * รูปนี้ถูก Rev ที่ไม่ใช่ร่างอ้างอยู่ไหม — ถ้าใช่ ห้ามลบไฟล์ ให้ปลดระวาง (`metadata.retiredAt`) แทน
 *
 * ⚠️ query ล้ม = คืน error ไม่ใช่ `false` — `false` แปลว่า "ลบได้" ซึ่งทำให้กระดาษที่ลูกค้าเซ็น
 *    ไปแล้วเปิดรูปไม่ขึ้นตลอดกาล
 * @returns {{ referenced: boolean } | { error: string }}
 */
export async function isIllustrationReferenced(supabase, attachmentId) {
  const { data, error } = await supabase.from('product_spec_document_revisions')
    .select('id')
    .contains('illustrationIds', [attachmentId])
    .neq('status', 'draft')
    .limit(1);
  if (error) return { error: messageOf(error) };
  return { referenced: (data || []).length > 0 };
}

/**
 * รูปของแถว checklist รูปนี้ยังมีแถวไหนชี้อยู่ไหม (mig 0405) — ด่านของ DELETE ไฟล์แนบ
 *
 * ⚠️ อ่านไม่ได้ = คืน `{ error }` ไม่ใช่ `referenced: false` — ผู้เรียกต้องหยุด ไม่ใช่ลบต่อ
 * @returns {{ referenced: boolean } | { error: string }}
 */
export async function isSpecItemImageReferenced(supabase, attachmentId) {
  const { data, error } = await supabase.from('product_spec_items')
    .select('id')
    .eq('imageAttachmentId', attachmentId)
    .limit(1);
  if (error) return { error: messageOf(error) };
  return { referenced: (data || []).length > 0 };
}
