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

test('V4 doc: ฉบับร่าง (pending) ขึ้นลายน้ำ "ฉบับร่าง"', () => {
  const q = { ...baseQuote([lineOf('1')]), approvalStatus: 'pending', approvedByName: null };
  const html = buildQuotationMasterHTML(q, {});
  assert.match(html, /class="watermark">ฉบับร่าง/);
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
