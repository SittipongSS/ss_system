import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canDeleteProject, createProjectLifecycle, PROJECT_CLOSE_ACTIONS,
  PROJECT_PATCH_TRANSITIONS, PROJECT_WORK_STATUSES, projectStateOf,
} from "./projectLifecycle.js";
import { canProjectCloseTransition, PROJECT_CLOSE_STATUSES } from "./projectClose.js";

/* กติกาฝั่ง UI ของโครงการต้องไม่หลวมกว่าด่านจริงที่ API — อ่านซอร์ส handler มาเทียบ
   ไม่เขียนกติกาซ้ำในเทสต์ (ท่าเดียวกับ lead/deal lifecycle) */

const read = (...p) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const CLOSE_ROUTE = read("src", "app", "api", "pm", "projects", "[id]", "close", "route.js");
const PROJECT_ROUTE = read("src", "app", "api", "pm", "projects", "[id]", "route.js");
const MIGRATION = read("supabase", "migrations", "0008_pm_projects.sql");

const lifecycle = createProjectLifecycle();
const SUPER = { role: "ae_supervisor", name: "หัวหน้า" };
const AE = { role: "ae", name: "สมชาย" };
const project = (over = {}) => ({
  id: "P1", status: "In Progress", closeStatus: "open", canEdit: true, canDelete: false,
  canApproveClose: false, aeOwner: "สมชาย", me: { id: "u-ae", name: "สมชาย" }, ...over,
});
const ids = (record, user) => lifecycle.available(record, user).map((e) => e.id);

test("รายชื่อสถานะงานตรงกับ CHECK constraint ของตารางจริง", () => {
  const check = MIGRATION.match(/check \("status" in \(([^)]+)\)\)/)?.[1] || "";
  const fromDb = [...check.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(fromDb.length >= 5, `แกะจาก migration ไม่เจอ (${fromDb}) — regex น่าจะพัง`);
  assert.deepEqual([...PROJECT_WORK_STATUSES].sort(), fromDb.sort(),
    "สถานะที่ประกาศฝั่ง JS ไม่ตรงกับที่ DB ยอมรับ");
});

/* ⭐ หัวใจของไฟล์นี้: ยุบสองแกนเป็นสถานะเดียวที่ผู้ใช้ต้องเห็น */
test("การปิดชนะสถานะงานเสมอ — โครงการที่ยื่นขอปิดต้องอ่านว่า รออนุมัติปิด", () => {
  assert.equal(projectStateOf({ status: "In Progress", closeStatus: "pending_close" }), "pending_close");
  assert.equal(projectStateOf({ status: "On Hold", closeStatus: "closed" }), "closed");
  assert.equal(projectStateOf({ status: "On Hold", closeStatus: "open" }), "On Hold");
  assert.equal(projectStateOf({ status: "In Progress" }), "In Progress", "ไม่มี closeStatus = เปิดอยู่");
  assert.equal(projectStateOf({}), "New");
});

test("ทุกสถานะรวมมีป้ายไทยและคำอธิบายครบ", () => {
  const cases = [
    ...PROJECT_WORK_STATUSES.map((s) => ({ status: s, closeStatus: "open" })),
    { status: "In Progress", closeStatus: "pending_close" },
    { status: "In Progress", closeStatus: "closed" },
  ];
  for (const record of cases) {
    const meta = lifecycle.statusMeta(record);
    const state = projectStateOf(record);
    assert.ok(meta.label && meta.label !== state, `${state} ไม่มีป้ายไทย`);
    assert.ok(meta.description, `${state} ไม่มีคำอธิบาย`);
  }
});

/* 🔴 closed = ล็อกเขียนทั้งใบ (409) ไม่ใช่แค่ป้าย */
test("ปิดแล้ว = ทำได้อย่างเดียวคือเปิดใหม่", () => {
  assert.match(PROJECT_ROUTE, /projectWriteBlockedError/, "PATCH ต้องบล็อกเมื่อปิดแล้ว");
  const closed = project({ closeStatus: "closed", canApproveClose: true });
  assert.deepEqual(ids(closed, SUPER), ["reopen"]);
  assert.deepEqual(ids(project({ closeStatus: "closed" }), AE), [],
    "คนที่อนุมัติไม่ได้ ไม่ควรเห็นปุ่มอะไรเลยตอนปิดแล้ว");
});

test("รออนุมัติปิด: ผู้ยื่นถอนได้ แต่อนุมัติ/ตีกลับเองไม่ได้", () => {
  const pending = project({ closeStatus: "pending_close", closeRequestedBy: "u-ae" });
  assert.deepEqual(ids(pending, AE), ["withdraw_close"]);

  const selfFiled = project({
    closeStatus: "pending_close", closeRequestedBy: "u-me",
    canApproveClose: true, me: { id: "u-me", name: "หัวหน้า" },
  });
  assert.deepEqual(ids(selfFiled, SUPER), ["withdraw_close"]);
  assert.match(CLOSE_ROUTE, /closeRequestedBy === user\.id/, "API ต้องกันคนยื่นอนุมัติเอง");

  const other = project({
    closeStatus: "pending_close", closeRequestedBy: "u-ae",
    canApproveClose: true, me: { id: "u-sup", name: "หัวหน้า" },
  });
  assert.deepEqual(ids(other, SUPER).sort(), ["approve_close", "reject_close", "withdraw_close"]);
});

test("เส้นทางการปิดตรงกับ canProjectCloseTransition ตัวจริงทุกช่อง", () => {
  for (const from of PROJECT_CLOSE_STATUSES) {
    for (const [id, action] of Object.entries(PROJECT_CLOSE_ACTIONS)) {
      const RA = canProjectCloseTransition(from, action, { approver: true });
      const declared = lifecycle.get(id).from;
      const here = declared === "*"
        || declared.includes(from)
        || (from === "open" && declared.some((s) => PROJECT_WORK_STATUSES.includes(s)));
      assert.equal(here, RA,
        `${id} จาก ${from}: lifecycle ว่า ${here} แต่กติกากลางว่า ${RA}`);
    }
  }
});

/* มติผู้ใช้ ข้อ 3 vs กติกาที่ API บังคับจริง */
test("action ที่ API บังคับเหตุผล ต้องบังคับที่ lifecycle ด้วย", () => {
  const blocks = CLOSE_ROUTE.split(/action === '/).slice(1);
  const requiredByApi = blocks
    .map((b) => [b.slice(0, b.indexOf("'")), b.split("action === '")[0]])
    // handler ทำ `const reason = String(body.reason||'').trim()` แล้ว `if (!reason) return badRequest`
    .filter((pair) => /if \(!reason\) return badRequest/.test(pair[1]))
    .map((pair) => pair[0]);
  assert.ok(
    ["request", "reject", "reopen"].every((a) => requiredByApi.includes(a)),
    `แกะจาก handler ได้ [${requiredByApi}] — น่าจะพัง regex`,
  );
  const byAction = {};
  for (const [id, action] of Object.entries(PROJECT_CLOSE_ACTIONS)) byAction[action] = id;
  for (const action of requiredByApi) {
    assert.equal(lifecycle.get(byAction[action]).reason, "required",
      `API บังคับเหตุผลของ ${action} แต่ lifecycle ไม่บังคับ`);
  }
  assert.equal(lifecycle.get("withdraw_close").reason, "none",
    "ถอนคำขอของตัวเองไม่ต้องมีเหตุผล (มติ 2026-07-28)");
  assert.equal(lifecycle.get("approve_close").reason, "none");
});

test("ยกเลิกโครงการบังคับเหตุผล — เข้มกว่า API โดยตั้งใจ", () => {
  const drop = lifecycle.get("drop");
  assert.equal(drop.reason, "required");
  assert.equal(drop.slot, "danger");
});

/* ⚠️ สิทธิ์ดึงกลับจากระงับ ≠ ดึงกลับจากยกเลิก — มติเดิมห้ามยุบเป็นกติกาเดียว */
test("ดึงกลับจากระงับ กับ จากยกเลิก เป็นคนละ transition คนละสิทธิ์", () => {
  const held = project({ status: "On Hold" });
  assert.ok(ids(held, AE).includes("restore_from_hold"), "เจ้าของงานดึงกลับจากระงับได้");
  assert.ok(!ids(held, { role: "ae", name: "คนอื่น" }).includes("restore_from_hold"),
    "AE ที่ไม่ใช่เจ้าของ ดึงกลับจากระงับไม่ได้");

  const dropped = project({ status: "Dropped" });
  assert.ok(!ids(dropped, AE).includes("restore_from_dropped"), "AE ธรรมดา กู้คืนไม่ได้");
  assert.ok(ids(dropped, { role: "senior_ae", name: "หัวหน้าทีม" }).includes("restore_from_dropped"));
  assert.ok(ids(dropped, SUPER).includes("restore_from_dropped"));
});

test("กู้คืนจากยกเลิกไม่บังคับเหตุผล — คง kind resume ไม่ใช่ revert", () => {
  const t = lifecycle.get("restore_from_dropped");
  assert.equal(t.kind, "resume", "revert อยู่ใน BACKWARD_KINDS จะบังคับเหตุผล = เปลี่ยนพฤติกรรมเดิม");
  assert.equal(t.reason, "none");
});

/* 🐞 หน้าโครงการเช็ค salesplan:edit ทั้งที่ API ตรวจ pm:edit */
test("ทุก action ที่แก้โครงการต้องมี pm:edit ตามที่ API บังคับ", () => {
  assert.match(PROJECT_ROUTE, /inPmProjectScope/, "API ต้องตรวจ scope ของ PM");
  assert.deepEqual(ids(project(), { role: "marketing", name: "การตลาด" }), [],
    "role ที่ไม่มี pm:edit ต้องไม่เห็นปุ่มแก้อะไรเลย");
  assert.ok(ids(project(), AE).length > 0);
});

test("ไม่มีสิทธิ์แก้โครงการใบนี้ (canEdit=false) = ไม่มีปุ่มงานประจำวัน", () => {
  assert.deepEqual(ids(project({ canEdit: false }), AE), []);
});

/* 🐞 หน้ารายละเอียดเคยโชว์ปุ่มลบตาม canEdit → AE ที่ลบไม่ได้กดแล้วเจอ 403 */
test("ลบโครงการต้องอ่าน canDelete ที่ API ส่งมา ห้ามคำนวณเอง", () => {
  assert.equal(canDeleteProject(project({ canDelete: true })), true);
  assert.equal(canDeleteProject(project({ canEdit: true, canDelete: false })), false);
  assert.equal(canDeleteProject(undefined), false);
});

test("แยกชัดว่า transition ไหนยิง PATCH ไหนยิง /close", () => {
  const all = lifecycle.transitions.map((t) => t.id).sort();
  const covered = [...PROJECT_PATCH_TRANSITIONS, ...Object.keys(PROJECT_CLOSE_ACTIONS)].sort();
  assert.deepEqual(all, covered, "มี transition ที่ไม่รู้ว่าจะยิงไปไหน");
});

test("การ์ดมีปุ่มหลักได้ไม่เกินหนึ่งในทุกสถานะ", () => {
  const cases = [
    project(), project({ status: "On Hold" }), project({ status: "Dropped" }),
    project({ closeStatus: "pending_close", canApproveClose: true, me: { id: "u-sup" }, closeRequestedBy: "u-ae" }),
    project({ closeStatus: "closed", canApproveClose: true }),
  ];
  for (const record of cases) {
    for (const user of [AE, SUPER, { role: "senior_ae", name: "หัวหน้าทีม" }]) {
      const primary = lifecycle.available(record, user).filter((e) => e.slot === "primary");
      assert.ok(primary.length <= 1, `${projectStateOf(record)} / ${user.role} มีปุ่มหลัก ${primary.length} ปุ่ม`);
    }
  }
});

/* ⭐ ลำดับการประกาศ transition ตัดสินว่าใครได้ช่องหลัก (normalizeSlots เก็บ primary ตัวแรก)
   โครงการที่ระงับอยู่ สิ่งที่คนอยากทำคือ "ดำเนินต่อ" ไม่ใช่ "ขอปิด" */
test("ปุ่มหลักของแต่ละสถานะต้องเป็นสิ่งที่คนอยากทำจริง", () => {
  const primaryOf = (record, user) =>
    lifecycle.available(record, user).find((e) => e.slot === "primary")?.id || null;
  assert.equal(primaryOf(project(), AE), "request_close", "กำลังทำ → ขอปิด");
  assert.equal(primaryOf(project({ status: "On Hold" }), AE), "restore_from_hold",
    "ระงับอยู่ → ดำเนินต่อ ไม่ใช่ขอปิด");
  assert.equal(primaryOf(project({ status: "Dropped" }), SUPER), "restore_from_dropped");
  assert.equal(
    primaryOf(project({ closeStatus: "pending_close", closeRequestedBy: "u-ae", canApproveClose: true, me: { id: "u-sup" } }), SUPER),
    "approve_close", "รออนุมัติ → อนุมัติปิด");
  assert.equal(primaryOf(project({ closeStatus: "closed", canApproveClose: true }), SUPER), "reopen");
});

test("ระงับอยู่ยังขอปิดได้ แค่ไม่ใช่ปุ่มหลัก", () => {
  const held = lifecycle.available(project({ status: "On Hold" }), AE);
  const close = held.find((e) => e.id === "request_close");
  assert.ok(close, "ขอปิดต้องยังอยู่ในเมนู");
  assert.equal(close.slot, "secondary", "แต่ถูกลดชั้นลงเพราะมีปุ่มหลักอื่นแล้ว");
});
