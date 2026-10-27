import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUNDLE_MISSING_FILE, buildSalesOrderBundle, bundleExtension, bundleFolderName, planSalesOrderBundle,
} from './salesOrderBundle.js';
import { buildSalesOrderDocuments } from './salesOrderDocuments.js';

const ORDER = {
  id: 'SO-1', orderNumber: 'SO-26100001', customerName: 'บริษัท ก/ข จำกัด',
  quotationId: 'Q-1', quotation: { quoteNumber: 'QT-26100005' },
};
const INSTALLMENTS = [
  {
    id: 'I-2', seq: 2, evidence: [{ fileName: 'slip2.PNG' }],
    taxInvoiceFile: { storagePath: 'x/tax2.pdf', fileName: 'tax2.pdf' }, taxInvoiceNo: 'IV-002',
  },
  { id: 'I-1', seq: 1, evidence: [{ fileName: 'slip1.jpg' }, { fileName: 'โอนเพิ่ม' }], taxInvoiceFile: null },
];
const docsOf = (order, installments = INSTALLMENTS) => buildSalesOrderDocuments({ order, installments });

test('แผนของใบเดียว: QT → SO → งวดเรียงตาม seq · สลิปหลายไฟล์ต่อท้าย (2) · ใบกำกับมีเลขที่', () => {
  const { folder, items } = planSalesOrderBundle(ORDER, docsOf(ORDER));
  assert.equal(folder, 'SO-26100001 บริษัท ก_ข จำกัด');
  assert.deepEqual(items.map((i) => i.stem), [
    '01 ใบเสนอราคา QT-26100005',
    '02 ใบสั่งขาย SO-26100001',
    '03 งวดที่ 1 หลักฐานการชำระ',
    '04 งวดที่ 1 หลักฐานการชำระ (2)',
    '05 งวดที่ 2 หลักฐานการชำระ',
    '06 งวดที่ 2 ใบกำกับภาษี IV-002',
  ]);
  assert.equal(items[0].href, '/api/sales-planning/quotations/Q-1/issued/pdf');
  assert.equal(items[1].href, '/api/sales-planning/sales-orders/SO-1/issued/pdf');
  // ลิงก์ของไฟล์เงินคือ proxy เดิมของแท็บเอกสาร — ไม่มีทางที่สอง
  assert.equal(items[2].href, '/api/sales-planning/sales-orders/SO-1/payment-file?installment=I-1&i=0');
  assert.equal(items[5].href, '/api/sales-planning/sales-orders/SO-1/payment-file?installment=I-2&doc=tax_invoice');
});

test('ใบย้อนหลังไม่มีใบเสนอราคา = แถวขาดพร้อมเหตุ ไม่ใช่ลิงก์ที่ตอบ 404', () => {
  const { items } = planSalesOrderBundle({ ...ORDER, quotationId: null, quotation: null }, docsOf(ORDER, []));
  assert.equal(items[0].href, null);
  assert.match(items[0].reason, /ใบย้อนหลัง/);
  assert.equal(items.length, 2);
});

test('อ่านรายการเอกสารไม่ได้ = ไฟล์เงินเป็นแถวขาดพร้อมเหตุ (ไม่ใช่ "ใบนี้ไม่มีสลิป")', () => {
  const { items } = planSalesOrderBundle(ORDER, null, { documentsError: 'อ่านเอกสารของใบนี้ไม่สำเร็จ' });
  assert.equal(items.length, 3);
  assert.equal(items[2].href, null);
  assert.equal(items[2].reason, 'อ่านเอกสารของใบนี้ไม่สำเร็จ');
});

test('นามสกุล: ชื่อต้นฉบับก่อน · ไม่มีค่อยเดาจากชนิดไฟล์', () => {
  assert.equal(bundleExtension('slip2.PNG', 'image/jpeg'), '.png');
  assert.equal(bundleExtension('โอนเพิ่ม', 'image/jpeg'), '.jpg');
  assert.equal(bundleExtension('', 'application/pdf; charset=binary'), '.pdf');
  assert.equal(bundleExtension('', 'application/octet-stream'), '');
});

test('ชื่อโฟลเดอร์ไม่มีตัวต้องห้าม · ไม่มีเลขใบ = ใช้ id', () => {
  assert.equal(bundleFolderName({ id: 'SO-9', orderNumber: '', customerName: '' }), 'SO-9');
  assert.equal(bundleFolderName({ orderNumber: 'SO-1', customerName: 'A:B*C' }), 'SO-1 A_B_C');
});

class FakeZip {
  constructor() { this.files = new Map(); }
  file(name, data) { this.files.set(name, data); }
  async generateAsync() { return { zipped: [...this.files.keys()] }; }
}

test('ห่อชุด: ไฟล์ที่ดึงไม่ได้ลง ไฟล์ที่ขาด.txt พร้อมเหตุ · โฟลเดอร์ซ้ำต่อท้าย (2)', async () => {
  const orders = [ORDER, { ...ORDER, id: 'SO-2', quotationId: null, quotation: null }];
  const progress = [];
  let zip;
  const { fileCount, missing } = await buildSalesOrderBundle(orders, {
    loadDocuments: async (order) => {
      if (order.id === 'SO-2') throw new Error('อ่านเอกสารของใบนี้ไม่สำเร็จ');
      return docsOf(order);
    },
    fetchFile: async (href) => {
      if (href.includes('sales-orders/SO-1/issued/pdf')) throw new Error('ใบสั่งขายเปลี่ยนสถานะหลังอนุมัติ');
      return { type: href.includes('issued/pdf') || href.includes('tax_invoice') ? 'application/pdf' : 'image/jpeg' };
    },
    JSZip: class extends FakeZip { constructor() { super(); zip = this; } },
    onProgress: (p) => progress.push(p),
  });
  assert.equal(fileCount, 6);
  assert.deepEqual([...zip.files.keys()].filter((k) => k !== BUNDLE_MISSING_FILE).sort(), [
    // ใบที่สองเลขซ้ำ (ข้อมูลทดสอบ) — โฟลเดอร์ไม่ทับกัน
    'SO-26100001 บริษัท ก_ข จำกัด (2)/02 ใบสั่งขาย SO-26100001.pdf',
    'SO-26100001 บริษัท ก_ข จำกัด/01 ใบเสนอราคา QT-26100005.pdf',
    'SO-26100001 บริษัท ก_ข จำกัด/03 งวดที่ 1 หลักฐานการชำระ.jpg',
    'SO-26100001 บริษัท ก_ข จำกัด/04 งวดที่ 1 หลักฐานการชำระ (2).jpg',
    'SO-26100001 บริษัท ก_ข จำกัด/05 งวดที่ 2 หลักฐานการชำระ.png',
    'SO-26100001 บริษัท ก_ข จำกัด/06 งวดที่ 2 ใบกำกับภาษี IV-002.pdf',
  ]);
  assert.deepEqual(missing.map((m) => `${m.orderId} ${m.label}`), [
    'SO-1 ใบสั่งขาย SO-26100001',
    'SO-2 ใบเสนอราคา',
    'SO-2 หลักฐานการชำระ · ใบกำกับภาษี',
  ]);
  const text = zip.files.get(BUNDLE_MISSING_FILE);
  assert.match(text, /SO-26100001 · ใบสั่งขาย SO-26100001 — ใบสั่งขายเปลี่ยนสถานะหลังอนุมัติ/);
  assert.match(text, /อ่านเอกสารของใบนี้ไม่สำเร็จ/);
  assert.deepEqual(progress.at(-1), { done: 7, total: 7 });
});

test('ดึงครบทุกไฟล์ = ไม่มี ไฟล์ที่ขาด.txt', async () => {
  let zip;
  const { missing } = await buildSalesOrderBundle([ORDER], {
    loadDocuments: async (order) => docsOf(order, []),
    fetchFile: async () => ({ type: 'application/pdf' }),
    JSZip: class extends FakeZip { constructor() { super(); zip = this; } },
  });
  assert.equal(missing.length, 0);
  assert.equal(zip.files.has(BUNDLE_MISSING_FILE), false);
  assert.equal(zip.files.size, 2);
});
