// หลักฐานการปิด Won จากใบเสนอราคา (mig 0102) — ใช้ร่วม client (ฟอร์ม) + server (accept route)
// กติกา: ต้องแนบไฟล์ ≥1 + เลือกประเภทเอกสาร + วันที่เอกสาร; ถ้าไม่ใช่เอกสารการชำระเงิน
// (สลิป) ต้องระบุกำหนดชำระด้วย — เดือนของวันที่เอกสารคือเดือนที่นับยอด AT

export const WON_DOC_TYPES = Object.freeze([
  { value: 'payment_slip', label: 'สลิปโอนเงิน / หลักฐานการชำระ', payment: true },
  { value: 'po', label: 'ใบสั่งซื้อ (PO)', payment: false },
  { value: 'order_confirmation', label: 'เอกสารยืนยันการสั่งซื้อ', payment: false },
]);

export const WON_DOC_TYPE_LABELS = Object.freeze(
  Object.fromEntries(WON_DOC_TYPES.map((t) => [t.value, t.label])),
);

export function isPaymentDocType(docType) {
  return WON_DOC_TYPES.find((t) => t.value === docType)?.payment === true;
}

export const MAX_WON_ATTACHMENTS = 8;
export const DEFAULT_WON_EVIDENCE_BUCKET = 'sales-evidence';

// รับเฉพาะ ref ไฟล์ที่อัปผ่าน /api/upload แล้ว — เก็บฟิลด์ที่จำเป็นเท่านั้น
// (pattern เดียวกับ sales_deal_activities.attachments)
export function sanitizeWonAttachments(input, { allowedStorageBucket = null, allowedStoragePathPrefix = null } = {}) {
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
    .slice(0, MAX_WON_ATTACHMENTS)
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

// ตรวจครบชุดก่อนยิง accept — คืน { ok:true, evidence } (attachments ผ่าน sanitize แล้ว)
// หรือ { ok:false, error } ข้อความไทยพร้อมโชว์ผู้ใช้
export function validateWonEvidence(
  { docType, docDate, paymentDueDate, attachments } = {},
  attachmentOptions = {},
) {
  if (!WON_DOC_TYPES.some((t) => t.value === docType)) {
    return { ok: false, error: 'เลือกประเภทเอกสารหลักฐาน (สลิป / PO / เอกสารยืนยันการสั่งซื้อ)' };
  }
  if (!isDate(docDate)) return { ok: false, error: 'ระบุวันที่เอกสารหลักฐาน' };
  const files = sanitizeWonAttachments(attachments, attachmentOptions);
  if (!files.length) return { ok: false, error: 'ต้องแนบไฟล์หลักฐานอย่างน้อย 1 ไฟล์ (สลิป / PO / เอกสารยืนยันการสั่งซื้อ)' };
  const due = paymentDueDate || null;
  if (!isPaymentDocType(docType)) {
    if (!isDate(due)) return { ok: false, error: 'เอกสารนี้ไม่ใช่เอกสารการชำระเงิน — ต้องระบุกำหนดชำระ' };
  } else if (due && !isDate(due)) {
    return { ok: false, error: 'รูปแบบกำหนดชำระไม่ถูกต้อง' };
  }
  return {
    ok: true,
    evidence: {
      docType,
      docDate,
      paymentDueDate: isDate(due) ? due : null,
      attachments: files,
    },
  };
}
