import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCT_SPEC_RENDERER_VERSION, PRODUCT_SPEC_WATERMARKS,
  applyProductSpecWatermark, planProductSpecPaper, productSizeText, productSpecDateText, productSpecRevText,
  productSpecSignedSteps, productSpecWatermark, renderProductSpecDocument, supersededWatermark,
} from './productSpecDocument.js';
import { productSpecPageBudgets } from './productSpecLayout.js';
import { productSpecCertSeed, productSpecChecklistSeed } from './productSpecChecklist.js';
import { resolveCompanyBlock } from '@/lib/companyProfile';

/* 🪤 **บล็อกบริษัทรูปจริง** — `getPublishedCompanyProfile` คืนผลของ `resolveCompanyBlock`
   ซึ่งมีแค่ `legalNameTh`/`legalNameEn` ไม่มี `nameTh` · ชุดเดิมใส่ `nameTh` มาด้วยเลยบัง
   บั๊กที่หัวกระดาษพิมพ์ชื่อบริษัทเป็น "-" ไว้ทั้งชุด */
const company = resolveCompanyBlock({
  legalNameTh: 'บริษัท ทดสอบกระดาษ จำกัด',
  legalNameEn: 'PAPER TEST CO., LTD.',
  address: 'เลขที่ 000 กรุงเทพมหานคร',
  taxId: '0000000000000',
});

const snapshotOf = (over = {}) => ({
  schemaVersion: 1,
  capturedAt: '2026-09-17T03:00:00.000Z',
  spec: {
    texture: 'เหลว',
    standardPackaging: 'บรรจุขวดแก้วหัวสเปรย์',
    targetGroup: 'ผู้หญิงวัยเริ่มต้นทำงาน',
    keySellingPoint: null,
    pricingTier: null,
    productBenefit: null,
    longevity: null,
    dosagePerUse: null,
    certifications: productSpecCertSeed([{ key: 'fda', status: 'ready', note: 'เลข 10-1-68' }]),
  },
  /* ใบเต็มตามแบบฟอร์ม (ไม่ส่ง previousItems = ครบทุกแถว) แล้วกรอกค่าลงสองแถว
     ⚠️ ห้ามสร้างด้วย `productSpecChecklistSeed([สองแถว])` — ตั้งแต่มติ 21/09 ที่ 17 แถว
        ลบได้ การส่ง previousItems คือ "ยกมาเท่าที่ฉบับก่อนมี" ⇒ จะได้ใบสองแถว */
  items: productSpecChecklistSeed().map((row) => {
    if (row.itemKey === 'raw_material') return { ...row, detail: 'น้ำหอม', preparedByS: true };
    if (row.itemKey === 'card') return { ...row, preparedByCustomer: true };
    return row;
  }),
  product: {
    id: 'P-1',
    productDescription: 'Eau de Tea Valley 50 ml',
    fgCode: 'FG-0903-01-002-10043',
    brandName: 'Artepole',
    customerName: 'ลูกค้าในทะเบียนสินค้า',
    categoryName: 'BODY PERFUME · น้ำหอมสำหรับผิวกาย',
    scentText: null,
    volumeText: '50 ML',
  },
  order: {
    salesOrderId: 'SOR-1',
    salesOrderLineId: 'SOL-1',
    orderNumber: 'SO-26090176-0',
    quotationNumber: 'QT-26090271-0',
    confirmDocType: null,
    confirmDocNo: null,
    confirmDocDate: null,
    qty: 1500,
    unit: 'ขวด',
    lineDescription: null,
    deliveryDueDate: '2026-10-30',
    customerName: 'บริษัท อาเตโพเล่ จำกัด',
    docLanguage: 'th',
    dealOwnerId: 'U-AE',
    dealOwnerName: 'สิทธิพงศ์ เจ้าของดีล',
    dealOwnerEmail: 'owner@example.com',
    dealOwnerPhone: '0613879399',
  },
  // ก้อนลูกค้าของภาพนิ่ง v2 — ทั้งสองภาษาดิบ (ตัวพิมพ์เลือกภาษาเอง)
  customer: {
    name: 'บริษัท อาเตโพเล่ จำกัด',
    nameEn: 'ARTEPOLE CO., LTD.',
    taxId: '0105561234567',
    branchCode: '',
    billingAddress: '88/8 ถนนสาทรใต้ แขวงยานนาวา เขตสาทร กรุงเทพมหานคร 10120',
    billingAddressEn: '88/8 South Sathorn Rd., Yannawa, Sathorn, Bangkok 10120',
    shippingAddress: null,
    shippingAddressEn: null,
    contactName: 'คุณเบลล์',
    contactPhone: '0844326199',
  },
  illustrations: [],
  ...over,
});

// ใบอังกฤษ = ภาพนิ่งเดิมที่ SO เลือกภาษาอังกฤษ
const englishSnapshot = (over = {}) => {
  const snapshot = snapshotOf(over);
  snapshot.order = { ...snapshot.order, docLanguage: 'en' };
  return snapshot;
};

const revisionOf = (over = {}) => ({
  id: 'PSDR-1',
  revNo: 2,
  status: 'approved',
  submittedByName: 'ชลิตา เอซี',
  submittedAt: '2026-09-17T03:00:00.000Z',
  aeApprovedByName: 'สิทธิพงศ์ เจ้าของดีล',
  aeApprovedAt: '2026-09-18T03:00:00.000Z',
  supApprovedByName: 'พัชราภิชญ์ ซุปเปอร์ไวเซอร์',
  // 🪤 ตี 1 เวลาไทยของวันที่ 20 = 18:00 UTC ของวันที่ 19 — ต้องพิมพ์ 20/09/2569
  supApprovedAt: '2026-09-19T18:00:00.000Z',
  ...over,
});

const baseInput = (over = {}) => ({
  snapshot: snapshotOf(),
  document: { id: 'PSD-1', docNo: 'FM-SA-04-170969-004', status: 'active' },
  revision: revisionOf(),
  watermark: null,
  company,
  standard: null,
  toolbar: false,
  ...over,
});

const sheetCount = (html) => (html.match(/class="sheet /g) || []).length;
const headings = (html) => (html.match(/<h3[^>]*>[^<]*<\/h3>/g) || []).map((h) => h.replace(/<\/?h3[^>]*>/g, ''));
// ช่องลงนามทั้งแถว (`signatureSection` ของเปลือก — กล่องชุดเดียวกับ QT/SO)
const signatureRow = (html) => html.slice(html.indexOf('<section class="signatures"'));
const signatureBoxes = (html) => signatureRow(html).split(/<div class="(?:signed)?">/).slice(1);
// หัวข้อไม่รวมเลขข้อ ("4. Checklist Project (ต่อ)" ⇒ "Checklist Project (ต่อ)")
const bareHeadings = (html) => headings(html).map((h) => h.replace(/^\d+\. /, ''));
const headerRows = (html) => html.slice(html.indexOf('class="identityBlock"'), html.indexOf('</header>'));
const partyBox = (html) => html.slice(html.indexOf('class="partyGrid"'), html.indexOf('</section>'));
const referenceBox = (html) => {
  const box = partyBox(html);
  return box.slice(box.lastIndexOf('<h2>'));
};

test('ใช้เปลือกเอกสารกลาง — ได้ .sheet · หัวเอกสาร · ท้ายกระดาษ ชุดเดียวกับใบเสนอราคา', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /class="documentHeader"/);
  assert.match(html, /class="partyGrid"/);
  assert.match(html, /class="footer"/);
  assert.match(html, /class="sheetContent"/);
  assert.ok(sheetCount(html) >= 1);
});

test('🐞 หัวกระดาษพิมพ์ชื่อบริษัทจากบล็อกรูปจริง (legalNameTh) — ไม่ใช่ "-"', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /<strong>บริษัท ทดสอบกระดาษ จำกัด<\/strong>/);
  assert.doesNotMatch(html, /<div>\s*<strong>-<\/strong>/);
  // ท้ายกระดาษก็ใช้ชื่อเดียวกัน
  assert.match(html, /<footer class="footer">\s*<span>บริษัท ทดสอบกระดาษ จำกัด<\/span>/);
});

test('🪤 สามเลขบนกระดาษอยู่ครบและไม่สลับกัน — "เลขที่" = DDMMYY-XXX-RR (RR = Rev ของเอกสาร)', () => {
  const html = renderProductSpecDocument(baseInput());
  // เวอร์ชันของ **แบบฟอร์ม** (ค่าสำรองเมื่อยังไม่มีมาตรฐานเผยแพร่)
  assert.match(html, /FM-SA-04: Rev\. No\.00\. 08\/05\/2568/);
  // ⭐ มติผู้ใช้ 2026-09-22: ป้ายแบบใบเสนอราคา + เลขที่รูปใหม่ (ตัดรหัสแบบฟอร์ม · Rev สองหลักท้าย)
  assert.match(headerRows(html), /<dt>เลขที่<\/dt><dd>170969-004-02<\/dd>/);
  assert.doesNotMatch(html, /Document No\.|Reversion No\.|Doc No\./, 'ป้ายชุดเก่าต้องไม่เหลือ');
  assert.doesNotMatch(headerRows(html), /FM-SA-04-170969-004/, 'หัวต้องไม่พิมพ์เลขที่ดิบในฐาน');
});

test('⭐ ชื่อเอกสารภาษาเดียวตามภาษาของใบ — ไทย "รายละเอียดผลิตภัณฑ์" · อังกฤษ "PRODUCT SPEC" (ค่าสำรอง)', () => {
  const th = renderProductSpecDocument(baseInput({ standard: null }));
  assert.match(th, /<h1>รายละเอียดผลิตภัณฑ์<\/h1>/);
  assert.doesNotMatch(th, /PRODUCT SPEC|Product Spec/, 'ใบไทยต้องไม่มีชื่ออังกฤษซ้อน');
  const en = renderProductSpecDocument(baseInput({ standard: null, snapshot: englishSnapshot() }));
  assert.match(en, /<h1>PRODUCT SPEC<\/h1>/);
  assert.doesNotMatch(en.slice(en.indexOf('<header'), en.indexOf('</header>')), /รายละเอียดผลิตภัณฑ์/);
});

test('ชื่อเอกสารตามมาตรฐานที่เผยแพร่ (titleTh/titleEn) ชนะค่าสำรอง', () => {
  const standard = { formCode: 'FM-SA-04', revision: '00', effectiveDate: '2025-05-08', titleTh: 'สเปคผลิตภัณฑ์', titleEn: 'SPEC SHEET' };
  assert.match(renderProductSpecDocument(baseInput({ standard })), /<h1>สเปคผลิตภัณฑ์<\/h1>/);
  assert.match(renderProductSpecDocument(baseInput({ standard, snapshot: englishSnapshot() })), /<h1>SPEC SHEET<\/h1>/);
});

test('⭐ หัวกระดาษใช้ป้ายของใบเสนอราคา — ไทย "เลขที่/วันที่" · อังกฤษ "No./Date" (สองแถวเท่านั้น)', () => {
  const th = headerRows(renderProductSpecDocument(baseInput()));
  assert.deepEqual([...th.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1]), ['เลขที่', 'วันที่']);
  const en = headerRows(renderProductSpecDocument(baseInput({ snapshot: englishSnapshot() })));
  assert.deepEqual([...en.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1]), ['No.', 'Date']);
  assert.match(en, /<dt>No\.<\/dt><dd>170969-004-02<\/dd>/);
});

test('แบบฟอร์มที่เผยแพร่คุมบรรทัดแบบฟอร์ม — คนละเลขกับ Rev ของเอกสาร', () => {
  const html = renderProductSpecDocument(baseInput({
    standard: { formCode: 'FM-SA-04', revision: '01', effectiveDate: '2026-01-15', accentKey: 'teal' },
    revision: revisionOf({ revNo: 0 }),
  }));
  assert.match(html, /FM-SA-04: Rev\. No\.01\./);
  assert.match(headerRows(html), /<dt>เลขที่<\/dt><dd>170969-004-00<\/dd>/);
});

const sampleInput = () => baseInput({
  document: null,
  revision: null,
  snapshot: snapshotOf({
    order: Object.fromEntries(Object.keys(snapshotOf().order).map((key) => [key, null])),
    customer: {
      name: 'ลูกค้าในทะเบียนสินค้า', nameEn: null, taxId: null, branchCode: null, billingAddress: null,
      billingAddressEn: null, shippingAddress: null, shippingAddressEn: null, contactName: null, contactPhone: null,
    },
  }),
  watermark: productSpecWatermark({ sample: true }),
});

test('ตัวอย่างจากหน้าสินค้า — เลขที่เป็นขีด · ใบไทย · ลายน้ำ "ตัวอย่าง" · สาขาเป็นขีด (ไม่เดาว่าสำนักงานใหญ่)', () => {
  const html = renderProductSpecDocument(sampleInput());
  assert.match(headerRows(html), /<dt>เลขที่<\/dt><dd>-<\/dd>/);
  assert.doesNotMatch(html, /\d{6}-\d{3}-\d{2}|FM-SA-04-\d{6}/, 'ตัวอย่างต้องไม่มีเลขที่เอกสาร');
  assert.match(html, /class="watermark">ตัวอย่าง</);
  assert.match(html, /<h1>รายละเอียดผลิตภัณฑ์<\/h1>/, 'ไม่มี SO = ใบไทย');
  // ไม่มี SO = ไม่มีเจ้าของดีล · ลูกค้าถอยไปชื่อในทะเบียนสินค้า
  assert.match(html, /ลูกค้าในทะเบียนสินค้า/);
  assert.match(partyBox(html), /<dt>สาขา<\/dt><dd>-<\/dd>/);
  assert.match(referenceBox(html), /<dt>ผู้ติดต่อฝ่ายขาย<\/dt><dd>-<\/dd>/);
});

test('วันที่บนใบไทยเป็น พ.ศ. ทั้งใบ และเป็นวันไทย (ไม่ใช่วันแบบ UTC)', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(headerRows(html), /<dt>วันที่<\/dt><dd>17\/09\/2569<\/dd>/);
  assert.match(html, /กำหนดส่งสินค้า<\/dt><dd>30\/10\/2569</);
  assert.match(html, /20\/09\/2569/, 'อนุมัติตี 1 เวลาไทยต้องเป็นวันที่ 20');
  assert.doesNotMatch(html, /\/2026</, 'ห้ามมีปี ค.ศ. หลุดบนกระดาษ');
});

test('⭐ วันที่บนใบอังกฤษเป็น ค.ศ. ทั้งใบ (หัว · กำหนดส่ง · ลายเซ็น)', () => {
  const html = renderProductSpecDocument(baseInput({ snapshot: englishSnapshot() }));
  assert.match(headerRows(html), /<dt>Date<\/dt><dd>17\/09\/2026<\/dd>/);
  assert.match(html, /Delivery Due<\/dt><dd>30\/10\/2026</);
  assert.match(signatureRow(html), /20\/09\/2026/);
  assert.doesNotMatch(html, /\/2569</, 'ใบอังกฤษต้องไม่มีปี พ.ศ.');
});

test('ตัวจัดวันที่ — ไทย พ.ศ. / อังกฤษ ค.ศ. · วันในปฏิทินไม่ขยับ · จุดเวลาเป็นวันไทย · ว่าง = null', () => {
  assert.equal(productSpecDateText('2026-10-30'), '30/10/2569');
  assert.equal(productSpecDateText('2026-10-30', 'en'), '30/10/2026');
  assert.equal(productSpecDateText('2026-09-19T18:00:00.000Z'), '20/09/2569');
  assert.equal(productSpecDateText('2026-09-19T18:00:00.000Z', 'en'), '20/09/2026');
  assert.equal(productSpecDateText(new Date('2026-01-01T00:00:00.000Z')), '01/01/2569');
  assert.equal(productSpecDateText(null), null);
  assert.equal(productSpecDateText(''), null);
  assert.equal(productSpecDateText('ไม่ใช่วันที่'), null);
});

test('Rev บนหัวกระดาษ — สองหลัก · ไม่มี = null', () => {
  assert.equal(productSpecRevText(0), '00');
  assert.equal(productSpecRevText(12), '12');
  assert.equal(productSpecRevText(null), null);
  assert.equal(productSpecRevText(undefined), null);
});

test('⭐ กล่องอ้างอิง "ข้อมูลอ้างอิง / REFERENCE" — ใบเสนอราคากับใบสั่งขาย **แยกแถว** · กำหนดส่ง · ฝ่ายขาย (ไม่มีจำนวน)', () => {
  const html = renderProductSpecDocument(baseInput());
  const ref = referenceBox(html);
  assert.match(ref, /<h2>ข้อมูลอ้างอิง <span>\/ REFERENCE<\/span><\/h2>/);
  // ⭐ ไม่มีแถว "จำนวน" แล้ว — ย้ายไป Product Overview เป็น "จำนวนผลิต (Quantity)" (มติ 22/09 · ไม่พิมพ์ซ้ำสองที่)
  assert.deepEqual([...ref.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1]), [
    'ใบเสนอราคา', 'ใบสั่งขาย', 'กำหนดส่งสินค้า', 'ผู้ติดต่อฝ่ายขาย', 'โทร', 'อีเมล',
  ]);
  assert.match(ref, /<dt>ใบเสนอราคา<\/dt><dd>QT-26090271-0<\/dd>/);
  assert.match(ref, /<dt>ใบสั่งขาย<\/dt><dd>SO-26090176-0<\/dd>/);
  assert.doesNotMatch(html, /QT-26090271-0 \/ SO-26090176-0/, 'สองเลขที่ต้องไม่อยู่แถวเดียวกันแล้ว');
  assert.doesNotMatch(ref, /1,500/, 'จำนวนต้องไม่อยู่ในกล่องอ้างอิงอีก');
});

test('⭐ ผู้ติดต่อฝ่ายขาย = AE เจ้าของดีลจากภาพนิ่ง ย้ายขึ้นกล่องอ้างอิง (ชื่อ · โทรจัดรูป · อีเมล) · ส่วน Contact for Sales หายไป', () => {
  const html = renderProductSpecDocument(baseInput());
  const ref = referenceBox(html);
  assert.match(ref, /<dt>ผู้ติดต่อฝ่ายขาย<\/dt><dd>สิทธิพงศ์ เจ้าของดีล<\/dd>/);
  assert.match(ref, /<dt>โทร<\/dt><dd>061-387-9399<\/dd>/, 'เบอร์ผ่าน fmtPhone แบบใบเสนอราคา');
  assert.match(ref, /<dt>อีเมล<\/dt><dd>owner@example\.com<\/dd>/);
  assert.doesNotMatch(html, /Contact for Sales|class="kv contact"/, 'ส่วนท้ายเดิมต้องไม่เหลือ');
});

test('PO/เอกสารยืนยันของ SO ขึ้นเป็นแถวของตัวเอง (เลขที่ · วันที่) เฉพาะเมื่อมี', () => {
  const withPo = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ order: { ...snapshotOf().order, confirmDocType: 'po', confirmDocNo: 'PO-7788', confirmDocDate: '2026-09-10' } }),
  }));
  assert.match(referenceBox(withPo), /<dt>เลขที่ PO<\/dt><dd>PO-7788 · 10\/09\/2569<\/dd>/);
  const confirm = renderProductSpecDocument(baseInput({
    snapshot: englishSnapshot({ order: { ...snapshotOf().order, confirmDocType: 'order_confirmation', confirmDocNo: 'OC-1', confirmDocDate: null } }),
  }));
  assert.match(referenceBox(confirm), /<dt>Order Confirmation<\/dt><dd>OC-1<\/dd>/);
  assert.doesNotMatch(referenceBox(renderProductSpecDocument(baseInput())), /เลขที่ PO|เอกสารยืนยัน/);
});

test('⭐ กล่อง "ผู้ซื้อ / CUSTOMER" แถวเดียวกับใบเสนอราคา — ที่อยู่เอกสาร · เลขผู้เสียภาษี · สาขา · ที่อยู่จัดส่ง · ผู้ติดต่อ', () => {
  const box = partyBox(renderProductSpecDocument(baseInput()));
  assert.match(box, /<h2>ผู้ซื้อ <span>\/ CUSTOMER<\/span><\/h2>/);
  assert.match(box, /<strong>บริษัท อาเตโพเล่ จำกัด<\/strong>/);
  assert.match(box, /<p>88\/8 ถนนสาทรใต้ แขวงยานนาวา เขตสาทร กรุงเทพมหานคร 10120<\/p>/);
  const party = box.slice(0, box.lastIndexOf('<h2>'));
  assert.deepEqual([...party.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1]), ['เลขผู้เสียภาษี', 'สาขา', 'ที่อยู่จัดส่ง', 'ผู้ติดต่อ']);
  assert.match(party, /<dt>เลขผู้เสียภาษี<\/dt><dd>0105561234567<\/dd>/);
  // สาขาว่างของใบเสนอราคา = สำนักงานใหญ่ = เลข 00000 (quotationBranchText ตัวเดียวกับใบเสนอราคา)
  assert.match(party, /<dt>สาขา<\/dt><dd>00000<\/dd>/);
  // ไม่มีที่อยู่จัดส่งของตัวเอง = ส่งตามที่อยู่เอกสาร
  assert.match(party, /<dt>ที่อยู่จัดส่ง<\/dt><dd>88\/8 ถนนสาทรใต้/);
  assert.match(party, /<dt>ผู้ติดต่อ<\/dt><dd>คุณเบลล์ · 084-432-6199<\/dd>/);
  assert.doesNotMatch(party, /ชื่อแบรนด์/, 'แบรนด์ย้ายไป Product Overview แล้ว');
});

test('⭐ ใบอังกฤษ: ชื่อ/ที่อยู่ลูกค้าอังกฤษก่อน ถอยไทยเมื่อว่าง · หัวกล่อง CUSTOMER / REFERENCE บรรทัดเดียว', () => {
  const html = renderProductSpecDocument(baseInput({ snapshot: englishSnapshot() }));
  const box = partyBox(html);
  assert.match(box, /<h2>CUSTOMER<\/h2>/);
  assert.match(box, /<h2>REFERENCE<\/h2>/);
  assert.match(box, /<strong>ARTEPOLE CO\., LTD\.<\/strong>/);
  assert.match(box, /<p>88\/8 South Sathorn Rd\./);
  assert.match(box, /<dt>Tax ID<\/dt>.*<dt>Branch<\/dt>.*<dt>Shipping Address<\/dt>.*<dt>Contact<\/dt>/s);
  assert.match(box, /<dt>Quotation No\.<\/dt>.*<dt>Sales Order No\.<\/dt>.*<dt>Sales Contact<\/dt>/s);
  assert.doesNotMatch(box, /1,500/, 'จำนวนย้ายไป Product Overview แล้ว');
  assert.match(html, /<th>จำนวนผลิต \(Quantity\)<\/th><td>1,500 Bottle<\/td>/, 'หน่วยแปลจากลิสต์ปิดแบบใบเสนอราคา');
  // ไม่มีคู่อังกฤษ ⇒ ถอยไทย ไม่ใช่ขีด
  const thaiOnly = englishSnapshot();
  thaiOnly.customer = { ...thaiOnly.customer, nameEn: null, billingAddressEn: null };
  const fallback = partyBox(renderProductSpecDocument(baseInput({ snapshot: thaiOnly })));
  assert.match(fallback, /<strong>บริษัท อาเตโพเล่ จำกัด<\/strong>/);
  assert.match(fallback, /<p>88\/8 ถนนสาทรใต้/);
});

test('🪤 ภาพนิ่ง v1 (ก่อน 22/09) ไม่มีก้อน customer / docLanguage — พิมพ์ได้: ใบไทย · ชื่อลูกค้าจาก order · ช่องอื่นเป็นขีด', () => {
  const snapshot = snapshotOf({ schemaVersion: 1 });
  delete snapshot.customer;
  delete snapshot.order.docLanguage;
  delete snapshot.order.confirmDocType;
  const html = renderProductSpecDocument(baseInput({ snapshot }));
  assert.match(html, /<h1>รายละเอียดผลิตภัณฑ์<\/h1>/);
  const party = partyBox(html);
  assert.match(party, /<strong>บริษัท อาเตโพเล่ จำกัด<\/strong>/);
  assert.match(party, /<dt>เลขผู้เสียภาษี<\/dt><dd>-<\/dd>/);
  assert.match(party, /<dt>สาขา<\/dt><dd>-<\/dd>/);
  assert.match(party, /<dt>ผู้ติดต่อ<\/dt><dd>-<\/dd>/);
});

test('⭐ Product Overview: "ปริมาตรบรรจุ (Size)" จากทะเบียน FG · "จำนวนผลิต (Quantity)" จาก SO/QT ในภาพนิ่ง', () => {
  const overviewOf = (html) => html.slice(html.indexOf('1. Product Overview'), html.indexOf('2. Market Positioning'));
  const rowsOf = (html) => [...overviewOf(html).matchAll(/<tr><th>([^<]*)<\/th><td>(.*?)<\/td><\/tr>/g)].map((m) => [m[1], m[2]]);
  // ภาพนิ่งมีปริมาตร + หน่วยของสินค้า ⇒ ตัวเลขจัดหลักพัน · หน่วยตามทะเบียน
  const withVolume = snapshotOf({ product: { ...snapshotOf().product, volume: 1200, volumeUnit: 'ml', volumeText: '1200 ml' } });
  const rows = rowsOf(renderProductSpecDocument(baseInput({ snapshot: withVolume })));
  assert.deepEqual(rows.map(([label]) => label), [
    'ชื่อผลิตภัณฑ์', 'ชื่อแบรนด์', 'รหัสสินค้า', 'ประเภทผลิตภัณฑ์', 'กลิ่น / รหัสกลิ่น',
    'ปริมาตรบรรจุ (Size)', 'จำนวนผลิต (Quantity)', 'ลักษณะเนื้อสาร', 'บรรจุภัณฑ์มาตรฐาน',
  ]);
  assert.deepEqual(rows.find(([label]) => label === 'ปริมาตรบรรจุ (Size)'), ['ปริมาตรบรรจุ (Size)', '1,200 ml']);
  assert.deepEqual(rows.find(([label]) => label === 'จำนวนผลิต (Quantity)'), ['จำนวนผลิต (Quantity)', '1,500 ขวด']);
  // ภาพนิ่งรุ่นเก่าที่มีแต่ volumeText ยังพิมพ์ได้ · ตัวอย่าง (ไม่มี SO) = จำนวน N/A
  assert.match(overviewOf(renderProductSpecDocument(baseInput())), /<th>ปริมาตรบรรจุ \(Size\)<\/th><td>50 ML<\/td>/);
  assert.match(overviewOf(renderProductSpecDocument(sampleInput())), /<th>จำนวนผลิต \(Quantity\)<\/th><td><span class="na">N\/A<\/span><\/td>/);
  assert.doesNotMatch(renderProductSpecDocument(baseInput()), /ขนาดบรรจุ \(Size\)/, 'ป้ายเดิมต้องไม่เหลือ');
});

test('ตัวจัดปริมาตรบรรจุ — ปริมาตร + หน่วยจากทะเบียน · ทศนิยมไม่ปัดทิ้ง · ไม่มีปริมาตร = volumeText เดิม · ว่าง = null', () => {
  assert.equal(productSizeText({ volume: 50, volumeUnit: 'ml' }), '50 ml');
  assert.equal(productSizeText({ volume: 1200, volumeUnit: 'g' }), '1,200 g');
  assert.equal(productSizeText({ volume: 0.25, volumeUnit: 'kg' }), '0.25 kg');
  assert.equal(productSizeText({ volume: '30', volumeUnit: null }), '30');
  assert.equal(productSizeText({ volume: null, volumeText: '50 ML' }), '50 ML');
  assert.equal(productSizeText({}), null);
});

/* 🐞 ตรวจรอบสาม: ใบอังกฤษพิมพ์ "6 ขวด" — ลิสต์หน่วยบรรจุมีคำไทย (ของจริงบนฐาน: 4 สินค้า 'ขวด' · 48 สินค้า 'package')
   ⇒ แปลตามภาษาของใบผ่าน volumeUnitLabel ชุดกลาง · ใบไทยคงคำในทะเบียน · สัญลักษณ์สากลแปลเป็นตัวเอง */
test('⭐ ปริมาตรบรรจุใบอังกฤษแปลหน่วย (ขวด → Bottle · package → Package) · ใบไทยคงคำในทะเบียน', () => {
  assert.equal(productSizeText({ volume: 6, volumeUnit: 'ขวด' }, 'en'), '6 Bottle');
  assert.equal(productSizeText({ volume: 1, volumeUnit: 'package' }, 'en'), '1 Package');
  assert.equal(productSizeText({ volume: 50, volumeUnit: 'ml' }, 'en'), '50 ml');
  assert.equal(productSizeText({ volume: 6, volumeUnit: 'ขวด' }, 'th'), '6 ขวด');
  assert.equal(productSizeText({ volume: 6, volumeUnit: 'ขวด' }), '6 ขวด', 'ไม่ระบุภาษา = ไทย');
  // ทั้งแผ่น: ใบอังกฤษไม่มีคำไทยในแถวปริมาตร · แถวจำนวนแปลอยู่แล้ว (สองแถวติดกันต้องภาษาเดียวกัน)
  const product = { ...snapshotOf().product, volume: 6, volumeUnit: 'ขวด', volumeText: '6 ขวด' };
  const en = renderProductSpecDocument(baseInput({ snapshot: englishSnapshot({ product }) }));
  assert.match(en, /<th>ปริมาตรบรรจุ \(Size\)<\/th><td>6 Bottle<\/td>/);
  assert.match(en, /<th>จำนวนผลิต \(Quantity\)<\/th><td>1,500 Bottle<\/td>/);
  const th = renderProductSpecDocument(baseInput({ snapshot: snapshotOf({ product }) }));
  assert.match(th, /<th>ปริมาตรบรรจุ \(Size\)<\/th><td>6 ขวด<\/td>/);
});

test('แบรนด์อยู่ใน Product Overview (ย้ายจากกล่องลูกค้า)', () => {
  const html = renderProductSpecDocument(baseInput());
  const overview = html.slice(html.indexOf('1. Product Overview'), html.indexOf('2. Market Positioning'));
  assert.match(overview, /<th>ชื่อแบรนด์<\/th><td>Artepole<\/td>/);
});

/* ── ช่องลงนาม (มติผู้ใช้ 2026-09-22 "final review ต้องปรับให้เหมือน QT และ SO" · "ชื่อ ตำแหน่ง ขอเป็นชื่อเต็ม") ── */

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('⭐ ช่องลงนามคือกล่องชุดเดียวกับ QT/SO — สี่ช่องตามลำดับ · ป้ายหน่วยงาน · ตำแหน่งเต็ม · ชื่อ · วันที่ของ Rev', () => {
  const html = renderProductSpecDocument(baseInput());
  // สี่คอลัมน์ผ่าน --sig-cols ของเปลือก (ตัวแปรเดียวใช้ได้ทุกจำนวนช่อง — กฎ data-columns เดิมรู้จักแค่ 4)
  assert.match(signatureRow(html), /^<section class="signatures" style="--sig-cols: 4" aria-label="ส่วนลงนาม">/);
  /* 🐞 ตรวจรอบสาม: ชื่อที่ไม่มีจุดตัด (อีเมลสำรอง) เคยถ่างช่องตัวเองจนช่องอื่นตกหลายบรรทัด — ก้อนลายเซ็นสูงเกินที่จอง 30mm
     ⇒ FM-SA-04 บังคับช่องเท่ากัน (ที่ signaturesMm คิด) + ชื่อตัดในช่อง · ไม่แก้ที่เปลือก (QT/SO จองแถวตามแบบถ่างช่อง) */
  assert.match(html, /\.specsheet \.signatures \{ grid-template-columns: repeat\(var\(--sig-cols\), minmax\(0, 1fr\)\);/);
  assert.match(html, /\.specsheet \.signatures strong \{ overflow-wrap: anywhere; \}/);
  assert.doesNotMatch(html, /class="sigs?"|class="sigSpace"/, 'กล่อง .sig ชุดเดิมของ FM-SA-04 ต้องไม่เหลือ');
  const boxes = signatureBoxes(html);
  assert.equal(boxes.length, 4);
  const heads = boxes.map((box) => box.match(/<h2>([^<]*)(?: <span>([^<]*)<\/span>)?<\/h2>/).slice(1, 3));
  assert.deepEqual(heads, [
    ['ผู้ประสานงานฝ่ายขาย', 'Account Coordinator'],
    ['ฝ่ายขาย', 'Account Executive'],
    ['ผู้จัดการฝ่ายขาย', 'Account Executive Supervisor'],
    ['ลูกค้า', 'Customer'],
  ]);
  // สามขั้นที่เซ็นแล้ว = กล่องลายเซ็น (ไม่ส่งรูป = "ลายเซ็นอิเล็กทรอนิกส์" แบบ QT/SO) + ชื่อ + วันที่ของขั้นนั้น
  assert.deepEqual(boxes.slice(0, 3).map((box) => [box.match(/<strong>([^<]*)<\/strong>/)[1], box.match(/<p>([^<]*)<\/p>/)[1]]), [
    ['ชลิตา เอซี', '17/09/2569'],
    ['สิทธิพงศ์ เจ้าของดีล', '18/09/2569'],
    ['พัชราภิชญ์ ซุปเปอร์ไวเซอร์', '20/09/2569'],
  ]);
  boxes.slice(0, 3).forEach((box) => assert.match(box, /class="signaturePreview"[^>]*>ลายเซ็นอิเล็กทรอนิกส์</));
  // ลูกค้า = ช่องเซ็นมือว่างเสมอ
  assert.match(boxes[3], /class="signatureSpace">ลงชื่อ<[\s\S]*<strong>\(_+\)<\/strong>[\s\S]*<p>วันที่ _+ \/ _+ \/ _+<\/p>/);
  assert.doesNotMatch(signatureRow(html), /\bAE\b/, 'ห้ามคำย่อตำแหน่งบนกระดาษ ("AE" · "AE Supervisor")');
});

test('⭐ ขั้นที่เซ็นแล้วได้รูปลายเซ็นจริง · ตำแหน่ง = ตำแหน่งเต็มของคนที่เซ็นจริง (admin กดแทน = Administrator)', () => {
  const html = renderProductSpecDocument(baseInput({
    signatures: {
      submit: { imageDataUri: PNG, role: 'ac' },
      ae: { imageDataUri: PNG, role: 'admin' },
      sup: { imageDataUri: null, role: 'ae_supervisor' },
    },
  }));
  const boxes = signatureBoxes(html);
  assert.equal((signatureRow(html).match(/<img class="signatureImage" src="data:image\/png;base64,/g) || []).length, 2);
  assert.match(boxes[0], /alt="ลายเซ็น ชลิตา เอซี"/);
  assert.match(boxes[1], /<h2>ฝ่ายขาย <span>Administrator<\/span><\/h2>/, 'admin อนุมัติแทน AE ⇒ ตำแหน่งของคนที่เซ็น ไม่ใช่ของช่อง');
  // คนที่ยังไม่อัปโหลดลายเซ็น = กล่อง "ลายเซ็นอิเล็กทรอนิกส์" + ชื่อ + วันที่ (แบบ QT/SO)
  assert.match(boxes[2], /class="signaturePreview"[\s\S]*<strong>พัชราภิชญ์ ซุปเปอร์ไวเซอร์<\/strong>[\s\S]*<p>20\/09\/2569<\/p>/);
  // role ที่ไม่รู้จัก = ตำแหน่งของช่อง (ไม่พิมพ์โค้ดดิบ)
  const unknown = signatureBoxes(renderProductSpecDocument(baseInput({ signatures: { submit: { role: 'viewer' } } })));
  assert.match(unknown[0], /<span>Account Coordinator<\/span>/);
});

test('ขั้นที่เซ็นแล้ว (มีวันที่ประทับ) + ผู้เซ็น — ฝั่ง server โหลดรูปลายเซ็นตามรายการนี้', () => {
  assert.deepEqual(productSpecSignedSteps({
    submittedAt: '2026-09-17', submittedBy: 'U-AC', aeApprovedAt: '2026-09-18', aeApprovedBy: 'U-AE', supApprovedAt: null, supApprovedBy: null,
  }), [{ key: 'submit', userId: 'U-AC' }, { key: 'ae', userId: 'U-AE' }]);
  assert.deepEqual(productSpecSignedSteps({ status: 'draft' }), []);
  assert.deepEqual(productSpecSignedSteps(null), []);
});

test('ร่าง/ตัวอย่าง — ทุกช่องเป็นช่องเซ็นมือ "ลงชื่อ" + (____) + วันที่ว่าง ไม่มีชื่อคนเปิด · ขั้นที่ยังไม่ถึงไม่เดาชื่อ', () => {
  const draft = renderProductSpecDocument(baseInput({
    revision: {
      id: 'PSDR-2', revNo: 0, status: 'draft', submittedByName: null, aeApprovedByName: null, supApprovedByName: null,
    },
    signatures: { submit: { imageDataUri: PNG, role: 'ac' } },
  }));
  const boxes = signatureBoxes(draft);
  assert.equal(boxes.length, 4);
  for (const box of boxes) {
    assert.match(box, /class="signatureSpace">ลงชื่อ</);
    assert.match(box, /<strong>\(_{28}\)<\/strong>/);
  }
  assert.doesNotMatch(signatureRow(draft), /ชลิตา|พัชราภิชญ์|<img class="signatureImage"/, 'ร่างไม่มีตราประทับ = ไม่มีรูปแม้ส่งมา');
  // รอ AE Sup: ขั้น 1–2 เซ็นแล้ว · ขั้น 3 ยังว่าง (ไม่เดาชื่อผู้อนุมัติ)
  const pending = signatureBoxes(renderProductSpecDocument(baseInput({
    revision: revisionOf({ status: 'pending_ae_supervisor', supApprovedByName: null, supApprovedAt: null }),
    watermark: PRODUCT_SPEC_WATERMARKS.draft,
  })));
  assert.deepEqual(pending.map((box) => /class="signatureSpace"/.test(box)), [false, false, true, true]);
  const sample = renderProductSpecDocument(sampleInput());
  assert.equal((signatureRow(sample).match(/class="signatureSpace"/g) || []).length, 4);
});

test('⭐ ใบอังกฤษ: ป้ายช่องอังกฤษ · ตำแหน่งอังกฤษเต็มชุดเดียวกัน · ช่องลูกค้าไม่ซ้ำคำ · วันที่ ค.ศ.', () => {
  const html = renderProductSpecDocument(baseInput({ snapshot: englishSnapshot() }));
  const heads = signatureBoxes(html).map((box) => box.match(/<h2>([^<]*)(?: <span>([^<]*)<\/span>)?<\/h2>/).slice(1, 3));
  /* 🐞 ตรวจรอบสาม: ช่องลูกค้าใบอังกฤษเคยไม่มีบรรทัดตำแหน่ง ⇒ "Signature / Date" ลอยสูงกว่าอีกสามช่องหนึ่งบรรทัด
     ทุกช่องต้องมีหัวสองบรรทัด (ป้าย + ตำแหน่ง) · ไม่พิมพ์ "Customer" ซ้ำ */
  assert.deepEqual(heads, [
    ['Sales Coordinator', 'Account Coordinator'],
    ['Sales', 'Account Executive'],
    ['Sales Manager', 'Account Executive Supervisor'],
    ['Customer', 'Authorized signature'],
  ]);
  assert.match(signatureRow(html), /aria-label="Signatures"/);
  assert.match(signatureBoxes(html)[3], /<p>Date _+ \/ _+ \/ _+<\/p>/);
});

test('checklist พิมพ์ครบทุกแถวและติ๊กตรงกับผู้จัดเตรียม', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /Checklist Project/);
  assert.match(html, /วัตถุดิบ\/สารประกอบ/);
  assert.match(html, /สายคาดกล่อง/);          // แถวที่ 16 ของทะเบียน
  assert.ok((html.match(/☑/g) || []).length >= 3, 'ต้องมีช่องที่ติ๊กแล้ว');
  assert.ok((html.match(/☐/g) || []).length >= 20, 'แถวที่ยังไม่ติ๊กต้องพิมพ์ช่องว่างไว้ให้ติ๊กมือ');
});

test('⭐ หัวข้อในเนื้อมีเลขข้อ 1–5 ตามลำดับกระดาษ · ภาพประกอบได้เลขถัดไป · ลายเซ็นไม่มีเลข', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ illustrations: [{ attachmentId: 'a', caption: 'หนึ่ง', sortOrder: 0, fileName: 'a.jpg' }] }),
  }));
  assert.deepEqual(headings(html), [
    '1. Product Overview', '2. Market Positioning', '3. Functional Information',
    '4. Checklist Project', '5. Certification &amp; Documents', '6. ภาพประกอบรายละเอียดสินค้า',
    'Final Review &amp; Approval',
  ]);
});

test('หัวข้อที่ไม่มีแถวไม่พิมพ์ และเลขข้อถัดไปเลื่อนขึ้น (ไม่เว้นเลข)', () => {
  const snapshot = snapshotOf({ items: [] });
  snapshot.spec = { ...snapshot.spec, certifications: [] };
  const list = headings(renderProductSpecDocument(baseInput({ snapshot })));
  assert.deepEqual(list, ['1. Product Overview', '2. Market Positioning', '3. Functional Information', 'Final Review &amp; Approval']);
});

test('🐞 ไม่มี "(ต่อ)" ปลอม — หัวข้อที่ขึ้นหน้าใหม่ไม่ใช่การตัดกลางหัวข้อ', () => {
  // ใบมาตรฐาน 17 แถว — หัวข้อ Checklist ย้ายไปแผ่นใหม่ทั้งก้อน ไม่ใช่ "(ต่อ)" ตามด้วยหัวข้อเดิม
  const html = renderProductSpecDocument(baseInput());
  const list = bareHeadings(html);
  for (let index = 0; index < list.length; index += 1) {
    const cont = list[index].match(/^(.*) \(ต่อ\)$/);
    if (!cont) continue;
    assert.notEqual(list[index + 1], cont[1], `"${list[index]}" ตามด้วยหัวข้อเดิมที่ยังไม่เคยเริ่ม`);
    assert.ok(list.slice(0, index).includes(cont[1]), `"${list[index]}" ต่อจากหัวข้อที่ยังไม่เคยขึ้น`);
  }
  assert.equal(list.filter((h) => h === 'Checklist Project').length, 1);
  assert.ok(!list.some((h) => h.endsWith('(ต่อ)')), 'ใบมาตรฐานไม่มีหัวข้อไหนสูงเกินแผ่น ⇒ ต้องไม่มีการตัดกลางหัวข้อ');
});

test('หัวข้อไม่ค้างท้ายแผ่น — แถวแรกที่สูงกว่าปกติต้องตามหัวข้อไปหน้าใหม่ด้วย', () => {
  const long = 'รายละเอียดยาวมาก '.repeat(18);
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({
      items: [{ itemKey: null, itemLabel: 'แถวสูง', detail: long, note: long, preparedByS: true }],
    }),
  }));
  const pages = html.split('class="sheet ').slice(1);
  for (const page of pages) {
    const body = page.replace(/<footer[\s\S]*$/, '');
    // หัวข้อที่เป็นสิ่งสุดท้ายของแผ่น = หัวข้อลอย
    assert.doesNotMatch(body, /<h3>[^<]*<\/h3>\s*<\/div>\s*$/, 'มีหัวข้อค้างท้ายแผ่นโดยไม่มีแถวตาม');
  }
  const list = bareHeadings(html);
  assert.ok(!list.includes('Checklist Project (ต่อ)'), 'แถวเดียวของหัวข้อไม่ใช่การตัดกลางหัวข้อ');
});

test('ตัดกลางหัวข้อจริง (หัวข้อสูงกว่าแผ่นเปล่า) = หน้าใหม่เปิดด้วยหัวข้อเดิม **พร้อมเลขข้อ** + "(ต่อ)" และหัวตารางซ้ำ', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({
      items: Array.from({ length: 40 }, (_, i) => ({
        itemKey: null,
        itemLabel: `รายการที่ ${i + 1}`,
        detail: 'รายละเอียดยาว '.repeat(12),
        note: 'หมายเหตุยาว '.repeat(10),
        preparedByS: true,
      })),
    }),
  }));
  assert.ok(headings(html).includes('4. Checklist Project (ต่อ)'));
  assert.ok((html.match(/<th class="no">ลำดับ<\/th>/g) || []).length >= 2, 'หัวตารางต้องพิมพ์ซ้ำบนหน้าใหม่');
});

test('ใบอังกฤษ: หัวข้อต่อใช้ "(cont.)" · ท้ายกระดาษเป็น Page', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: englishSnapshot({
      items: Array.from({ length: 40 }, (_, i) => ({
        itemKey: null, itemLabel: `รายการที่ ${i + 1}`, detail: 'รายละเอียดยาว '.repeat(12), note: null, preparedByS: true,
      })),
    }),
  }));
  assert.ok(headings(html).includes('4. Checklist Project (cont.)'));
  assert.match(html, /Page 1 \/ /);
  assert.doesNotMatch(html, /หน้า 1 \//);
});

test('ลบ checklist หมดใบ = ไม่มีหัวข้อ Checklist บนกระดาษ (ไม่ใช่หัวข้อกับตารางเปล่า)', () => {
  const html = renderProductSpecDocument(baseInput({ snapshot: snapshotOf({ items: [] }) }));
  assert.ok(!html.includes('Checklist Project'), 'หัวข้อยังขึ้นทั้งที่ไม่มีแถว');
  assert.match(html, /4\. Certification &amp; Documents/, 'หัวข้อถัดไปต้องยังอยู่ และเลขข้อเลื่อนขึ้น');
});

test('ช่องที่ไม่ได้กรอกพิมพ์ N/A — ไม่ใช่เว้นว่างจนอ่านไม่ออกว่าถามแล้วหรือยัง', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /class="na">N\/A/);
});

test('เอกสารที่ขอได้พิมพ์ทั้งสองสถานะเสมอ และ อย. ใช้คำของตัวเอง', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /Certification &amp; Documents/);
  assert.match(html, /อยู่ระหว่างยื่น/);          // แถว อย.
  assert.match(html, /อยู่ระหว่างจัดเตรียม/);     // แถวอื่น
});

test('ท้ายกระดาษทุกแผ่นบอกได้ว่าเป็นใบไหนและ Rev ไหน แม้แผ่นนั้นไม่มีหัวเอกสาร', () => {
  const html = renderProductSpecDocument(baseInput());
  const pages = sheetCount(html);
  assert.ok(pages >= 2, 'ใบมาตรฐานต้องมีอย่างน้อยสองแผ่น (เทสต์ท้ายกระดาษจะไม่มีความหมาย)');
  // บรรทัดแบบฟอร์ม (บอกว่าใบอะไร) + เลขที่รูปใหม่ (มี Rev อยู่ในตัว)
  assert.equal((html.match(/<span>FM-SA-04: Rev\. No\.00\. 08\/05\/2568 · 170969-004-02<\/span>/g) || []).length, pages);
  assert.match(html, /หน้า 1 \/ /);
  // หัวเอกสารมีแผ่นเดียว
  assert.equal((html.match(/class="documentHeader"/g) || []).length, 1);
});

test('ข้อมูลยาวขึ้นหน้าใหม่ได้ ไม่ใช่ยัดแผ่นเดียวจนล้น', () => {
  const short = renderProductSpecDocument(baseInput());
  const long = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({
      items: Array.from({ length: 40 }, (_, i) => ({
        itemKey: null,
        itemLabel: `รายการที่ ${i + 1}`,
        detail: 'รายละเอียดยาว '.repeat(12),
        note: 'หมายเหตุยาว '.repeat(10),
        preparedByS: true,
      })),
    }),
  }));
  assert.ok(sheetCount(long) > sheetCount(short), 'ใบที่ยาวกว่าต้องได้หน้ามากกว่า');
});

/* ── งบหน้า (แผนของกระดาษ) — คณิตล้วน ไม่ต้องเปิดเบราว์เซอร์ ───────────────────────────
   ตัวเลขที่ "วัดได้" ในเทสต์ชุดนี้มาจากสวีปด้วย Chrome 2026-09-22 (วิธีวัดที่หัว productSpecLayout.js) */

const planOf = (input) => planProductSpecPaper(input);
const pageCost = (plan, entries) => entries.reduce((sum, entry) => {
  if (entry.kind === 'row') return sum + entry.row.cost;
  if (entry.kind === 'tail') return sum + plan.tailCost;
  return sum + entry.section.openCost;
}, 0);

test('🔴 ทุกแผ่นใช้ไม่เกินงบ — แผ่นแรกหักหัวเอกสาร + กล่องผู้ซื้อ/อ้างอิงที่ประเมินจากข้อความจริง', () => {
  const long = 'ข้อความยาวมากสำหรับทดสอบงบหน้า '.repeat(16).slice(0, 500);
  const inputs = [
    baseInput(),
    baseInput({ snapshot: englishSnapshot() }),
    baseInput({ snapshot: snapshotOf({ spec: { ...snapshotOf().spec, standardPackaging: long, targetGroup: long, keySellingPoint: long, productBenefit: long } }) }),
    baseInput({ snapshot: snapshotOf({ items: Array.from({ length: 30 }, (_, i) => ({ itemLabel: `แถว ${i}`, detail: long, note: long })) }) }),
  ];
  for (const input of inputs) {
    const plan = planOf(input);
    plan.pages.forEach((entries, index) => {
      const budget = index === 0 ? plan.budgets.first : plan.budgets.rest;
      const cost = pageCost(plan, entries);
      // ไม่มีแผ่นไหนเกินความจุเต็ม (งบ + ส่วนเผื่อ)
      assert.ok(cost <= budget + plan.budgets.reserve + 1e-9, `แผ่น ${index + 1}: ${cost.toFixed(2)} > ความจุ`);
      /* ส่วนเผื่อขอคืนได้เฉพาะ (ก) หัวข้อเดียวทั้งหัวข้อที่อยู่คนเดียวบนแผ่น (ข) ก้อนท้าย — หลายหัวข้อแชร์แผ่น = อยู่ในงบ */
      const body = cost - (entries.at(-1)?.kind === 'tail' ? plan.tailCost : 0);
      const sections = new Set(entries.filter((e) => e.section).map((e) => e.section.key));
      if (sections.size > 1) assert.ok(body <= budget + 1e-9, `แผ่น ${index + 1}: หลายหัวข้อ ${body.toFixed(2)} > งบ ${budget.toFixed(2)}`);
    });
  }
});

const sheetsOf = (plan) => plan.pages.map((entries) => entries
  .filter((e) => e.kind !== 'row')
  .map((e) => (e.kind === 'tail' ? 'SIG' : `${e.kind === 'continue' ? '+' : ''}${e.section.number}`))
  .join(','));

test('⭐ ใบมาตรฐาน (checklist 17 · เอกสาร 4 · ไม่มีภาพ) = สองแผ่น ลายเซ็นอยู่หน้า 2 — ไม่มีหน้าที่มีแต่ลายเซ็น', () => {
  // 🐞 ผลตรวจรอบสอง: ทุกใบจริงบนฐานเป็นรูปนี้ และเคยได้หน้า 3 ที่มีแต่ "Final Review & Approval"
  //    (วาดจริงหน้า 2 ใส่ลายเซ็นแล้วเหลือ 3.5mm — วัดซ้ำหลังแก้: 263.29 / 266.76 พิมพ์)
  for (const snapshot of [snapshotOf(), englishSnapshot()]) {
    const plan = planOf(baseInput({ snapshot }));
    assert.deepEqual(sheetsOf(plan), ['1,2,3', '4,5,SIG'], snapshot.order.docLanguage);
  }
});

test('⭐ ภาพ 5–6 รูป (สามแถว) อยู่แผ่นเดียวทั้งหัวข้อ — ไม่มีแผ่น "(ต่อ)"', () => {
  // 🐞 ผลตรวจรอบสอง: PRD-f52e3e4c (ภาพจริง 5 รูป) ได้หัวข้อ 6 สองแถวบนหน้า 3 + แถวที่สามบนหน้า 4 "(ต่อ)"
  //    ทั้งที่วาดจริงลงหน้าเดียวเหลือ 3.2mm
  for (const count of [5, 6]) {
    const illustrations = Array.from({ length: count }, (_, i) => ({ attachmentId: `a${i}`, caption: `ภาพที่ ${i + 1}`, sortOrder: i }));
    const plan = planOf(baseInput({ snapshot: snapshotOf({ illustrations }) }));
    const figures = plan.sections.find((section) => section.key === 'figures');
    const pages = new Set();
    plan.pages.forEach((entries, index) => entries.forEach((e) => { if (e.section === figures) pages.add(index); }));
    assert.equal(pages.size, 1, `${count} รูป: หัวข้อภาพถูกตัดข้ามแผ่น`);
    assert.ok(!plan.pages.flat().some((e) => e.kind === 'continue'), `${count} รูป: มีหัวข้อ "(ต่อ)"`);
  }
});

test('🔴 กล่องผู้ซื้อ/อ้างอิงยาวขึ้น = งบแผ่นแรกลดลงตาม (ไม่ใช่ค่าคงที่ 31.75 ชุดเก่า)', () => {
  const short = planOf(baseInput());
  const longAddress = snapshotOf();
  longAddress.customer = {
    ...longAddress.customer,
    billingAddress: 'เลขที่ 88/8 อาคารเอ็มไพร์ทาวเวอร์ ชั้น 47 ถนนสาทรใต้ แขวงยานนาวา เขตสาทร กรุงเทพมหานคร 10120\n'.repeat(4),
  };
  const long = planOf(baseInput({ snapshot: longAddress }));
  assert.ok(long.partyMm > short.partyMm + 30, 'ที่อยู่สี่บรรทัดยาว ๆ (ซ้ำในที่อยู่จัดส่ง) ต้องกินที่เพิ่มชัดเจน');
  assert.ok(long.budgets.first < short.budgets.first);
  assert.equal(long.budgets.rest, short.budgets.rest, 'แผ่นต่อไม่มีกล่องผู้ซื้อ งบต้องไม่ขยับ');
});

/* ⭐ ค่าที่วัดด้วย Chrome (สวีป 2026-09-22) — ตัวประเมินต้องไม่ต่ำกว่าของจริง
   ถ้าเทสต์นี้แดงหลังแก้ CSS/ป้าย ⇒ วัดใหม่ตามวิธีที่หัว productSpecLayout.js แล้วแก้ทั้งค่าที่นี่และค่าคงที่ */
// ที่อยู่ยาวของจริงบนฐาน (QT-26080236-0 · 6 บรรทัดรวมบรรทัดว่าง) และที่อยู่อังกฤษตัวใหญ่ 250 ตัว — ชุดเดียวกับที่สวีปวัด
const REAL_LONG_TH = '*ออกใบเสนอราคา / ที่อยู่จัดส่งใบกำกับภาษี*\nบริษัท เดอะ ซีซั่น ฮิล จำกัด\nที่อยู่ 999/121 หมู่ที่ 3 ต.บางขนุน อ.บางกรวย จ.นนทบุรี 11130\nเลขประจำตัวผู้เสียภาษี 0125566039412\n\nส่งใบกำกับถึงคุณเบลล์ 0844326199 ตำบลบางขนุน อำเภอบางกรวย จังหวัดนนทบุรี 11130';
const LONG_EN_CAPS = '88/8 EMPIRE TOWER 47TH FLOOR, SOUTH SATHORN ROAD, YANNAWA, SATHORN, BANGKOK 10120 THAILAND '.repeat(3).slice(0, 250);
const withAddress = (snapshot, key, address) => {
  snapshot.customer = { ...snapshot.customer, [key]: address, [key.replace('billing', 'shipping')]: address };
  return snapshot;
};
const MEASURED = [
  // [คำอธิบาย, ภาพนิ่ง, หัวเอกสาร (มม.), กล่องผู้ซื้อ+อ้างอิงรวม margin (มม.)]
  // วัดใหม่ 2026-09-22 รอบสาม: กล่องอ้างอิงเหลือหกแถว (ถอด "จำนวน") ⇒ ใบที่อยู่สั้นฝั่งซ้าย (ผู้ซื้อ) สูงกว่า
  ['ใบไทย ที่อยู่สั้น', () => snapshotOf(), 42.86, 53.48],
  ['ใบอังกฤษ ที่อยู่สั้น', () => englishSnapshot(), 42.86, 53.48],
  ['ใบไทย ที่อยู่จริง 6 บรรทัด (ทั้งเอกสาร+จัดส่ง)', () => withAddress(snapshotOf(), 'billingAddress', REAL_LONG_TH), 42.86, 104.54],
  ['ใบอังกฤษ ที่อยู่ตัวใหญ่ 250 ตัว (ทั้งเอกสาร+จัดส่ง)', () => withAddress(englishSnapshot(), 'billingAddressEn', LONG_EN_CAPS), 42.86, 90.78],
];

test('🔴 ตัวประเมินหัวเอกสาร/กล่องผู้ซื้อไม่ต่ำกว่าค่าที่วัดได้ (และไม่เกินเกินเหตุ)', () => {
  const measuredCompany = resolveCompanyBlock({
    legalNameTh: 'บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด',
    legalNameEn: 'SCENT AND SENSE LABORATORY CO., LTD.',
    address: '2/4 ซอยเพชรเกษม 35/1 ถนนเพชรเกษม แขวงบางหว้า เขตภาษีเจริญ กรุงเทพมหานคร 10160',
    addressEn: '2/4 Soi Phet Kasem 35/1, Phet Kasem Road, Bang Wa, Phasi Charoen, Bangkok 10160',
    taxId: '0105560000000', phone: '02-000-7722', line: '@perfumefactory', website: 'www.scentandsense.co.th',
  });
  for (const [label, snapshot, header, party] of MEASURED) {
    const snap = snapshot();
    // ค่าที่วัดมาจากภาพนิ่งชุดสวีป: ที่อยู่สั้น ผู้ติดต่อ เจ้าของดีล เท่ากับชุดนี้ในจำนวนบรรทัด
    const plan = planOf(baseInput({ snapshot: snap, company: measuredCompany }));
    assert.ok(plan.headerMm >= header, `${label}: หัว ${plan.headerMm.toFixed(2)} < วัดได้ ${header}`);
    assert.ok(plan.headerMm <= header + 6, `${label}: หัวประเมินเกินจริงเกิน 6mm (${plan.headerMm.toFixed(2)})`);
    assert.ok(plan.partyMm >= party, `${label}: กล่อง ${plan.partyMm.toFixed(2)} < วัดได้ ${party}`);
    assert.ok(plan.partyMm <= party + 8, `${label}: กล่องประเมินเกินจริงเกิน 8mm (${plan.partyMm.toFixed(2)})`);
  }
});

test('🔴 หัวกระดาษสองแถว · กล่องอ้างอิงหกแถว (เจ็ดเมื่อมี PO) — เพิ่มแถวต้องประเมินใหม่', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.equal((headerRows(html).match(/<dt>/g) || []).length, 2);
  assert.equal((referenceBox(html).match(/<dt>/g) || []).length, 6);
});

test('ตัดหน้าตามหัวข้อ: หัวข้อที่ลงแผ่นเปล่าได้ไม่ถูกตัดกลาง · แผ่นต่อทุกแผ่นเปิดด้วยหัวข้อ', () => {
  const plan = planOf(baseInput({ snapshot: snapshotOf({ illustrations: Array.from({ length: 3 }, (_, i) => ({ attachmentId: `a${i}`, caption: `${i}`, sortOrder: i })) }) }));
  const pagesOf = new Map();
  plan.pages.forEach((entries, index) => entries.forEach((entry) => {
    if (entry.section) pagesOf.set(entry.section.key, new Set([...(pagesOf.get(entry.section.key) || []), index]));
  }));
  for (const section of plan.sections) {
    const total = section.openCost + section.rows.reduce((sum, row) => sum + row.cost, 0);
    // ลงแผ่นเปล่าได้ = ความจุเต็มของแผ่น (ก้อนเดี่ยวไม่หักส่วนเผื่อ)
    if (total <= plan.budgets.rest + plan.budgets.reserve) assert.equal(pagesOf.get(section.key).size, 1, `${section.heading} ถูกตัดทั้งที่ลงแผ่นเปล่าได้`);
  }
  plan.pages.slice(1).forEach((entries, index) => {
    assert.ok(['open', 'continue', 'tail'].includes(entries[0]?.kind), `แผ่น ${index + 2} ไม่ได้เปิดด้วยหัวข้อ`);
  });
});

test('งบแผ่นต่อคืน margin บนของหัวข้อแรก 5mm — แผ่นแรกไม่ได้คืน (กล่องผู้ซื้อมาก่อน)', () => {
  const budgets = productSpecPageBudgets({ headerMm: 43, partyMm: 55 });
  assert.equal(Number((budgets.rest - (budgets.first + 43 + 55)).toFixed(6)), 5);
  assert.ok(budgets.rest <= 267.8, 'แผ่นต่อไม่เกินกล่องใน 276 − padding 9.2 + 5 − เผื่อ 4');
});

test('escape ค่าที่มาจากผู้ใช้ — ชื่อสินค้าที่มี < > ต้องไม่กลายเป็นแท็ก', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ product: { ...snapshotOf().product, productDescription: '<script>alert(1)</script>' } }),
  }));
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});

/* ── ลายน้ำ ──────────────────────────────────────────────────────────── */

test('ลายน้ำตามสถานะ (มติ 21/09)', () => {
  const doc = { status: 'active' };
  for (const status of ['draft', 'pending_ae', 'pending_ae_supervisor', 'rejected']) {
    assert.equal(productSpecWatermark({ document: doc, revision: { status } }), 'ฉบับร่าง', status);
  }
  assert.equal(productSpecWatermark({ document: doc, revision: { status: 'approved' } }), null);
  assert.equal(productSpecWatermark({ document: doc, revision: { status: 'superseded' }, supersededByRevNo: 3 }), 'ถูกแทนด้วย Rev.03');
  assert.equal(productSpecWatermark({ sample: true }), 'ตัวอย่าง');
});

test('ลายน้ำใบอังกฤษ = ป้ายชุดกลางแบบ QT/SO (DRAFT · CANCELLED · SUPERSEDED BY) · ใบไทยเท่าเดิม', () => {
  const doc = { status: 'active' };
  assert.equal(productSpecWatermark({ document: doc, revision: { status: 'pending_ae' }, language: 'en' }), 'DRAFT');
  assert.equal(productSpecWatermark({ document: { status: 'void' }, revision: { status: 'approved' }, language: 'en' }), 'CANCELLED');
  assert.equal(productSpecWatermark({ document: doc, revision: { status: 'superseded' }, supersededByRevNo: 3, language: 'en' }), 'SUPERSEDED BY Rev.03');
  assert.equal(supersededWatermark(null, 'en'), 'SUPERSEDED BY A NEWER Rev.');
  assert.equal(productSpecWatermark({ document: doc, revision: { status: 'draft' }, language: 'th' }), PRODUCT_SPEC_WATERMARKS.draft);
  assert.equal(productSpecWatermark({ document: { status: 'void' }, language: undefined }), PRODUCT_SPEC_WATERMARKS.void);
});

test('🔴 เอกสาร void ชนะทุกสถานะของ Rev — ฉบับอนุมัติของใบที่ยกเลิกต้องไม่ออกมาสะอาด', () => {
  for (const status of ['approved', 'superseded', 'draft', 'pending_ae']) {
    assert.equal(productSpecWatermark({ document: { status: 'void' }, revision: { status } }), 'ยกเลิก', status);
  }
});

test('🪤 สถานะที่ไม่รู้จัก = "ฉบับร่าง" — กระดาษไร้ลายน้ำต้องเป็นฉบับอนุมัติเท่านั้น', () => {
  assert.equal(productSpecWatermark({ document: { status: 'active' }, revision: { status: 'อะไรไม่รู้' } }), 'ฉบับร่าง');
  assert.equal(productSpecWatermark({}), 'ฉบับร่าง');
  assert.equal(supersededWatermark(null), 'ถูกแทนด้วย Rev. ใหม่');
});

test('ลายน้ำอยู่ทุกแผ่น และฉบับอนุมัติไม่มีลายน้ำ', () => {
  const draft = renderProductSpecDocument(baseInput({ watermark: PRODUCT_SPEC_WATERMARKS.draft }));
  assert.equal((draft.match(/class="watermark">ฉบับร่าง</g) || []).length, sheetCount(draft));
  const approved = renderProductSpecDocument(baseInput());
  assert.doesNotMatch(approved, /class="watermark"/);
});

test('⭐ กระดาษที่ตรึงแล้วประทับลายน้ำทับได้โดยเนื้อไม่เปลี่ยน · ไม่มีข้อความ = คืนของเดิมทุกไบต์', () => {
  const frozen = renderProductSpecDocument(baseInput());
  assert.equal(applyProductSpecWatermark(frozen, null), frozen);
  const stamped = applyProductSpecWatermark(frozen, 'ถูกแทนด้วย Rev.03');
  assert.equal((stamped.match(/class="watermark">ถูกแทนด้วย Rev\.03</g) || []).length, sheetCount(frozen));
  // เอาลายน้ำออกแล้วต้องได้กระดาษเดิมเป๊ะ — แตะเฉพาะช่องลายน้ำ
  assert.equal(stamped.replace(/<div class="watermark">[^<]*<\/div>/g, ''), frozen);
  // ประทับซ้ำ = แทนของเดิม ไม่ซ้อนสองชั้น
  const twice = applyProductSpecWatermark(stamped, 'ยกเลิก');
  assert.equal((twice.match(/class="watermark"/g) || []).length, sheetCount(frozen));
  assert.doesNotMatch(twice, /class="watermark">ถูกแทนด้วย/);
});

test('กระดาษที่ไม่มีช่องลายน้ำ (ตัวเรนเดอร์รุ่นอื่น) ยังได้ลายน้ำทุกแผ่น', () => {
  const legacy = '<div><article class="sheet explicit-page" aria-label="a">A</article><article class="sheet" aria-label="b">B</article></div>';
  const stamped = applyProductSpecWatermark(legacy, 'ยกเลิก');
  assert.equal((stamped.match(/class="watermark">ยกเลิก</g) || []).length, 2);
});

test('🪤 ข้อความผู้ใช้ปลอมช่องลายน้ำไม่ได้ (ถูก escape)', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ spec: { ...snapshotOf().spec, texture: '<!--psd:watermark-->แอบ<!--/psd:watermark-->' } }),
  }));
  const stamped = applyProductSpecWatermark(html, 'ยกเลิก');
  assert.match(stamped, /&lt;!--psd:watermark--&gt;แอบ/);
  assert.equal((stamped.match(/class="watermark"/g) || []).length, sheetCount(html));
});

test('รุ่นตัวเรนเดอร์พอดีคอลัมน์ rendererVersion (≤ 40 ตัวอักษร)', () => {
  assert.ok(PRODUCT_SPEC_RENDERER_VERSION.length > 0 && PRODUCT_SPEC_RENDERER_VERSION.length <= 40);
});

/* ── ภาพประกอบ (แผ่นท้าย) — มาจากภาพนิ่ง ───────────────────────────────── */

const figure = (attachmentId, caption, sortOrder = null) => ({
  attachmentId, caption, sortOrder, fileName: `${attachmentId}.jpg`,
});

test('ไม่มีภาพ = ไม่มีหัวข้อภาพประกอบเลย (ไม่ใช่หัวข้อว่าง)', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.doesNotMatch(html, /ภาพประกอบรายละเอียดสินค้า/);
  assert.doesNotMatch(html, /class="figGrid"/);
});

test('ภาพขึ้นสองภาพต่อแถว พร้อมเลขลำดับและคำบรรยาย', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({
      illustrations: [
        figure('att-1', 'กล่องแบบใหม่ เปิดขึ้น', 0),
        figure('att-2', 'ใส่การ์ด', 1),
        figure('att-3', 'ปิดกล่อง', 2),
      ],
    }),
  }));
  assert.match(html, /ภาพประกอบรายละเอียดสินค้า/);
  // 3 ภาพ ⇒ สองแถว (2 + 1)
  assert.equal((html.match(/class="figGrid"/g) || []).length, 2);
  assert.match(html, /1\. กล่องแบบใหม่ เปิดขึ้น/);
  assert.match(html, /3\. ปิดกล่อง/);
});

test('รูปดึงผ่านเส้นไฟล์แนบของระบบด้วย attachmentId ของภาพนิ่ง — ไม่ใช่ URL ดิบจาก storage', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ illustrations: [figure('att-9', 'ภาพหนึ่ง', 0)] }),
  }));
  assert.match(html, /src="\/api\/master\/attachments\/att-9\/file"/);
});

test('ภาพที่ไม่มีคำบรรยายยังมีเลขลำดับ และ alt ไม่ว่าง (ไม่ใช่ N/A)', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ illustrations: [figure('att-x', '', 0)] }),
  }));
  assert.match(html, />1\.</);
  assert.match(html, /alt="ภาพประกอบที่ 1"/);
  assert.doesNotMatch(html, /alt="N\/A"/);
});

test('เรียงภาพตาม sortOrder ของภาพนิ่ง ด้วยตัวจัดลำดับตัวเดียวกับที่จอใช้', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ illustrations: [figure('b', 'สอง', 1), figure('a', 'หนึ่ง', 0)] }),
  }));
  assert.ok(html.indexOf('1. หนึ่ง') < html.indexOf('2. สอง'));
});

test('ภาพเยอะขึ้นหน้าใหม่ — ไม่ยัดแผ่นเดียว และหัวข้อภาพไม่ค้างท้ายแผ่น', () => {
  const few = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ illustrations: [figure('a', 'หนึ่ง', 0), figure('b', 'สอง', 1)] }),
  }));
  const many = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({
      illustrations: Array.from({ length: 14 }, (_, i) => figure(`att-${i}`, `ภาพที่ ${i + 1}`, i)),
    }),
  }));
  assert.ok(sheetCount(many) > sheetCount(few));
  for (const html of [few, many]) {
    const at = html.search(/<h3>\d+\. ภาพประกอบรายละเอียดสินค้า<\/h3>/);
    assert.ok(at >= 0, 'ต้องมีหัวข้อภาพพร้อมเลขข้อ');
    const pageEnd = html.indexOf('</article>', at);
    assert.ok(html.slice(at, pageEnd).includes('class="figGrid"'), 'หัวข้อภาพต้องมีแถวภาพตามอยู่แผ่นเดียวกัน');
  }
});

test('escape คำบรรยายที่ผู้ใช้พิมพ์', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ illustrations: [figure('att-1', '<img onerror=alert(1)>', 0)] }),
  }));
  assert.doesNotMatch(html, /<img onerror/);
  assert.match(html, /&lt;img onerror/);
});

test('🐞 สินค้าที่มีแบรนด์/ชื่อแต่ภาษาอังกฤษ พิมพ์ภาษาอังกฤษ — ไม่ใช่ N/A', () => {
  // ของจริง 22/09/2569: FG-646-01-002-1968 brandName "" · brandNameEn "M Marthest"
  // (สินค้าหมวด 01/02 มีแบรนด์อังกฤษล้วน 107/418 · ชื่ออังกฤษล้วน 199/418)
  const snapshot = snapshotOf();
  snapshot.product = {
    ...snapshot.product,
    brandName: '', brandNameEn: 'M Marthest',
    productDescription: '', productDescriptionEn: 'ERROR 404: Identity Not Found',
  };
  const html = renderProductSpecDocument(baseInput({ snapshot }));
  assert.match(html, /M Marthest/);
  assert.match(html, /ERROR 404: Identity Not Found/);
});

test('แบรนด์มีสองภาษา ใช้กฎภาษาเดียวชุดกลาง (อังกฤษก่อน) · ชื่อสินค้าไทยก่อน', () => {
  const snapshot = snapshotOf();
  snapshot.product = {
    ...snapshot.product,
    brandName: 'อาร์เทโพล', brandNameEn: 'Artepole',
    productDescription: 'ชาวัลเลย์ 50 มล.', productDescriptionEn: 'Eau de Tea Valley 50 ml',
  };
  const html = renderProductSpecDocument(baseInput({ snapshot }));
  assert.match(html, /Artepole/);
  assert.match(html, /ชาวัลเลย์ 50 มล\./);
});

test('⭐ ช่องลงนามชิดขอบล่างของแผ่น (มติ 2026-09-22 "ดึงขึ้นถ้าพอ แต่ชิดล่าง")', () => {
  const html = renderProductSpecDocument(baseInput());
  // ก้อนท้าย (หัวข้อ Final Review + ช่องลงนาม) ห่อด้วย .signTail ตัวเดียว · margin-top:auto ใน .sheetContent (flex column)
  assert.equal((html.match(/<div class="signTail">/g) || []).length, 1);
  assert.match(html, /<div class="signTail"><h3 class="signHeading">Final Review &amp; Approval<\/h3>\s*<section class="signatures"/);
  assert.match(html, /\.specsheet \.signTail \{ margin-top: auto; \}/);
});
