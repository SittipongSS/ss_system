// ── Master Data: attachment document types ────────────────────────────
// ประเภทเอกสารแนบต่อ entity (เฟส A: ลูกค้า + สินค้า). เป็นค่าคงที่ล้วน —
// import ได้ทั้ง client (UI dropdown/badge) และ server (validation).
// docType ที่ไม่อยู่ในลิสต์จะตกเป็น 'other' โดยอัตโนมัติเมื่อแสดงผล.

export const ATTACHMENT_TYPES = {
  customer: [
    { key: "address_map", label: "แผนที่ที่อยู่" },
    { key: "design_contract", label: "สัญญาจ้างออกแบบกลิ่น" },
    { key: "company_certificate", label: "หนังสือรับรองบริษัท" },
    { key: "vat_pp20", label: "ภพ.20" },
    { key: "other", label: "เอกสารอื่นๆ" },
  ],
  product: [
    { key: "manufacturing_contract", label: "สัญญาจ้างผลิต" },
    { key: "artwork", label: "Artwork สินค้า" },
    { key: "other", label: "เอกสารอื่นๆ" },
  ],
  // เฟส B — เอกสารการชำระสรรพสามิต ผูกกับออเดอร์ (รายรอบการชำระ).
  // 2 ชนิดหลักมาคนละสเตป: ใบเสร็จชำระภาษี ↔ หลักฐานการชำระสรรพสามิต.
  order: [
    { key: "tax_receipt", label: "ใบเสร็จชำระภาษี" },
    { key: "excise_proof", label: "หลักฐานการชำระสรรพสามิต" },
    { key: "tax_form", label: "แบบ ภส. / เอกสารยื่น" },
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
