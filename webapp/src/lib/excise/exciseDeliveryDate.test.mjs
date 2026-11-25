import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXCISE_DELIVERY_DATE_TEXT, applySubmitDeliveryDate, exciseSubmitDeliveryView, loadSourceDelivery, syncSourceDeliveryDate,
} from "./exciseDeliveryDate.js";

/* มติเจ้าของ 25/11/2026 — SO ค่าสรรพสามิต: "ตอนจะยื่นอนุมัติ ต้องบังคับใส่วันที่ส่งของ ซึ่งมันจะลิงก์ย้อนกลับทั้งหมด
   และวันที่ส่งของต้อง pop ให้เห็นก่อนยื่นอนุมัติ" (ด่าน + เขียนกลับตอนยื่นมีแล้วตั้งแต่ 03/11 V21–V22 · raFilingTable.test.mjs) */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("โมดัลยื่น: วันที่ส่งของ + ผลที่เกิดกับ SO ต้นทาง (เปลี่ยน · ตรงอยู่แล้ว · ต้นทางยังไม่มีวัน · อ่านไม่ขึ้น)", () => {
  const order = { deliveryDueDate: "2026-11-20", metadata: { sourceOrderNumber: "SO-26090178-0" } };
  assert.equal(exciseSubmitDeliveryView({ deliveryDueDate: null }), null, "ไม่มีวัน = ไม่มีก้อน (ผู้เรียกต้องไม่เปิดโมดัล)");

  const changed = exciseSubmitDeliveryView(order, { orderNumber: "SO-26090178-0", deliveryDueDate: "2026-11-16", error: null });
  assert.equal(changed.label, EXCISE_DELIVERY_DATE_TEXT.label);
  assert.equal(changed.date, "20/11/2026");
  assert.equal(changed.effect, "ยื่นแล้วกำหนดส่งสินค้าของ SO-26090178-0 เปลี่ยนจาก 16/11/2026 เป็น 20/11/2026");
  assert.match(changed.note, /ฝ่าย RA ใช้วันนี้แบ่งรายการยื่นชำระรายเดือน/);

  assert.match(
    exciseSubmitDeliveryView(order, { orderNumber: "SO-26090178-0", deliveryDueDate: "2026-11-20", error: null }).effect,
    /^ตรงกับกำหนดส่งสินค้าของ SO-26090178-0 อยู่แล้ว/,
  );
  assert.match(
    exciseSubmitDeliveryView(order, { orderNumber: "SO-26090178-0", deliveryDueDate: null, error: null }).effect,
    /ตอนนี้ใบนั้นยังไม่ตกลงวันส่ง/,
  );
  const broken = exciseSubmitDeliveryView(order, { orderNumber: null, deliveryDueDate: null, error: "timeout" });
  assert.match(broken.effect, /SO-26090178-0 \(อ่านกำหนดส่งปัจจุบันของใบนั้นไม่ขึ้น: timeout\)/, "อ่านไม่ขึ้น = บอกตรง ๆ ไม่เดาว่าว่าง · เลขใบถอยไปที่ metadata");
  assert.match(exciseSubmitDeliveryView(order).effect, /SO-26090178-0 \(ตอนนี้ใบนั้นยังไม่ตกลงวันส่ง\)/, "ไม่มีก้อนต้นทาง (หน้าเก่า) ยังเล่าได้");
  assert.match(exciseSubmitDeliveryView({ ...order, customer: { arCode: "AR-109" } }).note, /^สหมิตร: ตาราง RA โชว์และแบ่งเดือนด้วยวันที่เอกสาร PO/,
    "สหมิตรไม่ได้แบ่งเดือนด้วยวันนี้ (มติ 25/11) — โมดัลต้องไม่บอกผิด");
});

test("loadSourceDelivery: อ่านเลขที่ + กำหนดส่งของใบต้นทาง · พลาด/ไม่พบ = error ไม่ throw", async () => {
  const db = (result) => ({
    from(table) {
      assert.equal(table, "sales_orders");
      const b = { select: () => b, eq: () => b, maybeSingle: async () => result };
      return b;
    },
  });
  assert.equal(await loadSourceDelivery(db({}), null), null);
  assert.deepEqual(
    await loadSourceDelivery(db({ data: { id: "S", orderNumber: "SO-1", deliveryDueDate: "2026-11-16" }, error: null }), "S"),
    { orderNumber: "SO-1", deliveryDueDate: "2026-11-16", error: null },
  );
  assert.equal((await loadSourceDelivery(db({ data: null, error: { message: "boom" } }), "S")).error, "boom");
  assert.equal((await loadSourceDelivery(db({ data: null, error: null }), "S")).error, "ไม่พบใบสั่งขายต้นทาง");
});

/* ตัวจำลองที่รู้สองคำถาม: หา "รอบที่ออกทีหลังและยื่นแล้ว" (จบที่ .limit) กับอ่าน/เขียนใบต้นทาง (จบที่ .maybeSingle) */
function fakeDb({ rounds = [], roundError = null, source }) {
  const writes = [];
  const roundQueries = [];
  return {
    writes,
    roundQueries,
    from(table) {
      assert.equal(table, "sales_orders");
      const q = { eq: {}, neq: {}, in: {}, gt: {}, patch: null };
      const b = {
        select: () => b,
        eq: (c, v) => { q.eq[c] = v; return b; },
        neq: (c, v) => { q.neq[c] = v; return b; },
        in: (c, v) => { q.in[c] = v; return b; },
        gt: (c, v) => { q.gt[c] = v; return b; },
        update: (patch) => { q.patch = patch; return b; },
        limit: async () => {
          roundQueries.push(q);
          if (roundError) return { data: null, error: roundError };
          const hits = rounds.filter((r) => r.sourceSalesOrderId === q.eq.sourceSalesOrderId && r.origin === q.eq.origin
            && r.id !== q.neq.id && q.in.status.includes(r.status) && r.createdAt > q.gt.createdAt);
          return { data: hits.slice(0, 1).map((r) => ({ id: r.id })), error: null };
        },
        maybeSingle: async () => {
          if (q.eq.id !== source.id || (q.eq.status && source.status !== q.eq.status)) return { data: null, error: null };
          if (q.patch) { Object.assign(source, q.patch); writes.push(q.patch); }
          return { data: { ...source }, error: null };
        },
      };
      return b;
    },
  };
}

test("เขียนกลับ SO ต้นทาง: รอบล่าสุดเป็นตัวกำหนด — มีรอบหลังที่ยื่น/อนุมัติแล้ว = ไม่เขียนทับ (V22)", async () => {
  const older = { id: "X1", orderNumber: "SO-26110431-0", sourceSalesOrderId: "S", origin: "excise", createdAt: "2026-11-10T03:00:00Z", deliveryDueDate: "2026-11-12" };
  const newer = { id: "X2", sourceSalesOrderId: "S", origin: "excise", createdAt: "2026-11-15T03:00:00Z", status: "approved" };
  const db = fakeDb({ rounds: [older, newer], source: { id: "S", orderNumber: "SO-26090178-0", status: "approved", deliveryDueDate: "2026-11-16" } });
  const result = await syncSourceDeliveryDate(db, older, { audit: async () => assert.fail("รอบเก่าห้ามเขียนทับวันของรอบใหม่") });
  assert.deepEqual(result, { updated: false, skipped: "newer_round" });
  assert.equal(db.writes.length, 0);
  assert.deepEqual(db.roundQueries[0].in.status, ["pending_approval", "approved"], "นับเฉพาะรอบที่เขียนวันของตัวเองไปแล้ว");
  assert.equal(db.roundQueries[0].eq.origin, "excise");

  for (const status of ["draft", "rejected", "cancelled"]) {
    const loose = fakeDb({ rounds: [older, { ...newer, status }], source: { id: "S", orderNumber: "SO-26090178-0", status: "approved", deliveryDueDate: "2026-11-16" } });
    const audits = [];
    assert.deepEqual(await syncSourceDeliveryDate(loose, older, { audit: async (e) => audits.push(e) }), { updated: true }, `รอบหลังเป็น ${status} = รอบนี้ยังเป็นตัวล่าสุดที่ยื่น`);
    assert.match(audits[0].summary, /SO-26090178-0 ตามวันที่ส่งของของใบค่าสรรพสามิต SO-26110431-0: 2026-11-16 → 2026-11-12/);
  }

  const broken = fakeDb({ roundError: { message: "down" }, source: { id: "S", status: "approved", deliveryDueDate: null } });
  const failed = await syncSourceDeliveryDate(broken, older, { audit: async () => assert.fail() });
  assert.equal(failed.updated, false);
  assert.equal(failed.error.message, "down", "อ่านรอบอื่นไม่ขึ้น = ไม่เขียน (ไม่เดาว่าเป็นรอบล่าสุด)");
  assert.equal(broken.writes.length, 0);
});

test("ต่อสาย: โมดัลยื่นมีช่องวันที่ส่งของที่แก้ได้ · ยื่นพร้อมวันในช่อง · GET ส่งวันของต้นทาง · ดินสอหลังอนุมัติเขียนกลับต้นทาง", () => {
  const page = read("../../app/sales-planning/sales-orders/[id]/page.js");
  assert.match(page, /const exciseDelivery = isExciseOrder\(order\);\s*if \(exciseDelivery\) chooseSubmitDeliveryDate\(order\.deliveryDueDate \|\| ""\);/,
    "เปิดโมดัลตั้งต้นจากวันของใบ (ว่าง = ใส่ในโมดัล)");
  assert.match(page, /action: exciseDelivery \? submitWithDeliveryDate : \(\) => requestAction\("submit"\),/);
  assert.match(page, /async function submitWithDeliveryDate\(\) \{\s*const date = submitDeliveryDateRef\.current;\s*if \(!date\) \{\s*setError\(EXCISE_DELIVERY_DATE_TEXT\.required\);\s*return false;\s*\}\s*return requestAction\("submit", \{ deliveryDueDate: date \}\);/,
    "ช่องว่าง = ไม่ยิง โมดัลค้างพร้อมเหตุ · มีวัน = ส่งไปกับคำขอยื่น");
  assert.match(page, /confirmState\?\.exciseDelivery \? \(\s*<ExciseSubmitDeliveryDate\s*order=\{order\}\s*source=\{order\.sourceDelivery\}\s*value=\{submitDeliveryDate\}\s*onChange=\{chooseSubmitDeliveryDate\}/,
    "ช่องวาดจาก state ปัจจุบัน (ไม่ตรึงตอนเปิดโมดัล)");
  assert.doesNotMatch(page, /exciseDeliveryDateBlocker\(order\)/, "ไม่กันที่ปุ่มแล้ว — ใบไม่มีวันเปิดโมดัลให้ใส่");
  const box = read("../../components/excise/ExciseSubmitDeliveryDate.js");
  assert.match(box, /<DateInput\s*value=\{value \|\| ""\}\s*onChange=\{\(next\) => onChange\(next \|\| ""\)\}/);
  assert.match(box, /exciseSubmitDeliveryView\(\{ \.\.\.order, deliveryDueDate: value \}, source\)/, "ผลกับ SO ต้นทางคิดจากวันในช่อง");

  const route = read("../../app/api/sales-planning/sales-orders/[id]/route.js");
  assert.match(route, /const dated = await applySubmitDeliveryDate\(supabase, before, body, \{ user, request: req \}\);\s*if \(dated\.error\) return fail\(dated\.error, dated\.status\);\s*before = dated\.order;\s*const deliveryGate = exciseDeliveryDateBlocker\(before\);/,
    "บันทึกวันจากโมดัลก่อนด่านวัน/ทะเบียน แล้วยื่นด้วยแถวใหม่");
  assert.match(route, /const sourceDelivery = extras && isExciseOrder\(order\) && order\.sourceSalesOrderId\s*\? await loadSourceDelivery\(supabase, order\.sourceSalesOrderId\)/);
  assert.match(route, /\.\.\.\(sourceDelivery \? \{ sourceDelivery \} : \{\}\),/);
  const amend = route.slice(route.indexOf("if (action === 'set_delivery_due')"));
  assert.match(amend.slice(0, amend.indexOf("return ok(data);") + 20),
    /if \(isExciseOrder\(before\)\) \{\s*const synced = await syncSourceDeliveryDate\(supabase, data, \{ user, request: req \}\);/,
    "แก้วันบนใบค่าสรรพสามิตที่อนุมัติแล้ว = เขียนกลับต้นทางด้วยตัวเดียวกับตอนยื่น (ส่งแถวที่บันทึกแล้ว)");

  const field = read("../../components/salesPlanning/SalesOrderDeliveryDueField.js");
  assert.match(field, /\{label\}\{excise \? <> <span className="required-mark">\*<\/span><\/> : null\}/, "ดาวแดงเฉพาะใบค่าสรรพสามิต");
  assert.match(field, /excise \? EXCISE_DELIVERY_DATE_TEXT\.amendNote : AMEND_NOTE/);
  assert.match(field, /excise \? EXCISE_DELIVERY_DATE_TEXT\.readEmpty : "ยังไม่ตกลงวันส่ง"/);
});

test("ยื่นพร้อมวันจากโมดัล: บันทึกลงใบก่อน (ด่าน status + updatedAt เดิม) · วันเดิม/ไม่ส่ง = ไม่เขียน · ว่าง/ผิดรูป = 400 · ใบขยับ = 409", async () => {
  const order = { id: "SO-X", orderNumber: "SO-26110431-0", status: "draft", updatedAt: "2026-11-25T03:00:00.123456+00:00", deliveryDueDate: "2026-11-16" };
  const calls = [];
  const db = (row) => ({
    from(table) {
      assert.equal(table, "sales_orders");
      const q = { eq: {} };
      const b = {
        update: (patch) => { q.patch = patch; return b; },
        eq: (c, v) => { q.eq[c] = v; return b; },
        select: () => b,
        maybeSingle: async () => { calls.push(q); return { data: row ? { ...row, deliveryDueDate: q.patch.deliveryDueDate } : null, error: null }; },
      };
      return b;
    },
  });
  const noAudit = { audit: async () => assert.fail("ไม่ควรจด audit") };

  assert.deepEqual(await applySubmitDeliveryDate(db(null), order, {}, noAudit), { order }, "ไม่ส่งวันมา = ยื่นด้วยแถวเดิม");
  assert.deepEqual(await applySubmitDeliveryDate(db(null), order, { deliveryDueDate: "2026-11-16" }, noAudit), { order }, "วันเดิม = ไม่เขียน");
  assert.deepEqual(await applySubmitDeliveryDate(db(null), order, { deliveryDueDate: "" }, noAudit), { error: EXCISE_DELIVERY_DATE_TEXT.required, status: 400 });
  assert.equal((await applySubmitDeliveryDate(db(null), order, { deliveryDueDate: "2026-02-31" }, noAudit)).status, 400);
  assert.equal(calls.length, 0);

  const audits = [];
  const moved = await applySubmitDeliveryDate(db({ id: "SO-X", updatedAt: "2026-11-25T04:00:00.5+00:00" }), order, { deliveryDueDate: "2026-11-20" },
    { user: { id: "U" }, audit: async (entry) => audits.push(entry) });
  assert.deepEqual(moved.order, { ...order, deliveryDueDate: "2026-11-20", updatedAt: "2026-11-25T04:00:00.5+00:00" }, "แถวที่ยื่นต่อพก updatedAt ใหม่ (RPC ยื่นเทียบตัวนี้)");
  assert.deepEqual(calls[0].eq, { id: "SO-X", status: "draft", updatedAt: "2026-11-25T03:00:00.123456+00:00" }, "เขียนเฉพาะแถวที่ยังเป็นร่างรุ่นเดิม");
  assert.match(audits[0].summary, /SO-26110431-0 \(แก้ในโมดัลยื่นอนุมัติ\): 2026-11-16 → 2026-11-20/);

  const raced = await applySubmitDeliveryDate(db(null), order, { deliveryDueDate: "2026-11-20" }, noAudit);
  assert.equal(raced.status, 409, "ใบถูกแก้/ยื่นจากอีกหน้าต่างระหว่างทาง");
});
