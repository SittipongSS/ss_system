import { categoryFlags, categoryOf } from "@/lib/master/categoryOf";
import { billedTaxTotals } from "@/lib/tax/exciseBilling";

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
    if (!flags.isExcise || product?.isExciseTaxable === false) continue;

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

    const exciseRatePerUnit = roundMoney(product.exciseTax);
    const localTaxRatePerUnit = roundMoney(product.localTax);
    const totalExciseTax = roundMoney(exciseRatePerUnit * quantity);
    const totalLocalTax = roundMoney(localTaxRatePerUnit * quantity);
    const totalTax = roundMoney(totalExciseTax + totalLocalTax);
    const registration = approvedRegistrationByProduct.get(product.id) || null;
    const needsRegistration = !registration;

    filingLines.push({
      salesOrderLineId: line.id,
      registrationId: registration?.id || null,
      productId: product.id,
      fgCode,
      description: line.description || product.name || product.productName || fgCode,
      quantity,
      exciseRatePerUnit,
      localTaxRatePerUnit,
      totalExciseTax,
      totalLocalTax,
      totalTax,
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
