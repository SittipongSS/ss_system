// ── ทะเบียนเนื้อหน้ารายละเอียดรายหัวข้อ (P3b · ม-34) ─────────────────────
//
// ⭐ **แกนที่สามของโมดูลแยกฝ่าย** — `kinds/registry.js` ตอบว่า "ใบนี้ขออะไร" ·
// `kinds/lineShapes.js` ตอบว่า "แถวหน้าตาแบบไหน" · ไฟล์นี้ตอบว่า **"หน้ารายละเอียด
// ของหัวข้อนี้แสดงอะไร"**
//
// ⚠️ **แยกจาก `lib/requests/kinds/` โดยตั้งใจ** — ทะเบียนที่นั่นถูก import จากฝั่ง
// server (route · permissions) ซึ่งแตะ React ไม่ได้ · ผูก component เข้าไปเมื่อไร
// จะลาก React เข้า server bundle ทั้งสาย
//
// ⚠️ เพิ่มหัวข้อใหม่ **ไม่ต้องแก้หน้า `/requests/[id]`** — ลงทะเบียนที่นี่พอ
import ScentDevDetail from './ScentDevDetail';
import SharedRequestDetail from './SharedRequestDetail';

const BY_KIND = {
  scent_dev: ScentDevDetail,
};

// หัวข้อที่ยังไม่มีจอของตัวเองใช้ตัวกลาง — **ถอยได้ ไม่โยน** เพราะใบเก่าของหัวข้อ
// ที่ถูกถอดไปแล้วต้องยังเปิดอ่านได้ (ถอยไปเป็นเธรดล้วนดีกว่าจอขาว)
export function detailForKind(kind) {
  return BY_KIND[kind] || SharedRequestDetail;
}

export { ScentDevDetail, SharedRequestDetail };
