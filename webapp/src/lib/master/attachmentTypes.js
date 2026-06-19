// ── Master Data: attachment document types ────────────────────────────
// ประเภทเอกสารแนบต่อ entity (เฟส A: ลูกค้า + สินค้า). เป็นค่าคงที่ล้วน —
// import ได้ทั้ง client (UI dropdown/badge) และ server (validation).
// docType ที่ไม่อยู่ในลิสต์จะตกเป็น 'other' โดยอัตโนมัติเมื่อแสดงผล.

// `required: true` = เอกสารจำเป็น (โชว์เป็นการ์ดที่ต้องมี + ติ๊กถูกเมื่ออัปแล้ว).
// `other` เป็นการ์ดเอกสารเพิ่มเติม (ไม่บังคับ, แนบได้หลายไฟล์).

// เอกสารลูกค้าแยกตามประเภท (customers.customerType, migration 0034). คงคีย์เดิม
// (company_certificate/vat_pp20/address_map) ไว้เพื่อไม่ให้ไฟล์ที่แนบไว้แล้วหลุด.
export const CUSTOMER_DOC_TYPES = {
  company: [
    { key: "company_certificate", label: "หนังสือรับรองบริษัท (อายุไม่เกิน 6 เดือน)", required: true },
    { key: "vat_pp20", label: "ภ.พ.20 (ทะเบียนภาษีมูลค่าเพิ่ม)", required: true },
    { key: "director_id_card", label: "สำเนาบัตรประชาชนกรรมการผู้มีอำนาจลงนาม", required: true },
    { key: "director_house_reg", label: "สำเนาทะเบียนบ้านกรรมการ (ถ้ามีการขอ)", required: false },
    { key: "power_of_attorney", label: "หนังสือมอบอำนาจ (กรณีผู้ดำเนินการไม่ใช่กรรมการ)", required: false },
    { key: "address_map", label: "แผนที่บริษัท", required: true },
    // กลิ่นที่ออกแบบเป็นกรรมสิทธิ์ร่วมกับลูกค้า → เซ็นสัญญาทุกครั้งที่ออกแบบกลิ่น
    // (มีได้หลายฉบับต่อลูกค้า — การ์ดเดียวแนบได้หลายไฟล์).
    { key: "design_contract", label: "สัญญาออกแบบกลิ่น", required: true },
    { key: "other", label: "เอกสารอื่นๆ", required: false },
  ],
  individual: [
    { key: "id_card", label: "สำเนาบัตรประชาชน", required: true },
    { key: "house_reg", label: "สำเนาทะเบียนบ้าน (ถ้ามีการขอ)", required: false },
    { key: "name_change", label: "เอกสารเปลี่ยนชื่อ-นามสกุล (ถ้ามี)", required: false },
    { key: "design_contract", label: "สัญญาออกแบบกลิ่น", required: true },
    { key: "other", label: "เอกสารอื่นๆ", required: false },
  ],
};

// ชุดเอกสาร (การ์ด) สำหรับลูกค้าตามประเภท — default = นิติบุคคล.
export function customerDocTypes(customerType) {
  return CUSTOMER_DOC_TYPES[customerType] || CUSTOMER_DOC_TYPES.company;
}

export const ATTACHMENT_TYPES = {
  // customer = union ของทุกคีย์ (ทั้ง 2 ประเภท + legacy) — ใช้ validate ฝั่ง API
  // (docType ที่ไม่อยู่ในนี้จะถูกตีเป็น 'other') และ lookup ป้ายชื่อ. การ์ดที่ UI
  // แสดงเลือกตามประเภทผ่าน customerDocTypes().
  customer: [
    { key: "company_certificate", label: "หนังสือรับรองบริษัท (อายุไม่เกิน 6 เดือน)", required: true },
    { key: "vat_pp20", label: "ภ.พ.20 (ทะเบียนภาษีมูลค่าเพิ่ม)", required: true },
    { key: "director_id_card", label: "สำเนาบัตรประชาชนกรรมการผู้มีอำนาจลงนาม", required: true },
    { key: "director_house_reg", label: "สำเนาทะเบียนบ้านกรรมการ (ถ้ามีการขอ)", required: false },
    { key: "power_of_attorney", label: "หนังสือมอบอำนาจ (กรณีผู้ดำเนินการไม่ใช่กรรมการ)", required: false },
    { key: "address_map", label: "แผนที่บริษัท", required: true },
    { key: "id_card", label: "สำเนาบัตรประชาชน", required: true },
    { key: "house_reg", label: "สำเนาทะเบียนบ้าน (ถ้ามีการขอ)", required: false },
    { key: "name_change", label: "เอกสารเปลี่ยนชื่อ-นามสกุล (ถ้ามี)", required: false },
    { key: "design_contract", label: "สัญญาออกแบบกลิ่น", required: true },
    { key: "other", label: "เอกสารอื่นๆ", required: false },
  ],
  product: [
    { key: "manufacturing_contract", label: "สัญญาจ้างผลิต", required: true },
    { key: "artwork", label: "Artwork สินค้า", required: true },
    { key: "other", label: "เอกสารอื่นๆ", required: false },
  ],
  // เฟส B — เอกสารการชำระสรรพสามิต ผูกกับออเดอร์ (รายรอบการชำระ).
  // 2 ชนิดหลักมาคนละสเตป: ใบเสร็จชำระภาษี ↔ หลักฐานการชำระสรรพสามิต.
  order: [
    { key: "tax_receipt", label: "ใบเสร็จชำระภาษี" },
    { key: "excise_proof", label: "หลักฐานการชำระสรรพสามิต" },
    { key: "tax_form", label: "แบบ ภส. / เอกสารยื่น" },
    { key: "other", label: "เอกสารอื่นๆ" },
  ],
  // เอกสารการขึ้นทะเบียนสรรพสามิต ผูกกับ excise_registration.
  registration: [
    { key: "approval_letter", label: "ใบอนุมัติขึ้นทะเบียน" },
    { key: "label_artwork", label: "ฉลาก / Artwork ที่ยื่น" },
    { key: "other", label: "เอกสารอื่นๆ" },
  ],
};

// ฟิลด์รายละเอียด (แท็ค) เพิ่มเติมต่อเอกสาร เก็บใน attachments.metadata (jsonb).
// มีเฉพาะ entity ที่ต้องการ metadata — order ต้องระบุเลขใบเสร็จ/วันที่/ยอด/
// อ้างอิงออเดอร์ (กรณี 1 ใบครอบหลายออเดอร์) ฯลฯ. entity อื่น = แนบไฟล์อย่างเดียว.
export const ATTACHMENT_META_FIELDS = {
  order: [
    { key: "referenceNo", label: "เลขใบเสร็จ / เลขอ้างอิง", type: "text" },
    { key: "paidDate", label: "วันที่ชำระ", type: "date" },
    { key: "amount", label: "ยอดเงิน (บาท)", type: "number" },
    { key: "relatedOrders", label: "ออเดอร์ที่เกี่ยวข้อง (กรณีใบเดียวครอบหลายออเดอร์)", type: "text" },
    { key: "note", label: "หมายเหตุ / บันทึก", type: "text" },
  ],
};

// entityType ที่ระบบรองรับในตอนนี้ (ใช้ validate ฝั่ง API).
export const ATTACHMENT_ENTITY_TYPES = Object.keys(ATTACHMENT_TYPES);

// ป้ายชื่อภาษาไทยของ docType หนึ่งๆ (fallback: คืนค่า key เดิมถ้าไม่รู้จัก).
export function attachmentTypeLabel(entityType, docType) {
  const list = ATTACHMENT_TYPES[entityType] || [];
  return list.find((t) => t.key === docType)?.label || docType || "เอกสารอื่นๆ";
}
