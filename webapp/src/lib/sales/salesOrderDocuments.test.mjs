// ตัวรวมเอกสารของใบสั่งขาย — แท็บ "เอกสาร" (มติเจ้าของ 25/09/2569)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SALES_ORDER_DOC_GROUPS, buildSalesOrderDocuments, installmentFilesKey } from './salesOrderDocuments.js';

const order = {
  id: 'SO-1', quotationId: 'QT-1',
  confirmDocType: 'po', confirmDocNo: 'PO-4411', confirmDocDate: '2026-09-20',
  confirmAttachments: [{ fileName: 'PO-4411.pdf', storagePath: 'x' }],
};
const groupOf = (res, key) => res.groups.find((g) => g.key === key);

test('ลำดับกลุ่ม: แนบเพิ่ม → ยืนยันคำสั่งซื้อ → การชำระ → สัญญา · กลุ่มว่างยังอยู่ (จอเลือกซ่อนเอง)', () => {
  assert.deepEqual(SALES_ORDER_DOC_GROUPS.map((g) => g.key), ['extra', 'confirmation', 'payment', 'contract']);
  const res = buildSalesOrderDocuments({ order: { id: 'SO-9' } });
  assert.deepEqual(res.groups.map((g) => g.rows.length), [0, 0, 0, 0]);
  assert.equal(res.total, 0);
  assert.deepEqual(buildSalesOrderDocuments({}), { groups: [], total: 0 });
});

test('ไฟล์แนบเพิ่มเปิดผ่าน proxy กลาง · เอกสาร Google เปิดที่ Google', () => {
  const res = buildSalesOrderDocuments({
    order,
    extra: [
      { id: 'A-1', entityType: 'sales_order', docType: 'customer_doc', fileName: 'PO ฉบับแก้.pdf', uploadedByName: 'สมชาย', createdAt: '2026-09-26T03:00:00Z', driveFileId: 'd1' },
      { id: 'A-2', entityType: 'sales_order', docType: 'other', fileName: 'ตาราง', fileUrl: 'https://docs.google.com/spreadsheets/d/abc/edit', metadata: { kind: 'gsheet', googleFileId: 'abc' } },
    ],
  });
  const rows = groupOf(res, 'extra').rows;
  assert.equal(rows[0].href, '/api/master/attachments/A-1/file');
  assert.equal(rows[0].note, 'เอกสารจากลูกค้า · โดย สมชาย');
  assert.equal(rows[1].href, 'https://docs.google.com/spreadsheets/d/abc/edit');
});

test('ไฟล์ยืนยันของใบเอง → confirm-file · ใบเก่าก่อน 0285 → proxy ของใบเสนอราคาต้นทาง', () => {
  const own = groupOf(buildSalesOrderDocuments({ order }), 'confirmation').rows;
  assert.equal(own[0].href, '/api/sales-planning/sales-orders/SO-1/confirm-file?i=0');
  assert.match(own[0].note, /ใบสั่งซื้อ \(PO\) · เลขที่ PO-4411/);

  const legacy = { id: 'SO-2', quotationId: 'QT-7', confirmAttachments: [] };
  const quotation = { quoteNumber: 'QT-26080001', wonDocType: 'payment_slip', wonAttachments: [{ fileName: 'slip.jpg' }, { fileName: 'slip2.jpg' }] };
  const rows = groupOf(buildSalesOrderDocuments({ order: legacy, quotation }), 'confirmation').rows;
  assert.deepEqual(rows.map((r) => r.href), [
    '/api/sales-planning/quotations/QT-7/file?i=0',
    '/api/sales-planning/quotations/QT-7/file?i=1',
  ]);
  assert.match(rows[0].note, /อยู่ที่ใบเสนอราคา QT-26080001/);
});

test('หลักฐานงวด + ใบกำกับภาษี เรียงตามงวด · ใบกำกับที่ไม่มีไฟล์จริงไม่ขึ้น (proxy ตอบ 404)', () => {
  const res = buildSalesOrderDocuments({
    order,
    installments: [
      { id: 'I-2', seq: 2, label: null, evidence: [{ fileName: 'slip2.jpg' }], taxInvoiceNo: 'IV-9', taxInvoiceFile: { fileName: 'iv.pdf', storagePath: 'p' } },
      { id: 'I-1', seq: 1, label: 'งวดยกมา', evidence: [{ fileName: 'a.pdf' }, {}], taxInvoiceFile: { fileName: 'ghost.pdf' } },
    ],
  });
  const rows = groupOf(res, 'payment').rows;
  assert.deepEqual(rows.map((r) => r.href), [
    '/api/sales-planning/sales-orders/SO-1/payment-file?installment=I-1&i=0',
    '/api/sales-planning/sales-orders/SO-1/payment-file?installment=I-1&i=1',
    '/api/sales-planning/sales-orders/SO-1/payment-file?installment=I-2&i=0',
    '/api/sales-planning/sales-orders/SO-1/payment-file?installment=I-2&doc=tax_invoice',
  ]);
  assert.equal(rows[0].note, 'งวดยกมา · หลักฐานการชำระ');
  assert.equal(rows[1].title, 'หลักฐาน 2');
  assert.equal(rows[3].note, 'งวดที่ 2 · ใบกำกับภาษี IV-9');
});

test('ไฟล์สัญญาขึ้นเฉพาะเมื่อ route ส่งสัญญามา (ผ่านด่านสิทธิ์ของสัญญาแล้ว) · total นับทุกกลุ่ม', () => {
  const contractFiles = [{ id: 'C-A', entityType: 'contract', docType: 'signed_contract', fileName: 'signed.pdf' }];
  const hidden = buildSalesOrderDocuments({ order, contract: null, contractFiles });
  assert.equal(groupOf(hidden, 'contract').rows.length, 0);
  const shown = buildSalesOrderDocuments({ order, contract: { id: 'CT-1', contractNo: 'CT-SD-26090001' }, contractFiles });
  assert.equal(groupOf(shown, 'contract').rows[0].note, 'สัญญาที่ลงนามแล้ว · CT-SD-26090001');
  assert.equal(shown.total, 2); // ยืนยัน 1 + สัญญา 1
});

test('คีย์โหลดแท็บขยับเมื่อไฟล์ฝั่งงวดเปลี่ยน (แจ้งชำระ · แนบ/ถอนใบกำกับ) แม้ updatedAt ของใบไม่ขยับ', () => {
  const base = [{ id: 'I-1', evidence: [], taxInvoiceFile: null }];
  const k0 = installmentFilesKey(base);
  assert.notEqual(installmentFilesKey([{ ...base[0], evidence: [{}] }]), k0);
  assert.notEqual(installmentFilesKey([{ ...base[0], taxInvoiceFile: { storagePath: 'p' } }]), k0);
  assert.equal(installmentFilesKey([{ ...base[0], label: 'เปลี่ยนป้าย' }]), k0); // ไม่เกี่ยวกับไฟล์ = ไม่ต้องโหลดใหม่
  assert.equal(installmentFilesKey(null), '');
});

// ── ยามระดับซอร์สของหน้าใบ (คอมโพเนนต์ JSX import ใต้ raw Node ไม่ได้) ──
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const page = strip(readFileSync(new URL('../../app/sales-planning/sales-orders/[id]/page.js', import.meta.url), 'utf8'));

test('หน้าใบ: แท็บ "เอกสาร" ถัดภาพรวมทุกใบ · ตัวโหลดเรียกก่อน early return (กฎลำดับ hook)', () => {
  assert.match(page, /const tabKeys = \["overview", "documents",/);
  const hook = page.indexOf('useSalesOrderDocuments(');
  assert.ok(hook > 0 && hook < page.indexOf('if (!order) {'), 'hook ต้องอยู่ก่อน return ตอนยังไม่มีใบ');
  assert.match(page, /installmentFilesKey\(installments\)/);
  assert.match(page, /activeTab === "documents" && \(\s*<SalesOrderDocumentsPanel/);
});
