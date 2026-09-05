import test from 'node:test';
import assert from 'node:assert/strict';
import submitScope from './submitScope.js';

// 🐞 ใบพัฒนากลิ่นไม่มีบรรทัดตอนยื่น (`hasItems: false` — RD สร้างแถวเองตอนส่งงาน)
// ⇒ ที่ไหนก็ตามที่นับ `items` เองจะขึ้น "0" ทุกใบ ซึ่งอ่านเหมือนข้อมูลหาย
// (โมดัลยืนยันตอนกดส่งเคยขึ้น "0 กลิ่น → RD" — ผู้ใช้เจอเอง 2026-09-03)
test('พัฒนากลิ่นเล่าด้วยก้อนบรีฟ ไม่ใช่จำนวนบรรทัด', () => {
  assert.equal(submitScope({ kind: 'scent_dev', items: [], briefs: [{}, {}] }), 'บรีฟ 2 ก้อน');
  // ยังไม่มีบรีฟเลย = ไม่ต้องมีเลข ดีกว่าเลขศูนย์
  assert.doesNotMatch(submitScope({ kind: 'scent_dev', items: [], briefs: [] }), /\d/);
});

test('หัวข้อที่ผู้ขอกรอกแถวเองยังนับรายการตามเดิม', () => {
  assert.equal(submitScope({ kind: 'info', items: [{}, {}, {}] }), '3 รายการ');
  assert.equal(submitScope({ kind: 'info' }), '0 รายการ');
});

// ประเมินพื้นที่ (mig 0314) ไม่มี `dept_request_items` เลย เนื้ออยู่ที่โซน
test('ประเมินพื้นที่นับพื้นที่', () => {
  assert.equal(submitScope({ kind: 'site_survey', surveyZones: [{}, {}], items: [] }), '2 พื้นที่');
});

test('ของไม่ครบต้องไม่ระเบิด', () => {
  assert.equal(submitScope(null), '0 รายการ');
  assert.equal(submitScope(undefined), '0 รายการ');
});
