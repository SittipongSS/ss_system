// ── anchor ของไทม์ไลน์ต้องเป็นวันไทย ไม่ใช่วัน UTC ──────────────────────────
//
// 🐞 `resolveSchedule` ส่ง `project.createdAt` (timestamp จริง) เข้า `toDateStr`
// ซึ่งเดิมตัด `toISOString().slice(0,10)` = วันแบบ UTC ⇒ โครงการที่สร้างหลังห้าโมงเย็น
// เวลาไทยได้ anchor เป็นเมื่อวาน แล้ว **ทั้งไทม์ไลน์เลื่อนไปหนึ่งวัน**
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSchedule, toDateStr } from './schedule.js';

test('timestamp ตอนค่ำเวลาไทย ต้องได้วันไทย ไม่ใช่วัน UTC', () => {
  // 31 ก.ค. 17:30Z = 1 ส.ค. 00:30 เวลาไทย — ข้ามทั้งวันและทั้งเดือน
  assert.equal(toDateStr('2026-07-31T17:30:00.000Z'), '2026-08-01');
  // 31 ก.ค. 16:30Z = 23:30 ของวันเดียวกันเวลาไทย
  assert.equal(toDateStr('2026-07-31T16:30:00.000Z'), '2026-07-31');
});

/* ⚠️ ค่าที่เป็น "วันในปฏิทิน" อยู่แล้วต้องไม่ขยับ — 00:00Z อ่านตามเวลาไทยคือ 07:00
   ของวันเดียวกัน · ขยับเมื่อไรวันเริ่มโครงการที่คนกรอกเองจะเลื่อนโดยไม่มีใครสั่ง */
test('วันล้วนไม่ขยับ', () => {
  assert.equal(toDateStr('2026-08-14'), '2026-08-14');
  assert.equal(toDateStr('2026-08-14T00:00:00.000Z'), '2026-08-14');
  assert.equal(toDateStr(null), null);
  assert.equal(toDateStr('ไม่ใช่วันที่'), null);
});

test('ไม่มีวันเริ่ม → ถอยไปใช้วันสร้าง ตามวันไทย', () => {
  const s = resolveSchedule({ createdAt: '2026-07-31T17:30:00.000Z' });
  assert.equal(s.anchor, '2026-08-01');
  // มีวันเริ่มก็ใช้วันเริ่ม ไม่แตะวันสร้าง
  assert.equal(resolveSchedule({ startDate: '2026-09-01', createdAt: '2026-07-31T17:30:00.000Z' }).anchor, '2026-09-01');
});
