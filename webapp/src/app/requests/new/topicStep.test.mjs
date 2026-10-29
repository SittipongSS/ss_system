// /requests/new ขั้นเลือกหัวข้อ — เหตุผลของ "บันทึกร่าง" ต้องบอกก้าวจริงที่เหลือ (UAT S4 · layout nits D3)
//
// 🐞 เลือก TS + ประเมินพื้นที่ครบแล้ว รายการความพร้อม "เลือกฝ่ายและหัวข้อ" ติ๊กแล้ว แต่ข้อความข้างปุ่มบันทึก
//    ยังขึ้น "เลือกฝ่ายและหัวข้อก่อน" ⇒ การ์ดเดียวพูดขัดกันเอง และไม่บอกว่าต้องกด "กรอกฟอร์ม…"
// ⭐ เทสต์รูปแบบซอร์ส — หน้า page.js ส่งออกได้แค่ default (Next ปฏิเสธ export อื่นของ page) จึงแยกฟังก์ชันมาเทสต์ตรงไม่ได้
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { requestFormBlocker } from '../../../lib/master/requestCreate.js';

const PAGE = readFileSync(new URL('./page.js', import.meta.url), 'utf8');

test('🔴 ขั้นเลือกหัวข้อ: เลือกครบแล้ว เหตุผลชี้ไปที่ปุ่ม "กรอกฟอร์ม…" ด้วยป้ายจริงของปุ่ม', () => {
  // เหตุผลของปุ่มบันทึกตอนยังไม่กางฟอร์มอ่านจากตัวแปรเดียว ไม่ใช่สตริงคงที่
  assert.match(PAGE, /disabledReason: !revealed \? topicStepReason : blocker \|\| undefined/);
  assert.doesNotMatch(PAGE, /disabledReason: !revealed \? "เลือกฝ่ายและหัวข้อก่อน"/,
    'สตริงคงที่ = เลือกครบแล้วก็ยังสั่งให้เลือกอีก');
  // ชื่อปุ่มที่อ้างในเหตุผลกับป้ายบนปุ่มมาจากค่าเดียวกัน — ป้ายเปลี่ยนเมื่อไรข้อความตามเอง
  assert.match(PAGE, /const openFormLabel = form\.kind \? `กรอกฟอร์ม\$\{requestKindLabel\(form\.kind\)\}` : "กรอกฟอร์ม";/);
  assert.match(PAGE, /label: openFormLabel,/);
  assert.match(PAGE,
    /const topicStepReason = topicPicked \? `กด “\$\{openFormLabel\}” เพื่อเปิดฟอร์ม` : "เลือกฝ่ายและหัวข้อก่อน";/);
});

test('ยังเลือกไม่ครบ = คำเดิม และ "ครบ" ใช้เงื่อนไขเดียวกับด่านของฟอร์ม (ต้องมีทั้งฝ่ายและหัวข้อ)', () => {
  assert.match(PAGE, /const topicPicked = !!form\.kind && !!form\.dept;/);
  // ติ๊กในรายการ · ปุ่มกางฟอร์ม · คำใบ้ข้างปุ่ม — สามที่อ่าน topicPicked ตัวเดียวกับเหตุผล
  assert.match(PAGE, /ready: topicPicked,/);
  assert.match(PAGE, /disabled: !topicPicked,/);
  assert.match(PAGE, /hint: topicPicked \? null : "เลือกฝ่ายและหัวข้อก่อน",/);
  // ⚠️ ด่านกลาง (ฝั่งจอ + ร่วมกับ server) ยังพูดคำเดิมเมื่อขาดฝ่ายหรือหัวข้อ — ห้ามเปลี่ยนตาม
  assert.equal(requestFormBlocker({ kind: '', dept: '' }), 'เลือกฝ่ายและหัวข้อก่อน');
  assert.equal(requestFormBlocker({ kind: 'site_survey', dept: '' }), 'เลือกฝ่ายและหัวข้อก่อน');
  assert.equal(requestFormBlocker({ kind: '', dept: 'TS' }), 'เลือกฝ่ายและหัวข้อก่อน');
});
