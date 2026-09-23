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
  /* mig 0376: ออก Rev. ย้ายงวดทั้งแถว — ชุดที่ Σ ≠ ยอดใบคือข้อมูลที่ผิดอยู่แล้ว ย้ายไปก็ได้ใบ Rev. ที่แผนผิด
     (route ย้อนการอนุมัติตรวจข้อนี้ก่อนแล้ว — ตรงนี้เจอเฉพาะใบที่ย้อนไว้ก่อน deploy หรือแก้งวดกลางทาง) */
  sales_order_revision_installments_mismatch: ['งวดชำระรวมไม่เท่ายอดใบ — ออก Rev. ไม่ได้ ให้แอดมินตรวจงวดก่อน', 409],
  sales_order_yearly_sequence_exhausted: ['เลขใบสั่งขายของปีนี้เต็มแล้ว — แจ้งผู้ดูแลระบบ', 409],

  /* ── ใบสั่งขายย้อนหลัง (mig 0360) ─────────────────────────────────────────────
     รหัสจาก RPC create_historical_sales_order / append_historical_installments + ชื่อ CHECK/trigger ของไฟล์นั้น
     (0374 DROP ตัวเพิ่มงวด/ถอดจุด และเปลี่ยนตัวสร้างใบเป็นแบบร่าง — รหัสเดิมคงไว้ ตัวที่ยังโยนอยู่ตรึงด้วยเทสต์ของ 0374)
     ⚠️ **ห้ามมีคีย์ไหนเป็นสตริงย่อยของอีกคีย์** — ตัวแปลหาด้วย `includes` ตามลำดับ (เทสต์ตรึงไว้)
     ⚠️ `sales_deals_historical_container_uk` **จงใจไม่อยู่ในตารางนี้** — ข้อความ "มีดีลของ AE คนนั้นอยู่แล้ว"
        เป็นของการย้ายเจ้าของดีลเท่านั้น (historicalDealWriteMessage) · ตัวคีย์ใบแปลเป็น container_deal_race */
  /* mig 0374 (มติ 22/09): ฝ่ายขายทุกตำแหน่ง + Admin คีย์ได้ — literal ใน RPC = HISTORICAL_KEYER_ROLES */
  historical_so_actor_forbidden: ['คีย์ใบสั่งขายย้อนหลังได้เฉพาะฝ่ายขายและแอดมิน', 403],
  historical_so_intake_key_required: ['ข้อมูลการคีย์ไม่ครบ — โหลดหน้าฟอร์มใหม่แล้วบันทึกอีกครั้ง', 400],
  historical_so_intake_hash_invalid: ['ข้อมูลการคีย์ไม่ครบ — โหลดหน้าฟอร์มใหม่แล้วบันทึกอีกครั้ง', 400],
  historical_so_header_invalid: ['ข้อมูลการคีย์ไม่ครบ — โหลดหน้าฟอร์มใหม่แล้วบันทึกอีกครั้ง', 400],
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
  historical_so_lines_required: ['ต้องเลือกอย่างน้อย 1 โซน', 400],
  historical_so_line_invalid: [
    'ข้อมูลโซนในใบไม่ถูกต้อง (ต้องเลือกโซนและแพ็คเกจ · จำนวนต้องเป็นจำนวนเต็มมากกว่า 0 · ยอดไม่ติดลบ)',
    400,
  ],
  historical_so_installment_invalid: [
    'ข้อมูลงวดไม่ถูกต้อง (ชื่องวด 1–120 ตัวอักษร · ยอดไม่ติดลบ · มีวันครบกำหนดและช่วงครอบ · วันที่ปี ค.ศ. 2000–2100'
      + ' · วันเริ่มครอบไม่เกินวันสิ้นสุด · หมายเหตุไม่เกิน 1000 ตัวอักษร)',
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
  /* 🚫 รหัสของ `remove_historical_sales_order_line` (มติข้อ 23 ส่วน ข2 · 0366) ถอดออกจากตารางแล้ว
     — 0374 DROP ฟังก์ชันนั้นทิ้ง และไม่มี route ไหนเรียกอีก (มติ 22/09) ⇒ ไม่มีทางที่ฐานจะโยนรหัสชุดนั้นมา
     ⚠️ ไฟล์ 0366 ยังอยู่ในทะเบียน migration (ประวัติของฐาน) แต่ไม่มีเทสต์ไหนอ่านรหัสจากไฟล์นั้น */
  historical_so_not_found: ['ไม่พบใบสั่งขาย', 404],
  historical_so_actor_required: ['ข้อมูลผู้ใช้ไม่ครบ — ออกจากระบบแล้วเข้าใหม่', 400],
  historical_so_container_deal_race: ['มีการย้ายเจ้าของดีลของลูกค้านี้พร้อมกัน กดบันทึกอีกครั้ง', 409],
  historical_so_deal_payload_required: ['ข้อมูลการสร้างดีลของใบย้อนหลังไม่ครบ — แจ้งผู้ดูแลระบบ', 500],
  historical_so_deal_origin_dropped: ['ฐานข้อมูลยังไม่พร้อม (0360) — แจ้งผู้ดูแลระบบ', 503],

  /* ── ใบสั่งขายย้อนหลังแบบ AE Sup อนุมัติ (mig 0374 · มติ 22/09) ─────────────────────
     รหัสจาก RPC create/update/submit/approve_historical_sales_order + ตัวตรวจกลาง + trigger + CHECK ของไฟล์นั้น
     · contract_* มาจาก approve_external_sales_contract (0322) ที่ขั้นอนุมัติเรียกต่อ — ด่านของ RPC ตรวจก่อนแล้ว
       เจอได้แค่ตอนแข่งกับหน้าสัญญา/เลขเต็ม
     ⚠️ ข้อมูลที่อนุมัติแล้วผิด = AE Sup ยกเลิกใบ แล้วฝ่ายขายคีย์ใหม่ (เอกสารแทนสัญญาถูกยกเลิกตาม) — ข้อความชี้ทางนี้ */
  historical_so_zone_invalid: [
    'โซนที่เลือกใช้ไม่ได้ — ต้องเป็นโซนที่ยังใช้งานของไซต์ลูกค้ารายนี้ (ไซต์ลูกค้า · ไซต์และโซนยังไม่ปิดใช้งาน)', 400,
  ],
  historical_so_zone_duplicate: ['เลือกโซนเดียวกันซ้ำในใบเดียว — หนึ่งโซนมีได้บรรทัดเดียว', 400],
  historical_so_line_not_package: ['สินค้าของโซนต้องเป็นแพ็คเกจบริการ (หมวด 02-001)', 400],
  historical_so_contract_invalid: [
    'ข้อมูลเอกสารแทนสัญญาไม่ถูกต้อง (ชนิดเอกสาร · เลขอ้างอิงไม่เกิน 200 ตัวอักษร · วันเริ่มไม่เกินวันสิ้นสุดและไม่เกินวันนี้)',
    400,
  ],
  historical_so_contract_state_invalid: ['เอกสารแทนสัญญาของใบนี้ไม่อยู่ในสภาพที่แก้หรืออนุมัติได้ — โหลดหน้าใหม่', 409],
  historical_so_contract_file_missing: ['ยังไม่ได้แนบไฟล์เอกสารแทนสัญญา — แนบไฟล์ก่อนส่งอนุมัติ', 409],
  historical_so_signed_file_invalid: [
    'ไฟล์ที่เลือกไม่ใช่ไฟล์เอกสารแทนสัญญาของใบนี้ — โหลดหน้าใหม่แล้วเลือกไฟล์อีกครั้ง', 409,
  ],
  historical_so_opening_invalid: [
    'ข้อมูลงวดยกมาไม่ถูกต้อง (มีได้งวดเดียว · ยอดมากกว่า 0 · เริ่มครอบที่วันเริ่มสัญญา · ครอบถึงไม่เกินวันสิ้นสุดสัญญา'
      + ' · มีวันที่รับเงินไม่เกินวันนี้ · ไม่มีวันครบกำหนด · หมายเหตุไม่เกิน 1000 ตัวอักษร)',
    400,
  ],
  historical_so_opening_evidence_missing: ['งวดยกมาต้องแนบหลักฐานการรับเงินอย่างน้อย 1 ไฟล์', 409],
  historical_so_installment_sum_mismatch: ['ยอดงวดรวมต้องเท่ากับยอดใบ', 400],
  historical_so_coverage_broken: [
    'ช่วงครอบบริการของงวดต้องต่อกันพอดีตั้งแต่วันเริ่มถึงวันสิ้นสุดสัญญา — ห้ามเว้นช่วงและห้ามซ้อนกัน', 400,
  ],
  historical_so_zero_value_has_installments: ['ใบยอด 0 บาทไม่มีงวดให้เก็บ — ลบงวดออก', 400],
  historical_so_edit_state_invalid: ['แก้ใบย้อนหลังได้เฉพาะตอนเป็นร่างหรือถูกตีกลับ — โหลดหน้าใหม่', 409],
  historical_so_owner_locked: ['เปลี่ยนลูกค้าหรือ AE ของใบย้อนหลังที่บันทึกแล้วไม่ได้ — ลบใบแล้วคีย์ใหม่', 409],
  historical_so_submit_state_invalid: ['ส่งอนุมัติได้เฉพาะใบย้อนหลังที่เป็นร่างหรือถูกตีกลับ — โหลดหน้าใหม่', 409],
  historical_so_approve_forbidden: ['อนุมัติใบสั่งขายย้อนหลังได้เฉพาะ AE Supervisor หรือ Admin', 403],
  historical_so_approve_state_invalid: ['อนุมัติได้เฉพาะใบย้อนหลังที่กำลังรออนุมัติ — โหลดหน้าใหม่', 409],
  historical_so_self_approval: [
    'ผู้คีย์หรือผู้ส่งใบนี้อนุมัติใบของตัวเองไม่ได้ — ให้ AE Supervisor คนอื่นหรือ Admin อนุมัติ', 403,
  ],
  historical_so_approval_note_invalid: ['หมายเหตุหรือเหตุผลการอนุมัติต้องไม่เกิน 500 ตัวอักษร', 400],
  historical_so_reopen_forbidden: ['ใบย้อนหลังที่อนุมัติ/ยกเลิกแล้วกลับไปแก้ไม่ได้ — ยกเลิกแล้วคีย์ใหม่', 409],
  contract_already_issued: ['เอกสารแทนสัญญาของใบนี้ออกเลขที่ไปแล้ว — โหลดหน้าใหม่', 409],
  contract_not_draft: ['เอกสารแทนสัญญาของใบนี้ไม่ได้เป็นร่างแล้ว — โหลดหน้าใหม่', 409],
  contract_monthly_sequence_exhausted: ['เลขที่สัญญาเต็มแล้ว — แจ้งผู้ดูแลระบบ', 409],
  sales_order_installments_kind_check: ['ชนิดงวดไม่ถูกต้อง', 400],
  sales_order_installments_opening_shape: ['งวดยกมาต้องมีช่วงครอบบริการและไม่มีวันครบกำหนด', 400],
  sales_order_installments_opening_uk: ['ใบนี้มีงวดยกมาอยู่แล้ว — มีได้งวดเดียว', 409],
  sales_contracts_external_kind: ['ชนิดเอกสารแทนสัญญาไม่ถูกต้อง', 400],
  mig_0374_old_historical_rows_exist: ['ยังมีใบย้อนหลังแบบเดิมค้างอยู่ — ลบใบเหล่านั้นก่อนรัน migration 0374', 409],

  /* CHECK รูปทรงของ 0374 — ใบย้อนหลังเป็นร่าง/รออนุมัติ/ตีกลับ/อนุมัติ/ยกเลิกได้ แต่ย้อนอนุมัติ/ออก Rev.
     /เข้าขั้นบัญชีปิดใบ/มีหลักฐานลายเซ็น/ยกเว้นด่านเงินไม่ได้ (คืนเป็นร่างหลังอนุมัติ = trigger reopen_forbidden) */
  sales_orders_origin_shape: [
    'ใบสั่งขายย้อนหลังย้อนอนุมัติ/ออก Rev./เข้าขั้นบัญชีปิดใบ/ยกเว้นด่านเงินไม่ได้', 409,
  ],
  sales_orders_historical_refs_len: ['เลขเอกสารเดิมยาวเกิน 200 ตัวอักษร', 400],
  sales_orders_historical_intake_hash_format: ['ข้อมูลการคีย์ไม่ครบ — โหลดหน้าฟอร์มใหม่แล้วบันทึกอีกครั้ง', 400],
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
