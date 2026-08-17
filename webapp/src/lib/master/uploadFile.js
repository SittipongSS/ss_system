import { describeResponseError } from '@/lib/fetchError';
import {
  LEGACY_UPLOAD_MAX_BYTES,
  checkUploadCandidate,
} from '@/lib/master/attachmentTypes';

// ── ทางเดียวของ "อัปไฟล์หนึ่งใบขึ้นที่เก็บ" ฝั่งเบราว์เซอร์ ────────────────────
//
// ไบต์ **ไม่วิ่งผ่าน API ของเราแล้ว**: server ออก URL ที่เขียนได้ไฟล์เดียวให้
// (`/api/upload/session`) แล้วเบราว์เซอร์ยิงขึ้น Drive/Storage ตรง ๆ
// เหตุผล: Vercel ตัด request body ของ function ที่ 4.5 MB — ทางเดิมจึงแนบไฟล์ใหญ่
// ไม่ได้เลย ทั้งที่ป้ายในฟอร์มบอกเพดานที่ใหญ่กว่านั้น (ดู attachmentTypes.js)
//
// คืน ref รูปแบบเดียวกับที่ `/api/upload` เคยคืน — `{ url, driveFileId,
// storageBucket, storagePath, mimeType }` — ผู้เรียกจึงส่งต่อให้ endpoint metadata
// (`/api/master/attachments` · `/api/updates` · accept ของใบเสนอราคา) ได้เหมือนเดิม
// @throws {Error} ข้อความไทยพร้อมโชว์ผู้ใช้ — ผู้เรียกเลือกเองว่าจะ toast หรือใส่ในฟอร์ม

/** PUT ไบต์ขึ้น URL ที่ได้มา + รายงานความคืบหน้า (fetch ยังบอก progress ของ upload ไม่ได้) */
function putWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    // status 0 = คำขอไม่ได้ออกไปถึงปลายทาง (CORS/พร็อกซีองค์กร/เน็ตหลุด) — ต่างจาก
    // ปลายทางปฏิเสธ ซึ่งมี status จริงให้เห็น · ชั้นบนใช้ความต่างนี้ตัดสินว่าจะถอยไปเส้นสำรองไหม
    xhr.onerror = () => reject(new Error('ส่งไฟล์ขึ้นที่เก็บไม่สำเร็จ (คำขอไม่ถึงปลายทาง)'));
    xhr.onabort = () => reject(new Error('ยกเลิกการอัปโหลด'));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`ที่เก็บปฏิเสธไฟล์ (${xhr.status}) ${String(xhr.responseText || '').slice(0, 200)}`));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText || '{}'));
      } catch {
        resolve({});
      }
    };
    xhr.send(file);
  });
}

/** เส้นสำรอง — ไบต์วิ่งผ่าน function เหมือนเดิม ใช้ได้เฉพาะไฟล์เล็กกว่าเพดานของโฮสติ้ง */
async function uploadThroughApi({ file, entityType, entityId }) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('entityType', entityType);
  fd.append('entityId', entityId);
  const up = await fetch('/api/upload', { method: 'POST', body: fd });
  if (!up.ok) throw new Error(await describeResponseError(up, 'อัปโหลดไฟล์ไม่สำเร็จ'));
  const payload = await up.json();
  return {
    url: payload.url || null,
    driveFileId: payload.driveFileId || null,
    storageBucket: payload.storageBucket || null,
    storagePath: payload.storagePath || null,
    mimeType: payload.mimeType || file.type || null,
  };
}

export async function uploadFileForEntity({ file, entityType, entityId, onProgress = null }) {
  // เช็คก่อนยิง (กันเสียเวลาอัปแล้วโดนปฏิเสธ) — server ตรวจชุดเดียวกันซ้ำเสมอ
  const verdict = checkUploadCandidate({
    fileName: file?.name, mimeType: file?.type, sizeBytes: file?.size,
  });
  if (!verdict.ok) throw new Error(verdict.error);

  const res = await fetch('/api/upload/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entityType,
      entityId,
      fileName: file.name,
      mimeType: file.type || null,
      sizeBytes: file.size,
    }),
  });
  // ขั้นนี้เป็น JSON ตัวเล็ก ๆ ไม่ติดเพดานอะไร — ถ้าล้มคือติดสิทธิ์/ชนิด/ขนาด ซึ่ง
  // ข้อความจริงจาก server บอกได้ตรงกว่าเดา
  if (!res.ok) throw new Error(await describeResponseError(res, 'ขอทางอัปไฟล์ไม่สำเร็จ'));
  const session = await res.json();

  try {
    if (session.kind === 'supabase') {
      // หลักฐาน Won / การชำระ — bucket ส่วนตัว · signedUrl พก token มาในตัวแล้ว
      // (ยิง PUT ตรงได้ ไม่ต้องมี client ของ Supabase ในหน้า) จึงได้ progress เหมือนกัน
      await putWithProgress(session.signedUrl, file, session.contentType, onProgress);
      return {
        url: null,
        driveFileId: null,
        storageBucket: session.storageBucket,
        storagePath: session.storagePath,
        mimeType: session.contentType,
      };
    }

    const uploaded = await putWithProgress(session.uploadUrl, file, session.contentType, onProgress);
    return {
      url: uploaded.webViewLink || null,
      driveFileId: uploaded.id || null,
      storageBucket: null,
      storagePath: null,
      mimeType: session.contentType,
    };
  } catch (err) {
    // ทางตรงล้ม → ไฟล์ที่เล็กพอยังไปทางเดิมได้ (เส้นสำรองผ่าน function)
    // ⚠️ ไฟล์ใหญ่กว่านี้ **ห้ามลองเส้นสำรอง** — โฮสติ้งตัดกลางทางแล้วผู้ใช้จะได้ error
    // ที่ไม่ใช่ของแอปเลย ซึ่งเป็นอาการเดิมที่ทั้งหมดนี้แก้อยู่
    if (file.size <= LEGACY_UPLOAD_MAX_BYTES) {
      console.error('[upload] อัปตรงไม่สำเร็จ ถอยไปใช้เส้นสำรองผ่าน API', err?.message);
      return uploadThroughApi({ file, entityType, entityId });
    }
    const legacyMb = Math.round(LEGACY_UPLOAD_MAX_BYTES / (1024 * 1024));
    throw new Error(
      `${err?.message || 'อัปโหลดไฟล์ไม่สำเร็จ'} — อัปตรงขึ้นที่เก็บไม่ได้ `
      + `และไฟล์ใหญ่เกิน ${legacyMb} MB จึงส่งผ่านเส้นสำรองไม่ได้`,
    );
  }
}
