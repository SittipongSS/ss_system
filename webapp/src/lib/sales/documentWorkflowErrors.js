const WORKFLOW_ERRORS = Object.freeze({
  workflow_actor_required: ['ไม่พบผู้ดำเนินการ', 401],
  workflow_identity_required: ['ข้อมูลการดำเนินการไม่ครบ', 400],
  workflow_reason_invalid: ['กรุณาระบุเหตุผล 10–500 ตัวอักษร', 400],
  workflow_stale: ['เอกสารถูกเปลี่ยนจากอีกหน้าต่าง กรุณาโหลดใหม่', 409],
  quotation_not_found: ['ไม่พบใบเสนอราคา', 404],
  quotation_deal_not_found: ['ใบเสนอราคานี้ไม่มีดีลอ้างอิง', 409],
  quotation_withdraw_state_invalid: ['ถอนการยื่นได้เฉพาะใบเสนอราคาที่กำลังรออนุมัติ', 409],
  quotation_withdraw_forbidden: ['ถอนการยื่นได้เฉพาะผู้ยื่นหรือผู้อนุมัติ', 403],
  sales_order_not_found: ['ไม่พบ Sale Order', 404],
  sales_order_withdraw_state_invalid: ['ถอนการยื่นได้เฉพาะ Sale Order ที่กำลังรออนุมัติ', 409],
  sales_order_withdraw_forbidden: ['ถอนการยื่นได้เฉพาะผู้ยื่นหรือผู้อนุมัติ', 403],
  sales_order_revision_forbidden: ['ถอดอนุมัติและออก Revision ได้เฉพาะ AE Supervisor หรือ Admin', 403],
  sales_order_revision_state_invalid: ['ออก Revision ได้เฉพาะ Sale Order ที่อนุมัติแล้ว', 409],
  sales_order_revision_exists: ['Sale Order นี้มี Revision ถัดไปแล้ว กรุณาโหลดใหม่', 409],
  sales_order_revision_filing_exists: ['ออก Revision ไม่ได้ เนื่องจากมีใบยื่นชำระภาษีผูกอยู่', 409],
  sales_order_revision_lines_required: ['Sale Order ต้องมีอย่างน้อย 1 รายการก่อนออก Revision', 409],
});

export function documentWorkflowError(error) {
  const raw = String(error?.message || error || '').trim();
  const key = Object.keys(WORKFLOW_ERRORS).find((candidate) => raw.includes(candidate));
  if (!key) return { message: raw || 'ดำเนินการเอกสารไม่สำเร็จ', status: 500 };
  const [message, status] = WORKFLOW_ERRORS[key];
  return { message, status, code: key };
}
