import assert from "node:assert/strict";
import test from "node:test";

import { resolveDateTimeEdit, splitDateTime } from "./dateTimeValue.js";

test("splitDateTime แยกวันที่กับเวลา และทนค่าว่าง", () => {
  assert.deepEqual(splitDateTime("2026-07-30T10:15"), { date: "2026-07-30", time: "10:15" });
  assert.deepEqual(splitDateTime("2026-07-30"), { date: "2026-07-30", time: "" });
  assert.deepEqual(splitDateTime(""), { date: "", time: "" });
  assert.deepEqual(splitDateTime(null), { date: "", time: "" });
});

test("splitDateTime ไม่ตัดวินาทีที่มาจากหลังบ้าน", () => {
  assert.deepEqual(splitDateTime("2026-07-30T10:15:30"), { date: "2026-07-30", time: "10:15:30" });
});

test("แก้ครบทั้งวันที่และเวลา = ประกอบเป็น ISO", () => {
  assert.deepEqual(resolveDateTimeEdit("2026-07-30", "10:15"), { value: "2026-07-30T10:15", pendingTime: "" });
});

test("มีวันที่แต่ไม่มีเวลา = เที่ยงคืน", () => {
  assert.deepEqual(resolveDateTimeEdit("2026-07-30", ""), { value: "2026-07-30T00:00", pendingTime: "" });
  assert.deepEqual(resolveDateTimeEdit("2026-07-30", undefined), { value: "2026-07-30T00:00", pendingTime: "" });
});

/* หัวใจของบั๊กที่แก้ — ก่อนหน้านี้เวลาถูกทิ้งทันทีเมื่อยังไม่มีวันที่ ทำให้ช่องโชว์เวลา
   ที่พิมพ์ไว้ขณะที่ฟอร์มเก็บค่าว่าง และพอเลือกวันที่ทีหลังก็ได้ T00:00 */
test("ไม่มีวันที่ = เก็บค่าไม่ได้ แต่ต้องจำเวลาที่พิมพ์ไว้ ห้ามทิ้ง", () => {
  assert.deepEqual(resolveDateTimeEdit("", "10:15"), { value: "", pendingTime: "10:15" });
  assert.deepEqual(resolveDateTimeEdit(undefined, "10:15"), { value: "", pendingTime: "10:15" });
});

test("ไม่มีทั้งวันที่และเวลา = ว่างทั้งคู่ ไม่มีอะไรค้าง", () => {
  assert.deepEqual(resolveDateTimeEdit("", ""), { value: "", pendingTime: "" });
});

test("ได้วันที่แล้วต้องเลิกจำเวลาไว้ ไม่งั้นค่าเก่าจะย้อนมาทับรอบถัดไป", () => {
  const kept = resolveDateTimeEdit("", "10:15");
  assert.equal(kept.pendingTime, "10:15");
  const done = resolveDateTimeEdit("2026-07-30", kept.pendingTime);
  assert.deepEqual(done, { value: "2026-07-30T10:15", pendingTime: "" });
});

test("วินาทีที่ติดมากับเวลาเดิมไม่หายตอนเปลี่ยนวันที่", () => {
  const { time } = splitDateTime("2026-07-30T10:15:30");
  assert.deepEqual(resolveDateTimeEdit("2026-08-01", time), { value: "2026-08-01T10:15:30", pendingTime: "" });
});
