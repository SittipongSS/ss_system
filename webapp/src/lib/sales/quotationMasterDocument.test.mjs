import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuotationMasterHTML,
  buildQuotationMasterSwitchableHTML,
  renderQuotationMasterDocumentHTML,
} from './quotationMasterDocument.js';
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
  // ใบไทยพิมพ์ชื่อเอกสารไทยอย่างเดียว — ไม่มีบรรทัดชื่ออังกฤษใต้หัวอีกแล้ว
  // (มติผู้ใช้ 2026-08-21: หัวเอกสารภาษาเดียวทีละภาษา)
  assert.ok(!html.includes('QUOTATION'), 'ใบไทยต้องไม่มีชื่อเอกสารภาษาอังกฤษบนหัว');
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

/* ⚠️ ข้อนี้เคยยืนยันตรงกันข้าม ("ไม่โชว์สาขา") ตามมติ 2026-08-05 ที่ตัดแถวสาขาออกเพราะ
   ตอนนั้นเลขสาขาฝังอยู่ในข้อความที่อยู่ · 2026-08-06 เลขสาขากลับมาเป็นฟิลด์แยกของแถว
   ที่อยู่ และ composeThaiAddress ไม่เคยเอามันใส่ข้อความ ⇒ เอกสารเลยไม่มีสาขาเลยตั้งแต่
   นั้น (12 ใบใน production ออกให้สาขาโดยไม่มีเลขสาขาบนกระดาษ = ใบกำกับภาษีเต็มรูปผิด) */
test('V4 doc: บล็อกลูกค้า — โชว์เลขภาษี + สาขา + ที่อยู่จัดส่ง', () => {
  const q = {
    ...baseQuote([lineOf('1')]),
    customerTaxId: '0105561000000',
    billingAddress: 'ที่อยู่ออกบิล',
    shippingAddress: 'ที่อยู่จัดส่งต่างหาก',
    branchCode: '00001',
  };
  const html = buildQuotationMasterHTML(q, {});
  assert.match(html, /เลขผู้เสียภาษี<\/dt><dd>0105561000000/);
  assert.match(html, /<dt>สาขา<\/dt><dd>สาขาที่ 00001/);
  assert.match(html, /ที่อยู่จัดส่ง<\/dt><dd>ที่อยู่จัดส่งต่างหาก/);
});

test('V4 doc: สาขา — 00000/ข้อความ "สำนักงานใหญ่" อ่านเป็นสำนักงานใหญ่, ชื่อสาขาพิมพ์ตามเดิม', () => {
  const of = (branchCode, options = {}) => buildQuotationMasterHTML(
    { ...baseQuote([lineOf('1')]), branchCode }, options,
  );
  // '00000' คือค่าที่พบบ่อยที่สุด (คอลัมน์ not null เพราะอยู่ใน unique (taxId, branchCode))
  // — ต่อสตริงดิบจะได้ "สาขาที่ 00000" บนใบเกือบทุกใบ
  assert.match(of('00000'), /<dt>สาขา<\/dt><dd>สำนักงานใหญ่/);
  assert.match(of(null), /<dt>สาขา<\/dt><dd>สำนักงานใหญ่/);
  // ของจริงในฐานข้อมูล: บางรายกรอกช่องสาขาเป็นข้อความ
  assert.match(of('สำนักงานใหญ่'), /<dt>สาขา<\/dt><dd>สำนักงานใหญ่/);
  assert.match(of('แจ้งวัฒนะ'), /<dt>สาขา<\/dt><dd>แจ้งวัฒนะ/);
  assert.doesNotMatch(of('แจ้งวัฒนะ'), /สาขาที่ แจ้งวัฒนะ/);
  // ใบภาษาอังกฤษใช้ป้ายของตัวเอง
  assert.match(of('00001', { docLanguage: 'en' }), /<dt>Branch<\/dt><dd>Branch 00001/);
  assert.match(of('00000', { docLanguage: 'en' }), /<dt>Branch<\/dt><dd>Head Office/);
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

// ── ล็อกกติกา "สองชั้นคนละแบบ" (มติผู้ใช้ 2026-08-11) ───────────────────────────
// รายบรรทัด = ยอดเงินล้วน · ท้ายใบ = ยอดเงิน + อัตราเมื่อกรอกเป็น %
// เคยมีรอบที่ตัด % ท้ายใบทิ้งไปด้วยแล้วยกเลิกมติ — เทสต์ชุดนี้กันไม่ให้หลุดกลับมาเงียบ ๆ
test('V4 doc: บรรทัดตั้งส่วนลดเป็น % → ช่องส่วนลดพิมพ์แต่ยอดเงิน ไม่มีอัตรา', () => {
  const lines = [
    lineOf('1', { discountType: 'percent', discountValue: 5, discountAmount: 50, lineTotal: 950 }),
    lineOf('2'),
  ];
  const html = buildQuotationMasterHTML(baseQuote(lines), {});
  // ช่องส่วนลดของแถวแรก = ยอดที่หัก ปิดท้ายด้วย </td> ทันที (ไม่มี span อัตราคั่น)
  assert.match(html, /<td class="number">-50\.00<\/td>/, 'บรรทัดโชว์ยอดเงินล้วน');
  assert.doesNotMatch(html, /-50\.00[^<]*5%/, 'ไม่มีอัตราต่อท้ายยอดที่หัก');
  assert.doesNotMatch(html, /class="itemDiscountRate"/, 'ไม่มี element สำหรับอัตรารายบรรทัด');
  assert.match(html, /<td class="number">-<\/td>/, 'บรรทัดที่ไม่มีส่วนลดขึ้นขีด');
});

test('V4 doc: ส่วนลดท้ายใบตั้งเป็น % → ป้ายต้องมีอัตรากำกับคู่กับยอดเงิน', () => {
  const q = {
    ...baseQuote([lineOf('1')]),
    discountType: 'percent', discountValue: 5, discountAmount: 50,
  };
  const html = buildQuotationMasterHTML(q, {});
  assert.match(html, /<span>หัก ส่วนลด 5%<\/span><strong>-50\.00<\/strong>/, 'ท้ายใบมีอัตรา + ยอดเงิน');
});

test('V4 doc: ส่วนลดท้ายใบตั้งเป็นจำนวนเงิน → ป้ายไม่มีอัตราให้กำกับ', () => {
  const q = {
    ...baseQuote([lineOf('1')]),
    discountType: 'amount', discountValue: 300, discountAmount: 300,
  };
  const html = buildQuotationMasterHTML(q, {});
  assert.match(html, /<span>หัก ส่วนลด<\/span><strong>-300\.00<\/strong>/, 'ป้ายเปล่า + ยอดเงิน');
});

// ── ใบภาษาอังกฤษ (IS-26080005 · mig 0238) ──────────────────────────────────

/* ส่วนของเอกสารที่ "ป้ายต้องเป็นภาษาเดียวกันทั้งหมด" — ตัดสามอย่างที่ไม่ใช่ป้ายออกก่อน:
     1. <style> — เอกสารฝัง CSS ทั้งก้อน และคอมเมนต์ใน CSS เป็นไทย (เปลือกใช้ร่วมทุกชนิด)
     2. แถบเครื่องมือ no-print — ปุ่มของพนักงานไทยที่กดพิมพ์ ไม่ได้ติดไปกับกระดาษ
     3. บล็อกแบรนด์ — ชื่อนิติบุคคลไทยอยู่บนใบอังกฤษโดยตั้งใจ (มีเทสต์ของตัวเองด้านล่าง) */
const printedMarkup = (html) => html
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<div class="toolbar no-print">[\s\S]*?<\/div>/, '')
  .replace(/<div class="brandBlock">[\s\S]*?<div class="identityBlock">/g, '');

test('V4 doc: docLanguage=en → ป้ายทั้งใบเป็นอังกฤษ ไม่มีป้ายไทยตกค้าง', () => {
  /* ข้อมูลในใบทดสอบนี้เป็นอังกฤษล้วนโดยตั้งใจ (แบบใบจริงที่ส่งลูกค้าต่างชาติ) —
     ตัวอักษรไทยที่โผล่ในผลลัพธ์จึงมาจาก "ป้ายที่ลืมแปล" ได้อย่างเดียว ไม่ปนกับข้อมูล */
  const q = {
    ...baseQuote([
      lineOf('1', { description: 'Reed diffuser 100 ml', unit: 'pcs' }),
      lineOf('2', { description: 'Room spray 250 ml', unit: 'pcs' }),
    ]),
    docLanguage: 'en',
    customerName: 'ACME PTE LTD',
    billingAddress: '1 Marina Blvd, Singapore',
    contactName: 'Mr. Lim',
    paymentPlan: { type: 'full', paymentMethod: 'Bank transfer' },
    paymentTerms: 'Net 30 days',
    notes: 'Price excludes overseas freight.',
    approvedByName: 'Kanti T.',
    approvedByRole: 'Sales Manager',
    createdByName: 'Nattawut P.',
    deal: { title: 'Room Diffuser 2026', ownerName: 'Kanti T.' },
    project: { name: 'Signature Bloom' },
  };
  const html = printedMarkup(buildQuotationMasterHTML(q, {}));
  assert.doesNotMatch(html, /[฀-๿]/, 'ใบอังกฤษต้องไม่มีอักขระไทยเหลือบนกระดาษเลย');
  assert.match(html, /<html lang="en">/, 'ประกาศภาษาให้ตัวอ่านออกเสียง/ตัวพิมพ์รู้');
  // หัวเอกสาร + ตาราง + สรุปยอด + งวด + เงื่อนไข + ลงนาม + ท้ายกระดาษ
  for (const label of [
    'Tax ID', 'No.', 'Date', 'Valid Until', 'CUSTOMER', 'REFERENCE', 'Project No.', 'Quoted By',
    'Description', 'Qty', 'Unit Price', 'Amount', 'Subtotal', 'VAT', 'Grand Total', 'THB',
    'PAYMENT SCHEDULE', 'PAYMENT METHOD', 'PAYMENT TERMS', 'REMARKS',
    'Prepared By', 'Approved By', 'Confirmed By', 'Page',
  ]) {
    assert.ok(html.includes(label), `ขาดป้ายอังกฤษ "${label}"`);
  }
  // แถวงวดที่ระบบสังเคราะห์เองต้องแปลด้วย ไม่ใช่แค่หัวข้อ
  assert.ok(html.includes('Full payment'), 'แถวชำระเต็มจำนวนที่ระบบสร้างเองต้องเป็นอังกฤษ');
  // ข้อความที่ "คนกรอก" ไม่ถูกแปล — ระดับ 1 แปลเฉพาะป้าย (มติผู้ใช้)
  assert.ok(html.includes('Net 30 days'), 'เงื่อนไขชำระพิมพ์ตามที่คนกรอกไว้');
  assert.ok(html.includes('Reed diffuser 100 ml'), 'ชื่อสินค้าพิมพ์ตามที่คนกรอกไว้');
});

// หน่วยขายเคยเป็นข้อยกเว้นที่หลุดมาเป็นไทยบนใบอังกฤษ เพราะถูกจัดอยู่ฝั่ง "ค่าที่คนกรอก"
// ทั้งที่จริงมาจากลิสต์ปิดของ lib/master/units.js (IS-26080025 · มติผู้ใช้ 2026-08-13)
test('V4 doc: หน่วยขายแปลตามภาษาใบ — ไทยบนใบไทย อังกฤษบนใบอังกฤษ', () => {
  const lines = [
    lineOf('1', { description: 'Monthly scent service', unit: 'เดือน' }),
    lineOf('2', { description: 'Refill visit', unit: 'ครั้ง' }),
  ];
  const en = printedMarkup(buildQuotationMasterHTML({ ...baseQuote(lines), docLanguage: 'en' }, {}));
  assert.ok(en.includes('Month'), 'ใบอังกฤษต้องพิมพ์ Month');
  assert.ok(en.includes('Time'), 'ใบอังกฤษต้องพิมพ์ Time');
  assert.doesNotMatch(en, /เดือน|ครั้ง/, 'ห้ามมีหน่วยไทยเหลือบนใบอังกฤษ');

  const th = printedMarkup(buildQuotationMasterHTML({ ...baseQuote(lines), docLanguage: 'th' }, {}));
  assert.ok(th.includes('เดือน'), 'ใบไทยยังพิมพ์หน่วยไทยเหมือนเดิม');
  assert.ok(th.includes('ครั้ง'));
});

// ค่าเก่าที่หลุดลิสต์ไปแล้ว — เดาคำแปลแล้วผิดบนเอกสารลูกค้า แย่กว่าปล่อยเป็นไทย
test('V4 doc: หน่วยนอกลิสต์บนใบอังกฤษพิมพ์ตามเดิม ไม่เดาคำแปล', () => {
  const html = printedMarkup(buildQuotationMasterHTML({
    ...baseQuote([lineOf('1', { description: 'Legacy item', unit: 'โหล' })]),
    docLanguage: 'en',
  }, {}));
  assert.ok(html.includes('โหล'), 'หน่วยที่ระบบไม่รู้จักต้องพิมพ์ตามที่เก็บไว้');
});

test('V4 doc: ใบอังกฤษที่แบ่งงวดเอง — ชื่องวดที่คนตั้งพิมพ์ตามเดิม ไม่ถูกแปล', () => {
  const q = {
    ...baseQuote([lineOf('1')]),
    docLanguage: 'en',
    paymentPlan: {
      type: 'installment',
      paymentMethod: 'Bank transfer',
      installments: [
        { label: 'Deposit', percent: 50, note: '' },
        { label: 'มัดจำงวดสอง', percent: 50, note: '' },
      ],
    },
  };
  const html = printedMarkup(buildQuotationMasterHTML(q, {}));
  assert.ok(html.includes('Deposit'));
  assert.ok(html.includes('มัดจำงวดสอง'), 'ชื่องวดที่คนตั้งเองเป็นข้อมูล ไม่ใช่ป้าย');
  assert.ok(!html.includes('Full payment'), 'ใบที่แบ่งงวดไม่มีแถวสังเคราะห์');
});

test('V4 doc: ใบอังกฤษที่ข้อมูลยังเป็นไทย พิมพ์ข้อมูลตามที่กรอก — แปลเฉพาะป้าย (ระดับ 1)', () => {
  const q = { ...baseQuote([lineOf('1')]), docLanguage: 'en' };
  const html = printedMarkup(buildQuotationMasterHTML(q, {}));
  assert.ok(html.includes('ลูกค้าทดสอบ'), 'ชื่อลูกค้าไม่ถูกแตะ');
  assert.ok(html.includes('เครดิต 30 วัน'), 'เงื่อนไขชำระไม่ถูกแตะ');
  // ป้ายรอบ ๆ ข้อมูลนั้นยังต้องเป็นอังกฤษ
  assert.match(html, /<th class="center">No\.<\/th>/);
  assert.match(html, /<span>Grand Total<\/span>/);
});

test('V4 doc: ใบอังกฤษได้ชื่อ/ที่อยู่บริษัทอังกฤษล้วน — ไม่มีชื่อไทยเป็นบรรทัดรอง', () => {
  const company = {
    legalNameTh: 'บริษัท เซนท์ แอนด์ เซนส์ จำกัด',
    legalNameEn: 'SCENT AND SENSE CO., LTD.',
    address: '88 ถนนไทย กรุงเทพฯ',
    addressEn: '88 Thai Road, Bangkok',
  };
  const html = buildQuotationMasterHTML({ ...baseQuote([lineOf('1')]), docLanguage: 'en' }, { company });
  assert.match(html, /<strong>SCENT AND SENSE CO\., LTD\.<\/strong>/);
  /* ⭐ มติผู้ใช้ 2026-08-21: หัวเอกสารเป็นภาษาเดียวทีละภาษา — กลับมติเดิมที่ให้ชื่อไทย
     อยู่เป็นบรรทัดรอง "เพราะเป็นนิติบุคคลไทย" */
  assert.ok(!html.includes('บริษัท เซนท์ แอนด์ เซนส์ จำกัด'), 'ใบอังกฤษต้องไม่มีชื่อไทยบนหัวเอกสาร');
  assert.ok(html.includes('88 Thai Road, Bangkok'), 'ใช้ที่อยู่จดทะเบียนภาษาอังกฤษ');
  assert.ok(!html.includes('88 ถนนไทย กรุงเทพฯ'), 'ไม่พิมพ์ที่อยู่ไทยซ้ำ');
  // ชื่อท้ายกระดาษต้องเป็นชื่อเดียวกับบรรทัดบนสุด ไม่ใช่คนละภาษาคนละที่
  assert.match(html, /<footer class="footer">\s*<span>SCENT AND SENSE CO\., LTD\.<\/span>/);
});

test('V4 doc: ใบอังกฤษที่ยังไม่ได้กรอกที่อยู่อังกฤษ ถอยไปใช้ที่อยู่ไทย ไม่ปล่อยช่องว่าง', () => {
  // registeredAddressEn (mig 0120) ยังไม่ถูกกรอก — เป็นสถานะจริงของฐานตอนเริ่มใช้งาน
  // (ต่างจากชื่อบริษัทอังกฤษที่ resolveCompanyBlock มีค่าสำรองในตัวเสมอ)
  const company = { legalNameTh: 'บริษัท ทดสอบ จำกัด', legalNameEn: 'TEST CO., LTD.', address: '1 ถนนไทย', addressEn: '' };
  const html = buildQuotationMasterHTML({ ...baseQuote([lineOf('1')]), docLanguage: 'en' }, { company });
  assert.ok(html.includes('1 ถนนไทย'), 'ที่อยู่ไทยดีกว่าที่อยู่ว่างบนเอกสารที่ส่งลูกค้า');
  assert.match(html, /<strong>TEST CO\., LTD\.<\/strong>/);
});

test('V4 doc: ใบอังกฤษยังไม่อนุมัติ → ลายน้ำเป็น DRAFT', () => {
  const q = { ...baseQuote([lineOf('1')]), docLanguage: 'en', approvalStatus: 'pending' };
  const html = buildQuotationMasterHTML(q, {});
  assert.match(html, /class="watermark">DRAFT</);
});

test('V4 doc: ไม่ระบุภาษา = ใบไทยเดิมเป๊ะ (ใบสั่งขายและใบเก่าทุกใบเดินทางนี้)', () => {
  const html = buildQuotationMasterHTML(baseQuote([lineOf('1')]), {});
  assert.match(html, /<html lang="th">/);
  assert.match(html, /<h2>งวดชำระเงิน <span>\/ PAYMENT SCHEDULE<\/span><\/h2>/);
  assert.match(html, /<h2>ผู้ซื้อ <span>\/ CUSTOMER<\/span><\/h2>/);
  assert.match(html, /<th class="center">ลำดับ<\/th>/);
  assert.match(html, /<span>ยอดรวมทั้งสิ้น<\/span>/);
  assert.ok(html.includes('เลขประจำตัวผู้เสียภาษี'), 'ป้ายในบล็อกบริษัทคงเดิม');
  assert.ok(html.includes('หน้า 1 / '), 'เลขหน้าคงคำเดิม');
  assert.ok(html.includes('ชำระเต็มจำนวน'), 'แถวงวดสังเคราะห์คงคำเดิม');
});

test('V4 doc: แถบเครื่องมือด้านบนเป็นไทยเสมอ — คนกดพิมพ์คือพนักงานไทย', () => {
  const html = buildQuotationMasterHTML({ ...baseQuote([lineOf('1')]), docLanguage: 'en' }, {});
  assert.match(html, /class="toolbar-row"><h1>ใบเสนอราคา QT-2026-0001<\/h1>/);
  assert.match(html, />พิมพ์เอกสาร<\/button>/);
});

// ── สวิตช์ภาษาที่แถบพรีวิว (IS-26080005 · มติผู้ใช้ 2026-08-12) ─────────────

const switchableQuote = (over = {}) => ({
  ...baseQuote([lineOf('1'), lineOf('2')]),
  id: 'QT-abc123',
  status: 'draft',
  approvalStatus: 'not_submitted',
  approvedByName: null,
  ...over,
});

test('พรีวิว: ฝังทั้งสองภาษาในไฟล์เดียว · ฝั่งที่ไม่ได้เลือกถูกซ่อนด้วย CSS', () => {
  const html = buildQuotationMasterSwitchableHTML(switchableQuote(), { editable: true });
  assert.match(html, /<div class="langPane" data-lang="th">/);
  assert.match(html, /<div class="langPane" data-lang="en">/);
  // ทั้งสองฝั่งมีเนื้อจริง ไม่ใช่กล่องเปล่า
  assert.ok(html.includes('ยอดรวมทั้งสิ้น'), 'ฝั่งไทยมีเนื้อ');
  assert.ok(html.includes('Grand Total'), 'ฝั่งอังกฤษมีเนื้อ');
  // กติกาซ่อนต้องมาด้วย ไม่งั้นพิมพ์ออกมาได้เอกสารสองภาษาซ้อนกัน
  assert.match(html, /\.document\[data-active-lang="th"\] \.langPane\[data-lang="en"\]/);
  assert.match(html, /\.document\[data-active-lang="en"\] \.langPane\[data-lang="th"\]/);
});

test('พรีวิว: ภาษาที่เปิดมาคือภาษาที่ใบจำไว้ ไม่ใช่ค่าตั้งต้นตายตัว', () => {
  const th = buildQuotationMasterSwitchableHTML(switchableQuote(), { editable: true });
  assert.match(th, /data-active-lang="th"/);
  assert.match(th, /<html lang="th">/);

  const en = buildQuotationMasterSwitchableHTML(switchableQuote({ docLanguage: 'en' }), { editable: true });
  assert.match(en, /data-active-lang="en"/);
  assert.match(en, /<html lang="en">/);
  // ปุ่มที่ถูกเลือกต้องตรงกับภาษาที่เปิดมา
  assert.match(en, /data-lang="en" aria-pressed="true"/);
  assert.match(en, /data-lang="th" aria-pressed="false"/);
});

test('พรีวิว: ใบที่ยังแก้ได้มีสวิตช์ + สคริปต์บันทึกที่ยิงไปที่ใบใบนี้', () => {
  const html = buildQuotationMasterSwitchableHTML(switchableQuote(), { editable: true });
  assert.match(html, /class="langSwitch"/);
  assert.match(html, /ssSetDocLanguage/);
  assert.match(html, /'\/api\/sales-planning\/quotations\/' \+ encodeURIComponent\("QT-abc123"\)/);
  assert.match(html, /method: 'PATCH'/);
  assert.match(html, /JSON\.stringify\(\{ docLanguage: lang \}\)/);
  // บันทึกไม่ผ่านต้องมีทางบอกผู้ใช้ ไม่ใช่กลืนเงียบ
  assert.match(html, /บันทึกไม่สำเร็จ/);
});

test('พรีวิว: ใบที่ยื่น/อนุมัติแล้วไม่มีสวิตช์และไม่มีสคริปต์ — ภาษาถูกตรึงไปกับเอกสารแล้ว', () => {
  const html = buildQuotationMasterSwitchableHTML(
    switchableQuote({ docLanguage: 'en', approvalStatus: 'approved' }),
    { editable: false },
  );
  assert.doesNotMatch(html, /class="langSwitch"/);
  assert.doesNotMatch(html, /ssSetDocLanguage/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /ภาษาเอกสาร: English · เปลี่ยนไม่ได้แล้ว ต้องออก Rev\./);
  assert.doesNotMatch(html, /id="langNote"/, 'ไม่มีช่องแจ้งผลเพราะไม่มีอะไรให้บันทึก');
  // ยังต้องเปิดมาที่ภาษาของใบ
  assert.match(html, /data-active-lang="en"/);
});

test('พรีวิว: id ของใบถูก escape ก่อนฝังในสคริปต์ — ห้ามหลุดเป็นโค้ด', () => {
  const html = buildQuotationMasterSwitchableHTML(
    switchableQuote({ id: 'QT-x");alert(1);//' }),
    { editable: true },
  );
  assert.ok(html.includes('encodeURIComponent("QT-x\\");alert(1);//")'), 'ฝังเป็นสตริง JSON ที่ปลอดภัย');
  assert.doesNotMatch(html, /\);alert\(1\);\/\/"\)\)/, 'ไม่มีวงเล็บที่หลุดออกมาเป็นโค้ด');
});

test('พรีวิว: ชื่อไฟล์ตอนบันทึก PDF เท่ากันทั้งสองภาษา — ไฟล์เดียวกันคนละมุมมอง', () => {
  const th = buildQuotationMasterSwitchableHTML(switchableQuote(), { editable: true });
  const en = buildQuotationMasterSwitchableHTML(switchableQuote({ docLanguage: 'en' }), { editable: true });
  const titleOf = (html) => html.match(/<title>([^<]*)<\/title>/)[1];
  assert.equal(titleOf(th), titleOf(en));
});

test('พรีวิว: แถบเครื่องมือทั้งแถบเป็น no-print — ไม่ติดไปกับกระดาษที่ลูกค้าได้รับ', () => {
  const html = buildQuotationMasterSwitchableHTML(switchableQuote(), { editable: true });
  const toolbar = html.match(/<div class="toolbar no-print">[\s\S]*?\n  <\/div>/)[0];
  assert.ok(toolbar.includes('langSwitch'), 'สวิตช์อยู่ในแถบ no-print');
  assert.ok(toolbar.includes('btn-print'), 'ปุ่มพิมพ์อยู่ในแถบเดียวกัน');
  assert.match(html, /\.no-print \{ display: none/, 'CSS ตอนพิมพ์ซ่อนแถบนี้');
});

// ── จำนวนเงินตัวอักษรใต้ยอดรวมทั้งสิ้น (IS-26080034) ────────────────────────────
test('V4 doc: มีบรรทัดจำนวนเงินตัวอักษรอยู่ "ใต้" บล็อกยอดรวม ไม่ใช่ในกล่อง 74mm', () => {
  const html = buildQuotationMasterHTML(baseQuote([lineOf('a')]), {});
  assert.match(html, /<\/section>\s*<p class="amountWords">/, 'อยู่นอก section.totals');
  assert.match(html, /\(หนึ่งพันเจ็ดสิบบาทถ้วน\)/, 'อ่านยอดรวมทั้งสิ้นหลัง VAT');
});

// มติผู้ใช้ 2026-08-26: ไม่มีป้าย "จำนวนเงินตัวอักษร" บนกระดาษ เหลือแต่คำอ่านในวงเล็บ
test('V4 doc: ไม่มีป้ายกำกับหน้าคำอ่าน — เหลือแค่วงเล็บ', () => {
  const html = buildQuotationMasterHTML(baseQuote([lineOf('a')]), {});
  const words = html.match(/<p class="amountWords">.*?<\/p>/s)[0];
  assert.equal(words, '<p class="amountWords">(หนึ่งพันเจ็ดสิบบาทถ้วน)</p>');
  // เทียบเฉพาะกระดาษ — DOCUMENT_CSS มีคอมเมนต์ที่เอ่ยคำนี้และเดินทางไปกับไฟล์ด้วย
  assert.doesNotMatch(printedMarkup(html), /จำนวนเงินตัวอักษร/);
});

test('V4 doc: ใบอังกฤษได้คำอ่านอังกฤษ ไม่มีคำไทยหลุด', () => {
  const html = buildQuotationMasterHTML({ ...baseQuote([lineOf('a')]), docLanguage: 'en' }, {});
  const words = html.match(/<p class="amountWords">.*?<\/p>/s)[0];
  assert.equal(words, '<p class="amountWords">(One Thousand Seventy Baht Only)</p>');
  assert.doesNotMatch(words, /[฀-๿]/, 'ห้ามมีอักษรไทยบนใบอังกฤษ');
});

test('V4 doc: ตัวอักษรต้องอ่านยอดตัวเดียวกับที่พิมพ์ในแถวยอดรวมทั้งสิ้น', () => {
  const quote = { ...baseQuote([lineOf('a', { lineTotal: 1234.56, unitPrice: 123.456 })]) };
  const subtotal = 1234.56;
  const vatAmount = Math.round(subtotal * 0.07 * 100) / 100;
  const html = buildQuotationMasterHTML({ ...quote, subtotal, vatAmount, totalAmount: subtotal + vatAmount }, {});
  const grand = html.match(/<div class="grandTotal"><span>[^<]*<\/span><strong>([\d,.]+)/)[1];
  assert.equal(grand, '1,320.98');
  assert.match(html, /\(หนึ่งพันสามร้อยยี่สิบบาทเก้าสิบแปดสตางค์\)/);
});

// ใบสั่งขายใช้เครื่องยนต์เอกสารตัวเดียวกัน — บรรทัดนี้ต้องขึ้นด้วย ไม่ต้องแก้ salesOrderPrint
test('V4 doc: preview ของใบสั่งขายก็มีบรรทัดจำนวนเงินตัวอักษร', () => {
  const model = buildQuotationMasterPreview('compact', 'approved', 'v4', 'salesOrder');
  const html = renderQuotationMasterDocumentHTML(model, { documentLabel: 'ใบสั่งขาย' });
  assert.match(html, /<p class="amountWords">/);
});

// ── สวิตช์ภาษาเปิดได้แม้ใบอนุมัติแล้ว (มติผู้ใช้ 2026-08-27) ──────────────────
const switchableApproved = (over = {}) => ({
  ...baseQuote([lineOf('a')]), id: 'QT-1', status: 'sent', approvalStatus: 'approved', ...over,
});

test('สวิตช์ภาษา: ใบอนุมัติแล้วต้องได้ปุ่มจริง ไม่ใช่ป้าย "เปลี่ยนไม่ได้แล้ว"', () => {
  const html = buildQuotationMasterSwitchableHTML(switchableApproved(), { editable: true });
  assert.match(html, /class="langSwitch"/);
  assert.doesNotMatch(html, /เปลี่ยนไม่ได้แล้ว/);
});

test('สวิตช์ภาษา: ปิดสวิตช์แล้วต้องไม่มีทั้งปุ่ม สคริปต์ และกล่องยืนยัน', () => {
  const html = buildQuotationMasterSwitchableHTML(switchableApproved(), { editable: false });
  assert.match(html, /เปลี่ยนไม่ได้แล้ว/);
  // เทียบที่ markup ไม่ใช่ทั้งไฟล์ — CSS ของกล่องยืนยันอยู่ในเปลือกเอกสารทุกใบอยู่แล้ว
  assert.doesNotMatch(html, /id="langConfirm"/);
  assert.doesNotMatch(html, /ssSetDocLanguage/);
});

test('กล่องยืนยันขึ้นเมื่อบรรทัดสินค้าไม่มีชื่ออังกฤษ', () => {
  const html = buildQuotationMasterSwitchableHTML(switchableApproved(), { editable: true });
  assert.match(html, /id="langConfirm"/);
  assert.match(html, /ชื่อสินค้าทั้ง 1 บรรทัด ยังไม่มีชื่ออังกฤษ/);
  // ข้อจำกัดเรื่องลูกค้าต้องขึ้นเสมอ — เอกสารไม่มีทางเดินภาษาอังกฤษของลูกค้าเลย
  assert.match(html, /ชื่อและที่อยู่ลูกค้าพิมพ์เป็นภาษาไทยเสมอ/);
});

// ขากลับเป็นไทยไม่มีอะไรตกหล่น จึงต้องไม่ถาม
test('กล่องยืนยันถามเฉพาะขาไปอังกฤษ', () => {
  const html = buildQuotationMasterSwitchableHTML(switchableApproved(), { editable: true });
  assert.match(html, /if \(lang === 'en'\) \{ pending = lang; box\.hidden = false; return; \}/);
});

test('กล่องยืนยันอยู่นอกกระดาษและเป็น no-print', () => {
  const html = buildQuotationMasterSwitchableHTML(switchableApproved(), { editable: true });
  const paper = html.slice(html.indexOf('<div class="document'), html.indexOf('id="langConfirm"'));
  assert.ok(!paper.includes('langConfirmBox'), 'ห้ามอยู่ใน .document ไม่งั้นติดไปกับกระดาษ');
  assert.match(html, /class="langConfirm no-print"/);
});
