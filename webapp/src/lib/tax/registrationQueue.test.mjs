import test from "node:test";
import assert from "node:assert/strict";
import {
  AGE_LATE_DAYS, ageAnchor, ageInDays, ageLabel, ageTone, lateRegistrations, registrationAge,
} from "./registrationQueue.js";

test("อายุงานนับเป็นวันเต็มจากวันไทยที่ส่งเข้ามา", () => {
  assert.equal(ageInDays("2026-08-01", "2026-08-28"), 27);
  assert.equal(ageInDays("2026-08-28T23:59:00+07:00", "2026-08-28"), 0);
  // timestamp เต็มก็ตัดเอาเฉพาะวัน — ไม่ปัดเศษชั่วโมงจนได้ครึ่งวัน
  assert.equal(ageInDays("2026-07-24T11:35:55.537+00:00", "2026-08-28"), 35);
});

test("ข้อมูลไม่ครบต้องได้ null ไม่ใช่ 0 — 0 แปลว่า 'เพิ่งยื่นวันนี้' ซึ่งโกหก", () => {
  assert.equal(ageInDays(null, "2026-08-28"), null);
  assert.equal(ageInDays("2026-08-01", null), null);
  assert.equal(ageInDays("ไม่ใช่วันที่", "2026-08-28"), null);
});

test("วันในอนาคตไม่ติดลบ — นาฬิกาเครื่องคนกรอกเร็วไปไม่ควรกลายเป็นอายุติดลบ", () => {
  assert.equal(ageInDays("2026-09-01", "2026-08-28"), 0);
});

test("โทนของอายุงานไล่ตามเกณฑ์", () => {
  assert.equal(ageTone(0), "neutral");
  assert.equal(ageTone(3), "neutral");
  assert.equal(ageTone(4), "warning");
  assert.equal(ageTone(7), "warning");
  assert.equal(ageTone(8), "danger");
  assert.equal(ageTone(null), "neutral");
});

test("ป้ายอายุอ่านรู้เรื่องโดยไม่ต้องคิดเลขเอง", () => {
  assert.equal(ageLabel(0), "วันนี้");
  assert.equal(ageLabel(1), "1 วัน");
  assert.equal(ageLabel(34), "34 วัน");
  assert.equal(ageLabel(null), null);
});

/* ⭐ ใบที่ถูกตีกลับแล้วส่งกลับมาใหม่ต้องนับอายุจาก **รอบล่าสุด** ไม่ใช่วันเปิดใบ
   ไม่งั้นใบที่ฝ่ายขายเพิ่งแก้เสร็จเมื่อวานจะโชว์ว่าค้างมาสามสัปดาห์ แล้วตัวเลข
   "ค้างนาน" บนหน้าภาพรวมจะไม่มีใครเชื่อ */
test("อายุนับจากจุดที่สถานะปัจจุบันเริ่ม ไม่ใช่วันเปิดใบ", () => {
  const reg = { status: "pending_legal", createdAt: "2026-08-01", updatedAt: "2026-08-26" };
  assert.equal(ageAnchor(reg), "2026-08-26");
  assert.equal(registrationAge(reg, "2026-08-28"), 2);

  // ฉบับร่างยังไม่เคยยื่น — จุดเริ่มคือวันเปิดใบจริง ๆ
  const draft = { status: "draft", createdAt: "2026-08-01", updatedAt: "2026-08-26" };
  assert.equal(ageAnchor(draft), "2026-08-01");

  // อนุมัติแล้วมีจุดเวลาของตัวเอง
  const done = { status: "approved", approvedAt: "2026-08-20", updatedAt: "2026-08-27" };
  assert.equal(ageAnchor(done), "2026-08-20");
});

test("ค้างนาน = เฉพาะใบที่รอฝ่าย RA และเรียงเก่าสุดขึ้นก่อน", () => {
  const rows = [
    { id: "a", status: "pending_legal", updatedAt: "2026-08-27" },  // 1 วัน
    { id: "b", status: "pending_legal", updatedAt: "2026-07-25" },  // 34 วัน
    { id: "c", status: "pending_legal", updatedAt: "2026-08-01" },  // 27 วัน
    { id: "d", status: "draft", createdAt: "2026-01-01" },          // ร่างค้างเป็นเรื่องของฝ่ายขาย
    { id: "e", status: "approved", approvedAt: "2026-01-01" },      // จบงานแล้ว
  ];
  const late = lateRegistrations(rows, "2026-08-28");
  assert.deepEqual(late.map((x) => x.row.id), ["b", "c"]);
  assert.equal(late[0].days, 34);
  assert.ok(AGE_LATE_DAYS > 0);
});

test("ไม่มีแถวก็ต้องไม่ระเบิด", () => {
  assert.deepEqual(lateRegistrations([], "2026-08-28"), []);
  assert.deepEqual(lateRegistrations(undefined, "2026-08-28"), []);
});
