import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filingItemRows, filingTotalsOf, resolveSalesOrderFiling } from "./soFilingItems.js";

/* 🔴 ตรวจระบบ 2026-10-26 ข้อ 3 — ใบยื่นจาก SO ที่ถูกตีกลับ แก้ผ่านฟอร์มเลือกทะเบียนแล้ว **บรรทัดที่ยังไม่มีทะเบียนหาย**
   (ยอดหดเงียบ ๆ · ทุกบรรทัดไม่มีทะเบียน = ส่งกลับไม่ได้) · แถวใหม่ทิ้ง salesOrderLineId · ลบก่อนใส่ = ใส่พังแล้วใบว่าง
   ⇒ ตัวคิดบรรทัดจาก SO ตัวเดียว (resolveSalesOrderFiling + filingItemRows)
   ⭐ v3 (มติ 02/11): บันทึกการยื่นตรึงรายการตอนเริ่มยื่น — ไม่มีทางคิดใหม่/แก้รายการบนบันทึกแล้ว (ถอนแล้วเริ่มยื่นใหม่แทน) */
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/* ตัวจำลอง supabase — ตอบตามตาราง ไม่ต่อฐานจริง */
function fakeSupabase(tables) {
  return {
    from(table) {
      const rows = tables[table] || [];
      const builder = {
        select() { return builder; },
        in() { return builder; },
        then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
      };
      return builder;
    },
  };
}

test("คิดใหม่จาก SO: บรรทัดที่ไม่มีทะเบียนอยู่ครบ · อัตราใช้ค่าล่าสุดของสินค้า · จำนวนจากบรรทัด SO", async () => {
  const supabase = fakeSupabase({
    products: [
      { id: "P-1", fgCode: "FG-X-01-002-0001", exciseTax: 8, localTax: 0.8, retailPriceIncVat: 107 },
      { id: "P-2", fgCode: "FG-X-01-002-0002", exciseTax: 4, localTax: 0.4, retailPriceIncVat: 53.5 },
    ],
    product_types: [{ mainCategoryCode: "01", typeCode: "002", isExcise: true }],
  });
  const resolved = await resolveSalesOrderFiling(supabase, {
    id: "SO-1", status: "approved", customerId: null,
    lines: [
      { id: "L-1", productId: "P-1", fgCode: "FG-X-01-002-0001", qty: 10 },
      { id: "L-2", productId: "P-2", fgCode: "FG-X-01-002-0002", qty: 3, packQty: 2 },
    ],
  });
  assert.deepEqual(resolved.lines.map((l) => [l.salesOrderLineId, l.registrationId, l.quantity, l.totalTax]), [
    ["L-1", null, 10, 88],
    ["L-2", null, 6, 26.4],
  ]);
  const rows = filingItemRows("TAX-1", resolved.lines);
  assert.deepEqual(rows.map((r) => [r.orderId, r.salesOrderLineId, r.registrationId, r.quantity]), [
    ["TAX-1", "L-1", null, 10],
    ["TAX-1", "L-2", null, 6],
  ]);
  assert.equal(new Set(rows.map((r) => r.id)).size, 2, "id ใหม่ไม่ซ้ำกัน");
  assert.ok(rows.every((r) => r.id.startsWith("TXI-")));
  // 8×10 + 4×6 = 104 · ท้องถิ่น 0.8×10 + 0.4×6 = 10.4 · เก็บลูกค้า 114.4 × 1.07 = 122.41
  assert.deepEqual(filingTotalsOf(resolved), { totalExciseTax: 104, totalLocalTax: 10.4, totalTax: 114.4, amountToCollect: 122.41 });
});

test("filingItemRows ออก id ใหม่ทุกครั้ง — ชุดใหม่ต้องไม่ชนแถวเดิมของใบ (ใส่ก่อนลบ)", () => {
  const lines = [{ salesOrderLineId: "L-1", productId: "P-1", quantity: 1, totalTax: 8.8 }];
  assert.notEqual(filingItemRows("TAX-1", lines)[0].id, filingItemRows("TAX-1", lines)[0].id);
});

const patchRoute = read("../../app/api/orders/[id]/route.js");
const patchCode = codeOnly(patchRoute);
const fromSoRoute = codeOnly(read("../../app/api/tax/orders/from-sales-order/route.js"));
const filingPage = codeOnly(read("../../app/tax/filings/[id]/page.js"));

/* v3: บันทึกการยื่นตรึงรายการไว้ตอนเริ่มยื่น — PATCH ปฏิเสธทั้งรายการมือและคิดใหม่ · ทางเดียวที่เขียนแถว order_items
   คือตอนเริ่มยื่น (ตัวแปลงแถวตัวเดียวกับเดิม) */
test("บันทึกการยื่น: PATCH ห้ามแก้รายการ/คิดใหม่ · แถวรายการเกิดทางเดียวตอนเริ่มยื่นด้วยตัวแปลงกลาง", () => {
  assert.match(patchCode, /if \(Array\.isArray\(body\.items\) \|\| body\.recalcFromSalesOrder === true\) \{\s*return Response\.json\(/);
  assert.doesNotMatch(patchCode, /insertOrderItems|filingItemRows|from\('order_items'\)\.delete/, "ทางสลับรายการบน PATCH ต้องไม่กลับมา");
  assert.doesNotMatch(patchCode, /loadScoped\(supabase, 'sales_orders'/, "RA ไม่มีขอบเขตขาย — ห้ามกลับไปใช้ด่านดีลแม่");
  assert.match(fromSoRoute, /const itemRows = filingItemRows\(orderId, resolved\.lines\)/);
  assert.doesNotMatch(filingPage, /recalcFromSalesOrder|filingRecalcBlock|FILING_EDITABLE_STATUSES/, "หน้าบันทึกไม่มีปุ่มคิดใหม่แล้ว");
});
