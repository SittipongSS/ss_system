import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { canDeleteDeal, canQuoteDeal, createDealLifecycle, DEAL_PATCH_TRANSITIONS } from "./dealLifecycle.js";
import { CLOSED_STAGES, DEAL_STAGES, isWonStage } from "../salesPlanning.js";

/* กติกาฝั่ง UI ของดีลต้องไม่หลวมกว่าด่านจริงที่ API — เทสต์ชุดนี้อ่านซอร์ส handler
   มาเทียบ ไม่เขียนกติกาซ้ำในเทสต์ (ท่าเดียวกับ leadLifecycle.test.mjs) */

const read = (...p) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const DEAL_ROUTE = read("src", "app", "api", "sales-planning", "deals", "[id]", "route.js");
const LINK_ROUTE = read("src", "app", "api", "sales-planning", "deals", "[id]", "link-project", "route.js");

const lifecycle = createDealLifecycle();
const ADMIN = { role: "admin", id: "u-admin" };
const AE = { role: "ae", id: "u-ae", team: "A" };
const deal = (over = {}) => ({ id: "D1", stage: "qualified", canEdit: true, projectId: null, metadata: {}, ...over });
const ids = (record, user) => lifecycle.available(record, user).map((e) => e.id);

test("ไม่มี transition ชื่อ win — ปิด Won ผ่านใบเสนอราคาเท่านั้น", () => {
  const all = lifecycle.transitions.map((t) => t.id);
  for (const banned of ["win", "won", "accept", "unwin", "unaccept"]) {
    assert.ok(!all.includes(banned), `ห้ามมี transition "${banned}" — Won เกิดที่ accept_quotation_atomic`);
  }
  assert.match(read("src", "app", "api", "sales-planning", "deals", "[id]", "win", "route.js"),
    /ปิด Won ผ่านใบเสนอราคาเท่านั้น/, "endpoint win ยังต้องถูกปิดตายอยู่");
  assert.match(DEAL_ROUTE, /ปิด Won ผ่านใบเสนอราคาเท่านั้น/,
    "PATCH ต้องยังปฏิเสธ stage:'won' ที่ส่งมาตรง ๆ");
});

test("ดีลที่ปิดแล้ว (won/in_project/lost) ทำอะไรไม่ได้เลย", () => {
  for (const stage of CLOSED_STAGES) {
    assert.deepEqual(ids(deal({ stage }), ADMIN), [],
      `stage ${stage} ไม่ควรมีปุ่มย้ายสถานะ`);
  }
});

test("มีโครงการแล้ว = ไม่ต้องผูก/สร้างอีก", () => {
  const linked = deal({ projectId: "P1" });
  assert.ok(!ids(linked, ADMIN).includes("link_project"));
  assert.ok(!ids(linked, ADMIN).includes("create_project"));
  assert.ok(ids(linked, ADMIN).includes("lost"), "ยังปิดดีลได้");
});

test("ยังไม่มีโครงการ = ก้าวถัดไปคือเชื่อมโครงการ (primary ตัวเดียว)", () => {
  const entries = lifecycle.available(deal(), ADMIN);
  const primary = entries.filter((e) => e.slot === "primary");
  assert.equal(primary.length, 1);
  assert.equal(primary[0].id, "link_project");
  assert.equal(primary[0].rowLabel, "เชื่อมโครงการ");
});

/* 🐞 UI เคยไม่เช็ค pm:edit ทั้งที่ API บังคับ — วันนี้ไม่ระเบิดเพราะสิทธิ์ทับกันพอดี */
test("ผูก/สร้างโครงการต้องมี pm:edit ตามที่ API บังคับ", () => {
  assert.match(LINK_ROUTE, /pm:edit/, "API link-project ต้องเช็ค pm:edit");
  assert.ok(!ids(deal(), { role: "marketing" }).includes("link_project"),
    "role ที่ไม่มี pm:edit ต้องไม่เห็นปุ่มผูกโครงการ");
  assert.ok(ids(deal(), AE).includes("link_project"));
});

test("ไม่มีสิทธิ์แก้ดีล = ไม่มีปุ่มอะไรเลย", () => {
  assert.deepEqual(ids(deal({ canEdit: false }), ADMIN), []);
});

/* มติผู้ใช้ ข้อ 3 — ถอย/ยกเลิก/ปฏิเสธ ต้องบังคับเหตุผล */
test("ไม่ไปต่อ บังคับกรอกเหตุผล (เข้มกว่า API โดยตั้งใจ)", () => {
  const lost = lifecycle.get("lost");
  assert.equal(lost.reason, "required");
  assert.equal(lost.kind, "drop");
  assert.equal(lost.slot, "danger", "kind ที่ถอยหลังต้องตกไปช่อง danger เอง");
  // API ยอมรับ null ได้ — ยืนยันว่าเรารู้ตัวว่ากำลังเข้มกว่า ไม่ใช่เข้าใจผิด
  assert.match(DEAL_ROUTE, /lostReason/, "handler ต้องยังรับ lostReason อยู่");
});

test("รายการที่ยิง PATCH ตรง ๆ มีแค่ lost — ที่เหลือมีฟอร์มของตัวเอง", () => {
  assert.deepEqual(DEAL_PATCH_TRANSITIONS, ["lost"]);
  for (const id of DEAL_PATCH_TRANSITIONS) {
    assert.ok(lifecycle.get(id), `${id} อยู่ในลิสต์ยิง API แต่ไม่มีใน lifecycle`);
  }
});

/* 🐞 หน้ารายการเคยลืมเช็ค "มีใบเสนอราคาที่รับแล้ว" → กดลบแล้วเจอ 409 ที่เดาไม่ได้ */
test("ลบดีล: ใบเสนอราคาที่รับแล้วบล็อกทุกคน แม้ superuser", () => {
  assert.match(DEAL_ROUTE, /accepted/, "handler ต้องเช็คใบเสนอราคาที่รับแล้ว");
  const withQuote = deal({ acceptedQuotationId: "Q1" });
  assert.equal(canDeleteDeal(withQuote, { role: "ae_supervisor", superuser: true }), false);
  assert.equal(canDeleteDeal(deal({ metadata: { acceptedQuotationId: "Q1" } }), { role: "ae", superuser: false }), false);
  assert.equal(canDeleteDeal(withQuote, { role: "admin" }), true, "admin ยัง force ได้");
});

test("ลบดีล: Won ต้องเป็น superuser · มี PO สหมิตรห้ามลบ", () => {
  const won = deal({ stage: "won" });
  assert.ok(isWonStage(won.stage));
  assert.equal(canDeleteDeal(won, { role: "ae", superuser: false }), false);
  assert.equal(canDeleteDeal(won, { role: "ae_supervisor", superuser: true }), true);
  assert.equal(canDeleteDeal(deal({ metadata: { sahamitPoId: "PO1" } }), { role: "ae", superuser: false }), false);
  assert.equal(canDeleteDeal(deal({ canEdit: false }), { role: "ae", superuser: true }), false);
});

test("ออกใบเสนอราคาต้องมีทั้งโครงการและลูกค้า และดีลยังไม่ปิด", () => {
  assert.equal(canQuoteDeal(deal({ projectId: "P1", customerId: "C1" })), true);
  assert.equal(canQuoteDeal(deal({ projectId: "P1" })), false, "ไม่มีลูกค้า");
  assert.equal(canQuoteDeal(deal({ customerId: "C1" })), false, "ไม่มีโครงการ");
  assert.equal(canQuoteDeal(deal({ stage: "lost", projectId: "P1", customerId: "C1" })), false);
});

test("ทุก stage ที่ระบบรู้จักมีป้ายและคำอธิบายครบ", () => {
  for (const stage of DEAL_STAGES) {
    const meta = lifecycle.statusMeta({ stage });
    assert.ok(meta.label && meta.label !== stage, `stage ${stage} ไม่มีป้ายไทย`);
    assert.ok(meta.description, `stage ${stage} ไม่มีคำอธิบาย`);
  }
});

/* หน้ารายละเอียดดีลต้องกินกติกาชุดเดียวกับหน้ารายการ — ไม่ใช่เขียนเงื่อนไขซ้ำอีกชุด
   (ของเดิมหน้ารายละเอียดมี canDelete ของตัวเอง แล้วหน้ารายการลืมข้อใบเสนอราคาที่รับแล้ว) */
test("หน้ารายละเอียดดีลใช้ canDeleteDeal ไม่ใช่เงื่อนไขของตัวเอง", () => {
  const DETAIL = read("src", "app", "sales-planning", "deals", "[id]", "page.js");
  assert.match(DETAIL, /canDeleteDeal\(/, "ต้องเรียกตัวกลาง");
  assert.ok(!/const canDelete = deal && \(isAdmin/.test(DETAIL),
    "เงื่อนไขลบชุดเดิมของหน้ารายละเอียดต้องถูกถอดออกแล้ว");
});

test("การ์ด Control อยู่บนหน้ารายละเอียดดีล และปุ่มที่เปลี่ยนข้อมูลไม่อยู่หัวหน้าแล้ว", () => {
  const DETAIL = read("src", "app", "sales-planning", "deals", "[id]", "page.js");
  assert.match(DETAIL, /<RecordControlCard/, "หน้ารายละเอียดต้องมีการ์ด Control");
  assert.ok(!/backActions=\{backActions\}/.test(DETAIL),
    "ไอคอนแก้ไข/ลบ ที่หัวหน้าต้องถูกย้ายไปการ์ดแล้ว");
  // หัวหน้าเหลือได้แค่ทางไปโครงการ (ลิงก์) — ห้ามมีปุ่มที่ยิง API
  const header = DETAIL.slice(DETAIL.indexOf("const headerRight"), DETAIL.indexOf("async function runControlTransition"));
  assert.ok(!/onClick=/.test(header), `หัวหน้ายังมีปุ่มที่กดแล้วทำงาน:\n${header}`);
});
