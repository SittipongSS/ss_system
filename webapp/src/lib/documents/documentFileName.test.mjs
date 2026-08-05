import test from 'node:test';
import assert from 'node:assert/strict';
import { documentFileName } from './documentShell.js';
import { buildQuotationMasterPreview } from '../sales/quotationMasterTemplate.js';
import { renderQuotationMasterDocumentHTML } from '../sales/quotationMasterDocument.js';
import { buildBillPrintHTML } from '../tax/billPrint.js';
import { buildGanttPrintHTML } from '../pm/ganttPrint.js';

const CUSTOMER = 'บริษัท ตัวอย่าง โปรดักส์ จำกัด';
const DEAL = 'ผลิตภัณฑ์น้ำหอมปรับอากาศ 2026';
const titleOf = (html) => html.match(/<title>([^<]*)<\/title>/)[1];

test('ชื่อไฟล์ = รหัสเอกสาร_ชื่อลูกค้า_ชื่อดีล', () => {
  assert.equal(documentFileName('QT-1', CUSTOMER, DEAL), `QT-1_${CUSTOMER}_${DEAL}`);
});

test('ส่วนที่ว่าง/ขีด ถูกข้าม ไม่เหลือ "_" ลอยท้ายชื่อ', () => {
  assert.equal(documentFileName('QT-1', '-', ''), 'QT-1');
  assert.equal(documentFileName('QT-1', CUSTOMER, null), `QT-1_${CUSTOMER}`);
  assert.equal(documentFileName('', '', ''), 'document');
});

test('ตัดอักขระที่ตั้งเป็นชื่อไฟล์ไม่ได้ และยุบช่องว่างซ้ำ', () => {
  assert.equal(documentFileName('QT-1', 'ลูกค้า/ทดสอบ*', 'ดีล  เว้น   วรรค'), 'QT-1_ลูกค้า ทดสอบ_ดีล เว้น วรรค');
  // ห้ามเหลืออักขระต้องห้ามของ Windows/POSIX หลุดออกไป
  assert.ok(!/[\\/:*?"<>|]/.test(documentFileName('a/b', 'c:d', 'e|f')));
});

// ชื่อดีลยาวได้มาก ระบบไฟล์ส่วนใหญ่จำกัด 255 ไบต์ (ไทยกินที่ 3 ไบต์/ตัว)
test('จำกัดความยาวต่อส่วน', () => {
  const name = documentFileName('QT-1', 'ก'.repeat(200), 'ข'.repeat(200));
  assert.ok(Buffer.byteLength(name, 'utf8') < 255, `ยาวเกินไป: ${Buffer.byteLength(name, 'utf8')} ไบต์`);
});

/* เบราว์เซอร์ใช้ document.title ตั้งชื่อไฟล์ตอน "พิมพ์ → บันทึกเป็น PDF" ซึ่งเป็นทาง
   ดาวน์โหลดของใบสั่งขาย/ไทม์ไลน์/ใบแจ้งชำระ (ไม่ผ่าน API จึงตั้ง header ไม่ได้) */
test('เอกสารทั้งสี่ชนิดใส่ชื่อไฟล์ไว้ใน <title>', () => {
  for (const docType of ['quotation', 'salesOrder']) {
    const title = titleOf(renderQuotationMasterDocumentHTML(
      buildQuotationMasterPreview('standard', 'approved', 'v4', docType), { toolbar: false },
    ));
    assert.match(title, /^(QT|SO)-\S+_.+_.+$/, `${docType}: ${title}`);
    assert.ok(title.endsWith(`_${DEAL}`), `${docType}: ${title}`);
  }

  const tax = titleOf(buildBillPrintHTML(
    { taxNoticeNumber: 'ET-26070001-0', items: [], customerName: CUSTOMER, dealTitle: DEAL },
    { name: CUSTOMER },
  ));
  assert.equal(tax, `ET-26070001-0_${CUSTOMER}_${DEAL}`);

  const timeline = titleOf(buildGanttPrintHTML(
    { code: 'PJ-26070038', name: 'Signature Bloom', customerName: CUSTOMER, deals: [{ title: DEAL, dealType: 'SCENT' }] },
    [], {},
  ));
  assert.ok(timeline.startsWith('PJ-26070038'), timeline);
  assert.ok(timeline.endsWith(`_${CUSTOMER}_${DEAL}`), timeline);
});

// ไทม์ไลน์ครอบได้หลายดีล — ต่อชื่อดีลทั้งหมดจะยาวจนใช้เป็นชื่อไฟล์ไม่ได้
test('ไทม์ไลน์หลายดีลใช้ชื่อโครงการแทนชื่อดีล', () => {
  const title = titleOf(buildGanttPrintHTML({
    code: 'PJ-26070038', name: 'Signature Bloom', customerName: CUSTOMER,
    deals: [{ title: DEAL, dealType: 'SCENT' }, { title: 'ขวดใหม่ 30ml', dealType: 'NPD' }],
  }, [], {}));
  assert.ok(title.endsWith('_Signature Bloom'), title);
});
