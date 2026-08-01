import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createLeadLifecycle, LEAD_TRANSITION_ACTIONS } from "./leadLifecycle.js";
import { LEAD_TRANSITIONS, TRANSITION_TO_STATUS } from "./leads.js";

/* เทสต์นี้กันสิ่งที่พังเงียบที่สุดของงานนี้: **ฝั่ง UI กับด่านจริงที่ API หลุดจากกัน**
   ปุ่มโผล่แต่ API ปฏิเสธ = ผู้ใช้กดแล้วเด้ง error · ปุ่มไม่โผล่ทั้งที่ API ยอม = ทำงานไม่ได้
   จึงอ่าน LEAD_TRANSITIONS ตัวจริงมาเทียบ ไม่เขียนเส้นทางซ้ำในเทสต์ */

const lifecycle = createLeadLifecycle({ canCreateDeals: true });
const ids = lifecycle.transitions.map((transition) => transition.id);

const lead = (over = {}) => ({ id: "L1", status: "new", team: null, assigneeId: null, ...over });
const ADMIN = { role: "admin", id: "u-admin" };
const SUPERVISOR = { role: "ae_supervisor", id: "u-sup" };
const SENIOR_A = { role: "senior_ae", id: "u-senior", team: "A" };
const AE_A = { role: "ae", id: "u-ae", team: "A" };
const idsFor = (record, user) => lifecycle.available(record, user).map((entry) => entry.id);

test("transition ที่ประกาศไว้ ต้องเป็น action ที่ API รู้จักทั้งหมด", () => {
  const apiActions = new Set(Object.values(LEAD_TRANSITIONS).flat());
  assert.deepEqual(ids.filter((id) => !apiActions.has(id)), [],
    "ประกาศ transition ที่ LEAD_TRANSITIONS ไม่มี — API จะตอบ 'ทำไม่ได้' ทันทีที่กด");
});

test("ทุก action ที่ API ยอมรับ ต้องมีปุ่มให้กด ไม่ตกหล่น", () => {
  const apiActions = [...new Set(Object.values(LEAD_TRANSITIONS).flat())];
  assert.deepEqual(apiActions.filter((action) => !ids.includes(action)), [],
    "API ยอมให้ทำ แต่ไม่มีปุ่มบน UI — ผู้ใช้จะทำขั้นนี้ไม่ได้เลย");
});

/* เส้นทางต้องมาจาก LEAD_TRANSITIONS ไม่ใช่พิมพ์ซ้ำ — เทียบทุกสถานะทุก action */
test("สถานะไหนทำอะไรได้ ตรงกับ LEAD_TRANSITIONS ทุกช่อง", () => {
  for (const [status, actions] of Object.entries(LEAD_TRANSITIONS)) {
    const fromHere = lifecycle.transitions
      .filter((transition) => transition.from === "*" || transition.from.includes(status))
      .map((transition) => transition.id);
    assert.deepEqual([...fromHere].sort(), [...actions].sort(),
      `สถานะ ${status}: UI ให้ ${fromHere.join(",") || "-"} แต่ API ให้ ${actions.join(",") || "-"}`);
  }
});

test("ปลายทางของแต่ละ transition ตรงกับ TRANSITION_TO_STATUS", () => {
  for (const transition of lifecycle.transitions) {
    const expected = TRANSITION_TO_STATUS[transition.id];
    if (!expected) continue;
    assert.equal(transition.to, expected,
      `${transition.id} ประกาศปลายทาง ${transition.to} แต่ API เขียน ${expected}`);
  }
});

/* ── กติกา role — ของจริงที่ผู้ใช้จะเห็น ────────────────────────────── */

test("คัดกรองเห็นเฉพาะผู้ดูแล ไม่ใช่ทีมขาย", () => {
  assert.ok(idsFor(lead(), SUPERVISOR).includes("screen"));
  assert.ok(idsFor(lead(), ADMIN).includes("screen"));
  assert.ok(!idsFor(lead(), SENIOR_A).includes("screen"), "senior ไม่ควรเห็นปุ่มคัดกรอง");
  assert.ok(!idsFor(lead(), AE_A).includes("screen"));
});

test("มอบหมายเห็นเฉพาะหัวหน้าทีมของทีมนั้น", () => {
  const screened = lead({ status: "screened", team: "A" });
  assert.ok(idsFor(screened, SENIOR_A).includes("assign"));
  assert.ok(idsFor(screened, ADMIN).includes("assign"));
  assert.ok(!idsFor(screened, { ...SENIOR_A, team: "B" }).includes("assign"),
    "หัวหน้าทีมอื่นไม่ควรมอบหมายลีดของทีม A");
});

/* มติผู้ใช้ 2026-07-21 — supervisor จบงานที่คัดกรอง ไม่ลงไปทำขั้นทำงานแทนทีม */
test("ขั้นทำงาน (ติดต่อ/นัด) เป็นของทีมเจ้าของงาน supervisor ไม่เห็น", () => {
  const assigned = lead({ status: "assigned", team: "A", assigneeId: "u-ae" });
  assert.ok(idsFor(assigned, AE_A).includes("contact"), "ผู้รับมอบต้องบันทึกการติดต่อได้");
  assert.ok(idsFor(assigned, SENIOR_A).includes("contact"), "หัวหน้าทีมเดียวกันทำได้");
  assert.ok(!idsFor(assigned, SUPERVISOR).includes("contact"),
    "supervisor ไม่ควรลงมาทำขั้นทำงานแทนทีม (มติ 2026-07-21)");
});

test("ปุ่มกำกับดูแล (ตีกลับ/ไม่ไปต่อ) supervisor เห็น แต่คนนอกทีมไม่เห็น", () => {
  const assigned = lead({ status: "assigned", team: "A", assigneeId: "u-ae" });
  for (const id of ["bounce", "disqualify"]) {
    assert.ok(idsFor(assigned, SUPERVISOR).includes(id), `supervisor ควรเห็น ${id}`);
    assert.ok(idsFor(assigned, SENIOR_A).includes(id), `หัวหน้าทีมเจ้าของงานควรเห็น ${id}`);
    assert.ok(!idsFor(assigned, { role: "senior_ae", id: "x", team: "B" }).includes(id),
      `ทีมอื่นไม่ควรเห็น ${id}`);
  }
});

test("ลีดที่ปิดแล้วไม่เหลือปุ่มอะไรเลย", () => {
  assert.deepEqual(idsFor(lead({ status: "disqualified" }), ADMIN), []);
});

/* ── กติกาของชั้นกลาง ─────────────────────────────────────────────── */

test("ตีกลับและไม่ไปต่อ บังคับกรอกเหตุผล", () => {
  for (const id of ["bounce", "disqualify"]) {
    assert.equal(lifecycle.get(id).reason, "required", `${id} ต้องบังคับเหตุผล (มติผู้ใช้ ข้อ 3)`);
    assert.equal(lifecycle.get(id).slot, "danger", `${id} ต้องอยู่ช่องอันตราย`);
  }
});

test("การ์ดมีปุ่มหลักได้ไม่เกินหนึ่ง", () => {
  for (const status of Object.keys(LEAD_TRANSITIONS)) {
    for (const user of [ADMIN, SUPERVISOR, SENIOR_A, AE_A]) {
      const primaries = lifecycle
        .available(lead({ status, team: "A", assigneeId: "u-ae" }), user)
        .filter((entry) => entry.slot === "primary");
      assert.ok(primaries.length <= 1, `${status}/${user.role} มีปุ่มหลัก ${primaries.length} ปุ่ม`);
    }
  }
});

test("แถบเส้นทางของลีดที่ปิดแล้วเป็นสถานะยกเลิก", () => {
  assert.ok(lifecycle.isCancelled(lead({ status: "disqualified" })));
  assert.ok(!lifecycle.isCancelled(lead({ status: "qualified" })));
});

test("เปิดดีลต้องมีสิทธิ์สร้างดีลด้วย ไม่ใช่แค่สิทธิ์ลีด", () => {
  const contacted = lead({ status: "contacted", team: "A", assigneeId: "u-ae" });
  const withoutDeals = createLeadLifecycle({ canCreateDeals: false });
  assert.ok(lifecycle.available(contacted, AE_A).some((entry) => entry.id === "create_deal"));
  assert.ok(!withoutDeals.available(contacted, AE_A).some((entry) => entry.id === "create_deal"),
    "ไม่มีสิทธิ์เปิดดีล ต้องไม่เห็นปุ่มนี้");
});

/* create_deal สร้าง entity คนละตัว หน้าเรียกดักเอง — ต้องไม่หลุดไปยิง /transition */
test("รายการที่ส่งไป API มีเฉพาะ transition ที่เป็นการย้ายสถานะจริง", () => {
  assert.ok(!LEAD_TRANSITION_ACTIONS.includes("create_deal"),
    "create_deal ต้องไม่อยู่ในลิสต์ที่ยิง /transition — หน้าพาไปฟอร์มดีลแทน");
  for (const action of LEAD_TRANSITION_ACTIONS) {
    assert.ok(ids.includes(action), `${action} อยู่ในลิสต์ยิง API แต่ไม่มีใน lifecycle`);
  }
});

/* ฝั่ง UI ห้ามหลวมกว่า API — จับกรณีที่มีคนถอดด่านออกจากฝั่ง UI ทั้งดุ้น */
test("กติกา role ฝั่ง UI ยังอ้างตัวช่วยชุดเดียวกับ API", () => {
  const apiSrc = readFileSync(
    path.join(process.cwd(), "src/app/api/sales-planning/leads/[id]/transition/route.js"),
    "utf8",
  );
  const uiSrc = readFileSync(path.join(process.cwd(), "src/lib/sales/leadLifecycle.js"), "utf8");
  for (const helper of ["canWorkLead", "isSuperuser"]) {
    assert.match(apiSrc, new RegExp(helper), `API ควรใช้ ${helper}`);
    assert.match(uiSrc, new RegExp(helper), `lifecycle ต้องใช้ ${helper} ให้ตรงกับ API`);
  }
});
