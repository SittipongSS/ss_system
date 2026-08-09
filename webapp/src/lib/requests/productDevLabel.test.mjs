import test from 'node:test';
import assert from 'node:assert/strict';

import { productDevRowText } from './productDevLabel.js';

const registry = {
  // ⚠️ รหัสที่ระบบเก็บคือ `mainCategoryCode-typeCode` ไม่ใช่ typeCode เดี่ยว ๆ
  // (เทสต์ชุดเดิมใช้คีย์ผิดจึงไม่เคยจับบั๊กที่ป้ายขึ้นเป็นรหัสดิบ — เจอตอนทำ 0227)
  categories: [
    { id: 7, mainCategoryCode: '01', typeCode: '001', nameTh: 'ครีมบำรุงผิว', nameEn: 'Skin Cream' },
    { id: 8, mainCategoryCode: '01', typeCode: '002', nameEn: 'Room Spray' },
  ],
  scents: [
    { id: 'SC-1', code: 'PF1093001', name: 'ARMANI POWER OF YOU', createdAt: '2026-08-04T11:57:21+00:00' },
    { id: 'SC-2', code: 'PF1093002', name: 'ไร้วันที่' },
  ],
};

test('ครบทั้งหมวดและกลิ่น — รหัส+ชื่อ ทั้งสองฝั่ง คั่นด้วย ×', () => {
  const { main } = productDevRowText({ categoryCode: '01-001', scentId: 'SC-1' }, 0, registry);
  assert.equal(main, '01-001 ครีมบำรุงผิว × PF1093001 ARMANI POWER OF YOU');
});

test('คำขยาย = วันที่ของกลิ่น · จำนวน+หน่วย (มติ 2026-08-09)', () => {
  const full = productDevRowText({ categoryCode: '01-001', scentId: 'SC-1', qty: '3', unit: 'ขวด' }, 0, registry);
  assert.match(full.sub, / · 3 ขวด$/);
  // จำนวนไม่มีหน่วยก็ยังต้องโชว์ — คนกรอกเลขไว้ก่อนเป็นเรื่องปกติ
  assert.match(productDevRowText({ scentId: 'SC-2', qty: '5' }, 0, registry).sub, /^5$/);
  // หน่วยลอย ๆ ที่ไม่มีจำนวนไม่ใช่ข้อมูล — ไม่ต้องโชว์
  assert.equal(productDevRowText({ scentId: 'SC-2', unit: 'ขวด' }, 0, registry).sub, '');
});

test('หมวดที่มีแต่ชื่ออังกฤษก็ใช้ได้ — ไม่ปล่อยให้เหลือแต่รหัส', () => {
  const { main } = productDevRowText({ categoryCode: '01-002', scentId: '' }, 1, registry);
  assert.equal(main, '01-002 Room Spray');
});

test('เลือกยังไม่ครบ = บอกเท่าที่มี · ยังไม่เลือกอะไรเลยจึงถอยไปใช้เลขลำดับ', () => {
  assert.equal(productDevRowText({ scentId: 'SC-2' }, 0, registry).main, 'PF1093002 ไร้วันที่');
  assert.equal(productDevRowText({}, 2, registry).main, 'รายการที่ 3');
});

test('กลิ่นที่ไม่มีวันที่ = ไม่มีคำขยาย ไม่ใช่คำว่า Invalid Date', () => {
  assert.equal(productDevRowText({ scentId: 'SC-2' }, 0, registry).sub, '');
});

/* ⚠️ กลิ่น/หมวดที่หายจากทะเบียน (ถูกปิดใช้ระหว่างกรอก) ต้องไม่ทำให้แถวพัง —
   ป้ายถอยไปเท่าที่รู้ ไม่ใช่โยน */
test('อ้างของที่ไม่มีในทะเบียนแล้ว — ไม่พัง', () => {
  const { main, sub } = productDevRowText({ categoryCode: 'ZZZ', scentId: 'ไม่มี' }, 4, registry);
  assert.equal(main, 'รายการที่ 5');
  assert.equal(sub, '');
});
