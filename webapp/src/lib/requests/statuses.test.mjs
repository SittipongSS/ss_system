// สถานะของบรรทัดคำร้อง (mig 0204) — ชุดกลางที่ใช้ได้ทุกรูปร่าง
//
// ⚠️ ไฟล์นี้ยังทำหน้าที่เป็น **ด่านกันชื่อชนกัน**: `priceStatus` เป็นชื่อคอลัมน์ของ
// ทั้ง dept_request_items (เปลี่ยนเป็น answerStatus แล้ว) และ costing_item_components
// (คงชื่อเดิม) ⇒ find-and-replace ทั้ง repo จะพังระบบขอราคาผลิตเงียบ ๆ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REQUEST_ITEM_STATUSES, REQUEST_ITEM_STATUS_LABELS, REQUEST_ITEM_STATUS_TONES,
  requestItemStatusLabel,
} from './statuses.js';

test('สถานะบรรทัดเป็นกลาง ไม่ผูกกับคำว่าราคา', () => {
  assert.deepEqual(REQUEST_ITEM_STATUSES, ['pending', 'done', 'declined']);
  for (const s of REQUEST_ITEM_STATUSES) {
    assert.ok(REQUEST_ITEM_STATUS_TONES[s], `${s} ต้องมีโทน`);
  }
});

test('บรรทัดวัสดุต้องอ่านเหมือนเดิมทุกตัวอักษร — ผู้ใช้เดิมต้องไม่รู้สึกว่าอะไรเปลี่ยน', () => {
  assert.equal(requestItemStatusLabel('pending', 'material'), 'รอราคา');
  assert.equal(requestItemStatusLabel('done', 'material'), 'ตอบราคาแล้ว');
  assert.equal(requestItemStatusLabel('declined', 'material'), 'ตอบไม่ได้');
  // ค่าตั้งต้นเมื่อไม่รู้ lineKind = ภาษาของบรรทัดวัสดุ (ผู้เรียกเก่าไม่ต้องแก้)
  assert.equal(requestItemStatusLabel('done'), REQUEST_ITEM_STATUS_LABELS.done);
});

test('รูปร่างอื่นพูดภาษาของงานตัวเอง ไม่ใช่ภาษาราคา', () => {
  assert.equal(requestItemStatusLabel('pending', 'document'), 'รอเอกสาร');
  assert.equal(requestItemStatusLabel('done', 'document'), 'ได้รับแล้ว');
  assert.equal(requestItemStatusLabel('pending', 'scent_dev'), 'รอส่ง');
  // รูปร่างที่ยังไม่รู้จัก → ถอยไปภาษาวัสดุ ไม่ใช่คืนค่าว่าง
  assert.equal(requestItemStatusLabel('done', 'ยังไม่มีชนิดนี้'), 'ตอบราคาแล้ว');
  // สถานะแปลก ๆ → คืนค่าดิบ ไม่ใช่ undefined (กันหน้าจอขึ้นช่องว่าง)
  assert.equal(requestItemStatusLabel('เอ๋อ', 'material'), 'เอ๋อ');
});

test('ฝั่งคำร้องต้องไม่เหลือ priceStatus/noQuoteReason — ชื่อชนกับ costing', () => {
  // 🐞 กับดักที่บันทึกไว้: `costing_item_components.priceStatus` เป็นคนละคอลัมน์
  // ชื่อเดียวกัน · costingAdmin.js มีทั้งสองความหมายอยู่ในไฟล์เดียว ⇒ กรองด้วย
  // ชื่อไฟล์ไม่ได้ ต้องดูว่าอ่านจากตารางไหน
  const strip = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const p of ['./stages.js', './statuses.js', '../deptRequests.js']) {
    assert.doesNotMatch(strip(p), /priceStatus|noQuoteReason/, `${p} ต้องไม่เหลือชื่อเก่า`);
  }
  // จุดที่อ่าน dept_request_items ต้องใช้ชื่อใหม่ — และไฟล์เดียวกันต้องยังเขียน
  // priceStatus ลง costing_item_components ได้ตามเดิม (ห้ามหายไปกับการ replace)
  const costing = strip('../costingAdmin.js');
  assert.match(costing, /\.select\('id, requestId, componentId, answerStatus, label'\)/);
  assert.match(costing, /priceStatus: 'pending'/, 'ของ costing_item_components ต้องคงอยู่');
});
