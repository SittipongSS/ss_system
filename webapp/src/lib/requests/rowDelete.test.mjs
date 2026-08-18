import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteRequestRowError, registryOwnedByRow } from './rowDelete.js';

const req = (extra = {}) => ({ status: 'acknowledged', items: [], ...extra });

test('ลบแถวได้ตอนยังไม่มีใครใช้ผลของมัน', () => {
  assert.equal(deleteRequestRowError(req(), { id: 'DRI-1' }), null);
});

test('ปิดทางลบเมื่อผลผูกกับคนอื่นแล้ว', () => {
  assert.match(deleteRequestRowError(req(), { id: 'a', outcome: 'confirmed' }), /ลูกค้าตอบมาแล้ว/);
  assert.match(deleteRequestRowError(req(), { id: 'a', answeredRevisionId: 'REV-1' }), /ตอบราคาไปแล้ว/);
  assert.match(deleteRequestRowError(req(), { id: 'a', answerStatus: 'done' }), /ปิดไปแล้ว/);
  assert.match(deleteRequestRowError(req({ status: 'closed' }), { id: 'a' }), /ไม่ได้เปิดอยู่/);
});

test('⚠️ ตัวต้นทางที่มีรอบแก้ต่อยอดอยู่ ลบไม่ได้ — ไม่งั้นรอบแก้กำพร้า', () => {
  const request = req({ items: [{ id: 'child', derivedFromItemId: 'root' }] });
  assert.match(deleteRequestRowError(request, { id: 'root' }), /รอบแก้ต่อจากมันอยู่ 1/);
  assert.equal(deleteRequestRowError(request, { id: 'child' }), null);
});

test('ของในทะเบียนที่แถวเป็นคนสร้าง — กลิ่นหรือสูตร อย่างละไม่เกินหนึ่ง', () => {
  assert.deepEqual(registryOwnedByRow({ producedScentId: 'SCT-1' }), { kind: 'scent', id: 'SCT-1' });
  assert.deepEqual(registryOwnedByRow({ producedFormulaId: 'FM-1' }), { kind: 'formula', id: 'FM-1' });
  // กลิ่นที่แถว *ขอถึง* (`scentId`) ไม่ใช่ของที่แถวสร้าง — ห้ามลบตาม
  assert.equal(registryOwnedByRow({ scentId: 'SCT-9' }), null);
});
