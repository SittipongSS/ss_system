import { categoryFlags, categoryOf } from "@/lib/master/categoryOf";
import { billedTaxTotals, exciseTaxLine, resolveProductTaxable } from "@/lib/tax/exciseBilling";

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const normalizedKey = (value) => String(value || "").trim().toLowerCase();

/* สถานะทะเบียนของ FG หนึ่งตัวเท่าที่ใบนี้มองเห็น — เรียงตาม "ใกล้ยื่นได้ที่สุดชนะ"
   approved → pending (ยื่นแล้วรอนิติกรรม) → rejected (ต้องแก้) → draft (ร่างค้าง) → none

   ⚠️ อย่ายุบกลับเป็น boolean — "ยังไม่เคยยื่นขึ้นทะเบียน" กับ "ยื่นแล้วรอนิติกรรมตรวจ"
   คนละงานคนละคนทำ เส้นเดินงานของ SO ต้องบอกให้ตรงว่าติดอยู่ที่ใคร
   คำเดียวกับ lib/excise/recommendation.js ตั้งใจให้ตรงกัน */
/* ข้อความต่อท้ายรหัส FG ใน warning — บอก **ติดที่ใคร** ไม่ใช่แค่ว่ายังไม่ครบ */
const REGISTRATION_GAP_TEXT = {
  none: "ยังไม่ได้ขึ้นทะเบียนสรรพสามิต",
  draft: "มีร่างทะเบียนค้างอยู่ ยังไม่ได้ยื่นให้นิติกรรม",
  pending: "ยื่นขึ้นทะเบียนแล้ว รอนิติกรรมตรวจ",
  rejected: "ทะเบียนถูกตีกลับ ต้องแก้ก่อน",
};

export function registrationStateOf(regs) {
  const list = regs || [];
  if (!list.length) return "none";
  if (list.some((row) => row?.status === "approved")) return "approved";
  if (list.some((row) => row?.status === "pending_legal")) return "pending";
  if (list.some((row) => row?.status === "rejected")) return "rejected";
  return "draft";
}

export function resolveSoFiling({
  salesOrder,
  lines = [],
  products = [],
  productTypes = [],
  registrations = [],
} = {}) {
  const productById = new Map(products.filter((row) => row?.id).map((row) => [row.id, row]));
  const productByFg = new Map(products.filter((row) => row?.fgCode).map((row) => [normalizedKey(row.fgCode), row]));
  // ทะเบียนของลูกค้าเจ้าของใบนี้เท่านั้น — ทะเบียนเป็นของคู่ (สินค้า × ลูกค้า)
  const ownRegistration = (row) => !!row && (!salesOrder?.customerId || row.customerId === salesOrder.customerId);
  const approvedRegistrationByProduct = new Map(
    registrations
      .filter((row) => row?.status === "approved" && ownRegistration(row))
      .map((row) => [row.productId, row]),
  );
  /* ⭐ เก็บทะเบียน **ทุกสถานะ** ไว้ด้วย ไม่ใช่เฉพาะที่อนุมัติแล้ว (2026-08-17) —
     ของเดิมทิ้งแถวที่ยังไม่อนุมัติตั้งแต่บรรทัดนี้ ปลายทางจึงบอกได้แค่ "ไม่มีทะเบียน"
     ทั้งที่ฝ่าย RA อาจกำลังตรวจอยู่ · ตัวเลข eligible/ภาษี ไม่ขยับ เพิ่มแต่ข้อมูลอ่าน */
  const registrationsByProduct = new Map();
  for (const row of registrations) {
    if (!row?.productId || !ownRegistration(row)) continue;
    const list = registrationsByProduct.get(row.productId) || [];
    list.push(row);
    registrationsByProduct.set(row.productId, list);
  }

  const filingLines = [];
  const warnings = [];
  for (const line of lines) {
    const product = productById.get(line.productId) || productByFg.get(normalizedKey(line.fgCode));
    const fgCode = line.fgCode || product?.fgCode || "";
    const flags = categoryFlags(categoryOf(fgCode), productTypes);
    /* 🐞 **แก้ 2026-08-16:** เดิมเขียน `!flags.isExcise || product?.isExciseTaxable === false`
       ซึ่งเอาธงของ **หมวด** เป็นตัวตั้ง ⇒ override ของฝ่าย RA ทำงานทางเดียว:
       "ยกเว้น" ได้ แต่ **"บังคับเก็บ" ไม่ได้** — สินค้าที่ RA สั่งเก็บภาษีบนหมวดที่ไม่ได้
       ติ๊ก isExcise ถูกข้ามทั้งบรรทัด ทั้งที่ product.exciseTax มีค่าอยู่จริง
       ⇒ ใบยื่นจาก SO ตกรายการที่กฎหมายสั่งให้เก็บ ขัดกับกฎที่ exciseBilling เขียนไว้เอง
       ว่า override **ชนะเสมอ**

       ⚠️ ตัดสินด้วย `product.isExciseTaxable` ซึ่งเป็น **ธงที่ resolve แล้ว** ตอนบันทึก
       สินค้า (`resolveProductTaxable` รวม override เข้าไปแล้วทั้งสองทาง) — ไม่ใช่
       `taxableOverride` ดิบ ๆ ที่แถวเก่าจำนวนมากไม่มีค่า · ไม่มีธง (แถวก่อน mig 0131)
       จึงถอยไปใช้ธงของหมวดตามเดิม */
    const taxable = resolveProductTaxable({
      taxableOverride: product?.isExciseTaxable,
      autoTaxable: flags.isExcise,
    });
    if (!taxable) continue;

    const quantity = Number(line.qty || 0);
    if (!product || !Number.isFinite(quantity) || quantity <= 0) {
      warnings.push({
        code: "missing_product",
        salesOrderLineId: line.id,
        fgCode,
        message: `ไม่พบข้อมูลสินค้าหรือจำนวนของ ${fgCode || line.description || "รายการนี้"}`,
      });
      continue;
    }

    // อัตรามาจากสินค้า (= ราคาขายปลีกของ FG) และคิดด้วยตัวคิดกลางตัวเดียวกับใบยื่น
    // ที่สร้างด้วยมือ — สองทางเคยคิดคนละสูตร ดูเหตุผลเต็มที่ exciseTaxLine
    const taxLine = exciseTaxLine({
      exciseRatePerUnit: product.exciseTax,
      localTaxRatePerUnit: product.localTax,
      quantity,
    });
    const registration = approvedRegistrationByProduct.get(product.id) || null;
    const needsRegistration = !registration;
    const productRegistrations = registrationsByProduct.get(product.id) || [];
    const registrationState = registrationStateOf(productRegistrations);

    filingLines.push({
      salesOrderLineId: line.id,
      registrationId: registration?.id || null,
      // ปลายทางของลิงก์ "ไปดูทะเบียน" — ใบที่อนุมัติแล้วก่อน ไม่มีก็ใบที่ค้างอยู่
      // (null = ยังไม่เคยเปิดทะเบียนเลย ⇒ ผู้เรียกพาไปหน้าสร้างแทน)
      registrationLinkId: registration?.id || productRegistrations[0]?.id || null,
      registrationState,
      productId: product.id,
      fgCode,
      description: line.description || product.name || product.productName || fgCode,
      ...taxLine,
      needsRegistration,
    });
    if (needsRegistration) {
      warnings.push({
        code: "registration_missing",
        salesOrderLineId: line.id,
        productId: product.id,
        fgCode,
        registrationState,
        message: `${fgCode || line.description} ${REGISTRATION_GAP_TEXT[registrationState] || REGISTRATION_GAP_TEXT.none}`,
      });
    }
  }

  const totals = filingLines.reduce((result, line) => ({
    totalExciseTax: roundMoney(result.totalExciseTax + line.totalExciseTax),
    totalLocalTax: roundMoney(result.totalLocalTax + line.totalLocalTax),
    totalTax: roundMoney(result.totalTax + line.totalTax),
  }), { totalExciseTax: 0, totalLocalTax: 0, totalTax: 0 });

  return {
    eligible: salesOrder?.status === "approved" && filingLines.length > 0,
    lines: filingLines,
    warnings,
    ...totals,
    // ยอดที่เรียกเก็บจากลูกค้า = ค่าภาษี + VAT 7% (มติผู้ใช้ 2026-07-26) — สูตรเดียว
    // กับที่เอกสารพิมพ์และที่ตรึงลงใบ ห้ามให้หน้าไหนคิด VAT เองซ้ำ
    amountToCollect: billedTaxTotals(filingLines).amountToCollect,
  };
}
