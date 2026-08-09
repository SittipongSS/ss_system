import test from 'node:test';
import assert from 'node:assert/strict';

import { productDevRowText } from './productDevLabel.js';

const registry = {
  categories: [
    { id: 7, typeCode: '001', nameTh: 'ครีมบำรุงผิว', nameEn: 'Skin Cream' },
    { id: 8, typeCode: '002', nameEn: 'Room Spray' },
  ],
  scents: [
    { id: 'SC-1', code: 'PF1093001', name: 'ARMANI POWER OF YOU', createdAt: '2026-08-04T11:57:21+00:00' },
    { id: 'SC-2', code: 'PF1093002', name: 'ไร้วันที่' },
  ],
};

test('ครบทั้งหมวดและกลิ่น — รหัส+ชื่อ ทั้งสองฝั่ง คั่นด้วย ×', () => {
  const { main, sub } = productDevRowText({ categoryCode: '001', scentId: 'SC-1' }, 0, registry);
  assert.equal(main, '001 ครีมบำรุงผิว × PF1093001 ARMANI POWER OF YOU');
  assert.ok(sub, 'ต้องมีวันที่ของกลิ่น');
});

test('หมวดที่มีแต่ชื่ออังกฤษก็ใช้ได้ — ไม่ปล่อยให้เหลือแต่รหัส', () => {
  const { main } = productDevRowText({ categoryCode: '002', scentId: '' }, 1, registry);
  assert.equal(main, '002 Room Spray');
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
