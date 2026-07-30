// ── ปลายทางเก็บไฟล์แนบ + ด่านตรวจที่อยู่ไฟล์ ─────────────────────────────
// ที่เดียวที่รู้ว่า "ไฟล์แนบของระบบนี้อยู่ที่ไหนได้บ้าง" — ใช้ทั้งตอนอัปโหลด
// (/api/upload), ตอนบันทึก metadata (/api/attachments) และตอนลบไฟล์จริง
// (lib/master/attachments) · เดิมชื่อ bucket ถูกเขียนซ้ำสองที่ด้วยค่า default
// ที่ผิด ทำให้ลบไฟล์ไม่ออกเงียบ ๆ

// bucket ของไฟล์แนบทั่วไป (public) — ค่านี้ต้องตรงกับ bucket ที่มีอยู่จริง
// 🐞 เดิม default เป็น 'uploads' ซึ่ง **ไม่มี bucket ชื่อนี้อยู่จริง** (ยืนยันแล้ว:
// 404 NoSuchBucket) ผลคือทุก environment ที่ไม่ตั้ง SUPABASE_STORAGE_BUCKET
// จะอัปโหลดพัง 500 "File upload failed" โดยไม่บอกสาเหตุ และร้ายกว่านั้นคือ
// objectPathFromUrl() แกะ path ของไฟล์เก่าไม่ออก (marker มีชื่อ bucket อยู่ข้างใน)
// → ลบแถวได้แต่ไฟล์ยังอยู่ใน bucket public อ่านได้ตลอดไป
export const DEFAULT_UPLOAD_BUCKET = 'ss-customer';

// โดเมนของ Google Drive/Docs ที่ backend Drive คืนมาเป็น webViewLink
//   drive.google.com — ไฟล์ที่อัปผ่าน uploadFile()
//   docs.google.com  — เอกสาร Google native (mgmt/docs สร้าง/ผูก) ซึ่งตั้งใจให้
//                      เปิดผ่านลิงก์ตรง ไม่ผ่าน proxy stream
const GOOGLE_FILE_HOSTS = ['drive.google.com', 'docs.google.com'];

let warnedMissingBucket = false;

// ชื่อ bucket ที่ใช้จริง — อ่าน env ตอนเรียก (ไม่ใช่ตอน import) เพื่อให้เทสต์คุมค่าได้
export function uploadBucket() {
  const fromEnv = process.env.SUPABASE_STORAGE_BUCKET;
  if (fromEnv) return fromEnv;
  // ค่า default ใช้งานได้ แต่บน production การไม่ตั้ง env คือความพลาดของการ deploy
  // — ทำให้ดังใน log ครั้งเดียว (แพตเทิร์นเดียวกับ proxy.js ตอน env auth หาย)
  if (process.env.NODE_ENV === 'production' && !warnedMissingBucket) {
    warnedMissingBucket = true;
    console.error(
      `[attachments] SUPABASE_STORAGE_BUCKET ไม่ได้ตั้งค่า — ใช้ค่า default '${DEFAULT_UPLOAD_BUCKET}' ` +
        'ถ้า bucket จริงไม่ใช่ชื่อนี้ การอัปโหลดจะพัง 500 และไฟล์เก่าจะลบไม่ออก',
    );
  }
  return DEFAULT_UPLOAD_BUCKET;
}

// ── ด่านตรวจที่อยู่ไฟล์แนบ ────────────────────────────────────────────────
// 🐞 บั๊กจริง: `POST /api/attachments` รับ `fileUrl` จาก client ทั้งดุ้นโดยไม่ตรวจว่า
// ชี้เข้า storage ของเราไหม และ client ตั้ง `driveFileId: null` เองได้ ผลสองอย่าง:
//   1. AttachmentsPanel render แถวที่ไม่มี driveFileId เป็น <a href> ของ URL นั้นดิบ ๆ
//   2. proxy /api/master/attachments/[id]/file สาขา !driveFileId ทำ 307 redirect ไป
//      URL นั้น = **open redirect จากโดเมนของแอปเราเอง** (ใช้ทำ phishing ได้เพราะ
//      ลิงก์ที่เหยื่อเห็นเป็นโดเมนที่เชื่อถือ)
// คืน null = ผ่าน, คืนข้อความ = ไม่ผ่าน (ให้ผู้เรียกตอบ 400)
export function attachmentUrlError(fileUrl, { supabaseUrl, bucket } = {}) {
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
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return 'ที่อยู่ไฟล์ไม่ถูกต้อง';
  }
  if (target.protocol === 'https:' && GOOGLE_FILE_HOSTS.includes(target.host)) return null;

  // Supabase Storage: ต้องเป็นโฮสต์ของโปรเจกต์เรา และอยู่ใต้ bucket ของเราเท่านั้น
  if (supabaseUrl && bucket) {
    let base = null;
    try {
      base = new URL(supabaseUrl);
    } catch {
      base = null;
    }
    if (
      base
      && target.host === base.host
      && target.protocol === base.protocol
      && target.pathname.startsWith(`/storage/v1/object/public/${bucket}/`)
    ) {
      return null;
    }
  }
  return 'ที่อยู่ไฟล์ต้องเป็นไฟล์ที่อัปโหลดผ่านระบบเท่านั้น';
}

// เวอร์ชันที่อ่าน env ให้เอง — ผู้เรียกฝั่ง server ใช้ตัวนี้
export function attachmentUrlErrorForEnv(fileUrl) {
  return attachmentUrlError(fileUrl, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    bucket: uploadBucket(),
  });
}
