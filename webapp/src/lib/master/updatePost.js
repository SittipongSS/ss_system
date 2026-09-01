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
//
// 🐞 **กดส่งใหม่ต้องไม่อัปไฟล์ซ้ำ** (01/09/69) — ช่องพิมพ์ค้างข้อความ+ไฟล์ไว้ให้เมื่อส่ง
// ไม่สำเร็จ (ตั้งใจ: ที่พิมพ์ไว้ต้องไม่หาย) แต่เดิมการกดส่งรอบสองอัปไฟล์ **ทุกใบใหม่หมด**
// แม้รอบแรกอัปขึ้น Drive สำเร็จไปแล้วและล้มตอนส่งข้อความ ⇒ ไฟล์รอบแรกกลายเป็นไฟล์กำพร้า
// บน Drive (ไม่มีแถวไหนชี้ถึง · รอ `/api/cron/drive-orphans` มากวาด) และจ่าย egress ซ้ำฟรี ๆ
// ⇒ ผู้เรียกส่ง `{ file, ref }` เข้ามาได้ · ใบที่พก `ref` มาแล้ว = อัปเสร็จแล้ว ข้ามไป

/**
 * อัปไฟล์ทีละใบขึ้น Drive แล้วคืน ref ที่พร้อมแนบไปกับข้อความ
 *
 * @param {object} p
 * @param {Array<File|{file: File, ref?: object}>} p.files — ใบที่พก `ref` มาแล้วจะไม่อัปซ้ำ
 * @param {(file: File, attachment: object) => void} [p.onUploaded] — เรียกทันทีที่ **แต่ละใบ**
 *   อัปเสร็จ ก่อนขั้นถัดไปจะมีโอกาสล้ม · ผู้เรียกเก็บ ref ไว้เพื่อส่งกลับเข้ามาตอนกดใหม่
 */
export async function uploadUpdateFiles({ entityType, entityId, files = [], onUploaded }) {
  const attachments = [];
  for (const item of files) {
    const file = item?.file || item;
    const done = item?.ref || null;
    if (done) { attachments.push(done); continue; }
    // ไบต์ขึ้น Drive ตรงจากเบราว์เซอร์ (ไม่ผ่าน function = ไม่ติดเพดาน 4.5 MB)
    const ref = await uploadFileBytes({ file, entityType, entityId });
    const attachment = {
      fileUrl: ref.url,
      driveFileId: ref.driveFileId || null,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    };
    onUploaded?.(file, attachment);
    attachments.push(attachment);
  }
  return attachments;
}

/**
 * ส่งอัปเดตหนึ่งข้อความ (ข้อความอย่างเดียว · ไฟล์อย่างเดียว · หรือทั้งคู่)
 * @throws {Error} ข้อความจริงจาก server — ผู้เรียกเป็นคนเลือกว่าจะแสดงยังไง
 */
export async function postUpdateWithFiles({
  entityType, entityId, body = '', files = [], onUploaded, ...rest
}) {
  // ⭐ **ติดป้ายว่าล้มขาไหน** — สองขานี้ล้มด้วยข้อความชุดเดียวกันได้ (`apiFetch` คืน
  // "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" เหมือนกันทั้งคู่) 🐞 01/09/69 ผู้ใช้ส่งไม่ได้แล้วข้อความ
  // บนจอบอกได้แค่ "ต่อไม่ติด" — ไล่ทีละขาบน production ถึงรู้ว่าไฟล์ไม่เคยออกจากเครื่องเลย
  let attachments;
  try {
    attachments = await uploadUpdateFiles({ entityType, entityId, files, onUploaded });
  } catch (err) {
    throw new Error(`แนบไฟล์ไม่สำเร็จ — ${err.message}`);
  }

  let res;
  try {
    res = await apiFetch('/api/updates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType, entityId, body: body.trim(), attachments, ...rest }),
    });
  } catch (err) {
    // ไม่ได้ response = ไม่รู้ว่าเซิร์ฟเวอร์บันทึกไปแล้วหรือยัง จึงไม่ลองใหม่ให้เอง
    // (กติกา `apiFetch`) — แต่ไฟล์ที่อัปแล้วถูกจำไว้ กดเองอีกครั้งจึงไม่อัปซ้ำ
    throw new Error(`ส่งข้อความไม่สำเร็จ — ${err.message} · กดส่งอีกครั้งได้`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ส่งอัปเดตไม่สำเร็จ');
  return data;
}
