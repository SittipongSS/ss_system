// ── ขอบเขตของลิสต์ภาษี — กฎตัวจริง (ลิสต์และป้ายบนเมนูใช้ตัวเดียวกัน) ──────
//
// 🐞 ที่มา (ADR 0016 · PR0): ป้าย `/tax/registrations` และ `/tax/filings` เคยนับทั้งตาราง
//    ส่วนหน้ารายการกรองด้วยขอบเขตทีม ⇒ คนที่ scope 'team' ได้ป้ายเท่ายอดทั้งบริษัท
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyExciseListScope } from './listScope.js';

// query ปลอม: จำว่าถูกเรียก .or() ด้วยอะไร (supabase builder คืนตัวเองเพื่อต่อลูกโซ่)
const fakeQuery = () => {
  const calls = [];
  const q = { calls, or: (expr) => { calls.push(expr); return q; } };
  return q;
};

test('scope ทีม + มีทีม ⇒ ทีมตัวเอง และแถวไร้ทีม (ของกลาง)', () => {
  const q = fakeQuery();
  assert.equal(applyExciseListScope(q, { role: 'senior_ae', teams: ['SV', 'KA'] }), q);
  assert.deepEqual(q.calls, ['team.in.(SV,KA),team.is.null']);
});

test('scope ทั้งหมด (admin) ⇒ ไม่กรองเลย', () => {
  const q = fakeQuery();
  applyExciseListScope(q, { role: 'admin', teams: ['SV'] });
  assert.deepEqual(q.calls, [], 'คนที่เห็นทั้งบริษัทต้องไม่ถูกตัดด้วยทีม');
});

test('scope ทีมแต่ยังไม่มีทีม ⇒ ไม่กรอง ไม่ใช่ได้ลิสต์ว่าง', () => {
  // 🐞 `team=eq.null` ของเดิมแปลเป็น `= NULL` ⇒ 0 แถวโดยไม่มี error เตือน
  const q = fakeQuery();
  applyExciseListScope(q, { role: 'ac', teams: [] });
  assert.deepEqual(q.calls, []);
});
