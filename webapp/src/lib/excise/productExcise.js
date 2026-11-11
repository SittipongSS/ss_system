// ── ธงภาษี + อัตราภาษีของสินค้าหนึ่งตัว ตอนบันทึก — ตัวเดียวของ POST และ PATCH /api/products ─────────────────
//
// เดิมสอง route เขียนสูตรเดียวกันคนละที่ ("ต้องเป็นสูตรเดียวกับตอนสร้าง") · ชุดของขวัญที่มีน้ำหอม (มติเจ้าของ 11/11 · หมวด 14
// ของแผนรื้อสรรพสามิต · mig 0430) เพิ่มกิ่งที่สาม ⇒ ยกมาไว้ที่เดียวก่อนสองฝั่งเพี้ยนหากัน
//
//   หมวดทั่วไป   — "เสียภาษีไหม" ตั้งต้นจากธง isExcise ของหมวด (mig 0131) · ฐานภาษี = ราคาขายปลีกของสินค้า
//   ชุดของขวัญ   — ตั้งต้นจาก **สูตรที่ผูกกับชุด** (giftSetExcise.js) · ชุดคละ = ฐานภาษีจากราคารายชิ้นของแถวน้ำหอม
//   ทั้งสองแบบ   — ธงรายตัวของฝ่าย RA (`taxableOverride`) ชนะเสมอ (resolveProductTaxable)
//
// ⚠️ `retailPriceExVat` ยังเป็นราคาขายปลีกของตัวสินค้า (ชุดคละ = ราคาทั้งชุด) — แค่ exciseTax/localTax ที่คิดจากฐานภาษี
import { categoryFlagsOf, listProductTypes } from '@/lib/master/productTypes';
import { isGiftSetCategory } from '@/lib/master/giftSetFormulas';
import { giftSetExciseFields } from '@/lib/excise/giftSetExcise';
import { productTaxRates, resolveProductTaxable } from '@/lib/tax/exciseBilling';

/**
 * @param input.categoryCode       หมวดของสินค้าหลังหมวดนิ่ง
 * @param input.retailPriceIncVat  ราคาขายปลีกของสินค้า (ชุดของขวัญ = ราคาทั้งชุด) · ว่างได้
 * @param input.taxableOverride    คำตัดสินรายตัวของ RA (true/false) · null = ตามค่าตั้งต้น
 * @param input.giftSetRows        แถวสูตรของชุด (ชุดของขวัญเท่านั้น · `{ categoryCode, retailPriceIncVat, pieceQty }`)
 * @param deps                     ตัวอ่านหมวด (ส่งตัวจำลองในเทสต์)
 * @returns `{ isExciseTaxable, retailPriceExVat, exciseTax, localTax, exciseTaxBase, exciseBasePriceIncVat }` — เขียนลง products ทั้งก้อน
 */
export async function productExciseFields(
  { categoryCode, retailPriceIncVat = null, taxableOverride = null, giftSetRows = [] } = {},
  { flagsOf = categoryFlagsOf, loadTypes = listProductTypes } = {},
) {
  let autoTaxable;
  let exciseTaxBase = null;
  let exciseBasePriceIncVat = null;
  if (isGiftSetCategory(categoryCode)) {
    const rows = giftSetRows || [];
    const fields = giftSetExciseFields(rows, rows.length ? await loadTypes() : []);
    autoTaxable = fields.autoTaxable;
    exciseTaxBase = fields.exciseTaxBase;
    exciseBasePriceIncVat = fields.exciseBasePriceIncVat;
  } else {
    autoTaxable = (await flagsOf(categoryCode)).isExcise;
  }
  const isExciseTaxable = resolveProductTaxable({ taxableOverride, autoTaxable });
  const own = productTaxRates(retailPriceIncVat, { taxable: isExciseTaxable });
  const taxed = exciseTaxBase ? productTaxRates(exciseBasePriceIncVat, { taxable: isExciseTaxable }) : own;
  return {
    isExciseTaxable,
    retailPriceExVat: own.retailPriceExVat,
    exciseTax: taxed.exciseTax,
    localTax: taxed.localTax,
    exciseTaxBase,
    exciseBasePriceIncVat,
  };
}
