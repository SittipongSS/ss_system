import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findFilingFor, loadFilingSource, loadFilingSummary, loadRaFilingQueue } from "./raFiling.js";
import { documentWorkflowError } from "../sales/documentWorkflowErrors.js";

/* ── ใบยื่นกรมของ RA (แผนรื้อสรรพสามิต PR5 · mig 0417) — ตัวโหลดฝั่ง server กับฐานจำลองในหน่วยความจำ ─────────────
   ฐานจำลองรู้จักแค่ตัวกรองที่ตัวโหลดใช้ (eq · is · in · not is null · or eq · order · range · limit · maybeSingle) +
   embed `lines:sales_order_lines(*)` ⇒ เทสต์ตอบได้ว่า "ใครเข้าคิว · ใครถูกปฏิเสธ" จริง ไม่ใช่แค่รูปซอร์ส */
function fakeDb(tables) {
  const rows = (name) => tables[name] || [];
  const from = (name) => {
    const filters = [];
    let embedLines = false;
    let limitN = null;
    const apply = () => {
      let out = rows(name).filter((row) => filters.every((f) => f(row)));
      if (embedLines) out = out.map((row) => ({ ...row, lines: rows("sales_order_lines").filter((l) => l.salesOrderId === row.id) }));
      return limitN == null ? out : out.slice(0, limitN);
    };
    const b = {
      select(cols = "") { embedLines = /lines:sales_order_lines/.test(cols); return b; },
      eq(col, val) { filters.push((r) => r[col] === val); return b; },
      is(col, val) { filters.push((r) => (r[col] ?? null) === val); return b; },
      in(col, vals) { filters.push((r) => vals.includes(r[col])); return b; },
      not(col, op, val) { if (op === "is" && val === null) filters.push((r) => r[col] != null); return b; },
      or(expr) {
        const parts = expr.split(",").map((p) => p.split(".eq."));
        filters.push((r) => parts.some(([col, val]) => r[col] === val));
        return b;
      },
      order() { return b; },
      limit(n) { limitN = n; return b; },
      range(from, to) { return Promise.resolve({ data: apply().slice(from, to + 1), error: null }); },
      maybeSingle() { return Promise.resolve({ data: apply()[0] || null, error: null }); },
      then(resolve) { resolve({ data: apply(), error: null }); },
    };
    return b;
  };
  return { from };
}

const exciseLine = (id, orderId, sourceLineId, productId, fg, qty, perUnit, excise, local) => ({
  id, salesOrderId: orderId, qty, unitPrice: perUnit, description: `ค่าภาษี ${fg}`,
  metadata: { lineKind: "excise_charge", sourceSalesOrderLineId: sourceLineId, sourceProductId: productId, sourceFgCode: fg, excisePerUnit: excise, localPerUnit: local },
});

const base = () => ({
  sales_orders: [
    // SO ลูกค้า: S1 (มีใบค่าสรรพสามิตอนุมัติ SX1) · S2 (ไม่เรียกเก็บ เก็บนอกระบบ) · S3 (ไม่ต้องเสีย) · S4 (มีใบยื่นแล้ว + SX4)
    { id: "S1", orderNumber: "SO-1", status: "approved", origin: "pipeline", customerId: "C1", customerName: "ลูกค้า", approvedAt: "2026-10-01", supersededById: null },
    { id: "S2", orderNumber: "SO-2", status: "approved", origin: "pipeline", customerId: "C1", customerName: "ลูกค้า", approvedAt: "2026-10-02", supersededById: null,
      exciseNotBilledKind: "collected_outside", exciseNotBilledReason: "ออกบิล Express แล้ว", exciseNotBilledRef: "EX-1", exciseNotBilledAt: "2026-10-03" },
    { id: "S3", orderNumber: "SO-3", status: "approved", origin: "pipeline", customerId: "C1", customerName: "ลูกค้า", approvedAt: "2026-10-02", supersededById: null,
      exciseNotBilledKind: "not_liable", exciseNotBilledReason: "ไม่ต้องเสียภาษี", exciseNotBilledAt: "2026-10-03" },
    { id: "S4", orderNumber: "SO-4", status: "approved", origin: "pipeline", customerId: "C1", customerName: "ลูกค้า", approvedAt: "2026-10-04", supersededById: null },
    { id: "SH", orderNumber: "SO-H", status: "approved", origin: "historical", customerId: "C1", customerName: "ลูกค้า", approvedAt: "2026-10-01", supersededById: null,
      exciseNotBilledKind: null },
    { id: "SX1", orderNumber: "SO-X1", status: "approved", origin: "excise", sourceSalesOrderId: "S1", quotationId: "QX1", customerId: "C1", customerName: "ลูกค้า",
      approvedAt: "2026-10-05", supersededById: null, totalAmount: 107, vatAmount: 7, financeStatus: "pending" },
    { id: "SX4", orderNumber: "SO-X4", status: "approved", origin: "excise", sourceSalesOrderId: "S4", quotationId: "QX4", customerId: "C1", customerName: "ลูกค้า",
      approvedAt: "2026-10-06", supersededById: null, totalAmount: 50, vatAmount: 3.27, financeStatus: "approved" },
    { id: "SXD", orderNumber: "SO-XD", status: "draft", origin: "excise", sourceSalesOrderId: "S2", quotationId: "QXD", customerId: "C1", customerName: "ลูกค้า",
      approvedAt: null, supersededById: null, totalAmount: 10, vatAmount: 0.65 },
  ],
  sales_order_lines: [
    { id: "L1", salesOrderId: "S1", productId: "P1", fgCode: "FG-1", qty: 10, packQty: null, description: "น้ำหอม" },
    exciseLine("XL1", "SX1", "L1", "P1", "FG-1", 10, 10, 9.09, 0.91),
  ],
  orders: [{ id: "TAX-4", status: "draft", salesOrderId: "S4", exciseSalesOrderId: "SX4" }],
  quotations: [{ id: "QX1", quoteNumber: "QT-X1" }, { id: "QX4", quoteNumber: "QT-X4" }],
  products: [{ id: "P1", fgCode: "FG-1", exciseTax: 9.09, localTax: 0.91, retailPriceIncVat: 120, isExciseTaxable: true }],
  product_types: [],
  excise_registrations: [{ id: "R1", productId: "P1", customerId: "C1", status: "approved", isExciseTaxable: true }],
  customers: [{ id: "C1", taxId: null }],
});

test("คิวรอยื่นกรม: SO ค่าสรรพสามิตอนุมัติ + SO ไม่เรียกเก็บ (เก็บนอก/รวมราคา) · ไม่ต้องเสีย/ร่าง/มีใบยื่นแล้ว/ใบย้อนหลัง ไม่เข้า", async () => {
  const rows = await loadRaFilingQueue(fakeDb(base()));
  assert.deepEqual(rows.map((r) => r.key), ["not_billed:S2", "excise:SX1"], "เรียงเก่าสุดก่อน");
  const excise = rows.find((r) => r.source === "excise_order");
  assert.equal(excise.salesOrder.id, "S1");
  assert.equal(excise.exciseOrder.quoteNumber, "QT-X1");
  const notBilled = rows.find((r) => r.source === "not_billed");
  assert.equal(notBilled.notBilled.label, "เก็บนอกระบบแล้ว");
  assert.equal(notBilled.notBilled.ref, "EX-1");
});

test("แหล่งใบยื่นจาก SO ค่าสรรพสามิต: รายการ = บรรทัดใบนั้น (FG ต้นทาง · ลิงก์บรรทัด SO ลูกค้า · ทะเบียน) · ยอด = ที่ลูกค้าจ่าย", async () => {
  const loaded = await loadFilingSource(fakeDb(base()), { exciseSalesOrderId: "SX1" });
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.source, "excise_order");
  assert.equal(loaded.salesOrder.id, "S1");
  const [line] = loaded.resolved.lines;
  assert.equal(line.productId, "P1");
  assert.equal(line.salesOrderLineId, "L1");
  assert.equal(line.registrationId, "R1");
  assert.equal(line.totalTax, 100);
  assert.equal(loaded.resolved.amountToCollect, 107, "ยอดรวมของ SO ค่าสรรพสามิต (รวม VAT) — ไม่คิดซ้ำ");
});

test("แหล่งใบยื่นถูกปฏิเสธ: SO ค่าสรรพสามิตยังไม่อนุมัติ · ไม่ต้องเสีย · SO ไม่มีทั้งใบค่าสรรพสามิตและคำตัดสิน · ใบย้อนหลัง · ไม่ใช่ SO ค่าสรรพสามิต", async () => {
  const db = fakeDb(base());
  assert.match((await loadFilingSource(db, { exciseSalesOrderId: "SXD" })).error.message, /ยังไม่ได้อยู่ในสถานะอนุมัติแล้ว/);
  assert.match((await loadFilingSource(db, { salesOrderId: "S3" })).error.message, /ไม่ต้องเสียภาษี — ไม่ต้องยื่นกรม/);
  assert.match((await loadFilingSource(db, { salesOrderId: "S1" })).error.message, /ยังไม่ใช่งานยื่นกรม/);
  assert.match((await loadFilingSource(db, { salesOrderId: "SH" })).error.message, /เฉพาะใบสั่งขายจากใบเสนอราคา/);
  assert.equal((await loadFilingSource(db, { exciseSalesOrderId: "S1" })).error.status, 404);
  assert.equal((await loadFilingSource(db, {})).error.status, 400);
});

test("ใบยื่นที่มีอยู่แล้ว: หาเจอทั้งทาง SO ลูกค้าและทาง SO ค่าสรรพสามิต", async () => {
  const db = fakeDb(base());
  assert.equal((await findFilingFor(db, { salesOrderId: "S4" }))?.id, "TAX-4");
  assert.equal((await findFilingFor(db, { salesOrderId: "S9", exciseSalesOrderId: "SX4" }))?.id, "TAX-4");
  assert.equal(await findFilingFor(db, { salesOrderId: "S1", exciseSalesOrderId: "SX1" }), null);
  assert.equal(await findFilingFor(db, {}), null);
});

test("แผงสรุปบนหน้าใบยื่น: ต้นทาง + บัญชี + ด่านเริ่มยื่น (เงินปิดใบแล้ว · ทะเบียนครบ)", async () => {
  const db = fakeDb(base());
  const summary = await loadFilingSummary(db, { salesOrderId: "S4", exciseSalesOrderId: "SX4", items: [{ registrationId: "R1" }] });
  assert.equal(summary.source, "excise_order");
  assert.equal(summary.salesOrder.orderNumber, "SO-4");
  assert.equal(summary.exciseOrder.quoteNumber, "QT-X4");
  assert.equal(summary.exciseOrder.financeStatus, "approved");
  assert.equal(summary.gates.money.ok, true);
  assert.equal(summary.gates.registration.ok, true);
  const notBilled = await loadFilingSummary(db, { salesOrderId: "S2", items: [{ registrationId: null }] });
  assert.equal(notBilled.notBilled.label, "เก็บนอกระบบแล้ว");
  assert.equal(notBilled.gates.money.ok, true);
  assert.equal(notBilled.gates.registration.ok, false);
});

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("route: คิวอ่านได้เฉพาะฝ่าย RA (ไม่ผ่านด่านหน้าขาย) · สร้างได้เฉพาะ ra:approve · หน้าใบยื่นแนบแผงสรุป", () => {
  const queue = codeOnly(read("../../app/api/tax/orders/queue/route.js"));
  assert.match(queue, /if \(!can\(user\.role, "ra:view"\) && !can\(user\.role, "ra:approve"\)\) return forbidden\(\);/);
  assert.doesNotMatch(queue, /canViewSalesPlanning/, "RA ไม่มีสิทธิ์หน้าขาย — คิวต้องไม่ผ่านด่านนั้น");
  const create = codeOnly(read("../../app/api/tax/orders/from-sales-order/route.js"));
  const post = create.slice(create.indexOf("export const POST"));
  assert.match(post, /exciseSalesOrderId: exciseOrder\?\.id \|\| null/, "ใบยื่นผูก SO ค่าสรรพสามิตด้วย");
  assert.match(post, /salesOrderId: salesOrder\.id/, "และผูก SO ลูกค้าเสมอ (ล็อก SO ลูกค้าผ่านกลไกเดิม)");
  const detail = codeOnly(read("../../app/api/orders/[id]/route.js"));
  assert.match(detail, /data\.source = await loadFilingSummary\(supabase, data\)/);
});

test("ยกเลิก SO: ด่านใบยื่นดูทั้งสองลิงก์ · ฐานกันอีกชั้น (0417) · รหัสฐานแปลไทยแล้ว", () => {
  const route = codeOnly(read("../../app/api/sales-planning/sales-orders/[id]/route.js"));
  assert.match(route, /\.or\(`salesOrderId\.eq\.\$\{id\},exciseSalesOrderId\.eq\.\$\{id\}`\)/);
  const sql = read("../../../supabase/migrations/0417_excise_filing_links.sql");
  assert.match(sql, /CREATE TRIGGER sales_orders_excise_filed_no_cancel_trg/);
  assert.match(sql, /CREATE TRIGGER orders_excise_link_check_trg/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS orders_excise_sales_order_uidx/);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ""), /pg_get_functiondef|CREATE OR REPLACE FUNCTION public\.(revoke|revise)_/, "ไม่ปะเนื้อ RPC (บทเรียน 0416)");
  const mapped = documentWorkflowError({ message: "sales_order_cancel_excise_filed" }, { context: "test" });
  assert.equal(mapped.status, 409);
  assert.match(mapped.message, /ฝ่าย RA สร้างใบยื่นกรม/);
});
