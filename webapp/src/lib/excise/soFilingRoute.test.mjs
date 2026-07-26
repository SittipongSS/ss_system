import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveSoFiling } from "./soFiling.js";

const routeSource = readFileSync(
  new URL("../../app/api/tax/orders/from-sales-order/route.js", import.meta.url),
  "utf8",
);
const billPrintSource = readFileSync(new URL("../tax/billPrint.js", import.meta.url), "utf8");

const productTypes = [{ mainCategoryCode: "01", typeCode: "002", isExcise: true }];
const products = [{ id: "P-1", fgCode: "FG-X-01-002-0001", exciseTax: 8, localTax: 0.8 }];
const lines = [{ id: "L-1", productId: "P-1", fgCode: products[0].fgCode, qty: 10 }];

// บั๊กจริง 2026-07-26: select ของลิสต์ "SO ที่รอยื่น" ไม่ได้ดึง status มา ทั้งที่ eligible
// ตัดสินด้วย status → ลิสต์ว่างเสมอ = โมดูลภาษีสร้างใบยื่นไม่ได้เลย (หน้า /tax/filings
// เปลี่ยนไปใช้ SalesOrderFilingModal เป็นทางเดียวแล้ว) · เทสต์เดิมมองไม่เห็นเพราะส่ง
// salesOrder ที่มี status ครบเสมอ จึงต้องล็อกทั้งสัญญาและ projection ที่ route ใช้จริง
test("eligible ผูกกับ status ของ SO — ตัดคอลัมน์นี้ออกจาก select แล้วลิสต์จะว่างเงียบ ๆ", () => {
  const complete = resolveSoFiling({
    salesOrder: { id: "SO-1", status: "approved", customerId: "C-1" },
    lines, products, productTypes,
  });
  const withoutStatus = resolveSoFiling({
    salesOrder: { id: "SO-1", customerId: "C-1" },
    lines, products, productTypes,
  });
  assert.equal(complete.eligible, true);
  assert.equal(withoutStatus.eligible, false, "ไม่มี status = ไม่ eligible");
  assert.equal(withoutStatus.lines.length, 1, "บรรทัดยังคำนวณได้ — บั๊กจึงเงียบ ไม่มี error");
});

test("select ของลิสต์ SO ที่รอยื่นต้องมี status อยู่ในคอลัมน์", () => {
  const select = routeSource.match(/\.select\("id, orderNumber,[^"]*"\)/);
  assert.ok(select, "หา select ของ listAvailableSalesOrders ไม่เจอ");
  assert.match(select[0], /\bstatus\b/);
});

// ลูกค้าของเอกสารต้องมาจากค่าที่ตรึงบนใบก่อน (mig 0167) ไม่ใช่ทะเบียนสดที่ผู้กดพิมพ์
// "มองเห็น" — ไม่งั้นเอกสารใบเดียวกันพิมพ์ออกมาไม่เหมือนกันตามทีมของคนกด
test("ใบยื่นตรึงเลขภาษี + ที่อยู่ลูกค้าลงใบ และเอกสารอ่านค่าที่ตรึงก่อนเสมอ", () => {
  assert.match(routeSource, /customerTaxId: salesOrder\.quotation\?\.customerTaxId \|\| salesOrder\.customer\?\.taxId/);
  assert.match(routeSource, /customerAddress: salesOrder\.quotation\?\.billingAddress \|\| salesOrder\.customer\?\.address/);
  assert.match(billPrintSource, /const taxId = order\.customerTaxId \|\| customer\.taxId/);
  assert.match(billPrintSource, /const address = order\.customerAddress \|\| customer\.address/);
});
