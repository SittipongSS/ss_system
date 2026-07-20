export const QUOTATION_MASTER_TEMPLATE_VERSIONS = Object.freeze([
  { id: 'v1', label: 'V1', templateVersion: 'quotation-balanced-controlled-v1' },
  { id: 'v2', label: 'V2', templateVersion: 'quotation-balanced-controlled-v2' },
  { id: 'v3', label: 'V3', templateVersion: 'quotation-balanced-controlled-v3' },
]);
export const DEFAULT_QUOTATION_MASTER_VARIANT = 'v3';
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

export function paginateQuotationMasterLines(lines = [], options = {}) {
  if (!Array.isArray(lines) || lines.length === 0) return [[]];

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
  const linePages = paginateQuotationMasterLines(lines, {
    firstCapacity: firstPageCapacity(customer),
  });
  const pages = buildSemanticPages({
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
