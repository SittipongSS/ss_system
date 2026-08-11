import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuotationMasterHTML, renderQuotationMasterDocumentHTML } from './quotationMasterDocument.js';
import { buildQuotationMasterModelFromQuote, buildQuotationMasterPreview } from './quotationMasterTemplate.js';

const lineOf = (id, over = {}) => ({
  id, sortOrder: Number(id.replace(/\D/g, '')) || 0,
  fgCode: `FG-${id}`, description: `สินค้า ${id}`, qty: 10, unit: 'ชิ้น',
  unitPrice: 100, lineTotal: 1000, ...over,
});

const baseQuote = (lines) => {
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const vatAmount = Math.round(subtotal * 0.07 * 100) / 100;
  return {
    quoteNumber: 'QT-2026-0001', quoteDate: '2026-07-20', validUntil: '2026-08-19', revisionNo: 0,
    customerName: 'ลูกค้าทดสอบ', billingAddress: '1 ถนนทดสอบ', contactName: 'คุณเอ', contactPhone: '080',
    lines, subtotal, discountType: 'amount', discountValue: 0, discountAmount: 0,
    vatRate: 7, vatAmount, totalAmount: subtotal + vatAmount,
    paymentPlan: { type: 'full', paymentMethod: 'โอน' }, paymentTerms: 'เครดิต 30 วัน', notes: 'หมายเหตุ',
    approvalStatus: 'approved', approvedByName: 'ผู้อนุมัติ', approvedAt: '2026-07-20T03:00:00.000Z',
    createdByName: 'ผู้จัดทำ', deal: { title: 'ดีล', ownerName: 'ผู้จัดทำ' }, project: { name: 'โครงการ' },
  };
};

test('V4 doc: เป็น HTML เต็มไฟล์ ใช้คลาส document v4 + ข้อมูลจริง', () => {
  const html = buildQuotationMasterHTML(baseQuote([lineOf('1'), lineOf('2')]), {});
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /class="document v4/);
  assert.match(html, /class="documentHeader"/);
  assert.match(html, /ใบเสนอราคา/);
  assert.match(html, /QUOTATION/);
  assert.ok(html.includes('ลูกค้าทดสอบ'), 'มีชื่อลูกค้า');
  assert.match(html, /ยอดรวมทั้งสิ้น/);
  assert.match(html, /@page \{ size: A4 portrait/);
});

test('V4 doc: ข้อความยาวในเอกสารอ่านง่ายและรักษาการขึ้นบรรทัดของผู้ใช้', () => {
  const q = {
    ...baseQuote([lineOf('1', { description: 'หัวข้อสินค้า\nรายละเอียดบรรทัดถัดไป', note: 'หมายเหตุสินค้า\nบรรทัดสอง' })]),
    paymentPlan: { type: 'full', paymentMethod: 'โอนผ่านบัญชีบริษัท\nพร้อมส่งหลักฐานการชำระเงิน' },
    paymentTerms: 'ชำระเงินเต็มจำนวน\nก่อนเริ่มผลิต',
    notes: 'เงื่อนไขข้อแรก\nเงื่อนไขข้อที่สอง',
  };
  const html = buildQuotationMasterHTML(q, {});
  assert.match(html, /\.termsGrid p \{[^}]*font-size: 8\.5pt;[^}]*line-height: 1\.65;[^}]*white-space: pre-wrap;/);
  assert.match(html, /\.termsGrid h2 span \{[^}]*display: inline;[^}]*white-space: nowrap;/);
  assert.match(html, /\.itemName \{[^}]*white-space: pre-wrap;/);
  assert.ok(html.includes('เงื่อนไขข้อแรก\nเงื่อนไขข้อที่สอง'), 'ไม่ยุบ newline ในหมายเหตุ');
  assert.ok(html.includes('หัวข้อสินค้า\nรายละเอียดบรรทัดถัดไป'), 'ไม่ยุบ newline ในรายละเอียดสินค้า');
});

test('V4 doc: รายการสินค้าแสดง FG · แบรนด์ ก่อนชื่อสินค้า · ขนาด', () => {
  const line = lineOf('1', {
    description: 'สินค้าเซนท์ แอนด์ เซนส์ · 30 ml',
    metadata: { productBrand: 'SCENT AND SENSE' },
  });
  const html = buildQuotationMasterHTML(baseQuote([line]), {});
  const metaIndex = html.indexOf('FG-1 · SCENT AND SENSE');
  const nameIndex = html.indexOf('สินค้าเซนท์ แอนด์ เซนส์ · 30 ml');
  assert.ok(metaIndex >= 0, 'มี FG และแบรนด์ภาษาเดียว');
  assert.ok(nameIndex > metaIndex, 'ชื่อสินค้าและขนาดอยู่ลำดับถัดจาก FG/แบรนด์');
  assert.match(html, /class="itemIdentity"/);
  assert.match(html, /class="itemName"/);
});

test('V4 doc: บล็อกลูกค้า — โชว์เลขภาษี + ที่อยู่จัดส่ง, ไม่โชว์สาขา', () => {
  const q = {
    ...baseQuote([lineOf('1')]),
    customerTaxId: '0105561000000',
    billingAddress: 'ที่อยู่ออกบิล',
    shippingAddress: 'ที่อยู่จัดส่งต่างหาก',
    branchCode: '00001',
  };
  const html = buildQuotationMasterHTML(q, {});
  assert.match(html, /เลขผู้เสียภาษี<\/dt><dd>0105561000000/);
  assert.match(html, /ที่อยู่จัดส่ง<\/dt><dd>ที่อยู่จัดส่งต่างหาก/);
  assert.doesNotMatch(html, /<dt>สาขา<\/dt>/);
});

test('V4 doc: โทรผู้เสนอราคาในบล็อกอ้างอิง (เมื่อมี) + ติดต่อบริษัทย้ายไปอยู่ในหัว', () => {
  const withPhone = buildQuotationMasterHTML({ ...baseQuote([lineOf('1')]), createdByPhone: '089-123-4567' }, {});
  // แถว "โทร" (เบอร์ผู้เสนอราคา) ในบล็อกอ้างอิง
  assert.match(withPhone, /โทร<\/dt><dd>089-123-4567/);
  // ติดต่อบริษัท (โทร + Line) อยู่ในหัวเอกสาร ไม่ใช่บล็อกอ้างอิง
  assert.match(withPhone, /โทร 02-000-7722 · Line @perfumefactory/);
  assert.doesNotMatch(withPhone, /โทรบริษัท/);
  // ไม่มีเบอร์ผู้เสนอราคา → ไม่มีแถว "โทร" ในบล็อกอ้างอิง (หัวยังมี "โทร ..." แบบไม่มี </dt>)
  const noPhone = buildQuotationMasterHTML(baseQuote([lineOf('1')]), {});
  assert.doesNotMatch(noPhone, /โทร<\/dt>/);
});

test('V4 doc: อนุมัติแล้วไม่มีลายน้ำ + โชว์บล็อกลายเซ็นผู้อนุมัติ', () => {
  const html = buildQuotationMasterHTML(baseQuote([lineOf('1')]), {});
  assert.ok(!html.includes('>ฉบับร่าง<'), 'อนุมัติแล้วไม่มีลายน้ำร่าง');
  assert.match(html, /ลายเซ็นอิเล็กทรอนิกส์/);
  assert.ok(html.includes('ผู้อนุมัติ'), 'มีชื่อผู้อนุมัติ');
});

test('V4 doc: มีรูปลายเซ็นผู้อนุมัติ (imageDataUri) → ฝัง <img>, ไม่ใช้กล่องข้อความ', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  const html = buildQuotationMasterHTML(baseQuote([lineOf('1')]), { approverSignatureImage: png });
  assert.match(html, /<img class="signatureImage" src="data:image\/png;base64,/);
  assert.ok(html.includes(png), 'ฝัง data URI ของรูปลายเซ็นจริง');
  // มีรูปแล้วไม่ต้องมีกล่องข้อความ placeholder ในเอกสาร
  assert.doesNotMatch(html, /ลายเซ็นอิเล็กทรอนิกส์/);
});

test('V4 doc: ไม่มีรูปลายเซ็น → fallback กล่องข้อความ "ลายเซ็นอิเล็กทรอนิกส์" (ไม่มี <img>)', () => {
  const html = buildQuotationMasterHTML(baseQuote([lineOf('1')]), {});
  assert.match(html, /ลายเซ็นอิเล็กทรอนิกส์/);
  assert.doesNotMatch(html, /class="signatureImage"/);
});

test('V4 doc: รูปลายเซ็นผู้เสนอราคา (proposer) → stamp รูป ไม่มีบรรทัด Evidence', () => {
  const proposer = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  const q = { ...baseQuote([lineOf('1')]), deal: { title: 'ดีล', ownerName: 'สมชาย ขายเก่ง' } };
  const html = buildQuotationMasterHTML(q, { proposerSignatureImage: proposer });
  assert.ok(html.includes(proposer), 'ฝังรูปผู้เสนอราคา');
  // ผู้เสนอราคาเป็น stamp — ไม่มีคำว่า Evidence ในกล่องนี้ (ต่างจากผู้อนุมัติ evidence-backed)
  assert.doesNotMatch(html, /Evidence/);
});

test('V4 doc: ทั้งผู้เสนอราคา + ผู้อนุมัติมีรูป → มี <img> 2 อัน', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  const html = buildQuotationMasterHTML(baseQuote([lineOf('1')]), { approverSignatureImage: png, proposerSignatureImage: png });
  const imgCount = (html.match(/class="signatureImage"/g) || []).length;
  assert.equal(imgCount, 2, 'ผู้เสนอราคา + ผู้อนุมัติ');
});

test('V4 doc: ฉบับร่าง (pending) ขึ้นลายน้ำ "ฉบับร่าง"', () => {
  const q = { ...baseQuote([lineOf('1')]), approvalStatus: 'pending', approvedByName: null };
  const html = buildQuotationMasterHTML(q, {});
  assert.match(html, /class="watermark">ฉบับร่าง/);
});

test('V4 doc: ใบที่ยังไม่ยื่น (not_submitted) ก็เป็นฉบับร่าง + ไม่โชว์ช่องผู้อนุมัติ', () => {
  // mig 0155 เพิ่มสถานะก่อน pending — ถ้า renderer ไม่รู้จัก ใบที่ยังไม่ยื่นจะพิมพ์ออกมา
  // เหมือนใบสมบูรณ์ (ไม่มีลายน้ำ) และโชว์ชื่อผู้อนุมัติที่ค้างจากรอบก่อน
  const q = { ...baseQuote([lineOf('1')]), approvalStatus: 'not_submitted', approvedByName: 'ค้างจากรอบก่อน' };
  const html = buildQuotationMasterHTML(q, {});
  assert.match(html, /class="watermark">ฉบับร่าง/);
  assert.ok(!html.includes('ค้างจากรอบก่อน'), 'ยังไม่ยื่น = ยังไม่มีผู้อนุมัติบนเอกสาร');
});

test('V4 doc: ช่องผู้เสนอราคาได้วันที่ + Evidence จากหลักฐานการยื่น', () => {
  const png = 'data:image/png;base64,UFJPUA==';
  const html = buildQuotationMasterHTML(baseQuote([lineOf('1')]), {
    proposerSignatureImage: png,
    proposerEvidence: { id: 'DSE-9', signerName: 'ผู้ยื่นจริง', signedAt: '2026-07-26T04:00:00.000Z' },
  });
  assert.match(html, /ผู้ยื่นจริง/);
  assert.match(html, /DSE-9/);
  assert.match(html, /26\/07\/2026/);
  // ไม่มีหลักฐาน (ใบเก่า) → stamp เชิงภาพ ไม่มี Evidence
  const legacy = buildQuotationMasterHTML(baseQuote([lineOf('1')]), { proposerSignatureImage: png });
  assert.doesNotMatch(legacy, /DSE-9/);
});

test('V4 doc: override ลายน้ำ (เช่น ยกเลิก) ผ่าน options', () => {
  const html = buildQuotationMasterHTML(baseQuote([lineOf('1')]), { watermark: 'ยกเลิก' });
  assert.match(html, /class="watermark">ยกเลิก/);
});

test('V4 model: หลายรายการแตกหลายหน้า — party หน้าแรก, totals หน้าสุดท้ายที่มีรายการ', () => {
  const lines = Array.from({ length: 30 }, (_, i) => lineOf(`L${i}`, {
    description: `สินค้ารายการยาวพอสมควรลำดับที่ ${i} เพื่อทดสอบการแบ่งหน้า`,
  }));
  const model = buildQuotationMasterModelFromQuote(baseQuote(lines), {});
  assert.ok(model.pages.length >= 2, 'ต้องมากกว่า 1 หน้า');
  assert.equal(model.pages[0].showParty, true, 'party อยู่หน้าแรก');
  const itemPages = model.pages.filter((p) => p.lines.length > 0);
  const totalsPage = model.pages.find((p) => p.showTotals);
  assert.equal(totalsPage, itemPages.at(-1), 'totals ปิดหน้าสินค้าหน้าสุดท้าย');
  // ไม่มีรายการหาย และเรียงลำดับคงเดิม
  assert.equal(model.pages.flatMap((p) => p.lines).length, 30);
});

test('V4 doc: preview model (fixture) เรนเดอร์ได้เหมือนกัน', () => {
  const model = buildQuotationMasterPreview('multipage', 'approved', 'v4');
  const html = renderQuotationMasterDocumentHTML(model, { toolbar: false });
  assert.match(html, /class="document v4/);
  // ไม่มี toolbar เมื่อ toolbar:false (เช็คปุ่มจริง ไม่ใช่คลาสใน CSS)
  assert.ok(!html.includes('class="toolbar no-print"'), 'ปิด toolbar ได้');
  // จำนวน .sheet = จำนวนหน้าใน model
  const sheetCount = (html.match(/class="sheet"/g) || []).length;
  assert.equal(sheetCount, model.pages.length);
});

test('V4 doc: ไม่มีส่วนลดรายบรรทัด = ไม่มีคอลัมน์ส่วนลด', () => {
  const html = buildQuotationMasterHTML(baseQuote([lineOf('1'), lineOf('2')]), {});
  assert.ok(!html.includes('<table class="itemTable withLineDiscount">'), 'ตารางไม่ติดคลาสส่วนลด');
  assert.ok(!html.includes('<th class="number">ส่วนลด</th>'), 'ไม่มีหัวคอลัมน์ส่วนลด');
});

test('V4 doc: มีส่วนลดรายบรรทัด = โชว์คอลัมน์ส่วนลด และยอดกระทบกันได้', () => {
  // 10 × 100 = 1,000 − 5% (50) = 950 · บรรทัดสองลดเป็นจำนวนเงิน 200 → 800
  const lines = [
    lineOf('1', { discountType: 'percent', discountValue: 5, discountAmount: 50, lineTotal: 950 }),
    lineOf('2', { discountType: 'amount', discountValue: 200, discountAmount: 200, lineTotal: 800 }),
  ];
  const html = buildQuotationMasterHTML(baseQuote(lines), {});
  assert.match(html, /<th class="number">ส่วนลด<\/th>/);
  assert.match(html, /<table class="itemTable withLineDiscount">/);
  assert.ok(html.includes('-50.00'), 'ส่วนลดบรรทัดแรกแสดงเป็นยอดที่หัก');
  assert.ok(html.includes('-200.00'), 'ส่วนลดบรรทัดสองแสดงเป็นยอดที่หัก');
  // ยอดเงินอย่างเดียว — ไม่กำกับอัตรา % ในช่องส่วนลดของบรรทัด (มติผู้ใช้ 2026-08-11)
  assert.doesNotMatch(html, /class="itemDiscountRate"/, 'ไม่มีป้ายอัตราในช่องส่วนลด');
  assert.doesNotMatch(html, /<td class="number">-50\.00[^<]*5%/, 'ไม่มี % ต่อท้ายยอดที่หัก');
  assert.ok(html.includes('950.00') && html.includes('800.00'), 'จำนวนเงินคือยอดหลังหักส่วนลด');
});

test('V4 doc: ใบหลายหน้า หัวตารางมีคอลัมน์ส่วนลดเท่ากันทุกหน้า', () => {
  const lines = Array.from({ length: 30 }, (_, i) => lineOf(`L${i}`, i === 0
    ? { discountType: 'amount', discountValue: 100, discountAmount: 100, lineTotal: 900 }
    : {}));
  const html = buildQuotationMasterHTML(baseQuote(lines), {});
  const tables = (html.match(/<table class="itemTable withLineDiscount">/g) || []).length;
  const headers = (html.match(/<th class="number">ส่วนลด<\/th>/g) || []).length;
  assert.ok(tables >= 2, 'ต้องมีตารางรายการมากกว่า 1 หน้า');
  assert.equal(headers, tables, 'ทุกตารางมีหัวคอลัมน์ส่วนลด');
  assert.ok(!html.includes('<table class="itemTable">'), 'ไม่มีตารางแบบไม่มีส่วนลดปนมา');
});

test('V4 doc: ส่วนลดท้ายใบที่เก็บ % เกิน 100 ไว้ ต้องพิมพ์ป้ายไม่เกิน 100% (ให้ตรงกับยอดที่หักจริง)', () => {
  // แถวก่อนมี clamp ฝั่งบันทึก: เก็บ 250% ไว้ แต่ยอดที่หักได้จริงคือ 100% ของฐาน
  // (ช่องส่วนลดรายบรรทัดพิมพ์ยอดเงินอย่างเดียว จึงไม่มีอัตราให้ขัดกันตั้งแต่ต้น)
  const q = {
    ...baseQuote([lineOf('1', {
      discountType: 'percent', discountValue: 150, discountAmount: 500, lineTotal: 500,
    })]),
    discountType: 'percent', discountValue: 250, discountAmount: 500,
  };
  const html = buildQuotationMasterHTML(q, {});
  // เทียบเฉพาะจุดที่พิมพ์อัตรา — เลข 150/250 โผล่ในพาธของโลโก้ SVG ได้ ไม่เกี่ยวกัน
  assert.match(html, /หัก ส่วนลด 100%/, 'ป้ายส่วนลดท้ายใบตัดที่ 100%');
  assert.doesNotMatch(html, /หัก ส่วนลด 250%/, 'ไม่พิมพ์ค่าดิบของส่วนลดท้ายใบ');
  assert.doesNotMatch(html, /class="itemDiscountRate"/, 'บรรทัดไม่พิมพ์อัตราเลย');
});
