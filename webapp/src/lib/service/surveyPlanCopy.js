// ── คัดลอกไฟล์ของฝ่ายขายเป็น "ภาพแบบ" ของพื้นที่ที่ประเมินจากแบบ (งวด S2b §2.4 · มติเจ้าของ §10 ข้อ 6) — ฝั่ง server เท่านั้น ──
//
// ⭐ ปุ่ม "ใช้รูปนี้เป็นภาพแบบของพื้นที่นี้" บนแผง "แบบจากฝ่ายขาย" — หัวหน้าไม่ต้องดาวน์โหลดไฟล์ที่ฝ่ายขายส่งมาแล้วอัปกลับเอง
//
// 🔑 **เป็น "ต้นทางการอัป" อีกทางหนึ่ง ไม่ใช่ทางแนบ** — เส้นไฟล์แนบของระบบมีเส้นเดียว (`POST /api/attachments`) และมันยืนยันสองข้อ:
//   ไฟล์ Drive ใบนั้นคนเรียกอัปเอง (ใบรับการอัป) และไม่มีแถว/เธรดไหนถืออยู่ ⇒ แถวที่สองบนไฟล์ของฝ่ายขายเกิดไม่ได้โดยการออกแบบ
//   ⇒ ที่นี่ **คัดลอกไบต์เป็นไฟล์ใหม่** ในโฟลเดอร์ของพื้นที่ แล้วออกใบรับให้คนกด — เท่ากับ `POST /api/upload` ที่ไบต์มาจาก Drive
//   แทนที่จะมาจากเบราว์เซอร์ · **ไม่เขียนแถว `attachments`** — เบราว์เซอร์แนบไฟล์ใหม่ผ่านเส้นเดียวนั้นเอง (`surveyPlanReuse.js`)
//   ด่านของเส้นนั้นจึงเดินครบทุกข้อ และไฟล์ใหม่ลบได้โดยไม่กระทบไฟล์ที่ฝ่ายขายแนบมา
//
// 🔴 **ลำดับด่านคือสัญญา — ไม่มีอะไรถูกคัดลอกก่อนด่านครบ** (ตารางใน S2b §2.4):
//   ① หัวหน้าฝ่ายบริการ (403) → ② รูปของไฟล์ที่เลือก (400) → ③ ใบประเมินของฝ่ายเรา (404 / 403) → ④ ใบยังไม่ล็อก (409)
//   → ⑤ แถวพื้นที่ของใบนี้ (404) → ⑥ ยังไม่ถูกตัด (409) → ⑦ เป็นพื้นที่จากแบบ (409 — กติกา 29/08 ของพื้นที่ลงหน้างานยังอยู่)
//   → ⑧ แถวต้นทาง + ด่านอ่านตัวเดียวกับที่ใช้ลิสต์ไฟล์ (404 — ไม่บอกว่ามีไฟล์กับคนที่อ่านไม่ได้) → ⑧ข ที่มาของไฟล์เธรด (409 / 503)
//   → ⑨ ลงเอกสารได้ไหม: ชนิดของแถว **และ** คำตอบของ Drive เอง (400 / 502) → ⑩ คัดลอก (502) → ⑪ ออกใบรับ (503 + ลบไฟล์ใหม่)
//
// 🔴 **ด่าน ⑧ข — ทำไมไฟล์เธรดต้องพิสูจน์ที่มา**: แถว `attachments` เขียนได้ทางเดียวซึ่งถามใบรับของผู้อัป · ไฟล์ในเธรดไม่ใช่ —
//   ตัวเก็บข้อความ (`sanitizeUpdateAttachments`) เก็บ `driveFileId` ตามที่เบราว์เซอร์ส่งมา ⇒ ถ้าคัดลอก id นั้นด้วยบัญชีบริการแล้วออก
//   ใบรับจริงให้ไฟล์ใหม่ = เปลี่ยน id ที่เชื่อไม่ได้ให้เป็นไฟล์ที่เชื่อได้ (รูเดียวกับที่กติกาใบรับ 08/10 ปิด) ⇒ id ต้องมีใบรับของ
//   **ผู้โพสต์ข้อความ** · ใบรับหมดอายุแล้วก็ผ่าน (อายุไม่เกี่ยว — แค่พิสูจน์ว่าเขาอัปเอง) · ตรวจไม่ได้ = ปิดไว้ก่อน
//   ⇒ ไฟล์เธรดที่แนบ **ก่อน** mig 0406 (08/10/2569) ไม่มีใบรับ: ปุ่มตอบ "ใช้ไฟล์นี้จากเธรดไม่ได้…" แล้วหัวหน้าแนบเอง
//
// ⚠️ ไม่ถามสวิตช์ `SURVEY_DRAWING_METHOD` — แถวที่เป็นจากแบบเดินตามกติกาของมันไม่ว่าสวิตช์เปิดหรือปิด · สวิตช์ปิด = ไม่มีแถวจากแบบ
//    ⇒ ด่าน ⑦ ปฏิเสธเอง
// ⚠️ ไม่เขียน audit — แถวไฟล์แนบที่เบราว์เซอร์สร้างต่อคือบันทึกของเรื่องนี้ · เบราว์เซอร์ดับระหว่างสองจังหวะ = ไฟล์กำพร้าที่มีใบรับ
//    (ของเหลือแบบเดียวกับการอัปปกติ — รายงาน drive-orphans ตามเก็บ)
// ⚠️ supabase-js ไม่ throw — ทุกจุดอ่าน `{ error }` · **อ่านพัง = 500 ไม่ใช่ปล่อยผ่าน**
// ⚠️ `lib/drive` (googleapis) ถูกดึงแบบ dynamic ตอนถึงด่าน ⑨ เท่านั้น — คำขอที่ถูกปฏิเสธก่อนหน้าไม่โหลดมันเลย
import { canSendSurveyResult } from '@/lib/permissions';
import { canAnswerRequest } from '@/lib/requests/access';
import { canViewCostingAttachment } from '@/lib/master/costingAttachmentAccess';
import { canViewUpdates } from '@/lib/master/updateAccess';
import { DRIVE_FILE_ID_PATTERN, recordUploadReceipt, uploadReceiptStatus } from '@/lib/upload/receipts';
import { MAX_BYTES } from '@/lib/upload/limits';
import { surveyEditLockError } from './survey';
import { SALES_REUSE_BLOCKED } from './surveyFieldView';
import { isDrawingZone, isJpgOrPngFile } from './surveyMethod';

export const SURVEY_PLAN_COPY_ERRORS = {
  role: 'ใช้ไฟล์จากฝ่ายขายเป็นภาพแบบได้เฉพาะหัวหน้าฝ่ายบริการ',
  shape: 'ไฟล์ที่เลือกไม่ถูกต้อง',
  cut: 'พื้นที่นี้ถูกตัดออกแล้ว — เอากลับเข้าใบก่อน',
  onsite: 'ใช้ไฟล์จากฝ่ายขายเป็นภาพแบบได้เฉพาะพื้นที่ที่ประเมินจากแบบ',
  requestFile: 'ไม่พบไฟล์นี้ในคำร้อง',
  threadFile: 'ไม่พบไฟล์นี้ในเธรดของคำร้อง',
  // ประโยคเดียวกับเหตุของปุ่มที่กดไม่ได้บนแผง — ไฟล์ที่ server ปฏิเสธด้วยเหตุนี้คือไฟล์ที่ปุ่มควรจางอยู่แล้ว
  notPrintable: SALES_REUSE_BLOCKED,
  driveCheck: 'ตรวจไฟล์กับ Google Drive ไม่สำเร็จ — ลองอีกครั้ง',
  copy: 'คัดลอกไฟล์ไม่สำเร็จ — ลองอีกครั้ง',
  // ที่มาของไฟล์เธรดพิสูจน์ไม่ได้ (ไม่มีใบรับของผู้โพสต์) — บอกทางที่ทำได้เอง
  receipt: 'ใช้ไฟล์นี้จากเธรดไม่ได้ — เปิดไฟล์ บันทึกลงเครื่อง แล้วแนบที่ช่องภาพแบบเอง',
  receiptCheck: 'ตรวจที่มาของไฟล์ไม่สำเร็จ — ลองอีกครั้ง',
  // อ่านแถวต้นทาง / ถามด่านอ่านไม่ได้ — ไม่เดาว่า "ไม่มีไฟล์" และไม่ปล่อยผ่าน
  read: 'อ่านข้อมูลไฟล์ไม่สำเร็จ — ลองอีกครั้ง',
};

const NO_SHEET = 'ไม่พบใบประเมินพื้นที่';
const NO_ZONE = 'ไม่พบพื้นที่นี้ในใบประเมิน';
const ZONE_ENTITY = 'service_survey_zone';
const REQUEST_ENTITY = 'dept_request';
const ID_MAX = 200;
const INDEX_MAX = 999;
/* ช่องที่ด่านเธรดใช้ — `authorId` = ผู้โพสต์ (ใบรับของไฟล์ต้องเป็นของเขา · ข้อความที่คนอื่นแก้ทีหลังยังตัดสินจากผู้โพสต์) */
const THREAD_COLUMNS = 'id, "entityType", "entityId", attachments, "authorId", "deletedAt"';
const DRIVE_META_FIELDS = 'id, mimeType, size, trashed';
const PRINTABLE_MIME = ['image/jpeg', 'image/png'];
const FALLBACK_NAME = { 'image/jpeg': 'ภาพแบบ.jpg', 'image/png': 'ภาพแบบ.png' };

const answer = (status, error) => ({ status, body: { error } });
const idOf = (v) => (typeof v === 'string' && v.trim() && v.trim().length <= ID_MAX ? v.trim() : null);
const same = (a, b) => String(a ?? '') === String(b ?? '');
const isCut = (row) => (row?.status || 'ok') === 'cut';

/**
 * รูปของไฟล์ที่เลือก (`body.source`) — คืนเฉพาะคีย์ที่รู้จัก หรือ `null` เมื่อผิดรูป
 *   `{ kind: 'request', attachmentId }` · `{ kind: 'thread', updateId, index }` (`index` = ลำดับในข้อความนั้น จำนวนเต็มไม่ติดลบ)
 * ⚠️ id ต้องเป็นสตริง — ออบเจ็กต์/ตัวเลขไม่ถูกปั้นเป็นสตริงแล้วส่งเข้าตัวกรองของฐาน
 */
export function surveyPlanCopySource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  if (source.kind === 'request') {
    const attachmentId = idOf(source.attachmentId);
    return attachmentId ? { kind: 'request', attachmentId } : null;
  }
  if (source.kind === 'thread') {
    const updateId = idOf(source.updateId);
    const { index } = source;
    if (!updateId || !Number.isInteger(index) || index < 0 || index > INDEX_MAX) return null;
    return { kind: 'thread', updateId, index };
  }
  return null;
}

/* ด่าน ⑧ ของไฟล์ที่แนบกับคำร้อง — คืน `{ file }` หรือ `{ refuse }` */
async function requestSourceFile(supabase, { request, user, attachmentId }, canView) {
  const missing = { refuse: answer(404, SURVEY_PLAN_COPY_ERRORS.requestFile) };
  let allowed;
  try {
    allowed = await canView(supabase, request, user);
  } catch (e) {
    console.error('[survey-plan-copy] ถามด่านอ่านไฟล์ของคำร้องไม่สำเร็จ', request.id, e?.message || e);
    return { refuse: answer(500, SURVEY_PLAN_COPY_ERRORS.read) };
  }
  if (allowed !== true) return missing;
  const { data: row, error } = await supabase.from('attachments').select('*').eq('id', attachmentId).maybeSingle();
  if (error) {
    console.error('[survey-plan-copy] อ่านแถวไฟล์ของคำร้องไม่สำเร็จ', request.id, error.message);
    return { refuse: answer(500, SURVEY_PLAN_COPY_ERRORS.read) };
  }
  if (!row || row.entityType !== REQUEST_ENTITY || !same(row.entityId, request.id)) return missing;
  // เอกสาร Google (`metadata.kind`) / แถวที่ไม่มีไฟล์ Drive = ไม่มีไบต์ให้คัดลอก — คนกดอ่านแถวนี้ได้อยู่แล้ว จึงบอกเหตุได้
  const copyable = !row.metadata?.kind && typeof row.driveFileId === 'string' && row.driveFileId !== '';
  return { file: { driveFileId: copyable ? row.driveFileId : null, fileName: row.fileName ?? null, mimeType: row.mimeType ?? null } };
}

/* ด่าน ⑧ + ⑧ข ของไฟล์ในเธรด — หยิบรายการแบบเดียวกับ proxy `/api/updates/[id]/file` (`attachments[index]` ของข้อความนั้นเอง) */
async function threadSourceFile(supabase, { request, user, updateId, index }, canView, now) {
  const missing = { refuse: answer(404, SURVEY_PLAN_COPY_ERRORS.threadFile) };
  let allowed;
  try {
    allowed = await canView(supabase, request, user);
  } catch (e) {
    console.error('[survey-plan-copy] ถามด่านอ่านเธรดของคำร้องไม่สำเร็จ', request.id, e?.message || e);
    return { refuse: answer(500, SURVEY_PLAN_COPY_ERRORS.read) };
  }
  if (allowed !== true) return missing;
  const { data: row, error } = await supabase.from('entity_updates').select(THREAD_COLUMNS).eq('id', updateId).maybeSingle();
  if (error) {
    console.error('[survey-plan-copy] อ่านข้อความเธรดไม่สำเร็จ', request.id, error.message);
    return { refuse: answer(500, SURVEY_PLAN_COPY_ERRORS.read) };
  }
  if (!row || row.deletedAt || row.entityType !== REQUEST_ENTITY || !same(row.entityId, request.id)) return missing;
  const att = (Array.isArray(row.attachments) ? row.attachments : [])[index];
  if (!att || typeof att.fileUrl !== 'string' || !att.fileUrl.trim()) return missing;
  const file = { driveFileId: null, fileName: att.fileName ?? null, mimeType: att.mimeType ?? null };
  // ไม่มี id ไฟล์ = ลิงก์เอกสาร Google (proxy ก็แค่ redirect) — ไม่มีไบต์ให้คัดลอก · ตกไปด่าน ⑨
  if (att.driveFileId == null || att.driveFileId === '') return { file };

  /* ⑧ข — id มาจากเบราว์เซอร์ของผู้โพสต์: ต้องตรงรูปก่อนถึงตัวกรองของฐาน แล้วต้องมีใบรับของผู้โพสต์เอง */
  const provenance = { refuse: answer(409, SURVEY_PLAN_COPY_ERRORS.receipt) };
  if (typeof att.driveFileId !== 'string' || !DRIVE_FILE_ID_PATTERN.test(att.driveFileId)) return provenance;
  const authorId = row.authorId != null && row.authorId !== '' ? String(row.authorId) : null;
  if (!authorId) return provenance;
  const verdict = await uploadReceiptStatus(supabase, { driveFileId: att.driveFileId, userId: authorId, now });
  if (verdict.reason === 'unverifiable') return { refuse: answer(503, SURVEY_PLAN_COPY_ERRORS.receiptCheck) };
  if (!(verdict.ok || verdict.reason === 'expired')) return provenance;
  return { file: { ...file, driveFileId: att.driveFileId } };
}

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
 * คัดลอกไฟล์ของฝ่ายขายเป็นไฟล์ใหม่ในโฟลเดอร์ของพื้นที่ แล้วออกใบรับการอัปให้คนกด — เดินด่านครบสิบเอ็ดข้อ (หัวไฟล์)
 *
 * @param request แถว `dept_requests` ของใบ (`null` = ไม่พบ) · @param zone แถว `service_survey_zones` (`null` = ไม่พบ)
 * @param source  `body.source` ดิบ — ตรวจรูปที่นี่ · @param user ผู้ใช้จาก session
 * @param deps    เทสต์ยัดตัวปลอม: `{ getFileMeta, getFileStream, uploadForEntity, deleteFile, recordUploadReceipt,
 *                canViewRequestFiles, canViewThread }` (+ `now` · `maxBytes` · `wait` ของตัวออกใบรับ)
 * @returns `{ status, body }` — `body` = `{ error }` หรือ `{ url, driveFileId, fileName, mimeType, sizeBytes }` (201)
 */
export async function copySalesFileToZonePlan(supabase, { request, zone, source, user } = {}, deps = {}) {
  const ERR = SURVEY_PLAN_COPY_ERRORS;
  /* ① ② — ไม่แตะฐาน */
  if (!canSendSurveyResult(user)) return answer(403, ERR.role);
  const picked = surveyPlanCopySource(source);
  if (!picked) return answer(400, ERR.shape);

  /* ③ ④ — ใบประเมินของฝ่ายเรา ที่ยังแก้ผลได้ */
  if (!request || request.kind !== 'site_survey') return answer(404, NO_SHEET);
  if (!canAnswerRequest(user, request)) return answer(403, `ตอบได้เฉพาะฝ่าย ${request.dept}`);
  const lock = surveyEditLockError(request);
  if (lock) return answer(409, lock);

  /* ⑤ ⑥ ⑦ — พื้นที่ของใบนี้ ที่ยังอยู่ในใบ และประเมินจากแบบ */
  if (!zone || !same(zone.requestId, request.id)) return answer(404, NO_ZONE);
  if (isCut(zone)) return answer(409, ERR.cut);
  if (!isDrawingZone(zone)) return answer(409, ERR.onsite);

  /* ⑧ (+ ⑧ข) — แถวต้นทางที่คนกดอ่านได้ */
  const found = picked.kind === 'request'
    ? await requestSourceFile(supabase, { request, user, attachmentId: picked.attachmentId },
      deps.canViewRequestFiles || ((db, req, who) => canViewCostingAttachment(db, REQUEST_ENTITY, req, who)))
    : await threadSourceFile(supabase, { request, user, updateId: picked.updateId, index: picked.index },
      deps.canViewThread || ((db, req, who) => canViewUpdates(db, REQUEST_ENTITY, req, who)), deps.now);
  if (found.refuse) return found.refuse;
  const { file } = found;

  /* ⑨ — ลงเอกสารได้ไหม: ชนิดที่แถวบอก (ตัวตัดสินเดียวกับปุ่มและด่านภาพแบบ) แล้วคำตอบของ Drive เอง */
  if (!file.driveFileId || !isJpgOrPngFile(file)) return answer(400, ERR.notPrintable);
  const maxBytes = Number.isFinite(deps.maxBytes) ? deps.maxBytes : MAX_BYTES;
  const drive = (deps.getFileMeta && deps.getFileStream && deps.uploadForEntity && deps.deleteFile)
    ? deps
    : { ...(await import('@/lib/drive')), ...deps };
  let meta;
  try {
    meta = await drive.getFileMeta(file.driveFileId, DRIVE_META_FIELDS);
  } catch (e) {
    console.error('[survey-plan-copy] ถามชนิดไฟล์จาก Drive ไม่สำเร็จ', request.id, e?.message || e);
    return answer(502, ERR.driveCheck);
  }
  if (!meta || typeof meta !== 'object') return answer(502, ERR.driveCheck);
  const mimeType = String(meta.mimeType ?? '').toLowerCase();
  const size = Number(meta.size);
  if (meta.trashed === true || !PRINTABLE_MIME.includes(mimeType) || meta.size == null || !Number.isFinite(size) || size > maxBytes) {
    return answer(400, ERR.notPrintable);
  }

  /* ⑩ — คัดลอกไบต์เป็นไฟล์ใหม่ในโฟลเดอร์ของพื้นที่ (ตัวเดียวกับที่ POST /api/upload เรียก) */
  const fileName = String(file.fileName ?? '').trim() || FALLBACK_NAME[mimeType];
  let buffer;
  let copy;
  try {
    buffer = await streamToBuffer(await drive.getFileStream(file.driveFileId), maxBytes);
    if (buffer) {
      copy = await drive.uploadForEntity({
        entityType: ZONE_ENTITY, entityId: zone.id, buffer, name: fileName, mimeType,
      });
    }
  } catch (e) {
    console.error('[survey-plan-copy] คัดลอกไฟล์บน Drive ไม่สำเร็จ', request.id, zone.id, e?.message || e);
    return answer(502, ERR.copy);
  }
  if (!buffer) return answer(400, ERR.notPrintable);
  if (!copy?.id) return answer(502, ERR.copy);

  /* ⑪ — ใบรับของไฟล์ใหม่ให้คนกด (id มาจาก Drive ไม่ใช่จากคำขอ) · ออกไม่ได้ = การแนบจะถูกปฏิเสธแน่ ⇒ ลบไฟล์ใหม่ทิ้งเลย */
  let receipt;
  try {
    receipt = await (deps.recordUploadReceipt || recordUploadReceipt)(supabase, {
      driveFileId: copy.id, userId: user.id, entityType: ZONE_ENTITY, entityId: zone.id,
    }, deps.wait ? { wait: deps.wait } : undefined);
  } catch (e) {
    receipt = { error: e };
  }
  if (!receipt || receipt.error) {
    console.error('[survey-plan-copy] 🔴 ออกใบรับของไฟล์ที่คัดลอกไม่สำเร็จ — ลบไฟล์ใหม่ทิ้ง', copy.id, receipt?.error?.message);
    try {
      await drive.deleteFile(copy.id);
    } catch (e) {
      console.error('[survey-plan-copy] ลบไฟล์ที่คัดลอกไม่สำเร็จ — เหลือไฟล์กำพร้าบน Drive', copy.id, e?.message || e);
    }
    return answer(503, ERR.copy);
  }

  return {
    status: 201,
    body: { url: copy.webViewLink ?? null, driveFileId: copy.id, fileName, mimeType, sizeBytes: buffer.length },
  };
}
