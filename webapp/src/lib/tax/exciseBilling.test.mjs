import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXCISE_VAT_RATE, billedTaxLine, billedTaxTotals, orderAmountToCollect,
} from "./exciseBilling.js";
import { buildBillPrintHTML } from "./billPrint.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("ยอดที่เรียกเก็บ = ค่าภาษี + VAT 7% (มติผู้ใช้ 2026-07-26)", () => {
  assert.equal(EXCISE_VAT_RATE, 0.07);
  const totals = billedTaxTotals([{ quantity: 100, totalTax: 880 }]);
  assert.deepEqual(totals, { totalTax: 880, vat: 61.6, amountToCollect: 941.6 });
});

// ปัดต่อหน่วยก่อนแล้วคูณจำนวน — เอกสารต้องกระทบยอดด้วยมือได้ (ภาษี/ชิ้น × จำนวน = รวม)
test("ปัดเศษภาษีต่อหน่วยก่อนคูณจำนวน", () => {
  const line = billedTaxLine({ quantity: 3, totalTax: 10 });
  assert.equal(line.perUnit, 3.33);
  assert.equal(line.tax, 9.99);
  assert.equal(billedTaxTotals([{ quantity: 3, totalTax: 10 }]).amountToCollect, 10.69);
});

test("จำนวน 0 หรือไม่มีรายการ ไม่ระเบิดและไม่คิด VAT ลอย ๆ", () => {
  assert.deepEqual(billedTaxLine({ quantity: 0, totalTax: 500 }), { quantity: 0, perUnit: 0, tax: 0 });
  assert.deepEqual(billedTaxTotals([]), { totalTax: 0, vat: 0, amountToCollect: 0 });
  assert.equal(orderAmountToCollect(null), 0);
});

// ใบที่สร้างก่อนมติ (เก็บยอดไม่รวม VAT ไว้) ต้องแสดงยอดตรงกับเอกสาร ไม่ใช่ยอดที่เก็บไว้
test("ใบเก่าคิดใหม่จากรายการ — ยอดที่เก็บไว้ก่อนมติไม่ทำให้จอเพี้ยน", () => {
  const legacy = { amountToCollect: 880, totalTax: 880, items: [{ quantity: 100, totalTax: 880 }] };
  assert.equal(orderAmountToCollect(legacy), 941.6);
  // ไม่มีรายการติดมา (payload แบบ slim) → ใช้ค่าที่เก็บ แล้วถ้าไม่มีค่อยคิดจาก totalTax
  assert.equal(orderAmountToCollect({ amountToCollect: 941.6, totalTax: 880 }), 941.6);
  assert.equal(orderAmountToCollect({ totalTax: 880 }), 941.6);
});

// จุดสำคัญ: เลขบนจอ = เลขบนเอกสารที่ส่งลูกค้า ห้ามเดินหนีกัน
test("ยอดสุทธิบนใบแจ้งชำระที่พิมพ์ = ยอดที่เรียกเก็บที่ระบบคิด", () => {
  const items = [
    { id: "1", quantity: 100, totalTax: 880, product: { fgCode: "FG-1", retailPriceExVat: 100 } },
    { id: "2", quantity: 7, totalTax: 61.6, product: { fgCode: "FG-2", retailPriceExVat: 50 } },
  ];
  const expected = billedTaxTotals(items);
  const html = buildBillPrintHTML({ id: "TAX-1", items, customerName: "ลูกค้า" }, {});
  const printed = html.match(/ยอดแจ้งชำระสุทธิ \(รวม VAT\)<\/span><span>([\d,.]+)</);
  assert.ok(printed, "หาแถวยอดสุทธิบนเอกสารไม่เจอ");
  assert.equal(
    printed[1],
    expected.amountToCollect.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  );
});

test("ทางสร้างใบยื่นทั้งสองทางตรึงยอดรวม VAT ลงใบ ไม่ใช่ยอดภาษีเปล่า", () => {
  const fromSo = read("../../app/api/tax/orders/from-sales-order/route.js");
  const manual = read("../../app/api/orders/route.js");
  assert.match(fromSo, /amountToCollect: billedTaxTotals\(resolved\.lines\)\.amountToCollect/);
  assert.match(manual, /amountToCollect: billedTaxTotals\(itemRows\)\.amountToCollect/);
});

test("VAT คิดที่ lib เดียว — ห้ามฮาร์ดโค้ด 0.07 ในโมดูลภาษีอีก", () => {
  for (const path of [
    "./billPrint.js",
    "../excise/soFiling.js",
    "../../app/api/tax/orders/from-sales-order/route.js",
    "../../app/api/orders/route.js",
    "../../app/tax/filings/[id]/page.js",
  ]) {
    assert.doesNotMatch(read(path), /0\.07/, path);
  }
});
