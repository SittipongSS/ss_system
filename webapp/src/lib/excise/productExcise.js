// ── ธงภาษี + อัตราภาษีของสินค้าหนึ่งตัว ตอนบันทึก — ตัวเดียวของ POST และ PATCH /api/products ─────────────────
//
// เดิมสอง route เขียนสูตรเดียวกันคนละที่ ("ต้องเป็นสูตรเดียวกับตอนสร้าง") · ชุดของขวัญที่มีน้ำหอม (มติเจ้าของ 11/11 · หมวด 14
// ของแผนรื้อสรรพสามิต · mig 0430) เพิ่มกิ่งที่สาม ⇒ ยกมาไว้ที่เดียวก่อนสองฝั่งเพี้ยนหากัน
//
//   หมวดทั่วไป   — "เสียภาษีไหม" ตั้งต้นจากธง isExcise ของหมวด (mig 0131) · ฐานภาษี = ราคาขายปลีกของสินค้า
//   ชุดของขวัญ   — ตั้งต้นจาก **สูตรที่ผูกกับชุด** (giftSetExcise.js) · ฐานภาษีตามที่ฝ่ายขายเลือก (G5): รวมชุด = ราคาขายปลีก ·
//                  รายชิ้น = ราคาต่อชิ้นของแถวน้ำหอม · ยังไม่เลือก = ไม่มีฐาน (ภาษี 0)
//   ทั้งสองแบบ   — ธงรายตัวของฝ่าย RA (`taxableOverride`) ชนะเสมอ (resolveProductTaxable)
//
// ⚠️ `retailPriceExVat` ยังเป็นราคาขายปลีกของตัวสินค้า (ชุด = ราคาทั้งชุด) — แค่ exciseTax/localTax ที่คิดจากฐานภาษี
import { categoryFlagsOf, listProductTypes } from '@/lib/master/productTypes';
import { isGiftSetCategory } from '@/lib/master/giftSetFormulas';
import { EXCISE_TAX_BASE, giftSetExciseFields } from '@/lib/excise/giftSetExcise';
import { productTaxRates, resolveProductTaxable } from '@/lib/tax/exciseBilling';

/**
 * @param input.categoryCode       หมวดของสินค้าหลังหมวดนิ่ง
 * @param input.retailPriceIncVat  ราคาขายปลีกของสินค้า (ชุดของขวัญ = ราคาทั้งชุด) · ว่างได้
 * @param input.taxableOverride    คำตัดสินรายตัวของ RA (true/false) · null = ตามค่าตั้งต้น
 * @param input.giftSetRows        แถวสูตรของชุด (ชุดของขวัญเท่านั้น · `{ categoryCode, retailPriceIncVat, pieceQty }`)
 * @param input.priceMode          วิธีแจ้งราคาที่ฝ่ายขายเลือก ('set' | 'pieces') · อื่น ๆ = ยังไม่เลือก
 * @param deps                     ตัวอ่านหมวด (ส่งตัวจำลองในเทสต์)
 * @returns `{ isExciseTaxable, retailPriceExVat, exciseTax, localTax, exciseTaxBase, exciseBasePriceIncVat }` — เขียนลง products ทั้งก้อน
 */
export async function productExciseFields(
  { categoryCode, retailPriceIncVat = null, taxableOverride = null, giftSetRows = [], priceMode = null } = {},
  { flagsOf = categoryFlagsOf, loadTypes = listProductTypes } = {},
) {
  let autoTaxable;
  let exciseTaxBase = null;
  let exciseBasePriceIncVat = null;
  if (isGiftSetCategory(categoryCode)) {
    const rows = giftSetRows || [];
    const fields = giftSetExciseFields(rows, rows.length ? await loadTypes() : [], priceMode);
    autoTaxable = fields.autoTaxable;
    exciseTaxBase = fields.exciseTaxBase;
    exciseBasePriceIncVat = fields.exciseBasePriceIncVat;
  } else {
    autoTaxable = (await flagsOf(categoryCode)).isExcise;
  }
  const isExciseTaxable = resolveProductTaxable({ taxableOverride, autoTaxable });
  /* 🐞 RA ยกเว้นรายตัว (override false) บนชุดที่มีน้ำหอม = ไม่เสียภาษี ⇒ ไม่มีเรื่องวิธีแจ้งราคา — เดิม (#2035) ยังเก็บ 'unchosen'
     แล้ว route ตีกลับ "เลือกวิธีแจ้งราคาก่อน" ทั้งที่สินค้าได้รับยกเว้น (เจอตอนทำหัวข้อ ④ ของฟอร์ม · 11/11) */
  if (!isExciseTaxable) {
    exciseTaxBase = null;
    exciseBasePriceIncVat = null;
  }
  const own = productTaxRates(retailPriceIncVat, { taxable: isExciseTaxable });
  // รวมชุด/สินค้าทั่วไป = ราคาขายปลีกของสินค้า · รายชิ้น = ฐานที่รวมจากแถว · ยังไม่เลือก = ไม่มีฐาน (ภาษี 0)
  const taxed = exciseTaxBase === EXCISE_TAX_BASE.pieces || exciseTaxBase === EXCISE_TAX_BASE.unchosen
    ? productTaxRates(exciseBasePriceIncVat, { taxable: isExciseTaxable })
    : own;
  return {
    isExciseTaxable,
    retailPriceExVat: own.retailPriceExVat,
    exciseTax: taxed.exciseTax,
    localTax: taxed.localTax,
    exciseTaxBase,
    exciseBasePriceIncVat,
  };
}

