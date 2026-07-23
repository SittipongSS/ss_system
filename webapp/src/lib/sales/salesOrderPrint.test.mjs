import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSalesOrderPrintHTML, openSalesOrderPrintWindow } from './salesOrderPrint.js';

const order = {
  orderNumber: 'SO-26070001-0', orderDate: '2026-07-16', paymentDueDate: '2026-08-15',
  status: 'approved', customerName: 'ลูกค้าทดสอบ', subtotal: 1000, discountAmount: 0,
  vatAmount: 70, totalAmount: 1070, lines: [], createdByName: 'ผู้จัดทำ',
  submittedByName: 'ผู้ยื่น', approvedByName: 'ผู้อนุมัติ',
  quotation: { quoteNumber: 'QT-26070001-0', billingAddress: 'กรุงเทพฯ', paymentTerms: 'ชำระเต็มจำนวน' },
  deal: { title: 'ดีลทดสอบ', ownerName: 'AE ทดสอบ' }, project: { name: 'โครงการทดสอบ' },
};

test('Sale Order print ใช้เครื่องยนต์ V4 + FM-SA-03 + อ้างอิง QT ครบ', () => {
  const html = buildSalesOrderPrintHTML(order);
  // เครื่องยนต์เดียวกับ V4
  assert.match(html, /class="document v4/);
  assert.match(html, /FM-SA-03/);
  assert.match(html, /SALES ORDER/);
  assert.match(html, /SO-26070001-0/);
  // แถวอ้างอิง SO
  assert.match(html, /อ้างอิง QT<\/dt><dd>QT-26070001-0/);
  assert.match(html, /วันที่ SO<\/dt><dd>16\/07\/2026/);
  assert.match(html, /กำหนดชำระ<\/dt><dd>15\/08\/2026/);
  // ช่องลงชื่อ 3 ช่องแบบ SO (มติ 2026-07-18)
  assert.match(html, /ผู้จัดทำ <span>พนักงานขาย<\/span>[\s\S]*?\(ผู้จัดทำ\)/);
  assert.match(html, /ผู้อนุมัติ <span>ผู้จัดการฝ่ายขาย<\/span>[\s\S]*?\(ผู้อนุมัติ\)/);
  assert.match(html, /ฝ่ายบัญชี <span>/);
  assert.doesNotMatch(html, /ผู้ยื่นอนุมัติ/);
  // อนุมัติแล้ว = ไม่มีลายน้ำ
  assert.doesNotMatch(html, /class="watermark"/);
});

test('approved Sale Order stamps the approver e-signature image when the server embeds it', () => {
  const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const html = buildSalesOrderPrintHTML({
    ...order,
    approverSignature: {
      imageDataUri: dataUri,
      signerName: 'สมชาย ผู้อนุมัติ',
      signedAt: '2026-07-16T03:00:00.000Z',
      evidenceId: 'DSE-0001',
    },
  });
  // รูปลายเซ็นจริงถูกฝัง + ชื่อผู้ลงนาม + Evidence
  assert.match(html, /<img class="signatureImage" src="data:image\/png;base64,/);
  assert.match(html, /ลายเซ็น สมชาย ผู้อนุมัติ/);
  assert.match(html, /Evidence DSE-0001/);
  // ไม่หล่นไปช่องเซ็นเปล่า
  assert.doesNotMatch(html, /ผู้อนุมัติ <span>ผู้จัดการฝ่ายขาย<\/span>[\s\S]*?\(ผู้อนุมัติ\)/);
});

test('approved Sale Order without an embedded image falls back to the blank sign box', () => {
  const html = buildSalesOrderPrintHTML(order);
  // ไม่มี <img> ลายเซ็น (CSS .signatureImage ยังอยู่เสมอ จึงเช็คเฉพาะ tag รูป)
  assert.doesNotMatch(html, /<img class="signatureImage"/);
  assert.match(html, /ผู้อนุมัติ <span>ผู้จัดการฝ่ายขาย<\/span>[\s\S]*?\(ผู้อนุมัติ\)/);
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
  assert.match(html, /คุณสมชาย · 021234567/);
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
