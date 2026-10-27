import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUNDLE_MISSING_FILE, buildSalesOrderBundle, bundleExtension, bundleFolderName, keepVisibleSelection, planSalesOrderBundle, salesOrderPdfAbsentReason, uniqueSalesOrders,
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

/* ── แถวของรายงานยอดขาย (/sa/targets/report) — เลขใบเสนอราคาอยู่บนแถว · ใบ Actual รายงวดมีหลายแถวต่อใบ ── */
const REPORT_ROWS = [
  { id: 'SO-1', rowKey: 'SO-1|2026-09', orderNumber: 'SO-26100001', customerName: 'ลูกค้า', quotationId: 'Q-1', quoteNumber: 'QT-26100005' },
  { id: 'SO-1', rowKey: 'SO-1|2026-10', orderNumber: 'SO-26100001', customerName: 'ลูกค้า', quotationId: 'Q-1', quoteNumber: 'QT-26100005' },
  { id: 'SO-3', orderNumber: 'SO-26100003', customerName: 'ลูกค้า', quotationId: 'Q-3', quoteNumber: 'QT-26100007' },
];

test('แถวรายงาน: ใบรายงวดหลายแถว = ใบเดียว · คงลำดับแถวแรก', () => {
  assert.deepEqual(uniqueSalesOrders(REPORT_ROWS).map((r) => r.id), ['SO-1', 'SO-3']);
  assert.deepEqual(uniqueSalesOrders([null, { id: '' }, ...REPORT_ROWS]).map((r) => r.id), ['SO-1', 'SO-3']);
});

test('แถวรายงาน: เลขใบเสนอราคาอ่านจาก quoteNumber บนแถว', () => {
  const { items } = planSalesOrderBundle(REPORT_ROWS[0], docsOf(REPORT_ROWS[0], []));
  assert.equal(items[0].stem, '01 ใบเสนอราคา QT-26100005');
});

test('ห่อชุดจากแถวรายงาน: ใบรายงวดสองแถวได้โฟลเดอร์เดียว ไม่มี (2)', async () => {
  let zip;
  await buildSalesOrderBundle(REPORT_ROWS, {
    loadDocuments: async (order) => docsOf(order, []),
    fetchFile: async () => ({ type: 'application/pdf' }),
    JSZip: class extends FakeZip { constructor() { super(); zip = this; } },
  });
  assert.deepEqual([...zip.files.keys()].map((k) => k.split('/')[0]).sort(), [
    'SO-26100001 ลูกค้า', 'SO-26100001 ลูกค้า', 'SO-26100003 ลูกค้า', 'SO-26100003 ลูกค้า',
  ]);
});

test('ที่ติ๊กไว้หลังรายการขยับ: ตัดเฉพาะใบที่หลุด · ไม่มีอะไรหลุด = ชุดเดิมตัวเดิม (โหลดใหม่ตอนกลับมาที่แท็บไม่ล้าง)', () => {
  const picked = new Set(['SO-1', 'SO-3']);
  assert.equal(keepVisibleSelection(picked, ['SO-3', 'SO-1', 'SO-9']), picked);
  assert.deepEqual([...keepVisibleSelection(picked, ['SO-3'])], ['SO-3']);
  assert.equal(keepVisibleSelection(picked, []).size, 0);
});

/* 🐞 27/10 เจ้าของ: "ไฟล์หลักฐานการชำระแต่ละงวดไม่มีหรอ" — งวดที่ยังไม่จ่ายไม่มีสลิป แต่ ZIP เงียบ */
const MIXED = [
  { id: 'I-1', seq: 1, status: 'confirmed', evidence: [{ fileName: 'slip.pdf' }], taxInvoiceFile: null, taxInvoiceNo: null },
  { id: 'I-2', seq: 2, status: 'confirmed', evidence: [{ fileName: 'slip2.pdf' }], taxInvoiceFile: null, taxInvoiceNo: 'IV-9' },
  { id: 'I-3', seq: 3, status: 'pending', evidence: [], taxInvoiceFile: null },
  { id: 'I-4', seq: 4, status: 'confirmed', refundedAt: '2026-10-01', evidence: [], taxInvoiceFile: null },
];

test('งวดที่ไม่มีไฟล์ขึ้นเป็นรายการ "ยังไม่มีในระบบ" พร้อมสถานะงวด · คืนเงินแล้วไม่ฟ้อง · งวดยังไม่จ่ายไม่ฟ้องใบกำกับ', () => {
  const { items } = planSalesOrderBundle(ORDER, docsOf(ORDER, MIXED));
  const absent = items.filter((i) => i.absent).map((i) => `${i.label} — ${i.reason}`);
  assert.deepEqual(absent, [
    'งวดที่ 1 ใบกำกับภาษี — บัญชียังไม่ได้แนบใบกำกับ — สถานะงวด: ชำระแล้ว',
    'งวดที่ 2 ใบกำกับภาษี — มีเลขที่ IV-9 แต่บัญชียังไม่ได้แนบไฟล์',
    'งวดที่ 3 หลักฐานการชำระ — ยังไม่มีไฟล์ในระบบ — สถานะงวด: รอชำระ',
  ]);
});

test('ไฟล์ที่ขาด.txt แยก "ดึงไม่ได้" ออกจาก "ยังไม่มีในระบบ" · PDF ขอทีละใบ', async () => {
  let zip;
  let inFlightPdf = 0;
  let maxPdf = 0;
  const { missing } = await buildSalesOrderBundle([ORDER, { ...ORDER, id: 'SO-2', orderNumber: 'SO-26100002' }], {
    loadDocuments: async (order) => docsOf(order, MIXED),
    fetchFile: async (href) => {
      if (href.endsWith('/issued/pdf')) {
        inFlightPdf += 1;
        maxPdf = Math.max(maxPdf, inFlightPdf);
        await new Promise((r) => { setTimeout(r, 5); });
        inFlightPdf -= 1;
        if (href.includes('sales-orders/SO-2/')) throw new Error('สร้าง PDF ไม่สำเร็จ: spawn ETXTBSY');
      }
      return { type: 'application/pdf' };
    },
    JSZip: class extends FakeZip { constructor() { super(); zip = this; } },
  });
  assert.equal(maxPdf, 1, 'PDF ต้องขอทีละใบ');
  assert.equal(missing.filter((m) => !m.absent).length, 1);
  assert.equal(missing.filter((m) => m.absent).length, 6);
  const text = zip.files.get(BUNDLE_MISSING_FILE);
  assert.match(text, /ดึงไม่ได้ 1 ไฟล์[^\n]*\r\nSO-26100002 · ใบสั่งขาย SO-26100002 — สร้าง PDF ไม่สำเร็จ: spawn ETXTBSY/);
  assert.match(text, /ยังไม่มีในระบบ 6 รายการ\r\nSO-26100001 · งวดที่ 1 ใบกำกับภาษี/);
});

/* 🐞 27/10 ใบรออนุมัติขึ้น "ดึงไม่ได้ · ลองโหลดใหม่" — ทั้งที่ไม่มี PDF ฉบับที่ออกจริงให้ดึงตั้งแต่แรก */
test('PDF ใบสั่งขาย: ใบที่ไม่อยู่สถานะอนุมัติ = "ยังไม่มีในระบบ" ตั้งแต่ก่อนดึง · ไม่บอกสถานะ/อนุมัติแล้ว = ดึงตามปกติ', async () => {
  assert.equal(salesOrderPdfAbsentReason('approved'), null);
  assert.equal(salesOrderPdfAbsentReason(undefined), null);
  assert.match(salesOrderPdfAbsentReason('pending_approval'), /^ใบยังไม่อนุมัติ — ยังไม่มีฉบับที่ออกจริง \(สถานะใบ: รออนุมัติ\)$/);
  assert.match(salesOrderPdfAbsentReason('draft'), /ฉบับร่าง/);
  assert.match(salesOrderPdfAbsentReason('cancelled'), /^ใบถูกยกเลิก/);
  assert.match(salesOrderPdfAbsentReason('revised'), /Rev\./);
  assert.match(salesOrderPdfAbsentReason('approval_revoked'), /ย้อนการอนุมัติ/);

  const fetched = [];
  const { missing } = await buildSalesOrderBundle([{ ...ORDER, status: 'pending_approval' }], {
    loadDocuments: async (order) => docsOf(order, []),
    fetchFile: async (href) => { fetched.push(href); return { type: 'application/pdf' }; },
    JSZip: FakeZip,
  });
  assert.deepEqual(fetched, ['/api/sales-planning/quotations/Q-1/issued/pdf'], 'ไม่ยิงเส้น PDF ของใบที่ยังไม่อนุมัติ');
  assert.deepEqual(missing.map((m) => [m.label, m.absent]), [['ใบสั่งขาย SO-26100001', true]]);
});
