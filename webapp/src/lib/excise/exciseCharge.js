// ── สินค้า "ค่าภาษีสรรพสามิต" (หมวด 04-003) + บรรทัดของใบเสนอราคาค่าสรรพสามิต ─────────────────────
//
// แผนรื้อสรรพสามิต v2 (docs/excise-qt-so-rework-plan.md หมวด 3.3–3.4 · มติเจ้าของ 28/10/2026):
// SA ออก "ใบเสนอราคาค่าสรรพสามิต" ด้วยฟอร์ม QT เดิม · บรรทัดละ FG ต้นทางของ SO ลูกค้า · ทุกบรรทัดใช้สินค้าตัวเดียว
// `FG-<รหัสลูกค้า>-04-003` ที่ **ระบบสร้างให้เอง** (ลูกค้าละหนึ่งตัว · ไม่มีเลขรัน) · ราคา/ชิ้น = ภาษี/ชิ้นที่ระบบคิด
//
// ⚠️ ไฟล์บริสุทธิ์ — ไม่ยิง query (ตัวสร้างสินค้าฝั่ง server อยู่ที่ exciseChargeProduct.js) · จอ import ได้
import { categoryOf } from '@/lib/master/categoryOf';
import { composeFgCode, customerCodeSegment } from '@/lib/master/masterCodes';
import { quoteLineMoney } from '@/lib/salesPlanning';

/** หมวด "ค่าภาษีสรรพสามิต" — ระบบอ้างตรง ๆ (PROTECTED_PRODUCT_CATEGORY_CODES) · ห้ามติ๊ก isExcise ของหมวดนี้ */
export const EXCISE_CHARGE_CATEGORY_CODE = '04-003';
export const EXCISE_CHARGE_LINE_KIND = 'excise_charge';
export const EXCISE_CHARGE_PRODUCT_NAME = 'ค่าภาษีสรรพสามิต';
export const EXCISE_CHARGE_PRODUCT_NAME_EN = 'Excise tax recharge';

/** สินค้านี้เป็น "ค่าภาษีสรรพสามิต" ไหม — ดูหมวดของแถวก่อน ไม่มีค่อยอ่านจากรหัส (สินค้ารุ่นที่หมวดว่าง) */
export function isExciseChargeProduct(product) {
  if (!product) return false;
  const code = product.categoryCode || categoryOf(product.fgCode);
  return code === EXCISE_CHARGE_CATEGORY_CODE;
}

/** ข้อความของด่าน "สร้าง/แก้สินค้า 04-003 ด้วยมือไม่ได้" — POST/PATCH สินค้าใช้คำเดียวกัน */
export const EXCISE_CHARGE_MANUAL_MESSAGE = 'สินค้าหมวด 04-003 (ค่าภาษีสรรพสามิต) ระบบสร้างให้เองตอนออกใบเสนอราคาค่าสรรพสามิต '
  + '— สร้างหรือย้ายสินค้าเข้า/ออกหมวดนี้ด้วยมือไม่ได้';

/** ข้อความของด่าน "ใบเสนอราคาขายใส่สินค้า 04-003 ไม่ได้" (เก็บซ้ำกับใบค่าสรรพสามิต) */
export function exciseChargeLineMessage(products = []) {
  const codes = products.map((p) => p.fgCode || p.id).filter(Boolean).join(', ');
  return `${codes} เป็นสินค้าค่าภาษีสรรพสามิต — ใส่ในใบเสนอราคาขายไม่ได้ `
    + '(ค่าภาษีเก็บด้วยใบเสนอราคาค่าสรรพสามิตที่ระบบสร้างจากใบสั่งขายเท่านั้น)';
}

/* ท่อนรหัสลูกค้าในรหัส FG ที่มีอยู่แล้ว (`FG-108-…` / `FG-0108-…`) — ต้องเป็นลูกค้าเดียวกับ AR จริง ไม่งั้นทิ้ง */
function segmentOf(fgCode, arSegment) {
  const m = String(fgCode || '').trim().match(/^FG-(\d{3,4})-\d{2}-\d{3}/);
  if (!m) return null;
  return Number(m[1]) === Number(arSegment) ? m[1] : null;
}

/**
 * รหัสสินค้า 04-003 ของลูกค้า — **ท่อนรหัสลูกค้าตามแบบที่ลูกค้ารายนั้นใช้อยู่** (มติ D5 28/10)
 * ลูกค้าเก่ามีทั้ง `FG-108-…` และ `FG-0108-…` (prod 28/10: 3 หลัก 123 · 4 หลัก 117 · ปนกัน 35 ราย) ⇒ เลือกตามลำดับ:
 *   1. สินค้ากลุ่ม 04 ตัวอื่นของลูกค้า  2. FG ต้นทางบรรทัดแรกบน SO  3. รูปมาตรฐาน `composeFgCode` (4 หลัก)
 * @returns รหัส หรือ null เมื่อรหัสลูกค้าไม่ใช่รูปแบบ AR ที่ระบบรู้จัก
 */
export function exciseChargeFgCode({ arCode, group04Codes = [], sourceFgCodes = [] } = {}) {
  const arSegment = customerCodeSegment(arCode);
  if (!arSegment) return null;
  for (const list of [group04Codes, sourceFgCodes]) {
    for (const code of list || []) {
      const segment = segmentOf(code, arSegment);
      if (segment) return `FG-${segment}-${EXCISE_CHARGE_CATEGORY_CODE}`;
    }
  }
  return composeFgCode({ arCode, categoryCode: EXCISE_CHARGE_CATEGORY_CODE });
}

/**
 * บรรทัดของใบเสนอราคาค่าสรรพสามิตจากผลของ `resolveSoFiling` — **ตัวสร้างบรรทัดตัวเดียว** (แผน หมวด 3.4)
 * บรรทัดละ FG ต้นทาง · จำนวน = หน่วยรวมที่ยื่นภาษี · ราคา/ชิ้น = ภาษี/ชิ้น (ปัดครั้งเดียว · exciseTaxLine) ·
 * ยอดบรรทัดคิดด้วย `quoteLineMoney` ตัวเดียวกับบรรทัดใบเสนอราคาทุกบรรทัด (ตรงกับ CHECK `quotation_lines_line_money_rule` 0407) ·
 * ไม่มีเลขแพ็ค (ทริกเกอร์ 0410 ดูเฉพาะหมวด 02-001) · ไม่มี `id` — ผู้เขียนลงฐาน (PR3) ออกเลขบรรทัดเอง
 * ⚠️ บรรทัดที่ภาษีเป็น 0 (ไม่มีฐานภาษี) **ยังอยู่** — ผู้ออกใบต้องเห็นว่าขาดอะไร ไม่ใช่บรรทัดหายเงียบ ๆ
 *    (ด่านยื่นอนุมัติตัดสินทีหลัง · PR3)
 * @param filing        ผลของ resolveSoFiling (`lines` · `warnings`)
 * @param chargeProduct สินค้า 04-003 ของลูกค้า (ensureExciseChargeProduct)
 * @param sourceLines   บรรทัดของ SO ลูกค้า (หน่วย · คำอธิบายสองภาษา) — หาด้วย `salesOrderLineId`
 * @param products      สินค้า FG ต้นทาง (ราคาขายปลีก · ชื่อ EN) — หาด้วย `productId`
 */
export function buildExciseQuotationLines({ filing, chargeProduct, sourceLines = [], products = [] } = {}) {
  if (!chargeProduct?.id) throw new Error('buildExciseQuotationLines: ต้องมีสินค้า 04-003 ของลูกค้าก่อน');
  const sourceLineById = new Map((sourceLines || []).filter((l) => l?.id).map((l) => [l.id, l]));
  const productById = new Map((products || []).filter((p) => p?.id).map((p) => [p.id, p]));
  return (filing?.lines || []).map((line, index) => {
    const source = sourceLineById.get(line.salesOrderLineId) || {};
    const product = productById.get(line.productId) || {};
    const qty = Number(line.quantity) || 0;
    const unitPrice = Number(line.taxPerUnit) || 0;
    const nameTh = source.metadata?.descriptionTh || line.description || product.productDescription || line.fgCode;
    const nameEn = source.metadata?.descriptionEn || product.productDescriptionEn || nameTh;
    /* คำอธิบาย = รหัส FG ต้นทาง + ชื่อสินค้า (มติเจ้าของ 29/10 จากกระดาษใบทดลอง) — ชื่อสินค้า 04-003 "ค่าภาษีสรรพสามิต"
       ขึ้นบรรทัดแรกของรายการอยู่แล้ว ⇒ ไม่ต้องพูดซ้ำ "ค่าภาษีสรรพสามิต 8.8% —" หน้าทุกบรรทัด */
    const sourceFg = String(line.fgCode || '').trim();
    const descriptionTh = `${sourceFg} ${nameTh}`.trim();
    const descriptionEn = `${sourceFg} ${nameEn}`.trim();
    const money = quoteLineMoney({ qty, unitPrice });
    return {
      sortOrder: index,
      productId: chargeProduct.id,
      fgCode: chargeProduct.fgCode,
      description: descriptionTh,
      qty,
      unit: source.unit || product.saleUnit || 'ชิ้น',
      unitPrice,
      discountType: money.discountType,
      discountValue: money.discountValue,
      discountAmount: money.discountAmount,
      lineTotal: money.lineTotal,
      source: EXCISE_CHARGE_LINE_KIND,
      metadata: {
        lineKind: EXCISE_CHARGE_LINE_KIND,
        descriptionTh,
        descriptionEn,
        sourceSalesOrderLineId: line.salesOrderLineId || null,
        sourceProductId: line.productId || null,
        sourceFgCode: String(line.fgCode || '').trim() || null,
        retailPriceIncVat: Number(product.retailPriceIncVat) > 0 ? Number(product.retailPriceIncVat) : null,
        excisePerUnit: line.exciseRatePerUnit,
        localPerUnit: line.localTaxRatePerUnit,
        registrationState: line.registrationState || 'none',
        taxBaseMissing: Boolean(line.taxBaseMissing),
      },
    };
  });
}
