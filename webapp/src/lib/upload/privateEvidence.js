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
import { DEFAULT_WON_EVIDENCE_BUCKET } from '@/lib/sales/quotationWonEvidence';

export const PRIVATE_EVIDENCE_BUCKET = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET
  || DEFAULT_WON_EVIDENCE_BUCKET;

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
