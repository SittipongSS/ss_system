import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filingItemRows, filingTotalsOf, resolveSalesOrderFiling } from "./soFilingItems.js";
import { FILING_EDITABLE_STATUSES } from "./workflow.js";

/* 🔴 ตรวจระบบ 2026-10-26 ข้อ 3 — ใบยื่นจาก SO ที่ถูกตีกลับ แก้ผ่านฟอร์มเลือกทะเบียนแล้ว **บรรทัดที่ยังไม่มีทะเบียนหาย**
   (ยอดหดเงียบ ๆ · ทุกบรรทัดไม่มีทะเบียน = ส่งกลับไม่ได้) · แถวใหม่ทิ้ง salesOrderLineId · ลบก่อนใส่ = ใส่พังแล้วใบว่าง
   ⇒ ใบจาก SO แก้รายการได้ทางเดียวคือคิดใหม่จาก SO ด้วย resolver ตัวเดียวกับตอนสร้าง */
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
const form = codeOnly(read("../../components/excise/OrderFormModal.js"));
const filingPage = codeOnly(read("../../app/tax/filings/[id]/page.js"));

test("PATCH ใบยื่น: ใบจาก SO ห้ามแก้ด้วย items · คิดใหม่ผ่าน resolver ตัวเดียวกับตอนสร้าง", () => {
  assert.match(patchCode, /if \(order\.salesOrderId && Array\.isArray\(body\.items\)\) \{\s*return Response\.json\(/);
  assert.match(patchCode, /body\.recalcFromSalesOrder === true/);
  assert.match(patchCode, /resolveSalesOrderFiling\(supabase, salesOrder\)/);
  assert.match(patchCode, /newItemRows = filingItemRows\(id, resolved\.lines\)/);
  assert.match(patchCode, /Object\.assign\(updates, filingTotalsOf\(resolved\)\)/);
  assert.match(patchCode, /isHistoricalOrder\(salesOrder\)/, "ใบย้อนหลังไม่คิดภาษีในระบบ");
  assert.match(patchCode, /loadScoped\(supabase, 'sales_orders', order\.salesOrderId, user, 'edit'\)/, "ด่านดีลแม่เดียวกับตอนสร้าง");
  // ทางสร้างใช้ตัวแปลงแถวตัวเดียวกัน — สองทางต้องได้แถวหน้าตาเดียวกัน
  assert.match(fromSoRoute, /const itemRows = filingItemRows\(orderId, resolved\.lines\)/);
});

test("PATCH ใบยื่น: สลับรายการแบบใส่ชุดใหม่ก่อน แล้วค่อยลบชุดเดิม และเขียนหัวใบทีหลัง", () => {
  assert.doesNotMatch(patchCode, /from\('order_items'\)\.delete\(\)\.eq\('orderId', id\)/, "ห้ามลบทั้งใบก่อนใส่ชุดใหม่");
  const insertAt = patchCode.indexOf("insertOrderItems(supabase, newItemRows)");
  const deleteOldAt = patchCode.indexOf(".delete().in('id', oldIds)");
  const headerAt = patchCode.indexOf("updateOrderResilient(supabase, id, updates)");
  assert.ok(insertAt > 0 && deleteOldAt > insertAt && headerAt > deleteOldAt, "ลำดับต้องเป็น ใส่ → ลบเดิม → หัวใบ");
  assert.doesNotMatch(patchCode, /`OIT-\$\{id\.slice\(3\)\}/, "id แบบต่อท้ายเลขใบชนชุดเดิมตอนใส่ก่อนลบ");
  assert.match(patchCode, /updates\.amountToCollect = billedTaxTotals\(newItemRows\)\.amountToCollect/, "แก้รายการมือแล้วยอดเรียกเก็บต้องตาม");
});

test("สถานะที่แก้ได้: ชุดเดียวของปุ่มบนจอและด่านใน route", () => {
  assert.deepEqual(FILING_EDITABLE_STATUSES, ["draft", "pending", "rejected"]);
  assert.match(patchCode, /FILING_EDITABLE_STATUSES\.includes\(order\.status\)/);
  assert.match(filingPage, /const editAvailable = canAct && FILING_EDITABLE_STATUSES\.includes\(o\?\.status\)/);
  assert.match(filingPage, /visible: editAvailable,/);
});

test("ฟอร์มโหมดใบจาก SO: ไม่ส่ง items · ส่ง recalcFromSalesOrder เมื่อกดคิดใหม่แล้วเท่านั้น", () => {
  const soBranch = form.slice(form.indexOf("if (fromSalesOrder) {"), form.indexOf('if (!customerId) { setError("กรุณาเลือกลูกค้า")'));
  assert.ok(soBranch.length > 0);
  assert.doesNotMatch(soBranch, /items/, "ใบจาก SO ห้ามส่งรายการจากฟอร์ม");
  assert.match(soBranch, /if \(recalcReady\) body\.recalcFromSalesOrder = true/);
  assert.match(form, /\/api\/tax\/orders\/from-sales-order\?salesOrderId=/, "ตัวอย่างต้องมาจาก resolver ตัวเดียวกับ server");
});
