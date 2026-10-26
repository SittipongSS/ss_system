// ── ตัวกรองของหน้าทะเบียนสินค้า — ตัวเดียวของทั้งระบบ ────────────────────
//
// ใช้ทั้ง **บนจอ** (app/database/products/page.js) และ **ตอนส่งออก Excel**
// (api/products/export) เพราะปุ่มโหลดสัญญาว่า "ได้แถวเท่าที่ตาเห็น" — ถ้าตรรกะ
// แยกเป็นสองชุด วันที่ใครแก้ตัวกรองบนจอแล้วลืมอีกฝั่ง ไฟล์กับตารางจะไม่ตรงกัน
// โดยไม่มีอะไรเตือน (ผู้ใช้เจอตอนกระทบยอดแล้วเลขไม่ลง ซึ่งสายไปแล้ว)
//
// ทุกฟังก์ชันบริสุทธิ์ ไม่มี React ไม่มี DB — เรียกได้ทั้งสองฝั่ง
import { categoryOf, categoryFlags, showsRetailPrice } from '@/lib/master/categoryOf';
import { categoryNameBoth } from '@/lib/master/productCategoryOptions';
import { approvalStatCounts, passesApprovalFilters } from '@/lib/master/pendingApprovalLinks';
import { isMissingRetailPrice, isProductExciseTaxable } from '@/lib/tax/taxableProducts';

/** รหัสหมวดของสินค้า — ใช้ค่าที่บันทึกไว้ก่อน ถอยไปถอดจาก fgCode ให้แถวเก่า */
export function productCategoryCode(product) {
  return product?.categoryCode || categoryOf(product?.fgCode);
}

/**
 * สินค้าแถวนี้ต้องเสียภาษีสรรพสามิตไหม — `isProductExciseTaxable` บนรหัสหมวดที่ถอยไปถอดจาก fgCode ให้แถวเก่าแล้ว
 * ⭐ ตัวเดียวของ **การ์ด · ตัวกรอง · ป้าย "ภาษีสรรพสามิต" บนแถว** ของหน้าทะเบียนสินค้า (L16b) — ถามคนละตัวเมื่อไร
 *    แถวที่ถูกนับจะไม่มีป้าย (หรือมีป้ายแต่ไม่ถูกนับ)
 */
export function isProductTaxable(product, productTypes = []) {
  return isProductExciseTaxable({ ...product, categoryCode: productCategoryCode(product) }, productTypes);
}

/**
 * ป้ายภาษีของสินค้าหนึ่งตัว — `'taxable'` = ป้าย "ภาษีสรรพสามิต" · `'exempt'` = "ยกเว้นสรรพสามิต"
 * (หมวดที่ติ๊กเสียภาษี แต่ฝ่าย RA ยกเว้นรายตัว) · `null` = ไม่มีป้าย
 * ⭐ กติกาเดียวกับป้ายบนแถวของทะเบียนสินค้า (`taxable` / `exempt` ใน products/page.js) — หน้าลูกค้าและหัวหน้าสินค้า
 *    ถามตัวนี้ ⇒ สินค้าตัวเดียวกันอ่านเหมือนกันทุกจอ (ตรวจตัวเลข 26/10 · L16b/L16c)
 *    🐞 เดิมสองหน้านั้นดูธงหมวดล้วน ⇒ ของที่ RA ยกเว้นขึ้น "ภาษีสรรพสามิต" · ของที่ RA บังคับในหมวดอื่นไม่มีป้าย
 *       ทั้งที่การ์ด "ภาระภาษีสรรพสามิต" ข้าง ๆ นับมัน
 */
export function productExciseBadge(product, productTypes = []) {
  if (isProductTaxable(product, productTypes)) return 'taxable';
  if (product?.isExciseTaxable === false && categoryFlags(productCategoryCode(product), productTypes).isExcise) return 'exempt';
  return null;
}

/**
 * หน้ารายละเอียดสินค้าโชว์แถว "ราคาขายปลีก" ไหม — กลุ่ม 01/หมวดที่ติ๊กสรรพสามิต (`showsRetailPrice`) ·
 * มีราคาค้างอยู่ · **หรือสินค้าต้องเสียภาษี** (`isProductTaxable`)
 * ⭐ ข้อสุดท้ายคือคู่ของคำเตือน "ยังไม่มีราคาขายปลีก" (`isMissingRetailPrice` ⊂ ต้องเสียภาษี) — ใบที่ถูกเตือนให้เติม
 *    ต้องเห็นช่องที่ถูกสั่งให้เติม ไม่ใช่ทางตัน (ตรวจตัวเลข 26/10 · L16c)
 *    🐞 สินค้าที่ RA บังคับเสียภาษีในหมวดที่ไม่ใช่ 01 และไม่ได้ติ๊กสรรพสามิต: เตือนแต่ไม่มีแถวราคา
 */
export function productShowsRetailPrice(product, productTypes = []) {
  return showsRetailPrice(product?.fgCode, productTypes)
    || product?.retailPriceIncVat != null
    || isProductTaxable(product, productTypes);
}

/**
 * ป้ายหมวดสำหรับแสดงผล/ค้นหา — { main, sub } หรือ null ถ้าหาไม่เจอ
 * sub = "EN · TH" (มติ 2026-08-12) · หมวดที่ชื่อว่างทั้งสองภาษาถอยไปโชว์รหัส
 */
export function productCategoryLabel(product, productTypes = []) {
  const code = productCategoryCode(product);
  if (!code) return null;
  const info = productTypes.find((t) => `${t.mainCategoryCode}-${t.typeCode}` === code);
  if (!info) return null;
  return { main: info.mainCategoryName, sub: categoryNameBoth(info) || code };
}

/** ช่องที่คำค้นวิ่งไล่ — รหัส ชื่อสองภาษา แบรนด์สองภาษา และหมวด (รหัส+ชื่อ) */
function searchHaystack(product, productTypes) {
  const cat = productCategoryLabel(product, productTypes);
  return [
    product.fgCode, product.productDescription, product.productDescriptionEn,
    product.brandName, product.brandNameEn,
    product.categoryCode, cat?.main, cat?.sub,
  ];
}

/**
 * กรองทะเบียนสินค้าตามชุดตัวกรองของหน้า list
 *
 * @param products  แถวจาก /api/products?manage=1
 * @param search    คำค้น (ยังไม่ trim/lowercase ก็ได้)
 * @param statuses  สถานะอนุมัติที่เลือก — ว่าง = ทั้งหมด
 * @param registrations สถานะขึ้นทะเบียนสรรพสามิตที่เลือก — ว่าง = ทั้งหมด
 *   ⚠️ มิตินี้มีความหมายเฉพาะหมวดสรรพสามิต: เลือกแล้ว **หมวดอื่นถูกตัดออกทั้งหมด**
 * @param missingRetailPrice true = เอาเฉพาะสินค้าที่ **ต้องเสียภาษีแต่ยังไม่มีราคาขายปลีก**
 *   ⭐ ย้ายมาจากแท็บในหน้า /tax/reports ที่ถูกยุบทิ้ง (มติผู้ใช้ 2026-08-29) — รายการนี้
 *   เป็นข้อมูลของ **สินค้า** ไม่ใช่ของทะเบียน (สินค้าพวกนี้ยังไม่มีทะเบียนด้วยซ้ำ
 *   เพราะยื่นไม่ได้จนกว่าจะเติมราคา) บ้านมันจึงอยู่ที่นี่
 *   ⚠️ ไม่มีราคา = ภาษีคิดออกมา 0 ⇒ ถ้าขายแล้วยื่นจะยื่นขาดโดยไม่มีอะไรฟ้อง
 * @param taxable true = เอาเฉพาะสินค้าที่ **ต้องเสียภาษีสรรพสามิต** ตามกฎเดียวของระบบ (`isProductExciseTaxable` —
 *   ธงรายตัวของฝ่าย RA ชนะหมวด) · ตัวกรองคู่ของการ์ด "ต้องเสียสรรพสามิต" (ตรวจตัวเลข 26/10 · L16b)
 *   ⚠️ ไม่ใช่มิติ "ขึ้นทะเบียน" ข้างบนซึ่งดูหมวดอย่างเดียว — สินค้าที่ RA บังคับในหมวดอื่นอยู่ที่นี่ · ที่ RA ยกเว้นไม่อยู่
 * @param showInactive true = รวมสินค้าที่เลิกใช้
 *   ⚠️ ใบที่รออนุมัติไม่ถูกซ่อนเพราะเลิกใช้ ขณะกรองสถานะ "รออนุมัติ" (มติเจ้าของ 19/10 · H3) —
 *   ตาราง `?count=products` ต้องได้ครบทุกใบที่ป้ายเมนู/การ์ดภาพรวมนับ (`passesApprovalFilters`)
 * @param productTypes ทะเบียนหมวด — ต้องส่งมาด้วย ไม่งั้นค้นชื่อหมวดไม่เจอ
 *   และตัวกรองขึ้นทะเบียนจะตัดทุกแถวทิ้ง (categoryFlags หาไม่เจอ = ไม่ใช่สรรพสามิต)
 */
export function filterProducts(products = [], {
  search = '', statuses = [], registrations = [], showInactive = false, productTypes = [],
  missingRetailPrice = false, taxable = false,
} = {}) {
  const q = String(search || '').trim().toLowerCase();
  return products.filter((p) => {
    if (!passesApprovalFilters(p, { statuses, showInactive })) return false;
    if (missingRetailPrice && !isMissingRetailPrice({ ...p, categoryCode: productCategoryCode(p) }, productTypes)) {
      return false;
    }
    if (taxable && !isProductTaxable(p, productTypes)) return false;
    if (registrations.length) {
      const excise = categoryFlags(productCategoryCode(p), productTypes).isExcise;
      if (!excise || !registrations.includes(p.registrationStatus || 'none')) return false;
    }
    if (!q) return true;
    return searchHaystack(p, productTypes).some((v) => (v || '').toLowerCase().includes(q));
  });
}

/**
 * เลขบนตัวเลือกในปุ่มตัวกรอง — นับ **พร้อมตัวกรองอื่นที่ติดอยู่** (ตรวจตัวเลข M21a · 20/10)
 *
 * 🐞 เดิม "ขาดราคาขายปลีก (n)" นับทั้งทะเบียน (ไม่สนคำค้น/สถานะ/ทะเบียน/ใบเลิกใช้) และ
 *    "รวมสินค้าที่เลิกใช้ (n)" นับใบเลิกใช้ทุกใบ ⇒ ค้นหา/กรองอยู่แล้วติ๊ก ได้แถวไม่เท่าเลขบนตัวเลือก
 *    (สินค้าเลิกใช้ที่ขาดราคาถูกนับ แต่ตารางซ่อน)
 *
 * - `missingPrice` = แถวที่ตารางโชว์หลังติ๊ก "ขาดราคาขายปลีก"
 * - `inactive`     = แถวที่ **เพิ่มขึ้น** เมื่อติ๊ก "รวม…ที่เลิกใช้" (ตัวเลือกแบบ "รวม" ไม่ใช่ "เฉพาะ")
 *   ⚠️ ขณะกรอง "รออนุมัติ" ใบเลิกใช้ที่รออนุมัติขึ้นอยู่แล้ว (H3) ⇒ ไม่นับซ้ำ — ติ๊กแล้วไม่เพิ่มแถว
 * - `taxable`      = แถวที่ตารางโชว์หลังติ๊ก "ต้องเสียสรรพสามิต" (L16b)
 * @param state ชุดเดียวกับ `filterProducts` (search · statuses · registrations · showInactive · missingRetailPrice · taxable · productTypes)
 */
export function productFilterFacets(products = [], state = {}) {
  const rows = (extra) => filterProducts(products, { ...state, ...extra }).length;
  return {
    missingPrice: rows({ missingRetailPrice: true }),
    inactive: rows({ showInactive: true }) - rows({ showInactive: false }),
    taxable: rows({ taxable: true }),
  };
}

/**
 * แถบตัวเลขข้างทะเบียนสินค้า (StatCards) — แต่ละเลข = แถวหลังตั้งตัวกรองที่ตรงกัน (ตรวจตัวเลข M20b)
 * `total/pending/approved/rejected` จาก `approvalStatCounts` (ตัวตัดสินเดียวกับตาราง)
 * `taxable` = แถวของทะเบียนเปล่าที่ต้องเสียภาษี ตามกฎเดียวของระบบ (`isProductTaxable` — ธงรายตัวชนะหมวด)
 *   🐞 เดิม `isExciseTaxable !== false` นับสินค้าในหมวดที่ไม่เสียภาษีเข้ามาด้วย (taxableProducts.js หัวไฟล์) และรวมใบเลิกใช้
 *   ⭐ การ์ดกดได้แล้ว (L16b · 26/10) — ตั้งตัวกรอง `taxable` **และล้างตัวกรองอื่น/คำค้นทั้งหมด** ⇒ ตารางได้
 *      `filterProducts(products, { taxable: true, productTypes })` = ชุดเดียวกับเลขนี้ (ฐานเดียวกับ "ทั้งหมด" + ตัวตัดสินเดียวกับตัวกรอง)
 */
export function productStatCounts(products = [], productTypes = []) {
  const list = products || [];
  return {
    ...approvalStatCounts(list),
    taxable: list
      .filter((p) => passesApprovalFilters(p))
      .filter((p) => isProductTaxable(p, productTypes))
      .length,
  };
}
