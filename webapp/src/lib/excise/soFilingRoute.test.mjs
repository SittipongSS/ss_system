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

// ── ใบยื่นผูกใบเสนอราคาต้นทาง (มติผู้ใช้ 2026-09-07 · mig 0349) ───────────────
// ต้นทางยังเป็นใบสั่งขายที่อนุมัติแล้ว แต่ต้องผูก QT ที่เกี่ยวข้องด้วย FK ไม่ใช่สตริง
// `quotationRef` ที่ PATCH /api/orders/[id] เปิดให้พิมพ์แก้เองได้
test("ใบยื่นเขียน quotationId ลงใบ — อ่านจาก sales_orders ตรง ๆ ไม่ใช่จาก snapshot", () => {
  assert.match(routeSource, /quotationId: salesOrder\.quotationId \|\| null/);
  // ห้ามเดาจาก quotation ที่โหลดมา (ผ่านการเลือก/ตกทอดมาอีกชั้น)
  assert.doesNotMatch(routeSource, /quotationId: salesOrder\.quotation\?\./);
});

// 🪤 migration รันด้วยมือบน Supabase ⇒ มีช่วงที่โค้ดขึ้นก่อน schema · ถ้าคอลัมน์ใหม่
// ไม่อยู่ในลิสต์ additive การสร้างใบยื่นจะพังทั้งใบด้วย PGRST204 แทนที่จะแค่ไม่มีลิงก์
test("quotationId อยู่ในลิสต์คอลัมน์ที่ยอมให้หายระหว่างรอ migration", () => {
  const ordersLib = readFileSync(new URL("../tax/orders.js", import.meta.url), "utf8");
  const additive = ordersLib.match(/ADDITIVE_ORDER_COLS = \[([\s\S]*?)\];/)[1];
  assert.match(additive, /'quotationId'/);
});

// จอตอนสร้างต้องบอกได้ว่ากำลังยื่นตาม QT ใบไหน — ทั้งในลิสต์ตัวเลือกและในการ์ดสรุป
test("ทั้งลิสต์ SO ที่รอยื่นและการ์ดสรุปส่งเลขใบเสนอราคามาด้วย", () => {
  assert.match(routeSource, /quoteNumber: quoteNumberById\.get\(salesOrder\.quotationId\)/);
  assert.match(routeSource, /quoteNumber: salesOrder\.quotation\?\.quoteNumber \|\| null/);
});

// 🪤 ลิสต์ id ยาวเกิน ~16 KB = PostgREST ต่อไม่ติด แล้วโยน TypeError ดิบ ๆ
// (ดู lib/supabaseInChunks.js) · จำนวน SO ที่ค้างยื่นโตตามงาน จึงข้ามเส้นได้เอง
test("โหลดเลขใบเสนอราคาแบบยิงทีละก้อน ไม่ใช่ .in() ก้อนเดียว", () => {
  assert.match(
    routeSource,
    /fetchInChunks\(\s*available\.map\(\(salesOrder\) => salesOrder\.quotationId\)/,
  );
});

// โมดัลต้องโชว์รายการที่จะยื่นจริง ไม่ใช่แค่จำนวน — API ส่ง lines มาครบอยู่แล้ว
test("โมดัลสร้างใบยื่นวาดตารางรายการ และไม่ใช้ style ดิบ (งบ inlineStyle เต็มเพดาน)", () => {
  const modal = readFileSync(
    new URL("../../components/excise/SalesOrderFilingModal.js", import.meta.url),
    "utf8",
  );
  assert.match(modal, /resolution\.lines\.map\(/, "ต้องวาดรายการจริง");
  assert.match(modal, /<TableScroll/, "ตารางต้องอยู่ใน TableScroll ตามสัญญาตารางกลาง");
  assert.doesNotMatch(modal, /style=\{\{/, "ห้าม inline style — ใช้ CSS module");
});
