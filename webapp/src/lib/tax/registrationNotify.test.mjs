import test from "node:test";
import assert from "node:assert/strict";
import { registrationNotice } from "./registrationNotify.js";

const directory = new Map([
  ["u-lg1", { id: "u-lg1", role: "ra" }],
  ["u-lg2", { id: "u-lg2", role: "ra" }],
  ["u-lg-off", { id: "u-lg-off", role: "ra", disabled: true }],
  ["u-admin", { id: "u-admin", role: "admin" }],
  ["u-sa", { id: "u-sa", role: "ae" }],
]);

const reg = {
  id: "REG-1", fgCode: "FG-108-01-002-2007", customerName: "บริษัท เซนท์ สตูดิโอ แลบอราทอรี่ จำกัด",
  ownerId: "u-sa", approvalNumber: null,
};

test("ยื่นขึ้นทะเบียน → ฝ่าย RA ทุกคนที่ยังทำงานอยู่", () => {
  const n = registrationNotice({ action: "submit", registration: reg, directory, actorId: "u-sa" });
  assert.deepEqual(n.userIds.sort(), ["u-lg1", "u-lg2"]);
  assert.match(n.title, /รอตรวจขึ้นทะเบียน/);
  assert.match(n.title, /FG-108-01-002-2007/);
});

/* ⚠️ ไม่มีใครรับแจ้งเตือน = ความล้มเหลวเงียบแบบเดียวกับที่ไฟล์นี้เกิดมาแก้
   (ทะเบียน 17 ใบค้างเพราะไม่มีใครรู้) ⇒ ไม่มี RA ต้องตกไปที่ admin ไม่ใช่เงียบ */
test("ไม่มีฝ่าย RA ในระบบ → ตกไปที่แอดมิน ไม่ใช่ไม่ส่งใคร", () => {
  const noLegal = new Map([["u-admin", { id: "u-admin", role: "admin" }], ["u-sa", { id: "u-sa", role: "ae" }]]);
  const n = registrationNotice({ action: "submit", registration: reg, directory: noLegal, actorId: "u-sa" });
  assert.deepEqual(n.userIds, ["u-admin"]);
});

test("บัญชีที่ถูกปิดไม่ได้รับแจ้งเตือน", () => {
  const n = registrationNotice({ action: "submit", registration: reg, directory, actorId: "u-sa" });
  assert.equal(n.userIds.includes("u-lg-off"), false);
});

test("คนกดเองไม่ต้องแจ้งตัวเอง", () => {
  const n = registrationNotice({ action: "submit", registration: reg, directory, actorId: "u-lg1" });
  assert.deepEqual(n.userIds, ["u-lg2"]);
  // ฝ่าย RA อนุมัติใบของตัวเอง (ทั้งยื่นทั้งอนุมัติ) = ไม่มีใครต้องรู้
  assert.equal(registrationNotice({
    action: "approve", registration: reg, directory, actorId: "u-sa",
  }), null);
});

test("ผลการตรวจกลับไปหาเจ้าของใบ ไม่ใช่ทั้งทีมขาย", () => {
  const approved = { ...reg, approvalNumber: "อ.1234/2569" };
  const n = registrationNotice({ action: "approve", registration: approved, directory, actorId: "u-lg1" });
  assert.deepEqual(n.userIds, ["u-sa"]);
  assert.match(n.body, /อ\.1234\/2569/);
});

test("ตีกลับต้องพาเหตุผลไปด้วย — คนแก้รอบถัดไปคือคนที่ต้องอ่านมันที่สุด", () => {
  const n = registrationNotice({
    action: "reject", registration: reg, directory, actorId: "u-lg1", reason: "ฉลากไม่ตรงกับที่ยื่น",
  });
  assert.deepEqual(n.userIds, ["u-sa"]);
  assert.equal(n.body, "ฉลากไม่ตรงกับที่ยื่น");
});

/* ปลดอนุมัติ = ทะเบียนหลุดจากตัวเลือกตอนออกใบยื่นทันที — ฝ่ายขายที่กำลังจะออกใบ
   ต้องรู้เหตุ ไม่ใช่ไปเจอเอาตอนหาทะเบียนไม่เจอ */
test("ปลดอนุมัติแจ้งเจ้าของใบพร้อมเหตุผล", () => {
  const n = registrationNotice({
    action: "revoke", registration: reg, directory, actorId: "u-lg1", reason: "กรมสรรพสามิตให้แก้ไข",
  });
  assert.deepEqual(n.userIds, ["u-sa"]);
  assert.equal(n.body, "กรมสรรพสามิตให้แก้ไข");
  // ไม่ระบุเหตุผลก็ยังต้องบอกผลลัพธ์ ไม่ปล่อยว่าง
  const bare = registrationNotice({ action: "revoke", registration: reg, directory, actorId: "u-lg1" });
  assert.ok(bare.body.length > 0);
});

test("ใบเก่าที่ไม่มีเจ้าของ = ไม่มีใครให้ส่ง ไม่ใช่เหตุให้ส่งทั้งทีม", () => {
  const orphan = { ...reg, ownerId: null };
  assert.equal(registrationNotice({ action: "approve", registration: orphan, directory, actorId: "u-lg1" }), null);
});

test("action ที่ไม่รู้จัก / ไม่มีใบ = เงียบ ไม่ระเบิด", () => {
  assert.equal(registrationNotice({ action: "หมุนกลับ", registration: reg, directory, actorId: "u-lg1" }), null);
  assert.equal(registrationNotice({ action: "submit", registration: null, directory }), null);
  assert.equal(registrationNotice({}), null);
});
