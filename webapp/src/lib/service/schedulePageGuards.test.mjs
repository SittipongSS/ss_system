// ── ยามของหน้าจัดคิวเจ้าหน้าที่ (มติผู้ใช้ 2026-09-22 · รายการงานคู่ตาราง) ─────────────
//
// 🐞 ของที่รีวิวก่อน merge จับได้ แล้วเทสต์หน่วยมองไม่เห็นเพราะอยู่ในจอ:
//   1. แถบบอกตำแหน่งเก็บ **สำเนาแถว** ไว้ ⇒ แก้ร่างแล้วกดปล่อยจากแถบ = ยิงค่าเก่าทับค่าใหม่
//   2. ปล่อยจากการ์ดส่ง **ทั้งฟอร์ม** จากสำเนา ⇒ ค่าที่ถูกแก้หลังการ์ดวาดถูกเขียนทับ
//   3. โหลดเบื้องหลังล้าง error ⇒ พังซ้ำแล้วจอดูเหมือน "ว่าง"
//   4. กลุ่มที่พับกินที่ในหน้า ⇒ มีหน้าที่เหลือแต่หัวกลุ่ม
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../../app/service/schedule/page.js', import.meta.url), 'utf8');

test('แถบบอกตำแหน่งเก็บแค่ id แล้วอ่านของสดทุกครั้ง', () => {
  assert.match(page, /setFocus\(\{ visitId: row\.visit\.id, released: false \}\)/);
  assert.doesNotMatch(page, /focus\.row\b/, 'ห้ามอ่านสำเนาแถวจาก focus');
  assert.match(page, /queueView\.rows\.find\(\(r\) => r\.id === focus\.visitId\)/);
});

test('ปล่อยจากการ์ดส่งแค่สถานะ ไม่ส่งทั้งฟอร์มจากสำเนา', () => {
  assert.match(page, /body: JSON\.stringify\(\{ status: "scheduled" \}\)/);
  assert.doesNotMatch(page, /visitToForm\(row\.visit\)/);
});

test('โหลดเบื้องหลังไม่ล้าง error ของรอบก่อน', () => {
  assert.match(page, /if \(!opts\?\.background\) setLoadError\(""\);/);
  assert.match(page, /if \(!opts\?\.background\) setQueueError\(""\);/);
});

test('กลุ่มที่พับเป็นรายการเดียวในการแบ่งหน้า', () => {
  assert.match(page, /\? \[\{ head: true, groupKey: group\.key \}\]/);
});

test('หน้านี้วาง ไม่สร้าง — ไม่มีปุ่มสีแบรนด์ และร่างไม่ถูกวาดลงกริด', () => {
  assert.doesNotMatch(page, /tone="accent"/);
  // ชิปบนกริดมาจาก boardVisits (ไม่มีร่าง) เท่านั้น
  assert.match(page, /const boardVisits = useMemo\(\(\) => visits\.filter\(\(v\) => !isDraftVisit\(v\)\), \[visits\]\);/);
});
