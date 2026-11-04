// ── ใช้ Artwork ของสินค้ายื่นทะเบียนสรรพสามิต — ฝั่ง server เท่านั้น (มติเจ้าของ 04/11/2026 "ปุ่มใช้ไฟล์นี้ยื่น") ──────────
//
// 🐞 ที่มา (04/11 · FG-0903-01-002-10154 · REG-mw1vefs7918b): ฝ่ายขายแนบ Artwork 2 ไฟล์ที่การ์ด "เอกสารของสินค้า" (การ์ดเขียนว่า
//    ใช้ต่อเรื่องขึ้นทะเบียนสรรพสามิต) แล้วสร้างทะเบียน — ทะเบียนยังขึ้น "ขาด ฉลาก / Artwork ที่ยื่น" เพราะด่านยื่น
//    (`lib/tax/requirements.js`) นับเฉพาะไฟล์ที่แนบ **ที่ทะเบียน** ⇒ ไฟล์เดียวกันต้องแนบสองรอบ และไม่มีที่ไหนบอก
//
// ⭐ ทำไมคัดลอก ไม่ใช่นับไฟล์ของสินค้าแทน: ทะเบียนที่อนุมัติแล้วถูกล็อก แต่ไฟล์ของสินค้าแก้/ลบได้ตลอด ⇒ ถ้านับข้ามกัน
//    ฉลากที่ยื่นกรมจะเปลี่ยนตามสินค้าได้ทีหลัง · ทะเบียนต้องถือสำเนาของตัวเอง
//
// 🔑 **เป็น "ต้นทางการอัป" อีกทาง ไม่ใช่ทางแนบ** (แพตเทิร์นเดียวกับ `lib/service/surveyPlanCopy.js`) — เส้นไฟล์แนบมีเส้นเดียว
//    (`POST /api/attachments`) และไม่ยอมให้ไฟล์ Drive ใบเดียวมีสองแถว (ลบแถวหนึ่ง = ไฟล์ของอีกแถวหาย)
//    ⇒ ที่นี่ **คัดลอกไบต์เป็นไฟล์ใหม่** ในโฟลเดอร์ของทะเบียน แล้วออกใบรับการอัปให้คนกด · **ไม่เขียนแถว `attachments`**
//    เบราว์เซอร์แนบไฟล์ใหม่ผ่านเส้นเดียวนั้นเอง (`registrationArtworkReuse.js`) — ด่านของเส้นนั้นเดินครบทุกข้อ
//
// 🔴 **ลำดับด่านคือสัญญา — ไม่มีอะไรถูกคัดลอกก่อนด่านครบ**:
//   ① รูปของคำขอ (400) → ② ทะเบียนที่มองเห็น (404) → ③ แนบเอกสารทะเบียนได้ (403) → ④ ยังเป็นร่าง/ตีกลับ (409)
//   → ⑤ แถวต้นทาง = Artwork ของสินค้าของทะเบียนนี้ ที่คนกดอ่านได้ (404 — ไม่บอกว่ามีไฟล์กับคนที่อ่านไม่ได้)
//   → ⑥ ยังไม่เคยใช้ไฟล์นี้กับทะเบียนนี้ (409) → ⑦ คำตอบของ Drive เอง (400 / 502) → ⑧ คัดลอก (502) → ⑨ ออกใบรับ (503 + ลบไฟล์ใหม่)
//
// ⚠️ ไม่เขียน audit — แถวไฟล์แนบที่เบราว์เซอร์สร้างต่อ (`metadata.sourceAttachmentId`) คือบันทึกของเรื่องนี้
//    เบราว์เซอร์ดับระหว่างสองจังหวะ = ไฟล์กำพร้าที่มีใบรับ (ของเหลือแบบเดียวกับการอัปปกติ — รายงาน drive-orphans ตามเก็บ)
// ⚠️ supabase-js ไม่ throw — ทุกจุดอ่าน `{ error }` · **อ่านพัง = 500 ไม่ใช่ปล่อยผ่าน**
// ⚠️ `lib/drive` (googleapis) ถูกดึงแบบ dynamic ตอนถึงด่าน ⑦ เท่านั้น — คำขอที่ถูกปฏิเสธก่อนหน้าไม่โหลดมันเลย
import { canViewRecord } from '@/lib/permissions';
import { canEditAttachmentParent, canViewAttachmentParent } from '@/lib/master/attachmentAccess';
import { isRetiredAttachment } from '@/lib/master/attachmentTypes';
import { REGISTRATION_LINK_EDITABLE_STATUSES } from '@/lib/excise/workflow';
import { recordUploadReceipt } from '@/lib/upload/receipts';
import { MAX_BYTES } from '@/lib/upload/limits';

export const REGISTRATION_ARTWORK_COPY_ERRORS = {
  shape: 'ไฟล์ที่เลือกไม่ถูกต้อง',
  registration: 'ไม่พบทะเบียนนี้',
  forbidden: 'ไม่มีสิทธิ์แนบเอกสารของทะเบียนนี้',
  status: 'ทะเบียนนี้ยื่นให้ RA แล้ว — ใช้ไฟล์ของสินค้าได้เฉพาะตอนเป็นฉบับร่างหรือถูกตีกลับ',
  source: 'ไม่พบ Artwork นี้ในสินค้าของทะเบียน',
  noBytes: 'ไฟล์นี้คัดลอกไม่ได้ (เป็นเอกสาร Google หรือไม่มีไฟล์จริง) — ดาวน์โหลดแล้วแนบที่ทะเบียนเอง',
  used: 'ใช้ไฟล์นี้กับทะเบียนนี้ไปแล้ว',
  tooLarge: 'ไฟล์ใหญ่เกินกำหนด — ดาวน์โหลดแล้วแนบที่ทะเบียนเอง',
  driveCheck: 'ตรวจไฟล์กับ Google Drive ไม่สำเร็จ — ลองอีกครั้ง',
  copy: 'คัดลอกไฟล์ไม่สำเร็จ — ลองอีกครั้ง',
  read: 'อ่านข้อมูลไฟล์ไม่สำเร็จ — ลองอีกครั้ง',
};

/* คีย์ที่ผูกแถวใหม่กับแถวต้นทาง — เบราว์เซอร์เขียนลง `metadata` ของแถวที่แนบ · ด่าน ⑥ ถามด้วยคีย์เดียวกัน */
export const ARTWORK_SOURCE_KEY = 'sourceAttachmentId';
/* ชนิดเอกสารของทั้งสองฝั่ง — ต้นทาง = Artwork ของสินค้า · ปลายทาง = ฉลากที่ยื่น (การ์ดบังคับของทะเบียน) */
export const PRODUCT_ARTWORK_DOC_TYPE = 'artwork';
export const REGISTRATION_ARTWORK_DOC_TYPE = 'label_artwork';

const REG_ENTITY = 'registration';
const PRODUCT_ENTITY = 'product';
const ID_MAX = 200;
const DRIVE_META_FIELDS = 'id, name, mimeType, size, trashed';

const answer = (status, error) => ({ status, body: { error } });
const idOf = (v) => (typeof v === 'string' && v.trim() && v.trim().length <= ID_MAX ? v.trim() : null);
const same = (a, b) => String(a ?? '') === String(b ?? '');

/** รูปของ `body.attachmentId` — สตริงเท่านั้น (ออบเจ็กต์/ตัวเลขไม่ถูกปั้นเป็นสตริงแล้วส่งเข้าตัวกรองของฐาน) */
export const registrationArtworkSource = (attachmentId) => idOf(attachmentId);

/* อ่านสตรีมของ Drive เป็นก้อนเดียว — เกินเพดาน = หยุดอ่าน (`null`) ไม่ถือไบต์ที่เกินไว้ในหน่วยความจำ */
async function streamToBuffer(stream, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += part.length;
    if (total > maxBytes) {
      stream.destroy?.();
      return null;
    }
    chunks.push(part);
  }
  return Buffer.concat(chunks, total);
}

/**
 * คัดลอก Artwork ของสินค้าเป็นไฟล์ใหม่ในโฟลเดอร์ของทะเบียน แล้วออกใบรับการอัปให้คนกด — เดินด่านครบเก้าข้อ (หัวไฟล์)
 *
 * @param registration แถว `excise_registrations` (`null` = ไม่พบ) · @param attachmentId `body.attachmentId` ดิบ
 * @param user ผู้ใช้จาก session
 * @param deps เทสต์ยัดตัวปลอม: `{ getFileMeta, getFileStream, uploadForEntity, deleteFile, recordUploadReceipt,
 *             canEditRegistrationFiles, canViewProductFiles }` (+ `maxBytes` · `wait` ของตัวออกใบรับ)
 * @returns `{ status, body }` — `body` = `{ error }` หรือ `{ url, driveFileId, fileName, mimeType, sizeBytes, sourceAttachmentId }` (201)
 */
export async function copyProductArtworkToRegistration(supabase, { registration, attachmentId, user } = {}, deps = {}) {
  const ERR = REGISTRATION_ARTWORK_COPY_ERRORS;
  /* ① — ไม่แตะฐาน */
  const sourceId = registrationArtworkSource(attachmentId);
  if (!sourceId) return answer(400, ERR.shape);

  /* ② ③ ④ — ทะเบียนที่มองเห็น · แนบเอกสารได้ (ด่านเดียวกับ POST /api/attachments) · ยังยื่นไม่ได้ไป */
  if (!registration || !user || !canViewRecord(user, 'registrations', registration)) return answer(404, ERR.registration);
  let canAttach;
  try {
    canAttach = await (deps.canEditRegistrationFiles
      || ((db, reg, who) => canEditAttachmentParent(db, REG_ENTITY, reg, who)))(supabase, registration, user);
  } catch (e) {
    console.error('[registration-artwork-copy] ถามสิทธิ์แนบเอกสารทะเบียนไม่สำเร็จ', registration.id, e?.message || e);
    return answer(500, ERR.read);
  }
  if (canAttach !== true) return answer(403, ERR.forbidden);
  if (!REGISTRATION_LINK_EDITABLE_STATUSES.includes(registration.status)) return answer(409, ERR.status);

  /* ⑤ — แถวต้นทาง: Artwork ของสินค้าของทะเบียนนี้ ที่คนกดอ่านได้ */
  const missing = answer(404, ERR.source);
  if (!registration.productId) return missing;
  const { data: product, error: productError } = await supabase
    .from('products').select('*').eq('id', registration.productId).maybeSingle();
  if (productError) {
    console.error('[registration-artwork-copy] อ่านสินค้าของทะเบียนไม่สำเร็จ', registration.id, productError.message);
    return answer(500, ERR.read);
  }
  if (!product) return missing;
  let canRead;
  try {
    canRead = await (deps.canViewProductFiles
      || ((db, row, who) => canViewAttachmentParent(db, PRODUCT_ENTITY, row, who)))(supabase, product, user);
  } catch (e) {
    console.error('[registration-artwork-copy] ถามด่านอ่านไฟล์ของสินค้าไม่สำเร็จ', registration.id, e?.message || e);
    return answer(500, ERR.read);
  }
  if (canRead !== true) return missing;
  const { data: row, error: rowError } = await supabase.from('attachments').select('*').eq('id', sourceId).maybeSingle();
  if (rowError) {
    console.error('[registration-artwork-copy] อ่านแถว Artwork ไม่สำเร็จ', sourceId, rowError.message);
    return answer(500, ERR.read);
  }
  if (!row || row.entityType !== PRODUCT_ENTITY || !same(row.entityId, product.id)
    || row.docType !== PRODUCT_ARTWORK_DOC_TYPE || isRetiredAttachment(row)) return missing;
  // เอกสาร Google (`metadata.kind`) / แถวที่ไม่มีไฟล์ Drive = ไม่มีไบต์ให้คัดลอก — คนกดอ่านแถวนี้ได้อยู่แล้ว จึงบอกเหตุได้
  if (row.metadata?.kind || typeof row.driveFileId !== 'string' || !row.driveFileId) return answer(400, ERR.noBytes);

  /* ⑥ — ไฟล์นี้ยังไม่เคยถูกใช้กับทะเบียนนี้ (กดซ้ำ/สองแท็บ = ไม่ได้สำเนาที่สอง) */
  const { data: used, error: usedError } = await supabase.from('attachments').select('id')
    .eq('entityType', REG_ENTITY).eq('entityId', registration.id)
    .eq(`metadata->>${ARTWORK_SOURCE_KEY}`, row.id)
    .limit(1);
  if (usedError) {
    console.error('[registration-artwork-copy] ตรวจไฟล์ที่ใช้ไปแล้วไม่สำเร็จ', registration.id, usedError.message);
    return answer(500, ERR.read);
  }
  if ((used || []).length) return answer(409, ERR.used);

  /* ⑦ — คำตอบของ Drive เอง (ชนิด/ขนาดในแถวเป็นค่าที่ client ประกาศตอนอัป) */
  const maxBytes = Number.isFinite(deps.maxBytes) ? deps.maxBytes : MAX_BYTES;
  const drive = (deps.getFileMeta && deps.getFileStream && deps.uploadForEntity && deps.deleteFile)
    ? deps
    : { ...(await import('@/lib/drive')), ...deps };
  let meta;
  try {
    meta = await drive.getFileMeta(row.driveFileId, DRIVE_META_FIELDS);
  } catch (e) {
    console.error('[registration-artwork-copy] ถามไฟล์จาก Drive ไม่สำเร็จ', row.id, e?.message || e);
    return answer(502, ERR.driveCheck);
  }
  if (!meta || typeof meta !== 'object') return answer(502, ERR.driveCheck);
  const mimeType = String(meta.mimeType ?? '').toLowerCase();
  const size = Number(meta.size);
  if (meta.trashed === true || mimeType.startsWith('application/vnd.google-apps.') || meta.size == null || !Number.isFinite(size)) {
    return answer(400, ERR.noBytes);
  }
  if (size > maxBytes) return answer(400, ERR.tooLarge);

  /* ⑧ — คัดลอกไบต์เป็นไฟล์ใหม่ในโฟลเดอร์ของทะเบียน (ตัวเดียวกับที่ POST /api/upload เรียก) */
  const fileName = String(row.fileName ?? '').trim() || String(meta.name ?? '').trim() || 'Artwork';
  let buffer;
  let copy;
  try {
    buffer = await streamToBuffer(await drive.getFileStream(row.driveFileId), maxBytes);
    if (buffer) {
      copy = await drive.uploadForEntity({
        entityType: REG_ENTITY, entityId: registration.id, buffer, name: fileName, mimeType,
      });
    }
  } catch (e) {
    console.error('[registration-artwork-copy] คัดลอกไฟล์บน Drive ไม่สำเร็จ', registration.id, row.id, e?.message || e);
    return answer(502, ERR.copy);
  }
  if (!buffer) return answer(400, ERR.tooLarge);
  if (!copy?.id) return answer(502, ERR.copy);

  /* ⑨ — ใบรับของไฟล์ใหม่ให้คนกด (id มาจาก Drive ไม่ใช่จากคำขอ) · ออกไม่ได้ = การแนบจะถูกปฏิเสธแน่ ⇒ ลบไฟล์ใหม่ทิ้งเลย */
  let receipt;
  try {
    receipt = await (deps.recordUploadReceipt || recordUploadReceipt)(supabase, {
      driveFileId: copy.id, userId: user.id, entityType: REG_ENTITY, entityId: registration.id,
    }, deps.wait ? { wait: deps.wait } : undefined);
  } catch (e) {
    receipt = { error: e };
  }
  if (!receipt || receipt.error) {
    console.error('[registration-artwork-copy] 🔴 ออกใบรับของไฟล์ที่คัดลอกไม่สำเร็จ — ลบไฟล์ใหม่ทิ้ง', copy.id, receipt?.error?.message);
    try {
      await drive.deleteFile(copy.id);
    } catch (e) {
      console.error('[registration-artwork-copy] ลบไฟล์ที่คัดลอกไม่สำเร็จ — เหลือไฟล์กำพร้าบน Drive', copy.id, e?.message || e);
    }
    return answer(503, ERR.copy);
  }

  return {
    status: 201,
    body: {
      url: copy.webViewLink ?? null,
      driveFileId: copy.id,
      fileName,
      mimeType,
      sizeBytes: buffer.length,
      sourceAttachmentId: row.id,
    },
  };
}
