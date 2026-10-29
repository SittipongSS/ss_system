import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REGISTRATION_LINK_EDITABLE_STATUSES,
  REGISTRATION_LINK_LOCKED_MESSAGE,
  REGISTRATION_TRANSITIONS,
  registrationTransitionError,
} from "./workflow.js";

/* 🔴 ตรวจระบบ 2026-10-26 ข้อ 5 — PATCH ทะเบียนเขียน `status` ตาม body ให้ทุกคนที่ถือ ra:approve ⇒ อนุมัติร่างที่ยังไม่ยื่นได้
   (ข้ามด่านเอกสารบังคับ) · ยื่นแทนฝ่ายขายโดยไม่ผ่านด่าน · ตั้งค่าที่ไม่ใช่สถานะ · เลขอนุมัติบังคับแค่ในโมดัล
   ข้อ 6 — ฝ่ายขายเปลี่ยน FG ระหว่าง RA ตรวจได้ (สถานะไม่ถอย · ฉลากของ FG ตัวเดิมยังติดใบ) */
const SA = { sales: true, ra: false };
const RA = { sales: false, ra: true };
const ADMIN = { sales: true, ra: true };
const ALL = ["draft", "pending_legal", "rejected"];
const ok = (args) => registrationTransitionError(args) === null;
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("ทางเดินปกติ: ยื่น → อนุมัติ (มีเลข) · ยื่น → ตีกลับ (มีเหตุผล) → ยื่นใหม่", () => {
  assert.ok(ok({ from: "draft", to: "pending_legal", caps: SA }));
  assert.ok(ok({ from: "pending_legal", to: "approved", caps: RA, fields: { approvalNumber: "สส-1/2569" } }));
  assert.ok(ok({ from: "pending_legal", to: "rejected", caps: RA, fields: { rejectionReason: "ฉลากไม่ตรง" } }));
  assert.ok(ok({ from: "rejected", to: "pending_legal", caps: SA }));
});

test("ข้ามขั้นไม่ได้ — ร่าง/ตีกลับ อนุมัติหรือตีกลับตรงไม่ได้ แม้เป็นแอดมิน (400)", () => {
  const allowed = new Set(["draft>pending_legal", "rejected>pending_legal", "pending_legal>approved", "pending_legal>rejected"]);
  const fields = { approvalNumber: "x", rejectionReason: "x" };
  for (const from of ALL) {
    for (const to of Object.keys(REGISTRATION_TRANSITIONS)) {
      if (from === to) continue;
      const result = registrationTransitionError({ from, to, caps: ADMIN, fields });
      if (allowed.has(`${from}>${to}`)) assert.equal(result, null, `${from}>${to} ต้องผ่าน`);
      else assert.equal(result?.status, 400, `${from}>${to} ต้องไม่ผ่าน`);
    }
  }
});

test("ค่าที่ไม่อยู่ในตาราง (รวมร่าง ซึ่งเข้าได้ทางปลดอนุมัติเท่านั้น) ตอบ 400", () => {
  for (const to of ["draft", "approve", "", "complete"]) {
    assert.equal(registrationTransitionError({ from: "pending_legal", to, caps: ADMIN })?.status, 400, to);
  }
});

test("ใครทำ: RA ยื่นแทนฝ่ายขายไม่ได้ (ข้ามด่านเอกสาร) · ฝ่ายขายอนุมัติ/ตีกลับไม่ได้ (403)", () => {
  assert.equal(registrationTransitionError({ from: "draft", to: "pending_legal", caps: RA })?.status, 403);
  assert.equal(registrationTransitionError({ from: "pending_legal", to: "approved", caps: SA, fields: { approvalNumber: "x" } })?.status, 403);
  assert.equal(registrationTransitionError({ from: "pending_legal", to: "rejected", caps: SA, fields: { rejectionReason: "x" } })?.status, 403);
});

test("เลขอนุมัติ/เหตุผลตีกลับบังคับที่ server — ว่างหรือช่องว่างล้วนไม่ผ่าน", () => {
  for (const approvalNumber of [undefined, null, "", "   "]) {
    const result = registrationTransitionError({ from: "pending_legal", to: "approved", caps: RA, fields: { approvalNumber } });
    assert.deepEqual(result, { status: 400, error: "กรุณาระบุเลขที่อนุมัติ" });
  }
  for (const rejectionReason of [undefined, "", "  "]) {
    const result = registrationTransitionError({ from: "pending_legal", to: "rejected", caps: RA, fields: { rejectionReason } });
    assert.deepEqual(result, { status: 400, error: "กรุณาระบุเหตุผลที่ตีกลับ" });
  }
});

test("FG/ลูกค้าแก้ได้เฉพาะร่างกับตีกลับ — รอ RA ตรวจล็อก", () => {
  assert.deepEqual(REGISTRATION_LINK_EDITABLE_STATUSES, ["draft", "rejected"]);
  assert.ok(!REGISTRATION_LINK_EDITABLE_STATUSES.includes("pending_legal"));
  assert.match(REGISTRATION_LINK_LOCKED_MESSAGE, /ตีกลับก่อน/);
});

test("route ตัดสินด้วยตารางกลางก่อนแตะแถว · ล็อก FG ระหว่างรอตรวจ · ไม่มีเช็กเหตุผลตีกลับซ้ำชุดเก่า", () => {
  const route = codeOnly(read("../../app/api/excise-registrations/[id]/route.js"));
  const gate = route.indexOf("registrationTransitionError(");
  const lock = route.indexOf("REGISTRATION_LINK_EDITABLE_STATUSES.includes(reg.status)");
  const write = route.indexOf("for (const k of allowed) if (body[k] !== undefined) updated[k] = body[k];");
  assert.ok(gate > 0 && lock > 0 && write > 0, "ต้องมีครบทั้งด่านสถานะ ด่านล็อก FG และจุดเขียนช่อง");
  assert.ok(gate < write && lock < write, "ด่านต้องอยู่ก่อนเขียนช่องจาก body");
  assert.match(route, /ra: allowed\.has\('status'\)/, "ฝั่ง RA ต้องเป็นคนเดียวกับที่เขียนช่อง status ได้");
  assert.match(route, /return Response\.json\(\{ error: REGISTRATION_LINK_LOCKED_MESSAGE \}, \{ status: 409 \}\)/);
  assert.doesNotMatch(route, /'กรุณาระบุเหตุผลที่ตีกลับ'/, "ช่องบังคับมาจากตาราง ห้ามมีชุดที่สอง");
});

test("หน้าทะเบียน: ปุ่มแก้ไขยังโชว์ตอนรอตรวจ แต่บอกเหตุด้วยข้อความชุดเดียวกับ server", () => {
  const page = codeOnly(read("../../app/tax/registrations/[id]/page.js"));
  assert.match(page, /const editAvailable = canEdit && !!s && REGISTRATION_LINK_EDITABLE_STATUSES\.includes\(s\.status\);/);
  assert.match(page, /if \(linkLocked\) \{ notifyToast\.error\(REGISTRATION_LINK_LOCKED_MESSAGE\); return; \}/);
  assert.match(page, /canEdit && s\.status !== "approved" && <ActionButton kind="edit"/, "ปุ่มต้องไม่หายตอนรอตรวจ (กติกา GatedAction)");
});
