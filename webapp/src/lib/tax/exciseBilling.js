// ── ยอดที่เรียกเก็บจากลูกค้าบน "ใบแจ้งชำระค่าภาษีสรรพสามิต" — สูตรเดียวของระบบ ──
//
// มติผู้ใช้ 2026-07-26: **ยอดที่ต้องเรียกเก็บ = ค่าภาษี + VAT 7%** เพราะนั่นคือเงินที่
// เก็บจากลูกค้าจริงตามเอกสารที่ส่งไป. ก่อนหน้านี้ระบบเก็บ/แสดง amountToCollect เป็น
// ค่าภาษีเปล่า ๆ (สรรพสามิต + ท้องถิ่น) แต่เอกสารพิมพ์ยอดสุทธิรวม VAT → เลขบนจอกับ
// บนเอกสารต่างกัน 7% คนขายจึงแจ้งลูกค้าผิด
//
// ⚠️ ต้องคิดด้วยฟังก์ชันนี้ทุกที่ (ตอนสร้างใบ + ตอนพิมพ์ + ตอนแสดงบนจอ) — ปัดเศษ
// "ต่อหน่วยก่อน แล้วคูณจำนวน" เพื่อให้เอกสารกระทบยอดด้วยมือได้ (ภาษี/ชิ้น × จำนวน =
// รวมภาษี พอดี) ถ้าที่ไหนคิดเองใหม่ เศษสตางค์จะเดินหนีจากเลขบนเอกสารทันที

export const EXCISE_VAT_RATE = 0.07;

// ── อัตราภาษี: ที่เดียวของทั้งระบบ ──────────────────────────────────────────
//
// 🐞 **พบตอนตรวจระบบ 2026-08-16:** อัตราพวกนี้เคยเป็นเลขดิบเขียนซ้ำ 4 จุด
// (`app/api/products/route.js` · `app/api/products/[id]/route.js` · `lib/tax/reports.js` ×2)
// อัตราภาษีสรรพสามิตเปลี่ยนได้ด้วยกฎหมาย ⇒ วันที่ต้องเปลี่ยน ต้องไล่หาเองทุกจุด
// พลาดจุดเดียว = สินค้าที่แก้หลังจากนั้นคิดคนละอัตรากับของเก่า โดยไม่มีอะไรเตือน
//
// ⚠️ **ธุรกิจพูดกันด้วยเลข "8.8%" ซึ่งไม่ใช่ตัวแปรตัวไหนในนี้** — มันคือผลรวมของ
// สองอัตราข้างล่าง (8% + 10% ของ 8% = 8.8%) · ใครได้รับแจ้งว่า "อัตราเปลี่ยนเป็น 9%"
// แล้วแก้ `EXCISE_RATE` เป็น 0.09 จะได้ **9.9% ไม่ใช่ 9%** ⇒ ดู EXCISE_TOTAL_RATE
//
// ตัวอย่างเดินเลข (ยืนยันกับผู้ใช้ 2026-08-16):
//   ราคาขายปลีกรวม VAT 107 → ถอด VAT 100 → สรรพสามิต 8.00 + ท้องถิ่น 0.80
//   → ยื่นสรรพสามิต 8.80 → เก็บจากลูกค้า 9.42 (บวก VAT 7%)
export const EXCISE_RATE = 0.08;             // สรรพสามิต — % ของราคาขายปลีกถอด VAT
export const LOCAL_TAX_RATE_OF_EXCISE = 0.1; // ท้องถิ่น — % ของ "ค่าสรรพสามิต" ไม่ใช่ของราคา

/** อัตรารวมที่ยื่นจริง (8.8%) — เลขที่ธุรกิจใช้คุยกัน · derived ห้ามพิมพ์เอง */
export const EXCISE_TOTAL_RATE = EXCISE_RATE * (1 + LOCAL_TAX_RATE_OF_EXCISE);

export const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * อัตราภาษีต่อหน่วยของสินค้าหนึ่งตัว จากราคาขายปลีก — **สูตรเดียวของทั้งระบบ**
 *
 * ⚠️ ไม่ปัดเศษที่นี่ · เก็บลง `products.exciseTax`/`localTax` เต็มความละเอียด แล้วให้
 * `exciseTaxLine` ปัดตอนคิดต่อหน่วยบนใบยื่น (ปัดสองรอบ = เศษเดินหนีจากเอกสาร)
 *
 * @param retailPriceIncVat ราคาขายปลีกรวม VAT · ไม่มี/0 = ยังไม่มีฐานภาษี → คืน 0 ทั้งชุด
 *   (ด่านที่กันไม่ให้ยื่นทะเบียนด้วยฐานว่างอยู่ที่ lib/tax/requirements.js)
 */
export function productTaxRates(retailPriceIncVat, { taxable = true } = {}) {
  const incVat = Number(retailPriceIncVat);
  if (!taxable || !Number.isFinite(incVat) || incVat <= 0) {
    return { retailPriceExVat: 0, exciseTax: 0, localTax: 0 };
  }
  const retailPriceExVat = incVat / (1 + EXCISE_VAT_RATE);
  const exciseTax = retailPriceExVat * EXCISE_RATE;
  return { retailPriceExVat, exciseTax, localTax: exciseTax * LOCAL_TAX_RATE_OF_EXCISE };
}

// ── บรรทัดภาษีของใบยื่น: ตัวคิดตัวเดียวของทั้งระบบ ────────────────────────────
//
// อัตราภาษีคิดจาก **ราคาขายปลีกของ FG** (มติผู้ใช้ 2026-07-29) ซึ่งทะเบียนสินค้าคำนวณ
// เก็บไว้ที่ products.exciseTax / localTax แล้ว — ราคาใน Sale Order เป็นราคาผลิต
// ใช้คิดภาษีไม่ได้ ทุกทางจึงต้องอ้างเลข FG กลับไปดึงอัตราจากสินค้า ไม่ใช่คิดเอง
//
// 🐞 เดิมมีตัวคิด 3 ชุดที่ไม่ตรงกันเลยสักคู่:
//   soFiling (จาก SO)       — product.exciseTax · ปัดอัตราแต่ละส่วน แล้วคูณจำนวน
//   POST /api/orders        — reg.exciseTax     · ปัด "ผลรวมต่อหน่วย" แล้วแตกกลับ 10:1
//   PATCH /api/orders/[id]  — ก๊อปจาก POST มาทั้งดุ้น (คอมเมนต์ก็เหมือนกัน)
// ต่างกันสองมิติพร้อมกัน: แหล่งอัตรา + วิธีปัดเศษ · การแตกกลับด้วยสัดส่วนคงที่ 10:1
// ยังบิดยอดแยก excise/local ให้ผิดทันทีที่สินค้ามีอัตราไม่เป็น 10:1 (แก้มือได้) ทั้งที่
// สองยอดนี้ต้องเอาไปกรอกแบบฟอร์มสรรพสามิตแยกช่องกัน
//
// กฎที่ยึด = กฎเดียวกับ billedTaxLine ข้างล่าง: **ปัดต่อหน่วยก่อน แล้วคูณจำนวน**
// เพื่อให้เอกสารกระทบยอดด้วยมือได้ (ภาษี/ชิ้น × จำนวน = รวมภาษี พอดี)
// ── ธง "เสียภาษีไหม" ของสินค้าหนึ่งตัว ────────────────────────────────────
// ค่าตั้งต้นมาจากธง isExcise ของหมวด (mig 0131) แต่ **การยกเว้น/บังคับรายตัวของฝ่าย
// กฎหมาย (taxableOverride) ชนะเสมอ และต้องอยู่รอดการแก้สเปคทุกครั้ง**
//
// 🐞 บั๊กจริง: products PATCH เคยคำนวณธงนี้ใหม่จากหมวดล้วนทุกครั้งที่บันทึก ⇒ แก้แค่
// ชื่อสินค้า override ก็หาย แล้ว product.exciseTax กลับมาไม่ใช่ 0 ซึ่ง soFiling ใช้เป็น
// **อัตราจริงตอนสร้างใบยื่นจากใบสั่งขาย** ⇒ เก็บภาษีจากสินค้าที่ถูกยกเว้นไปแล้ว
// โดยไม่มีใครสั่ง และไม่มีอะไรฟ้อง
export function resolveProductTaxable({ taxableOverride, autoTaxable } = {}) {
  return typeof taxableOverride === 'boolean' ? taxableOverride : !!autoTaxable;
}

export function exciseTaxLine({ exciseRatePerUnit, localTaxRatePerUnit, quantity } = {}) {
  const qty = Number(quantity) || 0;
  const excisePerUnit = round2(exciseRatePerUnit);
  const localPerUnit = round2(localTaxRatePerUnit);
  const totalExciseTax = round2(excisePerUnit * qty);
  const totalLocalTax = round2(localPerUnit * qty);
  return {
    quantity: qty,
    exciseRatePerUnit: excisePerUnit,
    localTaxRatePerUnit: localPerUnit,
    totalExciseTax,
    totalLocalTax,
    totalTax: round2(totalExciseTax + totalLocalTax),
  };
}

// บรรทัดของใบยื่นที่อ้าง "ทะเบียน" — แบ่งหน้าที่ให้ชัด:
//   ทะเบียน = ตัดสินว่า **เสียภาษีไหม** (ฝ่าย RA override ได้ผ่าน taxableOverride)
//   สินค้า   = ให้ **ตัวเลขอัตรา** ซึ่งคิดจากราคาขายปลีกของ FG
// ⚠️ อ่านอัตราจากสินค้าอย่างเดียวโดยไม่ดูธงของทะเบียน = override ของ RA หายเงียบ ๆ
// (เดิมไม่มีใครเห็นเพราะ reg.exciseTax ถูกตั้งเป็น 0 ไปแล้วตอน override)
export function exciseTaxLineForRegistration({ registration, product, quantity } = {}) {
  const taxable = registration?.isExciseTaxable !== false;
  return exciseTaxLine({
    exciseRatePerUnit: taxable ? product?.exciseTax : 0,
    localTaxRatePerUnit: taxable ? product?.localTax : 0,
    quantity,
  });
}

// รวมยอดของหลายบรรทัดที่ผ่าน exciseTaxLine มาแล้ว
export function exciseTaxTotals(lines = []) {
  return (Array.isArray(lines) ? lines : []).reduce((sum, line) => ({
    totalExciseTax: round2(sum.totalExciseTax + (Number(line?.totalExciseTax) || 0)),
    totalLocalTax: round2(sum.totalLocalTax + (Number(line?.totalLocalTax) || 0)),
    totalTax: round2(sum.totalTax + (Number(line?.totalTax) || 0)),
  }), { totalExciseTax: 0, totalLocalTax: 0, totalTax: 0 });
}

// บรรทัดหนึ่งของใบยื่น: order_items / resolveSoFiling().lines ใช้รูปเดียวกัน
// ({ quantity, totalTax }) — ภาษี/หน่วยปัดก่อน แล้วคูณจำนวน
export function billedTaxLine(item = {}) {
  const quantity = Number(item.quantity) || 0;
  const perUnit = round2(quantity ? (Number(item.totalTax) || 0) / quantity : 0);
  return { quantity, perUnit, tax: round2(perUnit * quantity) };
}

// ยอดรวมของใบ: ค่าภาษีก่อน VAT · VAT · ยอดที่เรียกเก็บจริง (รวม VAT)
export function billedTaxTotals(items = []) {
  const rows = (Array.isArray(items) ? items : []).map(billedTaxLine);
  const totalTax = round2(rows.reduce((sum, row) => sum + row.tax, 0));
  const vat = round2(totalTax * EXCISE_VAT_RATE);
  return { totalTax, vat, amountToCollect: round2(totalTax + vat) };
}

// ยอดที่เรียกเก็บของใบยื่นใบหนึ่ง: ค่าที่ตรึงไว้บนใบมาก่อน แล้วจึงคิดจากรายการ
// (ใบที่สร้างก่อนมติ 2026-07-26 เก็บยอดไม่รวม VAT ไว้ — คิดใหม่จากรายการให้ตรงเอกสาร)
export function orderAmountToCollect(order) {
  if (!order) return 0;
  const items = order.items || [];
  if (items.length) return billedTaxTotals(items).amountToCollect;
  const stored = Number(order.amountToCollect);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const tax = round2(order.totalTax);
  return round2(tax + round2(tax * EXCISE_VAT_RATE));
}
