import test from "node:test";
import assert from "node:assert/strict";
import { createLatestRun } from "./latestRun.js";

/* ── ตัวกันคำตอบมาผิดลำดับ ────────────────────────────────────────────────
 * เทสต์นี้จำลองสถานการณ์จริงที่พบตอนตรวจระบบ: ผู้ใช้ขยับตัวกรองเร็วกว่าที่ API ตอบ
 * แล้วคำตอบของตัวกรองเก่ามาถึงทีหลัง — ของที่ต้องอยู่บนจอคือของรอบล่าสุดเสมอ
 */

test("รอบเก่าที่ตอบช้ากว่าต้องถูกทิ้ง — ของบนจอเป็นของรอบล่าสุดเสมอ", () => {
  const startRun = createLatestRun();
  const first = startRun();   // ผู้ใช้เลือก "มกราคม"
  const second = startRun();  // ยังไม่ทันตอบ ผู้ใช้เปลี่ยนเป็น "กุมภาพันธ์"

  assert.equal(second(), true, "รอบล่าสุดต้องได้เขียนจอ");
  assert.equal(first(), false, "รอบก่อนหน้าต้องถูกทิ้ง แม้จะตอบมาทีหลัง");
});

test("ยิงรอบเดียวไม่มีอะไรมาแทรก ต้องผ่านตามปกติ", () => {
  const startRun = createLatestRun();
  const only = startRun();
  assert.equal(only(), true);
  assert.equal(only(), true, "ถามซ้ำต้องได้คำตอบเดิม ไม่ใช่ของใช้ครั้งเดียว");
});

test("สามรอบซ้อนแล้วตอบสลับลำดับ — ผ่านเฉพาะรอบที่สาม", () => {
  const startRun = createLatestRun();
  const runs = [startRun(), startRun(), startRun()];
  // คำตอบมาถึงเรียงกลับหลัง (รอบแรกช้าสุด = อันตรายที่สุด เพราะได้เขียนทับสุดท้าย)
  assert.deepEqual(runs.map((isLatest) => isLatest()), [false, false, true]);
});

test("รอบใหม่ที่เริ่มหลังรอบเก่าจบไปแล้ว ยังคงเป็นรอบล่าสุด", () => {
  const startRun = createLatestRun();
  const first = startRun();
  assert.equal(first(), true);
  const second = startRun();
  assert.equal(first(), false, "พอมีรอบใหม่ รอบเก่าต้องหมดสิทธิ์ทันที");
  assert.equal(second(), true);
});

test("แต่ละชุดนับของตัวเอง — สองรายการในหน้าเดียวกันต้องไม่ทิ้งคำตอบของกันและกัน", () => {
  const rows = createLatestRun();
  const kpi = createLatestRun();
  const rowsRun = rows();
  kpi(); // KPI เริ่มรอบใหม่ของมันเอง
  assert.equal(rowsRun(), true, "รอบของตารางต้องไม่ถูก KPI ทำให้ตกรอบ");
});
