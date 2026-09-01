import { describeResponseError } from '@/lib/fetchError';
import { apiFetch } from "@/lib/apiFetch";
import {
  LEGACY_UPLOAD_MAX_BYTES,
  checkUploadCandidate,
} from '@/lib/master/attachmentTypes';

// ── ทางเดียวของ "อัปไฟล์หนึ่งใบขึ้นที่เก็บ" ฝั่งเบราว์เซอร์ ────────────────────
//
// ไบต์ **ไม่วิ่งผ่าน API ของเราแล้ว**: server ออก signed URL ที่เขียนได้ไฟล์เดียวให้
// (`/api/upload/session`) แล้วเบราว์เซอร์ PUT ขึ้น Supabase Storage ตรง ๆ
// เหตุผล: Vercel ตัด request body ของ function ที่ 4.5 MB — ทางเดิมจึงแนบไฟล์ใหญ่
// ไม่ได้เลย ทั้งที่ป้ายในฟอร์มบอกเพดานที่ใหญ่กว่านั้น (ดู attachmentTypes.js)
//
// ไฟล์แนบทั่วไปมี **ขาที่สอง**: ขึ้น staging bucket แล้วเรียก `/api/upload/commit`
// ให้ server ย้ายเข้า Drive
// 🐞 ห้ามเปลี่ยนกลับไปให้เบราว์เซอร์ยิงเข้า Drive ตรง — ลองแล้วบน prod (2026-08-17)
// googleapis.com ไม่ตอบ CORS ให้ resumable session URL: session สร้างสำเร็จแต่ PUT ตาย
// `TypeError: Failed to fetch` ทุกครั้ง · เลี่ยงไม่ได้เพราะ PUT ข้ามโดเมนต้องผ่าน
// preflight เสมอ (ไม่ใช่ simple request เหมือน GET/POST)
//
// คืน ref รูปแบบเดียวกับที่ `/api/upload` เคยคืน — `{ url, driveFileId,
// storageBucket, storagePath, mimeType }` — ผู้เรียกจึงส่งต่อให้ endpoint metadata
// (`/api/master/attachments` · `/api/updates` · accept ของใบเสนอราคา) ได้เหมือนเดิม
// @throws {Error} ข้อความไทยพร้อมโชว์ผู้ใช้ — ผู้เรียกเลือกเองว่าจะ toast หรือใส่ในฟอร์ม
//
// 🐞 **ตัวนี้ทำครึ่งเดียว และครึ่งที่ขาดคือครึ่งที่ทำให้ไฟล์ "มีอยู่"**
// เดิมชื่อ `uploadFileForEntity` ซึ่งอ่านแล้วเหมือน "แนบไฟล์ให้ entity นี้เรียบร้อย"
// ฟอร์มสร้างงานเลยเรียกตัวนี้แล้วทิ้ง ref ที่คืนมา ⇒ ไบต์ขึ้น Drive จริงแต่ไม่มีแถวใน
// `attachments` ⇒ แผงไฟล์แนบว่างเปล่าโดยไม่มี error สักตัว ผู้ใช้เห็นว่า "แนบแล้วหาย"
// และไม่มีใครรู้ตั้งแต่ 17/07 ถึง 24/08/69 (PR #1394)
//
// ⭐ **ไฟล์แนบปกติให้ใช้ `uploadAttachment()` (lib/master/attachmentUpload.js)** ซึ่งทำ
// ทั้งสองขั้นและลบไฟล์ทิ้งให้เองถ้าขั้นบันทึกแถวล้ม · เรียกตัวนี้ตรง ๆ ได้เฉพาะเมื่อ
// **เอา ref ไปเขียนลงคอลัมน์ของตัวเอง** (หลักฐาน Won · สลิปชำระ · รูปปิดงานบริการ ·
// ไฟล์ในเธรดอัปเดต) — ทะเบียนผู้เรียกที่อนุญาตอยู่ที่ `uploadBytesCallers.test.mjs`

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
  const up = await apiFetch('/api/upload', { method: 'POST', body: fd });
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

export async function uploadFileBytes({ file, entityType, entityId, onProgress = null }) {
  // เช็คก่อนยิง (กันเสียเวลาอัปแล้วโดนปฏิเสธ) — server ตรวจชุดเดียวกันซ้ำเสมอ
  const verdict = checkUploadCandidate({
    fileName: file?.name, mimeType: file?.type, sizeBytes: file?.size,
  });
  if (!verdict.ok) throw new Error(verdict.error);

  const res = await apiFetch('/api/upload/session', {
    method: 'POST',
    // ⭐ POST ที่ **ลองใหม่ได้ปลอดภัย** — ขั้นนี้ไม่เขียนอะไรลงระบบ แค่ขอ signed URL
    // หนึ่งอัน · ยิงซ้ำได้ URL ที่ไม่มีใครใช้เพิ่มมาหนึ่งอันแล้วหมดอายุไปเอง
    // 🐞 01/09/69 ขานี้คือขาที่ล้ม (staging ไม่มีไบต์เข้าเลย) — คอนเนกชันสะดุดครั้งเดียว
    // ทำให้แนบไฟล์ไม่ได้ทั้งใบ ทั้งที่ลองใหม่ครั้งเดียวก็พอ
    retry: true,
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

    // ปลายทาง Drive — ขาแรกขึ้นที่พัก, ขาสอง server ย้ายเข้า Drive แล้วลบที่พักให้
    // progress นับแค่ขาแรก (ขาสองเป็นงานฝั่ง server ที่ผู้ใช้รอเฉย ๆ) ⇒ ตรึงไว้ที่ 1
    // เมื่อไบต์ขึ้นครบ ไม่ให้แถบค้างที่ 99% ระหว่างรอ commit
    await putWithProgress(session.signedUrl, file, session.contentType, onProgress);
    onProgress?.(1);
    const commit = await apiFetch('/api/upload/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityType, entityId, storagePath: session.storagePath, fileName: file.name,
      }),
    });
    if (!commit.ok) throw new Error(await describeResponseError(commit, 'ย้ายไฟล์เข้าที่เก็บไม่สำเร็จ'));
    const moved = await commit.json();
    return {
      url: moved.url || null,
      driveFileId: moved.driveFileId || null,
      storageBucket: null,
      storagePath: null,
      mimeType: moved.mimeType || session.contentType,
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
