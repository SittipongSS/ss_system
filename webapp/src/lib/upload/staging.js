// ── ที่พักไฟล์ระหว่างทางขึ้น Drive (mig 0263) ────────────────────────────────
//
// Drive ไม่ยอมให้เบราว์เซอร์ PUT ขึ้น resumable session URL (ไม่มี CORS — พิสูจน์บน
// prod 2026-08-17) แต่ Supabase Storage ยอม ⇒ ไบต์เดินสองขา:
//   1. เบราว์เซอร์ PUT ขึ้น bucket นี้ด้วย signed upload URL (ไม่ผ่าน function)
//   2. `/api/upload/commit` ดาวน์โหลดจาก bucket นี้แล้วอัปเข้า Drive ให้ (ขาที่สองเป็น
//      fetch ออก ไม่ใช่ request body ⇒ ไม่ติดเพดาน 4.5 MB ของ Vercel)
//
// ⚠️ path มี **id ของผู้อัป** อยู่ในตัว: commit ยอมย้ายเฉพาะไฟล์ที่คนเรียกอัปเอง
// ไม่งั้นใครก็ยิง commit ทับ path ของคนอื่นได้
export const UPLOAD_STAGING_BUCKET = process.env.SUPABASE_UPLOAD_STAGING_BUCKET
  || 'upload-staging';

const safeSegment = (value) => String(value ?? '').replace(/[^a-zA-Z0-9_-]+/g, '_');

export function stagingPrefix(userId) {
  return `staging/${safeSegment(userId)}/`;
}

/** ชื่อ key ของ Supabase Storage ไม่รับอักขระไทย/ช่องว่าง — ล้างเป็น ASCII เหมือนสายหลักฐาน */
export function stagingObjectPath(userId, fileName, stamp = Date.now()) {
  const cleanName = String(fileName || 'file')
    .replace(/[^a-zA-Z0-9.\-_]+/g, '_')
    .replace(/^_+/, '') || 'file';
  return `${stagingPrefix(userId)}${stamp}_${crypto.randomUUID()}_${cleanName}`;
}

/** commit เชื่อ path จาก client ได้เท่าที่มันอยู่ในโฟลเดอร์ของคนเรียกเอง */
export function isOwnStagingPath(userId, storagePath) {
  if (!userId || typeof storagePath !== 'string') return false;
  // กัน `..` ไม่ให้ไต่ออกนอกโฟลเดอร์ตัวเอง (Storage มองเป็น key ตรง ๆ แต่กันไว้ก่อน)
  if (storagePath.includes('..')) return false;
  return storagePath.startsWith(stagingPrefix(userId));
}
