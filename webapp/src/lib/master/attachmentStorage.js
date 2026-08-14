// ── ด่านตรวจที่อยู่ไฟล์แนบ ────────────────────────────────────────────────
// ที่เดียวที่รู้ว่า "ไฟล์แนบของระบบนี้อยู่ที่ไหนได้บ้าง" — ใช้ทั้งตอนบันทึก metadata
// (/api/attachments) และก่อน redirect ในตัว proxy ดาวน์โหลด
//
// ⭐ ตั้งแต่ 2026-07-30 ไฟล์แนบอยู่บน **Google Drive ที่เดียว** (ยืนยันกับ prod:
// 128/128 แถวมี driveFileId ไม่มีแถวไหนเหลือบน Supabase Storage เลย) ทาง Supabase
// จึงถูกตัดออกทั้งสาย — โค้ดสองทางคือแหล่งของบั๊กเกือบทุกข้อในสายอัปโหลด:
// contentType ที่เชื่อ client, rollback ที่ไม่ลบไฟล์จริง, ชื่อ bucket ที่ default ผิด
// จนลบไฟล์ไม่ออกเงียบ ๆ และ bucket public ที่ไฟล์เปิดได้โดยไม่ต้องล็อกอิน

// โดเมนของ Google Drive/Docs ที่ backend Drive คืนมาเป็น webViewLink
//   drive.google.com — ไฟล์ที่อัปผ่าน uploadFile()
//   docs.google.com  — เอกสาร Google native (เอกสารร่วม สร้าง/ผูก) ซึ่งตั้งใจให้
//                      เปิดผ่านลิงก์ตรง ไม่ผ่าน proxy stream
const GOOGLE_FILE_HOSTS = ['drive.google.com', 'docs.google.com'];

// 🐞 บั๊กจริง: `POST /api/attachments` เคยรับ `fileUrl` จาก client ทั้งดุ้นโดยไม่ตรวจว่า
// ชี้เข้า storage ของเราไหม และ client ตั้ง `driveFileId: null` เองได้ ผลสองอย่าง:
//   1. AttachmentsPanel render แถวที่ไม่มี driveFileId เป็น <a href> ของ URL นั้นดิบ ๆ
//   2. proxy /api/master/attachments/[id]/file สาขา !driveFileId ทำ 307 redirect ไป
//      URL นั้น = **open redirect จากโดเมนของแอปเราเอง** (ใช้ทำ phishing ได้เพราะ
//      ลิงก์ที่เหยื่อเห็นเป็นโดเมนที่เชื่อถือ)
// คืน null = ผ่าน, คืนข้อความ = ไม่ผ่าน (ให้ผู้เรียกตอบ 400)
export function attachmentUrlError(fileUrl) {
  const raw = String(fileUrl ?? '').trim();
  if (!raw) return 'ไม่พบไฟล์ที่อัปโหลด';

  let target;
  try {
    target = new URL(raw);
  } catch {
    // path เปล่า / `//evil.com` / ข้อความมั่ว — parse ไม่ได้ = ไม่ผ่าน
    return 'ที่อยู่ไฟล์ไม่ถูกต้อง';
  }
  // กัน javascript: / data: / blob: ซึ่ง new URL() ยอมรับแต่เป็น XSS ตอน render เป็น href
  if (target.protocol !== 'https:') return 'ที่อยู่ไฟล์ไม่ถูกต้อง';
  if (GOOGLE_FILE_HOSTS.includes(target.host)) return null;

  return 'ที่อยู่ไฟล์ต้องเป็นไฟล์ที่อัปโหลดผ่านระบบเท่านั้น';
}

// ชื่อเดิมที่ผู้เรียกฝั่ง server ใช้อยู่ — ไม่ต้องอ่าน env อีกแล้วเพราะเหลือที่เก็บเดียว
export const attachmentUrlErrorForEnv = attachmentUrlError;
