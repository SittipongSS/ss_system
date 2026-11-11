// ── สถานะสรรพสามิตของสินค้าบนฟอร์มเพิ่ม/แก้ — หัวข้อ ④ "ราคาขายปลีกและสรรพสามิต" (มติเจ้าของ 11/11/2026 F1–F5) ─────────
//
// ⭐ docs/product-form-rework.md: หัวข้อ ④ เป็นที่เดียวที่ฟอร์มพูดเรื่องสรรพสามิต — "เสีย / ไม่เสีย" + เหตุ
//    (เดิมกล่องหมวดด้านบนดูแค่ธงของหมวด ชุดของขวัญจึงไม่ขึ้นว่าเสียภาษี ขณะที่ป้ายใต้รายการสูตรบอกว่าเสีย)
// ⚠️ กติกาเดียวกับตอนบันทึก (lib/excise/productExcise.js → resolveProductTaxable):
//    ธงรายตัวของฝ่าย RA (`taxableOverride`) ชนะ · ชุดของขวัญตั้งต้นจากสูตรในชุด · อื่น ๆ ตั้งต้นจากธงของหมวด
// ⚠️ ไฟล์บริสุทธิ์ (client-safe) — จอเรียกระหว่างพิมพ์ ไม่แตะฐาน
import { categoryFlags, categoryRow } from '@/lib/master/categoryOf';
import { categoryName } from '@/lib/master/productCategoryOptions';
import { isGiftSetCategory } from '@/lib/master/giftSetFormulas';
import { EXCISE_TAX_BASE, GIFT_SET_EXCISE_KIND, giftSetExcise, giftSetPiecesTotal, giftSetPriceMode } from '@/lib/excise/giftSetExcise';
import { exciseTaxLine, productTaxRates } from '@/lib/tax/exciseBilling';

const KIND_TEXT = { [GIFT_SET_EXCISE_KIND.pure]: 'ชุดน้ำหอมล้วน', [GIFT_SET_EXCISE_KIND.mixed]: 'ชุดคละประเภท' };

const categoryLabel = (code, productTypes) => {
  const name = categoryName(categoryRow(code, productTypes)) || '';
  return name ? `${code} ${name}` : code;
};

/**
 * @param input.categoryCode   หมวดของสินค้า (หลังเลือก/อ่านจากรหัส)
 * @param input.productTypes   ทะเบียนหมวด (ต้องมี `isExcise`)
 * @param input.giftSetRows    แถวสูตรของชุด (ชุดของขวัญเท่านั้น)
 * @param input.priceMode      วิธีแจ้งราคาที่เลือก ('set' | 'pieces') · อื่น ๆ = ยังไม่เลือก
 * @param input.taxableOverride ธงรายตัวของ RA บนสินค้า (true / false · null = ไม่มี)
 * @returns `{ taxable, source, reason, gift }`
 *   · `source` = 'ra' | 'gift' | 'category' · `gift` = ผล `giftSetExcise` (ชุดของขวัญเท่านั้น · ไม่ใช่ = null)
 */
export function productExciseStatus({ categoryCode, productTypes = [], giftSetRows = [], priceMode = null, taxableOverride = null } = {}) {
  const code = String(categoryCode || '').trim();
  const gift = isGiftSetCategory(code) ? giftSetExcise(giftSetRows, productTypes, { mode: priceMode }) : null;
  const autoTaxable = gift ? gift.taxable : categoryFlags(code, productTypes).isExcise;
  if (taxableOverride === true) {
    return { taxable: true, source: 'ra', reason: 'ฝ่าย RA ตั้งให้สินค้าตัวนี้เสียสรรพสามิตรายตัว', gift };
  }
  if (taxableOverride === false) {
    return {
      taxable: false,
      source: 'ra',
      reason: autoTaxable ? 'ฝ่าย RA ยกเว้นสินค้าตัวนี้รายตัว' : 'ฝ่าย RA ตั้งให้สินค้าตัวนี้ไม่เสียสรรพสามิต',
      gift,
    };
  }
  if (gift) {
    if (!gift.taxable) return { taxable: false, source: 'gift', reason: 'ไม่มีสูตรหมวดที่เสียสรรพสามิตในชุด', gift };
    const cats = [...new Set(gift.taxableRows.map((row) => String(row.categoryCode).trim()))]
      .map((c) => categoryLabel(c, productTypes)).join(' · ');
    return { taxable: true, source: 'gift', reason: `${KIND_TEXT[gift.kind]} — ในชุดมีสูตรหมวด ${cats} ซึ่งเสียสรรพสามิต`, gift };
  }
  if (!code) return { taxable: false, source: 'category', reason: 'เลือกหมวดสินค้าก่อน', gift: null };
  return {
    taxable: autoTaxable,
    source: 'category',
    reason: `หมวด ${categoryLabel(code, productTypes)} ${autoTaxable ? 'ติ๊กเสียสรรพสามิต' : 'ไม่ได้ติ๊กเสียสรรพสามิต'}`,
    gift: null,
  };
}

/**
 * ภาษีต่อหน่วยที่จะคิดได้จากฐานภาษี (F4) — ตัวคิดเดียวกับระบบ: `productTaxRates` (ถอด VAT × 8.8%) → `exciseTaxLine` (ปัดครั้งเดียว)
 * @returns `{ taxPerUnit, retailPriceExVat }` · ฐานว่าง/0 = null
 */
export function exciseTaxPreview(basePriceIncVat) {
  const base = Number(basePriceIncVat);
  if (!Number.isFinite(base) || base <= 0) return null;
  const rates = productTaxRates(base, { taxable: true });
  const line = exciseTaxLine({ exciseRatePerUnit: rates.exciseTax, localTaxRatePerUnit: rates.localTax, quantity: 1 });
  return { taxPerUnit: line.taxPerUnit, retailPriceExVat: rates.retailPriceExVat };
}

const hasPrice = (value) => value !== '' && value != null && Number(value) > 0;

/**
 * ฐานภาษีจากค่าบนฟอร์ม (ก่อนบันทึก) — ตัวเดียวกับที่ฝั่งบันทึกจะคิด (productExciseFields + giftSetRetailFields)
 *   ชุดที่มีของเสียภาษี: รวมชุด = ราคาทั้งชุด · รายชิ้น = Σ แถวที่เสียภาษี · ยังไม่เลือก = null
 *   ชุดที่ RA ตั้งเสียรายตัว (ไม่มีของเสียภาษีในชุด) / สินค้าทั่วไป = ราคาขายปลีกของสินค้า (ชุดรายชิ้น = ผลรวมทุกชิ้น)
 * @returns ตัวเลข > 0 หรือ null · ไม่เสียภาษี = null
 */
export function formTaxBase({ status, giftSet = false, retailPriceIncVat = null, giftSetRows = [], priceMode = null } = {}) {
  if (!status?.taxable) return null;
  const mode = giftSetPriceMode(priceMode);
  let base = retailPriceIncVat;
  if (giftSet && status.gift?.taxable) {
    base = mode === EXCISE_TAX_BASE.pieces ? status.gift.basePriceIncVat : mode === EXCISE_TAX_BASE.set ? retailPriceIncVat : null;
  } else if (giftSet && mode === EXCISE_TAX_BASE.pieces) {
    base = giftSetPiecesTotal(giftSetRows);
  }
  return hasPrice(base) ? Number(base) : null;
}

/**
 * รายการที่ต้องมีก่อนยื่นขึ้นทะเบียน RA (R1 · มติเจ้าของ 11/11 รอบสอง: "บังคับใส่ตอนจะยื่น") — ฟอร์มติ๊กให้เห็นว่ายังขาดอะไร
 * ⚠️ กติกาเดียวกับด่านยื่น (`missingRetailPriceEntry` → `exciseBasePriceIncVat`) แต่อ่านค่าบนฟอร์ม ไม่ใช่ค่าที่บันทึกแล้ว
 * @returns `[{ key, text, ok }]` · ไม่เสียภาษี = []
 */
export function exciseFilingChecklist({ status, giftSet = false, retailPriceIncVat = null, giftSetRows = [], priceMode = null } = {}) {
  if (!status?.taxable) return [];
  const mode = giftSetPriceMode(priceMode);
  if (giftSet && status.gift?.taxable) {
    const items = [{ key: 'mode', text: 'เลือกวิธีแจ้งราคา (รวมชุด / รายชิ้น)', ok: !!mode }];
    if (mode === EXCISE_TAX_BASE.pieces) {
      items.push({
        key: 'pieces',
        text: `ราคาต่อชิ้นของแถวที่เสียภาษี (${status.gift.taxableRows.length} แถว)`,
        ok: hasPrice(status.gift.basePriceIncVat),
      });
    } else if (mode === EXCISE_TAX_BASE.set) {
      items.push({ key: 'price', text: 'ราคาขายปลีกทั้งชุด (รวม VAT)', ok: hasPrice(retailPriceIncVat) });
    } else {
      items.push({ key: 'price', text: 'ราคาตามวิธีที่เลือก', ok: false });
    }
    return items;
  }
  if (giftSet) {
    return [{
      key: 'price',
      text: mode === EXCISE_TAX_BASE.pieces ? 'ราคาต่อชิ้นครบทุกแถว (ราคาทั้งชุด)' : 'ราคาขายปลีกทั้งชุด (รวม VAT)',
      ok: formTaxBase({ status, giftSet, retailPriceIncVat, giftSetRows, priceMode }) != null,
    }];
  }
  return [{ key: 'price', text: 'ราคาขายปลีก (รวม VAT)', ok: hasPrice(retailPriceIncVat) }];
}
