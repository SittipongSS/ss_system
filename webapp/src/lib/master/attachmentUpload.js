import { describeResponseError } from '@/lib/fetchError';

// ── อัปไฟล์แนบ 1 ไฟล์: storage → แถว metadata ──────────────────────────
//
// ยกออกจาก `AttachmentsPanel.upload()` เพราะมีผู้เรียกที่สองแล้ว (โมดัลเปิดคำร้อง
// ซึ่งต้องอัปหลังคำร้องถูกสร้าง จึงใช้พาเนลไม่ได้ — พาเนลต้องมี entityId ตั้งแต่
// ตอน render) · กฎ AGENTS.md: สองทางเรียกใช้ = ยกเป็นชิ้นเดียว ไม่ก๊อป
//
// ⚠️ ลำดับสองสเต็ปนี้เปลี่ยนไม่ได้: /api/upload เอาไฟล์ขึ้น Drive ก่อน แล้วค่อย
// บันทึกแถว metadata · ถ้าสเต็ปสองล้ม **ต้องลบไฟล์ที่เพิ่งอัปทิ้ง** ไม่งั้นเหลือไฟล์
// กำพร้าบน Drive ที่ไม่มีแถวไหนชี้ถึงและไม่มีใครเห็นในระบบอีกเลย
//
// คืน { ok, error } — ไม่ toast เอง ผู้เรียกเป็นคนเลือกว่าจะแสดงยังไง
export async function uploadAttachment({
  entityType, entityId, file, docType = 'other', metadata = null,
}) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('entityType', entityType); // Drive: resolve โฟลเดอร์ปลายทาง
  fd.append('entityId', entityId);

  const up = await fetch('/api/upload', { method: 'POST', body: fd });
  if (!up.ok) {
    // ข้อความจริงจาก server ก่อนเสมอ — "อัปโหลดไฟล์ไม่สำเร็จ" ตายตัวทำให้ผู้ใช้ไม่รู้ว่า
    // ติดชนิดไฟล์ ขนาด หรือท่อ Drive และคนดูแลระบบตามไม่ได้
    // ⚠️ คำขอที่ถูกตัดก่อนถึง handler (เช่นเพดานขนาดของชั้นโฮสติ้ง) ตอบกลับเป็น HTML
    // ไม่ใช่ JSON — describeResponseError เก็บ status ไว้ให้แทนที่จะทิ้งไปเงียบ ๆ
    return { ok: false, error: await describeResponseError(up, 'อัปโหลดไฟล์ไม่สำเร็จ') };
  }
  const { url, driveFileId } = await up.json();

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
