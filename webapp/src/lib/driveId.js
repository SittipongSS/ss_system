// แยก fileId จาก Drive URL (รองรับ /d/<id>/, ?id=<id>, /document|spreadsheet/d/<id>).
//
// อยู่ไฟล์ของตัวเอง (ไม่อยู่ใน lib/drive.js) เพราะเป็นฟังก์ชันล้วน — lib/drive.js ลาก googleapis
// กับ OIDC ของ Vercel มาด้วย ⇒ ตัวตัดสินที่ต้องเทสต์ได้โดยไม่มี Drive จริง (เช่น "ไฟล์นี้เป็นของ
// นัดนี้ไหม" ใน lib/service/visitFiles.js) import จากที่นี่ · lib/drive.js ส่งต่อชื่อเดิมให้ผู้เรียกเก่า
export function parseDriveId(url) {
  if (!url) return null;
  const s = String(url);
  const m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
}
