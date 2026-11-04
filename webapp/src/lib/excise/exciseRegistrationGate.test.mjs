import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exciseRegistrationBlocker, loadExciseRegistrationBlocker } from "./exciseRegistrationGate.js";

/* ด่านทะเบียนของ SO ค่าสรรพสามิต (มติเจ้าของ 04/11 · V32) — ยื่นอนุมัติ/อนุมัติได้เมื่อทุก FG มีทะเบียนที่ RA อนุมัติแล้ว */

const chargeLine = (id, sourceLineId, fg, qty = 10) => ({
  id, qty, unitPrice: 97.87, description: `ค่าภาษี ${fg}`,
  metadata: { lineKind: "excise_charge", sourceSalesOrderLineId: sourceLineId, sourceFgCode: fg, excisePerUnit: 88.97, localPerUnit: 8.9 },
});

test("ครบทุก FG = ผ่าน · ขาด = บอกจำนวน + FG + ติดที่ใคร (ยังไม่มี · ร่าง · รอ RA · ตีกลับ)", () => {
  assert.equal(exciseRegistrationBlocker([{ fgCode: "FG-1", needsRegistration: false }]), null);
  assert.equal(exciseRegistrationBlocker([]), null);
  const text = exciseRegistrationBlocker([
    { fgCode: "FG-1", needsRegistration: false },
    { fgCode: "FG-2", needsRegistration: true, registrationState: "none" },
    { fgCode: "FG-3", needsRegistration: true, registrationState: "pending" },
    { fgCode: "FG-4", needsRegistration: true, registrationState: "draft" },
  ]);
  assert.match(text, /^ทะเบียนสรรพสามิตยังไม่อนุมัติ 3 รายการ — ใบค่าสรรพสามิตยื่นอนุมัติได้เมื่อทุก FG มีทะเบียนที่ฝ่าย RA อนุมัติแล้ว/);
  assert.match(text, /FG-2 \(ยังไม่ได้ขึ้นทะเบียนสรรพสามิต\)/);
  assert.match(text, /FG-3 \(ยื่นขึ้นทะเบียนแล้ว รอนิติกรรมตรวจ\)/);
  assert.match(text, /FG-4 \(มีร่างทะเบียนค้างอยู่/);
  assert.doesNotMatch(text, /FG-1/);
});

function fakeDb(order) {
  return {
    from(table) {
      assert.equal(table, "sales_orders");
      const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: order, error: null }) };
      return b;
    },
  };
}

test("ตัวโหลด: บรรทัดค่าสรรพสามิต → บรรทัด SO ลูกค้า → ทะเบียนที่อนุมัติ (ตัวคิดเดียวกับด่านเริ่มยื่นของ RA)", async () => {
  const source = { id: "S1", customerId: "C1", lines: [{ id: "L1" }, { id: "L2" }] };
  const exciseOrder = { id: "SX1", sourceSalesOrderId: "S1", lines: [chargeLine("X1", "L1", "FG-1"), chargeLine("X2", "L2", "FG-2"), { id: "N", metadata: { lineKind: "note" } }] };
  const resolve = async (_db, order) => {
    assert.equal(order.id, "S1", "คิดจาก SO ต้นทาง");
    return { lines: [
      { salesOrderLineId: "L1", registrationId: "R1", registrationState: "approved", fgCode: "FG-1" },
      { salesOrderLineId: "L2", registrationId: null, registrationState: "pending", fgCode: "FG-2" },
    ] };
  };
  const text = await loadExciseRegistrationBlocker(fakeDb(source), exciseOrder, { resolve });
  assert.match(text, /ยังไม่อนุมัติ 1 รายการ/);
  assert.match(text, /FG-2 \(ยื่นขึ้นทะเบียนแล้ว รอนิติกรรมตรวจ\)/);
  const ok = await loadExciseRegistrationBlocker(fakeDb(source), { ...exciseOrder, lines: [exciseOrder.lines[0]] }, { resolve });
  assert.equal(ok, null, "รอบนี้มีแต่ FG ที่มีทะเบียน = ผ่าน (แบ่งรอบ: ตรวจเฉพาะบรรทัดของใบนี้)");
  await assert.rejects(() => loadExciseRegistrationBlocker(fakeDb(null), exciseOrder, { resolve }), /ไม่พบใบสั่งขายต้นทาง/, "หาไม่เจอ = throw ไม่ใช่ผ่าน");
  await assert.rejects(() => loadExciseRegistrationBlocker(fakeDb(source), { lines: [] }, { resolve }), /ไม่มีใบสั่งขายต้นทาง/);
});

test("route: ยื่นอนุมัติ (400) และอนุมัติ (409) ของ SO ค่าสรรพสามิตผ่านด่านทะเบียน · อ่านไม่ขึ้น = 500", () => {
  const src = readFileSync(new URL("../../app/api/sales-planning/sales-orders/[id]/route.js", import.meta.url), "utf8");
  const calls = src.match(/registrationGate = await loadExciseRegistrationBlocker\(supabase, before\)/g) || [];
  assert.equal(calls.length, 2, "สองจุด: submit + approve");
  assert.match(src, /if \(deliveryGate\) return badRequest\(deliveryGate\);[\s\S]{0,600}loadExciseRegistrationBlocker/, "submit: ต่อจากด่านวันที่ส่งของ");
  assert.match(src, /if \(registrationGate\) return Response\.json\(\{ error: registrationGate, code: 'excise_registration_missing' \}, \{ status: 400 \}\);/);
  assert.match(src, /if \(registrationGate\) return Response\.json\(\{ error: registrationGate, code: 'excise_registration_missing' \}, \{ status: 409 \}\);/);
  assert.match(src, /catch \(gateError\) \{ return fail\(`ตรวจทะเบียนสรรพสามิตไม่สำเร็จ: \$\{gateError\.message\}`, 500\); \}/);
});
