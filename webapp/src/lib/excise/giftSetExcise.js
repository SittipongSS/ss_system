// ── ชุดของขวัญ (01-037) ที่มีของเสียสรรพสามิต — ตัวตัดสินเดียวของจอและ API ─────────────────────────────
//
// ⭐ มติเจ้าของ 11/11/2026 (ถามทีละข้อ · แผนรื้อสรรพสามิต หมวด 14 · mig 0430)
//   G1 · ชุดเสียภาษีไหม = **ดูจากสูตรที่ผูกกับชุดเท่านั้น** — แถวสูตรที่หมวดติ๊ก `product_types.isExcise` คือของเสียภาษีในกล่อง
//        (หมวด 01-037 เองไม่ติ๊ก ⇒ เดิมชุดของขวัญทุกตัวไม่เคยเข้าระบบ แม้ข้างในมีน้ำหอม) · ชุดที่ยังไม่ผูกสูตร = ระบบไม่เดา
//   G2 · **ชุดน้ำหอมล้วน** (ทุกแถวเป็นหมวดเสียภาษี) = ฐานภาษีคือราคาขายปลีกทั้งชุด (ช่องเดิมของสินค้า เหมือน FG ทั่วไป)
//        **ชุดคละประเภท** = คิดแยกเฉพาะส่วนน้ำหอม
//   G3 · ชุดคละ: แถวสูตรหมวดเสียภาษีกรอกราคาขายปลีกต่อชิ้น (รวม VAT) + จำนวนชิ้น ⇒ ฐาน = Σ ราคา × จำนวน
//        แถวไหนยังไม่มีราคา = ฐานว่าง (ไม่ใช่ "รวมเท่าที่มี" — ยื่นขาดเงียบ ๆ แบบที่ด่านราคาขายปลีกเดิมกันไว้)
// ⚠️ ไฟล์บริสุทธิ์ ไม่แตะฐาน — ฟอร์มสินค้า (ฝั่ง client) กับ POST/PATCH /api/products ใช้ตัวเดียวกัน
// ⚠️ ธงรายตัวของฝ่าย RA (`taxableOverride`) ยังชนะเสมอ — ไฟล์นี้ให้แค่ "ค่าตั้งต้นจากสูตร" (`resolveProductTaxable` ตัดสินต่อ)
import { isExciseCategory } from '@/lib/master/categoryOf';
import { round2 } from '@/lib/tax/exciseBilling';
import { fmtMoney } from '@/lib/format';

export const GIFT_SET_EXCISE_KIND = Object.freeze({ none: 'none', pure: 'pure', mixed: 'mixed' });

/** ค่าของ `products.exciseTaxBase` — ชุดคละ คิดภาษีจากราคารายชิ้น · ว่าง = คิดจากราคาขายปลีกของสินค้า */
export const EXCISE_TAX_BASE_PIECES = 'pieces';

/** ราคาต่อชิ้นที่กรอก → ตัวเลข ≥ 0 · ว่าง/ไม่ใช่ตัวเลข/ติดลบ = null */
export function giftSetPiecePrice(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** จำนวนชิ้นที่กรอก → จำนวนเต็ม ≥ 1 · ว่าง = 1 (ตั้งต้นของฐาน) */
export function giftSetPieceQty(value) {
  if (value === '' || value == null) return 1;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * แบบของชุด + ฐานภาษี
 * @param rows แถวสูตรของชุด `[{ categoryCode, retailPriceIncVat?, pieceQty? }]` (แถวว่างหมวดไม่นับ)
 * @param productTypes ทะเบียนหมวด (ต้องมี `isExcise`) — ไม่ส่ง = ไม่รู้ว่าหมวดไหนเสียภาษี ⇒ none ทุกชุด
 * @returns `{ kind, taxable, taxableRows, missingPriceRows, basePriceIncVat }`
 *   · `basePriceIncVat` มีค่าเฉพาะชุดคละที่ราคาครบ · ชุดน้ำหอมล้วนใช้ราคาขายปลีกทั้งชุดของสินค้า (คืน null ที่นี่)
 */
export function giftSetExcise(rows = [], productTypes = []) {
  const list = (rows || []).filter((row) => String(row?.categoryCode || '').trim());
  const taxableRows = list.filter((row) => isExciseCategory(String(row.categoryCode).trim(), productTypes));
  if (!taxableRows.length) {
    return { kind: GIFT_SET_EXCISE_KIND.none, taxable: false, taxableRows: [], missingPriceRows: [], basePriceIncVat: null };
  }
  if (taxableRows.length === list.length) {
    return { kind: GIFT_SET_EXCISE_KIND.pure, taxable: true, taxableRows, missingPriceRows: [], basePriceIncVat: null };
  }
  const missingPriceRows = taxableRows.filter((row) => !(giftSetPiecePrice(row.retailPriceIncVat) > 0));
  const basePriceIncVat = missingPriceRows.length
    ? null
    : round2(taxableRows.reduce((sum, row) => sum + giftSetPiecePrice(row.retailPriceIncVat) * giftSetPieceQty(row.pieceQty), 0));
  return { kind: GIFT_SET_EXCISE_KIND.mixed, taxable: true, taxableRows, missingPriceRows, basePriceIncVat };
}

/**
 * ค่าที่บันทึกลงสินค้าชุดของขวัญ — `{ autoTaxable, exciseTaxBase, exciseBasePriceIncVat }`
 * · `autoTaxable` = ค่าตั้งต้นของ "เสียภาษีไหม" แทนธงของหมวด 01-037 (RA override ทับได้)
 * · ชุดคละ = `exciseTaxBase: 'pieces'` + ฐาน (ว่างได้ = ราคายังไม่ครบ) · แบบอื่น = ว่างทั้งคู่ (คิดจากราคาขายปลีกเหมือนเดิม)
 */
export function giftSetExciseFields(rows = [], productTypes = []) {
  const profile = giftSetExcise(rows, productTypes);
  const mixed = profile.kind === GIFT_SET_EXCISE_KIND.mixed;
  return {
    autoTaxable: profile.taxable,
    exciseTaxBase: mixed ? EXCISE_TAX_BASE_PIECES : null,
    exciseBasePriceIncVat: mixed ? profile.basePriceIncVat : null,
  };
}

/** สินค้านี้คิดภาษีจากราคารายชิ้นของชุดคละไหม */
export function usesPieceTaxBase(product) {
  return product?.exciseTaxBase === EXCISE_TAX_BASE_PIECES;
}

/**
 * ⭐ ฐานภาษีรวม VAT ของสินค้าหนึ่งตัว — ทุกจุดที่ใช้ "ราคาขายปลีกเป็นฐานคิดภาษี" อ่านตัวนี้ (ไม่ใช่ `retailPriceIncVat` ตรง ๆ)
 * ชุดคละ = ราคาน้ำหอมในชุดรวม · อื่น ๆ (รวมชุดน้ำหอมล้วน) = ราคาขายปลีกของสินค้า · ไม่มี/0 = null (ยังไม่มีฐานภาษี)
 */
export function exciseBasePriceIncVat(product) {
  const value = Number(usesPieceTaxBase(product) ? product?.exciseBasePriceIncVat : product?.retailPriceIncVat);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** ชื่อของฐานภาษี (ป้าย/ข้อความ) — ชุดคละพูดว่า "ราคาน้ำหอมในชุด" ไม่ใช่ "ราคาขายปลีก" */
export function exciseBaseLabel(product) {
  return usesPieceTaxBase(product) ? 'ราคาขายปลีกส่วนน้ำหอมในชุด (รวม VAT)' : 'ราคาขายปลีก (รวม VAT)';
}

/** ข้อความสรุปแบบของชุดใต้รายการสูตร (ฟอร์ม/หน้าสินค้า) */
export function giftSetExciseSummary(profile) {
  if (!profile || profile.kind === GIFT_SET_EXCISE_KIND.none) {
    return 'ไม่มีสูตรหมวดที่เสียสรรพสามิตในชุด — ชุดนี้ไม่เข้าระบบสรรพสามิต';
  }
  if (profile.kind === GIFT_SET_EXCISE_KIND.pure) {
    return 'ชุดน้ำหอมล้วน — เสียสรรพสามิต คิดจากราคาขายปลีกทั้งชุด';
  }
  if (profile.missingPriceRows.length) {
    return `ชุดคละประเภท — เสียสรรพสามิตเฉพาะส่วนน้ำหอม · ยังไม่ได้กรอกราคาต่อชิ้น ${profile.missingPriceRows.length} แถว (ภาษีคิดออกมา 0 จนกว่าจะกรอกครบ)`;
  }
  return `ชุดคละประเภท — เสียสรรพสามิตเฉพาะส่วนน้ำหอม · ฐานภาษี ${fmtMoney(profile.basePriceIncVat)} (รวม VAT)`;
}
