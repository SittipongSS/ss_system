// ── ชุดของขวัญ (01-037) ที่มีของเสียสรรพสามิต — ตัวตัดสินเดียวของจอและ API ─────────────────────────────
//
// ⭐ มติเจ้าของ 11/11/2026 (ถามทีละข้อ · แผนรื้อสรรพสามิต หมวด 14 · mig 0430 + 0431)
//   G1 · ชุดเสียภาษีไหม = **ดูจากสูตรที่ผูกกับชุดเท่านั้น** — แถวสูตรที่หมวดติ๊ก `product_types.isExcise` คือของเสียภาษีในกล่อง
//        (หมวด 01-037 เองไม่ติ๊ก ⇒ เดิมชุดของขวัญทุกตัวไม่เคยเข้าระบบ แม้ข้างในมีน้ำหอม) · ชุดที่ยังไม่ผูกสูตร = ระบบไม่เดา
//   G5 · (แทนการเลือกอัตโนมัติของ G2 · เจ้าของ 11/11 หลัง #2034: "ต้องเลือกได้ว่าจะแจ้งรายชิ้น หรือรวมชุด" · "ต้องถามก่อนเสมอ")
//        ชุดที่มีน้ำหอม **ฝ่ายขายเลือกเอง** ว่าแจ้งราคาขายปลีกแบบไหน — **ไม่มีค่าตั้งต้น** ทั้งชุดล้วนและชุดคละ:
//          · รวมชุด  = ฐานภาษีคือราคาขายปลีกทั้งชุด (ช่องเดิมของสินค้า เหมือน FG ทั่วไป)
//          · รายชิ้น = ฐานภาษีคือ Σ ราคาขายปลีกต่อชิ้น (รวม VAT) × จำนวนชิ้น ของแถวสูตรหมวดเสียภาษี (G3)
//        ยังไม่เลือก = ไม่มีฐานภาษี (ภาษี 0 · ยื่นทะเบียนไม่ได้) และฟอร์มบันทึกไม่ได้จนกว่าจะเลือก
//   G3 · รายชิ้น: แถวไหนยังไม่มีราคา = ฐานว่าง (ไม่ใช่ "รวมเท่าที่มี" — ยื่นขาดเงียบ ๆ แบบที่ด่านราคาขายปลีกเดิมกันไว้)
// ⚠️ ไฟล์บริสุทธิ์ ไม่แตะฐาน — ฟอร์มสินค้า (ฝั่ง client) กับ POST/PATCH /api/products ใช้ตัวเดียวกัน
// ⚠️ ธงรายตัวของฝ่าย RA (`taxableOverride`) ยังชนะเสมอ — ไฟล์นี้ให้แค่ "ค่าตั้งต้นจากสูตร" (`resolveProductTaxable` ตัดสินต่อ)
import { isExciseCategory } from '@/lib/master/categoryOf';
import { round2 } from '@/lib/tax/exciseBilling';
import { fmtMoney } from '@/lib/format';

export const GIFT_SET_EXCISE_KIND = Object.freeze({ none: 'none', pure: 'pure', mixed: 'mixed' });

/**
 * ค่าของ `products.exciseTaxBase` (mig 0430 + 0431)
 *   ว่าง      = สินค้าทั่วไป / ชุดที่ไม่มีของเสียภาษี — คิดจากราคาขายปลีกของสินค้า
 *   set       = ชุดของขวัญ แจ้งราคารวมชุด — คิดจากราคาขายปลีกของสินค้า (ราคาทั้งชุด)
 *   pieces    = ชุดของขวัญ แจ้งราคารายชิ้น — คิดจาก `exciseBasePriceIncVat`
 *   unchosen  = ชุดของขวัญที่มีของเสียภาษี แต่ยังไม่ได้เลือก — ไม่มีฐานภาษี
 */
export const EXCISE_TAX_BASE = Object.freeze({ set: 'set', pieces: 'pieces', unchosen: 'unchosen' });
export const EXCISE_TAX_BASE_PIECES = EXCISE_TAX_BASE.pieces;

/** ตัวเลือกบนฟอร์ม — ลำดับ/คำเดียวกันทุกจอ */
export const GIFT_SET_PRICE_MODE_OPTIONS = Object.freeze([
  { value: EXCISE_TAX_BASE.set, label: 'รวมชุด', description: 'ภาษีคิดจากราคาขายปลีกทั้งชุด' },
  { value: EXCISE_TAX_BASE.pieces, label: 'รายชิ้น', description: 'ภาษีคิดจากราคาขายปลีกต่อชิ้น × จำนวนชิ้น ของแถวน้ำหอมในชุด' },
]);

/** โหมดที่ฝ่ายขายเลือก → 'set' | 'pieces' · อย่างอื่น (ว่าง/unchosen/พิมพ์มั่ว) = null (ยังไม่เลือก) */
export function giftSetPriceMode(value) {
  return value === EXCISE_TAX_BASE.set || value === EXCISE_TAX_BASE.pieces ? value : null;
}

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
 * แบบของชุด + โหมดที่เลือก + ฐานภาษีรายชิ้น
 * @param rows แถวสูตรของชุด `[{ categoryCode, retailPriceIncVat?, pieceQty? }]` (แถวว่างหมวดไม่นับ)
 * @param productTypes ทะเบียนหมวด (ต้องมี `isExcise`) — ไม่ส่ง = ไม่รู้ว่าหมวดไหนเสียภาษี ⇒ none ทุกชุด
 * @param options.mode โหมดที่เลือก ('set' | 'pieces') · อื่น ๆ = ยังไม่เลือก
 * @returns `{ kind, taxable, mode, taxableRows, missingPriceRows, basePriceIncVat }`
 *   · `mode` = null เมื่อยังไม่เลือก (หรือชุดไม่เสียภาษี)
 *   · `basePriceIncVat` มีค่าเฉพาะโหมดรายชิ้นที่ราคาครบ · รวมชุดใช้ราคาขายปลีกของสินค้า (คืน null ที่นี่)
 */
export function giftSetExcise(rows = [], productTypes = [], { mode = null } = {}) {
  const list = (rows || []).filter((row) => String(row?.categoryCode || '').trim());
  const taxableRows = list.filter((row) => isExciseCategory(String(row.categoryCode).trim(), productTypes));
  if (!taxableRows.length) {
    return { kind: GIFT_SET_EXCISE_KIND.none, taxable: false, mode: null, taxableRows: [], missingPriceRows: [], basePriceIncVat: null };
  }
  const kind = taxableRows.length === list.length ? GIFT_SET_EXCISE_KIND.pure : GIFT_SET_EXCISE_KIND.mixed;
  const picked = giftSetPriceMode(mode);
  const pieces = picked === EXCISE_TAX_BASE.pieces;
  const missingPriceRows = pieces ? taxableRows.filter((row) => !(giftSetPiecePrice(row.retailPriceIncVat) > 0)) : [];
  const basePriceIncVat = pieces && !missingPriceRows.length
    ? round2(taxableRows.reduce((sum, row) => sum + giftSetPiecePrice(row.retailPriceIncVat) * giftSetPieceQty(row.pieceQty), 0))
    : null;
  return { kind, taxable: true, mode: picked, taxableRows, missingPriceRows, basePriceIncVat };
}

/**
 * ค่าที่บันทึกลงสินค้าชุดของขวัญ — `{ autoTaxable, exciseTaxBase, exciseBasePriceIncVat }`
 * · `autoTaxable` = ค่าตั้งต้นของ "เสียภาษีไหม" แทนธงของหมวด 01-037 (RA override ทับได้)
 * · มีของเสียภาษี = `exciseTaxBase` เป็นโหมดที่เลือก หรือ 'unchosen' · ไม่มี = ว่าง
 */
export function giftSetExciseFields(rows = [], productTypes = [], mode = null) {
  const profile = giftSetExcise(rows, productTypes, { mode });
  if (!profile.taxable) return { autoTaxable: false, exciseTaxBase: null, exciseBasePriceIncVat: null };
  return {
    autoTaxable: true,
    exciseTaxBase: profile.mode || EXCISE_TAX_BASE.unchosen,
    exciseBasePriceIncVat: profile.mode === EXCISE_TAX_BASE.pieces ? profile.basePriceIncVat : null,
  };
}

/** ข้อความตีกลับเมื่อชุดมีน้ำหอมแต่ยังไม่เลือกวิธีแจ้งราคา — ฟอร์มกับ API (POST/PATCH /api/products) ใช้คำเดียวกัน */
export const GIFT_SET_PRICE_MODE_REQUIRED = 'ชุดนี้มีสูตรที่เสียสรรพสามิต — เลือกวิธีแจ้งราคาขายปลีกก่อน (รวมชุด หรือ รายชิ้น)';

/** ด่านฝั่งฟอร์ม: ชุดมีของเสียภาษีแต่ยังไม่เลือกวิธีแจ้งราคา = ข้อความ · ผ่าน = ''
 *  `taxableOverride === false` (RA ยกเว้นรายตัว) = ไม่ต้องเลือก — ตรงกับฝั่งบันทึก (productExciseFields) */
export function giftSetPriceModeError(rows = [], productTypes = [], mode = null, { taxableOverride = null } = {}) {
  if (taxableOverride === false) return '';
  const profile = giftSetExcise(rows, productTypes, { mode });
  return !profile.taxable || profile.mode ? '' : GIFT_SET_PRICE_MODE_REQUIRED;
}

/** สินค้าคิดภาษีจากราคารายชิ้นของชุดไหม */
export function usesPieceTaxBase(product) {
  return product?.exciseTaxBase === EXCISE_TAX_BASE.pieces;
}

/** ชุดที่มีของเสียภาษีแต่ยังไม่ได้เลือกวิธีแจ้งราคา */
export function giftSetPriceModeMissing(product) {
  return product?.exciseTaxBase === EXCISE_TAX_BASE.unchosen;
}

/** ฐานภาษีไม่ได้มาจากราคาขายปลีกของสินค้า (รายชิ้น / ยังไม่เลือก) — ช่องก่อน VAT ของสินค้าใช้แทนไม่ได้ */
export function hasOwnTaxBase(product) {
  return usesPieceTaxBase(product) || giftSetPriceModeMissing(product);
}

/**
 * ⭐ ฐานภาษีรวม VAT ของสินค้าหนึ่งตัว — ทุกจุดที่ใช้ "ราคาขายปลีกเป็นฐานคิดภาษี" อ่านตัวนี้ (ไม่ใช่ `retailPriceIncVat` ตรง ๆ)
 * รายชิ้น = ราคาน้ำหอมในชุดรวม · ยังไม่เลือก = null · อื่น ๆ (รวมชุด / สินค้าทั่วไป) = ราคาขายปลีก · ไม่มี/0 = null
 */
export function exciseBasePriceIncVat(product) {
  if (giftSetPriceModeMissing(product)) return null;
  const value = Number(usesPieceTaxBase(product) ? product?.exciseBasePriceIncVat : product?.retailPriceIncVat);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** ชื่อของฐานภาษี (ป้าย/ข้อความ) */
export function exciseBaseLabel(product) {
  if (usesPieceTaxBase(product)) return 'ราคาขายปลีกส่วนน้ำหอมในชุด (รวม VAT)';
  if (giftSetPriceModeMissing(product)) return 'วิธีแจ้งราคาขายปลีกของชุดของขวัญ (รวมชุด / รายชิ้น)';
  return 'ราคาขายปลีก (รวม VAT)';
}

/** เหตุที่ฐานภาษีขาด เป็นประโยคเดียว (คำเตือน/ด่าน) — null = มีฐานแล้ว */
export function exciseBaseMissingText(product) {
  if (exciseBasePriceIncVat(product) != null) return null;
  if (giftSetPriceModeMissing(product)) return 'ชุดของขวัญยังไม่ได้เลือกวิธีแจ้งราคาขายปลีก (รวมชุด / รายชิ้น)';
  if (usesPieceTaxBase(product)) return 'ชุดของขวัญแจ้งราคารายชิ้น แต่ยังกรอกราคาต่อชิ้นของน้ำหอมในชุดไม่ครบ';
  return 'ยังไม่มีราคาขายปลีก';
}

const KIND_TEXT = { [GIFT_SET_EXCISE_KIND.pure]: 'ชุดน้ำหอมล้วน', [GIFT_SET_EXCISE_KIND.mixed]: 'ชุดคละประเภท' };

/** ข้อความสรุปแบบของชุดใต้รายการสูตร (ฟอร์ม/หน้าสินค้า) */
export function giftSetExciseSummary(profile) {
  if (!profile || profile.kind === GIFT_SET_EXCISE_KIND.none) {
    return 'ไม่มีสูตรหมวดที่เสียสรรพสามิตในชุด — ชุดนี้ไม่เข้าระบบสรรพสามิต';
  }
  const head = `${KIND_TEXT[profile.kind]} — เสียสรรพสามิต`;
  if (!profile.mode) return `${head} · ยังไม่ได้เลือกวิธีแจ้งราคาขายปลีก (รวมชุด / รายชิ้น) — ภาษีคิดออกมา 0 จนกว่าจะเลือก`;
  if (profile.mode === EXCISE_TAX_BASE.set) return `${head} · แจ้งราคารวมชุด — คิดจากราคาขายปลีกทั้งชุด`;
  if (profile.missingPriceRows.length) {
    return `${head} · แจ้งราคารายชิ้น — ยังไม่ได้กรอกราคาต่อชิ้น ${profile.missingPriceRows.length} แถว (ภาษีคิดออกมา 0 จนกว่าจะกรอกครบ)`;
  }
  return `${head} · แจ้งราคารายชิ้น — ฐานภาษี ${fmtMoney(profile.basePriceIncVat)} (รวม VAT)`;
}
