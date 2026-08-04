import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildLeadTransitionPayload, createLeadLifecycle, leadDealAction, LEAD_DEAL_STATUSES, LEAD_REASON_REQUIRED, LEAD_TRANSITION_ACTIONS } from "./leadLifecycle.js";
import { validateTransitionValues } from "../recordLifecycle.js";
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

/* "เปิดดีล" ถูกแยกออกจาก lifecycle แล้ว (มติผู้ใช้ 2026-08-04: เปิดได้ตั้งแต่ติดต่อ
   หรือรอถึงนัดประชุมก็ได้ จึงไม่ใช่ "ก้าวถัดไป" ของขั้นไหน) — ปุ่มที่ผู้ใช้เห็นจริง
   จึงเป็น transition ของ lifecycle **บวก** action เดี่ยวตัวนี้ ทุกเทสต์ที่ถามว่า
   "ผู้ใช้กดอะไรได้บ้าง" ต้องนับรวมสองแหล่ง ไม่ใช่ดู lifecycle อย่างเดียว */
const dealFor = (record, user, canCreateDeals = true) =>
  leadDealAction({ lead: record, user, canCreateDeals });
const affordancesFor = (record, user) => [
  ...idsFor(record, user),
  ...(dealFor(record, user).visible ? ["create_deal"] : []),
];

test("transition ที่ประกาศไว้ ต้องเป็น action ที่ API รู้จักทั้งหมด", () => {
  const apiActions = new Set(Object.values(LEAD_TRANSITIONS).flat());
  assert.deepEqual(ids.filter((id) => !apiActions.has(id)), [],
    "ประกาศ transition ที่ LEAD_TRANSITIONS ไม่มี — API จะตอบ 'ทำไม่ได้' ทันทีที่กด");
});

test("ทุก action ที่ API ยอมรับ ต้องมีปุ่มให้กด ไม่ตกหล่น", () => {
  const apiActions = [...new Set(Object.values(LEAD_TRANSITIONS).flat())];
  // create_deal มีปุ่มของตัวเอง (leadDealAction) ไม่ได้อยู่ใน lifecycle.transitions
  const uiIds = [...ids, "create_deal"];
  assert.deepEqual(apiActions.filter((action) => !uiIds.includes(action)), [],
    "API ยอมให้ทำ แต่ไม่มีปุ่มบน UI — ผู้ใช้จะทำขั้นนี้ไม่ได้เลย");
});

/* เส้นทางต้องมาจาก LEAD_TRANSITIONS ไม่ใช่พิมพ์ซ้ำ — เทียบทุกสถานะทุก action */
test("สถานะไหนทำอะไรได้ ตรงกับ LEAD_TRANSITIONS ทุกช่อง", () => {
  for (const [status, actions] of Object.entries(LEAD_TRANSITIONS)) {
    const fromHere = lifecycle.transitions
      .filter((transition) => transition.from === "*" || transition.from.includes(status))
      .map((transition) => transition.id);
    // ปุ่มเปิดดีลอยู่นอก lifecycle — ขอบเขตสถานะของมันมาจาก LEAD_TRANSITIONS ชุดเดียวกัน
    if (LEAD_DEAL_STATUSES.includes(status)) fromHere.push("create_deal");
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
  assert.equal(dealFor(contacted, AE_A).visible, true);
  assert.equal(dealFor(contacted, AE_A, false).visible, false, "ไม่มีสิทธิ์เปิดดีล ต้องไม่เห็นปุ่มนี้");
});

/* ⭐ มติผู้ใช้ 2026-08-04 — เปิดดีลได้ตั้งแต่ "ติดต่อแล้ว" หรือจะรอ "นัดประชุมแล้ว"
   ก็ได้ และลีดที่เปิดดีลไปแล้วยัง **เปิดใบเพิ่มได้อีก** (ลีด 1 ใบหลายดีล ซึ่ง
   POST /deals รองรับมาตลอด แต่ UI เคยปิดด้วย status !== 'qualified') */
test("เปิดดีลได้ทั้งจากติดต่อแล้ว นัดประชุมแล้ว และลีดที่เปิดดีลไปแล้ว", () => {
  for (const status of ["contacted", "meeting", "qualified"]) {
    const record = lead({ status, team: "A", assigneeId: "u-ae" });
    assert.equal(dealFor(record, AE_A).visible, true, `สถานะ ${status} ต้องเปิดดีลได้`);
  }
  assert.deepEqual([...LEAD_DEAL_STATUSES].sort(), ["contacted", "meeting", "qualified"]);
});

test("ขั้นที่ยังไม่ได้ติดต่อ ยังเปิดดีลไม่ได้", () => {
  for (const status of ["new", "screened", "assigned", "disqualified"]) {
    assert.equal(dealFor(lead({ status, team: "A", assigneeId: "u-ae" }), AE_A).visible, false, status);
  }
});

test("ป้ายปุ่มบอกได้ว่ากำลังเปิดใบแรกหรือใบเพิ่ม", () => {
  const first = dealFor(lead({ status: "contacted", team: "A", assigneeId: "u-ae" }), AE_A);
  const more = dealFor(lead({ status: "qualified", team: "A", assigneeId: "u-ae" }), AE_A);
  assert.match(first.label, /เปิดดีลจากลีดนี้/);
  assert.match(more.label, /เพิ่ม/);
});

/* ก้าวถัดไปของขั้น "ติดต่อแล้ว" ต้องเป็น **นัดประชุม** ไม่ใช่เปิดดีล — เดิมเปิดดีล
   ยึดช่อง primary ไว้ ทำให้คนที่จะนัดประชุมต้องไปหาในเมนู "…" ทุกครั้ง */
test("ก้าวถัดไปที่ขั้นติดต่อแล้ว คือนัดประชุม", () => {
  const contacted = lead({ status: "contacted", team: "A", assigneeId: "u-ae" });
  const primary = lifecycle.available(contacted, AE_A).filter((entry) => entry.slot === "primary");
  assert.deepEqual(primary.map((entry) => entry.id), ["meeting"]);
});

/* ปุ่มเปิดดีลต้องผ่านด่านทีมเดียวกับ transition อื่น — ไม่ใช่ใครก็กดได้ */
test("เปิดดีลได้เฉพาะทีมเจ้าของงาน", () => {
  const contacted = lead({ status: "contacted", team: "A", assigneeId: "u-ae" });
  assert.equal(dealFor(contacted, { role: "ae", id: "u-other", team: "A" }).visible, false,
    "AE ที่ไม่ใช่ผู้รับมอบ ต้องไม่เห็นปุ่มเปิดดีล");
  assert.equal(dealFor(contacted, { role: "senior_ae", id: "u-s", team: "B" }).visible, false,
    "Senior ทีมอื่น ต้องไม่เห็นปุ่มเปิดดีล");
  assert.equal(affordancesFor(contacted, SENIOR_A).includes("create_deal"), true);
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

/* 🐞 บั๊กจริงที่เทสต์ชุดแรกจับไม่ได้: lifecycle ประกาศ contact เป็น reason "optional"
   ทั้งที่ handler ตอบ badRequest ถ้าไม่มีเหตุผล → กดยืนยันโดยไม่พิมพ์ = 400
   เทสต์นี้ **อ่าน route.js จริง** หาว่า action ไหนมีด่าน `body.reason?.trim()`
   แล้วบังคับให้ฝั่ง UI ตรงกันทั้งสองทาง (ขาดก็ตก เกินก็ตก) */
test("action ที่ API บังคับเหตุผล ต้องตรงกับ reason ของ lifecycle เป๊ะ", () => {
  const apiSrc = readFileSync(
    path.join(process.cwd(), "src/app/api/sales-planning/leads/[id]/transition/route.js"),
    "utf8",
  );
  // ตัดไฟล์เป็นบล็อกต่อ action ตาม `if/else if (action === 'x')` แล้วดูว่าบล็อกไหนมีด่านเหตุผล
  const blocks = apiSrc.split(/(?:\}\s*else\s+)?if\s*\(action === '/).slice(1);
  const requiredByApi = blocks
    .map((block) => [block.slice(0, block.indexOf("'")), block])
    .filter(([, block]) => /!body\.reason\?\.trim\(\)/.test(block.split("} else if")[0]))
    .map(([action]) => action)
    .sort();

  assert.deepEqual([...LEAD_REASON_REQUIRED].sort(), requiredByApi,
    `API บังคับเหตุผลกับ [${requiredByApi}] แต่ LEAD_REASON_REQUIRED = [${LEAD_REASON_REQUIRED}]`);

  for (const transition of lifecycle.transitions) {
    if (!LEAD_TRANSITION_ACTIONS.includes(transition.id)) continue;
    const expected = requiredByApi.includes(transition.id) ? "required" : "none";
    assert.equal(transition.reason, expected,
      `${transition.id}: API ${expected === "required" ? "บังคับ" : "ไม่บังคับ"}เหตุผล แต่ lifecycle ว่า "${transition.reason}"`);
  }
});

/* ปุ่มยืนยันต้องกดไม่ได้ในกรณีที่ API จะปฏิเสธ — ไม่ใช่ปล่อยให้ยิงไปแล้วเด้ง error */
test("ยังไม่กรอกเหตุผล = validateTransitionValues ต้องทัก", () => {
  const contacted = lead({ status: "assigned", team: "A", assigneeId: "u-ae" });
  const contact = lifecycle.available(contacted, AE_A).find((entry) => entry.id === "contact");
  assert.ok(contact, "สถานะ assigned ควรมีปุ่มบันทึกการติดต่อ");
  assert.ok(validateTransitionValues(contact.transition, {}), "ไม่กรอกเหตุผลต้องได้ข้อความทัก");
  assert.equal(validateTransitionValues(contact.transition, { reason: "โทรแล้ว ลูกค้าขอใบเสนอราคา" }), null);
});

/* body ที่ส่งไป API ต้องมาจากที่เดียว — เคยประกอบเองคนละแบบใน 2 หน้า */
test("buildLeadTransitionPayload: ค่าว่างหายไปจาก body ไม่ใช่ส่ง null ไป", () => {
  const body = buildLeadTransitionPayload({ action: "screen", values: { team: "ODM" } });
  assert.equal(body.team, "ODM");
  assert.equal("assigneeId" in JSON.parse(JSON.stringify(body)), false,
    "ค่าว่างต้องหลุดจาก JSON ไม่ใช่ไปเป็น null ที่ handler");
});

test("buildLeadTransitionPayload: meetingMode ติดไปเฉพาะ action meeting", () => {
  const values = { meetingMode: "onsite" };
  assert.equal(buildLeadTransitionPayload({ action: "meeting", values }).meetingMode, "onsite");
  assert.equal(buildLeadTransitionPayload({ action: "contact", values }).meetingMode, undefined,
    "contact ไม่มีรูปแบบนัด — ส่งไปด้วยคือขยะที่ handler ไม่ได้ขอ");
});

test("buildLeadTransitionPayload: eventAt แปลงเป็น ISO · ค่าเสียกลายเป็น undefined ไม่ใช่ Invalid Date", () => {
  const good = buildLeadTransitionPayload({ action: "meeting", values: { eventAt: "2026-08-05T10:30" } });
  assert.match(good.eventAt, /^2026-08-05T\d{2}:30:00\.000Z$/);
  assert.equal(buildLeadTransitionPayload({ action: "meeting", values: { eventAt: "ไม่ใช่วันที่" } }).eventAt, undefined);
});

test("buildLeadTransitionPayload: เติมชื่อผู้รับผิดชอบจากรายชื่อ (API บังคับทั้ง id และชื่อ)", () => {
  const users = [{ id: "u1", firstName: "สมชาย", lastName: "ใจดี" }];
  const body = buildLeadTransitionPayload({ action: "assign", values: { assigneeId: "u1" }, users });
  assert.equal(body.assigneeId, "u1");
  assert.ok(body.assigneeName, "assign ที่ไม่มี assigneeName จะโดน badRequest");
});

/* 🐞 #870 เอาป้ายของ *การ์ด* ไปใส่แถวตาราง ("มอบหมายผู้รับผิดชอบ") → แถวตกบรรทัด
   บนของจริง · ป้ายแถวต้องสั้นพอที่จะอยู่ในช่องความกว้างคงที่ได้ */
test("ทุก transition ที่โผล่ในแถวตาราง ต้องมีป้ายสั้นพอ", () => {
  const ROW_LIMIT = 11; // ตัวอักษร — ช่อง 124px ที่ fs-label รับได้ประมาณนี้
  for (const transition of lifecycle.transitions) {
    if (transition.slot !== "primary") continue; // แถวโชว์แค่ช่อง primary
    const rowLabel = transition.rowLabel || transition.label;
    assert.ok(rowLabel.length <= ROW_LIMIT,
      `${transition.id}: ป้ายในแถวยาว ${rowLabel.length} ตัว ("${rowLabel}") — ใส่ rowLabel ที่สั้นกว่านี้`);
  }
});

test("rowLabel ไม่ระบุ = ใช้ label เดิม ไม่ใช่ว่าง", () => {
  const entry = lifecycle.available(lead({ status: "new" }), ADMIN).find((e) => e.id === "screen");
  assert.equal(entry.rowLabel, "คัดกรอง");
  const noRow = lifecycle.transitions.find((t) => !t.rowLabel);
  if (noRow) {
    const rendered = lifecycle.available(lead({ status: "contacted", team: "A", assigneeId: "u-ae" }), AE_A);
    for (const e of rendered) assert.ok(e.rowLabel, `${e.id} ต้องมี rowLabel เสมอ (fallback เป็น label)`);
  }
});

/* ── ปุ่มเปิดดีลในแถวตาราง มีช่องของตัวเอง ────────────────────────────────
   มติผู้ใช้ 2026-08-04: "เพิ่มช่องของตัวเอง แต่โชว์เฉพาะขั้นที่โชว์ได้"
   ⇒ RecordActionMenu ต้องมี slot แยก (`sideAction`) ที่กินที่เท่ากันทุกแถวเพื่อให้
   เมนู "…" ตรงแนวกัน แต่ตัวปุ่มโผล่เฉพาะแถวที่ `visible` */
test("แถวตาราง: ปุ่มเปิดดีลอยู่คนละช่องกับปุ่มก้าวถัดไป", () => {
  const menuSrc = readFileSync(path.join(process.cwd(), "src/components/ui/RecordActionMenu.js"), "utf8");
  assert.match(menuSrc, /sideAction = null/, "ต้องรับ prop sideAction");
  assert.match(menuSrc, /styles\.side\b/, "ต้องมีช่องของตัวเอง ไม่ใช่ยัดรวมช่องก้าวถัดไป");
  assert.match(menuSrc, /sideAction\.visible !== false/, "ปุ่มโผล่เฉพาะขั้นที่โชว์ได้");

  const css = readFileSync(path.join(process.cwd(), "src/components/ui/RecordActionMenu.module.css"), "utf8");
  // กว้างเท่ากันทุกแถว (ใช้ตัวแปรเดียวกับช่องก้าวถัดไป) — ยุบเมื่อว่างแล้วคอลัมน์จะเยื้อง
  assert.match(css, /\.side\s*\{[^}]*width:\s*var\(--record-step-w\)/, "ช่องต้องกว้างคงที่");

  const listSrc = readFileSync(path.join(process.cwd(), "src/app/sales-planning/leads/page.js"), "utf8");
  assert.match(listSrc, /sideAction=\{dealActionFor\(lead\)\}/, "หน้ารายการต้องส่งผ่านช่องนี้");
  assert.doesNotMatch(listSrc, /extraItems=\{\[dealItemFor/, "ต้องไม่กลับไปซ่อนในเมนู");
});

test("แถวตาราง: ป้ายปุ่มเปิดดีลใช้ rowLabel ที่สั้นพอสำหรับช่องแคบ", () => {
  for (const status of ["contacted", "meeting", "qualified"]) {
    const action = dealFor(lead({ status, team: "A", assigneeId: "u-ae" }), AE_A);
    assert.ok(action.rowLabel.length <= 14, `${status}: ป้าย "${action.rowLabel}" ยาวเกินช่อง`);
  }
});

/* หน้ารายละเอียด: ปุ่มต้อง **ไม่** อยู่บนการ์ดคุมสถานะแล้ว — ย้ายไปการ์ดของดีล */
test("หน้ารายละเอียด: ปุ่มเปิดดีลไม่อยู่บนการ์ดคุมสถานะ", () => {
  const src = readFileSync(path.join(process.cwd(), "src/app/sales-planning/leads/[id]/page.js"), "utf8");
  const actions = src.slice(src.indexOf("const recordActions = ["), src.indexOf("return <Workspace"));
  assert.doesNotMatch(actions, /leadDealAction/, "recordActions (การ์ดคุมสถานะ) ต้องไม่มีปุ่มเปิดดีล");
  assert.match(src, /title="ดีลจากลีดนี้"[\s\S]{0,400}actions=\{dealAction\.visible/, "ปุ่มต้องอยู่ในการ์ดดีล");
});
