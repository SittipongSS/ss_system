/* ชื่อไฟล์จาก Content-Disposition — ปุ่มดาวน์โหลด Excel ตัวกลางใช้ (แยกไฟล์ไว้ให้เทสต์ได้โดยไม่ต้องโหลด JSX)
   รองรับ `filename*=UTF-8''…` (ชื่อไทย · RFC 5987) ก่อน `filename="…"` */
export function filenameFromDisposition(header, fallback = 'report.xlsx') {
  const text = String(header || '');
  const star = /filename\*=UTF-8''([^;]+)/i.exec(text);
  if (star) {
    try { return decodeURIComponent(star[1].trim()); } catch { /* ถอดไม่ได้ = ใช้ตัวธรรมดา */ }
  }
  const plain = /filename="([^"]+)"/i.exec(text);
  return plain ? plain[1] : fallback;
}
