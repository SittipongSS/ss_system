import { fmtDate } from '@/lib/format';
import {
  COMPANY_ADDRESS,
  COMPANY_LEGAL_NAME,
  COMPANY_LINE,
  COMPANY_OFFICE_TEL,
  COMPANY_TAX_ID,
  COMPANY_WEBSITE,
  DOCUMENT_FORMS,
  documentFormLine,
} from '@/lib/documentBrand';

// ชื่อบริษัทภาษาอังกฤษ — documentBrand เก็บเฉพาะชื่อไทย จึงตั้งไว้ที่นี่ให้เอกสาร V4 ใช้
const COMPANY_LEGAL_NAME_EN = 'SCENT AND SENSE LABORATORY CO., LTD.';

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
  accentKey: 'quotation-warm',
});

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
    deal: 'ผลิตภัณฑ์น้ำหอมปรับอากาศ · 2026',
    project: 'PJ-26070038 · Signature Bloom',
    salesOwner: 'กานติมา ธาดาธารกิจ',
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
  return {
    id: `preview-line-${index + 1}`,
    fgCode: overrides.fgCode ?? `FG-PV-${String(index + 1).padStart(3, '0')}`,
    description: overrides.description ?? PRODUCT_NAMES[index % PRODUCT_NAMES.length],
    note: overrides.note ?? (index % 5 === 0 ? 'กลิ่น Signature Bloom · บรรจุตามมาตรฐานที่ตกลง' : ''),
    qty,
    unit: overrides.unit ?? (index % 4 === 3 ? 'งาน' : 'ชิ้น'),
    unitPrice,
    lineTotal: roundMoney(qty * unitPrice),
  };
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function controlledFormLine(standard = DEFAULT_STANDARD) {
  return `${standard.formCode}: Rev. No.${standard.revision}. ${standard.effectiveDate}`;
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

function rowUnits(line) {
  const copy = `${line.fgCode || ''} ${line.description || ''}`.trim();
  const note = line.note || '';
  return Math.max(1, Math.ceil(copy.length / 48)) + (note ? Math.max(1, Math.ceil(note.length / 54)) : 0);
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

// ── V4: โมเดลความสูงที่ calibrate จากการวัด DOM จริง (2026-07-20) ─────────────
// วัดที่ /settings/document-standards/quotation-preview สเกล 1123px = A4 297mm:
// พื้นที่เนื้อหาใต้หัวเอกสาร 888px · แถวสินค้า 1 บรรทัด 50px · บรรทัดข้อความเพิ่ม
// +17px · party grid 134px (ที่อยู่ยาว 167) · หัวตาราง 32 · ป้าย "ต่อ" 15 ·
// มูลค่ารวม 87 · ตารางงวด 27+25/งวด · กล่องเงื่อนไข ~118-175 · ลงชื่อ 145
//
// 1 หน่วย = 1 บรรทัดข้อความ = 17px — โมเดลเดิม (rowUnits ตรง ๆ + ความจุ 14)
// เหมาว่าทุกหน่วยสูงเท่าแถวเต็ม 50px จึงตัดหน้าเร็วเกินจริงเกือบเท่าตัว
// (บั๊กที่ผู้ใช้เห็น: "ไม่เต็มหน้าก็ตัดแล้ว") ต้องแยกต้นทุนฐานแถวออกจากบรรทัด
const V4_PAGE_UNITS = 52; // 888px / 17
const V4_ROW_BASE = 2; // padding+เส้นตารางต่อแถว ~33px
const V4_THEAD = 2;
const V4_PARTY = 8; // 134px
const V4_BANNER = 1; // ป้าย "รายการต่อ" 15px
const V4_TOTALS = 6; // 87px + ระยะห่าง
const V4_SAFETY = 2; // กันประเมินความยาวข้อความพลาด — ห้ามล้นเพราะ overflow:hidden ตัดเงียบ
const V4_SIGNATURES = 9; // 145px + ระยะห่าง
const V4_TERMS_BASE = 6; // หัวข้อ+padding กล่องเงื่อนไข 3 กล่อง
const V4_INSTALLMENT_BASE = 3; // หัวข้อ+หัวตารางงวด
const V4_INSTALLMENT_ROW = 2; // 25px/งวด

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
  const methodLines = Math.max(1, Math.ceil(String(paymentMethod || '').length / 55));
  const termsLines = Math.max(1, Math.ceil(String(paymentTerms || '').length / 65));
  const remarksLines = Math.max(1, Math.ceil(String(remarks || '').length / 140));
  return (installments.length ? V4_INSTALLMENT_BASE + V4_INSTALLMENT_ROW * installments.length : 0)
    + V4_TERMS_BASE + Math.max(methodLines, termsLines) + remarksLines
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
    pages.push({
      id: 'payment',
      kind: 'payment',
      lines: [],
      showParty: false,
      showTotals: false,
      // กลุ่มไม่แตก — เงื่อนไขชำระและลงชื่ออยู่หน้าเดียวกันเสมอ
      showPayment: true,
      showSignatures: true,
    });
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
        lines: Array.from({ length: 4 }, (_, index) => lineAt(index)),
        discount: { type: 'amount', value: 10000 },
        installments: [
          { label: 'มัดจำ', percent: 50, trigger: 'ยืนยันใบเสนอราคา', dueRule: 'ภายใน 7 วัน', note: 'เริ่มงานหลังได้รับมัดจำ' },
          { label: 'ยอดคงเหลือ', percent: 50, trigger: 'สินค้าพร้อมส่ง', dueRule: 'ก่อนจัดส่ง', note: '' },
        ],
      };
  }
}

export function buildQuotationMasterPreview(
  scenarioId = 'standard',
  state = 'approved',
  templateVariant = DEFAULT_QUOTATION_MASTER_VARIANT,
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
  const linePages = paginateQuotationMasterLines(lines, {
    firstCapacity,
    mode: isFilledLayout ? 'fill' : 'balanced',
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
      totalsReserve: V4_TOTALS,
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

  return {
    ...BASE_QUOTE,
    ...scenario,
    templateVariant: selectedTemplate.id,
    templateVersion: selectedTemplate.templateVersion,
    standard: { ...BASE_QUOTE.standard },
    company: { ...BASE_QUOTE.company },
    customer,
    references: { ...BASE_QUOTE.references },
    document: { ...BASE_QUOTE.document, state },
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
    watermark: state === 'draft' ? 'ฉบับร่าง' : state === 'cancelled' ? 'ยกเลิก' : '',
    formLine: controlledFormLine(BASE_QUOTE.standard),
  };
}

// ── Phase 7C (Direction B): สร้าง "model แบบ V4" จาก quotation จริง ────────────
// ใช้ pagination V4 ชุดเดียวกับ preview (paginateQuotationMasterLines mode:'fill' +
// buildGroupedPages) แล้วป้อนให้ renderer เอกสาร (quotationMasterDocument.js) เพื่อให้
// ใบพิมพ์จริง + ฉบับตรึง snapshot ใช้หน้าตา/การจัดหน้าแบบ V4 เดียวกับที่เห็นใน preview.
export function buildQuotationMasterModelFromQuote(quote, options = {}) {
  const form = options.form || DOCUMENT_FORMS.quotation;
  const lines = (Array.isArray(quote.lines) ? quote.lines : [])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((line) => ({
      id: line.id,
      fgCode: line.fgCode || '',
      description: line.description || '',
      note: line.metadata?.note || line.note || '',
      qty: Number(line.qty || 0),
      unit: line.unit || '',
      unitPrice: Number(line.unitPrice || 0),
      lineTotal: Number(line.lineTotal || 0),
    }));

  const paymentPlan = quote.paymentPlan || {};
  const installments = paymentPlan.type === 'installment' && Array.isArray(paymentPlan.installments) && paymentPlan.installments.length
    ? paymentPlan.installments.map((row) => ({
      label: row.label || '',
      note: row.note || '',
      trigger: row.trigger || '-',
      dueRule: row.dueRule || '-',
      percent: Number(row.percent || 0),
      amount: Number(row.amount || 0),
    }))
    : [{ label: 'ชำระเต็มจำนวน', note: '', trigger: '-', dueRule: '-', percent: 100, amount: Number(quote.totalAmount || 0) }];

  const customer = {
    name: quote.customerName || '-',
    address: quote.billingAddress || '-',
    shippingAddress: quote.shippingAddress || quote.billingAddress || '-',
    taxId: quote.customerTaxId || '-',
    branch: quote.branchCode ? `สาขา ${quote.branchCode}` : 'สำนักงานใหญ่',
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
  const salesOwner = quote.createdByName || quote.metadata?.preparedBy || '-';

  const firstCapacity = v4FirstCapacity(customer);
  const linePages = paginateQuotationMasterLines(lines, { firstCapacity, mode: 'fill' });
  const pages = buildGroupedPages({
    linePages,
    installments,
    paymentMethod,
    paymentTerms,
    remarks,
    firstCapacity,
    continuationCapacity: V4_CONTINUATION_CAPACITY,
    totalsReserve: V4_TOTALS,
  });

  // ลายน้ำ: ฉบับร่าง (pending) หรือ override ผ่าน options (เช่น "ยกเลิก"); อนุมัติแล้วไม่มี
  const watermark = options.watermark
    || (quote.approvalStatus === 'pending' ? 'ฉบับร่าง' : '');
  // ผู้อนุมัติ: แสดงบล็อกลายเซ็นเมื่อมีชื่อผู้อนุมัติจริง (ไม่ใช่ฉบับร่าง)
  const signature = quote.approvalStatus !== 'pending' && quote.approvedByName
    ? {
      signerName: quote.approvedByName,
      signerRole: quote.approvedByRole || 'ผู้อนุมัติ',
      signedAt: quote.approvedAt ? fmtDate(quote.approvedAt) : '',
      evidenceId: quote.signatureEvidenceId || '',
    }
    : null;

  return {
    templateVariant: 'v4',
    templateVersion: QUOTATION_MASTER_TEMPLATE_VERSION,
    company: {
      nameTh: COMPANY_LEGAL_NAME,
      nameEn: COMPANY_LEGAL_NAME_EN,
      address: COMPANY_ADDRESS,
      taxId: COMPANY_TAX_ID,
      phone: COMPANY_OFFICE_TEL,
      line: COMPANY_LINE,
      website: COMPANY_WEBSITE,
    },
    standard: { titleTh: options.documentTitleTh || 'ใบเสนอราคา', titleEn: form.title },
    formLine: documentFormLine(form),
    document: {
      number: options.documentNumber || quote.quoteNumber || '-',
      issueDate: quote.quoteDate ? fmtDate(quote.quoteDate) : '-',
      validUntil: quote.validUntil ? fmtDate(quote.validUntil) : '-',
    },
    customer,
    references: {
      deal: quote.deal?.title || quote.dealTitle || '-',
      project: quote.project?.name || quote.projectName || '-',
      salesOwner,
      salesOwnerPhone: quote.createdByPhone || '',
    },
    lines,
    totals,
    discount: { type: quote.discountType || 'amount', value: Number(quote.discountValue || 0) },
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
