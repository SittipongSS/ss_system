// ราคาขายปลีกที่แจ้งไว้ (รวม VAT) ใต้บรรทัดค่าสรรพสามิต (เจ้าของ 26/11/2026 · V45)
// "ใบเสนอราคาสรรพสามิต อยากให้ใส่ราคาขายปลีกรวม VAT ด้วย เพราะลูกค้าและเราจะได้รู้ว่าแจ้งราคาไว้เท่าไหร่"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXCISE_CHARGE_LINE_KIND, exciseDeclaredRetailText } from './exciseCharge.js';
import { buildQuotationMasterModelFromQuote } from '../sales/quotationMasterTemplate.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const exciseLine = (overrides = {}) => ({
  id: 'QL-1', sortOrder: 0, productId: 'PRD-X', fgCode: 'FG-0518-04-003', description: 'FG-0518-01-002-1899 โก วิท เดอะ โฟลว์',
  qty: 600, unit: 'ขวด', unitPrice: 106.1, lineTotal: 63660,
  metadata: { lineKind: EXCISE_CHARGE_LINE_KIND, retailPriceIncVat: 1290, excisePerUnit: 96.45, localPerUnit: 9.65, descriptionEn: 'FG-0518-01-002-1899 Go With The Flow' },
  ...overrides,
});

test('exciseDeclaredRetailText: ราคาที่ตรึงไว้บนบรรทัด ตามภาษาใบ · บรรทัดอื่น/ไม่มีราคา = ว่าง', () => {
  assert.equal(exciseDeclaredRetailText(exciseLine()), 'ราคาขายปลีกที่แจ้งไว้ (รวม VAT): 1,290.00 บาท');
  assert.equal(exciseDeclaredRetailText(exciseLine(), 'en'), 'Declared retail price (incl. VAT): THB 1,290.00');
  assert.equal(exciseDeclaredRetailText({ metadata: { note: 'x', retailPriceIncVat: 1290 } }), '', 'ไม่ใช่บรรทัดค่าสรรพสามิต');
  assert.equal(exciseDeclaredRetailText(exciseLine({ metadata: { lineKind: EXCISE_CHARGE_LINE_KIND, retailPriceIncVat: null } })), '');
  assert.equal(exciseDeclaredRetailText(null), '');
});

test('ใบพิมพ์ (QT/SO ใช้ตัวสร้างเดียวกัน): บรรทัดค่าสรรพสามิตมีราคาขายปลีกใต้รายการ · ต่อท้ายหมายเหตุเดิมขึ้นบรรทัดใหม่ · บรรทัดสินค้าปกติไม่เปลี่ยน', () => {
  const quote = {
    id: 'QT-1', quotationNumber: 'QT-26110001-0', status: 'draft', origin: 'excise',
    lines: [
      exciseLine(),
      exciseLine({ id: 'QL-2', sortOrder: 1, metadata: { ...exciseLine().metadata, retailPriceIncVat: 290, note: 'รอบแรก' } }),
      { id: 'QL-3', sortOrder: 2, fgCode: 'FG-1-01-002-1', description: 'น้ำหอม', qty: 1, unit: 'ขวด', unitPrice: 100, lineTotal: 100, metadata: { note: 'หมายเหตุปกติ' } },
    ],
  };
  const lines = buildQuotationMasterModelFromQuote(quote).pages.flatMap((page) => page.lines);
  assert.deepEqual(lines.map((line) => line.note), [
    'ราคาขายปลีกที่แจ้งไว้ (รวม VAT): 1,290.00 บาท',
    'รอบแรก\nราคาขายปลีกที่แจ้งไว้ (รวม VAT): 290.00 บาท',
    'หมายเหตุปกติ',
  ]);
  const en = buildQuotationMasterModelFromQuote({ ...quote, docLanguage: 'en' }).pages.flatMap((page) => page.lines);
  assert.equal(en[0].note, 'Declared retail price (incl. VAT): THB 1,290.00');
});

test('จอ: บรรทัดของ QT/SO (แก้ได้ + อ่านอย่างเดียว) วาดราคาขายปลีกที่แจ้งไว้ด้วยคำเดียวกับใบพิมพ์', () => {
  const src = read('../../components/salesPlanning/QuotationLineItems.js');
  assert.match(src, /export function ExciseDeclaredRetail\(\{ line \}\) \{\s*const text = exciseDeclaredRetailText\(line\);/);
  assert.equal((src.match(/<ExciseDeclaredRetail line=\{line\} \/>/g) || []).length, 2, 'ตารางแก้ได้ + ตารางอ่านอย่างเดียว (หน้า SO)');
  assert.match(read('../sales/issuedQuotationSnapshot.js'), /export const ISSUED_QUOTATION_LAYOUT_VERSION = 'quote-master-v4\.7';/);
});
