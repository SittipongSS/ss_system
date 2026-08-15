import test from "node:test";
import assert from "node:assert/strict";
import { resolveSoFiling } from "./soFiling.js";

const productTypes = [
  { mainCategoryCode: "01", typeCode: "002", isExcise: true },
  { mainCategoryCode: "01", typeCode: "001", isExcise: false },
];
const salesOrder = { id: "SO-1", status: "approved", customerId: "C-1" };
const products = [
  { id: "P-1", fgCode: "FG-X-01-002-0001", exciseTax: 8, localTax: 0.8 },
  { id: "P-2", fgCode: "FG-X-01-001-0002", exciseTax: 8, localTax: 0.8 },
  { id: "P-3", fgCode: "FG-X-01-002-0003", exciseTax: 8, localTax: 0.8, isExciseTaxable: false },
];

test("SO filing keeps only taxable lines from excise-enabled categories", () => {
  const result = resolveSoFiling({
    salesOrder,
    productTypes,
    products,
    lines: [
      { id: "L-1", productId: "P-1", fgCode: products[0].fgCode, qty: 10 },
      { id: "L-2", productId: "P-2", fgCode: products[1].fgCode, qty: 10 },
      { id: "L-3", productId: "P-3", fgCode: products[2].fgCode, qty: 10 },
    ],
  });
  assert.deepEqual(result.lines.map((line) => line.salesOrderLineId), ["L-1"]);
  assert.equal(result.totalTax, 88);
  assert.equal(result.eligible, true);
});

test("tax is snapshotted from product rates and rounded per component", () => {
  const result = resolveSoFiling({
    salesOrder,
    productTypes,
    products: [{ id: "P-1", fgCode: products[0].fgCode, exciseTax: 1.005, localTax: 0.335 }],
    lines: [{ id: "L-1", productId: "P-1", qty: 3 }],
  });
  assert.equal(result.lines[0].exciseRatePerUnit, 1);
  assert.equal(result.lines[0].localTaxRatePerUnit, 0.34);
  assert.equal(result.totalTax, 4.02);
});

test("approved registration is advisory and removes only its warning", () => {
  const withoutRegistration = resolveSoFiling({
    salesOrder, productTypes, products, lines: [{ id: "L-1", productId: "P-1", qty: 1 }],
  });
  const withRegistration = resolveSoFiling({
    salesOrder,
    productTypes,
    products,
    lines: [{ id: "L-1", productId: "P-1", qty: 1 }],
    registrations: [{ id: "R-1", productId: "P-1", customerId: "C-1", status: "approved" }],
  });
  assert.equal(withoutRegistration.lines[0].needsRegistration, true);
  assert.equal(withRegistration.lines[0].needsRegistration, false);
  assert.equal(withRegistration.eligible, true);
});

test("an unapproved SO is never eligible even when it has excise lines", () => {
  const result = resolveSoFiling({
    salesOrder: { ...salesOrder, status: "pending_approval" },
    productTypes,
    products,
    lines: [{ id: "L-1", productId: "P-1", qty: 1 }],
  });
  assert.equal(result.eligible, false);
});

test("missing product data is reported and never invents a tax amount", () => {
  const result = resolveSoFiling({
    salesOrder,
    productTypes,
    lines: [{ id: "L-1", productId: "missing", fgCode: products[0].fgCode, qty: 10 }],
  });
  assert.equal(result.lines.length, 0);
  assert.equal(result.totalTax, 0);
  assert.equal(result.warnings[0].code, "missing_product");
});

// ── override ของฝ่ายกฎหมายต้องทำงานสองทาง (แก้ 2026-08-16) ─────────────────
test("LG บังคับเก็บภาษีบนหมวดที่ไม่ใช่สรรพสามิต → ต้องเข้าใบยื่น ไม่ใช่ถูกข้าม", () => {
  // 🐞 เดิมใช้ธงของหมวดเป็นตัวตั้ง ⇒ ยกเว้นได้ แต่บังคับเก็บไม่ได้
  const out = resolveSoFiling({
    salesOrder: { status: "approved", customerId: "CUS-1" },
    lines: [{ id: "L1", productId: "P1", fgCode: "FG-1", qty: 10 }],
    products: [{
      id: "P1", fgCode: "FG-1", name: "สินค้าบังคับเก็บ",
      // LG บังคับเก็บ → resolveProductTaxable เขียน isExciseTaxable = true ตอนบันทึกสินค้า
      taxableOverride: true, isExciseTaxable: true, exciseTax: 8, localTax: 0.8,
    }],
    productTypes: [], // หมวดไม่ติ๊ก isExcise
    registrations: [],
  });
  assert.equal(out.lines.length, 1, "บรรทัดที่ LG สั่งเก็บภาษีต้องอยู่ในใบยื่น");
  assert.equal(out.totalExciseTax, 80);
  assert.equal(out.totalLocalTax, 8);
  assert.equal(out.totalTax, 88);
});

test("LG ยกเว้นภาษีบนหมวดสรรพสามิต → ยังต้องถูกข้ามเหมือนเดิม", () => {
  const out = resolveSoFiling({
    salesOrder: { status: "approved", customerId: "CUS-1" },
    lines: [{ id: "L1", productId: "P1", fgCode: "FG-1", qty: 10 }],
    products: [{ id: "P1", fgCode: "FG-1", taxableOverride: false, isExciseTaxable: false, exciseTax: 8, localTax: 0.8 }],
    productTypes: [{ mainCategoryCode: "01", typeCode: "002", isExcise: true }],
    registrations: [],
  });
  assert.equal(out.lines.length, 0);
});
