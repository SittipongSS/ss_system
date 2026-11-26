import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXCISE_FORMULA_TEXT, exciseTaxSteps } from './exciseTaxSteps.js';

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
  assert.match(product, /const taxPerUnit = isExempt \? "ยกเว้น" : fmtMoney\(exciseSteps\?\.taxPerUnit \|\| 0\);/, 'การ์ดสรุปพูดเลขเดียวกับแท็บ');
  assert.doesNotMatch(product, /\(product\.exciseTax \|\| 0\) \+ \(product\.localTax \|\| 0\)/);
  const registration = read('../../app/tax/registrations/[id]/page.js');
  assert.match(registration, /<ExciseTaxSteps base=\{taxBase\} total=\{false\} \/>/);
  const form = read('../../components/database/ProductRetailExcise.js');
  assert.match(form, /<ExciseTaxSteps base=\{base\} unit=\{unit\} total=\{false\} compact \/>/);
  for (const [name, src] of [['หน้าสินค้า', product], ['หน้าทะเบียน', registration], ['ฟอร์มสินค้า', form]]) {
    assert.doesNotMatch(src, /EXCISE_TOTAL_RATE|ถอด VAT แล้วคูณ 8\.8%/, `${name} ไม่พูดสูตร 8.8%`);
  }
});
