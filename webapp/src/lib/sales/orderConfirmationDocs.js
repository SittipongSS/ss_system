// ── เอกสารยืนยันคำสั่งซื้อของใบสั่งขาย (mig 0285) ──────────────────────────
//
// ⭐ **เคยเป็น "หลักฐานปิด Won" ของใบเสนอราคา (mig 0102/0246)** — มติผู้ใช้ 2026-08-24
// ย้ายทั้งชุดมาไว้ที่ใบสั่งขาย เพราะที่นี่คือที่ที่มันถูกใช้จริง (เลขที่ → เอกสารอ้างอิง ·
// สลิป → หลักฐานงวดแรก) ส่วนการปิด Won เหลือแค่โมดัลยืนยัน · ไฟล์นี้จึงเป็นบ้านของ
// **ชนิดเอกสาร + การล้าง ref ไฟล์แนบ** ที่ทั้งสองยุคใช้ร่วมกัน
//
// กติกา: เลือกชนิด + วันที่บนเอกสาร + ไฟล์ ≥1 · `po` ต้องมีเลขที่ด้วย
// ⚠️ **ไม่มี "กำหนดชำระ" ในชุดนี้แล้ว** — กำหนดชำระอยู่ที่งวดของใบสั่งขายที่เดียว
// (มติ 2026-08-18) เดิมถามตรงนี้เพราะยังไม่มีที่ให้ลง

/* `docNo` = เลขที่เอกสาร (mig 0246 · มติผู้ใช้ 2026-08-13)
   ⭐ ใบสั่งขายใช้เป็นค่าตั้งต้นของ "เอกสารอ้างอิง" — ช่องนั้นค้นได้และขึ้นเป็นคอลัมน์
   ในตาราง (mig 0235) ของเดิมเลข PO อยู่แค่ในรูปที่แนบ AE จึงต้องพิมพ์ซ้ำเองทุกใบ
   ⚠️ บังคับเฉพาะ `po` — สลิปไม่มีเลขที่ที่มีความหมาย ส่วนเอกสารยืนยันการสั่งซื้อ
   ของจริงบางเจ้าเป็นอีเมลยืนยันที่ไม่มีเลขที่ ⇒ กรอกได้แต่ไม่บังคับ */
export const CONFIRM_DOC_TYPES = Object.freeze([
  { value: 'payment_slip', label: 'สลิปโอนเงิน / หลักฐานการชำระ', payment: true, docNo: 'none' },
  { value: 'po', label: 'ใบสั่งซื้อ (PO)', payment: false, docNo: 'required' },
  { value: 'order_confirmation', label: 'เอกสารยืนยันการสั่งซื้อ', payment: false, docNo: 'optional' },
]);

export const MAX_CONFIRM_DOC_NO = 100;

/** 'none' | 'optional' | 'required' — ฟอร์มใช้ตัดสินว่าจะโชว์/บังคับช่องเลขที่ไหม */
export function confirmDocNoRule(docType) {
  return CONFIRM_DOC_TYPES.find((t) => t.value === docType)?.docNo || 'none';
}

export const CONFIRM_DOC_TYPE_LABELS = Object.freeze(
  Object.fromEntries(CONFIRM_DOC_TYPES.map((t) => [t.value, t.label])),
);

export function isPaymentDocType(docType) {
  return CONFIRM_DOC_TYPES.find((t) => t.value === docType)?.payment === true;
}

export const MAX_CONFIRM_ATTACHMENTS = 8;
export const DEFAULT_EVIDENCE_BUCKET = 'sales-evidence';

// รับเฉพาะ ref ไฟล์ที่อัปผ่าน /api/upload แล้ว — เก็บฟิลด์ที่จำเป็นเท่านั้น
// (pattern เดียวกับ sales_deal_activities.attachments)
export function sanitizeEvidenceAttachments(input, { allowedStorageBucket = null, allowedStoragePathPrefix = null } = {}) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((a) => {
      if (!a || typeof a !== 'object') return false;
      const legacyRef = typeof a.fileUrl === 'string' && a.fileUrl;
      const privateRef = typeof a.storageBucket === 'string' && a.storageBucket
        && typeof a.storagePath === 'string' && a.storagePath;
      if (!legacyRef && !privateRef) return false;
      if (privateRef && allowedStorageBucket && a.storageBucket !== allowedStorageBucket) return false;
      if (privateRef && allowedStoragePathPrefix && !a.storagePath.startsWith(allowedStoragePathPrefix)) return false;
      return true;
    })
    .slice(0, MAX_CONFIRM_ATTACHMENTS)
    .map((a) => ({
      fileUrl: a.fileUrl ? String(a.fileUrl) : null,
      driveFileId: a.driveFileId ? String(a.driveFileId) : null,
      storageBucket: a.storageBucket ? String(a.storageBucket).slice(0, 100) : null,
      storagePath: a.storagePath ? String(a.storagePath).slice(0, 1000) : null,
      fileName: a.fileName ? String(a.fileName).slice(0, 200) : null,
      mimeType: a.mimeType ? String(a.mimeType).slice(0, 100) : null,
      sizeBytes: Number.isFinite(a.sizeBytes) ? Number(a.sizeBytes) : null,
    }));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v) => typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));

/**
 * ตรวจชุดเอกสารยืนยันคำสั่งซื้อ — ใช้ร่วม client (ฟอร์มสร้างใบสั่งขาย) + server (route)
 *
 * ⭐ **ว่างทั้งชุดผ่านได้** คืน `{ ok:true, confirmation:null }` — ใบร่างที่ยังไม่ได้
 * เอกสารจากลูกค้าต้องออกได้ (มติ 2026-08-24) · ด่านจริงอยู่ตอน **ยื่นอนุมัติ**
 * (`salesOrderConfirmationGate`) ไม่ใช่ตอนสร้าง
 * ⚠️ กรอกมาครึ่ง ๆ = ไม่ผ่าน — ครึ่งเดียวคือของที่ไม่มีใครใช้ต่อได้ และมันจะนิ่งอยู่
 * อย่างนั้นจนถึงวันยื่นแล้วค่อยเด้ง ซึ่งสายไปหนึ่งขั้น
 */
export function validateOrderConfirmation(
  { docType, docDate, docNo, attachments } = {},
  attachmentOptions = {},
) {
  const files = sanitizeEvidenceAttachments(attachments, attachmentOptions);
  const cleanDocNo = String(docNo ?? '').trim();
  const empty = !docType && !docDate && !cleanDocNo && !files.length
    && !(Array.isArray(attachments) && attachments.length);
  if (empty) return { ok: true, confirmation: null };

  if (!CONFIRM_DOC_TYPES.some((t) => t.value === docType)) {
    return { ok: false, error: 'เลือกประเภทเอกสารยืนยัน (สลิป / PO / เอกสารยืนยันการสั่งซื้อ)' };
  }
  if (!isDate(docDate)) return { ok: false, error: 'ระบุวันที่บนเอกสารยืนยัน' };
  const rule = confirmDocNoRule(docType);
  const docNoValue = rule === 'none' ? null : (cleanDocNo || null);
  if (rule === 'required' && !docNoValue) {
    return { ok: false, error: 'ระบุเลขที่ใบสั่งซื้อ (PO) — ใบสั่งขายใช้เป็นเอกสารอ้างอิง' };
  }
  if (docNoValue && docNoValue.length > MAX_CONFIRM_DOC_NO) {
    return { ok: false, error: `เลขที่เอกสารยาวเกิน ${MAX_CONFIRM_DOC_NO} ตัวอักษร` };
  }
  if (!files.length) {
    return { ok: false, error: 'แนบไฟล์เอกสารยืนยันอย่างน้อย 1 ไฟล์ (สลิป / PO / เอกสารยืนยันการสั่งซื้อ)' };
  }
  return {
    ok: true,
    confirmation: { docType, docDate, docNo: docNoValue, attachments: files },
  };
}

/**
 * เอกสารยืนยันของใบสั่งขายใบหนึ่ง — **อ่านสองบ้าน**
 *
 * ⚠️ ใบที่ออกก่อน mig 0285 ไม่มี confirm* ของตัวเอง หลักฐานของมันอยู่ที่ใบเสนอราคา
 * ต้นทาง (`quotations.won*`) ⇒ ทุกที่ที่โชว์เอกสารยืนยันต้องถอยไปอ่านของเก่าให้ด้วย
 * ไม่งั้นใบเก่าทั้งกองจะขึ้นว่า "ไม่มีเอกสาร" ทั้งที่แนบไว้ครบ
 * คืน `null` เมื่อไม่มีทั้งสองบ้าน · `source` บอกว่าค่าที่ได้มาจากไหน
 */
export function orderConfirmationOf(order, quotation = null) {
  if (order?.confirmDocType || (Array.isArray(order?.confirmAttachments) && order.confirmAttachments.length)) {
    return {
      docType: order.confirmDocType || null,
      docNo: order.confirmDocNo || null,
      docDate: order.confirmDocDate || null,
      attachments: Array.isArray(order.confirmAttachments) ? order.confirmAttachments : [],
      source: 'order',
    };
  }
  if (quotation?.wonDocType || (Array.isArray(quotation?.wonAttachments) && quotation.wonAttachments.length)) {
    return {
      docType: quotation.wonDocType || null,
      docNo: quotation.wonDocNo || null,
      docDate: quotation.wonDocDate || null,
      attachments: Array.isArray(quotation.wonAttachments) ? quotation.wonAttachments : [],
      source: 'quotation',
    };
  }
  return null;
}

/**
 * ด่าน "ยื่นอนุมัติใบสั่งขายไม่ได้ถ้ายังไม่มีเอกสารยืนยัน" — คืนเหตุผล หรือ null เมื่อผ่าน
 *
 * ⭐ ด่านอยู่ตรงนี้ ไม่ใช่ตอนสร้างใบ (มติ 2026-08-24) — AE ที่ยังรอ PO จากลูกค้าต้อง
 * ตั้งใบร่างไว้ก่อนได้ · แต่จะส่งให้คนอื่นอนุมัติโดยไม่มีหลักฐานจากลูกค้าไม่ได้
 * ⚠️ ข้อความนี้ขึ้น **ติดปุ่ม** (GatedAction/blockedReason) ไม่ใช่ tooltip — ปุ่มที่จาง
 * เฉย ๆ คือสิ่งที่ทำให้คนคิดว่าระบบพัง
 */
export function salesOrderConfirmationGate(order, quotation = null) {
  const confirmation = orderConfirmationOf(order, quotation);
  if (!confirmation) {
    return 'ยังไม่มีเอกสารยืนยันคำสั่งซื้อ — แนบสลิป / PO / เอกสารยืนยันจากลูกค้าในการ์ด "ยืนยันคำสั่งซื้อ" ก่อนยื่นอนุมัติ';
  }
  if (!confirmation.attachments.length) {
    return 'เอกสารยืนยันคำสั่งซื้อยังไม่มีไฟล์แนบ — แนบอย่างน้อย 1 ไฟล์ก่อนยื่นอนุมัติ';
  }
  if (confirmDocNoRule(confirmation.docType) === 'required' && !confirmation.docNo) {
    return 'ยืนยันด้วยใบสั่งซื้อ (PO) ต้องระบุเลขที่ PO ก่อนยื่นอนุมัติ';
  }
  return null;
}
