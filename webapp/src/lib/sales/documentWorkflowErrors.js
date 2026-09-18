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
  sales_order_yearly_sequence_exhausted: ['เลขใบสั่งขายของปีนี้เต็มแล้ว — แจ้งผู้ดูแลระบบ', 409],

  /* ── ใบสั่งขายย้อนหลัง (mig 0360) ─────────────────────────────────────────────
     รหัสจาก RPC create_historical_sales_order / append_historical_installments + ชื่อ CHECK/trigger ของไฟล์นั้น
     ⚠️ **ห้ามมีคีย์ไหนเป็นสตริงย่อยของอีกคีย์** — ตัวแปลหาด้วย `includes` ตามลำดับ (เทสต์ตรึงไว้)
     ⚠️ `sales_deals_historical_container_uk` **จงใจไม่อยู่ในตารางนี้** — ข้อความ "มีดีลของ AE คนนั้นอยู่แล้ว"
        เป็นของการย้ายเจ้าของดีลเท่านั้น (historicalDealWriteMessage) · ตัวคีย์ใบแปลเป็น container_deal_race */
  historical_so_actor_forbidden: ['คีย์ใบสั่งขายย้อนหลังได้เฉพาะ AE Supervisor หรือ Admin', 403],
  historical_so_intake_key_required: ['ข้อมูลการคีย์ไม่ครบ — ปิดโมดัลแล้วเริ่มใหม่', 400],
  historical_so_intake_hash_invalid: ['ข้อมูลการคีย์ไม่ครบ — ปิดโมดัลแล้วเริ่มใหม่', 400],
  historical_so_header_invalid: ['ข้อมูลการคีย์ไม่ครบ — ปิดโมดัลแล้วเริ่มใหม่', 400],
  historical_so_intake_key_conflict: [
    'คำขอนี้ถูกบันทึกไปแล้วด้วยข้อมูลอีกชุด (หรือใบถูกยกเลิกแล้ว) — เปิดใบที่สร้างไว้แทนการส่งซ้ำ',
    409,
  ],
  historical_so_customer_required: ['ต้องเลือกลูกค้า', 400],
  historical_so_owner_required: ['ต้องเลือก AE ผู้รับผิดชอบ — ใบย้อนหลังต้องมี AE ที่ยังถือดีลได้เสมอ', 400],
  historical_so_team_required: ['AE ที่เลือกยังไม่มีทีม — ตั้งทีมก่อนจึงสร้างดีลของใบย้อนหลังได้', 400],
  historical_so_order_date_invalid: ['วันที่ใบต้องอยู่ระหว่าง 01/01/2000 ถึงวันนี้', 400],
  historical_so_money_invalid: ['ยอดเงินของใบต้องเป็นตัวเลขไม่ติดลบ', 400],
  historical_so_money_mismatch: ['ยอดเงินของใบไม่สมดุล — โหลดพรีวิวใหม่แล้วบันทึกอีกครั้ง', 400],
  historical_so_lines_required: ['ต้องมีอย่างน้อย 1 จุดติดตั้ง', 400],
  historical_so_line_invalid: ['ข้อมูลจุดติดตั้งไม่ถูกต้อง (ชื่อจุด 1–200 ตัวอักษร · จำนวนมากกว่า 0 · ไม่ระบุโซน)', 400],
  historical_so_installment_invalid: [
    'ข้อมูลงวดไม่ถูกต้อง (ชื่องวด 1–120 ตัวอักษร · ยอดไม่ติดลบ · วันที่ปี ค.ศ. 2000–2100 · วันเริ่มครอบไม่เกินวันสิ้นสุด)',
    400,
  ],
  historical_so_installment_status_invalid: ['งวดที่คีย์ต้องเป็น "รอบัญชียืนยัน" เท่านั้น', 400],
  historical_so_installment_over_total: ['ยอดงวดรวมเกินยอดใบ', 400],
  historical_so_zero_value_needs_exemption: ['ใบยอด 0 บาทต้องยกเว้นด่านเงิน', 400],
  historical_so_zero_value_note_required: ['ใบยอด 0 บาทต้องมีหมายเหตุบอกเหตุผล', 400],
  historical_so_exempt_reason_invalid: ['กรุณาระบุเหตุผลที่ยกเว้นด่านเงิน 10–500 ตัวอักษร', 400],
  historical_so_customer_not_found: ['ไม่พบลูกค้า', 404],
  historical_so_customer_inactive: ['ลูกค้ารายนี้ยังไม่อนุมัติหรือถูกพักใช้ — ออกใบไม่ได้', 409],
  historical_so_deal_invalid: ['ดีลของใบย้อนหลังของลูกค้าและ AE นี้ไม่อยู่ในสภาพที่ผูกใบได้ — แจ้งผู้ดูแลระบบ', 409],
  historical_so_installment_append_state_invalid: ['คีย์งวดเพิ่มได้เฉพาะใบสั่งขายย้อนหลังที่ยังไม่ยกเลิก', 409],
  /* ถอดจุดออกจากใบย้อนหลัง (มติข้อ 23 ส่วน ข2 · RPC remove_historical_sales_order_line · 0366)
     ⚠️ ไม่มีคีย์ไหนเป็นสตริงย่อยของคีย์อื่นในตารางนี้ — ตัวแปลหาด้วย `includes` ตามลำดับ */
  historical_so_line_remove_reason_invalid: ['กรุณาระบุเหตุผลที่ถอดจุดนี้ออกจากใบ 10–500 ตัวอักษร', 400],
  historical_so_line_remove_pipeline: ['ถอดจุดออกจากใบได้เฉพาะใบสั่งขายย้อนหลัง', 409],
  historical_so_line_remove_status: ['ใบสั่งขายที่ยกเลิกแล้วถอดจุดไม่ได้', 409],
  historical_so_line_remove_has_discount: [
    'ใบนี้มีส่วนลดหัวใบ — ถอดจุดแล้วระบบไม่รู้ว่าส่วนลดเฉลี่ยลงบรรทัดยังไง ต้องแก้ใบด้วยมือ', 409,
  ],
  historical_so_line_remove_not_flagged: ['จุดนี้ยังไม่ถูกแจ้งว่าไม่พบหน้างาน — ถอดออกจากใบไม่ได้', 409],
  historical_so_line_remove_decided: ['จุดนี้ถูกตัดสินไปแล้ว — โหลดหน้าใหม่เพื่อดูสถานะล่าสุด', 409],
  historical_so_line_remove_allocated: [
    'จุดนี้ถูกผูกโซนแล้ว — ถอดออกจะลบรอบขายของโซนทิ้งไปด้วย ให้ TS ถอนโซนก่อน', 409,
  ],
  historical_so_line_remove_last_line: [
    'ใบนี้เหลือจุดเดียว — ถอดออกแล้วใบจะไม่มีรายการเลย ให้ยกเลิกทั้งใบแทน', 409,
  ],
  historical_so_line_remove_installments_over: ['งวดที่คีย์ไว้เกินยอดใบใหม่ — แก้งวดก่อนถอดจุดนี้', 409],
  historical_so_line_remove_zero_needs_exemption: [
    'ถอดแล้วใบเหลือยอด 0 แต่ใบนี้ยังไม่ได้ยกเว้นด่านเงิน — ยกเว้นก่อนแล้วค่อยถอด', 409,
  ],
  historical_so_line_not_found: ['ไม่พบจุดติดตั้งในใบสั่งขายใบนี้', 404],
  historical_so_not_found: ['ไม่พบใบสั่งขาย', 404],
  historical_so_actor_required: ['ข้อมูลผู้ใช้ไม่ครบ — ออกจากระบบแล้วเข้าใหม่', 400],
  historical_so_container_deal_race: ['มีการย้ายเจ้าของดีลของลูกค้านี้พร้อมกัน กดบันทึกอีกครั้ง', 409],
  historical_so_deal_payload_required: ['ข้อมูลการสร้างดีลของใบย้อนหลังไม่ครบ — แจ้งผู้ดูแลระบบ', 500],
  historical_so_deal_origin_dropped: ['ฐานข้อมูลยังไม่พร้อม (0360) — แจ้งผู้ดูแลระบบ', 503],
  sales_orders_origin_shape: ['ใบสั่งขายย้อนหลังย้อนอนุมัติ/ออก Rev./คืนเป็นร่างไม่ได้', 409],
  sales_orders_historical_refs_len: ['เลขเอกสารเดิมยาวเกิน 200 ตัวอักษร', 400],
  sales_orders_historical_intake_hash_format: ['ข้อมูลการคีย์ไม่ครบ — ปิดโมดัลแล้วเริ่มใหม่', 400],
  sales_orders_payment_gate_exempt_sane: ['การยกเว้นด่านเงินต้องมีผู้ยกเว้น เวลา และเหตุผล 10–500 ตัวอักษร', 400],
  sales_order_lines_installation_point_len: ['ชื่อสาขา/จุดติดตั้งต้องมี 1–200 ตัวอักษร', 400],
  sales_deals_historical_shape: ['ดีลของใบย้อนหลังเปลี่ยนสถานะ/สาย/ประเภท/ลูกค้า/ทีม/โครงการไม่ได้', 409],
  sales_order_installments_covers_range: ['วันที่ของงวดไม่ถูกต้อง (ปี ค.ศ. 2000–2100 · วันเริ่มครอบต้องไม่เกินวันสิ้นสุด)', 400],
  sales_order_installments_dates_sane: ['วันที่ของงวดไม่ถูกต้อง (ปี ค.ศ. 2000–2100 · วันเริ่มครอบต้องไม่เกินวันสิ้นสุด)', 400],
  origin_immutable: ['เปลี่ยนที่มาของเอกสารไม่ได้', 409],
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

/* ข้อความไทยของรหัสที่รู้จัก — ใช้ตอนผู้เรียกรู้รหัสเองแล้ว (ไม่ต้องผ่านข้อความดิบจากฐาน) */
export function workflowErrorMessage(code) {
  return WORKFLOW_ERRORS[code]?.[0] || UNKNOWN_MESSAGE;
}

/* รหัสที่ `workflowErrorMessage`/`documentWorkflowError` รู้จัก — เทสต์ใช้ตรวจว่าไม่มีคีย์ซ้อนกัน */
export const WORKFLOW_ERROR_CODES = Object.freeze(Object.keys(WORKFLOW_ERRORS));

/* ── เขียนดีลภาชนะของใบสั่งขายย้อนหลังไม่ผ่านฐาน (PATCH ดีล · mig 0360) ─────────────────
   คืน `[message, status]` หรือ null (ผู้เรียกคงพฤติกรรมเดิม)
   ⭐ `sales_deals_historical_container_uk` = ย้ายเจ้าของไปหา AE ที่มีดีลภาชนะของลูกค้ารายเดียวกันอยู่แล้ว
     (ด่านก่อนเขียนในเราต์จับได้ก่อนเกือบทุกครั้ง · ตัวนี้คือกรณีแข่งกันพอดี) — ข้อความนี้ **ห้าม** ใช้ตอนคีย์ใบ */
const HISTORICAL_DEAL_WRITE_ERRORS = Object.freeze({
  sales_deals_historical_container_uk: [
    'ลูกค้านี้มีดีลของใบสั่งขายย้อนหลังของ AE คนนั้นอยู่แล้ว — ย้ายเจ้าของมารวมกันไม่ได้ (ระบบยังไม่รวมดีล)',
    409,
  ],
  sales_deals_historical_shape: WORKFLOW_ERRORS.sales_deals_historical_shape,
  origin_immutable: WORKFLOW_ERRORS.origin_immutable,
});

export function historicalDealWriteMessage(error) {
  const raw = `${error?.message || error || ''} ${error?.details || ''}`;
  const key = Object.keys(HISTORICAL_DEAL_WRITE_ERRORS).find((candidate) => raw.includes(candidate));
  return key ? [...HISTORICAL_DEAL_WRITE_ERRORS[key]] : null;
}
