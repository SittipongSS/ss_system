import { uploadFileBytes } from '@/lib/master/uploadFile';
import { apiFetch } from "@/lib/apiFetch";

// ── ส่งอัปเดตหนึ่งข้อความพร้อมไฟล์แนบ ────────────────────────────────────
//
// ⭐ ยกออกจาก `UpdateThread.post()` เพราะมีผู้เรียกที่สองแล้ว (โมดัลรับลีดใหม่ ซึ่งต้อง
// แนบไฟล์ **หลัง** ลีดถูกสร้าง จึงยังไม่มีเธรดให้พิมพ์ตอนกรอกฟอร์ม) — กฎ AGENTS.md:
// สองทางเรียกใช้ = ยกเป็นชิ้นเดียว ไม่ก๊อป
//
// ⚠️ ลำดับสองสเต็ปเปลี่ยนไม่ได้: อัปไฟล์ขึ้น Drive ให้ครบก่อน แล้วค่อยส่งข้อความ
// พร้อม ref · สลับลำดับเมื่อไรจะได้ข้อความที่อ้างไฟล์ซึ่งยังไม่มีอยู่จริง
//
// ⚠️ **ไม่กลืน error ของชั้นอัป** — ข้อความจริงบอกได้ว่าติดชนิดไฟล์ ขนาด หรือท่อ Drive
// ซึ่งแก้คนละทาง

/** อัปไฟล์ทีละใบขึ้น Drive แล้วคืน ref ที่พร้อมแนบไปกับข้อความ */
export async function uploadUpdateFiles({ entityType, entityId, files = [] }) {
  const attachments = [];
  for (const file of files) {
    // ไบต์ขึ้น Drive ตรงจากเบราว์เซอร์ (ไม่ผ่าน function = ไม่ติดเพดาน 4.5 MB)
    const ref = await uploadFileBytes({ file, entityType, entityId });
    attachments.push({
      fileUrl: ref.url,
      driveFileId: ref.driveFileId || null,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
  }
  return attachments;
}

/**
 * ส่งอัปเดตหนึ่งข้อความ (ข้อความอย่างเดียว · ไฟล์อย่างเดียว · หรือทั้งคู่)
 * @throws {Error} ข้อความจริงจาก server — ผู้เรียกเป็นคนเลือกว่าจะแสดงยังไง
 */
export async function postUpdateWithFiles({
  entityType, entityId, body = '', files = [], ...rest
}) {
  const attachments = await uploadUpdateFiles({ entityType, entityId, files });
  const res = await apiFetch('/api/updates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityType, entityId, body: body.trim(), attachments, ...rest }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ส่งอัปเดตไม่สำเร็จ');
  return data;
}
