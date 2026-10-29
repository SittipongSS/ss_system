import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuotationMasterModelFromQuote } from '../sales/quotationMasterTemplate.js';
import { buildSalesOrderPrintHTML } from '../sales/salesOrderPrint.js';

/* ── กระดาษใบค่าสรรพสามิต: บล็อก "ข้อมูลอ้างอิง" (มติเจ้าของ 29/10 จากกระดาษใบทดลอง QT-26100568-0) ─────────────
   เดิมใบไม่มีดีล ⇒ โครงการ/ประเภทโครงการ/ผู้เสนอราคาเป็นขีด และเอกสารอ้างอิงขึ้นต้นด้วย "ค่าภาษีสรรพสามิตของ"
   ตอนนี้: โครงการ = ค่าภาษีสรรพสามิต · ประเภท = OTHER · ผู้เสนอราคา + โทร = AE เจ้าของดีลของ SO ต้นทาง · อ้างอิง = SO / QT */
const exciseQuote = (extra = {}) => ({
  id: 'QX1', quoteNumber: 'QT-26100568-0', origin: 'excise', deal: null, dealId: null,
  customerName: 'บริษัท เซนท์ สตูดิโอ แลบอราทอรี่ จำกัด', quoteDate: '2026-10-29', validUntil: '2026-11-28',
  approvalStatus: 'approved', status: 'sent', docLanguage: 'th', vatRate: 7,
  subtotal: 100, vatAmount: 7, totalAmount: 107, referenceNote: 'SO-26080010-0 / QT-26080033-1',
  createdBy: 'U-ADMIN', createdByName: 'Admin S&S', createdByPhone: '02-000-7722',
  metadata: { salesOwner: 'Sittipong Kaenthaw', salesOwnerId: 'U-OWNER', salesOwnerPhone: '061-387-9399' },
  lines: [{ id: 'L1', productId: 'P-X', fgCode: 'FG-108-04-003', description: 'FG-108-01-002-0326 โรเซ่ โรส', qty: 1, unitPrice: 100, lineTotal: 100 }],
  ...extra,
});
const rowsOf = (model) => Object.fromEntries(model.referenceRows.map((row) => [row.label, row.value]));

test('ใบเสนอราคาค่าสรรพสามิต: โครงการ = ค่าภาษีสรรพสามิต · ประเภท OTHER · ผู้เสนอราคา + โทร = เจ้าของดีลต้นทาง · อ้างอิง = SO / QT', () => {
  const rows = rowsOf(buildQuotationMasterModelFromQuote(exciseQuote()));
  assert.equal(rows['เลขที่โครงการ'], '-');
  assert.equal(rows['โครงการ'], 'ค่าภาษีสรรพสามิต');
  assert.equal(rows['ประเภทโครงการ'], 'OTHER');
  assert.equal(rows['ผู้เสนอราคา'], 'Sittipong Kaenthaw');
  assert.equal(rows['โทร'], '061-387-9399', 'เบอร์เจ้าของดีลที่ตรึงไว้ ไม่ใช่เบอร์คนสร้างใบ');
  assert.equal(rows['เอกสารอ้างอิง'], 'SO-26080010-0 / QT-26080033-1');
});

test('ใบค่าสรรพสามิตรุ่นก่อนตรึงชื่อ: ผู้เสนอราคาอ่านจาก sourceDeal ที่ route แนบมา · ใบอังกฤษได้คำอังกฤษ', () => {
  const older = exciseQuote({ metadata: { salesOwnerPhone: '061-387-9399' }, sourceDeal: { id: 'D1', ownerName: 'AE ต้นทาง' } });
  assert.equal(rowsOf(buildQuotationMasterModelFromQuote(older))['ผู้เสนอราคา'], 'AE ต้นทาง');
  const en = buildQuotationMasterModelFromQuote(exciseQuote({ docLanguage: 'en' }));
  assert.ok(en.referenceRows.some((row) => row.value === 'Excise tax recharge'));
  assert.ok(en.referenceRows.some((row) => row.value === 'OTHER'));
});

test('ใบขายปกติไม่ขยับ: โครงการ/ประเภทมาจากดีล · ไม่มีดีล (ใบเก่า) ยังเป็นขีด', () => {
  const pipeline = rowsOf(buildQuotationMasterModelFromQuote(exciseQuote({
    origin: 'pipeline', deal: { id: 'D1', title: 'ดีลหนึ่ง', dealType: 'NPD', ownerName: 'AE หนึ่ง', ownerId: 'U-OWNER' },
  })));
  assert.equal(pipeline['โครงการ'], 'ดีลหนึ่ง');
  assert.equal(pipeline['ประเภทโครงการ'], 'NPD');
  assert.equal(pipeline['ผู้เสนอราคา'], 'AE หนึ่ง');
  const orphan = rowsOf(buildQuotationMasterModelFromQuote(exciseQuote({ origin: 'pipeline', metadata: {} })));
  assert.equal(orphan['โครงการ'], '-');
  assert.equal(orphan['ประเภทโครงการ'], '-');
});

test('กระดาษ SO ค่าสรรพสามิตพูดคำเดียวกับใบเสนอราคา (โครงการ · ประเภท · ผู้เสนอ = เจ้าของดีลต้นทาง)', () => {
  const html = buildSalesOrderPrintHTML({
    id: 'SX1', orderNumber: 'SO-26100401-0', origin: 'excise', deal: null, sourceDeal: { id: 'D1', ownerName: 'Sittipong Kaenthaw' },
    status: 'approved', orderDate: '2026-10-29', docLanguage: 'th', customerName: 'ลูกค้า', subtotal: 100, vatAmount: 7, totalAmount: 107,
    quotation: { quoteNumber: 'QT-26100568-0' },
    lines: [{ id: 'L1', fgCode: 'FG-108-04-003', description: 'FG-108-01-002-0326 โรเซ่ โรส', qty: 1, unitPrice: 100, lineTotal: 100 }],
  });
  assert.match(html, /ค่าภาษีสรรพสามิต/);
  assert.match(html, />OTHER</);
  assert.match(html, /Sittipong Kaenthaw/);
});

/* "คิดใหม่จากใบสั่งขาย" เติมหัวใบที่มาจาก SO ต้นทางด้วย — ใบ Rev. ของใบที่ออกก่อน 29/10 จะได้ผู้เสนอราคา + คำอ้างอิงรูปใหม่เอง
   แต่คำอ้างอิงที่คนพิมพ์เองต้องไม่ถูกเขียนทับ */
test('คิดใหม่จากใบสั่งขาย: เขียนทับคำอ้างอิงเฉพาะที่ระบบเขียนเอง · เติมผู้เสนอราคาเจ้าของดีลต้นทาง · คงชุดเงื่อนไขการค้าเดิม', async () => {
  const { exciseReferenceIsAuto } = await import('./exciseQuotation.js');
  assert.equal(exciseReferenceIsAuto(''), true);
  assert.equal(exciseReferenceIsAuto(null), true);
  assert.equal(exciseReferenceIsAuto('ค่าภาษีสรรพสามิตของ SO-26080010-0 / QT-26080033-1'), true, 'รูปเดิมก่อน 29/10');
  assert.equal(exciseReferenceIsAuto('อ้างถึง PO-55 ลว. 1 พ.ย.'), false, 'คนพิมพ์เอง');
  const { readFileSync } = await import('node:fs');
  const route = readFileSync(new URL('../../app/api/sales-planning/quotations/[id]/route.js', import.meta.url), 'utf8');
  assert.match(route, /if \(exciseReferenceIsAuto\(before\.referenceNote\)\) body\.referenceNote = header\.referenceNote;/);
  assert.match(route, /paymentPresetVersionId: before\.metadata\?\.paymentPresetVersionId \|\| null/);
  const lib = readFileSync(new URL('./exciseQuotation.js', import.meta.url), 'utf8');
  assert.match(lib, /salesOwner: order\.deal\?\.ownerName \|\| null,/, 'ตอนออกใบตรึงชื่อเจ้าของดีลต้นทาง');
  assert.match(lib, /salesOwner: deal\?\.ownerName \|\| null,/, 'ตอนคิดใหม่เติมชื่อเจ้าของดีลต้นทาง ณ ตอนนี้');
});
