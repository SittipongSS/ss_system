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
  sales_order_not_found: ['ไม่พบ Sale Order', 404],
  sales_order_withdraw_state_invalid: ['ดึงกลับได้เฉพาะ Sale Order ที่กำลังรออนุมัติ', 409],
  sales_order_withdraw_forbidden: ['ดึงกลับได้เฉพาะผู้ยื่นเอกสารเอง', 403],
  sales_order_revision_forbidden: ['ยกเลิกอนุมัติและออก Rev. ได้เฉพาะ AE Supervisor หรือ Admin', 403],
  sales_order_revision_state_invalid: ['ออก Rev. ได้เฉพาะ Sale Order ที่อนุมัติแล้ว', 409],
  sales_order_revision_exists: ['Sale Order นี้มี Rev. ถัดไปแล้ว กรุณาโหลดใหม่', 409],
  sales_order_revision_filing_exists: ['ออก Rev. ไม่ได้ เนื่องจากมีใบยื่นชำระภาษีผูกอยู่', 409],
  sales_order_revision_lines_required: ['Sale Order ต้องมีอย่างน้อย 1 รายการก่อนออก Rev.', 409],
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
