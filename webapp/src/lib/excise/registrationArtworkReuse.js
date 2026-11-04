// ── ปุ่ม "ใช้ไฟล์นี้ยื่น" ฝั่งเบราว์เซอร์ (แผงทะเบียนสรรพสามิต · มติเจ้าของ 04/11/2026) ─────────────────────────────────
//
// ⭐ **สองจังหวะ ลำดับนี้เปลี่ยนไม่ได้** (รูปเดียวกับ `uploadAttachment` · `lib/service/surveyPlanReuse.js`):
//   ① `POST /api/excise-registrations/<id>/artwork-from-product` — server คัดลอก Artwork ของสินค้าเป็น **ไฟล์ใหม่** ในโฟลเดอร์
//      ของทะเบียน แล้วออกใบรับการอัปให้คนกด · เส้นนั้นไม่เขียนแถวไฟล์แนบ
//   ② แนบไฟล์ใหม่ผ่านเส้นไฟล์แนบเส้นเดียวของระบบ (`attachUploadedFile`) เป็น "ฉลาก / Artwork ที่ยื่น" — ด่านของเส้นนั้นเดินครบ
//      (สิทธิ์แนบของทะเบียน · ทะเบียนที่อนุมัติแล้วล็อก · ใบรับ · ไม่มีแถวอื่นถือ)
//   ② ล้ม = `attachUploadedFile` ถอยไฟล์ที่เพิ่งคัดลอกให้เอง (`DELETE /api/upload`)
// ⭐ `metadata.sourceAttachmentId` = แถว Artwork ต้นทาง — ด่าน "ใช้ไฟล์นี้ไปแล้ว" ของ server ถามคีย์นี้ และจอใช้ซ่อนไฟล์ที่ใช้แล้ว
// ⚠️ ไม่ toast เอง — คืน `{ ok, error, attachment }` ให้จอเลือกวิธีแจ้ง · ไม่โยน (ต่อไม่ติดก็คืนข้อความไทย)
// ⚠️ ไฟล์ฝั่งเบราว์เซอร์: ห้ามดึงโมดูลของ server (Drive · ใบรับ · `registrationArtworkCopy.js`) เข้ามา
import { apiJson } from '@/lib/apiFetch';
import { attachUploadedFile } from '@/lib/master/attachmentUpload';

const COPY_FAILED = 'คัดลอกไฟล์ไม่สำเร็จ — ลองอีกครั้ง';
/* ⚠️ สามค่านี้ต้องตรงกับ `registrationArtworkCopy.js` (ฝั่ง server import ไม่ได้) — เทสต์เทียบให้ */
export const REUSE_SOURCE_KEY = 'sourceAttachmentId';
export const REUSE_TARGET_DOC_TYPE = 'label_artwork';
export const REUSE_SOURCE_DOC_TYPE = 'artwork';
const idText = (v) => String(v ?? '').trim();

/**
 * Artwork ของสินค้าที่ยังใช้ยื่นทะเบียนนี้ได้ — ตัดแถวที่ไม่มีไฟล์ Drive / เอกสาร Google / ถูกปิดเนื้อหา / ใช้ไปแล้ว
 * @param productItems แถวไฟล์แนบของสินค้า (จาก `GET /api/attachments?entityType=product`)
 * @param registrationItems แถวไฟล์แนบของทะเบียน
 */
export function reusableProductArtwork(productItems = [], registrationItems = []) {
  const used = new Set((registrationItems || [])
    .map((item) => item?.metadata?.[REUSE_SOURCE_KEY])
    .filter(Boolean));
  return (productItems || []).filter((item) => item
    && item.docType === REUSE_SOURCE_DOC_TYPE
    && !item.restricted
    && !item.metadata?.kind
    && !item.metadata?.retiredAt
    && typeof item.driveFileId === 'string' && item.driveFileId
    && !used.has(item.id));
}

/**
 * @param registrationId id ของทะเบียน (ต้องเป็นร่าง/ตีกลับ — server ตัดสิน) · @param attachmentId แถว Artwork ของสินค้า
 * @returns `{ ok, error, attachment }` — `attachment` = แถวที่เพิ่งสร้าง (อ่านไม่ออก = `null` แต่ `ok` ยังจริง)
 */
export async function reuseProductArtwork({ registrationId, attachmentId } = {}) {
  const registration = idText(registrationId);
  const source = idText(attachmentId);
  if (!registration || !source) return { ok: false, error: 'ไฟล์ที่เลือกไม่ถูกต้อง', attachment: null };

  let copy;
  try {
    copy = await apiJson(
      `/api/excise-registrations/${encodeURIComponent(registration)}/artwork-from-product`,
      { method: 'POST', json: { attachmentId: source }, fallbackError: COPY_FAILED },
    );
  } catch (err) {
    return { ok: false, error: err?.message || COPY_FAILED, attachment: null };
  }
  if (!copy?.driveFileId || !copy?.url) return { ok: false, error: COPY_FAILED, attachment: null };

  try {
    const attached = await attachUploadedFile({
      entityType: 'registration',
      entityId: registration,
      docType: REUSE_TARGET_DOC_TYPE,
      url: copy.url,
      driveFileId: copy.driveFileId,
      fileName: copy.fileName,
      mimeType: copy.mimeType,
      sizeBytes: copy.sizeBytes,
      metadata: { [REUSE_SOURCE_KEY]: copy.sourceAttachmentId || source },
    });
    return { ok: attached.ok, error: attached.error, attachment: attached.attachment ?? null };
  } catch (err) {
    return { ok: false, error: err?.message || 'บันทึกเอกสารไม่สำเร็จ', attachment: null };
  }
}
