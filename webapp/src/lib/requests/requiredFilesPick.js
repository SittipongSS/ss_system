// ── ตะกร้าไฟล์บังคับ (ฟอร์มสร้าง) — ไฟล์ไหนเข้า · ข้อความไหนยังต้องค้างบนจอ (ผลรีวิวรอบแก้ S4) ─────────
//
// 🔴 ชุดเดียวมีได้ทั้งไฟล์ใหญ่เกิน (ตัวรับไฟล์ทิ้งเองแล้วบอกผ่าน `onOversize` **ก่อน** ส่งไฟล์ที่เหลือมา) และไฟล์ชนิดผิด
//    เดิมบล็อกตั้งข้อความเดียว `setMessage(ชนิดผิด ? rejectText : "")` ในรอบเดียวกัน ⇒ คำเตือนไฟล์ใหญ่ถูกล้างทิ้ง
//    ทันที — ลาก plan.pdf 40 MB กับ site.jpg 2 MB = เห็น site.jpg เข้า ไม่มีข้อความ เข้าใจว่าแนบครบสองไฟล์
// ⇒ สองข้อความแยกกัน: ชนิดผิดตัดสินจากชุดนี้ · ไฟล์ใหญ่ล้างเฉพาะชุดเพิ่มที่ไม่มีไฟล์ใหญ่ หรือเมื่อผู้ใช้ลบไฟล์
import { requestRequiredFileAccepts } from '@/lib/master/requestTypes';

const fileOf = (entry) => entry?.file || entry;

/**
 * @param spec ช่องไฟล์บังคับของรูปแบบ (`requestRequiredFiles`)
 * @param files รายการเดิมในตะกร้า (`File` หรือ `{ file, ref }`)
 * @param next รายการที่ตัวเลือกไฟล์ส่งมา (`File[]` — เดิม + ใหม่ หรือเดิมลบหนึ่ง)
 * @param oversizeInBatch ชุดนี้มีไฟล์ใหญ่เกินถูกทิ้งไปแล้วหรือไม่
 * @returns `{ files, typeMessage, clearOversize }`
 */
export function requiredFilesPick(spec, files = [], next = [], { oversizeInBatch = false } = {}) {
  const accepted = next.filter((file) => requestRequiredFileAccepts(spec, file));
  // ไฟล์เดิมคืนรูปเดิม (`{ file, ref }` ต้องไม่หลุด ref) · ไฟล์ใหม่เป็น `File`
  const kept = accepted.map((file) => files.find((entry) => fileOf(entry) === file) || file);
  if (next.length < files.length) return { files: kept, typeMessage: '', clearOversize: true };
  return {
    files: kept,
    typeMessage: accepted.length < next.length ? spec.rejectText : '',
    clearOversize: !oversizeInBatch,
  };
}
