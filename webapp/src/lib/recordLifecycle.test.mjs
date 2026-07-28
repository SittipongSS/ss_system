import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKWARD_KINDS,
  defineLifecycle,
  normalizeSlots,
  validateTransitionValues,
} from "./recordLifecycle.js";
import { toneColor } from "./ui/tone.js";

/* lifecycle ตัวอย่างที่ใช้ทั้งไฟล์ — โครงเดียวกับที่หน้าลีด/ดีล/โครงการจะประกาศจริง */
const lifecycle = defineLifecycle({
  entity: "demo",
  noun: "รายการ",
  statuses: {
    draft: { label: "ร่าง", tone: "neutral" },
    pending: { label: "รออนุมัติ", tone: "warning", description: "รอผู้อนุมัติตรวจ" },
    active: { label: "ดำเนินการ", tone: "info" },
    done: { label: "เสร็จสิ้น", tone: "success" },
    cancelled: { label: "ยกเลิก", tone: "danger" },
  },
  cancelledStatuses: ["cancelled"],
  steps: [
    { id: "draft", label: "ร่าง", statuses: ["draft"] },
    { id: "approve", label: "อนุมัติ", statuses: ["pending"] },
    { id: "run", label: "ดำเนินการ", statuses: ["active"] },
    { id: "close", label: "ปิดงาน", statuses: ["done"] },
  ],
  transitions: [
    { id: "submit", label: "ยื่นอนุมัติ", kind: "submit", slot: "primary", from: "draft", to: "pending" },
    {
      id: "approve",
      label: "อนุมัติ",
      kind: "approve",
      slot: "primary",
      from: "pending",
      to: "active",
      visible: (record, user) => user?.role === "boss",
    },
    {
      id: "reject",
      label: "ตีกลับ",
      kind: "reject",
      from: "pending",
      to: "draft",
      reason: "required",
      visible: (record, user) => user?.role === "boss",
    },
    {
      id: "withdraw",
      label: "ถอนคำขอ",
      kind: "withdraw",
      slot: "secondary",
      from: "pending",
      to: "draft",
      confirm: { title: "ถอนคำขอ", message: "คำขอจะถูกถอนออกจากคิว" },
    },
    {
      id: "close",
      label: "ปิดงาน",
      kind: "submit",
      slot: "primary",
      from: "active",
      to: "done",
      allow: (record) => (record.openTasks > 0 ? `ยังมีงานค้าง ${record.openTasks} รายการ` : true),
    },
    {
      id: "drop",
      label: "ยกเลิก",
      kind: "drop",
      from: ["draft", "pending", "active"],
      to: "cancelled",
      reason: "required",
      fields: [
        { name: "lossReason", type: "select", label: "สาเหตุ", required: true, options: [{ value: "price", label: "ราคา" }] },
        { name: "closedAt", type: "datetime", label: "เวลาที่ยกเลิก" },
      ],
    },
    { id: "edit", label: "แก้ไข", kind: "edit", slot: "secondary" },
  ],
});

test("available คืนเฉพาะ transition ที่อยู่ในเส้นทางจากสถานะปัจจุบัน", () => {
  const ids = lifecycle.available({ status: "draft" }, { role: "boss" }).map((entry) => entry.id);
  // submit/drop/edit ออกจาก draft ได้ · approve/reject/close/withdraw ต้องไม่โผล่
  assert.deepEqual(ids.sort(), ["drop", "edit", "submit"]);
});

test("from ที่ไม่ระบุ = ทำได้ทุกสถานะ", () => {
  for (const status of ["draft", "pending", "active", "done", "cancelled"]) {
    const ids = lifecycle.available({ status }, { role: "boss" }).map((entry) => entry.id);
    assert.ok(ids.includes("edit"), `edit ต้องโผล่ที่สถานะ ${status}`);
  }
});

test("visible=false ซ่อนปุ่มทั้งอัน — ไม่ใช่ทำให้กดไม่ได้", () => {
  const ids = lifecycle.available({ status: "pending" }, { role: "staff" }).map((entry) => entry.id);
  assert.ok(!ids.includes("approve"), "คนไม่มีสิทธิ์ต้องไม่เห็นปุ่มอนุมัติเลย");
  assert.ok(!ids.includes("reject"), "คนไม่มีสิทธิ์ต้องไม่เห็นปุ่มตีกลับเลย");
  assert.ok(ids.includes("withdraw"), "ปุ่มที่ไม่จำกัดสิทธิ์ต้องยังอยู่");
});

test("allow คืนสตริง = เห็นปุ่มแต่กดไม่ได้ พร้อมบอกเหตุ (ห้ามสลับกับ visible)", () => {
  const blocked = lifecycle.available({ status: "active", openTasks: 3 }, { role: "boss" })
    .find((entry) => entry.id === "close");
  assert.ok(blocked, "ปุ่มต้องยังโชว์อยู่ ไม่ใช่หายไป");
  assert.equal(blocked.disabled, true);
  assert.equal(blocked.disabledReason, "ยังมีงานค้าง 3 รายการ");

  const ready = lifecycle.available({ status: "active", openTasks: 0 }, { role: "boss" })
    .find((entry) => entry.id === "close");
  assert.equal(ready.disabled, false);
  assert.equal(ready.disabledReason, undefined);
});

test("allow คืน false = กดไม่ได้ พร้อมข้อความสำรอง", () => {
  const local = defineLifecycle({
    entity: "demo2",
    noun: "รายการ",
    statuses: { draft: { label: "ร่าง" } },
    transitions: [{ id: "go", label: "ไป", kind: "submit", from: "draft", allow: () => false }],
  });
  const entry = local.available({ status: "draft" }, {})[0];
  assert.equal(entry.disabled, true);
  assert.equal(entry.disabledReason, "ยังทำรายการนี้ไม่ได้");
});

test("railSteps คืนเฉพาะ done|current|pending|cancelled", () => {
  const allowed = new Set(["done", "current", "pending", "cancelled"]);
  for (const status of ["draft", "pending", "active", "done", "cancelled"]) {
    for (const step of lifecycle.railSteps({ status })) {
      assert.ok(allowed.has(step.state), `state ไม่ถูกต้อง: ${step.state} (สถานะ ${status})`);
    }
  }
});

test("railSteps เดินหน้าตามสถานะ และสถานะยกเลิกทำให้ทั้งเส้นเป็น cancelled", () => {
  assert.deepEqual(lifecycle.railSteps({ status: "draft" }).map((s) => s.state),
    ["current", "pending", "pending", "pending"]);
  assert.deepEqual(lifecycle.railSteps({ status: "active" }).map((s) => s.state),
    ["done", "done", "current", "pending"]);
  assert.deepEqual(lifecycle.railSteps({ status: "cancelled" }).map((s) => s.state),
    ["cancelled", "cancelled", "cancelled", "cancelled"]);
});

test("railSteps ไม่ปล่อย statuses ของ step ทะลุออกไปเป็น prop ของ DOM", () => {
  for (const step of lifecycle.railSteps({ status: "draft" })) {
    assert.equal(step.statuses, undefined);
  }
});

test("statusMeta คืน tone และสีที่ตรงกัน ที่เดียว", () => {
  const meta = lifecycle.statusMeta({ status: "pending" });
  assert.equal(meta.label, "รออนุมัติ");
  assert.equal(meta.tone, "warning");
  assert.equal(meta.color, toneColor("warning"));
  assert.equal(meta.description, "รอผู้อนุมัติตรวจ");
});

test("statusMeta ของสถานะที่ไม่ได้ประกาศไม่พัง", () => {
  const meta = lifecycle.statusMeta({ status: "ของแปลก" });
  assert.equal(meta.label, "ของแปลก");
  assert.equal(meta.tone, "neutral");
});

test("primary ไม่เกิน 1 หลัง normalize — ตัวถัดไปตกเป็น secondary", () => {
  const normalized = normalizeSlots([
    { id: "a", slot: "primary" },
    { id: "b", slot: "primary" },
    { id: "c", slot: "danger" },
  ]);
  assert.deepEqual(normalized.map((entry) => entry.slot), ["primary", "secondary", "danger"]);
});

test("available ไม่คืน primary เกิน 1 ตัวในทุกสถานะและทุก role", () => {
  for (const status of ["draft", "pending", "active", "done", "cancelled"]) {
    for (const role of ["boss", "staff"]) {
      const primaries = lifecycle.available({ status, openTasks: 0 }, { role })
        .filter((entry) => entry.slot === "primary");
      assert.ok(primaries.length <= 1, `${status}/${role} มี primary ${primaries.length} ตัว`);
    }
  }
});

test("ทุก transition ที่ถอยหลัง/ยกเลิก/ปฏิเสธ ต้องบังคับกรอกเหตุผล", () => {
  for (const transition of lifecycle.transitions) {
    if (!BACKWARD_KINDS.includes(transition.kind)) continue;
    assert.equal(transition.reason, "required", `${transition.id} (kind=${transition.kind}) ต้อง reason:'required'`);
  }
});

test("ประกาศ transition ถอยหลังโดยไม่บังคับเหตุผล = ตกตอนประกาศ ไม่ใช่ตอนผู้ใช้กด", () => {
  for (const kind of BACKWARD_KINDS) {
    assert.throws(
      () => defineLifecycle({
        entity: "bad",
        noun: "รายการ",
        transitions: [{ id: "x", label: "x", kind, from: "draft" }],
      }),
      /reason:'required'/,
      `kind=${kind} ต้องถูกบล็อก`,
    );
  }
});

test("withdraw เป็นข้อยกเว้นโดยเจตนา — ดึงคำขอของตัวเองกลับ ใช้กล่องยืนยันพอ", () => {
  assert.ok(!BACKWARD_KINDS.includes("withdraw"));
  const withdraw = lifecycle.get("withdraw");
  assert.equal(withdraw.reason, "none");
  assert.ok(withdraw.confirm, "ต้องมีกล่องยืนยันแทน");
});

test("transition ถอยหลังตกไปช่อง danger เองถ้าไม่ระบุ slot", () => {
  assert.equal(lifecycle.get("reject").slot, "danger");
  assert.equal(lifecycle.get("drop").slot, "danger");
  assert.equal(lifecycle.get("edit").slot, "secondary");
});

test("defineLifecycle ฟ้องของที่ประกาศไม่ครบ", () => {
  assert.throws(() => defineLifecycle({ noun: "x" }), /ต้องระบุ entity/);
  assert.throws(() => defineLifecycle({ entity: "x" }), /ต้องระบุ noun/);
  assert.throws(
    () => defineLifecycle({ entity: "x", noun: "x", transitions: [{ label: "a", kind: "edit" }] }),
    /ต้องมี id/,
  );
  assert.throws(
    () => defineLifecycle({ entity: "x", noun: "x", transitions: [{ id: "a", kind: "edit" }] }),
    /ต้องมี label/,
  );
  assert.throws(
    () => defineLifecycle({ entity: "x", noun: "x", transitions: [{ id: "a", label: "a" }] }),
    /ต้องมี kind/,
  );
  assert.throws(
    () => defineLifecycle({
      entity: "x",
      noun: "x",
      transitions: [{ id: "a", label: "a", kind: "edit" }, { id: "a", label: "b", kind: "edit" }],
    }),
    /id ซ้ำ/,
  );
  assert.throws(
    () => defineLifecycle({ entity: "x", noun: "x", transitions: [{ id: "a", label: "a", kind: "edit", slot: "ขวาสุด" }] }),
    /slot ไม่ถูกต้อง/,
  );
  assert.throws(
    () => defineLifecycle({ entity: "x", noun: "x", transitions: [{ id: "a", label: "a", kind: "edit", reason: "maybe" }] }),
    /reason ต้องเป็น/,
  );
  assert.throws(
    () => defineLifecycle({
      entity: "x",
      noun: "x",
      transitions: [{ id: "a", label: "a", kind: "edit", fields: [{ name: "n", type: "รูปภาพ" }] }],
    }),
    /type ไม่รองรับ/,
  );
  assert.throws(
    () => defineLifecycle({
      entity: "x",
      noun: "x",
      transitions: [{ id: "a", label: "a", kind: "edit", fields: [{ label: "ไม่มีชื่อ" }] }],
    }),
    /field ต้องมี name/,
  );
});

test("validateTransitionValues บังคับเหตุผลตามความยาวขั้นต่ำ", () => {
  const reject = lifecycle.get("reject");
  assert.match(validateTransitionValues(reject, { reason: "สั้น" }), /อย่างน้อย 10/);
  assert.equal(validateTransitionValues(reject, { reason: "เหตุผลที่ยาวพอสำหรับทดสอบ" }), null);
  assert.match(validateTransitionValues(reject, { reason: "ก".repeat(501) }), /ยาวเกิน 500/);
});

test("validateTransitionValues บังคับ field ที่ required และปล่อยที่ไม่ required", () => {
  const drop = lifecycle.get("drop");
  const reason = "ลูกค้าแจ้งยกเลิกทั้งโครงการ";
  assert.match(validateTransitionValues(drop, { reason }), /กรุณากรอกสาเหตุ/);
  assert.equal(validateTransitionValues(drop, { reason, lossReason: "price" }), null);
  // closedAt ไม่ required — เว้นว่างได้
  assert.equal(validateTransitionValues(drop, { reason, lossReason: "price", closedAt: "" }), null);
});

test("validateTransitionValues ผ่านเมื่อ transition ไม่ขอเหตุผล", () => {
  assert.equal(validateTransitionValues(lifecycle.get("withdraw"), {}), null);
  assert.equal(validateTransitionValues(lifecycle.get("edit"), {}), null);
});
