import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyRoundQuantities, exciseRoundRows, parseRoundQuantities, resolveRoundQuantities, roundLinesLinked, roundQuantitiesFromInputs,
  roundQuantitiesOf, roundRemainingSummary,
} from "./exciseRounds.js";

/* ── ใบค่าสรรพสามิตแบ่งรอบ (แผนรื้อสรรพสามิต หมวด 13 · มติเจ้าของ 02/11 V10–V12) — ตัวคิดคงเหลือ/จำนวน ไฟล์บริสุทธิ์ ── */

const template = (lineId, qty, unitPrice, fg = `FG-${lineId}`) => ({
  qty, unitPrice, unit: "ขวด", fgCode: "FG-0108-04-003", description: `${fg} น้ำหอม`,
  metadata: { lineKind: "excise_charge", sourceSalesOrderLineId: lineId, sourceFgCode: fg, descriptionTh: `${fg} น้ำหอม` },
});
const round = (id, ...pairs) => ({ id, lines: pairs.map(([lineId, qty]) => ({ qty, metadata: { sourceSalesOrderLineId: lineId } })) });

test("คงเหลือ = สั่งใน SO − ผลรวมทุกรอบที่ยังมีผล (ไม่นับใบที่กำลังแก้) · ไม่ติดลบ", () => {
  const rows = exciseRoundRows({
    templateLines: [template("L1", 100, 8.85), template("L2", 20, 4.2)],
    otherQuotes: [round("Q1", ["L1", 30]), round("Q2", ["L1", 25], ["L2", 20])],
  });
  assert.deepEqual(rows.map((r) => [r.sourceSalesOrderLineId, r.ordered, r.issued, r.remaining]), [["L1", 100, 55, 45], ["L2", 20, 20, 0]]);
  assert.equal(rows[0].fgCode, "FG-L1");
  assert.equal(rows[0].unitPrice, 8.85);
  assert.deepEqual(roundRemainingSummary(rows), { remainingLines: 1, remainingUnits: 45, hasRemaining: true });
  const over = exciseRoundRows({ templateLines: [template("L1", 10, 1)], otherQuotes: [round("Q", ["L1", 12])] });
  assert.equal(over[0].remaining, 0, "ข้อมูลเกินไม่ทำคงเหลือติดลบ");
  assert.equal(roundRemainingSummary(over).hasRemaining, false);
});

test("จำนวนรอบนี้: ที่จอขอ → จำนวนเดิมของใบ → คงเหลือทั้งหมด · เกิน/ศูนย์ทั้งหมด/บรรทัดแปลก = ข้อความไทย", () => {
  const rows = exciseRoundRows({ templateLines: [template("L1", 10, 1), template("L2", 5, 1)], otherQuotes: [round("Q1", ["L1", 4])] });
  assert.deepEqual([...resolveRoundQuantities({ rows }).quantities], [["L1", 6], ["L2", 5]], "ใบใหม่ = คงเหลือทั้งหมด");
  assert.deepEqual([...resolveRoundQuantities({ rows, fallback: new Map([["L1", 2]]) }).quantities], [["L1", 2], ["L2", 0]], "คิดใหม่ = จำนวนเดิม");
  assert.deepEqual([...resolveRoundQuantities({ rows, requested: new Map([["L2", 1]]), fallback: new Map([["L1", 2]]) }).quantities], [["L1", 2], ["L2", 1]]);
  assert.match(resolveRoundQuantities({ rows, requested: new Map([["L1", 7]]) }).error, /เกินยอดคงเหลือ.*FG-L1 \(เหลือ 6\)/);
  assert.match(resolveRoundQuantities({ rows, requested: new Map([["L1", 0], ["L2", 0]]) }).error, /อย่างน้อยหนึ่งรายการ/);
  assert.match(resolveRoundQuantities({ rows, requested: new Map([["LX", 1]]) }).error, /ไม่ตรงกับใบสั่งขาย/);
  const full = exciseRoundRows({ templateLines: [template("L1", 4, 1)], otherQuotes: [round("Q1", ["L1", 4])] });
  assert.match(resolveRoundQuantities({ rows: full }).error, /ครบทุกรายการแล้ว/);
});

test("บรรทัดรอบนี้ = เต็มจำนวน × จำนวนที่เลือก · ศูนย์ตัดออก · ยอดตามสูตรบรรทัดกลาง · เรียงลำดับใหม่", () => {
  const lines = applyRoundQuantities([template("L1", 10, 8.85), template("L2", 5, 4.2)], new Map([["L1", 0], ["L2", 3]]));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].metadata.sourceSalesOrderLineId, "L2");
  assert.equal(lines[0].qty, 3);
  assert.equal(lines[0].lineTotal, 12.6);
  assert.equal(lines[0].sortOrder, 0);
  assert.equal(lines[0].discountType, null);
  assert.equal(applyRoundQuantities([template("L1", 10, 1)], null)[0].qty, 10, "ไม่ส่งจำนวน = เต็มบรรทัด");
});

test("แยกรอบแล้วรวมกันได้ภาษีเท่าออกรอบเดียว (ปัดที่ต่อชิ้นครั้งเดียว)", () => {
  const tpl = [template("L1", 7, 8.85)];
  const once = applyRoundQuantities(tpl, new Map([["L1", 7]]))[0].lineTotal;
  const split = [3, 4].map((qty) => applyRoundQuantities(tpl, new Map([["L1", qty]]))[0].lineTotal).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(split * 100) / 100, once);
});

test("คำขอจากจอ: ตัวเลข ≥ 0 เท่านั้น · ช่องกรอกว่าง = 0 · จำนวนของใบรายบรรทัด", () => {
  assert.deepEqual([...parseRoundQuantities({ L1: "3.5", L2: 0 }).value], [["L1", 3.5], ["L2", 0]]);
  assert.equal(parseRoundQuantities(undefined).value, null);
  for (const bad of [{ L1: -1 }, { L1: "x" }, { L1: "" }, [], "x", { "": 1 }]) assert.ok(parseRoundQuantities(bad).error, JSON.stringify(bad));
  const rows = [{ sourceSalesOrderLineId: "L1", remaining: 5 }, { sourceSalesOrderLineId: "L2", remaining: 2 }];
  assert.deepEqual([...roundQuantitiesFromInputs(rows, { L1: "", L2: "1" })], [["L1", 0], ["L2", 1]]);
  assert.deepEqual([...roundQuantitiesFromInputs(rows, {})], [["L1", 5], ["L2", 2]], "ยังไม่พิมพ์ = คงเหลือ");
  assert.deepEqual([...roundQuantitiesOf([{ qty: 2, metadata: { sourceSalesOrderLineId: "L1" } }, { qty: 1, metadata: { sourceSalesOrderLineId: "L1" } }, { qty: 9 }])], [["L1", 3]]);
  assert.equal(roundLinesLinked([{ metadata: { sourceSalesOrderLineId: "L1" } }]), true);
  assert.equal(roundLinesLinked([{ metadata: {} }]), false);
  assert.equal(roundLinesLinked([]), false);
});

test("0418: ถอดดัชนีรับได้ใบเดียว · ใบยื่นไม่เรียกเก็บยังหนึ่งใบต่อ SO · RPC รับใบนับจำนวนรายบรรทัด (แพ็ค × จำนวน) · ไม่เปิดให้ anon · คอลัมน์ปิดยอดค้าง", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/0418_excise_partial_rounds.sql", import.meta.url), "utf8");
  const body = sql.split("\nBEGIN;\n")[1];
  assert.match(body, /DROP INDEX IF EXISTS public\.quotations_one_accepted_excise_per_source_uidx;/);
  assert.match(body, /CREATE UNIQUE INDEX IF NOT EXISTS orders_sales_order_not_billed_uidx\s+ON public\.orders \("salesOrderId"\)\s+WHERE "salesOrderId" IS NOT NULL AND "exciseSalesOrderId" IS NULL;/);
  assert.ok(body.indexOf("orders_sales_order_not_billed_uidx") < body.indexOf("DROP INDEX IF EXISTS public.orders_sales_order_unique_idx"),
    "สร้างดัชนีใหม่ก่อนถอดตัวเดิม — ไม่มีช่วงที่ไม่มีด่านกันซ้ำ");
  assert.match(body, /RAISE EXCEPTION 'excise_quantity_exceeds_remaining: %', v_over;/);
  assert.match(body, /COALESCE\(sol\."packQty", 1\) \* sol\.qty/);
  assert.match(body, /SELECT \* INTO v_source FROM public\.sales_orders WHERE id = v_quote\."sourceSalesOrderId" FOR UPDATE;/);
  assert.match(body, /REVOKE ALL ON FUNCTION public\.accept_excise_quotation_atomic\(text, text, text, text\) FROM PUBLIC, anon, authenticated;/);
  for (const column of ["exciseRemainderClosedAt", "exciseRemainderClosedById", "exciseRemainderClosedByName", "exciseRemainderClosedReason"]) {
    assert.match(body, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`));
  }
});
