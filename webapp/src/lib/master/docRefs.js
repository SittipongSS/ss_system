// ── รหัสเอกสารในข้อความ → ลิงก์ ─────────────────────────────────────────
//
// ⭐ คนในระบบนี้คุยกันด้วย "เลขที่เอกสาร" ตลอดเวลา ("อ้างตาม QT-26070028-0 นะ")
// แต่เดิมเธรดแสดงข้อความดิบล้วน ๆ เลขที่จึงเป็นแค่ตัวหนังสือที่กดไม่ได้ ต้องคัดลอก
// ไปวางในช่องค้นหาของอีกหน้าเอง
//
// ⚠️ หน้ารายละเอียดของ QT/SO/ดีล เปิดด้วย **id** ไม่ใช่เลขที่เอกสาร (มีแต่โครงการ
// ที่ `loadProject` รับ code ได้) → ถ้าให้ตัว render ไปหา id เองจะกลายเป็นยิง DB
// ทุกครั้งที่วาดข้อความ · จึงทำเป็นเส้นทางกลาง `/go/<รหัส>` ที่ resolve แล้ว
// redirect แทน — ลิงก์เป็น href ธรรมดา ไม่ต้อง fetch ตอนวาด และสิทธิ์ถูกตรวจ
// ตอนกด ซึ่งเป็นจังหวะที่ถูกต้องอยู่แล้ว
//
// ไฟล์นี้ไม่มี I/O เพื่อให้ทั้งฝั่ง client (RichText) และ server (/go) ใช้ร่วมกันได้

// คำนำหน้า → ตารางและวิธีเปิด
// ⚠️ QT/SO/ET ตั้งรูปแบบเลขได้เองในหน้าตั้งค่า (documentStandards) — คำนำหน้าที่นี่
// คือค่าตั้งต้นของระบบ ถ้าองค์กรเปลี่ยนรูปแบบ รหัสแบบใหม่จะไม่กลายเป็นลิงก์
// (ข้อความยังอ่านได้ปกติ) ไม่ใช่พังหรือลิงก์ผิดที่
export const DOC_REF_TYPES = {
  QT: { label: 'ใบเสนอราคา', table: 'quotations', column: 'quoteNumber', path: (id) => `/sa/quotations/${id}` },
  SO: { label: 'ใบสั่งขาย', table: 'sales_orders', column: 'orderNumber', path: (id) => `/sa/sales-orders/${id}` },
  PJ: { label: 'โครงการ', table: 'projects', column: 'code', path: (id) => `/sa/projects/${id}` },
  DL: { label: 'ดีล', table: 'sales_deals', column: 'code', path: (id) => `/sa/deals/${id}` },
  CR: { label: 'ใบขอราคาผลิต', table: 'costing_requests', column: 'code', path: (id) => `/sa/costing/${id}` },
  DR: { label: 'คำร้อง', table: 'dept_requests', column: 'code', path: (id) => `/requests/${id}` },
};

// รูปแบบที่ยอมรับ: คำนำหน้า 2 ตัวอักษร + ขีด + ตัวเลข/ขีด (เช่น QT-26070028-0, PJ-26070027)
// ⚠️ ต้องไม่จับคำที่มีตัวอักษรติดหน้า/หลัง ("ไม่ใช่XQT-1" หรือ "QT-1ต่อ") — ใช้ขอบเขต
// แบบเขียนเองเพราะ `\b` ของ JS ไม่รู้จักพยัญชนะไทย (ทุกตัวนับเป็น non-word)
const CODE_BODY = '[0-9][0-9-]*[0-9]|[0-9]';
export const DOC_REF_PATTERN = new RegExp(
  `(?<![\\w\\u0E00-\\u0E7F-])(${Object.keys(DOC_REF_TYPES).join('|')})-(${CODE_BODY})(?![\\w\\u0E00-\\u0E7F-])`,
  'g',
);

// แยกคำนำหน้าออกจากรหัส — คืน null ถ้าไม่ใช่รหัสที่ระบบรู้จัก
export function parseDocRef(code) {
  const text = String(code || '').trim().toUpperCase();
  const prefix = text.slice(0, 2);
  const conf = DOC_REF_TYPES[prefix];
  if (!conf) return null;
  const single = new RegExp(`^(${prefix})-(${CODE_BODY})$`);
  if (!single.test(text)) return null;
  return { prefix, code: text, ...conf };
}

// ลิงก์ที่ใส่ในข้อความ — ชี้เส้นทางกลางเสมอ (ตัว resolve อยู่ที่ app/go/[code])
export const docRefHref = (code) => `/go/${encodeURIComponent(String(code || '').trim().toUpperCase())}`;
