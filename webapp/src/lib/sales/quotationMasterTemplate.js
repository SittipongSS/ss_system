import { fmtDate } from '@/lib/format';
import { isHeadOfficeBranch, normalizeBranchCode } from '@/lib/master/thaiAddress';
import { DEFAULT_SALE_UNIT, saleUnitLabel } from '@/lib/master/units';
import { DOCUMENT_FORMS, documentFormLine } from '@/lib/documentBrand';
import { resolveCompanyBlock } from '@/lib/companyProfile';
import { paymentScheduleRows } from '@/lib/sales/paymentPlan';
import { dealTypeOf } from '@/lib/salesPlanning';
import {
  DEFAULT_NUMBERING_PATTERNS,
  formatDocumentNumber,
  formatDocumentStandardEffectiveDate,
  resolveDocumentAccentKey,
} from '@/lib/documentStandards';

export const QUOTATION_MASTER_TEMPLATE_VERSIONS = Object.freeze([
  { id: 'v1', label: 'V1', templateVersion: 'quotation-balanced-controlled-v1' },
  { id: 'v2', label: 'V2', templateVersion: 'quotation-balanced-controlled-v2' },
  { id: 'v3', label: 'V3', templateVersion: 'quotation-balanced-controlled-v3' },
  // V4 = หน้าตาแบบ V2 (accent น้อยสุด) แต่เปลี่ยนกติกาแบ่งหน้าตามมติผู้ใช้ 2026-07-20:
  // รายการสินค้าเติมให้เต็มหน้าก่อนค่อยตัด (ไม่เกลี่ยสองหน้าแบบ V1–V3) และ
  // เงื่อนไขชำระ/หมายเหตุ/ลงชื่อ เป็นกลุ่มเดียวชิดล่างเอกสาร
  { id: 'v4', label: 'V4', templateVersion: 'quotation-balanced-controlled-v4' },
]);
// V4 เป็นค่าตั้งต้นตั้งแต่ 2026-07-20 — quotePrint.js (ตัวพิมพ์จริง) ใช้กติกาแบ่งหน้า
// ชุดเดียวกันแล้ว preview จึงต้องตรงกับของจริง ไม่งั้นดูตัวอย่างแล้วพิมพ์ออกมาคนละแบบ
export const DEFAULT_QUOTATION_MASTER_VARIANT = 'v4';
export const QUOTATION_MASTER_TEMPLATE_VERSION = QUOTATION_MASTER_TEMPLATE_VERSIONS
  .find((item) => item.id === DEFAULT_QUOTATION_MASTER_VARIANT).templateVersion;

export const QUOTATION_PREVIEW_SCENARIOS = Object.freeze([
  { id: 'compact', label: 'แบบย่อ', description: '1 รายการ ชำระครั้งเดียว ไม่มีส่วนลด' },
  { id: 'standard', label: 'มาตรฐาน', description: '4 รายการ มีส่วนลดและแบ่งชำระ 2 งวด' },
  { id: 'dense', label: 'ตารางแน่น', description: 'รายการเต็มหน้าและข้อความหลายบรรทัด' },
  { id: 'multipage', label: 'หลายหน้า', description: 'ทดสอบหัวตาราง Footer และเลขหน้าต่อเนื่อง' },
  { id: 'long-content', label: 'ข้อความยาว', description: 'ชื่อลูกค้า ที่อยู่ เงื่อนไข และหมายเหตุยาว' },
  { id: 'installments', label: '4 งวด', description: 'ทดสอบ trigger, due rule และยอดรวมทุกงวด' },
]);

export const QUOTATION_PREVIEW_STATES = Object.freeze([
  { id: 'draft', label: 'ฉบับร่าง' },
  { id: 'approved', label: 'อนุมัติแล้ว' },
  { id: 'cancelled', label: 'ยกเลิก' },
]);

const DEFAULT_STANDARD = Object.freeze({
  formCode: 'FM-SA-01',
  revision: '00',
  effectiveDate: '08/05/2568',
  titleTh: 'ใบเสนอราคา',
  titleEn: 'QUOTATION',
  accentKey: 'terracotta',
  numberingPattern: DEFAULT_NUMBERING_PATTERNS.quotation,
});

const DEFAULT_SALES_ORDER_STANDARD = Object.freeze({
  formCode: DOCUMENT_FORMS.salesOrder.code,
  revision: DOCUMENT_FORMS.salesOrder.revision,
  effectiveDate: DOCUMENT_FORMS.salesOrder.effectiveDate,
  titleTh: 'ใบสั่งขาย',
  titleEn: DOCUMENT_FORMS.salesOrder.title,
  accentKey: 'steel',
  numberingPattern: DEFAULT_NUMBERING_PATTERNS.salesOrder,
});

// ── ภาษาของเอกสาร (IS-26080005 · มติผู้ใช้ 2026-08-12) ───────────────────────
//
// **ระดับ 1: ป้ายบนกระดาษเท่านั้น** — ป้ายทุกช่องมีคู่ไทย/อังกฤษที่นี่ที่เดียว ส่วน
// *ข้อมูล* ที่คนกรอก (ชื่อลูกค้า ที่อยู่ ชื่อสินค้า เงื่อนไขชำระ หมายเหตุ) ไม่มีคู่อังกฤษ
// — ใบที่ส่งลูกค้าต่างชาติกรอกข้อความพวกนั้นเป็นอังกฤษมาแต่ต้นอยู่แล้ว
//
// ⚠️ **หน้าจอของระบบยังเป็นไทยล้วน** ตารางนี้แปลเฉพาะสิ่งที่พิมพ์ออกไปหาลูกค้า
// คนใช้ระบบเป็นคนไทยทั้งหมด (มติผู้ใช้) — ห้ามลากพจนานุกรมนี้ไปใช้กับ UI
//
// ⚠️ **ค่าฝั่ง th ต้องตรงกับข้อความเดิมทุกตัวอักษร** — ใบภาษาไทยคือใบเดิมทุกใบใน
// ระบบ เปลี่ยนคำที่นี่แม้คำเดียวคือเปลี่ยนหน้าตาเอกสารของทุกคนพร้อมกัน
export const QUOTATION_DOC_LANGUAGES = Object.freeze(['th', 'en']);
export const DEFAULT_QUOTATION_DOC_LANGUAGE = 'th';

// ค่านอกลิสต์ (ใบเก่าก่อน mig 0238 · ข้อมูลเพี้ยน) ตกไปเป็นไทย = พฤติกรรมเดิม
export function docLanguageOf(value) {
  return QUOTATION_DOC_LANGUAGES.includes(value) ? value : DEFAULT_QUOTATION_DOC_LANGUAGE;
}

// คู่ไทย/อังกฤษของทุกป้ายบนเอกสาร — คีย์เดียว ค่าเป็นคู่ ไม่ใช่พจนานุกรมสองก้อนแยกกัน
// (สองก้อนแยกกันคือรูปแบบที่ทำให้ฝั่งหนึ่งขาดคีย์แล้วไม่มีใครรู้จนเอกสารพิมพ์ออกมาว่าง)
const DOC_LABEL_PAIRS = Object.freeze({
  // หัวเอกสาร
  number: ['เลขที่', 'No.'],
  issueDate: ['วันที่', 'Date'],
  validUntil: ['ยืนราคาถึง', 'Valid Until'],
  companyTaxId: ['เลขประจำตัวผู้เสียภาษี', 'Tax ID'],
  companyPhone: ['โทร', 'Tel.'],
  companyLine: ['Line', 'Line'],
  // กล่องคู่สัญญา + ข้อมูลอ้างอิง
  customer: ['ผู้ซื้อ', 'CUSTOMER'],
  reference: ['ข้อมูลอ้างอิง', 'REFERENCE'],
  customerTaxId: ['เลขผู้เสียภาษี', 'Tax ID'],
  shippingAddress: ['ที่อยู่จัดส่ง', 'Shipping Address'],
  contact: ['ผู้ติดต่อ', 'Contact'],
  projectCode: ['เลขที่โครงการ', 'Project No.'],
  project: ['โครงการ', 'Project'],
  projectType: ['ประเภทโครงการ', 'Project Type'],
  salesOwner: ['ผู้เสนอราคา', 'Quoted By'],
  phone: ['โทร', 'Tel.'],
  referenceNote: ['เอกสารอ้างอิง', 'Reference'],
  // ตารางรายการ
  lineNo: ['ลำดับ', 'No.'],
  lineDescription: ['รายละเอียดสินค้า / บริการ', 'Description'],
  qty: ['จำนวน', 'Qty'],
  unit: ['หน่วย', 'Unit'],
  unitPrice: ['ราคา/หน่วย', 'Unit Price'],
  lineDiscount: ['ส่วนลด', 'Discount'],
  amount: ['จำนวนเงิน', 'Amount'],
  itemsContinued: ['รายการสินค้าและบริการต่อ', 'Items continued'],
  // สรุปยอด
  totalsAria: ['สรุปยอด', 'Summary'],
  subtotal: ['รวมสินค้า / บริการ', 'Subtotal'],
  discountLine: ['หัก ส่วนลด', 'Less Discount'],
  afterDiscount: ['ยอดหลังหักส่วนลด', 'Net After Discount'],
  vat: ['ภาษีมูลค่าเพิ่ม', 'VAT'],
  grandTotal: ['ยอดรวมทั้งสิ้น', 'Grand Total'],
  currency: ['บาท', 'THB'],
  // งวดชำระ + เงื่อนไข
  paymentSchedule: ['งวดชำระเงิน', 'PAYMENT SCHEDULE'],
  // แถวเดียวที่ระบบสร้างเองเมื่อใบไม่ได้แบ่งงวด (paymentScheduleRows) — ป้าย ไม่ใช่
  // ข้อความที่คนกรอก จึงต้องแปล · ชื่องวดที่คนตั้งเองยังพิมพ์ตามที่พิมพ์ไว้
  fullPayment: ['ชำระเต็มจำนวน', 'Full payment'],
  installmentDetail: ['รายละเอียด', 'Description'],
  paymentMethod: ['วิธีชำระเงิน', 'PAYMENT METHOD'],
  paymentTerms: ['เงื่อนไขการชำระเงิน', 'PAYMENT TERMS'],
  remarks: ['หมายเหตุ', 'REMARKS'],
  paymentDetails: ['รายละเอียดการชำระเงิน', 'PAYMENT DETAILS'],
  documentAcceptance: ['การยืนยันเอกสาร', 'DOCUMENT ACCEPTANCE'],
  // ช่องลงนาม
  signaturesAria: ['ส่วนลงนาม', 'Signatures'],
  signHere: ['ลงชื่อ', 'Signature'],
  signDateBlank: ['วันที่ ______ / ______ / ______', 'Date ______ / ______ / ______'],
  esignature: ['ลายเซ็นอิเล็กทรอนิกส์', 'Electronic Signature'],
  signatureOf: ['ลายเซ็น', 'Signature of'],
  preparedBy: ['ผู้จัดทำ', 'Prepared By'],
  preparedByRole: ['พนักงานขาย', 'Sales Representative'],
  approvedBy: ['ผู้อนุมัติเสนอราคา', 'Approved By'],
  approver: ['ผู้อนุมัติ', 'Approver'],
  confirmedBy: ['ผู้ยืนยันคำสั่งซื้อ', 'Confirmed By'],
  confirmedByRole: ['ลูกค้า', 'Customer'],
  // ท้ายกระดาษ + ลายน้ำ + ชื่อเอกสารบนแถบเครื่องมือ
  page: ['หน้า', 'Page'],
  draft: ['ฉบับร่าง', 'DRAFT'],
  cancelled: ['ยกเลิก', 'CANCELLED'],
  documentLabel: ['ใบเสนอราคา', 'Quotation'],
  headOffice: ['สำนักงานใหญ่', 'Head Office'],
  // ป้ายหัวแถวในบล็อกลูกค้า — คนละตัวกับ `branch` ที่เป็น **คำนำหน้าเลข** ("สาขาที่ 00001")
  branchRow: ['สาขา', 'Branch'],
});

/* เลขสาขาบนเอกสาร
   ⭐ **เลขเปล่า ๆ ไม่มีคำว่า "สาขาที่" นำหน้า** (มติผู้ใช้ 2026-08-27) — แถวนี้มีป้าย
   `สาขา` กำกับอยู่แล้ว เขียน "สาขา · สาขาที่ 00001" คือพูดซ้ำสองรอบบนบรรทัดเดียว
   ⚠️ '00000' คือค่าที่พบบ่อยที่สุด (คอลัมน์ not null เพราะอยู่ใน unique (taxId, branchCode))
   ⇒ ยังต้องอ่านเป็น "สำนักงานใหญ่" ไม่ใช่พิมพ์เลข 00000 ให้ลูกค้าอ่านเอง
   ส่วนลูกค้าที่กรอกช่องสาขาเป็น *ชื่อ* ('แจ้งวัฒนะ') พิมพ์ชื่อนั้นตามเดิม */
export function quotationBranchText(branchCode, L) {
  const code = normalizeBranchCode(branchCode);
  return isHeadOfficeBranch(code) ? L.t('headOffice') : code;
}

/* ตัวอ่านป้ายของภาษาที่ใบนี้เลือก
   - `t(key)` = ป้ายเดี่ยวในภาษานั้น
   - `pair(key)` = คู่ { text, sub } สำหรับหัวข้อที่ใบไทยพิมพ์สองบรรทัดอยู่แล้ว
     (`งวดชำระเงิน / PAYMENT SCHEDULE`) — ใบอังกฤษเหลือบรรทัดเดียว ไม่ต้องมีไทยกำกับ
     เพราะคนอ่านคือลูกค้าต่างชาติ */
export function quotationDocLabels(language) {
  const index = docLanguageOf(language) === 'en' ? 1 : 0;
  const t = (key) => DOC_LABEL_PAIRS[key]?.[index] ?? '';
  return {
    language: docLanguageOf(language),
    isEnglish: index === 1,
    t,
    pair: (key) => ({
      text: t(key),
      sub: index === 0 ? `/ ${DOC_LABEL_PAIRS[key][1]}` : '',
    }),
  };
}

// วันที่/เลขรันของเอกสารตัวอย่าง — ตรึงไว้ให้พรีวิวนิ่ง (ตรงกับ 20/07/2569 บนใบ)
const PREVIEW_NUMBER_DATE = new Date('2026-07-20T12:00:00+07:00');
const PREVIEW_RUNNING_NO = 28;

// เลขที่บนเอกสารตัวอย่าง = ประกอบจากรูปแบบที่กำลังตั้งจริง — เปลี่ยนรูปแบบในหน้าตั้งค่า
// แล้วต้องเห็นเลขใหม่บนหัวใบทันที ไม่งั้นช่อง "รูปแบบเลขที่" ก็ยังเป็นช่องที่หลอกตา
function previewDocumentNumber(standard) {
  return formatDocumentNumber(standard.numberingPattern, {
    date: PREVIEW_NUMBER_DATE,
    running: PREVIEW_RUNNING_NO,
    revision: 0,
  });
}

// รูปลายเซ็นตัวอย่างสำหรับหน้า preview เท่านั้น (SVG ลายมือ จำลอง) — ใบจริงฝัง PNG จริง
// ที่ผู้อนุมัติอัปโหลด (Phase 5B) ผ่าน options.approverSignatureImage ตอนตรึง snapshot
const PREVIEW_SIGNATURE_IMAGE = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20320%20110'%3E%3Cpath%20d='M12%2078%20C28%2040%2040%2030%2046%2044%20C52%2058%2040%2084%2034%2086%20C28%2088%2034%2060%2054%2052%20C74%2044%2086%2066%2078%2078%20C70%2090%2064%2070%2084%2054%20C104%2038%20120%2044%20116%2062%20C112%2080%20100%2082%20104%2068%20C108%2054%20128%2044%20150%2052%20C140%2066%20132%2078%20142%2078%20C160%2078%20166%2040%20186%2034%20C206%2028%20196%2074%20190%2082%20M182%2060%20C210%2054%20236%2052%20262%2058%20C240%2062%20226%2070%20236%2072%20C256%2074%20286%2058%20306%2040'%20fill='none'%20stroke='%231a2b4a'%20stroke-width='3.2'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3C/svg%3E";

const BASE_QUOTE = Object.freeze({
  templateVersion: QUOTATION_MASTER_TEMPLATE_VERSION,
  locale: 'th-TH',
  standard: DEFAULT_STANDARD,
  company: {
    nameTh: 'บริษัท เซนท์ แอนด์ เซนส์ แลบบอราทอรี่ จำกัด',
    nameEn: 'SCENT AND SENSE LABORATORY CO., LTD.',
    address: '88/8 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพมหานคร 10240',
    taxId: '0105560000000',
    phone: '02-000-0000',
    line: '@scentandsense',
    website: 'www.scentandsense.co.th',
  },
  document: {
    number: 'QT-26070028-0',
    issueDate: '20/07/2569',
    validUntil: '19/08/2569',
    state: 'approved',
  },
  customer: {
    name: 'บริษัท ตัวอย่าง โปรดักส์ จำกัด',
    address: '99/9 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',
    taxId: '0105561000000',
    branch: 'สำนักงานใหญ่',
    contactName: 'คุณกานต์ชนก ตัวอย่าง',
    contactPhone: '081-000-0000',
  },
  references: {
    // ตัวอย่างต้องมีรูปเดียวกับของจริง — เอกสารแยกรหัส/ชื่อ/ประเภท คนละแถว
    projectCode: 'PJ-26070038',
    projectName: 'Signature Bloom',
    dealTitle: 'ผลิตภัณฑ์น้ำหอมปรับอากาศ 2026',
    dealType: 'SCENT',
    // ผู้เสนอราคา = AE เจ้าของดีล (บล็อกอ้างอิง) · ผู้จัดทำ = คนที่ลงมือทำใบ (ช่องเซ็น)
    // ตัวอย่างตั้งเป็นคนละคนโดยตั้งใจ จะได้เห็นทันทีถ้าโค้ดเผลอเอาค่าหนึ่งไปใช้แทนอีกค่า
    salesOwner: 'กานติมา ธาดาธารกิจ',
    salesOwnerPhone: '081-234-5678', // เบอร์ผู้เสนอราคา = เบอร์เจ้าของดีล ไม่ใช่เบอร์คนทำใบ
    preparedBy: 'ณัฐวุฒิ พงษ์ไพบูลย์',
  },
  paymentMethod: 'โอนเงินเข้าบัญชีธนาคารของบริษัทตามรายละเอียดท้ายใบเสนอราคา',
  paymentTerms: 'มัดจำ 50% เมื่อยืนยันคำสั่งซื้อ และชำระส่วนที่เหลือก่อนส่งมอบสินค้า',
  remarks: 'ราคานี้รวมบรรจุภัณฑ์ตามรายละเอียดที่ระบุ ไม่รวมค่าจัดส่งนอกเขตกรุงเทพฯ',
  vatRate: 7,
  discount: { type: 'amount', value: 0 },
  installments: [{ label: 'ชำระเต็มจำนวน', percent: 100, trigger: 'เมื่อยืนยันคำสั่งซื้อ', dueRule: 'ภายใน 7 วัน', note: '' }],
  signature: {
    signerName: 'สุพิชญา ใจดี',
    signerRole: 'ผู้จัดการฝ่ายขาย',
    signedAt: '20/07/2569 14:30',
    evidenceId: 'DSE-PREVIEW-0001',
    fingerprint: 'sha256:preview-only-not-production',
    imageDataUri: PREVIEW_SIGNATURE_IMAGE,
  },
});

const PRODUCT_NAMES = [
  'ก้านไม้หอมปรับอากาศ 100 ml',
  'สเปรย์ปรับอากาศ 250 ml',
  'น้ำหอมสำหรับผลิตภัณฑ์ดูแลผิว',
  'ค่าพัฒนากลิ่นและตัวอย่างก่อนผลิตจริง',
  'บริการออกแบบฉลากและตรวจปรู๊ฟ',
  'บรรจุภัณฑ์กล่องกระดาษพิมพ์ 4 สี',
];

function lineAt(index, overrides = {}) {
  const qty = overrides.qty ?? (index % 4 === 3 ? 1 : (index + 1) * 120);
  const unitPrice = overrides.unitPrice ?? (index % 4 === 3 ? 25000 : 145 + ((index % 5) * 20));
  // ส่วนลดรายบรรทัดคิดแบบเดียวกับของจริง (quoteLineNet) — lineTotal ตัวอย่างจึงเป็น
  // ยอดหลังหักส่วนลด เหมือนใบจริง ไม่งั้นพรีวิวโชว์ตัวเลขที่บวกลบไม่ลง
  const discountType = ['percent', 'amount'].includes(overrides.discountType) ? overrides.discountType : null;
  const discountValue = discountType ? Number(overrides.discountValue || 0) : 0;
  const gross = roundMoney(qty * unitPrice);
  const discountAmount = discountType === 'percent'
    ? roundMoney(gross * (discountValue / 100))
    : Math.min(gross, roundMoney(discountValue));
  return {
    id: `preview-line-${index + 1}`,
    fgCode: overrides.fgCode ?? `FG-PV-${String(index + 1).padStart(3, '0')}`,
    brand: overrides.brand ?? 'SCENT AND SENSE',
    description: overrides.description ?? PRODUCT_NAMES[index % PRODUCT_NAMES.length],
    note: overrides.note ?? (index % 5 === 0 ? 'กลิ่น Signature Bloom · บรรจุตามมาตรฐานที่ตกลง' : ''),
    qty,
    unit: overrides.unit ?? (index % 4 === 3 ? 'งาน' : 'ชิ้น'),
    unitPrice,
    discountType,
    discountValue,
    discountAmount,
    lineTotal: roundMoney(gross - discountAmount),
  };
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function controlledFormLine(standard = DEFAULT_STANDARD) {
  return `${standard.formCode}: Rev. No.${standard.revision}. ${standard.effectiveDate}`;
}

// แถวมาตรฐานจาก DB (document_standard_versions) → รูปที่ preview model ใช้.
// รับได้ทั้งร่างที่ยังกรอกไม่ครบ (ช่องว่างตกไปใช้ค่าตัวอย่าง) และ null
export function previewStandardOf(standard, docType = 'quotation') {
  const fallback = docType === 'salesOrder'
    ? { ...DEFAULT_STANDARD, ...DEFAULT_SALES_ORDER_STANDARD }
    : DEFAULT_STANDARD;
  if (!standard) return { ...fallback };
  const effectiveDate = String(standard.effectiveDate || '');
  return {
    formCode: String(standard.formCode || '').trim() || fallback.formCode,
    revision: String(standard.revision || '').trim() || fallback.revision,
    // ร่างเก็บวันที่เป็น YYYY-MM-DD ส่วนเอกสารพิมพ์เป็น พ.ศ. — แปลงให้ตรงกับใบจริง
    effectiveDate: /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
      ? formatDocumentStandardEffectiveDate(effectiveDate)
      : (effectiveDate || fallback.effectiveDate),
    titleTh: String(standard.titleTh || '').trim() || fallback.titleTh,
    titleEn: String(standard.titleEn || '').trim() || fallback.titleEn,
    accentKey: resolveDocumentAccentKey(standard, docType),
    numberingPattern: String(standard.numberingPattern || '').trim() || fallback.numberingPattern,
  };
}

export function allocateInstallmentAmounts(total, installments = []) {
  const safeTotal = roundMoney(total);
  let allocated = 0;
  return installments.map((row, index) => {
    const isLast = index === installments.length - 1;
    const amount = isLast
      ? roundMoney(safeTotal - allocated)
      : roundMoney(safeTotal * (Number(row.percent || 0) / 100));
    allocated = roundMoney(allocated + amount);
    return { ...row, amount };
  });
}

function estimatedTextLines(value, charsPerLine) {
  return String(value || '')
    .split(/\r?\n/)
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
}

function rowUnits(line) {
  const meta = [line.fgCode, line.brand].filter(Boolean).join(' · ');
  const metaLines = meta ? estimatedTextLines(meta, 54) : 0;
  const detailLines = estimatedTextLines(line.description, 48);
  // แถวพื้นฐานรองรับโครงสร้าง 2 ชั้นอยู่แล้ว จึงหักหนึ่งหน่วยก่อนคิดความสูงเพิ่ม.
  const identityLines = Math.max(1, metaLines + detailLines - 1);
  const noteLines = line.note ? estimatedTextLines(line.note, 54) : 0;
  return identityLines + noteLines;
}

function pageUnits(lines = []) {
  return lines.reduce((sum, line) => sum + rowUnits(line), 0);
}

function balancedSplit(lines, leftCapacity, rightCapacity, rightReserve) {
  let best = null;
  for (let index = 1; index < lines.length; index += 1) {
    const left = lines.slice(0, index);
    const right = lines.slice(index);
    const leftUnits = pageUnits(left);
    const rightUnits = pageUnits(right);
    if (leftUnits > leftCapacity || rightUnits > rightCapacity) continue;

    const score = Math.abs(leftUnits - (rightUnits + rightReserve));
    if (!best || score < best.score) best = { left, right, score };
  }
  return best;
}

// ── V4: โมเดลความสูงที่ calibrate จากการวัด DOM จริง ──────────────────────────
// 1 หน่วย = 1 บรรทัดข้อความ · โมเดลเดิม (rowUnits ตรง ๆ + ความจุ 14) เหมาว่าทุกหน่วย
// สูงเท่าแถวเต็ม จึงตัดหน้าเร็วเกินจริงเกือบเท่าตัว (บั๊กที่ผู้ใช้เห็น: "ไม่เต็มหน้าก็ตัดแล้ว")
// ⇒ ต้องแยกต้นทุนฐานแถวออกจากบรรทัดข้อความ
//
// 🔴 **งบของหน้าคือกล่อง `.sheetContent` เท่านั้น ไม่ใช่กล่องในของแผ่นกระดาษ**
// แผ่น A4 1123px − padding บน/ล่าง 80px = กล่องใน 1044px แต่ 185px แรกเป็นหัวเอกสาร
// ซึ่ง pagination ไม่ได้ใช้ · เอา 1044 มาหารเป็นงบเมื่อไร = เกินจริง ~9.5 หน่วย
// แล้วตารางล้นทุกเคส (กับดักที่เคยทำให้งานยกความสูงบรรทัดของเอกสารค้างไปรอบหนึ่ง)
//
// ── รอบวัด 2026-08-14 · line-height เอกสาร 1.65 (docs/typography-system.md) ──
// วัดที่ /settings/document-standards/preview ครบทุกสถานการณ์ + ใบสังเคราะห์ 111 เคส
// (1-30 รายการ × มี/ไม่มีส่วนลดรายบรรทัด × ชื่อลูกค้ายาว × หมายเหตุใต้รายการ × ชื่อสินค้ายาว):
//   1 หน่วย = 19.36px · หัวเอกสาร 185.4 · **พื้นที่เนื้อหา 858.2px = 44.3 หน่วย**
//   แถว 1 บรรทัด 53.8 (ฐาน 34.4 + บรรทัด 19.4) · party 167.4 (ที่อยู่ยาว 205.7)
//   หัวตาราง 34.3 · ป้าย "ต่อ" 19 · **มูลค่ารวม 96.9 ปกติ / 155.0 เมื่อมีส่วนลดรายบรรทัด**
//   ตารางงวด 85.5 (1 งวด) 131.1 (2 งวด) 206.4 (4 งวด) · กล่องเงื่อนไข 166.9-204.3 ·
//   ลงชื่อ 156.6 · หัวข้อกลุ่มท้าย 38.1
// (รอบก่อน 2026-07-20 ที่ line-height 1.42-1.5: 1 หน่วย 17px · เนื้อหา 881px = 52 หน่วย)
//
// ⚠️ ปัดงบของหน้า **ลง** และปัดความสูงบล็อก **ขึ้น** เสมอ — `.sheet` เป็น overflow:hidden
// ประเมินขาดแล้วไม่มีอะไรฟ้อง มันตัดเงียบ ๆ กลางตัวเลขเงิน
const V4_PAGE_UNITS = 44; // 858.2px / 19.36
const V4_ROW_BASE = 2; // padding+เส้นตารางต่อแถว 34.4px
const V4_THEAD = 2; // 34.3px
// 2026-08-27: +1 หน่วยเมื่อคืนแถว "สาขา" เข้าบล็อกลูกค้า — วัดจริงด้วย Chrome ที่
// line-height 1.65: .partyGrid 209.2px → 227.7px (+18.5px = 0.96 หน่วย ⇒ ปัดขึ้น 1)
const V4_PARTY = 10; // 186.8px
const V4_BANNER = 1; // ป้าย "รายการต่อ" 19px
// มูลค่ารวมมีสองทรง — ใบที่มีส่วนลดรายบรรทัดมีแถวส่วนลดเพิ่ม สูงกว่ากันเกือบ 60px
// 🐞 เดิมจองค่าเดียว (6 หน่วย) ทั้งที่ทรงใหญ่กิน 8 ⇒ ใบที่ให้ส่วนลดรายบรรทัดเสี่ยงโดนตัด
/* บล็อกมูลค่ารวม = ตาราง .totals + บรรทัด "จำนวนเงินตัวอักษร" ใต้มัน (IS-26080034)
   วัดจริงด้วย Chrome ที่ line-height 1.65 · รวม margin-top ของทั้งสองก้อน:
     3 แถว (ไม่มีส่วนลด)      109.3 + 24.2 = 133.5px = 6.90 หน่วย ⇒ ปัดขึ้น 7
     5 แถว (มีส่วนลด)         167.2 + 24.2 = 191.4px = 9.89 หน่วย ⇒ ปัดขึ้น 10
   บรรทัดตัวอักษรวัดได้ 1 บรรทัดถึงยอดหลักพันล้านทั้งไทยและอังกฤษ (กว้าง 186mm) */
const V4_TOTALS = 7; // 133.5px
const V4_TOTALS_WITH_DISCOUNT_ROWS = 10; // 191.4px
const V4_SAFETY = 2; // กันประเมินความยาวข้อความพลาด — ห้ามล้นเพราะ overflow:hidden ตัดเงียบ
const V4_SIGNATURES = 8; // 156.2px
// 🐞 เดิมจองไว้ 8 หน่วย (155px) ทั้งที่แถวเงื่อนไข "ไม่รวมบรรทัดข้อความ" สูงแค่ 48.6px
// (คอมเมนต์เดิมเขียนว่า "กล่องเงื่อนไข 3 กล่อง" แต่ของจริงเป็นสองกล่องเรียงข้างกัน
// แล้วหมายเหตุเต็มแถวอีกหนึ่ง ซึ่งนับแยกอยู่แล้ว) ⇒ จองเกินไป 5.5 หน่วย = 106px
// ผลคือกลุ่มท้ายเอกสาร "ไม่พอ" ทั้งที่พอ แล้วดันไปเปิดหน้าใหม่ให้เปล่า ๆ
const V4_TERMS_BASE = 3; // 48.6px (ฐานกล่อง ไม่รวมบรรทัดข้อความ)
const V4_INSTALLMENT_BASE = 3; // หัวข้อ+หัวตารางงวด
const V4_INSTALLMENT_ROW = 2; // 25px/งวด
// 🐞 กล่องหมายเหตุถูกนับเป็น "จำนวนบรรทัด" เฉย ๆ ทั้งที่มันเป็นกล่องมีหัวข้อ+ขอบ+padding
// วัดจริง 68.4px สำหรับหมายเหตุบรรทัดเดียว = ฐาน 49px + บรรทัด 19.4px ⇒ ขาดไป 2.5 หน่วย
const V4_REMARKS_BASE = 3; // 49px + ระยะห่าง
const V4_SECTION_LEAD = 2; // หัวข้อ "รายละเอียดการชำระเงิน" บนหน้าท้ายเอกสาร 34px

// ความจุของ "หน้าท้ายเอกสารทั้งหน้า" — เต็มหน้าลบหัวข้อกลุ่มและเผื่อประเมินพลาด
// ⚠️ กลุ่มที่สูงเกินค่านี้ **ไม่มีหน้าไหนรับไหว** ต้องผ่า ไม่ใช่ยัดลงหน้าเดียวแล้วปล่อยล้น
const V4_GROUP_PAGE_CAPACITY = V4_PAGE_UNITS - V4_SECTION_LEAD - V4_SAFETY;

/* ใบที่มีส่วนลดรายบรรทัดจะมีทั้งคอลัมน์ส่วนลดในตารางและแถวส่วนลดในบล็อกมูลค่ารวม
   ⚠️ ตัดสินจาก **ทั้งใบ** ไม่ใช่รายหน้า — หัวตารางทุกหน้าต้องมีคอลัมน์ชุดเดียวกัน
   (ตัวสร้างเอกสารใช้ฟังก์ชันตัวเดียวกันนี้ตัดสินว่าจะวาดคอลัมน์ส่วนลดไหม จะได้ไม่มีทาง
   ที่ "ที่จองไว้ตอนแบ่งหน้า" กับ "ที่วาดจริง" คิดคนละแบบ) */
export function hasLineDiscount(lines = []) {
  return lines.some((line) => Number(line.discountAmount || 0) > 0);
}

/* ทรงของบล็อกมูลค่ารวมตัดสินจาก **ส่วนลดระดับหัวใบ** เพราะนั่นคือสิ่งเดียวที่เพิ่มแถว
   "หัก ส่วนลด" + "ยอดหลังหักส่วนลด" (ดู totalsSection ใน quotationMasterDocument)
   🐞 ของเดิมตัดสินจาก `hasLineDiscount(lines)` ซึ่งเป็นคนละเรื่อง — ส่วนลดรายบรรทัด
      เพิ่ม *คอลัมน์ในตาราง* ไม่ได้เพิ่มแถวในบล็อกนี้ ⇒ ใบที่ลดที่หัวใบแต่ไม่ได้ลด
      รายบรรทัด (วัดจากฐานจริง 26/08/2026: 29 จาก 34 ใบที่มีส่วนลด) จองไว้ทรง 3 แถว
      แต่วาด 5 แถว ขาด 3 หน่วย — ยังไม่มีใบไหนล้นเพราะเป็นใบสั้น แต่รอเวลาเท่านั้น */
function v4TotalsReserve(discountAmount) {
  return Number(discountAmount || 0) > 0 ? V4_TOTALS_WITH_DISCOUNT_ROWS : V4_TOTALS;
}

function v4RowCost(line) {
  return V4_ROW_BASE + rowUnits(line);
}

function v4PageCost(lines = []) {
  return lines.reduce((sum, line) => sum + v4RowCost(line), 0);
}

function v4FirstCapacity(customer) {
  const customerCopy = `${customer?.name || ''} ${customer?.address || ''}`.trim();
  const longCopyReserve = Math.min(4, Math.ceil(Math.max(0, customerCopy.length - 120) / 45));
  return V4_PAGE_UNITS - V4_PARTY - longCopyReserve - V4_THEAD - V4_SAFETY;
}

const V4_CONTINUATION_CAPACITY = V4_PAGE_UNITS - V4_BANNER - V4_THEAD - V4_SAFETY;

// ความสูงกลุ่มท้ายเอกสาร (งวดชำระ + เงื่อนไข + ลงชื่อ) — กล่องวิธีชำระกับเงื่อนไข
// อยู่ข้างกันจึงคิดตามกล่องที่สูงกว่า หมายเหตุเต็มแถวคิดแยก
function v4GroupUnits({ installments, paymentMethod, paymentTerms, remarks }) {
  // ค่าต่อบรรทัดสอดคล้องกับสัดส่วนคอลัมน์ .85/1.15 และ remarks กว้างไม่เกิน 168mm
  // ต้องนับ newline จากผู้ใช้เป็นบรรทัดจริง เพราะ CSS ใช้ white-space: pre-wrap.
  const methodLines = estimatedTextLines(paymentMethod, 45);
  const termsLines = estimatedTextLines(paymentTerms, 62);
  const remarksLines = estimatedTextLines(remarks, 112);
  return (installments.length ? V4_INSTALLMENT_BASE + V4_INSTALLMENT_ROW * installments.length : 0)
    + V4_TERMS_BASE + Math.max(methodLines, termsLines)
    + (remarks ? V4_REMARKS_BASE + remarksLines : 0)
    + V4_SIGNATURES;
}

// V4: เติมรายการให้เต็มหน้าก่อนค่อยตัดไปหน้าถัดไป (ไม่เกลี่ยให้สองหน้าเท่ากันแบบ V1–V3)
// กติกาที่ต้องคุม 2 ข้อ:
//   1. ตัดตามข้อ — ไม่ผ่ากลางรายการ
//   2. หน้าที่ถือ "มูลค่ารวม" ต้องมีรายการสินค้าด้านบนอย่างน้อย 1 รายการ
//      → ตอนเติมหน้าจึงต้องเหลือรายการไว้ให้หน้าถัดไปเสมอ ไม่ใช่กวาดจนหมด
function paginateFilled(remaining, { firstCapacity, continuationCapacity, totalsReserve }) {
  const pages = [];
  while (remaining.length) {
    const isFirst = pages.length === 0;
    const capacity = isFirst ? firstCapacity : continuationCapacity;
    const finalCapacity = Math.max(1, capacity - totalsReserve);

    // ที่เหลือทั้งหมดใส่หน้านี้ได้พร้อมบล็อกมูลค่ารวม → จบที่หน้านี้
    if (v4PageCost(remaining) <= finalCapacity) {
      pages.push(remaining.splice(0));
      break;
    }

    const page = [];
    let used = 0;
    // เงื่อนไข remaining.length > 1 = กันไม่ให้กวาดหมดจนหน้าถัดไปเหลือแต่ยอดรวมลอย ๆ
    while (remaining.length > 1) {
      const unitsForLine = v4RowCost(remaining[0]);
      if (page.length && used + unitsForLine > capacity) break;
      page.push(remaining.shift());
      used += unitsForLine;
      if (used >= capacity) break;
    }
    if (page.length === 0) page.push(remaining.shift());
    pages.push(page);
  }
  return pages;
}

export function paginateQuotationMasterLines(lines = [], options = {}) {
  if (!Array.isArray(lines) || lines.length === 0) return [[]];

  const { mode = 'balanced' } = options;

  // โหมด fill (V4) ใช้สเกลหน่วยคนละชุดกับ balanced — ค่าตั้งต้นเป็นหน่วย px-calibrated
  if (mode === 'fill') {
    const {
      firstCapacity = V4_PAGE_UNITS - V4_PARTY - V4_THEAD - V4_SAFETY,
      continuationCapacity = V4_CONTINUATION_CAPACITY,
      totalsReserve = V4_TOTALS,
    } = options;
    return paginateFilled(lines.map((line) => ({ ...line })), {
      firstCapacity, continuationCapacity, totalsReserve,
    });
  }

  const {
    firstCapacity = 14,
    continuationCapacity = 19,
    totalsReserve = 4,
  } = options;
  const firstFinalCapacity = Math.max(1, firstCapacity - totalsReserve);
  const continuationFinalCapacity = Math.max(1, continuationCapacity - totalsReserve);
  const remaining = lines.map((line) => ({ ...line }));
  const pages = [];

  while (remaining.length) {
    const isFirst = pages.length === 0;
    const capacity = isFirst ? firstCapacity : continuationCapacity;
    const finalCapacity = isFirst ? firstFinalCapacity : continuationFinalCapacity;
    const units = pageUnits(remaining);

    if (units <= finalCapacity) {
      pages.push(remaining.splice(0));
      break;
    }

    if (units <= capacity + continuationFinalCapacity) {
      const split = balancedSplit(
        remaining,
        capacity,
        continuationFinalCapacity,
        totalsReserve,
      );
      if (split) {
        pages.push(split.left, split.right);
        break;
      }
    }

    const page = [];
    let used = 0;
    while (remaining.length > 1) {
      const unitsForLine = rowUnits(remaining[0]);
      if (page.length && used + unitsForLine > capacity) break;
      page.push(remaining.shift());
      used += unitsForLine;
      if (used >= capacity) break;
    }
    if (page.length === 0) page.push(remaining.shift());
    pages.push(page);
  }

  return pages;
}

function firstPageCapacity(customer) {
  const customerCopy = `${customer?.name || ''} ${customer?.address || ''}`.trim();
  const longCopyReserve = Math.min(4, Math.ceil(Math.max(0, customerCopy.length - 120) / 45));
  return 14 - longCopyReserve;
}

function paymentContentUnits({ installments, paymentMethod, paymentTerms, remarks }) {
  return (installments.length * 2)
    + Math.max(1, Math.ceil(String(paymentMethod || '').length / 120))
    + Math.max(1, Math.ceil(String(paymentTerms || '').length / 140))
    + Math.max(1, Math.ceil(String(remarks || '').length / 140));
}

// V4: เงื่อนไขชำระ + หมายเหตุ + ลงชื่อ = กลุ่มเดียว แยกกันไม่ได้ และชิดล่างเอกสาร
// ถ้าท้ายหน้าสุดท้ายเหลือที่พอ → วางต่อจากมูลค่ารวมเลย (ไม่เปลืองหน้า)
// ถ้าไม่พอ → ยกไปทั้งกลุ่มเป็นหน้าของตัวเอง (มติผู้ใช้: ยอมให้กลุ่มอยู่หน้าเดียวได้)
// ทุกค่าคิดในหน่วย px-calibrated ชุดเดียวกับ paginateFilled
//
// 🐞 บั๊กที่ผู้ใช้แจ้ง (IS-26080009 · 2026-08-11): "ตารางงวดชำระในเอกสารทับหัวข้อ"
// กติกา "กลุ่มไม่แตก" เดิมไม่มีทางออกเมื่อกลุ่ม **สูงเกินหนึ่งหน้าเต็ม** (ใบที่หมายเหตุ
// ยาวหลายสิบบรรทัด) — โค้ดยังยัดลงหน้าเดียวแล้วปล่อยล้น ซึ่ง CSS `flex-end` ดันส่วนที่ล้น
// ขึ้นไปทับหัวเอกสาร ⇒ เอกสารที่ส่งลูกค้าอ่านไม่ออก · V1–V3 มีทางออกนี้อยู่แล้ว
// (separateAcceptancePage) แต่ V4 ตัดทิ้งตอนเปลี่ยนกติกา จึงเอากลับมาเฉพาะเคสที่ล้นจริง
function buildGroupedPages({
  linePages,
  installments,
  paymentMethod,
  paymentTerms,
  remarks,
  firstCapacity,
  continuationCapacity,
  totalsReserve,
}) {
  const groupUnits = v4GroupUnits({ installments, paymentMethod, paymentTerms, remarks });
  const lastIndex = linePages.length - 1;
  const lastCapacity = lastIndex === 0 ? firstCapacity : continuationCapacity;
  const lastFree = lastCapacity - totalsReserve - v4PageCost(linePages[lastIndex]);
  const groupFitsOnLastPage = groupUnits <= lastFree;

  const pages = linePages.map((pageLines, index) => ({
    id: `items-${index + 1}`,
    kind: index === lastIndex && groupFitsOnLastPage ? 'combined' : 'items',
    lines: pageLines,
    showParty: index === 0,
    showTotals: index === lastIndex,
    showPayment: index === lastIndex && groupFitsOnLastPage,
    showSignatures: index === lastIndex && groupFitsOnLastPage,
  }));

  if (!groupFitsOnLastPage) {
    // ผ่าเฉพาะตอนกลุ่มสูงเกินหนึ่งหน้าเต็ม — ที่เหลือยังอยู่หน้าเดียวตามมติเดิม
    const splitAcceptance = groupUnits > V4_GROUP_PAGE_CAPACITY;
    pages.push({
      id: 'payment',
      kind: 'payment',
      lines: [],
      showParty: false,
      showTotals: false,
      // กลุ่มไม่แตก — เงื่อนไขชำระและลงชื่ออยู่หน้าเดียวกันเสมอ ยกเว้นตอนล้นทั้งหน้า
      showPayment: true,
      showSignatures: !splitAcceptance,
    });

    if (splitAcceptance) {
      pages.push({
        id: 'acceptance',
        kind: 'acceptance',
        lines: [],
        showParty: false,
        showTotals: false,
        showPayment: false,
        showSignatures: true,
      });
    }
  }

  return pages;
}

function buildSemanticPages({
  linePages,
  lines,
  installments,
  paymentMethod,
  paymentTerms,
  remarks,
  discountAmount,
}) {
  const paymentUnits = paymentContentUnits({ installments, paymentMethod, paymentTerms, remarks });
  const canCombine = linePages.length === 1
    && lines.length === 1
    && installments.length === 1
    && discountAmount === 0
    && paymentUnits <= 7;

  const pages = linePages.map((pageLines, index) => ({
    id: `items-${index + 1}`,
    kind: canCombine ? 'combined' : 'items',
    lines: pageLines,
    showParty: index === 0,
    showTotals: index === linePages.length - 1,
    showPayment: canCombine,
    showSignatures: canCombine,
  }));

  if (canCombine) return pages;

  const separateAcceptancePage = paymentUnits > 14;
  pages.push({
    id: 'payment',
    kind: 'payment',
    lines: [],
    showParty: false,
    showTotals: false,
    showPayment: true,
    showSignatures: !separateAcceptancePage,
  });

  if (separateAcceptancePage) {
    pages.push({
      id: 'acceptance',
      kind: 'acceptance',
      lines: [],
      showParty: false,
      showTotals: false,
      showPayment: false,
      showSignatures: true,
    });
  }

  return pages;
}

function scenarioInput(id) {
  switch (id) {
    case 'compact':
      return { lines: [lineAt(0, { qty: 100, unitPrice: 185 })] };
    case 'dense':
      return {
        lines: Array.from({ length: 11 }, (_, index) => lineAt(index, {
          note: index % 2 === 0 ? 'รายละเอียดควบคุมการผลิต สี กลิ่น และบรรจุภัณฑ์ตามตัวอย่างที่ลูกค้าอนุมัติ' : '',
        })),
        remarks: 'ทุกรายการต้องยืนยันตัวอย่าง สี กลิ่น และ Artwork ก่อนเริ่มผลิตจริง',
      };
    case 'multipage':
      return {
        lines: Array.from({ length: 27 }, (_, index) => lineAt(index)),
        paymentTerms: 'แบ่งชำระตามงวดที่ระบุ และเริ่มนับระยะเวลาผลิตหลังได้รับมัดจำพร้อมยืนยัน Artwork ครบถ้วน',
      };
    case 'long-content':
      return {
        customer: {
          ...BASE_QUOTE.customer,
          name: 'บริษัท ตัวอย่างผลิตภัณฑ์ดูแลผิวและเครื่องหอมเพื่อความยั่งยืนแห่งประเทศไทย จำกัด',
          address: 'เลขที่ 999/99 อาคารศูนย์นวัตกรรมผลิตภัณฑ์ ชั้น 18 ถนนสุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร 10110',
        },
        lines: Array.from({ length: 6 }, (_, index) => lineAt(index, {
          description: `${PRODUCT_NAMES[index % PRODUCT_NAMES.length]} สูตรพิเศษสำหรับโครงการส่งเสริมผลิตภัณฑ์ที่เป็นมิตรต่อสิ่งแวดล้อม`,
        })),
        paymentTerms: 'ชำระมัดจำหลังยืนยันใบเสนอราคาและตัวอย่างกลิ่น จากนั้นชำระงวดผลิตเมื่ออนุมัติ Artwork และชำระยอดคงเหลือก่อนจัดส่ง โดยวันครบกำหนดอาจเลื่อนตามวันที่ได้รับข้อมูลที่ครบถ้วนจากลูกค้า',
        remarks: 'ราคาและระยะเวลาผลิตอ้างอิงจากข้อมูล ณ วันที่ออกใบเสนอราคา หากมีการเปลี่ยนสูตร ปริมาณ บรรจุภัณฑ์ Artwork จุดส่งมอบ หรือข้อกำหนดการทดสอบ บริษัทขอสงวนสิทธิ์ทบทวนราคาและกำหนดส่งใหม่ก่อนเริ่มงาน',
      };
    case 'installments':
      return {
        lines: Array.from({ length: 5 }, (_, index) => lineAt(index)),
        installments: [
          { label: 'มัดจำเริ่มโครงการ', percent: 30, trigger: 'ยืนยันใบเสนอราคา', dueRule: 'ภายใน 7 วัน', note: 'เริ่มงานหลังได้รับชำระ' },
          { label: 'อนุมัติตัวอย่าง', percent: 20, trigger: 'อนุมัติกลิ่นและสูตร', dueRule: 'ภายใน 7 วัน', note: '' },
          { label: 'เริ่มผลิต', percent: 30, trigger: 'อนุมัติ Artwork', dueRule: 'ก่อนสั่งผลิต', note: '' },
          { label: 'ส่งมอบ', percent: 20, trigger: 'สินค้าพร้อมส่ง', dueRule: 'ก่อนจัดส่ง', note: 'ชำระยอดคงเหลือทั้งหมด' },
        ],
      };
    case 'standard':
    default:
      return {
        // บรรทัดที่ 2 มีส่วนลดรายบรรทัด (%) บรรทัดที่ 3 เป็นส่วนลดจำนวนเงิน — พรีวิว
        // มาตรฐานต้องเห็นคอลัมน์ส่วนลดทำงานจริงทั้งสองแบบ
        lines: Array.from({ length: 4 }, (_, index) => lineAt(index, index === 1
          ? { discountType: 'percent', discountValue: 5 }
          : (index === 2 ? { discountType: 'amount', discountValue: 3000 } : {}))),
        discount: { type: 'amount', value: 10000 },
        installments: [
          { label: 'มัดจำ', percent: 50, trigger: 'ยืนยันใบเสนอราคา', dueRule: 'ภายใน 7 วัน', note: 'เริ่มงานหลังได้รับมัดจำ' },
          { label: 'ยอดคงเหลือ', percent: 50, trigger: 'สินค้าพร้อมส่ง', dueRule: 'ก่อนจัดส่ง', note: '' },
        ],
      };
  }
}

const PREVIEW_STATUS_LABELS = { draft: 'ฉบับร่าง', approved: 'อนุมัติแล้ว', cancelled: 'ยกเลิก' };

// แปลง model ตัวอย่างใบเสนอราคา → ใบสั่งขาย (FM-SA-03) สำหรับหน้า preview:
// ต่างที่ฟอร์ม/ชื่อ/ป้ายวันที่/แถวอ้างอิง/ผู้ลงนาม/accent (steel) — ข้อมูลลูกค้า+รายการใช้ร่วม
// standard = มาตรฐานใบสั่งขายที่ป้อนเข้ามา (ร่างที่กำลังแก้) ไม่ใช่ค่าตายตัวอีกต่อไป
function toSalesOrderPreviewModel(model, state, standard) {
  const qtNumber = model.document.number;
  return {
    ...model,
    accentKey: standard.accentKey,
    standard,
    formLine: controlledFormLine(standard),
    document: {
      ...model.document,
      number: previewDocumentNumber(standard),
      dateLabel: 'วันที่ SO',
      secondaryLabel: 'กำหนดชำระ',
    },
    // ⚠️ ต้องตรงกับ referenceRows ที่ salesOrderPrint.js ส่งเข้ามาตอนพิมพ์จริง —
    // นี่เป็นคนละเส้นทางกัน พรีวิวเคยหลุดไม่ตามใบจริงมาแล้วสองรอบ (คำเรียก + ลำดับ)
    referenceRows: [
      { label: 'อ้างอิง QT', value: qtNumber },
      { label: 'สถานะเอกสาร', value: PREVIEW_STATUS_LABELS[state] || state },
      { label: 'เลขที่โครงการ', value: BASE_QUOTE.references.projectCode },
      { label: 'โครงการ', value: BASE_QUOTE.references.dealTitle },
      { label: 'ประเภทโครงการ', value: BASE_QUOTE.references.dealType },
      // ⚠️ ใบสั่งขายจริงไม่มีแถว "โทร" (salesOrderPrint ไม่ได้ส่งมา) — อย่าเติมฝั่งพรีวิว
      // ฝั่งเดียว จะเพี้ยนกับใบจริงทันที
      { label: 'ผู้เสนอราคา', value: BASE_QUOTE.references.salesOwner },
    ],
    signers: [
      // ⚠️ ช่องลงนามของ SO เป็นชุดของตัวเอง — ป้ายช่องเป็นหน่วยงาน ไม่ใช่บทบาทในเอกสาร
      // (มติผู้ใช้ 2026-08-05) ห้ามลอกคำของใบเสนอราคามาใส่
      // ต้องตรงกับ signers ที่ salesOrderPrint.js ส่งตอนพิมพ์จริง
      { label: 'ฝ่ายขาย', role: 'AE เจ้าของดีล', name: model.references.salesOwner },
      { label: 'ผู้จัดการฝ่ายขาย', role: 'AE Supervisor', name: state === 'approved' ? (model.signature?.signerName || '') : '' },
      { label: 'ฝ่ายบัญชี', role: 'Scent & Sense' },
    ],
  };
}

// options.standard = แถวมาตรฐานเอกสาร (ร่างที่กำลังแก้หรือฉบับที่เผยแพร่) — ป้อนเข้ามา
// เพื่อให้พรีวิวสะท้อน "ค่าที่กำลังตั้ง" จริง ๆ ไม่ใช่ค่าตัวอย่างตายตัว; ไม่ส่ง = ใช้ค่าเดิม
export function buildQuotationMasterPreview(
  scenarioId = 'standard',
  state = 'approved',
  templateVariant = DEFAULT_QUOTATION_MASTER_VARIANT,
  docType = 'quotation',
  options = {},
) {
  const selectedTemplate = QUOTATION_MASTER_TEMPLATE_VERSIONS.find((item) => item.id === templateVariant)
    || QUOTATION_MASTER_TEMPLATE_VERSIONS.find((item) => item.id === DEFAULT_QUOTATION_MASTER_VARIANT);
  const scenario = scenarioInput(scenarioId);
  const lines = (scenario.lines || []).map((line) => ({ ...line }));
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0));
  const discount = { ...BASE_QUOTE.discount, ...(scenario.discount || {}) };
  const discountAmount = discount.type === 'percent'
    ? roundMoney(subtotal * (Number(discount.value || 0) / 100))
    : Math.min(subtotal, roundMoney(discount.value || 0));
  const afterDiscount = roundMoney(subtotal - discountAmount);
  const vatAmount = roundMoney(afterDiscount * (BASE_QUOTE.vatRate / 100));
  const totalAmount = roundMoney(afterDiscount + vatAmount);
  const installments = allocateInstallmentAmounts(totalAmount, scenario.installments || BASE_QUOTE.installments);
  const customer = { ...BASE_QUOTE.customer, ...(scenario.customer || {}) };
  const paymentMethod = scenario.paymentMethod || BASE_QUOTE.paymentMethod;
  const paymentTerms = scenario.paymentTerms || BASE_QUOTE.paymentTerms;
  const remarks = scenario.remarks || BASE_QUOTE.remarks;
  // V4 ใช้กติกาแบ่งหน้าคนละชุด (เติมเต็มหน้า + กลุ่มท้ายเอกสารไม่แตก) และคนละสเกล
  // หน่วย (px-calibrated) — ห้ามส่งความจุสเกล 14 ของ balanced เข้าโหมด fill
  // V1–V3 คงพฤติกรรมเดิมทุกประการ
  const isFilledLayout = selectedTemplate.id === 'v4';
  const firstCapacity = isFilledLayout ? v4FirstCapacity(customer) : firstPageCapacity(customer);
  const totalsReserve = v4TotalsReserve(discountAmount);
  const linePages = paginateQuotationMasterLines(lines, {
    firstCapacity,
    mode: isFilledLayout ? 'fill' : 'balanced',
    ...(isFilledLayout ? { totalsReserve } : {}),
  });
  const pages = isFilledLayout
    ? buildGroupedPages({
      linePages,
      installments,
      paymentMethod,
      paymentTerms,
      remarks,
      firstCapacity,
      continuationCapacity: V4_CONTINUATION_CAPACITY,
      totalsReserve,
    })
    : buildSemanticPages({
      linePages,
      lines,
      installments,
      paymentMethod,
      paymentTerms,
      remarks,
      discountAmount,
    });

  // มาตรฐานที่ป้อนเข้ามา (ร่างที่กำลังแก้) ทับค่าตัวอย่าง — พิมพ์รหัสแบบฟอร์มในหน้าตั้งค่า
  // แล้วต้องเห็นผลบนหัวเอกสารทันที ไม่งั้นพรีวิวกับสิ่งที่กำลังตั้งเป็นคนละเรื่อง
  const previewStandard = previewStandardOf(options.standard, docType);

  const model = {
    ...BASE_QUOTE,
    ...scenario,
    accentKey: previewStandard.accentKey,
    templateVariant: selectedTemplate.id,
    templateVersion: selectedTemplate.templateVersion,
    standard: previewStandard,
    company: { ...BASE_QUOTE.company },
    customer,
    dealTitle: BASE_QUOTE.references.dealTitle,
    references: { ...BASE_QUOTE.references },
    referenceRows: [
      { label: 'เลขที่โครงการ', value: BASE_QUOTE.references.projectCode },
      { label: 'โครงการ', value: BASE_QUOTE.references.dealTitle },
      { label: 'ประเภทโครงการ', value: BASE_QUOTE.references.dealType },
      { label: 'ผู้เสนอราคา', value: BASE_QUOTE.references.salesOwner },
      { label: 'โทร', value: BASE_QUOTE.references.salesOwnerPhone },
    ],
    document: {
      ...BASE_QUOTE.document,
      number: previewDocumentNumber(previewStandard),
      state,
      dateLabel: 'วันที่',
      dateValue: BASE_QUOTE.document.issueDate,
      secondaryLabel: 'ยืนราคาถึง',
      secondaryValue: BASE_QUOTE.document.validUntil,
    },
    discount,
    lines,
    paymentMethod,
    paymentTerms,
    remarks,
    linePages,
    pages,
    totals: { subtotal, discountAmount, afterDiscount, vatAmount, totalAmount },
    installments,
    signature: state === 'approved' ? { ...BASE_QUOTE.signature } : null,
    signers: [
      // ⚠️ ช่องแรกคือ "ผู้จัดทำ" ใช้ preparedBy ไม่ใช่ salesOwner — ต้องตรงกับ signers
      // ที่ buildQuotationMasterModel สร้างตอนพิมพ์จริง
      state === 'approved'
        ? { label: 'ผู้จัดทำ', role: 'พนักงานขาย', esignature: { imageDataUri: PREVIEW_SIGNATURE_IMAGE, signerName: BASE_QUOTE.references.preparedBy, signerRole: '' } }
        : { label: 'ผู้จัดทำ', role: 'พนักงานขาย', name: BASE_QUOTE.references.preparedBy },
      { label: 'ผู้อนุมัติเสนอราคา', role: 'Authorized signature', esignature: state === 'approved' ? { ...BASE_QUOTE.signature } : null },
      { label: 'ผู้ยืนยันคำสั่งซื้อ', role: 'ลูกค้า' },
    ],
    watermark: state === 'draft' ? 'ฉบับร่าง' : state === 'cancelled' ? 'ยกเลิก' : '',
    formLine: controlledFormLine(previewStandard),
  };
  return docType === 'salesOrder' ? toSalesOrderPreviewModel(model, state, previewStandard) : model;
}

// ── Phase 7C (Direction B): สร้าง "model แบบ V4" จาก quotation จริง ────────────
// ใช้ pagination V4 ชุดเดียวกับ preview (paginateQuotationMasterLines mode:'fill' +
// buildGroupedPages) แล้วป้อนให้ renderer เอกสาร (quotationMasterDocument.js) เพื่อให้
// ใบพิมพ์จริง + ฉบับตรึง snapshot ใช้หน้าตา/การจัดหน้าแบบ V4 เดียวกับที่เห็นใน preview.
// "รหัส · ชื่อ" — ตัวคั่นเดียวกับที่เอกสารใช้อยู่แล้ว (รหัส FG · แบรนด์ บนบรรทัดสินค้า)
// ขาดฝั่งไหนก็เหลือเท่าที่มี ไม่ทิ้งตัวคั่นลอย
// รูปแบบ "รหัส · ชื่อ" ย้ายไปเปลือกเอกสารกลางแล้ว — ใบภาษีกับไทม์ไลน์ใช้ตัวเดียวกัน

// โครงการผูกผ่านดีล (sales_deals.projectId → projects, FK mig 0064) — select ของ
// route ที่สร้างเอกสารต้อง join project:projects(code, name) มาให้
// 🐞 เดิมอ่าน quote.deal.project.name โดยไม่มี query ไหน join projects เข้ามาเลย
//    ⇒ แถว "โครงการ" บนใบเสนอราคาพิมพ์ '-' มาตลอด
// เอกสารแยก รหัสโครงการ / ชื่อโครงการ / ชื่อดีล / ประเภทดีล คนละแถว (มติผู้ใช้ 2026-08-05)
// — ของเดิมยุบเป็น "รหัส · ชื่อ" แถวเดียว อ่านง่ายบนจอแต่ค้นหา/กระทบยอดกับระบบอื่นยาก
const projectOf = (quote) => quote?.deal?.project || quote?.project || null;
export const quotationProjectCode = (quote) => String(projectOf(quote)?.code || '').trim() || '-';
export const quotationDealTitle = (quote) =>
  String(quote?.deal?.title || quote?.dealTitle || '').trim() || '-';
// ไม่มีดีลจริง (snapshot เก่าที่เหลือแต่ชื่อ) → ห้ามเดาประเภทให้
export const quotationDealType = (quote) => (quote?.deal ? dealTypeOf(quote.deal) || '-' : '-');

// อัตราส่วนลดท้ายใบที่พิมพ์บนกระดาษ ("หัก ส่วนลด X%") — % ตัดที่ 100 ให้ตรงกับยอดที่หัก
// จริง (discountAmountOf clamp ไว้เหมือนกัน) ฝั่งบันทึกก็ clamp แล้ว (normalizeDiscountValue)
// แต่ใบเก่าที่บันทึกค่าเกินไว้ก่อนหน้านั้นยังมีอยู่ใน DB จึงต้องกันตอนแสดงด้วย
// (ส่วนลดรายบรรทัดพิมพ์ยอดเงินอย่างเดียว ไม่ผ่านทางนี้)
const printedDiscountValue = (type, value) =>
  (type === 'percent' ? Math.min(Number(value || 0), 100) : Number(value || 0));

export function buildQuotationMasterModelFromQuote(quote, options = {}) {
  const form = options.form || DOCUMENT_FORMS.quotation;
  /* ภาษาของใบนี้ (mig 0238) — ตรึงอยู่กับตัวใบ ไม่ใช่ค่าที่คนกดเลือกตอนพิมพ์
     ใบสั่งขายเดินผ่านฟังก์ชันนี้ด้วย (salesOrderPrint) แต่ไม่มีคอลัมน์นี้ ⇒ ได้ 'th'
     เหมือนเดิมทุกใบ */
  const language = docLanguageOf(options.docLanguage ?? quote.docLanguage);
  const L = quotationDocLabels(language);
  const lines = (Array.isArray(quote.lines) ? quote.lines : [])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((line) => ({
      id: line.id,
      fgCode: line.fgCode || '',
      brand: line.metadata?.productBrand || line.brand || '',
      /* ชื่อสินค้าตามภาษาของใบ แล้วค่อยตกไปอีกภาษา (มติผู้ใช้ 2026-08-20)
         ⚠️ ตกกลับไปที่ `line.description` เสมอเมื่อไม่มีคู่ภาษาในบรรทัด — บรรทัดที่
         พิมพ์เอง (ไม่ผูก FG) และใบเก่าก่อนกติกานี้ไม่มี metadata ⇒ ต้องพิมพ์ของเดิม
         ไม่ใช่ช่องว่าง */
      description: (language === 'en'
        ? line.metadata?.descriptionEn
        : line.metadata?.descriptionTh) || line.description || '',
      note: line.metadata?.note || line.note || '',
      qty: Number(line.qty || 0),
      // หน่วยแปลตามภาษาใบ (IS-26080025) — ต่างจากข้อความที่คนกรอกตรงที่มันมาจากลิสต์ปิด
      // ของ lib/master/units.js จึงแปลได้โดยไม่ต้องให้ใครกรอกเพิ่ม · ค่าที่ไม่อยู่ในลิสต์
      // (ของเก่า/คนพิมพ์เอง) พิมพ์ตามเดิม ไม่เดาคำแปล
      unit: saleUnitLabel(line.unit || DEFAULT_SALE_UNIT, language),
      unitPrice: Number(line.unitPrice || 0),
      // ส่วนลดรายบรรทัดต้องไปถึงเอกสาร: lineTotal ที่พิมพ์คือยอด "หลังหักส่วนลดแล้ว"
      // (quoteLineNet) ถ้าไม่โชว์ส่วนลด ลูกค้าคูณ ราคา/หน่วย × จำนวน แล้วไม่ตรงกับ
      // จำนวนเงิน — เอกสารดูเหมือนคำนวณผิด (มติผู้ใช้ 2026-08-11)
      // เอกสารพิมพ์เฉพาะ "ยอดเงินที่หัก" — ชนิด/อัตราส่วนลดไม่ขึ้นกระดาษ จึงไม่ส่งต่อ
      discountAmount: Number(line.discountAmount || 0),
      lineTotal: Number(line.lineTotal || 0),
    }));

  const paymentPlan = quote.paymentPlan || {};
  const installments = paymentScheduleRows(paymentPlan)
    .map((row) => ({
      // ใบที่ไม่ได้แบ่งงวด: paymentScheduleRows สังเคราะห์แถว "ชำระเต็มจำนวน" ให้เอง
      // เป็นป้ายของระบบ ไม่ใช่ข้อความที่คนกรอก จึงแปลตามภาษาของใบ (ชื่องวดที่คนตั้งเอง
      // ในโหมดแบ่งงวดยังพิมพ์ตามที่พิมพ์ไว้)
      label: paymentPlan.type === 'installment' ? (row.label || '') : L.t('fullPayment'),
      note: row.note || '',
      percent: Number(row.percent || 0),
      amount: paymentPlan.type === 'installment'
        ? Number(row.amount || 0)
        : Number(quote.totalAmount || 0),
    }));

  const customer = {
    name: quote.customerName || '-',
    address: quote.billingAddress || '-',
    shippingAddress: quote.shippingAddress || quote.billingAddress || '-',
    taxId: quote.customerTaxId || '-',
    branch: quotationBranchText(quote.branchCode, L),
    contactName: quote.contactName || '-',
    contactPhone: quote.contactPhone || '-',
  };

  const subtotal = Number(quote.subtotal || 0);
  const discountAmount = Number(quote.discountAmount || 0);
  const totals = {
    subtotal,
    discountAmount,
    afterDiscount: subtotal - discountAmount,
    vatAmount: Number(quote.vatAmount || 0),
    totalAmount: Number(quote.totalAmount || 0),
  };

  const paymentMethod = paymentPlan.paymentMethod || '-';
  const paymentTerms = quote.paymentTerms || '-';
  const remarks = quote.notes || '-';
  // เอกสารอ้างอิงที่คนทำใบพิมพ์เอง (mig 0267) — ว่าง = ตัดแถวทิ้ง ไม่โชว์ '-'
  const referenceNote = String(quote.referenceNote || '').trim();
  // ⚠️ เดิม "ผู้เสนอราคา" = คนที่สร้างใบ ซึ่งผิดเมื่อคนทำใบไม่ใช่ AE เจ้าของดีล
  // (มติผู้ใช้ 2026-08-05): ผู้เสนอราคา = AE เจ้าของดีล — เอกสารไม่มีบทบาท "ผู้จัดทำ" แล้ว
  const salesOwner = quote.deal?.ownerName || quote.metadata?.salesOwner || '-';
  // ผู้จัดทำ = **คนที่กดยื่นอนุมัติ** (มติผู้ใช้ 2026-08-17) — การกดยื่นคือจุดที่ผู้จัดทำ
  // ลงนาม (mig 0155/0156 เขียน approvalRequestedByName ให้ตอนนั้น) ไม่ใช่คนที่กดสร้างร่าง:
  // ร่างเปิดค้างได้ทั้งทีม (submit gate = inSalesEditScope) คนสร้างกับคนยื่นจึงคนละคนได้
  // ⚠️ ห้ามถอยไป metadata.preparedBy — ช่องนั้นคือ "ผู้ประสานงาน (AC)" คนละบทบาทกัน
  // (เคยเป็นค่าสำรองที่นี่ แล้วชื่อ AC ไปยืนช่องเซ็นผู้จัดทำแทนคนที่ทำจริง)
  // createdByName เหลือไว้รองรับใบก่อน mig 0156 ที่ไม่มีขั้นยื่นเท่านั้น
  const preparedBy = quote.approvalRequestedByName || quote.createdByName || '';
  // คนทำใบ = AE เจ้าของดีลหรือเปล่า — เทียบ id ก่อนเพราะชื่อซ้ำกันได้; ฉบับตรึง/ใบเก่าที่
  // ไม่มี id ครบค่อยถอยไปเทียบชื่อ (สองค่านั้นมาจาก snapshot ชุดเดียวกัน จึงเทียบกันได้)
  // ⚠️ ตัวนี้ถามถึง **ผู้สร้างร่าง** ไม่ใช่ผู้จัดทำบนเอกสาร — มันคุมว่าจะเอา
  // `createdByPhone` (เบอร์ผู้สร้าง) มาโชว์คู่ "ผู้เสนอราคา" ได้ไหม จึงต้องเทียบกับ
  // createdBy/createdByName เสมอ ห้ามใช้ตัวแปร preparedBy ที่ตอนนี้เป็นชื่อผู้ยื่น
  const preparerIsSalesOwner = quote.createdBy && quote.deal?.ownerId
    ? quote.createdBy === quote.deal.ownerId
    : Boolean(quote.createdByName) && quote.createdByName === salesOwner;
  /* เบอร์ที่โชว์คู่กับ "ผู้เสนอราคา" ต้องเป็นเบอร์ของเจ้าของดีล (= ผู้อนุมัติใบ)
     1. เบอร์ที่ตรึงไว้ตอนออกใบ — ใช้ได้เมื่อ id ที่ตรึงคู่มายังตรงกับเจ้าของดีลปัจจุบัน
        (ชื่อผู้เสนอราคาอ่านสดจากดีล เปลี่ยนมือแล้วชื่อขยับแต่เบอร์ที่ตรึงไว้ไม่ขยับ)
     2. ใบที่ออกก่อนเริ่มตรึง — ถอยไปใช้เบอร์คนทำใบ เฉพาะตอนคนทำใบเป็นเจ้าของดีลเอง
     3. นอกนั้นไม่มีเบอร์ให้แสดง ตัดแถวทิ้ง ดีกว่าให้ลูกค้าโทรไปเจอคนที่ไม่ใช่ชื่อบนใบ */
  const pinnedOwnerPhone = quote.metadata?.salesOwnerPhone || '';
  const pinnedOwnerId = quote.metadata?.salesOwnerId || '';
  const dealOwnerId = quote.deal?.ownerId || '';
  const salesOwnerPhone = pinnedOwnerPhone && (!pinnedOwnerId || !dealOwnerId || pinnedOwnerId === dealOwnerId)
    ? pinnedOwnerPhone
    : ((preparerIsSalesOwner && quote.createdByPhone) || '');

  const firstCapacity = v4FirstCapacity(customer);
  const totalsReserve = v4TotalsReserve(discountAmount);
  const linePages = paginateQuotationMasterLines(lines, { firstCapacity, mode: 'fill', totalsReserve });
  const pages = buildGroupedPages({
    linePages,
    installments,
    paymentMethod,
    paymentTerms,
    remarks,
    firstCapacity,
    continuationCapacity: V4_CONTINUATION_CAPACITY,
    totalsReserve,
  });

  // ลายน้ำ: ฉบับร่าง = ยังไม่ยื่น (not_submitted, mig 0155) หรือยื่นแล้วรออนุมัติ (pending)
  // หรือ override ผ่าน options (เช่น "ยกเลิก"); อนุมัติแล้วไม่มีลายน้ำ
  const preApproval = ['not_submitted', 'pending'].includes(quote.approvalStatus);
  const watermark = options.watermark || (preApproval ? L.t('draft') : '');
  // ผู้อนุมัติ: แสดงบล็อกลายเซ็นเมื่อมีชื่อผู้อนุมัติจริง (ไม่ใช่ฉบับร่าง)
  const signature = !preApproval && quote.approvedByName
    ? {
      signerName: quote.approvedByName,
      signerRole: quote.approvedByRole || L.t('approver'),
      signedAt: quote.approvedAt ? fmtDate(quote.approvedAt) : '',
      evidenceId: quote.signatureEvidenceId || '',
      // รูปลายเซ็นจริงของผู้อนุมัติ (ดึงจาก signature evidence ตอนตรึง snapshot ฝั่ง server)
      // ไม่มี → signBox หล่นไปแสดงกล่องข้อความ "ลายเซ็นอิเล็กทรอนิกส์" แทน
      imageDataUri: options.approverSignatureImage || null,
    }
    : null;

  // บล็อกบริษัท: ใช้ข้อมูลที่เผยแพร่ (options.company) ถ้ามี — ไม่งั้น fallback constants
  const company = resolveCompanyBlock(options.company);

  return {
    templateVariant: 'v4',
    templateVersion: QUOTATION_MASTER_TEMPLATE_VERSION,
    accentKey: options.accentKey || 'terracotta',
    // ภาษาที่เรนเดอร์ต้องใช้ — ส่งไปกับ model ไม่ให้ฝั่งเรนเดอร์ต้องไปอ่าน quote เอง
    docLanguage: language,
    company: {
      nameTh: company.legalNameTh,
      nameEn: company.legalNameEn,
      address: company.address,
      // ที่อยู่จดทะเบียนภาษาอังกฤษ (organization_settings.registeredAddressEn, mig 0120)
      // ยังไม่ได้กรอก → ใบอังกฤษถอยไปใช้ที่อยู่ไทย ดีกว่าเว้นที่อยู่บริษัทว่างบนเอกสาร
      addressEn: company.addressEn || '',
      taxId: company.taxId,
      phone: company.phone,
      line: company.line,
      website: company.website,
    },
    standard: { titleTh: options.documentTitleTh || 'ใบเสนอราคา', titleEn: form.title },
    formLine: documentFormLine(form),
    document: {
      number: options.documentNumber || quote.quoteNumber || '-',
      dateLabel: options.dateLabel || L.t('issueDate'),
      dateValue: options.dateValue !== undefined ? options.dateValue : (quote.quoteDate ? fmtDate(quote.quoteDate) : '-'),
      secondaryLabel: options.secondaryLabel || L.t('validUntil'),
      secondaryValue: options.secondaryValue !== undefined ? options.secondaryValue : (quote.validUntil ? fmtDate(quote.validUntil) : '-'),
    },
    customer,
    // ชื่อดีลไว้ประกอบชื่อไฟล์ตอนบันทึก PDF (รหัสเอกสาร_ชื่อลูกค้า_ชื่อดีล) — เก็บเป็น
    // field ของตัวเอง ไม่ให้ฝั่งเรนเดอร์ต้องไปงมเอาจาก referenceRows ซึ่งเป็นข้อมูลสำหรับ
    // "แสดงผล" และลำดับ/คำเปลี่ยนได้ตลอด
    dealTitle: options.dealTitle !== undefined ? options.dealTitle : quotationDealTitle(quote),
    // referenceRows/signers ต่างกันตามชนิดเอกสาร — ผู้เรียก (เช่น SO) ส่ง options มา override ได้
    referenceRows: options.referenceRows || [
      // "โครงการ" บนเอกสาร = ดีล (มติผู้ใช้ 2026-08-05) — ลูกค้ามองงานที่สั่งเป็นโครงการ
      // ของตัวเอง ไม่ได้แยกชั้นโครงการแม่/ดีลแบบที่ฝ่ายขายใช้ · เลขที่โครงการยังเป็นรหัส
      // PJ ของโครงการแม่ ซึ่งเป็นเลขที่ที่อ้างอิงกันจริงทั้งสองฝั่ง
      { label: L.t('projectCode'), value: quotationProjectCode(quote) },
      { label: L.t('project'), value: quotationDealTitle(quote) },
      { label: L.t('projectType'), value: quotationDealType(quote) },
      { label: L.t('salesOwner'), value: salesOwner },
      ...(salesOwnerPhone ? [{ label: L.t('phone'), value: salesOwnerPhone }] : []),
      // เอกสารอ้างอิง (มติผู้ใช้ 2026-08-17) — ข้อความอิสระที่คนทำใบพิมพ์เอง เช่น
      // "อ้างถึง PO-1234 ลว. 5 ส.ค. 69" · ไม่กรอก = ไม่มีแถวนี้ ไม่ใช่แถวว่าง
      ...(referenceNote ? [{ label: L.t('referenceNote'), value: referenceNote }] : []),
    ],
    signers: options.signers || [
      // ช่องแรก = "ผู้จัดทำ" คนที่ลงมือทำใบนี้จริง (มติผู้ใช้ 2026-08-05) — คนละคนกับ
      // "ผู้เสนอราคา" ในบล็อกอ้างอิงซึ่งเป็น AE เจ้าของดีลได้ ห้ามเอา salesOwner มาเป็น
      // ค่าสำรองของช่องนี้ เพราะจะกลายเป็นชื่อคนที่ไม่ได้ทำใบไปยืนคู่ลายเซ็น
      // ⚠️ มีหลักฐานการลงนามเมื่อไร ใช้ชื่อ "คนที่เซ็นจริง" (evidence.signerName) มาก่อน
      // ใบที่ยื่นตั้งแต่ mig 0155 มีหลักฐานการลงนาม →
      // โชว์วันที่ + Evidence เหมือนช่องผู้อนุมัติ (options.proposerEvidence);
      // ใบเก่าที่ไม่มีหลักฐาน = stamp เชิงภาพ → signBox ข้าม 2 บรรทัดนั้นให้เอง;
      // ไม่มีรูปเลย → ช่องเซ็นเปล่าเดิม
      options.proposerSignatureImage
        ? {
          label: L.t('preparedBy'),
          role: L.t('preparedByRole'),
          esignature: {
            imageDataUri: options.proposerSignatureImage,
            signerName: options.proposerEvidence?.signerName || preparedBy,
            signerRole: '',
            signedAt: options.proposerEvidence?.signedAt ? fmtDate(options.proposerEvidence.signedAt) : '',
            evidenceId: options.proposerEvidence?.id || '',
          },
        }
        : { label: L.t('preparedBy'), role: L.t('preparedByRole'), name: preparedBy },
      // "Authorized signature" เป็นอังกฤษอยู่แล้วทั้งสองภาษา — คำที่ใช้กันบนเอกสารการค้า
      { label: L.t('approvedBy'), role: 'Authorized signature', esignature: signature },
      { label: L.t('confirmedBy'), role: L.t('confirmedByRole') },
    ],
    lines,
    totals,
    discount: {
      type: quote.discountType || 'amount',
      value: printedDiscountValue(quote.discountType, quote.discountValue),
    },
    vatRate: Number(quote.vatRate || 0),
    installments,
    paymentMethod,
    paymentTerms,
    remarks,
    signature,
    watermark,
    linePages,
    pages,
  };
}
