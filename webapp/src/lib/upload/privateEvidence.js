// ── หลักฐานที่เก็บใน bucket ส่วนตัว (ไม่ขึ้น Drive) ────────────────────────
// มีสองชนิด: หลักฐานปิด Won ของใบเสนอราคา (mig 0102) และหลักฐานการชำระรายงวดของ
// ใบสั่งขาย (mig 0245) — bucket เดียวกัน คนละโฟลเดอร์ เพื่อให้ proxy แยกด่านอ่านได้
//
// ยกออกมาเป็นชิ้นเดียวเพราะมีผู้เรียกสามทางแล้ว: อัปผ่าน API (`/api/upload`),
// ออก signed URL ให้เบราว์เซอร์อัปตรง (`/api/upload/session` ทั้งขั้นขอและขั้น confirm)
// ⚠️ ด่านสิทธิ์ของทั้งสามทางต้องเหมือนกันเป๊ะ — ถ้าก๊อปไว้สามที่ วันหนึ่งจะเหลือทางที่
// ลืมอัปเดตแล้วกลายเป็นรูให้แนบไฟล์ใส่ใบที่ปิดไปแล้ว
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canEditSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';
import { DEFAULT_EVIDENCE_BUCKET } from '@/lib/sales/orderConfirmationDocs';

export const PRIVATE_EVIDENCE_BUCKET = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET
  || DEFAULT_EVIDENCE_BUCKET;

const safeId = (value) => String(value).replace(/[^a-zA-Z0-9_-]+/g, '_');

const TARGETS = {
  // หลักฐาน Won แนบได้เฉพาะตอนใบยังเปิดอยู่ — หลัง accept ใบกลายเป็นแหล่งของ Actual
  // แล้วหลักฐานต้องนิ่ง (mig 0138 เก็บไว้แม้ถูก unaccept)
  quotation_won_evidence: {
    table: 'quotations',
    notFound: 'ไม่พบใบเสนอราคา',
    gate: (row) => (['draft', 'sent'].includes(row.status)
      ? null : 'ใบเสนอราคานี้ไม่อยู่ในสถานะที่แนบหลักฐาน Won ได้'),
    prefix: (entityId) => `quotations/${safeId(entityId)}/won/`,
  },
  /* ⭐ เอกสารยืนยันคำสั่งซื้อของใบสั่งขาย (mig 0285) — **แนบก่อนที่ใบจะเกิด**
     ฟอร์มหน้าสร้างใบสั่งขายอัปไฟล์ตั้งแต่ยังไม่มี orderId (เลขที่ใบออกตอนกดสร้าง
     และใช้ซ้ำไม่ได้ ⇒ ห้ามสร้างใบเปล่ารอไว้) ⇒ ไฟล์พักไว้ใต้ **ใบเสนอราคาต้นทาง**
     แล้ว ref ตามเข้าใบตอนสร้างสำเร็จ
     ⚠️ ด่านคือ "ใบเสนอราคาปิด Won แล้ว" — ตรงข้ามกับ quotation_won_evidence ที่รับ
     เฉพาะตอนใบยังเปิด · คนละโฟลเดอร์กันเพื่อให้ proxy แยกด่านอ่านได้ */
  sales_order_confirmation: {
    table: 'quotations',
    notFound: 'ไม่พบใบเสนอราคา',
    gate: (row) => (row.status === 'accepted'
      ? null : 'แนบเอกสารยืนยันคำสั่งซื้อได้เมื่อใบเสนอราคาปิด Won แล้ว'),
    prefix: (entityId) => `quotations/${safeId(entityId)}/order-confirmation/`,
  },
  // งวดชำระเกิดตอนใบสั่งขายอนุมัติ — ก่อนหน้านั้นไม่มีอะไรให้แนบ
  sales_order_payment_evidence: {
    table: 'sales_orders',
    notFound: 'ไม่พบใบสั่งขาย',
    gate: (row) => (row.status === 'approved'
      ? null : 'แนบหลักฐานการชำระได้หลังใบสั่งขายอนุมัติแล้ว'),
    prefix: (entityId) => `sales-orders/${safeId(entityId)}/payments/`,
  },
};

export function isPrivateEvidence(entityType) {
  return Boolean(TARGETS[entityType]);
}

/* ── ไฟล์ของงวดชำระที่ "ยืมมาจากใบเสนอราคาต้นทาง" ──────────────────────────
 *
 * 🐞 ผู้ใช้แจ้ง 2026-08-25: กดดูสลิปของงวดแรกแล้วได้ `{"error":"ไม่พบไฟล์แนบ"}`
 * ทั้งที่ไฟล์อยู่ครบใน bucket · ด่านอ่านของ `payment-file` เขียนรายการโฟลเดอร์ที่
 * ยอมรับไว้เองสองอัน (`sales-orders/…/payments/` กับ `quotations/…/won/`) แล้ว #1391
 * เพิ่มโฟลเดอร์ที่สาม (`order-confirmation/`) โดยไม่มีใครกลับมาแก้ด่านอ่าน
 * ⇒ งวดที่ ref ตามไฟล์ยืนยันคำสั่งซื้อมา เปิดไม่ได้ทั้งหมด (วัดบน prod: 6 งวด)
 *
 * ⭐ **อ่านชื่อโฟลเดอร์จาก TARGETS ตัวเดียวกับที่ใช้ตอนเขียน** — โฟลเดอร์ที่สี่ที่จะ
 * เพิ่มวันหน้าจึงเข้ามาเองโดยไม่ต้องมีใครนึกออกว่ามีด่านอ่านซ่อนอยู่ตรงไหนบ้าง
 * (`__ID__` เป็นค่าหลอกที่รอด `safeId` ทั้งก้อน จึงตัดออกได้ตรง ๆ) */
const QUOTATION_EVIDENCE_FOLDERS = Object.values(TARGETS)
  .filter((target) => target.table === 'quotations')
  .map((target) => target.prefix('__ID__').replace('quotations/__ID__/', '').replace(/\/$/, ''));

/** path นี้เป็นหลักฐานที่แนบไว้ใต้ใบเสนอราคาใบใดใบหนึ่งไหม (ไม่เจาะจงว่าใบไหน) */
export function isQuotationEvidencePath(storagePath) {
  const folders = QUOTATION_EVIDENCE_FOLDERS.join('|');
  return new RegExp(`^quotations/[a-zA-Z0-9_-]+/(${folders})/`).test(String(storagePath || ''));
}

export { QUOTATION_EVIDENCE_FOLDERS };

/** โฟลเดอร์ที่ไฟล์ของเอกสารใบนั้นต้องอยู่ — ใช้ทั้งตอนสร้าง path และตอนตรวจ path ที่ client ส่งมา */
export function privateEvidencePrefix(entityType, entityId) {
  const target = TARGETS[entityType];
  if (!target || !entityId) return null;
  return target.prefix(entityId);
}

/**
 * ตรวจว่า user แนบไฟล์ใส่เอกสารใบนี้ได้ไหม (สิทธิ์ฝ่ายขาย + ขอบเขตดีลเจ้าของใบ + สถานะใบ)
 * คืน { ok:true } หรือ { ok:false, error, status } พร้อมตอบกลับผู้ใช้ได้ทันที
 */
export async function checkPrivateEvidenceScope(user, entityType, entityId) {
  const target = TARGETS[entityType];
  if (!target) return { ok: false, error: 'forbidden', status: 403 };
  if (!entityId || !canEditSalesPlanning(user)) return { ok: false, error: 'forbidden', status: 403 };

  const supabase = getSupabaseAdmin();
  const { data: row, error: rowError } = await supabase
    .from(target.table).select('id, dealId, status').eq('id', entityId).maybeSingle();
  if (rowError) return { ok: false, error: rowError.message, status: 500 };
  if (!row) return { ok: false, error: target.notFound, status: 404 };

  const gateError = target.gate(row);
  if (gateError) return { ok: false, error: gateError, status: 409 };

  const { data: deal, error: dealError } = await supabase
    .from('sales_deals').select('*').eq('id', row.dealId).maybeSingle();
  if (dealError) return { ok: false, error: dealError.message, status: 500 };
  if (!deal || !inSalesEditScope(user, deal)) return { ok: false, error: 'forbidden', status: 403 };

  return { ok: true };
}

/**
 * ไฟล์ที่ client อ้างมา **มีอยู่จริงใน bucket ไหม** — คืนข้อความผิดพลาด หรือ null เมื่อครบ
 *
 * 🛑 path ที่ปลอมขึ้นมาหรือชี้ของที่ยังอัปไม่สำเร็จ ต้องไม่กลายเป็นหลักฐานถาวรของ
 * เอกสารการค้า · เดิมด่านนี้อยู่ใน route ปิด Won ที่เดียว พอหลักฐานย้ายมาที่ใบสั่งขาย
 * (mig 0285) ก็ต้องยกออกมาให้ผู้เรียกทั้งสองฝั่งใช้ตัวเดียวกัน
 */
export async function missingStoredEvidence(supabase, bucket, attachments = []) {
  for (const att of (attachments || []).filter((item) => item?.storagePath)) {
    const slash = att.storagePath.lastIndexOf('/');
    const folder = att.storagePath.slice(0, slash);
    const name = att.storagePath.slice(slash + 1);
    const { data: stored, error } = await supabase.storage
      .from(bucket).list(folder, { search: name, limit: 10 });
    if (error || !stored?.some((item) => item.name === name)) {
      return `ไม่พบไฟล์ ${att.fileName || name} ในพื้นที่จัดเก็บ private`;
    }
  }
  return null;
}

/**
 * path ปลายทางของไฟล์หนึ่งใบ — ชื่อไฟล์ถูกล้างเป็น ASCII เพราะ key ของ Supabase
 * Storage ไม่รับอักขระไทย/ช่องว่าง (ต่างจาก Drive ที่รับ Unicode ได้)
 * @param {number} stamp - เวลา (ms) ที่ใช้เป็นคำนำหน้า ให้ผู้เรียกส่งเข้ามาเพื่อทดสอบได้
 */
export function privateEvidenceObjectPath(entityType, entityId, fileName, stamp = Date.now()) {
  const prefix = privateEvidencePrefix(entityType, entityId);
  if (!prefix) return null;
  const cleanName = String(fileName || 'file')
    .replace(/[^a-zA-Z0-9.\-_]+/g, '_')
    .replace(/^_+/, '') || 'file';
  return `${prefix}${stamp}_${crypto.randomUUID()}_${cleanName}`;
}
