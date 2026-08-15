// ── รูปร่างบรรทัดที่ฝ่าย RD เป็นเจ้าของ ──────────────────────────────────
//
// ⚠️ **"รูปร่างบรรทัด" กับ "หัวข้อ" เป็นคนละแกน** — หัวข้อบอกว่าใบนี้ขออะไร
// รูปร่างบรรทัดบอกว่าแถวข้างในหน้าตาแบบไหน · ตัวที่ทำให้เห็นชัดคือ `scent_dev`:
// หัวข้อ "พัฒนากลิ่น" **ไม่มีบรรทัดตอนเปิด** (`hasItems: false`) แต่แถวชนิด
// `scent_dev` เกิดทีหลังตอน RD ส่งของ ⇒ รูปร่างนี้มีอยู่โดยไม่มีหัวข้อไหนประกาศ
import { normalizeProductDevItems } from '../../lines';

// RD สร้างแถวเองตอนส่ง (ดู lib/requests/delivery.js) ไม่ได้มาจากฟอร์มตอนเปิดใบ
// ⇒ ไม่มี `normalize` — ไม่ใช่ลืม แต่ไม่มีทางเข้าให้ normalize
const scentDevLine = {
  key: 'scent_dev',
  labels: { pending: 'รอส่ง', done: 'เสร็จแล้ว', declined: 'ไม่ถูกเลือก' },
  normalize: null,
};

const productDevLine = {
  key: 'product_dev',
  labels: { pending: 'รอส่ง', done: 'เสร็จแล้ว', declined: 'ไม่ถูกเลือก' },
  normalize: (input) => normalizeProductDevItems(input),
};

const RD_LINE_SHAPES = [scentDevLine, productDevLine];

export default RD_LINE_SHAPES;
