import { describeResponseError } from '@/lib/fetchError';
import { uploadFileForEntity } from '@/lib/master/uploadFile';

// ── อัปไฟล์แนบ 1 ไฟล์: storage → แถว metadata ──────────────────────────
//
// ยกออกจาก `AttachmentsPanel.upload()` เพราะมีผู้เรียกที่สองแล้ว (โมดัลเปิดคำร้อง
// ซึ่งต้องอัปหลังคำร้องถูกสร้าง จึงใช้พาเนลไม่ได้ — พาเนลต้องมี entityId ตั้งแต่
// ตอน render) · กฎ AGENTS.md: สองทางเรียกใช้ = ยกเป็นชิ้นเดียว ไม่ก๊อป
//
// ⚠️ ลำดับสองสเต็ปนี้เปลี่ยนไม่ได้: เอาไฟล์ขึ้น Drive ก่อน แล้วค่อยบันทึกแถว metadata
// · ถ้าสเต็ปสองล้ม **ต้องลบไฟล์ที่เพิ่งอัปทิ้ง** ไม่งั้นเหลือไฟล์กำพร้าบน Drive
// ที่ไม่มีแถวไหนชี้ถึงและไม่มีใครเห็นในระบบอีกเลย
//
// สเต็ปแรกอยู่ใน lib/master/uploadFile.js — เบราว์เซอร์ยิงไบต์ขึ้น Drive เอง ไม่ผ่าน
// function (เพดาน request body ของโฮสติ้งคือ 4.5 MB)
//
// คืน { ok, error } — ไม่ toast เอง ผู้เรียกเป็นคนเลือกว่าจะแสดงยังไง
export async function uploadAttachment({
  entityType, entityId, file, docType = 'other', metadata = null, onProgress = null,
}) {
  let url = null;
  let driveFileId = null;
  try {
    // ข้อความจริงจากชั้นอัปก่อนเสมอ — "อัปโหลดไฟล์ไม่สำเร็จ" ตายตัวทำให้ผู้ใช้ไม่รู้ว่า
    // ติดชนิดไฟล์ ขนาด หรือท่อ Drive และคนดูแลระบบตามไม่ได้
    ({ url, driveFileId } = await uploadFileForEntity({
      file, entityType, entityId, onProgress,
    }));
  } catch (err) {
    return { ok: false, error: err?.message || 'อัปโหลดไฟล์ไม่สำเร็จ' };
  }

  const res = await fetch('/api/master/attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entityType,
      entityId,
      docType,
      fileUrl: url,
      driveFileId,
      fileName: file.name,
      mimeType: file.type || null,
      sizeBytes: file.size,
      metadata,
    }),
  });
  if (!res.ok) {
    if (driveFileId) {
      fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveFileId }),
      }).catch(() => {});
    }
    return { ok: false, error: await describeResponseError(res, 'บันทึกเอกสารไม่สำเร็จ') };
  }
  return { ok: true, error: null };
}
