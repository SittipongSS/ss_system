import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BACKLOG_READINESS, EXCISE_SYSTEM_LAUNCH_DATE, backlogReadiness, isBeforeExciseLaunch, sortBacklog } from "./exciseBacklog.js";
import { GRANTABLE_CAPS, sanitizeExtraCaps } from "../permissions.js";

/* ── PR6c (แผนรื้อสรรพสามิต หมวด 12.9 · มติ D6 · Q22) — ใบค้างก่อนเปิดระบบ + ra:approve ไม่แจกรายคน ── */

test("ก่อนเปิดระบบ = อนุมัติก่อนวันเปิด ตามวันไทย · ไม่มีวันอนุมัติ = ไม่ติดป้าย", () => {
  assert.equal(EXCISE_SYSTEM_LAUNCH_DATE, "2026-11-03");
  assert.equal(isBeforeExciseLaunch({ approvedAt: "2026-10-01T03:00:00Z" }), true);
  assert.equal(isBeforeExciseLaunch({ approvedAt: "2026-11-02T23:30:00Z" }), false, "06:30 น. ไทยของวันเปิด = ไม่ใช่ใบค้าง");
  assert.equal(isBeforeExciseLaunch({ approvedAt: "2026-11-02T16:59:00Z" }), true, "23:59 น. ไทยของวันก่อนเปิด");
  assert.equal(isBeforeExciseLaunch({ approvedAt: null }), false);
});

test("ความพร้อม: ขาดราคาหนักกว่าขาดทะเบียน · เรียง ครบ → ขาดทะเบียน → ขาดราคา แล้วเก่าสุดก่อน", () => {
  assert.equal(backlogReadiness([{ needsRegistration: true }, { taxBaseMissing: true }]), "missing_price");
  assert.equal(backlogReadiness([{ needsRegistration: true }]), "missing_registration");
  assert.equal(backlogReadiness([{}]), "ready");
  const sorted = sortBacklog([
    { id: "P", readiness: "missing_price", approvedAt: "2026-07-01" },
    { id: "R2", readiness: "ready", approvedAt: "2026-09-01" },
    { id: "G", readiness: "missing_registration", approvedAt: "2026-08-01" },
    { id: "R1", readiness: "ready", approvedAt: "2026-08-01" },
  ]);
  assert.deepEqual(sorted.map((o) => o.id), ["R1", "R2", "G", "P"]);
  assert.ok(BACKLOG_READINESS.missing_price.label.includes("ราคาขายปลีก"));
});

test("คิว SA: ตัวโหลดติดป้าย + เรียงด้วยตัวเดียวกัน · แถวคิวบอกป้ายและความพร้อม", () => {
  const loader = readFileSync(new URL("../sales/handoffQueueData.js", import.meta.url), "utf8");
  assert.match(loader, /beforeLaunch: isBeforeExciseLaunch\(order\),\s*readiness: backlogReadiness\(resolved\.lines\),/);
  assert.match(loader, /return sortBacklog\(rows\)\.slice\(0, LIST_CAP\);/);
  const queue = readFileSync(new URL("../salesPlanning/myQueue.js", import.meta.url), "utf8");
  assert.match(queue, /order\.beforeLaunch \? 'ก่อนเปิดระบบ' : null,/);
  assert.match(queue, /BACKLOG_READINESS\[order\.readiness\]\?\.label/);
});

test("Q22: ra:approve แจกรายคนไม่ได้แล้ว — ค่าเก่าที่ค้างในบัญชีถูกทิ้งเอง", () => {
  assert.equal(GRANTABLE_CAPS.includes("ra:approve"), false);
  assert.deepEqual(sanitizeExtraCaps(["ra:view", "ra:approve", "products:margin"]), ["ra:view", "products:margin"]);
});
