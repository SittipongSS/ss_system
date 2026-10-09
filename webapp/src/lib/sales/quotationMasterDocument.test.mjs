import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuotationMasterHTML,
  buildQuotationMasterSwitchableHTML,
  renderQuotationMasterDocumentHTML,
} from './quotationMasterDocument.js';
import {
  ITEM_TEXT_CHARS,
  QUOTATION_PREVIEW_SCENARIOS,
  buildQuotationMasterModelFromQuote,
  buildQuotationMasterPreview,
  itemTextChars,
  quotationDocLabels,
} from './quotationMasterTemplate.js';
// ── คอลัมน์ "แพ็ค/เดือน" (ท้ายไฟล์) ──
import { ITEM_TABLE_PACK_CSS, documentShellCss } from '../documents/documentShell.js';
import { PACK_COLUMN_LABEL } from './linePackView.js';
import { buildIssuedQuotationArtifactHtml } from './issuedQuotationSnapshot.js';
import { buildIssuedSalesOrderArtifactHtml } from './issuedSalesOrderSnapshot.js';
import { buildSalesOrderPrintHTML } from './salesOrderPrint.js';

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

test('V4 doc: ชื่อหมวดสินค้าต่อท้าย FG · แบรนด์ ตามภาษาของใบ (มติผู้ใช้ 2026-09-22)', () => {
  const line = lineOf('1', {
    metadata: { productBrand: 'SCENT AND SENSE', categoryName: 'น้ำหอม', categoryNameEn: 'Perfume' },
  });
  assert.ok(buildQuotationMasterHTML(baseQuote([line]), {}).includes('FG-1 · SCENT AND SENSE · น้ำหอม'));
  const en = buildQuotationMasterHTML({ ...baseQuote([line]), docLanguage: 'en' }, {});
  assert.ok(en.includes('FG-1 · SCENT AND SENSE · Perfume'));
  // บรรทัด/ใบเก่าที่ไม่มีชื่อหมวด = พิมพ์เหมือนเดิม ไม่มีตัวคั่นลอย
  const old = buildQuotationMasterHTML(baseQuote([lineOf('1', { metadata: { productBrand: 'SCENT AND SENSE' } })]), {});
  assert.ok(old.includes('FG-1 · SCENT AND SENSE</span>'));
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
  // เลขเปล่า — แถวมีป้าย 'สาขา' อยู่แล้ว ไม่ต้องมี 'สาขาที่' ซ้ำ (มติผู้ใช้ 2026-08-27)
  assert.match(html, /<dt>สาขา<\/dt><dd>00001</);
  assert.match(html, /ที่อยู่จัดส่ง<\/dt><dd>ที่อยู่จัดส่งต่างหาก/);
});

test('V4 doc: สาขา — เลขล้วนเสมอ ทั้งสองภาษา, ชื่อสาขาที่เป็นข้อความพิมพ์ตามเดิม', () => {
  const of = (branchCode, options = {}) => buildQuotationMasterHTML(
    { ...baseQuote([lineOf('1')]), branchCode }, options,
  );
  /* ⭐ มติผู้ใช้ 2026-08-27: ช่องเลขสาขาบนเอกสารพิมพ์ **เลขล้วน** รวมถึงสำนักงานใหญ่
     ที่เป็น '00000' — ไม่แปลเป็นคำ เพราะช่องนี้คือช่องเลขสาขาตามแบบกรมสรรพากร */
  assert.match(of('00000'), /<dt>สาขา<\/dt><dd>00000</);
  assert.match(of(null), /<dt>สาขา<\/dt><dd>00000</);
  // ของจริงในฐานข้อมูล: บางรายกรอกช่องสาขาเป็นข้อความ — อ่านเป็นสำนักงานใหญ่แล้วพิมพ์เลข
  assert.match(of('สำนักงานใหญ่'), /<dt>สาขา<\/dt><dd>00000</);
  assert.match(of('แจ้งวัฒนะ'), /<dt>สาขา<\/dt><dd>แจ้งวัฒนะ/);
  assert.doesNotMatch(of('แจ้งวัฒนะ'), /สาขาที่ แจ้งวัฒนะ/);
  // ⚠️ ห้ามกลับไปเติมคำนำหน้า — ป้ายแถวพูดแล้ว
  assert.doesNotMatch(of('00001'), /สาขาที่ 00001/);
  // ใบภาษาอังกฤษใช้ป้ายของตัวเอง
  // ใบอังกฤษได้เลขชุดเดียวกัน — ไม่ต้องแปลอะไรอีกแล้ว
  assert.match(of('00001', { docLanguage: 'en' }), /<dt>Branch<\/dt><dd>00001</);
  assert.match(of('00000', { docLanguage: 'en' }), /<dt>Branch<\/dt><dd>00000</);
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

/* ⭐ 2026-08-27: **เลิกพิมพ์ Evidence id ลงกระดาษ** — ใช้ประโยชน์ไม่ได้ (ไม่มีหน้า verify
   สาธารณะ) · ตัวข้อมูลยังเก็บครบ ตัดแค่การพิมพ์ ดูเหตุผลเต็มที่ signatureBox() ใน documentShell */
test('V4 doc: ช่องผู้เสนอราคาได้ชื่อ + วันที่จากหลักฐานการยื่น (ไม่พิมพ์ Evidence id)', () => {
  const png = 'data:image/png;base64,UFJPUA==';
  const html = buildQuotationMasterHTML(baseQuote([lineOf('1')]), {
    proposerSignatureImage: png,
    proposerEvidence: { id: 'DSE-9', signerName: 'ผู้ยื่นจริง', signedAt: '2026-07-26T04:00:00.000Z' },
  });
  assert.match(html, /ผู้ยื่นจริง/);
  assert.match(html, /26\/07\/2026/);
  // เลข evidence ต้องไม่ขึ้นกระดาษ แม้จะส่งเข้ามาครบ
  assert.doesNotMatch(html, /DSE-9/);
  assert.doesNotMatch(html, /Evidence/);
  // ไม่มีหลักฐาน (ใบเก่า) → stamp เชิงภาพ ไม่มี Evidence
  const legacy = buildQuotationMasterHTML(baseQuote([lineOf('1')]), { proposerSignatureImage: png });
  assert.doesNotMatch(legacy, /DSE-9/);
});

/* ⭐ มติผู้ใช้ 2026-09-22 "ชื่อ ตำแหน่ง ขอเป็นชื่อเต็ม" + "ปรับการแสดงชื่อตำแหน่งในใบ QT และ SO ด้วย"
   ผู้จัดทำ = ตำแหน่งเต็มจาก role ในหลักฐานการยื่น · ผู้อนุมัติ = จาก role ในหลักฐานการอนุมัติ (options.approverRole)
   🐞 เดิมช่องผู้อนุมัติอ่าน quote.approvedByRole ที่ไม่มีคอลัมน์จริง ⇒ ทุกใบพิมพ์คำกลาง "ผู้อนุมัติ" */
test('V4 doc: ช่องลงนามพิมพ์ตำแหน่งเต็มของคนที่เซ็นจริง · ไม่รู้ role = คำเดิม', () => {
  const png = 'data:image/png;base64,UFJPUA==';
  for (const docLanguage of ['th', 'en']) {
    const html = buildQuotationMasterHTML({ ...baseQuote([lineOf('1')]), docLanguage }, {
      proposerSignatureImage: png,
      proposerEvidence: { id: 'DSE-9', signerName: 'ผู้ยื่นจริง', signedAt: '2026-07-26T04:00:00.000Z', signerRole: 'senior_ae' },
      approverSignatureImage: png,
      approverRole: 'ae_supervisor',
    });
    const prepared = docLanguage === 'en' ? 'Prepared By' : 'ผู้จัดทำ';
    assert.match(html, new RegExp(`<h2>${prepared} <span>Senior Account Executive</span></h2>`), docLanguage);
    // ⭐ มติ 2026-09-22 "ย้าย": ตำแหน่งผู้อนุมัติแทนคำ Authorized signature ใต้ชื่อช่อง · บรรทัดวันที่มีแค่วันที่
    assert.match(html, /<span>Account Executive Supervisor<\/span><\/h2>/, `${docLanguage}: ตำแหน่งผู้อนุมัติใต้ชื่อช่อง`);
    assert.doesNotMatch(html, /Authorized signature/, `${docLanguage}: รู้ตำแหน่งแล้วไม่พิมพ์คำกลาง`);
    assert.match(html, /<p>\d{2}\/\d{2}\/\d{4}<\/p>/, `${docLanguage}: บรรทัดวันที่เหลือแค่วันที่`);
  }
  // ร่าง/ใบที่ไม่มีหลักฐาน = "พนักงานขาย" · ผู้อนุมัติไม่รู้ role = "Authorized signature" ใต้ชื่อช่อง (คำเดิมของช่องนี้)
  const legacy = buildQuotationMasterHTML(baseQuote([lineOf('1')]), {});
  assert.match(legacy, /<h2>ผู้จัดทำ <span>พนักงานขาย<\/span><\/h2>/);
  assert.match(legacy, /<span>Authorized signature<\/span><\/h2>/);
  assert.doesNotMatch(legacy, /<p>ผู้อนุมัติ · /);
  // role แปลก (ไม่อยู่ในทะเบียนตำแหน่ง) = คำเดิม ไม่พิมพ์โค้ดดิบ
  const odd = buildQuotationMasterHTML(baseQuote([lineOf('1')]), { approverRole: 'viewer', proposerEvidence: { signerRole: 'viewer' } });
  assert.doesNotMatch(odd, /viewer/);
});

// 🐞 ตรวจรอบสาม: พรีวิวในหน้าตั้งค่า (อนุมัติแล้ว) ยังพิมพ์ "พนักงานขาย" ใต้ช่องผู้จัดทำที่เซ็นแล้ว ทั้งที่ใบจริงพิมพ์ตำแหน่งเต็ม
test('พรีวิวใบเสนอราคา: ผู้จัดทำที่เซ็นแล้ว = ตำแหน่งเต็มแบบใบจริง · ร่าง = คำกลาง "พนักงานขาย" แบบใบจริง', () => {
  const approved = buildQuotationMasterPreview('compact', 'approved', 'v4');
  assert.equal(approved.signers[0].role, 'Account Executive');
  assert.ok(approved.signers[0].esignature, 'พรีวิวอนุมัติแล้ว = ช่องที่เซ็นแล้ว');
  const draft = buildQuotationMasterPreview('compact', 'draft', 'v4');
  assert.equal(draft.signers[0].role, 'พนักงานขาย');
  assert.equal(draft.signers[0].esignature, undefined);
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
  assert.match(html, /หัก ส่วนลด 100\.00%/, 'ป้ายส่วนลดท้ายใบตัดที่ 100%');
  assert.doesNotMatch(html, /หัก ส่วนลด 250/, 'ไม่พิมพ์ค่าดิบของส่วนลดท้ายใบ');
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
  assert.match(html, /<span>หัก ส่วนลด 5\.00%<\/span><strong>-50\.00<\/strong>/, 'ท้ายใบมีอัตรา + ยอดเงิน');
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

/* ── ชื่อ/ที่อยู่ "ลูกค้า" ตามภาษาของใบ (มติผู้ใช้ 2026-09-03) ──────────────
   ก่อนหน้านี้บล็อกผู้ซื้อพิมพ์ไทยเสมอแม้ใบเป็นอังกฤษ เพราะใบไม่เคยเก็บคู่ภาษาของ
   ลูกค้าเลย · เทสต์ฝั่ง "ไม่มีอังกฤษ = ถอยไปไทย" อยู่ในเทสต์ก่อนหน้านี้แล้ว */
test('V4 doc: ใบอังกฤษพิมพ์ชื่อ/ที่อยู่ลูกค้าเป็นอังกฤษ ไม่เหลือไทยในบล็อกผู้ซื้อ', () => {
  const q = {
    ...baseQuote([lineOf('1')]),
    docLanguage: 'en',
    customerNameEn: 'TEST CO., LTD.',
    billingAddressEn: '1 Test Road, Bangkok',
    shippingAddress: '2 ถนนจัดส่ง',
    shippingAddressEn: '2 Delivery Road, Samut Prakan',
  };
  const html = printedMarkup(buildQuotationMasterHTML(q, {}));
  assert.ok(html.includes('TEST CO., LTD.'), 'ชื่อลูกค้าภาษาอังกฤษ');
  assert.ok(html.includes('1 Test Road, Bangkok'), 'ที่อยู่ผู้ซื้อภาษาอังกฤษ');
  assert.ok(html.includes('2 Delivery Road, Samut Prakan'), 'ที่อยู่จัดส่งภาษาอังกฤษ');
  for (const thai of ['ลูกค้าทดสอบ', '1 ถนนทดสอบ', '2 ถนนจัดส่ง']) {
    assert.ok(!html.includes(thai), `ใบอังกฤษต้องไม่เหลือข้อความไทย "${thai}"`);
  }
});

// ใบที่ไม่ได้แยกที่อยู่จัดส่ง: แถวจัดส่งซ้ำที่อยู่ออกบิล — ต้องซ้ำ "ภาษาเดียวกับใบ"
// ไม่ใช่หล่นกลับไปที่อยู่ไทยเฉพาะแถวนั้น
test('V4 doc: ใบอังกฤษที่ไม่แยกที่อยู่จัดส่ง — แถวจัดส่งใช้ที่อยู่ออกบิลภาษาอังกฤษ', () => {
  const q = {
    ...baseQuote([lineOf('1')]),
    docLanguage: 'en',
    customerNameEn: 'TEST CO., LTD.',
    billingAddressEn: '1 Test Road, Bangkok',
  };
  const html = printedMarkup(buildQuotationMasterHTML(q, {}));
  assert.ok(!html.includes('1 ถนนทดสอบ'), 'ที่อยู่ไทยต้องไม่หลุดมาในแถวจัดส่ง');
  assert.equal((html.match(/1 Test Road, Bangkok/g) || []).length, 2, 'ทั้งช่องที่อยู่และแถวจัดส่ง');
});

// ⚠️ ยามของมติ "ห้ามทำให้ใบไทยเปลี่ยนหน้าตาแม้แต่พิกเซลเดียว" — ใบไทยที่กรอกอังกฤษ
// ครบต้องได้ HTML เดิมทุกตัวอักษร ไม่ใช่แค่ "ดูเหมือนเดิม"
// (เทียบด้วย === ไม่ใช่ assert.equal เพราะเอกสารเต็มไฟล์มีฟอนต์ base64 — ต่างกันเมื่อไร
//  ตัวรายงานผลจะพ่นทั้งไฟล์ออกมาจนอ่านไม่ออก)
test('V4 doc: ใบไทยไม่ขยับแม้ใบจะมีชื่อ/ที่อยู่อังกฤษครบ', () => {
  const th = {
    ...baseQuote([lineOf('1')]),
    shippingAddress: '2 ถนนจัดส่ง',
  };
  const withEn = buildQuotationMasterHTML({
    ...th,
    customerNameEn: 'TEST CO., LTD.',
    billingAddressEn: '1 Test Road, Bangkok',
    shippingAddressEn: '2 Delivery Road, Samut Prakan',
  }, {});
  assert.ok(withEn === buildQuotationMasterHTML(th, {}), 'ใบไทยต้องออก HTML เดิมทุกตัวอักษร');
});

/* ⚠️ ข้อยกเว้นเดียวของ "ใบไทยไม่แตะภาษาอังกฤษ": ช่องที่ **ไม่มีไทยเลย** ยังพิมพ์อังกฤษ
   ต่อ — เป็นมติ "อย่างน้อยหนึ่งภาษา" (2026-08-22) ที่ pickDocumentAddresses ทำอยู่แล้ว
   ตั้งแต่ตอนแช่แข็งที่อยู่ลงใบ (billing.address || billing.addressEn) · ที่นี่แค่เดินกติกา
   เดียวกันต่อ ดีกว่าพิมพ์ขีดบนเอกสารที่ส่งลูกค้า */
test('V4 doc: ใบไทยที่ช่องนั้นมีแต่ภาษาอังกฤษ — พิมพ์อังกฤษ ไม่ใช่ขีด', () => {
  const html = printedMarkup(buildQuotationMasterHTML({
    ...baseQuote([lineOf('1')]),
    customerName: '',
    customerNameEn: 'TEST CO., LTD.',
  }, {}));
  assert.ok(html.includes('TEST CO., LTD.'));
  assert.ok(html.includes('1 ถนนทดสอบ'), 'ช่องที่มีไทยยังพิมพ์ไทยตามเดิม');
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
  assert.match(html, /var url = "\/api\/sales-planning\/quotations\/QT-abc123"/);
  assert.match(html, /method: 'PATCH'/);
  // เนื้อคำขอเป็นเทมเพลตที่แทน __LANG__ ตอนกด — รูปเดียวใช้ได้ทั้งใบเสนอราคาและใบสั่งขาย
  assert.match(html, /bodyTpl\.replace\(\/__LANG__\/g, lang\)/);
  assert.match(html, /\\"docLanguage\\":\\"__LANG__\\"/);
  // บันทึกไม่ผ่านต้องมีทางบอกผู้ใช้ ไม่ใช่กลืนเงียบ
  assert.match(html, /บันทึกไม่สำเร็จ/);
});

/* 🐞 2026-08-28–09-03: codemod #1503 (fetch→apiFetch ทั้งเว็บ) แก้ `fetch(` ที่อยู่
   **ข้างในสตริงสคริปต์นี้** ด้วย ⇒ หน้าต่างพิมพ์ (document.write, ไม่มี bundle) โยน
   ReferenceError แบบ synchronous ⇒ .then/.catch ไม่ถูกผูก ⇒ ค้าง "กำลังบันทึก…"
   ปุ่มดับถาวร และไม่มีใบไหนบันทึกภาษาเอกสารได้เลยตลอด 6 วัน
   เทสต์เดิมยืนยันแค่ url/method/body จึงเขียวตลอด — ต้องยืนยัน **ตัวที่ถูกเรียก** ด้วย */
test('พรีวิว: สคริปต์ในหน้าต่างพิมพ์ต้องเรียก fetch ดิบ ห้าม apiFetch (ไม่มี bundle ให้เรียก)', () => {
  const html = buildQuotationMasterSwitchableHTML(switchableQuote(), { editable: true });
  assert.doesNotMatch(html, /[^.\w]apiFetch\s*\(/, 'apiFetch ไม่มีอยู่ในหน้าต่างที่ document.write');
  assert.match(html, /[^.\w]fetch\(url,/);
  // throw แบบ synchronous ต้องไม่ทำให้แถบเครื่องมือแช่แข็ง — ต้องมีทางคืนปุ่มเสมอ
  assert.match(html, /catch \(err\) \{/);
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
  // id ถูก encodeURIComponent ตั้งแต่ตอนประกอบ URL แล้วค่อย JSON.stringify ⇒ ไม่มีทาง
  // หลุดออกจากสตริงไปเป็นโค้ด · เครื่องหมายอันตรายต้องกลายเป็น %xx ทั้งหมด
  assert.match(html, /var url = "\/api\/sales-planning\/quotations\/QT-x%22\)%3Balert\(1\)%3B%2F%2F"/);
  assert.doesNotMatch(html, /alert\(1\);\/\//, 'ห้ามมีโค้ดดิบหลงเหลือในไฟล์');
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
  /* ⭐ ชื่อ/ที่อยู่ลูกค้าเป็นช่องที่ **กรอกให้ครบได้** แล้ว (มติผู้ใช้ 2026-09-03)
     ใบตัวอย่างนี้มีแต่ภาษาไทย ⇒ ต้องบอกว่าจะพิมพ์ไทย ไม่ใช่บอกว่า "พิมพ์ไทยเสมอ" */
  assert.match(html, /ชื่อลูกค้ายังไม่มีภาษาอังกฤษ/);
  assert.match(html, /ที่อยู่ลูกค้ายังไม่มีภาษาอังกฤษ/);
});

// อีกด้านของกติกาเดียวกัน: ไม่มีอะไรตกหล่น = ไม่ต้องถามก่อนสลับภาษา
test('กล่องยืนยันหายไปเมื่อกรอกคู่ภาษาครบทั้งใบ', () => {
  const html = buildQuotationMasterSwitchableHTML(switchableApproved({
    lines: [lineOf('a', { metadata: { descriptionEn: 'Reed Diffuser' } })],
    customerNameEn: 'Test Co., Ltd.',
    billingAddressEn: '1 Test Road',
  }), { editable: true });
  assert.doesNotMatch(html, /id="langConfirm"/);
  // สวิตช์ยังทำงาน แค่ไม่ต้องถามก่อน
  assert.match(html, /window\.ssSetDocLanguage = apply;/);
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

/* ── ตารางงวด/หมายเหตุที่ตัดข้ามหน้า (2026-09-17) ─────────────────────────────
   ผู้ใช้แจ้ง "เอกสาร QT / SO หน้าล้น" — ใบสั่งขายรายงวดยาวเกินหน้าท้ายเอกสารหน้าเดียว
   การแบ่งหน้าเกิดใน quotationMasterTemplate (v4PaymentSlots) ที่นี่ยืนยันว่ากระดาษ
   **พิมพ์ตามช่วงที่แบ่งไว้จริง** — ลำดับงวดนับต่อ ไม่รีเซ็ตเป็น 1 ทุกหน้า และหัวข้อบอก (ต่อ) */
const installmentPlanQuote = (count) => ({
  ...baseQuote([lineOf('1')]),
  paymentTerms: 'ชำระเงินเพื่อยืนยันการผลิตได้ที่\n\nธนาคารกสิกรไทย\nชื่อบัญชี บจก. เซนท์ แอนด์ เซนส์ แลบอราทอรี่\nเลขที่บัญชี 034-296-2459',
  notes: '1. ราคาที่เสนอยืนราคาภายใน 7 วัน\n2. ระยะเวลาการผลิต 30 - 45 วัน',
  paymentPlan: {
    type: 'installment',
    paymentMethod: 'โอนเข้าบัญชีบริษัท',
    installments: Array.from({ length: count }, (_, index) => ({
      label: `งวดที่ ${index + 1}`,
      note: `วางบิล 24/${String((index % 12) + 1).padStart(2, '0')}/2027`,
      percent: Number((100 / count).toFixed(2)),
    })),
  },
});

test('V4 doc: ตารางงวดที่ตัดข้ามหน้า — พิมพ์ครบทุกงวด ลำดับนับต่อ หัวข้อหน้าหลังบอก (ต่อ)', () => {
  const html = printedMarkup(buildQuotationMasterHTML(installmentPlanQuote(24), {}));
  // ทุกงวดต้องอยู่บนกระดาษ ครั้งเดียว
  for (let no = 1; no <= 24; no += 1) {
    const hits = html.split(`>${no}. งวดที่ ${no}<`).length - 1;
    assert.equal(hits, 1, `งวดที่ ${no} ต้องพิมพ์ครั้งเดียว`);
  }
  // หัวตารางซ้ำทุกหน้าที่มีตาราง แต่หน้าที่ต่อจากหน้าก่อนต้องขึ้นหัวข้อ (ต่อ)
  assert.equal(html.split('<h2>งวดชำระเงิน (ต่อ) ').length - 1, 1);
  assert.equal(html.split('<h2>งวดชำระเงิน <').length - 1, 1, 'หัวข้อเต็มมีได้หน้าเดียว');
});

test('V4 doc: หมายเหตุยาวเกินหน้า — หั่นตามบรรทัด ไม่ซ้ำบรรทัด และหน้าหลังขึ้น "หมายเหตุ (ต่อ)"', () => {
  const remarks = Array.from({ length: 40 }, (_, index) => `บรรทัดหมายเหตุที่ ${index + 1}`).join('\n');
  const html = printedMarkup(buildQuotationMasterHTML({ ...installmentPlanQuote(2), notes: remarks }, {}));
  for (let line = 1; line <= 40; line += 1) {
    assert.equal(html.split(`บรรทัดหมายเหตุที่ ${line}\n`).length - 1 + html.split(`บรรทัดหมายเหตุที่ ${line}</p>`).length - 1, 1, `บรรทัดที่ ${line} ต้องพิมพ์ครั้งเดียว`);
  }
  assert.equal(html.split('<h2>หมายเหตุ (ต่อ) ').length - 1, 1);
});

test('V4 doc: กลุ่มท้ายเอกสารที่ได้หน้าของตัวเอง — พิมพ์ครบทั้งสามกล่อง เริ่มใต้หัวข้อ', () => {
  const html = printedMarkup(buildQuotationMasterHTML(installmentPlanQuote(2), {}));
  assert.ok(html.includes('วิธีชำระเงิน'), 'กล่องวิธีชำระเงิน');
  assert.ok(html.includes('เงื่อนไขการชำระเงิน'), 'กล่องเงื่อนไข');
  assert.ok(html.includes('<h2>งวดชำระเงิน <'), 'หัวข้อตารางงวดแบบไม่ต่อ');
  // หน้าท้ายเอกสารของตัวเอง: เนื้อหาเริ่มใต้หัวข้อ ช่องลงชื่อถูกดันลงชิดขอบล่างด้วย CSS
  assert.ok(html.includes('class="paymentContent paymentFlow"'));
});

test('V4 doc: กลุ่มที่อยู่ใต้ตารางรายการ (combined) ยังชิดขอบล่างเหมือนเดิม', () => {
  const html = printedMarkup(buildQuotationMasterHTML(baseQuote([lineOf('1')]), {}));
  assert.ok(html.includes('class="paymentContent"'), 'หน้า combined ไม่ใส่คลาสจัดหน้าใหม่');
  assert.ok(!html.includes('paymentFlow'));
});

// ══ คอลัมน์ "แพ็ค/เดือน" บนกระดาษ (มติเจ้าของ 08/10 · mig 0407 · docs/qt-pack-column.md) ═══════════════════════
//
// สองฝั่งที่ต้องจริงพร้อมกัน:
//   ก. ใบที่ **ไม่มี** บรรทัดมีเลขแพ็ค (ใบจริงทุกใบในระบบวันนี้) = ไฟล์เดิมทุกไบต์ — markup และ CSS
//   ข. ใบที่ **มี** = คอลัมน์ระหว่างรายละเอียดกับจำนวน ตัดสินทั้งใบ · บรรทัดอื่นพิมพ์ขีด · หน่วยของบรรทัดแพ็คคือเดือน

/* บรรทัดหมวด 02-001 ที่มีเลขแพ็ค: 2 แพ็ค × 12 เดือน × 3,500 = 84,000 (ตัวอย่างของเจ้าของ) */
const packLine = (id, over = {}) => lineOf(id, {
  fgCode: 'FG-364-02-001-1061', description: 'ระบบกระจายกลิ่น · 1 package', packQty: 2, qty: 12, unit: 'เดือน',
  unitPrice: 3500, lineTotal: 84000, ...over,
});
const discountOn = { discountType: 'amount', discountValue: 200, discountAmount: 200, lineTotal: 800 };
/* ค่าที่ "ไม่ใช่เลขแพ็ค" — select * หลังรัน 0407 คืน null ทุกบรรทัด · ที่เหลือคือค่าที่เก็บลงฐานไม่ได้อยู่แล้ว */
const NOT_A_PACK = [null, undefined, '', '   ', 'abc', 0, '0', '02', 1.5, 10000, true];
const withPackKey = (doc, value) => ({ ...doc, lines: doc.lines.map((l) => ({ ...l, packQty: value })) });
/* ใบสั่งขายที่ห่อใบเสนอราคาตัวอย่าง — เดินเครื่องยนต์เดียวกันผ่าน buildSalesOrderPrintHTML */
const orderOf = (quote) => ({
  id: 'SO-1', orderNumber: 'SO-2026-0001', orderDate: '2026-07-25', status: 'approved', customerName: quote.customerName,
  lines: quote.lines, subtotal: quote.subtotal, discountAmount: 0, vatAmount: quote.vatAmount, totalAmount: quote.totalAmount,
  createdByName: 'ผู้จัดทำ', approvedByName: 'ผู้อนุมัติ', approvedAt: '2026-07-25T03:00:00.000Z', docLanguage: quote.docLanguage,
  quotation: { quoteNumber: quote.quoteNumber, billingAddress: quote.billingAddress, paymentPlan: quote.paymentPlan, paymentTerms: quote.paymentTerms },
  deal: { title: 'ดีล', ownerName: 'ผู้จัดทำ' },
});
/* ตัวสร้างไฟล์ทั้งสี่ทางของเครื่องยนต์เดียว: พิมพ์สด · หน้าต่างพิมพ์สองภาษา · ฉบับตรึงของใบเสนอราคา · ฉบับตรึงของใบสั่งขาย */
const BUILDERS = {
  plain: (quote) => buildQuotationMasterHTML(quote, { toolbar: false }),
  switchable: (quote) => buildQuotationMasterSwitchableHTML({ ...quote, id: 'QT-abc123' }, { editable: true }),
  quotationArtifact: (quote) => buildIssuedQuotationArtifactHtml(quote, {}),
  salesOrderArtifact: (quote) => buildIssuedSalesOrderArtifactHtml(orderOf(quote), {}),
  salesOrderPrint: (quote) => buildSalesOrderPrintHTML(orderOf(quote), null, null),
};
const itemTablesOf = (html) => html.match(/<table class="itemTable[\s\S]*?<\/table>/g) || [];
const headersOf = (tableHtml) => [...tableHtml.split('</thead>')[0].matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
/* ข้อความในช่องของแถวหนึ่ง — ช่องรายละเอียด (ช่องที่สอง) มี markup ซ้อนอยู่ จึงเก็บเป็น null */
const cellsOfRow = (rowHtml) => [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m, index) => (index === 1 ? null : m[1].trim()));
const bodyRowsOf = (tableHtml) => tableHtml.split('<tbody>')[1].split('</tbody>')[0].split('<tr>').slice(1).map(cellsOfRow);

test('คอลัมน์แพ็ค: ใบที่ไม่มีเลขแพ็คได้ไฟล์เดิมทุกไบต์ — ทุกค่าที่ไม่ใช่เลขแพ็ค · ทุกตัวสร้างไฟล์ · ทั้งสองภาษา · มี/ไม่มีส่วนลด', () => {
  for (const language of ['th', 'en']) {
    for (const lines of [[lineOf('1'), lineOf('2', { note: 'หมายเหตุสินค้า' })], [lineOf('1', discountOn), lineOf('2')]]) {
      const plain = { ...baseQuote(lines), docLanguage: language };
      for (const [name, build] of Object.entries(BUILDERS)) {
        const expected = build(plain);
        assert.ok(!expected.includes('withPack'), `${name}/${language}: ไม่มีคำว่า withPack ทั้งใน markup และ CSS`);
        assert.ok(!expected.includes('แพ็ค/เดือน') && !expected.includes('Pack/Month'), `${name}/${language}: ไม่มีหัวคอลัมน์แพ็ค`);
        // CSS ของไฟล์คือแผ่นกลางล้วน ๆ — ไม่มีอะไรต่อท้ายแม้ไบต์เดียว
        assert.ok(expected.includes(`<style>${documentShellCss('portrait')}</style>`), `${name}/${language}: <style> = แผ่นกลางเท่านั้น`);
        for (const value of NOT_A_PACK) {
          assert.equal(build(withPackKey(plain, value)), expected, `${name}/${language}: packQty=${JSON.stringify(value) ?? 'undefined'} ต้องได้ไฟล์เดียวกันทั้งไฟล์`);
        }
      }
    }
  }
});

/* ⛔ markup ของตารางรายการของใบที่ไม่มีเลขแพ็ค — **จับจากโค้ดก่อนเพิ่มคอลัมน์แพ็ค** (11c4d926) ทุกไบต์รวมช่องว่าง
   ห้ามแก้สตริงให้เทสต์เขียว: สตริงนี้เปลี่ยน = ไฟล์ของใบจริงทุกใบเปลี่ยน
   (บรรทัดช่องว่างใต้ช่องราคา/หน่วยของตารางแรกคือของเดิม — เงื่อนไขของช่องส่วนลดอยู่บรรทัดของตัวเองมาตั้งแต่ต้น
    ช่องแพ็คต้อง **ไม่** ทิ้งบรรทัดแบบนั้นเพิ่ม: ย้ายเงื่อนไขของช่องแพ็คไปอยู่บรรทัดของตัวเองเมื่อไร เทสต์นี้แดง) */
const PINNED_TABLE_PLAIN = "\n    <table class=\"itemTable\">\n      <thead>\n        <tr>\n          <th class=\"center\">ลำดับ</th>\n          <th>รายละเอียดสินค้า / บริการ</th>\n          <th class=\"number\">จำนวน</th>\n          <th class=\"center\">หน่วย</th>\n          <th class=\"number\">ราคา/หน่วย</th>\n          \n          <th class=\"number\">จำนวนเงิน</th>\n        </tr>\n      </thead>\n      <tbody>\n        <tr>\n          <td class=\"center\">1</td>\n          <td>\n            <span class=\"itemIdentity\">FG-1</span>\n            <strong class=\"itemName\">สินค้า 1</strong>\n            \n          </td>\n          <td class=\"number\">10</td>\n          <td class=\"center\">ชิ้น</td>\n          <td class=\"number\">100.00</td>\n          \n          <td class=\"number\">1,000.00</td>\n        </tr>\n        <tr>\n          <td class=\"center\">2</td>\n          <td>\n            <span class=\"itemIdentity\">FG-2</span>\n            <strong class=\"itemName\">สินค้า 2</strong>\n            <span class=\"itemNote\">หมายเหตุสินค้า</span>\n          </td>\n          <td class=\"number\">10</td>\n          <td class=\"center\">ชิ้น</td>\n          <td class=\"number\">100.00</td>\n          \n          <td class=\"number\">1,000.00</td>\n        </tr></tbody>\n    </table>";
const PINNED_TABLE_DISCOUNT = "\n    <table class=\"itemTable withLineDiscount\">\n      <thead>\n        <tr>\n          <th class=\"center\">ลำดับ</th>\n          <th>รายละเอียดสินค้า / บริการ</th>\n          <th class=\"number\">จำนวน</th>\n          <th class=\"center\">หน่วย</th>\n          <th class=\"number\">ราคา/หน่วย</th>\n          <th class=\"number\">ส่วนลด</th>\n          <th class=\"number\">จำนวนเงิน</th>\n        </tr>\n      </thead>\n      <tbody>\n        <tr>\n          <td class=\"center\">1</td>\n          <td>\n            <span class=\"itemIdentity\">FG-1</span>\n            <strong class=\"itemName\">สินค้า 1</strong>\n            \n          </td>\n          <td class=\"number\">10</td>\n          <td class=\"center\">ชิ้น</td>\n          <td class=\"number\">100.00</td>\n          <td class=\"number\">-200.00</td>\n          <td class=\"number\">800.00</td>\n        </tr>\n        <tr>\n          <td class=\"center\">2</td>\n          <td>\n            <span class=\"itemIdentity\">FG-2</span>\n            <strong class=\"itemName\">สินค้า 2</strong>\n            \n          </td>\n          <td class=\"number\">10</td>\n          <td class=\"center\">ชิ้น</td>\n          <td class=\"number\">100.00</td>\n          <td class=\"number\">-</td>\n          <td class=\"number\">1,000.00</td>\n        </tr></tbody>\n    </table>";

test('คอลัมน์แพ็ค: ตารางรายการของใบที่ไม่มีเลขแพ็ค = markup ที่จับไว้ก่อนเพิ่มคอลัมน์ ทุกไบต์รวมช่องว่าง', () => {
  const tableOf = (html) => html.match(/\n    <table class="itemTable[\s\S]*?<\/table>/)[0];
  const plain = baseQuote([lineOf('1'), lineOf('2', { note: 'หมายเหตุสินค้า' })]);
  const discount = baseQuote([lineOf('1', discountOn), lineOf('2')]);
  assert.equal(tableOf(buildQuotationMasterHTML(plain, {})), PINNED_TABLE_PLAIN);
  assert.equal(tableOf(buildQuotationMasterHTML(discount, {})), PINNED_TABLE_DISCOUNT);
  // บรรทัดที่มีคีย์ packQty แต่ไม่มีเลข (สิ่งที่ select * คืนหลังรัน 0407) ได้ markup เดียวกัน
  assert.equal(tableOf(buildQuotationMasterHTML(withPackKey(plain, null), {})), PINNED_TABLE_PLAIN);
  assert.equal(tableOf(buildQuotationMasterHTML(withPackKey(discount, null), {})), PINNED_TABLE_DISCOUNT);
});

test('คอลัมน์แพ็ค: มีบรรทัดมีเลขแพ็ค = หัวคอลัมน์ + คลาส withPack + ตัวเลข อยู่ระหว่างรายละเอียดกับจำนวน · บรรทัดอื่นพิมพ์ขีด', () => {
  const html = buildQuotationMasterHTML(baseQuote([packLine('1'), lineOf('2'), lineOf('3')]), {});
  const [table] = itemTablesOf(html);
  assert.match(table, /^<table class="itemTable withPack">/);
  assert.ok(table.includes('<th class="number">แพ็ค/เดือน</th>'));
  assert.deepEqual(headersOf(table), ['ลำดับ', 'รายละเอียดสินค้า / บริการ', 'แพ็ค/เดือน', 'จำนวน', 'หน่วย', 'ราคา/หน่วย', 'จำนวนเงิน']);
  // ลำดับช่องของแต่ละแถว: ลำดับ · (รายละเอียด) · แพ็ค · จำนวน · หน่วย · ราคา/หน่วย · จำนวนเงิน
  assert.deepEqual(bodyRowsOf(table), [
    ['1', null, '2', '12', 'เดือน', '3,500.00', '84,000.00'],
    ['2', null, '-', '10', 'ชิ้น', '100.00', '1,000.00'],
    ['3', null, '-', '10', 'ชิ้น', '100.00', '1,000.00'],
  ]);
  // ช่องแพ็คชิดขวาแบบตัวเลข (คลาส number) ทั้งตัวเลขและขีด — ธรรมเนียมเดียวกับช่องส่วนลด
  assert.ok(table.includes('<td class="number">2</td>\n          <td class="number">12</td>'));
  assert.ok(table.includes('<td class="number">-</td>\n          <td class="number">10</td>'));
  // ความกว้างของคอลัมน์ฝังมากับไฟล์ **ครั้งเดียว** ต่อท้ายแผ่นกลาง
  assert.equal(html.split(ITEM_TABLE_PACK_CSS).length - 1, 1);
  assert.ok(html.includes(`<style>${documentShellCss('portrait')}${ITEM_TABLE_PACK_CSS}</style>`));
});

test('คอลัมน์แพ็ค: เลขแพ็คพิมพ์ผ่านตัวจัดรูปตัวเลข (9,999) และรับเลขที่เก็บเป็นสตริงได้', () => {
  const html = buildQuotationMasterHTML(baseQuote([
    packLine('1', { packQty: 9999, qty: 1, unitPrice: 100, lineTotal: 999900 }), packLine('2', { packQty: '3' }),
  ]), {});
  const rows = bodyRowsOf(itemTablesOf(html)[0]);
  assert.equal(rows[0][2], '9,999');
  assert.equal(rows[1][2], '3');
});

test('คอลัมน์แพ็ค: หน่วยของบรรทัดที่มีเลขแพ็คคือ "เดือน" เสมอ ไม่ว่าหน่วยที่เก็บไว้เป็นอะไร — บรรทัดอื่นคงหน่วยเดิม', () => {
  const lines = [
    packLine('1', { unit: 'แพ็คเกจ' }), packLine('2', { unit: 'กิโลกรัม' }), packLine('3', { unit: '' }),
    lineOf('4', { unit: 'แพ็คเกจ' }), lineOf('5', { unit: 'กิโลกรัม' }),
  ];
  const th = bodyRowsOf(itemTablesOf(buildQuotationMasterHTML(baseQuote(lines), {}))[0]);
  assert.deepEqual(th.map((row) => row[4]), ['เดือน', 'เดือน', 'เดือน', 'แพ็คเกจ', 'กิโลกรัม']);
  const en = bodyRowsOf(itemTablesOf(buildQuotationMasterHTML({ ...baseQuote(lines), docLanguage: 'en' }, {}))[0]);
  assert.deepEqual(en.map((row) => row[4]), ['Month', 'Month', 'Month', 'Package', 'Kilogram']);
});

test('คอลัมน์แพ็ค + ส่วนลดรายบรรทัด = แปดคอลัมน์ตามลำดับ และคลาสครบสองตัว', () => {
  // 2 × 12 × 3,500 = 84,000 − 7,200 = 76,800 (ส่วนลดบาทหักจากยอดทั้งรายการ ไม่คูณจำนวนแพ็ค — มติ A5)
  const lines = [packLine('1', { discountType: 'amount', discountValue: 7200, discountAmount: 7200, lineTotal: 76800 }), lineOf('2')];
  const html = buildQuotationMasterHTML(baseQuote(lines), {});
  const [table] = itemTablesOf(html);
  assert.match(table, /^<table class="itemTable withLineDiscount withPack">/);
  assert.deepEqual(headersOf(table), ['ลำดับ', 'รายละเอียดสินค้า / บริการ', 'แพ็ค/เดือน', 'จำนวน', 'หน่วย', 'ราคา/หน่วย', 'ส่วนลด', 'จำนวนเงิน']);
  assert.deepEqual(bodyRowsOf(table), [
    ['1', null, '2', '12', 'เดือน', '3,500.00', '-7,200.00', '76,800.00'],
    ['2', null, '-', '10', 'ชิ้น', '100.00', '-', '1,000.00'],
  ]);
  assert.equal(html.split(ITEM_TABLE_PACK_CSS).length - 1, 1);
});

test('คอลัมน์แพ็ค: ใบหลายหน้าที่มีเลขแพ็คบรรทัดเดียว — หัวตารางทุกหน้ามีคอลัมน์แพ็ค (ตัดสินทั้งใบ ไม่ใช่รายหน้า)', () => {
  // บรรทัดแพ็คอยู่หน้าแรก (ลำดับ 1) หรือหน้าสุดท้าย (ลำดับ 30) ก็ต้องได้คอลัมน์ครบทุกหน้า — ไม่ใช่เฉพาะหน้าที่มีมัน และไม่ใช่ดูแค่หน้าแรก
  for (const packIndex of [0, 29]) {
    const lines = Array.from({ length: 30 }, (_, i) => (i === packIndex ? packLine(`L${i}`) : lineOf(`L${i}`)));
    const html = buildQuotationMasterHTML(baseQuote(lines), {});
    const tables = itemTablesOf(html);
    assert.ok(tables.length >= 2, 'ต้องมีตารางรายการมากกว่า 1 หน้า');
    for (const table of tables) {
      assert.match(table, /^<table class="itemTable withPack">/, `บรรทัดแพ็คลำดับ ${packIndex + 1}`);
      assert.equal(headersOf(table)[2], 'แพ็ค/เดือน');
    }
    assert.equal((html.match(/<th class="number">แพ็ค\/เดือน<\/th>/g) || []).length, tables.length);
    // หน้าที่ไม่มีบรรทัดแพ็คเลยยังมีช่องแพ็คทุกแถว (ขีด) — จำนวนช่องต่อแถวเท่ากันทั้งใบ
    for (const row of tables.flatMap(bodyRowsOf)) assert.equal(row.length, 7);
    assert.deepEqual(tables.flatMap(bodyRowsOf).map((row) => row[2]), Array.from({ length: 30 }, (_, i) => (i === packIndex ? '2' : '-')));
    assert.equal(html.split(ITEM_TABLE_PACK_CSS).length - 1, 1);
  }
});

test('คอลัมน์แพ็ค: ใบอังกฤษ = Pack/Month · Month · ไม่มีอักขระไทยเหลือบนกระดาษ', () => {
  const q = {
    ...baseQuote([
      packLine('1', { description: 'Scent diffusing system · 1 package', unit: 'แพ็คเกจ' }),
      lineOf('2', { description: 'Reed diffuser 100 ml', unit: 'pcs' }),
    ]),
    docLanguage: 'en', customerName: 'ACME PTE LTD', billingAddress: '1 Marina Blvd, Singapore', contactName: 'Mr. Lim',
    paymentPlan: { type: 'full', paymentMethod: 'Bank transfer' }, paymentTerms: 'Net 30 days', notes: 'Price excludes overseas freight.',
    approvedByName: 'Kanti T.', createdByName: 'Nattawut P.', deal: { title: 'Room Diffuser 2026', ownerName: 'Kanti T.' },
  };
  const html = buildQuotationMasterHTML(q, {});
  const [table] = itemTablesOf(html);
  assert.deepEqual(headersOf(table), ['No.', 'Description', 'Pack/Month', 'Qty', 'Unit', 'Unit Price', 'Amount']);
  assert.deepEqual(bodyRowsOf(table).map((row) => [row[2], row[3], row[4]]), [['2', '12', 'Month'], ['-', '10', 'pcs']]);
  assert.doesNotMatch(printedMarkup(html), /[฀-๿]/, 'ใบอังกฤษต้องไม่มีอักขระไทยเหลือบนกระดาษ');
});

test('คอลัมน์แพ็ค: หน้าต่างพิมพ์สองภาษา — ทั้งสองแผงมีคอลัมน์ · CSS ของคอลัมน์ฝังครั้งเดียว', () => {
  const html = buildQuotationMasterSwitchableHTML(switchableQuote({ lines: [packLine('1'), lineOf('2')] }), { editable: true });
  const panes = html.split('<div class="langPane" data-lang="').slice(1);
  assert.equal(panes.length, 2);
  const byLang = Object.fromEntries(panes.map((pane) => [pane.slice(0, 2), itemTablesOf(pane)]));
  assert.deepEqual(headersOf(byLang.th[0])[2], 'แพ็ค/เดือน');
  assert.deepEqual(headersOf(byLang.en[0])[2], 'Pack/Month');
  // สองภาษาตัดสินคอลัมน์เหมือนกันเสมอ (บรรทัดชุดเดียวกัน) — คลาสของตารางเท่ากันทุกตาราง
  for (const table of [...byLang.th, ...byLang.en]) assert.match(table, /^<table class="itemTable withPack">/);
  assert.equal(html.split(ITEM_TABLE_PACK_CSS).length - 1, 1);
  // ใบที่ไม่มีเลขแพ็ค: หน้าต่างพิมพ์สองภาษาไม่มีทั้งคอลัมน์และ CSS
  assert.ok(!buildQuotationMasterSwitchableHTML(switchableQuote(), { editable: true }).includes('withPack'));
});

test('คอลัมน์แพ็ค: โมเดลของอีกภาษาตัดสินคอลัมน์ได้คำตอบเดียวกัน (แพ็ค · ส่วนลด) — สองแผงมีหรือไม่มีพร้อมกัน', () => {
  const cases = [
    [lineOf('1'), lineOf('2')],
    [lineOf('1', discountOn), lineOf('2')],
    [packLine('1'), lineOf('2')],
    [packLine('1', { discountType: 'amount', discountValue: 7200, discountAmount: 7200, lineTotal: 76800 }), lineOf('2')],
  ];
  for (const lines of cases) {
    const classOf = (language) => (buildQuotationMasterHTML({ ...baseQuote(lines), docLanguage: language }, {}).match(/<table class="(itemTable[^"]*)">/) || [])[1];
    assert.equal(classOf('th'), classOf('en'));
  }
});

test('คอลัมน์แพ็ค: ฉบับตรึงและใบสั่งขายเดินเครื่องยนต์เดียวกัน — มีคอลัมน์ มี CSS ครั้งเดียว ทั้งสองภาษา', () => {
  for (const language of ['th', 'en']) {
    const quote = { ...baseQuote([packLine('1', { unit: 'แพ็คเกจ' }), lineOf('2')]), docLanguage: language };
    for (const name of ['quotationArtifact', 'salesOrderArtifact', 'salesOrderPrint']) {
      const html = BUILDERS[name](quote);
      const [table] = itemTablesOf(html);
      assert.match(table, /^<table class="itemTable withPack">/, `${name}/${language}`);
      assert.equal(headersOf(table)[2], language === 'en' ? 'Pack/Month' : 'แพ็ค/เดือน', `${name}/${language}`);
      assert.deepEqual(bodyRowsOf(table)[0].slice(2, 5), ['2', '12', language === 'en' ? 'Month' : 'เดือน'], `${name}/${language}`);
      assert.equal(html.split(ITEM_TABLE_PACK_CSS).length - 1, 1, `${name}/${language}`);
    }
  }
});

test('คอลัมน์แพ็ค: ป้ายบนกระดาษไทย = ป้ายของจอ (PACK_COLUMN_LABEL) = ป้ายของตัวอย่างในหน้าตั้งค่า', () => {
  assert.equal(quotationDocLabels('th').t('packQty'), PACK_COLUMN_LABEL);
  assert.equal(quotationDocLabels('en').t('packQty'), 'Pack/Month');
  assert.equal(QUOTATION_PREVIEW_SCENARIOS.find((scenario) => scenario.id === 'packs').label, PACK_COLUMN_LABEL);
});

test('คอลัมน์แพ็ค: ตัวอย่าง packs ของหน้าตั้งค่า — ตารางมีคอลัมน์แพ็คและคอลัมน์ส่วนลด ทั้งใบเสนอราคาและใบสั่งขาย', () => {
  for (const docType of ['quotation', 'salesOrder']) {
    const html = renderQuotationMasterDocumentHTML(buildQuotationMasterPreview('packs', 'approved', 'v4', docType), { toolbar: false });
    const tables = itemTablesOf(html);
    for (const table of tables) assert.match(table, /^<table class="itemTable withLineDiscount withPack">/);
    assert.deepEqual(tables.flatMap(bodyRowsOf).map((row) => [row[2], row[3], row[4], row[5], row[6], row[7]]), [
      ['2', '12', 'เดือน', '3,500.00', '-', '84,000.00'],
      ['1', '12', 'เดือน', '5,800.00', '-7,200.00', '62,400.00'],
      ['-', '360', 'ชิ้น', '185.00', '-', '66,600.00'],
      ['-', '1', 'งาน', '25,000.00', '-', '25,000.00'],
    ]);
    assert.equal(html.split(ITEM_TABLE_PACK_CSS).length - 1, 1);
  }
  // ตัวอย่างอีกหกแบบไม่มีเลขแพ็ค ⇒ ไม่มีทั้งคอลัมน์และ CSS (ไฟล์ของตัวอย่างเดิมไม่ขยับ)
  for (const scenario of QUOTATION_PREVIEW_SCENARIOS.filter((item) => item.id !== 'packs')) {
    const html = renderQuotationMasterDocumentHTML(buildQuotationMasterPreview(scenario.id, 'approved', 'v4'), { toolbar: false });
    assert.ok(!html.includes('withPack'), scenario.id);
  }
});

test('คอลัมน์แพ็ค + ส่วนลด: ตัวแบ่งหน้านับความกว้างของช่องตัวเลขจากข้อความเดียวกับที่ตัวพิมพ์วาดจริง — ขอบของทั้งสี่ช่อง ทั้งสองภาษา', () => {
  /* ชุดตัวอักษรต่อบรรทัดของใบแพ็ค + ส่วนลดขึ้นกับว่ามีช่องตัวเลขไหนยาวเกินคอลัมน์ไหม (itemTextChars · quotationMasterTemplate.js)
     ตัวแบ่งหน้าคิดจากโมเดล ตัวพิมพ์วาดจากโมเดลเดียวกัน — ถ้าวันหนึ่งตัวพิมพ์เปลี่ยนรูปตัวเลข (ทศนิยม · ตัวคั่นหลัก · เครื่องหมาย)
     โดยตัวแบ่งหน้าไม่รู้ ใบที่ช่องแคบจริงจะถูกประเมินด้วยชุดกว้าง แล้วแผ่นล้นเงียบ ⇒ เทสต์นี้ยึดสองฝั่งกับ HTML ที่พิมพ์จริง
     จำนวนตัวอักษรมากสุดที่อยู่ในคอลัมน์ (วัด 2026-10-09): จำนวน 6 · ราคา/หน่วย 10 · ส่วนลด 10 (รวมขีดลบ) · จำนวนเงิน 12 */
  const LIMITS = { qty: 6, unitPrice: 10, discount: 10, amount: 12 };
  const service = packLine('L1', { discountType: 'amount', discountValue: 7200, discountAmount: 7200, lineTotal: 76800 });
  const probeOf = (over) => lineOf('L2', { qty: 552, unit: 'ชิ้น', unitPrice: 185, discountAmount: 0, lineTotal: 102120, ...over });
  // [คีย์ของบรรทัด, ช่องที่ถูกดัน, ค่าที่ยังอยู่ในคอลัมน์ + ข้อความที่พิมพ์, ค่าแรกที่ดันคอลัมน์ + ข้อความที่พิมพ์]
  const EDGES = [
    ['qty', 'qty', [99999, '99,999'], [100000, '100,000']],
    ['qty', 'qty', [999.75, '999.75'], [9999.5, '9,999.5']],
    ['unitPrice', 'unitPrice', [999999.99, '999,999.99'], [1000000, '1,000,000.00']],
    ['unitPrice', 'unitPrice', [-99999.99, '-99,999.99'], [-999999.99, '-999,999.99']],
    ['discountAmount', 'discount', [99999.99, '-99,999.99'], [100000, '-100,000.00']],
    ['lineTotal', 'amount', [9999999.99, '9,999,999.99'], [10000000, '10,000,000.00']],
  ];
  for (const docLanguage of ['th', 'en']) {
    const nominal = docLanguage === 'th' ? ITEM_TEXT_CHARS.packDiscountTh : ITEM_TEXT_CHARS.packDiscountEn;
    for (const [key, cell, fits, widens] of EDGES) {
      for (const [[value, printed], expectedChars] of [[fits, nominal], [widens, ITEM_TEXT_CHARS.packDiscount]]) {
        const quote = { ...baseQuote([service, probeOf({ [key]: value })]), docLanguage };
        const model = buildQuotationMasterModelFromQuote(quote);
        // ฝั่งตัวพิมพ์: ช่องของบรรทัดที่สอง [ลำดับ, (รายละเอียด), แพ็ค, จำนวน, หน่วย, ราคา/หน่วย, ส่วนลด, จำนวนเงิน]
        const row = itemTablesOf(buildQuotationMasterHTML(quote, { toolbar: false })).flatMap(bodyRowsOf)[1];
        const printedCells = { qty: row[3], unitPrice: row[5], discount: row[6], amount: row[7] };
        assert.equal(printedCells[cell], printed, `${docLanguage} · ${key}=${value}`);
        assert.equal(printedCells[cell].length > LIMITS[cell], expectedChars === ITEM_TEXT_CHARS.packDiscount, `${docLanguage} · ${key}=${value}: "${printed}" ${printedCells[cell].length} ตัวอักษร`);
        // ช่องอื่นของแถวนี้ไม่เกินคอลัมน์ ⇒ ชุดที่ได้ตัดสินจากช่องที่กำลังดูช่องเดียว
        for (const other of Object.keys(LIMITS).filter((name) => name !== cell)) assert.ok(printedCells[other].length <= LIMITS[other], `${other}: ${printedCells[other]}`);
        // ฝั่งตัวแบ่งหน้า: ชุดที่เลือกจากโมเดลของใบเดียวกัน
        assert.equal(itemTextChars(model.lines, docLanguage), expectedChars, `${docLanguage} · ${key}=${value}`);
      }
    }
    // หน่วยที่พิมพ์ = หน่วยที่ตัวแบ่งหน้าเทียบกับรายการที่วัด: บรรทัดที่มีเลขแพ็คได้เดือน/Month เสมอ ⇒ ไม่ทำให้ใบตกไปชุดแคบสุด
    const stored = { ...baseQuote([{ ...service, unit: 'หน่วยที่คนพิมพ์เอง' }, probeOf({})]), docLanguage };
    const rows = itemTablesOf(buildQuotationMasterHTML(stored, { toolbar: false })).flatMap(bodyRowsOf);
    assert.deepEqual(rows.map((row) => row[4]), docLanguage === 'th' ? ['เดือน', 'ชิ้น'] : ['Month', 'Piece']);
    assert.equal(itemTextChars(buildQuotationMasterModelFromQuote(stored).lines, docLanguage), nominal);
    // …แต่หน่วยที่คนพิมพ์เองบนบรรทัดที่ไม่มีเลขแพ็คถูกพิมพ์ตามนั้น ⇒ ยังไม่รู้ความกว้าง ⇒ ชุดแคบสุด
    const typed = { ...baseQuote([service, probeOf({ unit: 'หน่วยที่คนพิมพ์เอง' })]), docLanguage };
    assert.equal(itemTablesOf(buildQuotationMasterHTML(typed, { toolbar: false })).flatMap(bodyRowsOf)[1][4], 'หน่วยที่คนพิมพ์เอง');
    assert.equal(itemTextChars(buildQuotationMasterModelFromQuote(typed).lines, docLanguage), ITEM_TEXT_CHARS.packDiscount);
  }
});
