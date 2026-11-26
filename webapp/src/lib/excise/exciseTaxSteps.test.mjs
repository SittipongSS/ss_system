import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXCISE_FORMULA_TEXT, exciseSplitShort, exciseSplitText, exciseTaxSteps, productTaxPerUnit } from './exciseTaxSteps.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// มติเจ้าของ 26/11/2026 (V43): ทรงตามที่เจ้าของพิมพ์มา — ราคา 1,290 → 1,205.61 → ① 96.45 → ② 9.65
test('exciseTaxSteps: สามขั้นตามตัวอย่างของเจ้าของ · สูตรอ่านตามได้ทีละบรรทัด · รวม 106.10', () => {
  const steps = exciseTaxSteps(1290);
  assert.deepEqual(
    steps.rows.map((r) => [r.marker, r.label, r.formula, r.amount]),
    [
      [null, 'ราคาสินค้าถอด VAT 7%', '1,290.00 ÷ 1.07', 1205.61],
      ['1', 'ภาษีสรรพสามิต 8%', '1,205.61 × 8%', 96.45],
      ['2', 'ภาษีท้องถิ่น 10% ของสรรพสามิต', '96.45 × 10%', 9.65],
    ],
  );
  assert.equal(steps.taxPerUnit, 106.1);
  assert.equal(exciseTaxSteps(null), null);
  assert.equal(exciseTaxSteps(0), null);
  assert.equal(EXCISE_FORMULA_TEXT, 'ถอด VAT 7% แล้วคิดสรรพสามิต 8% + ท้องถิ่น 10% ของสรรพสามิต');
});

test('จอที่โชว์ที่มาของภาษีใช้ขั้นคิดตัวเดียวกัน — ไม่บวกค่าที่เก็บเองหรือพูด "× 8.8%"', () => {
  const product = read('../../app/database/products/[id]/page.js');
  assert.match(product, /<ExciseTaxSteps base=\{exciseTaxBase\} unit=\{unit\} total=\{false\} compact \/>/);
  assert.match(product, /const taxPerUnit = isExempt \? "ยกเว้น" : `\$\{fmtMoney\(exciseSteps\?\.taxPerUnit \|\| 0\)\}/, 'การ์ดสรุปพูดเลขเดียวกับแท็บ');
  assert.doesNotMatch(product, /\(product\.exciseTax \|\| 0\) \+ \(product\.localTax \|\| 0\)/);
  const registration = read('../../app/tax/registrations/[id]/page.js');
  assert.match(registration, /<ExciseTaxSteps base=\{taxBase\} total=\{false\} \/>/);
  const form = read('../../components/database/ProductRetailExcise.js');
  assert.match(form, /<ExciseTaxSteps base=\{base\} unit=\{unit\} total=\{false\} compact \/>/);
  for (const [name, src] of [['หน้าสินค้า', product], ['หน้าทะเบียน', registration], ['ฟอร์มสินค้า', form]]) {
    assert.doesNotMatch(src, /EXCISE_TOTAL_RATE|ถอด VAT แล้วคูณ 8\.8%/, `${name} ไม่พูดสูตร 8.8%`);
  }
});

// แจกแจงภาษี/ชิ้น (เจ้าของ 26/11 "ทำทั้งหมดที่เกี่ยว") — บรรทัดรองของทุกจอที่โชว์ภาษี/ชิ้นเป็นยอดเดียว
test('exciseSplitText / exciseSplitShort / productTaxPerUnit', () => {
  assert.equal(exciseSplitText(21.68, 2.17), 'สรรพสามิต 21.68 + ท้องถิ่น 2.17');
  assert.equal(exciseSplitShort(1205.61, 9.65), '1,205.61 + 9.65');
  assert.equal(exciseSplitText(0, 0), null, 'ไม่มีภาษี = ไม่วาดบรรทัด');
  assert.equal(exciseSplitText(null, 2), null);
  assert.equal(exciseSplitShort(undefined, undefined), null);
  assert.deepEqual(productTaxPerUnit({ exciseTax: 96.45, localTax: 9.65 }), { taxPerUnit: 106.1, excisePerUnit: 96.45, localPerUnit: 9.65 });
  assert.deepEqual(productTaxPerUnit({ isExciseTaxable: false, exciseTax: 96.45, localTax: 9.65 }), { taxPerUnit: 0, excisePerUnit: 0, localPerUnit: 0 });
});

test('ทุกจอที่โชว์ภาษี/ชิ้นเป็นยอดเดียวมีบรรทัดแจกแจง — คิวทะเบียน · อนุมัติ · ฟอร์มทะเบียน · รายการสินค้า · การ์ดสรุป · แบ่งรอบ · รายงาน', () => {
  const api = read('../../app/api/excise-registrations/route.js');
  assert.match(api, /excisePerUnit: taxLine\.exciseRatePerUnit,\s*localPerUnit: taxLine\.localTaxRatePerUnit,/);
  const queue = read('../../app/tax/registrations/page.js');
  assert.equal((queue.match(/\{taxSplit\(r\)\}/g) || []).length, 2, 'ตาราง + การ์ดมือถือ');
  assert.match(read('../../components/excise/ApproveDialog.js'), /exciseSplitText\(taxLine\.exciseRatePerUnit, taxLine\.localTaxRatePerUnit\)/);
  assert.match(read('../../components/excise/RegistrationFormModal.js'), /selectedTaxText\(selected\)/);
  const list = read('../../app/database/products/page.js');
  assert.equal((list.match(/taxSplit\(p\)/g) || []).length >= 3, true, 'จอการ์ด + ตาราง');
  assert.doesNotMatch(list, /\(p\.exciseTax \|\| 0\) \+ \(p\.localTax \|\| 0\)/, 'ไม่บวกค่าดิบเอง');
  assert.match(read('../../app/database/products/[id]/page.js'), /exciseSplitText\(exciseSteps\.exciseTax, exciseSteps\.localTax\)/);
  assert.match(read('../../components/excise/ExciseRoundQuantities.js'), /exciseSplitText\(row\.excisePerUnit, row\.localPerUnit\)/);
  const reports = read('../tax/reports.js');
  assert.match(reports, /\{ key: 'excisePerUnit', label: 'สรรพสามิต\/ชิ้น \(8%\)', money: true, only: 'excel' \}/);
  assert.match(reports, /\{ key: 'taxPaper', label: 'ภาษี\/ชิ้น \(สรรพสามิต \+ ท้องถิ่น\)', multiline: true, only: 'print' \}/);
});
