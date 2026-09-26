"use client";
// ── อัปไฟล์สองชุดของฟอร์มคีย์ใบสั่งขายย้อนหลัง (mig 0374) ─────────────────────────────
//
// สองชุดนี้อัปได้ **หลังใบเกิดแล้วเท่านั้น** (ต้องมีแถวก่อนถึงจะมีเจ้าของให้แนบ):
//   ① ไฟล์เอกสารแทนสัญญา → แถว `attachments` ของ *สัญญา* (entityType 'contract' · docType external_doc)
//      — RPC ส่งอนุมัติตรวจว่ามีแถวนี้ และ AE Sup อนุมัติจากไฟล์นี้ (`signedFileId`)
//   ② หลักฐานงวดยกมา → ไบต์ขึ้น bucket ส่วนตัวใต้ `sales-orders/<ใบ>/payments/` แล้ว **ref ลงแถวงวด**
//      (ไม่ผ่านตาราง attachments — หลักฐานการชำระของทั้งระบบเก็บแบบนี้ ดู privateEvidence)
//
// 🐞 **กดใหม่ต้องไม่อัปซ้ำ** (กฎบ้าน retry-must-not-reupload · บทเรียนเดียวกับ `uploadUpdateFiles`)
//   ฟอร์มค้างไฟล์ไว้ให้เมื่อบันทึกไม่สำเร็จ (ตั้งใจ: ที่แนบไว้ต้องไม่หาย) ⇒ ถ้ากดรอบสองแล้วอัปใหม่หมด
//   จะได้ไฟล์กำพร้าบน Drive/bucket และแถวไฟล์สัญญาซ้ำที่ AE Sup ต้องมานั่งเดาว่าใบไหนคือใบจริง
//   ⇒ ผู้เรียกส่ง `{ file, ref }` เข้ามาได้ · ใบที่พก ref/attachmentId มาแล้ว = อัปเสร็จแล้ว ข้ามไป
//
// ⚠️ ไม่กลืน error ของชั้นอัป — ข้อความจริงบอกได้ว่าติดชนิดไฟล์ ขนาด หรือท่อ Drive ซึ่งแก้คนละทาง
import { uploadAttachment } from "@/lib/master/attachmentUpload";
import { uploadFileBytes } from "@/lib/master/uploadFile";
import { EXTERNAL_DOC_TYPE } from "@/lib/master/attachmentTypes";

const pick = (item) => (item?.file ? item : { file: item, ref: null });
/* ⭐ รีวิวขั้น ④ 25/09: error ของการอัปพกชื่อไฟล์ + ชุดที่ล้ม (`failedFile`) ⇒ แผงบันทึกบอกได้ว่าไฟล์ไหนอัปไม่ขึ้น และเสนอ
   "เอาไฟล์นี้ออกจากตะกร้า" (ไฟล์ที่ติดค้างในตะกร้าที่ไม่ได้อยู่บนจอขั้น ④ เคยเป็นทางตันที่มองไม่เห็น) */
/* `key` = คีย์ของไฟล์ในตะกร้า (ชื่อ:ขนาด:เวลาแก้ — ตัวเดียวกับ `PendingFiles`/ฟอร์ม) ⇒ ปุ่ม "เอาไฟล์นี้ออกจากตะกร้า" ชี้ไฟล์ถูกใบแม้ชื่อซ้ำ */
const failed = (message, file, kind) => Object.assign(new Error(message), {
  failedFile: { name: file?.name || '', kind, key: file ? `${file.name}:${file.size}:${file.lastModified}` : '' },
});

/**
 * ① ไฟล์เอกสารแทนสัญญา — หนึ่งใบต่อหนึ่งแถว attachments ของสัญญา
 * @param {Array<File|{file: File, ref?: object}>} files
 * @param {(file: File, ref: object) => void} [onUploaded] เรียกทันทีที่ **แต่ละใบ** สำเร็จ
 *   ก่อนขั้นถัดไปจะมีโอกาสล้ม ⇒ ผู้เรียกจำไว้ส่งกลับเข้ามาตอนกดใหม่
 * @throws {Error} ข้อความจริงจากชั้นอัป
 */
export async function uploadContractFiles({ contractId, files = [], onUploaded }) {
  if (!contractId) throw new Error("ยังไม่มีเอกสารแทนสัญญาให้แนบไฟล์ — บันทึกใบก่อน");
  const done = [];
  for (const item of files) {
    const { file, ref } = pick(item);
    if (ref) { done.push(ref); continue; }
    const result = await uploadAttachment({
      entityType: "contract", entityId: contractId, file, docType: EXTERNAL_DOC_TYPE,
    });
    if (!result.ok) throw failed(result.error || `แนบไฟล์ ${file?.name || ""} ไม่สำเร็จ`, file, "contract");
    const uploaded = { fileName: file?.name || null, docType: EXTERNAL_DOC_TYPE };
    onUploaded?.(file, uploaded);
    done.push(uploaded);
  }
  return done;
}

/**
 * ② หลักฐานงวดยกมา — ref ลงแถวงวด (ตัวเขียนของ RPC แก้ใบเป็นคนผูกให้ในจังหวะถัดไป)
 * ⚠️ รูปของ ref ต้องตรงกับที่ `sanitizeHistoricalEvidence` ยอมรับ: bucket ส่วนตัว + storagePath
 *   ของใบนี้เท่านั้น · `fileUrl` ถูกล้างทิ้งฝั่ง server อยู่แล้ว แต่ไม่ส่งมาตั้งแต่ต้นจะชัดกว่า
 */
export async function uploadOpeningEvidence({ orderId, files = [], onUploaded }) {
  if (!orderId) throw new Error("ยังไม่มีใบสั่งขายให้แนบหลักฐาน — บันทึกใบก่อน");
  const refs = [];
  for (const item of files) {
    const { file, ref } = pick(item);
    if (ref) { refs.push(ref); continue; }
    let stored;
    try {
      stored = await uploadFileBytes({ file, entityType: "sales_order_payment_evidence", entityId: orderId });
    } catch (error) {
      throw failed(error?.message || `อัปโหลด ${file?.name || ""} ไม่สำเร็จ`, file, "evidence");
    }
    const uploaded = {
      storageBucket: stored.storageBucket || null,
      storagePath: stored.storagePath || null,
      fileName: file?.name || null,
      mimeType: file?.type || null,
      sizeBytes: file?.size ?? null,
    };
    onUploaded?.(file, uploaded);
    refs.push(uploaded);
  }
  return refs;
}
