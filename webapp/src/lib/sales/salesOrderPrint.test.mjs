import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSalesOrderPrintHTML, openSalesOrderPrintWindow } from './salesOrderPrint.js';

const order = {
  orderNumber: 'SO-26070001-0', orderDate: '2026-07-16', paymentDueDate: '2026-08-15',
  status: 'approved', customerName: 'ลูกค้าทดสอบ', subtotal: 1000, discountAmount: 0,
  vatAmount: 70, totalAmount: 1070, lines: [], createdByName: 'คนกดสร้างใบ',
  submittedByName: 'ผู้ยื่น', approvedByName: 'ผู้อนุมัติ',
  quotation: { quoteNumber: 'QT-26070001-0', billingAddress: 'กรุงเทพฯ', paymentTerms: 'ชำระเต็มจำนวน' },
  deal: { title: 'ดีลทดสอบ', ownerName: 'AE ทดสอบ' }, project: { name: 'โครงการทดสอบ' },
};

test('Sale Order print ใช้เครื่องยนต์ V4 + FM-SA-03 + อ้างอิง QT ครบ', () => {
  const html = buildSalesOrderPrintHTML(order);
  // เครื่องยนต์เดียวกับ V4
  assert.match(html, /class="document v4/);
  assert.match(html, /FM-SA-03/);
  // หัวเอกสารภาษาเดียวทีละภาษา (มติผู้ใช้ 2026-08-21) — ใบสั่งขายเป็นเอกสารไทย
  assert.match(html, /ใบสั่งขาย/);
  assert.match(html, /SO-26070001-0/);
  // แถวอ้างอิง SO
  assert.match(html, /อ้างอิง QT<\/dt><dd>QT-26070001-0/);
  assert.match(html, /วันที่ SO<\/dt><dd>16\/07\/2026/);
  assert.match(html, /กำหนดชำระ<\/dt><dd>15\/08\/2026/);
  // ช่องลงชื่อ 3 ช่องแบบ SO — ป้ายเป็นหน่วยงาน (มติ 2026-08-05): ฝ่ายขาย /
  // ผู้จัดการฝ่ายขาย / ฝ่ายบัญชี · ยังไม่เซ็น = โชว์ชื่อ AE เจ้าของดีลไว้ให้เซ็น
  assert.match(html, /ฝ่ายขาย <span>AE เจ้าของดีล<\/span>[\s\S]*?\(AE ทดสอบ\)/);
  assert.doesNotMatch(html, /\(คนกดสร้างใบ\)/);
  assert.match(html, /ผู้จัดการฝ่ายขาย <span>AE Supervisor<\/span>[\s\S]*?\(ผู้อนุมัติ\)/);
  assert.match(html, /ฝ่ายบัญชี <span>/);
  assert.doesNotMatch(html, /ผู้ยื่นอนุมัติ/);
  // อนุมัติแล้ว = ไม่มีลายน้ำ
  assert.doesNotMatch(html, /class="watermark"/);
});

const DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('approved Sale Order stamps the approver e-signature image when the server embeds it', () => {
  const html = buildSalesOrderPrintHTML({
    ...order,
    approverSignature: {
      imageDataUri: DATA_URI,
      signerName: 'สมชาย ผู้อนุมัติ',
      signedAt: '2026-07-16T03:00:00.000Z',
      evidenceId: 'DSE-0001',
    },
  });
  // รูปลายเซ็นจริงถูกฝัง + ชื่อผู้ลงนาม (เลข Evidence ไม่ขึ้นกระดาษแล้ว — 2026-08-27)
  assert.match(html, /<img class="signatureImage" src="data:image\/png;base64,/);
  assert.match(html, /ลายเซ็น สมชาย ผู้อนุมัติ/);
  assert.doesNotMatch(html, /Evidence/, 'เลข evidence ไม่ขึ้นกระดาษ');
  assert.doesNotMatch(html, /DSE-0001/);
  // ไม่หล่นไปช่องเซ็นเปล่า
  assert.doesNotMatch(html, /ผู้อนุมัติ <span>ผู้จัดการฝ่ายขาย<\/span>[\s\S]*?\(ผู้อนุมัติ\)/);
});

test('approved Sale Order stamps the proposer (salesperson) e-signature image', () => {
  const html = buildSalesOrderPrintHTML({
    ...order,
    proposerSignature: { imageDataUri: DATA_URI, signerName: 'อารีย์ พนักงานขาย' },
  });
  assert.match(html, /<img class="signatureImage" src="data:image\/png;base64,/);
  assert.match(html, /ลายเซ็น อารีย์ พนักงานขาย/);
  // ช่องฝ่ายขายไม่หล่นไปช่องเซ็นเปล่า
  assert.doesNotMatch(html, /ฝ่ายขาย <span>AE เจ้าของดีล<\/span>[\s\S]*?\(AE ทดสอบ\)/);
});

// ลายเซ็นที่ระบบ stamp มาเป็นของผู้สร้างใบ — ห้ามเอาชื่อ AE เจ้าของดีลไปแปะทับ
// ไม่งั้นเอกสารจะได้ชื่อคนหนึ่งยืนคู่ลายมือของอีกคน
test('เซ็นแล้ว → ช่องฝ่ายขายใช้ชื่อคนที่เซ็นจริง ไม่ใช่ AE เจ้าของดีล', () => {
  const html = buildSalesOrderPrintHTML({
    ...order,
    proposerSignature: { imageDataUri: DATA_URI, signerName: 'คนที่เซ็นจริง' },
  });
  assert.match(html, /ลายเซ็น คนที่เซ็นจริง/);
  assert.doesNotMatch(html, /ลายเซ็น AE ทดสอบ/);
});

// ดีลไม่มีเจ้าของ → เว้นว่างไว้ให้เซ็น ไม่ถอยไปใช้ชื่อคนกดสร้างใบ (คนละบทบาท)
test('ดีลไม่มีเจ้าของ → ช่องฝ่ายขายเว้นว่าง ไม่ใช้ชื่อคนกดสร้างใบ', () => {
  const html = buildSalesOrderPrintHTML({ ...order, deal: { title: 'ดีลทดสอบ' } });
  assert.doesNotMatch(html, /\(คนกดสร้างใบ\)/);
  assert.match(html, /ฝ่ายขาย <span>AE เจ้าของดีล<\/span>/);
});

test('approved Sale Order without embedded images falls back to blank sign boxes for both signers', () => {
  const html = buildSalesOrderPrintHTML(order);
  // ไม่มี <img> ลายเซ็น (CSS .signatureImage ยังอยู่เสมอ จึงเช็คเฉพาะ tag รูป)
  assert.doesNotMatch(html, /<img class="signatureImage"/);
  assert.match(html, /ฝ่ายขาย <span>AE เจ้าของดีล<\/span>[\s\S]*?\(AE ทดสอบ\)/);
  assert.match(html, /ผู้จัดการฝ่ายขาย <span>AE Supervisor<\/span>[\s\S]*?\(ผู้อนุมัติ\)/);
});

test('unapproved Sale Order print carries a visible status watermark', () => {
  const html = buildSalesOrderPrintHTML({ ...order, status: 'draft' });
  assert.match(html, /class="watermark">ฉบับร่าง/);
  assert.match(html, /สถานะเอกสาร<\/dt><dd>ฉบับร่าง/);
  // รออนุมัติก็นับเป็นร่าง (คำเดียวทั้ง QT/SO) — แต่ใบยกเลิกคงคำว่า ยกเลิก
  assert.match(buildSalesOrderPrintHTML({ ...order, status: 'pending_approval' }), /class="watermark">ฉบับร่าง/);
  assert.match(buildSalesOrderPrintHTML({ ...order, status: 'cancelled' }), /class="watermark">เอกสารยกเลิก/);
});

test('Sale Order แสดงข้อมูลลูกค้าครบ รวมเลขผู้เสียภาษี (snapshot จากใบเสนอราคาที่ผูก)', () => {
  const html = buildSalesOrderPrintHTML({
    ...order,
    customerName: 'บริษัท ลูกค้า จำกัด',
    quotation: {
      ...order.quotation,
      customerTaxId: '0105551234567',
      billingAddress: '123 ถนนสุขุมวิท',
      shippingAddress: '456 คลังสินค้า',
      contactName: 'คุณสมชาย',
      contactPhone: '021234567',
    },
  });
  assert.match(html, /บริษัท ลูกค้า จำกัด/);
  assert.match(html, /เลขผู้เสียภาษี<\/dt><dd>0105551234567/);
  assert.match(html, /123 ถนนสุขุมวิท/);
  assert.match(html, /456 คลังสินค้า/);
  // ⭐ เบอร์บนกระดาษจัดรูปแบบผ่าน `fmtPhone` เหมือนทุกที่บนจอ (2026-08-11) —
  // เดิมพิมพ์ตัวเลขติดกันดิบ ๆ ซึ่งเป็นรูปเดียวในระบบที่ไม่มีขีดคั่น
  assert.match(html, /คุณสมชาย · 02-123-4567/);
});

test('Sale Order VAT rate is rounded — no float noise like 7.000000000000001%', () => {
  // 76.23 / 1089 * 100 = 7.000000000000001 บนเลขทศนิยม IEEE — เอกสารต้องโชว์ 7%
  const html = buildSalesOrderPrintHTML({ ...order, subtotal: 1089, vatAmount: 76.23, totalAmount: 1165.23 });
  assert.match(html, /ภาษีมูลค่าเพิ่ม 7%/);
  assert.doesNotMatch(html, /7\.000000/);
});

test('Sale Order print renders into a prepared window', () => {
  const writes = [];
  const target = { closed: false, document: { open() {}, write(value) { writes.push(value); }, close() {} } };
  assert.equal(openSalesOrderPrintWindow(order, target), target);
  assert.match(writes.join(''), /window\.print/);
});

test('Sale Order รายการครบทุกบรรทัด + มูลค่ารวมโผล่ครั้งเดียว (แบ่งหน้า V4)', () => {
  const lines = Array.from({ length: 12 }, (_, index) => ({
    description: `สินค้าทดสอบ ${index + 1}`,
    qty: 1,
    unitPrice: 100,
    lineTotal: 100,
    sortOrder: index,
  }));
  const html = buildSalesOrderPrintHTML({ ...order, lines });

  // อย่างน้อย 1 แผ่น A4 (V4 sheet) + เลขหน้า
  assert.ok((html.match(/class="sheet"/g) || []).length >= 1);
  assert.match(html, /หน้า 1 \//);
  // มูลค่ารวมโผล่ครั้งเดียว
  assert.equal((html.match(/รวมสินค้า \/ บริการ/g) || []).length, 1);
  // ทุกบรรทัดสินค้าอยู่ครบ ไม่ซ้ำ ไม่หาย
  for (let index = 1; index <= 12; index += 1) {
    assert.equal((html.match(new RegExp(`สินค้าทดสอบ ${index}(?!\\d)`, 'g')) || []).length, 1);
  }
});

// ── ช่องลงชื่อ "ฝ่ายบัญชี" (mig 0251 · มติผู้ใช้ 2026-08-13) ──────────────
/* ⭐ ช่องที่สามมีอยู่บนใบตั้งแต่มติ 2026-08-05 แต่ว่างมาตลอดเพราะไม่มีใครเซ็น —
   ขั้นบัญชีตรวจใบเป็นตัวเติม ไม่ใช่การเพิ่มช่องใหม่ */
test('บัญชียังไม่เซ็น = ช่องฝ่ายบัญชีว่างเหมือนเดิม ไม่หายไปจากเอกสาร', () => {
  const html = buildSalesOrderPrintHTML(order, null, null);
  assert.match(html, /ฝ่ายบัญชี/);
});

test('บัญชีเซ็นแล้ว = ฝังรูปลายเซ็นพร้อมชื่อผู้ตรวจในช่องฝ่ายบัญชี', () => {
  const html = buildSalesOrderPrintHTML({
    ...order,
    financeApprovedByName: 'Saowalak Muangsri',
    financeSignature: {
      imageDataUri: 'data:image/png;base64,AAAA',
      signerName: 'Saowalak Muangsri',
      signedAt: '2026-08-13T08:00:00.000Z',
      evidenceId: 'DSE-fin-1',
    },
  }, null, null);
  assert.match(html, /Saowalak Muangsri/);
  assert.match(html, /data:image\/png;base64,AAAA/);
  assert.doesNotMatch(html, /DSE-fin-1/, 'เลข evidence ไม่ขึ้นกระดาษ เหมือนช่องผู้อนุมัติ');
});

/* ⚠️ ลายเซ็นบัญชีต้อง **ไม่** ไปโผล่ในช่องผู้อนุมัติหรือผู้จัดทำ — สามช่องคนละคน */
test('ลายเซ็นบัญชีไม่ทับช่องอื่น', () => {
  const html = buildSalesOrderPrintHTML({
    ...order,
    financeSignature: { imageDataUri: 'data:image/png;base64,FIN', signerName: 'บัญชี', evidenceId: 'DSE-f' },
  }, null, null);
  // มีรูปเดียวในเอกสาร = ของบัญชีเท่านั้น (ช่องอื่นยังไม่มีลายเซ็นในเคสนี้)
  assert.equal((html.match(/data:image\/png;base64,FIN/g) || []).length, 1);
});

// ── อัตรา VAT บนกระดาษต้องตรงกับใบเสนอราคาต้นทาง (แก้ 2026-08-16) ──────────
test('ใบยอดศูนย์/ให้ฟรี: พิมพ์อัตราของใบเสนอราคา ไม่ใช่ 0% จากการคิดย้อน', () => {
  /* 🐞 เดิมคิดย้อน `vat ÷ (total − vat)` ⇒ ฐานภาษี 0 → ตัวหาร 0 → พิมพ์ "VAT 0%"
     ขณะที่ใบเสนอราคาต้นทางพิมพ์ "VAT 7%" · วัดกับข้อมูลจริง 10 จาก 18 ใบเป็นแบบนี้ */
  const html = buildSalesOrderPrintHTML({
    ...order,
    subtotal: 3000, discountAmount: 3000, vatAmount: 0, totalAmount: 0,
    quotation: { ...order.quotation, vatRate: 7 },
  });
  assert.match(html, /ภาษีมูลค่าเพิ่ม 7%/);
  assert.doesNotMatch(html, /ภาษีมูลค่าเพิ่ม 0%/);
});

test('ใบปกติ: อัตราของใบเสนอราคาชนะการคิดย้อน (ได้เลขเดียวกันอยู่แล้ว)', () => {
  const html = buildSalesOrderPrintHTML({ ...order, quotation: { ...order.quotation, vatRate: 7 } });
  assert.match(html, /ภาษีมูลค่าเพิ่ม 7%/);
});

test('ใบเก่าที่ไม่มีอัตราบนใบเสนอราคา: ยังคิดย้อนได้เหมือนเดิม ไม่ตกเป็น 0%', () => {
  // 1070 − 70 = 1000 ฐาน · 70/1000 = 7%
  const html = buildSalesOrderPrintHTML(order); // quotation ไม่มี vatRate
  assert.match(html, /ภาษีมูลค่าเพิ่ม 7%/);
});

test('ใบเก่าไม่มีอัตรา + ฐานภาษีเป็น 0: ยังพิมพ์ได้ ไม่พัง (0%)', () => {
  const html = buildSalesOrderPrintHTML({
    ...order, subtotal: 0, discountAmount: 0, vatAmount: 0, totalAmount: 0,
  });
  assert.match(html, /ภาษีมูลค่าเพิ่ม 0%/);
  assert.doesNotMatch(html, /NaN/);
});

// ── ภาษาเอกสารของใบสั่งขาย (มติผู้ใช้ 2026-08-27 · mig 0295) ─────────────────
test('SO: ไม่ส่งภาษา = ไทยเหมือนเดิม (ใบเก่าก่อนมีคอลัมน์)', () => {
  const html = buildSalesOrderPrintHTML(order);
  assert.match(html, /<html lang="th">/);
  assert.match(html, /ใบสั่งขาย/);
});

test('SO: docLanguage=en → ป้ายบนกระดาษเป็นอังกฤษ', () => {
  const html = buildSalesOrderPrintHTML({ ...order, docLanguage: 'en' });
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Grand Total/);
});

/* ชื่อ/ที่อยู่ลูกค้าภาษาอังกฤษบนใบสั่งขาย (มติผู้ใช้ 2026-09-03) — ลำดับที่มาต้องตรงกับ
   buildIssuedSalesOrderPayload เป๊ะ (ใบสั่งขายก่อน ถอยไปใบเสนอราคาที่ผูก) ไม่งั้นพิมพ์สด
   กับฉบับตรึงพิมพ์คนละภาษาบนใบเดียวกัน */
test('SO ภาษาอังกฤษ: ใช้ชื่อ/ที่อยู่อังกฤษของใบสั่งขายก่อน แล้วถอยไปใบเสนอราคาที่ผูก', () => {
  const own = buildSalesOrderPrintHTML({
    ...order,
    docLanguage: 'en',
    customerNameEn: 'ORDER CO., LTD.',
    billingAddressEn: '1 Order Road',
    quotation: { ...order.quotation, customerNameEn: 'QUOTE CO., LTD.', billingAddressEn: '9 Quote Road' },
  });
  assert.ok(own.includes('ORDER CO., LTD.') && own.includes('1 Order Road'), 'ค่าของใบสั่งขายชนะ');
  assert.ok(!own.includes('QUOTE CO., LTD.') && !own.includes('9 Quote Road'));

  const inherited = buildSalesOrderPrintHTML({
    ...order,
    docLanguage: 'en',
    quotation: { ...order.quotation, customerNameEn: 'QUOTE CO., LTD.', billingAddressEn: '9 Quote Road' },
  });
  assert.ok(inherited.includes('QUOTE CO., LTD.') && inherited.includes('9 Quote Road'), 'ถอยไปใบที่ผูก');
});

// ไม่มีคู่อังกฤษเลย = พิมพ์ไทยต่อ (ใบเก่าทุกใบ ซึ่งไม่ถูก backfill ตามมติ "ใบเก่าปล่อยไว้")
test('SO ภาษาอังกฤษที่ยังไม่มีคู่อังกฤษ — ถอยไปชื่อ/ที่อยู่ไทย ไม่ปล่อยช่องว่าง', () => {
  const html = buildSalesOrderPrintHTML({ ...order, docLanguage: 'en' });
  assert.ok(html.includes('ลูกค้าทดสอบ'), 'ชื่อลูกค้าไทยยังต้องขึ้นเอกสาร');
  assert.ok(html.includes('กรุงเทพฯ'), 'ที่อยู่ไทยยังต้องขึ้นเอกสาร');
});

/* ยามของมติ "ใบไทยต้องไม่ขยับ" ฝั่งใบสั่งขาย — เทียบด้วย === ไม่ใช่ assert.equal
   เพราะเอกสารเต็มไฟล์มีฟอนต์ base64 ต่างกันเมื่อไรจะพ่นทั้งไฟล์ออกมาจนอ่านไม่ออก */
test('SO ภาษาไทยไม่ขยับแม้ใบจะมีชื่อ/ที่อยู่อังกฤษครบ', () => {
  const th = { ...order, quotation: { ...order.quotation, shippingAddress: 'สมุทรปราการ' } };
  const withEn = buildSalesOrderPrintHTML({
    ...th,
    customerNameEn: 'ORDER CO., LTD.',
    billingAddressEn: '1 Order Road',
    shippingAddressEn: '2 Delivery Road',
  });
  assert.ok(withEn === buildSalesOrderPrintHTML(th), 'ใบไทยต้องออก HTML เดิมทุกตัวอักษร');
});

test('SO: โหมดสวิตช์ยิง PATCH ไปที่ route ของใบสั่งขาย ไม่ใช่ของใบเสนอราคา', () => {
  const html = buildSalesOrderPrintHTML(
    { ...order, id: 'SO-abc' }, null, null, { switchable: true, editable: true },
  );
  assert.match(html, /class="langSwitch"/);
  assert.match(html, /var url = "\/api\/sales-planning\/sales-orders\/SO-abc"/);
  assert.match(html, /\\"action\\":\\"set-doc-language\\"/);
  assert.match(html, /\\"language\\":\\"__LANG__\\"/);
  assert.doesNotMatch(html, /sales-planning\/quotations\//);
  // ใบสั่งขายใช้สคริปต์ก้อนเดียวกับใบเสนอราคา — พังพร้อมกันเสมอ จึงต้องมียามฝั่งนี้ด้วย
  // (🐞 codemod #1503 เปลี่ยนเป็น apiFetch ⇒ ReferenceError ในหน้าต่างที่ document.write)
  assert.doesNotMatch(html, /[^.\w]apiFetch\s*\(/);
  assert.match(html, /[^.\w]fetch\(url,/);
});

test('SO: สวิตช์ปิด = เป็นป้ายอ่านอย่างเดียว ไม่มีสคริปต์', () => {
  const html = buildSalesOrderPrintHTML(
    { ...order, id: 'SO-abc' }, null, null, { switchable: true, editable: false },
  );
  assert.match(html, /เปลี่ยนไม่ได้แล้ว/);
  assert.doesNotMatch(html, /ssSetDocLanguage/);
});

/* ── ภาษาเอกสารของใบสั่งขาย ───────────────────────────────────────────────
   🐞 ที่มา 2026-08-27: #1457 เพิ่มคอลัมน์ docLanguage + สวิตช์ + แม่แบบแปลป้ายของตัวเอง
   ครบแล้ว แต่ป้ายที่ salesOrderPrint ประกอบเองแล้วส่งผ่าน options ข้าม L.t() ไป
   ⇒ ใบอังกฤษยังพิมพ์ไทย 13 จุด (วัดจากใบจริงบน production) */
const soLabelsEn = [
  'SO Date', 'Payment Due', 'Quotation Ref.', 'Document Status',
  'Project No.', 'Project Type', 'Proposed By',
  'Sales', 'Sales Manager', 'Finance',
];
const soLabelsTh = [
  'วันที่ SO', 'กำหนดชำระ', 'อ้างอิง QT', 'สถานะเอกสาร',
  'เลขที่โครงการ', 'ประเภทโครงการ', 'ผู้เสนอราคา',
  'ฝ่ายขาย', 'ผู้จัดการฝ่ายขาย', 'ฝ่ายบัญชี',
];

test('ใบสั่งขายภาษาอังกฤษ: ป้ายระบบต้องเป็นอังกฤษครบ ไม่มีไทยหลุด', () => {
  const html = buildSalesOrderPrintHTML({ ...order, status: 'draft', docLanguage: 'en' });
  for (const label of soLabelsEn) assert.ok(html.includes(label), `ต้องมีป้าย "${label}"`);
  // ป้ายไทยของ **ระบบ** ต้องไม่หลุดมาเลย (ข้อความที่คนกรอกยังเป็นไทยได้ตามกติกา "ไม่แปลให้เอง")
  const sheet = html.slice(html.indexOf('<div class="sheet'));
  for (const label of soLabelsTh) assert.ok(!sheet.includes(`<dt>${label}</dt>`), `ป้ายไทยหลุด: ${label}`);
});

test('ใบสั่งขายภาษาไทยต้องเหมือนเดิมเป๊ะ — ไม่ระบุภาษา = ไทย', () => {
  for (const o of [{ ...order, status: 'draft' }, { ...order, status: 'draft', docLanguage: 'th' }]) {
    const html = buildSalesOrderPrintHTML(o);
    for (const label of soLabelsTh) assert.ok(html.includes(label), `ต้องมีป้าย "${label}"`);
  }
});

test('ลายน้ำเดินตามภาษาของใบ — เคสที่ทำให้เจอบั๊กนี้', () => {
  // ⚠️ ลายน้ำมาจาก options ของ SO ซึ่ง **ทับ** ค่าที่แม่แบบเลือกตามภาษา
  // ⇒ ถ้าไม่แปลตรงนี้ ใบอังกฤษจะขึ้น "ฉบับร่าง" ทั้งที่ทั้งใบเป็นอังกฤษ
  assert.match(buildSalesOrderPrintHTML({ ...order, status: 'draft', docLanguage: 'en' }), /class="watermark">DRAFT</);
  assert.match(buildSalesOrderPrintHTML({ ...order, status: 'draft', docLanguage: 'th' }), /class="watermark">ฉบับร่าง</);
  assert.match(buildSalesOrderPrintHTML({ ...order, status: 'cancelled', docLanguage: 'en' }), /class="watermark">CANCELLED DOCUMENT</);
  assert.match(buildSalesOrderPrintHTML({ ...order, status: 'cancelled', docLanguage: 'th' }), /class="watermark">เอกสารยกเลิก</);
  // อนุมัติแล้ว = ไม่มีลายน้ำ ทั้งสองภาษา
  for (const lang of ['th', 'en']) {
    assert.doesNotMatch(buildSalesOrderPrintHTML({ ...order, status: 'approved', docLanguage: lang }), /class="watermark"/);
  }
});

test('สถานะเอกสารในบล็อกอ้างอิงแปลตามภาษา', () => {
  const statusOf = (status, docLanguage) => /<dt>(?:สถานะเอกสาร|Document Status)<\/dt><dd>([^<]*)</
    .exec(buildSalesOrderPrintHTML({ ...order, status, docLanguage }))?.[1];
  assert.equal(statusOf('draft', 'th'), 'ฉบับร่าง');
  assert.equal(statusOf('draft', 'en'), 'Draft');
  assert.equal(statusOf('pending_approval', 'en'), 'Pending Approval');
  assert.equal(statusOf('approved', 'en'), 'Approved');
  assert.equal(statusOf('cancelled', 'en'), 'Cancelled');
});

test('ไม่มีป้ายไทยตายตัวเหลือใน salesOrderPrint นอกจากป้ายแถบเครื่องมือ', () => {
  const src = readFileSync(new URL('./salesOrderPrint.js', import.meta.url), 'utf8');
  // ตัดคอมเมนต์ให้ขาดจริง (บล็อกคอมเมนต์ในไฟล์นี้เป็นภาษาไทยเกือบทั้งหมด)
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const thaiLiterals = [...code.matchAll(/'([^'\n]*[฀-๿][^'\n]*)'/g)].map((m) => m[1]);
  /* แถบเครื่องมือเป็นไทยเสมอโดยตั้งใจ — คนกดพิมพ์คือพนักงานไทย (มีเทสต์คุมไว้ที่
     quotationMasterDocument.test.mjs) · นอกจากนั้นห้ามมีป้ายไทยตายตัวเหลือ */
  const allowed = new Set(['ใบสั่งขาย', 'ไม่สามารถโหลดข้อมูลใบสั่งขายได้']);
  const leftover = thaiLiterals.filter((t) => !allowed.has(t));
  assert.deepEqual(leftover, [], `ป้ายไทยตายตัวที่ต้องย้ายไป DOC_LABEL_PAIRS: ${leftover.join(' · ')}`);
});
