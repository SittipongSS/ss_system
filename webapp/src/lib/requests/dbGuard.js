// ── แปล exception ของ trigger `guard_dept_request` (mig 0173) เป็นภาษาคน ────
//
// trigger โยนรหัสดิบ (`dept_request_doc_no_immutable` · `dept_request_delete_forbidden`
// · `dept_request_cancelled_immutable`) แล้ว route ส่งต่อ `e.message` ให้หน้าจอทั้งดุ้น
// ⇒ ผู้ใช้เห็นข้อความภาษาอังกฤษที่ไม่มีทางเดาได้ว่าต้องทำอะไรต่อ
// (ของจริง: IS-26080010 เจอ `dept_request_doc_no_immutable` ตอนกดส่งคำร้องที่ถูกตีกลับ)
//
// ⚠️ **ไม่ใช่ด่าน** — ด่านจริงอยู่ที่ `lib/requests/stages.js` ซึ่งตอบเป็นภาษาไทย
// ตั้งแต่ก่อนแตะ DB · ตัวนี้เป็นตาข่ายรับกรณีที่หลุดด่านมาถึง trigger เท่านั้น
// ⇒ ข้อความจึงต้องบอก "ทำอะไรต่อ" ไม่ใช่แค่บอกว่าพัง
//
// ⚠️ เทียบด้วย `includes` เพราะ postgres ห่อข้อความไว้ในรูปแบบของตัวเอง
// (`dept_request_doc_no_immutable` มาพร้อมบริบทอื่นในข้อความเดียวกัน)
const GUARD_MESSAGES = {
  dept_request_doc_no_immutable:
    'คำร้องใบนี้มีเลขที่อยู่แล้ว เปลี่ยนเลขไม่ได้ — รีเฟรชหน้าแล้วกดส่งใหม่อีกครั้ง',
  dept_request_delete_forbidden:
    'คำร้องที่เคยส่งแล้วลบไม่ได้ — ใช้ยกเลิกคำร้องแทน หรือให้ผู้ดูแลระบบบังคับลบ',
  dept_request_cancelled_immutable:
    'คำร้องใบนี้ถูกยกเลิกไปแล้ว แก้ไขต่อไม่ได้',
};

/** ข้อความไทยของ guard ที่ยิง — หรือ null ถ้าไม่ใช่ error ของ guard */
export function requestGuardMessage(error) {
  const raw = String(error?.message ?? error ?? '');
  if (!raw) return null;
  for (const [code, message] of Object.entries(GUARD_MESSAGES)) {
    if (raw.includes(code)) return message;
  }
  return null;
}
