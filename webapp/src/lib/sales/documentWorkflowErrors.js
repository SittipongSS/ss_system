const WORKFLOW_ERRORS = Object.freeze({
  workflow_actor_required: ['ไม่พบผู้ดำเนินการ', 401],
  workflow_identity_required: ['ข้อมูลการดำเนินการไม่ครบ', 400],
  workflow_reason_invalid: ['กรุณาระบุเหตุผล 10–500 ตัวอักษร', 400],
  workflow_stale: ['เอกสารถูกเปลี่ยนจากอีกหน้าต่าง กรุณาโหลดใหม่', 409],
  quotation_not_found: ['ไม่พบใบเสนอราคา', 404],
  quotation_deal_not_found: ['ใบเสนอราคานี้ไม่มีดีลอ้างอิง', 409],
  quotation_reject_state_invalid: ['ตีกลับได้เฉพาะใบเสนอราคาที่กำลังรออนุมัติ', 409],
  quotation_reject_forbidden: ['ตีกลับได้เฉพาะผู้อนุมัติของใบเสนอราคานี้', 403],
  quotation_withdraw_state_invalid: ['ดึงกลับได้เฉพาะใบเสนอราคาที่กำลังรออนุมัติ', 409],
  quotation_withdraw_forbidden: ['ดึงกลับได้เฉพาะผู้ยื่นเอกสารเอง', 403],
  sales_order_not_found: ['ไม่พบ ใบสั่งขาย', 404],
  sales_order_withdraw_state_invalid: ['ดึงกลับได้เฉพาะ ใบสั่งขายที่กำลังรออนุมัติ', 409],
  sales_order_withdraw_forbidden: ['ดึงกลับได้เฉพาะผู้ยื่นเอกสารเอง', 403],
  sales_order_revision_forbidden: ['ย้อนการอนุมัติและออก Rev. ได้เฉพาะ AE Supervisor หรือ Admin', 403],
  sales_order_revoke_state_invalid: ['ย้อนการอนุมัติได้เฉพาะ ใบสั่งขายที่อนุมัติแล้ว', 409],
  sales_order_revision_state_invalid: ['ออก Rev. ได้เฉพาะ ใบสั่งขายที่ย้อนการอนุมัติแล้ว — กด "ย้อนการอนุมัติ" ก่อน', 409],
  sales_order_revision_exists: ['ใบสั่งขายนี้มี Rev. ถัดไปแล้ว กรุณาโหลดใหม่', 409],
  // ด่านนี้ย้ายไปอยู่ขั้น "ย้อนการอนุมัติ" แล้ว (mig 0166) — ข้อความจึงต้องไม่พูดถึงแต่
  // ขั้นออก Rev. ไม่งั้นคนกดปุ่มแรกได้คำตอบของปุ่มที่สอง. บอกทางออกด้วย เพราะทั้งยกเลิก
  // อนุมัติและยกเลิก SO ถูกใบยื่นบล็อกเหมือนกัน = ถ้าไม่บอก ผู้ใช้จะวนหาปุ่มไม่เจอ
  sales_order_revision_filing_exists: [
    'แก้ใบสั่งขายใบนี้ไม่ได้ เพราะมีใบยื่นชำระภาษีผูกอยู่ — ต้องลบใบยื่นที่หน้า "ภาษี › การยื่นชำระ" ก่อน แล้วจึงย้อนการอนุมัติ/ออก Rev. ได้',
    409,
  ],
  sales_order_revision_lines_required: ['ใบสั่งขายต้องมีอย่างน้อย 1 รายการก่อนออก Rev.', 409],
});

const UNKNOWN_MESSAGE = 'ดำเนินการกับเอกสารไม่สำเร็จ กรุณาลองใหม่ หากยังไม่ได้แจ้งผู้ดูแลระบบ';

// error ที่ไม่รู้จัก = ข้อความดิบจาก Postgres (ชื่อ constraint/ตาราง/คอลัมน์ บางทีมีค่าในแถว
// ติดมาด้วย) — ห้ามส่งออกหน้าเว็บ. log ตัวจริงฝั่ง server แล้วตอบข้อความกลาง (A3, 2026-07-26)
export function documentWorkflowError(error, { context = 'document workflow' } = {}) {
  const raw = String(error?.message || error || '').trim();
  const key = Object.keys(WORKFLOW_ERRORS).find((candidate) => raw.includes(candidate));
  if (!key) {
    console.error(`[${context}] unmapped workflow error:`, error);
    return { message: UNKNOWN_MESSAGE, status: 500 };
  }
  const [message, status] = WORKFLOW_ERRORS[key];
  return { message, status, code: key };
}
