// ── ฝั่งจอ: รู้จัก "เอกสารมีชีวิต" และรู้ว่าจะฝังมันยังไง ──────────────────
// ไฟล์ล้วน ไม่มี I/O — ใช้ได้ทั้งใน client component และในเทสต์
//
// ⚠️ `fileUrl` ที่เก็บไว้เป็น webViewLink (`/edit`) ซึ่ง **ฝัง iframe ไม่ได้** —
// Google ส่ง X-Frame-Options มาบล็อก ต้องประกอบเป็น `/preview` เอง ห้ามเดาว่า
// เติม `?embedded=true` ต่อท้าย /edit แล้วจะได้ (ไม่ได้ และล้มแบบเงียบ)

// ชนิดเอกสาร Google ที่ระบบสร้าง/ผูกได้ — ตรงกับ GOOGLE_NATIVE_MIME ใน lib/drive
const PREVIEW_SEGMENT = { gdoc: 'document', gsheet: 'spreadsheets' };

export const isGoogleDoc = (item) => !!PREVIEW_SEGMENT[item?.metadata?.kind];

export const googleDocKindLabel = (item) => (item?.metadata?.kind === 'gsheet' ? 'Sheet' : 'Doc');

// ลิงก์สำหรับ "ดูในหน้า" — คืน null ถ้าแถวนี้ไม่ใช่เอกสาร Google หรือไม่มี id
// (แถวเก่าที่ผูกไว้ก่อนมี metadata ครบ) ⇒ ผู้เรียกต้องไม่แสดงปุ่มดู
export function googleDocPreviewUrl(item) {
  const segment = PREVIEW_SEGMENT[item?.metadata?.kind];
  const id = item?.metadata?.googleFileId;
  if (!segment || !id) return null;
  return `https://docs.google.com/${segment}/d/${encodeURIComponent(id)}/preview`;
}
