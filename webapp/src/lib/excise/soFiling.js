import { categoryFlags, categoryOf } from "@/lib/master/categoryOf";
import { billedTaxTotals, exciseTaxLine, resolveProductTaxable } from "@/lib/tax/exciseBilling";

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const normalizedKey = (value) => String(value || "").trim().toLowerCase();

export function resolveSoFiling({
  salesOrder,
  lines = [],
  products = [],
  productTypes = [],
  registrations = [],
} = {}) {
  const productById = new Map(products.filter((row) => row?.id).map((row) => [row.id, row]));
  const productByFg = new Map(products.filter((row) => row?.fgCode).map((row) => [normalizedKey(row.fgCode), row]));
  const approvedRegistrationByProduct = new Map(
    registrations
      .filter((row) => row?.status === "approved" && (!salesOrder?.customerId || row.customerId === salesOrder.customerId))
      .map((row) => [row.productId, row]),
  );

  const filingLines = [];
  const warnings = [];
  for (const line of lines) {
    const product = productById.get(line.productId) || productByFg.get(normalizedKey(line.fgCode));
    const fgCode = line.fgCode || product?.fgCode || "";
    const flags = categoryFlags(categoryOf(fgCode), productTypes);
    /* 🐞 **แก้ 2026-08-16:** เดิมเขียน `!flags.isExcise || product?.isExciseTaxable === false`
       ซึ่งเอาธงของ **หมวด** เป็นตัวตั้ง ⇒ override ของฝ่ายกฎหมายทำงานทางเดียว:
       "ยกเว้น" ได้ แต่ **"บังคับเก็บ" ไม่ได้** — สินค้าที่ LG สั่งเก็บภาษีบนหมวดที่ไม่ได้
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

    filingLines.push({
      salesOrderLineId: line.id,
      registrationId: registration?.id || null,
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
        message: `${fgCode || line.description} ยังไม่มีทะเบียนสรรพสามิตที่อนุมัติ`,
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
