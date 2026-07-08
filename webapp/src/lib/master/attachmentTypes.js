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
    // สัญญาจ้างผลิตผูกกับลูกค้า (ไม่ใช่สินค้า): ลูกค้า 1 ราย มีสัญญา 1 ฉบับที่ครอบ
    // หลายสินค้าได้ และแต่ละรอบอาจมีรายการสินค้าต่างกัน → การ์ดเดียวแนบได้หลายไฟล์.
    { key: "manufacturing_contract", label: "สัญญาจ้างผลิต", required: false },
    { key: "other", label: "เอกสารอื่นๆ", required: false },
  ],
  individual: [
    { key: "id_card", label: "สำเนาบัตรประชาชน", required: true },
    { key: "house_reg", label: "สำเนาทะเบียนบ้าน (ถ้ามีการขอ)", required: false },
    { key: "name_change", label: "เอกสารเปลี่ยนชื่อ-นามสกุล (ถ้ามี)", required: false },
    { key: "design_contract", label: "สัญญาออกแบบกลิ่น", required: true },
    { key: "manufacturing_contract", label: "สัญญาจ้างผลิต", required: false },
    { key: "other", label: "เอกสารอื่นๆ", required: false },
  ],
};

// ชุดเอกสาร (การ์ด) สำหรับลูกค้าตามประเภท — default = นิติบุคคล.
export function customerDocTypes(customerType) {
  return CUSTOMER_DOC_TYPES[customerType] || CUSTOMER_DOC_TYPES.company;
}

// union ของทุกประเภทเอกสารลูกค้า (company ∪ individual) — derive อัตโนมัติจาก
// CUSTOMER_DOC_TYPES เพื่อไม่ต้อง sync มือ (เพิ่มคีย์ที่เดียวพอ). dedupe ด้วย key
// (design_contract/other มีทั้งสองประเภท) คงลำดับที่เจอครั้งแรก.
const customerDocTypesUnion = (() => {
  const seen = new Map();
  for (const list of Object.values(CUSTOMER_DOC_TYPES)) {
    for (const t of list) if (!seen.has(t.key)) seen.set(t.key, t);
  }
  return [...seen.values()];
})();

export const ATTACHMENT_TYPES = {
  // customer = union ของทุกคีย์ (ทั้ง 2 ประเภท) — ใช้ validate ฝั่ง API
  // (docType ที่ไม่อยู่ในนี้จะถูกตีเป็น 'other') และ lookup ป้ายชื่อ. การ์ดที่ UI
  // แสดงเลือกตามประเภทผ่าน customerDocTypes(). มาจาก CUSTOMER_DOC_TYPES ชุดเดียว.
  customer: customerDocTypesUnion,
  // สัญญาจ้างผลิต ย้ายไปผูกกับลูกค้า (ดู customer ด้านบน) — สินค้าเหลือ Artwork.
  product: [
    { key: "artwork", label: "Artwork สินค้า", required: true },
    { key: "other", label: "เอกสารอื่นๆ", required: false },
  ],
  // เฟส B — เอกสารการชำระ ผูกกับออเดอร์ (รายรอบการชำระ) มาคนละสเตป/คนละฝ่าย:
  //   excise_proof = หลักฐานการชำระจากลูกค้า — SA แนบตอน "รับเงินแล้ว"
  //   tax_receipt  = ใบเสร็จกรมสรรพสามิต     — LG แนบหลังยื่นชำระจริง
  order: [
    { key: "excise_proof", label: "หลักฐานการชำระจากลูกค้า" },
    { key: "tax_receipt", label: "ใบเสร็จกรมสรรพสามิต" },
    { key: "tax_form", label: "แบบ ภส. / เอกสารยื่น" },
    { key: "other", label: "เอกสารอื่นๆ" },
  ],
  // เอกสารการขึ้นทะเบียนสรรพสามิต ผูกกับ excise_registration. การ์ด required
  // (ฉลาก/Artwork) ต้องแนบครบก่อน SA ถึงจะ "ยื่นขึ้นทะเบียน" (draft →
  // pending_legal) ได้ — ตรวจทั้งฝั่ง UI และ API. ใบอนุมัติได้มาหลังอนุมัติ
  // (ฝั่ง LG แนบ) จึงไม่ required. แผนที่บริษัท (address_map) เป็นเอกสารระดับ
  // ลูกค้า แนบตอนเพิ่มลูกค้าแล้ว — โชว์อ่านอย่างเดียวในหน้าทะเบียน ไม่แนบซ้ำ.
  registration: [
    { key: "label_artwork", label: "ฉลาก / Artwork ที่ยื่น", required: true },
    { key: "approval_letter", label: "ใบอนุมัติขึ้นทะเบียน", required: false },
    { key: "other", label: "เอกสารอื่นๆ", required: false },
  ],
  // โมดูล "งานบริหาร" (mgmt) — แนบไฟล์อิสระ (ไม่มีเอกสารบังคับ), การ์ดเดียวแนบได้หลายไฟล์.
  mgmt_task: [
    { key: "other", label: "ไฟล์แนบ", required: false },
  ],
  mgmt_meeting: [
    { key: "other", label: "ไฟล์แนบ", required: false },
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

// ── ขนาดไฟล์สูงสุดต่อการอัปโหลด (คุมการใช้ storage/ค่าใช้จ่าย) ──────────
// ค่ากลางชุดเดียว ใช้ทั้ง client (เช็คก่อนอัป) และ server (บังคับจริง).
// ฝั่ง server override ได้ด้วย env SUPABASE_MAX_UPLOAD_MB.
export const MAX_UPLOAD_MB = 10;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// ── ชนิดไฟล์ที่อนุญาต (เอกสารแนบ = PDF เท่านั้น) ─────────────────────
// ค่ากลางชุดเดียว: server ใช้บังคับจริง, client ใช้เป็น accept ของ <input>.
export const ACCEPTED_UPLOAD_MIME = ["application/pdf"];
export const ACCEPTED_UPLOAD_EXT = ["pdf"];
export const UPLOAD_ACCEPT_ATTR = "application/pdf,.pdf";

// docType ที่ "จำเป็น" ของ entity หนึ่งๆ (รับ override การ์ดได้ เช่น เอกสาร
// ลูกค้าตามประเภท). ใช้บังคับแนบเอกสารก่อนยื่น — ทั้งฝั่ง UI และ API.
export function requiredDocKeys(entityType, docTypes) {
  const list = (docTypes && docTypes.length ? docTypes : ATTACHMENT_TYPES[entityType]) || [];
  return list.filter((t) => t.required).map((t) => t.key);
}

// ป้ายชื่อภาษาไทยของ docType หนึ่งๆ (fallback: คืนค่า key เดิมถ้าไม่รู้จัก).
export function attachmentTypeLabel(entityType, docType) {
  const list = ATTACHMENT_TYPES[entityType] || [];
  return list.find((t) => t.key === docType)?.label || docType || "เอกสารอื่นๆ";
}
