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

test('Sale Order print uses FM-SA-03 and complete commercial references', () => {
  const html = buildSalesOrderPrintHTML(order);
  assert.match(html, /FM-SA-03/);
  assert.match(html, /SALES ORDER/);
  assert.match(html, /SO-26070001-0/);
  assert.match(html, /อ้างอิง QT[\s\S]*QT-26070001-0/);
  assert.match(html, /กำหนดชำระ[\s\S]*15\/08\/2026/);
  // ช่องลงชื่อ 3 ช่อง (มติ 2026-07-18): ผู้จัดทำ·พนักงานขาย / ผู้อนุมัติ·ผู้จัดการฝ่ายขาย / ฝ่ายบัญชี
  assert.match(html, /sb-head">ผู้จัดทำ <span class="sb-role">· พนักงานขาย<\/span>[\s\S]*?\(ผู้จัดทำ\)/);
  assert.match(html, /sb-head">ผู้อนุมัติ <span class="sb-role">· ผู้จัดการฝ่ายขาย<\/span>[\s\S]*?\(ผู้อนุมัติ\)/);
  assert.match(html, /sb-head">ฝ่ายบัญชี /);
  // ตัดช่อง "ผู้ยื่นอนุมัติ" ออกแล้ว
  assert.doesNotMatch(html, /ผู้ยื่นอนุมัติ/);
  assert.doesNotMatch(html, /class="watermark"/);
});

test('unapproved Sale Order print carries a visible status watermark', () => {
  const html = buildSalesOrderPrintHTML({ ...order, status: 'draft' });
  assert.match(html, /class="watermark">ฉบับร่าง/);
  assert.match(html, /สถานะเอกสาร[\s\S]*ฉบับร่าง/);
  // รออนุมัติก็นับเป็นร่าง (คำเดียวทั้ง QT/SO) — แต่ใบยกเลิกคงคำว่า ยกเลิก
  assert.match(buildSalesOrderPrintHTML({ ...order, status: 'pending_approval' }), /class="watermark">ฉบับร่าง/);
  assert.match(buildSalesOrderPrintHTML({ ...order, status: 'cancelled' }), /class="watermark">เอกสารยกเลิก/);
});

test('Sale Order print renders into a prepared window', () => {
  const writes = [];
  const target = { closed: false, document: { open() {}, write(value) { writes.push(value); }, close() {} } };
  assert.equal(openSalesOrderPrintWindow(order, target), target);
  assert.match(writes.join(''), /window\.print/);
});

test('Sale Order preview is split into explicit A4 pages before printing', () => {
  const lines = Array.from({ length: 12 }, (_, index) => ({
    description: `สินค้าทดสอบ ${index + 1}`,
    qty: 1,
    unitPrice: 100,
    lineTotal: 100,
    sortOrder: index,
  }));
  const html = buildSalesOrderPrintHTML({ ...order, lines });

  assert.equal((html.match(/class="sheet explicit-page"/g) || []).length, 2);
  assert.match(html, /หน้า 1 \/ 2/);
  assert.match(html, /หน้า 2 \/ 2/);
  assert.equal((html.match(/ยอดรวมสินค้า\/บริการ/g) || []).length, 1);
  for (let index = 1; index <= 12; index += 1) {
    assert.equal((html.match(new RegExp(`สินค้าทดสอบ ${index}(?!\\d)`, 'g')) || []).length, 1);
  }
});
