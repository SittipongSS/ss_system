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
    // ป้ายกลาง "แผนที่ที่อยู่" ใช้คำเดียวกันทั้งสองประเภท — คีย์เดียวกัน (address_map)
    // จึงมีป้ายได้ป้ายเดียวใน union ที่ระบบใช้ lookup ชื่อ (เดิมเขียน "แผนที่บริษัท"
    // ซึ่งอ่านผิดทันทีเมื่อเจ้าของเป็นบุคคลธรรมดา)
    { key: "address_map", label: "แผนที่ที่อยู่", required: true },
    // หน้าสมุดบัญชีธนาคาร — ไม่บังคับโดยเจตนา: ลูกค้าเป็นฝ่าย **จ่ายเงินให้เรา**
    // เล่มบัญชีจึงจำเป็นเฉพาะตอนคืนมัดจำ/คืนเงิน ไม่ใช่ทุกราย · จะบังคับเมื่อไหร่
    // แก้ required: true ที่บรรทัดนี้ที่เดียว (ด่านอนุมัติอ่านจากทะเบียนนี้)
    { key: "bank_book", label: "สำเนาหน้าสมุดบัญชีธนาคาร (Bookbank)", required: false },
    // สัญญาจ้างผลิตผูกกับลูกค้า (ไม่ใช่สินค้า): ลูกค้า 1 ราย มีสัญญา 1 ฉบับที่ครอบ
    // หลายสินค้าได้ และแต่ละรอบอาจมีรายการสินค้าต่างกัน → การ์ดเดียวแนบได้หลายไฟล์.
    { key: "manufacturing_contract", label: "สัญญาจ้างผลิต", required: false },
    { key: "other", label: "เอกสารอื่นๆ", required: false },
  ],
  individual: [
    { key: "id_card", label: "สำเนาบัตรประชาชน", required: true },
    { key: "house_reg", label: "สำเนาทะเบียนบ้าน (ถ้ามีการขอ)", required: false },
    { key: "name_change", label: "เอกสารเปลี่ยนชื่อ-นามสกุล (ถ้ามี)", required: false },
    // แผนที่ที่อยู่บังคับกับบุคคลธรรมดาด้วย (มติผู้ใช้ 2026-08-05) — ฝั่งสรรพสามิต
    // ดึงแผนที่จาก "ลูกค้าเจ้าของทะเบียน" (lib/tax/requirements.js) ไม่ได้แนบเองที่
    // ทะเบียน ⇒ ลูกค้าบุคคลที่ไม่มีแผนที่ = ทะเบียนสรรพสามิตหาไฟล์ไม่เจอตั้งแต่ต้นทาง
    { key: "address_map", label: "แผนที่ที่อยู่", required: true },
    { key: "bank_book", label: "สำเนาหน้าสมุดบัญชีธนาคาร (Bookbank)", required: false },
    { key: "manufacturing_contract", label: "สัญญาจ้างผลิต", required: false },
    { key: "other", label: "เอกสารอื่นๆ", required: false },
  ],
};

// ── อายุเอกสาร ────────────────────────────────────────────────────────
// เอกสารบางฉบับ "หมดอายุ" ได้ — หนังสือรับรองบริษัทที่คู่ค้าเรียกต้องออกไม่เกิน
// 6 เดือน ซึ่งเขียนอยู่ในป้ายการ์ดมาตลอดแต่ **ไม่มีฟิลด์วันที่ให้กรอก** ⇒ ไฟล์ที่
// แนบไว้ตั้งแต่ปีก่อนก็ยังนับว่า "มีแล้ว" ติ๊กเขียวสวยงาม ทั้งที่ใช้ยื่นไม่ได้แล้ว
//
// วันที่ออกเอกสารเก็บที่ attachments.metadata.issuedDate (jsonb — ไม่ต้อง migrate)
export const DOC_VALIDITY_MONTHS = {
  company_certificate: 6,
};

export const hasValidityPeriod = (entityType, docType) => entityType === 'customer'
  && DOC_VALIDITY_MONTHS[docType] !== undefined;

export const ISSUED_DATE_FIELD = 'issuedDate';

// 'YYYY-MM-DD' + n เดือน → 'YYYY-MM-DD' · คำนวณบนปฏิทินตรง ๆ ไม่พึ่ง Date เพื่อให้
// ผลไม่ขยับตาม timezone ของเครื่องที่รัน (server อยู่ UTC, คนใช้อยู่ +07)
function addMonths(iso, months) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1 + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  // สิ้นเดือนของเดือนปลายทาง — 31 ส.ค. + 6 เดือน ต้องได้ 28/29 ก.พ. ไม่ใช่ 2/3 มี.ค.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(Number(m[3]), lastDay);
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// สถานะอายุของไฟล์หนึ่งใบ · คืน null เมื่อชนิดนั้นไม่มีอายุกำกับ
//   { months, issuedDate, expiresAt, expired, unknown }
//   unknown = true ⇒ ยังไม่ได้กรอกวันที่ออก (บอกไม่ได้ว่าหมดอายุหรือยัง)
// today = 'YYYY-MM-DD' — ผู้เรียกส่งเข้ามาเสมอ เพื่อให้เทสต์ไม่ผูกกับวันที่รันจริง
export function documentValidity(entityType, item, today) {
  const months = hasValidityPeriod(entityType, item?.docType) ? DOC_VALIDITY_MONTHS[item.docType] : null;
  if (months == null) return null;
  const issuedDate = String(item?.metadata?.[ISSUED_DATE_FIELD] || '');
  const expiresAt = addMonths(issuedDate, months);
  return {
    months,
    issuedDate,
    expiresAt,
    unknown: !expiresAt,
    expired: !!expiresAt && !!today && expiresAt < today,
  };
}


// ชุดเอกสาร (การ์ด) สำหรับลูกค้าตามประเภท — default = นิติบุคคล.
export function customerDocTypes(customerType) {
  return CUSTOMER_DOC_TYPES[customerType] || CUSTOMER_DOC_TYPES.company;
}

// union ของทุกประเภทเอกสารลูกค้า (company ∪ individual) — derive อัตโนมัติจาก
// CUSTOMER_DOC_TYPES เพื่อไม่ต้อง sync มือ (เพิ่มคีย์ที่เดียวพอ). dedupe ด้วย key
// (address_map/other มีทั้งสองประเภท) คงลำดับที่เจอครั้งแรก.
const customerDocTypesUnion = (() => {
  const seen = new Map();
  for (const list of Object.values(CUSTOMER_DOC_TYPES)) {
    for (const t of list) if (!seen.has(t.key)) seen.set(t.key, t);
  }
  return [...seen.values()];
})();

export const ATTACHMENT_TYPES = {
  // ⭐ เอกสารของดีล (P5c) — PO · หลักฐานมัดจำ · บรีฟลูกค้า · อื่น ๆ
  // ชุดนี้ตรงกับ `sales_deal_documents.kind` ที่ 0069 ใช้อยู่แล้ว ⇒ รายการ checklist
  // กับไฟล์ที่แนบเข้ามาพูดภาษาเดียวกัน ไม่ใช่สองชุดที่ต้องแมปกันเอง
  deal: [
    { key: 'customer_brief', label: 'บรีฟจากลูกค้า' },
    { key: 'quotation', label: 'ใบเสนอราคา (ไฟล์)' },
    { key: 'deposit_proof', label: 'หลักฐานมัดจำ' },
    { key: 'po', label: 'PO ลูกค้า' },
    { key: 'tax_docs', label: 'เอกสารภาษี' },
    { key: 'other', label: 'เอกสารอื่นๆ' },
  ],
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
  personal_task: [
    { key: "other", label: "ไฟล์แนบงาน", required: false },
  ],
  // ระบบขอราคาผลิต — แนบที่ระดับ "สินค้าในใบ" ไม่ใช่ทั้งใบ เพราะรูปตัวอย่าง/
  // สเปกบรรจุภัณฑ์เป็นของสินค้าตัวนั้น และ RD/PC ดูประกอบตอนตอบราคา
  costing_item: [
    { key: "reference_image", label: "รูปตัวอย่าง / ตัวอย่างงาน", required: false },
    { key: "spec", label: "สเปก / แบบบรรจุภัณฑ์", required: false },
    { key: "other", label: "ไฟล์แนบอื่นๆ", required: false },
  ],
  // เคสขอราคาวัสดุ (mig 0158) — แนบที่ระดับ "รายการในเคส" ไม่ใช่ทั้งเคส ด้วยเหตุผล
  // เดียวกับ costing_item: รูปขวด/แบบสกรีนเป็นของวัสดุตัวนั้น และ RD/PC เปิดดู
  // ประกอบตอนตอบราคารายบรรทัด
  dept_request_item: [
    { key: "reference_image", label: "รูปตัวอย่าง", required: false },
    { key: "spec", label: "สเปก / แบบงาน", required: false },
    { key: "other", label: "ไฟล์แนบอื่นๆ", required: false },
  ],
  // ระดับ "หัวคำร้อง" (มติผู้ใช้ 2026-08-03 — แนบไฟล์ตอนเปิดคำร้องได้เลย)
  //
  // 🐞 เดิมมีแต่ระดับรายการ ซึ่งมีเฉพาะ 3 ชนิดขอราคา → **5 ใน 8 ชนิด (สอบถาม ·
  // บรีฟกลิ่น · ขอ Mock-up · ขอเอกสาร · ติดตามของเข้า) แนบไฟล์ไม่ได้เลย** ทั้งที่
  // บรีฟกลิ่นกับ Mock-up คือชนิดที่ต้องมีรูปอ้างอิงมากที่สุด (ที่ผ่านมาต้องแอบส่ง
  // ทาง LINE แล้วเหตุผลของงานหายไปกับแชต)
  dept_request: [
    { key: "reference_image", label: "รูปอ้างอิง / ตัวอย่าง", required: false },
    { key: "spec", label: "สเปก / แบบงาน / บรีฟ", required: false },
    { key: "other", label: "ไฟล์แนบอื่นๆ", required: false },
  ],
  // ⚠️ **ไม่มี `system_issue` ที่นี่โดยเจตนา** (mig 0219) — ภาพหน้าจอของเรื่อง
  // แจ้งปัญหาแนบผ่าน **เธรดอัปเดต** (`/api/updates` + `attachments` ของแถวอัปเดต)
  // ไม่ใช่ตาราง `attachments` · เหตุผล: ด่านหยาบของ `/api/attachments` ใน proxy
  // ไล่ตาม cap ของ role (customers:edit / products:edit / pm:edit / …) ซึ่ง
  // **`viewer` ไม่มีสักตัว** — แต่ viewer ต้องแนบภาพหน้าจอได้ตามมติ Q2
  // จะเปิดทางนั้นต้องผ่อนด่าน `/api/attachments` ให้ทุกคนที่ล็อกอิน = ผ่อนให้ทุก
  // entity ไม่ใช่เฉพาะเรื่องแจ้งปัญหา (proxy เห็นแค่ method+path ไม่เห็น entityType
  // ที่อยู่ใน body) · ทางเธรดได้สิทธิ์ที่ถูกต้องพอดีอยู่แล้วจาก `UPDATE_ENTITIES`
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

// ── ชนิดไฟล์ที่อนุญาต ────────────────────────────────────────────────
// ค่ากลางชุดเดียว: server ใช้บังคับจริง (กัน .exe/.html), client ใช้เป็น accept.
//
// 🐞 ชุดเดิมแคบเกินจริงจนคนแนบไฟล์ที่ใช้ทำงานกันจริง ๆ ไม่ได้ แล้ว UI ก็ไม่บอกสาเหตุ
// (AttachmentsPanel กลืนข้อความจาก server) = "กดแล้วไม่ขึ้น" โดยไม่มีใครรู้ว่าเพราะอะไร
// ที่ขาดไปและเติมเข้ามารอบนี้:
//   • .heic/.heif — รูปจาก iPhone ตามค่าตั้งต้นของเครื่อง (ช่างถ่ายหน้างานส่งมาไม่ได้เลย)
//   • .ai/.psd/.eps — ไฟล์ Artwork ที่กราฟิกส่งมา ซึ่งเป็นเอกสารบังคับของสินค้า
//   • .doc/.xls/.ppt — Office รุ่นเก่าที่ลูกค้า/ราชการยังส่งมาอยู่
//   • .zip/.rar/.7z — ชุดไฟล์งานที่ส่งกันเป็นก้อน
// ความปลอดภัยไม่ได้พึ่ง "ชนิดไฟล์" อีกต่อไป: ไฟล์ทุกใบเป็น private บน Drive และไหล
// ผ่าน proxy ที่บังคับ Content-Type จากนามสกุล + nosniff + ดาวน์โหลดแทนการเปิดในหน้า
// สำหรับชนิดที่ไม่ปลอดภัยจะแสดงในเบราว์เซอร์ (ดู isInlineSafeMime)
export const ACCEPTED_IMAGE_MIME = [
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif", "image/tiff", "image/bmp",
];
export const ACCEPTED_IMAGE_EXT = [
  "png", "jpg", "jpeg", "webp", "gif", "heic", "heif", "tif", "tiff", "bmp",
];
export const ACCEPTED_DOCUMENT_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/postscript",
  "image/vnd.adobe.photoshop",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "text/csv",
  "text/plain",
];
export const ACCEPTED_DOCUMENT_EXT = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt",
  "ai", "psd", "eps", "zip", "rar", "7z",
];
export const ACCEPTED_UPLOAD_MIME = [...ACCEPTED_DOCUMENT_MIME, ...ACCEPTED_IMAGE_MIME];
export const ACCEPTED_UPLOAD_EXT = [...ACCEPTED_DOCUMENT_EXT, ...ACCEPTED_IMAGE_EXT];
export const UPLOAD_ACCEPT_ATTR = [...ACCEPTED_UPLOAD_EXT.map((e) => `.${e}`)].join(",");
// accept สำหรับที่รับเฉพาะรูป (เช่น composer ความเคลื่อนไหวงานขาย).
export const IMAGE_ACCEPT_ATTR = [
  ...ACCEPTED_IMAGE_MIME,
  ...ACCEPTED_IMAGE_EXT.map((e) => `.${e}`),
].join(",");

// นามสกุล → Content-Type ที่ **server** เป็นคนตัดสิน
// 🐞 เดิมเก็บ `contentType: file.type` ที่ client ส่งมาดิบ ๆ = ตั้งชื่อ x.pdf แล้วประกาศ
// text/html ก็ได้ ซึ่งกลายเป็น stored XSS ทันทีที่ไฟล์ถูกเสิร์ฟกลับมาแบบเปิดในหน้า
const EXT_MIME = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
  ai: "application/postscript",
  eps: "application/postscript",
  psd: "image/vnd.adobe.photoshop",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp",
};

export const fileExt = (fileName) => String(fileName || "").split(".").pop()?.toLowerCase() || "";

// Content-Type ที่จะเก็บ/เสิร์ฟจริง — ยึดนามสกุลก่อนเสมอ ค่าที่ client ประกาศใช้ได้
// ต่อเมื่ออยู่ในลิสต์ที่อนุญาต ไม่งั้นตกเป็น octet-stream (ดาวน์โหลดอย่างเดียว)
export function resolveUploadMime(fileName, clientType) {
  const byExt = EXT_MIME[fileExt(fileName)];
  if (byExt) return byExt;
  if (clientType && ACCEPTED_UPLOAD_MIME.includes(clientType)) return clientType;
  return "application/octet-stream";
}

// ชนิดที่ปล่อยให้เบราว์เซอร์เปิดในหน้าได้ (inline) — นอกลิสต์นี้บังคับดาวน์โหลด
// เพื่อไม่ให้ไฟล์ที่ผู้ใช้อัปกลายเป็นหน้าเว็บที่รันสคริปต์บนโดเมนของระบบ
const INLINE_SAFE_MIME = new Set([
  "application/pdf", "text/plain",
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp",
]);
export const isInlineSafeMime = (mime) => INLINE_SAFE_MIME.has(String(mime || "").toLowerCase());

// header ชุดเดียวของทุก proxy ที่เสิร์ฟไฟล์แนบ (เอกสารแนบ + ไฟล์ในเธรด)
// — Content-Type คำนวณจากนามสกุลใหม่ทุกครั้ง ไม่ใช้ค่าที่เก็บไว้ในแถวดิบ ๆ (แถวเก่า
//   เก็บค่าที่ client ประกาศมา)
// — ชนิดที่ไม่ปลอดภัยจะเปิดในหน้า (เช่น .html ที่หลุดเข้ามา) บังคับเป็นดาวน์โหลด
// — nosniff กันเบราว์เซอร์เดาชนิดเองแล้วรันเป็น HTML/สคริปต์บนโดเมนของระบบ
export function attachmentFileHeaders({ mimeType, fileName } = {}) {
  const mime = resolveUploadMime(fileName, mimeType);
  const disposition = isInlineSafeMime(mime) ? "inline" : "attachment";
  return {
    "Content-Type": mime,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName || "file")}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=60",
  };
}

// docType ที่ "จำเป็น" ของ entity หนึ่งๆ (รับ override การ์ดได้ เช่น เอกสาร
// ลูกค้าตามประเภท). ใช้บังคับแนบเอกสารก่อนยื่น — ทั้งฝั่ง UI และ API.
export function requiredDocKeys(entityType, docTypes) {
  const list = (docTypes && docTypes.length ? docTypes : ATTACHMENT_TYPES[entityType]) || [];
  return list.filter((t) => t.required).map((t) => t.key);
}

// ── ด่านเอกสารบังคับตอนอนุมัติ master data (มติ 2026-07-31) ─────────────
// ชุดการ์ดเอกสารของ entity — ลูกค้าใช้ชุดตามประเภท (นิติบุคคล/บุคคลธรรมดา)
// ⚠️ ตาราง products ไม่มีคอลัมน์ customerType — GET /api/products/[id] เติมให้สดจาก
// ลูกค้าเจ้าของตอนอ่าน ฉะนั้น API ที่อ่าน row ตรงจากตารางจะไม่มีค่านี้ ต้อง lookup เอง
export function docTypesFor(entityType, record) {
  if (entityType === "customer") return customerDocTypes(record?.customerType);
  return ATTACHMENT_TYPES[entityType] || [];
}

// ── เอกสารบังคับที่ยัง "ใช้ไม่ได้" (ตัวตัดสินกลาง ไม่มี I/O) ──────────────
// คืน [{ key, label, reason, expiresAt }] · reason 'absent' = ยังไม่แนบ ·
// 'expired' = แนบแล้วแต่พ้นอายุ (เช่น หนังสือรับรองเกิน 6 เดือน)
//
// อยู่ที่ไฟล์นี้ไม่ใช่ attachmentRequirements.js เพราะที่นั่นต้องลาก supabase เข้ามา —
// กติกาการตัดสินต้องเทสต์ได้และฝั่งจอต้องใช้ตัวเดียวกันได้ (ไม่งั้นการ์ดบนจอกับ
// ด่านตอนกดอนุมัติจะตอบคนละอย่าง แล้วผู้ใช้เห็นติ๊กเขียวครบแต่กดอนุมัติไม่ผ่าน)
//
// แนบหลายใบต่อการ์ดได้ — ขอแค่ใบเดียวที่ยังไม่หมดอายุก็ถือว่าผ่าน
// ยังไม่กรอกวันที่ (unknown) **ไม่นับว่าหมดอายุ** — ไฟล์ที่แนบไว้ก่อนมีฟีเจอร์นี้
// ต้องไม่กลายเป็นของเสียข้ามคืน ฝั่งจอขึ้นป้ายเตือนให้ไปเติมวันที่แทน
export function unsatisfiedRequiredDocs(entityType, docTypes, attachments, today) {
  const required = requiredDocKeys(entityType, docTypes);
  const list = docTypes && docTypes.length ? docTypes : (ATTACHMENT_TYPES[entityType] || []);
  const out = [];
  for (const key of required) {
    const label = list.find((t) => t.key === key)?.label || key;
    const files = (attachments || []).filter((a) => a.docType === key);
    if (!files.length) { out.push({ key, label, reason: 'absent' }); continue; }
    const validities = files.map((f) => documentValidity(entityType, f, today));
    if (validities.some((v) => !v || v.unknown || !v.expired)) continue;
    out.push({ key, label, reason: 'expired', expiresAt: validities.map((v) => v.expiresAt).sort().pop() });
  }
  return out;
}

// ข้อความบอกผู้ใช้ว่าขาดอะไร — ต้องอ่านแล้วรู้ทันทีว่าต้องไปทำอะไรต่อ
// เอกสารที่ "มีแต่หมดอายุ" ต้องพูดคนละคำกับ "ยังไม่มี" ไม่งั้นคนอ่านจะไปหาไฟล์ที่
// แนบอยู่แล้วแล้วงงว่าระบบมองไม่เห็น
export function missingDocsMessage(missing, entityLabel = "ระเบียนนี้") {
  const absent = missing.filter((m) => m.reason !== "expired");
  const expired = missing.filter((m) => m.reason === "expired");
  const parts = [];
  if (absent.length) parts.push(`ขาด ${absent.map((m) => m.label).join(" · ")}`);
  if (expired.length) {
    parts.push(`หมดอายุแล้ว ${expired.map((m) => `${m.label}${m.expiresAt ? ` (ถึง ${m.expiresAt})` : ""}`).join(" · ")}`);
  }
  return `${entityLabel}ยังไม่มีเอกสารบังคับครบ — ${parts.join(" และ ")} `
    + "(แนบได้ที่หัวข้อเอกสารในหน้ารายละเอียด)";
}

// เหตุผลตอนขอ "อนุมัติโดยยกเว้นเอกสาร" — บังคับให้เขียนจริง ไม่ใช่เคาะช่องว่าง
// ⭐ ทำไมต้องมีทางยกเว้น: ระเบียนที่อนุมัติอยู่แล้วจะตกกลับเป็น "รออนุมัติ" ทุกครั้งที่มี
// คนแก้ (resetApprovalOnEdit) — ถ้าไม่มีทางออก ลูกค้า 92 รายที่ยังไม่มีเอกสารจะกลายเป็น
// ระเบียนที่ **แก้แล้วอนุมัติกลับไม่ได้** ทันทีที่ด่านนี้ขึ้น prod = ออกใบเสนอราคาให้ไม่ได้
// การยกเว้นถูกบันทึกทั้งใน audit และเธรดของระเบียน จึงตามย้อนหลังได้ว่าใครยกเว้นเพราะอะไร
export const MIN_OVERRIDE_REASON = 10;
export function overrideReasonError(reason) {
  const text = String(reason ?? "").trim();
  if (text.length < MIN_OVERRIDE_REASON) {
    return `ต้องระบุเหตุผลที่อนุมัติโดยยังไม่มีเอกสารครบ (อย่างน้อย ${MIN_OVERRIDE_REASON} ตัวอักษร)`;
  }
  return null;
}

// ── พรีวิวรูปในหน้า ────────────────────────────────────────────────────
// ไฟล์ที่แสดงเป็นภาพย่อ + คลิกขยายได้. ยึด mimeType เป็นหลัก แต่ไฟล์เก่าบางแถว
// ไม่มี mimeType (อัปก่อนที่ระบบจะเก็บ) จึงเดาจากนามสกุลชื่อไฟล์เป็นทางสำรอง
export function isPreviewableImage(item) {
  if (!item) return false;
  const mime = String(item.mimeType || '').toLowerCase();
  if (mime) return ACCEPTED_IMAGE_MIME.includes(mime);
  const ext = String(item.fileName || '').toLowerCase().split('.').pop();
  return ACCEPTED_IMAGE_EXT.includes(ext);
}

// ชนิดที่เลิกใช้แล้ว — **ไฟล์ที่แนบไว้ตอนนั้นยังอยู่ในฐานข้อมูลและยังต้องอ่านออก**
// (AttachmentsPanel จับ docType ที่ไม่รู้จักลงการ์ด "เอกสารอื่นๆ" ให้อยู่แล้ว แต่ป้าย
// บนไฟล์จะกลายเป็นคีย์ดิบ 'design_contract' ถ้าไม่มีที่ให้ lookup)
//   design_contract — สัญญาออกแบบกลิ่น ถอดออกจากชุดเอกสารลูกค้า (มติผู้ใช้ 2026-08-05)
export const LEGACY_DOC_LABELS = {
  design_contract: "สัญญาออกแบบกลิ่น (เลิกใช้แล้ว)",
};

// ป้ายชื่อภาษาไทยของ docType หนึ่งๆ (fallback: ชนิดที่เลิกใช้ → key เดิมถ้าไม่รู้จัก).
export function attachmentTypeLabel(entityType, docType) {
  const list = ATTACHMENT_TYPES[entityType] || [];
  return list.find((t) => t.key === docType)?.label
    || LEGACY_DOC_LABELS[docType]
    || docType
    || "เอกสารอื่นๆ";
}
